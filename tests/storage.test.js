import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalBoardRepository } from '../src/storage.js';
import { moveCard, validateState, parseItems } from '../src/model.js';
const initial = () => ({version:1,boards:[{id:'b',name:'All'}],projects:[],cards:[{id:'a',boardId:'b',title:'First',type:'note',projectId:null,date:'',pinned:false,items:[],body:'hello'},{id:'c',boardId:'b',title:'Second',type:'note',projectId:null,date:'',pinned:false,items:[],body:''}]});
function memory(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};}
test('single to-do backup preserves completion and text beyond three lines',async()=>{
  const state = initial();
  const body = ['First line','Second line','Third line','Fourth line'].join('\n');
  Object.assign(state.cards[0], {type:'single-todo',body,todoDone:true});
  const repo = new LocalBoardRepository(memory(),initial());
  await repo.importJSON(JSON.stringify(state));
  assert.deepEqual(JSON.parse(await repo.exportJSON()).cards[0],state.cards[0]);
  state.cards[0].todoDone = 'true';
  await assert.rejects(()=>repo.save(state));
  assert.equal((await repo.load()).cards[0].body,body);
});
test('Photo backups preserve a device image and a separate URL photo',async()=>{
  const state = initial();
  Object.assign(state.cards[0], {
    type:'photo', photoSubtitle:'From my device', body:'A description',
    photoSource:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=',
  });
  Object.assign(state.cards[1], {
    type:'photo', photoSubtitle:'From the web', photoSource:'https://example.com/photo.jpg',
  });
  const original = new LocalBoardRepository(memory(),initial());
  await original.save(state);
  const restored = new LocalBoardRepository(memory(),initial());
  await restored.importJSON(await original.exportJSON());
  assert.deepEqual(await restored.load(),state);
});

test('a backup with an invalid Photo source preserves the saved board',async()=>{
  const repo = new LocalBoardRepository(memory(),initial());
  const bad = initial();
  bad.cards[0].type = 'photo';
  for (const photoSource of ['javascript:alert(1)','data:image/svg+xml;base64,PHN2Zz4=', 'https://', 'https://user:pass@example.com/image.jpg']) {
    bad.cards[0].photoSource = photoSource;
    await assert.rejects(()=>repo.importJSON(JSON.stringify(bad)));
  }
  assert.deepEqual(await repo.load(),initial());
});
test('Post-it text and styling survive backup and restore', async()=>{
  const state = initial();
  Object.assign(state.cards[0], {type:'post-it', body:'First line\nSecond line',
    postItColor:'lime', postItAlignment:'center'});
  const repo = new LocalBoardRepository(memory(),initial());
  await repo.save(state);
  const restored = new LocalBoardRepository(memory(),initial());
  await restored.importJSON(await repo.exportJSON());
  assert.deepEqual(await restored.load(),state);
});

test('Post-it styling is optional and invalid styles are rejected',()=>{
  const state = initial();
  state.cards[0].type = 'post-it';
  assert.doesNotThrow(()=>validateState(state));
  state.cards[0].postItColor = 'constructor';
  assert.throws(()=>validateState(state));
  state.cards[0].postItColor = 'amber';
  state.cards[0].postItAlignment = 'right';
  assert.throws(()=>validateState(state));
});
test('saved edits survive a new repository instance',async()=>{const store=memory();const repo=new LocalBoardRepository(store,initial());let s=await repo.load();s.cards[0].title='Changed';await repo.save(s);assert.equal((await new LocalBoardRepository(store,initial()).load()).cards[0].title,'Changed');});
test('reads are isolated from unsaved edits',async()=>{const repo=new LocalBoardRepository(memory(),initial());const s=await repo.load();s.cards[0].title='Unsaved';assert.equal((await repo.load()).cards[0].title,'First');});
test('invalid imports preserve existing data',async()=>{const repo=new LocalBoardRepository(memory(),initial());await repo.save(initial());const bad=initial();bad.cards[0].boardId='missing';await assert.rejects(()=>repo.importJSON(JSON.stringify(bad)));assert.equal((await repo.load()).cards[0].boardId,'b');});
test('duplicate IDs and invalid items are rejected',()=>{let s=initial();s.cards[1].id='a';assert.throws(()=>validateState(s));s=initial();s.cards[0].items=[{id:'i',text:3,done:false}];assert.throws(()=>validateState(s));});
test('write failures propagate and preserve last saved state',async()=>{const store=memory();const repo=new LocalBoardRepository(store,initial());await repo.save(initial());store.setItem=()=>{throw Error('Storage full')};const next=initial();next.cards[0].title='Lost';await assert.rejects(()=>repo.save(next),/Storage full/);assert.equal((await repo.load()).cards[0].title,'First');});
test('corrupt saved data is reported rather than reset',async()=>{const store=memory();store.setItem('cardboard.v1','{bad');await assert.rejects(()=>new LocalBoardRepository(store,initial()).load(),/saved board/i);});
test('reorder preserves card IDs and pinned grouping',()=>{const s=initial();s.cards.unshift({...s.cards[0],id:'pin',pinned:true});const next=moveCard(s,'c','a');assert.deepEqual(next.cards.map(c=>c.id),['pin','c','a']);assert.deepEqual(s.cards.map(c=>c.id),['pin','a','c']);assert.throws(()=>moveCard(s,'a','pin'));});
test('export import round trip preserves content',async()=>{const repo=new LocalBoardRepository(memory(),initial());await repo.importJSON(JSON.stringify(initial()));assert.deepEqual(JSON.parse(await repo.exportJSON()),initial());});
test('malformed link imports are rejected before replacing saved data',async()=>{const repo=new LocalBoardRepository(memory(),initial());await repo.save(initial());const bad=initial();bad.cards[0].url='https://';await assert.rejects(()=>repo.importJSON(JSON.stringify(bad)));assert.equal((await repo.load()).cards[0].url,undefined);});
test('duplicate checklist lines get distinct IDs and preserve individual completion',()=>{const old=[{id:'i1',text:'Repeat',label:'',done:true},{id:'i2',text:'Repeat',label:'',done:false}];const items=parseItems('Repeat\nRepeat\nRepeat','checklist',old);assert.equal(new Set(items.map(x=>x.id)).size,3);assert.deepEqual(items.slice(0,2).map(x=>x.done),[true,false]);assert.equal(items[2].done,false);});
