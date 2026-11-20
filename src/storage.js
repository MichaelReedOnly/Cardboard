import {clone,migrateProjects,validateState} from './model.js';
export const LOCAL_WORKSPACE_KEY='cardboard.v1';

/** Explicit migration read: no seed fallback, writes, deletion or automatic ownership. */
export function readLocalWorkspaceJSON(storage,key=LOCAL_WORKSPACE_KEY) {
  try{return storage.getItem(key);}
  catch{throw Object.assign(new Error('This browser’s local Cardboard data could not be read. Import a JSON backup instead.'),{kind:'local-storage'});}
}

export function parseWorkspaceBackup(text) {
  try{return clone(validateState(migrateProjects(JSON.parse(text))));}
  catch{throw Object.assign(new Error('Choose a valid Cardboard version 1 JSON backup. The source has not been changed.'),{kind:'validation'});}
}
/** Repository contract: async load(), save(state), importJSON(text), exportJSON().
 * UI never accesses browser storage. A future HTTP adapter implements this contract.
 */
export class LocalBoardRepository {
  constructor(storage,seed,key=LOCAL_WORKSPACE_KEY){this.storage=storage;this.seed=clone(seed);this.key=key;}
  async load(){
    const raw=this.storage.getItem(this.key);
    if(raw===null)return validateState(migrateProjects(this.seed));
    try{return validateState(migrateProjects(JSON.parse(raw)));}catch{throw Error('Your saved board could not be read. Export or recover the saved data before replacing it.');}
  }
  async save(state){const clean=clone(validateState(state));this.storage.setItem(this.key,JSON.stringify(clean));return clean;}
  async importJSON(text){let state;try{state=JSON.parse(text);}catch{throw Error('That file is not valid JSON.');}return this.save(migrateProjects(state));}
  async exportJSON(){return JSON.stringify(await this.load(),null,2);}
}
