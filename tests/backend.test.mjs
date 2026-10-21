import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir=await mkdtemp(join(tmpdir(),'classroom-backend-'));
await build({entryPoints:[resolve('worker/app.ts'),resolve('worker/storage.ts'),resolve('worker/index.ts'),resolve('worker/ai.ts'),resolve('worker/validation.ts'),resolve('shared/expr.ts'),resolve('shared/practice.ts'),resolve('shared/quiz.ts')],outdir:dir,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},logLevel:'silent'});
const {handleApi,liveTicket,liveView}=await import(pathToFileURL(join(dir,'worker','app.mjs')).href);
const {SupabaseStore,DurableStore,SessionSplitStore,MAX_SNAPSHOT_BYTES}=await import(pathToFileURL(join(dir,'worker','storage.mjs')).href);
const {ClassroomDurableObject}=await import(pathToFileURL(join(dir,'worker','index.mjs')).href);
const {aggregateVotes,normalizeGrade,extractJson,isReasoning,numberedWork,parseMarks,chat}=await import(pathToFileURL(join(dir,'worker','ai.mjs')).href);
const {judgePhotoFinals,validateAnswer,validateActivity}=await import(pathToFileURL(join(dir,'worker','validation.mjs')).href);
const expr=await import(pathToFileURL(join(dir,'shared','expr.mjs')).href);
const {practiceStatus}=await import(pathToFileURL(join(dir,'shared','practice.mjs')).href);
const quizLib=await import(pathToFileURL(join(dir,'shared','quiz.mjs')).href);
const TEACHER={role:'teacher',account:'teacher',password:'11235813'};
test.after(()=>rm(dir,{recursive:true,force:true}));

function memoryStorage(values=new Map(),failKey=()=>false) {
  const methods=map=>({
    async get(key){const v=map.get(key);return v===undefined?undefined:structuredClone(v);},
    async put(key,value){if(failKey(key))throw new Error('Injected storage failure');if(value instanceof Uint8Array)assert(value.byteLength<=2*1024*1024);map.set(key,structuredClone(value));},
    async delete(key){return map.delete(key);},
  });
  return {...methods(values),async transaction(operation){const copy=structuredClone(values);const result=await operation(methods(copy));values.clear();for(const [key,value]of copy)values.set(key,value);return result;}};
}

function fixture(env={APP_MODE:'demo'},assets) {
  let data;const vaultMap=new Map();
  const vault={async get(k){const v=vaultMap.get(k);return v===undefined?undefined:structuredClone(v);},async put(k,v){vaultMap.set(k,structuredClone(v));},async delete(k){return vaultMap.delete(k);}};
  const store={async read(){return data&&structuredClone(data);},async write(next){data=structuredClone(next);}};
  const cookies=new Map();
  return {
    get data(){return data;},vaultMap,cookie(user){return cookies.get(user);},
    async call(path,method='GET',body,user='teacher',origin='http://localhost',extra={}) {
      const headers={'Origin':origin,...extra};
      if(cookies.has(user))headers.Cookie=cookies.get(user);
      if(method!=='GET')headers['Content-Type']='application/json';
      const response=await handleApi(new Request(`http://localhost${path}`,{method,headers,body:method!=='GET'?JSON.stringify(body??{}):undefined}),{store,env,vault,assets});
      if(response.headers.has('Set-Cookie'))cookies.set(user,response.headers.get('Set-Cookie').split(';')[0]);
      const type=response.headers.get('Content-Type')||'';
      return {status:response.status,body:type.includes('json')?await response.json():await response.arrayBuffer(),headers:response.headers};
    },
  };
}
/** 讓這些座號「上線」：登入並讀一次課堂（更新最後出現時間）。抽籤只抽上線的人。 */
async function goOnline(f,seats){
  for(const seat of seats){const u=`seat${seat}`;await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat},u);await f.call('/api/student/session','GET',null,u);}
}
async function setup() {
  const f=fixture();assert.equal((await f.call('/api/login','POST',TEACHER)).status,200);
  const dashboard=(await f.call('/api/dashboard')).body;
  const lesson=dashboard.lessons[0],cl=dashboard.classes[0];
  const session=(await f.call('/api/sessions','POST',{lessonId:lesson.id,classId:cl.id})).body.session;
  await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:1,code:'DEMO01'},'student');
  return {f,lesson,session};
}

test('student scope, hidden keys, activity gating, deduplication, and snapshot integrity',async()=>{
  const {f,lesson,session}=await setup();
  assert.equal((await f.call('/api/dashboard','GET',null,'student')).status,403);
  const before=(await f.call(`/api/sessions/${session.id}`,'GET',null,'student')).body;
  assert(before.lesson.slides.every(s=>!('notes'in s)&&(!s.activity||!('correct'in s.activity)&&!('explanation'in s.activity))));
  const index=lesson.slides.findIndex(s=>s.activity?.type==='single'),activity=lesson.slides[index].activity;
  const submit={submissionId:'test-submit',activityId:activity.id,value:0};
  assert.equal((await f.call(`/api/sessions/${session.id}/answers`,'POST',submit,'student')).status,409);
  await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'slide',index});
  await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'activity',value:true});
  const accepted=await f.call(`/api/sessions/${session.id}/answers`,'POST',submit,'student');
  assert.equal(accepted.status,200);
  const duplicate=await f.call(`/api/sessions/${session.id}/answers`,'POST',submit,'student');assert.equal(duplicate.body.answer.id,accepted.body.answer.id);
  assert.equal((await f.call(`/api/sessions/${session.id}/answers`,'POST',{...submit,value:1},'student')).status,409);
  assert.equal(f.data.sessions[session.id].answers.length,1);
  const renamed={...lesson,title:'Updated lesson'};await f.call(`/api/lessons/${lesson.id}`,'PUT',{lesson:renamed});
  assert.equal((await f.call(`/api/sessions/${session.id}`)).body.lesson.title,lesson.title);
  await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'results',value:true});
  const after=(await f.call(`/api/sessions/${session.id}`,'GET',null,'student')).body;
  assert.deepEqual(after.lesson.slides[index].activity.correct,activity.correct);assert(after.lesson.slides.every(s=>!('notes'in s)));
  assert.equal(after.aggregate.submitted,1);
});

test('animations stay locked for students until results are shown on that slide; video ranges pass through',async()=>{
  const seen=[];
  // 和正式的靜態資產綁定一樣：忽略 Range，一律回整個檔案（200）；伺服器要自己切成 206。
  const assets={async fetch(req){seen.push(req.headers.get('Range'));
    return new Response(Uint8Array.from({length:10},(_,i)=>i),{status:200,headers:{'Content-Type':'video/mp4','Content-Length':'10'}});}};
  const f=fixture({APP_MODE:'demo'},assets);assert.equal((await f.call('/api/login','POST',TEACHER)).status,200);
  const dashboard=(await f.call('/api/dashboard')).body;
  const lesson=dashboard.lessons.find(l=>l.slides.some(s=>s.animation&&s.activity));assert(lesson,'需要一份含動畫的課程');
  const index=lesson.slides.findIndex(s=>s.animation&&s.activity),anim=lesson.slides[index].animation;
  const session=(await f.call('/api/sessions','POST',{lessonId:lesson.id,classId:dashboard.classes[0].id})).body.session;
  await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:1,code:'DEMO01'},'student');
  const url=`/api/assets/lessons/${anim.src}`;
  let view=(await f.call(`/api/sessions/${session.id}`,'GET',null,'student')).body;
  assert.deepEqual(Object.keys(view.lesson.slides[index].animation).sort(),['caption','locked','seconds','src'].filter(k=>k!=='seconds'||anim.seconds).sort());
  assert.equal(view.lesson.slides[index].animation.src,'');
  assert.equal((await f.call(url,'GET',null,'student')).status,403);
  assert.equal((await f.call(`/api/assets/lessons/${anim.poster}`,'GET',null,'student')).status,403);
  const teacher=await f.call(url,'GET',null,'teacher','http://localhost',{Range:'bytes=3-5'});
  assert.equal(teacher.status,206);assert.equal(teacher.headers.get('Content-Range'),'bytes 3-5/10');assert.equal(seen.at(-1),'bytes=3-5');
  assert.deepEqual([...new Uint8Array(teacher.body)],[3,4,5]);
  assert.equal((await f.call(url,'GET',null,'teacher','http://localhost',{Range:'bytes=8-'})).headers.get('Content-Range'),'bytes 8-9/10');
  assert.equal((await f.call(url,'GET',null,'teacher','http://localhost',{Range:'bytes=20-'})).status,416);
  assert.equal((await f.call(url,'GET',null,'teacher')).status,200);
  await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'slide',index});
  await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'results',value:true});
  view=(await f.call(`/api/sessions/${session.id}`,'GET',null,'student')).body;
  assert.equal(view.lesson.slides[index].animation.src,anim.src);assert(!view.lesson.slides[index].animation.locked);
  assert.equal((await f.call(url,'GET',null,'student')).status,200);
  await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'results',value:false});
  assert.equal((await f.call(url,'GET',null,'student')).status,403);
  const bad={...lesson,id:'anim-bad',slides:[{...lesson.slides[index],animation:{...anim,src:'g8-2-2/ex1.mp4'}}]};
  assert.equal((await f.call('/api/lessons/anim-bad','PUT',{lesson:bad})).status,400);
});

