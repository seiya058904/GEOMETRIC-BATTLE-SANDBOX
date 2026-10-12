import test from 'node:test';
import assert from 'node:assert/strict';
import { Editor, PLACEMENT_GAP, teamForDeploymentPosition, resolvePlacementCandidate,
  validatePlacement, linePoints, gridPoints, createDefaultFormation, generateRandomFormation } from '../src/editor/index.js';
import { UNIT_LIST, WORLD } from '../src/data/units.js';
import { AUTOSAVE_KEY, PRESETS_KEY, PresetStore, inspectFormation, migrateFormation,
  parseFormationJSON, validateFormation, exportFormationJSON } from '../src/persistence/index.js';

const empty = () => ({ schemaVersion: 1, seed: 42, units: [] });
const troop = (id, team, x, y = 200, type = 'swordsman') => ({ id, team, x, y, type, angle: team === 'red' ? 0 : Math.PI });
const pair = () => ({ ...empty(), units: [troop(1, 'red', 200), troop(2, 'red', 260)] });
const legacy = () => ({ ...empty(), units: [troop(1, 'red', 1800), troop(2, 'blue', 400, 400), troop(3, 'red', 700, 700), troop(4, 'blue', 1200, 900, 'tank')] });
class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.get(key) ?? null; }
  setItem(key, value) { this.map.set(key, String(value)); }
}
const legal = editor => assert.equal(validateFormation(editor.formation).ok, true);

for (const unit of UNIT_LIST) test(`${unit.id}: full body plus shared gap determines both home zones`, () => {
  const margin = unit.radius + PLACEMENT_GAP, mid = WORLD.width / 2;
  assert.equal(teamForDeploymentPosition(unit.id, mid - margin, 500), 'red');
  assert.equal(teamForDeploymentPosition(unit.id, mid + margin, 500), 'blue');
  assert.equal(teamForDeploymentPosition(unit.id, mid - margin + 0.01, 500), null);
  assert.equal(teamForDeploymentPosition(unit.id, mid + margin - 0.01, 500), null);
  assert.equal(teamForDeploymentPosition(unit.id, mid, 500), null);
  const editor = new Editor(empty());
  for (const [x, team] of [[400, 'red'], [2000, 'blue']]) {
    const preview = resolvePlacementCandidate(unit.id, { x, y: 500 });
    assert.equal(preview.ok, true); assert.equal(preview.candidate.team, team);
    assert.equal(editor.place(unit.id, team === 'red' ? 'blue' : 'red', x, 500).ok, true);
    assert.equal(editor.formation.units.at(-1).team, team);
    assert.equal(editor.formation.units.at(-1).angle, preview.candidate.angle);
  }
  const before = editor.formation;
  assert.equal(resolvePlacementCandidate(unit.id, { x: mid, y: 500 }).code, 'home-zone');
  assert.equal(editor.place(unit.id, 'red', mid, 500).ok, false); assert.equal(editor.formation, before);
  legal(editor);
});

test('world coordinates, body bounds, nonfinite inputs and unknown types share preview/commit rejection', () => {
  for (const [type, x, y, code] of [['tank', 2, 500, 'bounds'], ['tank', 500, Infinity, 'position'], ['__proto__', 500, 500, 'type']]) {
    const preview = resolvePlacementCandidate(type, { x, y });
    assert.equal(preview.code, code);
    assert.equal(new Editor(empty()).place(type, 'red', x, y).ok, false);
  }
  assert.equal(validatePlacement([], troop(1, 'red', 1900)).code, 'home-zone');
});

