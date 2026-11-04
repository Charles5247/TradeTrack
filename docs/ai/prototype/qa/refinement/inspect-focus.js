async (page) => {
  await page.goto('file:///C:/dev/TradeTrack/docs/ai/prototype/index.html');
  await page.setViewportSize({width:360,height:420});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{const d=window.prototypeDemo;Object.assign(d.state,{language:'en',theme:'light',width:'desktop',rehearsal:'correct',role:'Owner',plan:'Business'});d.start('oil','review');});
  await page.locator('[data-action="row-details"][data-id="3"]').click();
  await page.locator('[data-field="name"][data-id="3"]').focus();
  const result=[];
  for(let i=0;i<16;i++){
    await page.keyboard.press('Tab');
    result.push(await page.evaluate(()=>{const e=document.activeElement,b=e.getBoundingClientRect(),x=Math.min(innerWidth-1,Math.max(1,b.left+b.width/2)),y=Math.min(innerHeight-1,Math.max(1,b.top+b.height/2)),hit=document.elementFromPoint(x,y);return {tag:e.tagName,field:e.dataset.field,action:e.dataset.action,rect:{x:b.x,y:b.y,w:b.width,h:b.height},scrollY,hit:hit?.outerHTML.slice(0,200),visible:e.contains(hit)};}));
  }
  return result;
}
