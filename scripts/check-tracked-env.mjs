import { execFileSync } from 'node:child_process';

// Read paths only: never print credentials or environment-file contents in CI.
const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0');
const exposed = paths.filter(path => /(^|\/)\.env(?:\.|$)/.test(path) && !/(^|\/)\.env\.example$/.test(path));
if (exposed.length) {
  console.error('Private environment files must not be tracked:');
  for (const path of exposed) console.error(`- ${path}`);
  process.exitCode = 1;
} else {
  console.log('No private environment files are tracked.');
}
