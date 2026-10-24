// Disposable loopback verifier transport. Never reads application credentials.
import { spawn } from 'node:child_process';
export function createLocalIntakeSql(target,psql=process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin/psql.exe':'psql'){
 if(target.host!=='127.0.0.1'||target.user!=='m0_test'||!/^m0_verify_[a-f0-9]{32}$/.test(target.database)||!/^\d+$/.test(String(target.port))||Number(target.port)<1024)throw new Error('Only a disposable loopback intake fixture is allowed');
 return statement=>new Promise((resolve,reject)=>{
  const child=spawn(psql,['-h',target.host,'-p',String(target.port),'-U',target.user,'-d',target.database,'-X','-qAt','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
  let output='',error='',settled=false;
  const fail=reason=>{if(settled)return;settled=true;child.kill();reject(reason);};
  child.once('error',fail);child.stdout.on('data',chunk=>{output+=String(chunk);if(output.length>8*1024*1024)fail(new Error('Fixture response exceeds 8 MiB'));});
  child.stderr.on('data',chunk=>{error+=String(chunk);if(error.length>65536)fail(new Error('Fixture diagnostics exceeded boundary'));});
  child.once('close',code=>{if(settled)return;settled=true;if(code===0)resolve(output.trim());else reject(new Error(error.trim()||`Fixture SQL exited ${code}`));});
  child.stdin.on('error',fail);child.stdin.end(statement+'\n');
 });
}
