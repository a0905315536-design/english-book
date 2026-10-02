'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const {spawn}=require('node:child_process');

function listen(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});}
function stopped(child){return new Promise(resolve=>{child.once('exit',resolve);child.kill();setTimeout(()=>child.kill('SIGKILL'),2000).unref();});}

(async()=>{
 let saved={},authorizationHeader;
 const database=http.createServer(async(req,res)=>{
  authorizationHeader=req.headers.authorization;
  let raw='';for await(const chunk of req)raw+=chunk;
  res.setHeader('Content-Type','application/json');
  if(req.method==='GET')return res.end(saved.value?JSON.stringify([{value:saved.value}]):'[]');
  if(req.method==='POST'){saved=JSON.parse(raw);res.statusCode=201;return res.end('{}');}
  res.statusCode=404;res.end('{}');
 });
 const dbPort=await listen(database),appPort=41000+Math.floor(Math.random()*1000);
 const child=spawn(process.execPath,['server.js'],{cwd:__dirname,env:{...process.env,SUPABASE_URL:`http://127.0.0.1:${dbPort}`,SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test-key',PORT:String(appPort)},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server timeout')),10000);child.stdout.on('data',chunk=>{if(String(chunk).includes('listening')){clearTimeout(timer);resolve();}});child.once('exit',code=>reject(Error('server exited early: '+code)));});
  assert.equal((await fetch(`http://127.0.0.1:${appPort}/health`)).status,200);
  const page=await fetch(`http://127.0.0.1:${appPort}/app/`);assert.equal(page.status,200);
  const html=await page.text();assert.ok(html.includes('拾字'));
  for(const legacy of ['/login','/register','/recover','/logout']){const redirect=await fetch(`http://127.0.0.1:${appPort}${legacy}`,{redirect:'manual'});assert.equal(redirect.status,303);assert.equal(redirect.headers.get('location'),'/app/');}
  const token=html.match(/name="app-token" content="([^"]+)"/)[1];
  const card={word:'cloud',meaning:'雲端',primaryMeaning:'雲端',example:'',note:'',source:'test',sourceUrl:'',dictionaryNotes:'',phonetic:''};
  const response=await fetch(`http://127.0.0.1:${appPort}/api/save`,{method:'POST',headers:{'x-app-token':token,'content-type':'application/json'},body:JSON.stringify(card)});
  assert.equal(response.status,200);
  assert.equal(saved.value.words.cards[0].word,'cloud');
  const reviewed=await fetch(`http://127.0.0.1:${appPort}/api/review`,{method:'POST',headers:{'x-app-token':token,'content-type':'application/json'},body:JSON.stringify({id:saved.value.words.cards[0].id,rating:1})});
  assert.equal(reviewed.status,200);const reviewedCard=await reviewed.json();assert.equal(reviewedCard.lastRating,1);assert.equal(saved.value.words.history.at(-1).rating,1);
  assert.equal(authorizationHeader,undefined);
  const state=await (await fetch(`http://127.0.0.1:${appPort}/api/state`,{headers:{'x-app-token':token}})).json();
  assert.equal(state.storage,'cloud');assert.equal(state.cards.length,1);assert.ok(state.syncAt);
  const reading=await fetch(`http://127.0.0.1:${appPort}/api/reading/complete`,{method:'POST',headers:{'x-app-token':token,'content-type':'application/json'},body:'{}'});assert.equal(reading.status,200);assert.equal(saved.value.words.readingDays.length,1);
  console.log('PASS: direct access, legacy login redirects, cloud storage and health check');
 }finally{await stopped(child);await new Promise(resolve=>database.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
