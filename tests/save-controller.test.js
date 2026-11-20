import test from 'node:test';
import assert from 'node:assert/strict';
import {SaveController,saveSummary,shouldWarnBeforeLeaving} from '../src/save-controller.js';
import {createPendingControlLock,dirtyFormForEvent} from '../src/save-controls.js';

const snapshot=name=>({version:1,boards:[{id:'board',name}],projects:[],cards:[]});
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
const error=kind=>Object.assign(new Error('private error details'),{kind});

test('saved status appears only after acknowledgement and pending actions are explicitly refused',async()=>{
  const pending=deferred(),events=[];let calls=0;
  const controller=new SaveController({repository:{revision:'0',save:async state=>{calls++;await pending.promise;return state;}},initialState:snapshot('All'),mode:'database',onChange:s=>events.push(s)});
  assert.equal(controller.status.phase,'new');
  const saved=controller.save(snapshot('First'));
  assert.equal(controller.status.phase,'saving');
  await assert.rejects(()=>controller.save(snapshot('Second')),e=>e.kind==='busy');
  assert.equal(calls,1);pending.resolve();assert.equal((await saved).boards[0].name,'First');
  assert.equal(controller.status.phase,'saved');assert.equal(controller.status.dirty,false);
  assert.deepEqual(events.map(s=>s.phase),['saving','saved']);controller.dispose();
});

test('definite failures retain a defensive candidate and allow explicit corrected resubmission',async()=>{
  let fail=true;
  const controller=new SaveController({repository:{revision:'1',save:async state=>{if(fail)throw error('size');return state;}},initialState:snapshot('Acknowledged'),mode:'database'});
  await assert.rejects(()=>controller.save(snapshot('Draft')));
  assert.equal(controller.status.phase,'not-saved');assert.equal(controller.status.canRetry,true);
  assert.equal(controller.acknowledgedSnapshot.boards[0].name,'Acknowledged');
  const recovery=controller.recoverySnapshot;recovery.boards[0].name='Mutated';
  assert.equal(controller.recoverySnapshot.boards[0].name,'Draft');
  fail=false;await controller.save(snapshot('Corrected'));assert.equal(controller.status.phase,'saved');
  assert.equal(controller.recoverySnapshot,null);controller.dispose();
});

test('conflicts and uncertain results retain edits, block further writes and never retry automatically',async()=>{
  for(const [kind,phase] of [['conflict','conflict'],['network','unknown'],['service','unknown'],['response','unknown']]) {
    let calls=0;
    const controller=new SaveController({repository:{revision:'1',save:async()=>{calls++;throw error(kind);}},initialState:snapshot('Acknowledged'),mode:'database'});
    await assert.rejects(()=>controller.save(snapshot('Draft')));
    assert.equal(controller.status.phase,phase);assert.equal(controller.status.blocked,true);
    assert.equal(controller.status.canRetry,false);
    await assert.rejects(()=>controller.retry(),e=>e.kind==='reload-required');
    await assert.rejects(()=>controller.save(snapshot('Other')),e=>e.kind==='reload-required');
    assert.equal(controller.recoverySnapshot.boards[0].name,'Draft');assert.equal(calls,1);
    assert.doesNotMatch(controller.status.message,/private error/);controller.dispose();
  }
});

test('local failures remain definite and explicit retry preserves intended edits',async()=>{
  let fail=true;
  const controller=new SaveController({repository:{save:async state=>{if(fail)throw Error('Quota exceeded');return state;}},initialState:snapshot('All'),mode:'local'});
  assert.equal(controller.status.phase,'local');
  await assert.rejects(()=>controller.save(snapshot('Local draft')));
  assert.equal(controller.status.phase,'not-saved');fail=false;
  await controller.retry();assert.equal(controller.acknowledgedSnapshot.boards[0].name,'Local draft');controller.dispose();
});

test('disposal drops private drafts and prevents late completions or status notifications',async()=>{
  const pending=deferred(),events=[];
  const controller=new SaveController({repository:{revision:'1',save:()=>pending.promise},initialState:snapshot('A'),mode:'database',onChange:s=>events.push(s)});
  const saved=controller.save(snapshot('A draft'));controller.dispose();pending.resolve(snapshot('A draft'));
  await assert.rejects(()=>saved,e=>e.kind==='session');assert.equal(events.length,1);
  assert.throws(()=>controller.recoverySnapshot,e=>e.kind==='session');
});

test('invalid edits never replace acknowledged or recovery data',async()=>{
  let calls=0;
  const controller=new SaveController({repository:{save:async()=>calls++},initialState:snapshot('All'),mode:'local'});
  await assert.rejects(()=>controller.save({}));assert.equal(calls,0);
  assert.equal(controller.acknowledgedSnapshot.boards[0].name,'All');controller.dispose();
});

test('status text pluralizes cards and warns on dirty forms, pending writes and retained edits',()=>{
  assert.equal(saveSummary(1,'database','saved'),'1 card · Saved to your account');
  assert.equal(saveSummary(2,'local','saved'),'2 cards · Saved on this device');
  assert.match(saveSummary(0,'database','unknown'),/Save outcome unknown/);
  assert.equal(shouldWarnBeforeLeaving({pending:false,dirty:false},false),false);
  assert.equal(shouldWarnBeforeLeaving({pending:true,dirty:false},false),true);
  assert.equal(shouldWarnBeforeLeaving({pending:false,dirty:true},false),true);
  assert.equal(shouldWarnBeforeLeaving({pending:false,dirty:false},true),true);
});

test('pending control lock preserves existing disabled states and includes newly rendered controls',()=>{
  const enabled={disabled:false,dataset:{}},disabled={disabled:true,dataset:{}},signOut={disabled:false,dataset:{saveAllowed:'true'}};
  const draggable={draggable:true};
  let controls=[enabled,disabled,signOut];const root={querySelectorAll:selector=>selector==='[draggable]'?[draggable]:controls};
  const lock=createPendingControlLock();lock([root],true);
  assert.equal(enabled.disabled,true);assert.equal(signOut.disabled,false);
  assert.equal(draggable.draggable,false);
  const fresh={disabled:false,dataset:{}};controls.push(fresh);lock([root],true);
  assert.equal(fresh.disabled,true);lock([root],false);
  assert.equal(enabled.disabled,false);assert.equal(fresh.disabled,false);assert.equal(disabled.disabled,true);
  assert.equal(draggable.draggable,true);
});

test('button-driven editor changes are dirty while navigation clicks and board controls are not',()=>{
  const form={};const dialog={contains:node=>node===form};
  const target=marker=>({closest:selector=>selector==='form'?form:selector.includes(marker)?{}:null});
  for(const marker of ['.photo-remove','.todo-check','.post-it-swatch','.post-it-align']) {
    assert.equal(dirtyFormForEvent({type:'click',target:target(marker)},[dialog]),form);
  }
  assert.equal(dirtyFormForEvent({type:'click',target:target('.close')},[dialog]),null);
  assert.equal(dirtyFormForEvent({type:'input',target:target('textarea')},[dialog]),form);
  assert.equal(dirtyFormForEvent({type:'click',target:target('.todo-check')},[]),null);
});

test('a control finishing its own async work during a save is not left permanently disabled',()=>{
  const control={disabled:true,dataset:{}};
  const root={querySelectorAll:selector=>selector==='[draggable]'?[]:[control]};
  const lock=createPendingControlLock();lock([root],true);
  control.disabled=false;lock([root],true);assert.equal(control.disabled,true);
  lock([root],false);assert.equal(control.disabled,false);
});
