// Loopback-only fixture server. Never reads application .env or production keys.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {build} from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {createManualFixtureAPI} from './m1-fixture-api.mjs';
import {createRequire} from 'node:module';
const run=promisify(execFile),target=JSON.parse(readFileSync('.m0-local/active-target.json','utf8'));
if(target.host!=='127.0.0.1'||target.user!=='m0_test'||!/^m0_verify_[a-f0-9]{32}$/.test(target.database)||!/^[0-9]+$/.test(target.port))throw new Error('Only the disposable M0 target is allowed');
const port=57139,base=['-h','127.0.0.1','-p',target.port,'-U','m0_test','-d',target.database,'-X','-qAt','-v','ON_ERROR_STOP=1'];
const binary=process.env.M0_PSQL??'C:/Program Files/PostgreSQL/18/bin/psql.exe';
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const org='10000000-0000-0000-0000-000000000001',owner='20000000-0000-0000-0000-000000000001',otherOrg='10000000-0000-0000-0000-000000000066',otherOwner='20000000-0000-0000-0000-000000000066';
const sql=async statement=>(await run(binary,[...base,'-c',statement],{maxBuffer:4*1024*1024})).stdout.trim();
await sql(`INSERT INTO organizations(id,name,slug) VALUES('${otherOrg}','M0 other shop','m0-browser-other') ON CONFLICT DO NOTHING;
 INSERT INTO users(id,email,full_name,role,organization_id) VALUES('${otherOwner}','other@m0.invalid','M0 Other','business_owner','${otherOrg}') ON CONFLICT DO NOTHING;`);
await sql(`INSERT INTO products(id,organization_id,name,sku,selling_price,cost_price)
 SELECT ('31000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${org}','M1 pager item','M1-PAGE-'||lpad(n::text,2,'0'),1,0 FROM generate_series(1,30) n ON CONFLICT(organization_id,sku) DO NOTHING;`);
