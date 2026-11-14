'use strict';
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const fixture=path.resolve('.build/server-fixture');fs.mkdirSync(path.join(fixture,'data'),{recursive:true});
for(const [target,source] of [['index.html','index.html'],['skyline-worker.js','src/skyline-worker.js'],['data/jezero_dem.json','data/jezero_dem.json']])fs.copyFileSync(source,path.join(fixture,target));
const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:'18071',STATIC_ROOT:fixture},stdio:['ignore','pipe','pipe']});
(async()=>{await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('server exit '+code)));});
for(const [url,status,type] of [['/',200,'text/html'],['/skyline-worker.js',200,'text/javascript'],['/data/jezero_dem.json',200,'application/json'],['/.venv/pyvenv.cfg',403,null],['/%2e%76env/pyvenv.cfg',403,null],['/missing-file',404,null]]){const r=await fetch('http://127.0.0.1:18071'+url);assert.equal(r.status,status,url);if(type)assert(r.headers.get('content-type').startsWith(type));await r.arrayBuffer();}console.log('Local server assets, MIME and private-path protection passed');})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>child.kill());
