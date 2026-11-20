// Shared authentication. Tokens are never persisted.
export function createAuthController({clerk,fetchImpl=globalThis.fetch}) {
  let state={status:'loading',signedIn:false};
  let generation=0,disposed=false,signingOut=false,verifiedSession=null,pendingSession=null,request;
  const listeners=new Set();
  function publish(next) {
    state=Object.freeze(next);
    for (const listener of listeners) listener(state);
  }
  function currentSession() {
    const session=clerk.session;
    if (!clerk.isSignedIn || !session || (session.status && session.status!=='active')) return null;
    if (session.expireAt && new Date(session.expireAt).getTime()<=Date.now()) return null;
    return session;
  }
  function identity(session) {
    return session?.id && (session.user?.id || clerk.user?.id)
      ? JSON.stringify([session.id,session.user?.id || clerk.user?.id]) : session;
  }
  function sameSession(first,second) {return !!first && !!second && identity(first)===identity(second);}
  function invalidate() {generation++;verifiedSession=null;pendingSession=null;request?.abort();}
  async function refresh() {
    if (disposed || signingOut) return;
    invalidate();
    const attempt=generation,session=currentSession();
    if (!session) {publish({status:'signed-out',signedIn:false});return;}
    pendingSession=session;
    publish({status:'verifying',signedIn:true});
    request=new AbortController();
    const signal=request.signal;
    try {
      const token=await session.getToken();
      if (attempt!==generation || disposed) return;
      if (!token) throw Error('No session token');
      const response=await fetchImpl('/api/me',{
        headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal,
      });
      const result=await response.json();
      if (attempt!==generation || disposed || !sameSession(currentSession(),session)) return;
      const expectedUser=session.user?.id || clerk.user?.id;
      if (!response.ok || typeof result.userId!=='string' || !result.userId ||
          (expectedUser && result.userId!==expectedUser)) throw Error('Verification failed');
      verifiedSession=currentSession();pendingSession=null;
      publish({status:'verified',signedIn:true,userId:result.userId,sessionId:session.id,
        label:session.user?.primaryEmailAddress?.emailAddress || clerk.user?.primaryEmailAddress?.emailAddress || result.userId});
    } catch {
      if (attempt===generation && !disposed) {
        publish({status:'error',signedIn:true,message:'Cardboard could not verify your session. Retry, or sign out and sign in again.'});
      }
    }
  }
  const unsubscribe=clerk.addListener(()=>{
    const session=currentSession();
    if (state.status==='verified' && sameSession(session,verifiedSession)) {verifiedSession=session;return;}
    if (state.status==='verifying' && sameSession(session,pendingSession)) return;
    void refresh();
  });
  return {
    get state(){return state;},
    subscribe(listener){listeners.add(listener);listener(state);return ()=>listeners.delete(listener);},
    refresh,
    async getToken() {
      const attempt=generation,session=verifiedSession;
      if (disposed || state.status!=='verified' || !sameSession(currentSession(),session)) throw Error('Sign-in required');
      const token=await session.getToken();
      if (disposed || attempt!==generation || !sameSession(currentSession(),session)) throw Error('Session changed. Try again.');
      if (!token) {void refresh();throw Error('Sign-in required');}
      return token;
    },
    signIn(returnUrl){return clerk.redirectToSignIn({signInForceRedirectUrl:returnUrl,signUpForceRedirectUrl:returnUrl});},
    async signOut(returnUrl) {
      signingOut=true;invalidate();publish({status:'signed-out',signedIn:false});
      try {await clerk.signOut({redirectUrl:returnUrl});}
      catch {publish({status:'error',signedIn:!!clerk.session,message:'Sign-out could not finish. Please retry.'});}
      finally {signingOut=false;}
    },
    dispose(){disposed=true;invalidate();unsubscribe?.();listeners.clear();},
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

export function createAuthInitializer({fetchImpl=globalThis.fetch,loadClient:load=loadClient}={}) {
  let initialization;
  return function initialize() {
    initialization ??= (async()=>{
      const response=await fetchImpl('/api/clerk-preview-config',{cache:'no-store'});
      if (!response.ok) throw Error('Unable to load sign-in settings.');
      const config=await response.json();
      if (!config.publishableKey || !config.clerkOrigin) throw Error('Clerk authentication is not configured. Check the server configuration.');
      return createAuthController({clerk:await load(config),fetchImpl});
    })().catch(error=>{initialization=undefined;throw error;});
    return initialization;
  };
}

export const initializeAuth=createAuthInitializer();
