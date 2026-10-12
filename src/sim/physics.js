import { WORLD } from '../data/units.js';
import { clamp, turnToward, segmentCircle } from './rng.js';
import { canApplyHostileEffect, queueHit, sourceOf } from './combat.js';

export function integrateMotion(sim, unit, dt) {
  if (!unit.alive) return;
  unit.prevX = unit.x; unit.prevY = unit.y;
  const blocked = unit.status.stun > 0 || unit.status.knockdown > 0;
  let speed = unit.def.speed * (unit.status.slow > 0 ? .6 : 1);
  if (unit.dashTime > 0 && !blocked) speed = unit.dashSpeed;
  else if (unit.chargeActive) speed *= 1.32;
  let tx = unit.wantX * speed, ty = unit.wantY * speed;
  if (blocked) tx = ty = 0;
  const ease = 1 - Math.exp(-dt * (unit.def.role === 'charger' ? 4.8 : unit.type === 'drone' || unit.type === 'ufo' ? 3.4 : unit.mass > 7 ? 5.5 : 11));
  unit.moveVX += (tx - unit.moveVX) * ease;
  unit.moveVY += (ty - unit.moveVY) * ease;
  if (unit.dashTime > 0 && !blocked) {
    unit.moveVX = Math.cos(unit.dashAngle) * speed;
    unit.moveVY = Math.sin(unit.dashAngle) * speed;
  }
  unit.vx = clamp(unit.moveVX + unit.impulseX, -740, 740);
  unit.vy = clamp(unit.moveVY + unit.impulseY, -740, 740);
  unit.x = clamp(unit.x + unit.vx * dt, unit.radius, WORLD.width - unit.radius);
  unit.y = clamp(unit.y + unit.vy * dt, unit.radius, WORLD.height - unit.radius);
  const drag = Math.exp(-dt * 6.5);
  unit.impulseX *= drag; unit.impulseY *= drag;
  if (Math.abs(unit.impulseX) + Math.abs(unit.impulseY) < 2) unit.impulseSource = null;
  const actual = Math.hypot(unit.x - unit.prevX, unit.y - unit.prevY);
  if (Math.hypot(unit.wantX, unit.wantY) > .25 && actual < .15) unit.stuckTime += dt;
  else unit.stuckTime = Math.max(0, unit.stuckTime - dt * .6);
  const moveSpeed = Math.hypot(unit.moveVX, unit.moveVY);
  if (moveSpeed > unit.def.speed * .6 && !blocked) unit.chargeDistance = Math.min(350, unit.chargeDistance + actual);
  else unit.chargeDistance = Math.max(0, unit.chargeDistance - dt * 110);
  if (!blocked && unit.skillCooldown <= 0 && !unit.chargeActive &&
    ((unit.def.role === 'charger' && unit.chargeDistance >= 72 && moveSpeed > unit.def.speed * .82) ||
    (unit.type === 'tank' && unit.chargeDistance >= 52 && moveSpeed > 45))) {
    unit.chargeActive = true; unit.chargeHits.clear();
  }
  unit.angle = turnToward(unit.angle, unit.desiredAngle, unit.def.turnRate * dt);
  unit.turretAngle = turnToward(unit.turretAngle, unit.turretDesiredAngle ?? unit.desiredAngle, 4.4 * dt);
}

function contactAttack(sim, source, target) {
  if (source.impulseSource && Math.hypot(source.impulseX, source.impulseY) > 185 && !source.chainHits.has(target.id) && canApplyHostileEffect(source.impulseSource, target)) {
    source.chainHits.add(target.id);
    queueHit(sim, source.impulseSource, target, 8, { impulse: 100, angle: Math.atan2(source.impulseY, source.impulseX), kind: 'chain', knockdown: false });
  }
  if (!canApplyHostileEffect(source, target)) return;
  const speed = Math.hypot(source.moveVX, source.moveVY);
  if (source.chargeActive && !source.chargeHits.has(target.id) && speed > (source.type === 'tank' ? 35 : 95)) {
    source.chargeHits.add(target.id);
    const damage = source.type === 'rhino' ? 75 : source.type === 'tank' ? 42 : 53;
    queueHit(sim, source, target, damage, { impulse: source.type === 'rhino' ? 360 : 270,
      angle: Math.atan2(source.moveVY, source.moveVX), status: { stun: .22 }, kind: 'charge' });
    sim.eventCounts.charges++; source.abilityUses++;
    sim.addEffect('charge', target.x, target.y, { radius: source.radius + 24, angle: source.angle, team: source.team, duration: .35 });
    source.skillCooldown = source.def.skillCooldown;
    if (source.type === 'rhino') {
      if (source.chargeHits.size === 1) {
        source.dashTime = .42; source.dashSpeed = 225; source.dashAngle = source.angle;
        source.dashKind = 'rhino';
      }
    } else { source.chargeActive = false; source.chargeDistance = 0; }
  }
  if (source.dashKind === 'pounce' && source.dashTime > 0 && !source.dashHits.has(target.id)) {
    source.dashHits.add(target.id);
    queueHit(sim, source, target, 35, { impulse: 185, angle: source.dashAngle, status: { stun: .18 } });
  }
}

export function resolveBodies(sim) {
  // Swept tests cover the special high-speed pounce and charged body, independent of rendered frames.
  for (const unit of sim.units) {
    if (!unit.alive || (!unit.chargeActive && !(unit.dashKind === 'pounce' && unit.dashTime > 0))) continue;
    sim.spatial.forEachBox(Math.min(unit.prevX, unit.x) - unit.radius - 38, Math.min(unit.prevY, unit.y) - unit.radius - 38,
      Math.max(unit.prevX, unit.x) + unit.radius + 38, Math.max(unit.prevY, unit.y) + unit.radius + 38, target => {
        if (target.id === unit.id || target.team === unit.team) return;
        if (segmentCircle(unit.prevX, unit.prevY, unit.x, unit.y, target.x, target.y, unit.radius + target.radius + 2) != null) contactAttack(sim, unit, target);
      });
  }
  for (const a of sim.units) {
    if (!a.alive) continue;
    sim.spatial.forEachCircle(a.x, a.y, a.radius + 37, b => {
      if (b.id <= a.id) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const minimum = a.radius + b.radius, ds = dx * dx + dy * dy;
      if (ds >= minimum * minimum) return;
      let d = Math.sqrt(ds), nx, ny;
      if (d < 1e-5) {
        const angle = ((a.id * 97 + b.id * 31) % 360) * Math.PI / 180;
        nx = Math.cos(angle); ny = Math.sin(angle); d = 0;
      } else { nx = dx / d; ny = dy / d; }
      contactAttack(sim, a, b); contactAttack(sim, b, a);
      const overlap = Math.min(16, (minimum - d) * .82);
      const invA = 1 / a.mass, invB = 1 / b.mass, weight = invA + invB;
      // Pure positional separation never creates hostile status or transfers attack knockback to allies.
      a.x = clamp(a.x - nx * overlap * invA / weight, a.radius, WORLD.width - a.radius);
      a.y = clamp(a.y - ny * overlap * invA / weight, a.radius, WORLD.height - a.radius);
      b.x = clamp(b.x + nx * overlap * invB / weight, b.radius, WORLD.width - b.radius);
      b.y = clamp(b.y + ny * overlap * invB / weight, b.radius, WORLD.height - b.radius);
    });
  }
}
