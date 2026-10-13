import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Editor, HISTORY_LIMIT, PLACEMENT_GAP, brushPoints, createDefaultFormation,
  generateRandomFormation, gridPoints, linePoints, selectionBounds, validatePlacement,
} from '../src/editor/index.js';
import { MAX_UNITS, UNIT_LIST, UNIT_MAP, WORLD } from '../src/data/units.js';
import {
  AUTOSAVE_KEY, PRESETS_KEY, MAX_FILE_BYTES, PresetStore,
  exportFormationJSON, parseFormationJSON, validateFormation,
} from '../src/persistence/index.js';

const empty = (seed = 7) => ({ schemaVersion: 1, seed, units: [] });
const troop = (id, type, team, x, y, angle = team === 'red' ? 0 : Math.PI) => ({ id, type, team, x, y, angle });
const sample = () => ({ schemaVersion: 1, seed: 42, units: [
  troop(1, 'swordsman', 'red', 200, 200),
  troop(2, 'shield_guard', 'red', 260, 200),
  troop(3, 'archer', 'blue', 1800, 900),
] });
const clone = value => JSON.parse(JSON.stringify(value));

test('swept eraser covers a sparse diagonal path including unit edges and preserves outside units',()=>{
  const initial=empty();initial.units=[troop(1,'peasant','red',300,300),troop(2,'peasant','red',500,500),troop(3,'peasant','red',600,700),troop(4,'peasant','blue',1800,500)];
  const editor=new Editor(initial);const before=editor.formation;
  const result=editor.eraseStroke(200,200,800,800,12,'red');
  assert.equal(result.deleted,2);assert.deepEqual(editor.formation.units.map(u=>u.id),[3,4]);
  editor.undo();assert.deepEqual(editor.formation,before);
  for(const args of [[NaN,0,0,0,1],[0,0,1,1,-1],[0,0,Infinity,0,1]])assert.equal(editor.eraseStroke(...args).ok,false);
  assert.deepEqual(editor.formation,before);
});
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≠ ${b}`);
const full = () => ({ schemaVersion: 1, seed: 1, units: Array.from({ length: MAX_UNITS }, (_, i) => {
  const local = i % (MAX_UNITS / 2), x = 30 + (local % 46) * 25;
  return troop(i + 1, 'peasant', i < MAX_UNITS / 2 ? 'red' : 'blue', i < MAX_UNITS / 2 ? x : WORLD.width - x, 30 + Math.floor(local / 46) * 25);
}) });

class MemoryStorage {
  constructor() { this.map = new Map(); this.readError = null; this.writeError = null; }
  getItem(key) { if (this.readError) throw this.readError; return this.map.get(key) ?? null; }
  setItem(key, value) { if (this.writeError) throw this.writeError; this.map.set(key, String(value)); }
}

// Actual placement geometry, capacity and sanitized immutable snapshots.
test('default example is a legal 40 versus 40 mixed army', () => {
  const editor = new Editor();
  assert.equal(editor.getCounts().red.count, 40);
  assert.equal(editor.getCounts().blue.count, 40);
  assert.equal(editor.getCounts().total, 80);
  assert.equal(validateFormation(editor.formation).ok, true);
  assert.ok(new Set(editor.formation.units.map(u => u.type)).size >= 6);
  const red = editor.formation.units.filter(u => u.team === 'red');
  const blue = editor.formation.units.filter(u => u.team === 'blue');
  const tally = units => Object.fromEntries([...new Set(units.map(u => u.type))].map(type => [type, units.filter(u => u.type === type).length]));
  assert.deepEqual(tally(red), { giant: 1, shield_guard: 6, swordsman: 12, archer: 12, cavalry: 6, tank: 2, healer: 1 });
  assert.deepEqual(tally(blue), { mech: 1, shield_guard: 6, pikeman: 12, rifleman: 12, wolf: 6, tank: 2, healer: 1 });
  red.forEach((u, i) => { assert.equal(blue[i].x, WORLD.width - u.x); assert.equal(blue[i].y, u.y); });
});
test('the Editor owns a deeply frozen copy of the supplied formation', () => {
  const source = sample(); const editor = new Editor(source);
  source.units[0].x = 1000;
  assert.equal(editor.formation.units[0].x, 200);
  assert.throws(() => { editor.formation.units[0].x = 0; }, TypeError);
  assert.throws(() => editor.formation.units.push(troop(8, 'peasant', 'red', 99, 99)), TypeError);
});
test('single placement uses the complete body radius at all four boundaries', () => {
  const editor = new Editor(empty());
  assert.equal(editor.place('giant', 'red', 34.5, 90).ok, false);
  assert.equal(editor.place('giant', 'red', 35, 90).ok, true);
  assert.equal(editor.place('giant', 'blue', WORLD.width - 35, WORLD.height - 35).ok, true);
  assert.equal(editor.place('giant', 'blue', WORLD.width - 34, 200).ok, false);
  assert.equal(editor.place('peasant', 'red', 400, 8).ok, false);
  assert.equal(editor.getCounts().total, 2);
});
test('initial overlap uses real mixed radii and position determines team', () => {
  const editor = new Editor(empty());
  assert.equal(editor.place('giant', 'red', 100, 100).ok, true);
  assert.equal(editor.place('peasant', 'blue', 145, 100).ok, false);
  assert.equal(editor.place('peasant', 'red', 145, 100).ok, false);
  assert.equal(editor.place('peasant', 'blue', 146, 100).ok, true);
  assert.equal(editor.formation.units[1].team, 'red');
  assert.equal(35 + 9 + PLACEMENT_GAP, 46);
});
test('batch reports every skipped overlap, boundary and unknown type', () => {
  const editor = new Editor(empty());
  const result = editor.placeMany([
    { type: 'peasant', team: 'red', x: 100, y: 100 },
    { type: 'peasant', team: 'red', x: 125, y: 100 },
    { type: 'peasant', team: 'blue', x: 100, y: 100 },
    { type: 'peasant', team: 'blue', x: 2, y: 100 },
    { type: 'constructor', team: 'blue', x: 200, y: 100 },
  ]);
  assert.equal(result.added, 2); assert.equal(result.skipped, 3);
  assert.deepEqual(result.reasons, { overlap: 1, bounds: 1, type: 1 });
  assert.match(result.message, /跳过 3/); assert.equal(editor.getCounts().total, 2);
});
test('the total cap is shared across teams, and failure creates no history entry', () => {
  const editor = new Editor(full());
  assert.equal(validateFormation(editor.formation).ok, true);
  const before = editor.formation;
  const result = editor.place('peasant', 'blue', 2200, 1000);
  assert.equal(result.ok, false); assert.equal(result.skipped, 1);
  assert.match(result.message, new RegExp(String(MAX_UNITS)));
  assert.equal(editor.formation, before); assert.equal(editor.canUndo, false);
  assert.equal(validatePlacement(editor.formation.units, { type: 'peasant', team: 'red', x: 2200, y: 1000 }, new Set([99999])).ok, false);
});
test('batch fills the last available slots and reports all over-cap candidates', () => {
  const formation = full(); formation.units.splice(MAX_UNITS - 2);
  const editor = new Editor(formation);
  const result = editor.placeMany(linePoints({ type: 'peasant', team: 'blue', x1: 1800, y1: 1000, x2: 2000, y2: 1000, count: 5 }));
  assert.equal(result.added, 2); assert.equal(result.skipped, 3);
  assert.equal(editor.getCounts().total, MAX_UNITS);
});
test('very large imported numeric IDs do not overflow allocation or become duplicated', () => {
  const formation = empty(); formation.units.push(troop(Number.MAX_SAFE_INTEGER, 'peasant', 'red', 100, 100));
  const editor = new Editor(formation);
  assert.equal(editor.place('archer', 'blue', 200, 100).ok, true);
  assert.equal(editor.formation.units[1].id, 1);
  assert.equal(validateFormation(editor.formation).ok, true);
});
test('reference cost is informational and sums the actual team units', () => {
  const editor = new Editor(sample());
  assert.deepEqual(editor.getCounts(), { red: { count: 2, cost: UNIT_MAP.swordsman.cost + UNIT_MAP.shield_guard.cost }, blue: { count: 1, cost: UNIT_MAP.archer.cost }, total: 3 });
});

// Uniform geometric tools and fast input events.
test('fast brush jumps are filled with uniform samples instead of empty gaps', () => {
  const points = brushPoints({ type: 'peasant', team: 'red', spacing: 20, path: [{ x: 100, y: 100 }, { x: 900, y: 100 }] });
  assert.equal(points.length, 41);
  for (let i = 1; i < points.length; i++) close(points[i].x - points[i - 1].x, 20);
  const editor = new Editor(empty());
  assert.equal(editor.placeMany(points).added, 41);
  assert.equal(editor.undo().ok, true); assert.equal(editor.formation.units.length, 0);
});
test('brush resampling carries distance across slow and fast pointer boundaries', () => {
  const common = { type: 'peasant', team: 'red', spacing: 20 };
  const fast = brushPoints({ ...common, path: [{ x: 100, y: 100 }, { x: 900, y: 100 }] });
  const slow = brushPoints({ ...common, path: [{ x: 100, y: 100 }, { x: 333, y: 100 }, { x: 451, y: 100 }, { x: 900, y: 100 }] });
  assert.equal(fast.length, slow.length);
  fast.forEach((p, i) => { close(p.x, slow[i].x); close(p.y, slow[i].y); });
});
test('duplicate brush events and tight turns never create overlapping units', () => {
  const points = brushPoints({ type: 'peasant', team: 'red', spacing: 20, path: [{ x: 100, y: 100 }, { x: 100, y: 100 }, { x: 300, y: 100 }, { x: 100, y: 100 }] });
  const editor = new Editor(empty());
  const result = editor.placeMany(points);
  assert.ok(result.skipped > 0); assert.equal(result.added + result.skipped, points.length);
  assert.equal(validateFormation(editor.formation).ok, true);
});
test('line tools fit requested count using body spacing and explicit blue facing', () => {
  const points = linePoints({ type: 'peasant', team: 'blue', x1: 100, y1: 100, x2: 200, y2: 100, count: 100, spacing: 1 });
  assert.equal(points.length, 6);
  assert.ok(points.every(p => p.angle === Math.PI));
  assert.equal(points[0].x, 100); assert.equal(points.at(-1).x, 200);
});
test('a zero-length line is a single valid placement preview', () => {
  const points = linePoints({ type: 'tank', team: 'red', x1: 500, y1: 500, x2: 500, y2: 500 });
  assert.equal(points.length, 1); assert.equal(points[0].x, 500);
});
test('rectangles preserve spacing and behave identically when dragged backwards', () => {
  const forward = gridPoints({ type: 'peasant', team: 'red', x1: 100, y1: 100, x2: 200, y2: 160, spacing: 20 });
  const reverse = gridPoints({ type: 'peasant', team: 'red', x1: 200, y1: 160, x2: 100, y2: 100, spacing: 20 });
  assert.deepEqual(forward, reverse); assert.equal(forward.length, 24);
  assert.equal(new Editor(empty()).placeMany(forward).added, 24);
});
test('invalid or adversarially large geometry inputs have bounded output', () => {
  assert.deepEqual(linePoints({ type: 'tank', team: 'red', x1: NaN, y1: 0, x2: 20, y2: 30 }), []);
  assert.deepEqual(brushPoints({ type: 'tank', team: 'red', path: [{ x: Infinity, y: 0 }] }), []);
  assert.ok(gridPoints({ type: 'peasant', team: 'red', x1: 0, y1: 0, x2: 1e300, y2: 1e300 }).length <= MAX_UNITS + 1);
});

// User-sized undo transactions and group operations.
test('a full brush drag across many calls is one undo and one redo transaction', () => {
  const editor = new Editor(empty());
  editor.beginTransaction();
  for (let i = 0; i < 100; i++) assert.equal(editor.place('peasant', 'red', 50 + (i % 20) * 25, 50 + Math.floor(i / 20) * 25).ok, true);
  assert.equal(editor.canUndo, false); editor.commitTransaction();
  assert.equal(editor.formation.units.length, 100); editor.undo();
  assert.equal(editor.formation.units.length, 0); assert.equal(editor.canUndo, false);
  editor.redo(); assert.equal(editor.formation.units.length, 100);
});
test('at least 50 transactions survive, and retention is exactly the documented 100', () => {
  const editor = new Editor(empty(0));
  for (let seed = 1; seed <= HISTORY_LIMIT + 50; seed++) editor.setSeed(seed);
  let undone = 0; while (editor.canUndo) { editor.undo(); undone++; }
  assert.equal(undone, HISTORY_LIMIT); assert.equal(editor.formation.seed, 50);
  let redone = 0; while (editor.canRedo) { editor.redo(); redone++; }
  assert.equal(redone, HISTORY_LIMIT); assert.equal(editor.formation.seed, HISTORY_LIMIT + 50);
});
test('cancel restores units, selection and the preceding redo branch', () => {
  const editor = new Editor(sample()); editor.select([1]); editor.moveSelection(0, 100); editor.undo();
  assert.equal(editor.canRedo, true);
  const before = editor.formation;
  editor.beginTransaction(); editor.place('tank', 'red', 800, 600); editor.select([3]);
  editor.cancelTransaction();
  assert.equal(editor.formation, before); assert.deepEqual([...editor.selection], [1]);
  assert.equal(editor.canRedo, true); editor.redo(); assert.equal(editor.formation.units[0].y, 300);
});
test('rejected and no-op transactions preserve redo instead of clearing useful history', () => {
  const editor = new Editor(sample()); editor.setSeed(99); editor.undo();
  editor.beginTransaction(); editor.place('tank', 'blue', 1, 1); editor.commitTransaction();
  assert.equal(editor.canRedo, true); assert.equal(editor.canUndo, false);
});
test('nested transactions and undo during a drag are explicitly rejected', () => {
  const editor = new Editor(empty()); editor.beginTransaction();
  assert.equal(editor.beginTransaction().ok, false); assert.equal(editor.undo().ok, false);
  editor.cancelTransaction(); assert.equal(editor.commitTransaction().ok, false);
});
test('a committed edit clears the obsolete redo branch', () => {
  const editor = new Editor(sample()); editor.setSeed(99); editor.undo();
  editor.place('tank', 'red', 800, 600); assert.equal(editor.canRedo, false);
});
test('box selection is team-scoped, appendable, and ignores stale unit IDs', () => {
  const editor = new Editor(sample()); editor.select([999]); assert.equal(editor.selection.size, 0);
  editor.selectRect(300, 300, 100, 100, 'red'); assert.deepEqual([...editor.selection], [1, 2]);
  editor.selectRect(1700, 800, 1900, 1000, 'blue', true); assert.deepEqual([...editor.selection], [1, 2, 3]);
  editor.selectRect(0, 0, 2000, 1000, 'red'); assert.deepEqual([...editor.selection], [1, 2]);
});
test('group translation treats old selected bodies as replaced, preserving relative positions', () => {
  const editor = new Editor(sample()); editor.select([1, 2]);
  assert.equal(editor.moveSelection(60, 0).ok, true);
  assert.equal(editor.formation.units[0].x, 260); assert.equal(editor.formation.units[1].x, 320);
  assert.equal(editor.formation.units[1].x - editor.formation.units[0].x, 60);
  editor.undo(); assert.deepEqual(editor.formation, sample()); editor.redo(); assert.equal(editor.formation.units[0].x, 260);
});
test('one colliding group member rejects the entire move without a partial mutation', () => {
  const formation = sample(); formation.units[2].x = 360; formation.units[2].y = 200; formation.units[2].team = 'red';
  const editor = new Editor(formation); editor.select([1, 2]); const before = editor.formation;
  assert.equal(editor.moveSelection(100, 0).ok, false);
  assert.equal(editor.formation, before); assert.equal(editor.canUndo, false);
  assert.equal(editor.moveSelection(-500, 0).ok, false); assert.equal(editor.formation, before);
});
test('rotation changes both positions and facings around the same center', () => {
  const editor = new Editor(sample()); editor.select([1, 2]);
  assert.equal(editor.rotateSelection(Math.PI / 2).ok, true);
  const [first, second] = editor.formation.units;
  close(first.x, 230); close(first.y, 170); close(second.x, 230); close(second.y, 230);
  close(first.angle, Math.PI / 2); close(second.angle, Math.PI / 2);
  assert.equal(validateFormation(editor.formation).ok, true);
  editor.undo(); assert.deepEqual(editor.formation, sample());
});
test('rotation collision is atomic for orientation as well as positions', () => {
  const formation = sample(); formation.units[2].x = 230; formation.units[2].y = 170; formation.units[2].team = 'red';
  const editor = new Editor(formation); editor.select([1, 2]); const before = editor.formation;
  assert.equal(editor.rotateSelection(Math.PI / 2).ok, false); assert.equal(editor.formation, before);
});
test('copy/paste keeps relative positions and facings, assigns target half and allocates fresh IDs', () => {
  const editor = new Editor(sample()); editor.select([1, 2]); editor.copySelection();
  assert.equal(editor.canPaste, true); assert.equal(editor.clipboardSize, 2);
  assert.equal(editor.pasteAt(1700, 500, 'red').ok, true);
  const pasted = editor.formation.units.slice(-2);
  assert.deepEqual(pasted.map(u => [u.x, u.y, u.team, u.angle]), [[1670, 500, 'blue', 0], [1730, 500, 'blue', 0]]);
  assert.equal(new Set(editor.formation.units.map(u => u.id)).size, 5);
  assert.deepEqual([...editor.selection], pasted.map(u => u.id));
  editor.undo(); assert.equal(editor.formation.units.length, 3); assert.deepEqual([...editor.selection], [1, 2]);
  editor.redo(); assert.equal(editor.formation.units.length, 5);
});
test('clipboard is detached from later source moves or deletions', () => {
  const editor = new Editor(sample()); editor.select([1, 2]); editor.copySelection(); editor.deleteSelection();
  assert.equal(editor.pasteAt(500, 500).ok, true);
  assert.equal(editor.formation.units[1].x, 470); assert.equal(editor.formation.units[2].x, 530);
});
test('invalid or colliding paste places none of the group', () => {
  const editor = new Editor(sample()); editor.select([1, 2]); editor.copySelection(); const before = editor.formation;
  assert.equal(editor.pasteAt(230, 200).ok, false); assert.equal(editor.formation, before);
  assert.equal(editor.pasteAt(5, 200).ok, false); assert.equal(editor.formation, before);
  assert.equal(editor.pasteAt(NaN, 200).ok, false); assert.equal(editor.formation, before);
});
test('whole-group paste obeys the shared unit cap', () => {
  const editor = new Editor(full()); editor.select([1, 2]); editor.copySelection();
  const before = editor.formation;
  assert.equal(editor.pasteAt(2000, 900, 'blue').ok, false); assert.equal(editor.formation, before);
});
test('mirror copy reflects world x and facing with a new target team', () => {
  const editor = new Editor(sample()); editor.select([1, 2]);
  assert.equal(editor.mirrorSelection('blue').ok, true);
  const mirrored = editor.formation.units.slice(-2);
  assert.deepEqual(mirrored.map(u => [u.x, u.y, u.angle, u.team]), [[2200, 200, Math.PI, 'blue'], [2140, 200, Math.PI, 'blue']]);
  assert.equal(validateFormation(editor.formation).ok, true);
  editor.undo(); assert.deepEqual(editor.formation, sample()); editor.redo(); assert.equal(editor.formation.units.length, 5);
});
test('mirror copy on an occupied destination is rejected instead of swallowing a unit', () => {
  const formation = empty(); formation.units.push(troop(1, 'tank', 'red', 500, 500), troop(2, 'tank', 'blue', WORLD.width - 500, 500));
  const editor = new Editor(formation); editor.select([1]);
  assert.equal(editor.mirrorSelection('blue').ok, false); assert.equal(editor.formation.units.length, 2);
});
test('team swap and whole-world mirror exchange position, team and facing legally', () => {
  const editor = new Editor(sample()); editor.swapTeams();
  for (let i = 0; i < 3; i++) {
    const source = sample().units[i], changed = editor.formation.units[i];
    assert.equal(changed.x, WORLD.width - source.x); assert.equal(changed.y, source.y); close(changed.angle, (Math.PI - source.angle + Math.PI * 2) % (Math.PI * 2));
    assert.notEqual(changed.team, source.team);
  }
  editor.undo(); editor.mirrorAll();
  for (let i = 0; i < 3; i++) assert.notEqual(editor.formation.units[i].team, sample().units[i].team);
  assert.equal(editor.formation.units[0].x, WORLD.width - 200);
  editor.mirrorAll(); assert.deepEqual(editor.formation, sample());
});
test('team clearing, all clearing and restoring default are separately undoable', () => {
  const editor = new Editor(sample()); editor.clearTeam('red');
  assert.deepEqual(editor.formation.units.map(u => u.id), [3]);
  editor.clearAll(); assert.equal(editor.formation.units.length, 0);
  editor.resetDefault(); assert.equal(editor.formation.units.length, 80);
  editor.undo(); assert.equal(editor.formation.units.length, 0);
  editor.undo(); assert.deepEqual(editor.formation.units.map(u => u.id), [3]);
  editor.undo(); assert.deepEqual(editor.formation, sample());
});
test('team-scoped eraser is body-aware and supports an entire brush transaction', () => {
  const editor = new Editor(sample()); editor.beginTransaction();
  assert.equal(editor.eraseAt(200, 210, 0, 'red').ok, true);
  editor.eraseAt(260, 200, 4, 'red'); editor.commitTransaction();
  assert.deepEqual(editor.formation.units.map(u => u.id), [3]); editor.undo(); assert.deepEqual(editor.formation, sample());
});
test('enormous finite eraser input is bounded to the world and cannot hang', () => {
  const editor = new Editor(sample());
  assert.equal(editor.eraseAt(0, 0, 1e300, 'red').ok, true);
  assert.deepEqual(editor.formation.units.map(u => u.id), [3]);
});
test('selected deletion restores selection on undo and removes stale IDs on redo', () => {
  const editor = new Editor(sample()); editor.select([1, 2]); editor.deleteSelection();
  assert.equal(editor.selection.size, 0); editor.undo(); assert.deepEqual([...editor.selection], [1, 2]);
  editor.redo(); assert.equal(editor.selection.size, 0);
});
test('valid imports are undoable and invalid imports leave the exact prior object untouched', () => {
  const editor = new Editor(sample()); editor.select([1]); const before = editor.formation;
  assert.equal(editor.setFormation({ schemaVersion: 9 }).ok, false); assert.equal(editor.formation, before);
  editor.setFormation(empty(999)); assert.equal(editor.selection.size, 0); assert.equal(editor.formation.seed, 999);
  editor.undo(); assert.equal(editor.formation, before); assert.deepEqual([...editor.selection], [1]);
});
test('invalid numerical edit parameters never change current deployment', () => {
  const editor = new Editor(sample()); editor.select([1]); const before = editor.formation;
  assert.equal(editor.setSeed(-1).ok, false); assert.equal(editor.setSeed(0x100000000).ok, false);
  assert.equal(editor.moveSelection(Infinity, 0).ok, false); assert.equal(editor.rotateSelection(NaN).ok, false);
  assert.equal(editor.formation, before);
});
test('center calculation is explicit and stable for mixed shapes', () => {
  const bounds = selectionBounds(sample().units.slice(0, 2));
  assert.equal(bounds.x, 230); assert.equal(bounds.y, 200); assert.equal(selectionBounds([]), null);
});

// Versioned data validation and replayable legal random armies.
for (const [size, count] of Object.entries({ small: 20, normal: 80, large: 300, chaos: 600 })) {
  test(`random ${size}: exact ${count} units, repeatable positions, attackers and legality across seeds`, () => {
    for (const seed of [0, 1, 2, 13, 314159, 0xffffffff]) {
      const formation = generateRandomFormation(seed, size);
      assert.equal(formation.units.length, count);
      assert.deepEqual(formation, generateRandomFormation(seed, size));
      assert.equal(validateFormation(formation).ok, true);
      for (const team of ['red', 'blue']) {
        const units = formation.units.filter(u => u.team === team);
        assert.equal(units.length, count / 2);
        assert.ok(units.some(u => UNIT_MAP[u.type].attackKind !== 'heal' && UNIT_MAP[u.type].damage > 0));
      }
    }
  });
}
test('chaotic random armies can sample every one of the 36 actual preset types', () => {
  const formation = generateRandomFormation(314159, 'chaos');
  assert.equal(new Set(formation.units.map(u => u.type)).size, UNIT_LIST.length);
  assert.notDeepEqual(formation, generateRandomFormation(314160, 'chaos'));
});
test('random generator rejects unsupported inputs before replacing any army', () => {
  assert.throws(() => generateRandomFormation(-1, 'small'), RangeError);
  assert.throws(() => generateRandomFormation(0, 'unknown'), RangeError);
});
test('empty formations, zero seed and maximum uint32 seed are valid editable data', () => {
  assert.equal(validateFormation(empty(0)).ok, true);
  assert.equal(validateFormation(empty(0xffffffff)).ok, true);
  const parsed = parseFormationJSON(exportFormationJSON(empty()).value);
  assert.deepEqual(parsed.value, empty());
});
test('JSON export/import round-trips coordinates, IDs, types, teams and direction', () => {
  const exported = exportFormationJSON(sample()); assert.equal(exported.ok, true);
  assert.deepEqual(parseFormationJSON(exported.value).value, sample());
  assert.deepEqual(parseFormationJSON('\uFEFF' + exported.value).value, sample());
});
const malformed = [
  ['root array', () => []],
  ['unsupported schema', () => ({ ...sample(), schemaVersion: 2 })],
  ['fractional seed', () => ({ ...sample(), seed: 0.5 })],
  ['negative seed', () => ({ ...sample(), seed: -1 })],
  ['string seed', () => ({ ...sample(), seed: '12' })],
  ['missing units array', () => ({ schemaVersion: 1, seed: 1 })],
  ['duplicate ID', () => { const f = sample(); f.units[1].id = 1; return f; }],
  ['unsafe numeric ID', () => { const f = sample(); f.units[0].id = Number.MAX_SAFE_INTEGER + 1; return f; }],
  ['string ID', () => { const f = sample(); f.units[0].id = '1'; return f; }],
  ['unknown type', () => { const f = sample(); f.units[0].type = 'skeleton'; return f; }],
  ['prototype-name type', () => { const f = sample(); f.units[0].type = '__proto__'; return f; }],
  ['unknown team', () => { const f = sample(); f.units[0].team = 'neutral'; return f; }],
  ['string coordinate', () => { const f = sample(); f.units[0].x = '200'; return f; }],
  ['NaN coordinate', () => { const f = sample(); f.units[0].x = NaN; return f; }],
  ['Infinity coordinate', () => { const f = sample(); f.units[0].y = Infinity; return f; }],
  ['outside body bounds', () => { const f = sample(); f.units[0].x = 10; return f; }],
  ['missing angle', () => { const f = sample(); delete f.units[0].angle; return f; }],
  ['nonfinite angle', () => { const f = sample(); f.units[0].angle = -Infinity; return f; }],
  ['overlapping bodies', () => { const f = sample(); f.units[1].x = 200; return f; }],
  ['over-cap units', () => { const f = full(); f.units.push(troop(9999, 'peasant', 'blue', 2000, 1200)); return f; }],
];
for (const [name, make] of malformed) test(`reject malformed formation: ${name}`, () => {
  const result = validateFormation(make()); assert.equal(result.ok, false); assert.equal(typeof result.error, 'string'); assert.ok(result.error.length > 3);
});
test('invalid JSON and overflow numbers are rejected without evaluating arbitrary strings', () => {
  assert.equal(parseFormationJSON('{').ok, false);
  assert.equal(parseFormationJSON('NaN').ok, false);
  assert.equal(parseFormationJSON(JSON.stringify(sample()).replace('"x":200', '"x":1e309')).ok, false);
  assert.equal(parseFormationJSON('globalThis.editorInjection = true').ok, false);
  const input = sample(); input.units[0].type = '<script>globalThis.editorInjection=true</script>';
  assert.equal(parseFormationJSON(JSON.stringify(input)).ok, false);
  assert.equal(globalThis.editorInjection, undefined);
});
test('unknown fields and JSON prototype keys are removed rather than copied into live state', () => {
  const parsed = JSON.parse(JSON.stringify(sample()));
  Object.defineProperty(parsed, '__proto__', { value: { polluted: true }, enumerable: true });
  parsed.units[0].onclick = 'globalThis.editorInjection=true';
  const result = validateFormation(parsed); assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.value, '__proto__'), false); assert.equal(Object.hasOwn(result.value.units[0], 'onclick'), false);
  assert.equal({}.polluted, undefined);
});
test('2 MiB input limit is measured in UTF-8 bytes, including multibyte payloads', () => {
  assert.equal(parseFormationJSON(' '.repeat(MAX_FILE_BYTES + 1)).ok, false);
  const f = empty(); f.extra = '界'.repeat(Math.ceil(MAX_FILE_BYTES / 3));
  const result = parseFormationJSON(JSON.stringify(f)); assert.equal(result.ok, false); assert.equal(result.code, 'size');
  assert.equal(validateFormation(f).ok, false);
});
test('cyclic direct input is rejected and finite multi-turn angles normalize safely', () => {
  const f = sample(); f.cycle = f; assert.equal(validateFormation(f).ok, false);
  const valid = sample(); valid.units[0].angle = Math.PI * 8 + 0.5;
  close(validateFormation(valid).value.units[0].angle, 0.5);
});

// Durable storage, errors, multiple named presets and full read/write roundtrips.
test('a fresh store distinguishes an absent autosave from a storage failure', () => {
  const store = new PresetStore(new MemoryStorage());
  assert.deepEqual(store.loadAutosave(), { ok: true, value: null });
  assert.deepEqual(store.listPresets(), { ok: true, value: [] });
  assert.equal(new PresetStore(null).loadAutosave().ok, false);
});
test('autosave survives a fresh store instance and does not alias caller data', () => {
  const storage = new MemoryStorage(); const store = new PresetStore(storage); const source = sample();
  assert.equal(store.saveAutosave(source).ok, true); source.units[0].x = 900;
  const fresh = new PresetStore(storage); assert.deepEqual(fresh.loadAutosave().value, sample());
  assert.equal(storage.map.has(AUTOSAVE_KEY), true);
});
test('autosave preserves a deliberately empty field rather than resurrecting the default', () => {
  const store = new PresetStore(new MemoryStorage()); store.saveAutosave(empty(0));
  assert.deepEqual(store.loadAutosave().value, empty(0));
});
test('quota exhaustion reports failure, preserves prior storage and keeps the live army editable', () => {
  const storage = new MemoryStorage(); const store = new PresetStore(storage);
  store.saveAutosave(sample()); const oldValue = storage.map.get(AUTOSAVE_KEY);
  const editor = new Editor(sample()); editor.place('tank', 'red', 600, 600);
  storage.writeError = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
  const result = store.saveAutosave(editor.formation);
  assert.equal(result.ok, false); assert.match(result.error, /空间不足/);
  assert.equal(storage.map.get(AUTOSAVE_KEY), oldValue); assert.equal(editor.formation.units.length, 4);
  assert.equal(editor.place('peasant', 'red', 700, 600).ok, true);
});
test('disabled storage and getter-level SecurityError are caught instead of crashing construction', () => {
  const storage = new MemoryStorage(); storage.readError = Object.assign(new Error('blocked'), { name: 'SecurityError' });
  assert.match(new PresetStore(storage).loadAutosave().error, /禁止/);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Object.assign(new Error('blocked'), { name: 'SecurityError' }); } });
    const store = new PresetStore(); assert.equal(store.loadAutosave().ok, false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});
test('multiple named presets survive fresh reads and remain independent from autosave', () => {
  const storage = new MemoryStorage(); const store = new PresetStore(storage);
  const alpha = store.savePreset('甲队', sample()); const beta = store.savePreset('空白实验', empty(12));
  assert.equal(alpha.ok, true); assert.equal(beta.ok, true); assert.notEqual(alpha.value.id, beta.value.id);
  store.saveAutosave(createDefaultFormation());
  const fresh = new PresetStore(storage); const listed = fresh.listPresets();
  assert.equal(listed.value.length, 2); assert.equal(Object.hasOwn(listed.value[0], 'formation'), false);
  assert.deepEqual(listed.value.map(p => p.unitCount), [3, 0]);
  assert.deepEqual(fresh.loadPreset(alpha.value.id).value, sample());
  assert.deepEqual(fresh.loadPreset(beta.value.id).value, empty(12));
  assert.equal(fresh.loadAutosave().value.units.length, 80);
});
test('saving the same trimmed name updates its existing ID and data once', () => {
  const store = new PresetStore(new MemoryStorage());
  const first = store.savePreset('  实验  ', sample()); const updated = store.savePreset('实验', empty(999));
  assert.equal(updated.value.id, first.value.id); assert.equal(store.listPresets().value.length, 1);
  assert.deepEqual(store.loadPreset(first.value.id).value, empty(999));
});
test('preset deletion removes only the selected ID and errors for a stale ID', () => {
  const store = new PresetStore(new MemoryStorage()); const a = store.savePreset('A', sample()), b = store.savePreset('B', empty());
  assert.equal(store.deletePreset(a.value.id).ok, true); assert.equal(store.loadPreset(a.value.id).ok, false);
  assert.equal(store.loadPreset(b.value.id).ok, true); assert.equal(store.deletePreset(a.value.id).ok, false);
});
test('failed preset replacement or deletion leaves the prior saved collection intact', () => {
  const storage = new MemoryStorage(); const store = new PresetStore(storage); const a = store.savePreset('A', sample());
  const before = storage.map.get(PRESETS_KEY); storage.writeError = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
  assert.equal(store.savePreset('A', empty()).ok, false); assert.equal(storage.map.get(PRESETS_KEY), before);
  assert.equal(store.deletePreset(a.value.id).ok, false); assert.equal(storage.map.get(PRESETS_KEY), before);
});
test('corrupt preset collections are never silently discarded or overwritten on save', () => {
  const storage = new MemoryStorage(); storage.map.set(PRESETS_KEY, '{broken'); const store = new PresetStore(storage);
  assert.equal(store.listPresets().ok, false); assert.equal(store.savePreset('New', sample()).ok, false);
  assert.equal(storage.map.get(PRESETS_KEY), '{broken');
});
test('one corrupt saved army makes the problem explicit instead of omitting a preset', () => {
  const storage = new MemoryStorage(); const store = new PresetStore(storage); store.savePreset('A', sample()); store.savePreset('B', empty());
  const saved = JSON.parse(storage.map.get(PRESETS_KEY)); saved.presets[0].formation.units[0].type = 'unknown';
  storage.map.set(PRESETS_KEY, JSON.stringify(saved)); const result = store.listPresets();
  assert.equal(result.ok, false); assert.match(result.error, /A/);
});
test('invalid preset names and invalid formations never write storage', () => {
  const storage = new MemoryStorage(); const store = new PresetStore(storage);
  for (const name of ['', '  ', 'x'.repeat(61), 'a\nb']) assert.equal(store.savePreset(name, sample()).ok, false);
  assert.equal(store.savePreset('A', { schemaVersion: 5 }).ok, false); assert.equal(storage.map.size, 0);
});
test('names with markup remain plain data and loading never evaluates them', () => {
  const store = new PresetStore(new MemoryStorage());
  const name = '<script>globalThis.editorInjection=true</script>';
  const saved = store.savePreset(name, sample()); assert.equal(saved.ok, true);
  assert.equal(store.listPresets().value[0].name, name); assert.equal(globalThis.editorInjection, undefined);
});
test('malformed autosave returns an actionable error without deleting it', () => {
  const storage = new MemoryStorage(); storage.map.set(AUTOSAVE_KEY, '{oops'); const store = new PresetStore(storage);
  const result = store.loadAutosave(); assert.equal(result.ok, false); assert.match(result.error, /无法恢复/);
  assert.equal(storage.map.get(AUTOSAVE_KEY), '{oops');
});
