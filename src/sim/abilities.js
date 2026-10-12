import { FIXED_DT } from '../data/units.js';
import { angleDelta, clamp } from './rng.js';
import { canApplyHostileEffect, coneHit, lineHit, queueHeal, queueHit, radialHit, sourceOf } from './combat.js';
import { fireProjectile } from './projectiles.js';
import { isRanged } from './ai.js';

const NO_ACTIVE_SKILL = new Set(['cavalry', 'rhino', 'tank']);

function slashEffect(sim, unit, kind = 'slash', radius = unit.def.range) {
  sim.addEffect(kind, unit.x, unit.y, { radius, angle: unit.attackAngle ?? unit.angle, team: unit.team, duration: .25, power: unit.def.damage });
}

export function performBasicAttack(sim, unit, target) {
  if (!unit.alive || unit.hp <= 0 || !target) return;
  const kind = unit.def.attackKind;
  unit.basicAttacks++; sim.eventCounts.attacks++;
  const d = Math.hypot(target.x - unit.x, target.y - unit.y);
  const angle = Math.atan2(target.y - unit.y, target.x - unit.x);
  unit.hand *= -1;
  if (kind === 'heal') { queueHeal(sim, unit, target, unit.def.damage); return; }
  if (kind === 'suicide') { unit.selfDestruct = true; return; }
  if (isRanged(unit)) {
    if (kind === 'laser') {
      const x = unit.x + Math.cos(angle) * (unit.radius + 6), y = unit.y + Math.sin(angle) * (unit.radius + 6);
      const x2 = x + Math.cos(angle) * unit.def.range, y2 = y + Math.sin(angle) * unit.def.range;
      lineHit(sim, unit, x, y, x2, y2, 2, unit.def.damage, 2, { ranged: true, armorPen: 12 });
      sim.addEffect('laser', x, y, { x2, y2, radius: 2, angle, team: unit.team, duration: .14 });
    } else if (kind === 'shotgun') {
      for (let i = 0; i < 6; i++) fireProjectile(sim, unit, target, 'pellet', { angle: angle + (i - 2.5) * .065 + sim.rng.between(-.009, .009), range: 172 });
    } else {
      fireProjectile(sim, unit, target, kind, kind === 'mech_bolt' ? { arm: unit.hand * 16 } :
        kind === 'sniper' ? { lead: .98 } : kind === 'shell' ? { angle: unit.turretAngle, impulse: 320 } : {});
    }
    if (kind === 'machine') {
      unit.ammo--;
      if (unit.ammo <= 0) { unit.ammo = 10; unit.reloadTime = 2; unit.attackCooldown = 2; unit.aiState = 'Reload'; unit.reloadCount++; }
    }
    return;
  }
  const hitOptions = { angle: unit.attackAngle ?? unit.angle };
  if (kind === 'pike') {
    const facing = unit.attackAngle ?? unit.angle;
    const hits = lineHit(sim, unit, unit.x, unit.y, unit.x + Math.cos(facing) * unit.def.range,
      unit.y + Math.sin(facing) * unit.def.range, 4, unit.def.damage, 2, hitOptions);
    for (const { target: enemy } of hits) {
      const incoming = (enemy.vx * (unit.x - enemy.x) + enemy.vy * (unit.y - enemy.y)) / (Math.hypot(enemy.x - unit.x, enemy.y - unit.y) || 1);
      if ((incoming > 105 && enemy.def.role === 'charger') || enemy.chargeActive || (enemy.dashTime > 0 && enemy.dashKind !== 'spring')) {
        queueHit(sim, unit, enemy, unit.def.damage * .8, { brake: true, impulse: 90, angle: facing, status: { stun: .45 }, kind: 'brace' });
        unit.braces++; sim.eventCounts.braces++;
      }
    }
    slashEffect(sim, unit, 'stab');
  } else if (['sword', 'hammer', 'tusk'].includes(kind)) {
    coneHit(sim, unit, unit.def.range, kind === 'hammer' ? 1.25 : kind === 'tusk' ? 1.02 : .78,
      unit.def.damage, { ...hitOptions, impulse: kind === 'hammer' ? 215 : kind === 'tusk' ? 185 : 24 });
    slashEffect(sim, unit);
  } else if (d <= unit.def.range + target.radius && canApplyHostileEffect(unit, target) &&
    Math.abs(angleDelta(unit.attackAngle ?? unit.angle, angle)) < 1.12) {
    let impulse = kind === 'bite' && unit.mass > 7 ? 155 : kind === 'bash' ? 45 : 28;
    if (kind === 'combo_punch') {
      unit.combo = unit.comboTarget === target.id && sim.time - unit.lastComboTime < 2 ? Math.min(4, unit.combo + 1) : 1;
      unit.comboTarget = target.id; unit.lastComboTime = sim.time; impulse = 45 + unit.combo * 35;
    }
    if (kind === 'double_punch') {
      impulse = 65;
      sim.schedule(.2, { kind: 'second_punch', sourceId: unit.id, targetId: target.id });
    }
    queueHit(sim, unit, target, unit.def.damage, { ...hitOptions, impulse });
    slashEffect(sim, unit, kind === 'lance' || kind === 'horn' ? 'stab' : 'slash');
  }
}

