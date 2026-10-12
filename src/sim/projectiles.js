import { WORLD } from '../data/units.js';
import { clamp, segmentCircle } from './rng.js';
import { canApplyHostileEffect, queueHit, radialHit, sourceOf } from './combat.js';

const SPEED = { arrow: 470, bullet: 1080, pellet: 980, machine: 1160, sniper: 1750, rocket: 310, shell: 550,
  fireball: 310, ice: 430, spirit: 365, plasma: 820, drone_bolt: 760, mech_bolt: 850,
  missile: 390, ufo_bolt: 510, boomerang: 490, gravity_bolt: 390, card: 620 };

/** Reusable projectile records. Lifetime and fire rates bound the simultaneous population. */
export function fireProjectile(sim, source, target, kind, options = {}) {
  const speed = options.speed ?? SPEED[kind] ?? 650;
  const travelTime = Math.min(.7, Math.hypot(target.x - source.x, target.y - source.y) / speed);
  const lead = options.lead ?? (kind === 'rocket' || kind === 'fireball' ? .4 : .82);
  let angle = Math.atan2(target.y + (target.vy ?? 0) * travelTime * lead - source.y,
    target.x + (target.vx ?? 0) * travelTime * lead - source.x);
  if (options.angle != null) angle = options.angle;
  else {
    const spread = options.spread ?? (kind === 'sniper' ? .0012 : kind === 'machine' ? .027 : .012);
    angle += sim.rng.between(-spread, spread);
  }
  const arm = options.arm ?? 0;
  const x = source.x + Math.cos(angle) * (source.radius + 5) - Math.sin(angle) * arm;
  const y = source.y + Math.sin(angle) * (source.radius + 5) + Math.cos(angle) * arm;
  const p = sim.projectilePool.pop() ?? { hitIds: new Set() };
  p.hitIds.clear();
  Object.assign(p, { id: sim.nextProjectileId++, kind, x, y, prevX: x, prevY: y,
    startX: x, startY: y, returnX: x, returnY: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    speed, angle, team: source.team, radius: ['rocket', 'shell', 'fireball', 'missile', 'ufo_bolt'].includes(kind) ? 5 : kind === 'ice' ? 4 : 2,
    alive: true, source: sourceOf(source), age: 0, travel: 0, phase: 0, phaseHits: 0,
    damage: options.damage ?? source.def.damage, maxRange: options.range ?? source.def.range + 30,
    maxHits: options.maxHits ?? (kind === 'sniper' ? 2 : kind === 'boomerang' ? 4 : 1),
    blastRadius: options.blastRadius ?? source.def.blastRadius ?? 0,
    ttl: Math.min(4.5, ((options.range ?? source.def.range) + 70) / speed + .18),
    status: options.status ?? null, impulse: options.impulse ?? 0, turnSign: source.id % 2 === 0 ? 1 : -1 });
  if (kind === 'boomerang') { p.ttl = 2.4; p.outTime = Math.min(.8, source.def.range / speed); }
  sim.projectiles.push(p);
  source.shotsFired++;
  sim.eventCounts.projectiles++;
  sim.projectilePeak = Math.max(sim.projectilePeak, sim.projectiles.length);
  sim.addEffect('muzzle', x, y, { radius: kind === 'shell' ? 18 : 8, angle, team: source.team, duration: .13 });
  return p;
}

function explode(sim, p) {
  let options = { ranged: true, impulse: p.impulse || 170, falloff: .42 };
  if (p.kind === 'fireball') options = { ...options, impulse: 35, status: { burn: 4 }, effect: 'fire', burnDamage: 5 };
  if (p.kind === 'ice') options = { ...options, impulse: 15, status: { slow: 3 }, effect: 'ice' };
  radialHit(sim, p.source, p.x, p.y, p.blastRadius, p.damage, options);
  p.alive = false;
}

function moveBoomerang(sim, p, dt) {
  if (p.age < p.outTime) {
    const t = clamp(p.age / p.outTime, 0, 1);
    const d = p.speed * p.age;
    const bend = Math.sin(t * Math.PI) * 38 * p.turnSign;
    p.x = p.startX + Math.cos(p.angle) * d - Math.sin(p.angle) * bend;
    p.y = p.startY + Math.sin(p.angle) * d + Math.cos(p.angle) * bend;
  } else {
    if (p.phase === 0) { p.phase = 1; p.phaseHits = 0; }
    const owner = sim.getEntity(p.source.id);
    const tx = owner?.alive ? owner.x : p.returnX, ty = owner?.alive ? owner.y : p.returnY;
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d < p.speed * dt + 12) { p.alive = false; return; }
    p.x += dx / d * p.speed * 1.1 * dt;
    p.y += dy / d * p.speed * 1.1 * dt;
  }
  p.vx = (p.x - p.prevX) / dt; p.vy = (p.y - p.prevY) / dt;
}

export function updateProjectiles(sim, dt) {
  for (const p of sim.projectiles) {
    if (!p.alive) continue;
    p.prevX = p.x; p.prevY = p.y; p.age += dt;
    if (p.kind === 'boomerang') moveBoomerang(sim, p, dt);
    else { p.x += p.vx * dt; p.y += p.vy * dt; }
    p.travel += Math.hypot(p.x - p.prevX, p.y - p.prevY);
    if (!p.alive) continue;
    const candidates = [];
    sim.spatial.forEachBox(Math.min(p.prevX, p.x) - 42, Math.min(p.prevY, p.y) - 42,
      Math.max(p.prevX, p.x) + 42, Math.max(p.prevY, p.y) + 42, target => {
        if (!canApplyHostileEffect(p.source, target) || p.hitIds.has(`${p.phase}:${target.id}`)) return;
        const t = segmentCircle(p.prevX, p.prevY, p.x, p.y, target.x, target.y, target.radius + p.radius);
        if (t != null) candidates.push({ target, t });
      });
    candidates.sort((a, b) => a.t - b.t || a.target.id - b.target.id);
    for (const { target, t } of candidates) {
      if (p.phaseHits >= p.maxHits) break;
      p.hitIds.add(`${p.phase}:${target.id}`); p.phaseHits++;
      if (p.blastRadius > 0) {
        p.x = p.prevX + (p.x - p.prevX) * t;
        p.y = p.prevY + (p.y - p.prevY) * t;
        explode(sim, p); break;
      }
      let damage = p.damage;
      if (p.kind === 'pellet') damage *= 1 - .75 * clamp(p.travel / p.maxRange, 0, 1);
      if (p.kind === 'sniper' && p.phaseHits > 1) damage *= .75;
      if (p.kind === 'boomerang' && p.phase > 0) damage *= .7;
      queueHit(sim, p.source, target, damage, { ranged: true, armorPen: p.kind === 'sniper' ? 24 : 0,
        impulse: p.impulse, originX: p.prevX, originY: p.prevY, angle: Math.atan2(p.vy, p.vx), status: p.status });
      if (p.kind !== 'boomerang' && p.phaseHits >= p.maxHits) { p.alive = false; break; }
    }
    if (!p.alive) continue;
    if (p.age >= p.ttl || (p.kind !== 'boomerang' && p.travel >= p.maxRange) || p.x < -30 || p.y < -30 || p.x > WORLD.width + 30 || p.y > WORLD.height + 30) {
      if (p.blastRadius > 0) explode(sim, p); else p.alive = false;
    }
  }
  let write = 0;
  for (const p of sim.projectiles) {
    if (p.alive) sim.projectiles[write++] = p;
    else if (sim.projectilePool.length < 2400) sim.projectilePool.push(p);
  }
  sim.projectiles.length = write;
}
