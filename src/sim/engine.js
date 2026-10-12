import { UNIT_MAP, SUMMON_DEFS, WORLD, MAX_UNITS, FIXED_DT } from '../data/units.js';
import { RNG, clamp } from './rng.js';
import { SpatialHash } from './spatial.js';
import { queueHit, resolveCombat } from './combat.js';
import { updateAI } from './ai.js';
import { integrateMotion, resolveBodies } from './physics.js';
import { updateAbilities, updateScheduled } from './abilities.js';
import { updateProjectiles } from './projectiles.js';

const TIMER_KEYS = ['attackCooldown', 'skillCooldown', 'hitFlash', 'retreatTime', 'retreatCooldown', 'reloadTime', 'castTime', 'breathTime', 'airborne'];

function validate(formation) {
  if (!formation || formation.schemaVersion !== 1 || !Number.isInteger(formation.seed) || formation.seed < 0 || formation.seed > 0xffffffff || !Array.isArray(formation.units)) throw new Error('编队格式或随机种子无效。');
  if (formation.units.length > MAX_UNITS) throw new Error(`活动单位上限为 ${MAX_UNITS}。`);
  const ids = new Set(), teams = { red: 0, blue: 0 };
  for (const u of formation.units) {
    const def = u && Object.hasOwn(UNIT_MAP, u.type) ? UNIT_MAP[u.type] : null;
    if (!def || !Number.isSafeInteger(u.id) || u.id <= 0 || ids.has(u.id)) throw new Error('兵种未知或单位编号无效/重复。');
    if (u.team !== 'red' && u.team !== 'blue') throw new Error('阵营必须为红队或蓝队。');
    if (![u.x, u.y, u.angle].every(Number.isFinite) || u.x < def.radius || u.x > WORLD.width - def.radius || u.y < def.radius || u.y > WORLD.height - def.radius) throw new Error('单位坐标越界或朝向无效。');
    ids.add(u.id); teams[u.team]++;
  }
  if (!teams.red || !teams.blue) throw new Error('红蓝双方都需要至少 1 个单位才能开战。');
}

function createEntity(deployment, def, time, tick, rng, owner = null, lifetime = Infinity) {
  return {
    ...deployment, def, hp: def.hp, maxHp: def.hp, radius: def.radius, mass: def.mass,
    alive: true, vx: 0, vy: 0, moveVX: 0, moveVY: 0, impulseX: 0, impulseY: 0,
    prevX: deployment.x, prevY: deployment.y, wantX: 0, wantY: 0,
    desiredAngle: deployment.angle, turretAngle: deployment.angle, turretDesiredAngle: deployment.angle,
    targetId: null, patientId: null, targetLockedUntil: 0, decisionClock: (deployment.id % 17) * FIXED_DT,
    aiState: 'AcquireTarget', attackCooldown: rng.between(0, .18),
    skillCooldown: def.skillCooldown ? (def.id === 'necromancer' ? .8 : NO_DELAY_SKILLS.has(def.id) ? 0 : def.skillCooldown * .12) : 0,
    hitFlash: 0, attackPhase: 0, attackAnimTime: 0, attackAnimDuration: 0, attackAngle: deployment.angle,
    status: { burn: 0, slow: 0, stun: 0, fear: 0, knockdown: 0 },
    controlWindowUntil: { stun: 0, fear: 0, knockdown: 0 }, controlImmuneUntil: { stun: 0, fear: 0, knockdown: 0 },
    burnClock: 0, burnSource: null, burnDamage: 5, fearSource: null,
    stats: { damage: 0, taken: 0, healing: 0, kills: 0 },
    ownerId: owner?.id ?? null, ownerTeam: owner?.team ?? null, summoned: !!owner,
    expiresAt: Number.isFinite(lifetime) ? time + lifetime : null, deadAt: null, bornTick: tick,
    lastDamageSource: null, impulseSource: null, chainHits: new Set(),
    pendingAttack: null, retreatTime: 0, retreatCooldown: 0, retreatStartX: deployment.x, retreatStartY: deployment.y,
    dashTime: 0, dashSpeed: 0, dashAngle: deployment.angle, dashKind: null, dashHits: new Set(),
    airborne: 0, chargeActive: false, chargeDistance: 0, chargeHits: new Set(), landPending: false,
    castTime: 0, breathTime: 0, breathPulse: 0, stuckTime: 0,
    ammo: 10, reloadTime: 0, reloadCount: 0, hand: 1, combo: 0, comboTarget: null, lastComboTime: -99,
    selfDestruct: false, exploded: false, basicAttacks: 0, shotsFired: 0, abilityUses: 0, braces: 0, secondPunches: 0,
  };
}
const NO_DELAY_SKILLS = new Set(['cavalry', 'rhino', 'tank']);

