import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteProject,matchesProject,nextProjectColor,setProjectName,validateState} from '../src/model.js';
import {LocalBoardRepository} from '../src/storage.js';

function legacyBoard() {
  const card = {title:'Card',body:'',date:'',pinned:false,items:[],type:'note'};
  return {
    version:1,
    boards:[{id:'a',name:'First',layouts:{1:[['one']]}},{id:'b',name:'Second'}],
    projects:[{id:'p',name:' Garden ',boardId:'a'},{id:'q',name:'garden',boardId:'b'}],
    cards:[
      {...card,id:'one',boardId:'a',projectId:'p'},
      {...card,id:'two',boardId:'b',projectId:'q'},
      {...card,id:'todo',boardId:'b',projectId:'q',type:'single-todo'},
    ],
  };
}

function repository(seed) {
  let raw = null;
  return new LocalBoardRepository({
    getItem:()=>raw,
    setItem:(_,value)=>{ raw = value; }
  },seed);
}

test('legacy migration preserves layouts and IDs, resolves name conflicts, and unassigns To-dos',async()=>{
  const legacy = legacyBoard();
  const repo = repository(legacy);
  const migrated = await repo.importJSON(JSON.stringify(legacy));
  assert.deepEqual(migrated.boards,legacy.boards);
  assert.deepEqual(migrated.projects.map(project=>[project.id,project.name]),[['p','Garden'],['q','garden (2)']]);
  assert.equal(new Set(migrated.projects.map(project=>project.color)).size,2);
  assert.ok(migrated.projects.every(project=>!Object.hasOwn(project,'boardId')));
  assert.deepEqual(migrated.cards.map(card=>card.projectId),['p','q',null]);
  assert.deepEqual(await repo.load(),migrated);
  assert.deepEqual(JSON.parse(await repo.exportJSON()),migrated);
});

test('a shared project can be renamed and deleted across boards without removing cards',async()=>{
  const repo = repository(legacyBoard());
  const state = await repo.load();
  state.cards[1].projectId = 'p';
  assert.throws(()=>setProjectName(state.projects,' GARDEN ', 'q'),/already exists/);
  const color = state.projects[0].color;
  state.projects[0].name = setProjectName(state.projects,' Studio ','p');
  await repo.save(state);
  assert.equal((await repo.load()).projects[0].color,color);
  assert.deepEqual((await repo.load()).cards.slice(0,2).map(card=>card.projectId),['p','p']);
  deleteProject(state,'p');
  await repo.save(state);
  assert.equal((await repo.load()).cards.length,3);
  assert.ok((await repo.load()).cards.every(card=>card.projectId===null));
});

test('project selection distinguishes All, union, No project, and empty selection',()=>{
  const cards = [{projectId:'p'},{projectId:'q'},{projectId:null}];
  const count = selection=>cards.filter(card=>matchesProject(card,selection)).length;
  assert.equal(count(null),3);
  assert.equal(count(new Set(['p','q'])),2);
  assert.equal(count(new Set([null])),1);
  assert.equal(count(new Set()),0);
});

test('new colors stay unique beyond the initial palette and To-do assignments are invalid',async()=>{
  const state = await repository(legacyBoard()).load();
  for (let index=0; index<20; index++) {
    state.projects.push({id:`new-${index}`,name:`Project ${index}`,color:nextProjectColor(state.projects)});
  }
  assert.doesNotThrow(()=>validateState(state));
  state.cards[2].projectId = 'p';
  assert.throws(()=>validateState(state));
});
