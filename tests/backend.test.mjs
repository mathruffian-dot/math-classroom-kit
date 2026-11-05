import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const dir=await mkdtemp(join(tmpdir(),'classroom-backend-'));
// 回家作業題庫用測試用的小題庫（真的題庫還會改，不影響測試）
const homeworkFixture={name:'homework-fixture',setup(b){b.onResolve({filter:/homework\.generated\.json$/},()=>({path:resolve('tests/fixtures/homework.json')}));}};
await build({entryPoints:[resolve('worker/app.ts'),resolve('worker/storage.ts'),resolve('worker/index.ts'),resolve('worker/ai.ts'),resolve('worker/validation.ts'),resolve('shared/expr.ts'),resolve('shared/practice.ts'),resolve('shared/quiz.ts'),resolve('shared/raid.ts'),resolve('shared/make.ts'),resolve('shared/duel.ts'),resolve('shared/homework-step.ts'),resolve('worker/photos.ts'),resolve('worker/homework.ts')],outdir:dir,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},logLevel:'silent',plugins:[homeworkFixture]});
// 真的題庫（content/homework.generated.json，npm test 先跑 lessons 產生）：檢查魔王戰、步驟格鬥的題型對應
await build({entryPoints:[resolve('worker/homework.ts')],outdir:join(dir,'real'),bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},logLevel:'silent'});
const {handleApi,liveTicket,liveView,drainHomework}=await import(pathToFileURL(join(dir,'worker','app.mjs')).href);
const stepLib=await import(pathToFileURL(join(dir,'shared','homework-step.mjs')).href);
const hwLib=await import(pathToFileURL(join(dir,'worker','homework.mjs')).href);
const hwReal=await import(pathToFileURL(join(dir,'real','homework.mjs')).href);
const {SupabaseStore,DurableStore,SessionSplitStore,MAX_SNAPSHOT_BYTES}=await import(pathToFileURL(join(dir,'worker','storage.mjs')).href);
const {ClassroomDurableObject}=await import(pathToFileURL(join(dir,'worker','index.mjs')).href);
const {aggregateVotes,normalizeGrade,extractJson,isReasoning,numberedWork,parseMarks,chat}=await import(pathToFileURL(join(dir,'worker','ai.mjs')).href);
const {judgePhotoFinals,validateAnswer,validateActivity,validateLesson,validateRaidBank}=await import(pathToFileURL(join(dir,'worker','validation.mjs')).href);
const expr=await import(pathToFileURL(join(dir,'shared','expr.mjs')).href);
const {practiceStatus}=await import(pathToFileURL(join(dir,'shared','practice.mjs')).href);
const quizLib=await import(pathToFileURL(join(dir,'shared','quiz.mjs')).href);
const raidLib=await import(pathToFileURL(join(dir,'shared','raid.mjs')).href);
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

