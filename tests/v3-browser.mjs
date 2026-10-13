import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { BASE_URL, launchBrowser, startTestServer } from './browser-runtime.mjs';

const output = process.env.GEOBATTLE_EVIDENCE || 'evidence/v3/browser';
await mkdir(output, { recursive: true });
const stop = await startTestServer(), browser = await launchBrowser();
const report = { filter: process.env.GEOBATTLE_CASE_FILTER || null, url: BASE_URL, browser: browser.version(), cases: [], errors: [], screenshots: [] };
let context, page;
const check = async (name, fn) => {
  if(report.filter&&!name.includes(report.filter))return;
  try { const details = await fn(); report.cases.push({ name, pass: true, details }); console.log(`PASS ${name}`); }
  catch (error) { report.cases.push({ name, pass: false, error: error.stack }); console.log(`FAIL ${name}: ${error.message}`); }
};
const click = async action => { const items = page.locator(`[data-action="${action}"]:visible`); await items.first().click(); };
async function open(width, height, touch = false) {
  await context?.close(); context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(BASE_URL); await page.waitForFunction(() => window.geobattle?.renderer.metrics.drawnUnits === 80);
}
async function capture(name) {
  const session = await context.newCDPSession(page);
  const { data } = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await session.detach(); await writeFile(`${output}/${name}.png`, Buffer.from(data, 'base64')); report.screenshots.push(`${name}.png`);
}
async function targets(scope = 'body', touch = false) {
  const problems = await page.locator(scope).evaluate((root, touch) => [...root.querySelectorAll('button,summary')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.disabled && !e.closest('[inert]') && !e.matches('.unit-card')).flatMap(e => {
    const r = e.getBoundingClientRect();
    // Scrollable dialogue content is checked after each control is scrolled into view by its flow.
    if (e.closest('.dialog-body,.inspector-content')) return [];
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const bad = r.width < (touch ? 44 : 1) || r.height < (touch ? 44 : 1) || r.left < 0 || r.right > innerWidth + 1 || r.top < 0 || r.bottom > innerHeight + 1 || !e.contains(hit);
    return bad ? [{ action: e.dataset.action || e.textContent, width: r.width, height: r.height, receives: e.contains(hit), x: r.x, y: r.y }] : [];
  }), touch);
  assert.deepEqual(problems, []);
}
try {
  for (const [width, height, touch] of [[320,568,true],[390,844,true],[768,1024,true],[844,390,true],[1366,768,false],[1920,1080,false]]) {
    await check(`surfaces-${width}x${height}`, async () => {
      await open(width, height, touch); await targets('body', touch); await capture(`${width}x${height}-prepare`);
      const compact = await page.evaluate(() => geobattle.panels.compact);
      if (compact) await click('catalog-toggle');
      assert.ok(await page.locator('#catalog-list').evaluate(el => el.clientHeight) >= 60);
      await targets('#catalog', touch); await capture(`${width}x${height}-catalog`);
      await page.locator('[data-action="unit"][data-type="archer"]').click();
      await click('inspector-toggle'); await targets('#inspector', touch); await capture(`${width}x${height}-inspector`); await click('inspector-close');
      await click('settings'); await targets('#dialog', touch); await capture(`${width}x${height}-settings`); await click('dialog-close');
      await click('start'); await page.waitForFunction(() => geobattle.sim.time >= .3); await capture(`${width}x${height}-battle`); await click('start');
      await targets('body', touch); await capture(`${width}x${height}-paused`);
      assert.equal(await page.locator('#catalog').isVisible(), false);
      await click('inspect-close'); assert.ok(await page.evaluate(() => geobattle.renderer.camera.zoom) >= .95);
      await click('reset-camera');
      await page.locator('[data-speed="4"]').click(); await click('start');
      await page.waitForFunction(() => geobattle.mode === 'FINISHED', null, { timeout: 30000 });
      await targets('#dialog', touch); await capture(`${width}x${height}-result`);
      await page.locator('#dialog [data-action="return"]').click();
      assert.equal(await page.evaluate(() => geobattle.type), 'archer');
      assert.equal(await page.evaluate(() => geobattle.editor.formation.units.length), 80);
      return { compact, allStages: true };
    });
  }
  await check('scrollable-touch-panel-controls-have-44px-hit-areas', async () => {
    const inspect = async selector => {
      const controls = page.locator(selector);
      for (let i=0;i<await controls.count();i++) {
        const control=controls.nth(i); if(!await control.isVisible()||await control.isDisabled())continue;
        await control.scrollIntoViewIfNeeded();
        const target=await control.evaluate(el=>{const r=el.getBoundingClientRect();return {name:el.id||el.textContent,width:r.width,height:r.height,hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
        assert.ok(target.width>=44&&target.height>=44&&target.hit,JSON.stringify(target));
      }
    };
    for(const [w,h]of [[320,568],[768,1024],[844,390]]){
      await open(w,h,true);await click('inspector-toggle');await page.locator('[data-inspector-advanced] summary').click();
      await inspect('#inspector button:not(:disabled),#inspector select,#inspector input,#inspector summary');await click('inspector-close');
      await click('settings');await inspect('#dialog button,#dialog select,#dialog input:not([type=checkbox]),#dialog .field-row:has(input[type=checkbox])');await click('dialog-close');
      await click('presets');await inspect('#dialog button,#dialog input');await click('dialog-close');
    }
  });
  await check('modal-drawer-traps-focus-and-restores-trigger', async () => {
    await open(390,844,true); await click('catalog-toggle');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'unit-search');
    for (let i = 0; i < 18; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.getElementById('catalog').contains(document.activeElement)), true); }
    await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(() => document.getElementById('catalog').contains(document.activeElement)), true);
    assert.equal(await page.locator('.arena').evaluate(e => e.inert), true);
    await page.locator('#catalog [data-action="catalog-close"]').focus();
    for(const key of ['e','Delete','Control+z','f'])await page.keyboard.press(key);
    assert.equal(await page.evaluate(()=>geobattle.tool),'brush');
    assert.equal(await page.evaluate(()=>geobattle.editor.formation.units.length),80);
    assert.equal(await page.locator('#catalog').getAttribute('aria-modal'),'true');
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'catalog-toggle');
    assert.equal(await page.locator('.arena').evaluate(e => e.inert), false);
    assert.equal(await page.locator('#dialog').evaluate(e => e.open), false);
  });
  await check('idle-cache-invalidates-on-real-input-and-settings', async () => {
    await open(1366,768); await page.mouse.move(1,1);
    const sample = () => page.evaluate(async () => {
      const ctx=geobattle.renderer.ctx, original=ctx.fillRect; let count=0;
      ctx.fillRect=function(...args){count++;return original.apply(this,args);};
      const initial=geobattle.rafCount; await new Promise(resolve=>setTimeout(resolve,1000)); ctx.fillRect=original;
      return { frames:geobattle.rafCount-initial, fills:count };
    });
    const idle=await sample(); assert.ok(idle.frames>10); assert.ok(idle.fills<=60, JSON.stringify(idle));
    const before=await page.locator('#battlefield').screenshot(); await click('zoom-in');
    assert.notDeepEqual(await page.locator('#battlefield').screenshot(),before);
    await click('settings'); await page.locator('[data-setting="showGrid"]').uncheck(); await click('dialog-close');
    const after=await page.locator('#battlefield').screenshot(); assert.notDeepEqual(after,before);
    const box=await page.locator('#battlefield').boundingBox(); await page.mouse.move(box.x+box.width*.25,box.y+box.height*.65);
    assert.notDeepEqual(await page.locator('#battlefield').screenshot(),after);
    await page.mouse.move(1,1); const settled=await sample();assert.ok(settled.fills<=60,JSON.stringify(settled));
    return {idle,settled};
  });
  await check('six-experiments-load-through-UI-and-undo-without-saving-presets', async () => {
    await open(1366,768); const original=await page.evaluate(()=>JSON.stringify(geobattle.editor.formation));
    for(const id of ['shield','charge','blast'])for(const variant of [0,1]){
      await click('presets');await page.locator(`[data-experiment="${id}"][data-variant="${variant}"]`).click();
      assert.equal(await page.evaluate(()=>geobattle.editor.formation.schemaVersion),1);
      assert.ok(await page.evaluate(()=>geobattle.editor.formation.units.length)<80);
      await click('undo');assert.equal(await page.evaluate(()=>JSON.stringify(geobattle.editor.formation)),original);
    }
    assert.equal(await page.evaluate(()=>geobattle.store.listPresets().value.length),0);
  });
  await check('session-reports-compare-replays-and-stay-bounded', async () => {
    await open(1366,768);await click('start');await page.locator('[data-speed="4"]').click();
    await page.waitForFunction(()=>geobattle.mode==='FINISHED',null,{timeout:30000});
    await click('replay');await page.waitForFunction(()=>geobattle.mode==='FINISHED',null,{timeout:30000});
    assert.match(await page.locator('.comparison-tags').innerText(),/编队相同.*种子相同/);
    await capture('same-seed-comparison');await click('replay-new');
    await page.waitForFunction(()=>geobattle.mode==='FINISHED',null,{timeout:30000});
    assert.match(await page.locator('.comparison-tags').innerText(),/编队相同.*种子已变化/);
    assert.equal(await page.evaluate(()=>geobattle.reports.items.length),2);
    await page.reload();assert.equal(await page.evaluate(()=>geobattle.reports.items.length),0);
  });
  await check('manual-camera-holds-and-reduced-motion-disables-shake', async () => {
    await open(390,844,true);await page.emulateMedia({reducedMotion:'reduce'});
    await click('settings');await page.locator('[data-setting="autoCamera"]').check();await click('dialog-close');await click('start');await click('inspect-close');
    const cam=await page.evaluate(()=>({x:geobattle.renderer.camera.x,y:geobattle.renderer.camera.y,z:geobattle.renderer.camera.zoom}));
    await page.waitForTimeout(1800);assert.deepEqual(await page.evaluate(()=>({x:geobattle.renderer.camera.x,y:geobattle.renderer.camera.y,z:geobattle.renderer.camera.zoom})),cam);
    assert.equal(await page.evaluate(()=>geobattle.reducedMotion.matches),true);
    assert.doesNotMatch(await page.locator('#tool-hint').innerText(),/左键|右键|滚轮/);
  });
} finally {
  report.summary={pass:report.cases.filter(c=>c.pass).length,fail:report.cases.filter(c=>!c.pass).length,errors:report.errors.length};
  await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
  await context?.close();await browser.close();stop();console.log(JSON.stringify(report.summary));
}
if(report.summary.fail||report.errors.length)process.exitCode=1;
