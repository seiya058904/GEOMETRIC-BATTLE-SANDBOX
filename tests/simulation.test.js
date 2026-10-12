import test from 'node:test';
import assert from 'node:assert/strict';
import { UNIT_LIST, UNIT_MAP, MAX_UNITS, FIXED_DT } from '../src/data/units.js';
import { Simulation } from '../src/sim/engine.js';
import { RNG, segmentCircle } from '../src/sim/rng.js';
import { SpatialHash } from '../src/sim/spatial.js';
import { canApplyHostileEffect, queueHit, queueHeal, resolveCombat, radialHit, coneHit, lineHit, damageAfterDefense } from '../src/sim/combat.js';
import { fireProjectile, updateProjectiles } from '../src/sim/projectiles.js';
import { performBasicAttack, pullGroup } from '../src/sim/abilities.js';
import { resolveBodies } from '../src/sim/physics.js';
import { acquireTarget } from '../src/sim/ai.js';

const deploy = (id, type, team, x, y = 675, angle = team === 'red' ? 0 : Math.PI) => ({ id, type, team, x, y, angle });
const simulation = (units, seed = 42, options = {}) => new Simulation({ schemaVersion: 1, seed, units }, { collectVisuals: false, ...options });
function advance(sim, seconds) { for (let i = 0; i < Math.ceil(seconds / FIXED_DT) && !sim.result; i++) sim.step(); return sim; }
function finish(sim) { for (let i = 0; i < 14401 && !sim.result; i++) sim.step(); assert.ok(sim.result, 'battle terminates within the documented limit'); return sim.result; }
function checkTotals(sim) {
  for (const t of Object.values(sim.summary().teams)) {
    assert.equal(t.initial, t.remaining + t.deaths);
    assert.equal(t.summoned, t.summonsAlive + t.summonDeaths);
    assert.ok(Math.abs(t.byType.reduce((sum, row) => sum + row.damage, 0) - t.damage) < 1e-7);
    assert.ok(Math.abs(t.byType.reduce((sum, row) => sum + row.healing, 0) - t.healing) < 1e-7);
  }
}

test('roster has exactly 36 deployable types, six categories and no prototype unit IDs', () => {
  assert.equal(UNIT_LIST.length, 36); assert.equal(new Set(UNIT_LIST.map(u => u.id)).size, 36);
  for (const category of new Set(UNIT_LIST.map(u => u.category))) assert.equal(UNIT_LIST.filter(u => u.category === category).length, 6);
  assert.equal(UNIT_MAP.skeleton, undefined); assert.equal(UNIT_MAP.decoy, undefined); assert.equal(UNIT_MAP.toString, undefined);
});

test('invalid/empty formations, NaN, illegal teams, duplicate IDs and capacity fail before simulation', () => {
  const valid = [deploy(1, 'peasant', 'red', 400), deploy(2, 'peasant', 'blue', 700)];
  for (const units of [[], valid.slice(0, 1), [valid[0], { ...valid[1], type: 'toString' }],
    [valid[0], { ...valid[1], x: NaN }], [valid[0], { ...valid[1], id: 1 }], [valid[0], { ...valid[1], team: 'purple' }],
    [valid[0], { ...valid[1], x: 2401 }], Array.from({ length: MAX_UNITS + 1 }, (_, i) => deploy(i + 1, 'peasant', i % 2 ? 'red' : 'blue', 400))]) {
    assert.throws(() => simulation(units));
  }
});

test('fixed seed RNG and segment sweep include tiny targets and initial overlap', () => {
  const a = new RNG(0), b = new RNG(0);
  for (let i = 0; i < 1000; i++) assert.equal(a.next(), b.next());
  assert.equal(segmentCircle(0, 0, 1000, 0, 500, 0, 2), .498);
  assert.equal(segmentCircle(0, 0, 0, 0, 0, 0, 3), 0);
  assert.equal(segmentCircle(0, 0, 100, 0, 50, 10, 2), null);
});

