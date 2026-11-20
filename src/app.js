import {createSeed} from './seed.js';
import {startBoard,loadLocalBoard} from './board-startup.js';
import {mountAuthScreen} from './auth-view.js';
import {createWorkspaceSession} from './workspace-session.js';
import {SaveController,saveSummary,shouldWarnBeforeLeaving} from './save-controller.js';
import {createPendingControlLock,dirtyFormForEvent} from './save-controls.js';
import {balanceColumns,cardTextSize,clone,displayColumnCount,getColumns,isPhotoSource,MAX_PHOTO_DATA_LENGTH,MAX_CARD_TEXT,MAX_COLUMNS,MIN_CARD_TEXT,POST_IT_COLORS,moveCardToColumnEnd,moveInColumns,parseItems,reconcileLayouts,swapCardsInColumns,deleteProject,matchesProject,migrateProjects,nextProjectColor,setProjectName,validateState} from './model.js';

const paths={photo:'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M11 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M6 21l8-8a2 2 0 0 1 3 0l4 4',search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',more:'M5 12h.01 M12 12h.01 M19 12h.01',user:'M20 21a8 8 0 0 0-16 0 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',plus:'M12 4v16 M4 12h16',down:'M6 9l6 6 6-6',close:'M6 6l12 12 M18 6L6 18',check:'M5 12l4 4L19 6',sun:'M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M5 19l1.5-1.5 M17.5 6.5L19 5 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',calendar:'M4 5h16v16H4z M8 2v6 M16 2v6 M4 10h16 M8 14h2 M14 14h2 M8 17h2',note:'M6 2h9l4 4v16H6z M14 2v6h5 M9 12h7 M9 15h7 M9 18h5',link:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',pin:'M9 3h6 M10 3v6l-4 5h12l-4-5V3 M12 14v7',up:'M6 14l6-6 6 6'};
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[name]||paths.note);svg.append(p);return svg;}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function button(label,cls,action,iconName){const b=el('button',cls,iconName?undefined:label);b.type='button';b.setAttribute('aria-label',label);if(label==='Cancel'||cls?.split(' ').includes('close')||cls==='quick-close')b.dataset.saveAllowed='true';if(iconName)b.append(icon(iconName));b.onclick=action;return b;}
function showError(e){
 const dialogError = settings.open && settings.querySelector('.project-save-error');
 if (dialogError) dialogError.textContent = e.message || String(e);
 else toast(e.message||String(e),true);
}
let toastTimer;function toast(text,error=false){const e=document.querySelector('#toast');e.textContent=text;e.className='visible';e.setAttribute('role',error?'alert':'status');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.className='',error?9000:2800);}
let repository,state,boardId,dateFilter='',projectSelection=null,query='',sort='manual',showSearch=false,busy=false,dragId=null;
let storageMode='local',accountInfo=null,boardAuth=null,workspaceSession=null;
let saveController=null;
const dirtyForms=new Set(),lockSaveControls=createPendingControlLock();
const app=document.querySelector('#app'),editor=document.querySelector('#editor'),settings=document.querySelector('#settings');
const saveFeedback=el('section','save-feedback');saveFeedback.hidden=true;saveFeedback.setAttribute('aria-label','Unsaved changes');
const saveAnnouncement=el('div','visually-hidden');saveAnnouncement.setAttribute('role','status');saveAnnouncement.setAttribute('aria-live','polite');
document.body.append(saveFeedback,saveAnnouncement);
const quickActions = el('dialog','quick-actions');
quickActions.id = 'quick-actions';
quickActions.setAttribute('aria-label','Quick actions');
document.body.append(quickActions);

const newCardAction = button('New card','quick-pill',()=>{
  quickActions.close();
  openEditor();
});
const columnControls = el('div','column-controls');
columnControls.setAttribute('role','group');
columnControls.setAttribute('aria-label','Column count');
const countOutput = el('output','column-value');
countOutput.setAttribute('aria-live','polite');
const fewer = button('Decrease columns','column-step',()=>setColumnPreference(columnCount()-1));
fewer.textContent = '−';
const more = button('Increase columns','column-step',()=>setColumnPreference(columnCount()+1));
more.textContent = '+';
const auto = button('Auto','quick-pill auto-columns',()=>setColumnPreference(null));
auto.setAttribute('aria-label','Automatic column count');
columnControls.append(fewer,countOutput,more);
const columnRow = el('div','quick-column-row');
columnRow.append(columnControls,auto);
const textControls = el('div','quick-text-controls');
const textLabel = el('label','', 'Card text size');
textLabel.htmlFor = 'card-text-size';
const textSlider = el('input');
textSlider.id = 'card-text-size';
textSlider.type = 'range';
textSlider.min = MIN_CARD_TEXT;
textSlider.max = MAX_CARD_TEXT;
textSlider.step = 1;
const textValue = el('span','text-size-value');
textValue.setAttribute('aria-hidden','true');
const resetText = button('Auto text','quick-pill auto-columns',()=>saveTextSize(null));
textControls.append(textLabel,textValue,textSlider,resetText);
quickActions.append(newCardAction,columnRow,textControls,button('Close quick actions','quick-close',()=>quickActions.close(),'close'));

function previewTextSize(grid,size) {
  if(!grid)return;
  grid.style.setProperty('--card-text',`${size / 16}rem`);
  textValue.textContent = `${size}`;
  textSlider.setAttribute('aria-valuetext',`Size ${size}`);
}

async function saveTextSize(size) {
  const grid = app.querySelector('.board');
  if(!grid||!state)return;
  const active=repository;
  const count = Number(grid.dataset.columns);
  const activeBoardId = boardId;
  const saved = await change(next=>{
    const board = next.boards.find(board=>board.id===activeBoardId);
    if (size === null) {
      if (board.cardTextSizes) delete board.cardTextSizes[count];
    } else {
      (board.cardTextSizes ??= {})[count] = size;
    }
  });
  if (!saved && repository===active && state) render();
}

textSlider.oninput = () => previewTextSize(app.querySelector('.board'),textSlider.valueAsNumber);
textSlider.onchange = () => saveTextSize(textSlider.valueAsNumber);
quickActions.addEventListener('close',()=>{
  if (!editor.open) app.querySelector('.fab')?.focus();
});

