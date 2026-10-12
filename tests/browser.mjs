import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BASE_URL, launchBrowser, startTestServer } from './browser-runtime.mjs';

/** Real browser interaction: scenarios enter through the JSON file input; no
 * direct simulation stepping, renderer mutations, or controller action calls. */
const SECTION = process.env.GEOBATTLE_TEST_SECTION || 'all';
const DIST = process.env.GEOBATTLE_TEST_DIST === '1';
const evidence = fileURLToPath(new URL('../evidence/', import.meta.url));
await mkdir(evidence, { recursive: true });
const slug = text => text.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 100);
const reportPath = `${evidence}/browser-${slug(SECTION)}${DIST ? '-dist' : ''}.json`;
const report = { startedAt: new Date().toISOString(), url: BASE_URL, section: SECTION, production: DIST,
  screenshotMethod: 'CDP Page.captureScreenshot after observed UI state; initial Playwright compositor-wait timeouts are retained in initial reports',
  browserPlugin: 'absent', fallbackReason: 'Browser plugin not available', rendering: 'Headless Chromium; SwiftShader requested; CSS DPR 1',
  flow: 'Load the sandbox, deploy through real controls, save/reload/import, observe natural RAF battles, replay and return to original deployment.',
  cases: [], captures: [], consoleErrors: [], requestFailures: [], screenshots: [] };
let browser, stopServer, page;
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const empty = (seed = 100) => ({ schemaVersion: 1, seed, units: [] });
const unit = (id, type, team, x, y) => ({ id, type, team, x, y, angle: team === 'red' ? 0 : Math.PI });
const scenario = (units, seed = 777) => ({ schemaVersion: 1, seed, units });
const pair = (seed = 20261012, quick = false) => scenario([
  unit(1, quick ? 'tank' : 'peasant', 'red', quick ? 1040 : 1130, 675),
  unit(2, 'peasant', 'blue', quick ? 1360 : 1230, 675),
], seed);