test('brush chunks keep their explicit gesture team and a single complete undo', () => {
  const editor = new Editor(empty()); editor.beginTransaction();
  const first = editor.placeMany(linePoints({ type: 'peasant', team: 'red', x1: 500, y1: 500, x2: 1300, y2: 500, spacing: 20 }));
  assert.ok(first.added >= 30); assert.ok(first.reasons['home-zone'] > 0);
  const second = editor.placeMany([{ type: 'peasant', team: 'red', x: 1500, y: 500 }]);
  assert.equal(second.added, 0); assert.equal(second.reasons['home-zone'], 1);
  assert.ok(editor.formation.units.every(u => u.team === 'red'));
  editor.commitTransaction(); legal(editor);
  const after = editor.formation; editor.undo(); assert.equal(editor.formation.units.length, 0);
  editor.redo(); assert.equal(editor.formation, after);
});

test('line and matrix clip the locked side with exact counted skips instead of enemy generation', () => {
  for (const points of [
    linePoints({ type: 'peasant', team: 'red', x1: 1000, y1: 500, x2: 1400, y2: 500, spacing: 20 }),
    gridPoints({ type: 'peasant', team: 'blue', x1: 1400, y1: 400, x2: 1000, y2: 500, spacing: 20 }),
  ]) {
    const editor = new Editor(empty()), result = editor.placeMany(points);
    assert.ok(result.added > 0); assert.ok(result.skipped > 0);
    assert.equal(result.added + result.skipped, points.length);
    assert.equal(result.skipped, result.reasons['home-zone']);
    assert.ok(editor.formation.units.every(u => u.team === points[0].team)); legal(editor);
  }
});

test('whole group move preview and commit reassign only a complete opposite-half transfer', () => {
  const editor = new Editor(pair()); editor.select([1, 2]);
  const before = editor.formation, preview = editor.getMovePreview(1400, 0);
  assert.equal(preview.ok, true); assert.equal(editor.formation, before);
  assert.ok(preview.candidates.every(u => u.team === 'blue'));
  assert.equal(editor.moveSelection(1400, 0).ok, true);
  assert.deepEqual(editor.formation.units, preview.candidates); legal(editor);
  editor.undo(); assert.equal(editor.formation, before); assert.deepEqual([...editor.selection], [1, 2]);
  editor.redo(); legal(editor);
});

test('straddling move and rotation reject every member without touching history, IDs or selection', () => {
  const editor = new Editor({ ...empty(), units: [troop(1, 'red', 1100, 400), troop(2, 'red', 1100, 750)] }); editor.select([1, 2]);
  const before = editor.formation;
  assert.equal(editor.rotateSelection(Math.PI / 2).ok, false); assert.equal(editor.formation, before);
  assert.equal(editor.moveSelection(100, 0).ok, false); assert.equal(editor.formation, before);
  assert.equal(editor.canUndo, false); assert.deepEqual([...editor.selection], [1, 2]);
});

test('mixed selection keeps teams for legal translation and rejects scattered cross-team transfer', () => {
  const editor = new Editor({ ...empty(), units: [troop(1, 'red', 1100), troop(2, 'blue', 1500)] });
  editor.selectRect(0, 0, WORLD.width, WORLD.height); assert.deepEqual([...editor.selection], [1, 2]);
  assert.equal(editor.moveSelection(0, 100).ok, true); legal(editor);
  const before = editor.formation;
  assert.equal(editor.moveSelection(200, 0).ok, false); assert.equal(editor.formation, before);
});

test('paste uses actual clipboard ghosts, target half and atomic same-half rejection, retaining clipboard', () => {
  const editor = new Editor(pair()); editor.select([1, 2]); editor.copySelection();
  const before = editor.formation;
  const preview = editor.getPastePreview(1800, 700, 'red');
  assert.equal(preview.ok, true); assert.equal(editor.formation, before);
  assert.deepEqual(preview.candidates.map(u => [u.x, u.team]), [[1770, 'blue'], [1830, 'blue']]);
  assert.equal(editor.pasteAt(1800, 700, 'red').ok, true);
  assert.deepEqual(editor.formation.units.slice(-2).map(({ id, ...u }) => u), preview.candidates);
  legal(editor); editor.undo(); assert.equal(editor.formation, before);
  assert.equal(editor.getPastePreview(1200, 700).ok, false);
  assert.equal(editor.pasteAt(1200, 700).ok, false); assert.equal(editor.formation, before);
  assert.equal(editor.clipboardSize, 2); assert.equal(editor.canRedo, true);
});

