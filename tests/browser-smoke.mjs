import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser,BASE_URL,startTestServer} from './browser-runtime.mjs';
await mkdir('evidence',{recursive:true});
const stop=await startTestServer(),browser=await launchBrowser();
const page=await browser.newPage({viewport:{width:1586,height:992},deviceScaleFactor:1});
const report={timestamp:new Date().toISOString(),browser:browser.version(),production:process.env.GEOBATTLE_TEST_DIST==='1',errors:[],checks:[],captures:[]};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
const cdp=await page.context().newCDPSession(page);
async function capture(name){const result=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});await writeFile(`evidence/${name}`,Buffer.from(result.data,'base64'));report.captures.push(name);}
try{
  await page.goto(BASE_URL,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.geobattle?.renderer.metrics.drawnUnits===80);
  await page.evaluate(()=>document.fonts.ready);
  await capture('desktop-first.png');
  report.checks.push({name:'desktop default 80',pass:true,state:await page.evaluate(()=>({mode:geobattle.mode,units:geobattle.editor.formation.units.length,rendered:geobattle.renderer.metrics.drawnUnits}))});
  await page.setViewportSize({width:375,height:812});
  await page.waitForFunction(()=>Math.abs(geobattle.renderer.camera.width-document.getElementById('battlefield').getBoundingClientRect().width)<1);
  await capture('mobile-first.png');
  const mobile=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,rendered:geobattle.renderer.metrics.drawnUnits}));
  assert.equal(mobile.scrollWidth,mobile.width);assert.equal(mobile.rendered,80);report.checks.push({name:'mobile no overflow and 80 drawn',pass:true,...mobile});
  await page.setViewportSize({width:1586,height:992});
  const button=await page.locator('#start-button').boundingBox();await page.mouse.click(button.x+button.width/2,button.y+button.height/2);
  await page.waitForFunction(()=>geobattle.sim?.time>=3,null,{timeout:30000});
  await capture('battle-visual.png');
  const battle=await page.evaluate(()=>({mode:geobattle.mode,time:geobattle.sim.time,active:geobattle.sim.activeCount,damage:geobattle.sim.originalUnits.reduce((sum,u)=>sum+u.stats.damage,0),finite:geobattle.sim.units.every(u=>[u.x,u.y,u.hp].every(Number.isFinite))}));
  assert.ok(battle.time>=3&&battle.damage>0&&battle.finite);report.checks.push({name:'real battle progresses with damage',pass:true,...battle});
  const pause=await page.locator('#start-button').boundingBox();await page.mouse.click(pause.x+pause.width/2,pause.y+pause.height/2);await page.waitForFunction(()=>geobattle.mode==='PAUSED');
  const counts=await page.evaluate(()=>['red','blue'].map(team=>{const s=geobattle.sim.teamStats[team],root=document.querySelector(`[data-battle-team="${team}"]`);const read=key=>Number(root.querySelector(`[data-stat="${key}"]`).textContent.replaceAll(',',''));return {team,initial:read('initial'),deaths:read('initial-deaths'),remaining:read('initial-alive'),active:read('active'),summons:read('summons-alive'),expected:{initial:s.initial,deaths:s.deaths,remaining:s.remaining,active:geobattle.sim.units.filter(u=>u.alive&&u.team===team).length,summons:geobattle.sim.units.filter(u=>u.alive&&u.team===team&&u.summoned).length}};}));
  for(const row of counts)for(const key of ['initial','deaths','remaining','active','summons'])assert.equal(row[key],row.expected[key]);report.checks.push({name:'live team counts distinguish originals and summons',pass:true,teams:counts});
  const point=await page.evaluate(()=>{const u=geobattle.sim.units.find(u=>u.alive&&u.type==='tank');const p=geobattle.renderer.camera.worldToScreen(u.x,u.y),r=document.getElementById('battlefield').getBoundingClientRect();return {x:p.x+r.x,y:p.y+r.y};});
  await page.mouse.click(point.x,point.y);await page.waitForFunction(()=>geobattle.selectedId!=null&&document.querySelector('[data-stat="armor"]'));
  const detail=await page.evaluate(()=>({selectedId:geobattle.selectedId,shown:Number(document.querySelector('[data-stat="armor"]').textContent),expected:geobattle.sim.getEntity(geobattle.selectedId).def.armor}));assert.equal(detail.shown,detail.expected);report.checks.push({name:'clicked live unit displays exact armor',pass:true,...detail});await capture('battle-unit-detail.png');
  await page.setViewportSize({width:375,height:812});const mobileOpen=await page.locator('[data-action="inspector-toggle"]').boundingBox();await page.mouse.click(mobileOpen.x+mobileOpen.width/2,mobileOpen.y+mobileOpen.height/2);await page.waitForFunction(()=>document.getElementById('inspector').classList.contains('open'));
  const mobileDetail=await page.evaluate(()=>{const r=document.querySelector('[data-stat="armor"]').getBoundingClientRect();return {scrollWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,armorVisible:r.width>0&&r.y>=0&&r.bottom<=innerHeight};});assert.equal(mobileDetail.scrollWidth,mobileDetail.viewportWidth);assert.ok(mobileDetail.armorVisible);report.checks.push({name:'mobile live armor drawer visible without overflow',pass:true,...mobileDetail});await capture('mobile-battle-detail.png');
  assert.equal(report.errors.length,0);report.pass=true;
}catch(e){report.pass=false;report.failure=e.stack||String(e);process.exitCode=1;}
finally{await writeFile('evidence/final-build-smoke.json',JSON.stringify(report,null,2));await cdp.detach().catch(()=>{});await browser.close();stop();}
console.log(JSON.stringify(report));