async function checkpoint() {
  report.summary = { pass: report.cases.filter(c => c.status === 'pass').length,
    fail: report.cases.filter(c => c.status === 'fail').length, skipped: 0, total: report.cases.length, capturesPassed: report.captures.filter(c => c.status === 'pass').length, capturesFailed: report.captures.filter(c => c.status === 'fail').length };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
}
async function screenshot(name, target = page) {
  const filename = `browser-${slug(name)}${DIST ? '-dist' : ''}.png`;
  const started = performance.now(); let session, timer;
  try {
    session = await target.context().newCDPSession(target);
    const captured = await Promise.race([
      session.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('CDP screenshot exceeded 15 seconds')), 15000); }),
    ]);
    await writeFile(`${evidence}/${filename}`, Buffer.from(captured.data, 'base64'));
    report.screenshots.push(filename);
    report.captures.push({ name, filename, status: 'pass', durationMs: Math.round(performance.now() - started) });
    return filename;
  } catch (error) {
    report.captures.push({ name, filename, status: 'fail', durationMs: Math.round(performance.now() - started), error: error.message });
    console.log(`CAPTURE FAIL ${name}: ${error.message}`); return null;
  } finally {
    if (timer) clearTimeout(timer);
    if (session) session.detach().catch(() => {});
  }
}
async function check(name, fn) {
  const start = performance.now();
  try {
    const details = await fn();
    report.cases.push({ name, status: 'pass', durationMs: Math.round(performance.now() - start), ...(details === undefined ? {} : { details }) });
    console.log(`PASS ${name}`);
  } catch (error) {
    let image;
    try { if (page && !page.isClosed()) image = await screenshot(`failure-${name}`); } catch {}
    report.cases.push({ name, status: 'fail', durationMs: Math.round(performance.now() - start), error: String(error.message || error), stack: error.stack, screenshot: image });
    console.log(`FAIL ${name}: ${String(error.message || error).split('\n')[0]}`);
  }
  await checkpoint();
}
async function fresh(width = 1920, height = 1080, touch = false) {
  if (page) await page.context().close();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: touch, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', acceptDownloads: true });
  page = await context.newPage(); page.setDefaultTimeout(4500);
  page.on('pageerror', error => report.consoleErrors.push({ viewport: `${width}x${height}`, kind: 'pageerror', message: error.message }));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ viewport: `${width}x${height}`, kind: 'console', message: message.text() }); });
  page.on('requestfailed', request => { if (!request.failure()?.errorText?.includes('ERR_ABORTED')) report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }); });
  page.on('dialog', async dialog => { report.consoleErrors.push({ kind: 'unexpected-dialog', message: dialog.message() }); await dialog.dismiss(); });
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.geobattle?.renderer?.metrics.drawnUnits > 0, null, { timeout: 7000 });
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function clickControl(locator) {
  assert.equal(await locator.isVisible(), true, 'Control is visible');
  assert.equal(await locator.isEnabled(), true, 'Control is enabled');
  await locator.evaluate(el => el.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  const point = await locator.evaluate(el => {
    const r=el.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2, hit=document.elementFromPoint(x,y);
    return {x,y,hit:!!hit&&el.contains(hit),width:r.width,height:r.height};
  });
  assert.ok(point.width>0&&point.height>0&&point.hit, 'Control center receives pointer input');
  await page.mouse.click(point.x, point.y);
}
async function action(name, scope = '') { await clickControl(page.locator(`${scope ? `${scope} ` : ''}[data-action="${name}"]:visible`).first()); }
async function closeDialog() { if (await page.locator('#dialog').evaluate(d => d.open)) await action('dialog-close', '#dialog'); }
async function imported(formation, name = 'QA.geobattle.json') {
  await page.locator('#import-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(formation)) });
  await page.waitForFunction(({ seed, count }) => window.geobattle.mode === 'PREPARING' && window.geobattle.editor.formation.seed === seed && window.geobattle.editor.formation.units.length === count,
    { seed: formation.seed, count: formation.units.length });
}
async function army() { return page.evaluate(() => structuredClone(window.geobattle.editor.formation)); }
async function counts() { return page.evaluate(() => window.geobattle.editor.getCounts()); }
async function screen(x, y) { return page.evaluate(({ x, y }) => { const a = window.geobattle, r = a.renderer.canvas.getBoundingClientRect(), p = a.renderer.camera.worldToScreen(x, y); return { x: r.left + p.x, y: r.top + p.y }; }, { x, y }); }
async function clickWorld(x, y, touch = false) { const p = await screen(x, y); if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); }
async function dragWorld(x1, y1, x2, y2, steps = 1, button = 'left') {
  const a = await screen(x1, y1), b = await screen(x2, y2); await page.mouse.move(a.x, a.y); await page.mouse.down({ button });
  await page.mouse.move(b.x, b.y, { steps }); await page.mouse.up({ button });
}
async function choose(type, category, team = 'red') {
  await action(`team-${team}`);
  if ((await page.viewportSize()).width <= 760 && !(await page.locator('#catalog').evaluate(el => el.classList.contains('open')))) await action('catalog-toggle');
  await clickControl(page.locator(`[data-action="category"][data-category="${category}"]:visible`));
  await clickControl(page.locator(`[data-action="unit"][data-type="${type}"]:visible`));
  await page.waitForFunction(type => window.geobattle.type === type, type);
}
async function waitResult(timeout = 18000) {
  await page.waitForFunction(() => window.geobattle.mode === 'FINISHED' && window.geobattle.sim.result, null, { timeout });
  return page.evaluate(() => structuredClone(window.geobattle.sim.result));
}
async function productionSmoke() {
  await fresh(1366, 768);
  await check('production-entry-and-real-render', async () => {
    assert.match(await page.title(), /GEOBATTLE|几何战争/i);
    assert.equal((await counts()).total, 80);
    assert.ok(await page.evaluate(() => window.geobattle.renderer.metrics.drawnUnits > 0));
    assert.equal(await page.locator('vite-error-overlay').count(), 0);
    return { screenshot: await screenshot('production-initial') };
  });
  await check('production-import-click-fight-result-return', async () => {
    await imported(pair(909, true)); const before = await army();
    await action('start'); const result = await waitResult();
    assert.equal(result.teams.red.initial + result.teams.blue.initial, 2);
    assert.ok(result.teams.blue.deaths > 0); await action('return', '#dialog');
    assert.deepEqual(await army(), before);
    return { winner: result.winner, simulationSeconds: result.duration };
  });
}
async function editorSuite() {
  await fresh();
  await check('initial-identity-80-units-and-nonblank-render', async () => {
    assert.match(await page.title(), /GEOBATTLE|几何战争/i); assert.equal(page.url(), `${BASE_URL}/`);
    assert.equal(await page.locator('vite-error-overlay').count(), 0); assert.equal((await counts()).total, 80);
    const pixels = await page.evaluate(() => { const c = document.getElementById('battlefield'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const colors = new Set(); for (let i = 0; i < d.length; i += 400) colors.add(`${d[i]},${d[i+1]},${d[i+2]}`); return colors.size; });
    assert.ok(pixels > 10); return { sampledColors: pixels, screenshot: await screenshot('desktop-initial') };
  });
  await check('real-categories-deploy-two-types-per-team', async () => {
    await imported(empty(101)); await action('reset-camera');
    await choose('swordsman', 'classical', 'red'); await clickWorld(400, 400);
    await choose('tank', 'modern', 'red'); await clickWorld(500, 700);
    await choose('fire_mage', 'fantasy', 'blue'); await clickWorld(1850, 400);
    await choose('trex', 'beasts', 'blue'); await clickWorld(1750, 750);
    const data = await army(); assert.equal(data.units.length, 4);
    assert.deepEqual(data.units.map(u => [u.type, u.team]), [['swordsman','red'],['tank','red'],['fire_mage','blue'],['trex','blue']]);
    return { screenshot: await screenshot('mixed-deployment') };
  });
  await check('overlap-and-boundary-clicks-reject-with-visible-feedback', async () => {
    const before = await army(); await clickWorld(1750, 750); assert.deepEqual(await army(), before);
    assert.match(await page.locator('#toast').textContent(), /跳过|重叠/); await clickWorld(2, 400); assert.deepEqual(await army(), before);
  });
  await check('free-deployment-allows-a-red-unit-on-the-right-half', async () => {
    await choose('peasant', 'classical', 'red'); await clickWorld(1900, 1100);
    const placed = (await army()).units.at(-1); assert.equal(placed.team, 'red'); assert.ok(placed.x > 1200);
  });
  await check('fast-brush-path-one-undo-redo-transaction', async () => {
    await imported(empty(102)); await action('reset-camera'); await choose('peasant', 'classical'); await action('tool-brush');
    await dragWorld(200, 300, 750, 300, 1); const placed = await army(); assert.ok(placed.units.length >= 15);
    for (let i = 1; i < placed.units.length; i++) assert.ok(placed.units[i].x - placed.units[i-1].x <= 36);
    await action('undo'); assert.equal((await counts()).total, 0); await action('redo'); assert.deepEqual(await army(), placed);
  });
  await check('line-and-grid-preview-counts-match-real-deployment', async () => {
    await imported(empty(103)); await action('reset-camera'); await action('tool-line');
    let a = await screen(200, 300), b = await screen(700, 300); await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(b.x,b.y);
    const lineCount = await page.evaluate(() => window.geobattle.input.preview.length); await page.mouse.up(); assert.equal((await counts()).total, lineCount); assert.ok(lineCount > 5);
    await action('tool-grid'); a = await screen(800, 300); b = await screen(1100, 600); await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(b.x,b.y);
    const gridCount = await page.evaluate(() => window.geobattle.input.preview.length); await page.mouse.up(); assert.equal((await counts()).total, lineCount + gridCount);
    return { lineCount, gridCount };
  });
  await check('box-select-move-and-rotate-real-mixed-group', async () => {
    await imported(scenario([unit(1,'swordsman','red',400,400),unit(2,'shield_guard','red',500,400),unit(3,'archer','blue',1900,900)],104));
    await action('reset-camera'); await action('team-red'); await action('tool-select'); await dragWorld(350,350,550,450);
    assert.equal(await page.evaluate(() => window.geobattle.editor.selection.size), 2);
    await dragWorld(400,400,450,500); const moved = await army(); assert.ok(Math.abs(moved.units[0].x-450)<.1); assert.ok(Math.abs(moved.units[0].y-500)<.1);
    await action('rotate-right'); const rotated = await army(); assert.ok(rotated.units[0].angle > .26 && rotated.units[0].angle < .263);
    assert.ok(Math.abs(Math.hypot(rotated.units[1].x-rotated.units[0].x,rotated.units[1].y-rotated.units[0].y)-100)<.001);
  });
  await check('clipboard-paste-to-other-team-mirror-delete-and-history', async () => {
    await action('copy'); await action('team-blue'); await action('paste'); await clickWorld(900,750); assert.equal((await counts()).total,5);
    const pasted = (await army()).units.slice(-2); assert.ok(pasted.every(u=>u.team==='blue'));
    await action('mirror'); assert.equal((await counts()).total,7); const mirrored = await army();
    await action('undo'); assert.equal((await counts()).total,5); await action('redo'); assert.deepEqual(await army(),mirrored);
    await action('delete'); assert.equal((await counts()).total,5); await action('undo'); assert.deepEqual(await army(),mirrored);
  });
  await check('group-out-of-bounds-rejection-keeps-every-position', async () => {
    await imported(scenario([unit(1,'swordsman','red',400,400),unit(2,'shield_guard','red',500,400),unit(3,'archer','blue',1900,900)],105));
    await action('reset-camera'); await action('team-red'); await action('tool-select'); await dragWorld(350,350,550,450); const before = await army();
    await dragWorld(400,400,3,400); assert.deepEqual(await army(),before); assert.match(await page.locator('#toast').textContent(),/保持原位|边界/);
  });
  await check('search-input-and-modal-ignore-game-shortcuts', async () => {
    const before = await army(); await page.locator('#unit-search').fill('tank'); await page.keyboard.press('Space'); await page.keyboard.press('1'); await page.keyboard.press('Control+z');
    assert.deepEqual(await army(),before); assert.equal(await page.evaluate(()=>window.geobattle.mode),'PREPARING');
    await page.locator('#unit-search').fill(''); await action('presets'); await page.locator('#preset-name').fill('test'); await page.keyboard.press('Space');
    assert.equal(await page.evaluate(()=>window.geobattle.mode),'PREPARING'); await page.keyboard.press('Escape'); assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);
  });
  await check('clear-current-team-confirm-and-undo-preserve-other-team', async () => {
    await action('team-red'); const before = await army(); await action('presets'); await action('clear-team','#dialog'); await action('confirm-action','#dialog');
    assert.equal((await counts()).red.count,0); assert.equal((await counts()).blue.count,1); await action('undo'); assert.deepEqual(await army(),before);
  });
  await check('empty-side-refuses-start-with-actionable-message', async () => {
    await imported(scenario([unit(1,'peasant','red',700,600)],106)); await action('start'); assert.equal(await page.evaluate(()=>window.geobattle.mode),'PREPARING');
    assert.match(await page.locator('#toast').textContent(),/双方|至少/); assert.equal(await page.evaluate(()=>window.geobattle.sim),null);
  });
}
async function storageSuite() {
  await fresh(); const base = scenario([unit(1,'swordsman','red',600,400),unit(2,'tank','blue',1700,800)],444);
  await imported(base);
  await check('named-preset-save-shows-actual-unit-count', async () => {
    await action('presets'); await page.locator('#preset-name').fill('QA 军阵'); await clickControl(page.locator('form[data-form="save-preset"] button'));
    const row = page.locator('.preset-item').filter({hasText:'QA 军阵'}); assert.equal(await row.count(),1); assert.match(await row.textContent(),/2 个单位/); await closeDialog();
  });
  await check('autosave-refresh-restores-the-exact-editable-formation', async () => {
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('geobattle.autosave.v1')||'null')?.seed===444);
    const persisted = await page.evaluate(()=>JSON.parse(localStorage.getItem('geobattle.autosave.v1'))); assert.deepEqual(persisted,base);
    await page.reload({waitUntil:'networkidle'}); await page.waitForFunction(()=>window.geobattle?.editor.formation.seed===444); assert.deepEqual(await army(),base);
    assert.match(await page.locator('#toast').textContent(),/恢复/);
  });
  await check('named-load-restores-an-altered-army-and-can-be-undone', async () => {
    await action('reset-camera'); await choose('peasant','classical'); await clickWorld(900,700); assert.equal((await counts()).total,3);
    await action('presets'); await clickControl(page.locator('.preset-item').filter({hasText:'QA 军阵'}).locator('[data-action="load-preset"]')); assert.deepEqual(await army(),base);
    await action('undo'); assert.equal((await counts()).total,3); await action('redo'); assert.deepEqual(await army(),base);
  });
  let exported;
  await check('JSON-download-contains-complete-live-configuration', async () => {
    await action('presets'); const pending = page.waitForEvent('download'); await action('export','#dialog'); const download=await pending;
    exported = await readFile(await download.path(),'utf8'); assert.deepEqual(JSON.parse(exported),base); assert.match(download.suggestedFilename(),/\.geobattle\.json$/); await closeDialog();
    return {bytes:Buffer.byteLength(exported),sha256:hash(exported)};
  });
  await check('JSON-file-import-restores-exported-data-after-clear', async () => {
    await action('presets'); await action('clear-all','#dialog'); await action('confirm-action','#dialog'); assert.equal((await counts()).total,0);
    await imported(JSON.parse(exported)); assert.deepEqual(await army(),base);
  });
  await check('malformed-file-and-oversize-file-protect-current-army', async () => {
    const before=await army(); await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
    await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('JSON')); assert.deepEqual(await army(),before);
    await page.locator('#import-file').setInputFiles({name:'large.json',mimeType:'application/json',buffer:Buffer.alloc(2*1024*1024+1,32)});
    await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('2 MiB')); assert.deepEqual(await army(),before);
  });
  await check('preset-markup-name-is-rendered-as-text-without-execution', async () => {
    const name='<img src=x onerror=alert(1)>'; await action('presets'); await page.locator('#preset-name').fill(name); await clickControl(page.locator('form[data-form="save-preset"] button'));
    assert.equal(await page.locator('.preset-item strong').filter({hasText:name}).count(),1); assert.equal(await page.locator('#dialog img').count(),0);
    await screenshot('preset-escaped-name'); await closeDialog();
  });
  await check('deleting-one-preset-keeps-the-current-army-and-other-preset', async () => {
    const before=await army(); await action('presets'); await clickControl(page.locator('.preset-item').filter({hasText:'QA 军阵'}).locator('[data-action="delete-preset"]'));
    await action('confirm-action','#dialog'); assert.equal(await page.locator('.preset-item').count(),1); assert.deepEqual(await army(),before); await closeDialog();
  });
  for (const [size,count] of Object.entries({small:20,normal:80,large:300,chaos:600})) await check(`random-dialog-${size}-${count}-legal-editable-units`,async()=>{
    await action('random'); await clickControl(page.locator(`[data-action="random-size"][data-size="${size}"]`)); await page.locator('#random-seed').fill('314159'); await action('generate-random','#dialog');
    assert.equal((await counts()).total,count); assert.equal((await army()).seed,314159); assert.ok((await counts()).red.count>0&&(await counts()).blue.count>0);
  });
  await check('generated-random-army-can-be-undone-in-one-step', async () => { await action('undo'); assert.equal((await counts()).total,300); });
}
async function battleSuite() {
  await fresh(); const original=pair(888); await imported(original);
  await check('natural-1v1-RAF-combat-causes-real-damage',async()=>{
    await action('start'); await page.waitForFunction(()=>window.geobattle.sim.units.some(u=>u.hp<u.maxHp),null,{timeout:12000});
    assert.equal(await page.evaluate(()=>window.geobattle.mode),'FIGHTING');
    return page.evaluate(()=>({tick:window.geobattle.sim.tick,hp:window.geobattle.sim.units.map(u=>u.hp)}));
  });
  let pausedSnapshot;
  await check('pause-ten-seconds-freezes-simulation-effects-and-canvas',async()=>{
    await action('start'); assert.equal(await page.evaluate(()=>window.geobattle.mode),'PAUSED');
    await page.waitForTimeout(120); pausedSnapshot=await page.evaluate(()=>({core:window.geobattle.sim.snapshot(),effects:structuredClone(window.geobattle.sim.effects),canvas:document.getElementById('battlefield').toDataURL()}));
    await page.waitForTimeout(10000);
    const later=await page.evaluate(()=>({core:window.geobattle.sim.snapshot(),effects:structuredClone(window.geobattle.sim.effects),canvas:document.getElementById('battlefield').toDataURL()}));
    assert.deepEqual(later.core,pausedSnapshot.core); assert.deepEqual(later.effects,pausedSnapshot.effects); assert.equal(hash(later.canvas),hash(pausedSnapshot.canvas));
    return {durationMs:10000,coreSHA256:hash(later.core),canvasSHA256:hash(later.canvas),screenshot:await screenshot('paused-battle')};
  });
  await check('all-five-speed-buttons-work-while-paused-without-ticking',async()=>{
    const tick=await page.evaluate(()=>window.geobattle.sim.tick);
    for(const speed of [.25,.5,1,2,4]){await clickControl(page.locator(`[data-speed="${speed}"]`));assert.equal(await page.evaluate(()=>window.geobattle.speed),speed);assert.equal(await page.locator(`[data-speed="${speed}"]`).getAttribute('aria-pressed'),'true');}
    assert.equal(await page.evaluate(()=>window.geobattle.sim.tick),tick);
  });
  await check('battle-locks-deployment-and-keyboard-edits',async()=>{
    const before=await army();assert.equal(await page.locator('[data-tool="brush"]').isDisabled(),true);
    const c=await page.locator('#battlefield').boundingBox();await page.mouse.click(c.x+c.width*.25,c.y+c.height*.55);await page.keyboard.press('Delete');await page.keyboard.press('b');await page.keyboard.press('Control+z');
    assert.deepEqual(await army(),before);assert.equal(await page.evaluate(()=>window.geobattle.mode),'PAUSED');
  });
  await check('unit-observation-follow-and-paused-camera-pan-zoom',async()=>{
    const unit=await page.evaluate(()=>{const u=window.geobattle.sim.units.find(u=>u.alive);return {id:u.id,x:u.x,y:u.y};});await clickWorld(unit.x,unit.y);
    assert.equal(await page.evaluate(()=>window.geobattle.selectedId),unit.id);await action('follow');assert.equal(await page.evaluate(()=>window.geobattle.followId),unit.id);
    await action('follow');const old=await page.evaluate(()=>({x:window.geobattle.renderer.camera.x,y:window.geobattle.renderer.camera.y,zoom:window.geobattle.renderer.camera.zoom}));
    const c=await page.locator('#battlefield').boundingBox();await page.mouse.move(c.x+c.width*.5,c.y+c.height*.5);await page.mouse.down({button:'right'});await page.mouse.move(c.x+c.width*.5+45,c.y+c.height*.5+20);await page.mouse.up({button:'right'});
    const panned=await page.evaluate(()=>({x:window.geobattle.renderer.camera.x,y:window.geobattle.renderer.camera.y,zoom:window.geobattle.renderer.camera.zoom}));assert.notEqual(panned.x,old.x);
    await page.mouse.wheel(0,-180);await page.waitForTimeout(60);assert.ok(await page.evaluate(z=>window.geobattle.renderer.camera.zoom>z,panned.zoom));
    assert.deepEqual(await page.evaluate(()=>window.geobattle.sim.snapshot()),pausedSnapshot.core);
  });
  await check('resume-finishes-through-natural-ticks-and-shows-real-statistics',async()=>{
    await action('start');const result=await waitResult();assert.ok(result.teams.red.damage+result.teams.blue.damage>0);assert.ok(result.teams.red.deaths+result.teams.blue.deaths>0);
    assert.equal(result.teams.red.initial+result.teams.blue.initial,2);assert.equal(await page.locator('#dialog [data-action="replay"]').count(),1);
    return {winner:result.winner,duration:result.duration,screenshot:await screenshot('battle-result')};
  });
  await check('return-to-editor-restores-the-untouched-original-army',async()=>{
    await action('return','#dialog');assert.equal(await page.evaluate(()=>window.geobattle.mode),'PREPARING');assert.deepEqual(await army(),original);assert.equal(await page.evaluate(()=>window.geobattle.sim),null);
  });
}
async function replaySuite() {
  await fresh();const original=pair(314159,false);await imported(original);let first;
  await check('quick-natural-duel-completes-and-matches-deployment-counts',async()=>{
    await action('start');await clickControl(page.locator('[data-speed="4"]'));first=await waitResult();assert.equal(first.teams.red.initial,1);assert.equal(first.teams.blue.initial,1);assert.ok(first.teams.blue.deaths>0);
  });
  await check('same-seed-replay-reproduces-complete-result-without-ghost-units',async()=>{
    await action('replay','#dialog');assert.equal(await page.evaluate(()=>window.geobattle.sim.units.length),2);const next=await waitResult();assert.deepEqual(next,first);
  });
  await check('new-seed-replay-preserves-units-and-produces-a-fresh-battle',async()=>{
    await action('replay-new','#dialog');const before=await page.evaluate(()=>structuredClone(window.geobattle.battleFormation));assert.notEqual(before.seed,original.seed);assert.deepEqual(before.units,original.units);
    assert.equal(await page.evaluate(()=>window.geobattle.sim.units.length),2);await waitResult();await action('return','#dialog');assert.deepEqual(await army(),original);
  });
  await check('starting-during-a-brush-uses-the-post-cancel-editor-snapshot',async()=>{
    await action('team-red');await choose('peasant','classical');await action('tool-brush');await action('reset-camera');const p=await screen(500,500);await page.mouse.move(p.x,p.y);await page.mouse.down();
    assert.equal(await page.evaluate(()=>window.geobattle.editor.transactionActive),true);await page.keyboard.press('Space');await page.mouse.up();
    const data=await page.evaluate(()=>({army:structuredClone(window.geobattle.editor.formation),battle:structuredClone(window.geobattle.battleFormation)}));assert.deepEqual(data.battle,data.army);assert.deepEqual(data.army,original);
    await action('return');
  });
}
async function responsiveSuite(width, height) {
  await fresh(width,height,width<=768);const label=`${width}x${height}`;
  await check(`${label}-layout-primary-control-and-canvas-visible`,async()=>{
    const layout=await page.evaluate(()=>{const canvas=document.getElementById('battlefield').getBoundingClientRect(),button=document.getElementById('start-button').getBoundingClientRect();return {innerWidth,innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,canvas:{x:canvas.x,y:canvas.y,width:canvas.width,height:canvas.height},button:{x:button.x,y:button.y,width:button.width,height:button.height}};});
    assert.ok(layout.scrollWidth<=width+1);assert.ok(layout.scrollHeight<=height+1);assert.ok(layout.canvas.width>=Math.min(280,width-24));assert.ok(layout.canvas.height>250);
    assert.ok(layout.button.x>=0&&layout.button.x+layout.button.width<=width+1&&layout.button.y+layout.button.height<=height);assert.equal((await counts()).total,80);
    return {...layout,screenshot:await screenshot(`${label}-initial`)};
  });
  await check(`${label}-choose-both-teams-deploy-by-pointer-and-fit`,async()=>{
    await imported(empty(width)); // Clearing also exercises the real file input on each viewport.
    await choose('tank','modern','red');await clickWorld(1040,675,width<=768);
    await choose('peasant','classical','blue');await clickWorld(1360,675,width<=768);
    assert.equal((await counts()).red.count,1);assert.equal((await counts()).blue.count,1);await action('fit');
    return {screenshot:await screenshot(`${label}-deployment`)};
  });
  await check(`${label}-start-pause-speed-result-dialog-and-return`,async()=>{
    const before=await army();const start=await page.locator('#start-button').boundingBox();await page.mouse.dblclick(start.x+start.width/2,start.y+start.height/2);assert.equal(await page.evaluate(()=>window.geobattle.mode),'PAUSED');
    await clickControl(page.locator('[data-speed="4"]'));await action('start');const result=await waitResult();assert.ok(result.teams.blue.deaths>0);
    const screenshotName=await screenshot(`${label}-result`);await page.keyboard.press('Escape');assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);
    await action('start');assert.equal(await page.locator('#dialog').evaluate(d=>d.open),true);await action('return','#dialog');assert.deepEqual(await army(),before);
    await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));return {winner:result.winner,screenshot:screenshotName};
  });
  if(width===375) await check('375x812-two-finger-pinch-changes-camera-without-deploying',async()=>{
    await imported(empty(37501));await choose('peasant','classical','red');await action('tool-single');
    const c=await page.locator('#battlefield').boundingBox();const x=c.x+c.width/2,y=c.y+c.height*.65;const before=await page.evaluate(()=>({count:window.geobattle.editor.formation.units.length,zoom:window.geobattle.renderer.camera.zoom}));
    const session=await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-35,y,id:1},{x:x+35,y,id:2}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-55,y,id:1},{x:x+55,y,id:2}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
    const after=await page.evaluate(()=>({count:window.geobattle.editor.formation.units.length,zoom:window.geobattle.renderer.camera.zoom}));assert.notEqual(after.zoom,before.zoom);assert.equal(after.count,before.count);
    return {before,after};
  });
}

