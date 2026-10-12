import { MAX_UNITS, UNIT_MAP, WORLD } from '../data/units.js';
import { PlacementIndex, PLACEMENT_GAP, normalizeAngle, validatePlacement, validateHomeZone } from '../editor/placement.js';

export const SCHEMA_VERSION = 1;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();
const fail = (error, code = 'invalid') => ({ ok: false, error, code });

export function utf8Bytes(text) {
  return encoder.encode(text).byteLength;
}

/** Strictly typed, sanitized data only: no executable code or arbitrary fields. */
export function validateFormation(input, { allowLegacy = false } = {}) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('布阵必须是 JSON 对象。');
    if (input.schemaVersion !== SCHEMA_VERSION) return fail('布阵版本不兼容，目前只支持 schemaVersion: 1。', 'schema');
    if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) return fail('随机种子必须是 0 至 4294967295 的整数。', 'seed');
    if (!Array.isArray(input.units)) return fail('布阵缺少有效的 units 数组。', 'units');
    if (input.units.length > MAX_UNITS) return fail(`布阵超过 ${MAX_UNITS} 个单位的安全上限。`, 'limit');
    const ids = new Set();
    const index = new PlacementIndex();
    const units = [];
    for (let i = 0; i < input.units.length; i++) {
      const source = input.units[i];
      const prefix = `第 ${i + 1} 个单位：`;
      if (!source || typeof source !== 'object' || Array.isArray(source)) return fail(`${prefix}数据格式无效。`, 'unit');
      if (!Number.isSafeInteger(source.id) || source.id < 1) return fail(`${prefix}ID 必须是正的安全整数。`, 'id');
      if (ids.has(source.id)) return fail(`${prefix}ID ${source.id} 重复。`, 'duplicate');
      if (!Number.isFinite(source.angle)) return fail(`${prefix}缺少有限的面向角度。`, 'angle');
      const unit = { id: source.id, type: source.type, team: source.team, x: source.x, y: source.y, angle: normalizeAngle(source.angle) };
      const placement = validatePlacement(index, unit, new Set(), { allowLegacy });
      if (!placement.ok) return fail(`${prefix}${placement.message}`, placement.code);
      ids.add(unit.id); index.add(unit); units.push(unit);
    }
    // Direct callers receive the same size protection as file imports. Unknown
    // fields are discarded, but cannot smuggle an oversized payload through it.
    const serialized = JSON.stringify(input);
    if (serialized.length > MAX_FILE_BYTES || utf8Bytes(serialized) > MAX_FILE_BYTES) return fail('布阵文件超过 2 MiB，请选择较小的 JSON 文件。', 'size');
    return { ok: true, value: { schemaVersion: SCHEMA_VERSION, seed: input.seed, units } };
  } catch {
    return fail('布阵数据无法读取或序列化，请使用有效的 JSON 数据。', 'invalid');
  }
}

/** Historical data is retained for an explicit, read-only recovery decision. */
export function inspectFormation(input) {
  const historical = validateFormation(input, { allowLegacy: true });
  if (!historical.ok) return historical;
  const incompatible = historical.value.units.filter(unit => !validateHomeZone(unit).ok);
  if (!incompatible.length) return historical;
  return { ok: false, code: 'migration', value: historical.value, incompatible,
    error: `旧布阵有 ${incompatible.length} 个单位不在本方部署区域。原始数据保留，请备份后创建兼容副本。` };
}

/** Never drop or silently change a team. Failure leaves the original untouched. */
export function migrateFormation(input) {
  const inspected = inspectFormation(input);
  if (inspected.ok) return inspected;
  if (inspected.code !== 'migration') return inspected;
  const formation = inspected.value;
  const incompatibleIds = new Set(inspected.incompatible.map(unit => unit.id));
  const index = new PlacementIndex(formation.units.filter(unit => !incompatibleIds.has(unit.id)));
  const moved = new Map();
  // Large bodies first avoids small units blocking the remaining usable slots.
  const pending = [...inspected.incompatible].sort((a, b) => UNIT_MAP[b.type].radius - UNIT_MAP[a.type].radius || a.id - b.id);
  for (const unit of pending) {
    const radius = UNIT_MAP[unit.type].radius;
    const margin = radius + PLACEMENT_GAP;
    const localX = unit.team === 'red' ? unit.x : WORLD.width - unit.x;
    const local = Math.max(radius, Math.min(WORLD.width / 2 - margin, WORLD.width - localX));
    let candidate = { ...unit, x: unit.team === 'red' ? local : WORLD.width - local };
    if (!validatePlacement(index, candidate).ok) {
      candidate = null;
      const step = radius * 2 + PLACEMENT_GAP;
      search: for (let y = radius; y <= WORLD.height - radius; y += step) {
        for (let x = radius; x <= WORLD.width / 2 - margin; x += step) {
          const next = { ...unit, x: unit.team === 'red' ? x : WORLD.width - x, y };
          if (validatePlacement(index, next).ok) { candidate = next; break search; }
        }
      }
    }
    if (!candidate) return fail('未找到容纳整支旧军队的安全位置，未移动或删除任何单位。请保留原始备份。', 'migration-space');
    moved.set(unit.id, candidate); index.add(candidate);
  }
  const validation = validateFormation({ ...formation, units: formation.units.map(unit => moved.get(unit.id) || unit) });
  return validation.ok ? { ...validation, moved: moved.size, message: `已创建兼容副本，保留全部 ${formation.units.length} 个单位及原阵营；移动 ${moved.size} 个单位。` } : validation;
}

export function parseFormationJSON(text) {
  if (typeof text !== 'string') return fail('请导入文本格式的 JSON 文件。', 'text');
  if (text.length > MAX_FILE_BYTES || utf8Bytes(text) > MAX_FILE_BYTES) return fail('布阵文件超过 2 MiB。', 'size');
  let parsed;
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { return { ...fail('JSON 格式错误，原有布阵保持不变。', 'json'), raw: text }; }
  const result = inspectFormation(parsed);
  return result.ok ? result : { ...result, raw: text };
}

export function exportFormationJSON(formation) {
  const validation = validateFormation(formation);
  if (!validation.ok) return validation;
  return { ok: true, value: JSON.stringify(validation.value, null, 2) };
}
