// Shared authentication. Tokens and cross-session drafts are never persisted.
export function createAuthController({clerk,fetchImpl=globalThis.fetch,channel=null,
  now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,verificationTimeoutMs=15_000}) {
  let state={status:'loading',signedIn:false};
  let generation=0,disposed=false,signingOut=false,verifiedSession=null,pendingSession=null,request;
  let blockedIdentity=null,expiryTimer,revalidation;
  const listeners=new Set();
  function publish(next) {
    state=Object.freeze(next);
    for(const listener of listeners){try{listener(state);}catch{}}
  }
  function deadline(session) {
    const dates=[session?.expireAt,session?.abandonAt].filter(Boolean).map(value=>new Date(value).getTime()).filter(Number.isFinite);
    return dates.length?Math.min(...dates):Infinity;
  }
  function currentSession() {
    const session=clerk.session;
    return clerk.isSignedIn && session && (!session.status || session.status==='active') && deadline(session)>now()?session:null;
  }
  function identity(session) {
    return session?.id && (session.user?.id || clerk.user?.id)
      ? JSON.stringify([session.id,session.user?.id || clerk.user?.id]) : session;
  }
  function sameSession(first,second){return !!first && !!second && identity(first)===identity(second);}
  function invalidate(){
    generation++;verifiedSession=null;pendingSession=null;request?.abort();
    if(expiryTimer){clearTimer(expiryTimer);expiryTimer=undefined;}
  }
  function signalEnd(sessionId){
    if(typeof sessionId==='string'){try{channel?.postMessage({type:'session-ended',sessionId});}catch{}}
  }
  function expire(reason='expired',broadcast=true){
    if(disposed)return;
    const session=verifiedSession||pendingSession||clerk.session;
    blockedIdentity=identity(session);invalidate();
    if(broadcast)signalEnd(session?.id);
    publish({status:'expired',signedIn:!!clerk.session,reason,message:reason==='other-tab'
      ? 'This session ended in another tab. Sign in again to load your saved workspace.'
      : 'Your session ended or was rejected. Sign in again to load your saved workspace.'});
  }
  function scheduleExpiry(){
    if(expiryTimer)clearTimer(expiryTimer);
    const session=verifiedSession,delay=deadline(session)-now();
    if(!session || !Number.isFinite(delay))return;
    const attempt=generation;
    expiryTimer=setTimer(()=>{
      if(disposed || attempt!==generation)return;
      if(!currentSession())expire();
      else if(sameSession(currentSession(),session))scheduleExpiry();
      else void refresh();
    },Math.max(1,Math.min(delay,2_147_483_647)));
    expiryTimer?.unref?.();
  }
  const failure=code=>Object.assign(new Error('Session verification failed'),{code});
  async function verify(session,forceFresh=false){
    const controller=new AbortController();request=controller;
    let rejectAbort;
    const interrupted=new Promise((_,reject)=>{
      rejectAbort=()=>reject(failure('unavailable'));
      controller.signal.addEventListener('abort',rejectAbort,{once:true});
    });
    const timer=setTimer(()=>controller.abort(),verificationTimeoutMs);timer?.unref?.();
    const perform=async()=>{
      const token=await session.getToken(forceFresh?{skipCache:true}:undefined);
      if(controller.signal.aborted)throw failure('unavailable');
      if(!token)throw failure('auth');
      const response=await fetchImpl('/api/me',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal});
      if(!response.ok)throw failure([401,403].includes(response.status)?'auth':'unavailable');
      const result=await response.json();
      const expectedUser=session.user?.id || clerk.user?.id;
      if(typeof result.userId!=='string' || !result.userId || (expectedUser && result.userId!==expectedUser))throw failure('identity');
      return result.userId;
    };
    try{return await Promise.race([perform(),interrupted]);}
    finally{clearTimer(timer);controller.signal.removeEventListener('abort',rejectAbort);if(request===controller)request=null;}
  }
  function verified(userId,session){
    verifiedSession=session;pendingSession=null;blockedIdentity=null;
    scheduleExpiry();
    publish({status:'verified',signedIn:true,suspended:false,userId,sessionId:session.id,
      label:session.user?.primaryEmailAddress?.emailAddress || clerk.user?.primaryEmailAddress?.emailAddress || userId});
  }
  async function refresh(){
    if(disposed || signingOut)return;
    const session=currentSession();
    if(blockedIdentity && identity(clerk.session)===blockedIdentity)return;
    if(!session && (verifiedSession || pendingSession)){expire();return;}
    invalidate();
    const attempt=generation;
    if(!session){publish({status:'signed-out',signedIn:false});return;}
    pendingSession=session;publish({status:'verifying',signedIn:true});
    try{
      const userId=await verify(session);
      if(attempt!==generation || disposed)return;
      if(!sameSession(currentSession(),session)){await refresh();return;}
      verified(userId,currentSession());
    }catch(error){
      if(attempt!==generation || disposed)return;
      if(error.code==='auth' || error.code==='identity' || [401,403].includes(error.status)){expire();return;}
      pendingSession=null;
      publish({status:'error',signedIn:!!clerk.session,message:'Cardboard could not verify your session. Retry, or sign out and sign in again.'});
    }
  }
  async function revalidate(){
    if(disposed || signingOut)return;
    if(revalidation)return revalidation;
    revalidation=(async()=>{
      const session=currentSession();
      if(state.status!=='verified' || !sameSession(session,verifiedSession)){await refresh();return;}
      const attempt=generation;
      try{
        const userId=await verify(session,true);
        if(attempt!==generation || disposed)return;
        if(!sameSession(currentSession(),session)){await refresh();return;}
        verified(userId,currentSession());
      }catch(error){
        if(attempt!==generation || disposed)return;
        if(error.code==='auth' || error.code==='identity' || [401,403].includes(error.status)){expire();return;}
        publish({...state,suspended:true,message:'Your session could not be checked. Retry when connected.'});
      }
    })().finally(()=>{revalidation=null;});
    return revalidation;
  }
  const unsubscribe=clerk.addListener(()=>{
    if(disposed || signingOut)return;
    const session=currentSession();
    if(blockedIdentity && identity(clerk.session)===blockedIdentity)return;
    if(!session && (verifiedSession || pendingSession)){expire();return;}
    if(state.status==='verified' && sameSession(session,verifiedSession)){verifiedSession=session;scheduleExpiry();return;}
    if(state.status==='verifying' && sameSession(session,pendingSession))return;
    void refresh();
  });
  if(channel)channel.onmessage=event=>{
    const data=event.data;
    if(!disposed && data?.type==='session-ended' && typeof data.sessionId==='string' && clerk.session?.id===data.sessionId)expire('other-tab',false);
  };
  return {
    get state(){return state;},
    subscribe(listener){listeners.add(listener);listener(state);return ()=>listeners.delete(listener);},
    refresh,revalidate,
    rejectSession(expected){
      if(disposed || state.status!=='verified' || expected.userId!==state.userId || expected.sessionId!==state.sessionId)return false;
      expire();return true;
    },
    async getToken(){
      const attempt=generation,session=verifiedSession;
      if(disposed || state.status!=='verified')throw Error('Sign-in required');
      if(state.suspended)throw Error('Session check required');
      if(!sameSession(currentSession(),session)){if(!currentSession())expire();else void refresh();throw Error('Sign-in required');}
      let token;
      try{token=await session.getToken();}
      catch(error){
        if(attempt===generation && !disposed){
          if([401,403].includes(error.status))expire();
          else publish({...state,suspended:true,message:'Your session could not be checked. Retry when connected.'});
        }
        throw Error('Sign-in or session check required');
      }
      if(disposed || attempt!==generation || !sameSession(currentSession(),session))throw Error('Session changed. Try again.');
      if(state.suspended)throw Error('Session check required');
      if(!token){expire();throw Error('Sign-in required');}
      return token;
    },
    async signIn(returnUrl){
      if(disposed)return;
      if(state.status==='expired' && clerk.session){
        signingOut=true;
        try{await clerk.signOut();}finally{signingOut=false;}
      }
      return clerk.redirectToSignIn({signInForceRedirectUrl:returnUrl,signUpForceRedirectUrl:returnUrl});
    },
    async signOut(returnUrl){
      if(disposed)return;
      const session=verifiedSession||clerk.session;
      signingOut=true;blockedIdentity=identity(session);invalidate();signalEnd(session?.id);publish({status:'signed-out',signedIn:false});
      try{await clerk.signOut({redirectUrl:returnUrl});}
      catch{if(!disposed)publish({status:'error',signedIn:!!clerk.session,message:'Sign-out could not finish. Please retry.'});}
      finally{signingOut=false;}
    },
    dispose(){disposed=true;invalidate();unsubscribe?.();if(channel){channel.onmessage=null;channel.close();}listeners.clear();},
  };
}