mkdirSync('.m0-local/browser',{recursive:true});
const fixtureXlsx=createRequire(import.meta.url)('xlsx');
const fixtureWorkbook=fixtureXlsx.utils.book_new();
fixtureXlsx.utils.book_append_sheet(fixtureWorkbook,fixtureXlsx.utils.aoa_to_sheet([
 ['Name','Qty','Price'],['Browser rice',12,0],['Browser beans',2,25.5],
]),'Stock');
fixtureXlsx.writeFile(fixtureWorkbook,'.m0-local/browser/synthetic.xlsx',{compression:true});
writeFileSync('.m0-local/browser/client.ts',`import {useAuthStore} from '../../src/store/index';
export function createClient(){return {rpc:async(name:string,args:unknown)=>{const response=await fetch('/rpc',{method:'POST',headers:{'content-type':'application/json','x-m0-actor':useAuthStore.getState().user?.id??''},body:JSON.stringify({name,args})});return response.json();}};}`);
const options={bundle:true,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',define:{'process.env':JSON.stringify({NODE_ENV:'production'}),'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_ATOMIC_CHECKOUT_ENABLED':'"true"','process.env.NEXT_PUBLIC_STOCK_INTAKE_ENABLED':'"true"'},logLevel:'warning'};
if(process.env.M0_BROWSER_REUSE_ASSETS!=='true') {
await build({...options,entryPoints:['scripts/m0-browser-fixture.tsx'],outfile:'.m0-local/browser/main.js',plugins:[{name:'isolated-client',setup(context){context.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:new URL('../.m0-local/browser/client.ts',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')}));}}]});
await build({...options,entryPoints:['src/lib/imports/parse.worker.ts'],outfile:'.m0-local/browser/worker.js'});
const css=await postcss([tailwind()]).process(readFileSync('src/app/globals.css','utf8'),{from:'src/app/globals.css'});
writeFileSync('.m0-local/browser/style.css',css.css+'\nbutton{border:1px solid currentColor;border-radius:6px;padding:8px 12px}');
} else if(!['main.js','worker.js','style.css'].every(file=>existsSync(`.m0-local/browser/${file}`))) throw new Error('Build the fixture assets before reusing them');
if(process.env.M0_BROWSER_BUILD_ONLY==='true'){console.log('M0 browser assets rebuilt');process.exit(0);}
const manualAPI=await createManualFixtureAPI({sql,quote,owner,otherOwner,baseUrl:`http://127.0.0.1:${port}`});
await sql('UPDATE track_private.stock_command_settings SET intake_enabled=true');
let loseNext=false;
const server=createServer(async(request,response)=>{
 try{
  const origin=request.headers.origin;
  if(origin&&origin!==`http://127.0.0.1:${port}`)throw new Error('Foreign origin denied');
  if(request.url==='/shutdown'&&request.method==='POST'){response.end('stopping');server.close(()=>process.exit(0));return;}
  if(await manualAPI(request,response))return;
  if(request.url==='/seed'){
   const profile=JSON.parse(await sql(`SELECT row_to_json(u) FROM users u WHERE id='${owner}'`));profile.full_name=`M0 fixture ${target.database}`;
   const other=JSON.parse(await sql(`SELECT row_to_json(u) FROM users u WHERE id='${otherOwner}'`));
   const products=JSON.parse(await sql(`SELECT json_agg(p ORDER BY id) FROM products p WHERE organization_id='${org}' AND sku IN ('M0-RICE','M0-BEANS')`));
   const inventory=JSON.parse(await sql(`SELECT json_agg(i) FROM inventory i WHERE organization_id='${org}'`));
   response.setHeader('content-type','application/json');response.end(JSON.stringify({profile,other,products,inventory,warehouse:'40000000-0000-0000-0000-000000000001'}));return;
  }
  if(request.url==='/stock'){response.end(await sql("SELECT quantity FROM inventory WHERE product_id='30000000-0000-0000-0000-000000000001' AND warehouse_id='40000000-0000-0000-0000-000000000001'"));return;}
  if(request.url==='/lose-next'&&request.method==='POST'){loseNext=true;response.end('ready');return;}
  if(request.url==='/rpc'&&request.method==='POST'){
   const actor=request.headers['x-m0-actor'];if(![owner,otherOwner].includes(actor))throw new Error('Unknown fixture actor');
   let body='';for await(const chunk of request){body+=chunk;if(body.length>2*1024*1024)throw new Error('Request too large');}
   const {name,args}=JSON.parse(body);if(!['post_pos_checkout','apply_inventory_adjustment'].includes(name))throw new Error('Unknown fixture RPC');
   const parameters=name==='post_pos_checkout'?`,${args.reconcile_legacy===true},${args.recovery_reason?quote(args.recovery_reason):'NULL'}`:'';
   const data=JSON.parse(await sql(`SET ROLE authenticated;SET "test.uid"=${quote(actor)};SELECT public.${name}(${quote(JSON.stringify(args.command))}::jsonb${parameters})`));
   response.setHeader('content-type','application/json');
   if(loseNext){loseNext=false;response.end(JSON.stringify({data:null,error:{message:'Simulated acknowledgment loss after committed checkout. Retry the saved receipt.'}}));}
   else response.end(JSON.stringify({data,error:null}));return;
  }
  const file={'/main.js':'main.js','/parse.worker.ts':'worker.js','/style.css':'style.css'}[request.url];
  if(file){response.setHeader('content-type',file.endsWith('.css')?'text/css':'text/javascript');response.end(readFileSync(`.m0-local/browser/${file}`));return;}
  if(!['/','/m1'].includes(request.url)){response.statusCode=404;response.end();return;}
  response.setHeader('content-type','text/html');response.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M0 isolated verification</title><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/main.js"></script></html>');
 }catch(error){response.setHeader('content-type','application/json');response.statusCode=400;response.end(JSON.stringify({data:null,error:{message:error.message}}));}
});
server.listen(port,'127.0.0.1',()=>console.log(`M0 synthetic browser fixture http://127.0.0.1:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