test('solution steps stay hidden from students until results are shown on that slide',async()=>{
  const f=fixture();assert.equal((await f.call('/api/login','POST',TEACHER)).status,200);
  const d=(await f.call('/api/dashboard')).body;
  const lesson=d.lessons.find(l=>l.slides.some(s=>s.interactive?.steps?.length>1&&s.activity));
  const i=lesson.slides.findIndex(s=>s.interactive?.steps?.length>1&&s.activity),full=lesson.slides[i].interactive;
  const session=(await f.call('/api/sessions','POST',{lessonId:lesson.id,classId:d.classes[0].id})).body.session;
  await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:1},'student');
  await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'slide',index:i});
  let v=(await f.call(`/api/sessions/${session.id}`,'GET',null,'student')).body.lesson.slides[i].interactive;
  assert.equal(v.locked,true);assert.equal(v.steps.length,1);
  assert.ok(v.shapes.every(s=>(s.step??0)===0),'no later-step shapes sent to students');
  assert.ok(full.shapes.some(s=>(s.step??0)>0));
  assert.equal((await f.call(`/api/sessions/${session.id}`)).body.lesson.slides[i].interactive.steps.length,full.steps.length,'teacher sees all steps');
  await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'results',value:true});
  v=(await f.call(`/api/sessions/${session.id}`,'GET',null,'student')).body.lesson.slides[i].interactive;
  assert.ok(!v.locked);assert.equal(v.steps.length,full.steps.length);
});

test('per-class student code switch: off by default, teacher-only, enabling revokes code-less logins',async()=>{
  const f=fixture();assert.equal((await f.call('/api/login','POST',TEACHER)).status,200);
  const cl=(await f.call('/api/dashboard')).body.classes.find(c=>c.code==='DEMO801');
  assert.ok(!cl.requireCode);
  assert.equal((await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:5},'student')).status,200);
  assert.equal((await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:99},'nobody')).status,401);
  assert.equal((await f.call(`/api/classes/${cl.id}`,'PATCH',{requireCode:true},'student')).status,403);
  assert.equal((await f.call(`/api/classes/${cl.id}`,'PATCH',{requireCode:'yes'})).status,400);
  assert.equal((await f.call(`/api/classes/${cl.id}`,'PATCH',{requireCode:true})).body.classroom.requireCode,true);
  assert.equal((await f.call('/api/me','GET',null,'student')).body.user,null);
  assert.equal((await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:5},'student')).status,401);
  assert.equal((await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:5,code:'DEMO04'},'student')).status,401);
  assert.equal((await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:5,code:'DEMO05'},'student')).status,200);
  await f.call(`/api/classes/${cl.id}`,'PATCH',{requireCode:false});
  assert.equal((await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:6},'third')).status,200);
});

test('backup excludes secrets; valid restore works; malformed input cannot commit; class reset revokes student session',async()=>{
  const {f,session}=await setup();
  const backup=(await f.call('/api/backup')).body;
  assert(!/codeHash|cloudAccessToken|logins|secret|DEMO01|11235813|apiKey/.test(JSON.stringify(backup)));
  assert.equal((await f.call('/api/restore','POST',{backup})).status,200);
  const snapshot=JSON.stringify(f.data.lessons);
  const malformed={...backup,lessons:[{...backup.lessons[0],title:'Bad'},{}]};
  assert.equal((await f.call('/api/restore','POST',{backup:malformed})).status,400);
  assert.equal(JSON.stringify(f.data.lessons),snapshot);
  assert.equal((await f.call(`/api/classes/${session.classId}`,'PATCH',{requireCode:true})).status,200);
  const reset=await f.call(`/api/classes/${session.classId}/credentials`,'POST',{seat:1});assert.equal(reset.status,200);
  assert.equal((await f.call('/api/me','GET',null,'student')).body.user,null);
  assert.equal((await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:1,code:'DEMO01'},'student')).status,401);
  assert.equal((await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:1,code:reset.body.credential.code},'student')).status,200);
});

test('CSRF, cloud fail-closed, public demo lock, input caps and logout',async()=>{
  const {f}=await setup();
  assert.equal((await f.call('/api/classes','POST',{name:'x',seats:2},'teacher','https://evil.example')).status,403);
  assert.equal((await f.call('/api/classes','POST',{name:'x',seats:101})).status,400);
  assert.equal((await f.call('/api/classes','POST',{name:'a'.repeat(1_100_000),seats:1})).status,413);
  await f.call('/api/logout','POST');assert.equal((await f.call('/api/dashboard')).status,401);
  const unavailable=fixture({APP_MODE:'supabase'});assert.equal((await unavailable.call('/api/login','POST',TEACHER)).status,503);
  const r=await handleApi(new Request('https://public.example/api/config'),{env:{APP_MODE:'demo'},store:{async read(){},async write(){}}});assert.equal(r.status,503);
});

test('buzz closes atomically under serialized requests and draw avoids repeats',async()=>{
  const {f,session}=await setup();
  await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:2,code:'DEMO02'},'second');
  await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'buzz-open'});
  const first=await f.call(`/api/sessions/${session.id}/buzz`,'POST',{submissionId:'buzz-first'},'student');
  const second=await f.call(`/api/sessions/${session.id}/buzz`,'POST',{submissionId:'buzz-second'},'second');
  assert.deepEqual(first.body.winner,second.body.winner);assert.equal(first.body.winner.seat,1);
  // 抽籤只抽上線的人：讓 5 個座號上線，抽 10 次，5 人都會抽到且不會抽到其他人
  await goOnline(f,[3,5,7,9,11]);
  const roster=(await f.call(`/api/sessions/${session.id}`)).body.roster;
  const on=roster.filter(r=>r.online).map(r=>r.seat).sort((a,b)=>a-b);
  assert.ok(on.includes(3)&&on.includes(11)&&!on.includes(40),'roster online flags');
  const selected=[];for(let i=0;i<on.length*2;i++)selected.push((await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'draw'})).body.session.drawnSeat);
  assert.deepEqual([...new Set(selected)].sort((a,b)=>a-b),on);
  assert.ok(roster.find(r=>r.seat===40).online===false);
});

test('AI mock is explicit and sensitive activity cannot reach provider',async()=>{
  const {f,lesson,session}=await setup();
  const mock=await f.call('/api/ai','POST',{task:'lesson-review',lessonId:lesson.id});assert.equal(mock.body.mode,'mock');assert.match(mock.body.text,/未呼叫 AI/);
  const restricted=lesson.slides.find(s=>s.activity?.aiAllowed===false).activity;
  assert.equal((await f.call('/api/ai','POST',{task:'response-summary',sessionId:session.id,activityId:restricted.id})).status,403);
  const short=lesson.slides.find(s=>s.activity?.type==='short').activity;
  assert.equal((await f.call('/api/ai','POST',{task:'response-summary',sessionId:session.id,activityId:short.id})).body.mode,'mock');
});

test('Supabase adapter honors revisions, secret apikey semantics and CAS conflicts',async()=>{
  const original=globalThis.fetch;const calls=[];
  try {
    let nextRevision=8;
    globalThis.fetch=async(url,options)=>{
      calls.push({url,options});
      return Response.json(options.method==='POST'?nextRevision:[{revision:7,payload:{version:1}}]);
    };
    const store=new SupabaseStore({SUPABASE_URL:'https://project.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_example',APP_INSTANCE:'test'});
    assert.deepEqual(await store.read(),{version:1});
    await store.write({version:1});assert.equal(JSON.parse(calls[1].options.body).p_expected,7);
    assert.equal(calls[0].options.headers.get('Authorization'),null);
    assert.equal(calls[0].options.headers.get('apikey'),'sb_secret_example');
    nextRevision=0;await assert.rejects(()=>store.write({version:1}),/資料已更新/);
  }finally{globalThis.fetch=original;}
});

