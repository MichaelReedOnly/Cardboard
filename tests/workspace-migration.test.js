import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkspaceMigration,captureMigrationOwner} from '../src/workspace-migration.js';
import {readLocalWorkspaceJSON} from '../src/storage.js';
import {ApiBoardRepository} from '../src/api-storage.js';
import {SaveController} from '../src/save-controller.js';

const snapshot=name=>({version:1,boards:[{id:'b',name}],projects:[],cards:[]});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  let account={status:'verified',userId:'user_A',sessionId:'session_A',label:'Account A'},stored=snapshot('Original'),revision='1';
  const listeners=new Set(),calls=[];
  const auth={get state(){return account;},getToken:async()=> 'fixture',subscribe(fn){listeners.add(fn);fn(account);return ()=>listeners.delete(fn);}};
  const fetchImpl=async(_url,request)=>{
    calls.push({method:request.method,body:request.body});
    if(request.method==='PUT'){
      const input=JSON.parse(request.body);if(input.revision!==revision)return {ok:false,status:409};
      stored=input.snapshot;revision=String(BigInt(revision)+1n);
    }
    return {ok:true,status:200,json:async()=>({snapshot:structuredClone(stored),revision,updatedAt:stored===null?null:'2026-11-20T12:00:00.000Z'})};
  };
  const repo=new ApiBoardRepository({auth,fetchImpl});
  return {auth,repo,calls,createRepository:()=>new ApiBoardRepository({auth,fetchImpl}),
    latest(value,rev){stored=value;revision=rev;},get stored(){return stored;},get revision(){return revision;},
    account(next){account=next;for(const listener of listeners)listener(next);}};
}
async function ready(){
  const f=fixture(),state=await f.repo.load();
  const controller=new SaveController({repository:f.repo,initialState:state,mode:'database'});
  const migration=new WorkspaceMigration({auth:f.auth,saveController:controller,createRepository:f.createRepository});
  return Object.assign(f,{controller,migration,dispose(){migration.dispose();controller.dispose();f.repo.dispose();}});
}

test('explicit local read distinguishes missing storage from seed data and never writes',()=>{
  let writes=0;const raw=JSON.stringify(snapshot('Local'));
  const storage={getItem:key=>{assert.equal(key,'cardboard.v1');return raw;},setItem(){writes++;},removeItem(){writes++;}};
  assert.equal(readLocalWorkspaceJSON(storage),raw);assert.equal(writes,0);
  assert.equal(readLocalWorkspaceJSON({getItem:()=>null}),null);
  assert.throws(()=>readLocalWorkspaceJSON({getItem(){throw Error('private details');}}),/could not be read/);
});

test('preview validates source and reads destination without changing live revision or data',async()=>{
  const f=await ready();f.latest(snapshot('Other device'),'3');
  const raw=JSON.stringify(snapshot('Local source'),null,2);await f.migration.prepare(raw,'This browser');
  assert.equal(f.migration.details.destination.revision,'3');assert.equal(f.repo.revision,'1');
  assert.equal(f.migration.sourceJSON(),raw);assert.equal(JSON.parse(f.migration.destinationJSON()).boards[0].name,'Other device');
  assert.equal(f.calls.filter(call=>call.method==='PUT').length,0);
  f.dispose();
});

test('confirmed import uses preview revision even when the live board cached an older revision',async()=>{
  const f=await ready();f.latest(snapshot('Other device'),'3');const raw=JSON.stringify(snapshot('Local source'));
  await f.migration.prepare(raw,'Backup');
  await assert.rejects(()=>f.migration.commit({revision:'3'}),e=>e.kind==='confirmation-required');
  const saved=await f.migration.commit({confirmed:true,revision:'3'});
  assert.equal(saved.boards[0].name,'Local source');assert.equal(f.repo.revision,'4');assert.equal(f.controller.status.phase,'saved');
  const write=f.calls.find(call=>call.method==='PUT');assert.equal(JSON.parse(write.body).revision,'3');
  assert.equal(f.migration.sourceJSON(),raw);f.dispose();
});

