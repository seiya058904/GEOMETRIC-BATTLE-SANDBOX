import { exportFormationJSON, inspectFormation, parseFormationJSON, utf8Bytes, validateFormation } from './validation.js';

export { exportFormationJSON, parseFormationJSON, validateFormation, inspectFormation, migrateFormation, MAX_FILE_BYTES, SCHEMA_VERSION } from './validation.js';
export const AUTOSAVE_KEY = 'geobattle.autosave.v1';
export const PRESETS_KEY = 'geobattle.presets.v1';
const MAX_PRESET_BYTES = 8 * 1024 * 1024;
const fail = error => ({ ok: false, error });

function storageError(error, action) {
  if (error?.name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014) {
    return fail(`${action}失败：浏览器本地存储空间不足。当前布阵仍保留在内存中，可导出 JSON。`);
  }
  if (error?.name === 'SecurityError' || error?.name === 'NotAllowedError') {
    return fail(`${action}失败：浏览器禁止了本地存储。当前布阵仍可继续编辑和导出。`);
  }
  return fail(`${action}失败：无法访问浏览器本地存储。当前布阵未被修改。`);
}

/**
 * A complete preset collection is written with one atomic setItem. Failed
 * writes never update an in-memory success cache or erase the previous value.
 * Callers decide whether to replace their Editor only after an ok result.
 */
export class PresetStore {
  constructor(storage) {
    this._storage = null;
    this._accessError = null;
    this._idCounter = 0;
    this._autosaveProtection = null;
    this._autosaveRead = false;
    try {
      this._storage = arguments.length ? storage : globalThis.localStorage;
      if (!this._storage || typeof this._storage.getItem !== 'function' || typeof this._storage.setItem !== 'function') {
        this._accessError = new Error('Storage unavailable');
      }
    } catch (error) { this._accessError = error; }
  }

  _read(key, action) {
    if (this._accessError) return storageError(this._accessError, action);
    try { return { ok: true, value: this._storage.getItem(key) }; }
    catch (error) { return storageError(error, action); }
  }

  _write(key, value, action) {
    if (this._accessError) return storageError(this._accessError, action);
    try { this._storage.setItem(key, value); return { ok: true }; }
    catch (error) { return storageError(error, action); }
  }

  saveAutosave(formation) {
    if (!this._autosaveRead) this.loadAutosave();
    if (this._autosaveProtection !== null) return { ok: false, code: 'protected', raw: this._autosaveProtection,
      error: '原始自动存档仍受保护，请先导出备份并明确接受恢复结果。' };
    const serialized = exportFormationJSON(formation);
    if (!serialized.ok) return serialized;
    const result = this._write(AUTOSAVE_KEY, serialized.value, '自动保存');
    return result.ok ? { ok: true, value: true } : result;
  }

  loadAutosave() {
    this._autosaveRead = true;
    const result = this._read(AUTOSAVE_KEY, '恢复布阵');
    if (!result.ok) { this._autosaveProtection = undefined; return result; }
    if (result.value === null || result.value === undefined) return { ok: true, value: null };
    const parsed = parseFormationJSON(result.value);
    if (!parsed.ok) this._autosaveProtection = result.value;
    return parsed.ok ? parsed : { ...parsed, raw: result.value, error: `无法恢复最近布阵：${parsed.error}` };
  }

  get autosaveProtected() { return this._autosaveProtection !== null; }
  releaseAutosaveProtection() { this._autosaveProtection = null; }

