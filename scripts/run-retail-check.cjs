const fs = require('node:fs');
const { spawn } = require('node:child_process');

const checks = {
  build: ['node_modules/next/dist/bin/next', 'build'],
  typecheck: ['node_modules/typescript/bin/tsc', '--noEmit'],
  test: ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=2', '--testTimeout=120000', '--hookTimeout=120000'],
};
const name = process.argv[2];
if (!checks[name]) throw new Error('Choose build, typecheck or test');
const filename = `build-evidence/retail/${name}-output.log`;
const log = fs.openSync(filename, 'w');
fs.writeSync(log, `$ node ${checks[name].join(' ')}\n`);
const child = spawn(process.execPath, checks[name], { stdio: ['ignore', log, log] });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => {
  fs.writeSync(log, `\nExit code: ${code}\n`);
  fs.closeSync(log);
  console.log(`${name}: exit ${code}; full output: ${filename}`);
  process.exitCode = code ?? 1;
});
