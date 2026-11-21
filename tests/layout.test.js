import test from 'node:test';
import assert from 'node:assert/strict';
import {balanceColumns, displayColumnCount, getColumns, moveCardToColumnEnd, reconcileLayouts, swapCardsInColumns} from '../src/model.js';
import {LocalBoardRepository} from '../src/storage.js';

test('balanced placement leaves extra space for a Pomodoro card and its actions', () => {
  const cards = board().cards;
  cards[0].type = 'pomodoro';
  assert.deepEqual(balanceColumns(cards.slice(0, 3), 2), [['p'], ['a', 'b1']]);
});

function board() {
  return {version:1, boards:[{id:'b',name:'Board',layouts:{3:[['p','a','b1'],['c'],[]]}}],
    projects:[], cards:['p','a','b1','c'].map(id=>({
      id, boardId:'b', title:id, type:'note', pinned:id==='p', body:'', items:[], date:'', projectId:null
    }))};
}

test('swapping cards across columns exchanges only their slots and persists',async()=>{
  const state=board();
  const twoColumns=getColumns(state,'b',2);
  state.boards[0].layouts[2]=twoColumns;
  assert.equal(swapCardsInColumns(state,'b',3,'a','c'),true);
  const expected=[['p','c','b1'],['a'],[]];
  assert.deepEqual(getColumns(state,'b',3),expected);
  assert.deepEqual(getColumns(state,'b',2),twoColumns);
  let raw=null;
  const repository=new LocalBoardRepository({getItem:()=>raw,setItem:(_,value)=>{raw=value;}},board());
  await repository.save(state);
  assert.deepEqual(getColumns(await repository.load(),'b',3),expected);
});

test('same-column swaps preserve neighboring cards and the pinned boundary',()=>{
  const state=board();
  assert.equal(swapCardsInColumns(state,'b',3,'a','b1'),true);
  const expected=[['p','b1','a'],['c'],[]];
  assert.throws(()=>swapCardsInColumns(state,'b',3,'a','p'),/same pinned group/);
  assert.equal(swapCardsInColumns(state,'b',3,'a','a'),false);
  assert.deepEqual(getColumns(state,'b',3),expected);
});

test('Auto uses visible cards and width while a manual count remains exact',()=>{
  assert.equal(displayColumnCount(null,2,1200),2);
  assert.equal(displayColumnCount(null,7,690),2);
  assert.equal(displayColumnCount(null,0,1200),1);
  assert.equal(displayColumnCount(8,2,390),8);
});

test('eight-column layout and board preference survive a backup round trip',async()=>{
  const state=board();
  state.boards[0].columnPreference=8;
  moveCardToColumnEnd(state,'b',8,'a',7);
  let raw=null;
  const repo=new LocalBoardRepository({getItem:()=>raw,setItem:(_,value)=>{raw=value;}},board());
  await repo.importJSON(JSON.stringify(state));
  assert.equal((await repo.load()).boards[0].columnPreference,8);
  assert.deepEqual(getColumns(await repo.load(),'b',8)[7],['a']);
  state.boards[0].columnPreference=9;
  await assert.rejects(()=>repo.save(state));
});

test('a move into an empty column preserves every other card and survives export and reload', async()=>{
  const state=board();
  moveCardToColumnEnd(state,'b',3,'a',2);
  assert.deepEqual(getColumns(state,'b',3),[['p','b1'],['c'],['a']]);
  let raw=null;
  const storage={getItem:()=>raw,setItem:(_,value)=>{raw=value;}};
  const repo=new LocalBoardRepository(storage,board());
  await repo.importJSON(JSON.stringify(state));
  assert.deepEqual(getColumns(await new LocalBoardRepository(storage,board()).load(),'b',3),[['p','b1'],['c'],['a']]);
  assert.deepEqual(JSON.parse(await repo.exportJSON()).boards,state.boards);
});

test('narrow moves and wider moves have independent layouts',()=>{
  const state=board();
  moveCardToColumnEnd(state,'b',2,'a',1);
  assert.deepEqual(getColumns(state,'b',2),[['p','b1'],['c','a']]);
  assert.deepEqual(getColumns(state,'b',3),[['p','a','b1'],['c'],[]]);
  assert.throws(()=>moveCardToColumnEnd(state,'b',3,'p',2));
  assert.throws(()=>moveCardToColumnEnd(state,'b',3,'a',3));
});

test('same-column moves append and card deletion reconciles saved placements',()=>{
  const state=board();
  moveCardToColumnEnd(state,'b',3,'a',0);
  assert.deepEqual(getColumns(state,'b',3),[['p','b1','a'],['c'],[]]);
  state.cards=state.cards.filter(card=>card.id!=='b1');
  reconcileLayouts(state);
  assert.deepEqual(state.boards[0].layouts[3],[['p','a'],['c'],[]]);
});

test('duplicate placement is rejected without replacing the saved board',async()=>{
  let raw=null;
  const repo=new LocalBoardRepository({getItem:()=>raw,setItem:(_,value)=>{raw=value;}},board());
  await repo.save(board());
  const bad=board();
  bad.boards[0].layouts[3][2].push('a');
  await assert.rejects(()=>repo.importJSON(JSON.stringify(bad)));
  assert.deepEqual((await repo.load()).boards,board().boards);
});
