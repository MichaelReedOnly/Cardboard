import {initializeAuth} from './auth.js';

function element(tag,text,className) {
  const node=document.createElement(tag);
  if (text) node.textContent=text;
  if (className) node.className=className;
  return node;
}

/** Shared auth screen; verified board sessions can hand off to workspace loading. */
export function mountAuthScreen(root,{preview=false,onSessionChange=()=>{},onVerified,initialize=initializeAuth,location=window.location}={}) {
  let stopped=false,unsubscribe,auth;
  const returnUrl=new URL(preview ? '/sign-in-preview' : location.pathname,location.origin).href;
  function shell(message) {
    const panel=element('main',null,'auth-preview');
    if (preview) {const back=element('a','← Back to board');back.href='/';panel.append(back);}
    panel.append(element('h1',preview ? 'Cardboard sign-in preview' : 'Cardboard'));
    const status=element('p',message);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    panel.append(status);root.replaceChildren(panel);return panel;
  }
  function action(panel,label,run,primary=false) {
    const button=element('button',label,primary?'primary':'secondary');button.type='button';
    button.onclick=async()=>{
      button.disabled=true;
      try {await run();}
      catch {
        const status=panel.querySelector('[role=status]');
        if (status) status.textContent='That request could not finish. Please retry.';
      } finally {button.disabled=false;}
    };
    panel.append(button);
  }
  function render(state) {
    if (stopped) return;
    onSessionChange(state);
    if (state.status==='verified' && onVerified) {onVerified(auth,state);return;}
    const messages={loading:'Loading sign-in…','signed-out':'Use your invited email address to sign in.',
      verifying:'Verifying your account…',verified:state.suspended?state.message:'Signed in. Cardboard verified your Clerk session.',error:state.message,expired:state.message};
    const panel=shell(messages[state.status]);
    if (state.status==='verified' && !state.suspended) {
      panel.append(element('p',`Signed in as ${state.label}`,'auth-account'));
      if (!preview) panel.append(element('p','Your account is ready. Database board loading is coming in the next integration steps.','hint'));
    }
    if (state.status==='expired' && !preview)panel.append(element('p','For privacy, unsaved changes in this page have been cleared. A downloaded recovery file can be imported after signing in.','hint'));
    if (state.status==='signed-out'||state.status==='expired') action(panel,'Sign in',()=>auth.signIn(returnUrl),true);
    if (state.status==='error') action(panel,'Retry',()=>auth.refresh(),true);
    if (state.status==='verified' && state.suspended) action(panel,'Retry',()=>auth.revalidate(),true);
    if (state.signedIn) action(panel,'Sign out',()=>auth.signOut(returnUrl));
  }
  async function connect() {
    shell('Loading sign-in…');
    try {
      auth=await initialize();
      if (stopped) return;
      unsubscribe?.();unsubscribe=auth.subscribe(render);
      await auth.refresh();
    } catch {
      if (stopped) return;
      onSessionChange({status:'error'});
      const panel=shell('Sign-in could not start. Check the server’s Clerk configuration and your connection.');
      action(panel,'Retry',connect,true);
    }
  }
  void connect();
  return ()=>{stopped=true;unsubscribe?.();root.replaceChildren();};
}