test('another writer after preview produces conflict with retained import candidate',async()=>{
  const f=await ready();await f.migration.prepare(JSON.stringify(snapshot('Local')),'Backup');
  f.latest(snapshot('Newer'),'2');await assert.rejects(()=>f.migration.commit({confirmed:true,revision:'1'}),e=>e.kind==='conflict');
  assert.equal(f.stored.boards[0].name,'Newer');assert.equal(f.controller.recoverySnapshot.boards[0].name,'Local');
  assert.equal(f.migration.details.phase,'error');assert.equal(JSON.parse(f.migration.sourceJSON()).boards[0].name,'Local');f.dispose();
});

test('invalid sources are rejected before destination requests; legacy sources migrate and preserve original JSON',async()=>{
  const f=await ready(),baseline=f.calls.length;
  await assert.rejects(()=>f.migration.prepare('{}','Bad'),e=>e.kind==='validation');assert.equal(f.calls.length,baseline);
  const legacy={...snapshot('Legacy'),projects:[{id:'p',boardId:'b',name:'Work'}]};const raw=JSON.stringify(legacy);
  await f.migration.prepare(raw,'Legacy');assert.equal(f.migration.sourceJSON(),raw);
  const saved=await f.migration.commit({confirmed:true,revision:'1'});
  assert.equal(saved.projects[0].boardId,undefined);assert.match(saved.projects[0].color,/^#/);f.dispose();
});

test('oversized source can be backed up but cannot be committed',async()=>{
  const f=await ready(),raw=JSON.stringify(snapshot('x'.repeat(5_000_000)));
  await f.migration.prepare(raw,'Large source');assert.equal(f.migration.details.tooLarge,true);
  await assert.rejects(()=>f.migration.commit({confirmed:true,revision:'1'}),e=>e.kind==='size');
  assert.equal(f.migration.sourceJSON(),raw);assert.equal(f.calls.filter(call=>call.method==='PUT').length,0);f.dispose();
});

test('account changes cancel delayed preview and revoke source/destination access',async()=>{
  const f=await ready();let resolve;
  f.migration.dispose();
  const migration=new WorkspaceMigration({auth:f.auth,saveController:f.controller,createRepository:()=>({load:()=>new Promise(r=>resolve=r),revision:'1',dispose(){}})});
  const preparing=migration.prepare(JSON.stringify(snapshot('Local')),'Backup');await tick();
  f.account({status:'verified',userId:'user_B',sessionId:'session_B',label:'Account B'});resolve(snapshot('A'));
  await assert.rejects(()=>preparing,e=>e.kind==='session');assert.throws(()=>migration.sourceJSON(),e=>e.kind==='session');
  migration.dispose();f.dispose();
});

test('unsaved account changes block migration rather than being silently replaced',async()=>{
  const f=await ready();await f.controller.save(snapshot('Saved normally'));
  // A definite API rejection retains a valid edit in the actual controller.
  const tooLarge=snapshot('x'.repeat(5_000_000));await assert.rejects(()=>f.controller.save(tooLarge));
  const baseline=f.calls.length;
  await assert.rejects(()=>f.migration.prepare(JSON.stringify(snapshot('Source')),'Backup'),e=>e.kind==='unsaved');
  assert.equal(f.calls.length,baseline);f.dispose();
});

test('absent account workspace previews as empty without offering a misleading backup',async()=>{
  const f=await ready();f.latest(null,'0');await f.migration.prepare(JSON.stringify(snapshot('Local')),'Backup');
  assert.equal(f.migration.details.destination.exists,false);assert.equal(f.migration.details.destination.cards,0);
  assert.throws(()=>f.migration.destinationJSON(),e=>e.kind==='empty');f.dispose();
});

test('file chooser ownership is captured before selection and rejects new account or repository results',async()=>{
  const f=await ready(),current={auth:f.auth,repository:f.repo,saveController:f.controller};
  const ticket=captureMigrationOwner(current);assert.equal(ticket.matches(current),true);
  f.account({status:'verified',userId:'user_B',sessionId:'session_B'});assert.equal(ticket.matches(current),false);
  const local=captureMigrationOwner({...current,auth:null});
  assert.equal(local.matches({...current,auth:null,repository:{}}),false);f.dispose();
});
