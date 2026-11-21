import test from 'node:test';
import assert from 'node:assert/strict';
import {createPomodoroStore, getTimerDisplay, transitionTimer} from '../src/pomodoro.js';

test('a timer test runs for five seconds and finishes without offering a break', () => {
  const session = transitionTimer(null, {type:'start-test'}, 1000);
  assert.equal(session.phase, 'test');
  assert.equal(session.endsAt, 6000);
  assert.equal(getTimerDisplay(session, 5999).remainingMs, 1);
  const complete = transitionTimer(session, {type:'tick'}, 6000);
  assert.equal(complete.status, 'complete');
  assert.equal(transitionTimer(complete, {type:'start-break', minutes:5}, 6000), complete);
  assert.equal(transitionTimer(complete, {type:'reset'}, 6000), null);
});

test('focus uses a deadline and stays paused until explicitly resumed', () => {
  const running = transitionTimer(null, {type:'start-focus', minutes:5}, 0);
  assert.equal(running.endsAt, 300000);
  const paused = transitionTimer(running, {type:'pause'}, 60000);
  assert.equal(getTimerDisplay(paused, 1000000).remainingMs, 240000);
  const resumed = transitionTimer(paused, {type:'resume'}, 1000000);
  assert.equal(resumed.endsAt, 1240000);
  const complete = transitionTimer(resumed, {type:'pause'}, 1240000);
  assert.equal(complete.status, 'complete');
  assert.equal(getTimerDisplay(complete, 1240001).remainingMs, 0);
  assert.equal(transitionTimer(complete, {type:'tick'}, 1240001), complete);
});

test('completed focus waits for either break length or skip', () => {
  const focus = transitionTimer(null, {type:'start-focus', minutes:25}, 0);
  const complete = transitionTimer(focus, {type:'tick'}, 1500000);
  for (const minutes of [5, 10]) {
    const rest = transitionTimer(complete, {type:'start-break', minutes}, 1500001);
    assert.equal(rest.phase, 'break');
    assert.equal(rest.endsAt, 1500001 + minutes * 60000);
    assert.equal(transitionTimer(rest, {type:'tick'}, rest.endsAt).status, 'complete');
    assert.equal(transitionTimer(rest, {type:'reset'}, 1500002), null);
  }
  assert.equal(transitionTimer(complete, {type:'skip-break'}, 1500001), null);
});

test('storage restores states, isolates owners, and supports cleanup', () => {
  const records = new Map();
  const storage = {
    getItem:key => records.get(key),
    setItem:(key, value) => records.set(key, value),
    removeItem:key => records.delete(key),
    key:index => [...records.keys()][index],
    get length() {return records.size;},
  };
  const first = createPomodoroStore(storage, 'first');
  const second = createPomodoroStore(storage, 'second');
  const running = transitionTimer(null, {type:'start-focus', minutes:5}, 0);
  const paused = transitionTimer(running, {type:'pause'}, 60000);
  const complete = transitionTimer(running, {type:'tick'}, 300000);
  first.write('card', running);
  first.write('other', paused);
  second.write('card', complete);
  assert.deepEqual(createPomodoroStore(storage, 'first').read('card'), running);
  assert.deepEqual(createPomodoroStore(storage, 'first').read('other'), paused);
  assert.deepEqual(createPomodoroStore(storage, 'second').read('card'), complete);
  first.remove('other');
  assert.equal(createPomodoroStore(storage, 'first').read('other'), null);
  createPomodoroStore(storage, 'first').clear();
  assert.equal(createPomodoroStore(storage, 'first').read('card'), null);
  assert.deepEqual(second.read('card'), complete);
});

test('blocked or malformed browser storage leaves a usable in-memory timer', () => {
  for (const getItem of [() => '{', () => {throw Error('blocked');}]) {
    const store = createPomodoroStore({getItem, setItem() {throw Error('blocked');}}, 'local');
    assert.equal(store.read('card'), null);
    const running = transitionTimer(null, {type:'start-focus', minutes:5}, 0);
    store.write('card', running);
    assert.deepEqual(store.read('card'), running);
    store.remove('card');
    assert.equal(store.read('card'), null);
  }
});
