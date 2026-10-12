import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {cpus,totalmem,platform,arch} from 'node:os';
import {inflateSync} from 'node:zlib';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {launchBrowser,BASE_URL,startTestServer} from './browser-runtime.mjs';

// Decode browser PNGs without adding a runtime dependency. Inspect composited
// screenshot pixels rather than Canvas readback: desynchronized canvases can
// contain commanded pixels while the browser actually presents a blank layer.
export async function screenshotPixelSummary(path){
  const png=await readFile(path),chunks=[];let width=0,height=0,channels=0;
  for(let p=8;p<png.length;){const size=png.readUInt32BE(p),type=png.toString('ascii',p+4,p+8),data=png.subarray(p+8,p+8+size);if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);channels=data[9]===6?4:data[9]===2?3:0;if(data[8]!==8||!channels||data[12])throw new Error('Unsupported screenshot PNG.');}if(type==='IDAT')chunks.push(data);p+=size+12;}
  const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels;let previous=Buffer.alloc(stride),offset=0,redPixels=0,bluePixels=0,checksum=0;
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){const filter=raw[offset++],row=Buffer.allocUnsafe(stride);for(let i=0;i<stride;i++){const left=i>=channels?row[i-channels]:0,up=previous[i],corner=i>=channels?previous[i-channels]:0;const predictor=filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):filter===4?paeth(left,up,corner):NaN;if(!Number.isFinite(predictor))throw new Error('Invalid PNG filter.');row[i]=(raw[offset++]+predictor)&255;}
    if(y>height*.08&&y<height*.9)for(let x=Math.floor(width*.03);x<width*.97;x++){const i=x*channels,r=row[i],g=row[i+1],b=row[i+2];if(r>80&&r>g*1.35&&r>b*1.35)redPixels++;if(b>90&&b>r*1.25&&b>g*1.12)bluePixels++;checksum=(checksum+r+g*3+b*7)>>>0;}
    previous=row;
  }
  return {width,height,redPixels,bluePixels,checksum,teamsVisible:redPixels>3&&bluePixels>3};
}

