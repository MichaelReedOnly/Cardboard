import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiBoardRepository,ApiStorageError} from '../src/api-storage.js';

const state=(name='All')=>({version:1,boards:[{id:'board',name}],projects:[],cards:[]});
const stamp='2026-11-19T20:00:00.000Z';
const envelope=(snapshot=state(),revision='1')=>({snapshot,revision,updatedAt:snapshot===null?null:stamp});
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>structuredClone(body)});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const kind=expected=>error=>error instanceof ApiStorageError && error.kind===expected;
function fixture(initial=envelope()) {
  let authState={status:'verified',userId:'user_A'},stored=structuredClone(initial),tokens=0;
  const listeners=new Set(),calls=[];
  const auth={get state(){return authState;},async getToken(){return `token_${++tokens}`;},
    subscribe(fn){listeners.add(fn);fn(authState);return ()=>listeners.delete(fn);}};
  const fetchImpl=async(url,options)=>{
    calls.push({url,...options});
    if (options.method==='GET') return response(stored);
    const input=JSON.parse(options.body);
    if (input.revision!==stored.revision) return response({error:'stale'},409);
    stored=envelope(input.snapshot,String(BigInt(stored.revision)+1n));
    return response(stored);
  };
  const changeAuth=next=>{authState=next;for(const listener of listeners)listener(next);};
  return {auth,fetchImpl,calls,changeAuth,get stored(){return stored;}};
}

test('empty load is read-only and cannot be exported until a snapshot exists',async()=>{
  const f=fixture(envelope(null,'0')),repo=new ApiBoardRepository(f);
  assert.equal(await repo.load(),null);assert.equal(repo.revision,'0');
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'GET');
  await assert.rejects(()=>repo.exportJSON(),kind('empty'));
  await repo.save(state());assert.equal(repo.revision,'1');repo.dispose();
});

test('load and exports are defensive; queue uses exact revisions and fresh tokens',async()=>{
  const f=fixture(),repo=new ApiBoardRepository(f);
  const loaded=await repo.load();loaded.boards[0].name='unsaved';
  assert.equal(JSON.parse(await repo.exportJSON()).boards[0].name,'All');
  const first=state('First'),second=state('Second');
  const one=repo.save(first),two=repo.save(second);
  first.boards[0].name='mutated';second.boards[0].name='mutated';
  const [saved1,saved2]=await Promise.all([one,two]);
  assert.equal(saved1.boards[0].name,'First');assert.equal(saved2.boards[0].name,'Second');
  assert.deepEqual(f.calls.slice(1).map(call=>JSON.parse(call.body).revision),['1','2']);
  assert.deepEqual(f.calls.map(call=>call.headers.Authorization),['Bearer token_1','Bearer token_2','Bearer token_3']);
  assert.ok(f.calls.every(call=>call.url==='/api/workspace' && call.credentials==='omit'));
  assert.equal(repo.revision,'3');assert.equal(repo.recoverySnapshot,null);
  saved2.boards[0].name='bad';assert.equal(JSON.parse(await repo.exportJSON()).boards[0].name,'Second');
  repo.dispose();
});

