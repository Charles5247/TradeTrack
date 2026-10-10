// One-time source migration: only source-owned copy, never records or input values.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const copies = new Set();
const decoder = text => text.replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
const readable = text => /[A-Za-z]{2}/.test(text) && !/^\S+@\S+/.test(text) && !/^https?:|^\//.test(text) && !/^TracKasuwa$|^CAXiE/.test(text);
const displayKeys = new Set(['title','label','description','desc','body','text','eyebrow','sub','subtitle','detail','heading','quote']);
function run(file) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes('@/i18n/text')) return;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const client = /^\s*['"]use client['"]/.test(source);
  const edits = [], hooks = new Set(); let textUsed = false, copyUsed = false;
  const add = (start,end,text) => edits.push({start,end,text});
  function owner(node) {
    for (let p=node.parent;p;p=p.parent) {
      if (ts.isFunctionDeclaration(p) && /^[A-Z]/.test(p.name?.text || '') && p.body) return p;
    }
  }
  function textNode(n, text) {
    copies.add(text); textUsed=true;
    add(n.getStart(ast),n.end,`<TranslatedText text={${JSON.stringify(text)}} />`);
  }
  function visit(n) {
    if(ts.isJsxText(n)) {
      const text=decoder(n.text.replace(/\s+/g,' ').trim());
      if(readable(text)) {
        // Preserve intentional inline spaces; indentation/newlines do not add spaces in JSX.
        const raw=n.text; const leading=/^[ \t]+\S/.test(raw)?' ':''; const trailing=/\S[ \t]+$/.test(raw)?' ':'';
        copies.add(text);textUsed=true;add(n.pos,n.end,`${leading?'{" "}':''}<TranslatedText text={${JSON.stringify(text)}} />${trailing?'{" "}':''}`);
      }
      return;
    }
    if(ts.isJsxAttribute(n) && ['title','placeholder','aria-label','alt','label','description','body'].includes(n.name.text) && n.initializer && ts.isStringLiteral(n.initializer) && readable(n.initializer.text)) {
      const fn=owner(n);
      if(client && fn) {const text=decoder(n.initializer.text);copies.add(text);hooks.add(fn);copyUsed=true;add(n.initializer.getStart(ast),n.initializer.end,`{copy(${JSON.stringify(text)})}`);}
      return;
    }
    if(ts.isJsxExpression(n) && n.expression && !ts.isJsxAttribute(n.parent)) {
      const x=n.expression;
      if(ts.isStringLiteral(x) && readable(x.text)) {textNode(n,x.text);return;}
      if(ts.isConditionalExpression(x) && [x.whenTrue,x.whenFalse].every(ts.isStringLiteral)) {
        [x.whenTrue,x.whenFalse].forEach(v=>copies.add(v.text)); textUsed=true;
        add(n.getStart(ast),n.end,`<TranslatedText text={${x.getText(ast)}} />`);return;
      }
      // Static marketing/config objects, not product/customer record fields.
      if(ts.isPropertyAccessExpression(x) && displayKeys.has(x.name.text)) {
        const base=x.expression.getText(ast);
        const staticObject=/^[A-Z_]+$/.test(base) || /^(feature|industry|step|faq|stat|pillar|link|item|section)$/.test(base) && file.includes('marketing');
        if(staticObject) {textUsed=true;add(n.getStart(ast),n.end,`<TranslatedText text={${x.getText(ast)}} />`);return;}
      }
    }
    // Collect authored config strings so the catalog also covers mapped cards.
    if(ts.isPropertyAssignment(n) && displayKeys.has(n.name.getText(ast).replace(/['"]/g,'')) && ts.isStringLiteral(n.initializer) && readable(n.initializer.text)) copies.add(n.initializer.text);
    ts.forEachChild(n,visit);
  }
  visit(ast);
  for(const fn of hooks) add(fn.body.getStart(ast)+1,fn.body.getStart(ast)+1,'\n  const copy = useCopy();');
  if(!edits.length) return;
  const names=[textUsed?'TranslatedText':null,copyUsed?'useCopy':null].filter(Boolean).join(', ');
  const pos=client?ast.statements[0].end:0;
  add(pos,pos,`\nimport { ${names} } from '@/i18n/text';\n`);
  let result=source;for(const e of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,e.start)+e.text+result.slice(e.end);
  fs.writeFileSync(file,result);
}
for(const root of ['src/app','src/components']) {
  function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,entry.name);if(entry.isDirectory())walk(f);else if(f.endsWith('.tsx')&&!f.includes('.test.')&&!f.endsWith('src\\app\\layout.tsx'))run(f);}}
  walk(root);
}
fs.mkdirSync('build-evidence/i18n',{recursive:true});
fs.writeFileSync('build-evidence/i18n/source-messages.json',JSON.stringify([...copies].sort(),null,2));
console.log(`${copies.size} source messages inventoried`);
