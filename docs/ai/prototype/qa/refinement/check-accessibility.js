async (page) => {
  const results=[], errors=[];
  await page.goto('file:///C:/dev/TradeTrack/docs/ai/prototype/index.html');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addScriptTag({path:'C:/Users/muham/AppData/Local/Temp/kasuwa-axe.min.js'});
  for(const width of [360,1440]) for(const language of ['en','ha']) for(const theme of ['light','dark']) {
    await page.setViewportSize({width,height:900});
    for(const [example,route] of [['oil','review'],['whatsapp','review'],['sheet','review'],['po','review'],['oil','upload'],['oil','confirm'],['oil','pending'],['oil','partial'],['oil','repair'],['oil','conflict'],['oil','unreadable']]) {
      await page.evaluate(({example,route,language,theme})=>{
        const d=window.prototypeDemo;
        Object.assign(d.state,{language,theme,rehearsal:'correct',role:'Owner',plan:'Business',scenario:'normal',width:'desktop'});
        d.start(example,'review');
        if(route==='review'){d.state.expandedConfident=true;d.state.openRows=[1];d.render();}
        else d.go(route+(['confirm','partial','pending','repair'].includes(route)?'?preview=1':''));
      },{example,route,language,theme});
      await page.waitForTimeout(40);
      const report=await page.evaluate(async()=>{
        const a=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
        return {violations:a.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:a.incomplete.map(v=>({id:v.id,nodes:v.nodes.length})),passes:a.passes.length};
      });
      results.push({width,language,theme,example,route,...report});
    }
  }
  return JSON.stringify({axe:await page.evaluate(()=>axe.version),scope:'88 controlled AI-1 views; automated accessibility only',results,violations:results.filter(r=>r.violations.length),errors});
}
