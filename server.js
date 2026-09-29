'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {XMLParser} = require('fast-xml-parser');
const {schedule} = require('./review');
const {normalWord,validCard,importBackup,localSenses,collapseWords}=require('./model');
const {DatabaseSync} = require('node:sqlite');
const root = __dirname;
const supabaseUrl=String(process.env.SUPABASE_URL||'').replace(/\/$/,''),supabaseKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||''),cloudMode=!!(supabaseUrl&&supabaseKey);
const dir = process.env.WORD_GARDEN_DATA || path.join(process.env.LOCALAPPDATA || root,'WordGarden','data');
if(!cloudMode)fs.mkdirSync(dir,{recursive:true});
const port = Number(process.env.PORT || process.env.WORD_GARDEN_PORT || 8788),bindHost=process.env.HOST|| (cloudMode?'0.0.0.0':'127.0.0.1');
const token = crypto.randomBytes(24).toString('hex');
let cloudStore={},persistChain=Promise.resolve(),state={cards:[],history:[],trash:[]},settings={};
function read(name, fallback) { if(cloudMode)return cloudStore[name]===undefined?structuredClone(fallback):structuredClone(cloudStore[name]);const p=path.join(dir,name+'.json'); return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):fallback; }
function supabaseHeaders(){const headers={apikey:supabaseKey};if(!supabaseKey.startsWith('sb_secret_'))headers.Authorization='Bearer '+supabaseKey;return headers;}
async function persistCloud(snapshot){const r=await fetch(supabaseUrl+'/rest/v1/word_garden_store?on_conflict=id',{method:'POST',headers:{...supabaseHeaders(),'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:'main',value:snapshot,updated_at:new Date().toISOString()}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('雲端資料保存失敗（'+r.status+'）');}
async function loadCloud(){if(!cloudMode)return;const r=await fetch(supabaseUrl+'/rest/v1/word_garden_store?id=eq.main&select=value',{headers:supabaseHeaders(),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('雲端資料讀取失敗（'+r.status+'）');const rows=await r.json();cloudStore=rows[0]?.value&&typeof rows[0].value==='object'?rows[0].value:{};}
async function write(name,value) { if(cloudMode){cloudStore[name]=structuredClone(value);const snapshot=structuredClone(cloudStore);persistChain=persistChain.then(()=>persistCloud(snapshot));return persistChain;}const p=path.join(dir,name+'.json'); fs.writeFileSync(p+'.tmp',JSON.stringify(value,null,2));fs.renameSync(p+'.tmp',p); }
async function commit(next){await write('words',next);state=next;}
const dbPath=[path.join(root,'ecdict.sqlite'),path.join(root,'../ecdict.sqlite')].find(fs.existsSync);
function localLookup(word){if(!dbPath)return;const db=new DatabaseSync(dbPath,{readOnly:true});try{return db.prepare('SELECT word,phonetic,translation,definition FROM entries WHERE lookup = ?').get(word);}finally{db.close();}}
const openccPath=[path.join(root,'opencc.js'),path.join(root,'../opencc.js')].find(fs.existsSync);
if(!openccPath)throw Error('找不到繁體中文轉換資料。');
const traditional=require(openccPath).Converter({from:'cn',to:'twp'});
const clean = value => String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,s)=>{const n=s[0].toLowerCase()==='x'?parseInt(s.slice(1),16):Number(s);return n>=0&&n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/&rsquo;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
const day = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function remote(url,options={}) { const r=await fetch(url,{...options,signal:AbortSignal.timeout(20000)}); if(!r.ok) throw Error('外部服務暫時無法使用（'+r.status+'）'); return r; }
async function translate(texts) {
 if(!settings.deepl) throw Error('尚未連接翻譯服務。請在設定輸入 DeepL API 金鑰；原文仍可閱讀。');
 const host=settings.deepl.endsWith(':fx')?'api-free.deepl.com':'api.deepl.com';
 const r=await remote('https://'+host+'/v2/translate',{method:'POST',headers:{Authorization:'DeepL-Auth-Key '+settings.deepl,'Content-Type':'application/json'},body:JSON.stringify({text:texts,source_lang:'EN',target_lang:'ZH-HANT'})});
 const d=await r.json(); if(!Array.isArray(d.translations)||d.translations.length!==texts.length) throw Error('翻譯回應不完整，請重試。');return d.translations.map(t=>t.text);
}
async function translateReading(texts) {
 if(settings.deepl)return {values:await translate(texts),provider:'DeepL'};
 try {
  // Send the title and article in one request. Two simultaneous requests are
  // frequently rate-limited by the public endpoint on shared hosting IPs.
  const marker='WG_TRANSLATION_SPLIT_7F3A9C',joined=texts.join('\n\n'+marker+'\n\n');
  const url='https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q='+encodeURIComponent(joined);
  const d=await (await remote(url,{headers:{'User-Agent':'Mozilla/5.0'}})).json();
  const translated=Array.isArray(d?.[0])?d[0].map(x=>Array.isArray(x)?x[0]||'':'').join('').trim():'';
  const values=translated.split(marker).map(value=>value.trim());
  if(values.length!==texts.length||values.some(value=>!value))throw Error('incomplete');
  return {values,provider:'Google 翻譯'};
 } catch {
  const values=[];
  for(const text of texts){
   const chunks=[];let rest=text.trim();
   while(rest.length>450){let end=rest.lastIndexOf(' ',450);if(end<250)end=450;chunks.push(rest.slice(0,end));rest=rest.slice(end).trim();}
   if(rest)chunks.push(rest);
   const translated=[];
   for(const chunk of chunks){
    const url='https://api.mymemory.translated.net/get?langpair=en%7Czh-TW&q='+encodeURIComponent(chunk);
    const d=await (await remote(url,{headers:{'User-Agent':'Mozilla/5.0'}})).json();
    const value=String(d?.responseData?.translatedText||'').trim();
    if(!value||Number(d?.responseStatus||200)>=400)throw Error('中文翻譯暫時無法使用，請稍後再試。');
    translated.push(value);
   }
   values.push(translated.join(' '));
  }
  return {values,provider:'MyMemory 翻譯'};
 }
}
let newsPending;
async function news() {
 const cache=read('news',null); if(cache?.day===day()) return {...cache,text:clean(cache.text)};
 if(newsPending)return newsPending;
 newsPending=(async()=>{
  try {
   const xml=await (await remote('https://www.nasa.gov/feed/')).text();
   const parsed=new XMLParser({ignoreAttributes:false,processEntities:true}).parse(xml);
   const items=[parsed?.rss?.channel?.item||[]].flat();
   const history=read('articles',[]);
   const eligible=items.filter(i=>{try{return new URL(i.link).hostname.endsWith('.nasa.gov') && clean(i.description).length>100 && !/APOD:|image of the day/i.test(i.title);}catch{return false;}}).sort((a,b)=>Date.parse(b.pubDate)-Date.parse(a.pubDate));
   const item=eligible.find(i=>!history.includes(i.link));
   if(!item) {if(cache)return {...cache,notice:'目前沒有新的合適文章，保留上次閱讀內容。'};throw Error('來源目前沒有合適的新文章，請稍後再試。');}
   const article={day:day(),title:clean(item.title),url:item.link,published:item.pubDate,text:clean(item.description),source:'NASA 官方 RSS 摘要',notice:'這是來源提供的摘要，不是完整文章。',zh:''};
   if(settings.deepl) {try {const t=await translate([article.title,article.text]);article.zhTitle=t[0];article.zh=t[1];article.translationProvider='DeepL';}catch(e){article.translationError=e.message;}}
   await write('news',article);await write('articles',[...history,item.link].slice(-1000));return article;
  }catch(e){if(cache)return {...cache,notice:'更新失敗，顯示上次保存的文章：'+e.message};throw e;}
 })();try{return await newsPending;}finally{newsPending=null;}
}
const publicFiles={'/':'index.html','/app/':'index.html','/app.js':'app.js','/style.css':'style.css','/review.js':'review.js'};
const appUsername=String(process.env.APP_USERNAME||'wordgarden'),appPassword=String(process.env.APP_PASSWORD||'');
const sessionToken=appPassword?crypto.createHmac('sha256',appPassword).update('word-garden:'+appUsername).digest('hex'):'';
function safeEqual(a,b){const supplied=Buffer.from(String(a)),expected=Buffer.from(String(b));return supplied.length===expected.length&&crypto.timingSafeEqual(supplied,expected);}
function validLogin(req){if(!appPassword)return true;const cookie=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('wg_session='));if(cookie&&safeEqual(cookie.slice(11),sessionToken))return true;const raw=String(req.headers.authorization||'');if(!raw.startsWith('Basic '))return false;try{const decoded=Buffer.from(raw.slice(6),'base64').toString('utf8'),split=decoded.indexOf(':');return split>=0&&decoded.slice(0,split)===appUsername&&safeEqual(decoded.slice(split+1),appPassword);}catch{return false;}}
function loginPage(message=''){return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登入拾字</title><style>body{margin:0;background:#f6f2e9;color:#26352d;font:16px system-ui;display:grid;place-items:center;min-height:100vh}.box{width:min(360px,calc(100% - 48px));background:#fff;padding:34px;border-radius:20px;box-shadow:0 18px 55px #26352d18}h1{margin:0 0 8px}p{color:#68756e}label{display:block;margin:18px 0 6px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #bdc7c0;border-radius:10px;font:inherit}button{width:100%;margin-top:24px;padding:12px;border:0;border-radius:10px;background:#315d47;color:#fff;font:inherit;font-weight:700}.error{color:#a33}</style></head><body><main class="box"><h1>拾字</h1><p>登入後繼續照顧你的英文小花園。</p>${message?`<p class="error">${message}</p>`:''}<form method="post" action="/login"><label>帳號</label><input name="username" autocomplete="username" required><label>密碼</label><input name="password" type="password" autocomplete="current-password" required><button>登入</button></form></main></body></html>`;}
const server=http.createServer(async(req,res)=>{
 function send(status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));}
 try {
  const u=new URL(req.url,'http://127.0.0.1:'+port);
  if(u.pathname==='/health'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end('ok');}
  if(!cloudMode&&!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)) return send(403,{error:'僅限本機使用'});
  if(u.pathname==='/login'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});return res.end(loginPage());}
  if(u.pathname==='/login'&&req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)break;}const form=new URLSearchParams(raw),ok=form.get('username')===appUsername&&safeEqual(form.get('password')||'',appPassword);if(ok){res.writeHead(303,{Location:'/app/','Set-Cookie':'wg_session='+sessionToken+'; Path=/; HttpOnly; Secure; SameSite=Strict','Cache-Control':'no-store'});return res.end();}res.writeHead(401,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});return res.end(loginPage('帳號或密碼不正確，請再試一次。'));}
  if(!validLogin(req)){if(req.method==='GET'&&!u.pathname.startsWith('/api/')){res.writeHead(303,{Location:'/login','Cache-Control':'no-store'});return res.end();}return send(401,{error:'請先登入拾字。'});}
  if(publicFiles[u.pathname]&&req.method==='GET'){let content=fs.readFileSync(path.join(root,publicFiles[u.pathname]),'utf8');if(publicFiles[u.pathname]==='index.html')content=content.replace('__TOKEN__',token);res.writeHead(200,{'Content-Type':u.pathname.endsWith('.js')?'text/javascript; charset=utf-8':u.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});return res.end(content);}
  if(!u.pathname.startsWith('/api/'))return send(404,{error:'找不到頁面'});
  if(req.headers['x-app-token']!==token)return send(403,{error:'連線已更新，請重新載入頁面後再試。'});
  let body={};if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>5e6)return send(413,{error:'資料過大'});}body=JSON.parse(raw||'{}');}
  if(u.pathname==='/api/state'&&req.method==='GET') return send(200,{...state,settings:{mw:!!settings.mw,deepl:!!settings.deepl},storage:cloudMode?'cloud':'local'});
  if(u.pathname==='/api/backup'&&req.method==='POST'){
   const backup={version:1,exportedAt:new Date().toISOString(),cards:state.cards,history:state.history};
   const name='backup-'+day()+'-'+Date.now();if(!cloudMode)await write(name,backup);
   return send(200,{backup,path:cloudMode?'':path.join(dir,name+'.json'),filename:name+'.json',cloud:cloudMode});
  }
  if(u.pathname==='/api/settings'&&req.method==='POST'){for(const k of ['mw','deepl'])if(typeof body[k]==='string'&&body[k].length<=300)settings[k]=body[k].trim();await write('settings',settings);return send(200,{ok:true});}
  if(u.pathname==='/api/lookup'&&req.method==='GET'){
   const word=normalWord(u.searchParams.get('word'));if(!/^[a-z][a-z '-]{0,79}$/.test(word))throw Error('請輸入英文單字或片語，不需加編號。');
   if(settings.mw){const data=await(await remote('https://www.dictionaryapi.com/api/v3/references/learners/json/'+encodeURIComponent(word)+'?key='+encodeURIComponent(settings.mw))).json();
    if(!Array.isArray(data))throw Error('字典回應格式有誤，請檢查金鑰。');
    const entries=data.filter(x=>x&&typeof x==='object');
    const senses=entries.flatMap(e=>(e.shortdef||[]).map(d=>({meaning:clean(d),part:e.fl||''})));
    let warning='';if(settings.deepl&&senses.length){try{const ts=await translate(senses.slice(0,40).map(s=>s.meaning));ts.forEach((t,i)=>{senses[i].english=senses[i].meaning;senses[i].meaning=t;});}catch(e){warning=e.message;}}
    return send(200,{word,source:'Merriam-Webster Learner’s Dictionary',sourceUrl:'https://www.merriam-webster.com/dictionary/'+encodeURIComponent(word),phonetic:entries[0]?.hwi?.prs?.[0]?.ipa||'',senses,related:[...new Set(entries.flatMap(e=>e.meta?.stems||[]))].filter(s=>s.toLowerCase()!==word).slice(0,8),warning,translated:!!senses[0]?.english,suggestions:data.filter(x=>typeof x==='string').slice(0,5)});
   }
   const entry=localLookup(word);return send(200,{word,source:'ECDICT 開源字典（非出版社授權字典）',sourceUrl:'https://github.com/skywind3000/ECDICT',phonetic:entry?.phonetic||'',senses:entry?localSenses(traditional(entry.translation||entry.definition||'')):[],related:[],warning:'目前使用開源字典；常用與少見意思可能混列，可到 Cambridge 核對語境。出版社字典可在設定連接。'});
  }
  if(u.pathname==='/api/save'&&req.method==='POST'){
   const word=normalWord(body.word),meaning=String(body.meaning||'').trim();
   const previous=body.id?state.cards.find(c=>c.id===body.id):null;
   if(body.id&&!previous)throw Error('找不到要修改的單字');
   const card={...(previous||{id:crypto.randomUUID(),due:Date.now(),interval:0,reviews:0}),word,meaning,primaryMeaning:String(body.primaryMeaning||''),example:String(body.example||'').trim(),note:String(body.note||'').trim(),source:String(body.source||'自行記錄'),sourceUrl:String(body.sourceUrl||''),dictionaryNotes:String(body.dictionaryNotes||''),phonetic:String(body.phonetic||'')};
   if(!validCard(card))throw Error('單字或解釋格式不正確，請確認長度與內容。');
   if(state.cards.some(c=>c.id!==card.id&&c.word===word))throw Error('這個單字已收集，請到單字本編輯。');
   if(previous&&previous.word!==word){card.due=Date.now();card.interval=0;card.reviews=0;delete card.lastReview;delete card.lastRating;}
   const next=structuredClone(state);if(previous)next.cards[state.cards.indexOf(previous)]=card;else next.cards.push(card);await commit(next);return send(200,card);
  }
  if(u.pathname==='/api/review'&&req.method==='POST'){
   const i=state.cards.findIndex(c=>c.id===body.id);if(i<0||!Number.isInteger(body.rating)||body.rating<0||body.rating>3)throw Error('複習資料不正確');
   if(state.cards[i].due>Date.now())throw Error('這張卡片已完成複習，請重新整理。');
   const next=structuredClone(state);next.cards[i]=schedule(next.cards[i],body.rating);next.history.push({id:body.id,rating:body.rating,at:Date.now(),day:day()});await commit(next);return send(200,state.cards[i]);
  }
  if(u.pathname==='/api/delete'&&req.method==='POST'){const card=state.cards.find(c=>c.id===body.id);if(!card)throw Error('這個意思已不存在，請重新整理。');const next=structuredClone(state);next.cards=next.cards.filter(c=>c.id!==body.id);next.trash.push({...card,deletedAt:Date.now()});await commit(next);return send(200,{ok:true});}
  if(u.pathname==='/api/restore'&&req.method==='POST'){const card=state.trash.find(c=>c.id===body.id);if(!card)throw Error('找不到要還原的單字。');if(state.cards.some(c=>c.word===card.word))throw Error('這個單字已在單字本，回收區內容仍保留。');const next=structuredClone(state);const restored={...card};delete restored.deletedAt;next.cards.push(restored);next.trash=next.trash.filter(c=>c.id!==body.id);await commit(next);return send(200,{ok:true});}
  if(u.pathname==='/api/import'&&req.method==='POST'){
   const {next,added,historyAdded}=importBackup(state,body);await write(cloudMode?'before-import':'before-import-'+Date.now(),state);await commit(next);return send(200,{added,historyAdded});
  }
  if(u.pathname==='/api/news'&&req.method==='GET')return send(200,await news());
  if(u.pathname==='/api/news/translate'&&req.method==='POST'){const a=read('news',null);if(!a)throw Error('請先載入文章。');if(!a.zh){const t=await translateReading([a.title,a.text]);a.zhTitle=t.values[0];a.zh=t.values[1];a.translationProvider=t.provider;delete a.translationError;await write('news',a);}return send(200,a);}
  return send(404,{error:'找不到功能'});
 }catch(e){send(400,{error:e.message||'操作失敗，請稍後再試。'});}
});
async function start(){await loadCloud();state=read('words',{cards:[],history:[],trash:[]});settings=read('settings',{});state.trash||=[];const consolidated=collapseWords(state);if(consolidated.cards.length!==state.cards.length){await write('before-one-word-migration',state);await write('words',consolidated);state=consolidated;}server.listen(port,bindHost,()=>console.log('Word Garden listening on '+bindHost+':'+port+(cloudMode?' with cloud storage':' with local storage')));}
start().catch(e=>{console.error('Startup failed:',e.message);process.exitCode=1;});
