import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createClerkClient} from '@clerk/backend';
const root=process.cwd(),port=Number(process.env.PORT||4318);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
const publishableKey = process.env.CLERK_PUBLISHABLE_KEY?.trim() ?? '';
const keyPayload = /^pk_test_([A-Za-z0-9+/_=-]+)$/.exec(publishableKey)?.[1];
const keyDomain = keyPayload ? Buffer.from(keyPayload,'base64').toString('utf8') : '';
const clerkOrigin = /^(?:[a-z0-9-]+\.)+[a-z0-9-]+\$$/i.test(keyDomain)
  ? `https://${keyDomain.slice(0,-1)}` : null;
const secretKey = process.env.CLERK_SECRET_KEY?.trim() ?? '';
const origin = process.env.CARDBOARD_ORIGIN?.trim() || `http://127.0.0.1:${port}`;
let validOrigin = false;
try {
  const parsed = new URL(origin);
  validOrigin = parsed.origin === origin && ['http:','https:'].includes(parsed.protocol);
} catch {}
const clerkClient = clerkOrigin && validOrigin && /^sk_test_\S+$/.test(secretKey)
  ? createClerkClient({publishableKey,secretKey}) : null;

function json(res,status,body) {
  res.writeHead(status,{'Content-Type':types['.json'],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(body));
}

async function verifySession(req,res) {
  const authorization = req.headers.authorization;
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) {
    return json(res,401,{error:'Sign-in required'});
  }
  if (!clerkClient) return json(res,503,{error:'Clerk server verification is not configured'});
  try {
    const request = new Request(new URL('/api/me',origin),{headers:{authorization}});
    const session = await clerkClient.authenticateRequest(request,{
      authorizedParties:[origin],acceptsToken:'session_token',
    });
    const userId = session.isAuthenticated ? session.toAuth().userId : null;
    return userId ? json(res,200,{userId}) : json(res,401,{error:'Invalid or expired session'});
  } catch {
    return json(res,503,{error:'Clerk session verification is unavailable'});
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
  if (file==='/api/me') {
   if (req.method==='GET') return await verifySession(req,res);
   res.setHeader('Allow','GET');
   return json(res,405,{error:'Method not allowed'});
  }
  if (file==='/api/clerk-preview-config' && req.method==='GET') {
   return json(res,200,clerkOrigin ? {publishableKey,clerkOrigin} : {configured:false});
  }
  const isPreview = file==='/sign-in-preview';
  if (isPreview) file='/sign-in-preview.html';
  if(file==='/'||file==='/cards')file='/index.html';
  if(!(isPreview||file==='/index.html'||/^\/src\/[\w.-]+\.(js|css)$/.test(file))){res.writeHead(404);res.end('Not found');return;}
  const data=await readFile(path.join(root,file));
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':isPreview?previewPolicy:appPolicy});res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Cardboard running at http://localhost:${port}`));
