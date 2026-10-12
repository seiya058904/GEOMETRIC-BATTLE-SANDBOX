import {writeFile,mkdir} from 'node:fs/promises';
import {launchBrowser,startTestServer,BASE_URL} from './browser-runtime.mjs';
const units=[];let id=1;const types=['swordsman','rifleman','archer','wolf'];
for(const team of ['red','blue'])for(let i=0;i<100;i++){const x=660+(i%10)*35;units.push({id:id++,type:types[i%4],team,x:team==='red'?x:2400-x,y:470+Math.floor(i/10)*43,angle:team==='red'?0:Math.PI});}
const formation={schemaVersion:1,seed:314159,units};
const grid=process.env.DIAGNOSTIC_GRID!=='0',qualities=process.env.DIAGNOSTIC_QUALITY?[process.env.DIAGNOSTIC_QUALITY]:['high','low'];
const stop=await startTestServer(),browser=await launchBrowser(),context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1}),page=await context.newPage();
const report={timestamp:new Date().toISOString(),browser:browser.version(),purpose:'Diagnose high/low quality, DOM work and main-thread long tasks; separate from the fixed-layout scale matrix.',phases:[],errors:[]};
page.on('pageerror',e=>report.errors.push(e.message));
const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
try{
  await page.goto(BASE_URL,{waitUntil:'networkidle'});await page.bringToFront();
  for(const quality of qualities){
    const before=await metrics();
    const measured=await page.evaluate(async({formation,quality,grid})=>{
      const a=geobattle;a.returnToEditor();const placement=a.editor.setFormation(formation);if(!placement.ok)throw Error(placement.message);a.settings.quality=quality;a.settings.showGrid=grid;a.speed=1;a.renderer.camera.reset();a.start();
      const costs={refreshInspector:[],refreshCounters:[]},original={};for(const name of Object.keys(costs)){original[name]=a[name];a[name]=function(...args){const start=performance.now();const value=original[name].apply(this,args);costs[name].push(performance.now()-start);return value;};}
      const longTasks=[],observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));observer.observe({entryTypes:['longtask']});
      const gaps=[];let last=null;const start=performance.now();await new Promise(resolve=>{function sample(now){if(last!=null)gaps.push(now-last);last=now;if(performance.now()-start>=12000||a.sim.result){resolve();return;}requestAnimationFrame(sample);}requestAnimationFrame(sample);});
      observer.disconnect();for(const name of Object.keys(costs))a[name]=original[name];
      const sum=x=>x.reduce((a,b)=>a+b,0),sorted=gaps.slice().sort((a,b)=>a-b);
      return {quality,grid,wallSeconds:(performance.now()-start)/1000,simSeconds:a.sim.time,active:a.sim.activeCount,frames:gaps.length,averageFPS:1000*gaps.length/sum(gaps),medianFrameMs:sorted[Math.floor(sorted.length*.5)],maxFrameMs:sorted.at(-1),gapsOver250ms:gaps.filter(x=>x>250).length,longTasks,uiCosts:Object.fromEntries(Object.entries(costs).map(([k,v])=>[k,{calls:v.length,totalMs:sum(v),maxMs:Math.max(0,...v)}])),rawFrameGapsMs:gaps};
    },{formation,quality,grid});
    const after=await metrics();measured.devtoolsDelta=Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'].map(k=>[k,after[k]-before[k]]));
    report.phases.push(measured);console.log(JSON.stringify({...measured,rawFrameGapsMs:undefined,longTasks:measured.longTasks.map(x=>x.duration)}));
  }
}catch(e){report.errors.push(e.stack||String(e));process.exitCode=1;}
finally{await mkdir('evidence',{recursive:true});await writeFile(grid?'evidence/browser-diagnostic.json':'evidence/browser-diagnostic-no-grid.json',JSON.stringify(report,null,2));await cdp.detach().catch(()=>{});await context.close();await browser.close();stop();}
