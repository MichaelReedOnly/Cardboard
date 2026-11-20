import test from 'node:test';
import assert from 'node:assert/strict';
import {mountAuthScreen} from '../src/auth-view.js';

// Minimal DOM surface for checking the screen's content and action transitions.
class Node {
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.text='';}
  set textContent(value){this.text=value;this.children=[];}
  get textContent(){return this.text+this.children.map(child=>child.textContent).join(' ');}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.text='';this.children=children;}
  setAttribute(name,value){this.attributes[name]=value;}
  querySelector(){return this.children.find(child=>child.attributes.role==='status');}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function screenFixture(t,initialize,options={}) {
  const oldDocument=globalThis.document;
  globalThis.document={createElement:tag=>new Node(tag)};
  t.after(()=>{if (oldDocument===undefined) delete globalThis.document;else globalThis.document=oldDocument;});
  const root=new Node('div');
  const unmount=mountAuthScreen(root,{initialize,location:{origin:'https://board.example.com',pathname:'/cards'},...options});
  t.after(unmount);
  return root;
}
const buttons=root=>root.children[0].children.filter(child=>child.tagName==='button');

test('auth screen shows verified account only after verification and removes it immediately on account change',async t=>{
  let listener;
  const auth={subscribe(fn){listener=fn;fn({status:'signed-out'});return ()=>{listener=null;};},
    refresh:async()=>{},signIn:async()=>{},signOut:async()=>{}};
  const root=screenFixture(t,async()=>auth);
  await flush();
  assert.match(root.textContent,/invited email/);
  assert.deepEqual(buttons(root).map(node=>node.textContent),['Sign in']);
  listener({status:'verifying',signedIn:true});
  assert.match(root.textContent,/Verifying your account/);
  listener({status:'verified',signedIn:true,userId:'user_A',label:'Account A'});
  assert.match(root.textContent,/Signed in as Account A/);
  assert.match(root.textContent,/Database board loading is coming/);
  assert.deepEqual(buttons(root).map(node=>node.textContent),['Sign out']);
  listener({status:'verifying',signedIn:true});
  assert.doesNotMatch(root.textContent,/Account A/);
  listener({status:'error',signedIn:true,message:'Verification failed'});
  assert.deepEqual(buttons(root).map(node=>node.textContent),['Retry','Sign out']);
});

test('initialization errors offer Retry and recover without exposing account content',async t=>{
  let attempts=0,redirect;
  const auth={subscribe(fn){fn({status:'signed-out'});return ()=>{};},refresh:async()=>{},
    signIn:async url=>{redirect=url;}};
  const root=screenFixture(t,async()=>{
    if (++attempts===1) throw Error('private diagnostic');
    return auth;
  });
  await flush();
  assert.match(root.textContent,/Sign-in could not start/);
  assert.doesNotMatch(root.textContent,/private diagnostic/);
  await buttons(root)[0].onclick();
  assert.match(root.textContent,/invited email/);
  await buttons(root)[0].onclick();
  assert.equal(redirect,'https://board.example.com/cards');
});

test('verified board handoff is not overwritten by the preview screen',async t=>{
  let listener,handedAuth;
  const auth={subscribe(fn){listener=fn;fn({status:'signed-out'});return ()=>{};},refresh:async()=>{}};
  const root=screenFixture(t,async()=>auth,{onVerified:controller=>{handedAuth=controller;root.replaceChildren(new Node('section'));root.children[0].textContent='Loaded private board';}});
  await flush();listener({status:'verified',signedIn:true,label:'Account A'});
  assert.equal(handedAuth,auth);assert.equal(root.textContent,'Loaded private board');
  listener({status:'signed-out'});assert.doesNotMatch(root.textContent,/Loaded private board/);
  assert.match(root.textContent,/invited email/);
});
