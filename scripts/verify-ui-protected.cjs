const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const before = JSON.parse(fs.readFileSync('build-evidence/ui-ux/protected-before.json', 'utf8'));
const hashes = Object.entries(before).map(([file, hash]) => {
  const after = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return { file, before: hash, after, unchanged: hash === after };
});
function behavior(source, path) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handlers = [], queries = [];
  function visit(node) {
    if (ts.isJsxAttribute(node) && /^on[A-Z]/.test(node.name.getText(file))) handlers.push(node.getText(file).replace(/\s+/g,' '));
    if (ts.isCallExpression(node) && ['useQuery','useMutation'].includes(node.expression.getText(file))) queries.push(node.getText(file).replace(/\s+/g,' '));
    ts.forEachChild(node,visit);
  }
  visit(file); return {handlers,queries};
}
// This batch started at cd0f825. Compare against that immutable baseline,
// even after the completed changes have been committed.
const pages = ['purchase-orders','warehouses','receipts/lookup','sales','users','merchants'].map(page => {
  const file = `src/app/(dashboard)/${page}/page.tsx`;
  const old = behavior(execFileSync('git',['show',`cd0f825:${file}`],{encoding:'utf8'}),file);
  const current = behavior(fs.readFileSync(file,'utf8'),file);
  return { file, handlersUnchanged: JSON.stringify(old.handlers) === JSON.stringify(current.handlers), queriesAndMutationsUnchanged: JSON.stringify(old.queries) === JSON.stringify(current.queries) };
});
const passed = hashes.every(h=>h.unchanged) && pages.every(p=>p.handlersUnchanged && p.queriesAndMutationsUnchanged);
const result = { passed, hashes, pages };
fs.writeFileSync('build-evidence/ui-ux/protected-check.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(!passed)process.exitCode=1;
