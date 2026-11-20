import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthController} from '../src/auth.js';
import {bindSessionLifecycle,openDialogUnderSessionGate} from '../src/session-lifecycle.js';
import {ApiBoardRepository} from '../src/api-storage.js';
import {SaveController} from '../src/save-controller.js';

const response=(userId='user_A',status=200)=>({ok:status===200,status,json:async()=>({userId})});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(fetchImpl=async()=>response(),options={}) {
  let notify;
  const user={id:'user_A'};
  const clerk={isSignedIn:true,user,session:{id:'session_A',user,status:'active',getToken:async()=> 'fixture'},
    addListener(fn){notify=fn;return ()=>{};},async signOut(){this.isSignedIn=false;this.session=null;notify?.();},async redirectToSignIn(){}};
  const auth=createAuthController({clerk,fetchImpl,...options});
  return {auth,clerk,notify:()=>notify?.()};
}

test('definite rejection locks the matching session and does not reverify from repeated SDK events',async()=>{
  let checks=0;const f=fixture(async()=>{checks++;return response();});await f.auth.refresh();
  assert.equal(f.auth.rejectSession({userId:'user_A',sessionId:'session_A'}),true);
  assert.equal(f.auth.state.status,'expired');f.notify();await f.auth.refresh();
  assert.equal(checks,1);await assert.rejects(()=>f.auth.getToken());f.auth.dispose();
});

test('a stale rejection cannot lock a newer session for the same user',async()=>{
  const f=fixture();await f.auth.refresh();
  f.clerk.session={...f.clerk.session,id:'session_A2'};await f.auth.refresh();
  assert.equal(f.auth.rejectSession({userId:'user_A',sessionId:'session_A'}),false);
  assert.equal(f.auth.state.status,'verified');f.auth.dispose();
});

test('foreground checks preserve same-session drafts on temporary failure and recover without a verifying transition',async()=>{
  let fail=false;const phases=[];
  const f=fixture(async()=>{if(fail)throw Error('offline');return response();});await f.auth.refresh();
  f.auth.subscribe(state=>phases.push(state.status));fail=true;await f.auth.revalidate();
  assert.equal(f.auth.state.status,'verified');assert.equal(f.auth.state.suspended,true);
  await assert.rejects(()=>f.auth.getToken());fail=false;await f.auth.revalidate();
  assert.equal(f.auth.state.suspended,false);assert.equal(await f.auth.getToken(),'fixture');
  assert.ok(phases.every(phase=>phase==='verified'));f.auth.dispose();
});

test('foreground 401 ends the session while an ordinary service failure does not',async()=>{
  let status=200;const f=fixture(async()=>response('user_A',status));await f.auth.refresh();
  status=503;await f.auth.revalidate();assert.equal(f.auth.state.suspended,true);
  status=401;await f.auth.revalidate();assert.equal(f.auth.state.status,'expired');f.auth.dispose();
});

test('expiry is scheduled and clears verification without requiring a user action',async()=>{
  let now=1000;const timers=[];
  const f=fixture(async()=>response(),{now:()=>now,setTimer:(fn,delay)=>{const timer={fn,delay};timers.push(timer);return timer;},clearTimer:timer=>{timer.cleared=true;}});
  f.clerk.session.expireAt=new Date(5000);await f.auth.refresh();
  const expiry=timers.findLast(timer=>!timer.cleared && timer.delay===4000);assert.ok(expiry);
  now=5001;expiry.fn();assert.equal(f.auth.state.status,'expired');f.auth.dispose();
});

test('API rejection invalidates auth once and subsequent requests cannot transmit',async()=>{
  const f=fixture();await f.auth.refresh();let calls=0;
  const repo=new ApiBoardRepository({auth:f.auth,fetchImpl:async()=>{calls++;return {ok:false,status:401};}});
  await assert.rejects(()=>repo.load());assert.equal(f.auth.state.status,'expired');
  await assert.rejects(()=>repo.load());assert.equal(calls,1);repo.dispose();f.auth.dispose();
});

test('same user with a new session invalidates the old repository',async()=>{
  let state={status:'verified',userId:'user_A',sessionId:'one'};const listeners=new Set();
  const auth={get state(){return state;},getToken:async()=> 'fixture',subscribe(fn){listeners.add(fn);fn(state);return ()=>listeners.delete(fn);}};
  let calls=0;const repo=new ApiBoardRepository({auth,fetchImpl:async()=>{calls++;return response();}});
  state={...state,sessionId:'two'};for(const fn of listeners)fn(state);
  await assert.rejects(()=>repo.load());assert.equal(calls,0);repo.dispose();
});