async function interactionRegressionSuite() {
  await fresh(1440,900);
  await check('role-label-search-finds-melee-and-ranged-units',async()=>{
    await page.locator('#unit-search').fill('近战先锋');
    for(const type of ['peasant','swordsman','shield_guard'])assert.equal(await page.locator('[data-action="unit"][data-type="'+type+'"]').count(),1);
    await page.locator('#unit-search').fill('远程火力');
    for(const type of ['archer','rifleman'])assert.equal(await page.locator('[data-action="unit"][data-type="'+type+'"]').count(),1);
    const capture=await screenshot('role-search-regression');await page.locator('#unit-search').fill('');return {screenshot:capture};
  });
  for(const next of ['unit','deploy-current'])await check('paste-cancelled-by-'+next+'-without-losing-clipboard',async()=>{
    await imported(scenario([unit(1,'swordsman','red',400,400),unit(2,'swordsman','red',450,400),unit(3,'peasant','blue',1900,900)],810));
    await choose('swordsman','classical');await action('reset-camera');await action('select-team');await action('copy');await action('paste');
    assert.equal(await page.evaluate(()=>geobattle.input.pasteMode),true);
    if(next==='unit')await clickControl(page.locator('[data-action="unit"][data-type="peasant"]'));else await action('deploy-current');
    assert.equal(await page.evaluate(()=>geobattle.input.pasteMode),false);
    assert.equal(await page.evaluate(()=>geobattle.editor.canPaste),true);
    const before=await army();await clickWorld(900,700);const after=await army();
    assert.equal(after.units.length,before.units.length+1);assert.equal(after.units.at(-1).type,next==='unit'?'peasant':'swordsman');
    await action('undo');assert.deepEqual(await army(),before);await action('redo');assert.deepEqual(await army(),after);
    await action('paste');await clickWorld(1250,600);assert.equal((await army()).units.length,after.units.length+2);
  });
  await check('observation-buttons-retain-focus-and-native-space-enter-activation',async()=>{
    await imported(pair(811));await action('start');await action('start');assert.equal(await page.evaluate(()=>geobattle.mode),'PAUSED');
    const paused=await page.evaluate(()=>geobattle.sim.time);
    const observed=await page.evaluate(()=>{const u=geobattle.sim.units.find(u=>u.alive&&u.team==='red');return {id:u.id,x:u.x,y:u.y};});
    await clickWorld(observed.x,observed.y);
    for(let i=0;i<35;i++){await page.keyboard.press('Tab');if(await page.evaluate(()=>document.activeElement.dataset.action==='follow'))break;}
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'follow');
    await page.evaluate(()=>{window.__qaFollowButton=document.activeElement;});await page.waitForTimeout(650);
    assert.equal(await page.evaluate(()=>document.activeElement===window.__qaFollowButton),true);
    assert.equal(await page.evaluate(()=>geobattle.sim.time),paused);
    await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>geobattle.followId),observed.id);
    assert.equal(await page.evaluate(()=>geobattle.mode),'PAUSED');await page.waitForTimeout(650);
    assert.equal(await page.evaluate(()=>document.activeElement===window.__qaFollowButton),true);
    const capture=await screenshot('keyboard-follow-regression');
    await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>geobattle.followId),null);
    await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>geobattle.followId),observed.id);
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'deselect');
    await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'deselect');
    await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>geobattle.selectedId),null);
    assert.equal(await page.evaluate(()=>geobattle.mode),'PAUSED');
    await clickWorld(1200,100);await page.keyboard.press('Space');
    await page.waitForFunction(t=>geobattle.mode==='FIGHTING'&&geobattle.sim.time>t,paused);
    await action('return');return {screenshot:capture};
  });
}