test('cloud teachers require current allowlist and Auth validation; foreign lesson overwrite is denied',async()=>{
  const original=globalThis.fetch;let requests=0;
  const env={APP_MODE:'supabase',SESSION_SECRET:'unit-test-session-secret-32-characters-minimum',SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test-publishable',TEACHER_EMAILS:'teacher@example.edu'};
  try {
    globalThis.fetch=async(url)=>{
      requests++;
      return Response.json(String(url).includes('/token?')?{access_token:'test-access-token',expires_in:3600}:{id:'teacher-one',email:'teacher@example.edu'});
    };
    const f=fixture(env);
    assert.equal((await f.call('/api/login','POST',{role:'teacher',email:'unauthorized@example.edu',password:'test-password'})).status,401);
    assert.equal(requests,0);
    assert.equal((await f.call('/api/login','POST',{role:'teacher',email:'teacher@example.edu',password:'test-password'})).status,200);
    assert.equal((await f.call('/api/me')).body.user.id,'teacher-one');
    const own=(await f.call('/api/dashboard')).body.lessons[0];
    f.data.lessons.foreign={...own,id:'foreign',ownerId:'teacher-two'};
    assert.equal((await f.call('/api/lessons/foreign','PUT',{lesson:{...own,id:'foreign'}})).status,403);
    assert.equal((await f.call('/api/lessons/foreign','DELETE')).status,403);
    env.TEACHER_EMAILS='other@example.edu';
    assert.equal((await f.call('/api/dashboard')).status,403);
    assert.equal((await f.call('/api/me')).body.user,null);
  }finally{globalThis.fetch=original;}
});

test('slow live AI does not block the Durable Object classroom command queue',async()=>{
  const original=globalThis.fetch,values=new Map();
  let finishProvider,announceStart;
  const started=new Promise(resolve=>{announceStart=resolve;});
  const provider=new Promise(resolve=>{finishProvider=resolve;});
  const storage=memoryStorage(values);
  const env={APP_MODE:'demo',AI_API_KEY:'test-only-no-real-key',AI_MODEL:'test-model',AI_BASE_URL:'https://provider.example/v1'};
  const object=new ClassroomDurableObject({storage},env);
  const request=(path,method='GET',body,cookie)=>new Request(`http://localhost${path}`,{method,headers:{Origin:'http://localhost','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:method==='GET'?undefined:JSON.stringify(body??{})});
  try {
    const login=await object.fetch(request('/api/login','POST',TEACHER));
    const cookie=login.headers.get('Set-Cookie').split(';')[0];
    const dashboard=await (await object.fetch(request('/api/dashboard','GET',null,cookie))).json();
    globalThis.fetch=async()=>{announceStart();return provider;};
    const ai=object.fetch(request('/api/ai','POST',{task:'lesson-review',lessonId:dashboard.lessons[0].id},cookie));
    await started;
    const responsive=await Promise.race([object.fetch(request('/api/dashboard','GET',null,cookie)),new Promise((_,reject)=>setTimeout(()=>reject(new Error('AI blocked the classroom queue')),500))]);
    assert.equal(responsive.status,200);
    finishProvider(Response.json({choices:[{message:{content:'測試分析'}}]}));
    assert.equal((await (await ai).json()).mode,'live');
    assert.equal(Object.values((await splitStore(storage).read()).aiUsage)[0],1);
  }finally{finishProvider?.(Response.json({choices:[{message:{content:'測試清理'}}]}));globalThis.fetch=original;}
});

const HOUR=3600_000;
function splitStore(storage){
  return new SessionSplitStore(storage,{archivable:(s,now)=>s.session.ended&&now-(s.session.endedAt||0)>HOUR,summary:s=>({session:s.session,ownerId:s.ownerId})});
}
const sess=(id,extra={})=>({ownerId:'t1',session:{id,ended:false,createdAt:'2026-10-01',...extra},answers:[],note:'x'.repeat(1000)});

test('SessionSplitStore keeps each class session in its own piece and rewrites only what changed',async()=>{
  const values=new Map(),store=splitStore(memoryStorage(values));
  // 舊版單一快照：讀得到，第一次儲存時拆開並刪掉舊鍵
  await new DurableStore(memoryStorage(values)).write({logins:{},sessions:{a:sess('a'),b:sess('b')}});
  const legacy=await store.read();
  assert.deepEqual(Object.keys(legacy.sessions),['a','b']);
  await store.write(legacy);
  assert(!values.has('classroom-state:manifest'),'legacy snapshot removed after the split');
  assert(values.has('sess:a:m')&&values.has('sess:b:m')&&values.has('main:m'));
  const rows=()=>values.get('usage:rows').rows;
  // 只改一堂課：只寫那一堂（2 列）＋用量計數
  const before=rows();
  const fresh=splitStore(memoryStorage(values));const again=await fresh.read();
  again.sessions.a.answers.push({id:'ans1'});
  await fresh.write(again);
  assert.equal(rows()-before,3,'one session piece (manifest + chunk) and the usage counter');
  assert.equal((await splitStore(memoryStorage(values)).read()).sessions.a.answers.length,1);
  // 沒變就不寫資料，只記用量
  const n=rows();await fresh.write(await fresh.read());assert.equal(rows()-n,1);
  // 結束超過 1 小時：封存（主檔只留摘要，讀取時不載入），需要時再讀
  again.sessions.b.session.ended=true;again.sessions.b.session.endedAt=Date.now()-2*HOUR;
  await fresh.write(again);
  const next=await splitStore(memoryStorage(values)).read();
  assert.deepEqual(Object.keys(next.sessions),['a']);
  assert.equal(next.archive.b.session.id,'b');assert.equal(next.archive.b.ownerId,'t1');
  assert.equal(next.archive.b.answers,undefined,'archive keeps only the summary');
  assert.equal((await fresh.loadSession('b')).note.length,1000);
  // 封存的課被載入、改了又存：仍是封存，紀錄更新
  const loaded=await fresh.read();loaded.sessions.b=await fresh.loadSession('b');loaded.sessions.b.answers.push({id:'late'});
  await fresh.write(loaded);
  assert.equal((await fresh.loadSession('b')).answers.length,1);
  assert.deepEqual(Object.keys((await fresh.read()).sessions),['a']);
  // 刪除：主檔與封存都移除，紀錄一起刪掉
  const del=await fresh.read();delete del.archive.b;delete del.sessions.a;
  await fresh.write(del);
  assert(!values.has('sess:a:m')&&!values.has('sess:b:m')&&!values.has('sess:b:c:0'));
  const usage=await fresh.usage();
  assert.equal(usage.sessions,0);assert(usage.dataBytes>0&&usage.rowsToday>0);
});

test('archived sessions load on demand for the dashboard, opening, export and backup',async()=>{
  const values=new Map(),storage=memoryStorage(values);
  const object=new ClassroomDurableObject({storage},{APP_MODE:'demo'});
  const request=(path,method='GET',body,cookie)=>new Request(`http://localhost${path}`,{method,headers:{Origin:'http://localhost','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:method==='GET'?undefined:JSON.stringify(body??{})});
  const call=async(path,method,body,cookie)=>(await object.fetch(request(path,method,body,cookie))).json();
  const t=(await object.fetch(request('/api/login','POST',TEACHER))).headers.get('Set-Cookie').split(';')[0];
  const d=await call('/api/dashboard','GET',null,t);
  const first=(await call('/api/sessions','POST',{lessonId:d.lessons[0].id,classId:'demo-class'},t)).session;
  await call(`/api/sessions/${first.id}/control`,'POST',{action:'end'},t);
  // 模擬「結束超過 1 小時」：把結束時間往前調
  const s=splitStore(storage),st=await s.read();st.sessions[first.id].session.endedAt=Date.now()-2*HOUR;await s.write(st);
  const second=(await call('/api/sessions','POST',{lessonId:d.lessons[0].id,classId:'demo-class'},t)).session;
  const raw=await splitStore(storage).read();
  assert(!raw.sessions[first.id]&&raw.archive[first.id],'ended session archived');
  assert(raw.sessions[second.id]);
  const dash=await call('/api/dashboard','GET',null,t);
  assert(dash.sessions.some(x=>x.id===first.id)&&dash.sessions.some(x=>x.id===second.id),'dashboard lists archived sessions');
  const opened=await call(`/api/sessions/${first.id}`,'GET',null,t);
  assert.equal(opened.session.id,first.id,'an archived session opens');
  const backup=await call('/api/backup','GET',null,t);
  assert(backup.sessions.some(x=>x.session.id===first.id),'backup includes archived sessions');
  const usage=await call('/api/settings/usage','GET',null,t);
  assert.equal(usage.available,true);assert.equal(usage.archived,1);assert(usage.dataBytes>0);
  assert.equal(usage.limits.rowsPerDay,100000);
  assert.equal((await object.fetch(request(`/api/sessions/${first.id}`,'DELETE',null,t))).status,200);
  const after=await splitStore(storage).read();
  assert(!after.archive[first.id]&&!values.has(`sess:${first.id}:m`),'deleting an archived session removes its record');
});

test('DurableStore chunks multi-megabyte snapshots and rolls back a partial failure atomically',async()=>{
  const values=new Map();let fail=false;
  const storage=memoryStorage(values,key=>fail&&key==='classroom-state:chunk:1');
  const store=new DurableStore(storage);
  // Legacy one-key snapshots migrate without changing data.
  values.set('classroom-state',{before:'legacy'});
  assert.deepEqual(await store.read(),{before:'legacy'});
  const large={text:'白板測試'.repeat(220000),answers:[1,2,3]};
  await store.write(large);
  assert(!values.has('classroom-state'));assert(values.get('classroom-state:manifest').chunks>32);
  assert.deepEqual(await new DurableStore(storage).read(),large);
  fail=true;await assert.rejects(()=>store.write({text:'x'.repeat(150000)}),/Injected storage failure/);
  assert.deepEqual(await store.read(),large);
  fail=false;await store.write({small:true});
  assert.deepEqual(await store.read(),{small:true});assert.equal([...values.keys()].filter(key=>key.includes(':chunk:')).length,1);
  await assert.rejects(()=>store.write({oversized:'x'.repeat(MAX_SNAPSHOT_BYTES)}),/8 MiB/);
  assert.deepEqual(await store.read(),{small:true});
});

test('authenticated teacher restores a generated backup larger than the normal command cap',async()=>{
  const {f,lesson,session}=await setup();
  const backup=(await f.call('/api/backup')).body;
  const activity=lesson.slides.find(s=>s.activity?.type==='short').activity;
  backup.sessions[0].answers=Array.from({length:650},(_,i)=>({id:`answer-${i}`,submissionId:`submission-${i}`,userId:'ignored',seat:1,activityId:activity.id,value:'r'.repeat(1900),submittedAt:new Date().toISOString()}));
  backup.sessions[0].session.id='restore-large-test';
  assert(JSON.stringify(backup).length>1048576);
  const result=await f.call('/api/restore','POST',{backup});assert.equal(result.status,200);
  assert.equal(f.data.sessions['restore-large-test'].answers.length,650);
  assert.equal(f.data.sessions[session.id].answers.length,0);
  assert.equal((await f.call('/api/restore','POST',{backup},'student')).status,403);
  const tooLarge=await f.call('/api/restore','POST',{backup,padding:'x'.repeat(9*1024*1024)});assert.equal(tooLarge.status,413);
});

async function openSlide(f,session,lesson,activityId){
  const index=lesson.slides.findIndex(s=>s.activity?.id===activityId);
  await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'slide',index});
  await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'activity',value:true});
  return index;
}
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('teacher password: default login, change revokes default, wrong account and lockout',async()=>{
  const f=fixture({APP_MODE:'demo',TEACHER_ACCOUNT:'Teacher@Example.edu'});
  assert.equal((await f.call('/api/login','POST',{...TEACHER,account:'teacher'})).status,401);
  const ok=await f.call('/api/login','POST',{...TEACHER,account:'teacher@example.edu'});
  assert.equal(ok.status,200);assert.equal(ok.body.mustChange,true);
  assert.equal((await f.call('/api/teacher/password','POST',{current:'11235813',next:'11235813'})).status,400);
  assert.equal((await f.call('/api/teacher/password','POST',{current:'nope',next:'a-better-pass'})).status,403);
  assert.equal((await f.call('/api/teacher/password','POST',{current:'11235813',next:'a-better-pass'})).status,200);
  assert(!JSON.stringify(f.data).includes('a-better-pass'));
  assert.equal((await f.call('/api/login','POST',{...TEACHER,account:'teacher@example.edu'},'other')).status,401);
  const fresh=await f.call('/api/login','POST',{...TEACHER,account:'teacher@example.edu',password:'a-better-pass'},'other');
  assert.equal(fresh.status,200);assert.equal(fresh.body.mustChange,false);
  for(let i=0;i<10;i++)await f.call('/api/login','POST',{...TEACHER,account:'teacher@example.edu',password:'x'},'bad');
  assert.equal((await f.call('/api/login','POST',{...TEACHER,account:'teacher@example.edu',password:'a-better-pass'},'bad')).status,429);
  const cf=fixture({APP_MODE:'cloudflare'});
  assert.equal((await cf.call('/api/login','POST',TEACHER)).status,503,'cloudflare mode requires TEACHER_ACCOUNT');
  const r=await handleApi(new Request('https://class.example/api/config'),{env:{APP_MODE:'cloudflare',TEACHER_ACCOUNT:'t@example.edu'},store:{async read(){},async write(){}}});
  const config=await r.json();assert.equal(config.mode,'cloudflare');assert.equal(config.teacherHint,undefined);
});

test('AI key is stored server-side only and never returned, backed up or snapshotted',async()=>{
  const {f}=await setup();
  const key='sk-test-not-real-ABCD1234';
  const saved=await f.call('/api/settings/ai','PUT',{provider:'openai',baseUrl:'https://api.openai.com/v1',model:'gpt-6-luna',apiKey:key,dailyLimit:50});
  assert.equal(saved.status,200);assert.equal(saved.body.keyHint,'••••1234');assert.equal(saved.body.configured,true);
  assert.equal((await f.call('/api/settings/ai','PUT',{provider:'openai',baseUrl:'http://169.254.169.254/v1',model:'m'})).status,400);
  for(const path of ['/api/settings/ai','/api/config','/api/backup','/api/dashboard'])assert(!JSON.stringify((await f.call(path)).body).includes(key),path);
  assert(!JSON.stringify(f.data).includes(key));
  assert.equal((await f.call('/api/settings/ai','GET',null,'student')).status,403);
  assert.equal((await f.call('/api/config')).body.aiConfigured,true);
  assert.equal((await f.call('/api/settings/ai','DELETE')).body.configured,false);
});

test('numeric and manipulate answers are judged server-side; verdict hidden until results; draw filters',async()=>{
  const {f,lesson,session}=await setup();
  await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:2,code:'DEMO02'},'second');
  await openSlide(f,session,lesson,'worked-41');
  const submit=(who,value)=>f.call(`/api/sessions/${session.id}/answers`,'POST',{submissionId:`n-${who}-${Math.random().toString(36).slice(2)}`,activityId:'worked-41',value},who);
  assert.equal((await submit('student','41^2')).status,200);
  assert.equal((await submit('second','1600+1+1')).status,200);
  assert.equal((await submit('student','abc')).status,400);
  const hidden=(await f.call(`/api/sessions/${session.id}`,'GET',null,'student')).body;
  assert.equal(hidden.answers[0].correct,undefined);assert.equal(hidden.lesson.slides.find(s=>s.activity?.id==='worked-41').activity.answer,undefined);
  const teacherView=(await f.call(`/api/sessions/${session.id}`)).body;
  assert.equal(teacherView.aggregate.correct,1);assert.equal(teacherView.aggregate.counts['1681'],1);
  const drawCorrect=await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'draw',filter:'correct'});
  assert.equal(drawCorrect.body.session.drawnSeat,1);
  const drawWrong=await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'draw',filter:'incorrect'});
  assert.equal(drawWrong.body.session.drawnSeat,2);
  await goOnline(f,Array.from({length:40},(_,i)=>i+1));
  const unanswered=new Set();for(let i=0;i<38;i++)unanswered.add((await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'draw',filter:'unanswered'})).body.session.drawnSeat);
  assert.equal(unanswered.size,38);assert(!unanswered.has(1)&&!unanswered.has(2));
  await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'results',value:true});
  const revealed=(await f.call(`/api/sessions/${session.id}`,'GET',null,'student')).body;
  assert.equal(revealed.answers.at(-1).correct,true);
  await openSlide(f,session,lesson,'explore-find-ab');
  const manip=(who,vars)=>f.call(`/api/sessions/${session.id}/answers`,'POST',{submissionId:`m-${who}`,activityId:'explore-find-ab',value:{vars}},who);
  assert.equal((await manip('student',{a:6,b:2})).status,200);
  assert.equal((await manip('second',{a:5,b:2})).status,200);
  const mv=(await f.call(`/api/sessions/${session.id}`)).body;
  assert.equal(mv.aggregate.counts.correct,1);assert.equal(mv.aggregate.counts.incorrect,1);
  assert.equal((await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'draw',filter:'bogus'})).status,400);
});

