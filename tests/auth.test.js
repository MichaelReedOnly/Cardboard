import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionVerifier, SessionError} from '../backend/auth.js';

const origin = 'http://127.0.0.1:4318';
const request = authorization => ({url:'/api/workspace',headers:{authorization}});
const failsWith = (status,message) => error =>
  error instanceof SessionError && error.status===status && error.message===message;

test('missing and malformed credentials require sign-in',async()=>{
  const verify = createSessionVerifier(null,origin);
  for (const header of [undefined,'','Basic fixture','Bearer','Bearer one two',['Bearer fixture']]) {
    await assert.rejects(()=>verify(request(header)),failsWith(401,'Sign-in required'));
  }
});

test('configured credentials require an available verifier',async()=>{
  await assert.rejects(
    ()=>createSessionVerifier(null,origin)(request('Bearer fixture')),
    failsWith(503,'Clerk server verification is not configured')
  );
});

test('verified identity comes from Clerk with session-only and allowed-origin restrictions',async()=>{
  const client = {async authenticateRequest(req,options) {
    assert.equal(req.url,origin+'/api/workspace');
    assert.equal(req.headers.get('authorization'),'Bearer fixture');
    assert.deepEqual(options,{authorizedParties:[origin],acceptsToken:'session_token'});
    return {isAuthenticated:true,toAuth:()=>({userId:'user_verified'})};
  }};
  const req = {...request('Bearer fixture'),userId:'user_untrusted'};
  assert.equal(await createSessionVerifier(client,origin)(req),'user_verified');
});

test('invalid sessions return unauthorized while service failures return unavailable',async()=>{
  const invalid = {authenticateRequest:async()=>({isAuthenticated:false})};
  await assert.rejects(
    ()=>createSessionVerifier(invalid,origin)(request('Bearer fixture')),
    failsWith(401,'Invalid or expired session')
  );
  const unavailable = {authenticateRequest:async()=>{throw Error('sensitive internal detail');}};
  await assert.rejects(
    ()=>createSessionVerifier(unavailable,origin)(request('Bearer fixture')),
    failsWith(503,'Clerk session verification is unavailable')
  );
});
