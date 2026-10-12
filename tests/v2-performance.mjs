import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const phase=process.env.PERF_PHASE||'after',repetitions=Number(process.env.PERF_REPETITIONS||3);
if(!/^[a-z0-9-]+$/.test(phase)||!Number.isInteger(repetitions)||repetitions<1)throw new Error('Invalid performance phase/repetitions.');
await mkdir('evidence/v2',{recursive:true});
const reports=[];
for(let run=1;run<=repetitions;run++){
  const output=`evidence/v2/performance-${phase}-run-${run}.json`;
  const env={...process.env,PERF_OUTPUT:output,PERF_SECONDS:process.env.PERF_SECONDS||'12',PERF_CAPTURE_PREFIX:`evidence/v2/performance-${phase}-run-${run}`};
  const exitCode=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['tests/performance.mjs'],{env,stdio:'inherit'});child.on('error',reject);child.on('exit',resolve);});
  const report=JSON.parse(await readFile(output,'utf8'));reports.push({run,exitCode,output,...report});
  if(exitCode)throw new Error(`Performance run ${run} failed. See ${output}`);
}
const names=[...new Set(reports.flatMap(r=>r.scenes.map(s=>s.name)))],mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const scenes=names.map(name=>{const rows=reports.map(r=>r.scenes.find(s=>s.name===name)).filter(Boolean);return {name,runs:rows.length,averageFPS:mean(rows.map(r=>r.averageFPS)),onePercentLowFPS:mean(rows.map(r=>r.onePercentLowFPS)),actualSpeed:mean(rows.map(r=>r.actualSpeed)),p95FrameMs:mean(rows.map(r=>r.p95FrameMs)),p99FrameMs:mean(rows.map(r=>r.p99FrameMs)),maxFrameMs:Math.max(...rows.map(r=>r.maxFrameMs)),gapsOver50ms:rows.reduce((n,r)=>n+r.gapsOver50ms,0),gapsOver100ms:rows.reduce((n,r)=>n+r.gapsOver100ms,0),gapsOver250ms:rows.reduce((n,r)=>n+r.gapsOver250ms,0),gapsOver500ms:rows.reduce((n,r)=>n+r.gapsOver500ms,0),averageStepMs:mean(rows.map(r=>r.averageStepMs)),averageDrawMs:mean(rows.map(r=>r.averageDrawMs)),p95DrawMs:mean(rows.map(r=>r.p95DrawMs)),allVisibleMotionStatePassed:rows.every(r=>r.visibleMotionStatePassed),allScreenshotPixelsPassed:rows.every(r=>r.screenshotPixelsPassed),realTimeTargetPassed:rows.every(r=>r.actualSpeed>=.95),runsPassed:rows.every(r=>!r.failures.length)};});
await writeFile(`evidence/v2/performance-${phase}-summary.json`,JSON.stringify({phase,repetitions,samplingSeconds:Number(process.env.PERF_SECONDS||12),reportFiles:reports.map(r=>r.output),environment:reports[0].environment,platform:reports[0].platform,browser:reports[0].browser,renderer:reports[0].renderer,contextAttributes:reports[0].canvasContextAttributes,scenes},null,2));
console.log(JSON.stringify({phase,scenes},null,2));