test('canvas answers: photo ownership, mock grading, teacher edit and release only to the owner',async()=>{
  const {f,lesson,session}=await setup();
  await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:2,code:'DEMO02'},'second');
  assert.equal((await f.call(`/api/sessions/${session.id}/images`,'POST',{dataUrl:PNG},'student')).status,409,'closed activity rejects uploads');
  await openSlide(f,session,lesson,'error-canvas');
  assert.equal((await f.call(`/api/sessions/${session.id}/images`,'POST',{dataUrl:'data:text/html;base64,PHNjcmlwdD4='},'student')).status,400);
  const img=await f.call(`/api/sessions/${session.id}/images`,'POST',{dataUrl:PNG},'student');assert.equal(img.status,200);
  const imageId=img.body.imageId;
  assert.equal((await f.call(`/api/images/${imageId}`,'GET',null,'second')).status,403);
  const mine=await f.call(`/api/images/${imageId}`,'GET',null,'student');assert.equal(mine.status,200);assert.equal(mine.headers.get('Content-Type'),'image/png');
  assert.equal((await f.call(`/api/images/${imageId}`)).status,200,'teacher can read');
  assert(!JSON.stringify(f.data).includes(PNG.slice(30,60)),'image bytes stay out of the snapshot');
  const stolen=await f.call(`/api/sessions/${session.id}/answers`,'POST',{submissionId:'steal',activityId:'error-canvas',value:{imageId}},'second');
  assert.equal(stolen.status,400);
  const answer=await f.call(`/api/sessions/${session.id}/answers`,'POST',{submissionId:'c1',activityId:'error-canvas',value:{imageId,text:'少了 12x',source:'photo'}},'student');
  assert.equal(answer.status,200);
  const graded=await f.call('/api/ai','POST',{task:'grade',sessionId:session.id,answerId:answer.body.answer.id});
  assert.equal(graded.body.mode,'mock');assert.equal(graded.body.grade.max,3);assert.equal(graded.body.grade.needsReview,true);
  assert.equal((await f.call(`/api/sessions/${session.id}`,'GET',null,'student')).body.grades.length,0,'unreleased grade hidden');
  const edit=await f.call(`/api/sessions/${session.id}/grades/${answer.body.answer.id}`,'PUT',{scores:[{criterionId:'kai',score:99}],feedback:'很好'});
  assert.equal(edit.body.grade.total,3,'scores snap to the nearest rubric level');assert.equal(edit.body.grade.mode,'teacher');
  await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'release-grades',activityId:'error-canvas',value:true});
  const own=(await f.call(`/api/sessions/${session.id}`,'GET',null,'student')).body;
  assert.equal(own.grades.length,1);assert.equal(own.grades[0].feedback,'很好');
  assert.equal(own.lesson.slides.find(s=>s.activity?.id==='error-canvas').activity.rubric.reference,undefined,'reference answer hidden');
  assert.equal((await f.call(`/api/sessions/${session.id}`,'GET',null,'second')).body.grades.length,0,'other students never see it');
  assert.equal((await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'draw',filter:'correct'})).body.session.drawnSeat,1);
  const bad=structuredClone(lesson);delete bad.slides.find(s=>s.activity?.id==='error-canvas').activity.rubric;
  assert.equal((await f.call(`/api/lessons/${lesson.id}`,'PUT',{lesson:bad})).status,400,'canvas questions must have a rubric');
  await f.call(`/api/sessions/${session.id}`,'DELETE');
  assert.equal([...f.vaultMap.keys()].filter(k=>k.startsWith('blob:')).length,0,'deleting a session removes its photos');
});

