import {mountAuthScreen} from './auth-view.js';

let unmount=mountAuthScreen(document.querySelector('#auth-root'),{preview:true});
window.addEventListener('pagehide',()=>unmount());
window.addEventListener('pageshow',event=>{
  if (event.persisted) unmount=mountAuthScreen(document.querySelector('#auth-root'),{preview:true});
});
