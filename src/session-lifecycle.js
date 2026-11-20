/** Cover private UI until same-session foreground verification succeeds. */
export function openDialogUnderSessionGate(dialog,gate,afterOpen) {
  dialog.showModal();afterOpen();
  // A late file/editor callback must not strand Retry beneath an invisible modal.
  if(dialog!==gate && gate.open){gate.close();gate.showModal();}
}

export function bindSessionLifecycle({auth,document=globalThis.document,window=globalThis.window,onSuspend,onResume,onUnavailable}) {
  let stopped=false,pending;
  async function revalidate(){
    if(stopped || document.visibilityState==='hidden')return;
    if(pending)return pending;
    if(auth.state.status!=='verified'){onResume();return;}
    onSuspend();
    pending=(async()=>{
      try{
        await auth.revalidate();
        if(stopped || document.visibilityState==='hidden')return;
        if(auth.state.status==='verified' && auth.state.suspended)onUnavailable();else onResume();
      }catch{if(!stopped && document.visibilityState!=='hidden')onUnavailable();}
    })().finally(()=>{pending=null;});
    return pending;
  }
  const visible=()=>{if(document.visibilityState==='hidden')onSuspend();else void revalidate();};
  const focus=()=>{void revalidate();};
  document.addEventListener('visibilitychange',visible);window.addEventListener('focus',focus);
  const unsubscribe=auth.subscribe(state=>{
    if(stopped)return;
    if(state.status==='verified' && state.suspended){onSuspend();if(document.visibilityState!=='hidden')onUnavailable();}
    else if(!pending && document.visibilityState!=='hidden')onResume();
  });
  return {revalidate,dispose(){stopped=true;unsubscribe?.();document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',focus);}};
}
