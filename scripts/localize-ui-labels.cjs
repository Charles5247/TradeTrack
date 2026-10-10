const fs=require('node:fs'),ts=require('typescript'),path=require('node:path');
const files={
 'src/components/ui/form-template.tsx':['sec.title','sec.description','cancelLabel','isSaving ? "Saving…" : isNew ? "Create" : saveLabel','label','hint'],
 'src/components/ui/stat-card.tsx':['label','sub'],
 'src/components/ui/empty-state.tsx':['title','body'],
 'src/components/ui/error-state.tsx':['title','body'],
 'src/components/ui/detail-template.tsx':['m.label'],
 'src/components/settings/business-settings.tsx':['label'],
 'src/components/settings/operations-settings.tsx':['label','item.title'],
 'src/components/subscriptions/account-panels.tsx':['label'],
 'src/app/(dashboard)/settings/page.tsx':['item.label','item.title','item.body'],
 'src/components/layout/header.tsx':['b','title'],
 'src/components/layout/sidebar.tsx':['group.title','label'],
};
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name).replaceAll('\\','/');if(e.isDirectory())walk(f);else if(f.endsWith('.tsx')&&!f.includes('.test.'))files[f]??=[]}}
walk('src/components/marketing');walk('src/app/(marketing)');
for(const [file,allowed] of Object.entries(files)){
 const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,99,true,4),edits=[];let needed=false;
 function visit(n){if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='TranslatedLabel')return;
 if(ts.isJsxExpression(n)&&n.expression&&!ts.isJsxAttribute(n.parent)){
 const value=n.expression.getText(ast);const marketing=file.includes('marketing');
 if(allowed.includes(value)||marketing&&(/^(f|s|ind|col)\.(title|desc|label|l)$/.test(value)||value==='point')){edits.push({start:n.getStart(ast),end:n.end,text:`<TranslatedLabel>{${value}}</TranslatedLabel>`});needed=true;return;}
 }ts.forEachChild(n,visit)}visit(ast);
 if(!needed)continue;
 const importMatch=source.match(/import \{ ([^}]+) \} from ['"]@\/i18n\/text['"];?/);
 if(importMatch && !importMatch[1].includes('TranslatedLabel'))edits.push({start:importMatch.index,end:importMatch.index+importMatch[0].length,text:importMatch[0].replace('{ ','{ TranslatedLabel, ')});
 else if(importMatch) {}
 else {const pos=/^\s*['"]use client/.test(source)?ast.statements[0].end:0;edits.push({start:pos,end:pos,text:"\nimport { TranslatedLabel } from '@/i18n/text';\n"});}
 let result=source;for(const e of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,e.start)+e.text+result.slice(e.end);fs.writeFileSync(file,result);
}
