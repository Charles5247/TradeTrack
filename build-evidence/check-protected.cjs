const fs = require('node:fs');
const crypto = require('node:crypto');
const baseline = JSON.parse(fs.readFileSync('build-evidence/protected-before.json','utf8'));
let ok = true;
for (const [path,before] of Object.entries(baseline)) {
 const after=crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
 console.log(`${path}\n  before ${before}\n  after  ${after}`);
 if (!path.includes('/pos/') && before!==after) ok=false;
}
const engine=fs.readFileSync('src/lib/offline/sync-engine.ts','utf8');
const protectedBody=engine.slice(engine.indexOf('  async pullPurchaseOrders('),engine.indexOf('  async pullVendorTransactions('));
if (protectedBody!==fs.readFileSync('build-evidence/pullPurchaseOrders-before.txt','utf8')) ok=false;
console.log('pullPurchaseOrders unchanged:', protectedBody===fs.readFileSync('build-evidence/pullPurchaseOrders-before.txt','utf8'));
if (!ok) process.exitCode=1;
