// Standalone procedural art/audio fixture. This does not benchmark real game FPS.
// Browser plugin was unavailable during the recorded run; shared Playwright runtime is used.
import {launchBrowser,BASE_URL,startTestServer} from './browser-runtime.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const output=fileURLToPath(new URL('../evidence/',import.meta.url));
await mkdir(output,{recursive:true});
const stop=await startTestServer(); const browser=await launchBrowser();
try {
const page=await browser.newPage({viewport:{width:1440,height:1180},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const html=`<!doctype html><html lang="zh-CN"><head><title>GEOBATTLE — renderer verification</title><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#111c20;color:#edf0e6;font:14px system-ui,sans-serif}header{height:52px;padding:12px 24px;display:flex;align-items:center;gap:22px;border-bottom:1px solid #304047}b{font-weight:600;letter-spacing:2px}button{border:1px solid #48616b;background:#24373e;color:#edf0e6;border-radius:5px;padding:7px 12px;cursor:pointer}#field{height:570px;width:100%;display:block}.gallery{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:#293e45;border-top:1px solid #354952}.item{background:#16262c;display:flex;align-items:center;gap:12px;padding:5px 12px}.item canvas{height:64px;width:64px}.item span{color:#94a7ac;font-size:11px;display:block;margin-top:4px}</style></head><body><header><b>GEOBATTLE</b><span>36 种程序化单位 · 渲染验收</span><button id="step">推进 1 秒</button><button id="zoom">指针缩放</button></header><canvas id="field"></canvas><div class="gallery" id="gallery"></div><script type="module">
import {UNIT_LIST} from '/src/data/units.js';
import {Renderer,drawUnitIcon} from '/src/render/renderer.js';
import {SynthAudio} from '/src/render/audio.js';
const canvas=document.getElementById('field');const renderer=new Renderer(canvas);const formation=[];
for(const [index,def] of UNIT_LIST.entries()) for(const [ti,team] of ['red','blue'].entries()) formation.push({id:index*2+ti+1,type:def.id,def,team,x:ti?2120-(index%6)*115:280+(index%6)*115,y:230+Math.floor(index/6)*183,angle:ti?Math.PI:0,turretAngle:ti?Math.PI-.2:.2,radius:def.radius,mass:def.mass,hp:def.hp*.8,maxHp:def.hp,alive:true,vx:20,vy:0,attackPhase:.2,status:{burn:index%12===0?2:0,slow:index%11===0?2:0},stats:{},airborne:0});
const effects=[{id:1,kind:'explosion',x:1200,y:420,radius:82,team:'red',age:.16,duration:.55},{id:2,kind:'laser',x:940,y:800,x2:1370,y2:810,radius:430,team:'blue',age:.03,duration:.17},{id:3,kind:'shockwave',x:1170,y:1110,radius:125,team:'blue',age:.15,duration:.7},{id:4,kind:'gravity',x:1170,y:160,radius:90,team:'red',age:.18,duration:.7}];
const sim={units:formation,projectiles:[],effects,time:0,tick:0,result:null};window.renderTest={renderer,sim,formation};
function draw(){renderer.draw({formation,sim,mode:'running',showGrid:true,showZones:false,screenShake:false,quality:'high',showHealth:true});}draw();
for(const def of UNIT_LIST){const item=document.createElement('div');item.className='item';const icon=document.createElement('canvas');const text=document.createElement('div');text.textContent=def.name;const sub=document.createElement('span');sub.textContent=def.id;text.append(sub);item.append(icon,text);gallery.append(item);drawUnitIcon(icon,def.id,def.category==='scifi'?'blue':'red');}
document.getElementById('step').onclick=()=>{sim.time+=1;draw();};document.getElementById('zoom').onclick=()=>{renderer.camera.zoomAt(600,220,1.8);draw();};
window.drawAgain=draw;window.ready=true;
</script></body></html>`;
await page.route('**/render-preview',r=>r.fulfill({status:200,contentType:'text/html',body:html}));
await page.goto(new URL('/render-preview',BASE_URL).href);await page.waitForFunction(()=>window.ready);
await page.screenshot({path:output+'unit-gallery.png',fullPage:true});
const before=await page.locator('#field').screenshot();await page.evaluate(()=>window.drawAgain());const after=await page.locator('#field').screenshot();
const staticMatch=Buffer.compare(before,after)===0;
const zoomBefore=await page.evaluate(()=>window.renderTest.renderer.camera.zoom);await page.getByRole('button',{name:'指针缩放'}).click();
const zoomAfter=await page.evaluate(()=>window.renderTest.renderer.camera.zoom);
await page.getByRole('button',{name:'推进 1 秒'}).click();
await page.screenshot({path:output+'unit-gallery-zoom.png',fullPage:true});
const metrics=await page.evaluate(()=>window.renderTest.renderer.metrics);
const extra=await page.evaluate(async()=>{
 const {Renderer}=await import('/src/render/renderer.js');const {SynthAudio}=await import('/src/render/audio.js');
 const t=window.renderTest,r=t.renderer; r.draw({formation:{units:t.formation},mode:'PREPARING',hover:{type:'tank',team:'red',x:1200,y:650,angle:0,valid:false},selectionRect:{x:900,y:400,width:200,height:240}});
 const legacyMetrics={...r.metrics};
 const {UNIT_LIST}=await import('/src/data/units.js');const points=Array.from({length:1200},(_,i)=>({id:i+1,type:UNIT_LIST[i%36].id,team:i%2?'blue':'red',x:80+(i%40)*57,y:70+Math.floor(i/40)*41,angle:i%2?Math.PI:0}));r.camera.reset();
 for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);r.draw({formation:{units:points},mode:'PREPARING',quality:'auto',showZones:false});}
 window.audioQA=new SynthAudio();document.getElementById('step').onclick=async()=>{await window.audioQA.unlock();window.audioUnlocked=true;};
 return {objectFormation:{drawn:legacyMetrics.drawnUnits,quality:legacyMetrics.quality},renderer1200:{purpose:'Rendering and bounded-cache coverage only; not a gameplay FPS benchmark',frames:8,cachedSpriteCount:r._sprites.size,metrics:{...r.metrics}}};
});
await page.getByRole('button',{name:'推进 1 秒'}).click();await page.waitForFunction(()=>window.audioUnlocked);
const audioResult=await page.evaluate(()=>{const a=window.audioQA,kinds=['explosion','muzzle','laser','slash','heal','ice','impact'];const es=Array.from({length:200},(_,i)=>({id:i+1,kind:kinds[i%kinds.length],age:0,radius:60}));a.consume(es,1);const first={voices:a.voices.size,seen:a.seen.size,state:a.context?.state};a.consume(es,1);const same={voices:a.voices.size,seen:a.seen.size};a.setMuted(true);const muted={voices:a.voices.size,muted:a.muted};a.consume(Array.from({length:3000},(_,i)=>({id:i+1000,kind:'impact',age:0})),2);const boundedSeen=a.seen.size;a.consume([{id:1,kind:'impact',age:0}],0);const restarted={seen:a.seen.size,hasFirst:a.seen.has(1)};a.dispose();return {first,same,muted,boundedSeen,restarted};});
const result={extra,audioResult,title:await page.title(),cards:await page.locator('.item').count(),errors,staticFramePixelIdentical:staticMatch,zoomBefore,zoomAfter,timeAfterStep:await page.evaluate(()=>window.renderTest.sim.time),metrics,browser:await browser.version()};
console.log(JSON.stringify(result,null,2));await writeFile(output+'render-verification.json',JSON.stringify(result,null,2));
} finally { await browser.close(); stop(); }
