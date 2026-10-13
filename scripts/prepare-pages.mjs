import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const commit=process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('Missing valid deployment commit');
const index=await readFile('dist/index.html','utf8');
if(!index.includes('./game.js')||!index.includes('./style.css')||index.includes('./src/'))throw new Error('Pages must use the production entry');
const js=await readFile('dist/game.js','utf8'),css=await readFile('dist/style.css','utf8'),offline=await readFile('GEOBATTLE-OFFLINE.html','utf8');
if(!offline.includes(js.replace(/<\/script/gi,'<\\/script'))||!offline.includes(css))throw new Error('Offline artifact differs from production');
await copyFile('GEOBATTLE-OFFLINE.html','dist/GEOBATTLE-OFFLINE.html');
const files={};
for(const name of ['index.html','game.js','style.css','GEOBATTLE-OFFLINE.html']){const bytes=await readFile(`dist/${name}`);if(!bytes.length)throw new Error(`Empty deployment file: ${name}`);files[name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
await writeFile('dist/build-info.json',JSON.stringify({commit,files},null,2));
console.log(JSON.stringify({commit,files}));
