async (page) => {
  const refs = [
    ['a', 'file:///C:/Users/muham/Downloads/3d562a6f3bbaf7eb361b33bae8a15697.mp4'],
    ['b', 'file:///C:/Users/muham/Downloads/b0241c0e2b8cadf2838263d07ae205ba.mp4']
  ];
  for (const [name, url] of refs) {
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
    const meta = await page.locator('video').evaluate(v => ({ duration: v.duration, width: v.videoWidth, height: v.videoHeight }));
    console.log(name, meta);
    for (const [i, fraction] of [0.08, 0.5, 0.9].entries()) {
      await page.locator('video').evaluate((v, t) => { v.pause(); v.currentTime = t; }, meta.duration * fraction);
      await page.waitForTimeout(500);
      await page.screenshot({path:`docs/ai/prototype/qa/reference-${name}-${i}.png`});
    }
  }
}
