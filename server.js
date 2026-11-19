import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createClerkClient} from '@clerk/backend';
import {createSessionVerifier, SessionError} from './backend/auth.js';
import {createDatabasePool} from './backend/database.js';
import {createWorkspaceHandler} from './backend/workspace-route.js';
import {readServerConfig,getPublicConfig} from './backend/config.js';
const root=process.cwd(),port=Number(process.env.PORT||4318);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
const config = readServerConfig(process.env);
const {publishableKey,secretKey,origin,clerkOrigin} = config;
if (config.authError) console.warn(`Cardboard authentication unavailable: ${config.authError}`);
const clerkClient = config.authConfigured
  ? createClerkClient({publishableKey,secretKey}) : null;
const requireUserId = createSessionVerifier(clerkClient,origin);
let databasePool;
const handleWorkspace = createWorkspaceHandler(requireUserId,()=>{
  databasePool ??= createDatabasePool();
  return databasePool;
});

function json(res,status,body) {
  res.writeHead(status,{'Content-Type':types['.json'],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(body));
}

async function verifySession(req,res) {
  try {
    const userId = await requireUserId(req);
    return json(res,200,{userId});
  } catch (error) {
    if (error instanceof SessionError) return json(res,error.status,{error:error.message});
    return json(res,500,{error:'Session verification failed'});
  }
}
const appPolicy = "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: https: http:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const previewPolicy = clerkOrigin
  ? appPolicy.replace("script-src 'self'",`script-src 'self' ${clerkOrigin}`)
    .replace("connect-src 'self'",`connect-src 'self' ${clerkOrigin}; frame-src ${clerkOrigin}`)
  : appPolicy;
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');let file=decodeURIComponent(url.pathname);
  if (file==='/api/workspace') return await handleWorkspace(req,res);
  if (file==='/api/me') {
   if (req.method==='GET') return await verifySession(req,res);
   res.setHeader('Allow','GET');
   return json(res,405,{error:'Method not allowed'});
  }
  if (file==='/api/clerk-preview-config' && req.method==='GET') {
   return json(res,200,clerkOrigin ? {publishableKey,clerkOrigin} : {configured:false,error:config.authError});
  }
  if (file==='/api/config') {
   if (req.method==='GET') return json(res,200,getPublicConfig(config));
   res.setHeader('Allow','GET');
   return json(res,405,{error:'Method not allowed'});
  }
  const isPreview = file==='/sign-in-preview';
  if (isPreview) file='/sign-in-preview.html';
  if(file==='/'||file==='/cards')file='/index.html';
  if(!(isPreview||file==='/index.html'||/^\/src\/[\w.-]+\.(js|css)$/.test(file))){res.writeHead(404);res.end('Not found');return;}
  const data=await readFile(path.join(root,file));
  const usesAuthentication=isPreview || (config.storageMode==='database' && file==='/index.html');
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':usesAuthentication?previewPolicy:appPolicy});res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',function(){console.log(`Cardboard running at http://localhost:${this.address().port}`);});
