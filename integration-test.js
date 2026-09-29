const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'word-garden-test-'));
 const child=spawn(process.execPath,['--use-system-ca','server.js'],{cwd:__dirname,env:{...process.env,WORD_GARDEN_PORT:'8790',WORD_GARDEN_DATA:dir},stdio:['ignore','pipe','pipe']});
 try{
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',c=>reject(Error('server exit '+c)));});
 const base='http://127.0.0.1:8790';const html=await(await fetch(base)).text(),token=html.match(/name="app-token" content="([^"]+)"/)[1];
 async function api(p,b){const r=await fetch(base+'/api/'+p,{method:b?'POST':'GET',headers:{'X-App-Token':token,'Content-Type':'application/json'},...(b?{body:JSON.stringify(b)}:{})});return {status:r.status,data:await r.json()};}
 assert.equal((await fetch(base+'/api/state')).status,403);
 assert.equal((await fetch(base+'/data/settings.json')).status,404);
 const lookup=await api('lookup?word=helpful');assert.ok(lookup.data.senses.length>0);
 const first=await api('save',{word:'bank',meaning:'銀行',example:'I went to the bank.'});assert.equal(first.status,200);
 assert.equal((await api('save',{word:'bank',meaning:'銀行'})).status,400);
 assert.equal((await api('save',{word:' BANK ',meaning:'河岸'})).status,400);
 const reviewed=await api('review',{id:first.data.id,rating:3});assert.ok(reviewed.data.due>Date.now()+6*86400000);
 assert.equal((await api('review',{id:first.data.id,rating:3})).status,400);
 assert.equal((await api('import',{version:1,cards:[{word:'broken'}]})).status,400);
 const backup=(await api('state')).data;assert.equal((await api('import',{version:1,cards:backup.cards})).data.added,0);
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'words.json'))).cards.length,1);
 assert.equal((await api('news/translate',{})).status,400);
 const examples={qualification:'This qualification is required for the job.',attire:'Formal attire is required for the interview.',credential:'This credential proves that she completed the training.',vacancy:'There is a vacancy in the sales department.',duty:'It is my duty to help our customers.'};
 const meanings={qualification:'資格',attire:'服裝',credential:'憑據',vacancy:'空缺',duty:'責任'};
 for(const [w,example] of Object.entries(examples)){
  const d=(await api('lookup?word='+w)).data;assert.ok(d.senses.some(s=>s.meaning===meanings[w]),w+' missing sense');
  const c=(await api('save',{word:w,meaning:meanings[w],example,dictionaryNotes:d.senses.map(s=>s.meaning).join('\n')})).data;
  assert.equal((await api('review',{id:c.id,rating:Object.keys(examples).indexOf(w)%4})).status,200);
  assert.equal((await api('delete',{id:c.id})).status,200);
  const removed=(await api('state')).data;assert.ok(!removed.cards.some(x=>x.id===c.id));assert.ok(removed.trash.some(x=>x.id===c.id));
  assert.equal((await api('restore',{id:c.id})).status,200);
 }
 const all=(await api('state')).data;
 assert.equal((await api('import',{version:1,cards:all.cards,history:all.history})).data.historyAdded,0);
 const old=all.cards.find(c=>c.word==='duty');
 const edit=(await api('save',{...old,meaning:'責任／職務',primaryMeaning:'責任／職務'})).data;assert.equal(edit.reviews,old.reviews);assert.equal(edit.due,old.due);assert.equal(edit.primaryMeaning,'責任／職務');
 const renamed=(await api('save',{...edit,word:'duties'})).data;assert.equal(renamed.reviews,0);assert.ok(renamed.due<=Date.now()+1000);
 assert.equal((await api('state')).data.cards.length,6);
 const exported=await api('backup',{});assert.equal(exported.status,200);
 assert.equal(path.dirname(exported.data.path),dir);
 const diskBackup=JSON.parse(fs.readFileSync(exported.data.path,'utf8'));
 assert.deepEqual(diskBackup,exported.data.backup);assert.equal(diskBackup.cards.length,6);
 assert.equal(diskBackup.settings,undefined);assert.equal(diskBackup.trash,undefined);
 console.log('PASS: export saves a real local backup with matching cards/history and no service keys.');
 console.log('PASS: five words, four ratings, recoverable deletion, history, editing explanations preserves progress; renaming resets progress.');
 console.log('PASS: token protection, private files, real offline lookup, save, duplicate prevention, separate senses, schedule, duplicate rating, import validation, persistence, missing translation setup');
 console.log('Test data isolated in temporary directory.');
 }finally{child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});