function setColumnPreference(preference) {
  const currentBoard = boardId;
  return change(next=>{
    next.boards.find(board=>board.id===currentBoard).columnPreference = preference;
  });
}

function updateColumnControls(count) {
  countOutput.textContent = count;
  fewer.disabled = count<=1;
  more.disabled = count>=MAX_COLUMNS;
  auto.setAttribute('aria-pressed',String(state.boards.find(board=>board.id===boardId).columnPreference==null));
}
async function change(fn,message,afterSave){
 if(!state||!repository||!saveController)return false;
 if(busy){showError({message:'A save is in progress. Wait for it to finish, then try that action again.'});return false;}
 try{const next=clone(state);if(fn(next)===false)return true;reconcileLayouts(next);return await persistSnapshot(next,message,afterSave);}
 catch(e){showError(e);return false;}
}
async function persistSnapshot(next,message,afterSave){
 const active=repository,controller=saveController;
 if(!active||!controller)return false;
 if(busy){showError({message:'A save is in progress. Wait for it to finish, then try that action again.'});return false;}
 try{
  const saved=await controller.save(next);
  if(repository!==active||saveController!==controller)return false;
  state=saved;afterSave?.();render();if(message)toast(message);return true;
 }catch{
  if(repository!==active||saveController!==controller)return false;
  const retained=controller.recoverySnapshot;
  if(retained){state=retained;if(!state.boards.some(b=>b.id===boardId)){boardId=state.boards[0].id;resetFilters();}render();}
  showError({message:controller.status.message||'These changes could not be saved. Your editor values are still here.'});
  return false;
 }
}
function initializeSaveController(){
 const active=repository;
 saveController=new SaveController({repository:active,initialState:state,mode:storageMode,onChange:status=>{
  if(repository!==active)return;busy=status.pending;syncSaveUi();
 }});
}
function downloadJSON(json,name){
 const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const link=el('a');link.href=url;link.download=name;link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function downloadRecovery(){
 const retained=saveController?.recoverySnapshot;
 if(retained)downloadJSON(JSON.stringify(retained,null,2),`cardboard-unsaved-${dateKey()}.json`);
}
function hasUnsavedChanges(){return shouldWarnBeforeLeaving(saveController?.status,dirtyForms.size>0);}
function syncSaveUi(){
 const status=saveController?.status;
 const phase=dirtyForms.size && status && !status.pending && !status.dirty?'editing':status?.phase;
 const footer=app.querySelector('.footer.saved');
 if(footer && state && status)footer.textContent=saveSummary(state.cards.filter(c=>c.boardId===boardId).length,storageMode,phase);
 const announcement=status?saveSummary(0,storageMode,phase).split(' · ')[1]:'';
 if(saveAnnouncement.textContent!==announcement)saveAnnouncement.textContent=announcement;
 app.setAttribute('aria-busy',String(status?.pending||false));
 saveFeedback.hidden=!status?.dirty||status.pending;
 saveFeedback.replaceChildren();
 if(!saveFeedback.hidden){
  saveFeedback.append(el('p','',status.message));
  if(status.canRetry)saveFeedback.append(button('Retry save','primary',()=>persistSnapshot(saveController.recoverySnapshot,'Changes saved')));
  saveFeedback.append(button('Download unsaved changes','secondary',downloadRecovery));
 }
 lockSaveControls([app,editor,settings,quickActions,saveFeedback],!!status?.pending);
}
function showDialog(dialog){dialog.showModal();syncSaveUi();}
function clearDirtyForms(dialog){for(const form of dirtyForms)if(dialog.contains(form))dirtyForms.delete(form);}
function markFormSaved(form){dirtyForms.delete(form);syncSaveUi();}
function requestDialogClose(dialog){
 if([...dirtyForms].some(form=>dialog.contains(form)) && !window.confirm('Close without saving these editor changes?'))return;
 dialog.close();
}
for(const dialog of [editor,settings]){
 dialog.addEventListener('close',()=>{clearDirtyForms(dialog);syncSaveUi();});
 dialog.addEventListener('cancel',event=>{if([...dirtyForms].some(form=>dialog.contains(form)) && !window.confirm('Close without saving these editor changes?'))event.preventDefault();});
}
for(const eventName of ['input','change','click'])document.addEventListener(eventName,event=>{
 const form=dirtyFormForEvent(event,[editor,settings]);
 if(form){dirtyForms.add(form);syncSaveUi();}
},true);
window.addEventListener('beforeunload',event=>{if(hasUnsavedChanges()){event.preventDefault();event.returnValue='';}});
function columnCount(visibleCount = visibleCards().length) {
  const board = state.boards.find(board=>board.id===boardId);
  return displayColumnCount(board.columnPreference,visibleCount,window.innerWidth);
}

function endDrag() {
  dragId = null;
  app.classList.remove('drag-active');
  app.querySelectorAll('.dragging,.drag-over').forEach(node=>node.classList.remove('dragging','drag-over'));
}

function acceptDrop(event, allowed) {
  if (!allowed) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.classList.add('drag-over');
}

function moveToColumn(cardId, count, destination) {
  if (sort !== 'manual' || count !== columnCount()) return false;
  return change(next=>moveCardToColumnEnd(next,boardId,count,cardId,destination),'Card moved');
}

function columnDropTarget(count, index) {
  const target = el('div','column-drop-target',`Drop at bottom of column ${index+1}`);
  const canDrop = () => dragId && state.cards.some(card=>card.id===dragId && !card.pinned);
  target.ondragover = event => acceptDrop(event,canDrop());
  target.ondragleave = () => target.classList.remove('drag-over');
  target.ondrop = event => {
    if (!canDrop()) return;
    event.preventDefault();
    const cardId = dragId;
    endDrag();
    moveToColumn(cardId,count,index);
  };
  return target;
}

function chooseColumn(card, count) {
  dialogHead(settings,'Move to column');
  settings.setAttribute('aria-label','Move to column');
  for (let index=0; index<count; index++) {
    settings.append(button(`Bottom of column ${index+1}`,'menu-row',async()=>{
      if (await moveToColumn(card.id,count,index)) {
        settings.close();
        const moved = Array.from(app.querySelectorAll('.card')).find(node=>node.dataset.id===card.id);
        moved?.querySelector('.move-column')?.focus();
      }
    }));
  }
  showDialog(settings);
}
const dateKey=(offset=0)=>{const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
function boardCards() {
  return state.cards.filter(card=>card.boardId===boardId).sort((a,b)=>
    Number(b.pinned)-Number(a.pinned)
    || (sort==='title' ? a.title.localeCompare(b.title) : sort==='date' ? (a.date||'9999').localeCompare(b.date||'9999') : 0));
}

function visibleCards(cards = boardCards()) {
  const date = dateFilter==='today' ? dateKey() : dateFilter==='tomorrow' ? dateKey(1) : '';
  const search = query.toLowerCase();
  return cards.filter(card=>matchesProject(card,projectSelection)
    && (!dateFilter || card.date===date)
    && [card.title,card.body,card.photoSubtitle,...card.items.map(item=>item.text),
      state.projects.find(project=>project.id===card.projectId)?.name].join(' ').toLowerCase().includes(search));
}

function sortedProjects() {
  return [...state.projects].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
}

function resetFilters() {
  dateFilter = '';
  projectSelection = null;
  query = '';
}

function toggleProject(id) {
  projectSelection ??= new Set();
  if (projectSelection.has(id)) projectSelection.delete(id);
  else projectSelection.add(id);
  render();
}

function newProject(onCreated) {
  nameDialog('New project', async name=>{
    const id = crypto.randomUUID();
    return change(next=>next.projects.push({
      id,name:setProjectName(next.projects,name),color:nextProjectColor(next.projects)
    }), 'Project created', ()=>onCreated?.(id));
  });
}

function projectOptions(project) {
  dialogHead(settings,project.name);
  settings.append(
    button('Rename project','menu-row',()=>nameDialog('Rename project',name=>change(next=>{
      next.projects.find(item=>item.id===project.id).name = setProjectName(next.projects,name,project.id);
    },'Project renamed'),project.name)),
    button('Delete project','menu-row danger',()=>confirmProjectDelete(project))
  );
  showDialog(settings);
}

function confirmProjectDelete(project) {
  const affected = state.cards.filter(card=>card.projectId===project.id).length;
  dialogHead(settings,'Delete project?');
  settings.append(el('p','hint',`“${project.name}” will be removed. ${affected} ${affected===1?'card':'cards'} across all boards will be kept under No project.`));
  const actions = el('div','dialog-actions');
  actions.append(button('Cancel','secondary',()=>settings.close()),button('Delete project','primary',async()=>{
    if (await change(next=>deleteProject(next,project.id),'Project deleted',()=>projectSelection?.delete(project.id))) {
      settings.close();
    }
  }));
  settings.append(actions);
}

function renderFilters() {
  const filters = el('nav','filters');
  filters.setAttribute('aria-label','Filter cards');
  const pill = (label,active,action,color,extra='',focusKey=label)=>{
    const control = button(label,`pill ${extra}${active?' active':''}`,action);
    control.setAttribute('aria-pressed',String(active));
    control.dataset.filterKey = focusKey;
    if (color) {
      const dot = el('span','dot');
      dot.style.setProperty('--dot',color);
      control.prepend(dot);
    }
    return control;
  };
  for (const [label,key] of [['Today','today'],['Tomorrow','tomorrow'],['No date','undated']]) {
    filters.append(pill(label,dateFilter===key,()=>{
      dateFilter = dateFilter===key ? '' : key;
      render();
    },null,key==='today'?'today':''));
  }
  filters.append(pill('All',projectSelection===null,()=>{ projectSelection=null; render(); }));
  for (const project of sortedProjects()) {
    const group = el('div','project-chip');
    group.append(
      pill(project.name,projectSelection?.has(project.id) ?? false,()=>toggleProject(project.id),project.color,'','project:'+project.id),
      button(`Options for ${project.name}`,'project-options',()=>projectOptions(project),'more')
    );
    filters.append(group);
  }
  filters.append(
    pill('No project',projectSelection?.has(null) ?? false,()=>toggleProject(null)),
    button('＋ New project','new-project',()=>newProject())
  );
  return filters;
}
function render(){
 if(!state)return;
 endDrag();
 const focusedFilter = document.activeElement?.dataset.filterKey;
 const focusSearch=document.activeElement?.id==='search';const cursor=focusSearch?document.activeElement.selectionStart:null;
 app.replaceChildren();const header=el('header');const brand=el('div','brand');brand.setAttribute('aria-hidden','true');for(let i=0;i<4;i++)brand.append(el('i'));header.append(brand);
 const title=button(state.boards.find(b=>b.id===boardId)?.name||'All','board-select',()=>openSettings('boards'));title.append(icon('down'));header.append(title);
 const profile=button(storageMode==='database'?`Account: ${accountInfo.label}`:'About this local board',`icon-button profile${storageMode==='database'?' account-profile':''}`,()=>storageMode==='database'?openAccount():openSettings('about'),'user');
 if(storageMode==='database')profile.dataset.saveAllowed='true';
 const actions=el('div','header-actions');actions.append(button('Search cards','icon-button',()=>{showSearch=!showSearch;if(!showSearch)query='';render();document.querySelector('#search')?.focus();},'search'),button('Board options','icon-button',()=>openSettings(),'more'),profile);header.append(actions);app.append(header);
 app.append(renderFilters());
 const allCards=boardCards();const cards=visibleCards(allCards);if(showSearch){const search=el('div','search-wrap');const input=el('input');input.id='search';input.type='search';input.placeholder='Search your cards';input.setAttribute('aria-label','Search cards');input.value=query;input.oninput=()=>{query=input.value;render();};search.append(icon('search'),input,el('span','search-count',`${cards.length} cards`));app.append(search);}
 const grid=el('main','board');grid.setAttribute('aria-label','Cards board');
 const count = columnCount(cards.length);
 updateColumnControls(count);
 grid.style.gridTemplateColumns = `repeat(${count}, minmax(0, 1fr))`;
 grid.dataset.columns = count;
 const manual = sort === 'manual';
 const layout = manual ? getColumns(state,boardId,count) : balanceColumns(allCards,count);
 const visible = new Map(cards.map(card=>[card.id,card]));
 const columns = layout.map((ids,index)=>{
   const column = el('section','column');
   column.setAttribute('aria-label',`Column ${index+1}`);
   for (const id of ids) {
     if (visible.has(id)) column.append(renderCard(visible.get(id),count));
   }
   if (manual) column.append(columnDropTarget(count,index));
   return column;
 });
 if(cards.length)grid.append(...columns);else{const empty=el('div','empty');empty.append(el('h2','',query||dateFilter||projectSelection!==null?'No matching cards':'A little space for your thoughts'),el('p','',query||dateFilter||projectSelection!==null?'Try another search or clear your filters.':'Start with a note, a list, or a plan for the week.'),button(query||dateFilter||projectSelection!==null?'Clear filters':'Create a card','primary',()=>{if(query||dateFilter||projectSelection!==null){resetFilters();render();}else openEditor();}));grid.append(empty);}
 const fab = button('Quick actions','fab',()=>showDialog(quickActions),'plus');
 fab.setAttribute('aria-haspopup','dialog');
 fab.setAttribute('aria-controls',quickActions.id);
 app.append(grid,fab,el('div','footer saved',''));
 const columnWidth = columns[0].getBoundingClientRect().width;
 const board = state.boards.find(board=>board.id===boardId);
 const textSize = cardTextSize(board,count,columnWidth);
 textSlider.value = textSize;
 resetText.setAttribute('aria-pressed',String(board.cardTextSizes?.[count] == null));
 previewTextSize(grid,textSize);
 if (columnWidth > 0 && columnWidth < 210) {
   grid.classList.add('compact-columns');
   grid.style.setProperty('--card-scale',columnWidth/210);
 }
 if (focusedFilter) Array.from(app.querySelectorAll('[data-filter-key]')).find(control=>control.dataset.filterKey===focusedFilter)?.focus();
 if(focusSearch){const input=document.querySelector('#search');input?.focus();try{input?.setSelectionRange(cursor,cursor);}catch{}}
 syncSaveUi();
}
function todoCheckbox(done, onToggle) {
  const check = button('To-do completed','check todo-check',onToggle);
  check.setAttribute('role','checkbox');
  updateTodoCheckbox(check,done);
  return check;
}

function updateTodoCheckbox(check,done) {
  check.setAttribute('aria-checked',String(done));
  check.replaceChildren(...(done ? [icon('check')] : []));
}

function renderCard(c,count){
 const card=el('article',`card ${c.type}`);card.dataset.id=c.id;card.draggable=sort==='manual';card.setAttribute('aria-label',c.title);
 const canSwap = () => dragId && dragId!==c.id
   && state.cards.some(card=>card.id===dragId && card.pinned===c.pinned);
 card.ondragstart = event => {
   if (sort!=='manual' || event.target.closest('button,a')) {
     event.preventDefault();
     return;
   }
   dragId = c.id;
   event.dataTransfer.effectAllowed = 'move';
   event.dataTransfer.setData('text/plain',c.id);
   card.classList.add('dragging');
   if (!c.pinned) app.classList.add('drag-active');
 };
 card.ondragend = endDrag;
 card.ondragover = event => acceptDrop(event,canSwap());
 card.ondragleave = () => card.classList.remove('drag-over');
 card.ondrop = event => {
   if (!canSwap() || count!==columnCount()) return;
   event.preventDefault();
   const cardId = dragId;
   endDrag();
   change(next=>swapCardsInColumns(next,boardId,count,cardId,c.id),'Cards swapped');
 };
 if (c.type === 'single-todo') {
   const row = el('div','todo-row');
   const task = el('h2','todo-text',c.body || 'One thing to do');
   task.onclick = ()=>openEditor(c.id);
   const check = todoCheckbox(c.todoDone ?? false,async()=>{
     if (await change(next=>{
       const todo = next.cards.find(card=>card.id===c.id);
       todo.todoDone = !todo.todoDone;
     })) {
       const updated = Array.from(app.querySelectorAll('.single-todo')).find(card=>card.dataset.id===c.id);
       updated?.querySelector('.todo-check')?.focus();
     }
   });
   row.append(task,check);
   card.append(row);
 } else {
 const top=el('div','card-top');const head=el('div','card-header');const type=c.id==='today'?'sun':c.type==='week'?'calendar':c.type==='link'?'link':c.type==='photo'?'photo':'note';const badge=el('span',`card-icon ${type}`);badge.append(icon(type));const h=el('h2','card-title',c.title);head.append(badge,h);head.onclick=()=>openEditor(c.id);top.append(head);const p=state.projects.find(p=>p.id===c.projectId);if(p)badge.style.backgroundColor=p.color;top.append(el('p','subtitle',c.type==='photo'?(c.photoSubtitle||'One picture. One line about it.'):p?.name||(c.type==='week'?'Three things a day. No more.':c.type==='link'?'Save a page. See it at a glance.':c.type==='checklist'?'A little progress, one thing at a time.':'')));card.append(top);
 if(c.type==='week'||c.type==='checklist'){
   c.items.forEach((item,i)=>{if(c.id==='today'&&(i===0||i===3))card.append(el('div','section-label',i===0?'BIG 3':'THE REST'));const row=el('div',`check-row ${item.done?'done':''}`);if(c.type==='week')row.append(el('span','week-label',item.label||['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i%7]));const check=button(`${item.done?'Uncheck':'Complete'} ${item.text}`,'check',()=>change(s=>{const x=s.cards.find(x=>x.id===c.id).items.find(x=>x.id===item.id);x.done=!x.done;}));check.setAttribute('role','checkbox');check.setAttribute('aria-checked',String(item.done));if(item.done)check.append(icon('check'));row.append(check,el('div','item-text',item.text));card.append(row);});
   if(c.type==='week'){card.append(el('div','section-label','NOTES'),el('div',c.body?'note-body':'blank-note',c.body));}
   card.append(button('＋ Add an item','add-item',()=>openEditor(c.id)));
 }else{
   if(c.type==='link'&&c.url){const link=el('a','link-preview');link.href=c.url;link.target='_blank';link.rel='noopener noreferrer';link.append(el('small','',new URL(c.url).hostname),el('strong','',c.url));card.append(link,el('div','section-label','WHY I SAVED IT'));}
   if (c.type === 'photo') {
     card.append(photoPreview(c.photoSource,c.title),el('div','note-body photo-description',c.body || 'One line about this photo'));
   } else if (c.type === 'post-it') {
     const surface = el('div','post-it-surface');
     stylePostIt(surface,c.postItColor,c.postItAlignment);
     surface.append(el('div','post-it-copy',c.body || 'What’s on your mind?'));
     card.append(surface);
   } else {
     card.append(el('div','note-body',c.body||'A little space for a thought…'));
   }
 }
 }
 if(c.pinned){const pin=el('span','pin-mark');pin.title='Pinned';pin.append(icon('pin'));card.append(pin);}
 if(c.date){const date=el('div','date-tag');date.append(icon('calendar'),document.createTextNode(c.date===dateKey()?'Today':c.date===dateKey(1)?'Tomorrow':new Date(`${c.date}T12:00:00`).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})));card.append(date);}
 const tools=el('div','card-tools');tools.append(button(`Edit ${c.title}`,'',()=>openEditor(c.id)));const group=el('div');group.append(button(c.pinned?`Unpin ${c.title}`:`Pin ${c.title}`,'',()=>change(s=>{const x=s.cards.find(x=>x.id===c.id);x.pinned=!x.pinned;}), 'pin'),button(`Move ${c.title} earlier`,'',()=>moveEarlier(c),'up'));tools.append(group);
 if (sort==='manual' && !c.pinned) {
   const move = button('Move to column','move-column',()=>chooseColumn(c,count));
   move.setAttribute('aria-label',`Move ${c.title} to column`);
   tools.append(move);
 }
 card.append(tools);return card;
}
function moveEarlier(card) {
  if (sort!=='manual') { toast('Choose Manual sort to reorder cards.'); return; }
  const count = columnCount();
  const columns = getColumns(state,boardId,count);
  const visible = new Set(visibleCards().filter(peer=>peer.pinned===card.pinned).map(peer=>peer.id));
  const peers = columns.flat().filter(id=>visible.has(id));
  const before = peers[peers.indexOf(card.id)-1];
  if (!before) { toast('This card is already first in its group.'); return; }
  const destination = columns.findIndex(column=>column.includes(before));
  change(next=>moveInColumns(next,boardId,count,card.id,destination,before),'Card moved');
}
function dialogHead(dialog,title){clearDirtyForms(dialog);dialog.replaceChildren();dialog.setAttribute('aria-label',title);const head=el('div','dialog-head');head.append(el('h2','',title),button('Close','icon-button close',()=>requestDialogClose(dialog),'close'));dialog.append(head);}
function field(form,label,name,value,tag='input',options){const wrap=el('label','field',label);const input=el(tag);input.name=name;if(tag==='select')for(const [v,t]of options){const o=el('option','',t);o.value=v;input.append(o);}input.value=value??'';wrap.append(input);form.append(wrap);return input;}
function stylePostIt(surface, color = 'amber', alignment = 'left') {
  surface.style.setProperty('--post-it-color',POST_IT_COLORS[color]);
  surface.style.textAlign = alignment;
}

function postItEditor(card, body) {
  let color = card.postItColor ?? 'amber';
  let alignment = card.postItAlignment ?? 'left';
  const panel = el('div','post-it-editor');
  const surface = el('div','post-it-surface');
  const writing = el('textarea','post-it-writing');
  writing.rows = 1;
  writing.value = body.value;
  writing.placeholder = 'What’s on your mind?\nWrite it here.';
  writing.setAttribute('aria-label','Post-it text');
  const sizing = el('div','post-it-sizing');
  sizing.setAttribute('aria-hidden','true');
  const writingArea = el('div','post-it-writing-area');
  writingArea.append(sizing,writing);
  surface.append(writingArea);

  const colors = el('div','post-it-options');
  const alignments = el('div','post-it-options');
  colors.setAttribute('role','group');
  colors.setAttribute('aria-label','Post-it color');
  alignments.setAttribute('role','group');
  alignments.setAttribute('aria-label','Post-it alignment');
  const swatches = Object.entries(POST_IT_COLORS).map(([name,hex])=>{
    const swatch = button(name,'post-it-swatch',()=>{ color = name; update(); });
    swatch.title = name;
    swatch.style.setProperty('--swatch-color',hex);
    colors.append(swatch);
    return [name,swatch];
  });
  const alignmentButtons = ['left','center'].map(name=>{
    const control = button(name==='left'?'Left':'Center','post-it-align',()=>{ alignment = name; update(); });
    alignments.append(control);
    return [name,control];
  });
  function update() {
    stylePostIt(surface,color,alignment);
    for (const [name,swatch] of swatches) swatch.setAttribute('aria-pressed',String(name===color));
    for (const [name,control] of alignmentButtons) control.setAttribute('aria-pressed',String(name===alignment));
  }
  function updateWriting() {
    sizing.textContent = (writing.value || writing.placeholder) + '\u200b';
  }
  writing.oninput = () => { body.value = writing.value; updateWriting(); };
  body.addEventListener('input',()=>{ writing.value = body.value; updateWriting(); });
  panel.append(surface,colors,alignments);
  update();
  updateWriting();
  return {panel, values:()=>({postItColor:color,postItAlignment:alignment})};
}

function photoPreview(source, title) {
  const preview = el('div','photo-preview');
  const placeholder = el('div','photo-placeholder');
  placeholder.append(icon('photo'),el('span','',source ? 'Photo unavailable' : 'Add a photo'));
  if (source) {
    const image = el('img');
    image.alt = title || 'Selected photo';
    image.draggable = false;
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error',()=>preview.replaceChildren(placeholder));
    image.src = source;
    preview.append(image);
  } else {
    preview.append(placeholder);
  }
  return preview;
}

async function photoFromFile(file) {
  if (!/^image\/(?:jpeg|png|webp|gif|avif|bmp|heic|heif)$/.test(file.type) || file.size > 25_000_000) {
    throw Error('Choose a supported image file up to 25 MB.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = el('canvas');
    const scale = Math.min(1,1200 / Math.max(bitmap.width,bitmap.height));
    canvas.width = Math.max(1,Math.round(bitmap.width * scale));
    canvas.height = Math.max(1,Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    for (const quality of [.85,.68,.48,.3]) {
      const source = canvas.toDataURL('image/webp',quality);
      if (isPhotoSource(source)) return source;
    }
    throw Error('This photo is too large to save. Try a smaller image.');
  } finally {
    bitmap.close();
  }
}

function photoEditor(card) {
  const panel = el('div','photo-editor');
  const subtitle = field(panel,'Subtitle','photoSubtitle',card.photoSubtitle);
  subtitle.placeholder = 'One picture. One line about it.';
  subtitle.maxLength = 160;
  let localSource = card.photoSource?.startsWith('data:') ? card.photoSource : '';
  let pending = false;
  const preview = el('div');
  const file = field(panel,'Choose a photo from your device','photoFile','');
  file.type = 'file';
  file.accept = 'image/*';
  // Resetting an unopened file input is valid. Never set it to a saved file path.
  const url = field(panel,'Image URL','photoUrl',localSource ? '' : card.photoSource);
  url.placeholder = 'https://';
  url.inputMode = 'url';
  const status = el('p','photo-status');
  status.setAttribute('role','status');
  function refresh() {
    const address = url.value.trim();
    const valid = !address || (isPhotoSource(address) && /^https?:\/\//i.test(address));
    status.textContent = valid ? '' : 'Enter an HTTP or HTTPS image URL.';
    preview.replaceChildren(photoPreview(valid ? address || localSource : '',card.title));
  }
  url.addEventListener('change',()=>{
    if (url.value.trim() && isPhotoSource(url.value.trim()) && /^https?:\/\//i.test(url.value.trim())) localSource = '';
    refresh();
  });
  file.onchange = async ()=>{
    const [selected] = file.files;
    if (!selected) return;
    file.value = '';
    pending = true;
    file.disabled = true;
    url.disabled = true;
    remove.disabled = true;
    status.textContent = 'Preparing photo…';
    try {
      localSource = await photoFromFile(selected);
      url.value = '';
      refresh();
    } catch (error) {
      status.textContent = error instanceof DOMException ? 'This image could not be opened. Try a JPEG, PNG, or WebP photo.' : error.message;
    } finally {
      pending = false;
      file.disabled = false;
      url.disabled = false;
      remove.disabled = false;
      syncSaveUi();
    }
  };
  const remove = button('Remove photo','add-item photo-remove',()=>{
    localSource = '';
    url.value = '';
    refresh();
  });
  panel.insertBefore(preview,file.parentElement);
  panel.append(remove,status);
  refresh();
  return {
    panel,
    values() {
      if (pending) throw Error('Wait for the photo to finish preparing.');
      const address = url.value.trim();
      if (address && (!isPhotoSource(address) || !/^https?:\/\//i.test(address))) {
        throw Error('Enter an HTTP or HTTPS image URL.');
      }
      return {photoSubtitle:subtitle.value.trim(),photoSource:address || localSource};
    }
  };
}

function openEditor(id){
 const existing=state.cards.find(c=>c.id===id);const c=existing||{id:crypto.randomUUID(),title:'',type:'note',projectId:projectSelection?.size===1?[...projectSelection][0]:null,date:dateFilter==='today'?dateKey():dateFilter==='tomorrow'?dateKey(1):'',pinned:false,body:'',items:[],boardId};
 dialogHead(editor,existing?'Your card':'A new card');const form=el('form');const title=field(form,'Title','title',c.title);title.required=true;title.maxLength=200;field(form,'Card type','type',c.type,'select',[['note','Note'],['checklist','Checklist'],['week','Week planner'],['link','Link'],['post-it','Post-it'],['photo','Photo'],['single-todo','To-do']]);
 const row = el('div','field-row');
 const projectField = el('div','card-project-field');
 const project = field(projectField,'Project','projectId',c.projectId || '','select',
   [['','No project'],...sortedProjects().map(item=>[item.id,item.name])]);
 const createProject = button('＋ New project','add-item',()=>newProject(id=>{
   project.replaceChildren();
   for (const [value,name] of [['','No project'],...sortedProjects().map(item=>[item.id,item.name])]) {
     const option = el('option','',name);
     option.value = value;
     project.append(option);
   }
   project.value = id;
   project.dispatchEvent(new Event('change',{bubbles:true}));
 }));
 projectField.append(createProject);
 row.append(projectField);
 const date = field(row,'Date','date',c.date);
 date.type = 'date';
 form.append(row);
 const body=field(form,'Notes','body',c.body,'textarea');body.placeholder='Write it down. Make a little space.';
 const postIt = postItEditor(c,body);
 form.append(postIt.panel);
 const photo = photoEditor(c);
 form.insertBefore(photo.panel,body.parentElement);
 const list=field(form,'Checklist · one item per line','items',c.items.map(i=>(c.type==='week'?`${i.label||''} | `:'')+i.text.replaceAll('\n',' ⏎ ')).join('\n'),'textarea');list.className='checklist-editor';
 const listHint=el('p','hint','Week planner: use “Mon | Your plan”. Use ⏎ for a line break within an item.');form.append(listHint);
 const url=field(form,'Link address','url',c.url||'');url.type='url';url.placeholder='https://';
 let todoDone = c.type === 'single-todo' && (c.todoDone ?? false);
 const todoCheck = todoCheckbox(todoDone,()=>{
   todoDone = !todoDone;
   updateTodoCheckbox(todoCheck,todoDone);
 });
 const bodyLabel = body.parentElement;
 const taskRow = el('div','todo-editor-row');
 form.insertBefore(taskRow,bodyLabel);
 taskRow.append(bodyLabel,todoCheck);
 const updateType = () => {
   const type = form.elements.type.value;
   const isTodo = type === 'single-todo';
   const isPhoto = type === 'photo';
   title.required = !isTodo;
   title.parentElement.hidden = isTodo;
   postIt.panel.hidden = type !== 'post-it';
   photo.panel.hidden = !isPhoto;
   taskRow.hidden = type === 'post-it';
   taskRow.classList.toggle('todo-editor-active',isTodo);
   todoCheck.hidden = !isTodo;
   project.disabled = isTodo;
   createProject.hidden = isTodo;
   if (isTodo) project.value = '';
   body.required = isTodo;
   bodyLabel.firstChild.textContent = isTodo ? 'Task' : isPhoto ? 'Description' : 'Notes';
   body.placeholder = isTodo ? 'One thing to do' : isPhoto ? 'One line about this photo' : 'Write it down. Make a little space.';
   list.parentElement.hidden = !['week','checklist'].includes(type);
   listHint.hidden = type !== 'week';
   url.parentElement.hidden = type !== 'link';
 };
 form.elements.type.onchange = () => {
   if (form.elements.type.value === 'photo' && !title.value.trim()) title.value = 'Photo';
   updateType();
 };
 updateType();
 const pinLabel=el('label','form-check');const pin=el('input');pin.type='checkbox';pin.checked=c.pinned;pinLabel.append(pin,document.createTextNode('Pin to the top'));form.append(pinLabel);
 const error=el('p','error');error.setAttribute('role','alert');form.append(error);const actions=el('div','dialog-actions');
 if(existing)actions.append(button('Delete card','danger',()=>confirmDelete(c)));actions.append(button('Cancel','secondary',()=>requestDialogClose(editor)));const save=el('button','primary','Save card');save.type='submit';actions.append(save);form.append(actions);
 form.onsubmit=async e=>{
  e.preventDefault();
  const type = form.elements.type.value;
  const task = body.value.trim();
  if (type === 'single-todo' && !task) { error.textContent = 'Enter one thing to do.'; return; }
  if (type !== 'single-todo' && !title.value.trim()) { error.textContent = 'Give your card a title.'; return; }
  if (type === 'link' && url.value && !/^https?:\/\//i.test(url.value)) { error.textContent = 'Use an https:// or http:// address.'; return; }
  let photoValues = {};
  if (type==='photo') {
    try { photoValues = photo.values(); } catch (err) { error.textContent = err.message; return; }
  }
  const cardTitle = type === 'single-todo' ? task.replace(/\s+/g,' ').slice(0,200) : title.value.trim();
  const updated={...c,...photoValues,...(type==='single-todo'?{todoDone}:{}),...(type==='post-it'?postIt.values():{}),title:cardTitle,type,projectId:type==='single-todo'?null:project.value||null,date:date.value,body:body.value,pinned:pin.checked,url:type==='link'?url.value:'',items:['week','checklist'].includes(type)?parseItems(list.value,type,c.items):[]};
  const active=repository,controller=saveController;save.disabled=true;const ok=await change(s=>{const i=s.cards.findIndex(x=>x.id===c.id);if(i<0)s.cards.push(updated);else s.cards[i]=updated;},'Card saved');save.disabled=false;if(repository!==active||saveController!==controller)return;
  if(ok){markFormSaved(form);editor.close();}else error.textContent=saveController?.status.message||'Could not save. Your changes are still here; try again.';
 };editor.append(form);showDialog(editor);(c.type==='single-todo'?body:title).focus();
}
function confirmDelete(c){dialogHead(settings,'Delete this card?');settings.append(el('p','hint',`“${c.title}” will be removed from ${storageMode==='database'?'your account':'this device'}.`));const actions=el('div','dialog-actions');actions.append(button('Keep card','secondary',()=>settings.close()),button('Delete card','primary',async()=>{if(await change(s=>s.cards=s.cards.filter(x=>x.id!==c.id),'Card deleted')){settings.close();editor.close();}}));settings.append(actions);showDialog(settings);}
function openAccount(){
 if(!accountInfo||!boardAuth)return;
 dialogHead(settings,'Your account');settings.append(el('p','auth-account',accountInfo.label));
 settings.append(el('p','hint','Your boards and projects are private to this account.'));
 const signOut=button('Sign out','secondary',signOutBoard);signOut.dataset.saveAllowed='true';settings.append(signOut);showDialog(settings);syncSaveUi();
}
async function signOutBoard(){
 const auth=boardAuth;if(!auth)return;
 if(hasUnsavedChanges() && !window.confirm('There are pending or unsaved changes. A pending save may still complete. Download unsaved changes before signing out. Sign out anyway?'))return;
 await auth.signOut(new URL(window.location.pathname,window.location.origin).href);
}
function nameDialog(title,onSave,value=''){dialogHead(settings,title);const form=el('form');const input=field(form,'Name','name',value);input.required=true;input.maxLength=100;const error=el('p','error project-save-error');error.setAttribute('role','alert');form.append(error);const actions=el('div','dialog-actions');const save=el('button','primary','Save');save.type='submit';actions.append(save);form.append(actions);form.onsubmit=async e=>{e.preventDefault();if(!input.value.trim())return;const active=repository,controller=saveController;save.disabled=true;const ok=await onSave(input.value.trim());save.disabled=false;if(repository!==active||saveController!==controller)return;if(ok){markFormSaved(form);settings.close();}};settings.append(form);showDialog(settings);input.focus();}
function openSettings(mode='options'){
 dialogHead(settings,mode==='boards'?'Your boards':mode==='about'?'A little space for everything':state.boards.find(b=>b.id===boardId).name);
 const menu=(label,fn,value)=>{const b=button(label,'menu-row',fn);if(value)b.append(el('span','hint',value));settings.append(b);};
 if(mode==='about'){settings.append(el('p','hint','Cardboard is your standalone local board. Your cards stay in this browser on this device. Export a backup to keep a portable copy. Sample cards are here to help you get started.'),el('p','hint','Built with a separate storage layer, ready for a future database and API. No account or connection to PAPEPPE is required.'));}
 else if(mode==='boards'){
  state.boards.forEach(b=>menu(b.name,()=>{boardId=b.id;resetFilters();render();settings.close();},b.id===boardId?'Selected':''));
  menu('＋ New board',()=>{settings.close();nameDialog('New board',name=>{const id=crypto.randomUUID();return change(s=>s.boards.push({id,name}),'Board created',()=>{boardId=id;resetFilters();});});});
 }else{
  const wrap=el('div');const select=field(wrap,'Sort cards','sort',sort,'select',[['manual','Manual'],['title','Title'],['date','Date']]);select.onchange=()=>{sort=select.value;render();};settings.append(wrap);
  menu('Rename board',()=>{settings.close();nameDialog('Rename board',name=>change(s=>s.boards.find(b=>b.id===boardId).name=name,'Board renamed'),state.boards.find(b=>b.id===boardId).name);});
  menu('New card',()=>{settings.close();openEditor();});
 }
 settings.append(el('p','menu-label','YOUR DATA'));menu('Export all boards',async()=>{const active=repository;try{const json=await active.exportJSON();if(repository!==active)return;const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=el('a');a.href=url;a.download=`cardboard-${dateKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup exported');}catch(e){if(repository===active)showError(e);}});menu('Import a backup',()=>{settings.close();document.querySelector('#import-file').click();});settings.append(el('p','hint',`Import replaces all boards ${storageMode==='database'?'in this account':'in this browser'}. You can export your current boards first.`));showDialog(settings);
}
document.querySelector('#import-file').onchange=async e=>{
 const active=repository,file=e.target.files[0];e.target.value='';if(!file||!active)return;
 if(file.size>5_000_000){toast('Choose a backup smaller than 5 MB.',true);return;}
 try{
  const text=await file.text();if(repository!==active)return;
  const parsed=validateState(migrateProjects(JSON.parse(text)));
  dialogHead(settings,'Replace your boards?');
  const destination=storageMode==='database'?`in account ${accountInfo.label}`:'in this browser';
  settings.append(el('p','hint',`Import ${parsed.cards.length} cards from “${file.name}”? This replaces all boards ${destination}.`));
  const actions=el('div','dialog-actions');
  actions.append(button('Cancel','secondary',()=>settings.close()),button('Import backup','primary',async()=>{
   if(repository!==active)return;
   if(await persistSnapshot(parsed,'Backup imported',()=>{boardId=state.boards[0].id;resetFilters();}))settings.close();
  }));settings.append(actions);showDialog(settings);
 }catch(err){if(repository===active)toast(`Could not import: ${err.message}`,true);}
};
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(state)render();},150);});
document.addEventListener('keydown',e=>{if(!state)return;if(e.key==='Escape'&&showSearch&&!editor.open&&!settings.open){showSearch=false;query='';render();}if((e.ctrlKey||e.metaKey)&&e.key==='k'&&!editor.open&&!settings.open){e.preventDefault();showSearch=true;render();document.querySelector('#search')?.focus();}});
function clearPrivateState(){
 saveController?.dispose();saveController=null;dirtyForms.clear();
 endDrag();sort='manual';
 repository=undefined;state=undefined;boardId=undefined;accountInfo=null;busy=false;dragId=null;
 resetFilters();showSearch=false;clearTimeout(toastTimer);
 document.querySelector('#toast').textContent='';document.querySelector('#toast').className='';
 for(const dialog of [editor,settings,quickActions]){if(dialog.open)dialog.close();}
 editor.replaceChildren();settings.replaceChildren();document.querySelector('#import-file').value='';
 syncSaveUi();
}
let unmountAuth,startupAttempt=0;
async function startLocalBoard(attempt){
 const {repository:current,snapshot:loaded}=await loadLocalBoard(window.localStorage,createSeed());
 if(attempt!==startupAttempt)return;
 repository=current;state=loaded;boardId=state.boards[0].id;initializeSaveController();render();
}
function stopDatabaseSession(){workspaceSession?.dispose();workspaceSession=null;boardAuth=null;}
function showWorkspaceStatus(event){
 clearPrivateState();
 if(event.status==='ready'){
  repository=event.repository;state=event.snapshot;accountInfo=event.account;boardId=state.boards[0].id;initializeSaveController();render();return;
 }
 if(event.status==='auth')return;
 const panel=el('main','auth-preview');panel.append(el('h1','','Cardboard'));
 const status=el('p','',event.status==='loading'?'Loading your workspace…':event.message);status.setAttribute('role','status');panel.append(status);
 panel.append(el('p','auth-account',`Signed in as ${event.account.label}`));
 if(event.status==='error')panel.append(button('Retry','primary',()=>workspaceSession?.retry()));
 panel.append(button('Sign out','secondary',signOutBoard));app.replaceChildren(panel);
}
async function start(){
 const attempt=++startupAttempt;
 unmountAuth?.();unmountAuth=null;stopDatabaseSession();clearPrivateState();sort='manual';app.replaceChildren(el('p','fatal','Loading Cardboard…'));
 try{
  await startBoard({startLocal:()=>{if(attempt===startupAttempt){storageMode='local';return startLocalBoard(attempt);}},startDatabase:()=>{
   if(attempt!==startupAttempt)return;storageMode='database';
   unmountAuth=mountAuthScreen(app,{
    onSessionChange:account=>{if(account.status!=='verified'){stopDatabaseSession();clearPrivateState();}},
    onVerified:auth=>{boardAuth=auth;workspaceSession??=createWorkspaceSession({auth,onChange:showWorkspaceStatus});},
   });
  }});
 }catch{
  if(attempt!==startupAttempt)return;
  clearPrivateState();const fatal=el('div','fatal');
  fatal.append(el('h1','','Your board needs attention'),el('p','error','Cardboard could not load its configuration or saved board.'),el('p','hint','Check your connection and server configuration. Existing saved data has not been replaced.'),button('Retry','primary',start));
  app.replaceChildren(fatal);
 }
}
window.addEventListener('pagehide',()=>{startupAttempt++;unmountAuth?.();unmountAuth=null;stopDatabaseSession();clearPrivateState();});
window.addEventListener('pageshow',event=>{if(event.persisted)void start();});
start();
