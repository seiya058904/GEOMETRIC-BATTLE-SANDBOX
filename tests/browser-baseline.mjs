import {mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './browser-runtime.mjs';

// A control measurement for the unexplained multi-second RAF gaps in the game.
// This page does not import or execute any game code. It is not a game benchmark.
const browser=await launchBrowser();
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await context.newPage();
const report={timestamp:new Date().toISOString(),browser:browser.version(),viewport:{width:1920,height:1080},deviceScaleFactor:1,gameCodeLoaded:false,controls:[],errors:[]};
page.on('pageerror',e=>report.errors.push(e.message));
try{
  await page.goto('data:text/html,<html><body style="margin:0;background:%23111c20"><canvas width="1920" height="1080"></canvas></body></html>');
  for(const mode of ['blank-page','canvas-solid-fill']){
    const result=await page.evaluate(async mode=>{
      const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});
      const samples=[];let last=null;const start=performance.now();
      await new Promise(resolve=>{function frame(now){if(last!=null)samples.push(now-last);last=now;if(mode==='canvas-solid-fill'){ctx.fillStyle='#111c20';ctx.fillRect(0,0,1920,1080);}if(performance.now()-start>=12000){resolve();return;}requestAnimationFrame(frame);}requestAnimationFrame(frame);});
      const sorted=samples.slice().sort((a,b)=>a-b),slow=sorted.slice(Math.floor(sorted.length*.99)),mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
      return {mode,wallSeconds:(performance.now()-start)/1000,frames:samples.length,averageFPS:1000/mean(samples),onePercentLowFPS:1000/mean(slow),medianFrameMs:sorted[Math.floor(sorted.length*.5)],maxFrameMs:sorted.at(-1),gapsOver250ms:samples.filter(x=>x>250).length,rawFrameGapsMs:samples};
    },mode);
    report.controls.push(result);console.log(JSON.stringify({...result,rawFrameGapsMs:undefined}));
  }
}catch(e){report.errors.push(e.stack||String(e));process.exitCode=1;}
finally{await mkdir('evidence',{recursive:true});await writeFile('evidence/browser-baseline.json',JSON.stringify(report,null,2));await context.close();await browser.close();}