  _readPresets() {
    const result = this._read(PRESETS_KEY, '读取预设');
    if (!result.ok) return result;
    if (result.value === null || result.value === undefined) return { ok: true, value: [] };
    const text = result.value;
    if (typeof text !== 'string' || text.length > MAX_PRESET_BYTES || utf8Bytes(text) > MAX_PRESET_BYTES) {
      return fail('预设存档过大或格式损坏，原始数据保持不变。');
    }
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return fail('预设存档不是有效的 JSON，原始数据保持不变。'); }
    if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.presets) || parsed.presets.length > 1000) {
      return fail('预设存档版本或结构不兼容，原始数据保持不变。');
    }
    const ids = new Set(), names = new Set(), presets = [];
    for (let i = 0; i < parsed.presets.length; i++) {
      const preset = parsed.presets[i];
      if (!preset || typeof preset.id !== 'string' || !/^p_[a-z0-9_-]{1,100}$/i.test(preset.id) || ids.has(preset.id) ||
          typeof preset.name !== 'string' || !preset.name.trim() || [...preset.name].length > 60 || names.has(preset.name) ||
          typeof preset.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(preset.updatedAt) || !Number.isFinite(Date.parse(preset.updatedAt))) {
        return fail(`第 ${i + 1} 个预设的名称、ID 或日期无效，原始数据保持不变。`);
      }
      const validation = validateFormation(preset.formation, { allowLegacy: true });
      if (!validation.ok) return fail(`预设「${preset.name}」损坏：${validation.error}`);
      ids.add(preset.id); names.add(preset.name);
      const record = { id: preset.id, name: preset.name, updatedAt: preset.updatedAt, formation: validation.value };
      // Keep original fields for a recovery download without adding them to the
      // sanitized collection when it is serialized for ordinary preset writes.
      Object.defineProperty(record, 'raw', { value: JSON.stringify(preset.formation, null, 2) });
      presets.push(record);
    }
    return { ok: true, value: presets };
  }

  listPresets() {
    const result = this._readPresets();
    return result.ok ? { ok: true, value: result.value.map(({ id, name, updatedAt, formation }) => ({ id, name, updatedAt, unitCount: formation.units.length })) } : result;
  }

  savePreset(name, formation) {
    if (typeof name !== 'string' || !name.trim()) return fail('请输入预设名称。');
    const cleanName = name.trim();
    if ([...cleanName].length > 60) return fail('预设名称不能超过 60 个字符。');
    if (/[\u0000-\u001f\u007f]/.test(cleanName)) return fail('预设名称不能含有控制字符。');
    const validation = validateFormation(formation);
    if (!validation.ok) return validation;
    const previous = this._readPresets();
    if (!previous.ok) return previous;
    const presets = previous.value;
    const existing = presets.findIndex(preset => preset.name === cleanName);
    let id;
    if (existing >= 0) id = presets[existing].id;
    else {
      const ids = new Set(presets.map(preset => preset.id));
      do { id = `p_${Date.now().toString(36)}_${(++this._idCounter).toString(36)}`; } while (ids.has(id));
    }
    const preset = { id, name: cleanName, updatedAt: new Date().toISOString(), formation: validation.value };
    if (existing >= 0) presets[existing] = preset;
    else presets.push(preset);
    const text = JSON.stringify({ schemaVersion: 1, presets });
    if (utf8Bytes(text) > MAX_PRESET_BYTES || presets.length > 1000) return fail('本地预设已过多，请先导出并清理一些预设。');
    const written = this._write(PRESETS_KEY, text, '保存预设');
    return written.ok ? { ok: true, value: preset } : written;
  }

  loadPreset(id) {
    const result = this._readPresets();
    if (!result.ok) return result;
    const preset = result.value.find(item => item.id === id);
    if (!preset) return fail('没有找到这个预设，可能已在另一窗口被删除。');
    const inspected = inspectFormation(preset.formation);
    return inspected.ok ? inspected : { ...inspected, raw: preset.raw };
  }

  deletePreset(id) {
    const result = this._readPresets();
    if (!result.ok) return result;
    const remaining = result.value.filter(preset => preset.id !== id);
    if (remaining.length === result.value.length) return fail('没有找到需要删除的预设。');
    const written = this._write(PRESETS_KEY, JSON.stringify({ schemaVersion: 1, presets: remaining }), '删除预设');
    return written.ok ? { ok: true, value: true } : written;
  }
}