/** Headless authoritative simulation. Only step() advances its clock. */
export class Simulation {
  constructor(formation, options = {}) {
    validate(formation);
    this.formation = Object.freeze({ schemaVersion: 1, seed: formation.seed >>> 0,
      units: Object.freeze(formation.units.map(u => Object.freeze({ id: u.id, type: u.type, team: u.team, x: u.x, y: u.y, angle: u.angle % (Math.PI * 2) })).sort((a, b) => a.id - b.id)) });
    this.rng = new RNG(this.formation.seed);
    this.time = 0; this.tick = 0; this.result = null;
    this.units = []; this.projectiles = []; this.effects = [];
    this.projectilePool = []; this.effectPool = [];
    this.byId = new Map(); this.originalUnits = [];
    this.nextEntityId = Math.max(...this.formation.units.map(u => u.id), 0) + 1;
    if (!Number.isSafeInteger(this.nextEntityId + MAX_UNITS * 40)) throw new Error('单位编号过大，无法安全创建召唤物。');
    this.nextProjectileId = 1; this.nextEffectId = 1;
    this.damageQueue = []; this.healQueue = []; this.scheduled = [];
    this.spatial = new SpatialHash();
    this.aliveCounts = { red: 0, blue: 0 };
    this.teamStats = Object.fromEntries(['red', 'blue'].map(team => [team, {
      initial: 0, remaining: 0, deaths: 0, summoned: 0, summonsAlive: 0, summonDeaths: 0,
      damage: 0, healing: 0, byType: new Map(),
    }]));
    this.ownerSummons = new Map();
    this.lastProgressTime = 0; this.lastApproachTime = 0; this.closestGap = Infinity;
    this.forceEngage = false; this.settling = false;
    this.maxDuration = options.maxDuration ?? 240;
    this.effectBudget = options.collectVisuals === false ? 0 : 850;
    this.capacityWarning = false;
    this.eventCounts = { attacks: 0, hits: 0, skills: 0, projectiles: 0, summons: 0, charges: 0, braces: 0 };
    this.projectilePeak = 0; this.unitPeak = this.formation.units.length;
    for (const deployment of this.formation.units) {
      const u = createEntity(deployment, UNIT_MAP[deployment.type], 0, -1, this.rng);
      this.units.push(u); this.originalUnits.push(u); this.byId.set(u.id, u); this.aliveCounts[u.team]++;
      const team = this.teamStats[u.team]; team.initial++; team.remaining++;
      if (!team.byType.has(u.type)) team.byType.set(u.type, { type: u.type, kills: 0, damage: 0, healing: 0 });
    }
    this.spatial.rebuild(this.units);
  }

  getEntity(id) { return this.byId.get(id) ?? null; }
  get activeCount() { return this.aliveCounts.red + this.aliveCounts.blue; }