function battleFormation(perTeam,types,seed=314159){
  const units=[];let id=1;const columns=Math.min(20,Math.ceil(Math.sqrt(perTeam*.75))),rows=Math.ceil(perTeam/columns);
  const spacing=Math.min(50,1120/Math.max(1,rows-1));
  for(const team of ['red','blue'])for(let i=0;i<perTeam;i++){
    const col=i%columns,row=Math.floor(i/columns),x=220+col*spacing,y=675+(row-(rows-1)/2)*spacing;
    units.push({id:id++,type:types[i%types.length],team,x:team==='red'?x:2400-x,y,angle:team==='red'?0:Math.PI});
  }
  return {schemaVersion:1,seed,units};
}
function heavyFormation(){const units=[];let id=1;const types=['tank','rocketeer','fire_mage','machine_gunner','necromancer','bomb_chicken','giant','mech'];for(const team of ['red','blue'])for(let i=0;i<120;i++){const x=160+i%8*94;units.push({id:id++,type:types[i%8],team,x:team==='red'?x:2400-x,y:130+Math.floor(i/8)*78,angle:team==='red'?0:Math.PI});}return {schemaVersion:1,seed:424242,units};}
const scenes=[
  ['1-vs-1',battleFormation(1,['peasant'])],
  ['10-vs-10',battleFormation(10,['swordsman','archer'])],
  ['100-vs-100',battleFormation(100,['swordsman','rifleman','archer','wolf'])],
  ['300-vs-300',battleFormation(300,['swordsman','rifleman','machine_gunner','wolf'])],
  ['500-vs-500',battleFormation(500,['peasant','archer','machine_gunner','wolf'])],
  ['600-vs-600',battleFormation(600,['peasant','rifleman','machine_gunner','wolf'])],
  ['extreme-effects',heavyFormation()],
];
const sceneFilter=process.env.PERF_SCENE||null,longRunRequested=process.env.GEOBATTLE_LONGRUN==='1';
if(sceneFilter&&sceneFilter!=='none'&&!scenes.some(([name])=>name===sceneFilter))throw new Error(`Unknown PERF_SCENE: ${sceneFilter}`);
if(sceneFilter==='none'&&!longRunRequested)throw new Error('PERF_SCENE=none requires GEOBATTLE_LONGRUN=1; no empty successful report.');
const sceneSeconds=Number(process.env.PERF_SECONDS||12);
if(!Number.isFinite(sceneSeconds)||sceneSeconds<2)throw new Error('PERF_SECONDS must be at least 2.');
const longTargets={wallSeconds:Math.max(180,Number(process.env.LONGRUN_SECONDS||180)),simulationSeconds:180,completedReplays:3};
const longQuality=process.env.LONGRUN_QUALITY||'auto';
if(!['auto','high','medium','low'].includes(longQuality))throw new Error('Invalid LONGRUN_QUALITY.');
const longSpeed=Number(process.env.LONGRUN_SPEED||4),longMaxSeconds=Number(process.env.LONGRUN_MAX_SECONDS||Math.max(360,longTargets.wallSeconds*2));
if(longRunRequested&&(!Number.isFinite(longTargets.wallSeconds)||!Number.isFinite(longMaxSeconds)||longMaxSeconds<longTargets.wallSeconds||![.25,.5,1,2,4].includes(longSpeed)))throw new Error('Invalid long-run duration, maximum wall time or speed.');
const output=process.env.PERF_OUTPUT||(sceneFilter==='none'?'evidence/browser-longrun.json':sceneFilter?`evidence/performance-${sceneFilter}.json`:'evidence/browser-performance.json');
const readOptional=async path=>{try{return(await readFile(path,'utf8')).trim();}catch{return null;}};
const [cpuMax,memoryMax]=await Promise.all([readOptional('/sys/fs/cgroup/cpu.max'),readOptional('/sys/fs/cgroup/memory.max')]);
const cpuParts=cpuMax?.split(/\s+/),quotaCores=cpuParts&&cpuParts[0]!=='max'?Number(cpuParts[0])/Number(cpuParts[1]):null;
await mkdir('evidence',{recursive:true});const stop=await startTestServer();const browser=await launchBrowser();
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
let longHeapSession=null,longProcessSession=null,traceSession=null;
const processTelemetry=async()=>{
  const processes=(await longProcessSession.send('SystemInfo.getProcessInfo')).processInfo;
  if(platform()!=='win32')return {processes,windowsWorkingSets:null};
  const ids=processes.map(p=>p.id).filter(Number.isInteger);
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,CPU,WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress`],{windowsHide:true});
  return {processes,windowsWorkingSets:JSON.parse(stdout||'[]')};
};
const report={timestamp:new Date().toISOString(),browser:browser.version(),platform:platform(),architecture:arch(),
  environment:{softwareCanvasControl:process.env.GEOBATTLE_QA_SOFTWARE_CANVAS==='1',synchronizedCanvasControl:process.env.GEOBATTLE_QA_SYNCHRONIZED_CANVAS==='1',cpuBackingControl:process.env.GEOBATTLE_QA_CPU_BACKING==='1',requestedCpuBackingOverride:process.env.GEOBATTLE_QA_CPU_BACKING??null,reportedLogicalCPUs:cpus().length,hostCPUModel:cpus()[0]?.model,hostReportedMemoryGiB:totalmem()/1024**3,cgroup:{cpuMax,cpuQuotaCores:Number.isFinite(quotaCores)?quotaCores:null,memoryMax,memoryLimitBytes:memoryMax&&memoryMax!=='max'?Number(memoryMax):null}},
  viewport:{width:1920,height:1080},deviceScaleFactor:1,sourceURL:BASE_URL,nativeGPURequested:process.env.GEOBATTLE_QA_NATIVE_GPU==='1',requestedContextAttributeOverride:process.env.PERF_CONTEXT_ATTRIBUTES?JSON.parse(process.env.PERF_CONTEXT_ATTRIBUTES):null,renderer:null,scenes:[],errors,passed:false,
  limitations:['Headless Chromium; native-GPU request and actual renderer are recorded. Default launch forces SwiftShader. This is not physical-display or Android playtesting.',
    'os.cpus()/totalmem() are host-reported values, not an allocation claim; readable cgroup limits are recorded separately.',
    'All observed raw RAF gaps are retained, including startup and outliers. Draw CPU timing excludes asynchronous browser compositing.',
    'Average step CPU time is the sum of measured Simulation.step work divided by actual executed ticks. HUD EMA is reported separately.',
    'Scene timing stops at natural battle completion rather than averaging idle result-dialog frames.',
    'performance.memory is coarse browser telemetry and cannot establish heap stability. Long-run checkpoints additionally read Runtime.getHeapUsage through one CDP session without forcing GC.',
    'Long-run observer gaps include checkpoint boundaries; CDP heap reads occur between segments and do not affect scene FPS samples.']};
if(sceneFilter==='none')report.limitations.push('Only the long-run validation was selected; this invocation makes no scene benchmark claim.');
const checkpoint=()=>writeFile(output,JSON.stringify(report,null,2));
try{
  if(process.env.GEOBATTLE_QA_SYNCHRONIZED_CANVAS==='1')await context.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,options){return original.call(this,type,type==='2d'&&this.id==='battlefield'?{...options,desynchronized:false}:options);};
  });
  if(['0','1'].includes(process.env.GEOBATTLE_QA_CPU_BACKING))await context.addInitScript((enabled)=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,options){return original.call(this,type,type==='2d'&&this.id==='battlefield'?{...options,willReadFrequently:enabled}:options);};
  },process.env.GEOBATTLE_QA_CPU_BACKING==='1');
  if(process.env.PERF_CONTEXT_ATTRIBUTES)await context.addInitScript((attributes)=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,options){return original.call(this,type,type==='2d'&&this.id==='battlefield'?{...options,...attributes}:options);};
  },JSON.parse(process.env.PERF_CONTEXT_ATTRIBUTES));
  await page.goto(BASE_URL,{waitUntil:'networkidle'});await page.bringToFront();
  report.canvasContextAttributes=await page.evaluate(()=>geobattle.renderer.ctx.getContextAttributes?.()??null);
  report.renderer=await page.evaluate(()=>{const c=document.createElement('canvas'),g=c.getContext('webgl');if(!g)return 'WebGL unavailable; Canvas2D';const ext=g.getExtension('WEBGL_debug_renderer_info');return ext?g.getParameter(ext.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER);});
  report.hardwareBackendConfirmed=/AMD|NVIDIA|Intel|Apple|Adreno|Mali|PowerVR/i.test(report.renderer)&&!/SwiftShader|llvmpipe|softpipe|software|Basic Render Driver/i.test(report.renderer);
  if(process.env.GEOBATTLE_QA_NATIVE_GPU==='1'){const gpuSession=await browser.newBrowserCDPSession();try{report.systemGPUInfo=await gpuSession.send('SystemInfo.getInfo');report.effectiveGPUCommandLine=(await gpuSession.send('Browser.getBrowserCommandLine')).arguments.filter(a=>/angle|gpu|headless|use-gl/.test(a));}finally{await gpuSession.detach();}}
  if(process.env.PERF_TRACE){traceSession=await context.newCDPSession(page);await traceSession.send('Tracing.start',{categories:'devtools.timeline,disabled-by-default-devtools.timeline,blink,cc,gpu',transferMode:'ReturnAsStream'});}
  for(const [name,formation] of scenes.filter(([name])=>sceneFilter!=='none'&&(!sceneFilter||sceneFilter===name))){
    await page.bringToFront();
    const result=await page.evaluate(async({formation,seconds,profileTicks})=>{
      const a=window.geobattle;a.returnToEditor();const placement=a.editor.setFormation(formation);if(!placement.ok)throw new Error(placement.message);
      a.renderer.camera.reset();a.settings.quality='auto';a.settings.autoCamera=false;a.settings.screenShake=true;a.speed=1;a.start();
      if(a.mode!=='FIGHTING')throw new Error('Scene did not start.');
      const tickDurations=[];
      if(profileTicks){const original=a.sim.step;a.sim.step=function(...args){const start=performance.now();const value=original.apply(this,args);tickDurations.push(performance.now()-start);return value;};}
      const startWall=performance.now(),startSim=a.sim.time,samples=[],failures=[];let lastRAF=null,lastGameFrame=-1,ended=false;
      await new Promise(resolve=>{
        let observerRAF=0,finished=false;
        const watchdog=setTimeout(()=>{failures.push('RAF observer did not complete within the wall-time watchdog.');finish();},Math.max(30000,(seconds+15)*1000));
        function finish(){if(finished)return;finished=true;clearTimeout(watchdog);cancelAnimationFrame(observerRAF);resolve();}
        function sample(now){
          if(finished)return;
          if(document.hidden||document.visibilityState!=='visible'||a.mode==='PAUSED'){failures.push('Scene lost foreground visibility or was paused.');finish();return;}
          const freshFrame=a.rafCount!==lastGameFrame;
          samples.push({raf:now,wallSeconds:(performance.now()-startWall)/1000,gapMs:lastRAF==null?null:now-lastRAF,
            gameFrame:a.rafCount,steps:freshFrame?a.lastFrameSteps:0,stepCpuMs:freshFrame?a.lastFrameStepMs:0,
            drawCpuMs:freshFrame?a.drawMs:null,simTime:a.sim.time,active:a.sim.activeCount,mode:a.mode});
          lastGameFrame=a.rafCount;lastRAF=now;
          if(a.sim.result){ended=true;finish();return;}
          if(performance.now()-startWall>=seconds*1000){finish();return;}
          observerRAF=requestAnimationFrame(sample);
        }
        observerRAF=requestAnimationFrame(sample);
      });
      const wallSeconds=(performance.now()-startWall)/1000,simDelta=a.sim.time-startSim;
      const times=samples.map(s=>s.gapMs).filter(t=>t!=null),sorted=times.slice().sort((x,y)=>x-y),slow=sorted.slice(Math.floor(sorted.length*.99));
      const totalSteps=samples.reduce((sum,s)=>sum+s.steps,0),totalStepCpuMs=samples.reduce((sum,s)=>sum+s.stepCpuMs,0),draws=samples.map(s=>s.drawCpuMs).filter(v=>v!=null);
      const mean=list=>list.length?list.reduce((x,y)=>x+y,0)/list.length:null;
      if(!times.length||!totalSteps)failures.push('Insufficient live RAF/tick samples.');
      return {frames:times.length,wallSeconds,simDelta,averageFPS:times.length?1000/mean(times):null,
        onePercentLowFPS:slow.length?1000/mean(slow):null,medianFrameMs:sorted[Math.floor(sorted.length*.5)]??null,p95FrameMs:sorted[Math.floor(sorted.length*.95)]??null,
        maxFrameMs:sorted.at(-1)??null,gapsOver250ms:times.filter(t=>t>250).length,
        totalSteps,totalStepCpuMs,averageStepMs:totalSteps?totalStepCpuMs/totalSteps:null,averageDrawMs:mean(draws),
        requestedSpeed:a.speed,actualSpeed:simDelta/wallSeconds,hudLatestWindowSpeed:a.realSpeed,hudStepEMA:a.stepMs,
        simSeconds:a.sim.time,ended,unitsStart:formation.units.length,unitsEnd:a.sim.activeCount,minAlive:samples.length?Math.min(...samples.map(s=>s.active)):null,
        projectilePeak:a.sim.projectilePeak,effectCount:a.sim.effects.length,drawMetrics:{...a.renderer.metrics},
        simulationFinite:a.sim.units.every(u=>[u.x,u.y,u.vx,u.vy,u.hp].every(Number.isFinite))&&a.sim.projectiles.every(p=>[p.x,p.y,p.vx,p.vy].every(Number.isFinite)),
        heapBytes:performance.memory?.usedJSHeapSize??null,tickProfileEnabled:profileTicks,rawTickDurationsMs:profileTicks?tickDurations:null,failures,rawSamples:samples};
    },{formation,seconds:sceneSeconds,profileTicks:process.env.PERF_TICK_PROFILE==='1'});
    const percentile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length*p)]??null;
    const gaps=result.rawSamples.map(s=>s.gapMs).filter(v=>v!=null),draws=result.rawSamples.map(s=>s.drawCpuMs).filter(v=>v!=null);
    Object.assign(result,{p99FrameMs:percentile(gaps,.99),p95DrawMs:percentile(draws,.95),p95FrameMeanStepMs:percentile(result.rawSamples.filter(s=>s.steps).map(s=>s.stepCpuMs/s.steps),.95),gapsOver50ms:gaps.filter(v=>v>50).length,gapsOver100ms:gaps.filter(v=>v>100).length,gapsOver500ms:gaps.filter(v=>v>500).length});
    if(result.rawTickDurationsMs){result.p95TickMs=percentile(result.rawTickDurationsMs,.95);result.averageProfiledTickMs=result.rawTickDurationsMs.reduce((a,b)=>a+b,0)/result.rawTickDurationsMs.length;result.profiledTickCount=result.rawTickDurationsMs.length;}
    if(process.env.PERF_CAPTURE_PREFIX){
      // Screenshots are separate from the FPS window to avoid readback stalls.
      await page.evaluate(formation=>{const a=geobattle;a.returnToEditor();const r=a.editor.setFormation(formation);if(!r.ok)throw new Error(r.message);a.renderer.camera.reset();a.start();},formation);
      result.visibility=[];
      for(let frame=1;frame<=2;frame++){
        await page.waitForTimeout(500);
        const state=await page.evaluate(()=>({simTime:geobattle.sim.time,drawnUnits:geobattle.renderer.metrics.drawnUnits,units:geobattle.sim.units.filter(u=>u.alive).map(u=>({id:u.id,x:u.x,y:u.y,team:u.team})),canvas:{width:geobattle.renderer.canvas.width,height:geobattle.renderer.canvas.height}}));
        const path=`${process.env.PERF_CAPTURE_PREFIX}-${name}-frame-${frame}.png`;await page.locator('#battlefield').screenshot({path});result.visibility.push({path,...state,pixels:await screenshotPixelSummary(path)});
      }
      const [before,after]=result.visibility;
      result.visibleMotionStatePassed=before.drawnUnits>0&&after.drawnUnits>0&&after.simTime>before.simTime&&before.units.some(u=>after.units.some(v=>v.id===u.id&&(Math.abs(v.x-u.x)>.01||Math.abs(v.y-u.y)>.01)));
      if(!result.visibleMotionStatePassed)result.failures.push('Visible-motion state probe failed; screenshot pixels require separate visual review.');
      result.screenshotPixelsPassed=before.pixels.teamsVisible&&after.pixels.teamsVisible&&before.pixels.checksum!==after.pixels.checksum;
      if(!result.screenshotPixelsPassed)result.failures.push('Composited screenshot pixels are blank, omit a team, or did not change.');
    }
    report.scenes.push({name,...result});console.log(JSON.stringify({name,...result,rawSamples:undefined,rawTickDurationsMs:undefined,visibility:undefined}));
    await checkpoint();
  }
  if(longRunRequested){
    await page.bringToFront();
    const formation=battleFormation(100,['swordsman','rifleman','fire_mage','bomb_chicken'],99331);
    await page.evaluate(({formation,speed,quality,targets,maxSeconds})=>{
      const a=window.geobattle;a.returnToEditor();const placement=a.editor.setFormation(formation);if(!placement.ok)throw new Error(placement.message);
      a.speed=speed;a.settings.quality=quality;a.settings.autoCamera=false;a.renderer.camera.reset();a.start();
      if(a.mode!=='FIGHTING'||document.hidden)throw new Error('Long run must start with an active foreground battle.');
      const now=performance.now();window.__geobattleLongRun={startWall:now,lastProgressWall:now,lastRAF:null,currentSim:a.sim,lastSimTime:a.sim.time,
        cumulativeSimulationSeconds:0,naturalCompletions:0,replaysStarted:0,completedReplays:0,results:[],firstResultSignature:null,
        finite:true,failures:[],targets,maxSeconds,requestedSpeed:speed,done:false,passed:false};
    },{formation,speed:longSpeed,quality:longQuality,targets:longTargets,maxSeconds:longMaxSeconds});
    report.longRun={targets:longTargets,maxWallSeconds:longMaxSeconds,requestedSpeed:longSpeed,requestedQuality:longQuality,passed:false,series:[],memoryMeasurementErrors:[],memoryMethod:'One CDP session / Runtime.getHeapUsage, checkpoint reads only, no forced GC'};
    try{longHeapSession=await context.newCDPSession(page);await longHeapSession.send('Performance.enable');report.longRun.performanceMetricsStart=(await longHeapSession.send('Performance.getMetrics')).metrics;report.longRun.cdpHeapStart={...await longHeapSession.send('Runtime.getHeapUsage'),sampleAtUTC:new Date().toISOString()};}
    catch(error){report.longRun.memoryMeasurementErrors.push(`Initial CDP heap read: ${error.message}`);}
    try{longProcessSession=await browser.newBrowserCDPSession();report.longRun.processTelemetryStart=await processTelemetry();}catch(error){report.longRun.processTelemetryError=error.message;}
    await checkpoint();
    while(!report.longRun.done){
      await page.bringToFront();
      const segment=await page.evaluate(async()=>{
        const state=window.__geobattleLongRun,segmentStart=performance.now(),segmentSimStart=state.cumulativeSimulationSeconds,rawFrameGapsMs=[];
        const finiteSim=sim=>Number.isFinite(sim.time)&&sim.units.every(u=>[u.x,u.y,u.vx,u.vy,u.hp].every(Number.isFinite))&&sim.projectiles.every(p=>[p.x,p.y,p.vx,p.vy].every(Number.isFinite));
        await new Promise(resolve=>{
          let observerRAF=0,finished=false;
          const watchdog=setTimeout(()=>{state.failures.push('No completed RAF checkpoint within 35 seconds.');state.done=true;finish();},35000);
          const finish=()=>{if(finished)return;finished=true;clearTimeout(watchdog);cancelAnimationFrame(observerRAF);resolve();};
          function sample(now){
            if(finished)return;
            const wall=performance.now(),a=window.geobattle;
            if(state.lastRAF!=null)rawFrameGapsMs.push(now-state.lastRAF);state.lastRAF=now;
            if(document.hidden||document.visibilityState!=='visible'||a.mode==='PAUSED')state.failures.push('Long run lost foreground visibility or entered PAUSED.');
            if(a.mode!=='FIGHTING'&&a.mode!=='FINISHED')state.failures.push(`Unexpected game mode: ${a.mode}`);
            if(a.sim!==state.currentSim)state.failures.push('Simulation instance changed outside a natural-completion replay.');
            if(!a.sim||!finiteSim(a.sim)){state.finite=false;state.failures.push('Nonfinite or missing simulation state.');}
            if(state.failures.length){state.done=true;finish();return;}
            const delta=a.sim.time-state.lastSimTime;
            if(delta<0){state.failures.push('Simulation time moved backwards within one match.');state.done=true;finish();return;}
            state.cumulativeSimulationSeconds+=delta;state.lastSimTime=a.sim.time;
            if(delta>0)state.lastProgressWall=wall;
            if(a.mode==='FINISHED'){
              if(!a.sim.result){state.failures.push('FINISHED without an authoritative simulation result.');state.done=true;finish();return;}
              const result=a.sim.result,signature=JSON.stringify(result);
              if(state.firstResultSignature==null)state.firstResultSignature=signature;
              else if(signature!==state.firstResultSignature){state.failures.push('Same-seed naturally completed replay changed its result.');state.done=true;finish();return;}
              state.naturalCompletions++;state.completedReplays=Math.max(0,state.naturalCompletions-1);
              state.results.push({index:state.naturalCompletions,wallSeconds:(wall-state.startWall)/1000,duration:result.duration,winner:result.winner,reason:result.reason,tick:a.sim.tick});
              a.replay(false);state.replaysStarted++;state.currentSim=a.sim;state.lastSimTime=a.sim.time;state.lastProgressWall=wall;
              if(a.mode!=='FIGHTING')state.failures.push('Natural result could not start its replay.');
            }
            if(wall-state.lastProgressWall>5000)state.failures.push('No genuine simulation-clock progress for over 5 seconds.');
            const elapsed=(wall-state.startWall)/1000;
            state.passed=state.finite&&!state.failures.length&&elapsed>=state.targets.wallSeconds&&state.cumulativeSimulationSeconds>=state.targets.simulationSeconds&&state.completedReplays>=state.targets.completedReplays;
            if(state.passed)state.done=true;
            if(!state.done&&elapsed>=state.maxSeconds){state.failures.push('Maximum wall time reached before all wall/simulation/natural-replay gates passed.');state.done=true;}
            if(state.failures.length)state.done=true;
            if(state.done||wall-segmentStart>=15000){finish();return;}
            observerRAF=requestAnimationFrame(sample);
          }
          observerRAF=requestAnimationFrame(sample);
        });
        const a=window.geobattle,wall=performance.now(),sim=a.sim;
        return {wallSeconds:(wall-state.startWall)/1000,segmentWallSeconds:(wall-segmentStart)/1000,
          cumulativeSimulationSeconds:state.cumulativeSimulationSeconds,segmentSimulationSeconds:state.cumulativeSimulationSeconds-segmentSimStart,
          actualSpeed:state.cumulativeSimulationSeconds/((wall-state.startWall)/1000),hudLatestWindowSpeed:a.realSpeed,
          simTime:sim?.time??null,mode:a.mode,active:sim?.activeCount??null,entities:sim?.units.length??null,projectiles:sim?.projectiles.length??null,effects:sim?.effects.length??null,
          pooledProjectiles:sim?.projectilePool.length??null,pooledEffects:sim?.effectPool.length??null,heapBytes:performance.memory?.usedJSHeapSize??null,
          naturalCompletions:state.naturalCompletions,replaysStarted:state.replaysStarted,completedReplays:state.completedReplays,
          finite:state.finite,failures:[...state.failures],done:state.done,passed:state.passed,results:[...state.results],
          rawFrameGapsMs,checkpointBoundaryGapMs:rawFrameGapsMs[0]??null,maxFrameGapMs:rawFrameGapsMs.length?Math.max(...rawFrameGapsMs):null,gapsOver250ms:rawFrameGapsMs.filter(g=>g>250).length};
      });
      if(longHeapSession){
        try{segment.cdpHeap={...await longHeapSession.send('Runtime.getHeapUsage'),sampleAtUTC:new Date().toISOString()};segment.performanceMetrics=(await longHeapSession.send('Performance.getMetrics')).metrics;report.longRun.cdpHeapEnd=segment.cdpHeap;}
        catch(error){segment.cdpHeapError=error.message;report.longRun.memoryMeasurementErrors.push(`Checkpoint ${report.longRun.series.length+1}: ${error.message}`);}
      }
      if(longProcessSession){try{segment.processTelemetry=await processTelemetry();}catch(error){segment.processTelemetryError=error.message;}}
      report.longRun.series.push(segment);
      if(process.env.PERF_CAPTURE_PREFIX){const path=`${process.env.PERF_CAPTURE_PREFIX}-longrun-${report.longRun.series.length}.png`;await page.locator('#battlefield').screenshot({path});segment.screenshot={path,pixels:await screenshotPixelSummary(path)};}
      Object.assign(report.longRun,{seconds:segment.wallSeconds,cumulativeSimulationSeconds:segment.cumulativeSimulationSeconds,
        actualSpeed:segment.actualSpeed,naturalCompletions:segment.naturalCompletions,replays:segment.replaysStarted,completedReplays:segment.completedReplays,
        finite:segment.finite,failures:segment.failures,done:segment.done,passed:segment.passed&&errors.length===0,results:segment.results});
      console.log(JSON.stringify({longrunSegment:report.longRun.series.length,...segment,rawFrameGapsMs:undefined,results:undefined}));
      await checkpoint();
      if(errors.length){report.longRun.done=true;report.longRun.passed=false;report.longRun.failures.push('Page errors were recorded.');}
    }
    report.longRun.memoryEvidenceComplete=!!report.longRun.cdpHeapStart&&report.longRun.series.every(s=>!!s.cdpHeap)&&report.longRun.memoryMeasurementErrors.length===0;
    if(report.longRun.cdpHeapStart&&report.longRun.cdpHeapEnd)report.longRun.heapUsedDeltaBytes=report.longRun.cdpHeapEnd.usedSize-report.longRun.cdpHeapStart.usedSize;
  }
  report.passed=errors.length===0&&report.scenes.every(s=>s.simulationFinite&&s.failures.length===0&&s.totalSteps>0)&&(!longRunRequested||report.longRun?.passed===true);
}catch(error){report.fatalError=error.stack||String(error);report.passed=false;console.error(report.fatalError);}
finally{
  if(traceSession){
    const completed=new Promise(resolve=>traceSession.once('Tracing.tracingComplete',resolve));
    await traceSession.send('Tracing.end');const {stream}=await completed;let data='';
    while(true){const chunk=await traceSession.send('IO.read',{handle:stream});data+=chunk.data;if(chunk.eof)break;}
    await traceSession.send('IO.close',{handle:stream});await writeFile(process.env.PERF_TRACE,data);await traceSession.detach();
  }
  await checkpoint();if(longHeapSession)await longHeapSession.detach().catch(()=>{});if(longProcessSession)await longProcessSession.detach().catch(()=>{});await context.close();await browser.close();stop();
}
if(!report.passed)process.exitCode=1;
