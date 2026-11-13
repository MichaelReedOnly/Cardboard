export const clone = value => structuredClone(value);
export function parseItems(text,type,previous){
  const remaining=[...previous];
  return text.split('\n').filter(x=>x.trim()).map((line,i)=>{
    let label='',value=line;
    if(type==='week'){const split=line.indexOf('|');if(split>=0){label=line.slice(0,split).trim();value=line.slice(split+1).trim();}else label=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i%7];}
    value=value.replaceAll(' ⏎ ','\n');
    const index=remaining.findIndex(x=>x.text===value&&(!label||x.label===label));
    const old=index<0?null:remaining.splice(index,1)[0];
    return {id:old?.id||crypto.randomUUID(),text:value,label,done:old?.done||false};
  });
}
export function validateState(s) {
  const fail = () => { throw new Error('Invalid board file. Please choose a Cardboard version 1 export.'); };
  if (!s || s.version !== 1 || !Array.isArray(s.boards) || !s.boards.length || !Array.isArray(s.projects) || !Array.isArray(s.cards)) fail();
  const ids = new Set();
  const id = v => { if (typeof v !== 'string' || !v || ids.has(v)) fail(); ids.add(v); };
  const str = v => {if(typeof v !== 'string') fail();};
  for(const b of s.boards){id(b.id);str(b.name);if(!b.name.trim())fail();}
  const boards=new Set(s.boards.map(b=>b.id));
  for(const p of s.projects){id(p.id);str(p.name);if(!p.name.trim()||!boards.has(p.boardId))fail();}
  for(const c of s.cards){
    id(c.id);str(c.title);str(c.body);str(c.date);
    if(!c.title.trim()||!boards.has(c.boardId)||!['note','checklist','week','link'].includes(c.type)||typeof c.pinned!=='boolean'||!Array.isArray(c.items))fail();
    if(c.date && (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)||Number.isNaN(Date.parse(c.date))))fail();
    if(c.projectId!==null&&!s.projects.some(p=>p.id===c.projectId&&p.boardId===c.boardId))fail();
    if(c.url!==undefined){str(c.url);if(c.url){try{const u=new URL(c.url);if(!['https:','http:'].includes(u.protocol)||!u.hostname)fail();}catch{fail();}}}
    for(const item of c.items){id(item.id);str(item.text);if(typeof item.done!=='boolean')fail();if(item.label!==undefined)str(item.label);}
  }
  return s;
}
export function moveCard(state,cardId,targetId){
  const next=clone(state),from=next.cards.findIndex(c=>c.id===cardId),target=next.cards.find(c=>c.id===targetId);
  if(from<0||!target)throw Error('Card not found');
  const card=next.cards[from];
  if(card.boardId!==target.boardId||card.pinned!==target.pinned)throw Error('Move cards within the same board and pinned group.');
  next.cards.splice(from,1);next.cards.splice(next.cards.findIndex(c=>c.id===targetId),0,card);return next;
}
