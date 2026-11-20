import {clone,validateState} from './model.js';

function actionError(kind,message) {return Object.assign(new Error(message),{kind});}

export function saveSummary(count,mode,phase) {
  const labels={new:'Not saved yet',local:'Local browser storage',editing:'Edits not saved',saving:'Saving…',
    saved:mode==='database'?'Saved to your account':'Saved on this device',
    'not-saved':'Not saved',conflict:'Workspace changed elsewhere',unknown:'Save outcome unknown'};
  return `${count} ${count===1?'card':'cards'} · ${labels[phase] || 'Not saved'}`;
}

export function shouldWarnBeforeLeaving(status,formDirty=false) {
  return !!(status?.pending || status?.dirty || formDirty);
}

/** One accepted edit at a time; acknowledged data and retained candidates stay separate. */
export class SaveController {
  #repository; #mode; #onChange; #acknowledged; #candidate=null; #status; #disposed=false;
  constructor({repository,initialState,mode,onChange=()=>{}}) {
    this.#repository=repository;this.#mode=mode;this.#onChange=onChange;
    this.#acknowledged=clone(validateState(initialState));
    this.#status=Object.freeze({phase:mode==='local'?'local':repository.revision==='0'?'new':'saved',
      pending:false,dirty:false,blocked:false,canRetry:false,message:''});
  }
  #assertActive(){if(this.#disposed)throw actionError('session','This workspace is no longer active.');}
  #publish(phase,message='',blocked=false) {
    this.#status=Object.freeze({phase,message,blocked,pending:phase==='saving',dirty:this.#candidate!==null,
      canRetry:this.#candidate!==null && phase!=='saving' && !blocked});
    // UI failure must not turn an acknowledged write into a purported storage failure.
    try {this.#onChange(this.#status);} catch {}
  }
  get status(){this.#assertActive();return this.#status;}
  get recoverySnapshot(){this.#assertActive();return clone(this.#candidate);}
  get acknowledgedSnapshot(){this.#assertActive();return clone(this.#acknowledged);}
  async save(snapshot) {
    this.#assertActive();
    if(this.#status.pending)throw actionError('busy','A save is already in progress. Wait for it to finish, then try that action again.');
    if(this.#status.blocked)throw actionError('reload-required',this.#status.message);
    let clean;
    try {clean=clone(validateState(snapshot));}
    catch {throw actionError('validation','These changes are not a valid Cardboard workspace.');}
    this.#candidate=clean;this.#publish('saving');
    try {
      const saved=await this.#repository.save(clone(clean));
      this.#assertActive();
      const acknowledged=clone(validateState(saved));
      this.#acknowledged=acknowledged;this.#candidate=null;this.#publish('saved');
      return clone(acknowledged);
    } catch(error) {
      this.#assertActive();
      const conflict=error.kind==='conflict';
      const uncertain=this.#mode==='database' && (['network','service','response','reload-required'].includes(error.kind) ||
        !['auth','session','size','validation','revision-limit','not-loaded'].includes(error.kind));
      if(conflict)this.#publish('conflict','This workspace changed elsewhere. Your changes are retained; download them before reloading.',true);
      else if(uncertain)this.#publish('unknown','The save outcome is unknown; it may have reached storage. Download your changes before reloading. Do not resend yet.',true);
      else this.#publish('not-saved','Changes were not saved. Your submitted changes are retained. You can edit them or retry.');
      throw error;
    }
  }
  async retry() {
    this.#assertActive();
    if(this.#status.blocked)throw actionError('reload-required',this.#status.message);
    if(!this.#candidate)throw actionError('empty','There are no submitted changes to retry.');
    return this.save(this.#candidate);
  }
  dispose(){this.#disposed=true;this.#candidate=null;this.#acknowledged=null;}
}
