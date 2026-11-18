import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorkspace,InvalidWorkspaceError,validateWorkspaceSave,WorkspaceInputError} from '../backend/workspaces.js';
import {Readable} from 'node:stream';
import {createWorkspaceHandler} from '../backend/workspace-route.js';
import {SessionError} from '../backend/auth.js';

const snapshot = {version:1,boards:[{id:'board',name:'Private board'}],projects:[],cards:[]};
const updated_at = new Date('2026-11-17T15:00:00.000Z');
test('save input rejects invalid revisions and snapshots',()=>{
  for (const revision of [0,'-1','01','1.5','9223372036854775807']) {
    assert.throws(()=>validateWorkspaceSave({snapshot,revision}),WorkspaceInputError);
  }
  assert.throws(()=>validateWorkspaceSave({snapshot:{},revision:'0'}),WorkspaceInputError);
});

test('PUT uses the verified owner, returns new revision and maps stale writes to conflict',async()=>{
  const pool = {async query(sql,values) {
    assert.deepEqual(values,['verified',JSON.stringify(snapshot),'2']);
    assert.match(sql,/AND revision=\$3::bigint/);
    return {rows:[{snapshot,revision:'3',updated_at}]};
  }};
  const handler = createWorkspaceHandler(async()=> 'verified',()=>pool);
  function put() {
    const req = Readable.from([Buffer.from(JSON.stringify({snapshot,revision:'2',userId:'other'}))]);
    req.method = 'PUT';
    req.headers = {'content-type':'application/json'};
    return req;
  }
  const res = response();
  await handler(put(),res);
  assert.equal(res.status,200);
  assert.equal(res.body.revision,'3');
  pool.query = async()=>({rows:[]});
  const conflict = response();
  await handler(put(),conflict);
  assert.equal(conflict.status,409);
});

test('malformed PUT body is rejected before database access',async()=>{
  const handler = createWorkspaceHandler(async()=> 'verified',()=>assert.fail('Unexpected database access'));
  const req = Readable.from([Buffer.from('{bad')]);
  req.method = 'PUT';
  req.headers = {'content-type':'application/json'};
  const res = response();
  await handler(req,res);
  assert.equal(res.status,400);
});
function response() {
  return {
    headers:{},
    setHeader(name,value) { this.headers[name]=value; },
    writeHead(status,headers) { this.status=status; Object.assign(this.headers,headers); },
    end(body) { this.body=JSON.parse(body); },
  };
}

test('load returns an empty account without a database write',async()=>{
  const pool = {async query(sql,values) {
    assert.match(sql,/^SELECT /);
    assert.deepEqual(values,['user_a']);
    return {rows:[]};
  }};
  assert.deepEqual(await loadWorkspace(pool,'user_a'),{snapshot:null,revision:'0',updatedAt:null});
});

test('load retains bigint precision and validates stored content',async()=>{
  const row = {snapshot,revision:'9007199254740993',updated_at};
  const pool = {query:async()=>({rows:[row]})};
  const loaded = await loadWorkspace(pool,'user_a');
  assert.equal(loaded.revision,row.revision);
  assert.deepEqual(loaded.snapshot,snapshot);
  assert.equal(loaded.updatedAt,updated_at.toISOString());
  row.snapshot = {};
  await assert.rejects(()=>loadWorkspace(pool,'user_a'),InvalidWorkspaceError);
});

test('workspace route queries only the verified account despite supplied ownership fields',async()=>{
  const pool = {async query(sql,values) {
    assert.deepEqual(values,['user_a']);
    return {rows:[{snapshot,revision:'2',updated_at}]};
  }};
  const handler = createWorkspaceHandler(async()=> 'user_a',()=>pool);
  const res = response();
  await handler({method:'GET',url:'/api/workspace?userId=user_b',userId:'user_b'},res);
  assert.equal(res.status,200);
  assert.equal(res.headers['Cache-Control'],'no-store');
  assert.deepEqual(res.body.snapshot,snapshot);
});

test('authentication and database errors retain appropriate status without leaking details',async()=>{
  const req = {method:'GET',url:'/api/workspace'};
  const denied = createWorkspaceHandler(async()=>{throw new SessionError(401,'Sign-in required');},
    ()=>{assert.fail('Database must not be accessed');});
  const res = response();
  await denied(req,res);
  assert.equal(res.status,401);
  const unavailable = createWorkspaceHandler(async()=> 'user_a',()=>({
    query:async()=>{throw Error('password or snapshot details');},
  }));
  const failed = response();
  await unavailable(req,failed);
  assert.equal(failed.status,503);
  assert.deepEqual(failed.body,{error:'Workspace database is unavailable'});
});
