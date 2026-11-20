import {clone,validateState} from './model.js';

function actionError(kind,message) {return Object.assign(new Error(message),{kind});}

export function snapshotsEqual(first,second) {
  const canonical=value=>JSON.stringify(value,(_key,item)=>item && typeof item==='object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item);
  try{return canonical(first)===canonical(second);}catch{return false;}
}
const counts=snapshot=>({boards:snapshot?.boards.length||0,projects:snapshot?.projects.length||0,cards:snapshot?.cards.length||0});

export function saveSummary(count,mode,phase) {
  const labels={new:'Not saved yet',local:'Local browser storage',editing:'Edits not saved',saving:'Saving…',
    saved:mode==='database'?'Saved to your account':'Saved on this device',
    'not-saved':'Not saved',conflict:'Workspace changed elsewhere',unknown:'Save outcome unknown',
    checking:'Checking saved version…',recovery:'Recovery choice needed'};
  return `${count} ${count===1?'card':'cards'} · ${labels[phase] || 'Not saved'}`;
}

export function shouldWarnBeforeLeaving(status,formDirty=false) {
  return !!(status?.pending || status?.dirty || formDirty);
}

/** One accepted edit at a time; acknowledged data and retained candidates stay separate. */
export class SaveController {
  #repository; #mode; #onChange; #acknowledged; #candidate=null; #status; #disposed=false;
  #ackRevision; #candidateBaseRevision=null; #latest=null;
  constructor({repository,initialState,mode,onChange=()=>{}}) {
    this.#repository=repository;this.#mode=mode;this.#onChange=onChange;
    this.#acknowledged=clone(validateState(initialState));
    this.#ackRevision=mode==='database'?repository.revision:null;
    this.#status=Object.freeze({phase:mode==='local'?'local':repository.revision==='0'?'new':'saved',
      pending:false,dirty:false,blocked:false,canRetry:false,message:''});
  }
  #assertActive(){if(this.#disposed)throw actionError('session','This workspace is no longer active.');}
  #publish(phase,message='',blocked=false) {
    const pending=phase==='saving'||phase==='checking';
    this.#status=Object.freeze({phase,message,blocked,pending,dirty:this.#candidate!==null,
      canRetry:this.#candidate!==null && !pending && !blocked});
    // UI failure must not turn an acknowledged write into a purported storage failure.
    try {this.#onChange(this.#status);} catch {}
  }
  get status(){this.#assertActive();return this.#status;}
  get recoverySnapshot(){this.#assertActive();return clone(this.#candidate);}
  get acknowledgedSnapshot(){this.#assertActive();return clone(this.#acknowledged);}
  get recoveryDetails(){
    this.#assertActive();
    return {baseRevision:this.#candidateBaseRevision,acknowledged:{revision:this.#ackRevision,...counts(this.#acknowledged)},candidate:this.#candidate?counts(this.#candidate):null,
      latest:this.#latest?{revision:this.#latest.revision,exists:this.#latest.snapshot!==null,...counts(this.#latest.snapshot)}:null};
  }
  async save(snapshot) {
    this.#assertActive();
    if(this.#status.pending)throw actionError('busy','A save is already in progress. Wait for it to finish, then try that action again.');
    if(this.#status.blocked)throw actionError('reload-required',this.#status.message);
    return this.#write(snapshot);
  }
  async replaceFromImport(snapshot,{confirmed=false,revision}={}) {
    this.#assertActive();
    if(!confirmed)throw actionError('confirmation-required','Confirm the whole-workspace import first.');
    if(this.#mode!=='database')throw actionError('validation','Account migration requires database mode.');
    if(this.#status.pending)throw actionError('busy','Wait for the current request before importing.');
    if(this.#status.dirty || this.#status.blocked)throw actionError('unsaved','Save or recover your current changes before importing.');
    if(typeof revision!=='string' || !/^(0|[1-9][0-9]{0,18})$/.test(revision) || BigInt(revision)>=9223372036854775807n)throw actionError('validation','Check the destination revision before importing.');
    return this.#write(snapshot,revision);
  }
  async #write(snapshot,expectedRevision) {
    let clean;
    try {clean=clone(validateState(snapshot));}
    catch {throw actionError('validation','These changes are not a valid Cardboard workspace.');}
    this.#candidate=clean;this.#latest=null;
    this.#candidateBaseRevision=this.#mode==='database'?(expectedRevision??this.#repository.revision):null;
    this.#publish('saving');
    try {
      const saved=await this.#repository.save(clone(clean),expectedRevision===undefined?undefined:{expectedRevision});
      this.#assertActive();
      const acknowledged=clone(validateState(saved));
      this.#acknowledged=acknowledged;this.#candidate=null;this.#candidateBaseRevision=null;
      this.#ackRevision=this.#mode==='database'?this.#repository.revision:null;this.#publish('saved');
      return clone(acknowledged);
    } catch(error) {
      this.#assertActive();
      const conflict=error.kind==='conflict';
      const uncertain=this.#mode==='database' && (['network','service','response','reload-required'].includes(error.kind) ||
        !['auth','session','size','validation','revision-limit','not-loaded'].includes(error.kind));
      if(conflict)this.#publish('conflict','This workspace changed elsewhere. Your changes are retained; review the latest saved version to recover.',true);
      else if(uncertain)this.#publish('unknown','The save outcome is unknown; it may have reached storage. Check the latest saved version before trying to save again.',true);
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
  #assertRecovery() {
    this.#assertActive();
    if(this.#status.pending)throw actionError('busy','A workspace request is already in progress.');
    if(!this.#candidate)throw actionError('empty','There are no submitted changes to recover.');
  }
  async checkLatest() {
    this.#assertRecovery();
    const priorPhase=this.#status.phase;
    this.#latest=null;this.#publish('checking','Checking the latest saved version…',true);
    try {
      const loaded=await this.#repository.load();this.#assertActive();
      const latest=loaded===null?null:clone(validateState(loaded));
      const revision=this.#mode==='database'?this.#repository.revision:null;
      if(snapshotsEqual(this.#candidate,latest)){
        const snapshot=await this.#adopt(latest,revision,'Your submitted changes are present in the saved workspace.');
        return {matched:true,snapshot};
      }
      this.#latest={snapshot:latest,revision};
      this.#publish('recovery','Latest version checked. Choose which version to keep. No changes have been written.',true);
      return {matched:false};
    }catch(error){
      this.#assertActive();this.#latest=null;
      this.#publish(priorPhase,'The latest saved version could not be checked. Your changes are retained. Try checking again.',true);
      throw error;
    }
  }
  #assertChoice({confirmed=false,revision}={}) {
    this.#assertRecovery();
    if(!confirmed)throw actionError('confirmation-required','Confirm this whole-workspace recovery choice first.');
    if(!this.#latest || revision!==this.#latest.revision ||
       (this.#mode==='database' && this.#repository.revision!==this.#latest.revision)) {
      throw actionError('stale-recovery','Check the latest saved version again before choosing.');
    }
  }
  async #adopt(snapshot,revision,message) {
    await this.#repository.clearRecovery?.();this.#assertActive();
    this.#acknowledged=clone(snapshot);this.#ackRevision=revision;
    this.#candidate=null;this.#candidateBaseRevision=null;this.#latest=null;
    this.#publish(this.#mode==='local'?'local':revision==='0'?'new':'saved',message);
    return clone(snapshot);
  }
  async useLatest(choice) {
    this.#assertChoice(choice);
    const latest=this.#latest;
    this.#publish('checking','Using the checked saved version…',true);
    try{return await this.#adopt(latest.snapshot,latest.revision,'Latest saved version loaded.');}
    catch(error){this.#assertActive();this.#latest=null;this.#publish('recovery','Recovery could not finish. Your changes are retained. Check the latest version again.',true);throw error;}
  }
  async replaceLatest(choice) {
    this.#assertChoice(choice);
    return this.#write(this.#candidate);
  }
  dispose(){this.#disposed=true;this.#candidate=null;this.#acknowledged=null;this.#latest=null;}
}
