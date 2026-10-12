import { clamp, angleDelta, segmentCircle } from './rng.js';

/** Dead sources remain valid for attacks already launched and persistent status effects. */
export function canApplyHostileEffect(source, target) {
  return !!source && !!target && target.alive &&
    Number.isSafeInteger(source.id) && source.id > 0 && Number.isSafeInteger(target.id) && target.id > 0 &&
    (source.team === 'red' || source.team === 'blue') &&
    (target.team === 'red' || target.team === 'blue') && source.team !== target.team &&
    (source.ownerTeam == null || source.ownerTeam === source.team);
}

export function sourceOf(u) {
  return { id: u.id, type: u.type, team: u.team, ownerId: u.ownerId ?? null,
    ownerTeam: u.ownerTeam ?? null, x: u.x, y: u.y };
}

export function queueHit(sim, source, target, rawDamage, options = {}) {
  if (!canApplyHostileEffect(source, target)) return false;
  sim.damageQueue.push({ source: sourceOf(source), targetId: target.id, rawDamage: Math.max(0, rawDamage),
    originX: options.originX ?? source.x, originY: options.originY ?? source.y, ...options });
  return true;
}

export function queueHeal(sim, source, target, amount) {
  if (!source?.alive || !target?.alive || source.id === target.id || source.team !== target.team || target.type === 'decoy') return false;
  sim.healQueue.push({ sourceId: source.id, targetId: target.id, amount: Math.max(0, amount) });
  return true;
}

export function damageAfterDefense(target, raw, options = {}) {
  const armor = Math.max(0, target.def.armor - (options.armorPen ?? 0));
  let damage = raw * 100 / (100 + armor);
  if (target.type === 'shield_guard' && !options.ignoreShield && !options.dot && options.originX != null) {
    const incoming = Math.atan2(options.originY - target.y, options.originX - target.x);
    if (Math.abs(angleDelta(target.angle, incoming)) <= Math.PI / 3) damage *= options.ranged ? .4 : .7;
  }
  return raw > 0 ? Math.max(options.dot ? .001 : 1, damage) : 0;
}

const STATUS_CAPS = { burn: 4, slow: 3, stun: .65, fear: 1.4, knockdown: .8 };
/** Continuous hard control has an absolute window; recovery grants a short refractory period. */
function applyStatus(sim, target, name, duration) {
  if (!(name in STATUS_CAPS)) return false;
  let time = Math.min(STATUS_CAPS[name], duration);
  if (name === 'stun' || name === 'fear' || name === 'knockdown') {
    if (sim.time < target.controlImmuneUntil[name]) return false;
    if (target.status[name] <= 0) target.controlWindowUntil[name] = sim.time + STATUS_CAPS[name];
    time = Math.min(time, Math.max(0, target.controlWindowUntil[name] - sim.time));
  }
  target.status[name] = Math.max(target.status[name], time);
  return time > 0;
}

/** The same centralized gate controls HP, statuses, knockback, pull and charge braking. */
function applyEvent(sim, event) {
  const target = sim.getEntity(event.targetId);
  if (!canApplyHostileEffect(event.source, target) || target.hp <= 0) return;
  const value = Math.min(target.hp, damageAfterDefense(target, event.rawDamage, event));
  if (value > 0) {
    target.hp = Math.max(0, target.hp - value);
    target.stats.taken += value;
    target.lastDamageSource = event.source;
    target.hitFlash = .12;
    sim.credit(event.source, 'damage', value);
    sim.lastProgressTime = sim.time;
    sim.eventCounts.hits++;
  }
  if (event.status && target.hp > 0) {
    for (const [name, duration] of Object.entries(event.status)) if (applyStatus(sim, target, name, duration)) {
      if (name === 'burn') { target.burnSource = event.source; target.burnDamage = event.burnDamage ?? 5; }
      if (name === 'fear') target.fearSource = event.source;
    }
  }
  if (event.brake) {
    target.moveVX *= .12; target.moveVY *= .12;
    target.dashTime = 0; target.chargeDistance = 0; target.chargeActive = false;
    target.skillCooldown = Math.max(target.skillCooldown, 2.8);
  }
  if (event.impulse) {
    const angle = event.angle ?? Math.atan2(target.y - event.originY, target.x - event.originX);
    const effective = clamp(event.impulse / Math.sqrt(Math.max(.6, target.mass)), -440, 440);
    target.impulseX = clamp(target.impulseX + Math.cos(angle) * effective, -520, 520);
    target.impulseY = clamp(target.impulseY + Math.sin(angle) * effective, -520, 520);
    target.impulseSource = event.source;
    target.chainHits.clear();
    if (Math.abs(effective) > 160 && event.knockdown !== false) {
      if (applyStatus(sim, target, 'knockdown', .34)) target.airborne = Math.max(target.airborne, .34);
    }
  }
  if (value > 0 && event.visual !== false) sim.addEffect('impact', target.x, target.y, { radius: 5 + Math.min(15, value * .04), team: event.source.team, duration: .16 });
}

