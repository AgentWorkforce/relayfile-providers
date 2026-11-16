import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
const workflow=readFileSync(new URL('../.github/workflows/publish.yml',import.meta.url),'utf8');
function step(name){
 const section=workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name: ')[0];
 assert(section,`Missing workflow step: ${name}`);
 const run=section.split('        run: |\n')[1];assert(run);
 return run.split('\n').map(line=>line.replace(/^          /,'')).join('\n');
}
function runStep(name,overrides={}){
 // These are tiny shell-contract fixtures, not application/build worktrees.
 const dir=mkdtempSync(join(tmpdir(),'relayfile-publish-contract-'));
 try{
  const bin=join(dir,'bin');mkdirSync(bin);mkdirSync(join(dir,'packages/connection-health'),{recursive:true});
  writeFileSync(join(dir,'packages/connection-health/package.json'),JSON.stringify({name:'@relayfile/connection-health',version:'0.1.1'}));
  const log=join(dir,'calls.jsonl');writeFileSync(log,'');
  writeFileSync(join(bin,'npm'),`#!/usr/bin/env node\nrequire('node:fs').appendFileSync(process.env.CALLS,JSON.stringify([...process.argv.slice(2),...(process.env.NODE_AUTH_TOKEN ? ['registry-auth-configured'] : [])])+'\\n');\n`,{mode:0o755});
  writeFileSync(join(bin,'npx'),`#!/usr/bin/env node\nconsole.log(JSON.stringify([{filename:'reviewed.tgz',integrity:'sha512-reviewed'}]));\n`,{mode:0o755});
  const result=spawnSync('bash',['-e','-c',step(name)],{cwd:dir,encoding:'utf8',env:{...process.env,PATH:`${bin}:${process.env.PATH}`,CALLS:log,RUNNER_TEMP:dir,GITHUB_OUTPUT:join(dir,'output'),PACKAGES:'connection-health',VERSION:'current',PUBLISH_TAG:'latest',DRY_RUN:'false',EXPECTED_INTEGRITY:'sha512-reviewed',NODE_AUTH_TOKEN:'',...overrides}});
  return {...result,calls:readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('publishes the reviewed artifact at its current version without a version bump',()=>{
 const r=runStep('Version, verify artifact & publish');assert.equal(r.status,0,r.stderr);
 assert.equal(r.calls.some(args=>args[0]==='version'),false);
 assert.deepEqual(r.calls.filter(args=>args[0]==='publish'),[['publish','reviewed.tgz','--ignore-scripts','--access','public','--provenance','--tag','latest']]);
});
test('an integrity mismatch prevents any publish command',()=>{
 const r=runStep('Version, verify artifact & publish',{EXPECTED_INTEGRITY:'sha512-wrong'});
 assert.notEqual(r.status,0);assert.equal(r.calls.some(args=>args[0]==='publish'),false);
 assert.match(r.stderr,/refusing publication/);
});
test('dry runs retain npm dry-run behavior',()=>{
 const r=runStep('Version, verify artifact & publish',{DRY_RUN:'true'});assert.equal(r.status,0,r.stderr);
 assert(r.calls.find(args=>args[0]==='publish')?.includes('--dry-run'));
});
test('one integrity cannot accidentally authorize publishing every package',()=>{
 const r=runStep('Resolve packages to publish',{PACKAGE:'all'});assert.notEqual(r.status,0);assert.match(r.stderr,/selecting one package/);
});
test('package selection rejects shell input and unknown directories',()=>{
 const r=runStep('Resolve packages to publish',{PACKAGE:'connection-health; echo unexpected'});assert.notEqual(r.status,0);assert.match(r.stderr,/Unknown package/);
});
