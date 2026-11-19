import {SessionError} from './auth.js';
import {randomUUID} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {InvalidWorkspaceError,loadWorkspace,saveWorkspace,validateWorkspaceSave,WorkspaceInputError,WorkspaceConflictError,WorkspaceDatabaseError} from './workspaces.js';

const MAX_BODY_BYTES = 5_000_000;
const BODY_TIMEOUT_MS = 15_000;

class BodyError extends Error {
  constructor(status,message) { super(message); this.status=status; }
}

async function readSave(req) {
  const contentType = req.headers['content-type'];
  if (typeof contentType !== 'string' || !/^application\/json\s*(?:;\s*charset\s*=\s*(?:"utf-8"|utf-8)\s*)?$/i.test(contentType)) {
    throw new BodyError(415,'Use application/json.');
  }
  const encoding = req.headers['content-encoding'];
  if (encoding && encoding !== 'identity') throw new BodyError(415,'Compressed request bodies are not supported.');
  const declared = req.headers['content-length'];
  if (declared !== undefined && (typeof declared !== 'string' || !/^[0-9]+$/.test(declared))) {
    throw new BodyError(400,'Invalid content length.');
  }
  if (declared !== undefined && BigInt(declared) > BigInt(MAX_BODY_BYTES)) {
    throw new BodyError(413,'Workspace request exceeds 5 MB.');
  }
  const buffer = await new Promise((resolve,reject)=>{
    const chunks = [];
    let size = 0;
    const timer = setTimeout(()=>finish(new BodyError(408,'Workspace upload timed out.')),BODY_TIMEOUT_MS);
    function cleanup() {
      clearTimeout(timer);
      req.off('data',onData);
      req.off('end',onEnd);
      req.off('aborted',onAborted);
      req.off('error',onError);
    }
    function finish(error) {
      cleanup();
      if (error) {
        // Node may emit an error after an aborted event. Keep it handled.
        req.once('error',()=>{});
        req.resume();
        reject(error);
      } else {
        resolve(Buffer.concat(chunks,size));
      }
    }
    function onData(chunk) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) return finish(new BodyError(413,'Workspace request exceeds 5 MB.'));
      chunks.push(chunk);
    }
    function onEnd() {
      finish(declared !== undefined && BigInt(declared) !== BigInt(size)
        ? new BodyError(400,'Incomplete workspace upload.') : null);
    }
    function onAborted() { finish(new BodyError(400,'Workspace upload was interrupted.')); }
    function onError() { finish(new BodyError(400,'Workspace upload could not be read.')); }
    req.on('data',onData);
    req.once('end',onEnd);
    req.once('aborted',onAborted);
    req.once('error',onError);
    if (req.aborted || req.destroyed) finish(new BodyError(400,'Workspace upload was interrupted.'));
  });
  try {
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
  } catch {
    throw new BodyError(400,'Invalid JSON.');
  }
}

export function createWorkspaceHandler(requireUserId,getPool,log = entry=>console.info(JSON.stringify(entry))) {
  return async function handleWorkspace(req,res) {
    const requestId = randomUUID();
    function respond(status,body,errorCode) {
      const entry = {requestId,route:'/api/workspace',method:['GET','PUT'].includes(req.method)?req.method:'OTHER',status};
      if (errorCode) entry.databaseCode=errorCode;
      try { log(entry); } catch {}
      if (res.destroyed || res.writableEnded) return;
      if (!req.complete && req.method === 'PUT') {
        req.once('error',()=>{});
        req.resume();
        if (status === 408) res.setHeader('Connection','close');
      }
      res.writeHead(status,{
        'Content-Type':'application/json; charset=utf-8',
        'Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff',
        'X-Request-ID':requestId,
      });
      res.end(JSON.stringify(body));
    }
    if (!['GET','PUT'].includes(req.method)) {
      res.setHeader('Allow','GET, PUT');
      return respond(405,{error:'Method not allowed'});
    }
    let userId;
    try {
      userId = await requireUserId(req);
    } catch (error) {
      if (error instanceof SessionError) return respond(error.status,{error:error.message});
      return respond(500,{error:'Session verification failed'});
    }
    try {
      let input;
      if (req.method === 'PUT') {
        input = validateWorkspaceSave(await readSave(req));
      }
      let pool;
      try { pool = getPool(); } catch (error) { throw new WorkspaceDatabaseError(error); }
      const workspace = req.method === 'PUT'
        ? await saveWorkspace(pool,userId,input)
        : await loadWorkspace(pool,userId);
      return respond(200,workspace);
    } catch (error) {
      if (error instanceof BodyError) return respond(error.status,{error:error.message});
      if (error instanceof WorkspaceInputError) return respond(400,{error:error.message});
      if (error instanceof WorkspaceConflictError) return respond(409,{error:error.message});
      if (error instanceof InvalidWorkspaceError) return respond(500,{error:error.message});
      if (error instanceof WorkspaceDatabaseError) return respond(503,{error:error.message},error.code);
      return respond(500,{error:'Workspace request failed'});
    }
  };
}