test('mirror copy, whole mirror and army exchange always change home zone, facing and team together', () => {
  for (const operation of ['mirrorSelection', 'mirrorAll', 'swapTeams']) {
    const editor = new Editor(pair()); editor.select([1, 2]); const before = editor.formation;
    const result = editor[operation]('red'); assert.equal(result.ok, true); legal(editor);
    const units = operation === 'mirrorSelection' ? editor.formation.units.slice(-2) : editor.formation.units;
    assert.deepEqual(units.map(u => [u.x, u.team, u.angle]), [[2200, 'blue', Math.PI], [2140, 'blue', Math.PI]]);
    editor.undo(); assert.equal(editor.formation, before); editor.redo(); legal(editor);
  }
});

test('body-aware deletion hits both teams in one transaction and undo restores selection', () => {
  const editor = new Editor({ ...empty(), units: [troop(1, 'red', 200), troop(2, 'blue', 2000)] });
  editor.select([1, 2]); const before = editor.formation; editor.beginTransaction();
  assert.equal(editor.eraseAt(200, 200, 0).deleted, 1); assert.equal(editor.eraseAt(2000, 200, 0).deleted, 1);
  editor.commitTransaction(); assert.equal(editor.formation.units.length, 0);
  editor.undo(); assert.equal(editor.formation, before); assert.deepEqual([...editor.selection], [1, 2]);
});

test('default and random armies validate strictly without changing deterministic counts', () => {
  assert.equal(validateFormation(createDefaultFormation()).ok, true);
  for (const size of ['small', 'normal', 'large', 'chaos']) {
    const formation = generateRandomFormation(314159, size);
    assert.equal(validateFormation(formation).ok, true); assert.deepEqual(formation, generateRandomFormation(314159, size));
  }
});

test('legacy import remains read-only with full sanitized data and exact original backup', () => {
  const original = legacy(), raw = JSON.stringify(original, null, 2);
  const inspected = parseFormationJSON(raw);
  assert.equal(inspected.ok, false); assert.equal(inspected.code, 'migration');
  assert.deepEqual(inspected.value, original); assert.equal(inspected.raw, raw);
  assert.deepEqual(inspected.incompatible.map(u => u.id), [1, 2, 4]);
  assert.throws(() => new Editor(original), /区域|分界线/);
  const editor = new Editor(pair()), before = editor.formation;
  assert.equal(editor.setFormation(original).ok, false); assert.equal(editor.formation, before);
  assert.equal(validateFormation(original, { allowLegacy: true }).ok, true);
  assert.equal(exportFormationJSON(original).ok, false);
});

test('explicit compatible copy retains every ID, type, team, angle and seed, with deterministic placement', () => {
  const original = legacy(), raw = JSON.stringify(original), migrated = migrateFormation(original);
  assert.equal(migrated.ok, true); assert.equal(migrated.moved, 3); assert.equal(validateFormation(migrated.value).ok, true);
  assert.equal(JSON.stringify(original), raw); assert.deepEqual(migrated, migrateFormation(original));
  assert.deepEqual(migrated.value.units.map(({ x, y, ...u }) => u), original.units.map(({ x, y, ...u }) => u));
  assert.equal(migrated.value.seed, original.seed); assert.deepEqual(migrated.value.units[2], original.units[2]);
  const editor = new Editor(pair()), before = editor.formation; assert.equal(editor.setFormation(migrated.value).ok, true);
  editor.undo(); assert.equal(editor.formation, before); editor.redo(); legal(editor);
});

