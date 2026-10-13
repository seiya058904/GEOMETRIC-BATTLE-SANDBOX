import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {BASE_URL,launchBrowser,startTestServer} from './browser-runtime.mjs';

const output=process.env.GEOBATTLE_EVIDENCE||`${tmpdir()}/geobattle-bulk-editor`;
await mkdir(output,{recursive:true});
const stop=await startTestServer();let browser,context,page;
const report={url:BASE_URL,browserPlugin:'absent',fallbackReason:'Browser plugin not available',cases:[],errors:[],warnings:[],screenshots:[]};
const army=()=>page.evaluate(()=>geobattle.editor.formation);
const count=async()=> (await army()).units.length;
const click=action=>page.locator(`[data-action="${action}"]:visible`).first().click();
const point=async(x,y)=>page.evaluate(({x,y})=>{const c=geobattle.renderer.camera,r=document.querySelector('#battlefield').getBoundingClientRect(),p=c.worldToScreen(x,y);return {x:r.x+p.x,y:r.y+p.y};},{x,y});
async function upload(units){await page.locator('#import-file').setInputFiles({name:'bulk.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schemaVersion:1,seed:123,units}))});await page.waitForFunction(n=>geobattle.editor.formation.units.length===n,units.length);}
async function check(name,fn){try{await fn();report.cases.push({name,pass:true});console.log(`PASS ${name}`);}catch(error){report.cases.push({name,pass:false,error:error.stack});console.log(`FAIL ${name}: ${error.message}`);}}
async function capture(name){const s=await context.newCDPSession(page);const {data}=await s.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await s.detach();await writeFile(`${output}/${name}.png`,Buffer.from(data,'base64'));report.screenshots.push(name);}
async function open(width,height,touch=false){await context?.close();context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});await page.goto(BASE_URL);await page.waitForFunction(()=>geobattle?.editor.formation.units.length===80);}
try{
 browser=await launchBrowser();report.browser=browser.version();
 for(const [w,h,touch] of [[320,568,true],[390,844,true],[768,1024,true],[844,390,true],[1366,768,false],[1920,1080,false]])await check(`clear-size-controls-${w}x${h}`,async()=>{
   await open(w,h,touch);assert.match(await page.title(),/GEOBATTLE/);assert.equal(page.url(),`${BASE_URL}/`);
   for(const selector of ['#brush-size','[data-action="quick-clear"]']){const box=await page.locator(selector).boundingBox();assert.ok(box.width>=44&&box.height>=44);assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=w&&box.y+box.height<=h);assert.equal(await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);}
   const before=await army();await click('quick-clear');assert.equal(await count(),0);assert.equal(await page.locator('dialog').isVisible(),false);await click('undo');assert.deepEqual(await army(),before);await page.locator('#brush-size').selectOption('large');assert.equal(await page.evaluate(()=>geobattle.brushSize),'large');await capture(`${w}x${h}`);
 });
 await check('wide-deployment-and-fast-sweep-undo',async()=>{
   await open(1366,768);await click('quick-clear');await click('reset-camera');await page.locator('#brush-size').selectOption('large');
   let a=await point(400,600),b=await point(750,600);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y);await page.mouse.up();
   const before=await army();assert.ok(before.units.length>30,JSON.stringify({count:before.units.length,a,b,state:await page.evaluate(()=>({tool:geobattle.tool,size:geobattle.brushSize,drag:geobattle.input.drag,toast:document.querySelector('#toast').textContent}))}));assert.ok(new Set(before.units.map(u=>u.y)).size>=5);assert.ok(before.units.every(u=>u.team==='red'));
   await click('undo');assert.equal(await count(),0);await click('redo');assert.deepEqual(await army(),before);
   await page.mouse.move(a.x,a.y);await page.mouse.down({button:'right'});await page.mouse.move(b.x,b.y);await page.mouse.up({button:'right'});assert.equal(await count(),0);await click('undo');assert.deepEqual(await army(),before);
   await click('tool-erase');await page.locator('#brush-size').selectOption('medium');await page.mouse.move(a.x,a.y);const radius=await page.evaluate(()=>geobattle.input.renderState().hover.brushRadius*geobattle.renderer.camera.zoom);assert.equal(radius,28);await click('zoom-in');assert.equal(await page.evaluate(()=>geobattle.input.brushExtent(true)*geobattle.renderer.camera.zoom),28);
 });
 await check('sparse-drag-touch-cancel-and-clear-autosave',async()=>{
   await open(390,844,true);const units=[];for(const team of ['red','blue'])for(let i=0;i<5;i++)units.push({id:units.length+1,type:'peasant',team,x:(team==='red'?400:1600)+i*50,y:650,angle:team==='red'?0:Math.PI});await upload(units);await click('reset-camera');await page.locator('#brush-size').selectOption('large');await click('tool-erase');
   const before=await army(),a=await point(380,650),b=await point(1700,650),session=await context.newCDPSession(page);
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});await page.waitForFunction(()=>geobattle.editor.formation.units.length<10,null,{timeout:1500});
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1},{x:a.x+35,y:a.y+35,id:2}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.deepEqual(await army(),before);
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...b,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();assert.equal(await count(),0);await click('undo');assert.deepEqual(await army(),before);
   await click('quick-clear');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('geobattle.autosave.v1'))?.units?.length===0);await page.reload();await page.waitForFunction(()=>window.geobattle);assert.equal(await count(),0);
 });
 await check('bulk-controls-locked-during-battle-and-restored-on-return',async()=>{
   await open(844,390,true);await page.locator('#brush-size').selectOption('large');const before=await army();await click('start');assert.equal(await page.locator('.edit-controls').isVisible(),false);await click('return');assert.equal(await page.locator('.edit-controls').isVisible(),true);assert.deepEqual(await army(),before);assert.equal(await page.locator('#brush-size').inputValue(),'large');
 });
}finally{
 report.summary={pass:report.cases.filter(c=>c.pass).length,fail:report.cases.filter(c=>!c.pass).length,errors:report.errors.length,warnings:report.warnings.length};await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));await context?.close();await browser?.close();stop();console.log(JSON.stringify(report.summary));
}
if(report.summary.fail||report.summary.errors)process.exitCode=1;
