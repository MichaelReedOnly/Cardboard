import {clone,migrateProjects,validateState} from './model.js';

const MAX_REQUEST_BYTES=5_000_000;
const MAX_REVISION=9223372036854775807n;

export class ApiStorageError extends Error {
  constructor(kind,message,status=null) {
    super(message);
    this.name='ApiStorageError';
    this.kind=kind;
    this.status=status;
  }
}

function cleanSnapshot(value) {
  try {return clone(validateState(migrateProjects(value)));}
  catch {throw new ApiStorageError('validation','Choose a valid Cardboard version 1 workspace.');}
}

function readEnvelope(value) {
  try {
    if (!value || typeof value.revision!=='string' || !/^(0|[1-9][0-9]{0,18})$/.test(value.revision) ||
        BigInt(value.revision)>MAX_REVISION) throw Error();
    if (value.snapshot===null) {
      if (value.revision!=='0' || value.updatedAt!==null) throw Error();
      return {snapshot:null,revision:'0',updatedAt:null};
    }
    if (value.revision==='0' || typeof value.updatedAt!=='string' ||
        new Date(value.updatedAt).toISOString()!==value.updatedAt) throw Error();
    return {snapshot:cleanSnapshot(value.snapshot),revision:value.revision,updatedAt:value.updatedAt};
  } catch {throw new ApiStorageError('response','The server returned an invalid workspace. Reload before saving.');}
}

function httpError(status) {
  if (status===401 || status===403) return new ApiStorageError('auth','Sign in again before accessing your workspace.',status);
  if (status===409) return new ApiStorageError('conflict','Workspace has changed. Load the latest revision before saving.',status);
  if (status===413) return new ApiStorageError('size','The workspace request exceeds 5 MB. Your submitted edit is retained for recovery.',status);
  if (status===400 || status===415) return new ApiStorageError('validation','The server could not accept this workspace.',status);
  return new ApiStorageError('service','Workspace service is unavailable. Reload before trying another save.',status);
}

/** Account-bound asynchronous repository. No localStorage or automatic write retries. */
export class ApiBoardRepository {
  #auth; #fetch; #owner; #timeout; #unsubscribe;
  #invalid=false; #loaded=false; #needsReload=false;
  #snapshot=null; #revision='0'; #updatedAt=null;
  #recovery=null; #candidateNumber=0;
  #queue=Promise.resolve(); #requests=new Set();

