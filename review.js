'use strict';
function interval(card, rating) {
  const previous = Math.max(0, Number(card.interval) || 0);
  if (rating === 0) return 10 / 1440;
  if (rating === 1) return previous < 1 ? 1 : Math.max(1, previous * 1.2);
  if (rating === 2) return previous < 1 ? 3 : Math.max(3, previous * 2);
  if (rating === 3) return previous < 1 ? 7 : Math.max(7, previous * 2.8);
  throw new Error('Invalid rating');
}
function schedule(card, rating, now = Date.now()) {
  const days = Math.min(365, interval(card, rating));
  return {...card, interval: days, due: now + Math.round(days * 86400000), reviews: (card.reviews || 0) + 1, lastRating: rating, lastReview: now};
}
function readingContext(text, word) {
  const query=String(word||'').trim();if(!query)return '';
  const protectedText=String(text||'').replace(/https?:\/\/\S+|\b(?:[ap]\.m\.|e\.g\.|i\.e\.|U\.S\.|U\.K\.|(?:Mr|Mrs|Ms|Dr|Prof|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.)|\d+\.\d+/gi,s=>s.replace(/\./g,'\uE000'));
  const escaped=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),match=new RegExp('(?<![a-z])'+escaped+'(?![a-z])','i');
  return protectedText.split(/(?<=[.!?])\s+(?=[A-Z0-9“"‘'])/).map(s=>s.replace(/\uE000/g,'.').trim()).find(s=>match.test(s))||'';
}
function readingParts(text) {
  return String(text||'').split(/([A-Za-z]+(?:['’][A-Za-z]+)*)/).filter(Boolean).map(part=>({text:part,word:/^[A-Za-z]+(?:['’][A-Za-z]+)*$/.test(part)?part.toLowerCase().replace(/’/g,"'"):''}));
}
function latestRating(card, history=[]) {
  if(Number.isInteger(card.lastRating)&&card.lastRating>=0&&card.lastRating<=3&&Number.isFinite(card.lastReview))return card.lastRating;
  const latest=history.filter(h=>h.id===card.id&&Number.isInteger(h.rating)&&h.rating>=0&&h.rating<=3).sort((a,b)=>b.at-a.at)[0];
  return latest?latest.rating:Number.isInteger(card.lastRating)&&card.lastRating>=0&&card.lastRating<=3?card.lastRating:null;
}
if (typeof module !== 'undefined') module.exports = {interval, schedule, readingContext, readingParts, latestRating};
