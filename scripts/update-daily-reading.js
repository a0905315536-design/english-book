'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {XMLParser}=require('fast-xml-parser');
const clean=value=>String(value||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,s)=>String.fromCodePoint(s[0].toLowerCase()==='x'?parseInt(s.slice(1),16):Number(s))).replace(/&rsquo;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function checked(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(url+' returned '+r.status);return r;}
async function google(texts){
 const marker='WG_TRANSLATION_SPLIT_7F3A9C',joined=texts.join('\n\n'+marker+'\n\n');
 const d=await (await checked('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q='+encodeURIComponent(joined),{headers:{'User-Agent':'Mozilla/5.0'}})).json();
 const value=Array.isArray(d?.[0])?d[0].map(x=>Array.isArray(x)?x[0]||'':'').join('').trim():'';
 const values=value.split(marker).map(x=>x.trim());if(values.length!==texts.length||values.some(x=>!x))throw Error('Google translation incomplete');return values;
}
async function bing(texts){
 const ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36 Edg/153';
 const html=await (await checked('https://www.bing.com/translator',{headers:{'User-Agent':ua}})).text();
 const ig=html.match(/IG:"([^"]+)"/)?.[1],iid=html.match(/data-iid="([^"]+)"/)?.[1],match=html.match(/params_AbusePreventionHelper\s?=\s?([^\]]+\])/),params=match&&JSON.parse(match[1]);
 if(!ig||!iid||!Array.isArray(params))throw Error('Bing translation credentials unavailable');const values=[];
 for(let i=0;i<texts.length;i++){const body=new URLSearchParams({fromLang:'en',to:'zh-Hant',text:texts[i],token:String(params[1]),key:String(params[0]),tryFetchingGenderDebiasedTranslations:'true'});const url='https://www.bing.com/ttranslatev3?isVertical=1&&IG='+encodeURIComponent(ig)+'&IID='+encodeURIComponent(iid)+'&SFX='+(i+1)+'&ref=TThis&edgepdftranslator=1';const d=await (await checked(url,{method:'POST',headers:{'User-Agent':ua,Referer:'https://www.bing.com/translator','Content-Type':'application/x-www-form-urlencoded'},body})).json(),value=String(d?.[0]?.translations?.[0]?.text||'').trim();if(!value)throw Error('Bing translation incomplete');values.push(value);}return values;
}
(async()=>{
 const xml=await (await checked('https://www.nasa.gov/feed/')).text(),parsed=new XMLParser({ignoreAttributes:false,processEntities:true}).parse(xml),items=[parsed?.rss?.channel?.item||[]].flat();
 const eligible=items.filter(i=>{try{return new URL(i.link).hostname.endsWith('.nasa.gov')&&clean(i.description).length>100&&!/APOD:|image of the day/i.test(i.title);}catch{return false;}}).sort((a,b)=>Date.parse(b.pubDate)-Date.parse(a.pubDate));
 const item=eligible[0];if(!item)throw Error('NASA feed has no suitable article');const title=clean(item.title),text=clean(item.description);
 let translated,provider;try{translated=await google([title,text]);provider='Google 翻譯';}catch{translated=await bing([title,text]);provider='Microsoft Bing 翻譯';}
 const article={day:day(),title,url:item.link,published:item.pubDate,text,source:'NASA 官方 RSS 摘要',notice:'這是來源提供的摘要，不是完整文章。',zhTitle:translated[0],zh:translated[1],translationProvider:provider};
 fs.writeFileSync(path.join(__dirname,'..','daily-reading.json'),JSON.stringify(article,null,2)+'\n');console.log('Prepared daily reading for '+article.day+' with '+provider);
})().catch(error=>{console.error(error);process.exit(1);});