  constructor({auth,fetchImpl=globalThis.fetch,requestTimeoutMs=30_000}) {
    if (auth?.state?.status!=='verified' || typeof auth.state.userId!=='string' || !auth.state.userId ||
        typeof auth.getToken!=='function' || typeof auth.subscribe!=='function') {
      throw new ApiStorageError('auth','A verified account is required to open a workspace.');
    }
    if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs<=0) throw Error('Invalid request timeout.');
    this.#auth=auth;this.#fetch=fetchImpl;this.#owner=auth.state.userId;this.#timeout=requestTimeoutMs;
    this.#unsubscribe=auth.subscribe(state=>{
      if (state.status!=='verified' || state.userId!==this.#owner) this.#invalidate();
    });
  }

  #invalidate() {
    this.#invalid=true;
    for (const controller of this.#requests) controller.abort();
    this.#snapshot=null;this.#recovery=null;this.#loaded=false;
  }
  #assertActive() {
    if (this.#invalid || this.#auth.state.status!=='verified' || this.#auth.state.userId!==this.#owner) {
      this.#invalidate();
      throw new ApiStorageError('session','Session changed. Open the workspace again after sign-in.');
    }
  }
  #enqueue(action) {
    const pending=this.#queue.then(()=>{this.#assertActive();return action();});
    this.#queue=pending.catch(()=>{});
    return pending;
  }

  async #request(method,body) {
    this.#assertActive();
    const controller=new AbortController();
    this.#requests.add(controller);
    let onAbort;
    const interrupted=new Promise((_,reject)=>{
      onAbort=()=>reject(new ApiStorageError('network','Workspace request was interrupted. Reload before trying another save.'));
      controller.signal.addEventListener('abort',onAbort,{once:true});
    });
    const timer=setTimeout(()=>controller.abort(),this.#timeout);
    const perform=async()=>{
      let token;
      try {token=await this.#auth.getToken();}
      catch {throw new ApiStorageError('auth','Sign in again before accessing your workspace.');}
      this.#assertActive();
      // A timed-out token request must not transmit later when it eventually resolves.
      if (controller.signal.aborted) throw new ApiStorageError('network','Workspace request timed out.');
      if (!token) throw new ApiStorageError('auth','Sign in again before accessing your workspace.');
      const response=await this.#fetch('/api/workspace',{
        method,headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},
        ...(body===undefined?{}:{body}),cache:'no-store',credentials:'omit',signal:controller.signal,
      });
      this.#assertActive();
      if (!response.ok) throw httpError(response.status);
      let result;
      try {result=await response.json();}
      catch {throw new ApiStorageError('response','The server returned an unreadable workspace. Reload before saving.');}
      this.#assertActive();
      return result;
    };
    try {return await Promise.race([perform(),interrupted]);}
    catch(error) {
      this.#assertActive();
      if (error instanceof ApiStorageError) throw error;
      throw new ApiStorageError('network','Workspace request failed. Reload before trying another save.');
    } finally {
      clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);this.#requests.delete(controller);
    }
  }

  get revision(){this.#assertActive();return this.#revision;}
  get updatedAt(){this.#assertActive();return this.#updatedAt;}
  get needsReload(){this.#assertActive();return this.#needsReload;}
  get recoverySnapshot(){this.#assertActive();return clone(this.#recovery);}

  async load() {
    return this.#enqueue(async()=>{
      try {
        const result=readEnvelope(await this.#request('GET'));
        this.#assertActive();
        this.#snapshot=result.snapshot;this.#revision=result.revision;this.#updatedAt=result.updatedAt;
        this.#loaded=true;this.#needsReload=false;
        // Loading a fresh server snapshot does not discard a submitted recovery edit.
        return clone(this.#snapshot);
      } catch(error) {this.#needsReload=true;throw error;}
    });
  }

  async save(state) {
    this.#assertActive();
    const snapshot=cleanSnapshot(state),candidate=++this.#candidateNumber;
    this.#recovery=clone(snapshot);
    return this.#enqueue(async()=>{
      if (!this.#loaded) throw new ApiStorageError('not-loaded','Load the workspace before saving.');
      if (this.#needsReload) throw new ApiStorageError('reload-required','Load the latest workspace before trying another save. Your edit is retained for recovery.');
      if (BigInt(this.#revision)>=MAX_REVISION) throw new ApiStorageError('revision-limit','This workspace has reached its revision limit.');
      let body;
      try {body=JSON.stringify({revision:this.#revision,snapshot});}
      catch {throw new ApiStorageError('validation','The workspace could not be serialized.');}
      if (new TextEncoder().encode(body).byteLength>MAX_REQUEST_BYTES) {
        throw new ApiStorageError('size','The workspace request exceeds 5 MB. Your submitted edit is retained for recovery.');
      }
      try {
        const result=readEnvelope(await this.#request('PUT',body));
        this.#assertActive();
        if (!result.snapshot || BigInt(result.revision)!==BigInt(this.#revision)+1n) {
          throw new ApiStorageError('response','The server returned an unexpected save revision. Reload before saving.');
        }
        this.#snapshot=result.snapshot;this.#revision=result.revision;this.#updatedAt=result.updatedAt;
        if (candidate===this.#candidateNumber) this.#recovery=null;
        return clone(this.#snapshot);
      } catch(error) {
        if (!['auth','size','validation'].includes(error.kind)) this.#needsReload=true;
        throw error;
      }
    });
  }

  async exportJSON() {
    return this.#enqueue(()=>{
      if (!this.#loaded) throw new ApiStorageError('not-loaded','Load the workspace before exporting.');
      if (!this.#snapshot) throw new ApiStorageError('empty','There is no saved workspace to export yet.');
      return JSON.stringify(this.#snapshot,null,2);
    });
  }
  async importJSON(text) {
    this.#assertActive();
    let parsed;
    try {parsed=JSON.parse(text);}
    catch {throw new ApiStorageError('validation','That file is not valid JSON.');}
    return this.save(cleanSnapshot(parsed));
  }
  dispose(){this.#invalidate();this.#unsubscribe?.();}
}
