import test from 'node:test';
import assert from 'node:assert/strict';
import {SaveController,snapshotsEqual} from '../src/save-controller.js';
import {ApiBoardRepository} from '../src/api-storage.js';

const state=name=>({version:1,boards:[{id:'board',name}],projects:[],cards:[]});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture() {
  let stored=state('Original'),revision='1',fail='conflict',putCount=0,getCount=0,clears=0;
  const repository={get revision(){return revision;},
    async save(snapshot){putCount++;if(fail)throw Object.assign(Error('private error'),{kind:fail});stored=structuredClone(snapshot);revision=String(BigInt(revision)+1n);return structuredClone(stored);},
    async load(){getCount++;return structuredClone(stored);},async clearRecovery(){clears++;}};
  const controller=new SaveController({repository,initialState:state('Original'),mode:'database'});
  return {controller,repository,get putCount(){return putCount;},get getCount(){return getCount;},get clears(){return clears;},
    latest(snapshot,rev){stored=snapshot;revision=rev;},set failure(value){fail=value;}};
}

test('snapshot comparison ignores object key order but preserves arrays and content',()=>{
  assert.equal(snapshotsEqual(state('Same'),{cards:[],projects:[],boards:[{name:'Same',id:'board'}],version:1}),true);
  assert.equal(snapshotsEqual(state('A'),state('B')),false);
  assert.equal(snapshotsEqual({values:[1,2]},{values:[2,1]}),false);
  assert.equal(snapshotsEqual(null,state('A')),false);
});

test('matching uncertain save is confirmed by read without another PUT and clears both recovery copies',async()=>{
  const f=fixture();f.failure='network';
  await assert.rejects(()=>f.controller.save(state('Submitted')));
  f.latest(state('Submitted'),'2');const result=await f.controller.checkLatest();
  assert.equal(result.matched,true);assert.equal(result.snapshot.boards[0].name,'Submitted');
  assert.equal(f.putCount,1);assert.equal(f.getCount,1);assert.equal(f.clears,1);
  assert.equal(f.controller.status.phase,'saved');assert.equal(f.controller.recoverySnapshot,null);f.controller.dispose();
});

test('different latest data preserves candidate and acknowledgement until a confirmed choice',async()=>{
  const f=fixture();await assert.rejects(()=>f.controller.save(state('Mine')));
  f.latest(state('Other device'),'2');const result=await f.controller.checkLatest();
  assert.equal(result.matched,false);assert.equal(f.controller.status.phase,'recovery');
  assert.equal(f.controller.recoverySnapshot.boards[0].name,'Mine');
  assert.equal(f.controller.acknowledgedSnapshot.boards[0].name,'Original');
  assert.equal(f.controller.recoveryDetails.baseRevision,'1');
  assert.equal(f.controller.recoveryDetails.latest.revision,'2');
  await assert.rejects(()=>f.controller.useLatest({revision:'2'}),e=>e.kind==='confirmation-required');
  const adopted=await f.controller.useLatest({confirmed:true,revision:'2'});
  assert.equal(adopted.boards[0].name,'Other device');assert.equal(f.putCount,1);
  assert.equal(f.controller.recoverySnapshot,null);assert.equal(f.clears,1);f.controller.dispose();
});

test('replacement requires a checked version and confirmation then writes only once',async()=>{
  const f=fixture();await assert.rejects(()=>f.controller.save(state('Mine')));
  await assert.rejects(()=>f.controller.replaceLatest({confirmed:true,revision:'1'}));
  f.latest(state('Other'),'2');await f.controller.checkLatest();
  await assert.rejects(()=>f.controller.replaceLatest({revision:'2'}),e=>e.kind==='confirmation-required');
  await assert.rejects(()=>f.controller.replaceLatest({confirmed:true,revision:'1'}),e=>e.kind==='stale-recovery');
  f.failure=null;
  const saved=await f.controller.replaceLatest({confirmed:true,revision:'2'});
  assert.equal(saved.boards[0].name,'Mine');assert.equal(f.repository.revision,'3');
  assert.equal(f.putCount,2);assert.equal(f.controller.status.phase,'saved');f.controller.dispose();
});

test('failed recovery reads and repeated conflicts keep the candidate and require another check',async()=>{
  const f=fixture();await assert.rejects(()=>f.controller.save(state('Mine')));
  const load=f.repository.load;f.repository.load=async()=>{throw Error('private DB details');};
  await assert.rejects(()=>f.controller.checkLatest());
  assert.equal(f.controller.recoverySnapshot.boards[0].name,'Mine');
  assert.equal(f.controller.status.pending,false);assert.equal(f.controller.status.blocked,true);
  assert.doesNotMatch(f.controller.status.message,/private/);
  f.repository.load=load;f.latest(state('Other'),'2');await f.controller.checkLatest();
  await assert.rejects(()=>f.controller.replaceLatest({confirmed:true,revision:'2'}));
  assert.equal(f.controller.status.phase,'conflict');assert.equal(f.controller.recoveryDetails.latest,null);
  await assert.rejects(()=>f.controller.replaceLatest({confirmed:true,revision:'2'}));
  assert.equal(f.putCount,2);assert.equal(f.controller.recoverySnapshot.boards[0].name,'Mine');f.controller.dispose();
});