test('validation precedes writes and legacy import migrates before revision-checked save',async()=>{
  const f=fixture(),repo=new ApiBoardRepository(f);await repo.load();
  await assert.rejects(()=>repo.importJSON('{bad'),kind('validation'));
  await assert.rejects(()=>repo.importJSON('{}'),kind('validation'));
  await assert.rejects(()=>repo.save({}),kind('validation'));
  assert.equal(f.calls.length,1);
  const legacy={...state(),projects:[{id:'p',boardId:'board',name:'Work'}]};
  const saved=await repo.importJSON(JSON.stringify(legacy));
  assert.equal(saved.projects[0].boardId,undefined);assert.match(saved.projects[0].color,/^#/);
  assert.equal(repo.revision,'2');repo.dispose();
});

test('typed API errors preserve acknowledged and recovery data without exposing server details',async()=>{
  for (const [status,errorKind,blocked] of [[401,'auth',false],[403,'auth',false],[409,'conflict',true],[413,'size',false],[400,'validation',false],[503,'service',true]]) {
    const f=fixture();let fail=false;
    const repo=new ApiBoardRepository({...f,fetchImpl:async(...args)=>fail?response({error:'private password details'},status):f.fetchImpl(...args)});
    await repo.load();fail=true;
    const error=await repo.save(state('Draft')).catch(error=>error);
    assert.ok(kind(errorKind)(error));assert.doesNotMatch(error.message,/password|details/);
    assert.equal(repo.needsReload,blocked);
    assert.equal(JSON.parse(await repo.exportJSON()).boards[0].name,'All');
    const recovery=repo.recoverySnapshot;assert.equal(recovery.boards[0].name,'Draft');
    recovery.boards[0].name='mutated';assert.equal(repo.recoverySnapshot.boards[0].name,'Draft');
    if (blocked) await assert.rejects(()=>repo.save(state('Later')),kind('reload-required'));
    repo.dispose();
  }
});

test('lost write response blocks queued writes, retains latest draft, and requires explicit reload',async()=>{
  const f=fixture();let lose=true,puts=0;
  const repo=new ApiBoardRepository({...f,fetchImpl:async(...args)=>{
    const result=await f.fetchImpl(...args);
    if(args[1].method==='PUT'){puts++;if(lose){lose=false;throw Error('connection lost');}}
    return result;
  }});
  await repo.load();
  const results=await Promise.allSettled([repo.save(state('First')),repo.save(state('Latest'))]);
  assert.ok(kind('network')(results[0].reason));assert.ok(kind('reload-required')(results[1].reason));
  assert.equal(puts,1);assert.equal(repo.revision,'1');
  assert.equal(repo.recoverySnapshot.boards[0].name,'Latest');
  assert.equal((await repo.load()).boards[0].name,'First');assert.equal(repo.revision,'2');
  assert.equal(repo.recoverySnapshot.boards[0].name,'Latest');
  await repo.save(repo.recoverySnapshot);assert.equal(repo.revision,'3');assert.equal(repo.recoverySnapshot,null);
  repo.dispose();
});

test('malformed envelopes and wrong save revisions never replace acknowledged state',async()=>{
  for(const bad of [envelope(state(),'01'),envelope(null,'1'),envelope({},'2'),{...envelope(),updatedAt:'invalid'},envelope(state(),'4')]) {
    const f=fixture();let write=false;
    const repo=new ApiBoardRepository({...f,fetchImpl:async(...args)=>write?response(bad):f.fetchImpl(...args)});
    await repo.load();write=true;
    await assert.rejects(()=>repo.save(state('Draft')),kind('response'));
    assert.equal(repo.revision,'1');assert.equal(repo.needsReload,true);
    assert.equal(JSON.parse(await repo.exportJSON()).boards[0].name,'All');repo.dispose();
  }
});

test('bigint revisions are strings and maximum revision cannot be incremented',async()=>{
  const f=fixture(envelope(state(),'9007199254740993')),repo=new ApiBoardRepository(f);
  await repo.load();await repo.save(state());assert.equal(repo.revision,'9007199254740994');repo.dispose();
  const max=fixture(envelope(state(),'9223372036854775807')),full=new ApiBoardRepository(max);
  await full.load();await assert.rejects(()=>full.save(state()),kind('revision-limit'));
  assert.equal(max.calls.length,1);full.dispose();
});

test('UTF-8 request limit includes wrapper and preserves oversized candidate without sending',async()=>{
  const f=fixture(),repo=new ApiBoardRepository(f);await repo.load();
  const big=state('😀'.repeat(1_250_000));
  await assert.rejects(()=>repo.save(big),kind('size'));
  assert.equal(f.calls.length,1);assert.equal(repo.recoverySnapshot.boards[0].name,big.boards[0].name);repo.dispose();
});

test('a response from an earlier account is discarded and all repository access is revoked',async()=>{
  const f=fixture(),pending=deferred();
  const repo=new ApiBoardRepository({...f,fetchImpl:()=>pending.promise});
  const loaded=repo.load();await new Promise(resolve=>setImmediate(resolve));
  f.changeAuth({status:'verified',userId:'user_B'});pending.resolve(response(envelope()));
  await assert.rejects(()=>loaded,kind('session'));
  await assert.rejects(()=>repo.exportJSON(),kind('session'));
  assert.throws(()=>repo.recoverySnapshot,kind('session'));
  assert.throws(()=>repo.revision,kind('session'));repo.dispose();
});

test('session change while retrieving a token prevents transmission',async()=>{
  const f=fixture(),pending=deferred();f.auth.getToken=()=>pending.promise;
  const repo=new ApiBoardRepository(f),load=repo.load();await Promise.resolve();
  f.changeAuth({status:'signed-out'});pending.resolve('old-token');
  await assert.rejects(()=>load,kind('session'));assert.equal(f.calls.length,0);repo.dispose();
});

test('timeouts unblock callers, stop later writes and allow disposal without retaining private state',async()=>{
  const f=fixture();let hang=false;
  const repo=new ApiBoardRepository({...f,requestTimeoutMs:20,fetchImpl:(...args)=>hang?new Promise(()=>{}):f.fetchImpl(...args)});
  await repo.load();hang=true;
  await assert.rejects(()=>repo.save(state('Draft')),kind('network'));
  assert.equal(repo.needsReload,true);repo.dispose();
  await assert.rejects(()=>repo.load(),kind('session'));
});

test('repository requires verified identity and refuses saves before loading',async()=>{
  assert.throws(()=>new ApiBoardRepository({auth:{state:{status:'signed-out'}}}),kind('auth'));
  const f=fixture(),repo=new ApiBoardRepository(f);
  await assert.rejects(()=>repo.save(state()),kind('not-loaded'));
  assert.equal(f.calls.length,0);repo.dispose();
});

test('invalid reads retain acknowledged content and block writes until a valid reload',async()=>{
  const f=fixture();let bad=false;
  const repo=new ApiBoardRepository({...f,fetchImpl:(...args)=>bad?response(envelope(state(),'0')):f.fetchImpl(...args)});
  await repo.load();bad=true;
  await assert.rejects(()=>repo.load(),kind('response'));
  assert.equal(repo.revision,'1');assert.equal(repo.needsReload,true);
  assert.equal(JSON.parse(await repo.exportJSON()).boards[0].name,'All');
  await assert.rejects(()=>repo.save(state('Recovery')),kind('reload-required'));
  bad=false;await repo.load();assert.equal(repo.needsReload,false);
  assert.equal(repo.recoverySnapshot.boards[0].name,'Recovery');repo.dispose();
});

test('account changes during response parsing discard a potentially committed save',async()=>{
  const f=fixture(),parsing=deferred(),started=deferred();let writing=false;
  const repo=new ApiBoardRepository({...f,fetchImpl:(...args)=>writing
    ? {ok:true,status:200,json:()=>{started.resolve();return parsing.promise;}}
    : f.fetchImpl(...args)});
  await repo.load();writing=true;const saved=repo.save(state('Draft'));
  await started.promise;f.changeAuth({status:'signed-out'});
  parsing.resolve(envelope(state('Draft'),'2'));
  await assert.rejects(()=>saved,kind('session'));repo.dispose();
});

test('exact UTF-8 envelope limit is accepted and one extra byte is rejected',async()=>{
  const f=fixture(),repo=new ApiBoardRepository(f);await repo.load();
  const overhead=new TextEncoder().encode(JSON.stringify({revision:'1',snapshot:state('x')})).byteLength-1;
  await repo.save(state('x'.repeat(5_000_000-overhead)));
  assert.equal(f.calls.length,2);
  await assert.rejects(()=>repo.save(state('x'.repeat(5_000_001-overhead))),kind('size'));
  assert.equal(f.calls.length,2);repo.dispose();
});

test('token retrieval that finishes after timeout never starts a late request',async()=>{
  const f=fixture(),pending=deferred();f.auth.getToken=()=>pending.promise;
  const repo=new ApiBoardRepository({...f,requestTimeoutMs:20});
  await assert.rejects(()=>repo.load(),kind('network'));
  pending.resolve('late-token');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.length,0);repo.dispose();
});

test('fetch is invoked as a standalone function, not as a repository method',async()=>{
  const f=fixture();
  const fetchImpl=function(...args){
    // Browser host functions can reject an incompatible object receiver.
    if(this!==undefined)throw new TypeError('Illegal invocation');
    return f.fetchImpl(...args);
  };
  const repo=new ApiBoardRepository({...f,fetchImpl});
  assert.deepEqual(await repo.load(),state());repo.dispose();
});
