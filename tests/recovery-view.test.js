import test from 'node:test';
import assert from 'node:assert/strict';
import {renderRecoveryDialog,recoveryChoicePrompt} from '../src/recovery-view.js';

class Node {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.text='';this.attributes={};}
  set textContent(value){this.text=value;this.children=[];}
  get textContent(){return this.text+this.children.map(child=>child.textContent).join(' ');}
  setAttribute(key,value){this.attributes[key]=value;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
}
const details={baseRevision:'1',candidate:{boards:1,projects:2,cards:3},latest:{revision:'2',exists:true,boards:2,projects:4,cards:5}};
function draw(status,version=details){
  const dialog=new Node('dialog');dialog.ownerDocument={createElement:tag=>new Node(tag)};
  const calls=[];
  renderRecoveryDialog(dialog,{status,details:version,onCheck:()=>calls.push('check'),onUseLatest:()=>calls.push('latest'),onReplace:()=>calls.push('replace'),onDownload:()=>calls.push('download'),onClose:()=>calls.push('close')});
  return {dialog,calls,buttons:dialog.children.filter(node=>node.tag==='button')};
}

test('recovery choices require a checked version and show metadata without workspace contents',async()=>{
  const unchecked=draw({dirty:true,pending:false},{...details,latest:null});
  assert.deepEqual(unchecked.buttons.map(b=>b.textContent),['Download my unsaved changes','Check latest version','Close']);
  const checked=draw({dirty:true,pending:false});
  assert.match(checked.dialog.textContent,/revision 2/);assert.match(checked.dialog.textContent,/Additional text still in an editor is not included/);
  const replace=checked.buttons.find(b=>b.textContent==='Replace the latest version with my changes');
  replace.onclick();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(checked.calls,['replace']);
});

test('recovery request disables choices but leaves Close available',()=>{
  const view=draw({dirty:true,pending:true,message:'Checking…'});
  assert.ok(view.buttons.filter(b=>b.textContent!=='Close').every(b=>b.disabled));
  assert.equal(view.buttons.at(-1).disabled,false);assert.equal(view.buttons.at(-1).dataset.saveAllowed,'true');
});

test('whole-workspace confirmations include counts, revisions and editor-loss warning',()=>{
  const replace=recoveryChoicePrompt(details,'replace',true);
  assert.match(replace,/entire saved workspace/);assert.match(replace,/another device/);
  assert.match(replace,/revision 1/);assert.match(replace,/revision 2/);assert.match(replace,/Open editor values/);
  assert.match(replace,/1 board, 2 projects, 3 cards/);
  const latest=recoveryChoicePrompt(details,'latest');assert.match(latest,/discard your retained submitted changes/);
});
