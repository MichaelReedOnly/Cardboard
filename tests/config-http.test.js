import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

async function startServer(t,settings={}) {
  // No .env or real credentials are loaded in these child processes.
  const child=spawn(process.execPath,['server.js'],{
    cwd:fileURLToPath(new URL('../',import.meta.url)),
    env:{...process.env,PORT:'0',CARDBOARD_STORAGE:'local',CARDBOARD_ORIGIN:'http://127.0.0.1:4318',
      CLERK_PUBLISHABLE_KEY:'',CLERK_SECRET_KEY:'',...settings},
    stdio:['ignore','pipe','pipe'],
  });
  t.after(async()=>{
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited=once(child,'exit');
    child.kill();
    await exited;
  });
  return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Test server did not start')),10_000);
    let output='';
    child.stdout.on('data',chunk=>{
      output+=chunk;
      const match=/Cardboard running at http:\/\/localhost:(\d+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
    child.stderr.resume();
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',()=>{clearTimeout(timer);reject(new Error('Test server exited before startup'));});
  });
}

test('local mode serves the existing board and only safe public configuration',async t=>{
  const base=await startServer(t);
  assert.equal((await fetch(base+'/')).status,200);
  const response=await fetch(base+'/api/config');
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{storageMode:'local',boardReady:true});
  const preview=await (await fetch(base+'/api/clerk-preview-config')).json();
  assert.equal(preview.configured,false);
  assert.match(preview.error,/keys are required/);
  const method=await fetch(base+'/api/config',{method:'POST'});
  assert.equal(method.status,405);
});

test('database mode serves the auth entry page with Clerk permissions and keeps APIs authenticated',async t=>{
  const publishableKey=`pk_live_${Buffer.from('clerk.example.com$').toString('base64').replace(/=+$/,'')}`;
  const base=await startServer(t,{
    CARDBOARD_STORAGE:'database',CARDBOARD_ORIGIN:'https://board.example.com',
    CLERK_PUBLISHABLE_KEY:publishableKey,CLERK_SECRET_KEY:'sk_live_fixture_not_a_real_key',
  });
  for (const path of ['/','/cards','/index.html']) {
    const response=await fetch(base+path);
    assert.equal(response.status,200);
    assert.match(await response.text(),/src="\/src\/app.js"/);
    assert.match(response.headers.get('content-security-policy'),/https:\/\/clerk.example.com/);
  }
  assert.deepEqual(await (await fetch(base+'/api/config')).json(),{storageMode:'database',boardReady:false});
  const preview=await fetch(base+'/sign-in-preview');
  assert.equal(preview.status,200);
  assert.match(preview.headers.get('content-security-policy'),/https:\/\/clerk.example.com/);
  assert.deepEqual(await (await fetch(base+'/api/clerk-preview-config')).json(),{
    publishableKey,clerkOrigin:'https://clerk.example.com',
  });
  assert.equal((await fetch(base+'/api/me')).status,401);
  assert.equal((await fetch(base+'/api/workspace')).status,401);
  assert.equal((await fetch(base+'/.env')).status,404);
});
