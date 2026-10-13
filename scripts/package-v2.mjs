import {execFileSync} from 'node:child_process';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import path from 'node:path';
const root=process.cwd(),git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
if(git('status','--porcelain'))throw new Error('请先提交本任务的完整验证版本；打包只接受干净工作树。');
const commit=git('rev-parse','HEAD'),branch=git('branch','--show-current');
const names=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).sort();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const entries=[];
for(const name of names){const absolute=path.resolve(root,name);if(!absolute.startsWith(root+path.sep))throw new Error(`越界路径 ${name}`);if(!(await lstat(absolute)).isFile())throw new Error(`非普通文件 ${name}`);const bytes=await readFile(absolute);entries.push({name,bytes});}
const content=name=>entries.find(e=>e.name===name)?.bytes;
if(!content('dist/style.css')?.equals(content('src/style.css')))throw new Error('CSS 源码与生产构建不一致。');
const js=content('dist/game.js')?.toString('utf8'),html=content('GEOBATTLE-OFFLINE.html')?.toString('utf8');
if(!js||!html?.includes(js.replace(/<\/script/gi,'<\\/script')))throw new Error('离线脚本与 dist/game.js 不一致。');
const build=JSON.parse(content('evidence/v2/build-final.json').toString('utf8'));
const source=entries.filter(e=>e.name.startsWith('src/')).map(e=>`${e.name}\0${sha(e.bytes)}\n`).join('');
if(build.sourceSha256!==sha(source))throw new Error('源码不是最终构建记录的版本。');
for(const item of build.artifacts)if(sha(content(item.path))!==item.sha256)throw new Error(`最终验证产物改变 ${item.path}`);
const manifest={schemaVersion:1,title:'GEOBATTLE V2完整源码与离线交接',git:{baseline:'924150f922e5da2cff1000aa5bb034fb34b32701',commit,parentCommit:git('rev-parse','HEAD^'),branch,pushed:false,clean:true},sourceSha256:sha(source),buildEvidence:'evidence/v2/build-final.json',qa:'docs/V2-QA-REPORT.md',performance:'docs/V2-PERFORMANCE-INVESTIGATION.md',exclusions:['.git','node_modules','原始v1根ZIP（原文件仍在工作区）','重复解压的baseline-source目录','9f964f3原交接ZIP/清单（保留在本地）','原始性能trace JSON（无损gzip副本随包，原文保留在本地）'],manifestSelfHash:'Manifest itself is included in ZIP but omitted from its own file hashes to avoid circular hashing.',files:entries.map(e=>({path:e.name,bytes:e.bytes.length,sha256:sha(e.bytes)}))};
const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');await writeFile('DELIVERY-MANIFEST.json',manifestBytes);entries.push({name:'DELIVERY-MANIFEST.json',bytes:manifestBytes});
// Standard ZIP/Deflate, UTF-8 names. No runtime or package dependency is added.
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc=bytes=>{let n=0xffffffff;for(const b of bytes)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;};
const files=[],central=[];let offset=0;
const date=new Date(Number(git('show','-s','--format=%ct','HEAD'))*1000),dosTime=(date.getUTCHours()<<11)|(date.getUTCMinutes()<<5)|(date.getUTCSeconds()>>1),dosDate=((date.getUTCFullYear()-1980)<<9)|((date.getUTCMonth()+1)<<5)|date.getUTCDate();
for(const e of entries){const name=Buffer.from(`GEOBATTLE-V2-DELIVERY/${e.name}`),compressed=deflateRawSync(e.bytes),sum=crc(e.bytes),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(dosTime,10);local.writeUInt16LE(dosDate,12);local.writeUInt32LE(sum,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(e.bytes.length,22);local.writeUInt16LE(name.length,26);files.push(local,name,compressed);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);c.writeUInt16LE(dosTime,12);c.writeUInt16LE(dosDate,14);c.writeUInt32LE(sum,16);c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(e.bytes.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);offset+=local.length+name.length+compressed.length;}
const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const zip=Buffer.concat([...files,directory,end]);await writeFile('GEOBATTLE-V2-DELIVERY.zip',zip);
const state={commit,branch,clean:true,pushed:false,zip:{path:'GEOBATTLE-V2-DELIVERY.zip',bytes:zip.length,sha256:sha(zip)},manifest:{path:'DELIVERY-MANIFEST.json',sha256:sha(manifestBytes)},offline:manifest.files.find(f=>f.path==='GEOBATTLE-OFFLINE.html'),sourceSha256:manifest.sourceSha256,filesInZip:entries.length};await writeFile('DELIVERY-GIT-STATE.json',JSON.stringify(state,null,2)+'\n');console.log(JSON.stringify(state,null,2));