test('live grading runs parallel votes outside the queue and commits the consensus',async()=>{
  const original=globalThis.fetch,values=new Map();
  const storage=memoryStorage(values);
  const env={APP_MODE:'demo',AI_API_KEY:'test-only-no-real-key',AI_MODEL:'gpt-6-luna',AI_BASE_URL:'https://provider.example/v1'};
  const object=new ClassroomDurableObject({storage},env);
  const request=(path,method='GET',body,cookie)=>new Request(`http://localhost${path}`,{method,headers:{Origin:'http://localhost','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:method==='GET'?undefined:JSON.stringify(body??{})});
  const call=async(path,method,body,cookie)=>(await object.fetch(request(path,method,body,cookie))).json();
  const bodies=[];
  try{
    const t=(await object.fetch(request('/api/login','POST',TEACHER))).headers.get('Set-Cookie').split(';')[0];
    const s=(await object.fetch(request('/api/login','POST',{role:'student',classCode:'DEMO801',seat:3,code:'DEMO03'}))).headers.get('Set-Cookie').split(';')[0];
    const d=await call('/api/dashboard','GET',null,t);
    const lesson=d.lessons[0];
    const session=(await call('/api/sessions','POST',{lessonId:lesson.id,classId:'demo-class'},t)).session;
    await call(`/api/sessions/${session.id}/control`,'POST',{action:'slide',index:lesson.slides.findIndex(x=>x.activity?.id==='error-canvas')},t);
    await call(`/api/sessions/${session.id}/control`,'POST',{action:'activity',value:true},t);
    const {imageId}=await call(`/api/sessions/${session.id}/images`,'POST',{dataUrl:PNG},s);
    const {answer}=await call(`/api/sessions/${session.id}/answers`,'POST',{submissionId:'live1',activityId:'error-canvas',value:{imageId}},s);
    let n=0;
    globalThis.fetch=async(url,options)=>{
      const body=JSON.parse(options.body);bodies.push(body);
      const kai=n++===2?2:3;
      const reply={transcript:'(2x+3)^2=4x^2+12x+9',scores:[{criterionId:'kai',score:kai}],feedback:'做得好',confidence:0.9,annotations:[{mark:'circle',x:.1,y:.2,x2:.5,y2:.3},{mark:'note',x:.6,y:.2,text:'這裡'}]};
      return Response.json({choices:[{message:{content:'```json\n'+JSON.stringify(reply)+'\n```'}}]});
    };
    const result=await call('/api/ai','POST',{task:'grade',sessionId:session.id,answerId:answer.id,votes:3,depth:'full'},t);
    assert.equal(bodies.length,3);
    assert(bodies.every(b=>b.max_completion_tokens&&!('temperature' in b)&&!('max_tokens' in b)),'reasoning models use max_completion_tokens');
    assert.equal(bodies[0].messages[1].content[1].image_url.url,PNG);
    assert.equal(result.grade.total,3);assert.deepEqual([...result.grade.votes].sort(),[2,3,3]);
    assert.equal(result.grade.needsReview,true,'disagreeing votes require review');
    assert.equal(result.grade.annotations.length,2);assert.equal(result.grade.annotations[0].x2,.5);
    const view=await call(`/api/sessions/${session.id}`,'GET',null,t);
    assert.equal(view.grades[0].answerId,answer.id,'grade committed back into classroom state');
  }finally{globalThis.fetch=original;}
});

test('grading helpers and expression engine are safe and deterministic',()=>{
  assert.equal(isReasoning('gpt-6-luna'),true);assert.equal(isReasoning('gemini-2.5-flash'),false);
  assert.deepEqual(extractJson('前言 {"a":{"b":"}"}} 後記'),{a:{b:'}'}});
  const rubric={criteria:[{id:'x',label:'X',points:2,levels:[{score:0,description:'a'},{score:2,description:'b'}]}]};
  const g=normalizeGrade({scores:[{criterionId:'x',score:1.4}],annotations:[{mark:'evil',x:5,y:-1,text:'t'}],confidence:3},rubric,{answerId:'a',activityId:'b',seat:1},'live',true);
  assert.equal(g.scores[0].score,2);assert.equal(g.annotations[0].mark,'note');assert.equal(g.annotations[0].x,1);assert.equal(g.confidence,1);
  const tie=aggregateVotes([{...g,scores:[{criterionId:'x',score:0,comment:''}],total:0,confidence:.9},{...g,scores:[{criterionId:'x',score:2,comment:''}],total:2,confidence:.9}],rubric);
  assert.equal(tie.total,0,'ties resolve to the lower score');assert.equal(tie.needsReview,true);
  assert.equal(expr.evaluate('2a(b+c)',{a:2,b:3,c:4}),28);
  assert.equal(expr.evaluate('(a+b)^2 - (a^2+2a*b+b^2)',{a:-3.5,b:7}),0);
  assert.equal(expr.evaluate('b==2 && 2*a*b==24',{a:6,b:2}),1);
  assert.equal(expr.parseNumberAnswer('-3/4'),-0.75);assert.equal(expr.parseNumberAnswer('2√3'),2*Math.sqrt(3));
  for(const evil of ['constructor','__proto__','alert(1)','a.b','x;y','`1`'])assert.throws(()=>expr.evaluate(evil,{}),evil);
  assert.throws(()=>expr.parseNumberAnswer('x+1'));
});

test('student input: full-width characters and keypad parentheses are read correctly, without changing values',async()=>{
  // 作答鍵盤會產生 √(5)、(15)；中文輸入法會產生全形字。數值與最簡判斷都要正確。
  for(const [input,value,simplest] of [
    ['4√(5)/(15)',4*Math.sqrt(5)/15,true],['(√(5)+√(3))/(2)',(Math.sqrt(5)+Math.sqrt(3))/2,true],['（√5＋√3）／２',(Math.sqrt(5)+Math.sqrt(3))/2,true],
    ['２√６',2*Math.sqrt(6),true],['−2√6',-2*Math.sqrt(6),true],['(√6)/(3)',Math.sqrt(6)/3,true],
    ['4/(3√5)',4/(3*Math.sqrt(5)),false],['(4√5)^2',80,false],['(2)(3)',6,false],['2(3)',6,false],['(√3)2',2*Math.sqrt(3),false],
    ['sqrt(12)',Math.sqrt(12),false],['√(12)',Math.sqrt(12),false],['(3+2√5)²',(3+2*Math.sqrt(5))**2,false],['√(7/2)',Math.sqrt(3.5),false],
  ]){
    assert.ok(Math.abs(expr.parseNumberAnswer(input)-value)<1e-9,`value ${input}`);
    assert.equal(expr.isSimplestRadical(input),simplest,`simplest ${input}`);
  }
  // 顯示用：作者寫的括號保留
  assert.equal(expr.answerToTex('(−2√3) × (4√2)'),String.raw`\left(-2\sqrt{3}\right)\times \left(4\sqrt{2}\right)`);
});

test('simplest radical form and multi-item numeric questions are judged per item',async()=>{
  for(const ok of ['2√3','3+2√2','√6/3','-5√2','7','(3+√2)/2','2sqrt(3)','√(15)','4√6/3+√2','(2/3)√6','-2√2/3','√130/10',
    // 作答鍵盤先按「分數」再打負號：負號在係數括號裡
    '(-2)/(3)√(2)','(-2/3)√(2)','-((2)/(3))√(2)','((-2)/(3))√(2)','(-2√(2))/(3)'])assert.equal(expr.isSimplestRadical(ok),true,ok);
  for(const bad of ['√12','1/√2','√2+√2','4√8','√4','3+1+√2','2√3/√3','3/(√7-2)','√5/√3','(-2)/3√8','(-2)/√3','(-1)/(√2)','√13√5','√(13)√(5)','2√3√2'])assert.equal(expr.isSimplestRadical(bad),false,bad);
  const {f,lesson,session}=await setup();
  const item={id:'items-q',type:'numeric',prompt:'化成最簡根式',form:'simplest-radical',items:[{prompt:'√12',answer:'2√3'},{prompt:'√18',answer:'3√2'},{prompt:'1/√2',answer:'√2/2'}]};
  const custom={...lesson,id:'items-lesson',slides:[{id:'s1',title:'化簡',body:'',activity:item}]};
  assert.equal((await f.call('/api/lessons/items-lesson','PUT',{lesson:custom})).status,200);
  const bad={...custom,slides:[{...custom.slides[0],activity:{...item,items:[{prompt:'√12',answer:'√12'}]}}]};
  assert.equal((await f.call('/api/lessons/items-lesson','PUT',{lesson:bad})).status,400,'reference answers must themselves be simplest');
  const s=(await f.call('/api/sessions','POST',{lessonId:'items-lesson',classId:'demo-class'})).body.session;
  await f.call(`/api/sessions/${s.id}/control`,'POST',{action:'activity',value:true});
  assert.equal((await f.call(`/api/sessions/${s.id}/answers`,'POST',{submissionId:'i0',activityId:'items-q',value:['2√3']},'student')).status,400,'all items required');
  assert.equal((await f.call(`/api/sessions/${s.id}/answers`,'POST',{submissionId:'i1',activityId:'items-q',value:['2√3','√18','√2/2']},'student')).status,200);
  const t=(await f.call(`/api/sessions/${s.id}`)).body;
  const a=t.answers[0];
  assert.deepEqual(a.itemsCorrect,[true,false,true]);assert.equal(a.correct,false);assert.match(a.note,/第 2 小題數值正確，但還沒化成最簡根式/);
  assert.equal(t.aggregate.counts.item0,1);assert.equal(t.aggregate.counts.item1,undefined);
  assert.equal((await f.call(`/api/sessions/${s.id}`,'GET',null,'student')).body.answers[0].note,undefined,'hidden until results');
  void session;
});

test('layer 1 (default) only judges right/wrong; teacher can set the verdict; layer 2 replaces it',async()=>{
  const {f,lesson,session}=await setup();
  await openSlide(f,session,lesson,'error-canvas');
  const answer=(await f.call(`/api/sessions/${session.id}/answers`,'POST',{submissionId:'v1',activityId:'error-canvas',value:{text:'(2x+3)^2=4x^2+12x+9'}},'student')).body.answer;
  const v=(await f.call('/api/ai','POST',{task:'grade',sessionId:session.id,answerId:answer.id})).body.grade;
  assert.equal(v.depth,'verdict');assert.equal(v.scores.length,0);assert.equal(v.annotations.length,0);
  const set=(await f.call(`/api/sessions/${session.id}/grades/${answer.id}`,'PUT',{verdict:true,released:true})).body.grade;
  assert.equal(set.correct,true);assert.equal(set.mode,'teacher');assert.equal(set.total,set.max);
  assert.equal((await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'draw',filter:'correct'})).body.session.drawnSeat,1);
  const own=(await f.call(`/api/sessions/${session.id}`,'GET',null,'student')).body.grades[0];
  assert.equal(own.correct,true);assert.equal(own.depth,'verdict');
  const full=(await f.call('/api/ai','POST',{task:'grade',sessionId:session.id,answerId:answer.id,depth:'full'})).body.grade;
  assert.equal(full.depth,'full');assert.equal(full.scores.length,1);
});

test('plain textbook notation converts to LaTeX that keeps radicals, fractions, parentheses, × and ÷',()=>{
  const cases={
    'a√b':String.raw`a\sqrt{b}`,
    '√a × √b':String.raw`\sqrt{a}\times \sqrt{b}`,
    '√(a×b)':String.raw`\sqrt{a\times b}`,
    '(−2√3) × (4√2)':String.raw`\left(-2\sqrt{3}\right)\times \left(4\sqrt{2}\right)`,
    '√35 ÷ √7':String.raw`\sqrt{35}\div \sqrt{7}`,
    '4/(3√5)':String.raw`\frac{4}{3\sqrt{5}}`,
    '(√5+√3)/2':String.raw`\frac{\sqrt{5}+\sqrt{3}}{2}`,
    '4√6/3+√2':String.raw`\frac{4\sqrt{6}}{3}+\sqrt{2}`,
    '(3 + 2√5)²':String.raw`\left(3+2\sqrt{5}\right)^{2}`,
    '(√3 − √2)(√6 + 1)':String.raw`\left(\sqrt{3}-\sqrt{2}\right)\left(\sqrt{6}+1\right)`,
  };
  for(const [input,want] of Object.entries(cases))assert.equal(expr.answerToTex(input),want,input);
  assert.equal(expr.answerToTex('不是算式'),null);
  assert.equal(expr.evaluate('(2+3)÷5'),1,'÷ still evaluates as division');
});

test('live push views are scoped per user and stop after logout or wrong origin data',async()=>{
  const {f,lesson,session}=await setup();
  await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:2,code:'DEMO02'},'second');
  await openSlide(f,session,lesson,'worked-41');
  await f.call(`/api/sessions/${session.id}/answers`,'POST',{submissionId:'lv1',activityId:'worked-41',value:'1681'},'student');
  const req=(who,query='')=>new Request(`http://localhost/api/live${query}`,{headers:{Cookie:f.cookie(who),Origin:'http://localhost'}});
  const tTeacher=await liveTicket(req('teacher',`?sessionId=${session.id}`),f.data);
  const tStudent=await liveTicket(req('student'),f.data);
  const tSecond=await liveTicket(req('second'),f.data);
  assert.equal(liveView(f.data,tTeacher).answers.length,1);
  assert.equal(liveView(f.data,tStudent).answers.length,1,'student sees own answer');
  const other=liveView(f.data,tSecond);
  assert.equal(other.answers.length,0,'other students never receive it');
  assert(!JSON.stringify(other).includes('"answer":"1681"'),'reference answer hidden before results');
  await assert.rejects(()=>liveTicket(new Request('http://localhost/api/live'),f.data),/請先登入/,'no cookie, no connection');
  await assert.rejects(()=>liveTicket(req('teacher','?sessionId=nope'),f.data),/找不到課堂/);
  await f.call('/api/logout','POST',{},'second');
  assert.equal(liveView(f.data,tSecond),null,'logged-out sockets get closed');
  await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'end'});
  assert.deepEqual(liveView(f.data,tStudent),{session:null},'students return to the waiting room when class ends');
});