test('spatial nearest agrees with exhaustive search, including world edges and ties', () => {
  const rng = new RNG(987), units = [];
  for (let i = 0; i < 300; i++) units.push({ id: i + 1, x: rng.between(9, 2391), y: rng.between(9, 1341), alive: true, team: i % 2 ? 'red' : 'blue' });
  const grid = new SpatialHash(); grid.rebuild(units);
  for (let i = 0; i < 80; i++) {
    const x = rng.between(0, 2400), y = rng.between(0, 1350);
    const expected = units.filter(u => u.team === 'blue').sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2) || a.id - b.id)[0];
    assert.equal(grid.nearest(x, y, u => u.team === 'blue').id, expected.id);
  }
});

test('1 vs 1 genuinely seeks, moves, attacks and resolves with conserved statistics', () => {
  const sim = simulation([deploy(1, 'swordsman', 'red', 850), deploy(2, 'peasant', 'blue', 1400)]);
  const start = sim.getEntity(1).x;
  const result = finish(sim);
  assert.equal(result.winner, 'red'); assert.ok(sim.getEntity(1).x > start + 100);
  assert.ok(sim.getEntity(1).basicAttacks > 1); assert.equal(result.teams.blue.deaths, 1); checkTotals(sim);
});

test('same-tick mortal attacks give a draw, including simultaneous self-destruct chains', () => {
  const sim = simulation([deploy(1, 'peasant', 'red', 500), deploy(2, 'peasant', 'blue', 525)]);
  queueHit(sim, sim.getEntity(1), sim.getEntity(2), 1000);
  queueHit(sim, sim.getEntity(2), sim.getEntity(1), 1000);
  resolveCombat(sim); sim.checkEnd();
  assert.equal(sim.result.winner, 'draw'); assert.equal(sim.getEntity(1).stats.kills, 1); assert.equal(sim.getEntity(2).stats.kills, 1);
  const chicken = simulation([deploy(1, 'bomb_chicken', 'red', 500), deploy(2, 'bomb_chicken', 'blue', 525)]);
  chicken.getEntity(1).selfDestruct = true; resolveCombat(chicken); chicken.checkEnd();
  assert.equal(chicken.result.winner, 'draw'); checkTotals(chicken);
});

test('hostile gate accepts legal dead sources but rejects allies, dead targets and inconsistent summon teams', () => {
  const target = { id: 2, alive: true, team: 'blue' };
  assert.equal(canApplyHostileEffect({ id: 1, alive: false, team: 'red' }, target), true);
  assert.equal(canApplyHostileEffect({ id: 1, team: 'blue' }, target), false);
  assert.equal(canApplyHostileEffect({ id: 1, team: 'red', ownerTeam: 'blue' }, target), false);
  assert.equal(canApplyHostileEffect({ id: 1, team: 'red' }, { ...target, alive: false }), false);
});

const hostileCases = [
  ['sword arc', (s, a) => coneHit(s, a, 200, Math.PI, 40, { impulse: 200 })],
  ['cannon explosion', (s, a) => radialHit(s, a, 570, 675, 160, 90, { impulse: 260 })],
  ['rocket explosion', (s, a) => radialHit(s, a, 570, 675, 78, 80, { ranged: true, impulse: 230 })],
  ['flame burn', (s, a) => radialHit(s, a, 570, 675, 160, 38, { status: { burn: 4 } })],
  ['ice slow', (s, a) => radialHit(s, a, 570, 675, 160, 28, { status: { slow: 3 } })],
  ['giant stomp', (s, a) => radialHit(s, a, 570, 675, 142, 75, { impulse: 330, status: { knockdown: .65 } })],
  ['charge / stun', (s, a, ally, enemy) => { queueHit(s, a, ally, 60, { impulse: 270, status: { stun: .4 }, brake: true }); queueHit(s, a, enemy, 60, { impulse: 270, status: { stun: .4 }, brake: true }); }],
  ['chicken blast', (s, a) => radialHit(s, a, 570, 675, 75, 145, { impulse: 310 })],
  ['gravity pull', (s, a) => pullGroup(s, a, 500, 675, 240, 250)],
  ['laser penetration', (s, a) => lineHit(s, a, 500, 675, 800, 675, 3, 34, 2)],
  ['fear roar', (s, a) => coneHit(s, a, 250, Math.PI, 0, { status: { fear: 1.3 } })],
];
for (const [name, action] of hostileCases) test(`zero friendly damage and negative state: ${name}`, () => {
  const sim = simulation([deploy(1, 'giant', 'red', 500), deploy(2, 'peasant', 'red', 550), deploy(3, 'giant', 'blue', 600)]);
  const a = sim.getEntity(1), ally = sim.getEntity(2), enemy = sim.getEntity(3), hp = ally.hp;
  action(sim, a, ally, enemy); resolveCombat(sim);
  assert.equal(ally.hp, hp); assert.deepEqual(ally.status, { burn: 0, slow: 0, stun: 0, fear: 0, knockdown: 0 });
  assert.equal(ally.impulseX, 0); assert.equal(ally.impulseY, 0); assert.equal(ally.skillCooldown, 0);
  assert.ok(enemy.hp < enemy.maxHp || Math.abs(enemy.impulseX) + Math.abs(enemy.impulseY) > 0 || Object.values(enemy.status).some(v => v > 0));
});

