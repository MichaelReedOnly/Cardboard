/** Preserve existing disabled states while locking editing during a request. */
export function createPendingControlLock() {
  const previous=new WeakMap(),previousDrag=new WeakMap();
  return (roots,pending)=>{
    for(const root of roots){for(const control of root.querySelectorAll('button,input,textarea,select')) {
      if(control.dataset.saveAllowed==='true')continue;
      if(pending) {
        // Already-disabled controls belong to their own validation/async state.
        if(!control.disabled){if(!previous.has(control))previous.set(control,false);control.disabled=true;}
      } else if(previous.has(control)) {
        control.disabled=previous.get(control);previous.delete(control);
      }
    }
    for(const node of root.querySelectorAll('[draggable]')){
      if(pending){if(!previousDrag.has(node))previousDrag.set(node,node.draggable);node.draggable=false;}
      else if(previousDrag.has(node)){node.draggable=previousDrag.get(node);previousDrag.delete(node);}
    }}
  };
}

/** Return only editor forms affected by an actual data-edit interaction. */
export function dirtyFormForEvent(event,dialogs) {
  const form=event.target.closest?.('form');
  if(!form || !dialogs.some(dialog=>dialog.contains(form)))return null;
  if(event.type==='input'||event.type==='change')return form;
  if(event.type==='click' && event.target.closest?.('.post-it-swatch,.post-it-align,.photo-remove,.todo-check'))return form;
  return null;
}