test('original-question practice: redo each wrong item once; all right passes, any miss needs help',()=>{
  const run={activityId:'q',startedAt:0,seconds:60,rounds:2,retry:true};
  const at=(subs,now,items=[1,2])=>practiceStatus(run,{seat:1,start:0,subs,items},now);
  const one=at([{round:0,value:'1',correct:true,at:5_000}],6_000);
  assert.deepEqual([one.status,one.round],['working',1],'a right answer moves on to the next wrong item');
  assert.equal(at([{round:0,value:'1',correct:true,at:5_000},{round:1,value:'1',correct:true,at:7_000}],8_000).status,'passed');
  assert.equal(at([{round:0,value:'1',correct:true,at:5_000},{round:1,value:'1',correct:false,at:7_000}],8_000).status,'help');
  assert.equal(at([{round:0,value:'1',correct:true,at:5_000}],6_000,[0]).status,'passed','one wrong item: one question');
});

test('practice rounds: correct passes, wrong or timeout starts the next round, three misses need help',()=>{
  const run={activityId:'q',startedAt:0,seconds:60,rounds:3};
  const at=(subs,now)=>practiceStatus(run,{seat:1,start:0,subs},now);
  assert.deepEqual([at([],10_000).status,at([],10_000).round],['working',0]);
  assert.equal(at([{round:0,value:'1',correct:true,at:5_000}],6_000).status,'passed');
  const w=at([{round:0,value:'1',correct:false,at:5_000}],6_000);
  assert.deepEqual([w.status,w.round,w.deadline],['working',1,65_000],'a wrong answer starts the next round at once');
  const t=at([],61_000);
  assert.deepEqual([t.status,t.round,t.deadline,t.rounds[0].outcome],['working',1,120_000,'timeout']);
  assert.equal(at([],200_000).status,'help','all rounds timed out');
  assert.equal(at([{round:0,value:'1',correct:false,at:1},{round:1,value:'1',correct:false,at:2},{round:2,value:'1',correct:false,at:3}],4).status,'help');
});

test('answer time limit locks submissions; teacher can extend; practice goes to wrong answers only',async()=>{
  const {f,lesson:base}=await setup();
  const act={id:'pq',type:'numeric',prompt:'化成最簡根式',form:'simplest-radical',answer:'2√3',explanation:'√12＝2√3',
    practice:[{prompt:'√18',answer:'3√2',explanation:'√18＝3√2'},{prompt:'√20',answer:'2√5'},{prompt:'√27',answer:'3√3'}]};
  const lesson={...base,id:'practice-lesson',slides:[{id:'s1',title:'化簡',body:'',activity:act}]};
  assert.equal((await f.call('/api/lessons/practice-lesson','PUT',{lesson})).status,200);
  const bad={...lesson,slides:[{...lesson.slides[0],activity:{...act,practice:[{prompt:'√12',answer:'√12'}]}}]};
  assert.equal((await f.call('/api/lessons/practice-lesson','PUT',{lesson:bad})).status,400,'practice answers follow the simplest-radical form');
  const s=(await f.call('/api/sessions','POST',{lessonId:'practice-lesson',classId:'demo-class'})).body.session;
  const ctl=(body)=>f.call(`/api/sessions/${s.id}/control`,'POST',body);
  await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:2},'seat2');
  await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:3},'seat3');
  const opened=(await ctl({action:'activity',value:true,seconds:60})).body.session;
  assert(opened.activityDeadline>Date.now()+55_000&&opened.activityDeadline<=Date.now()+60_000,'1-minute deadline');
  const answer=(who,id,value)=>f.call(`/api/sessions/${s.id}/answers`,'POST',{submissionId:id,activityId:'pq',value},who);
  assert.equal((await answer('student','a1','2√3')).status,200);
  assert.equal((await answer('seat2','a2','√12')).status,200);
  // 時間到：鎖住作答
  f.data.sessions[s.id].session.activityDeadline=Date.now()-5_000;
  const late=await answer('seat3','a3','2√3');
  assert.equal(late.status,409);assert.match(late.body.error,/時間到/);
  // 老師加 1 分鐘：又可以作答
  const extended=(await ctl({action:'extend',seconds:60})).body.session;
  assert(extended.activityDeadline>Date.now()+55_000);
  assert.equal((await answer('seat3','a3','3')).status,200);
  // 學生端看不到練習題與答案
  const stu=(await f.call(`/api/sessions/${s.id}`,'GET',null,'student')).body;
  assert.equal(stu.lesson.slides[0].activity.practice,undefined);assert.equal(typeof stu.serverNow,'number');
  // 原題再派一次：只給答錯的 2、3 號，不另外出題
  const started=(await ctl({action:'practice-start'})).body;
  assert.equal(started.session.activityOpen,false);assert.equal(started.session.practice.retry,true);
  assert.deepEqual(started.practice.entries.map(e=>e.seat).sort(),[2,3]);
  assert.equal((await f.call(`/api/sessions/${s.id}`,'GET',null,'student')).body.practice,undefined,'seat 1 answered right: no practice');
  const mine=(await f.call(`/api/sessions/${s.id}`,'GET',null,'seat2')).body.practice;
  assert.deepEqual(mine.prompts,['化成最簡根式'],'the original question');assert.deepEqual(mine.reveals,[],'no answers before a round ends');
  assert.deepEqual(mine.entries.map(e=>e.seat),[2]);
  const practice=(who,round,value)=>f.call(`/api/sessions/${s.id}/practice`,'POST',{round,value},who);
  assert.equal((await practice('student',0,'2√3')).status,403);
  assert.notEqual((await practice('seat2',1,'2√3')).status,200,'only one original question to redo');
  // 2 號：又沒化簡 → 錯，看到答案、需要個別指導；3 號：答對 → 通過
  assert.equal((await practice('seat2',0,'√12')).body.correct,false,'not simplest is wrong');
  assert.equal((await practice('seat2',0,'2√3')).status,409,'one try per question');
  const after=(await f.call(`/api/sessions/${s.id}`,'GET',null,'seat2')).body.practice;
  assert.deepEqual(after.reveals.map(r=>[r.round,r.answer]),[[0,'2√3']]);
  assert.equal((await practice('seat3',0,'2√3')).body.correct,true);
  const t=(await f.call(`/api/sessions/${s.id}`)).body;
  const st=Object.fromEntries(t.practice.entries.map(e=>[e.seat,practiceStatus(t.practice.run,e,Date.now())]));
  assert.deepEqual([st[2].status,st[3].status],['help','passed']);
  // 換頁或結束：練習關閉
  await ctl({action:'practice-end'});
  assert.equal((await f.call(`/api/sessions/${s.id}`,'GET',null,'seat3')).body.practice,undefined);
  assert.equal((await practice('seat3',0,'2√3')).status,409);
});

