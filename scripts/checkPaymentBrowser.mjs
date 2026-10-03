// Real built-UI smoke, disposable loopback MySQL only; no provider credentials.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { SignJWT } from 'jose';
const url = new URL(process.env.DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.startsWith('/inspectra_'))
  throw Error('An explicitly isolated loopback Inspectra database URL is required');
const database = `inspectra_browser_safety_${process.pid}`;
url.pathname = '/';
const admin = await mysql.createConnection(url.toString());
await admin.query(`CREATE DATABASE \`${database}\``);
url.pathname = `/${database}`;
const connection = await mysql.createConnection(url.toString());
const profile = await mkdtemp(join(tmpdir(), 'inspectra-browser-'));
const base = 'http://localhost:4497';
const secret = randomBytes(48).toString('hex');
let server, browser, browserOutput='', serverOutput='', debugPort;
const sockets=[];
const pause = ms => new Promise(r => setTimeout(r, ms));
async function wait(fn, label) {
  for(let i=0;i<150;i++){if(await fn())return;await pause(100)}
  throw Error(`Timed out: ${label}`);
}
class CDP {
  constructor(socket){this.socket=socket;this.id=0;this.requests=new Map();this.events=[];socket.addEventListener('message',e=>{
    const msg=JSON.parse(e.data);if(msg.id){const pending=this.requests.get(msg.id);this.requests.delete(msg.id);if(msg.error)pending.reject(Error(msg.error.message));else pending.resolve(msg.result)}
    else for(const listener of this.events)listener(msg);
  });}
  send(method,params={}){return new Promise((resolve,reject)=>{const id=++this.id;this.requests.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}))})}
  async evaluate(expression){const result=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);return result.result.value}
}
async function startBrowser(){
 browser=spawn(process.env.CHROMIUM_BIN??'/usr/bin/chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','pipe','pipe']});
 browser.stderr.on('data',c=>{browserOutput+=c});
 await wait(async()=>{try{debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);return !!debugPort}catch{return false}},'Chrome debugging');
}
async function stopBrowser(){if(browser?.exitCode==null){browser.kill('SIGTERM');await once(browser,'exit')}for(const socket of sockets)socket.close();sockets.length=0;await rm(join(profile,'DevToolsActivePort'),{force:true})}
async function page(invoice,dropResponse=false){
 const target=await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:'PUT'})).json();
 const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});sockets.push(socket);const cdp=new CDP(socket);
 let dropped=false,error;
 cdp.events.push(msg=>{if(msg.method==='Fetch.requestPaused')void(async()=>{
  const p=msg.params;
  if(!p.request.url.startsWith(base+'/'))return cdp.send('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'});
  if(p.responseStatusCode && dropResponse && !dropped && p.request.url.includes('invoice.markPaid')){
   const [rows]=await connection.query('SELECT amountPaid FROM invoices WHERE id=?',[invoice]);
   if(Number(rows[0].amountPaid)!==40)throw Error('Response interruption happened before committed payment');
   dropped=true;await cdp.send('Fetch.failRequest',{requestId:p.requestId,errorReason:'ConnectionClosed'});console.log('PASS: server committed $40 before browser response was dropped');
  }else await cdp.send('Fetch.continueRequest',{requestId:p.requestId});
 })().catch(e=>{error=e})});
 await cdp.send('Network.enable');await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Log.enable');cdp.events.push(msg=>{if(msg.method==='Log.entryAdded')console.error('Browser log:',msg.params.entry.text.slice(0,1500));if(msg.method==='Network.responseReceived' && msg.params.response.status>=400)console.error('HTTP fixture error:',msg.params.response.url,msg.params.response.status);if(msg.method==='Network.loadingFailed')console.error('Browser load failed:',msg.params.errorText)});cdp.events.push(msg=>{if(msg.method==='Runtime.exceptionThrown') console.error('Browser exception:',msg.params.exceptionDetails.exception?.description??msg.params.exceptionDetails.text)});
 const token=await new SignJWT({openId:'browser-safety',appId:'browser-safety',name:'Browser fixture',sv:1}).setProtectedHeader({alg:'HS256'}).setExpirationTime('1h').sign(new TextEncoder().encode(secret));
 await cdp.send('Network.setCookie',{name:'app_session_id',value:token,url:base,httpOnly:true,sameSite:'Lax',expires:Math.floor(Date.now()/1000)+3600});
 await cdp.send('Fetch.enable',{patterns:[{urlPattern:'http*',requestStage:'Request'},{urlPattern:'*invoice.markPaid*',requestStage:'Response'}]});
 await cdp.send('Page.navigate',{url:`${base}/admin/invoices/${invoice}`});
 try {await wait(()=>cdp.evaluate(`(document.body?.innerText??'').includes('BROWSER-${invoice}')`),'invoice UI')} catch(error) {console.error('Fixture browser URL:',await cdp.evaluate('location.href'));console.error('Fixture UI:',await cdp.evaluate("(document.body?.innerText??'').slice(0,2200)"));console.error('Fixture DOM:',await cdp.evaluate("document.documentElement.outerHTML.slice(-1800)"));throw error}
 return {cdp,dropped:()=>dropped,error:()=>error};
}
async function click(cdp,label,dialog=false){await wait(()=>cdp.evaluate(`!!Array.from(${dialog?"document.querySelector('[role=dialog]')?.querySelectorAll('button')??[]":"document.querySelectorAll('button')"}).find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`),label);await cdp.evaluate(`Array.from(${dialog?"document.querySelector('[role=dialog]').querySelectorAll('button')":"document.querySelectorAll('button')"}).find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled).click()`)}
async function amount(cdp,value){await cdp.evaluate(`(()=>{const input=document.querySelector('[role=dialog] input[type=number]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(value))});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(100)}
async function totals(invoice,paid,count){const [rows]=await connection.query('SELECT amountPaid,balanceDue,(SELECT COUNT(*) FROM invoice_payments WHERE invoiceId=?) receipts FROM invoices WHERE id=?',[invoice,invoice]);if(Number(rows[0].amountPaid)!==paid||Number(rows[0].balanceDue)!==100-paid||Number(rows[0].receipts)!==count)throw Error(`Bad payment state: ${JSON.stringify(rows[0])}`)}
try {
 await migrate(drizzle(connection),{migrationsFolder:'drizzle'});
 await connection.query("INSERT INTO companies(id,name) VALUES(1,'Browser safety')");
 await connection.query("INSERT INTO customer_orgs(id,companyId,name) VALUES(1,1,'Browser org')");
 await connection.query("INSERT INTO sites(id,companyId,customerOrgId,name) VALUES(1,1,1,'Browser site')");
 await connection.query("INSERT INTO users(id,openId,name,email,role,companyId,isActive) VALUES(1,'browser-safety','Browser fixture','fixture@example.test','office',1,1)");
 for(const id of [1,2]){await connection.query("INSERT INTO invoices(id,companyId,customerOrgId,siteId,invoiceNumber,status,total,amountPaid,balanceDue) VALUES(?,1,1,1,?,'draft',100,0,100)",[id,`BROWSER-${id}`]);await connection.query("INSERT INTO invoice_line_items(invoiceId,description,quantity,unitPrice,total,taxable) VALUES(?,'Fixture service',1,100,100,false)",[id]);}
 server=spawn(process.execPath,['dist/index.js'],{env:{PATH:process.env.PATH,NODE_ENV:'production',PORT:'4497',APP_URL:base,DATABASE_URL:url.toString(),JWT_SECRET:secret,VITE_APP_ID:'browser-safety',EMAIL_AUTOMATION_ENABLED:'false'},stdio:['ignore','pipe','pipe']});server.stdout.on('data',c=>{serverOutput+=c});server.stderr.on('data',c=>{serverOutput+=c});
 await wait(async()=>{try{return(await fetch(base+'/health')).ok}catch{return false}},'built server');
 const assetHtml=await (await fetch(base+'/')).text(); const match=assetHtml.match(/src="(\/assets\/[^"]+)"/);if(match){const asset=await fetch(base+match[1]);console.log('Built module fetch:',asset.status,asset.headers.get('content-type'));if(!asset.ok)console.log('Asset failure:',await asset.text());}
 await startBrowser();
 const first=await page(1,true);await click(first.cdp,'Record Payment');await amount(first.cdp,40);await click(first.cdp,'Record Payment',true);await wait(first.dropped,'lost response');
 await wait(()=>first.cdp.evaluate("(document.body?.innerText??'').includes('Payment outcome uncertain')"),'uncertain outcome');await totals(1,40,1);
 await first.cdp.send('Page.reload');await wait(()=>first.cdp.evaluate("(document.body?.innerText??'').includes('BROWSER-1')"),'refresh');await click(first.cdp,'Record Payment');
 await wait(()=>first.cdp.evaluate("(document.body?.innerText??'').includes('Previous payment confirmed')"),'refresh reconciliation');await totals(1,40,1);console.log('PASS: refresh recovered committed partial payment without another receipt');
 await stopBrowser();await startBrowser();const reopened=await page(1);await click(reopened.cdp,'Record Payment');await wait(()=>reopened.cdp.evaluate("(document.body?.innerText??'').includes('Previous payment confirmed')"),'browser restart reconciliation');await totals(1,40,1);console.log('PASS: browser restart retained operation and reconciled the same receipt');
 await click(reopened.cdp,'Start another payment',true);await amount(reopened.cdp,60);await click(reopened.cdp,'Record Payment',true);await wait(async()=>{const [r]=await connection.query('SELECT amountPaid FROM invoices WHERE id=1');return Number(r[0].amountPaid)===100},'second explicit payment');await totals(1,100,2);console.log('PASS: explicit next $60 payment accumulated to $100 with two receipts');
 const a=await page(2),b=await page(2);await click(a.cdp,'Record Payment');await click(b.cdp,'Record Payment');await amount(a.cdp,25);await amount(b.cdp,25);await Promise.all([click(a.cdp,'Record Payment',true),click(b.cdp,'Record Payment',true)]);
 await wait(()=>a.cdp.evaluate("!document.querySelector('[role=dialog]')"),'tab A acknowledgement');await wait(()=>b.cdp.evaluate("!document.querySelector('[role=dialog]')"),'tab B acknowledgement');await totals(2,25,1);console.log('PASS: two simultaneous real tabs recorded one $25 operation');
 for(const p of [first,reopened,a,b])if(p.error())throw p.error();
 console.log('PASS: built payment UI, real Chromium/Web Locks and MySQL; no external requests or emails');
} catch(error){console.error(error.message);console.error('Server diagnostic:',serverOutput.slice(-12000));throw error}
finally{await stopBrowser();if(server?.exitCode==null){server.kill('SIGTERM');await once(server,'exit')}await connection.end();await admin.query(`DROP DATABASE \`${database}\``);await admin.end();await rm(profile,{recursive:true,force:true})}
