import http from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { randomBytes, randomUUID, createHash } from 'node:crypto';

const root=fileURLToPath(new URL('.',import.meta.url));
const port=Number(process.env.PORT||3000);
const dataFile=join(root,'runtime-data.json');
const uploadDir=join(root,'uploads');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};

let embeddedIndex=null;
try{const packed=(await readFile(join(root,'index.html.br.b64'),'utf8')).trim();embeddedIndex=brotliDecompressSync(Buffer.from(packed,'base64'));}catch(e){console.error('Failed to load website source:',e.message)}

const defaultData={
 config:{rate:112.40,network:'TRC20',minInr:1000,bank:{bank:'HDFC Bank',accountName:'LOKTRON SERVICES',accountNumber:'XXXX XXXX 4582',ifsc:'HDFC0001234',transferTypes:'IMPS / NEFT / RTGS'}},
 users:[{id:'usr_demo',email:'demo@loktron.com',passwordHash:hash('12345678'),name:'Demo User',mobile:'+91 98765 43210',currency:'INR',wallet:'',createdAt:Date.now()}],
 orders:[],tickets:[],notifications:[{id:'n1',userId:'usr_demo',title:'Welcome to LOKTRON',text:'Save your USDT wallet address before creating your first Buy order.',time:'Today'}]
};
let db=await loadDb();
const sessions=new Map();
function hash(v){return createHash('sha256').update(String(v)).digest('hex')}
async function loadDb(){try{return JSON.parse(await readFile(dataFile,'utf8'))}catch{return structuredClone(defaultData)}}
async function persist(){try{await writeFile(dataFile,JSON.stringify(db,null,2),'utf8')}catch(e){console.error('persist failed',e.message)}}
function send(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data))}
async function body(req,limit=4*1024*1024){const chunks=[];let n=0;for await(const c of req){n+=c.length;if(n>limit)throw Object.assign(new Error('Payload too large'),{status:413});chunks.push(c)}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('Invalid JSON'),{status:400})}}
function bearer(req){const h=req.headers.authorization||'';return h.startsWith('Bearer ')?h.slice(7):''}
function auth(req){const token=bearer(req),uid=sessions.get(token);if(!uid)throw Object.assign(new Error('Please login again'),{status:401});const user=db.users.find(u=>u.id===uid);if(!user)throw Object.assign(new Error('User not found'),{status:401});return{token,user}}
function publicUser(u){return{id:u.id,email:u.email,name:u.name,mobile:u.mobile||'',currency:u.currency||'INR',wallet:u.wallet||'',createdAt:u.createdAt}}
function userData(u){return{user:publicUser(u),orders:db.orders.filter(o=>o.userId===u.id).sort((a,b)=>b.date-a.date),tickets:db.tickets.filter(t=>t.userId===u.id).sort((a,b)=>b.createdAt-a.createdAt),notifications:db.notifications.filter(n=>n.userId===u.id).slice(0,30)}}
function safeEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
function proofExt(type){return type==='image/png'?'.png':type==='image/webp'?'.webp':'.jpg'}

function headers(type){return{'Content-Type':type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'SAMEORIGIN','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cache-Control':type.startsWith('image/')?'public,max-age=86400':'no-cache','Content-Security-Policy':"default-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'"}}

