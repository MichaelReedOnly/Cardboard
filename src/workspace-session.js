import {ApiBoardRepository,ApiStorageError} from './api-storage.js';
import {validateState} from './model.js';

export function createEmptyWorkspace() {
  return {version:1,boards:[{id:crypto.randomUUID(),name:'All'}],projects:[],cards:[]};
}

/** Own the repository lifetime; this module never opens browser-local storage. */
export function createWorkspaceSession({auth,createRepository=()=>new ApiBoardRepository({auth}),onChange}) {
  let stopped=false,generation=0,activeKey=null,repository;
  function reset() {
    generation++;repository?.dispose();repository=undefined;activeKey=null;
  }
  function handle(account,force=false) {
    if (stopped) return;
    if (account.status!=='verified') {
      reset();onChange({status:'auth',account});return;
    }
    const key=JSON.stringify([account.userId,account.sessionId]);
    if (!force && activeKey===key) return;
    reset();activeKey=key;
    const attempt=generation;
    onChange({status:'loading',account});
    void (async()=>{
      let phase='load';
      try {
        const current=createRepository();repository=current;
        const loaded=await current.load();
        if (stopped || attempt!==generation) return;
        const snapshot=validateState(loaded===null?createEmptyWorkspace():loaded);
        phase='display';
        onChange({status:'ready',account,repository:current,snapshot});
      } catch(error) {
        if (!stopped && attempt===generation) {
          const errorCode=error instanceof ApiStorageError?error.kind:'unexpected';
          const httpStatus=error instanceof ApiStorageError && Number.isInteger(error.status)?error.status:null;
          const diagnostic=`${errorCode}${httpStatus?` HTTP ${httpStatus}`:''}`;
          onChange({status:'error',account,phase,errorCode,httpStatus,message:phase==='display'
            ? 'Your workspace loaded, but the board could not be displayed. Retry, or sign out and sign in again.'
            : `Your workspace could not be loaded (${diagnostic}). Retry, or sign out and sign in again. No local cards were opened.`});
        }
      }
    })();
  }
  const unsubscribe=auth.subscribe(account=>handle(account));
  return {
    retry(){handle(auth.state,true);},
    dispose(){stopped=true;reset();unsubscribe?.();},
  };
}
