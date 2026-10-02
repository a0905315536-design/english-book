'use strict';
const crypto = require('node:crypto');
const normalWord = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ');
const textFields=['word','meaning','primaryMeaning','example','exampleZh','collocations','note','source','sourceUrl','dictionaryNotes','phonetic'];
function validCard(c) {
 return c && typeof c.word==='string' && /^[a-z][a-z '-]{0,79}$/.test(normalWord(c.word)) && typeof c.meaning==='string' && c.meaning.trim().length>0 && c.meaning.length<=5000 && Number.isFinite(c.due) && c.due>=0 && c.due<=8640000000000000 && Number.isFinite(c.interval) && c.interval>=0 && c.interval<=365 && Number.isInteger(c.reviews) && c.reviews>=0 && (c.createdAt===undefined||Number.isFinite(c.createdAt)&&c.createdAt>=0) && textFields.every(k=>c[k]===undefined||typeof c[k]==='string'&&c[k].length<=(k==='dictionaryNotes'?20000:5000));
}
function safeCard(c) {
 const result={id:crypto.randomUUID(),due:c.due,interval:c.interval,reviews:c.reviews};
 for(const k of textFields) result[k]=String(c[k]||'').trim();
 result.word=normalWord(c.word);
 if(Number.isFinite(c.lastReview)&&c.lastReview>=0)result.lastReview=c.lastReview;
 if(Number.isFinite(c.createdAt)&&c.createdAt>=0)result.createdAt=c.createdAt;
 if(Number.isInteger(c.lastRating)&&c.lastRating>=0&&c.lastRating<4)result.lastRating=c.lastRating;
 return result;
}
function importBackup(state, body) {
 if(body.version!==1||!Array.isArray(body.cards)||body.cards.length>20000||!body.cards.every(validCard)||body.history!==undefined&&(!Array.isArray(body.history)||body.history.length>100000))throw Error('備份格式不正確，沒有變更你的資料。');
 const next=structuredClone(state), ids=new Map(); let added=0, historyAdded=0;
 for(const c of body.cards){const duplicate=next.cards.find(x=>normalWord(x.word)===normalWord(c.word));const card=duplicate||safeCard(c);if(duplicate)mergeContent(card,c);else{next.cards.push(card);added++;}if(typeof c.id==='string'){if(ids.has(c.id)&&ids.get(c.id)!==card.id)throw Error('備份中有重複識別碼，沒有變更資料。');ids.set(c.id,card.id);}}
 for(const h of body.history||[]){if(!h||typeof h.id!=='string'||!Number.isFinite(h.at)||h.at<0||!Number.isInteger(h.rating)||h.rating<0||h.rating>3)throw Error('備份中的複習紀錄不正確，沒有變更資料。');const id=ids.get(h.id);if(!id)continue;const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(h.at));if(!next.history.some(x=>x.id===id&&x.at===h.at&&x.rating===h.rating)){next.history.push({id,at:h.at,rating:h.rating,day:date});historyAdded++;}}
 if(Array.isArray(body.readingDays))next.readingDays=[...new Set([...(next.readingDays||[]),...body.readingDays.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d))])].sort();
 return {next,added,historyAdded};
}
function localSenses(value) {
 const parts={n:'名詞',v:'動詞',vt:'及物動詞',vi:'不及物動詞',a:'形容詞',adj:'形容詞',adv:'副詞',ad:'副詞'};
 return String(value).split(/\\n|\r?\n/).filter(Boolean).flatMap(line=>{
  const match=line.match(/^([a-z]+)\.\s*(.*)$/i);const domain=line.match(/^\[([^\]]+)\]\s*(.*)$/);const content=match?match[2]:domain?domain[2]:line;const part=match?(parts[match[1]]||match[1]):domain?domain[1]+'（專門用法）':'';
  return content.split(/[,，;]/).map(s=>s.trim()).filter(Boolean).map(meaning=>({meaning,part}));
 }).filter((s,i,all)=>all.findIndex(x=>x.meaning===s.meaning&&x.part===s.part)===i);
}
function mergeContent(target,other){
 const originalMeaning=target.meaning;
 target.dictionaryNotes=target.dictionaryNotes||originalMeaning;
 other={...other,dictionaryNotes:other.dictionaryNotes||other.meaning};
 for(const key of ['meaning','dictionaryNotes','example','exampleZh','collocations','note'])target[key]=[...new Set([target[key],other[key]].filter(Boolean).flatMap(s=>s.split('\n')))].join('\n');
 if(target.primaryMeaning||other.primaryMeaning)target.primaryMeaning=[...new Set([target.primaryMeaning||target.meaning,other.primaryMeaning||other.meaning].filter(Boolean).flatMap(s=>s.split(/\n|／/)))].join('／');
 if(other.sourceUrl&&other.sourceUrl!==target.sourceUrl)target.note=[target.note,'其他來源：'+(other.source||'')+' '+other.sourceUrl].filter(Boolean).join('\n');
}
function collapseWords(state){
 const next=structuredClone(state),cards=[],map=new Map();
 for(const card of next.cards){card.word=normalWord(card.word);const existing=cards.find(c=>c.word===card.word);if(existing){mergeContent(existing,card);existing.due=Math.min(existing.due,card.due);existing.interval=Math.min(existing.interval,card.interval);existing.reviews=Math.max(existing.reviews,card.reviews);map.set(card.id,existing.id);}else cards.push(card);}
 next.cards=cards;next.history=next.history.map(h=>({...h,id:map.get(h.id)||h.id})).filter((h,i,all)=>all.findIndex(x=>x.id===h.id&&x.at===h.at&&x.rating===h.rating)===i);return next;
}
module.exports={normalWord,validCard,safeCard,importBackup,localSenses,collapseWords};
