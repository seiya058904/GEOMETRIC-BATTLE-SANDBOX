import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function list(dir){const result=[];for(const item of await readdir(dir,{withFileTypes:true})){const name=`${dir}/${item.name}`;if(item.isDirectory())result.push(...await list(name));else result.push(name);}return result.sort();}
const source=(await Promise.all((await list('src')).map(async name=>`${name}\0${sha(await readFile(name))}\n`))).join('');
const artifacts=await Promise.all(['dist/index.html','dist/game.js','dist/style.css','GEOBATTLE-OFFLINE.html'].map(async path=>{const bytes=await readFile(path);return {path,bytes:bytes.length,sha256:sha(bytes)};}));
const js=await readFile('dist/game.js','utf8'),css=await readFile('src/style.css','utf8'),offline=await readFile('GEOBATTLE-OFFLINE.html','utf8');
if(!offline.includes(js.replace(/<\/script/gi,'<\\/script'))||!offline.includes(css)||css!==await readFile('dist/style.css','utf8'))throw new Error('离线与生产字节不一致');
await writeFile('evidence/v2/build-final.json',JSON.stringify({sourceSha256:sha(source),artifacts,offlineMatchesDist:true,command:'npm run build; node scripts/verify-v2-build.mjs'},null,2));console.log(JSON.stringify({sourceSha256:sha(source),artifacts}));
