export const clone = value => structuredClone(value);
export const MAX_COLUMNS = 8;
export const MIN_CARD_TEXT = 12;
export const MAX_CARD_TEXT = 22;

export function cardTextSize(board, count, columnWidth) {
  return board.cardTextSizes?.[count] ?? Math.max(MIN_CARD_TEXT, Math.min(16, Math.round(columnWidth / 18)));
}

export function displayColumnCount(preference, visibleCount, width) {
  if (preference != null) return preference;
  const capacity = width <= 460 ? 1 : width <= 740 ? 2 : width <= 1000 ? 3
    : width < 1450 ? 4 : Math.min(MAX_COLUMNS, 5 + Math.floor((width - 1450) / 240));
  return Math.max(1, Math.min(visibleCount, capacity));
}
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
  for (const board of s.boards) {
    if (board.cardTextSizes !== undefined) {
      const sizes = board.cardTextSizes;
      if (!sizes || typeof sizes !== 'object' || Array.isArray(sizes)) fail();
      for (const [count, size] of Object.entries(sizes)) {
        if (!/^[1-8]$/.test(count) || !Number.isInteger(size)
            || size < MIN_CARD_TEXT || size > MAX_CARD_TEXT) fail();
      }
    }
    if (board.columnPreference != null && (!Number.isInteger(board.columnPreference)
      || board.columnPreference < 1 || board.columnPreference > MAX_COLUMNS)) fail();
    if (board.layouts === undefined) continue;
    if (!board.layouts || typeof board.layouts !== 'object' || Array.isArray(board.layouts)) fail();
    const cards = new Set(s.cards.filter(card => card.boardId === board.id).map(card => card.id));
    for (const [count, columns] of Object.entries(board.layouts)) {
      if (!/^[1-8]$/.test(count) || !Array.isArray(columns) || columns.length !== Number(count)
          || !columns.every(Array.isArray)) fail();
      const ids = columns.flat();
      if (ids.length !== cards.size || new Set(ids).size !== cards.size || !ids.every(id => cards.has(id))) fail();
    }
  }
  return s;
}

export function balanceColumns(cards, count) {
  const columns = Array.from({length:count}, () => []);
  const heights = Array(count).fill(0);
  for (const card of cards) {
    const index = heights.indexOf(Math.min(...heights));
    columns[index].push(card.id);
    heights[index] += 130 + card.body.length * .34
      + card.items.reduce((height, item) => height + Math.max(43, item.text.length * .6), 0)
      + (card.type === 'week' ? 100 : 0);
  }
  return columns;
}

function pinnedFirst(columns, cards) {
  const pinned = new Set(cards.filter(card => card.pinned).map(card => card.id));
  return columns.map(column => [...column].sort((a,b) => Number(pinned.has(b)) - Number(pinned.has(a))));
}

export function getColumns(state, boardId, count) {
  const board = state.boards.find(board => board.id === boardId);
  const cards = state.cards.filter(card => card.boardId === boardId);
  const layouts = board.layouts ?? {};
  if (layouts[count]) return pinnedFirst(layouts[count], cards);
  const wider = Object.keys(layouts).map(Number).sort((a,b)=>a-b).find(size=>size>count);
  if (wider) {
    const columns = Array.from({length:count}, () => []);
    layouts[wider].forEach((column,index) => columns[Math.min(index,count-1)].push(...column));
    return pinnedFirst(columns, cards);
  }
  return balanceColumns([...cards].sort((a,b)=>Number(b.pinned)-Number(a.pinned)), count);
}

export function reconcileLayouts(state) {
  for (const board of state.boards) {
    if (!board.layouts) continue;
    const cards = state.cards.filter(card=>card.boardId===board.id);
    const valid = new Set(cards.map(card=>card.id));
    for (const [count, layout] of Object.entries(board.layouts)) {
      const columns = layout.map(column=>column.filter(id=>valid.has(id)));
      const placed = new Set(columns.flat());
      for (const card of cards) {
        if (placed.has(card.id)) continue;
        const shortest = columns.reduce((a,b)=>a.length<=b.length?a:b);
        shortest.push(card.id);
      }
      board.layouts[count] = pinnedFirst(columns, cards);
    }
  }
}

export function moveCardToColumnEnd(state, boardId, count, cardId, destination) {
  return moveInColumns(state, boardId, count, cardId, destination);
}

export function moveInColumns(state, boardId, count, cardId, destination, beforeId) {
  if (!Number.isInteger(count) || count<1 || count>MAX_COLUMNS
      || !Number.isInteger(destination) || destination<0 || destination>=count) throw Error('Column not found.');
  const board = state.boards.find(board=>board.id===boardId);
  const card = state.cards.find(card=>card.id===cardId && card.boardId===boardId);
  if (!board || !card) throw Error('Card not found on this board.');
  const columns = getColumns(state, boardId, count);
  const target = columns[destination];
  if (beforeId === undefined) {
    if (card.pinned) throw Error('Unpin this card before moving it to a column.');
    if (target.at(-1) === cardId) return false;
  } else {
    const before = state.cards.find(card=>card.id===beforeId);
    if (!target.includes(beforeId) || before?.pinned !== card.pinned) throw Error('Move cards within the same pinned group.');
    if (beforeId === cardId) return false;
  }
  const source = columns.find(column=>column.includes(cardId));
  source.splice(source.indexOf(cardId),1);
  target.splice(beforeId === undefined ? target.length : target.indexOf(beforeId),0,cardId);
  (board.layouts ??= {})[count] = columns;
  return true;
}
export function moveCard(state,cardId,targetId){
  const next=clone(state),from=next.cards.findIndex(c=>c.id===cardId),target=next.cards.find(c=>c.id===targetId);
  if(from<0||!target)throw Error('Card not found');
  const card=next.cards[from];
  if(card.boardId!==target.boardId||card.pinned!==target.pinned)throw Error('Move cards within the same board and pinned group.');
  next.cards.splice(from,1);next.cards.splice(next.cards.findIndex(c=>c.id===targetId),0,card);return next;
}
