const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

async function main() {
  const css = fs.readFileSync('src/app/globals.css', 'utf8');
  const spec = fs.readFileSync('docs/design_handoff_trackasuwa/README.md', 'utf8');
  const colors = text => [...text.matchAll(/--c-([\w]+):\s*(oklch\([^)]+\))/g)].map(([, key, value]) => [key, value.replace(/\s+/g, ' ')]);
  const expected = colors(spec);
  const actual = colors(css);
  const mismatches = expected.filter(([key, value], index) => {
    const occurrence = expected.slice(0, index).filter(([name]) => name === key).length;
    return actual.filter(([name]) => name === key)[occurrence]?.[1] !== value;
  });
  if (mismatches.length) throw new Error(`Palette mismatch: ${JSON.stringify(mismatches)}`);
  for (const [selector, values] of [
    ['[data-density="comfortable"]', [15, 52, 44, 44, 264, 68, 24]],
    ['[data-pos-mode="true"]', [15, 52, 44, 44, 264, 68, 24]],
    ['[data-density="dense"]', [13, 36, 32, 32, 232, 52, 16]],
    ['[data-dense-mode="true"]', [13, 36, 32, 32, 232, 52, 16]],
  ]) {
    const body = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
    ['base-font', 'row-h', 'input-h', 'btn-h', 'sidebar-w', 'header-h', 'card-pad'].forEach((key, index) => {
      if (!body.includes(`--${key}: ${values[index]}px;`)) throw new Error(`Density mismatch: ${selector} ${key}`);
    });
  }

  const protectedBefore = JSON.parse(fs.readFileSync('build-evidence/retail/protected-before.json', 'utf8'));
  const protectedAfter = Object.fromEntries(Object.keys(protectedBefore).map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  for (const file of Object.keys(protectedBefore)) {
    if (protectedBefore[file] !== protectedAfter[file]) throw new Error(`Protected file changed: ${file}`);
  }
  fs.writeFileSync('build-evidence/retail/protected-after.json', JSON.stringify(protectedAfter, null, 2));

  const images = [];
  for (const name of fs.readdirSync('public/images/retail')) {
    const file = `public/images/retail/${name}`;
    const metadata = await sharp(file).metadata();
    if (!metadata.width || !metadata.height) throw new Error(`Invalid image: ${file}`);
    if (!fs.readFileSync(file).equals(fs.readFileSync(`docs/design_handoff_trackasuwa/design_files/assets/${name}`))) throw new Error(`Asset differs from handoff: ${name}`);
    images.push({ file, width: metadata.width, height: metadata.height });
  }
  const pages = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name === 'page.tsx') pages.push(file.replaceAll('\\', '/'));
    }
  };
  walk('src/app');
  const result = { paletteValuesMatched: expected.length, protectedFiles: protectedAfter, images, pages, browserVerification: 'Unavailable: no browser provider in this session' };
  fs.writeFileSync('build-evidence/retail/audit.json', JSON.stringify(result, null, 2));
  console.log(`PASS: ${expected.length} exact light/dark palette values; ${Object.keys(protectedAfter).length} protected file hashes unchanged; ${images.length} supplied photographs decoded and byte-matched; ${pages.length} page routes inventoried.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
