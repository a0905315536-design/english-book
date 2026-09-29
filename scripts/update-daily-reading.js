'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {XMLParser}=require('fast-xml-parser');
const cheerio=require('cheerio');
const clean=value=>String(value||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,s)=>String.fromCodePoint(s[0].toLowerCase()==='x'?parseInt(s.slice(1),16):Number(s))).replace(/&rsquo;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function checked(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(url+' returned '+r.status);return r;}
function chunks(text,limit=2200){const out=[];for(const paragraph of String(text||'').split(/\n{2,}/)){let rest=paragraph.trim();while(rest.length>limit){let end=rest.lastIndexOf(' ',limit);if(end<1300)end=limit;out.push(rest.slice(0,end));rest=rest.slice(end).trim();}if(rest)out.push(rest);}return out;}
async function fullArticle(url,fallback){try{const html=await (await checked(url,{headers:{'User-Agent':'Mozilla/5.0 WordGarden/1.0'}})).text(),$=cheerio.load(html),root=$('.entry-content').first().length?$('.entry-content').first():$('article').first();if(!root.length)throw Error('body unavailable');root.find('script,style,nav,aside,form,button,svg,figure,noscript').remove();const seen=new Set(),parts=[];root.find('h2,h3,h4,p,li').each((_,el)=>{if(el.tagName==='li'&&$(el).find('p,li').length)return;const value=clean($.html(el));if(value.length<20||seen.has(value))return;seen.add(value);parts.push(value);});const text=parts.join('\n\n').trim();if(text.length<300)throw Error('body too short');return {text:text.slice(0,40000),fullArticle:true,source:'NASA 官方文章',notice:'完整正文取自 NASA 文章頁。'};}catch{return {text:clean(fallback),fullArticle:false,source:'NASA 官方 RSS 摘要',notice:'完整正文暫時無法取得，目前顯示來源摘要。'};}}
async function google(texts){
 const values=[];for(const text of texts){const translated=[];for(const chunk of chunks(text)){const d=await (await checked('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q='+encodeURIComponent(chunk),{headers:{'User-Agent':'Mozilla/5.0'}})).json(),value=Array.isArray(d?.[0])?d[0].map(x=>Array.isArray(x)?x[0]||'':'').join('').trim():'';if(!value)throw Error('Google translation incomplete');translated.push(value);}values.push(translated.join('\n\n'));}return values;
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
 const item=eligible[0];if(!item)throw Error('NASA feed has no suitable article');const title=clean(item.title),content=await fullArticle(item.link,item.description),text=content.text;
 let translated=['',''],provider='';try{translated=await google([title,text]);provider='Google 翻譯';}catch{try{translated=await bing([title,text]);provider='Microsoft Bing 翻譯';}catch{console.warn('Translation providers were unavailable; the app will translate in the reader browser.');}}
 const article={day:day(),title,url:item.link,published:item.pubDate,text,source:content.source,notice:content.notice,fullArticle:content.fullArticle,zhTitle:translated[0],zh:translated[1],translationProvider:provider};
 fs.writeFileSync(path.join(__dirname,'..','daily-reading.json'),JSON.stringify(article,null,2)+'\n');console.log('Prepared daily reading for '+article.day+(provider?' with '+provider:'; browser translation will be used'));
})().catch(error=>{console.error(error);process.exit(1);});
