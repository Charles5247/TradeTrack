import {execFileSync} from 'node:child_process';
const paths=execFileSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,'ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const forbidden=paths.filter(path=>/(^|\/)\.env($|\.)/.test(path) && !/(^|\/)\.env\.example$/.test(path));
if(forbidden.length){console.error('Environment files must remain local. Tracked paths only (no values):\n'+forbidden.join('\n'));process.exitCode=1;}
else console.log('PASS: no private environment files are tracked. Historical exposure/rotation requires separate verification.');
