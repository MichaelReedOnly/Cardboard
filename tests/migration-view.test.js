import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMigrationDialog,migrationConfirmation} from '../src/migration-view.js';

class Node {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.text='';this.attributes={};}
  set textContent(value){this.text=value;this.children=[];}
  get textContent(){return this.text+this.children.map(child=>child.textContent).join(' ');}
  setAttribute(key,value){this.attributes[key]=value;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
}
const details={phase:'preview',account:'Account A',label:'Local browser',message:'Review',source:{boards:1,projects:2,cards:3},destination:{exists:true,revision:'7',boards:2,projects:4,cards:6},pending:false};
function draw(overrides={}){
  const dialog=new Node('dialog');dialog.ownerDocument={createElement:tag=>new Node(tag)};
  renderMigrationDialog(dialog,{details:{...details,...overrides}});
  return {dialog,buttons:dialog.children.filter(node=>node.tag==='button')};
}
test('import preview identifies both workspaces and offers backups before whole-workspace replacement',()=>{
  const {dialog,buttons}=draw();assert.match(dialog.textContent,/Destination: Account A/);assert.match(dialog.textContent,/revision 7/);
  assert.match(dialog.textContent,/1 board, 2 projects, 3 cards/);
  for(const label of ['Download source backup','Download current account backup','Replace my account workspace'])assert.ok(buttons.some(button=>button.textContent===label&&!button.disabled));
  const prompt=migrationConfirmation(details);assert.match(prompt,/Account A/);assert.match(prompt,/revision 7/);assert.match(prompt,/does not merge or append/);assert.match(prompt,/remain unchanged/);
});
test('oversized imports have no submit action; absent account has no enabled destination backup',()=>{
  const {buttons}=draw({tooLarge:true,destination:{...details.destination,exists:false}});
  assert.ok(!buttons.some(button=>button.textContent==='Replace my account workspace'));
  assert.equal(buttons.find(button=>button.textContent==='Download current account backup').disabled,true);
});
test('pending import cannot close while a write is being acknowledged',()=>{
  const {buttons}=draw({phase:'saving',pending:true});assert.ok(buttons.every(button=>button.disabled));
  const checking=draw({phase:'checking',pending:true});assert.equal(checking.buttons.at(-1).disabled,false);
});
