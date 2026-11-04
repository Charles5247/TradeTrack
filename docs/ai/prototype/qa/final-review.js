async (page) => {
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('file:///C:/dev/TradeTrack/docs/ai/prototype/index.html');
  const captures=[];
  for(const [route,width,language,theme] of [['upload',1440,'en','light'],['insights',1440,'en','light'],['settings',360,'ha','dark'],['sources',360,'en','light'],['partial?preview=1',1440,'en','light']]){
    await page.setViewportSize({width,height:1000});
    await page.evaluate(({route,language,theme})=>{const d=window.prototypeDemo;Object.assign(d.state,{role:'Owner',plan:'Business',language,theme,width:'desktop',scenario:'normal'});d.go(route);d.render();},{route,language,theme});
    await page.waitForTimeout(220);
    const name=route.split('?')[0]+'-'+width+'.png';
    await page.screenshot({path:'docs/ai/prototype/qa/'+name,fullPage:false});captures.push(name);
  }
  await page.evaluate(()=>document.querySelector('#reset').click());
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'docs/ai/prototype/qa/start-screen.png'});
  return JSON.stringify({captures,cleanStart:await page.evaluate(()=>({route:location.hash,role:window.prototypeDemo.state.role,language:window.prototypeDemo.state.language,theme:window.prototypeDemo.state.theme,sharing:window.prototypeDemo.state.sharing}))});
}
