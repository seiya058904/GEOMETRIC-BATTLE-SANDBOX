import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
async function scan(path){const entries=await readdir(path,{withFileTypes:true});for(const e of entries){const p=`${path}/${e.name}`;if(e.isDirectory())await scan(p);else if(/\.(js|mjs)$/.test(p)){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status!==0){console.error(r.stderr);process.exitCode=1;}}}}
await scan('src');await scan('scripts');await scan('tests');if(!process.exitCode)console.log('全部 JavaScript 模块语法检查通过。');