function launchSkill(sim, unit, enemy) {
  if (unit.skillCooldown > 0 || !unit.def.skillCooldown || NO_ACTIVE_SKILL.has(unit.type) || !enemy?.alive) return false;
  const distance = Math.hypot(enemy.x - unit.x, enemy.y - unit.y);
  const angle = Math.atan2(enemy.y - unit.y, enemy.x - unit.x);
  let used = false;
  switch (unit.type) {
    case 'necromancer': {
      if (sim.summonCount(unit.id, 'skeleton') >= 8) break;
      let spawned = 0;
      for (let i = 0; i < 2 && sim.summonCount(unit.id, 'skeleton') < 8; i++) {
        const p = sim.findFreePosition(unit.x + Math.cos(angle + (i ? .85 : -.85)) * 36,
          unit.y + Math.sin(angle + (i ? .85 : -.85)) * 36, 8);
        if (p && sim.spawnSummon(unit, 'skeleton', p.x, p.y, 22)) spawned++;
      }
      used = spawned > 0;
      if (!used) unit.skillCooldown = 1;
      break;
    }
    case 'giant':
      if (distance < 172) {
        unit.castTime = .38;
        sim.schedule(.38, { kind: 'stomp', sourceId: unit.id }); used = true;
      }
      break;
    case 'dragon':
      if (distance < 245) { unit.breathTime = 1.35; unit.breathPulse = 0; unit.castTime = 1.35; used = true; }
      break;
    case 'raptor':
      if (distance > 52 && distance < 230) {
        unit.dashTime = clamp((distance - 20) / 520, .14, .38); unit.dashSpeed = 520;
        unit.dashAngle = angle; unit.dashKind = 'pounce'; unit.dashHits.clear(); unit.airborne = unit.dashTime; used = true;
      }
      break;
    case 'trex':
      if (distance < 215) {
        coneHit(sim, unit, 215, Math.PI, 0, { status: { fear: 1.3 } });
        sim.addEffect('roar', unit.x, unit.y, { radius: 215, team: unit.team, duration: .7 }); used = true;
      }
      break;
    case 'mech':
      if (distance < 640) {
        unit.castTime = .22;
        for (let i = -1; i <= 1; i++) fireProjectile(sim, unit, enemy, 'missile', {
          angle: angle + i * .075, arm: i * 20, damage: 48, blastRadius: 48, range: 660, impulse: 130 });
        used = true;
      }
      break;
    case 'blink_alien':
      if (distance > 45 && distance < 255) {
        const oldX = unit.x, oldY = unit.y;
        const back = enemy.angle + Math.PI;
        let place = null;
        for (const offset of [0, .6, -.6, 1, -1]) {
          const desired = { x: enemy.x + Math.cos(back + offset) * (enemy.radius + unit.radius + 7),
            y: enemy.y + Math.sin(back + offset) * (enemy.radius + unit.radius + 7) };
          if (Math.hypot(desired.x - unit.x, desired.y - unit.y) <= 220 && sim.isFreePosition(desired.x, desired.y, unit.radius, unit.id)) { place = desired; break; }
        }
        if (!place) {
          const side = angle + Math.PI / 2;
          const fallback = { x: unit.x + Math.cos(side) * 45, y: unit.y + Math.sin(side) * 45 };
          if (sim.isFreePosition(fallback.x, fallback.y, unit.radius, unit.id)) place = fallback;
        }
        if (place) {
          unit.x = place.x; unit.y = place.y; unit.prevX = place.x; unit.prevY = place.y;
          sim.spatial.updatePosition(unit, oldX, oldY);
          unit.moveVX = unit.moveVY = 0; unit.angle = Math.atan2(enemy.y - unit.y, enemy.x - unit.x);
          sim.addEffect('blink', oldX, oldY, { x2: unit.x, y2: unit.y, radius: 27, team: unit.team, duration: .5 });
          used = true;
        } else unit.skillCooldown = .8;
      }
      break;
    case 'ufo':
      if (distance < 540) {
        pullGroup(sim, unit, enemy.x, enemy.y, 112, 180);
        sim.schedule(.65, { kind: 'gravity_burst', source: sourceOf(unit), x: enemy.x, y: enemy.y, radius: 95, damage: 80 });
        unit.castTime = .5; used = true;
      }
      break;
    case 'spring_monster':
      if (distance > 42 && distance < 220) {
        unit.dashTime = clamp((distance - 8) / 380, .18, .48); unit.dashSpeed = 380;
        unit.dashAngle = angle; unit.dashKind = 'spring'; unit.airborne = unit.dashTime;
        unit.landPending = true; used = true;
      }
      break;
    case 'gravity_orb':
      if (distance < 245) {
        pullGroup(sim, unit, unit.x, unit.y, 230, 240);
        sim.schedule(.65, { kind: 'gravity_burst', source: sourceOf(unit), x: unit.x, y: unit.y, radius: 122, damage: 48 });
        unit.castTime = .3; used = true;
      }
      break;
    case 'jester': {
      if (distance > 450 || sim.summonCount(unit.id, 'decoy') >= 1) break;
      const p = sim.findFreePosition(unit.x + Math.cos(angle) * 50, unit.y + Math.sin(angle) * 50, 11);
      const decoy = p && sim.spawnSummon(unit, 'decoy', p.x, p.y, 6);
      if (decoy) {
        sim.spatial.forEachCircle(decoy.x, decoy.y, 285, other => {
          if (canApplyHostileEffect(unit, other) && other.type !== 'healer') { other.targetId = decoy.id; other.targetLockedUntil = sim.time + 1.1; }
        });
        used = true;
      }
      break;
    }
  }
  if (used) {
    unit.skillCooldown = unit.def.skillCooldown; unit.abilityUses++; sim.eventCounts.skills++;
    unit.aiState = 'Cast';
  }
  return used;
}

