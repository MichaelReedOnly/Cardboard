import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceSession,createEmptyWorkspace} from '../src/workspace-session.js';
import {ApiBoardRepository} from '../src/api-storage.js';

const snapshot=name=>({version:1,boards:[{id:'board',name}],projects:[],cards:[]});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fakeAuth() {
  let state={status:'verified',userId:'user_A',sessionId:'session_A',label:'Account A'};
  const listeners=new Set();
  return {get state(){return state;},getToken:async()=>state.userId,
    subscribe(fn){listeners.add(fn);fn(state);return ()=>listeners.delete(fn);},
    change(next){state=next;for(const fn of listeners)fn(next);}};
}

test('database startup loads the saved snapshot once without saving or reopening on duplicate notifications',async()=>{
  const auth=fakeAuth(),events=[];let loads=0,saves=0,disposals=0;
  const repository={load:async()=>{loads++;return snapshot('Private A');},save:async()=>{saves++;},dispose(){disposals++;}};
  const session=createWorkspaceSession({auth,createRepository:()=>repository,onChange:event=>events.push(event)});
  await flush();assert.equal(loads,1);assert.equal(saves,0);
  assert.equal(events.at(-1).status,'ready');assert.equal(events.at(-1).snapshot.boards[0].name,'Private A');
  auth.change({...auth.state});await flush();assert.equal(loads,1);
  session.dispose();assert.equal(disposals,1);
});

test('absent database data creates an empty in-memory board and never calls save',async()=>{
  let saves=0;const events=[];
  const session=createWorkspaceSession({auth:fakeAuth(),createRepository:()=>({load:async()=>null,save:async()=>saves++,dispose(){}}),onChange:event=>events.push(event)});
  await flush();const ready=events.at(-1);
  assert.equal(ready.status,'ready');assert.equal(ready.snapshot.boards.length,1);
  assert.equal(ready.snapshot.boards[0].name,'All');assert.deepEqual(ready.snapshot.cards,[]);
  assert.deepEqual(ready.snapshot.projects,[]);assert.equal(saves,0);session.dispose();
});

test('old loads cannot populate another account or a signed-out screen',async()=>{
  const auth=fakeAuth(),old=deferred(),events=[];let disposed=0;
  const session=createWorkspaceSession({auth,createRepository:()=>({
    load:auth.state.userId==='user_A'?()=>old.promise:async()=>snapshot('Private B'),dispose(){disposed++;}
  }),onChange:event=>events.push(event)});
  auth.change({status:'verified',userId:'user_B',sessionId:'session_B',label:'Account B'});
  await flush();assert.equal(events.at(-1).snapshot.boards[0].name,'Private B');
  old.resolve(snapshot('Private A'));await flush();assert.equal(events.at(-1).snapshot.boards[0].name,'Private B');
  auth.change({status:'signed-out'});assert.equal(events.at(-1).status,'auth');
  assert.equal(disposed,2);session.dispose();
});

test('load failures display an error rather than an empty workspace; retry reconstructs the repository',async()=>{
  const events=[];let attempts=0;
  const session=createWorkspaceSession({auth:fakeAuth(),createRepository:()=>{
    const fail=++attempts===1;return {async load(){if(fail)throw Error('private database details');return snapshot('Recovered');},dispose(){}};
  },onChange:event=>events.push(event)});
  await flush();assert.equal(events.at(-1).status,'error');
  assert.equal(events.at(-1).snapshot,undefined);assert.doesNotMatch(events.at(-1).message,/private database/);
  session.retry();await flush();assert.equal(events.at(-1).snapshot.boards[0].name,'Recovered');
  assert.equal(attempts,2);session.dispose();
});

test('disposal suppresses both success and failure from outstanding loads',async()=>{
  const events=[],pending=deferred();let disposed=0;
  const session=createWorkspaceSession({auth:fakeAuth(),createRepository:()=>({load:()=>pending.promise,dispose(){disposed++;}}),onChange:event=>events.push(event)});
  session.dispose();pending.resolve(snapshot('Late'));await flush();
  assert.equal(events.length,1);assert.equal(events[0].status,'loading');assert.equal(disposed,1);
});

test('fixture API supports account-bound editing and reloading with no startup writes',async()=>{
  const auth=fakeAuth(),stored=new Map(),calls=[],events=[];
  const fetchImpl=async(_url,request)=>{
    const owner=request.headers.Authorization.slice(7);calls.push({owner,method:request.method});
    let body=stored.get(owner) || {snapshot:null,revision:'0',updatedAt:null};
    if(request.method==='PUT') {
      const input=JSON.parse(request.body);
      assert.equal(input.revision,body.revision);
      body={snapshot:input.snapshot,revision:String(BigInt(body.revision)+1n),updatedAt:'2026-11-19T20:00:00.000Z'};
      stored.set(owner,body);
    }
    return {ok:true,status:200,json:async()=>structuredClone(body)};
  };
  const createRepository=()=>new ApiBoardRepository({auth,fetchImpl});
  const session=createWorkspaceSession({auth,createRepository,onChange:event=>events.push(event)});
  await flush();assert.deepEqual(calls,[{owner:'user_A',method:'GET'}]);
  const edited=snapshot('Private A');
  edited.cards.push({id:'note_A',boardId:'board',type:'note',title:'A private note',body:'Saved through the API adapter',projectId:null,date:'',pinned:false,items:[]});
  await events.at(-1).repository.save(edited);
  session.dispose();
  const second=createWorkspaceSession({auth,createRepository,onChange:event=>events.push(event)});
  await flush();assert.equal(events.at(-1).snapshot.boards[0].name,'Private A');
  assert.equal(events.at(-1).snapshot.cards[0].title,'A private note');
  auth.change({status:'signed-out'});
  auth.change({status:'verified',userId:'user_B',sessionId:'session_B',label:'Account B'});
  await flush();assert.deepEqual(events.at(-1).snapshot.cards,[]);
  assert.equal(events.at(-1).snapshot.boards[0].name,'All');
  assert.equal(calls.filter(call=>call.method==='PUT').length,1);second.dispose();
});

test('empty workspace factory returns independent valid snapshots',()=>{
  const first=createEmptyWorkspace(),second=createEmptyWorkspace();
  assert.notEqual(first.boards[0].id,second.boards[0].id);
  first.boards[0].name='Changed';assert.equal(second.boards[0].name,'All');
});

test('rendering failures are distinguished from failed workspace requests without exposing details',async()=>{
  const errors=[];
  const session=createWorkspaceSession({auth:fakeAuth(),createRepository:()=>({load:async()=>snapshot('All'),dispose(){}}),
    onChange:event=>{if(event.status==='ready')throw Error('private renderer detail');if(event.status==='error')errors.push(event);}});
  await flush();assert.equal(errors[0].phase,'display');
  assert.match(errors[0].message,/loaded, but the board could not be displayed/);
  assert.doesNotMatch(JSON.stringify(errors),/private renderer detail/);session.dispose();
});