for (const kind of ['arrow', 'bullet', 'machine', 'pellet', 'sniper', 'rocket', 'shell', 'fireball', 'ice', 'boomerang']) test(`friendly bodies never occlude or consume ${kind} projectiles`, () => {
  const sim = simulation([deploy(1, 'rifleman', 'red', 400), deploy(2, 'peasant', 'red', 500), deploy(3, 'giant', 'blue', 650)]);
  const ally = sim.getEntity(2), enemy = sim.getEntity(3);
  fireProjectile(sim, sim.getEntity(1), enemy, kind, { angle: 0, damage: 40, range: 450, blastRadius: ['rocket', 'shell', 'fireball', 'ice'].includes(kind) ? 80 : 0 });
  for (let i = 0; i < 180; i++) { updateProjectiles(sim, FIXED_DT); resolveCombat(sim); }
  assert.equal(ally.hp, ally.maxHp); assert.ok(enemy.hp < enemy.maxHp);
  assert.deepEqual(ally.status, { burn: 0, slow: 0, stun: 0, fear: 0, knockdown: 0 });
});

test('shield has a real 120 degree facing arc, ranged/melee ratios and nonzero damage', () => {
  const sim = simulation([deploy(1, 'shield_guard', 'red', 500), deploy(2, 'rifleman', 'blue', 700)]);
  const guard = sim.getEntity(1);
  const front = damageAfterDefense(guard, 100, { originX: 700, originY: 675, ranged: true });
  const back = damageAfterDefense(guard, 100, { originX: 300, originY: 675, ranged: true });
  const frontMelee = damageAfterDefense(guard, 100, { originX: 700, originY: 675 });
  assert.ok(Math.abs(front / back - .4) < 1e-12); assert.ok(Math.abs(frontMelee / back - .7) < 1e-12);
  assert.equal(damageAfterDefense(guard, .01, { originX: 700, originY: 675 }), 1);
});

test('pikeman brakes an approaching charge and does not brake a walking peasant', () => {
  const sim = simulation([deploy(1, 'pikeman', 'red', 500), deploy(2, 'cavalry', 'blue', 565)]);
  const pike = sim.getEntity(1), cavalry = sim.getEntity(2);
  cavalry.vx = cavalry.moveVX = -220; cavalry.chargeDistance = 120; cavalry.chargeActive = true;
  performBasicAttack(sim, pike, cavalry); resolveCombat(sim);
  assert.equal(cavalry.chargeActive, false); assert.equal(cavalry.chargeDistance, 0); assert.ok(cavalry.status.stun > 0); assert.ok(Math.abs(cavalry.moveVX) < 40);
  assert.equal(pike.braces, 1);
  const normal = simulation([deploy(1, 'pikeman', 'red', 500), deploy(2, 'peasant', 'blue', 565)]);
  normal.getEntity(2).vx = -92; performBasicAttack(normal, normal.getEntity(1), normal.getEntity(2)); resolveCombat(normal);
  assert.equal(normal.getEntity(1).braces, 0);
});

test('cavalry needs a run-up: a standing melee attack cannot repeatedly generate charges', () => {
  const run = distance => {
    const sim = simulation([deploy(1, 'cavalry', 'red', 700), deploy(2, 'tank', 'blue', 700 + distance)]);
    sim.getEntity(2).attackCooldown = 20;
    advance(sim, 2); return sim;
  };
  const short = run(60), long = run(260);
  assert.equal(short.getEntity(1).abilityUses, 0); assert.ok(long.getEntity(1).abilityUses >= 1);
  assert.ok(long.getEntity(2).stats.taken > 0);
});