test('session-end messages affect only the matching session and never echo',async()=>{
  const messages=[];const channel={postMessage:value=>messages.push(value),close(){}};
  const f=fixture(async()=>response(),{channel});await f.auth.refresh();
  channel.onmessage({data:{type:'session-ended',sessionId:'other'}});assert.equal(f.auth.state.status,'verified');
  channel.onmessage({data:{type:'session-ended',sessionId:'session_A'}});assert.equal(f.auth.state.status,'expired');
  assert.equal(messages.length,0);f.auth.dispose();
});

class Surface {
  listeners=new Map();visibilityState='visible';
  addEventListener(type,fn){(this.listeners.get(type)||this.listeners.set(type,new Set()).get(type)).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  fire(type){for(const fn of this.listeners.get(type)||[])fn();}
}
test('foreground lifecycle covers while checking, deduplicates events and stays covered on network failure',async()=>{
  const document=new Surface(),window=new Surface();let resolve,calls=0,covered=false,unavailable=false;
  let state={status:'verified'};
  const auth={get state(){return state;},subscribe(fn){fn(state);return ()=>{};},revalidate:()=>{calls++;return new Promise(r=>resolve=r);}};
  const lifecycle=bindSessionLifecycle({auth,document,window,onSuspend:()=>covered=true,onResume:()=>covered=false,onUnavailable:()=>unavailable=true});
  document.visibilityState='hidden';document.fire('visibilitychange');assert.equal(covered,true);
  document.visibilityState='visible';document.fire('visibilitychange');window.fire('focus');assert.equal(calls,1);
  state={status:'verified',suspended:true};resolve();await flush();assert.equal(covered,true);assert.equal(unavailable,true);
  const next=lifecycle.revalidate();state={status:'verified',suspended:false};resolve();await next;assert.equal(covered,false);
  lifecycle.dispose();window.fire('focus');assert.equal(calls,2);
});

test('sign-out broadcasts only a session-end ticket, never tokens or workspace data',async()=>{
  const messages=[];const channel={postMessage:value=>messages.push(value),close(){}};
  const f=fixture(async()=>response(),{channel});await f.auth.refresh();await f.auth.signOut('https://board.example.com/');
  assert.deepEqual(messages,[{type:'session-ended',sessionId:'session_A'}]);f.auth.dispose();
});

test('verification timeout settles even when token retrieval hangs and late results cannot restore state',async()=>{
  const timers=[];let resolveToken;
  const f=fixture(async()=>response(),{setTimer:(fn,delay)=>{const value={fn,delay};timers.push(value);return value;},clearTimer:value=>value.cleared=true});
  f.clerk.session.getToken=()=>new Promise(resolve=>resolveToken=resolve);
  const refresh=f.auth.refresh();timers.find(timer=>!timer.cleared).fn();await refresh;
  assert.equal(f.auth.state.status,'error');resolveToken('late-token');await flush();
  assert.equal(f.auth.state.status,'error');f.auth.dispose();
});

test('a failing observer cannot prevent the other session-cleanup observers',async()=>{
  const f=fixture();await f.auth.refresh();
  f.auth.subscribe(state=>{if(state.status==='expired')throw Error('broken widget');});
  let cleaned=false;f.auth.subscribe(state=>{if(state.status==='expired')cleaned=true;});
  f.auth.rejectSession({userId:'user_A',sessionId:'session_A'});assert.equal(cleaned,true);f.auth.dispose();
});

test('expiry during saves and recovery prevents old acknowledgements and recovery results',async()=>{
  for(const operation of ['save','recovery']){
    const f=fixture();await f.auth.refresh();let resolvePending,started;
    const sent=new Promise(resolve=>started=resolve);
    const snapshot={version:1,boards:[{id:'b',name:'All'}],projects:[],cards:[]};
    let gets=0;
    const repo=new ApiBoardRepository({auth:f.auth,fetchImpl:async(_url,request)=>{
      if(request.method==='GET' && ++gets===1)return {ok:true,status:200,json:async()=>({snapshot,revision:'1',updatedAt:'2026-11-20T12:00:00.000Z'})};
      if(operation==='recovery' && request.method==='PUT')return {ok:false,status:409};
      started();return new Promise(resolve=>resolvePending=resolve);
    }});
    const initial=await repo.load(),events=[];
    const controller=new SaveController({repository:repo,initialState:initial,mode:'database',onChange:status=>events.push(status.phase)});
    const unsubscribe=f.auth.subscribe(state=>{if(state.status!=='verified'){controller.dispose();repo.dispose();}});
    let pending;
    if(operation==='recovery'){await assert.rejects(()=>controller.save({...snapshot,boards:[{id:'b',name:'Mine'}]}));pending=controller.checkLatest();}
    else pending=controller.save({...snapshot,boards:[{id:'b',name:'Mine'}]});
    await sent;const count=events.length;
    f.auth.rejectSession({userId:'user_A',sessionId:'session_A'});
    resolvePending({ok:true,status:200,json:async()=>({snapshot,revision:'2',updatedAt:'2026-11-20T12:00:00.000Z'})});
    await assert.rejects(()=>pending,error=>error.kind==='session');assert.equal(events.length,count);
    assert.throws(()=>controller.recoverySnapshot,error=>error.kind==='session');unsubscribe();f.auth.dispose();
  }
});

test('token acquisition that began before suspension cannot release a late token',async()=>{
  let offline=false,resolveToken;
  const f=fixture(async()=>{if(offline)throw Error('offline');return response();});await f.auth.refresh();
  f.clerk.session.getToken=options=>options?.skipCache?Promise.resolve('fresh'):new Promise(resolve=>resolveToken=resolve);
  const token=f.auth.getToken();offline=true;await f.auth.revalidate();assert.equal(f.auth.state.suspended,true);
  resolveToken('late-token');await assert.rejects(()=>token,/Session check required/);f.auth.dispose();
});

test('suspension between token return and transmission prevents the request without discarding recovery',async()=>{
  let state={status:'verified',userId:'user_A',sessionId:'one'},calls=0;
  const auth={get state(){return state;},getToken:async()=>{state={...state,suspended:true};return 'late-token';},subscribe(fn){fn(state);return ()=>{};}};
  const repo=new ApiBoardRepository({auth,fetchImpl:async()=>{calls++;return response();}});
  await assert.rejects(()=>repo.load());assert.equal(calls,0);repo.dispose();
});

test('temporary revalidation outages retain an actual failed edit and permit explicit retry afterward',async()=>{
  let offline=false,accept=false,revision='1';
  const f=fixture(async()=>{if(offline)throw Error('offline');return response();});await f.auth.refresh();
  let stored={version:1,boards:[{id:'b',name:'Original'}],projects:[],cards:[]};
  const repo=new ApiBoardRepository({auth:f.auth,fetchImpl:async(_url,request)=>{
    if(request.method==='PUT'){
      if(!accept)return {ok:false,status:413};
      stored=JSON.parse(request.body).snapshot;revision='2';
    }
    return {ok:true,status:200,json:async()=>({snapshot:structuredClone(stored),revision,updatedAt:'2026-11-20T12:00:00.000Z'})};
  }});
  const initial=await repo.load();const controller=new SaveController({repository:repo,initialState:initial,mode:'database'});
  let cleared=0;const unsubscribe=f.auth.subscribe(state=>{if(state.status!=='verified'){cleared++;controller.dispose();repo.dispose();}});
  await assert.rejects(()=>controller.save({...initial,boards:[{id:'b',name:'Retained edit'}]}));
  offline=true;await f.auth.revalidate();assert.equal(cleared,0);
  assert.equal(controller.recoverySnapshot.boards[0].name,'Retained edit');
  offline=false;await f.auth.revalidate();accept=true;await controller.retry();
  assert.equal(controller.status.phase,'saved');assert.equal(stored.boards[0].name,'Retained edit');
  unsubscribe();controller.dispose();repo.dispose();f.auth.dispose();
});

test('late modal openings cannot cover the foreground verification gate',()=>{
  const stack=[];
  function dialog(name){return {name,open:false,showModal(){this.open=true;stack.push(this);},close(){this.open=false;stack.splice(stack.indexOf(this),1);}};}
  const gate=dialog('session check'),editor=dialog('late import');gate.showModal();
  openDialogUnderSessionGate(editor,gate,()=>{});
  assert.equal(stack.at(-1),gate);assert.equal(editor.open,true);
});
