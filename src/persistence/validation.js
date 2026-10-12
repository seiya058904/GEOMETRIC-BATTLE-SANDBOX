import { MAX_UNITS } from '../data/units.js';
import { PlacementIndex, normalizeAngle, validatePlacement } from '../editor/placement.js';

export const SCHEMA_VERSION = 1;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();
const fail = (error, code = 'invalid') => ({ ok: false, error, code });

export function utf8Bytes(text) {
  return encoder.encode(text).byteLength;
}

/** Strictly typed, sanitized data only: no executable code or arbitrary fields. */
export function validateFormation(input) {
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
      const placement = validatePlacement(index, unit);
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

export function parseFormationJSON(text) {
  if (typeof text !== 'string') return fail('请导入文本格式的 JSON 文件。', 'text');
  if (text.length > MAX_FILE_BYTES || utf8Bytes(text) > MAX_FILE_BYTES) return fail('布阵文件超过 2 MiB。', 'size');
  let parsed;
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { return fail('JSON 格式错误，原有布阵保持不变。', 'json'); }
  return validateFormation(parsed);
}

export function exportFormationJSON(formation) {
  const validation = validateFormation(formation);
  if (!validation.ok) return validation;
  return { ok: true, value: JSON.stringify(validation.value, null, 2) };
}
