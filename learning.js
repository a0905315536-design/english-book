'use strict';
(function(root){
 function taipeiDay(value=Date.now()){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
 }
 function dailyPlan(state={},now=Date.now()){
  const day=taipeiDay(now),cards=Array.isArray(state.cards)?state.cards:[],history=Array.isArray(state.history)?state.history:[],readingDays=Array.isArray(state.readingDays)?state.readingDays:[];
  const reviewedIds=new Set(history.filter(item=>(item.day||taipeiDay(item.at))===day).map(item=>item.id));
  const remaining=cards.filter(card=>Number(card.due)<=now).length;
  const collected=cards.filter(card=>card.createdAt&&taipeiDay(card.createdAt)===day).length;
  const review={done:reviewedIds.size,remaining,complete:remaining===0};
  const collect={done:collected,target:1,complete:collected>=1};
  const reading={complete:readingDays.includes(day)};
  const tasks=[review.complete,collect.complete,reading.complete];
  return {day,review,collect,reading,completed:tasks.filter(Boolean).length,total:tasks.length};
 }
 const api={taipeiDay,dailyPlan};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.WordGardenLearning=api;
})(typeof globalThis==='undefined'?this:globalThis);
