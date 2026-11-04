async (page) => {
  await page.goto("file:///C:/dev/TradeTrack/docs/ai/prototype/index.html");
  const out = [];
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      const d = window.prototypeDemo;
      Object.assign(d.state, {
        role: "Owner",
        plan: "Business",
        theme,
        language: "en",
      });
      d.go("review");
      d.render();
    }, theme);
    out.push(
      await page.evaluate((theme) => {
        const css = getComputedStyle(document.body),
          canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const c = canvas.getContext("2d");
        const rgb = (color) => {
          c.clearRect(0, 0, 1, 1);
          c.fillStyle = color;
          c.fillRect(0, 0, 1, 1);
          return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        const v = (n) => css.getPropertyValue(n).trim();
        const luminance = (x) =>
          x
            .map((n) => {
              const s = n / 255;
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            })
            .reduce((n, x, i) => n + x * [0.2126, 0.7152, 0.0722][i], 0);
        const ratio = (a, b) => {
          let x = luminance(rgb(a)),
            y = luminance(rgb(b));
          return +(Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        };
        const tint = getComputedStyle(
          document.querySelector(".notice") || document.querySelector(".badge"),
        ).backgroundColor;
        const checks = [
          ["body/surface", v("--text"), v("--surface"), 4.5],
          ["secondary/surface", v("--muted"), v("--surface"), 4.5],
          ["secondary/background", v("--muted"), v("--bg"), 4.5],
          ["primary button", v("--primary-fg"), v("--primary"), 4.5],
          ["primary link", v("--primary"), v("--surface"), 4.5],
          ["notice text", v("--text"), tint, 4.5],
          ["control boundary", v("--muted"), v("--surface"), 3],
        ];
        return {
          theme,
          checks: checks.map(([name, a, b, min]) => ({
            name,
            ratio: +ratio(a, b).toFixed(2),
            minimum: min,
            pass: ratio(a, b) >= min,
          })),
        };
      }, theme),
    );
  }
  return JSON.stringify(out);
}
