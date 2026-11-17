const status = document.querySelector('#sign-in-status');
const signIn = document.querySelector('#sign-in');
const signOut = document.querySelector('#sign-out');

function loadScript(src, publishableKey) {
  return new Promise((resolve,reject)=>{
    const script = document.createElement('script');
    script.src = src;
    script.crossOrigin = 'anonymous';
    if (publishableKey) script.dataset.clerkPublishableKey = publishableKey;
    script.onload = resolve;
    script.onerror = ()=>reject(new Error('Unable to load Clerk.'));
    document.head.append(script);
  });
}

async function start() {
  const response = await fetch('/api/clerk-preview-config');
  if (!response.ok) throw new Error('Unable to load sign-in settings.');
  const {clerkOrigin,publishableKey} = await response.json();
  if (!publishableKey) {
    status.textContent = 'Add your Clerk development publishable key to .env and restart Cardboard with node --env-file=.env server.js.';
    return;
  }

  await Promise.all([
    loadScript(`${clerkOrigin}/npm/@clerk/ui@1/dist/ui.browser.js`),
    loadScript(`${clerkOrigin}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`,publishableKey),
  ]);
  const clerk = window.Clerk;
  await clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});
  const returnUrl = new URL('/sign-in-preview',window.location.origin).href;

  let verificationAttempt = 0;
  async function render() {
    const attempt = ++verificationAttempt;
    const session = clerk.session;
    signIn.hidden = clerk.isSignedIn;
    signOut.hidden = !clerk.isSignedIn;
    if (!clerk.isSignedIn || !session) {
      status.textContent = 'Use your invited email address to sign in through Clerk.';
      return;
    }
    status.textContent = 'Verifying your session with Cardboard…';
    try {
      const token = await session.getToken();
      if (!token) throw new Error('Your session has expired. Sign out and sign in again.');
      const response = await fetch('/api/me',{
        headers:{Authorization:`Bearer ${token}`},
        cache:'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.userId) throw new Error(result.error || 'Session verification failed.');
      if (attempt===verificationAttempt) status.textContent = 'Signed in. Cardboard verified your Clerk session.';
    } catch (error) {
      if (attempt===verificationAttempt) status.textContent = `Could not verify sign-in. ${error.message}`;
    }
  }
  function handle(action) {
    return async event=>{
      const control = event.currentTarget;
      control.disabled = true;
      try {
        await action();
      } catch {
        status.textContent = 'Clerk could not complete that request. Try again.';
      } finally {
        control.disabled = false;
      }
    };
  }
  signIn.onclick = handle(()=>clerk.redirectToSignIn({signInForceRedirectUrl:returnUrl}));
  signOut.onclick = handle(async()=>{
    await clerk.signOut({redirectUrl:returnUrl});
    render();
  });
  clerk.addListener(render);
  render();
}

start().catch(()=>{
  status.textContent = 'Sign-in preview could not start. Check the Clerk development key and your connection, then reload.';
});