test('shotgun launches six pellets; machine gun has a real ten-shot reload window', () => {
  const shot = simulation([deploy(1, 'shotgunner', 'red', 500), deploy(2, 'giant', 'blue', 620)]);
  performBasicAttack(shot, shot.getEntity(1), shot.getEntity(2)); assert.equal(shot.projectiles.length, 6);
  const gun = simulation([deploy(1, 'machine_gunner', 'red', 500), deploy(2, 'giant', 'blue', 870)]);
  const source = gun.getEntity(1), enemy = gun.getEntity(2);
  for (let i = 0; i < 10; i++) performBasicAttack(gun, source, enemy);
  assert.equal(source.reloadTime, 2); assert.equal(source.attackCooldown, 2); assert.equal(source.reloadCount, 1);
  const before = source.shotsFired; advance(gun, 1); assert.equal(source.shotsFired, before);
});

test('sniper and laser cap penetration at two; boomerang caps outbound and return hits', () => {
  const units = [deploy(1, 'sniper', 'red', 300), deploy(2, 'giant', 'blue', 470), deploy(3, 'giant', 'blue', 570), deploy(4, 'giant', 'blue', 670)];
  const sim = simulation(units), shooter = sim.getEntity(1);
  fireProjectile(sim, shooter, sim.getEntity(2), 'sniper', { angle: 0, range: 760 });
  for (let i = 0; i < 80; i++) { updateProjectiles(sim, FIXED_DT); resolveCombat(sim); }
  assert.ok(sim.getEntity(2).hp < 1850 && sim.getEntity(3).hp < 1850); assert.equal(sim.getEntity(4).hp, 1850);
  const laser = simulation(units); lineHit(laser, laser.getEntity(1), 300, 675, 1000, 675, 2, 17, 2); resolveCombat(laser);
  assert.equal(laser.getEntity(4).hp, 1850);
  const boom = simulation([deploy(1, 'boomerang_thrower', 'red', 300), deploy(2, 'giant', 'blue', 490)]);
  fireProjectile(boom, boom.getEntity(1), boom.getEntity(2), 'boomerang', { angle: 0 });
  for (let i = 0; i < 250; i++) { updateProjectiles(boom, FIXED_DT); resolveCombat(boom); }
  assert.ok(boom.getEntity(2).stats.taken > 0); assert.ok(boom.getEntity(2).stats.taken <= 27 * 1.7 + 1e-8); assert.equal(boom.projectiles.length, 0);
});

test('burn expires, slow is capped at 40 percent and an already-dead caster still owns its DoT', () => {
  const sim = simulation([deploy(1, 'fire_mage', 'red', 500), deploy(2, 'giant', 'blue', 650), deploy(3, 'healer', 'red', 300)]);
  const source = sim.getEntity(1), target = sim.getEntity(2);
  queueHit(sim, source, target, 0, { status: { burn: 99, slow: 99 } }); resolveCombat(sim);
  assert.equal(target.status.burn, 4); assert.equal(target.status.slow, 3);
  sim.markDead(source);
  for (let i = 0; i < 250; i++) { sim.tick++; sim.time = sim.tick * FIXED_DT; sim.updateTimers(target); resolveCombat(sim); }
  assert.ok(Math.abs(target.stats.taken - 20) < 1e-8); assert.equal(target.status.burn, 0); assert.equal(target.status.slow, 0);
  assert.ok(Math.abs(source.stats.damage - 20) < 1e-8);
});

test('healing is capped, excludes self/dead/decoy and a healer actually finds a wounded ally', () => {
  const sim = simulation([deploy(1, 'healer', 'red', 500), deploy(2, 'swordsman', 'red', 560), deploy(3, 'healer', 'blue', 1800)]);
  const healer = sim.getEntity(1), patient = sim.getEntity(2);
  patient.hp = 120;
  assert.equal(queueHeal(sim, healer, healer, 30), false);
  advance(sim, 1); assert.equal(patient.hp, patient.maxHp); assert.equal(healer.stats.healing, 20);
  sim.markDead(patient); assert.equal(queueHeal(sim, healer, patient, 100), false);
  const p = sim.findFreePosition(500, 725, 11); const decoy = sim.spawnSummon(healer, 'decoy', p.x, p.y, 6);
  decoy.hp = 20; assert.equal(queueHeal(sim, healer, decoy, 100), false);
});

