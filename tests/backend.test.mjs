import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir=await mkdtemp(join(tmpdir(),'classroom-backend-'));
await build({entryPoints:[resolve('worker/app.ts'),resolve('worker/storage.ts'),resolve('worker/index.ts'),resolve('worker/ai.ts'),resolve('shared/expr.ts')],outdir:dir,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},logLevel:'silent'});
const {handleApi}=await import(pathToFileURL(join(dir,'worker','app.mjs')).href);
const {SupabaseStore,DurableStore,MAX_SNAPSHOT_BYTES}=await import(pathToFileURL(join(dir,'worker','storage.mjs')).href);
const {ClassroomDurableObject}=await import(pathToFileURL(join(dir,'worker','index.mjs')).href);
const {aggregateVotes,normalizeGrade,extractJson,isReasoning}=await import(pathToFileURL(join(dir,'worker','ai.mjs')).href);
const expr=await import(pathToFileURL(join(dir,'shared','expr.mjs')).href);
const TEACHER={role:'teacher',account:'teacher',password:'11235813'};
test.after(()=>rm(dir,{recursive:true,force:true}));

function memoryStorage(values=new Map(),failKey=()=>false) {
  const methods=map=>({
    async get(key){const v=map.get(key);return v===undefined?undefined:structuredClone(v);},
    async put(key,value){if(failKey(key))throw new Error('Injected storage failure');if(value instanceof Uint8Array)assert(value.byteLength<=65536);map.set(key,structuredClone(value));},
    async delete(key){return map.delete(key);},
  });
  return {...methods(values),async transaction(operation){const copy=structuredClone(values);const result=await operation(methods(copy));values.clear();for(const [key,value]of copy)values.set(key,value);return result;}};
}

function fixture(env={APP_MODE:'demo'}) {
  let data;const vaultMap=new Map();
  const vault={async get(k){const v=vaultMap.get(k);return v===undefined?undefined:structuredClone(v);},async put(k,v){vaultMap.set(k,structuredClone(v));},async delete(k){return vaultMap.delete(k);}};
  const store={async read(){return data&&structuredClone(data);},async write(next){data=structuredClone(next);}};
  const cookies=new Map();
  return {
    get data(){return data;},vaultMap,
    async call(path,method='GET',body,user='teacher',origin='http://localhost') {
      const headers={'Origin':origin};
      if(cookies.has(user))headers.Cookie=cookies.get(user);
      if(method!=='GET')headers['Content-Type']='application/json';
      const response=await handleApi(new Request(`http://localhost${path}`,{method,headers,body:method!=='GET'?JSON.stringify(body??{}):undefined}),{store,env,vault});
      if(response.headers.has('Set-Cookie'))cookies.set(user,response.headers.get('Set-Cookie').split(';')[0]);
      const type=response.headers.get('Content-Type')||'';
      return {status:response.status,body:type.includes('json')?await response.json():await response.arrayBuffer(),headers:response.headers};
    },
  };
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

test('backup excludes secrets; valid restore works; malformed input cannot commit; class reset revokes student session',async()=>{
  const {f,session}=await setup();
  const backup=(await f.call('/api/backup')).body;
  assert(!/codeHash|cloudAccessToken|logins|secret|DEMO01|11235813|apiKey/.test(JSON.stringify(backup)));
  assert.equal((await f.call('/api/restore','POST',{backup})).status,200);
  const snapshot=JSON.stringify(f.data.lessons);
  const malformed={...backup,lessons:[{...backup.lessons[0],title:'Bad'},{}]};
  assert.equal((await f.call('/api/restore','POST',{backup:malformed})).status,400);
  assert.equal(JSON.stringify(f.data.lessons),snapshot);
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
  const selected=[];for(let i=0;i<40;i++)selected.push((await f.call(`/api/sessions/${session.id}/control`,'POST',{action:'draw'})).body.session.drawnSeat);
  assert.equal(new Set(selected).size,40);
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
    assert.equal(Object.values((await new DurableStore(storage).read()).aiUsage)[0],1);
  }finally{finishProvider?.(Response.json({choices:[{message:{content:'測試清理'}}]}));globalThis.fetch=original;}
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
  assert.equal(graded.body.mode,'mock');assert.equal(graded.body.grade.max,8);assert.equal(graded.body.grade.needsReview,true);
  assert.equal((await f.call(`/api/sessions/${session.id}`,'GET',null,'student')).body.grades.length,0,'unreleased grade hidden');
  const edit=await f.call(`/api/sessions/${session.id}/grades/${answer.body.answer.id}`,'PUT',{scores:[{criterionId:'find',score:2},{criterionId:'expand',score:3},{criterionId:'model',score:99}],feedback:'很好'});
  assert.equal(edit.body.grade.total,8,'scores snap to the nearest rubric level');assert.equal(edit.body.grade.mode,'teacher');
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
      const scores=[2,3,n++===2?1:3];
      const reply={transcript:'(2x+3)^2=4x^2+12x+9',scores:[{criterionId:'find',score:scores[0]},{criterionId:'expand',score:scores[1]},{criterionId:'model',score:scores[2]}],feedback:'做得好',confidence:0.9,annotations:[{mark:'circle',x:.1,y:.2,x2:.5,y2:.3},{mark:'note',x:.6,y:.2,text:'這裡'}]};
      return Response.json({choices:[{message:{content:'```json\n'+JSON.stringify(reply)+'\n```'}}]});
    };
    const result=await call('/api/ai','POST',{task:'grade',sessionId:session.id,answerId:answer.id,votes:3},t);
    assert.equal(bodies.length,3);
    assert(bodies.every(b=>b.max_completion_tokens&&!('temperature' in b)&&!('max_tokens' in b)),'reasoning models use max_completion_tokens');
    assert.equal(bodies[0].messages[1].content[1].image_url.url,PNG);
    assert.equal(result.grade.total,8);assert.deepEqual([...result.grade.votes].sort(),[6,8,8]);
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

test('simplest radical form and multi-item numeric questions are judged per item',async()=>{
  for(const ok of ['2√3','3+2√2','√6/3','-5√2','7','(3+√2)/2','2sqrt(3)','√(15)'])assert.equal(expr.isSimplestRadical(ok),true,ok);
  for(const bad of ['√12','1/√2','√2+√2','4√8','√4','3+1+√2','2√3/√3'])assert.equal(expr.isSimplestRadical(bad),false,bad);
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