test('danmaku while a question is open: only students who answered correctly, 3 each per opening',async()=>{
  const {f,lesson:base}=await setup();
  const act={id:'dq',type:'numeric',prompt:'√12 化成最簡根式',form:'simplest-radical',answer:'2√3',explanation:'√12＝2√3'};
  const lesson={...base,id:'danmaku-lesson',slides:[{id:'s1',title:'化簡',body:'',activity:act}]};
  assert.equal((await f.call('/api/lessons/danmaku-lesson','PUT',{lesson})).status,200);
  const s=(await f.call('/api/sessions','POST',{lessonId:'danmaku-lesson',classId:'demo-class'})).body.session;
  const ctl=(body)=>f.call(`/api/sessions/${s.id}/control`,'POST',body);
  await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:2},'seat2');
  await ctl({action:'danmaku',value:true});
  const send=(who,text)=>{f.data.sessions[s.id].danmaku?.forEach(d=>{d.at-=5000;});return f.call(`/api/sessions/${s.id}/danmaku`,'POST',{text},who);};
  // 平常：不限則數
  for(let i=0;i<5;i++)assert.equal((await send('student',`平常 ${i}`)).status,200);
  assert.equal((await f.call(`/api/sessions/${s.id}`,'GET',null,'student')).body.danmakuQuota.limited,false);
  // 開放作答：還沒答、答錯都不能送；答對的人可以送 3 則
  await ctl({action:'activity',value:true});
  assert.equal((await send('student','還沒答')).status,403);
  await f.call(`/api/sessions/${s.id}/answers`,'POST',{submissionId:'r1',activityId:'dq',value:'2√3'},'student');
  await f.call(`/api/sessions/${s.id}/answers`,'POST',{submissionId:'w1',activityId:'dq',value:'√12'},'seat2');
  assert.equal((await send('seat2','答錯')).status,403,'wrong answer: no danmaku while the question is open');
  const quota=(await f.call(`/api/sessions/${s.id}`,'GET',null,'student')).body.danmakuQuota;
  assert.deepEqual(quota,{limited:true,eligible:true,left:3});
  for(let i=0;i<3;i++)assert.equal((await send('student',`答對 ${i}`)).body.left,2-i);
  assert.equal((await send('student','第 4 則')).status,429);
  // 結束作答：回到平常；下一次開放重新計算
  await ctl({action:'activity',value:false});
  assert.equal((await send('seat2','結束後')).status,200);
  await ctl({action:'activity',value:true});
  assert.equal((await send('student','新的一題')).status,200,'reset on the next opening (still answered correctly)');
});

test('danmaku: only while open, rate-limited, anonymous on screen but the teacher log keeps the seat',async()=>{
  const {f,session}=await setup();
  const send=(text,anon,who='student')=>f.call(`/api/sessions/${session.id}/danmaku`,'POST',{text,anon},who);
  assert.equal((await send('哈囉')).status,409,'closed by default');
  await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'danmaku',value:true});
  assert.equal((await send('懂了！')).status,200);
  assert.equal((await send('再一則')).status,429,'3-second rate limit');
  assert.equal((await send('x'.repeat(31))).status,400,'30 characters max');
  await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:5},'seat5');
  assert.equal((await send('我是 5 號',false,'seat5')).status,200);
  assert.equal((await f.call(`/api/sessions/${session.id}/danmaku`,'POST',{text:'老師'})).status,403,'teacher cannot post');
  const t=(await f.call(`/api/sessions/${session.id}`)).body;
  assert.deepEqual(t.danmaku.map(d=>[d.seat,d.text,d.anon]),[[1,'懂了！',true],[5,'我是 5 號',false]]);
  assert.equal((await f.call(`/api/sessions/${session.id}`,'GET',null,'student')).body.danmaku,undefined,'students never see the list or seats');
  const cleared=(await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'danmaku-clear'})).body;
  assert.deepEqual(cleared.danmaku,[]);assert.equal(typeof cleared.session.danmakuClearedAt,'number');
  await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'danmaku',value:false});
  assert.equal((await send('關了嗎',true,'seat5')).status,409);
});

test('handwriting OCR: students only, image format checked, result must parse as an answer (demo mock)',async()=>{
  const {f,session}=await setup();
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const ocr=(body,who='student')=>f.call(`/api/sessions/${session.id}/ocr`,'POST',body,who);
  assert.equal((await ocr({dataUrl:png,mockText:'-2√2/3'},'teacher')).status,403);
  assert.equal((await ocr({dataUrl:'data:text/html;base64,PGI+',mockText:'1'})).status,400);
  const ok=(await ocr({dataUrl:png,mockText:'−2√2/3'})).body;
  assert.deepEqual([ok.ok,ok.text],[true,'-2√2/3']);
  const bad=(await ocr({dataUrl:png,mockText:'2√?'})).body;
  assert.equal(bad.ok,false);assert.match(bad.message,/再寫一次/);
  assert.equal((await ocr({dataUrl:png,mockText:'x+1'})).body.ok,false,'letters are not answers');
});

test('photo work OCR: own photo only; confirmed transcript kept with the AI original; fast grading uses the text only',async()=>{
  const {f,lesson,session}=await setup();
  await openSlide(f,session,lesson,'error-canvas');
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const imageId=(await f.call(`/api/sessions/${session.id}/images`,'POST',{dataUrl:png},'student')).body.imageId;
  await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:6},'seat6');
  const ocr=(who,id=imageId)=>f.call(`/api/sessions/${session.id}/ocr-work`,'POST',{imageId:id,activityId:'error-canvas',mockText:'(2x+3)^2\n=4x^2+12x+9'},who);
  assert.equal((await ocr('seat6')).status,404,"cannot read someone else's photo");
  const r=(await ocr('student')).body;
  assert.equal(r.work,'(2x+3)^2\n=4x^2+12x+9');
  const value={imageId,source:'photo',work:'(2x+3)^2\n=4x^2+12x+9\n少了 2ab',ocr:r.work};
  const answer=(await f.call(`/api/sessions/${session.id}/answers`,'POST',{submissionId:'w1',activityId:'error-canvas',value},'student')).body.answer;
  const stored=(await f.call(`/api/sessions/${session.id}`)).body.answers.find(a=>a.id===answer.id).value;
  assert.deepEqual([stored.work,stored.ocr],[value.work,value.ocr]);
  const g=(await f.call('/api/ai','POST',{task:'grade',sessionId:session.id,answerId:answer.id,depth:'fast'})).body.grade;
  assert.equal(g.basis,'text');assert.equal(g.transcript,value.work);assert.equal(g.annotations.length,0);assert.equal(g.scores.length,1);assert.equal(g.max,3);assert(g.marks.length>=1,'fast grading marks the transcript');
});

test('fast grading marks: numbered lines for the model; marks must point at a real line and a real quote',()=>{
  const work='2√3 × 3√2\n\n= 6√5\n所以答案 6√5';
  assert.equal(numberedWork(work),'1| 2√3 × 3√2\n2| = 6√5\n3| 所以答案 6√5');
  const marks=parseMarks({marks:[
    {line:2,kind:'error',quote:'6√5',note:'根號內要相乘'},
    {line:3,kind:'error',quote:'6√7',note:'quote 不在這一行'},
    {line:1,kind:'ok'},
    {line:9,kind:'error',note:'行號超出範圍'},
    {line:1,kind:'missing',note:'少了 √3×√2＝√6'},
    'not an object',
  ]},work);
  assert.deepEqual(marks,[
    {line:2,kind:'error',quote:'6√5',note:'根號內要相乘'},
    {line:3,kind:'error',note:'quote 不在這一行'},
    {line:1,kind:'ok'},
    {line:1,kind:'missing',note:'少了 √3×√2＝√6'},
  ]);
  assert.deepEqual(parseMarks({},work),[]);
});

test('numeric photo work: AI-read final answers are judged like typed answers; photo needs an image',()=>{
  const a={id:'q',type:'numeric',prompt:'化簡',form:'simplest-radical',items:[{prompt:'√48÷√8',answer:'√6'},{prompt:'(√6/√3)÷√(2/3)',answer:'√3'},{prompt:'√45÷√5',answer:'3'}],photoWork:{items:[0,1]},rubric:{criteria:[]}};
  assert.deepEqual(judgePhotoFinals(a,['√6','√3']),{correct:true,itemsCorrect:[true,true,false]});
  const wrong=judgePhotoFinals(a,['√6','']);assert.equal(wrong.correct,false);assert.deepEqual(wrong.itemsCorrect,[true,false,false]);
  const unsimplified=judgePhotoFinals(a,['√6','3/√3']);assert.equal(unsimplified.correct,false);assert.match(unsimplified.note,/第 2 小題/);
  assert.deepEqual(validateAnswer(a,{imageId:'img1',work:'√6',source:'photo'}),{imageId:'img1',work:'√6',source:'photo'});
  assert.throws(()=>validateAnswer(a,{text:'沒有照片'}),/拍照/);
  assert.deepEqual(validateAnswer(a,['√6','√3','3']),['√6','√3','3']);
  assert.throws(()=>validateAnswer({...a,photoWork:undefined},{imageId:'img1'}));
});

test('AI calls work on Cloudflare: redirect is manual (never "error"), redirects are reported, provider reasons shown',async()=>{
  const original=globalThis.fetch,seen=[];
  const config={provider:'openai',baseUrl:'https://provider.example/v1',model:'gpt-6-luna',apiKey:'test-only-no-real-key',dailyLimit:10,source:'teacher'};
  try{
    globalThis.fetch=async(url,options)=>{seen.push(options);return Response.json({choices:[{message:{content:'正常'}}]});};
    assert.equal(await chat(config,'系統','測試'),'正常');
    assert.equal(seen[0].redirect,'manual','Cloudflare Workers reject redirect:"error"');
    globalThis.fetch=async()=>new Response(null,{status:302,headers:{Location:'https://elsewhere.example/'}});
    await assert.rejects(()=>chat(config,'系統','測試'),/轉址/);
    globalThis.fetch=async()=>Response.json({error:{message:'The model `gpt-x` does not exist (key sk-proj-abcdefghijk)'}},{status:404});
    await assert.rejects(()=>chat(config,'系統','測試'),(e)=>/找不到模型/.test(e.message)&&/does not exist/.test(e.message)&&!/abcdefghijk/.test(e.message));
  }finally{globalThis.fetch=original;}
});

