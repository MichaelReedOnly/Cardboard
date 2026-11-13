import test from 'node:test';
import assert from 'node:assert/strict';
import {getColumns, moveCardToColumnEnd, reconcileLayouts} from '../src/model.js';
import {LocalBoardRepository} from '../src/storage.js';

function board() {
  return {version:1, boards:[{id:'b',name:'Board',layouts:{3:[['p','a','b1'],['c'],[]]}}],
    projects:[], cards:['p','a','b1','c'].map(id=>({
      id, boardId:'b', title:id, type:'note', pinned:id==='p', body:'', items:[], date:'', projectId:null
    }))};
}

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