  addEffect(kind, x, y, options = {}) {
    if (this.effects.length >= this.effectBudget) return;
    const effect = this.effectPool.pop() ?? {};
    // Clear optional old pooled fields so a reused circular effect cannot inherit a stale beam.
    for (const key of Object.keys(effect)) delete effect[key];
    Object.assign(effect, { id: this.nextEffectId++, kind, x, y, radius: 12, angle: 0, team: 'red', age: 0, duration: .3, ...options });
    this.effects.push(effect);
  }

  schedule(delay, job) { this.scheduled.push({ ...job, atTick: this.tick + Math.max(1, Math.round(delay / FIXED_DT)) }); }

  noteApproach(gap) {
    if (gap < this.closestGap - 8) { this.closestGap = Math.max(0, gap); this.lastApproachTime = this.time; }
  }

  credit(source, field, value) {
    if (value <= 0) return;
    const direct = this.getEntity(source.id);
    const owner = source.ownerId != null ? this.getEntity(source.ownerId) : null;
    const credited = owner ?? direct;
    if (direct) direct.stats[field] += value;
    if (owner && owner !== direct) owner.stats[field] += value;
    const team = this.teamStats[source.team];
    if (field !== 'kills') team[field] += value;
    const type = credited?.type ?? source.type;
    if (!team.byType.has(type)) team.byType.set(type, { type, kills: 0, damage: 0, healing: 0 });
    team.byType.get(type)[field] += value;
  }

  markDead(unit, source = null, reason = '战斗阵亡') {
    if (!unit.alive) return;
    unit.alive = false; unit.hp = 0; unit.deadAt = this.time; unit.aiState = 'Dead'; unit.deathReason = reason;
    unit.pendingAttack = null; unit.chargeActive = false; unit.dashTime = 0;
    unit.vx = unit.vy = unit.moveVX = unit.moveVY = 0;
    this.aliveCounts[unit.team]--;
    const team = this.teamStats[unit.team];
    if (unit.summoned) {
      team.summonDeaths++; team.summonsAlive--;
      const counts = this.ownerSummons.get(unit.ownerId);
      if (counts) counts[unit.type] = Math.max(0, (counts[unit.type] ?? 1) - 1);
    } else { team.deaths++; team.remaining--; }
    if (source && source.team !== unit.team) this.credit(source, 'kills', 1);
    this.addEffect('death', unit.x, unit.y, { radius: unit.radius * 1.8, team: unit.team, duration: .65, power: unit.mass });
  }

  summonCount(ownerId, type) { return this.ownerSummons.get(ownerId)?.[type] ?? 0; }