test('records: every danmaku kept; CSV lists each attempt, original-question practice and danmaku; backup round-trips them',async()=>{
  const {f,lesson:base}=await setup();
  const act={id:'rq',type:'numeric',prompt:'√12 化成最簡根式',form:'simplest-radical',answer:'2√3',explanation:'√12＝2√3'};
  const lesson={...base,id:'record-lesson',slides:[{id:'s1',title:'化簡',body:'',activity:act}]};
  assert.equal((await f.call('/api/lessons/record-lesson','PUT',{lesson})).status,200);
  const s=(await f.call('/api/sessions','POST',{lessonId:'record-lesson',classId:'demo-class'})).body.session;
  const ctl=(body)=>f.call(`/api/sessions/${s.id}/control`,'POST',body);
  await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:2},'seat2');
  await ctl({action:'danmaku',value:true});
  for(let i=0;i<120;i++){f.data.sessions[s.id].danmaku?.forEach(d=>{d.at-=5000;});assert.equal((await f.call(`/api/sessions/${s.id}/danmaku`,'POST',{text:`第 ${i} 則`,anon:i%2===0},'student')).status,200);}
  await ctl({action:'activity',value:true});
  const answer=(who,id,value)=>f.call(`/api/sessions/${s.id}/answers`,'POST',{submissionId:id,activityId:'rq',value},who);
  await answer('seat2','w1','√12');await answer('seat2','w2','3');await answer('student','r1','2√3');
  await ctl({action:'activity',value:false});
  await ctl({action:'practice-start'});
  assert.equal((await f.call(`/api/sessions/${s.id}/practice`,'POST',{round:0,value:'2√3'},'seat2')).body.correct,true);
  assert.equal(f.data.sessions[s.id].danmaku.length,120,'all danmaku kept (no 100 cap)');
  const csv=new TextDecoder().decode((await f.call(`/api/sessions/${s.id}/export?format=csv`)).body);
  const rows=csv.replace(/^﻿/,'').split('\r\n').map(r=>r.split(',').map(c=>c.replace(/^"|"$/g,'')));
  assert.deepEqual(rows[0],['kind','seat','activityId','attempt','answer','correct','score','max','feedback','submittedAt']);
  const mine=rows.filter(r=>r[0]==='作答'&&r[1]==='2');
  assert.deepEqual(mine.map(r=>r[3]),['1','2'],'attempt counts each submission');
  assert(rows.some(r=>r[0]==='原題再做一次'&&r[1]==='2'&&r[3]==='1'&&r[5]==='Y'));
  assert.equal(rows.filter(r=>r[0]==='彈幕').length,120);
  const backup=(await f.call('/api/backup')).body;
  const bs=backup.sessions.find(x=>x.session.id===s.id);
  assert.equal(bs.danmaku.length,120);assert.equal(bs.practice.rq['2'].subs.length,1);
  // 還原到另一個環境：彈幕與練習紀錄都在
  const g=fixture();assert.equal((await g.call('/api/login','POST',TEACHER)).status,200);
  const r=await g.call('/api/restore','POST',{backup});
  assert.equal(r.status,200,JSON.stringify(r.body));
  const restored=g.data.sessions[s.id];
  assert.equal(restored.danmaku.length,120);assert.equal(restored.practice.rq['2'].subs[0].correct,true);
});

test('quiz scoring: more correct wins, ties go to the faster one; the computer follows its timetable',()=>{
  const s=(correct,timeMs,finished=true)=>({answered:10,correct,timeMs,finished});
  assert.equal(quizLib.decide(s(8,90000),s(7,30000)),'a');
  assert.equal(quizLib.decide(s(7,60000),s(7,50000)),'b');
  assert.equal(quizLib.decide(s(7,60000),s(7,60000)),'draw');
  const run={id:'r',mode:'pk',paper:{picks:[]},startedAt:1000,seconds:60};
  const bot={correct:[true,false,true],times:[5000,9000,14000]};
  assert.deepEqual(quizLib.botScore(bot,run,1000+9500),{answered:2,correct:1,finished:false,timeMs:null});
  assert.deepEqual(quizLib.botScore(bot,run,1000+20000),{answered:3,correct:2,finished:true,timeMs:14000});
});

test('formative quiz: one random paper for the class, answers hidden until the end; PK pairing, locking, winner, rematch, records',async()=>{
  const {f}=await setup();
  const bank={title:'測試題庫',slots:Array.from({length:10},(_,q)=>({id:`q${q+1}`,topic:`題位 ${q+1}`,variants:[0,1,2].map(v=>({stem:`第 ${q+1} 題（${v}）`,options:[`對${v}`,`錯A${v}`,`錯B${v}`,`錯C${v}`],answer:0,explanation:'解析'}))}))};
  const base=(await f.call('/api/dashboard')).body.lessons[0];
  const lesson={...base,id:'quiz-lesson',quiz:bank};
  assert.equal((await f.call('/api/lessons/quiz-lesson','PUT',{lesson})).status,200);
  const s=(await f.call('/api/sessions','POST',{lessonId:'quiz-lesson',classId:'demo-class'})).body.session;
  const ctl=(body)=>f.call(`/api/sessions/${s.id}/control`,'POST',body);
  for(const seat of [2,3,4])await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat},`seat${seat}`);
  await goOnline(f,[1,2,3,4,5]);
  const view=(who)=>f.call(`/api/sessions/${s.id}`,'GET',null,who).then(r=>r.body);
  const answer=(who,body)=>f.call(`/api/sessions/${s.id}/quiz`,'POST',body,who);
  // 全班測驗：同一份卷子；學生看不到題庫與答案
  await ctl({action:'quiz-class',seconds:600});
  const t1=await view('teacher'),st1=await view('student');
  assert.equal(st1.lesson.quiz,undefined,'the bank never reaches students');
  assert.equal(st1.quiz.questions.length,10);assert(st1.quiz.questions.every(q=>q.answer===undefined));
  assert.deepEqual(st1.quiz.questions.map(q=>q.stem),t1.quiz.questions.map(q=>q.stem),'same paper for everyone');
  const right=(v,q)=>v.quiz.questions[q].options.findIndex(o=>o.startsWith('對'));
  const runId=t1.quiz.run.id;
  for(let q=0;q<10;q++)await answer('student',{runId,q,choice:right(t1,q)});
  assert.equal((await answer('student',{runId,q:0,choice:(right(t1,0)+1)%4})).status,200,'class mode: can change before submitting');
  assert.equal((await answer('student',{runId,submit:true})).status,200);
  assert.equal((await answer('student',{runId,q:0,choice:0})).status,409,'locked after submitting');
  const t2=await view('teacher');
  assert.equal(t2.quiz.scores['1'].correct,9);assert.equal(t2.quiz.picks[1][right(t1,1)],1);
  await ctl({action:'quiz-end'});
  const st2=await view('student');assert.deepEqual(st2.quiz.mine.correct.filter(Boolean).length,9);assert(st2.quiz.questions.every(q=>q.answer!==undefined),'answers after the end');
  // 重新派題：重新抽一份
  await ctl({action:'quiz-class'});
  assert.notEqual((await view('teacher')).quiz.run.id,runId);
  // PK：點選＋點選、隨機（單數配電腦）、抽籤、搶答
  await ctl({action:'pk-lobby'});
  await ctl({action:'pk-pick',seat:1});await ctl({action:'pk-pick',seat:2});
  assert.deepEqual((await view('teacher')).session.pkLobby.pairs,[[1,2]]);
  await ctl({action:'pk-draw'});
  const waiting=(await view('teacher')).session.pkLobby.waiting;assert([3,4,5].includes(waiting));
  await ctl({action:'pk-buzz',value:true});
  const other=[3,4,5].find(n=>n!==waiting);
  assert.equal((await f.call(`/api/sessions/${s.id}/pk-buzz`,'POST',{},`seat${other}`)).body.paired,true);
  const lobby=(await view('teacher')).session.pkLobby;
  assert.equal(lobby.pairs.length,2);assert.equal(lobby.buzz,false,'buzz closes once a pair is made');
  await ctl({action:'pk-remove',index:1});
  await ctl({action:'pk-random'});
  const pairs=(await view('teacher')).session.pkLobby.pairs;
  assert.deepEqual(pairs.flat().sort((a,b)=>a-b),[0,1,2,3,4,5],'odd one out plays the computer');
  await ctl({action:'pk-start',seconds:120});
  const pk=await view('teacher');assert.equal(pk.quiz.run.mode,'pk');assert(pk.quiz.bot,'computer timetable for the odd pair');
  // 3 秒倒數後開始
  f.data.sessions[s.id].session.quiz.startedAt-=4000;
  const pkRun=pk.quiz.run.id;
  const r1=await answer('student',{runId:pkRun,q:0,choice:right(pk,0)});
  assert.equal(r1.body.correct,true);
  assert.equal((await answer('student',{runId:pkRun,q:0,choice:0})).status,409,'PK: an answer is final');
  const mine=(await view('student')).quiz;
  assert.equal(mine.questions[0].answer,right(pk,0),'PK: answered question shows the right option');assert.equal(mine.questions[1].answer,undefined);
  assert(mine.scores['1'].answered===1,'students see PK progress');
  for(let q=1;q<10;q++)await answer('student',{runId:pkRun,q,choice:right(pk,q)});
  assert.equal((await view('teacher')).quiz.scores['1'].finished,true);
  await ctl({action:'pk-again'});
  const again=await view('teacher');assert.notEqual(again.quiz.run.id,pkRun);assert.deepEqual(again.quiz.run.matches.map(m=>[m.a,m.b]),pk.quiz.run.matches.map(m=>[m.a,m.b]));
  // 紀錄：CSV 與備份
  const csv=new TextDecoder().decode((await f.call(`/api/sessions/${s.id}/export?format=csv`)).body);
  assert(csv.includes('"形成性評量"')&&csv.includes('"PK戰"'));
  const backup=(await f.call('/api/backup')).body;
  const bs=backup.sessions.find(x=>x.session.id===s.id);
  assert.equal(bs.quizRuns.length,4);
  const g=fixture();await g.call('/api/login','POST',TEACHER);
  const r=await g.call('/api/restore','POST',{backup});assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(g.data.sessions[s.id].quizRuns.length,4);
});
