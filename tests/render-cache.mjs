// Isolates frozen PREPARING frame reuse from the main controller's actual formation.
import {launchBrowser,BASE_URL,startTestServer} from './browser-runtime.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const output=(process.env.GEOBATTLE_EVIDENCE||fileURLToPath(new URL('../evidence/',import.meta.url))).replace(/\/?$/, '/');
await mkdir(output,{recursive:true});
const stop=await startTestServer(); const browser=await launchBrowser();
try {
 const page=await browser.newPage({viewport:{width:1586,height:992},deviceScaleFactor:1});
 await page.goto(BASE_URL,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.geobattle?.renderer.metrics.drawnUnits>0,null,{polling:100,timeout:10000});
 const cache=await page.evaluate(async()=>{
   const {Renderer}=await import('/src/render/renderer.js');
   const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-800px;width:600px;height:400px';document.body.append(canvas);
   const r=new Renderer(canvas);r.camera.fit(geobattle.editor.formation.units);let calls=0;const field=r._field.bind(r);r._field=(...a)=>{calls++;field(...a);};
   const options={formation:geobattle.editor.formation,mode:'PREPARING',selection:new Set(),preview:[],quality:'high',showGrid:true,showHealth:false,showZones:true};
   const checks=[];function draw(label,delta,expected=1){if(delta)delta();const before=calls;r.draw(options);checks.push({label,redraws:calls-before,expected,pass:calls-before===expected});}
   draw('first frame');draw('identical PREPARING frame',null,0);
   draw('camera pan',()=>r.camera.pan(10,-7));draw('camera zoom',()=>r.camera.zoomAt(80,90,1.05));
   draw('viewport resize',()=>{canvas.style.width='620px';r.resize();});
   draw('quality',()=>options.quality='low');
   draw('hover type',()=>options.hover={type:'swordsman',team:'red',x:750,y:500,angle:0,valid:true});
   draw('hover position',()=>options.hover.x+=15);draw('hover team',()=>options.hover.team='blue');draw('hover angle',()=>options.hover.angle=.5);
   draw('hover invalid placement',()=>options.hover.valid=false);draw('hover explicit invalid',()=>options.hover.invalid=true);
   draw('hover unit id',()=>options.hover={id:options.formation.units[0].id});
   draw('hover numeric id',()=>options.hover=options.formation.units[1].id);
   draw('hover clear',()=>options.hover=null);
   draw('preview replacement',()=>options.preview=[{type:'swordsman',team:'red',x:600,y:700,angle:0}]);
   draw('preview move',()=>options.preview=options.preview.map(u=>({...u,x:u.x+30})));
   draw('preview clear',()=>options.preview=[]);
   draw('selection replacement',()=>options.selection=new Set([options.formation.units[0].id]));
   draw('selection clear',()=>options.selection=new Set());
   draw('selection rectangle',()=>options.selectionRect={x:400,y:400,width:250,height:200});
   draw('selection rectangle move',()=>options.selectionRect.x+=30);draw('selection rectangle clear',()=>options.selectionRect=null);
   draw('free deployment zones',()=>options.showZones=false);draw('grid',()=>options.showGrid=false);draw('health',()=>options.showHealth=true);
   draw('immutable formation replacement',()=>options.formation=Object.freeze({...options.formation,units:options.formation.units}));
   draw('stable frame after changes',null,0);
   draw('mutable editor fixture',()=>options.formation={...options.formation});draw('mutable editor fixture repeated');
   draw('FIGHTING',()=>{options.formation=Object.freeze(options.formation);options.mode='FIGHTING';options.sim={units:[],effects:[],projectiles:[],time:0};});
   draw('FIGHTING repeated, same time');draw('PAUSED',()=>options.mode='PAUSED');draw('PAUSED repeated');
   canvas.remove();return {scope:'Only frozen immutable PREPARING formations retain identical frames; actual editor replaces selection Sets and preview arrays.',total:checks.length,passed:checks.filter(c=>c.pass).length,checks};
 });
 await writeFile(output+'cache-verification.json',JSON.stringify(cache,null,2));console.log('Cache checks '+cache.passed+'/'+cache.total);
 if(cache.passed!==cache.total)throw new Error('Cache invalidation check failed.');
} finally { await browser.close(); stop(); }
