import {clone,validateState} from './model.js';
/** Repository contract: async load(), save(state), importJSON(text), exportJSON().
 * UI never accesses browser storage. A future HTTP adapter implements this contract.
 */
export class LocalBoardRepository {
  constructor(storage,seed,key='cardboard.v1'){this.storage=storage;this.seed=clone(seed);this.key=key;}
  async load(){
    const raw=this.storage.getItem(this.key);
    if(raw===null)return clone(validateState(this.seed));
    try{return clone(validateState(JSON.parse(raw)));}catch{throw Error('Your saved board could not be read. Export or recover the saved data before replacing it.');}
  }
  async save(state){const clean=clone(validateState(state));this.storage.setItem(this.key,JSON.stringify(clean));return clean;}
  async importJSON(text){let state;try{state=JSON.parse(text);}catch{throw Error('That file is not valid JSON.');}return this.save(state);}
  async exportJSON(){return JSON.stringify(await this.load(),null,2);}
}
