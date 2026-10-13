import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPERIMENTS, experimentFormation } from '../src/data/experiments.js';
import { validateFormation } from '../src/persistence/validation.js';
import { Editor } from '../src/editor/index.js';
import { Simulation } from '../src/sim/engine.js';
import { RecentReports } from '../src/ui/reports.js';

for (const item of EXPERIMENTS) {
  test(`${item.id}: both variants are valid, reversible and change only the intended variable`, () => {
    const a = experimentFormation(item.id, 0), b = experimentFormation(item.id, 1);
    assert.equal(validateFormation(a).ok, true); assert.equal(validateFormation(b).ok, true);
    assert.equal(a.seed, b.seed); assert.equal(a.units.length, b.units.length);
    for (let i = 0; i < a.units.length; i++) {
      const before = a.units[i], after = b.units[i];
      for (const key of ['id', 'type', 'team']) assert.equal(before[key], after[key]);
      if (before.team === 'blue') assert.deepEqual(before, after);
      if (item.id === 'shield') { assert.equal(before.x, after.x); assert.equal(before.y, after.y); }
      else assert.equal(before.angle, after.angle);
    }
    const editor = new Editor(a); editor.setFormation(b); editor.undo(); assert.deepEqual(editor.formation, a);
    editor.redo(); assert.deepEqual(editor.formation, b);
  });
  for (const variant of [0, 1]) test(`${item.id}/${variant}: naturally stepped result is deterministic`, () => {
    const run = () => { const sim = new Simulation(experimentFormation(item.id, variant), { collectVisuals: false }); for (let i = 0; i < 36000 && !sim.result; i++) sim.step(); assert.ok(sim.result); return sim.result; };
    assert.deepEqual(run(), run());
  });
}

test('recent reports are copied, bounded, seed-aware and independent of the authoritative result', () => {
  const reports = new RecentReports(), formation = experimentFormation('shield', 0), result = { duration: 5, teams: { red: { damage: 2 } } };
  reports.record(result, formation); result.teams.red.damage = 9;
  reports.record(result, { ...formation, units: [...formation.units].reverse() });
  assert.equal(reports.compare().sameArmy, true); assert.equal(reports.compare().sameSeed, true);
  assert.equal(reports.items[0].result.teams.red.damage, 2);
  reports.record(result, { ...formation, seed: 1 });
  assert.equal(reports.items.length, 2); assert.equal(reports.compare().sameSeed, false);
  reports.record(result, experimentFormation('blast', 0)); assert.equal(reports.compare().sameArmy, false);
});