test('continuous hard-control refresh cannot exceed a bounded episode and recovery window', () => {
  const sim = simulation([deploy(1, 'giant', 'red', 400), deploy(2, 'peasant', 'blue', 700)]);
  const source = sim.getEntity(1), target = sim.getEntity(2);
  let recoveryTicks = 0, consecutive = 0, longest = 0;
  for (let i = 0; i < 240; i++) {
    sim.tick++; sim.time = sim.tick * FIXED_DT; sim.updateTimers(target);
    queueHit(sim, source, target, 0, { status: { stun: 99 } }); resolveCombat(sim);
    if (target.status.stun === 0) { recoveryTicks++; consecutive = 0; }
    else longest = Math.max(longest, ++consecutive);
  }
  assert.ok(recoveryTicks >= 60); assert.ok(longest <= 41, 'stun episode is at most .65 seconds plus tick quantization');
});

test('a projectile already in flight can hit after its shooter dies and retains attribution', () => {
  const sim = simulation([deploy(1, 'rifleman', 'red', 400), deploy(2, 'giant', 'blue', 700), deploy(3, 'healer', 'red', 200)]);
  const shooter = sim.getEntity(1), target = sim.getEntity(2);
  fireProjectile(sim, shooter, target, 'bullet', { angle: 0 }); sim.markDead(shooter);
  for (let i = 0; i < 60; i++) { updateProjectiles(sim, FIXED_DT); resolveCombat(sim); }
  assert.ok(target.hp < target.maxHp); assert.ok(shooter.stats.damage > 0); assert.equal(shooter.basicAttacks, 0);
});

test('explosion defense uses the actual blast center, independently of the caster position', () => {
  const run = x => {
    const sim = simulation([deploy(1, 'rocketeer', 'red', 300), deploy(2, 'shield_guard', 'blue', 600, 675, 0)]);
    radialHit(sim, sim.getEntity(1), x, 675, 90, 100, { ranged: true }); resolveCombat(sim);
    return sim.getEntity(2).stats.taken;
  };
  assert.ok(Math.abs(run(650) / run(550) - .4) < 1e-12);
});

test('mass-weighted soft collision moves a light body further without dealing ally damage', () => {
  const sim = simulation([deploy(1, 'giant', 'red', 500), deploy(2, 'peasant', 'red', 535), deploy(3, 'healer', 'blue', 2000)]);
  const giant = sim.getEntity(1), peasant = sim.getEntity(2);
  resolveBodies(sim); resolveCombat(sim);
  assert.ok(Math.abs(peasant.x - 535) > Math.abs(giant.x - 500) * 10);
  assert.equal(peasant.hp, peasant.maxHp); assert.equal(giant.hp, giant.maxHp);
});

test('blink updates its spatial cell immediately and airborne leaps actually move', () => {
  const blink = simulation([deploy(1, 'blink_alien', 'red', 800), deploy(2, 'giant', 'blue', 975)]);
  const alien = blink.getEntity(1); alien.skillCooldown = 0;
  const before = alien.x; blink.step(); assert.ok(Math.abs(alien.x - before) > 50);
  assert.ok(blink.spatial.queryCircle(alien.x, alien.y, 3).some(u => u.id === alien.id));
  assert.equal(blink.isFreePosition(alien.x, alien.y, 10), false);
  queueHit(blink, blink.getEntity(2), alien, 10); resolveCombat(blink); assert.ok(alien.hp < alien.maxHp, 'blink grants no invulnerability');
  const leap = simulation([deploy(1, 'raptor', 'red', 800), deploy(2, 'giant', 'blue', 990)]);
  leap.getEntity(1).skillCooldown = 0; leap.step(); assert.ok(leap.getEntity(1).airborne > 0);
  const x = leap.getEntity(1).x; advance(leap, .15); assert.ok(leap.getEntity(1).x > x + 40);
});