const scripts=new Map();
function loadScript(src,publishableKey) {
  if (scripts.has(src)) return scripts.get(src);
  const loaded=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=src;script.crossOrigin='anonymous';
    if (publishableKey) script.dataset.clerkPublishableKey=publishableKey;
    const timer=setTimeout(()=>finish(new Error('Clerk loading timed out.')),20_000);
    function finish(error) {
      clearTimeout(timer);script.onload=script.onerror=null;
      if (error) {scripts.delete(src);script.remove();reject(error);} else resolve();
    }
    script.onload=()=>finish();script.onerror=()=>finish(new Error('Unable to load Clerk.'));
    document.head.append(script);
  });
  scripts.set(src,loaded);
  return loaded;
}

async function loadClient({publishableKey,clerkOrigin}) {
  await Promise.all([
    loadScript(`${clerkOrigin}/npm/@clerk/ui@1/dist/ui.browser.js`),
    loadScript(`${clerkOrigin}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`,publishableKey),
  ]);
  const clerk=window.Clerk;
  await clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});
  return clerk;
}

function createBrowserSessionChannel(){
  try{return typeof window!=='undefined' && typeof window.BroadcastChannel==='function'
    ? new window.BroadcastChannel('cardboard.session-events.v1') : null;}catch{return null;}
}

export function createAuthInitializer({fetchImpl=globalThis.fetch,loadClient:load=loadClient}={}) {
  let initialization;
  return function initialize() {
    initialization ??= (async()=>{
      const response=await fetchImpl('/api/clerk-preview-config',{cache:'no-store'});
      if (!response.ok) throw Error('Unable to load sign-in settings.');
      const config=await response.json();
      if (!config.publishableKey || !config.clerkOrigin) throw Error('Clerk authentication is not configured. Check the server configuration.');
      return createAuthController({clerk:await load(config),fetchImpl,channel:createBrowserSessionChannel()});
    })().catch(error=>{initialization=undefined;throw error;});
    return initialization;
  };
}

export const initializeAuth=createAuthInitializer();