try {
  stopServer=await startTestServer();browser=await launchBrowser();report.browserVersion=browser.version();
  if(SECTION==='smoke'||(DIST&&SECTION==='all')) await productionSmoke();
  else {
    if(SECTION==='all'||SECTION==='editor')await editorSuite();
    if(SECTION==='all'||SECTION==='storage')await storageSuite();
    if(SECTION==='all'||SECTION==='battle')await battleSuite();
    if(SECTION==='all'||SECTION==='replay')await replaySuite();
    for(const [w,h] of [[320,568],[375,812],[768,1024],[1366,768],[1920,1080],[3840,2160]])if(SECTION==='all'||SECTION==='responsive'||SECTION===`${w}x${h}`)await responsiveSuite(w,h);
  }
  if(SECTION==='all'||SECTION==='regressions')await interactionRegressionSuite();
  await check('console-and-request-health',async()=>{assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.requestFailures,[]);});
} catch(error) {
  report.cases.push({name:'browser-suite-bootstrap',status:'fail',error:String(error.message||error),stack:error.stack});console.error(error.stack);
} finally {
  report.completedAt=new Date().toISOString();await checkpoint();if(page&&!page.isClosed())await page.close({runBeforeUnload:false}).catch(()=>{});if(browser)await browser.close();if(stopServer)stopServer();
}
console.log(JSON.stringify({report:reportPath,...report.summary}));
if(report.summary.fail)process.exitCode=1;