  isFreePosition(x, y, radius, excludeId = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < radius + 1 || y < radius + 1 || x > WORLD.width - radius - 1 || y > WORLD.height - radius - 1) return false;
    let valid = true;
    this.spatial.forEachCircle(x, y, radius + 40, other => {
      if (other.id !== excludeId && (other.x - x) ** 2 + (other.y - y) ** 2 < (other.radius + radius + 3) ** 2) valid = false;
    });
    return valid;
  }

  findFreePosition(x, y, radius, excludeId = null) {
    for (let ring = 0; ring < 5; ring++) {
      const count = ring === 0 ? 1 : ring * 8;
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2;
        const px = x + Math.cos(angle) * ring * (radius * 2 + 7), py = y + Math.sin(angle) * ring * (radius * 2 + 7);
        if (this.isFreePosition(px, py, radius, excludeId)) return { x: px, y: py };
      }
    }
    return null;
  }

  spawnSummon(owner, type, x, y, lifetime) {
    const def = Object.hasOwn(SUMMON_DEFS, type) ? SUMMON_DEFS[type] : null;
    if (!owner?.alive || !def || !Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 22) return null;
    if (this.activeCount >= MAX_UNITS) { this.capacityWarning = true; return null; }
    if (this.summonCount(owner.id, type) >= (type === 'skeleton' ? 8 : 1) || !this.isFreePosition(x, y, def.radius)) return null;
    const u = createEntity({ id: this.nextEntityId++, type, team: owner.team, x, y, angle: owner.angle }, def, this.time, this.tick, this.rng, owner, lifetime);
    this.units.push(u); this.byId.set(u.id, u); this.spatial.insert(u); this.aliveCounts[u.team]++;
    const counts = this.ownerSummons.get(owner.id) ?? {};
    counts[type] = (counts[type] ?? 0) + 1; this.ownerSummons.set(owner.id, counts);
    const team = this.teamStats[u.team]; team.summoned++; team.summonsAlive++;
    this.eventCounts.summons++;
    this.unitPeak = Math.max(this.unitPeak, this.activeCount);
    this.addEffect('summon', x, y, { radius: 35, team: owner.team, duration: .6 });
    return u;
  }

  updateTimers(unit) {
    for (const key of TIMER_KEYS) unit[key] = Math.max(0, unit[key] - FIXED_DT);
    const priorDash = unit.dashTime;
    unit.dashTime = Math.max(0, priorDash - FIXED_DT);
    if (priorDash > 0 && unit.dashTime === 0 && unit.dashKind === 'rhino') { unit.chargeActive = false; unit.chargeDistance = 0; }
    const burnSeconds = unit.status.burn > 1e-9 ? Math.min(unit.status.burn, FIXED_DT) : 0;
    for (const key of Object.keys(unit.status)) {
      const before = unit.status[key], after = before - FIXED_DT;
      unit.status[key] = after < 1e-9 ? 0 : after;
      if (before > 0 && unit.status[key] === 0 && key in unit.controlImmuneUntil) unit.controlImmuneUntil[key] = this.time + (key === 'fear' ? .7 : .35);
    }
    if (burnSeconds > 0 && unit.burnSource) {
      unit.burnClock += burnSeconds;
      if (unit.burnClock >= .25 - 1e-9 || unit.status.burn <= 1e-9) {
        queueHit(this, unit.burnSource, unit, unit.burnClock * unit.burnDamage,
          { dot: true, armorPen: 10000, ignoreShield: true, visual: false });
        unit.burnClock = 0;
      }
    }
    if (unit.attackAnimDuration > 0) {
      unit.attackAnimTime += FIXED_DT;
      unit.attackPhase = unit.attackAnimTime >= unit.attackAnimDuration ? 0 : unit.attackAnimTime / unit.attackAnimDuration;
    }
  }

  step() {
    if (this.result) return this.result;
    this.tick++; this.time = this.tick * FIXED_DT;
    let write = 0;
    for (const effect of this.effects) {
      effect.age += FIXED_DT;
      if (effect.age < effect.duration) this.effects[write++] = effect;
      else if (this.effectPool.length < 850) this.effectPool.push(effect);
    }
    this.effects.length = write;
    for (const unit of this.units) if (unit.alive) {
      if (unit.expiresAt != null && this.time >= unit.expiresAt) this.markDead(unit, null, '召唤寿命耗尽');
      else this.updateTimers(unit);
    }
    this.spatial.rebuild(this.units);
    for (const unit of this.units) if (unit.alive) updateAI(this, unit, FIXED_DT);
    for (const unit of this.units) if (unit.alive) integrateMotion(this, unit, FIXED_DT);
    this.spatial.rebuild(this.units);
    resolveBodies(this);
    this.spatial.rebuild(this.units);
    updateScheduled(this);
    const length = this.units.length;
    for (let i = 0; i < length; i++) updateAbilities(this, this.units[i], FIXED_DT);
    updateProjectiles(this, FIXED_DT);
    resolveCombat(this);
    if (this.tick % 60 === 0) this.recycleBodies();
    this.checkEnd();
    return this.result;
  }

  recycleBodies() {
    let write = 0;
    for (const unit of this.units) {
      if (unit.alive || this.time - unit.deadAt < 2.4) this.units[write++] = unit;
      else if (unit.summoned) this.byId.delete(unit.id);
    }
    this.units.length = write;
  }

  hasResidualThreat(team) {
    if (this.projectiles.some(p => p.alive && p.team === team)) return true;
    if (this.scheduled.some(j => j.kind === 'gravity_burst' && j.source.team === team)) return true;
    return this.units.some(u => u.alive && u.status.burn > 0 && u.burnSource?.team === team);
  }

  checkEnd() {
    let winner = null, reason = '';
    if (!this.aliveCounts.red && !this.aliveCounts.blue) { winner = 'draw'; reason = '双方全部战斗实体被消灭'; }
    else if (!this.aliveCounts.red || !this.aliveCounts.blue) {
      const defeated = !this.aliveCounts.red ? 'red' : 'blue';
      if (this.hasResidualThreat(defeated)) this.settling = true;
      else { winner = defeated === 'red' ? 'blue' : 'red'; reason = '敌方全部战斗实体被消灭'; }
    }
    const inactive = this.time - Math.max(this.lastProgressTime, this.lastApproachTime);
    if (!winner && inactive >= 15) this.forceEngage = true;
    if (!winner && inactive >= 35) { winner = 'draw'; reason = '僵局：主动靠近后仍无法产生有效交战'; }
    if (!winner && this.time >= this.maxDuration) { winner = 'draw'; reason = `达到 ${this.maxDuration} 秒模拟时限`; }
    if (winner) this.result = { ...this.summary(), winner, reason, duration: this.time };
  }

  summary() {
    const teams = {};
    for (const team of ['red', 'blue']) {
      const data = this.teamStats[team];
      teams[team] = { ...data, active: this.aliveCounts[team], byType: [...data.byType.values()].map(row => ({ ...row })).sort((a, b) => a.type.localeCompare(b.type)) };
    }
    const top = field => {
      let best = null;
      for (const unit of this.originalUnits) if (unit.stats[field] > 0 && (!best || unit.stats[field] > best.stats[field] || (unit.stats[field] === best.stats[field] && unit.id < best.id))) best = unit;
      return best ? { id: best.id, type: best.type, team: best.team, value: best.stats[field] } : null;
    };
    return { winner: this.result?.winner ?? null, reason: this.result?.reason ?? '战斗进行中', duration: this.time, teams, topDamage: top('damage'), topKills: top('kills') };
  }

  /** Serializable deterministic core, deliberately independent of render effects and display speed. */
  snapshot() {
    const entity = u => ({ id: u.id, type: u.type, team: u.team, x: u.x, y: u.y, vx: u.vx, vy: u.vy,
      hp: u.hp, alive: u.alive, angle: u.angle, targetId: u.targetId, aiState: u.aiState,
      attackCooldown: u.attackCooldown, skillCooldown: u.skillCooldown, status: { ...u.status }, stats: { ...u.stats },
      ownerId: u.ownerId, summoned: u.summoned, expiresAt: u.expiresAt, deadAt: u.deadAt, chargeDistance: u.chargeDistance,
      dashTime: u.dashTime, shotsFired: u.shotsFired, abilityUses: u.abilityUses, pendingAttack: u.pendingAttack ? { ...u.pendingAttack } : null });
    return { tick: this.tick, time: this.time, rng: this.rng.state, nextEntityId: this.nextEntityId,
      units: this.units.map(entity), originals: this.originalUnits.map(u => ({ id: u.id, hp: u.hp, stats: { ...u.stats }, deadAt: u.deadAt })),
      projectiles: this.projectiles.map(p => ({ id: p.id, kind: p.kind, x: p.x, y: p.y, vx: p.vx, vy: p.vy, age: p.age, phase: p.phase, hitIds: [...p.hitIds].sort(), source: { ...p.source } })),
      scheduled: this.scheduled.map(j => ({ ...j })), eventCounts: { ...this.eventCounts },
      forceEngage: this.forceEngage, summary: this.summary(), result: this.result ? { ...this.result } : null };
  }
}

export default Simulation;
