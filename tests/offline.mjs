import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser-runtime.mjs';

// Tests the exact single-file artifact with the browser's network disabled.
// Simulation advances through the application's real requestAnimationFrame loop.
const browser = await launchBrowser();
const context = await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1,offline:true});
const page = await context.newPage();
const errors = [], externalRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => { if (/^https?:/i.test(request.url())) externalRequests.push(request.url()); });
const report = {timestamp:new Date().toISOString(),browser:browser.version(),artifact:'GEOBATTLE-OFFLINE.html',networkDisabled:true,errors,externalRequests,checks:[]};
try {
  await page.goto(new URL('../GEOBATTLE-OFFLINE.html',import.meta.url).href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.geobattle?.renderer.metrics.drawnUnits === 80, null, {timeout:30000});
  const initial = await page.evaluate(() => ({title:document.title,mode:geobattle.mode,count:geobattle.editor.formation.units.length,categories:document.querySelectorAll('[data-category]').length,drawn:geobattle.renderer.metrics.drawnUnits}));
  assert.match(initial.title,/GEOBATTLE/); assert.equal(initial.mode,'PREPARING'); assert.equal(initial.count,80); assert.equal(initial.categories,6);
  report.checks.push({name:'offline default game renders',pass:true,...initial});
  const box = await page.locator('#start-button').boundingBox();
  assert.ok(box); await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await page.waitForFunction(() => geobattle.mode === 'FIGHTING' && geobattle.sim.time >= .2, null, {timeout:30000});
  const battle = await page.evaluate(() => ({mode:geobattle.mode,time:geobattle.sim.time,active:geobattle.sim.activeCount,original:geobattle.battleFormation.units.length,finite:geobattle.sim.units.every(u=>[u.x,u.y,u.hp].every(Number.isFinite))}));
  assert.ok(battle.time>=.2); assert.equal(battle.original,80); assert.ok(battle.finite);
  report.checks.push({name:'offline real battle advances',pass:true,...battle});
  assert.equal(errors.length,0); assert.equal(externalRequests.length,0);
  report.checks.push({name:'no external network dependencies or console errors',pass:true});
  report.pass=true;
} catch (error) {
  report.pass=false; report.failure=error.stack; process.exitCode=1;
} finally {
  await mkdir(fileURLToPath(new URL('../evidence/',import.meta.url)),{recursive:true});
  await writeFile(new URL('../evidence/offline-build-verification.json',import.meta.url),JSON.stringify(report,null,2));
  await context.close(); await browser.close();
}
console.log(JSON.stringify(report));
