'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {XMLParser} = require('fast-xml-parser');
const cheerio = require('cheerio');
const {schedule} = require('./review');
const {normalWord,validCard,importBackup,localSenses,collapseWords}=require('./model');
const {DatabaseSync} = require('node:sqlite');
const root = __dirname;
const supabaseUrl=String(process.env.SUPABASE_URL||'').replace(/\/$/,''),supabaseKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||''),cloudMode=!!(supabaseUrl&&supabaseKey);
const dir = process.env.WORD_GARDEN_DATA || path.join(process.env.LOCALAPPDATA || root,'WordGarden','data');
if(!cloudMode)fs.mkdirSync(dir,{recursive:true});
const port = Number(process.env.PORT || process.env.WORD_GARDEN_PORT || 8788),bindHost=process.env.HOST|| (cloudMode?'0.0.0.0':'127.0.0.1');
const token = crypto.randomBytes(24).toString('hex');
let cloudStore={},persistChain=Promise.resolve();
const emptyState=()=>({cards:[],history:[],trash:[]});
function accountBucket(accountId='main',create=false){
 if(accountId==='main')return cloudStore;
 if(create){cloudStore.users||={};cloudStore.users[accountId]||={};}
 return cloudStore.users?.[accountId]||{};
}
function read(name, fallback, accountId='main') { if(cloudMode){const bucket=accountBucket(accountId);return bucket[name]===undefined?structuredClone(fallback):structuredClone(bucket[name]);}const prefix=accountId==='main'?'':accountId+'-';const p=path.join(dir,prefix+name+'.json'); return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):structuredClone(fallback); }
function supabaseHeaders(){const headers={apikey:supabaseKey};if(!supabaseKey.startsWith('sb_secret_'))headers.Authorization='Bearer '+supabaseKey;return headers;}
async function persistCloud(snapshot){const r=await fetch(supabaseUrl+'/rest/v1/word_garden_store?on_conflict=id',{method:'POST',headers:{...supabaseHeaders(),'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:'main',value:snapshot,updated_at:new Date().toISOString()}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('雲端資料保存失敗（'+r.status+'）');}
async function loadCloud(){if(!cloudMode)return;const r=await fetch(supabaseUrl+'/rest/v1/word_garden_store?id=eq.main&select=value',{headers:supabaseHeaders(),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('雲端資料讀取失敗（'+r.status+'）');const rows=await r.json();cloudStore=rows[0]?.value&&typeof rows[0].value==='object'?rows[0].value:{};}
async function write(name,value,accountId='main') { if(cloudMode){accountBucket(accountId,true)[name]=structuredClone(value);const snapshot=structuredClone(cloudStore);persistChain=persistChain.then(()=>persistCloud(snapshot));return persistChain;}const prefix=accountId==='main'?'':accountId+'-';const p=path.join(dir,prefix+name+'.json'); fs.writeFileSync(p+'.tmp',JSON.stringify(value,null,2));fs.renameSync(p+'.tmp',p); }
const dbPath=[path.join(root,'ecdict.sqlite'),path.join(root,'../ecdict.sqlite')].find(fs.existsSync);
function localLookup(word){if(!dbPath)return;const db=new DatabaseSync(dbPath,{readOnly:true});try{return db.prepare('SELECT word,phonetic,translation,definition FROM entries WHERE lookup = ?').get(word);}finally{db.close();}}
const openccPath=[path.join(root,'opencc.js'),path.join(root,'../opencc.js')].find(fs.existsSync);
if(!openccPath)throw Error('找不到繁體中文轉換資料。');
const traditional=require(openccPath).Converter({from:'cn',to:'twp'});
const clean = value => String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,s)=>{const n=s[0].toLowerCase()==='x'?parseInt(s.slice(1),16):Number(s);return n>=0&&n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/&rsquo;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
const day = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function remote(url,options={}) { const r=await fetch(url,{...options,signal:AbortSignal.timeout(20000)}); if(!r.ok) throw Error('外部服務暫時無法使用（'+r.status+'）'); return r; }
async function fullArticle(url,fallback=''){
 try{
  const parsed=new URL(url);if(!parsed.hostname.endsWith('nasa.gov'))throw Error('unsupported source');
  const html=await (await remote(url,{headers:{'User-Agent':'Mozilla/5.0 WordGarden/1.0'}})).text(),$=cheerio.load(html);
  const rootEl=$('.entry-content').first().length?$('.entry-content').first():$('article').first();
  if(!rootEl.length)throw Error('article body unavailable');
  rootEl.find('script,style,nav,aside,form,button,svg,figure,noscript').remove();
  const seen=new Set(),parts=[];
  rootEl.find('h2,h3,h4,p,li').each((_,el)=>{if(el.tagName==='li'&&$(el).find('p,li').length)return;const value=clean($.html(el));if(value.length<20||seen.has(value))return;seen.add(value);parts.push(value);});
  const text=parts.join('\n\n').trim();if(text.length<300)throw Error('article body too short');
  return {text:text.slice(0,40000),fullArticle:true,notice:'完整正文取自 NASA 文章頁。'};
 }catch{return {text:clean(fallback),fullArticle:false,notice:'完整正文暫時無法取得，目前顯示來源摘要。'};}
}
async function translate(texts,settings) {
 if(!settings.deepl) throw Error('尚未連接翻譯服務。請在設定輸入 DeepL API 金鑰；原文仍可閱讀。');
 const host=settings.deepl.endsWith(':fx')?'api-free.deepl.com':'api.deepl.com';
 const r=await remote('https://'+host+'/v2/translate',{method:'POST',headers:{Authorization:'DeepL-Auth-Key '+settings.deepl,'Content-Type':'application/json'},body:JSON.stringify({text:texts,source_lang:'EN',target_lang:'ZH-HANT'})});
 const d=await r.json(); if(!Array.isArray(d.translations)||d.translations.length!==texts.length) throw Error('翻譯回應不完整，請重試。');return d.translations.map(t=>t.text);
}
async function translateReading(texts,settings) {
 if(settings.deepl)return {values:await translate(texts,settings),provider:'DeepL'};
 try {
  const values=[];
  for(const text of texts){const translated=[];for(const chunk of textChunks(text)){const url='https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q='+encodeURIComponent(chunk),d=await (await remote(url,{headers:{'User-Agent':'Mozilla/5.0'}})).json(),value=Array.isArray(d?.[0])?d[0].map(x=>Array.isArray(x)?x[0]||'':'').join('').trim():'';if(!value)throw Error('incomplete');translated.push(value);}values.push(translated.join('\n\n'));}
  return {values,provider:'Google 翻譯'};
 } catch {
  try {
   const userAgent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36 Edg/153';
   const page=await remote('https://www.bing.com/translator',{headers:{'User-Agent':userAgent}}),html=await page.text();
   const ig=html.match(/IG:"([^"]+)"/)?.[1],iid=html.match(/data-iid="([^"]+)"/)?.[1];
   const match=html.match(/params_AbusePreventionHelper\s?=\s?([^\]]+\])/),params=match&&JSON.parse(match[1]);
   if(!ig||!iid||!Array.isArray(params))throw Error('Bing translation credentials unavailable');
   const values=[];let requestIndex=0;
   for(const text of texts){const translated=[];for(const chunk of textChunks(text)){requestIndex++;const body=new URLSearchParams({fromLang:'en',to:'zh-Hant',text:chunk,token:String(params[1]),key:String(params[0]),tryFetchingGenderDebiasedTranslations:'true'}),url='https://www.bing.com/ttranslatev3?isVertical=1&&IG='+encodeURIComponent(ig)+'&IID='+encodeURIComponent(iid)+'&SFX='+requestIndex+'&ref=TThis&edgepdftranslator=1',r=await remote(url,{method:'POST',headers:{'User-Agent':userAgent,Referer:'https://www.bing.com/translator','Content-Type':'application/x-www-form-urlencoded'},body}),d=await r.json(),value=String(d?.[0]?.translations?.[0]?.text||'').trim();if(!value)throw Error('Bing translation incomplete');translated.push(value);}values.push(translated.join('\n\n'));}
   return {values,provider:'Microsoft Bing 翻譯'};
  } catch {}
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
function textChunks(text,limit=2200){const chunks=[];for(const paragraph of String(text||'').split(/\n{2,}/)){let rest=paragraph.trim();while(rest.length>limit){let end=rest.lastIndexOf(' ',limit);if(end<Math.floor(limit*.6))end=limit;chunks.push(rest.slice(0,end));rest=rest.slice(end).trim();}if(rest)chunks.push(rest);}return chunks;}
const newsPending=new Map();
async function news(settings,accountId) {
 const cache=read('news',null,accountId);
 if(cache?.day===day()&&cache.fullArticle&&cache.zh) return {...cache,text:clean(cache.text)};
 try {
  const prepared=await (await remote('https://raw.githubusercontent.com/a0905315536-design/english-book/main/daily-reading.json?day='+day())).json();
  if(prepared?.day===day()&&typeof prepared.title==='string'&&typeof prepared.text==='string'){
   const content=prepared.fullArticle?null:await fullArticle(prepared.url,prepared.text),enriched=content?{...prepared,...content,source:content.fullArticle?'NASA 官方文章':'NASA 官方 RSS 摘要',zh:'',zhTitle:'',translationProvider:''}:prepared;await write('news',enriched,accountId);return {...enriched,text:clean(enriched.text)};
  }
 } catch {}
 if(cache?.day===day()) return {...cache,text:clean(cache.text)};
 if(newsPending.has(accountId))return newsPending.get(accountId);
 const pending=(async()=>{
  try {
   const xml=await (await remote('https://www.nasa.gov/feed/')).text();
   const parsed=new XMLParser({ignoreAttributes:false,processEntities:true}).parse(xml);
   const items=[parsed?.rss?.channel?.item||[]].flat();
  const history=read('articles',[],accountId);
   const eligible=items.filter(i=>{try{return new URL(i.link).hostname.endsWith('.nasa.gov') && clean(i.description).length>100 && !/APOD:|image of the day/i.test(i.title);}catch{return false;}}).sort((a,b)=>Date.parse(b.pubDate)-Date.parse(a.pubDate));
   const item=eligible.find(i=>!history.includes(i.link));
   if(!item) {if(cache)return {...cache,notice:'目前沒有新的合適文章，保留上次閱讀內容。'};throw Error('來源目前沒有合適的新文章，請稍後再試。');}
   const content=await fullArticle(item.link,item.description),article={day:day(),title:clean(item.title),url:item.link,published:item.pubDate,text:content.text,source:content.fullArticle?'NASA 官方文章':'NASA 官方 RSS 摘要',notice:content.notice,fullArticle:content.fullArticle,zh:''};
   if(settings.deepl) {try {const t=await translate([article.title,article.text],settings);article.zhTitle=t[0];article.zh=t[1];article.translationProvider='DeepL';}catch(e){article.translationError=e.message;}}
   await write('news',article,accountId);await write('articles',[...history,item.link].slice(-1000),accountId);return article;
  }catch(e){if(cache)return {...cache,notice:'更新失敗，顯示上次保存的文章：'+e.message};throw e;}
 })();newsPending.set(accountId,pending);try{return await pending;}finally{newsPending.delete(accountId);}
}
const publicFiles={'/':'index.html','/app/':'index.html','/app.js':'app.js','/style.css':'style.css','/review.js':'review.js'};
const publicAssets={'/assets/phosphor.css':['assets/phosphor.css','text/css; charset=utf-8'],'/assets/Phosphor.woff2':['assets/Phosphor.woff2','font/woff2'],'/assets/curious-notebook-hero.png':['assets/curious-notebook-hero.png','image/png']};
const appUsername=String(process.env.APP_USERNAME||'wordgarden'),appPassword=String(process.env.APP_PASSWORD||'');
function safeEqual(a,b){const supplied=Buffer.from(String(a)),expected=Buffer.from(String(b));return supplied.length===expected.length&&crypto.timingSafeEqual(supplied,expected);}
const sessionSecret=String(process.env.SESSION_SECRET||supabaseKey||appPassword||token);
const normalizeUsername=value=>String(value||'').trim().toLowerCase();
const normalizeEmail=value=>String(value||'').trim().toLowerCase();
const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function hashSecret(value,salt=crypto.randomBytes(16).toString('hex')){return {salt,hash:crypto.scryptSync(String(value),salt,64).toString('hex')};}
function verifySecret(value,record){if(!record?.salt||!record?.hash)return false;return safeEqual(crypto.scryptSync(String(value),record.salt,64).toString('hex'),record.hash);}
function authData(){const value=read('auth',{version:1,users:{}});value.users||={};return value;}
async function saveAuth(value){await write('auth',value);}
function sessionValue(account){const signature=crypto.createHmac('sha256',sessionSecret).update('word-garden:'+account.id+':'+account.password.hash).digest('hex');return account.id+'.'+signature;}
function sessionCookie(account){return 'wg_session='+sessionValue(account)+'; Path=/; HttpOnly;'+(cloudMode?' Secure;':'')+' SameSite=Lax; Max-Age=2592000';}
function accountFromRequest(req){
 if(!appPassword&&!cloudMode)return {id:'main',username:appUsername};
 const auth=authData(),cookie=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('wg_session='));
 if(cookie){const value=decodeURIComponent(cookie.slice(11)),split=value.lastIndexOf('.'),id=value.slice(0,split),account=Object.values(auth.users).find(user=>user.id===id);if(split>0&&account&&safeEqual(value,sessionValue(account)))return account;}
 const raw=String(req.headers.authorization||'');
 if(raw.startsWith('Basic ')){try{const decoded=Buffer.from(raw.slice(6),'base64').toString('utf8'),split=decoded.indexOf(':'),account=auth.users[normalizeUsername(decoded.slice(0,split))];if(split>=0&&account&&verifySecret(decoded.slice(split+1),account.password))return account;}catch{}}
 return null;
}
const pageStyle=`*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#fbfaf5;color:#173f36;font:16px/1.6 "Segoe UI","Microsoft JhengHei",sans-serif;display:grid;place-items:center}.auth-shell{width:min(920px,calc(100% - 32px));min-height:610px;display:grid;grid-template-columns:1fr 1fr;overflow:hidden;border:1px solid #d9dfd2;border-radius:12px 42px 12px 12px;background:#fffefa;box-shadow:0 24px 70px #173f3617}.auth-art{position:relative;display:flex;flex-direction:column;justify-content:space-between;padding:40px;background:#f1eee4}.auth-brand{font:700 29px/1.15 Georgia,"Microsoft JhengHei",serif}.auth-brand small{display:block;margin-top:9px;color:#66766f;font:700 9px/1 sans-serif;letter-spacing:1.8px}.auth-art img{width:115%;margin-left:-8%;object-fit:contain}.auth-note{color:#17603f;font:italic 700 14px/1.7 cursive;transform:rotate(-2deg)}.box{align-self:center;padding:46px 52px}.box h1{margin:0 0 8px;font:700 35px/1.3 Georgia,"Microsoft JhengHei",serif}.box p{color:#66766f}label{display:block;margin:16px 0 6px;font-size:13px;font-weight:600}input{width:100%;padding:12px;border:1px solid #bdc7c0;border-radius:10px;background:#fffefa;font:inherit}input:focus{outline:3px solid #f4bd3b;outline-offset:2px;border-color:#17603f}button,.primary{display:block;width:100%;margin-top:22px;padding:12px;border:0;border-radius:10px;background:#17603f;color:#fff;text-align:center;text-decoration:none;font:inherit;font-weight:700}.links{display:flex;justify-content:center;gap:16px;margin-top:20px}.links a{color:#17603f}.message{padding:11px 13px;border-radius:10px;background:#e9f0df;color:#17603f}.error{background:#fff0ed;color:#9b3428}.code{font:700 20px ui-monospace,monospace;letter-spacing:1px;text-align:center;color:#173f36}.hint{font-size:13px}@media(max-width:720px){.auth-shell{display:block;min-height:0}.auth-art{display:none}.box{padding:34px 25px}.box h1{font-size:30px}}`;
function authPage(title,intro,body){return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · 拾字</title><style>${pageStyle}</style></head><body><main class="auth-shell"><section class="auth-art"><div class="auth-brand">拾字<small>CURIOUS NOTEBOOK</small></div><img src="/assets/curious-notebook-hero.png" alt="盆栽與學習筆記本"><p class="auth-note">SMALL WORDS · A BIGGER YOU</p></section><section class="box"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(intro)}</p>${body}</section></main></body></html>`;}
function field(name,label,type='text',autocomplete=''){return `<label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}"${autocomplete?` autocomplete="${autocomplete}"`:''} required>`;}
function loginPage(message=''){return authPage('登入拾字','登入後繼續照顧你的英文小花園。',`${message?`<p class="message error">${escapeHtml(message)}</p>`:''}<form method="post" action="/login">${field('username','帳號','text','username')}${field('password','密碼','password','current-password')}<button>登入</button></form><nav class="links"><a href="/register">新增帳號</a><a href="/recover">找回帳號</a></nav>`);}
function registerPage(message=''){return authPage('新增帳號','建立自己的單字本；每個帳號的學習資料會分開保存。',`${message?`<p class="message error">${escapeHtml(message)}</p>`:''}<form method="post" action="/register">${field('username','帳號（3–30 個英文字母、數字或 . _ -）','text','username')}${field('email','找回帳號用的電子信箱','email','email')}${field('password','密碼（至少 10 個字元）','password','new-password')}${field('confirm','再輸入一次密碼','password','new-password')}<button>建立帳號</button></form><nav class="links"><a href="/login">回到登入</a></nav>`);}
function recoverPage(message='',error=false){return authPage('找回帳號','輸入註冊信箱和復原碼，可查看帳號並設定新密碼。',`${message?`<p class="message${error?' error':''}">${escapeHtml(message)}</p>`:''}<form method="post" action="/recover">${field('identity','帳號或註冊信箱','text','username')}${field('recovery','復原碼','text','one-time-code')}${field('password','設定新密碼（至少 10 個字元）','password','new-password')}${field('confirm','再輸入一次新密碼','password','new-password')}<button>找回並重設密碼</button></form><p class="hint">新帳號的復原碼只在建立後顯示一次。最初的管理帳號可使用目前密碼作為復原碼。</p><nav class="links"><a href="/login">回到登入</a><a href="/register">新增帳號</a></nav>`);}
function sendHtml(res,status,html,headers={}){res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",...headers});res.end(html);}
async function formBody(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)throw Error('送出的資料過大。');}return new URLSearchParams(raw);}
const server=http.createServer(async(req,res)=>{
 function send(status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));}
 try {
  const u=new URL(req.url,'http://127.0.0.1:'+port);
  if(u.pathname==='/health'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end('ok');}
  if(!cloudMode&&!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)) return send(403,{error:'僅限本機使用'});
  if(publicAssets[u.pathname]&&req.method==='GET'){const [file,type]=publicAssets[u.pathname];res.writeHead(200,{'Content-Type':type,'Cache-Control':'public, max-age=604800, immutable','X-Content-Type-Options':'nosniff'});return res.end(fs.readFileSync(path.join(root,file)));}
  if(u.pathname==='/login'&&req.method==='GET')return sendHtml(res,200,loginPage());
  if(u.pathname==='/login'&&req.method==='POST'){
   const form=await formBody(req),account=authData().users[normalizeUsername(form.get('username'))];
   if(account&&verifySecret(form.get('password')||'',account.password)){res.writeHead(303,{Location:'/app/','Set-Cookie':sessionCookie(account),'Cache-Control':'no-store'});return res.end();}
   return sendHtml(res,401,loginPage('帳號或密碼不正確，請再試一次。'));
  }
  if(u.pathname==='/register'&&req.method==='GET')return sendHtml(res,200,registerPage());
  if(u.pathname==='/register'&&req.method==='POST'){
   const form=await formBody(req),username=String(form.get('username')||'').trim(),key=normalizeUsername(username),email=normalizeEmail(form.get('email')),password=String(form.get('password')||''),confirm=String(form.get('confirm')||'');
   let error='';if(!/^[a-zA-Z0-9._-]{3,30}$/.test(username))error='帳號格式不正確。';else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))error='請輸入有效的電子信箱。';else if(password.length<10)error='密碼至少需要 10 個字元。';else if(password!==confirm)error='兩次輸入的密碼不同。';
   const auth=authData();if(auth.users[key])error='這個帳號已經有人使用。';
   if(error)return sendHtml(res,400,registerPage(error));
   const recovery=crypto.randomBytes(9).toString('base64url').toUpperCase(),id=crypto.randomUUID();
   auth.users[key]={id,username,email,password:hashSecret(password),recovery:hashSecret(recovery),createdAt:new Date().toISOString()};
   await saveAuth(auth);await write('words',emptyState(),id);await write('settings',{},id);
   const done=authPage('帳號建立完成','請先保存這組復原碼；遺失密碼時會用到。',`<p class="code">${escapeHtml(recovery)}</p><p class="hint">為保護帳號，之後不會再次顯示這組復原碼。</p><a class="primary" href="/app/">進入我的單字本</a>`);
   return sendHtml(res,201,done,{'Set-Cookie':sessionCookie(auth.users[key])});
  }
  if(u.pathname==='/recover'&&req.method==='GET')return sendHtml(res,200,recoverPage());
  if(u.pathname==='/recover'&&req.method==='POST'){
   const form=await formBody(req),identity=String(form.get('identity')||'').trim(),email=normalizeEmail(identity),username=normalizeUsername(identity),recovery=String(form.get('recovery')||'').trim(),password=String(form.get('password')||''),confirm=String(form.get('confirm')||'');
   const auth=authData(),entry=Object.entries(auth.users).find(([key,user])=>(key===username||user.email===email)&&(verifySecret(recovery,user.recovery)||verifySecret(recovery.toUpperCase(),user.recovery)));
   let error='';if(!entry)error='帳號、信箱或復原碼不正確。';else if(password.length<10)error='新密碼至少需要 10 個字元。';else if(password!==confirm)error='兩次輸入的新密碼不同。';
   if(error)return sendHtml(res,400,recoverPage(error,true));
   const [key,account]=entry;account.password=hashSecret(password);account.passwordChangedAt=new Date().toISOString();auth.users[key]=account;await saveAuth(auth);
   return sendHtml(res,200,authPage('帳號已找回','密碼已重新設定。',`<p class="message">你的帳號是：<strong>${escapeHtml(account.username)}</strong></p><a class="primary" href="/login">使用新密碼登入</a>`),{'Set-Cookie':'wg_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});
  }
  if(u.pathname==='/logout'){res.writeHead(303,{Location:'/login','Set-Cookie':'wg_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});return res.end();}
  const account=accountFromRequest(req);
  if(!account){if(req.method==='GET'&&!u.pathname.startsWith('/api/')){res.writeHead(303,{Location:'/login','Cache-Control':'no-store'});return res.end();}return send(401,{error:'請先登入拾字。'});}
  if(publicFiles[u.pathname]&&req.method==='GET'){let content=fs.readFileSync(path.join(root,publicFiles[u.pathname]),'utf8');if(publicFiles[u.pathname]==='index.html')content=content.replace('__TOKEN__',token);res.writeHead(200,{'Content-Type':u.pathname.endsWith('.js')?'text/javascript; charset=utf-8':u.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});return res.end(content);}
  if(!u.pathname.startsWith('/api/'))return send(404,{error:'找不到頁面'});
  if(req.headers['x-app-token']!==token)return send(403,{error:'連線已更新，請重新載入頁面後再試。'});
  let body={};if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>5e6)return send(413,{error:'資料過大'});}body=JSON.parse(raw||'{}');}
  const accountId=account.id,state=read('words',emptyState(),accountId),settings=read('settings',{},accountId);state.trash||=[];
  if(u.pathname==='/api/state'&&req.method==='GET') return send(200,{...state,settings:{mw:!!settings.mw,deepl:!!settings.deepl},storage:cloudMode?'cloud':'local'});
  if(u.pathname==='/api/backup'&&req.method==='POST'){
   const backup={version:1,exportedAt:new Date().toISOString(),cards:state.cards,history:state.history};
   const name='backup-'+day()+'-'+Date.now();if(!cloudMode)await write(name,backup,accountId);
   return send(200,{backup,path:cloudMode?'':path.join(dir,name+'.json'),filename:name+'.json',cloud:cloudMode});
  }
  if(u.pathname==='/api/settings'&&req.method==='POST'){for(const k of ['mw','deepl'])if(typeof body[k]==='string'&&body[k].length<=300)settings[k]=body[k].trim();await write('settings',settings,accountId);return send(200,{ok:true});}
  if(u.pathname==='/api/lookup'&&req.method==='GET'){
   const word=normalWord(u.searchParams.get('word'));if(!/^[a-z][a-z '-]{0,79}$/.test(word))throw Error('請輸入英文單字或片語，不需加編號。');
   if(settings.mw){const data=await(await remote('https://www.dictionaryapi.com/api/v3/references/learners/json/'+encodeURIComponent(word)+'?key='+encodeURIComponent(settings.mw))).json();
    if(!Array.isArray(data))throw Error('字典回應格式有誤，請檢查金鑰。');
    const entries=data.filter(x=>x&&typeof x==='object');
    const senses=entries.flatMap(e=>(e.shortdef||[]).map(d=>({meaning:clean(d),part:e.fl||''})));
    let warning='';if(settings.deepl&&senses.length){try{const ts=await translate(senses.slice(0,40).map(s=>s.meaning),settings);ts.forEach((t,i)=>{senses[i].english=senses[i].meaning;senses[i].meaning=t;});}catch(e){warning=e.message;}}
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
   const next=structuredClone(state);if(previous)next.cards[state.cards.indexOf(previous)]=card;else next.cards.push(card);await write('words',next,accountId);return send(200,card);
  }
  if(u.pathname==='/api/review'&&req.method==='POST'){
   const i=state.cards.findIndex(c=>c.id===body.id);if(i<0||!Number.isInteger(body.rating)||body.rating<0||body.rating>3)throw Error('複習資料不正確');
   if(state.cards[i].due>Date.now())throw Error('這張卡片已完成複習，請重新整理。');
   const next=structuredClone(state);next.cards[i]=schedule(next.cards[i],body.rating);next.history.push({id:body.id,rating:body.rating,at:Date.now(),day:day()});await write('words',next,accountId);return send(200,next.cards[i]);
  }
  if(u.pathname==='/api/delete'&&req.method==='POST'){const card=state.cards.find(c=>c.id===body.id);if(!card)throw Error('這個意思已不存在，請重新整理。');const next=structuredClone(state);next.cards=next.cards.filter(c=>c.id!==body.id);next.trash.push({...card,deletedAt:Date.now()});await write('words',next,accountId);return send(200,{ok:true});}
  if(u.pathname==='/api/restore'&&req.method==='POST'){const card=state.trash.find(c=>c.id===body.id);if(!card)throw Error('找不到要還原的單字。');if(state.cards.some(c=>c.word===card.word))throw Error('這個單字已在單字本，回收區內容仍保留。');const next=structuredClone(state);const restored={...card};delete restored.deletedAt;next.cards.push(restored);next.trash=next.trash.filter(c=>c.id!==body.id);await write('words',next,accountId);return send(200,{ok:true});}
  if(u.pathname==='/api/import'&&req.method==='POST'){
   const {next,added,historyAdded}=importBackup(state,body);await write(cloudMode?'before-import':'before-import-'+Date.now(),state,accountId);await write('words',next,accountId);return send(200,{added,historyAdded});
  }
  if(u.pathname==='/api/news'&&req.method==='GET')return send(200,await news(settings,accountId));
  if(u.pathname==='/api/news/translate'&&req.method==='POST'){const a=read('news',null,accountId);if(!a)throw Error('請先載入文章。');if(!a.zh){const t=await translateReading([a.title,a.text],settings);a.zhTitle=t.values[0];a.zh=t.values[1];a.translationProvider=t.provider;delete a.translationError;await write('news',a,accountId);}return send(200,a);}
  return send(404,{error:'找不到功能'});
 }catch(e){send(400,{error:e.message||'操作失敗，請稍後再試。'});}
});
async function start(){
 await loadCloud();
 if(appPassword){const auth=authData(),key=normalizeUsername(appUsername);if(!auth.users[key]){auth.users[key]={id:'main',username:appUsername,email:'',password:hashSecret(appPassword),recovery:hashSecret(appPassword),createdAt:new Date().toISOString(),legacy:true};await saveAuth(auth);}}
 const legacy=read('words',emptyState());legacy.trash||=[];const consolidated=collapseWords(legacy);if(consolidated.cards.length!==legacy.cards.length){await write('before-one-word-migration',legacy);await write('words',consolidated);}
 server.listen(port,bindHost,()=>console.log('Word Garden listening on '+bindHost+':'+port+(cloudMode?' with cloud storage':' with local storage')));
}
start().catch(e=>{console.error('Startup failed:',e.message);process.exitCode=1;});
