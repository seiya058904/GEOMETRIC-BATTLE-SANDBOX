import { WORLD } from '../data/units.js';
import { clamp, angleDelta } from './rng.js';

const RANGED_KINDS = new Set(['arrow', 'bullet', 'shotgun', 'machine', 'sniper', 'rocket', 'shell', 'fireball', 'ice', 'spirit', 'plasma', 'laser', 'drone_bolt', 'mech_bolt', 'ufo_bolt', 'boomerang', 'gravity_bolt', 'card']);
export const isRanged = u => RANGED_KINDS.has(u.def.attackKind);

function targetScore(sim, unit, enemy, d) {
  let score = d;
  const ranged = isRanged(enemy);
  if (enemy.type === 'decoy' && d < 280) score -= 180;
  if (unit.def.role === 'skirmisher' || unit.type === 'cavalry') {
    score += enemy.hp / enemy.maxHp * 38 + enemy.def.armor * .25;
    if (ranged || enemy.type === 'healer') score -= 60;
    if (unit.type === 'wolf') {
      let neighbors = 0;
      sim.spatial.forEachCircle(enemy.x, enemy.y, 70, other => { if (other.team === enemy.team && other.id !== enemy.id) neighbors++; });
      score += Math.min(8, neighbors) * 9;
    }
  }
  if (unit.type === 'sniper') { score -= Math.min(95, enemy.def.cost * .07); if (ranged || enemy.type === 'healer') score -= 65; }
  if (unit.type === 'pikeman' && (enemy.chargeActive || Math.hypot(enemy.vx, enemy.vy) > 135)) score -= 80;
  if (['giant', 'tank', 'rocketeer', 'fire_mage', 'dragon'].includes(unit.type)) {
    let density = 0;
    sim.spatial.forEachCircle(enemy.x, enemy.y, 80, other => { if (other.team === enemy.team) density++; });
    score -= Math.min(10, density) * 9;
  }
  return score;
}

export function acquireTarget(sim, unit) {
  const nearest = sim.spatial.nearest(unit.x, unit.y, other => other.team !== unit.team);
  if (!nearest) { unit.targetId = null; return; }
  let target = nearest;
  const nearestDistance = Math.hypot(nearest.x - unit.x, nearest.y - unit.y);
  let best = targetScore(sim, unit, target, nearestDistance);
  const radius = Math.min(900, nearestDistance + (unit.type === 'sniper' ? 240 : 130));
  // Preferences consider a small local candidate set; a locked target is not rescored every frame.
  let candidates = 0;
  sim.spatial.forEachCircle(unit.x, unit.y, radius, enemy => {
    if (enemy.team === unit.team || candidates++ > 32) return;
    const score = targetScore(sim, unit, enemy, Math.hypot(enemy.x - unit.x, enemy.y - unit.y));
    if (score < best || (score === best && enemy.id < target.id)) { target = enemy; best = score; }
  });
  unit.targetId = target.id;
  unit.targetLockedUntil = sim.time + .65;
  sim.noteApproach(nearestDistance - unit.radius - nearest.radius);
}

function findPatient(sim, unit) {
  let best = null, score = Infinity;
  sim.spatial.forEachCircle(unit.x, unit.y, unit.def.range + 180, other => {
    if (other.id === unit.id || other.team !== unit.team || other.type === 'decoy' || other.hp >= other.maxHp || other.hp <= 0) return;
    const d = Math.hypot(other.x - unit.x, other.y - unit.y);
    const s = other.hp / other.maxHp * 250 + d * .25;
    if (s < score || (s === score && other.id < best.id)) { best = other; score = s; }
  });
  return best;
}

