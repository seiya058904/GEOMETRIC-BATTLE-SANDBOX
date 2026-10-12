import { UNIT_MAP, WORLD, MAX_UNITS } from '../data/units.js';

/** The extra world-space gap is shared by previews, edits and import validation. */
export const PLACEMENT_GAP = 2;
const EPSILON = 1e-7;
const CELL_SIZE = 72;
export const TAU = Math.PI * 2;

export function normalizeAngle(angle) {
  const normalized = ((angle % TAU) + TAU) % TAU;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function defaultAngle(team) {
  return team === 'blue' ? Math.PI : 0;
}

export function isUnitType(type) {
  return typeof type === 'string' && Object.hasOwn(UNIT_MAP, type);
}

const fail = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });

/** Preparation only. Simulation movement deliberately does not call this rule. */
export function teamForDeploymentPosition(type, x, y) {
  if (!isUnitType(type) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const radius = UNIT_MAP[type].radius;
  if (x < radius - EPSILON || x > WORLD.width - radius + EPSILON ||
      y < radius - EPSILON || y > WORLD.height - radius + EPSILON) return null;
  const margin = radius + PLACEMENT_GAP;
  if (x + margin <= WORLD.width / 2 + EPSILON) return 'red';
  if (x - margin >= WORLD.width / 2 - EPSILON) return 'blue';
  return null;
}

export function validateHomeZone(candidate) {
  const team = teamForDeploymentPosition(candidate?.type, candidate?.x, candidate?.y);
  if (!team) return fail('home-zone', '此处跨越分界线，请让完整体型留在红色或蓝色区域。');
  if (candidate.team !== team) return fail('home-zone', `这次绘制属于${candidate.team === 'red' ? '红' : '蓝'}方，请留在本方区域。`);
  return { ok: true, team, message: `可以部署${team === 'red' ? '红' : '蓝'}方单位。` };
}

/** Shared by ghost previews and commit. lockedTeam is the current gesture only. */
export function resolvePlacementCandidate(type, position, lockedTeam) {
  const team = teamForDeploymentPosition(type, position?.x, position?.y);
  const inferred = team || (position?.x < WORLD.width / 2 ? 'red' : 'blue');
  const candidate = { type, x: position?.x, y: position?.y, team: lockedTeam || inferred,
    angle: position?.angle === undefined ? defaultAngle(lockedTeam || inferred) : position.angle };
  // Reuse the complete check to retain specific type/bounds/numeric feedback.
  const check = validatePlacement([], candidate);
  return { ...check, candidate };
}

/** Incremental neighbor index: batch placement never scans every deployed pair. */
export class PlacementIndex {
  constructor(units = []) {
    this.cells = new Map();
    this.ids = new Set();
    this.size = 0;
    this.maxRadius = 0;
    for (const unit of units) this.add(unit);
  }

  add(unit) {
    const key = `${Math.floor(unit.x / CELL_SIZE)},${Math.floor(unit.y / CELL_SIZE)}`;
    let bucket = this.cells.get(key);
    if (!bucket) this.cells.set(key, bucket = []);
    bucket.push(unit);
    this.ids.add(unit.id);
    this.maxRadius = Math.max(this.maxRadius, UNIT_MAP[unit.type]?.radius || 0);
    this.size++;
  }

  *near(x, y, radius) {
    // Bound even adversarially huge finite eraser coordinates to the actual
    // world, avoiding enormous loops or non-incrementing floating-point indices.
    const left = Math.max(0, Math.floor((x - radius) / CELL_SIZE));
    const right = Math.min(Math.floor(WORLD.width / CELL_SIZE), Math.floor((x + radius) / CELL_SIZE));
    const top = Math.max(0, Math.floor((y - radius) / CELL_SIZE));
    const bottom = Math.min(Math.floor(WORLD.height / CELL_SIZE), Math.floor((y + radius) / CELL_SIZE));
    for (let cy = top; cy <= bottom; cy++) {
      for (let cx = left; cx <= right; cx++) {
        const bucket = this.cells.get(`${cx},${cy}`);
        if (bucket) yield* bucket;
      }
    }
  }
}

/**
 * @param {Array|PlacementIndex} units Existing units or an incremental index.
 * @param {{type:string,team:string,x:number,y:number,angle?:number}} candidate
 * @param {Set<number>|number[]} [ignoreIds] Existing units being replaced.
 * @returns {{ok:boolean,code?:string,message:string,conflictId?:number}}
 */
export function validatePlacement(units, candidate, ignoreIds = new Set(), { allowLegacy = false } = {}) {
  if (!candidate || typeof candidate !== 'object') return fail('invalid', '单位数据无效。');
  if (!isUnitType(candidate.type)) return fail('type', '无法部署未知兵种。');
  if (candidate.team !== 'red' && candidate.team !== 'blue') return fail('team', '请选择红队或蓝队。');
  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return fail('position', '部署坐标必须是有限数字。');
  if (candidate.angle !== undefined && !Number.isFinite(candidate.angle)) return fail('angle', '面向角度必须是有限弧度。');

  const radius = UNIT_MAP[candidate.type].radius;
  if (candidate.x < radius - EPSILON || candidate.x > WORLD.width - radius + EPSILON ||
      candidate.y < radius - EPSILON || candidate.y > WORLD.height - radius + EPSILON) {
    return fail('bounds', '单位不能超出战场边界，请为完整体型留出空间。');
  }
  if (!allowLegacy) {
    const zone = validateHomeZone(candidate);
    if (!zone.ok) return zone;
  }
  const ignored = ignoreIds instanceof Set ? ignoreIds : new Set(ignoreIds || []);
  const index = units instanceof PlacementIndex ? units : new PlacementIndex(units);
  let ignoredCount = 0;
  for (const id of ignored) if (index.ids.has(id)) ignoredCount++;
  if (index.size - ignoredCount >= MAX_UNITS) {
    return fail('limit', `战场已达到 ${MAX_UNITS} 个单位的安全上限。`);
  }
  for (const other of index.near(candidate.x, candidate.y, radius + index.maxRadius + PLACEMENT_GAP)) {
    if (ignored.has(other.id)) continue;
    const otherRadius = UNIT_MAP[other.type]?.radius;
    if (!Number.isFinite(otherRadius)) return fail('invalid', '当前编队中存在未知兵种。');
    const distance = radius + otherRadius + PLACEMENT_GAP;
    const dx = candidate.x - other.x;
    const dy = candidate.y - other.y;
    if (dx * dx + dy * dy < distance * distance - EPSILON) {
      return fail('overlap', '这里与已有单位重叠，请保持安全间距。', { conflictId: other.id });
    }
  }
  return { ok: true, message: '可以部署。' };
}

/** Validate the whole transformed group before applying any position or angle. */
export function validateReplacements(units, replacements) {
  const replacedIds = new Set(replacements.map(unit => unit.id));
  const index = new PlacementIndex(units.filter(unit => !replacedIds.has(unit.id)));
  for (const unit of replacements) {
    const result = validatePlacement(index, unit);
    if (!result.ok) return result;
    index.add(unit);
  }
  return { ok: true, message: '阵型合法。' };
}

/** Bounding box of unit centers: rotation and clipboard share this exact pivot. */
export function selectionBounds(units) {
  if (!units.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const unit of units) {
    minX = Math.min(minX, unit.x); maxX = Math.max(maxX, unit.x);
    minY = Math.min(minY, unit.y); maxY = Math.max(maxY, unit.y);
  }
  return { minX, minY, maxX, maxY, x: (minX + maxX) / 2, y: (minY + maxY) / 2, width: maxX - minX, height: maxY - minY };
}
