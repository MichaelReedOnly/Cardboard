import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthController,createAuthInitializer} from '../src/auth.js';
import {startBoard} from '../src/board-startup.js';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const response=(body,ok=true)=>({ok,json:async()=>body});
function fixture(fetchImpl=async()=>response({userId:'user_A'})) {
  let notify;
  const clerk={isSignedIn:false,session:null,user:null,
    addListener(fn){notify=fn;return ()=>{notify=null;};},
    async signOut(){clerk.isSignedIn=false;clerk.session=null;notify?.();},
    async redirectToSignIn(options){return options;},
  };
  const auth=createAuthController({clerk,fetchImpl});
  function account(id) {
    clerk.isSignedIn=!!id;
    clerk.user=id ? {id,primaryEmailAddress:{emailAddress:`${id}@example.com`}} : null;
    clerk.session=id ? {id:`session_${id}`,user:clerk.user,getToken:async()=>`token_${id}`} : null;
    notify?.();
  }
  return {clerk,auth,account};
}

test('signed out state never verifies; a verified identity uses the bearer token',async()=>{
  const requests=[];
  const {auth,account}=fixture(async(url,options)=>{requests.push({url,options});return response({userId:'user_A'});});
  await auth.refresh();
  assert.equal(auth.state.status,'signed-out');
  assert.equal(requests.length,0);
  account('user_A');
  await auth.refresh();
  assert.equal(auth.state.status,'verified');
  assert.equal(auth.state.userId,'user_A');
  assert.equal(requests.at(-1).options.headers.Authorization,'Bearer token_user_A');
  assert.equal(await auth.getToken(),'token_user_A');
  await auth.signOut('https://board.example.com/');
  assert.equal(auth.state.status,'signed-out');
  await assert.rejects(()=>auth.getToken(),/Sign-in required/);
  auth.dispose();
});

test('old account verification cannot restore state after an account switch',async()=>{
  const pending=deferred();
  const {auth,account}=fixture(async(_url,{headers})=>headers.Authorization.endsWith('user_A')
    ? pending.promise : response({userId:'user_B'}));
  account('user_A');
  const old=auth.refresh();
  await Promise.resolve();
  account('user_B');
  await auth.refresh();
  assert.equal(auth.state.userId,'user_B');
  pending.resolve(response({userId:'user_A'}));
  await old;
  assert.equal(auth.state.userId,'user_B');
  auth.dispose();
});

test('sign-out immediately removes identity even while verification is pending',async()=>{
  const pending=deferred();
  const {auth,account,clerk}=fixture(()=>pending.promise);
  account('user_A');
  const old=auth.refresh();
  clerk.signOut=async()=>{};
  await auth.signOut('https://board.example.com/');
  assert.equal(auth.state.userId,undefined);
  pending.resolve(response({userId:'user_A'}));
  await old;
  assert.equal(auth.state.status,'signed-out');
  auth.dispose();
});

test('verification failure and mismatched identity fail closed and allow retry',async()=>{
  let result=response({error:'Invalid or expired session'},false);
  const {auth,account}=fixture(async()=>result);
  account('user_A');
  await auth.refresh();
  assert.equal(auth.state.status,'error');
  await assert.rejects(()=>auth.getToken(),/Sign-in required/);
  result=response({userId:'user_B'});
  await auth.refresh();
  assert.equal(auth.state.status,'error');
  result=response({userId:'user_A'});
  await auth.refresh();
  assert.equal(auth.state.status,'verified');
  auth.dispose();
});

test('a token requested before a session change is never released to the caller',async()=>{
  const {auth,account,clerk}=fixture();
  account('user_A');
  await auth.refresh();
  const pending=deferred();
  clerk.session.getToken=()=>pending.promise;
  const token=auth.getToken();
  account(null);
  pending.resolve('stale-secret-token');
  await assert.rejects(()=>token,/Session changed/);
  auth.dispose();
});

test('Clerk notifications during sign-out cannot verify the old account again',async()=>{
  const {auth,account,clerk}=fixture();
  account('user_A');await auth.refresh();
  const pending=deferred();clerk.signOut=()=>pending.promise;
  const signingOut=auth.signOut('https://board.example.com/');
  account('user_A');await auth.refresh();
  assert.equal(auth.state.status,'signed-out');
  pending.resolve();await signingOut;auth.dispose();
});

test('startup selects exactly one repository path and fails closed on missing configuration',async()=>{
  let local=0,database=0;
  const startLocal=async()=>local++;
  const startDatabase=async()=>database++;
  await startBoard({fetchImpl:async()=>response({storageMode:'local'}),startLocal,startDatabase});
  assert.equal(local,1);assert.equal(database,0);
  await startBoard({fetchImpl:async()=>response({storageMode:'database',boardReady:false}),startLocal,startDatabase});
  assert.equal(local,1);assert.equal(database,1);
  for (const fetchImpl of [async()=>response({},false),async()=>response({}),async()=>{throw Error('offline');}]) {
    await assert.rejects(()=>startBoard({fetchImpl,startLocal,startDatabase}));
  }
  assert.equal(local,1);assert.equal(database,1);
});

test('initialization shares one Clerk load and retries after configuration failure',async()=>{
  let configured=false,fetches=0,loads=0;
  const {clerk}=fixture();
  const initialize=createAuthInitializer({
    fetchImpl:async()=>{fetches++;return response(configured
      ? {publishableKey:'pk_fixture',clerkOrigin:'https://clerk.example.com'} : {});},
    loadClient:async()=>{loads++;return clerk;},
  });
  await assert.rejects(()=>initialize(),/not configured/);
  configured=true;
  const [first,second]=await Promise.all([initialize(),initialize()]);
  assert.equal(first,second);assert.equal(fetches,2);assert.equal(loads,1);
  assert.equal(await initialize(),first);first.dispose();
});