export function updateAI(sim, unit, dt) {
  unit.wantX = 0; unit.wantY = 0;
  if (!unit.alive || unit.def.role === 'decoy') { unit.aiState = unit.alive ? 'Decoy' : 'Dead'; return; }
  if (unit.status.knockdown > 0) { unit.aiState = 'KnockedDown'; return; }
  if (unit.status.stun > 0) { unit.aiState = 'Staggered'; return; }
  if (unit.dashTime > 0) {
    unit.wantX = Math.cos(unit.dashAngle); unit.wantY = Math.sin(unit.dashAngle);
    unit.desiredAngle = unit.dashAngle; unit.aiState = 'Cast'; return;
  }
  if (unit.status.fear > 0 && unit.fearSource) {
    const dx = unit.x - unit.fearSource.x, dy = unit.y - unit.fearSource.y, d = Math.hypot(dx, dy) || 1;
    unit.wantX = dx / d; unit.wantY = dy / d;
    unit.desiredAngle = Math.atan2(dy, dx); unit.aiState = 'RetreatBriefly';
    applyBoundary(unit); return;
  }
  let enemy = sim.getEntity(unit.targetId);
  unit.decisionClock -= dt;
  if (!enemy?.alive || unit.decisionClock <= 0) {
    unit.decisionClock = .24 + (unit.id % 5) * .025;
    if (!enemy?.alive || (sim.time >= unit.targetLockedUntil && (sim.tick + unit.id) % 3 === 0)) acquireTarget(sim, unit);
    enemy = sim.getEntity(unit.targetId);
    if (unit.type === 'healer') unit.patientId = findPatient(sim, unit)?.id ?? null;
  }
  if (!enemy?.alive) { unit.aiState = 'AcquireTarget'; return; }
  let target = enemy;
  if (unit.type === 'healer') {
    const patient = sim.getEntity(unit.patientId);
    if (patient?.alive && patient.hp < patient.maxHp) target = patient;
    else {
      unit.aiState = 'Reposition';
      const d = Math.hypot(enemy.x - unit.x, enemy.y - unit.y);
      if (d > 330 || sim.forceEngage) {
        unit.wantX = (enemy.x - unit.x) / (d || 1); unit.wantY = (enemy.y - unit.y) / (d || 1);
        unit.desiredAngle = Math.atan2(unit.wantY, unit.wantX);
      }
      applyBoundary(unit); return;
    }
  }
  const dx = target.x - unit.x, dy = target.y - unit.y, d = Math.hypot(dx, dy) || .001;
  const nx = dx / d, ny = dy / d;
  const desired = Math.atan2(dy, dx);
  unit.desiredAngle = desired;
  if (unit.type === 'tank') unit.turretDesiredAngle = desired;
  if (target.team !== unit.team) sim.noteApproach(d - unit.radius - target.radius);
  if (unit.castTime > 0 || unit.breathTime > 0) { unit.aiState = 'Cast'; return; }
  const ranged = isRanged(unit) || unit.type === 'healer';
  let stopping = ranged ? unit.def.range * .77 + target.radius : Math.max(unit.radius + target.radius + 1, unit.def.range * .78 + target.radius);
  if (unit.chargeActive || (unit.def.role === 'charger' && unit.skillCooldown <= 0 && unit.chargeDistance >= 40)) stopping = unit.radius + target.radius - 5;
  // Heavy armor does not kite: it keeps advancing when nearby enemies engage its hull.
  if (unit.type === 'tank' && d < 190) stopping = unit.radius + target.radius - 2;
  const nearBoundary = unit.x < 60 || unit.x > WORLD.width - 60 || unit.y < 60 || unit.y > WORLD.height - 60;
  if (ranged && unit.def.role !== 'heavy' && d < Math.min(145, unit.def.range * .34) && unit.retreatCooldown <= 0 && !sim.forceEngage && !nearBoundary) {
    unit.retreatTime = .6; unit.retreatCooldown = 4.8;
    unit.retreatStartX = unit.x; unit.retreatStartY = unit.y;
  }
  if (unit.retreatTime > 0 && !sim.forceEngage && !nearBoundary && Math.hypot(unit.x - unit.retreatStartX, unit.y - unit.retreatStartY) < 75) {
    unit.wantX = -nx; unit.wantY = -ny; unit.aiState = 'RetreatBriefly';
  } else if (d > stopping) {
    unit.wantX = nx; unit.wantY = ny; unit.aiState = 'Approach';
    if (unit.def.role === 'skirmisher' && d > unit.def.range * 1.6 && d < 280) {
      const side = unit.id % 2 ? .33 : -.33;
      unit.wantX += -ny * side; unit.wantY += nx * side;
    }
  } else {
    unit.aiState = unit.attackCooldown > 0 ? 'Recover' : 'Attack';
    if (unit.type === 'drone') {
      const side = Math.sin(sim.time * 1.5 + unit.id) > 0 ? 1 : -1;
      unit.wantX = -ny * .42 * side; unit.wantY = nx * .42 * side;
      unit.aiState = 'Reposition';
    }
  }
  if (unit.wantX || unit.wantY) {
    // Local separation steers around nearby allies without faction damage or control.
    let sx = 0, sy = 0;
    sim.spatial.forEachCircle(unit.x, unit.y, unit.radius + 36, other => {
      if (other.id === unit.id || other.team !== unit.team) return;
      const ox = unit.x - other.x, oy = unit.y - other.y, ds = ox * ox + oy * oy;
      const threshold = unit.radius + other.radius + 8;
      if (ds > .0001 && ds < threshold * threshold) {
        const len = Math.sqrt(ds), amount = (threshold - len) / threshold;
        sx += ox / len * amount; sy += oy / len * amount;
      }
    });
    unit.wantX += clamp(sx, -1, 1) * .7;
    unit.wantY += clamp(sy, -1, 1) * .7;
    const length = Math.hypot(unit.wantX, unit.wantY);
    if (length > 1) { unit.wantX /= length; unit.wantY /= length; }
  }
  if (unit.stuckTime > 1.5 && d > stopping + 10) {
    const side = unit.id % 2 ? 1 : -1;
    unit.wantX = nx * .3 - ny * side; unit.wantY = ny * .3 + nx * side;
    unit.aiState = 'Reposition';
    if (unit.stuckTime > 3.2) { unit.targetId = null; unit.stuckTime = 0; }
  }
  applyBoundary(unit);
  if (Math.abs(angleDelta(unit.angle, desired)) > 1.5 && unit.type === 'tank') { unit.wantX *= .2; unit.wantY *= .2; }
}

function applyBoundary(unit) {
  const margin = unit.radius + 8;
  if (unit.x < margin && unit.wantX < 0) { unit.wantX = .35; unit.wantY = unit.y < WORLD.height / 2 ? .8 : -.8; }
  if (unit.x > WORLD.width - margin && unit.wantX > 0) { unit.wantX = -.35; unit.wantY = unit.y < WORLD.height / 2 ? .8 : -.8; }
  if (unit.y < margin && unit.wantY < 0) unit.wantY = .35;
  if (unit.y > WORLD.height - margin && unit.wantY > 0) unit.wantY = -.35;
}