test('migration collision search preserves all units, and malformed historical data remains rejected', () => {
  const original = { ...empty(), units: [troop(1, 'red', 400), troop(2, 'red', 2000)] };
  const migrated = migrateFormation(original); assert.equal(migrated.ok, true);
  assert.notEqual(migrated.value.units[1].x, 400); assert.equal(migrated.value.units.length, 2);
  assert.equal(validateFormation(migrated.value).ok, true);
  for (const bad of [{ ...legacy(), schemaVersion: 99 }, { ...legacy(), seed: -1 }, { ...legacy(), units: [troop(1, 'red', -50)] }]) {
    assert.equal(inspectFormation(bad).ok, false); assert.notEqual(inspectFormation(bad).code, 'migration');
    assert.equal(migrateFormation(bad).ok, false);
  }
});

test('legacy, damaged and future autosaves cannot be overwritten before explicit recovery acceptance', () => {
  for (const raw of [JSON.stringify(legacy()), '{broken', '', JSON.stringify({ schemaVersion: 99, seed: 1, units: [] })]) {
    const storage = new MemoryStorage(); storage.map.set(AUTOSAVE_KEY, raw);
    const store = new PresetStore(storage), loaded = store.loadAutosave();
    assert.equal(loaded.ok, false); assert.equal(loaded.raw, raw); assert.equal(store.autosaveProtected, true);
    assert.equal(store.saveAutosave(pair()).code, 'protected'); assert.equal(storage.map.get(AUTOSAVE_KEY), raw);
    store.releaseAutosaveProtection(); assert.equal(store.saveAutosave(pair()).ok, true);
  }
});

test('saving without first loading still protects historical autosave and unreadable storage', () => {
  const storage = new MemoryStorage(), raw = JSON.stringify(legacy()); storage.map.set(AUTOSAVE_KEY, raw);
  const store = new PresetStore(storage);
  assert.equal(store.saveAutosave(pair()).code, 'protected'); assert.equal(storage.map.get(AUTOSAVE_KEY), raw);
  const blocked = new PresetStore({ getItem() { throw new Error('unreadable'); }, setItem() { throw new Error('must not write'); } });
  assert.equal(blocked.saveAutosave(pair()).code, 'protected'); assert.equal(blocked.autosaveProtected, true);
});

test('an overcrowded historical team fails migration atomically instead of silently dropping units', () => {
  const original = { ...empty(), units: Array.from({ length: 400 }, (_, i) => troop(i + 1, 'red', 40 + (i % 30) * 73, 40 + Math.floor(i / 30) * 73, 'giant')) };
  const raw = JSON.stringify(original);
  assert.equal(validateFormation(original, { allowLegacy: true }).ok, true);
  const migration = migrateFormation(original);
  assert.equal(migration.ok, false); assert.equal(migration.code, 'migration-space');
  assert.equal(JSON.stringify(original), raw); assert.equal(original.units.length, 400);
});

test('legacy presets remain listed by name/date/count and a compatible copy does not replace original', () => {
  const storage = new MemoryStorage(), original = legacy();
  storage.map.set(PRESETS_KEY, JSON.stringify({ schemaVersion: 1, presets: [{ id: 'p_old', name: '旧阵型', updatedAt: '2026-10-13T00:00:00.000Z', formation: original }] }));
  const store = new PresetStore(storage);
  assert.deepEqual(store.listPresets().value, [{ id: 'p_old', name: '旧阵型', updatedAt: '2026-10-13T00:00:00.000Z', unitCount: 4 }]);
  const loaded = store.loadPreset('p_old'); assert.equal(loaded.code, 'migration'); assert.deepEqual(JSON.parse(loaded.raw), original);
  assert.equal(store.savePreset('兼容副本', migrateFormation(original).value).ok, true);
  assert.deepEqual(JSON.parse(storage.map.get(PRESETS_KEY)).presets[0].formation, original);
  assert.equal(store.listPresets().value.length, 2); assert.equal(store.loadPreset('p_old').code, 'migration');
});