async function api(req,res,path){
 if(req.method==='GET'&&path==='/config')return send(res,200,db.config);
 if(req.method==='POST'&&path==='/auth/login'){
  const b=await body(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');
  const u=db.users.find(x=>x.email===email&&x.passwordHash===hash(password));if(!u)return send(res,401,{error:'Invalid email or password'});
  const token=randomBytes(32).toString('hex');sessions.set(token,u.id);return send(res,200,{token,user:publicUser(u)});
 }
 if(req.method==='POST'&&path==='/auth/register'){
  const b=await body(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||''),name=String(b.name||'').trim();
  if(!safeEmail(email)||password.length<8||name.length<2)return send(res,400,{error:'Use a valid email, name and minimum 8-character password'});
  if(db.users.some(x=>x.email===email))return send(res,409,{error:'Account already exists'});
  const u={id:'usr_'+randomUUID().slice(0,8),email,passwordHash:hash(password),name,mobile:'',currency:'INR',wallet:'',createdAt:Date.now()};db.users.push(u);db.notifications.unshift({id:randomUUID(),userId:u.id,title:'Welcome to LOKTRON',text:'Save your receiving wallet before creating your first order.',time:'Just now'});await persist();const token=randomBytes(32).toString('hex');sessions.set(token,u.id);return send(res,201,{token,user:publicUser(u)});
 }
 if(req.method==='POST'&&path==='/auth/logout'){const{token}=auth(req);sessions.delete(token);return send(res,200,{ok:true})}
 if(req.method==='GET'&&path==='/me'){const{user}=auth(req);return send(res,200,userData(user))}
 if(req.method==='PATCH'&&path==='/profile'){
  const{user}=auth(req),b=await body(req);const name=String(b.name||'').trim(),mobile=String(b.mobile||'').trim(),currency=String(b.currency||'INR');if(name.length<2)return send(res,400,{error:'Enter a valid name'});user.name=name;user.mobile=mobile.slice(0,30);user.currency=['INR'].includes(currency)?currency:'INR';await persist();return send(res,200,{user:publicUser(user)})
 }
 if(req.method==='PUT'&&path==='/wallet'){
  const{user}=auth(req),b=await body(req),wallet=String(b.wallet||'').trim();if(!/^T[1-9A-HJ-NP-Za-km-z]{25,40}$/.test(wallet))return send(res,400,{error:'Invalid TRC20 address'});user.wallet=wallet;db.notifications.unshift({id:randomUUID(),userId:user.id,title:'Wallet saved',text:'Your TRC20 receiving wallet was updated.',time:'Just now'});await persist();return send(res,200,{wallet})
 }
 if(req.method==='POST'&&path==='/orders'){
  const{user}=auth(req),b=await body(req);if(!user.wallet)return send(res,400,{error:'Save your wallet before creating an order'});const inr=Number(b.inr),paid=Number(b.paid),utr=String(b.utr||'').trim(),proof=b.proof||{};if(!Number.isFinite(inr)||inr<db.config.minInr)return send(res,400,{error:`Minimum order is ₹${db.config.minInr}`});if(Math.abs(inr-paid)>1)return send(res,400,{error:'Paid amount must match order amount'});if(!/^[A-Za-z0-9-]{6,40}$/.test(utr))return send(res,400,{error:'Invalid UTR / reference'});if(db.orders.some(o=>o.utr===utr))return send(res,409,{error:'This UTR has already been submitted'});if(!/^image\/(png|jpeg|jpg|webp)$/.test(String(proof.type||''))||!proof.data)return send(res,400,{error:'Valid payment proof image is required'});
  const raw=Buffer.from(String(proof.data),'base64');if(raw.length>2.5*1024*1024)return send(res,413,{error:'Proof image must be under 2.5 MB'});await mkdir(uploadDir,{recursive:true});const id='LK-'+String(Date.now()).slice(-7),file=id+proofExt(proof.type);await writeFile(join(uploadDir,file),raw);const order={id,userId:user.id,date:Date.now(),inr,paid,rate:db.config.rate,usdt:Number((inr/db.config.rate).toFixed(6)),utr,wallet:user.wallet,status:'Under Review',proofFile:file,bankSnapshot:structuredClone(db.config.bank)};db.orders.unshift(order);db.notifications.unshift({id:randomUUID(),userId:user.id,title:'Payment submitted',text:`${id} is under review.`,time:'Just now'});await persist();console.log('ADMIN ALERT',JSON.stringify({order:id,user:user.email,inr,utr}));return send(res,201,{order})
 }
 if(req.method==='POST'&&path==='/support'){
  const{user}=auth(req),b=await body(req),text=String(b.text||'').trim(),type=String(b.type||'General support'),orderId=String(b.orderId||'').trim();if(text.length<10)return send(res,400,{error:'Please provide more detail'});if(orderId&&!db.orders.some(o=>o.id===orderId&&o.userId===user.id))return send(res,400,{error:'Order ID not found'});const t={id:'SUP-'+String(Date.now()).slice(-6),userId:user.id,type:text?type:'General support',text,orderId,status:'Open',time:'Just now',createdAt:Date.now()};db.tickets.unshift(t);db.notifications.unshift({id:randomUUID(),userId:user.id,title:'Support ticket created',text:`${t.id} has been submitted.`,time:'Just now'});await persist();return send(res,201,{ticket:t})
 }
 return send(res,404,{error:'API route not found'});
}

const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);if(url.pathname==='/health')return send(res,200,{ok:true,service:'loktron-web',api:true});if(url.pathname.startsWith('/api/'))return await api(req,res,url.pathname.slice(4));
 const pathname=decodeURIComponent(url.pathname);let rel=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');rel=normalize(rel).replace(/^(\.\.[/\\])+/, '');let file=join(root,rel);try{if(!(await stat(file)).isFile())throw 0;const data=await readFile(file);const type=types[extname(file).toLowerCase()]||'application/octet-stream';res.writeHead(200,headers(type));return res.end(data)}catch{if(!embeddedIndex)throw new Error('Website index unavailable');res.writeHead(200,headers('text/html; charset=utf-8'));return res.end(embeddedIndex)}
}catch(e){console.error(e);return send(res,e.status||500,{error:e.status?e.message:'Internal server error'})}});
server.listen(port,'0.0.0.0',()=>console.log(`LOKTRON website listening on ${port}`));