test('dispose during a recovery read prevents candidate adoption and status updates',async()=>{
  const f=fixture(),pending=deferred();await assert.rejects(()=>f.controller.save(state('Mine')));
  f.repository.load=()=>pending.promise;const check=f.controller.checkLatest();f.controller.dispose();
  pending.resolve(state('Mine'));await assert.rejects(()=>check,e=>e.kind==='session');
  assert.equal(f.clears,0);assert.throws(()=>f.controller.recoveryDetails,e=>e.kind==='session');
});

test('explicitly choosing an absent saved workspace clears the candidate without writing',async()=>{
  const f=fixture();await assert.rejects(()=>f.controller.save(state('Mine')));
  f.latest(null,'0');await f.controller.checkLatest();
  assert.equal(f.controller.recoveryDetails.latest.exists,false);
  assert.equal(await f.controller.useLatest({confirmed:true,revision:'0'}),null);
  assert.equal(f.controller.status.phase,'new');assert.equal(f.putCount,1);f.controller.dispose();
});

test('real adapter recovery uses checked revision and rejects an intervening writer',async()=>{
  let stored=state('Original'),revision='1',loseResponse=true,puts=0;
  const auth={state:{status:'verified',userId:'user_A'},getToken:async()=> 'fixture',subscribe(fn){fn(this.state);return ()=>{};}};
  const repository=new ApiBoardRepository({auth,fetchImpl:async(_url,request)=>{
    if(request.method==='PUT') {
      puts++;const input=JSON.parse(request.body);
      if(input.revision!==revision)return {ok:false,status:409};
      stored=input.snapshot;revision=String(BigInt(revision)+1n);
      if(loseResponse){loseResponse=false;throw Error('lost response');}
    }
    return {ok:true,status:200,json:async()=>({snapshot:structuredClone(stored),revision,updatedAt:'2026-11-19T20:00:00.000Z'})};
  }});
  const initial=await repository.load();const controller=new SaveController({repository,initialState:initial,mode:'database'});
  await assert.rejects(()=>controller.save(state('Mine')));
  stored=state('Intervening');revision='3';await controller.checkLatest();
  stored=state('Another writer');revision='4';
  await assert.rejects(()=>controller.replaceLatest({confirmed:true,revision:'3'}),e=>e.kind==='conflict');
  assert.equal(stored.boards[0].name,'Another writer');assert.equal(puts,2);
  await controller.checkLatest();await controller.replaceLatest({confirmed:true,revision:'4'});
  assert.equal(stored.boards[0].name,'Mine');assert.equal(revision,'5');
  controller.dispose();repository.dispose();
});

test('pending recovery checks reject additional writes and checks without replacing the retained edit',async()=>{
  const f=fixture(),pending=deferred();await assert.rejects(()=>f.controller.save(state('Mine')));
  f.repository.load=()=>pending.promise;const checking=f.controller.checkLatest();
  await assert.rejects(()=>f.controller.save(state('Other')),e=>e.kind==='busy');
  await assert.rejects(()=>f.controller.checkLatest(),e=>e.kind==='busy');
  pending.resolve(state('Saved'));await checking;
  assert.equal(f.controller.recoverySnapshot.boards[0].name,'Mine');f.controller.dispose();
});

test('failed replacement remains uncertain without discarding the submitted candidate',async()=>{
  const f=fixture();await assert.rejects(()=>f.controller.save(state('Mine')));
  f.latest(state('Other'),'2');await f.controller.checkLatest();f.failure='service';
  await assert.rejects(()=>f.controller.replaceLatest({confirmed:true,revision:'2'}));
  assert.equal(f.controller.status.phase,'unknown');assert.equal(f.controller.recoveryDetails.latest,null);
  assert.equal(f.controller.recoverySnapshot.boards[0].name,'Mine');f.controller.dispose();
});

test('dispose during explicit adoption cannot restore old account content',async()=>{
  const f=fixture(),pending=deferred();await assert.rejects(()=>f.controller.save(state('Mine')));
  f.latest(state('Other'),'2');await f.controller.checkLatest();
  f.repository.clearRecovery=()=>pending.promise;
  const adopting=f.controller.useLatest({confirmed:true,revision:'2'});f.controller.dispose();pending.resolve();
  await assert.rejects(()=>adopting,e=>e.kind==='session');
  assert.throws(()=>f.controller.acknowledgedSnapshot,e=>e.kind==='session');
});
