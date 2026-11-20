import test from 'node:test';
import assert from 'node:assert/strict';
import {readServerConfig,getPublicConfig} from '../backend/config.js';

const keys = (mode='test') => ({
  CLERK_PUBLISHABLE_KEY:`pk_${mode}_${Buffer.from('clerk.example.com$').toString('base64').replace(/=+$/,'')}`,
  CLERK_SECRET_KEY:`sk_${mode}_fixture_not_a_real_key`,
  CARDBOARD_ORIGIN:mode==='live' ? 'https://board.example.com' : 'http://127.0.0.1:4318',
});

test('local mode remains usable without Clerk; public settings contain no credentials',()=>{
  const config=readServerConfig({});
  assert.equal(config.storageMode,'local');
  assert.equal(config.authConfigured,false);
  assert.deepEqual(getPublicConfig(config),{storageMode:'local',boardReady:true});
});

test('matching development and production keys configure authentication',()=>{
  for (const mode of ['test','live']) {
    const config=readServerConfig(keys(mode));
    assert.equal(config.authConfigured,true);
    assert.equal(config.clerkOrigin,'https://clerk.example.com');
    assert.equal(config.authError,null);
    assert.doesNotMatch(JSON.stringify(getPublicConfig(config)),/fixture|sk_|pk_/);
  }
});

test('mismatched, missing and malformed keys never configure authentication',()=>{
  for (const settings of [
    {...keys(),CLERK_SECRET_KEY:'sk_live_fixture'},
    {...keys(),CLERK_SECRET_KEY:''},
    {...keys(),CLERK_PUBLISHABLE_KEY:'pk_test_!!!!'},
    {...keys(),CLERK_PUBLISHABLE_KEY:`pk_test_${Buffer.from('https://evil.example/$').toString('base64')}`},
  ]) {
    const config=readServerConfig(settings);
    assert.equal(config.authConfigured,false);
    assert.ok(config.authError);
    assert.doesNotMatch(config.authError,/fixture|sk_|!!!!/);
  }
});

test('production requires an explicit HTTPS origin; origins cannot contain paths or credentials',()=>{
  for (const origin of ['', 'http://board.example.com','https://board.example.com/path','https://name:pass@board.example.com']) {
    const config=readServerConfig({...keys('live'),CARDBOARD_ORIGIN:origin});
    assert.equal(config.authConfigured,false);
  }
});

test('storage selection is explicit and configured database mode has a board entry flow',()=>{
  const config=readServerConfig({...keys('live'),CARDBOARD_STORAGE:'database'});
  assert.deepEqual(getPublicConfig(config),{storageMode:'database',boardReady:true});
  assert.throws(()=>readServerConfig({CARDBOARD_STORAGE:'databse'}),/CARDBOARD_STORAGE/);
  assert.throws(()=>readServerConfig({CARDBOARD_STORAGE:''}),/CARDBOARD_STORAGE/);
  assert.throws(()=>readServerConfig({CARDBOARD_STORAGE:'database'}),/Database mode requires/);
});
