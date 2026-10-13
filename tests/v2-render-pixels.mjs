import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { UNIT_LIST } from '../src/data/units.js';
import { launchBrowser, BASE_URL, startTestServer } from './browser-runtime.mjs';

// A render-only equivalence test on an actual, naturally advanced paused battle.
// It does not advance the simulation manually or enter the FPS measurements.
const directory = process.env.GEOBATTLE_EVIDENCE || 'evidence/v2/perf-followup/pixels';
await mkdir(directory, { recursive: true });
const stop = await startTestServer(), browser = await launchBrowser();
const report = { browser: browser.version(), cases: [], errors: [], method: 'Full 128px source versus alpha-bounded source, identical frozen simulation and camera; no resolution reduction.' };
try {
  for (const dpr of [1, 2]) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(BASE_URL);
    await page.waitForFunction(() => geobattle?.renderer.metrics.drawnUnits === 80);
    const units = []; let id = 1;
    for (const team of ['red', 'blue']) UNIT_LIST.forEach((def, i) => {
      const x = 110 + i % 6 * 180;
      units.push({ id: id++, type: def.id, team, x: team === 'red' ? x : 2400 - x,
        y: 190 + Math.floor(i / 6) * 180, angle: team === 'red' ? 0 : Math.PI });
    });
    await page.locator('#import-file').setInputFiles({ name: '36-types.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, seed: 20261013, units })) });
    await page.locator('#start-button').click();
    await page.waitForFunction(() => geobattle.sim.time >= 1);
    await page.locator('#start-button').click();
    for (const zoom of [.35, .66, 1.2, 2]) {
      const result = await page.evaluate(zoom => {
        const a = geobattle, r = a.renderer, c = r.ctx;
        r.camera.zoom = zoom;
        const args = { formation: a.editor.formation, sim: a.sim, mode: a.mode, quality: 'low',
          showHealth: true, showGrid: true, showZones: false, screenShake: false };
        const draw = c.drawImage.bind(c);
        c.drawImage = function (...values) {
          if (values.length === 9 && values[0]._crop) return draw(values[0], -4, -4, 8, 8);
          return draw(...values);
        };
        r.draw(args); const original = c.getImageData(0, 0, r.canvas.width, r.canvas.height).data;
        c.drawImage = draw;
        r.draw(args); const cropped = c.getImageData(0, 0, r.canvas.width, r.canvas.height).data;
        let mismatchedPixels = 0, pixelsOver8 = 0, maximumChannelDelta = 0, sum = 0;
        for (let i = 0; i < original.length; i += 4) {
          let delta = 0;
          for (let channel = 0; channel < 4; channel++) {
            const value = Math.abs(original[i + channel] - cropped[i + channel]);
            sum += value; delta = Math.max(delta, value);
          }
          if (delta) mismatchedPixels++;
          if (delta > 8) pixelsOver8++;
          maximumChannelDelta = Math.max(maximumChannelDelta, delta);
        }
        const sprites = [...r._sprites.entries()].map(([key, image]) => ({ key, fullArea: image.width * image.height,
          croppedArea: image._crop.width * image._crop.height, bounds: image._crop }));
        return { zoom, width: r.canvas.width, height: r.canvas.height, mismatchedPixels, pixelsOver8,
          maximumChannelDelta, meanAbsoluteChannelDelta: sum / original.length,
          simTime: a.sim.time, drawnUnits: r.metrics.drawnUnits, sprites };
      }, zoom);
      // Subpixel interpolation may differ by a few channel levels; substantial clipping fails.
      assert.ok(result.pixelsOver8 / (result.width * result.height) < .001);
      assert.ok(result.meanAbsoluteChannelDelta < .05);
      assert.ok(result.drawnUnits > 0);
      const session = await context.newCDPSession(page);
      const { data } = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const screenshot = `all36-dpr${dpr}-zoom${zoom}.png`;
      await writeFile(`${directory}/${screenshot}`, Buffer.from(data, 'base64'));
      await session.detach();
      report.cases.push({ dpr, pass: true, screenshot, ...result });
    }
    await context.close();
  }
  assert.deepEqual(report.errors, []); report.pass = true;
} catch (error) { report.pass = false; report.failure = error.stack; process.exitCode = 1; }
finally {
  await writeFile(`${directory}/render-equivalence.json`, JSON.stringify(report, null, 2));
  await browser.close(); stop();
}
console.log(JSON.stringify({ pass: report.pass, cases: report.cases.length, failure: report.failure }));