function fixture(env={APP_MODE:'demo'},assets,opts={}) {
  let data;const vaultMap=new Map();
  // opts.failPut(key, value)／opts.failWrite(state)：回傳 true 時這次 vault／主檔寫入失敗（故障注入）；opts.kick：模擬 Durable Object 的 alarm
  const vault={async get(k){const v=vaultMap.get(k);return v===undefined?undefined:structuredClone(v);},async put(k,v){if(opts.failPut?.(k,v))throw new Error('Injected vault failure');vaultMap.set(k,structuredClone(v));},async delete(k){return vaultMap.delete(k);}};
  const store={async read(){return data&&structuredClone(data);},async write(next){if(opts.failWrite?.(next))throw new Error('Injected store failure');data=structuredClone(next);}};
  const cookies=new Map();
  return {
    get data(){return data;},vaultMap,env,store,vault,cookie(user){return cookies.get(user);},
    async call(path,method='GET',body,user='teacher',origin='http://localhost',extra={}) {
      const headers={'Origin':origin,...extra};
      if(cookies.has(user))headers.Cookie=cookies.get(user);
      if(method!=='GET')headers['Content-Type']='application/json';
      const response=await handleApi(new Request(`http://localhost${path}`,{method,headers,body:method!=='GET'?JSON.stringify(body??{}):undefined}),{store,env,vault,assets,...(opts.kick?{kickHomework:opts.kick}:{})});
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

test('YouTube videos on a slide: 11-character id, title required, vertical/start kept',async()=>{
  const real=JSON.parse((await import('node:fs')).readFileSync(resolve('content/lessons/g8-2-3a.json'),'utf8'));
  const first=real.slides.find(s=>!s.videos);delete first.activity;
  const base={...real,slides:[first]};
  const ok=validateLesson({...base,slides:[{...base.slides[0],videos:[{youtube:'XkDKOFpIYDk',title:'影片',vertical:true,start:5}]}]});
  assert.deepEqual(ok.slides[0].videos,[{youtube:'XkDKOFpIYDk',title:'影片',vertical:true,start:5}]);
  for(const videos of [[{youtube:'https://youtu.be/XkDKOFpIYDk',title:'x'}],[{youtube:'XkDKOFpIYD"',title:'x'}],[{youtube:'XkDKOFpIYDk'}],[],{}])
    assert.throws(()=>validateLesson({...base,slides:[{...base.slides[0],videos}]}));
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

test('deleting a class: teacher-only, needs withRecords when it has sessions, removes sessions, photos and logins',async()=>{
  const {f,session}=await setup();
  const cl=session.classId;
  f.vaultMap.set('blob:img1','x');f.data.images={img1:{sessionId:session.id}};
  assert.equal((await f.call(`/api/classes/${cl}`,'DELETE',undefined,'student')).status,403);
  assert.equal((await f.call(`/api/classes/${cl}`,'DELETE')).status,409);
  assert.ok((await f.call('/api/dashboard')).body.classes.some(c=>c.id===cl));
  assert.equal((await f.call(`/api/classes/${cl}`,'DELETE',{withRecords:true})).status,200);
  const d=(await f.call('/api/dashboard')).body;
  assert.ok(!d.classes.some(c=>c.id===cl));assert.ok(!d.sessions.some(s=>s.classId===cl));
  assert.ok(!f.vaultMap.has('blob:img1'));assert.ok(!f.data.images.img1);
  assert.equal((await f.call('/api/me','GET',null,'student')).body.user,null);
  const empty=(await f.call('/api/classes','POST',{name:'空班',seats:2})).body.classroom;
  assert.equal((await f.call(`/api/classes/${empty.id}`,'DELETE')).status,200);
  assert.equal((await f.call(`/api/classes/${empty.id}`,'DELETE')).status,404);
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

test('sub-item answers and tolerances stay on the server until results are shown on that slide',async()=>{
  const {f,lesson}=await setup();
  const q=(id,a,b,tol)=>({id,type:'numeric',prompt:'計算',unit:'公分',tolerance:tol,explanation:`解析${id}`,items:[{prompt:`${id}甲`,answer:a,tolerance:0.0137},{prompt:`${id}乙`,answer:b}]});
  const custom={...lesson,id:'items-leak',slides:[{id:'s1',title:'第一頁',body:'',activity:q('leak-q1','5417.25','7193.75',0.0271)},{id:'s2',title:'第二頁',body:'',activity:q('leak-q2','6271.5','8317.5',0.0313)}]};
  assert.equal((await f.call('/api/lessons/items-leak','PUT',{lesson:custom})).status,200);
  const s=(await f.call('/api/sessions','POST',{lessonId:'items-leak',classId:'demo-class'})).body.session;
  const SECRET1=['5417.25','7193.75','0.0137','0.0271','解析leak-q1'],SECRET2=['6271.5','8317.5','0.0313','解析leak-q2'];
  const student=async()=>{
    const view=(await f.call(`/api/sessions/${s.id}`,'GET',null,'student')).body,live=(await f.call('/api/student/session','GET',null,'student')).body;
    assert.deepEqual(live.lesson.slides,view.lesson.slides,'both student routes send the same lesson');
    return view;
  };
  const absent=(view,words)=>{const text=JSON.stringify(view);for(const w of words)assert(!text.includes(w),`student view leaks ${w}`);};
  await f.call(`/api/sessions/${s.id}/control`,'POST',{action:'activity',value:true});
  // 公布前：兩頁都看不到答案，作答需要的題目與單位還在
  let v=await student();
  absent(v,[...SECRET1,...SECRET2]);
  const a=v.lesson.slides[0].activity;
  assert.deepEqual(a.items,[{prompt:'leak-q1甲'},{prompt:'leak-q1乙'}]);assert.equal(a.unit,'公分');assert.equal(a.prompt,'計算');
  // 公布後：只有當頁拿得到
  await f.call(`/api/sessions/${s.id}/control`,'POST',{action:'results',value:true});
  v=await student();
  assert.deepEqual(v.lesson.slides[0].activity.items,custom.slides[0].activity.items);assert.equal(v.lesson.slides[0].activity.tolerance,0.0271);
  absent(v,SECRET2);
  // 換頁後公布自動收回，上一頁的答案也不再送出
  await f.call(`/api/sessions/${s.id}/control`,'POST',{action:'slide',index:1});
  absent(await student(),[...SECRET1,...SECRET2]);
  // 老師端一直拿得到
  const t=(await f.call(`/api/sessions/${s.id}`)).body;
  assert.deepEqual(t.lesson.slides.map(x=>x.activity.items),custom.slides.map(x=>x.activity.items));assert.equal(t.session.resultsVisible,false);
  // 判對仍在伺服器端進行：學生拿不到答案也能作答、判定
  await f.call(`/api/sessions/${s.id}/control`,'POST',{action:'activity',value:true});
  assert.equal((await f.call(`/api/sessions/${s.id}/answers`,'POST',{submissionId:'leak-1',activityId:'leak-q2',value:['6271.5','1']},'student')).status,200);
  assert.deepEqual((await f.call(`/api/sessions/${s.id}`)).body.answers[0].itemsCorrect,[true,false]);
});

test('every project lesson with sub-items sends students only the sub-item prompts before results',async()=>{
  const f=fixture();assert.equal((await f.call('/api/login','POST',TEACHER)).status,200);
  const {lessons,classes}=(await f.call('/api/dashboard')).body;
  await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat:1,code:'DEMO01'},'student');
  const withItems=lessons.filter(l=>l.slides.some(x=>x.activity?.items));
  assert(withItems.length>0);
  for(const l of withItems){
    const s=(await f.call('/api/sessions','POST',{lessonId:l.id,classId:classes[0].id})).body.session;
    const v=(await f.call(`/api/sessions/${s.id}`,'GET',null,'student')).body;
    for(const x of v.lesson.slides)for(const it of x.activity?.items||[])assert.deepEqual(Object.keys(it),['prompt'],`${l.id}/${x.id}`);
    await f.call(`/api/sessions/${s.id}`,'DELETE');
  }
});

test('quiz banks, papers and option orders never reach students on any route; results and teacher data still arrive',async()=>{
  const {f,session:first}=await setup();
  await f.call(`/api/sessions/${first.id}/control`,'POST',{action:'end'});
  const mk=(id,name)=>({title:`${name}題庫`,slots:Array.from({length:10},(_,q)=>({id:`${id}${q+1}`,topic:`${name} 題位 ${q+1}`,variants:[0,1,2].map(v=>({stem:`${name}題幹 ${q+1}（${v}）`,options:[`對${v}`,`錯A${v}`,`錯B${v}`,`錯C${v}`],answer:0,explanation:`${name}解析 ${q+1}（${v}）`}))}))});
  const base=(await f.call('/api/dashboard')).body.lessons[0];
  assert.equal((await f.call('/api/lessons/leak-a','PUT',{lesson:{...base,id:'leak-a',title:'第一課',quiz:mk('a','甲')}})).status,200);
  assert.equal((await f.call('/api/lessons/leak-b','PUT',{lesson:{...base,id:'leak-b',title:'第二課',quiz:mk('b','乙')}})).status,200);
  await goOnline(f,[1,2,3]);
  const SERVER_ONLY=new Set(['bank','paper','personal','picks','order','variants','slots','detail']);
  const RUN_KEYS=new Set(['id','mode','from','startedAt','seconds','endedAt','matches']);
  const keysOf=(x,out=[])=>{if(x&&typeof x==='object')for(const [k,v] of Object.entries(x)){out.push(k);keysOf(v,out);}return out;};
  // 同一位學生的三種 payload：課堂 GET、學生 GET、WebSocket 投影
  const payloads=async(sid,who)=>{
    const ticket=await liveTicket(new Request('http://localhost/api/live',{headers:{Cookie:f.cookie(who),Origin:'http://localhost'}}),f.data);
    const list=[(await f.call(`/api/sessions/${sid}`,'GET',null,who)).body,(await f.call('/api/student/session','GET',null,who)).body,JSON.parse(JSON.stringify(liveView(f.data,ticket)))];
    assert.equal(new Set(list.map(v=>v.quiz.run.id)).size,1,'all three show the same run');
    return list;
  };
  // revealed：這位學生應該已經看得到解析的題數
  const clean=async(sid,who,revealed)=>{
    const list=await payloads(sid,who);
    for(const v of list){
      assert.equal(v.lesson.quiz,undefined);
      const {slides:_slides,...lessonRest}=v.lesson;
      const leaked=keysOf({...v,lesson:lessonRest}).filter(k=>SERVER_ONLY.has(k));
      assert.deepEqual(leaked,[],'server-only fields in a student payload');
      for(const run of [v.session.quiz,v.quiz.run])for(const k of Object.keys(run))assert(RUN_KEYS.has(k),`unexpected run field ${k}`);
      const text=JSON.stringify(v);
      assert.equal(text.split('題幹').length-1,v.quiz.questions.length,'only the stems on this paper');
      assert.equal(text.split('解析 ').length-1,revealed,'only revealed explanations');
      assert.equal(v.quiz.questions.filter(q=>q.answer!==undefined).length,revealed);
    }
    return list[0];
  };
  const right=(v,q)=>v.quiz.questions[q].options.findIndex(o=>o.startsWith('對'));
  const a=(await f.call('/api/sessions','POST',{lessonId:'leak-a',classId:'demo-class'})).body.session;
  const ctlA=(body)=>f.call(`/api/sessions/${a.id}/control`,'POST',body);
  const viewA=(who='teacher')=>f.call(`/api/sessions/${a.id}`,'GET',null,who).then(r=>r.body);
  const ansA=(who,body)=>f.call(`/api/sessions/${a.id}/quiz`,'POST',body,who);
  // 全班測驗：學生看不到答案，仍看得到洗牌後的選項；用顯示位置作答，伺服器換算
  await ctlA({action:'quiz-class',seconds:600});
  let t=await viewA();
  const shown=await clean(a.id,'seat1',0);
  assert.deepEqual(shown.quiz.questions.map(q=>q.options),t.quiz.questions.map(q=>q.options),'same shuffled options as the teacher');
  const runA=t.quiz.run.id;
  for(let q=0;q<10;q++)assert.equal((await ansA('seat1',{runId:runA,q,choice:q===9?(right(t,q)+1)%4:right(t,q)})).status,200);
  const during=await clean(a.id,'seat1',0);
  assert.deepEqual(during.quiz.mine.answers,t.quiz.questions.map((_,q)=>q===9?(right(t,q)+1)%4:right(t,q)),'student sees their own picks in display order');
  assert(during.quiz.mine.correct.every(x=>x===null));
  // 老師：卷子、選項分布、每人對錯都在；題庫不用送
  t=await viewA();
  assert.equal(t.session.quiz.paper.picks.length,10);assert.equal(t.quiz.run.paper.picks.length,10);assert.equal(t.quiz.scores['1'].correct,9);assert.equal(t.quiz.picks[1][right(t,1)],1);assert.equal(t.quiz.detail['1'].filter(Boolean).length,9);
  assert(t.quiz.questions.every(q=>q.answer!==undefined&&q.explanation));
  // 結束後學生看得到正解位置、解析、自己的對錯，但對應表仍不送
  await ctlA({action:'quiz-end'});
  const ended=await clean(a.id,'seat1',10);
  assert.deepEqual(ended.quiz.questions.map(q=>q.answer),t.quiz.questions.map(q=>q.answer));
  assert.equal(ended.quiz.mine.correct.filter(Boolean).length,9);
  // PK：答過的題馬上回正解位置；沒答的不給；對手與觀眾看不到
  await ctlA({action:'pk-lobby'});await ctlA({action:'pk-pick',seat:1});await ctlA({action:'pk-pick',seat:2});
  await ctlA({action:'pk-start',seconds:120});
  f.data.sessions[a.id].session.quiz.startedAt-=4000;
  const pk=await viewA();
  await clean(a.id,'seat1',0);
  const r=await ansA('seat1',{runId:pk.quiz.run.id,q:0,choice:right(pk,0)});
  assert.equal(r.body.correct,true);assert.equal(r.body.answer,right(pk,0));assert(r.body.explanation);
  const afterOne=await clean(a.id,'seat1',1);
  assert.equal(afterOne.quiz.questions[0].answer,right(pk,0));assert.equal(afterOne.quiz.mine.correct[0],true);
  assert.deepEqual(afterOne.quiz.run.matches.map(m=>[m.a,m.b]),[[1,2]],'students still see the pairing');
  assert.equal(afterOne.quiz.scores['1'].correct,1);
  await clean(a.id,'seat2',0);await clean(a.id,'seat3',0);
  // 錯題練習：只拿到自己的題，老師看得到每人的卷子
  await ctlA({action:'quiz-review'});
  const rv=await viewA();
  assert.deepEqual(rv.quiz.run.personal['1'].slots,[9]);assert.deepEqual(rv.session.quiz.personal['1'].slots,[9]);
  const review=await clean(a.id,'seat1',0);
  assert.deepEqual(review.quiz.questions.map(q=>q.slot),[9]);
  const rr=await ansA('seat1',{runId:rv.quiz.run.id,q:9,choice:right(review,0)});
  assert.equal(rr.body.correct,true);
  assert.equal((await clean(a.id,'seat1',1)).quiz.mine.correct[0],true);
  await ctlA({action:'quiz-end'});
  await ctlA({action:'quiz-class',seconds:600});
  const c2=await viewA();
  for(const seat of [1,2,3])for(let q=0;q<10;q++)await ansA(`seat${seat}`,{runId:c2.quiz.run.id,q,choice:(right(c2,q)+1)%4});
  await ctlA({action:'quiz-end'});
  await ctlA({action:'end'});
  // 間隔複習：題庫存在這一次裡，師生都不送，學生三條路徑都沒有
  const b=(await f.call('/api/sessions','POST',{lessonId:'leak-b',classId:'demo-class'})).body.session;
  await f.call(`/api/sessions/${b.id}/control`,'POST',{action:'quiz-spaced'});
  assert(f.data.sessions[b.id].session.quiz.bank,'the bank stays on the server');
  const spacedT=(await f.call(`/api/sessions/${b.id}`)).body;
  assert.equal(spacedT.session.quiz.bank,undefined);assert.equal(spacedT.quiz.run.bank,undefined);assert(spacedT.quiz.questions[0].answer!==undefined);
  const sp=await clean(b.id,'seat1',0);
  assert.equal(sp.session.quiz.mode,'spaced');assert.equal(sp.session.quiz.from,'第一課');
  const sr=await f.call(`/api/sessions/${b.id}/quiz`,'POST',{runId:sp.quiz.run.id,q:0,choice:right(sp,0)},'seat1');
  assert.equal(sr.body.correct,true);
  assert.equal((await clean(b.id,'seat1',1)).quiz.mine.correct[0],true);
});

test('first submission, retry and session view share one rule: no verdict before results on that slide',async()=>{
  const {f,lesson}=await setup();
  const q={id:'retry-q',type:'numeric',prompt:'化成最簡根式',form:'simplest-radical',items:[{prompt:'√12',answer:'2√3'},{prompt:'√18',answer:'3√2'}]};
  const custom={...lesson,id:'retry-lesson',slides:[{id:'s1',title:'化簡',body:'',activity:q},{id:'s2',title:'下一頁',body:'',activity:{...q,id:'retry-q2'}}]};
  assert.equal((await f.call('/api/lessons/retry-lesson','PUT',{lesson:custom})).status,200);
  const s=(await f.call('/api/sessions','POST',{lessonId:'retry-lesson',classId:'demo-class'})).body.session;
  const ctl=(body)=>f.call(`/api/sessions/${s.id}/control`,'POST',body);
  const send=()=>f.call(`/api/sessions/${s.id}/answers`,'POST',{submissionId:'retry-1',activityId:'retry-q',value:['√12','3√2']},'student');
  const VERDICT=['correct','itemsCorrect','note'];
  const hidden=(answer)=>{assert.equal(answer.activityId,'retry-q');assert.deepEqual(answer.value,['√12','3√2']);for(const k of VERDICT)assert(!(k in answer),`${k} leaked`);};
  await ctl({action:'activity',value:true});
  const r1=await send();assert.equal(r1.status,200);hidden(r1.body.answer);
  const r2=await send();assert.equal(r2.status,200);hidden(r2.body.answer);
  assert.equal((await f.call(`/api/sessions/${s.id}/answers`,'POST',{submissionId:'retry-1',activityId:'retry-q',value:['1','2']},'student')).status,409,'a retry cannot change the content');
  hidden((await f.call(`/api/sessions/${s.id}`,'GET',null,'student')).body.answers[0]);
  // 老師一直看得到判定
  const t=(await f.call(`/api/sessions/${s.id}`)).body.answers[0];
  assert.deepEqual(t.itemsCorrect,[false,true]);assert.equal(t.correct,false);assert.match(t.note,/最簡根式/);
  // 公布後：重送與畫面都拿得到自己的判定
  await ctl({action:'results',value:true});
  for(const answer of [(await send()).body.answer,(await f.call(`/api/sessions/${s.id}`,'GET',null,'student')).body.answers[0]]){
    assert.deepEqual(answer.itemsCorrect,[false,true]);assert.equal(answer.correct,false);assert.match(answer.note,/最簡根式/);
  }
  // 換頁後收回：重送與畫面都不再回傳
  await ctl({action:'slide',index:1});
  hidden((await send()).body.answer);
  hidden((await f.call(`/api/sessions/${s.id}`,'GET',null,'student')).body.answers[0]);
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
  const ended=await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'end'});
  assert.deepEqual(liveView(f.data,tStudent),{session:null},'students return to the waiting room when class ends');
  const endedAt=ended.body.session.endedAt;
  const again=await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'end'});
  assert.equal(again.status,200,'ending twice (lost response on a flaky network) is not an error');
  assert.equal(again.body.session.endedAt,endedAt,'the first end time is kept');
  assert.equal((await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'slide',index:0})).status,409);
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

test('raid rules: banked shields block the boss and name the seats, boss moves, combo ultimates, recall-only resistance',()=>{
  const c={...raidLib.raidConfig('normal',20,480),bossAtkEvery:5000,bossShieldEvery:999999};
  const S=480;
  // 普通攻擊：25 人以上每 3 秒、人少最慢 5 秒一次；英雄血量是 2000 刻度；每下扣的防護罩和頻率成反比
  const c25=raidLib.raidConfig('normal',25,480);
  assert.equal(c25.bossAtkEvery,3000);assert.equal(c25.teamHp,2000);assert.equal(c25.atkShieldPct,50);assert.equal(c25.hpScale,10);
  const c8=raidLib.raidConfig('normal',8,480);
  assert.equal(c8.bossAtkEvery,5000);assert(c8.atkShieldPct<50&&c8.bossAtk<c25.bossAtk,'small class: slower and lighter hits');
  const move=raidLib.bossAttackAt(5000);
  assert.equal(move.id,'charge');
  // 3 號、7 號各存 1 秒防護罩（存量不會倒數），魔王 5 秒時衝撞（現在 1 秒就能擋下）：自動扣存量擋下
  const two=[{t:1500,seat:3,kind:'shield',ok:true},{t:2200,seat:7,kind:'shield',ok:true}];
  const s=raidLib.raidReplay(c,two,S,5000);
  const hit=s.log.find(e=>e.k==='bossBlock'||e.k==='bossAtk');
  assert.equal(hit.move,move.id);
  assert.equal(hit.k,'bossBlock');assert.deepEqual(hit.seats,[3]);assert.equal(raidLib.shieldMs(s),1000,'one second left');
  assert.equal(s.stats['3'].blocks,1);
  // 沒有防護罩：依招式扣英雄血
  const bare=raidLib.raidReplay(c,[],S,5000);
  assert.equal(bare.teamHp,c.teamHp-Math.round(c.bossAtk*move.mult)*move.hits);
  // 存量不夠：擋掉一部分（舊規則的紀錄：衝撞要 2 秒，只有 1 秒就擋一半；舊紀錄照舊規則重算）
  const old={...c,atkShieldPct:undefined,hpScale:undefined};
  const charge=raidLib.BOSS_ATTACKS.find(m=>m.id==='charge');
  let tc=1000;while(raidLib.bossAttackAt(tc).id!=='charge')tc+=1000;
  const half=raidLib.raidReplay({...old,bossAtkEvery:tc},[{t:500,seat:4,kind:'shield',ok:true}],S,tc);
  const h=half.log.find(e=>e.k==='bossAtk');
  assert.equal(h.blocked,1000);assert.equal(h.n,Math.round(Math.round(c.bossAtk*charge.mult)*0.5));
  // 魔王大招：預告時就知道是哪一招；存滿 3 秒完全擋下
  const calm=raidLib.raidReplay(c,[],S,c.bossChargeMs+1);
  const warn=calm.log.find(e=>e.k==='bossWarn');
  assert(raidLib.BOSS_ULTS.some(m=>m.id===warn.move));
  const guard=Array.from({length:3},(_,i)=>({t:c.bossChargeMs+1000+i*100,seat:10+i,kind:'shield',ok:true}));
  const blocked=raidLib.raidReplay({...c,bossAtkEvery:9e9},guard,S,c.bossChargeMs+c.bossWarnMs+1);
  if(warn.move!=='break')assert(blocked.log.some(e=>e.k==='bossUltBlock'),'3 seconds of shield block the ultimate');
  // 答錯：魔王提早預告大招（應用題答錯只加一半）
  const angry=raidLib.raidReplay(c,Array.from({length:10},(_,i)=>({t:1000+i,seat:1,kind:'attack',ok:false})),S,60000);
  assert(angry.log.some(e=>e.k==='bossWarn'&&e.t<c.bossChargeMs));
  const wrong=(kind)=>raidLib.raidReplay(c,Array.from({length:10},(_,i)=>({t:1000+i,seat:1,kind,ok:false})),S,2000).chargeBonus;
  assert.equal(wrong('attack'),10*c.wrongChargeMs);assert.equal(wrong('ultimate'),10*Math.round(c.wrongChargeMs/2));
  // 大招：4 題應用題答對才發動，寫出參與的座號，合擊加成（3 人 ×1.2），無視魔王護甲
  const acts=[2,5,2,9].map((seat,i)=>({t:1000+i*100,seat,kind:'ultimate',ok:true}));
  const u=raidLib.raidReplay({...c,bossShieldEvery:500,bossShieldGain:50,bossShieldMax:50},acts,S,1400);
  const ult=u.log.find(e=>e.k==='ult');
  assert.deepEqual(ult.seats.sort((a,b)=>a-b),[2,5,9]);
  assert.equal(ult.team,3);assert.equal(ult.combo,1.2);assert.equal(u.bossHp,c.bossHp-Math.round(c.ultDamage*1.2));
  assert.equal(raidLib.raidCombo(1),1);assert.equal(raidLib.raidCombo(30),2);
  // 普通攻擊先打魔王護甲
  const a=raidLib.raidReplay({...c,bossShieldEvery:500,bossShieldGain:6,bossShieldMax:6},[{t:600,seat:1,kind:'attack',ok:true}],S,600);
  assert.equal(a.bossHp,c.bossHp-(c.heroAtk-6));
  // 全班只做記憶題：魔王適應，普通攻擊效果變差；應用題不會被適應
  const spam=Array.from({length:12},(_,i)=>({t:1000+i*500,seat:1+i,kind:'attack',ok:true}));
  const r=raidLib.raidReplay({...c,bossShieldEvery:9e9},spam,S,8000);
  assert(raidLib.raidEffect(r,'attack',8000,c.players)<1);
  assert.equal(raidLib.raidEffect(r,'ultimate',8000,c.players),1);
  // 分出勝負
  const win=raidLib.raidReplay({...c,bossHp:24},[{t:100,seat:4,kind:'attack',ok:true},{t:200,seat:6,kind:'attack',ok:true},{t:300,seat:4,kind:'attack',ok:true}],S,400);
  assert.equal(win.result,'win');assert(win.stats['6'].lastHit);assert.equal(win.stats['4'].n.attack,1,'after the win nothing counts');
  // 連對保護：連對 2 題以上，第一次答錯不中斷（每場一次）；贖回：答錯後同類型答對，拿回一半分數
  const seq=[true,true,false,true,false].map((ok,i)=>({t:1000+i*100,seat:8,kind:'shield',ok}));
  const sv=raidLib.raidReplay(c,seq,S,1500).stats['8'];
  assert.equal(sv.saved,true);assert.equal(sv.streak,0,'second wrong breaks the streak');assert.equal(sv.best,3,'the first wrong was forgiven');
  assert.equal(sv.redeemed,1);
  // 職業被動技能：弓箭手的普通攻擊 +30%、劍士的防護罩多 0.5 秒、法師的大招計量多 5%
  const arch=raidLib.raidReplay({...c,bossShieldEvery:9e9},[{t:500,seat:1,kind:'attack',ok:true,role:'archer'}],S,600);
  assert.equal(c.bossHp-arch.bossHp,Math.round(c.heroAtk*1.3));
  assert.equal(raidLib.shieldMs(raidLib.raidReplay(c,[{t:500,seat:1,kind:'shield',ok:true,role:'knight'}],S,600)),1500);
  assert.equal(raidLib.raidReplay(c,[{t:500,seat:1,kind:'ultimate',ok:true,role:'mage'}],S,600).ult,c.ultGain+5);
  // 稱號：9 級，沒作答沒有稱號
  assert.equal(raidLib.RAID_TITLES.length,9);
  assert.equal(raidLib.raidLevel(undefined,5),0);
  assert.equal(raidLib.raidLevel({...win.stats['6'],score:400},5),9);
});

test('raid flow: start on the last lesson of 2-2, roles, free choice each question, lock after a wrong answer, titles; records in CSV and backup',async()=>{
  const {f}=await setup();
  const s=(await f.call('/api/sessions','POST',{lessonId:'g8-2-2d',classId:'demo-class'})).body.session;
  const lesson=(await f.call(`/api/sessions/${s.id}`)).body.lesson;
  assert(lesson.slides.at(-1).raidPage,'last page is the boss battle');
  assert.deepEqual((await f.call(`/api/sessions/${s.id}`)).body.raidMap.wins,{},'adventure map for the teacher');
  assert(lesson.slides.at(-2).quizPage);
  await goOnline(f,[1,2,3,4]);
  const ctl=(body)=>f.call(`/api/sessions/${s.id}/control`,'POST',body);
  assert.equal((await ctl({action:'raid-start',difficulty:'easy',seconds:300})).status,200);
  const t0=await f.call(`/api/sessions/${s.id}`);
  const run=t0.body.raid.run;
  assert.equal(run.difficulty,'easy');assert(run.config.players>=1);
  const raid=(who,body)=>f.call(`/api/sessions/${s.id}/raid`,'POST',{runId:run.id,...body},who);
  assert.equal((await raid('seat2',{op:'draw',kind:'attack'})).status,409,'pick a hero first');
  assert.equal((await raid('seat2',{op:'role',role:'mage'})).status,200);
  assert.equal((await raid('seat2',{op:'goal',goal:3})).body.goal,3,'goal can be set during the countdown');
  assert.equal((await raid('seat2',{op:'draw',kind:'attack'})).status,409,'countdown');
  f.data.sessions[s.id].session.raid.startedAt-=4000;
  const q1=(await raid('seat2',{op:'draw',kind:'shield'})).body.question;
  assert.equal(q1.kind,'shield');assert.equal(q1.options.length,4);assert.equal(q1.answer,undefined,'no answer before answering');
  // 同一類再按一次：同一題（不能一直換題找簡單的）；換類型：換題
  assert.equal((await raid('seat2',{op:'draw',kind:'shield'})).body.question.id,q1.id);
  const q2=(await raid('seat2',{op:'draw',kind:'attack'})).body.question;
  assert.equal(q2.kind,'attack');
  // 從題庫找正解的位置
  const {readFile}=await import('node:fs/promises');
  const bank=JSON.parse(await readFile('content/raids/g8-2-2d.json','utf8'));
  const right=(q)=>{const it=bank.pools[q.kind].find(x=>x.id===q.id);return q.options.indexOf(it.options[it.answer]);};
  const ok=(await raid('seat2',{op:'answer',choice:right(q2)})).body;
  assert.equal(ok.correct,true);
  await raid('seat3',{op:'role',role:'knight'});
  const q3=(await raid('seat3',{op:'draw',kind:'attack'})).body.question;
  const bad=(await raid('seat3',{op:'answer',choice:(right(q3)+1)%4})).body;
  assert.equal(bad.correct,false);assert(bad.lockUntil>Date.now());assert.equal(typeof bad.answer,'number');
  assert.equal((await raid('seat3',{op:'draw',kind:'attack'})).status,409,'locked for 5 seconds');
  // 應用題：不會做可以換一題（不算答錯、每 30 秒一次）；答錯只鎖 3 秒；大螢幕看得到誰正在算
  await raid('seat4',{op:'role',role:'archer'});
  const u1=(await raid('seat4',{op:'draw',kind:'ultimate'})).body.question;
  assert((await f.call(`/api/sessions/${s.id}`)).body.raid.charging.includes(4));
  const sk=(await raid('seat4',{op:'skip'})).body;
  assert.notEqual(sk.question.id,u1.id);assert.equal(sk.question.kind,'ultimate');
  assert.equal((await raid('seat4',{op:'skip'})).status,429,'one skip per 30 seconds');
  const u2=(await raid('seat4',{op:'answer',choice:(right(sk.question)+1)%4})).body;
  assert(u2.lockUntil-Date.now()<=3100&&u2.lockUntil-Date.now()>2000,'3-second lock for application');
  assert.equal(f.data.sessions[s.id].raidPlay[run.id].seats['4'].skips,1);
  // 學生看不到別人的成績與角色；老師看得到
  const st=(await f.call(`/api/sessions/${s.id}`,'GET',null,'seat3')).body.raid;
  assert.deepEqual(Object.keys(st.state.stats),['3']);assert.equal(st.roles['2'],'mage','roles drive the animations on every screen');assert.equal(st.mine.role,'knight');
  const tv=(await f.call(`/api/sessions/${s.id}`)).body.raid;
  assert.equal(tv.roles['2'],'mage');assert(tv.state.log.some(e=>e.k==='atk'&&e.seat===2));
  assert.equal(JSON.stringify(st).includes('"answer"'),false,'no answers in the student view');
  // 結束：老師拿到全班稱號，學生只拿到自己的
  await ctl({action:'raid-end'});
  const done=(await f.call(`/api/sessions/${s.id}`)).body.raid;
  assert.deepEqual(done.results.map(r=>r.seat).sort(),[2,3,4]);
  assert(done.results.every(r=>r.level>=1&&r.title));
  const mine=(await f.call(`/api/sessions/${s.id}`,'GET',null,'seat2')).body.raid.results;
  assert.deepEqual(mine.map(r=>r.seat),[2]);
  assert.equal((await raid('seat2',{op:'draw',kind:'attack'})).status,409,'battle over');
  assert.equal(done.results.find(r=>r.seat===2).goal,3);assert(done.results.find(r=>r.seat===2).correct>=1);
  // 再戰一場：角色留著；上一場答對的題數變成個人最佳
  await ctl({action:'raid-start',difficulty:'hard',seconds:600});
  const again=(await f.call(`/api/sessions/${s.id}`,'GET',null,'seat2')).body.raid;
  const raid2=(who,body)=>f.call(`/api/sessions/${s.id}/raid`,'POST',{runId:again.run.id,...body},who);
  assert.notEqual(again.run.id,run.id);assert.equal(again.mine.role,'mage');
  assert.equal(again.mine.prevBest,1,'personal best carried into the next battle');
  assert.equal(f.data.classes['demo-class'].raidBest['2'],1);
  // 打倒魔王：記進冒險地圖（難度＋最快時間）
  // （困難魔王有護盾；這裡只測冒險地圖的紀錄，把護盾拿掉）
  f.data.sessions[s.id].session.raid.config.bossHp=5;f.data.sessions[s.id].raidRuns.at(-1).config.bossHp=5;
  delete f.data.sessions[s.id].session.raid.config.phase;delete f.data.sessions[s.id].raidRuns.at(-1).config.phase;
  f.data.sessions[s.id].session.raid.startedAt-=4000;
  const q9=(await raid2('seat2',{op:'draw',kind:'attack'})).body.question;
  await raid2('seat2',{op:'answer',choice:right(q9)});
  await ctl({action:'raid-close'});
  assert(f.data.classes['demo-class'].raidWins['g8-2-2d'].hard.ms>0);
  // CSV、備份與還原
  const csv=new TextDecoder().decode((await f.call(`/api/sessions/${s.id}/export?format=csv`)).body);
  assert(csv.includes('魔王戰'));assert(csv.includes('理解（防護罩）')||csv.includes('記憶（普通攻擊）'));
  const backup=(await f.call('/api/backup')).body;
  const bs=backup.sessions.find(x=>x.session.id===s.id);
  assert.equal(bs.raidRuns.length,2);assert.equal(bs.raidPlay[run.id].actions.length,3);
  assert.equal((await f.call('/api/restore','POST',{backup})).status,200);
  assert.equal(f.data.sessions[s.id].raidRuns.length,2);
  // 開全班測驗會收起魔王戰
  await ctl({action:'quiz-class'});
  assert.equal(f.data.sessions[s.id].session.raid,null);
});

test('raid analysis: only the hard boss offers analysis; 20-second analysis-only lock, judgement + reason, each question counts once, hints, backup keeps the shield settings',async()=>{
  const {f}=await setup();
  const s=(await f.call('/api/sessions','POST',{lessonId:'g8-2-2d',classId:'demo-class'})).body.session;
  await goOnline(f,[1,2,3,4,5]);
  const ctl=(body)=>f.call(`/api/sessions/${s.id}/control`,'POST',body);
  const {readFile}=await import('node:fs/promises');
  const bank=JSON.parse(await readFile('content/raids/g8-2-2d.json','utf8'));
  const item=(q)=>bank.pools[q.kind].find(x=>x.id===q.id);
  const right=(q)=>q.options.indexOf(item(q).options[item(q).answer]);
  const why=(q)=>q.reason.indexOf(item(q).reason.options[item(q).reason.answer]);
  // 中等：沒有分析題、沒有護盾
  await ctl({action:'raid-start',difficulty:'normal',seconds:300});
  let v=(await f.call(`/api/sessions/${s.id}`)).body.raid;
  assert.equal(v.run.config.phase,undefined);assert.equal(v.pools.analysis,0);
  f.data.sessions[s.id].session.raid.startedAt-=4000;
  const raidN=(who,body)=>f.call(`/api/sessions/${s.id}/raid`,'POST',{runId:v.run.id,...body},who);
  await raidN('seat1',{op:'role',role:'mage'});
  assert.equal((await raidN('seat1',{op:'draw',kind:'analysis'})).status,409,'no analysis on the normal boss');
  // 困難：護盾設定存在這一場的紀錄裡（門檻依開戰時的上線人數）
  await ctl({action:'raid-start',difficulty:'hard',seconds:600});
  v=(await f.call(`/api/sessions/${s.id}`)).body.raid;
  const ph=v.run.config.phase;
  assert.deepEqual(ph.at,[70,35]);assert.deepEqual(ph.need,[3,3],'5 online → at least 3');assert.equal(ph.pool,18);
  assert.equal(v.pools.analysis,18);
  // 5 人班魔王只有 150 血，兩題分析題就會打到 70%；先把血量調高，護盾放到後面再測
  f.data.sessions[s.id].session.raid.config.bossHp=5000;f.data.sessions[s.id].raidRuns.at(-1).config.bossHp=5000;
  f.data.sessions[s.id].session.raid.startedAt-=4000;
  const raid=(who,body)=>f.call(`/api/sessions/${s.id}/raid`,'POST',{runId:v.run.id,...body},who);
  for(const n of [1,2,3,4,5]) await raid(`seat${n}`,{op:'role',role:'knight'});
  const a1=(await raid('seat1',{op:'draw',kind:'analysis'})).body.question;
  // 分析題不能「換一題」（換題不帶輪次、已解題，送出會被判過期）：伺服器明確拒絕，題目不變
  const sk=await raid('seat1',{op:'skip'});
  assert.equal(sk.status,409,'no skip on analysis');assert.equal(f.data.sessions[s.id].raidPlay[v.run.id].seats['1'].cur.id,a1.id);
  assert.equal(a1.kind,'analysis');assert(a1.options.length>=3);assert.equal(a1.hint,undefined,'no hint before 3 minutes');
  const st=JSON.stringify((await f.call(`/api/sessions/${s.id}`,'GET',null,'seat1')).body.raid.mine);
  assert.equal(st.includes('"answer"'),false,'no answers in the student view');
  // 答錯：只鎖分析題 20 秒；其他題馬上可以做
  const wrong=(await raid('seat1',{op:'answer',choice:(right(a1)+1)%a1.options.length,...(a1.reason?{reason:why(a1)}:{})})).body;
  assert.equal(wrong.correct,false);assert.equal(wrong.lockUntil,undefined);
  assert(wrong.analysisLockUntil-Date.now()>19_000&&wrong.analysisLockUntil-Date.now()<=20_100,'20-second lock');
  assert.equal((await raid('seat1',{op:'draw',kind:'analysis'})).status,409,'analysis locked');
  assert.equal((await raid('seat1',{op:'draw',kind:'attack'})).status,200,'other kinds still open');
  const sv=(await f.call(`/api/sessions/${s.id}`,'GET',null,'seat1')).body.raid;
  assert.equal(sv.mine.analysisLockUntil,wrong.analysisLockUntil);
  assert.equal(sv.state.teamHp,v.run.config.teamHp,'no hero HP lost');assert.equal(sv.state.chargeBonus,0,'no boss charge');
  // 判斷＋理由：兩段都要對；只對一段算錯
  let jr;
  for(let i=0;i<40&&!jr;i++){const q=(await raid('seat2',{op:'draw',kind:'analysis'})).body.question;if(q.reason)jr=q;else{await raid('seat2',{op:'draw',kind:'attack'});}}
  assert(jr,'drew a judgement + reason question');
  assert.equal(jr.reason.length,4);
  assert.equal((await raid('seat2',{op:'answer',choice:right(jr)})).status,400,'reason required');
  const half=(await raid('seat2',{op:'answer',choice:right(jr),reason:(why(jr)+1)%4})).body;
  assert.equal(half.correct,false,'right judgement, wrong reason');assert.equal(typeof half.reasonAnswer,'number');
  // 沒有護盾時答對＝直接傷害；被解出的題目不再出給別人
  const a3=(await raid('seat3',{op:'draw',kind:'analysis'})).body.question;
  const ok3=(await raid('seat3',{op:'answer',choice:right(a3),...(a3.reason?{reason:why(a3)}:{})})).body;
  assert.equal(ok3.correct,true);assert.equal(ok3.dmg,ph.dmg);
  for(let i=0;i<25;i++){
    const q=(await raid('seat4',{op:'draw',kind:'analysis'})).body.question;
    assert.notEqual(q.id,a3.id,'solved question is not drawn again');
    await raid('seat4',{op:'draw',kind:'attack'});
  }
  // 兩個人同時拿到同一題：後答對的不算（dup）
  const a5=(await raid('seat5',{op:'draw',kind:'analysis'})).body.question;
  const play=f.data.sessions[s.id].raidPlay[v.run.id];
  play.seats['4'].cur={...play.seats['5'].cur};
  await raid('seat5',{op:'answer',choice:right(a5),...(a5.reason?{reason:why(a5)}:{})});
  const view4=(await f.call(`/api/sessions/${s.id}`,'GET',null,'seat4')).body.raid;
  assert.equal(view4.mine.question.taken,true,'the student sees the question was just solved');
  const q4=view4.mine.question;
  const P=()=>f.data.sessions[s.id].raidPlay[v.run.id];
  const nActs=P().actions.length;
  const dup=(await raid('seat4',{op:'answer',choice:(right(q4)+1)%q4.options.length,...(q4.reason?{reason:why(q4)}:{})})).body;
  assert.equal(dup.taken,true,'already solved: not judged');assert.equal(dup.correct,undefined);assert.equal(dup.analysisLockUntil,undefined,'no lock');
  assert.equal(P().actions.length,nActs,'not recorded as wrong');
  assert(dup.question&&dup.question.id!==q4.id,'a new question right away');
  // 開新護盾前抽到的題目（輪次過期）：一樣不計入、不鎖
  P().seats['4'].cur.round=99;
  const stale=(await raid('seat4',{op:'answer',choice:0,...(dup.question.reason?{reason:0}:{})})).body;
  assert.equal(stale.taken,true);assert.equal(P().actions.length,nActs);
  // 作答入口也檢查分析題鎖定
  P().seats['4'].cur={...P().seats['5'].cur||P().seats['4'].cur,kind:'analysis',id:bank.pools.analysis[0].id,order:[0,1,2,3].slice(0,bank.pools.analysis[0].options.length),round:0};
  P().seats['4'].analysisLockUntil=Date.now()+10_000;
  assert.equal((await raid('seat4',{op:'answer',choice:0,reason:0})).status,409,'locked at the answer entry too');
  delete P().seats['4'].analysisLockUntil;delete P().seats['4'].cur;
  // 護盾開啟、3 分鐘後：學生的分析題有提示
  f.data.sessions[s.id].session.raid.config.bossHp=60;f.data.sessions[s.id].raidRuns.at(-1).config.bossHp=60;
  f.data.sessions[s.id].session.raid.startedAt-=200_000;
  P().actions=[{t:1000,seat:1,kind:'attack',ok:true,role:'knight'},{t:1100,seat:2,kind:'attack',ok:true,role:'knight'}];
  const hv=(await f.call(`/api/sessions/${s.id}`,'GET',null,'seat1')).body.raid;
  assert(hv.state.phase&&hv.state.phase.hinted,'shield open for 3 minutes → hinted');
  const qh=(await raid('seat3',{op:'draw',kind:'analysis'})).body.question;
  assert.ok(qh.hint,'hint shown after 3 minutes');
  // 備份還原：護盾設定原樣保留；舊備份（沒有 phase）還原後也沒有
  const backup=(await f.call('/api/backup')).body;
  assert.equal((await f.call('/api/restore','POST',{backup})).status,200);
  const runs=f.data.sessions[s.id].raidRuns;
  assert.deepEqual(runs.at(-1).config.phase,ph);
  assert.equal(runs.at(-2).config.phase,undefined);
  assert(f.data.sessions[s.id].raidPlay[v.run.id].actions.length>=2);
  assert.deepEqual(runs.at(-1).config.phase,{...ph},'stored per run');
});

test('raid bank validation: analysis may be missing or an empty array; 1–3 analysis questions are rejected',async()=>{
  const {readFile}=await import('node:fs/promises');
  const bank=JSON.parse(await readFile('content/raids/g8-2-2d.json','utf8'));
  const base={...bank,pools:{attack:bank.pools.attack,shield:bank.pools.shield,ultimate:bank.pools.ultimate}};
  assert.deepEqual(validateRaidBank(base).pools.analysis,[]);
  assert.deepEqual(validateRaidBank({...base,pools:{...base.pools,analysis:[]}}).pools.analysis,[]);
  assert.throws(()=>validateRaidBank({...base,pools:{...base.pools,analysis:bank.pools.analysis.slice(0,2)}}),/4–1000/);
  const full=validateRaidBank(bank);
  assert.equal(full.pools.analysis.length,18);assert(full.pools.analysis.some(q=>q.reason&&q.hint));
});

test('quiz figures: a plain SVG reaches the student paper; SVG with script or event handlers is rejected',async()=>{
  const {f}=await setup();
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="#000"/></svg>';
  const bank=(figure)=>({title:'附圖',slots:Array.from({length:10},(_,q)=>({id:`q${q+1}`,topic:`題位 ${q+1}`,variants:[0,1,2].map(v=>({stem:`第 ${q+1} 題（${v}）`,figure,options:['對','錯A','錯B','錯C'],answer:0}))}))});
  const base=(await f.call('/api/dashboard')).body.lessons[0];
  for(const bad of ['<svg onload="alert(1)"></svg>','<svg><script>alert(1)</script></svg>','<svg><a href="javascript:alert(1)">x</a></svg>','<img src=x>'])
    assert.equal((await f.call('/api/lessons/fig-bad','PUT',{lesson:{...base,id:'fig-bad',quiz:bank(bad)}})).status,400,bad);
  assert.equal((await f.call('/api/lessons/fig-lesson','PUT',{lesson:{...base,id:'fig-lesson',quiz:bank(svg)}})).status,200);
  const s=(await f.call('/api/sessions','POST',{lessonId:'fig-lesson',classId:'demo-class'})).body.session;
  await goOnline(f,[1]);
  await f.call(`/api/sessions/${s.id}/control`,'POST',{action:'quiz-class',seconds:600});
  const st=(await f.call(`/api/sessions/${s.id}`,'GET',null,'student')).body;
  assert(st.quiz.questions.every(q=>q.figure===svg));
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
  for(let q=1;q<10;q++)await answer('student',{runId:pkRun,q,choice:q===9?(right(pk,q)+1)%4:right(pk,q)});
  assert.equal((await view('teacher')).quiz.scores['1'].finished,true);
  assert.deepEqual((await view('teacher')).quiz.detail['1'].map(x=>x?1:0),[1,1,1,1,1,1,1,1,1,0],'board shows each question right/wrong');
  // 錯題紀錄：最近一次的結果（第 1 題在全班測驗錯、PK 答對 → 拿掉；第 10 題 PK 答錯 → 留著）
  const rec=(await view('teacher')).quizRecord;
  assert.deepEqual(rec.wrong['1'],[9]);assert.equal(rec.topics.length,10);
  assert.equal((await view('student')).quizRecord,undefined,'students do not get the record');
  await ctl({action:'pk-again'});
  const again=await view('teacher');assert.notEqual(again.quiz.run.id,pkRun);assert.deepEqual(again.quiz.run.matches.map(m=>[m.a,m.b]),pk.quiz.run.matches.map(m=>[m.a,m.b]));
  // PK 戰績
  assert.deepEqual((await view('teacher')).quizRecord.standings['1'].win+(await view('teacher')).quizRecord.standings['1'].lose+(await view('teacher')).quizRecord.standings['1'].draw,1);
  // 錯題練習：每人只做自己錯的題位、換成沒看過的那一題
  await ctl({action:'quiz-review'});
  const rv=await view('student');
  assert.equal(rv.quiz.run.mode,'review');assert.equal(rv.quiz.run.personal,undefined,'students do not see other papers');
  assert.deepEqual(rv.quiz.questions.map(x=>x.slot),[9]);
  const seenStems=[t1.quiz.questions[9].stem,pk.quiz.questions[9].stem];
  assert(!seenStems.includes(rv.quiz.questions[0].stem)||new Set(seenStems).size===3,'a variant the student has not seen');
  assert.equal((await answer('student',{runId:rv.quiz.run.id,q:0,choice:0})).status,403,'only own slots');
  const rr=await answer('student',{runId:rv.quiz.run.id,q:9,choice:right(rv,0)});
  assert.equal(rr.body.correct,true);
  assert.equal((await view('teacher')).quizRecord.wrong['1'],undefined,'right in the review → removed from the record');
  // 紀錄：CSV 與備份
  const csv=new TextDecoder().decode((await f.call(`/api/sessions/${s.id}/export?format=csv`)).body);
  assert(csv.includes('"形成性評量"')&&csv.includes('"PK戰"'));
  const backup=(await f.call('/api/backup')).body;
  const bs=backup.sessions.find(x=>x.session.id===s.id);
  assert.equal(bs.quizRuns.length,5);
  const g=fixture();await g.call('/api/login','POST',TEACHER);
  const r=await g.call('/api/restore','POST',{backup});assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(g.data.sessions[s.id].quizRuns.length,5);assert(g.data.sessions[s.id].quizRuns.some(r=>r.mode==='review'&&r.personal['1']));
});

test('quiz extras: confidence bets, growth since the last class quiz, level pairing, spaced review from the previous lesson',async()=>{
  const {f}=await setup();
  const mk=(id,name)=>({title:`${name}題庫`,slots:Array.from({length:10},(_,q)=>({id:`${id}${q+1}`,topic:`${name} 題位 ${q+1}`,variants:[0,1,2].map(v=>({stem:`${name} 第 ${q+1} 題（${v}）`,options:[`對${v}`,`錯A${v}`,`錯B${v}`,`錯C${v}`],answer:0,explanation:'解析'}))}))});
  const base=(await f.call('/api/dashboard')).body.lessons[0];
  assert.equal((await f.call('/api/lessons/lesson-a','PUT',{lesson:{...base,id:'lesson-a',title:'第一課',quiz:mk('a','甲')}})).status,200);
  assert.equal((await f.call('/api/lessons/lesson-b','PUT',{lesson:{...base,id:'lesson-b',title:'第二課',quiz:mk('b','乙')}})).status,200);
  await goOnline(f,[1,2,3,4]);
  const right=(v,q)=>v.quiz.questions[q].options.findIndex(o=>o.startsWith('對'));
  // 第一課：全班測驗＋信心下注
  const a=(await f.call('/api/sessions','POST',{lessonId:'lesson-a',classId:'demo-class'})).body.session;
  const ctlA=(body)=>f.call(`/api/sessions/${a.id}/control`,'POST',body);
  const viewA=(who)=>f.call(`/api/sessions/${a.id}`,'GET',null,who).then(r=>r.body);
  const ansA=(who,body)=>f.call(`/api/sessions/${a.id}/quiz`,'POST',body,who);
  await ctlA({action:'quiz-class',seconds:600});
  const ta=await viewA('teacher'),runA=ta.quiz.run.id;
  const rightCount={1:6,2:10,3:3,4:8};
  for(const [seat,k] of Object.entries(rightCount))for(let q=0;q<10;q++)await ansA(`seat${seat}`,{runId:runA,q,choice:q<k?right(ta,q):(right(ta,q)+1)%4});
  // 1 號：第 1–3 題有把握（對）、第 9 題有把握（錯）、其他不太確定 → 3×3 − 2 + 3×1 + 0 = 10
  for(let q=0;q<10;q++)assert.equal((await ansA('seat1',{runId:runA,q,conf:[0,1,2,8].includes(q)?1:0})).status,200);
  assert.equal((await ansA('seat1',{runId:runA,q:0,conf:2})).status,400,'confidence is 0 or 1');
  assert.deepEqual((await viewA('seat1')).quiz.mine.conf,[1,1,1,0,0,0,0,0,1,0]);
  await ctlA({action:'quiz-end'});
  assert.equal((await viewA('teacher')).quiz.bets['1'],10);
  assert.equal(quizLib.betSummary((await viewA('seat1')).quiz.mine.correct,(await viewA('seat1')).quiz.mine.conf).points,10,'the student gets the same score');
  assert.equal((await viewA('seat1')).quiz.bets,undefined,'students do not see other bets');
  const cls=f.data.classes['demo-class'];
  assert.deepEqual(Object.fromEntries(Object.entries(cls.quizHistory).map(([k,v])=>[k,v.map(e=>e.correct)])),{1:[6],2:[10],3:[3],4:[8]});
  assert.deepEqual(cls.quizMisses['lesson-a'].counts,[0,0,0,1,1,1,2,2,3,3]);
  // 同程度配對：2 號 100%、4 號 80%、1 號 60%、3 號 30%
  await ctlA({action:'pk-lobby'});
  await ctlA({action:'pk-level'});
  assert.deepEqual((await viewA('teacher')).session.pkLobby.pairs,[[2,4],[1,3]]);
  await ctlA({action:'pk-start',seconds:120});
  f.data.sessions[a.id].session.quiz.startedAt-=4000;
  assert.equal((await ansA('seat1',{runId:(await viewA('teacher')).quiz.run.id,q:0,conf:1})).status,400,'no bets in PK');
  await ctlA({action:'end'});
  // 第二課：開頭派間隔複習（上一課全班錯最多的 3 個題型）
  const b=(await f.call('/api/sessions','POST',{lessonId:'lesson-b',classId:'demo-class'})).body.session;
  const ctlB=(body)=>f.call(`/api/sessions/${b.id}/control`,'POST',body);
  const viewB=(who)=>f.call(`/api/sessions/${b.id}`,'GET',null,who).then(r=>r.body);
  const ansB=(who,body)=>f.call(`/api/sessions/${b.id}/quiz`,'POST',body,who);
  assert.deepEqual((await viewB('teacher')).spaced,{title:'第一課',topics:['甲 題位 9','甲 題位 10','甲 題位 7']});
  assert.equal((await viewB('seat1')).spaced,undefined);
  assert.equal((await f.call(`/api/sessions/${a.id}`)).body.spaced,undefined,'not offered in the lesson it came from');
  await ctlB({action:'quiz-spaced'});
  const sp=await viewB('seat1');
  assert.equal(sp.quiz.run.mode,'spaced');assert.equal(sp.quiz.run.from,'第一課');assert.equal(sp.quiz.run.bank,undefined,'the bank stays on the server');
  assert.equal((await viewB('teacher')).quiz.run.bank,undefined);
  assert.equal(sp.quiz.questions.length,3);assert(sp.quiz.questions[0].stem.startsWith('甲 第 9 題'));
  const tsp=await viewB('teacher');
  const r0=(await ansB('seat1',{runId:sp.quiz.run.id,q:0,choice:right(tsp,0)})).body;
  assert.equal(r0.correct,true);assert.equal(r0.answer,right(tsp,0),'answer shown right away');
  assert.equal((await ansB('seat1',{runId:sp.quiz.run.id,q:0,choice:0})).status,409,'spaced: an answer is final');
  // 這一課的全班測驗：和上一次比進步多少
  await ctlB({action:'quiz-class',seconds:600});
  const tb=await viewB('teacher'),runB=tb.quiz.run.id;
  for(let q=0;q<10;q++)await ansB('seat1',{runId:runB,q,choice:q<9?right(tb,q):(right(tb,q)+1)%4});
  await ctlB({action:'quiz-end'});
  assert.deepEqual((await viewB('seat1')).quiz.prev,{1:{correct:6,total:10}});
  assert.deepEqual(Object.keys((await viewB('teacher')).quiz.prev).sort(),['1','2','3','4']);
  assert.deepEqual(f.data.classes['demo-class'].quizHistory['1'].map(e=>e.correct),[6,9]);
  assert.deepEqual((await viewB('teacher')).quizRecord.wrong,{1:[9]},'the spaced review does not mix into this lesson\'s record');
  // 紀錄：CSV 與備份
  const csvA=new TextDecoder().decode((await f.call(`/api/sessions/${a.id}/export?format=csv`)).body);
  assert(csvA.includes('有把握')&&csvA.includes('不太確定'));
  const csvB=new TextDecoder().decode((await f.call(`/api/sessions/${b.id}/export?format=csv`)).body);
  assert(csvB.includes('間隔複習（第一課）'));
  const backup=(await f.call('/api/backup')).body;
  const g=fixture();await g.call('/api/login','POST',TEACHER);
  assert.equal((await g.call('/api/restore','POST',{backup})).status,200);
  const kept=g.data.sessions[b.id].quizRuns.find(r=>r.mode==='spaced');
  assert.equal(kept.bank.slots.length,3);assert.equal(kept.from,'第一課');
  assert.deepEqual(g.data.sessions[a.id].quizSheets[runA]['1'].conf,[1,1,1,0,0,0,0,0,1,0]);
});

test('make (radical 24-game): every card once, + − × ÷ and brackets; judged on the server; class sees the different ways',async()=>{
  const make=await import(pathToFileURL(join(dir,'shared','make.mjs')).href);
  const cards=['√2','√8','√3','√12'];
  assert.equal(make.makeCheck('[0]*[1]+[3]/[2]',cards,'6').ok,true);
  assert.equal(make.makeCheck('([3]/[2])+([1]*[0])',cards,'6').ok,true,'brackets and any order');
  assert.equal(make.makeCheck('[0]*[1]+[3]',cards,'6').error,'每張卡片都要用到');
  assert.equal(make.makeCheck('[0]*[1]+[3]',cards,'6').complete,true);
  assert.equal(make.makeCheck('[0]*[1]+',cards,'6').error,undefined,'still typing is not an error');
  assert.equal(make.makeCheck('[0]*[1]+[3]',cards,'6').ok,false,'every card must be used');
  assert.equal(make.makeCheck('[0]*[0]+[1]',cards,'6').error,'每張卡片只能用一次');
  assert.equal(make.makeCheck('[0][1]',cards,'6').error,'兩張數字卡中間要放運算符號');
  assert.equal(make.makeCheck('[0]*([1]+[2]',cards,'6').complete,false,'unclosed bracket');
  assert.equal(make.makeCheck('[0]/([1]-[1])',cards,'6').ok,false);
  assert.equal(make.makeCheck('alert(1)',cards,'6').ok,false);
  assert.equal(make.makeText('[0]*([1]-[2])/[3]',cards),'√2 × (√8 − √3) ÷ √12');
  assert.equal(make.makeBack('[0]*([1]'),'[0]*(');
  assert.equal(make.makeCheck('([0]+[1])*([2]+[3])',['√2','√3','√2','√3'],'5+2√6').ok,true,'target with a sum');
  // 課程裡的關卡：老師開放、學生送出，伺服器判定
  const {f}=await setup();
  const s=(await f.call('/api/sessions','POST',{lessonId:'g8-2-2b',classId:'demo-class'})).body.session;
  const lesson=(await f.call(`/api/sessions/${s.id}`)).body.lesson;
  const slide=lesson.slides.find(x=>x.activity?.id==='make-1');
  assert.deepEqual(slide.activity.cards,cards);assert.equal(slide.activity.target,'6');
  await openSlide(f,s,lesson,'make-1');
  await goOnline(f,[2,3]);
  let n=0;const send=(who,value)=>f.call(`/api/sessions/${s.id}/answers`,'POST',{submissionId:`mk-${n++}`,activityId:'make-1',value},who);
  assert.equal((await send('seat2','[0]*[1]+[3]')).status,400,'all cards are needed');
  assert.equal((await send('seat2','[0]*[1]+')).status,400,'incomplete');
  assert.equal((await send('seat2','[0]*[1]+[3]/[2]')).status,200);
  assert.equal((await send('seat3','[0]+[1]+[2]+[3]')).status,200,'a wrong total can still be handed in');
  assert.equal((await send('student','[3]/[2]+[0]*[1]')).status,200);
  const t=(await f.call(`/api/sessions/${s.id}`)).body;
  assert.equal(t.aggregate.correct,2);assert.equal(t.aggregate.counts['[0]*[1]+[3]/[2]'],1);
  assert.equal((await f.call(`/api/sessions/${s.id}`,'GET',null,'seat2')).body.aggregate.correct,undefined,'hidden until the results');
});

test('radical step duel: balanced red/blue teams, rule then fill for each step, hints after two misses, damage, results and records',async()=>{
  const duelLib=await import(pathToFileURL(join(dir,'shared','duel.mjs')).href);
  const {readFile}=await import('node:fs/promises');
  const {f}=await setup();
  const s=(await f.call('/api/sessions','POST',{lessonId:'g8-2-2a',classId:'demo-class'})).body.session;
  const lesson=(await f.call(`/api/sessions/${s.id}`)).body.lesson;
  const at=lesson.slides.findIndex(x=>x.duelPage);
  assert(at>0&&lesson.slides[at+1]?.quizPage,'the duel page sits right before the after-class quiz');
  await goOnline(f,[1,2,3,4]);
  const ctl=(body)=>f.call(`/api/sessions/${s.id}/control`,'POST',body);
  assert.equal((await ctl({action:'duel-start',seconds:480})).status,200);
  const run=(await f.call(`/api/sessions/${s.id}`)).body.duel.run;
  const teams=Object.values(run.teams);
  assert.equal(teams.filter(t=>t==='red').length,2);assert.equal(teams.filter(t=>t==='blue').length,2);
  const duel=(who,body)=>f.call(`/api/sessions/${s.id}/duel`,'POST',{runId:run.id,...body},who);
  assert.equal((await duel('seat1',{op:'next'})).status,409,'countdown');
  f.data.sessions[s.id].session.duel.startedAt-=4000;
  const bank=JSON.parse(await readFile('content/duels/g8-2-2a.json','utf8'));
  const first=(await duel('seat1',{op:'next'})).body;
  assert.equal(first.team,run.teams['1']);
  const p=first.problem;
  assert.equal(p.phase,'rule');assert.equal(p.rules.length,4);assert.equal(JSON.stringify(first).includes('"fill"'),false,'no answers sent');
  const item=bank.problems.find(x=>x.id===p.id);
  // 選錯規則兩次：扣自己隊伍、出現提示（正確的規則）
  const wrongRule=p.rules.findIndex(r=>r!==item.steps[0].rule);
  const w1=(await duel('seat1',{op:'answer',phase:'rule',choice:wrongRule})).body;
  assert.equal(w1.ok,false);
  const w2=(await duel('seat1',{op:'answer',phase:'rule',choice:wrongRule})).body;
  assert.equal(w2.problem.hint,item.steps[0].rule,'hint after two misses');
  assert.equal((await duel('seat1',{op:'answer',phase:'fill',values:item.steps[0].fill[0]})).status,409,'pick the rule first');
  // 做完整題：每一步選對規則、填對算式
  let cur=w2.problem,last;
  for(let k=0;k<item.steps.length;k++){
    const stp=item.steps[k];
    const r1=(await duel('seat1',{op:'answer',phase:'rule',choice:cur.rules.indexOf(stp.rule)})).body;
    assert.equal(r1.ok,true);assert.equal(r1.problem.phase,'fill');assert.deepEqual([...r1.problem.tiles].sort(),[...stp.tiles].sort());
    if(k===0){
      const bad=(await duel('seat1',{op:'answer',phase:'fill',values:stp.fill[0].map(()=>stp.tiles.find(x=>!stp.fill[0].includes(x))||stp.tiles[0])})).body;
      assert.equal(bad.ok,false,'wrong fill');
      assert.equal((await duel('seat1',{op:'answer',phase:'fill',values:stp.fill[0].map(()=>'999')})).status,400,'only tiles');
    }
    last=(await duel('seat1',{op:'answer',phase:'fill',values:stp.fill[stp.fill.length-1]})).body;
    assert.equal(last.ok,true,`step ${k+1}`);
    cur=last.problem;
  }
  assert.equal(last.final,true);assert.equal(last.solved,1);assert.notEqual(last.problem.id,p.id,'next problem right away');
  // 戰況：對方隊伍掉血、自己隊伍因為答錯掉一點
  const tv=(await f.call(`/api/sessions/${s.id}`)).body.duel;
  const mine=run.teams['1'],foe=mine==='red'?'blue':'red';
  assert(tv.state.hp[foe]<100&&tv.state.hp[mine]<100);
  assert(tv.state.log.some(e=>e.k==='finish'&&e.seat===1));
  assert(tv.weak.length>=1,'class accuracy per rule');
  const sv=(await f.call(`/api/sessions/${s.id}`,'GET',null,'seat2')).body.duel;
  assert.deepEqual(Object.keys(sv.state.stats),[],'students only get their own stats');
  // 規則：傷害依人數平均；答錯不會直接輸
  const st=duelLib.duelReplay([{t:1,seat:1,team:'red',phase:'fill',rule:'mul',ok:true,final:true,w:1}],{red:1,blue:1},480,10);
  assert.equal(Math.round((100-st.hp.blue)*1000)/1000,Math.round(duelLib.DUEL_POINTS.final*duelLib.duelScale(480,1)*1000)/1000);
  const miss=duelLib.duelReplay(Array.from({length:999},(_,i)=>({t:i,seat:1,team:'red',phase:'rule',rule:'mul',ok:false,w:1})),{red:1,blue:1},480,2000);
  assert.equal(miss.result,null);assert(miss.hp.red>=1);
  // 結束：結算與紀錄
  await ctl({action:'duel-end'});
  const done=(await f.call(`/api/sessions/${s.id}`)).body.duel;
  assert(done.results.some(r=>r.seat===1&&r.finished===1));
  assert.equal((await f.call(`/api/sessions/${s.id}`,'GET',null,'seat1')).body.duel.results.length,1);
  assert.equal((await duel('seat1',{op:'next'})).status,409,'over');
  const csv=new TextDecoder().decode((await f.call(`/api/sessions/${s.id}/export?format=csv`)).body);
  assert(csv.includes('"步驟格鬥"'));
  const backup=(await f.call('/api/backup')).body;
  const g=fixture();await g.call('/api/login','POST',TEACHER);
  assert.equal((await g.call('/api/restore','POST',{backup})).status,200);
  assert.equal(g.data.sessions[s.id].duelRuns.length,1);assert(g.data.sessions[s.id].duelPlay[run.id].actions.length>=6);
  // 開魔王戰或課後檢核時收起步驟格鬥
  await ctl({action:'duel-start',seconds:300});
  await ctl({action:'quiz-class'});
  assert.equal((await f.call(`/api/sessions/${s.id}`)).body.session.duel,null);
});

test('fullSlide: one figure fills the slide; zero or several figures are rejected',()=>{
  const lesson=(figures)=>({schemaVersion:1,id:'deck',title:'簡報',slides:[{id:'p01',title:'封面',body:'',fullSlide:true,figures}]});
  const fig={src:'deck/p01.jpg',alt:'簡報第 1 頁'};
  assert.equal(validateLesson(lesson([fig])).slides[0].fullSlide,true);
  assert.throws(()=>validateLesson(lesson([])),/fullSlide/);
  assert.throws(()=>validateLesson(lesson([fig,{...fig,src:'deck/p02.jpg'}])),/fullSlide/);
});

const JPEG='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
async function homeworkSetup(env={APP_MODE:'demo'},opts={}){
  const f=fixture(env,undefined,opts);assert.equal((await f.call('/api/login','POST',TEACHER)).status,200);
  const cl=(await f.call('/api/dashboard')).body.classes[0];
  const s=(await f.call('/api/sessions','POST',{lessonId:'g8-2-2a',classId:cl.id})).body.session;
  const lesson=f.data.sessions[s.id].lesson;
  const index=lesson.slides.findIndex(x=>x.activity?.id==='a-ex1-q');
  await f.call(`/api/sessions/${s.id}/control`,'POST',{action:'slide',index});
  await f.call(`/api/sessions/${s.id}/control`,'POST',{action:'activity',value:true});
  // 1–3 號答錯、4–6 號答對（a-ex1-q 對到題型 q3、q4）
  for(const seat of [1,2,3,4,5,6]){
    const u=`seat${seat}`;
    await f.call('/api/login','POST',{role:'student',classCode:'DEMO801',seat},u);
    const value=seat<=3?['√10','6√5']:['√21','-6√15'];
    assert.equal((await f.call(`/api/sessions/${s.id}/answers`,'POST',{submissionId:`hw-${seat}`,activityId:'a-ex1-q',value},u)).status,200);
  }
  return {f,cl,s};
}
test('learning records: IRS answers are recorded per seat with topic, objective and curriculum codes',async()=>{
  const {f,cl,s}=await homeworkSetup();
  // 課後檢核：1 號第 1 題答對、第 2 題答錯
  await f.call(`/api/sessions/${s.id}/control`,'POST',{action:'quiz-class',seconds:600});
  const tq=(await f.call(`/api/sessions/${s.id}`)).body.quiz;
  await f.call(`/api/sessions/${s.id}/quiz`,'POST',{runId:tq.run.id,q:0,choice:tq.questions[0].answer},'seat1');
  await f.call(`/api/sessions/${s.id}/quiz`,'POST',{runId:tq.run.id,q:1,choice:(tq.questions[1].answer+1)%4},'seat1');
  await f.call(`/api/sessions/${s.id}/control`,'POST',{action:'quiz-end'});
  assert.equal((await f.call(`/api/classes/${cl.id}/records`,'GET',null,'seat1')).status,403,'teacher only');
  const r=(await f.call(`/api/classes/${cl.id}/records`)).body;
  const quiz=r.records.filter(x=>x.seat===1&&x.source==='quiz');
  assert.deepEqual(quiz.map(x=>[x.slot,x.correct]),[['g8-2-2a:q1',true],['g8-2-2a:q2',false]]);
  const mine=r.records.filter(x=>x.seat===1&&x.source==='irs');
  assert.deepEqual(mine.map(x=>[x.item,x.slot,x.correct]),[['a-ex1-q#1','g8-2-2a:q3',false],['a-ex1-q#2','g8-2-2a:q4',false]],'each item is one record on its own topic (links.items), not items × topics');
  assert(r.records.filter(x=>x.seat===4).every(x=>x.correct===true));
  assert.equal(r.slots['g8-2-2a:q3'].topic,'根式乘法：√a × √b');
  assert(r.slots['g8-2-2a:q3'].objective.length>0,'objective text from lesson.objectives');
  assert.deepEqual(r.slots['g8-2-2a:q3'].performance,['n-IV-2']);
  assert.equal(r.codes['N-8-2'],'測試用學習內容');
});
test('homework: plan suggests the lowest third, each seat gets 10 items from its weakest topics, QR token gates the sheet',async()=>{
  const {f,cl}=await homeworkSetup();
  const plan=(await f.call(`/api/homework/plan?classId=${cl.id}&lessonId=g8-2-2a`)).body.plan;
  assert.deepEqual(plan.suggested,[1,2],'6 seats with records → lowest 2');
  assert.equal(plan.seats.find(x=>x.seat===1).acc,0);
  assert.equal(plan.seats.find(x=>x.seat===9).acc,null,'no records');
  assert.equal(plan.section,undefined,'2-2(1) is not the last lesson of the section');
  const sectionPlan=(await f.call(`/api/homework/plan?classId=${cl.id}&lessonId=g8-2-2b&scope=section`)).body.plan;
  assert.deepEqual(sectionPlan.lessonIds,['g8-2-2a','g8-2-2b'],'whole-section homework on the last lesson');
  assert.equal((await f.call(`/api/homework/plan?classId=${cl.id}&lessonId=g8-2-2a&scope=section`)).status,400);
  const created=await f.call('/api/homework','POST',{classId:cl.id,lessonId:'g8-2-2a',seats:[1,4]});
  assert.equal(created.status,200);
  const [one,four]=created.body.sheets;
  assert.equal(one.questions.length,10);
  assert(one.questions.every(q=>q.answer&&q.solution),'teacher copy has answers');
  const topics=one.questions.map(q=>q.slot);
  assert.equal(topics.filter(x=>x==='g8-2-2a:q3').length,3,'weakest topic gets the most (max 3)');
  assert.equal(new Set(one.questions.map(q=>q.stem)).size,10,'no repeated question');
  assert(four.questions.length===10);
  const id=created.body.homework.id,token=new URL(one.url).hash.split('/')[4];
  assert.match(one.url,new RegExp(`#/hw/${id}/1/[0-9a-f]{24}$`));
  // 學生（不用登入）用 QR code 連結
  assert.equal((await f.call(`/api/hw/${id}/1?t=${'0'.repeat(24)}`,'GET',null,'nobody')).status,404,'wrong token');
  assert.equal((await f.call(`/api/hw/${id}/4?t=${token}`,'GET',null,'nobody')).status,404,'token belongs to seat 1');
  const pub=(await f.call(`/api/hw/${id}/1?t=${token}`,'GET',null,'nobody')).body.sheet;
  assert.equal(pub.status,'assigned');
  assert(pub.questions.every(q=>!('answer' in q)&&!('solution' in q)),'answers hidden before grading');
  assert.equal((await f.call(`/api/hw/${id}/1/submit?t=${token}`,'POST',{},'nobody')).status,400,'needs a photo');
  assert.equal((await f.call(`/api/hw/${id}/1/photos?t=${token}`,'POST',{dataUrl:'data:text/plain;base64,AAAA'},'nobody')).status,400);
  const up=await f.call(`/api/hw/${id}/1/photos?t=${token}`,'POST',{dataUrl:JPEG},'nobody');
  assert.equal(up.status,200);
  const photoId=up.body.sheet.photos[0].id;
  assert([...f.vaultMap.keys()].includes(`hwphoto:${id}/1/${photoId}`),'photo stored in the Durable Object without Supabase');
  const img=await f.call(`/api/hw/${id}/1/photos/${photoId}?t=${token}`,'GET',null,'nobody');
  assert.equal(img.headers.get('Content-Type'),'image/jpeg');
  // 送出：沒有 AI 金鑰時當場示範批改
  const sub=(await f.call(`/api/hw/${id}/1/submit?t=${token}`,'POST',{},'nobody')).body.sheet;
  assert.equal(sub.status,'graded');
  assert.equal(sub.result.mode,'mock');
  assert.equal(sub.result.items.length,10);
  assert(sub.result.items.filter(x=>x.correct).every(x=>x.comment),'right answers get encouragement too');
  assert(sub.questions.every(q=>q.answer),'answers shown after grading');
  assert.equal((await f.call(`/api/hw/${id}/1/photos?t=${token}`,'POST',{dataUrl:JPEG},'nobody')).status,409,'restart is explicit');
  // 學生登入後的清單
  const list=(await f.call('/api/student/homework','GET',null,'seat1')).body.homework;
  assert.equal(list.length,1);assert.equal(list[0].score,sub.result.score);assert(list[0].url.endsWith(token));
  assert.equal((await f.call('/api/student/homework','GET',null,'seat2')).body.homework.length,0);
  // 老師改判、重新批改、紀錄
  const before=sub.result.score;
  const wrongIndex=sub.result.items.findIndex(x=>x.correct===false);
  const fixed=(await f.call(`/api/homework/${id}/1/items/${wrongIndex+1}`,'PUT',{correct:true,comment:'老師看過，對了！'})).body.sheet;
  assert.equal(fixed.result.score,before+1);assert.equal(fixed.result.items[wrongIndex].teacher,true);
  assert.equal((await f.call(`/api/homework/${id}/1/items/1`,'PUT',{correct:true},'seat1')).status,403);
  const records=(await f.call(`/api/classes/${cl.id}/records`)).body.records.filter(r=>r.source==='homework'&&r.seat===1);
  assert.equal(records.length,10,'graded homework becomes learning records');
  const regraded=(await f.call(`/api/homework/${id}/1/regrade`,'POST',{})).body.sheet;
  assert.equal(regraded.status,'graded');
  const meta=(await f.call('/api/homework')).body.homework[0];
  assert.equal(meta.sheets['1'].status,'graded');assert.equal(meta.sheets['4'].status,'assigned');
  // 重新上傳（訂正後）
  const again=(await f.call(`/api/hw/${id}/1/photos?t=${token}`,'POST',{dataUrl:JPEG,restart:true},'nobody')).body.sheet;
  assert.equal(again.status,'assigned');assert.equal(again.photos.length,1);assert.equal(again.result,undefined);
  assert(![...f.vaultMap.keys()].includes(`hwphoto:${id}/1/${photoId}`),'old photo removed');
  // 第二份作業避開出過的題目
  const second=(await f.call('/api/homework','POST',{classId:cl.id,lessonId:'g8-2-2a',seats:[1]})).body.sheets[0];
  const firstStems=new Set(one.questions.map(q=>q.stem));
  assert(second.questions.filter(q=>firstStems.has(q.stem)).length<10,'prefers questions not given before');
  // 設定頁的儲存空間算進作業照片；清除舊照片時，剛上傳的不會被刪
  const usage=(await f.call('/api/settings/usage')).body;
  assert(usage.homeworkPhotoBytes>0&&usage.photoBytes>=usage.homeworkPhotoBytes);
  assert.equal((await f.call('/api/settings/prune-photos','POST',{days:7})).body.removed,0);
  // 刪除
  assert.equal((await f.call(`/api/homework/${id}`,'DELETE',{})).status,200);
  assert.equal((await f.call(`/api/hw/${id}/1?t=${token}`,'GET',null,'nobody')).status,404);
  assert(![...f.vaultMap.keys()].some(k=>k.startsWith(`hw:${id}`)||k.startsWith(`hwphoto:${id}/`)));
});
test('homework photos go to Supabase Storage (private bucket) when SUPABASE_URL and the secret key are set',async()=>{
  const {photoStore}=await import(pathToFileURL(join(dir,'worker','photos.mjs')).href);
  const original=globalThis.fetch;const calls=[];
  globalThis.fetch=async(url,init={})=>{calls.push({url:String(url),method:init.method||'GET',headers:new Headers(init.headers)});return init.method==='POST'?new Response('{}'):new Response(new Uint8Array([255,216,255]),{headers:{'Content-Type':'image/jpeg'}});};
  try{
    const store=photoStore({SUPABASE_URL:'https://abc.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test'},{});
    assert.equal(store.kind,'supabase');
    await store.put('hw1/7/p1',JPEG);
    assert.equal(calls[0].url,'https://abc.supabase.co/storage/v1/object/homework-photos/hw1/7/p1');
    assert.equal(calls[0].method,'POST');assert.equal(calls[0].headers.get('apikey'),'sb_secret_test');assert.equal(calls[0].headers.get('Content-Type'),'image/jpeg');
    assert.match(await store.get('hw1/7/p1'),/^data:image\/jpeg;base64,/);
    assert.equal(photoStore({},{}).kind,'durable');
  }finally{globalThis.fetch=original;}
});

/* ───── 2026-10-30 Codex 審核 C-1～C-17 的回歸測試 ───── */
/** 派一份作業給 1 號、上傳一張照片，回傳 { id, token }。 */
async function hwWithPhoto(f,cl,seat=1){
  const created=await f.call('/api/homework','POST',{classId:cl.id,lessonId:'g8-2-2a',seats:[seat]});
  assert.equal(created.status,200);
  const id=created.body.homework.id,token=new URL(created.body.sheets[0].url).hash.split('/')[4];
  assert.equal((await f.call(`/api/hw/${id}/${seat}/photos?t=${token}`,'POST',{dataUrl:JPEG},'nobody')).status,200);
  return {id,token,sheet:created.body.sheets[0]};
}
const storedHw=(f,id)=>f.vaultMap.get(`hw:${id}`);

test('C-2: multi-item IRS answers are recorded per item on their own topic; no items × topics product; one answer on two topics counts once overall',()=>{
  const slides=[{id:'a-ex1',activity:{id:'a-ex1-q'}},{id:'a-two',activity:{id:'two-q'}},{id:'a-both',activity:{id:'both-q'}}];
  const s={session:{id:'s1',lessonId:'g8-2-2a'},lesson:{slides},answers:[
    {id:'x1',seat:1,activityId:'a-ex1-q',submittedAt:'2026-10-30T01:00:00Z',itemsCorrect:[true,false]},
    {id:'x2',seat:1,activityId:'two-q',submittedAt:'2026-10-30T01:01:00Z',itemsCorrect:[true,true,false]},
    {id:'x3',seat:1,activityId:'both-q',submittedAt:'2026-10-30T01:02:00Z',correct:false},
  ],grades:{},practice:{'a-ex1-q':{'1':{seat:1,start:Date.parse('2026-10-30T01:03:00Z'),items:[1],subs:[{round:0,value:'1',correct:true,at:1000}]}}}};
  const r=hwLib.sessionRecords(s);
  const irs=r.filter(x=>x.source==='irs');
  assert.deepEqual(irs.filter(x=>x.item.startsWith('a-ex1-q')).map(x=>[x.item,x.slot,x.correct]),[['a-ex1-q#1','g8-2-2a:q3',true],['a-ex1-q#2','g8-2-2a:q4',false]],'links.items: one record per item');
  // 兩個題型、沒有 links.items：不照順序猜，只算總答對率
  assert.deepEqual(irs.filter(x=>x.item.startsWith('two-q')).map(x=>x.slot),[undefined,undefined,undefined]);
  // 單一作答對到兩個題型：兩筆，第二筆標 dup
  assert.deepEqual(irs.filter(x=>x.item==='both-q').map(x=>[x.slot,!!x.dup]),[['g8-2-2a:q1',false],['g8-2-2a:q2',true]]);
  // 補救練習「原題再做一次」：第 0 輪做的是第 2 小題（items[0]=1）→ q4
  assert.deepEqual(r.filter(x=>x.source==='practice').map(x=>x.slot),['g8-2-2a:q4']);
  const plan=hwLib.homeworkPlan(r,['g8-2-2a'],3,'t','lesson',{});
  const one=plan.seats.find(x=>x.seat===1);
  assert.equal(one.n,7,'2 + 3 + 1 (dup not counted twice) + 1 practice');
});

test('C-3: new raid questions and cumulative duel families map to a topic (real banks); raidSkip stays topic-less',()=>{
  const raid=JSON.parse(readFileSync('content/raids/g9-1-4c.json','utf8'));
  const all=Object.values(raid.pools).flat();
  const mirror=all.find(q=>q.topic==='鏡子測高'),pre=all.find(q=>q.topic==='比例式（先備）');
  const duel=JSON.parse(readFileSync('content/duels/g8-2-2c.json','utf8'));
  const cum=duel.problems.find(p=>p.family==='√a × √b'),own=duel.problems.find(p=>p.family==='√a(√b ＋ c) 分配律');
  const base={answers:[],grades:{}};
  const r1=hwReal.sessionRecords({...base,session:{id:'s',lessonId:'g9-1-4c'},lesson:{slides:[]},raidRuns:[{id:'r',startedAt:0}],raidPlay:{r:{actions:[{t:1,seat:1,kind:'attack',q:mirror.id,ok:true},{t:2,seat:1,kind:'attack',q:pre.id,ok:false}]}}});
  assert.deepEqual(r1.map(x=>x.slot),['g9-1-4a:q2',undefined],'new raid id → links.raidTopics; prerequisite listed in raidSkip');
  const r2=hwReal.sessionRecords({...base,session:{id:'s',lessonId:'g8-2-2c'},lesson:{slides:[]},duelRuns:[{id:'d',startedAt:0}],duelPlay:{d:{actions:[{t:1,seat:1,p:cum.id,rule:'mul',ok:true},{t:2,seat:1,p:own.id,rule:'mul',ok:true}]}}});
  assert.deepEqual(r2.map(x=>x.slot),['g8-2-2a:q3','g8-2-2c:q5'],'cumulative family maps back to the lesson it came from');
  // 每一題魔王戰、每一個格鬥 family 都有對應（check-homework 的覆蓋檢查）
  const out=execFileSync(process.execPath,['scripts/check-homework.mjs'],{encoding:'utf8'});
  assert.match(out,/g9-1-4c/);
});

test('C-5: grading survives a failed write-back — the job stays queued under a lease and is retried after the lease expires',async()=>{
  let kicks=0,armed=false,writes=0;
  const {f,cl}=await homeworkSetup({APP_MODE:'demo'},{kick:async()=>{kicks++;},failPut:(k,v)=>armed&&k.startsWith('hw:')&&v.sheets?.['1']?.status==='graded'&&++writes===1});
  const {id,token}=await hwWithPhoto(f,cl);
  const sub=(await f.call(`/api/hw/${id}/1/submit?t=${token}`,'POST',{},'nobody')).body.sheet;
  assert.equal(sub.status,'queued');assert.equal(kicks,1,'alarm requested');
  assert.deepEqual(f.data.hwQueue,[`${id}:1`]);
  armed=true;
  await assert.rejects(drainHomework({env:f.env,store:f.store,vault:f.vault}),/Injected vault failure/);
  assert.deepEqual(f.data.hwQueue,[`${id}:1`],'job not dropped from the queue');
  assert.equal(storedHw(f,id).sheets['1'].status,'grading');
  const until=await drainHomework({env:f.env,store:f.store,vault:f.vault});
  assert(until>Date.now(),'another drain waits for the lease instead of grading twice');
  storedHw(f,id).sheets['1'].lease.until=0; // 租約到期（程序中斷或寫入失敗）
  assert.equal(await drainHomework({env:f.env,store:f.store,vault:f.vault}),undefined);
  assert.equal(storedHw(f,id).sheets['1'].status,'graded');assert.equal(storedHw(f,id).sheets['1'].lease,undefined);
  assert.deepEqual(f.data.hwQueue,[]);
  // alarm 排不進去：當場批改，不會卡在 queued
  const g=await homeworkSetup({APP_MODE:'demo'},{kick:async()=>{throw new Error('setAlarm rejected');}});
  const w=await hwWithPhoto(g.f,g.cl);
  assert.equal((await g.f.call(`/api/hw/${w.id}/1/submit?t=${w.token}`,'POST',{},'nobody')).body.sheet.status,'graded');
});

test('C-5: the Durable Object alarm reschedules itself when a write-back fails, and finishes the job later',async()=>{
  const values=new Map();let armed=false,hwWrites=0,alarmAt=null;
  const storage=memoryStorage(values,(k)=>armed&&k.startsWith('hw:')&&++hwWrites===2);
  storage.setAlarm=async(t)=>{alarmAt=t;};storage.getAlarm=async()=>alarmAt;
  const object=new ClassroomDurableObject({storage},{APP_MODE:'demo'});
  const request=(path,method='GET',body,cookie)=>new Request(`http://localhost${path}`,{method,headers:{Origin:'http://localhost','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:method==='GET'?undefined:JSON.stringify(body??{})});
  const cookie=(await object.fetch(request('/api/login','POST',TEACHER))).headers.get('Set-Cookie').split(';')[0];
  const cl=(await (await object.fetch(request('/api/dashboard','GET',null,cookie))).json()).classes[0];
  const created=await (await object.fetch(request('/api/homework','POST',{classId:cl.id,lessonId:'g8-2-2a',seats:[1]},cookie))).json();
  const id=created.homework.id,token=new URL(created.sheets[0].url).hash.split('/')[4];
  assert.equal((await object.fetch(request(`/api/hw/${id}/1/photos?t=${token}`,'POST',{dataUrl:JPEG}))).status,200);
  assert.equal((await (await object.fetch(request(`/api/hw/${id}/1/submit?t=${token}`,'POST',{}))).json()).sheet.status,'queued');
  assert(alarmAt,'submit schedules an alarm');
  alarmAt=null;armed=true; // 1st hw: write = lease, 2nd = result → fails
  await object.alarm();
  assert(alarmAt>=Date.now()+20_000,'retry scheduled after a failed write-back');
  assert.equal(values.get(`hw:${id}`).sheets['1'].status,'grading');
  assert.deepEqual((await splitStore(storage).read()).hwQueue,[`${id}:1`]);
  values.get(`hw:${id}`).sheets['1'].lease.until=0;
  alarmAt=null;
  await object.alarm();
  assert.equal(values.get(`hw:${id}`).sheets['1'].status,'graded');
  assert.deepEqual((await splitStore(storage).read()).hwQueue,[]);
  assert.equal(alarmAt,null,'nothing left to schedule');
});

/* ───── 2026-10-30 Codex 複審 R-2、R-3 的回歸測試 ───── */
test('R-2: a failed main-state write while submitting leaves nothing queued, does not use up a submission, and the student can submit again',async()=>{
  let kicks=0,failMain=false;
  const {f,cl}=await homeworkSetup({APP_MODE:'demo'},{kick:async()=>{kicks++;},failWrite:(next)=>failMain&&next.hwQueue?.length>0});
  const {id,token}=await hwWithPhoto(f,cl);
  failMain=true;
  const bad=await f.call(`/api/hw/${id}/1/submit?t=${token}`,'POST',{},'nobody');
  assert.notEqual(bad.status,200);
  const kept=storedHw(f,id).sheets['1'];
  assert.equal(kept.status,'assigned','sheet not stuck in queued');assert.equal(kept.submissions||0,0,'submission not used up');
  assert.equal(f.data.homework[id].sheets['1'].status,'assigned');assert.deepEqual(f.data.hwQueue||[],[]);
  assert.equal(kicks,0);
  failMain=false;
  const ok=await f.call(`/api/hw/${id}/1/submit?t=${token}`,'POST',{},'nobody');
  assert.equal(ok.status,200);assert.equal(ok.body.sheet.status,'queued');
  assert.deepEqual(f.data.hwQueue,[`${id}:1`]);assert.equal(kicks,1);
  assert.equal(storedHw(f,id).sheets['1'].submissions,1);
  assert.equal(await drainHomework({env:f.env,store:f.store,vault:f.vault}),undefined);
  assert.equal(storedHw(f,id).sheets['1'].status,'graded');assert.equal(f.data.homework[id].sheets['1'].status,'graded');
});

test('R-2: a failed sheet write while submitting is rolled back (or cleaned up by the alarm); the student can submit again',async()=>{
  let kicks=0,failSheet=false,failUndo=false;
  const {f,cl}=await homeworkSetup({APP_MODE:'demo'},{kick:async()=>{kicks++;},failPut:(k,v)=>failSheet&&k.startsWith('hw:')&&v.sheets?.['1']?.status==='queued',failWrite:(next)=>failUndo&&!next.hwQueue?.length});
  const {id,token}=await hwWithPhoto(f,cl);
  failSheet=true;
  assert.notEqual((await f.call(`/api/hw/${id}/1/submit?t=${token}`,'POST',{},'nobody')).status,200);
  assert.equal(storedHw(f,id).sheets['1'].status,'assigned');assert.equal(storedHw(f,id).sheets['1'].submissions||0,0);
  assert.deepEqual(f.data.hwQueue||[],[],'main state rolled back');assert.equal(f.data.homework[id].sheets['1'].status,'assigned');
  // 主檔也改不回來：佇列留著一個指到「還沒送出」作業卷的工作，請 alarm 來清；清的時候摘要一起改回來
  failUndo=true;
  assert.notEqual((await f.call(`/api/hw/${id}/1/submit?t=${token}`,'POST',{},'nobody')).status,200);
  assert.deepEqual(f.data.hwQueue,[`${id}:1`]);assert.equal(f.data.homework[id].sheets['1'].status,'queued');
  assert.equal(kicks,1,'alarm requested to clean up');
  failUndo=false;
  assert.equal(await drainHomework({env:f.env,store:f.store,vault:f.vault}),undefined);
  assert.deepEqual(f.data.hwQueue,[]);assert.equal(f.data.homework[id].sheets['1'].status,'assigned','summary rebuilt from the sheet');
  failSheet=false;
  const ok=await f.call(`/api/hw/${id}/1/submit?t=${token}`,'POST',{},'nobody');
  assert.equal(ok.status,200);assert.equal(ok.body.sheet.status,'queued');assert.equal(storedHw(f,id).sheets['1'].submissions,1);
  await drainHomework({env:f.env,store:f.store,vault:f.vault});
  assert.equal(storedHw(f,id).sheets['1'].status,'graded');
});

test('R-2 (Durable Object): a failed main-state transaction or sheet write while submitting does not leave the sheet queued without a job',async()=>{
  const values=new Map();let failMain=false,failSheet=false,alarmAt=null;
  // failMain：下一次主檔 transaction 失敗一次（Codex 複審的重現路徑）；failSheet：作業內容寫入失敗
  const storage=memoryStorage(values,(k)=>(failMain&&k.startsWith('main')&&!(failMain=false))||(failSheet&&k.startsWith('hw:')));
  storage.setAlarm=async(t)=>{alarmAt=t;};storage.getAlarm=async()=>alarmAt;
  const object=new ClassroomDurableObject({storage},{APP_MODE:'demo'});
  const request=(path,method='GET',body,cookie)=>new Request(`http://localhost${path}`,{method,headers:{Origin:'http://localhost','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:method==='GET'?undefined:JSON.stringify(body??{})});
  const cookie=(await object.fetch(request('/api/login','POST',TEACHER))).headers.get('Set-Cookie').split(';')[0];
  const cl=(await (await object.fetch(request('/api/dashboard','GET',null,cookie))).json()).classes[0];
  const created=await (await object.fetch(request('/api/homework','POST',{classId:cl.id,lessonId:'g8-2-2a',seats:[1]},cookie))).json();
  const id=created.homework.id,token=new URL(created.sheets[0].url).hash.split('/')[4];
  assert.equal((await object.fetch(request(`/api/hw/${id}/1/photos?t=${token}`,'POST',{dataUrl:JPEG}))).status,200);
  for(const fail of ['main','sheet']){
    if(fail==='main')failMain=true;else failSheet=true;
    assert.notEqual((await object.fetch(request(`/api/hw/${id}/1/submit?t=${token}`,'POST',{}))).status,200,fail);
    assert.equal(values.get(`hw:${id}`).sheets['1'].status,'assigned',fail);assert.equal(values.get(`hw:${id}`).sheets['1'].submissions||0,0,fail);
    assert.deepEqual((await splitStore(storage).read()).hwQueue||[],[],fail);
    failSheet=false;
  }
  assert.equal(alarmAt,null);
  failSheet=false;
  const ok=await object.fetch(request(`/api/hw/${id}/1/submit?t=${token}`,'POST',{}));
  assert.equal(ok.status,200,'not 409: the student can submit again');
  assert.equal((await ok.json()).sheet.status,'queued');assert(alarmAt,'alarm scheduled');
  await object.alarm();
  assert.equal(values.get(`hw:${id}`).sheets['1'].status,'graded');assert.equal(values.get(`hw:${id}`).sheets['1'].submissions,1);
});

test('R-3: result saved to the sheet but the main-state write failed — the retry fixes the summary before dropping the job',async()=>{
  let failMain=false;
  const {f,cl}=await homeworkSetup({APP_MODE:'demo'},{kick:async()=>{},failWrite:(next)=>failMain&&Object.values(next.homework||{}).some(h=>h.sheets['1']?.status==='graded')});
  const {id,token}=await hwWithPhoto(f,cl);
  assert.equal((await f.call(`/api/hw/${id}/1/submit?t=${token}`,'POST',{},'nobody')).body.sheet.status,'queued');
  failMain=true;
  await assert.rejects(drainHomework({env:f.env,store:f.store,vault:f.vault}),/Injected store failure/);
  assert.equal(storedHw(f,id).sheets['1'].status,'graded','result is in the sheet');
  assert.equal(f.data.homework[id].sheets['1'].status,'grading','summary is stale');
  assert.deepEqual(f.data.hwQueue,[`${id}:1`]);
  failMain=false;
  assert.equal(await drainHomework({env:f.env,store:f.store,vault:f.vault}),undefined);
  assert.deepEqual(f.data.hwQueue,[]);
  const meta=f.data.homework[id].sheets['1'],r=storedHw(f,id).sheets['1'].result;
  assert.equal(meta.status,'graded');assert.equal(meta.score,r.score);assert.equal(meta.max,r.max);
  assert.equal((await f.call('/api/homework')).body.homework.find(h=>h.id===id).sheets['1'].status,'graded','teacher list shows graded');
});

test('C-6 / C-16: a failed re-upload (bad image or storage failure) keeps the previous photos and result',async()=>{
  let failPhoto=false;
  const {f,cl}=await homeworkSetup({APP_MODE:'demo'},{failPut:(k)=>failPhoto&&k.startsWith('hwphoto:')});
  const {id,token}=await hwWithPhoto(f,cl);
  assert.equal((await f.call(`/api/hw/${id}/1/submit?t=${token}`,'POST',{},'nobody')).body.sheet.status,'graded');
  const old=storedHw(f,id).sheets['1'].photos[0].id;
  const bad=await f.call(`/api/hw/${id}/1/photos?t=${token}`,'POST',{dataUrl:'data:image/jpeg;base64,!!!!',restart:true},'nobody');
  assert.equal(bad.status,400);
  const kept=storedHw(f,id).sheets['1'];
  assert.equal(kept.status,'graded');assert(kept.result);assert.deepEqual(kept.photos.map(p=>p.id),[old]);
  assert(f.vaultMap.has(`hwphoto:${id}/1/${old}`),'old photo still stored');
  failPhoto=true;
  assert.notEqual((await f.call(`/api/hw/${id}/1/photos?t=${token}`,'POST',{dataUrl:JPEG,restart:true},'nobody')).status,200);
  assert.equal(storedHw(f,id).sheets['1'].status,'graded');assert(f.vaultMap.has(`hwphoto:${id}/1/${old}`));
  // 用戶端重試同一個 restart 請求（旗標沒有被清掉）就成功，舊照片這時才刪
  failPhoto=false;
  const ok=await f.call(`/api/hw/${id}/1/photos?t=${token}`,'POST',{dataUrl:JPEG,restart:true},'nobody');
  assert.equal(ok.status,200);assert.equal(ok.body.sheet.status,'assigned');assert.equal(ok.body.sheet.photos.length,1);
  assert(!f.vaultMap.has(`hwphoto:${id}/1/${old}`));
});

test('C-6 (Durable Object): at most 6 photos, one photo ≤ 1,900,000 characters; rejected uploads store nothing',async()=>{
  const {f,cl}=await homeworkSetup();
  const {id,token}=await hwWithPhoto(f,cl);
  const up=(dataUrl,extra={})=>f.call(`/api/hw/${id}/1/photos?t=${token}`,'POST',{dataUrl,...extra},'nobody');
  for(let k=2;k<=6;k++)assert.equal((await up(JPEG)).status,200,`photo ${k}`);
  const photoKeys=()=>[...f.vaultMap.keys()].filter(k=>k.startsWith(`hwphoto:${id}/1/`)).sort();
  const six=photoKeys();
  assert.equal(six.length,6);assert.equal(storedHw(f,id).sheets['1'].photos.length,6);
  assert.equal((await up(JPEG)).status,429,'7th photo rejected');
  assert.deepEqual(photoKeys(),six,'nothing stored for the rejected 7th photo');
  // 刪掉一張再傳：清單先寫入再刪照片，Durable Object 裡也真的刪掉
  const gone=storedHw(f,id).sheets['1'].photos[0].id;
  assert.equal((await f.call(`/api/hw/${id}/1/photos/${gone}?t=${token}`,'DELETE',{},'nobody')).status,200);
  assert(!f.vaultMap.has(`hwphoto:${id}/1/${gone}`));
  assert.equal(storedHw(f,id).sheets['1'].photos.length,5);
  // 單張大小：1,900,000 字元以內才收；太大的不寫入任何東西
  const head='data:image/jpeg;base64,';
  const big=head+'A'.repeat(1_900_000-head.length+4);
  assert.equal((await up(big)).status,400,'over 1,900,000 characters');
  assert.equal(photoKeys().length,5);
  const max=head+'A'.repeat(1_900_000-head.length);
  assert.equal((await up(max)).status,200,'exactly at the limit is accepted');
  assert.equal(photoKeys().length,6);
});

test('C-6 (Durable Object): deleting homework, a class, or old photos really removes the photos stored in the Durable Object',async()=>{
  const {f,cl}=await homeworkSetup();
  const created=await f.call('/api/homework','POST',{classId:cl.id,lessonId:'g8-2-2a',seats:[1,2]});
  const id=created.body.homework.id;
  for(const sh of created.body.sheets){
    const t=new URL(sh.url).hash.split('/')[4];
    for(let k=0;k<2;k++)assert.equal((await f.call(`/api/hw/${id}/${sh.seat}/photos?t=${t}`,'POST',{dataUrl:JPEG},'nobody')).status,200);
  }
  const mine=()=>[...f.vaultMap.keys()].filter(k=>k.startsWith(`hwphoto:${id}/`)||k.startsWith(`hwq:${id}/`)||k===`hw:${id}`);
  assert.equal(mine().length,4+2+1,'4 photos, 2 frozen sheets, 1 homework');
  assert.equal((await f.call(`/api/homework/${id}`,'DELETE',{})).status,200);
  assert.deepEqual(mine(),[],'photos, frozen questions and the homework are all gone');
  assert.equal(f.data.homework[id],undefined);
  // 清除舊照片：照片清單先寫入，Durable Object 裡的照片真的刪掉，批改結果保留
  const w=await hwWithPhoto(f,cl);
  assert.equal((await f.call(`/api/hw/${w.id}/1/submit?t=${w.token}`,'POST',{},'nobody')).body.sheet.status,'graded');
  const hw=storedHw(f,w.id);hw.sheets['1'].photos[0].at='2020-01-01T00:00:00.000Z';f.vaultMap.set(`hw:${w.id}`,hw);
  assert.equal((await f.call('/api/settings/prune-photos','POST',{days:7})).body.removed,1);
  assert(![...f.vaultMap.keys()].some(k=>k.startsWith(`hwphoto:${w.id}/`)));
  assert.equal(storedHw(f,w.id).sheets['1'].photos.length,0);assert(storedHw(f,w.id).sheets['1'].result,'result kept');
  // 刪除班級：該班的作業與照片一起刪
  const v=await hwWithPhoto(f,cl);
  assert.equal((await f.call(`/api/classes/${cl.id}`,'DELETE',{withRecords:true})).status,200);
  assert(![...f.vaultMap.keys()].some(k=>k.startsWith(`hwphoto:${v.id}/`)||k.startsWith(`hwq:${v.id}/`)||k===`hw:${v.id}`));
});

test('C-9: each assigned sheet keeps a frozen copy of its questions; later bank edits do not change it',async()=>{
  const {f,cl}=await homeworkSetup();
  const created=await f.call('/api/homework','POST',{classId:cl.id,lessonId:'g8-2-2a',seats:[1]});
  const id=created.body.homework.id;
  const frozen=f.vaultMap.get(`hwq:${id}/1`);
  assert.equal(frozen.length,10);assert.deepEqual(frozen.map(q=>q.stem),created.body.sheets[0].questions.map(q=>q.stem));
  assert.equal(storedHw(f,id).sheets['1'].frozen,true);
  // 讀的是凍結的版本（不是目前題庫）
  frozen[0].answer='$999$';f.vaultMap.set(`hwq:${id}/1`,frozen);
  assert.equal((await f.call(`/api/homework/${id}`)).body.sheets[0].questions[0].answer,'$999$');
  // 函式層：題庫改了，凍結的作業卷不變；學生在批改前拿不到答案
  const sheet={seat:1,items:[{lessonId:'g8-2-2a',slot:'q1',variant:0}],frozen:true};
  const stored=hwLib.bankQuestions(sheet.items);
  const vault={async get(k){return k==='hwq:h/1'?structuredClone(stored):undefined;}};
  const snap=await hwLib.questionsOf(vault,'h',sheet,true);
  const bankVariant=hwLib.homeworkBank('g8-2-2a').slots[0].variants[0],before=bankVariant.answer;
  bankVariant.answer='$0$';
  try{
    assert.equal((await hwLib.questionsOf(vault,'h',sheet,true))[0].answer,snap[0].answer);
    assert.equal((await hwLib.questionsOf(vault,'h',sheet,false))[0].answer,undefined);
    assert.equal((await hwLib.questionsOf(vault,'h',{...sheet,frozen:false},true))[0].answer,'$0$','unfrozen legacy sheets read the bank');
  }finally{bankVariant.answer=before;}
  // 刪除作業連凍結的題目一起刪
  await f.call(`/api/homework/${id}`,'DELETE',{});
  assert(![...f.vaultMap.keys()].some(k=>k.startsWith(`hwq:${id}/`)));
});

test('C-10: AI results are matched strictly by question number; missing, duplicate or out-of-range numbers become null',()=>{
  const n=(items,count=3)=>hwLib.normalizeHomework({items},count,1,'live').items.map(x=>x.correct);
  assert.deepEqual(n([{n:2,correct:true}]),[null,true,null],'item 1 is not borrowed from item 2');
  assert.deepEqual(n([{n:3,correct:false},{n:1,correct:true},{n:2,correct:true}]),[true,true,false],'out of order');
  assert.deepEqual(n([{n:1,correct:true},{n:1,correct:false},{n:2,correct:true},{n:9,correct:true}]),[null,true,null],'duplicate → null, out of range ignored');
  assert.deepEqual(n([{n:'2',correct:false},{correct:true}]),[null,false,null],'once numbers are used, unnumbered items are not placed by position');
  assert.deepEqual(n([{correct:true},{correct:false},{correct:null}]),[true,false,null],'no numbers at all → by position');
  assert.equal(hwLib.normalizeHomework({items:[{n:2,correct:true}]},3,1,'live').score,1);
});

test('C-11: every raid "perimeter → area" question describes a triangle that can exist',()=>{
  const raid=JSON.parse(readFileSync('content/raids/g9-1-4c.json','utf8'));
  const items=Object.values(raid.pools).flat().filter(q=>q.topic==='由周長比求面積');
  assert(items.length>=2);
  for(const q of items){
    const [p1,p2,a1]=[...q.stem.matchAll(/\$(\d+(?:\.\d+)?)\$/g)].map(m=>Number(m[1]));
    const max=p=>p*p/(12*Math.sqrt(3));
    assert(a1<max(p1),`${q.id}: perimeter ${p1} cannot enclose area ${a1}`);
    const a2=a1*(p2/p1)**2;
    assert(a2<max(p2),`${q.id}: perimeter ${p2} cannot enclose area ${a2}`);
  }
});

test('C-12: the backup says what it does not contain (homework is not backed up yet)',async()=>{
  const {f,cl}=await homeworkSetup();
  await hwWithPhoto(f,cl);
  const backup=(await f.call('/api/backup')).body;
  assert.deepEqual(backup.excludes,['homework','photos','credentials']);
  assert.equal(backup.homework,undefined);
});

// 回家作業紅筆「圈出做錯的步驟」
{
  const ok={wrong:'2x=13+3',why:'+3 移項要變號',fix:'改成 2x=13−3'};
  const reply=(extra={},step=ok)=>({items:[{n:1,correct:false,read:'x=8',comment:'移項要變號',photo:0,x:.7,y:.5,lines:[{i:1,text:'2x+3=13',photo:0,box:[.1,.4,.4,.44]},{i:2,text:'2x=13+3',photo:0,box:[.1,.46,.4,.5]}],step:{line:2,...step},...extra}],feedback:'加油'});
  const norm=(raw,photos=2)=>hwLib.normalizeHomework(raw,1,photos,'live').items[0];

  test('red-pen step: the wrong line gets a box, right answers and unreadable ones do not',()=>{
    const m=norm(reply());
    assert.deepEqual(m.step,{...ok,photo:0,box:[.1,.46,.4,.5]});
    assert.equal(m.lines,undefined,'the transcription of every line is not stored');
    assert.equal(norm(reply({correct:true})).step,undefined,'right answers are never circled');
    assert.equal(norm(reply({correct:null})).step,undefined,'unreadable answers are never circled');
    assert.equal(norm({items:[{n:1,correct:false,comment:'x'}]}).step,undefined,'older AI reply without step');
    // 錯的內容沒寫時用那一行的抄寫
    assert.equal(norm(reply({},{why:'x',fix:'y'})).step.wrong,'2x=13+3');
    assert.equal(norm(reply({},{wrong:'',why:'',fix:'y',line:99})).step,undefined,'nothing to say → no step');
  });

  test('red-pen step: untrustworthy coordinates degrade to text only',()=>{
    const withBox=box=>({...reply(),items:[{...reply().items[0],lines:[{i:2,text:'2x=13+3',photo:0,box}]}]});
    const bad={
      missing:undefined,'not an array':'0.1,0.2,0.3,0.4','three numbers':[.1,.2,.3],'five numbers':[.1,.2,.3,.4,.5],
      'null value':[.1,null,.3,.4],'string value':['.1','.2','.3','.4'],NaN:[NaN,.2,.3,.4],infinity:[.1,.2,Infinity,.4],
      negative:[-.1,.2,.3,.4],'over 1':[.1,.2,1.2,.4],'0–100 scale':[10,20,40,30],'0–1000 scale':[100,200,400,250],
      'left and right swapped':[.4,.2,.1,.3],'top and bottom swapped':[.1,.3,.4,.2],'zero size':[.1,.2,.1,.2],
      'too small':[.1,.2,.105,.204],'too narrow':[.1,.2,.11,.3],'too flat':[.1,.2,.5,.203],'too tall':[.4,.1,.5,.6],'nearly the whole page':[0,0,1,1],'half the page':[.05,.05,.95,.34+.05],
    };
    for(const [name,box] of Object.entries(bad)){
      const m=norm(withBox(box));
      assert.deepEqual(m.step,ok,`${name}: keeps the text, no coordinates`);
      assert.equal(stepLib.stepRing(m.step,0),undefined,name);
    }
    assert.deepEqual(norm(withBox([.05,.2,.95,.28])).step.box,[.05,.2,.95,.28],'a long full-width line is fine');
    // 照片編號不對、行號對不到、行號重複
    const line=(lines,step=2)=>norm({items:[{n:1,correct:false,lines,step:{line:step,...ok}}]}).step;
    const box=[.1,.46,.4,.5];
    assert.deepEqual(line([{i:2,photo:2,box}]),ok,'photo out of range');
    assert.deepEqual(line([{i:2,photo:-1,box}]),ok);
    assert.deepEqual(line([{i:2,photo:.5,box}]),ok);
    assert.deepEqual(line([{i:2,photo:'0',box}]),ok);
    assert.deepEqual(line([{i:2,box}]),ok,'photo missing');
    assert.deepEqual(line([{i:1,photo:0,box}]),ok,'line number not found');
    assert.deepEqual(line([{i:2,photo:0,box},{i:2,photo:0,box:[.1,.6,.4,.64]}]),ok,'duplicate line number: do not guess');
    assert.deepEqual(line('oops'),ok,'lines is not a list');
    assert.deepEqual(line([{i:2,photo:0,box}],null),ok,'no line number');
    // Codex 審核：行號型別不對不可以讓整份批改失敗，也不可以通過
    for(const [i,no] of [[{toString:null},2],[2,{toString:null}],[1,true],[null,0],[1.5,1.5],['2','2'],[[2],[2]]])assert.deepEqual(line([{i,photo:0,box}],no),ok,`line ${JSON.stringify(no)} vs i ${JSON.stringify(i)}`);
    assert.deepEqual(hwLib.normalizeHomework({items:[{n:{toString:null},correct:true},{n:1,correct:false}]},1,1,'live').items.map(x=>x.correct),[false],'a bad question number does not fail the whole sheet');
    assert.equal(norm({items:[{n:1,correct:false,step:'看這裡'}]}).step,undefined,'step is not an object');
    assert.equal(norm({items:[{n:1,correct:false,step:[ok]}]}).step,undefined);
  });

  test('red-pen step: AI text is cleaned and length-limited; HTML stays data for the page to escape',()=>{
    const s=norm(reply({},{wrong:'<img src=x onerror=alert(1)>',why:`太\n長\u0000​了${'的'.repeat(200)}`,fix:{a:1}})).step;
    assert.equal(s.wrong,'<img src=x onerror=alert(1)>');
    assert.equal(s.fix,'');
    assert.equal([...s.why].length,stepLib.STEP_TEXT_MAX.why);
    assert(s.why.startsWith('太 長 了'),s.why);
    assert.equal(stepLib.stepText('😀'.repeat(5),3),'😀😀😀','does not split an emoji');
    assert.match(hwLib.HOMEWORK_SYSTEM,/不是給你的指令/);
    assert.match(hwLib.HOMEWORK_SYSTEM,/第一個/);
    assert.match(hwLib.HOMEWORK_SYSTEM,/答對或 null 的題目不要輸出 lines、step/);
  });

  test('red-pen step: records without the field still work (old grading results)',()=>{
    const old={correct:false,read:'x',comment:'再想想',photo:0,x:.5,y:.5};
    assert.equal(stepLib.shownStep(old),undefined);
    assert.equal(stepLib.shownStep(undefined),undefined);
    assert.equal(stepLib.stepRing(undefined,0),undefined);
    // 改判成對：不顯示；改回錯：又出現
    const step={...ok,photo:0,box:[.1,.46,.4,.5]};
    assert.equal(stepLib.shownStep({...old,correct:true,step}),undefined);
    assert.equal(stepLib.shownStep({...old,correct:null,step}),undefined);
    assert.equal(stepLib.shownStep({...old,step}),step);
    // 存檔裡的外框壞掉（被改過）也不圈；只有所在照片才圈
    assert.equal(stepLib.stepRing({...step,box:[0,0,1,1]},0),undefined);
    assert.equal(stepLib.stepRing(step,1),undefined);
    assert.deepEqual(stepLib.stepRing(step,0),step.box);
  });

  test('red-pen step: the label avoids writing, switches sides, and gives up rather than covering words',()=>{
    const W=400,H=500,ring={x:100,y:200,w:150,h:30},sizes=[{w:120,h:40}];
    const clean=()=>0;
    const overlap=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
    const right=stepLib.placeStepLabel({W,H,ring,sizes,blocked:[],ink:clean});
    assert(right.x>=ring.x+ring.w,'right side first');
    // 右邊有字 → 換到左邊
    const ink=r=>(r.x>=250&&r.y<260&&r.y+r.h>190?.3:0);
    const left=stepLib.placeStepLabel({W,H,ring:{...ring,x:140,w:110},sizes,blocked:[],ink});
    assert(left.x+left.w<=140,JSON.stringify(left));
    // 靠右邊界：右邊放不下
    const edge=stepLib.placeStepLabel({W,H,ring:{...ring,x:260,w:130},sizes,blocked:[],ink:clean});
    assert(edge.x+edge.w<=W&&!overlap(edge,{...ring,x:260,w:130}));
    // 其他紅筆、其他圈
    const other={x:0,y:0,w:W,h:195},other2={x:0,y:235,w:W,h:40};
    const under=stepLib.placeStepLabel({W,H,ring:{...ring,w:300},sizes,blocked:[other,other2],ink:clean});
    assert(under&&!overlap(under,other)&&!overlap(under,other2)&&under.y>=275);
    // 四周都有字 → 掃到遠處的空白；整張都是字 → null
    const far=r=>(r.y+r.h<=120?0:.2);
    const spot=stepLib.placeStepLabel({W,H,ring,sizes,blocked:[],ink:far});
    assert(spot&&spot.y+spot.h<=120);
    assert.equal(stepLib.placeStepLabel({W,H,ring,sizes,blocked:[],ink:()=>.2}),null);
    assert(stepLib.placeStepLabel({W,H,ring,sizes,blocked:[],ink:()=>stepLib.STEP_INK_LIMIT}),'a few specks are fine');
    assert.equal(stepLib.placeStepLabel({W:100,H:40,ring:{x:0,y:0,w:100,h:40},sizes,blocked:[],ink:clean}),null,'does not fit anywhere');
  });

  test('step ring tightens to the gaps around the line, or gives up; leader lines avoid ink and other marks; fields count code points',()=>{
    const W=400,H=600,box={x:100,y:100,w:120,h:12};
    const inkFrom=(...areas)=>r=>areas.reduce((n,a)=>{
      const w=Math.min(r.x+r.w,a.x+a.w)-Math.max(r.x,a.x),h=Math.min(r.y+r.h,a.y+a.h)-Math.max(r.y,a.y);
      return n+(w>0&&h>0?Math.ceil(w*h):0);
    },0);
    const plan=(inkCount,others=[])=>stepLib.planStepRing({W,H,box,pad:{x:6,y:5},seed:11,inkCount,others});
    const target={x:100,y:100,w:120,h:12};
    // 四周都空：原本的手繪圈（白底 6、紅線 3）
    const open=plan(inkFrom(target));
    assert.equal(open.pen,3);
    assert.equal(open.halo,6);
    // 下一行只隔 4 px：線變細、留白收緊，線條（含厚度）不碰下一行
    const next={x:100,y:116,w:120,h:12};
    const tight=plan(inkFrom(target,next));
    assert(tight,'still circled');
    assert(tight.pen<3&&tight.halo===0,JSON.stringify([tight.pen,tight.halo]));
    assert(tight.points.every(([,y])=>y+tight.reach<=next.y),'stays above the next line');
    assert(tight.rect.y<=box.y&&tight.rect.y+tight.rect.h>=box.y+box.h,'still wraps the line');
    // 完全沒有空隙：取消
    assert.equal(plan(inkFrom(target,{x:100,y:112.5,w:120,h:12})),null);
    assert.equal(plan(inkFrom(target,{x:0,y:90,w:400,h:40})),null,'box cuts through other writing');
    // 被圈的那一行也算筆跡：線條（含厚度）不能壓到（Codex 第 2 次複審 B4）
    const clear=(p,ink)=>p.points.every(([x,y])=>ink({x:x-p.pen/2,y:y-p.pen/2,w:p.pen,h:p.pen})===0);
    assert(clear(open,inkFrom(target)),'stays off the circled line');
    assert(clear(tight,inkFrom(target,next)),'stays off both lines');
    // 上下空隙只有 2 px，放不下 2 px 的線（加安全邊）：取消
    assert.equal(plan(inkFrom(target,{x:100,y:114,w:120,h:12})),null);
    // 筆畫超出外框一點點：線繞到字外面
    const over={x:100,y:98,w:120,h:16};
    assert(clear(plan(inkFrom(over)),inkFrom(over)),'goes around strokes past the box');
    // 外框切過字（上面還有一大段）：取消，不沿著框壓字
    assert.equal(plan(inkFrom({x:60,y:80,w:200,h:50})),null);
    // 碰到別的圈也取消
    const other=stepLib.planStepRing({W,H,box:{x:100,y:118,w:120,h:12},pad:{x:6,y:5},seed:3,inkCount:inkFrom(target),others:[]});
    assert.equal(plan(inkFrom(target),[other]),null);

    const ring=open,noInk=inkFrom();
    const leader=(label,inkCount=noInk,blocked=[],lines=[])=>stepLib.stepLeader({label,ring,inkCount,blocked,lines});
    assert.equal(leader({x:ring.rect.x+ring.rect.w+2,y:100,w:40,h:20}),'touching');
    const far={x:100,y:400,w:100,h:30};
    const line=leader(far);
    assert(line&&line!=='touching'&&line.y1===400&&line.y2>box.y+box.h,JSON.stringify(line));
    // 路上整排都是字：這個位置不能用
    const wall={x:0,y:300,w:W,h:20};
    assert.equal(leader(far,inkFrom(wall)),null);
    // 有洞就走洞
    const viaGap=leader(far,inkFrom({x:0,y:300,w:150,h:20},{x:170,y:300,w:230,h:20}));
    assert(viaGap&&viaGap!=='touching','goes through the gap');
    // 其他批註、別條連線也不能穿過
    assert.equal(leader(far,noInk,[wall]),null);
    assert.equal(leader(far,noInk,[],[{x1:0,y1:300,x2:W,y2:300}]),null);

    // 小題號只找圈旁，不掃全圖
    const sizes=[{w:20,h:20}];
    const blockedNear=r=>(r.y<300?.2:0);
    assert.equal(stepLib.placeStepLabel({W,H,ring:ring.rect,sizes,blocked:[],ink:blockedNear,near:true}),null);
    assert(stepLib.placeStepLabel({W,H,ring:ring.rect,sizes,blocked:[],ink:blockedNear}),'a label may search the whole page');
    // 連不回圈的位置不算
    assert.equal(stepLib.placeStepLabel({W,H,ring:ring.rect,sizes,blocked:[],ink:()=>0,link:()=>false}),null);

    const X='\u{1D465}';
    assert.deepEqual(stepLib.clipStepInput(X.repeat(60),120,60),{value:X.repeat(60),caret:120});
    assert.deepEqual(stepLib.clipStepInput(X.repeat(61),122,60),{value:X.repeat(60),caret:120});
    assert.deepEqual(stepLib.clipStepInput(`a${X.repeat(70)}bc`,141,60),{value:`a${X.repeat(57)}bc`,caret:115},'keeps what is after the caret');
    assert.deepEqual(stepLib.clipStepInput('abc',1,60),{value:'abc',caret:1});
  });

  async function stepSheet(f){
    const cl=(await f.call('/api/dashboard')).body.classes.find(c=>c.code==='DEMO801');
    const created=(await f.call('/api/homework','POST',{classId:cl.id,lessonId:'g8-2-2a',seats:[1]})).body;
    const id=created.homework.id,token=new URL(created.sheets[0].url).hash.split('/')[4];
    assert.equal((await f.call(`/api/hw/${id}/1/photos?t=${token}`,'POST',{dataUrl:STEP_JPEG},'nobody')).status,200);
    return {id,token,cl};
  }
  const STEP_JPEG='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

  test('red-pen step: a mocked AI reply goes through grading to the student view; no real AI call',async()=>{
    const {f}=await setup();
    const original=globalThis.fetch,calls=[];
    try{
      globalThis.fetch=async(url,options)=>{
        calls.push({url:String(url),body:JSON.parse(options.body)});
        return Response.json({choices:[{message:{content:JSON.stringify({items:[
          {n:1,read:'x=8',correct:false,comment:'移項要變號',photo:0,x:.7,y:.5,lines:[{i:1,text:'2x+3=13',photo:0,box:[.1,.4,.4,.44]},{i:2,text:'2x=13+3',photo:0,box:[.1,.46,.4,.5]}],step:{line:2,...ok}},
          {n:2,read:'5',correct:true,comment:'很棒',photo:0,x:.7,y:.6,lines:[{i:1,photo:0,box:[.1,.6,.4,.64]}],step:{line:1,...ok}},
          {n:3,read:'?',correct:false,comment:'再想想',step:{line:1,...ok},lines:[{i:1,photo:0,box:[0,0,1,1]}]},
        ],feedback:'加油'})}}]});
      };
      assert.equal((await f.call('/api/settings/ai','PUT',{provider:'openai',baseUrl:'https://api.openai.com/v1',model:'gpt-6-luna',apiKey:'sk-test-fake-key',dailyLimit:50})).status,200);
      const {id,token}=await stepSheet(f);
      const sheet=(await f.call(`/api/hw/${id}/1/submit?t=${token}`,'POST',{},'nobody')).body.sheet;
      assert.equal(calls.length,1);
      assert.equal(calls[0].body.messages[0].content,hwLib.HOMEWORK_SYSTEM);
      assert.equal(calls[0].body.max_completion_tokens,18000,'budget for per-line boxes');
      assert.equal(sheet.status,'graded');
      assert.equal(sheet.result.mode,'live');
      assert.deepEqual(sheet.result.items[0].step,{...ok,photo:0,box:[.1,.46,.4,.5]});
      assert.equal(sheet.result.items[1].step,undefined,'right answer not circled');
      assert.deepEqual(sheet.result.items[2].step,ok,'bad box → text only');
      const again=(await f.call(`/api/hw/${id}/1?t=${token}`,'GET',null,'nobody')).body.sheet;
      assert.deepEqual(again.result.items[0].step,sheet.result.items[0].step,'student reads it back');
    }finally{globalThis.fetch=original;}
  });

  test('red-pen step: the teacher can rewrite or delete it; re-grading replaces it; old photos lose only the circle',async()=>{
    const {f}=await setup();
    const {id,token}=await stepSheet(f);
    const graded=(await f.call(`/api/hw/${id}/1/submit?t=${token}`,'POST',{},'nobody')).body.sheet;
    const n=graded.result.items.findIndex(x=>x.correct===false)+1;
    const right=graded.result.items.findIndex(x=>x.correct===true)+1;
    const first=graded.result.items[n-1].step;
    assert(first.box&&first.why,'demo grading shows the flow too');
    assert.equal(graded.result.items[right-1].step,undefined);
    const path=`/api/homework/${id}/1/items/${n}`;
    // 權限與驗證
    assert.equal((await f.call(path,'PUT',{step:{why:'x'}},'student')).status,403);
    assert.equal((await f.call(path,'PUT',{step:{why:'x'}},'nobody')).status,401);
    assert.equal((await f.call(path,'PUT',{step:'x'})).status,400);
    assert.equal((await f.call(path,'PUT',{step:[]})).status,400);
    assert.equal((await f.call(path,'PUT',{step:{fix:'只有改法'}})).status,400);
    assert.equal((await f.call(path,'PUT',{step:{why:'的'.repeat(61)}})).status,400);
    assert.equal((await f.call(path,'PUT',{step:{why:7}})).status,400);
    // AI 能寫的長度，老師就能存回去：字數以字元計（𝑥 的 length 是 2）
    assert.equal((await f.call(path,'PUT',{step:{wrong:'𝑥'.repeat(60),why:'x'}})).status,200);
    assert.equal((await f.call(path,'PUT',{step:{wrong:'𝑥'.repeat(61),why:'x'}})).status,400);
    assert.equal((await f.call(path,'PUT',{})).status,400,'still needs a verdict or a step');
    assert.equal((await f.call(`/api/homework/${id}/1/items/${right}`,'PUT',{step:{why:'x'}})).status,409,'right answers have no wrong step');
    // 改寫：說明換掉，圈的位置不能由請求改，不算改判
    const score=graded.result.score;
    const edited=(await f.call(path,'PUT',{step:{wrong:'第二行',why:'老師寫的<b>原因</b>',fix:'這樣改',box:[0,0,1,1],photo:5}})).body.sheet;
    const m=edited.result.items[n-1];
    assert.deepEqual(m.step,{wrong:'第二行',why:'老師寫的<b>原因</b>',fix:'這樣改',photo:first.photo,box:first.box,teacher:true});
    assert.equal(m.teacher,undefined,'rewriting the note is not a change of verdict');
    assert.equal(edited.result.score,score);
    // 學生立刻看到
    assert.equal((await f.call(`/api/hw/${id}/1?t=${token}`,'GET',null,'nobody')).body.sheet.result.items[n-1].step.why,'老師寫的<b>原因</b>');
    // 改判成對再改回錯：說明還在
    assert.equal((await f.call(path,'PUT',{correct:true})).body.sheet.result.items[n-1].step.why,'老師寫的<b>原因</b>');
    assert.equal((await f.call(path,'PUT',{correct:false})).body.sheet.result.items[n-1].teacher,true);
    // 刪除
    const removed=(await f.call(path,'PUT',{step:null})).body.sheet.result.items[n-1];
    assert.equal(removed.step,undefined);
    assert.equal(removed.correct,false,'deleting the circle keeps the verdict and the mark');
    assert(removed.x!==undefined&&removed.comment);
    // 老師自己加的：只有文字
    const added=(await f.call(path,'PUT',{step:{why:'老師加的'}})).body.sheet.result.items[n-1].step;
    assert.deepEqual(added,{wrong:'',why:'老師加的',fix:'',teacher:true});
    // 重新批改：整份換新
    const regraded=(await f.call(`/api/homework/${id}/1/regrade`,'POST',{})).body.sheet;
    assert.deepEqual(regraded.result.items[n-1].step,first);
    // 清除舊照片：批改結果與說明留著，圈拿掉
    const hw=f.vaultMap.get(`hw:${id}`);hw.sheets['1'].photos[0].at=new Date(Date.now()-864e5*30).toISOString();
    assert.equal((await f.call('/api/settings/prune-photos','POST',{days:7})).body.removed,1);
    const pruned=(await f.call(`/api/homework/${id}`)).body.sheets[0].result.items[n-1];
    assert.equal(pruned.step.why,first.why);
    assert.equal(pruned.step.box,undefined);
    assert.equal(pruned.step.photo,undefined);
  });
}
