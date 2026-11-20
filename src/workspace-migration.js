import {ApiBoardRepository} from './api-storage.js';
import {clone,validateState} from './model.js';
import {parseWorkspaceBackup} from './storage.js';

const failure=(kind,message)=>Object.assign(new Error(message),{kind});
const counts=snapshot=>({boards:snapshot?.boards.length||0,projects:snapshot?.projects.length||0,cards:snapshot?.cards.length||0});

/** Capture before opening a file chooser, not after its change event. */
export function captureMigrationOwner({auth=null,repository,saveController}) {
  if(auth && auth.state.status!=='verified')throw failure('auth','Sign in before choosing an account backup.');
  const userId=auth?.state.userId,sessionId=auth?.state.sessionId;
  return {repository,saveController,matches:current=>current.repository===repository && current.saveController===saveController && current.auth===auth &&
    (!auth || (auth.state.status==='verified' && auth.state.userId===userId && auth.state.sessionId===sessionId))};
}

/** Explicit import preview: its read repository never updates the live board's revision. */
export class WorkspaceMigration {
  #auth; #controller; #createRepository; #onChange; #owner; #sessionId; #accountLabel; #unsubscribe;
  #disposed=false; #phase='idle'; #source=null; #text=null; #label=''; #destination=null; #revision=null; #probe; #message=''; #bytes=0;
  constructor({auth,saveController,createRepository=()=>new ApiBoardRepository({auth}),onChange=()=>{}}) {
    if(auth?.state?.status!=='verified' || !auth.state.userId)throw failure('auth','Sign in before importing into an account.');
    this.#auth=auth;this.#controller=saveController;this.#createRepository=createRepository;this.#onChange=onChange;
    this.#owner=auth.state.userId;this.#sessionId=auth.state.sessionId;this.#accountLabel=auth.state.label||auth.state.userId;
    this.#unsubscribe=auth.subscribe(state=>{if(state.status!=='verified'||state.userId!==this.#owner||state.sessionId!==this.#sessionId)this.dispose();});
  }
  #assertOwner(){
    const state=this.#auth.state;
    if(this.#disposed || state.status!=='verified' || state.userId!==this.#owner || state.sessionId!==this.#sessionId){this.dispose();throw failure('session','The account changed. Start the import again.');}
  }
  #assertReady(){
    this.#assertOwner();
    if(this.#auth.state.suspended)throw failure('auth','Verify your session before importing.');
    if(this.#phase==='checking'||this.#phase==='saving'||this.#controller.status.pending)throw failure('busy','Wait for the current request before importing.');
    if(this.#controller.status.dirty)throw failure('unsaved','Save or recover your current changes before importing.');
  }
  #notify(){try{this.#onChange();}catch{}}
  get details(){
    this.#assertOwner();
    return {phase:this.#phase,message:this.#message,account:this.#accountLabel,label:this.#label,
      source:this.#source?counts(this.#source):null,
      destination:this.#revision===null?null:{exists:this.#destination!==null,revision:this.#revision,...counts(this.#destination)},
      tooLarge:this.#bytes>5_000_000,pending:this.#phase==='checking'||this.#phase==='saving',
      needsRecovery:this.#controller.status.dirty,canRetry:this.#phase==='error' && !!this.#source && !this.#controller.status.dirty};
  }
  sourceJSON(){this.#assertOwner();if(this.#auth.state.suspended)throw failure('auth','Verify your session before downloading.');if(this.#text===null)throw failure('empty','No valid source has been selected.');return this.#text;}
  destinationJSON(){this.#assertOwner();if(this.#auth.state.suspended)throw failure('auth','Verify your session before downloading.');if(!this.#destination)throw failure('empty','This account has no saved workspace to back up.');return JSON.stringify(this.#destination,null,2);}
  async prepare(text,label='JSON backup') {
    this.#assertReady();
    this.#source=null;this.#text=null;this.#destination=null;this.#revision=null;this.#bytes=0;this.#label=label;
    try{this.#source=parseWorkspaceBackup(text);this.#text=text;}
    catch(error){this.#phase='error';this.#message=error.message;this.#notify();throw error;}
    this.#phase='checking';this.#message='Checking the destination account…';this.#notify();
    let probe;
    try{
      probe=this.#createRepository();this.#probe=probe;
      const loaded=await probe.load();this.#assertOwner();
      this.#destination=loaded===null?null:clone(validateState(loaded));this.#revision=probe.revision;
      this.#bytes=new TextEncoder().encode(JSON.stringify({revision:this.#revision,snapshot:this.#source})).byteLength;
      this.#phase='preview';this.#message=this.#bytes>5_000_000
        ? 'This import exceeds the 5 MB account limit. Download a backup, then reduce image sizes or source content before importing.'
        : 'Review the source and destination. Import replaces the entire account workspace; it does not merge or append cards.';
      this.#notify();return this.details;
    }catch(error){
      this.#assertOwner();this.#phase='error';this.#destination=null;this.#revision=null;
      this.#message='The destination could not be checked. The source has not been changed. Retry after checking your connection.';this.#notify();throw error;
    }finally{probe?.dispose();if(this.#probe===probe)this.#probe=null;}
  }
  async retry(){this.#assertReady();if(this.#text===null)throw failure('empty','Select a valid source first.');return this.prepare(this.#text,this.#label);}
  async commit({confirmed=false,revision}={}) {
    this.#assertReady();
    if(!confirmed)throw failure('confirmation-required','Confirm the destination account and whole-workspace replacement first.');
    if(this.#phase!=='preview' || !this.#source || revision!==this.#revision)throw failure('stale-preview','Check the destination again before confirming.');
    if(this.#bytes>5_000_000)throw failure('size','This workspace exceeds the 5 MB account limit.');
    this.#phase='saving';this.#message='Importing into your account…';this.#notify();
    try{
      const saved=await this.#controller.replaceFromImport(clone(this.#source),{confirmed:true,revision});this.#assertOwner();
      this.#phase='success';this.#message='Import saved. The original local data or backup file has not been changed.';this.#notify();return saved;
    }catch(error){
      this.#assertOwner();this.#phase='error';this.#message='Import could not be confirmed. The source is unchanged. Review save recovery before trying another import.';this.#notify();throw error;
    }
  }
  dispose(){if(this.#disposed)return;this.#disposed=true;this.#probe?.dispose();this.#probe=null;this.#source=null;this.#text=null;this.#destination=null;this.#unsubscribe?.();}
}