export function pullGroup(sim, source, x, y, radius, impulse) {
  sim.spatial.forEachCircle(x, y, radius + 35, target => {
    if (!canApplyHostileEffect(source, target)) return;
    const d = Math.hypot(target.x - x, target.y - y);
    if (d > radius + target.radius || d < target.radius + 12) return;
    queueHit(sim, source, target, 0, { impulse, angle: Math.atan2(y - target.y, x - target.x), knockdown: false });
  });
  sim.addEffect('gravity', x, y, { x2: source.x, y2: source.y, radius, team: source.team, duration: .65 });
}

export function updateAbilities(sim, unit, dt) {
  if (!unit.alive || unit.bornTick === sim.tick) return;
  const controlled = unit.status.stun > 0 || unit.status.knockdown > 0 || unit.status.fear > 0;
  if (controlled) { unit.pendingAttack = null; return; }
  if (unit.landPending && unit.dashTime <= 0) {
    unit.landPending = false;
    radialHit(sim, unit, unit.x, unit.y, 70, 52, { impulse: 245, effect: 'shockwave' });
  }
  if (unit.breathTime > 0) {
    unit.breathPulse -= dt;
    if (unit.breathPulse <= 0) {
      unit.breathPulse += .15;
      coneHit(sim, unit, 220, .43, 9, { status: { burn: 4 }, burnDamage: 5, ranged: true, impulse: 10 });
      sim.addEffect('fire', unit.x, unit.y, { radius: 220, angle: unit.angle, team: unit.team, duration: .19, power: 9 });
    }
    return;
  }
  if (unit.pendingAttack) {
    unit.pendingAttack.remaining -= dt;
    if (unit.pendingAttack.remaining <= 1e-9) {
      const target = sim.getEntity(unit.pendingAttack.targetId);
      if (target?.alive || unit.def.attackKind === 'suicide') performBasicAttack(sim, unit, target ?? unit.pendingAttack.target);
      unit.pendingAttack = null;
    }
    return;
  }
  const enemy = sim.getEntity(unit.targetId);
  launchSkill(sim, unit, enemy);
  if (unit.castTime > 0 || unit.breathTime > 0 || unit.dashTime > 0 || unit.def.role === 'decoy') return;
  const target = unit.type === 'healer' ? sim.getEntity(unit.patientId) : enemy;
  if (!target?.alive || unit.attackCooldown > 0 || unit.reloadTime > 0) return;
  const distance = Math.hypot(target.x - unit.x, target.y - unit.y);
  const range = unit.def.range + target.radius;
  if (distance > range) return;
  const angle = Math.atan2(target.y - unit.y, target.x - unit.x);
  const facing = unit.type === 'tank' ? unit.turretAngle : unit.angle;
  if (Math.abs(angleDelta(facing, angle)) > (isRanged(unit) ? .42 : .68)) return;
  unit.attackAngle = facing;
  unit.pendingAttack = { remaining: unit.def.windup, targetId: target.id, target: { x: target.x, y: target.y, radius: target.radius } };
  unit.attackCooldown = unit.def.cooldown;
  unit.attackAnimTime = 0;
  unit.attackAnimDuration = Math.max(.18, unit.def.windup + .19);
  unit.attackPhase = .01;
  unit.aiState = unit.type === 'healer' ? 'Cast' : 'Attack';
}

export function updateScheduled(sim) {
  let write = 0;
  for (const job of sim.scheduled) {
    if (job.atTick > sim.tick) { sim.scheduled[write++] = job; continue; }
    if (job.kind === 'gravity_burst') {
      // This delayed field was committed while its source was alive; it may resolve after its death.
      radialHit(sim, job.source, job.x, job.y, job.radius, job.damage, { impulse: 175, effect: 'shockwave', ranged: true });
      continue;
    }
    const source = sim.getEntity(job.sourceId);
    if (!source?.alive || source.status.stun > 0 || source.status.knockdown > 0) continue;
    if (job.kind === 'stomp') radialHit(sim, source, source.x, source.y, 142, 75, { impulse: 330, status: { knockdown: .65 }, effect: 'shockwave' });
    if (job.kind === 'second_punch') {
      const target = sim.getEntity(job.targetId);
      if (target?.alive && Math.hypot(target.x - source.x, target.y - source.y) <= source.def.range + target.radius + 10) {
        queueHit(sim, source, target, source.def.damage * .7, { impulse: 255 });
        source.hand *= -1; slashEffect(sim, source); source.secondPunches++;
      }
    }
  }
  sim.scheduled.length = write;
}