test('summons inherit faction, have owner and scene limits, survive the owner, expire and credit correctly', () => {
  const sim = simulation([deploy(1, 'necromancer', 'red', 400), deploy(2, 'giant', 'blue', 1100)]);
  const owner = sim.getEntity(1);
  for (let i = 0; i < 8; i++) {
    const p = sim.findFreePosition(430 + (i % 4) * 25, 590 + Math.floor(i / 4) * 25, 8);
    assert.ok(sim.spawnSummon(owner, 'skeleton', p.x, p.y, 22));
  }
  const p = sim.findFreePosition(400, 780, 8);
  assert.equal(sim.spawnSummon(owner, 'skeleton', p.x, p.y, 22), null);
  const summon = sim.units.find(u => u.summoned); assert.equal(summon.team, owner.team); assert.equal(summon.ownerId, owner.id);
  queueHit(sim, summon, sim.getEntity(2), 50); queueHit(sim, summon, owner, 1000); resolveCombat(sim);
  assert.equal(owner.hp, owner.maxHp); assert.ok(owner.stats.damage > 0); assert.equal(sim.summary().teams.red.damage, owner.stats.damage);
  sim.markDead(owner); assert.equal(summon.alive, true);
  for (const u of sim.units) if (u.summoned) u.expiresAt = sim.time + FIXED_DT;
  sim.step(); assert.equal(sim.summary().teams.red.summonsAlive, 0); assert.equal(sim.summary().teams.red.summonDeaths, 8); checkTotals(sim);
});

test('1200 active entities block summons without exceeding capacity', () => {
  const units = [deploy(1, 'necromancer', 'red', 50, 50)];
  for (let i = 1; i < MAX_UNITS; i++) units.push(deploy(i + 1, 'peasant', i % 2 ? 'red' : 'blue', 150 + (i % 80) * 26, 50 + Math.floor(i / 80) * 26));
  const sim = simulation(units); assert.equal(sim.activeCount, 1200);
  assert.equal(sim.spawnSummon(sim.getEntity(1), 'skeleton', 80, 90, 22), null); assert.equal(sim.capacityWarning, true);
});

test('collision impulse follows its hostile source and never splashes source allies', () => {
  const sim = simulation([deploy(1, 'giant', 'red', 400), deploy(2, 'peasant', 'blue', 500), deploy(3, 'peasant', 'red', 516), deploy(4, 'peasant', 'blue', 501, 690)]);
  const flying = sim.getEntity(2), ally = sim.getEntity(3), enemy = sim.getEntity(4);
  flying.impulseX = 300; flying.impulseSource = { id: 1, type: 'giant', team: 'red', x: 400, y: 675 };
  resolveBodies(sim); resolveCombat(sim);
  assert.equal(ally.hp, ally.maxHp); assert.equal(ally.impulseX, 0); assert.equal(ally.status.knockdown, 0);
  assert.ok(enemy.hp < enemy.maxHp, 'second enemy receives a real source-attributed chain hit');
});

test('wolf values vulnerable prey, and attackable decoys can divert enemy targeting', () => {
  const sim = simulation([deploy(1, 'wolf', 'red', 500), deploy(2, 'shield_guard', 'blue', 650), deploy(3, 'archer', 'blue', 665, 715)]);
  sim.getEntity(3).hp = 10; acquireTarget(sim, sim.getEntity(1)); assert.equal(sim.getEntity(1).targetId, 3);
  const decoySim = simulation([deploy(1, 'jester', 'red', 500), deploy(2, 'giant', 'blue', 770)]);
  advance(decoySim, 1.3);
  const decoy = decoySim.units.find(u => u.type === 'decoy'); assert.ok(decoy); assert.equal(decoySim.getEntity(2).targetId, decoy.id);
});

for (const def of UNIT_LIST.filter(u => u.id !== 'healer')) test(`real autonomous behavior: ${def.name} (${def.id})`, () => {
  const units = [deploy(1, def.id, 'red', 800)];
  for (let i = 0; i < 10; i++) units.push(deploy(i + 2, 'peasant', 'blue', 1050 + (i % 2) * 35, 565 + Math.floor(i / 2) * 45));
  const sim = simulation(units, 777);
  finish(sim); const unit = sim.getEntity(1);
  assert.ok(unit.stats.damage > 0, 'damage is generated by actual autonomous attacks');
  if (def.skillCooldown > 0) assert.ok(unit.abilityUses > 0, 'signature active behavior actually triggers');
  if (def.id === 'gorilla') assert.ok(unit.secondPunches > 0);
  if (def.id === 'boxing_kangaroo') assert.ok(unit.combo > 1);
  for (const u of sim.units) assert.ok([u.x, u.y, u.vx, u.vy, u.hp].every(Number.isFinite));
  checkTotals(sim);
});