/** Resolve all attacks generated on the tick before declaring any winner. */
export function resolveCombat(sim) {
  let rounds = 0;
  do {
    const queue = sim.damageQueue;
    sim.damageQueue = [];
    for (const event of queue) applyEvent(sim, event);
    // A mortal wound is final; healing cannot resurrect a unit on this tick.
    for (const event of sim.healQueue) {
      const source = sim.getEntity(event.sourceId), target = sim.getEntity(event.targetId);
      if (!source?.alive || source.hp <= 0 || !target?.alive || target.hp <= 0 || target.id === source.id || source.team !== target.team || target.type === 'decoy') continue;
      const value = Math.min(event.amount, target.maxHp - target.hp);
      if (value <= 0) continue;
      target.hp += value;
      sim.credit(sourceOf(source), 'healing', value);
      sim.lastProgressTime = sim.time;
      sim.addEffect('heal', target.x, target.y, { x2: source.x, y2: source.y, radius: target.radius + 15, team: source.team, duration: .55 });
    }
    sim.healQueue.length = 0;
    for (const unit of sim.units) if (unit.alive && (unit.hp <= 0 || unit.selfDestruct)) {
      sim.markDead(unit, unit.hp <= 0 ? unit.lastDamageSource : null);
      if (unit.type === 'bomb_chicken' && !unit.exploded) {
        unit.exploded = true;
        radialHit(sim, unit, unit.x, unit.y, 75, 145, { impulse: 310, ranged: true, falloff: .38, kind: 'chicken' });
      }
    }
  } while (sim.damageQueue.length && ++rounds <= 1200);
}

export function radialHit(sim, source, x, y, radius, damage, options = {}) {
  let hit = 0;
  sim.spatial.forEachCircle(x, y, radius + 36, target => {
    const distance = Math.hypot(target.x - x, target.y - y);
    if (distance > radius + target.radius || !canApplyHostileEffect(source, target)) return;
    const factor = options.falloff == null ? 1 : 1 - clamp(distance / radius, 0, 1) * options.falloff;
    if (queueHit(sim, source, target, damage * factor, { ...options, originX: x, originY: y, angle: Math.atan2(target.y - y, target.x - x) })) hit++;
  });
  sim.addEffect(options.effect ?? 'explosion', x, y, { radius, team: source.team, duration: options.effect === 'gravity' ? .65 : .42, power: damage, angle: options.angle ?? 0 });
  return hit;
}

export function coneHit(sim, source, radius, halfAngle, damage, options = {}) {
  let hits = 0;
  const facing = options.angle ?? source.angle;
  sim.spatial.forEachCircle(source.x, source.y, radius + 36, target => {
    if (!canApplyHostileEffect(source, target)) return;
    const d = Math.hypot(target.x - source.x, target.y - source.y);
    if (d > radius + target.radius) return;
    const padding = Math.asin(Math.min(1, target.radius / Math.max(target.radius, d)));
    if (Math.abs(angleDelta(facing, Math.atan2(target.y - source.y, target.x - source.x))) > halfAngle + padding) return;
    queueHit(sim, source, target, damage, options); hits++;
  });
  return hits;
}

export function lineHit(sim, source, x, y, x2, y2, width, damage, maxHits = 2, options = {}) {
  const candidates = [];
  sim.spatial.forEachBox(Math.min(x, x2) - 38, Math.min(y, y2) - 38, Math.max(x, x2) + 38, Math.max(y, y2) + 38, target => {
    if (!canApplyHostileEffect(source, target)) return;
    const t = segmentCircle(x, y, x2, y2, target.x, target.y, width + target.radius);
    if (t != null) candidates.push({ target, t });
  });
  candidates.sort((a, b) => a.t - b.t || a.target.id - b.target.id);
  for (const c of candidates.slice(0, maxHits)) queueHit(sim, source, c.target, damage, { ...options, originX: x, originY: y });
  return candidates.slice(0, maxHits);
}
