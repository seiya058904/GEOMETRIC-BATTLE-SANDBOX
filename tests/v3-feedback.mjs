import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { BASE_URL, launchBrowser, startTestServer } from './browser-runtime.mjs';
const output='evidence/v3/feedback'; await mkdir(output,{recursive:true});
const stop=await startTestServer(),browser=await launchBrowser(),context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage();
const report={errors:[],checks:[],visualMethod:'Same default army, 420 fixed steps, 900x600 canvas, zoom 1; controlled visual fixture, not a natural-RAF performance test.',physicalAudioListening:'NOT VERIFIED'};
page.on('pageerror',e=>report.errors.push(e.message));
try {
  await page.goto(BASE_URL);await page.waitForFunction(()=>window.geobattle);
  await page.locator('[data-category="modern"]').click();await page.locator('#unit-search').fill('枪');await page.locator('[data-action="unit"][data-type="rifleman"]').click();await page.locator('[data-action="tool-pan"]').click();await page.locator('[data-action="zoom-in"]').click();
  const view=()=>page.evaluate(()=>({category:geobattle.category,search:geobattle.search,type:geobattle.type,tool:geobattle.tool,scroll:document.getElementById('catalog-list').scrollTop,camera:{x:geobattle.renderer.camera.x,y:geobattle.renderer.camera.y,zoom:geobattle.renderer.camera.zoom}}));
  const originalView=await view();await page.locator('#start-button').click();await page.waitForFunction(()=>geobattle.sim.time>.2);await page.locator('[data-action="inspect-close"]').click();await page.locator('#return-button').click();
  assert.deepEqual(await view(),originalView);report.checks.push({name:'return restores category, search, selected type, tool and camera',pass:true,view:originalView});
  await page.reload();await page.locator('#start-button').click();await page.waitForFunction(()=>geobattle.sim.time>.2);
  const audio=await page.evaluate(()=>({state:geobattle.audio.context?.state,volume:geobattle.audio.volume,cap:geobattle.audio.maxVoices}));assert.equal(audio.state,'running');
  await page.locator('#start-button').click();assert.equal(await page.evaluate(()=>geobattle.audio.voices.size),0);
  await page.locator('[data-action="settings"]').click();await page.locator('[data-setting="muted"]').check();
  assert.equal(await page.evaluate(()=>geobattle.audio.muted),true);
  await page.locator('#volume-range').focus();await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>geobattle.audio.volume),0);
  await page.locator('[data-setting="muted"]').uncheck();await page.locator('#volume-range').focus();await page.keyboard.press('End');
  await page.locator('[data-action="dialog-close"]').first().click();await page.locator('#start-button').click();
  const max=await page.evaluate(async()=>{let max=0;for(let i=0;i<120;i++){await new Promise(requestAnimationFrame);max=Math.max(max,geobattle.audio.voices.size);}return max;});assert.ok(max<=10);
  report.checks.push({name:'real WebAudio unlock, pause silence, settings mute and volume, voice cap',pass:true,audio,maxVoicesObserved:max});
  for(const [label,url]of [['before',new URL('/evidence/v3/baseline-dist/',BASE_URL).href],['after',BASE_URL]]){
    await page.goto(url);await page.waitForFunction(()=>window.geobattle);
    await page.addStyleTag({content:'#battlefield{position:fixed!important;left:0!important;top:0!important;width:900px!important;height:600px!important;z-index:1000}'});
    await page.evaluate(()=>{const a=geobattle;a.start();a.pause();a.settings.autoCamera=false;a.settings.screenShake=false;a.settings.showHealth=true;for(let i=0;i<420&&!a.sim.result;i++)a.sim.step();a.renderer.resize();Object.assign(a.renderer.camera,{x:1200,y:675,zoom:1});a.selectedId=a.sim.units.find(u=>u.alive)?.id??null;});
    for(const quality of ['high','low']){
      await page.evaluate(q=>geobattle.settings.quality=q,quality);await page.waitForTimeout(100);
      await page.locator('#battlefield').screenshot({path:`${output}/${label}-${quality}.png`});
      report.checks.push({name:`visual-${label}-${quality}`,pass:true,...await page.evaluate(()=>({tick:geobattle.sim.tick,active:geobattle.sim.activeCount,effects:geobattle.sim.effects.length,quality:geobattle.renderer.metrics.quality,zoom:geobattle.renderer.camera.zoom}))});
    }
  }
  const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),phone=await mobile.newPage();
  await phone.goto(BASE_URL);await phone.locator('#start-button').click();await phone.waitForFunction(()=>geobattle.sim.time>2);await phone.locator('#start-button').click();await phone.locator('[data-action="inspect-close"]').click();
  await phone.screenshot({path:`${output}/mobile-close.png`});await mobile.close();
  assert.deepEqual(report.errors,[]);report.pass=true;
} catch(error){report.pass=false;report.failure=error.stack;process.exitCode=1;}
finally{await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));await context.close();await browser.close();stop();}
console.log(JSON.stringify(report));