test('100 peasants versus a giant ends, retains real deaths and recycles corpses', () => {
  const units = [deploy(1, 'giant', 'blue', 1270)];
  for (let i = 0; i < 100; i++) units.push(deploy(i + 2, 'peasant', 'red', 500 + (i % 10) * 23, 560 + Math.floor(i / 10) * 24));
  const sim = simulation(units); finish(sim); checkTotals(sim);
  assert.ok(sim.summary().teams.red.deaths > 10); assert.ok(sim.units.length < units.length);
});

test('finite control recovery, battlefield boundaries and dense crowds do not produce nonfinite state', () => {
  const units = [deploy(1, 'mammoth', 'red', 50, 50), deploy(2, 'trex', 'blue', 160, 55), deploy(3, 'tank', 'red', 65, 150), deploy(4, 'rhino', 'blue', 160, 150)];
  const sim = simulation(units); queueHit(sim, sim.getEntity(2), sim.getEntity(1), 1, { impulse: 1e10, status: { stun: 5, knockdown: 5 } }); resolveCombat(sim);
  advance(sim, 30);
  for (const u of sim.units) {
    assert.ok([u.x, u.y, u.vx, u.vy, u.hp].every(Number.isFinite));
    assert.ok(u.x >= u.radius && u.x <= 2400 - u.radius && u.y >= u.radius && u.y <= 1350 - u.radius);
  }
  assert.ok(sim.getEntity(1).basicAttacks > 0 || !sim.getEntity(1).alive);
});

test('all-healer armies enter fallback then an explained stalemate; maximum time also draws', () => {
  const sim = simulation([deploy(1, 'healer', 'red', 1100), deploy(2, 'healer', 'blue', 1200)]);
  advance(sim, 16); assert.equal(sim.forceEngage, true);
  const result = finish(sim); assert.equal(result.winner, 'draw'); assert.match(result.reason, /僵局/); assert.ok(result.duration < 60);
  const timeout = simulation([deploy(1, 'peasant', 'red', 100), deploy(2, 'peasant', 'blue', 2300)], 42, { maxDuration: .5 });
  assert.match(finish(timeout).reason, /时限/);
});

test('same seed replays, tick batching and different visual budgets preserve exact core results', () => {
  const units = [deploy(1, 'fire_mage', 'red', 740, 600), deploy(2, 'necromancer', 'red', 700, 700), deploy(3, 'swordsman', 'red', 850, 650),
    deploy(4, 'rocketeer', 'blue', 1200, 600), deploy(5, 'jester', 'blue', 1200, 720), deploy(6, 'rhino', 'blue', 1100, 660)];
  const a = simulation(units, 998), b = simulation(units, 998, { collectVisuals: true }), c = simulation(units, 998);
  finish(a);
  while (!b.result) for (let i = 0; i < 4 && !b.result; i++) b.step();
  while (!c.result) for (let i = 0; i < 15 && !c.result; i++) c.step();
  assert.deepEqual(a.snapshot(), b.snapshot()); assert.deepEqual(a.snapshot(), c.snapshot());
});

test('simulation has no autonomous timers; paused snapshots and deployment remain unchanged', async () => {
  const units = [deploy(1, 'rifleman', 'red', 500), deploy(2, 'dragon', 'blue', 850)];
  const original = JSON.stringify(units), sim = simulation(units, 5, { collectVisuals: true });
  advance(sim, .7); const before = JSON.stringify({ core: sim.snapshot(), effects: sim.effects });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(JSON.stringify({ core: sim.snapshot(), effects: sim.effects }), before);
  assert.equal(JSON.stringify(units), original); assert.notEqual(sim.units[0], units[0]);
  assert.ok(Object.isFrozen(sim.formation.units[0]));
});
