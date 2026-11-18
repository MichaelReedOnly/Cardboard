import {SessionError} from './auth.js';
import {InvalidWorkspaceError,loadWorkspace,saveWorkspace,validateWorkspaceSave,WorkspaceInputError,WorkspaceConflictError} from './workspaces.js';

class BodyError extends Error {
  constructor(status,message) { super(message); this.status=status; }
}

async function readSave(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new BodyError(415,'Use application/json.');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 5_000_000) throw new BodyError(413,'Workspace request exceeds 5 MB.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BodyError(400,'Invalid JSON.');
  }
}

export function createWorkspaceHandler(requireUserId,getPool) {
  return async function handleWorkspace(req,res) {
    function respond(status,body) {
      res.writeHead(status,{
        'Content-Type':'application/json; charset=utf-8',
        'Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff',
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
      const workspace = req.method === 'PUT'
        ? await saveWorkspace(getPool(),userId,input)
        : await loadWorkspace(getPool(),userId);
      return respond(200,workspace);
    } catch (error) {
      if (error instanceof BodyError) return respond(error.status,{error:error.message});
      if (error instanceof WorkspaceInputError) return respond(400,{error:error.message});
      if (error instanceof WorkspaceConflictError) return respond(409,{error:error.message});
      if (error instanceof InvalidWorkspaceError) return respond(500,{error:error.message});
      return respond(503,{error:'Workspace database is unavailable'});
    }
  };
}
