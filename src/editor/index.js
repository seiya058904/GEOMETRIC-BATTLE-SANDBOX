import { MAX_UNITS, UNIT_MAP, WORLD } from '../data/units.js';
import { validateFormation } from '../persistence/validation.js';
import { createDefaultFormation } from './formations.js';
import { PlacementIndex, defaultAngle, normalizeAngle, selectionBounds, validatePlacement, validateReplacements } from './placement.js';

export { createDefaultFormation, generateRandomFormation, RANDOM_SIZES } from './formations.js';
export { linePoints, gridPoints, brushPoints, MAX_GENERATED_POINTS } from './points.js';
export { validatePlacement, PLACEMENT_GAP, normalizeAngle, selectionBounds } from './placement.js';
export const HISTORY_LIMIT = 100;

/** @typedef {{id:number,type:string,team:'red'|'blue',x:number,y:number,angle:number}} Deployment */
/** @typedef {{schemaVersion:1,seed:number,units:Deployment[]}} Formation */
const fail = message => ({ ok: false, message });
const success = (message, extra = {}) => ({ ok: true, message, ...extra });

function frozenFormation(formation) {
  // Internal writes use fresh objects. Freezing protects deployment snapshots
  // from accidental changes by the renderer, simulation or external callers.
  for (const unit of formation.units) if (!Object.isFrozen(unit)) Object.freeze(unit);
  if (!Object.isFrozen(formation.units)) Object.freeze(formation.units);
  return Object.freeze(formation);
}

function sameFormation(a, b) {
  if (a === b) return true;
  if (a.seed !== b.seed || a.units.length !== b.units.length) return false;
  return a.units.every((unit, i) => {
    const other = b.units[i];
    return unit.id === other.id && unit.type === other.type && unit.team === other.team &&
      unit.x === other.x && unit.y === other.y && unit.angle === other.angle;
  });
}

export class Editor {
  /** @param {Formation} [formation] */
  constructor(formation = createDefaultFormation()) {
    const result = validateFormation(formation);
    if (!result.ok) throw new Error(result.error);
    this._formation = frozenFormation(result.value);
    this.selection = new Set();
    this._history = [];
    this._future = [];
    this._transaction = null;
    this._clipboard = [];
    this._index = new PlacementIndex(this._formation.units);
    this._nextId = this._findNextId();
    this.revision = 0;
  }

  get formation() { return this._formation; }
  get canUndo() { return !this._transaction && this._history.length > 0; }
  get canRedo() { return !this._transaction && this._future.length > 0; }
  get canPaste() { return this._clipboard.length > 0; }
  get clipboardSize() { return this._clipboard.length; }
  get transactionActive() { return this._transaction !== null; }

  _findNextId() {
    let next = 1;
    for (const unit of this._formation.units) if (unit.id >= next) next = unit.id + 1;
    if (!Number.isSafeInteger(next)) next = 1;
    return next;
  }

  _snapshot() { return { formation: this._formation, selection: new Set(this.selection) }; }

  _restore(snapshot) {
    this._formation = snapshot.formation;
    this.selection = new Set(snapshot.selection);
    this._index = new PlacementIndex(this._formation.units);
    this._nextId = this._findNextId();
    this.revision++;
  }

  _pushHistory(snapshot) {
    this._history.push(snapshot);
    if (this._history.length > HISTORY_LIMIT) this._history.shift();
    this._future = [];
  }

  _apply(formation, selection = this.selection, index = null) {
    if (sameFormation(this._formation, formation)) return false;
    if (!this._transaction) this._pushHistory(this._snapshot());
    this._formation = frozenFormation(formation);
    const present = new Set(formation.units.map(unit => unit.id));
    this.selection = new Set([...selection].filter(id => present.has(id)));
    this._index = index || new PlacementIndex(formation.units);
    this._nextId = this._findNextId();
    this.revision++;
    return true;
  }

  beginTransaction() {
    if (this._transaction) return fail('已有编辑操作正在进行。');
    this._transaction = this._snapshot();
    return success('已开始编辑操作。');
  }

  commitTransaction() {
    if (!this._transaction) return fail('没有待完成的编辑操作。');
    const before = this._transaction;
    this._transaction = null;
    if (!sameFormation(before.formation, this._formation)) this._pushHistory(before);
    return success('编辑操作已完成。');
  }

  cancelTransaction() {
    if (!this._transaction) return fail('没有待取消的编辑操作。');
    const before = this._transaction;
    this._transaction = null;
    this._restore(before);
    return success('已取消当前操作。');
  }

  undo() {
    if (this._transaction) return fail('请先完成或取消当前拖动。');
    if (!this._history.length) return fail('没有可以撤销的操作。');
    this._future.push(this._snapshot());
    this._restore(this._history.pop());
    return success('已撤销上一步。');
  }

  redo() {
    if (this._transaction) return fail('请先完成或取消当前拖动。');
    if (!this._future.length) return fail('没有可以重做的操作。');
    this._history.push(this._snapshot());
    this._restore(this._future.pop());
    return success('已重做。');
  }

  setFormation(formation) {
    const validation = validateFormation(formation);
    if (!validation.ok) return fail(validation.error);
    this._apply(validation.value, new Set());
    return success(`已载入 ${validation.value.units.length} 个单位；可以撤销。`);
  }

  setSeed(seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return fail('种子必须是 0 至 4294967295 的整数。');
    this._apply({ ...this._formation, seed });
    return success(`随机种子已设为 ${seed}。`);
  }

  select(ids, append = false) {
    const existing = new Set(this._formation.units.map(unit => unit.id));
    const next = append ? new Set(this.selection) : new Set();
    for (const id of ids || []) if (existing.has(id)) next.add(id);
    this.selection = next;
    return success(`已选中 ${next.size} 个单位。`);
  }

  selectRect(x1, y1, x2, y2, team, append = false) {
    if (![x1, y1, x2, y2].every(Number.isFinite)) return fail('框选范围无效。');
    if (team !== undefined && team !== 'red' && team !== 'blue') return fail('请选择有效阵营。');
    const left = Math.min(x1, x2), right = Math.max(x1, x2);
    const top = Math.min(y1, y2), bottom = Math.max(y1, y2);
    return this.select(this._formation.units.filter(unit => (team === undefined || unit.team === team) &&
      unit.x >= left && unit.x <= right && unit.y >= top && unit.y <= bottom).map(unit => unit.id), append);
  }

  _allocateId(used) {
    let id = this._nextId;
    while (used.has(id)) id = id === Number.MAX_SAFE_INTEGER ? 1 : id + 1;
    used.add(id);
    this._nextId = id === Number.MAX_SAFE_INTEGER ? 1 : id + 1;
    return id;
  }

  place(type, team, x, y, angle = defaultAngle(team)) {
    return this.placeMany([{ type, team, x, y, angle }]);
  }

  /** Partial acceptance is deliberate for brush/line/grid, and always reported. */
  placeMany(points) {
    if (!Array.isArray(points)) return fail('部署点必须是数组。');
    if (!points.length) return fail('没有可以放置的单位。');
    const index = new PlacementIndex(this._formation.units);
    const used = new Set(this._formation.units.map(unit => unit.id));
    const added = [];
    const reasons = {};
    for (let i = 0; i < points.length; i++) {
      if (index.size >= MAX_UNITS) { reasons.limit = (reasons.limit || 0) + points.length - i; break; }
      const point = points[i];
      const candidate = point && { type: point.type, team: point.team, x: point.x, y: point.y,
        angle: point.angle === undefined ? defaultAngle(point.team) : point.angle };
      const check = validatePlacement(index, candidate);
      if (!check.ok) { reasons[check.code] = (reasons[check.code] || 0) + 1; continue; }
      candidate.angle = normalizeAngle(candidate.angle);
      candidate.id = this._allocateId(used);
      added.push(candidate); index.add(candidate);
    }
    if (added.length) this._apply({ ...this._formation, units: [...this._formation.units, ...added] }, this.selection, index);
    const skipped = points.length - added.length;
    const labels = { overlap: '位置重叠', bounds: '超出边界', limit: `达到 ${MAX_UNITS} 个上限`, type: '未知兵种', team: '阵营无效', position: '坐标无效', angle: '方向无效', invalid: '数据无效' };
    const detail = Object.entries(reasons).map(([reason, count]) => `${labels[reason] || '位置无效'} ${count}`).join('，');
    return { ok: added.length > 0, added: added.length, skipped, reasons,
      message: `已放置 ${added.length} 个单位${skipped ? `，跳过 ${skipped} 个（${detail}）` : ''}。` };
  }

  eraseAt(x, y, radius, team) {
    if (![x, y, radius].every(Number.isFinite) || radius < 0) return fail('擦除范围无效。');
    if (team !== undefined && team !== 'red' && team !== 'blue') return fail('请选择有效阵营。');
    const removed = new Set();
    for (const unit of this._index.near(x, y, radius + this._index.maxRadius)) {
      const r = radius + UNIT_MAP[unit.type].radius;
      if ((team === undefined || unit.team === team) && (unit.x - x) ** 2 + (unit.y - y) ** 2 <= r * r) removed.add(unit.id);
    }
    return this._remove(removed);
  }

  _remove(ids) {
    const units = this._formation.units.filter(unit => !ids.has(unit.id));
    const deleted = this._formation.units.length - units.length;
    if (!deleted) return fail('此处没有可以删除的单位。');
    this._apply({ ...this._formation, units });
    return success(`已删除 ${deleted} 个单位。`, { deleted });
  }

  deleteSelection() { return this._remove(this.selection); }

  _selected() { return this._formation.units.filter(unit => this.selection.has(unit.id)); }

  _transform(transform, message) {
    const selected = this._selected();
    if (!selected.length) return fail('请先选择一个或多个单位。');
    const replacements = selected.map(transform);
    const check = validateReplacements(this._formation.units, replacements);
    if (!check.ok) return fail(`整个阵型保持原位：${check.message}`);
    const replacementMap = new Map(replacements.map(unit => [unit.id, unit]));
    this._apply({ ...this._formation, units: this._formation.units.map(unit => replacementMap.get(unit.id) || unit) });
    return success(message);
  }

  moveSelection(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return fail('移动距离必须是有限数字。');
    return this._transform(unit => ({ ...unit, x: unit.x + dx, y: unit.y + dy }), '已移动选中阵型。');
  }

  rotateSelection(radians) {
    if (!Number.isFinite(radians)) return fail('旋转角度必须是有限弧度。');
    const bounds = selectionBounds(this._selected());
    if (!bounds) return fail('请先选择需要旋转的单位。');
    const cos = Math.cos(radians), sin = Math.sin(radians);
    return this._transform(unit => {
      const dx = unit.x - bounds.x, dy = unit.y - bounds.y;
      return { ...unit, x: bounds.x + dx * cos - dy * sin, y: bounds.y + dx * sin + dy * cos,
        angle: normalizeAngle(unit.angle + radians) };
    }, '已旋转选中阵型与面向。');
  }

  copySelection() {
    const selected = this._selected();
    const bounds = selectionBounds(selected);
    if (!bounds) return fail('请先选择需要复制的单位。');
    this._clipboard = selected.map(unit => ({ type: unit.type, team: unit.team, x: unit.x - bounds.x, y: unit.y - bounds.y, angle: unit.angle }));
    return success(`已复制 ${selected.length} 个单位，选择粘贴位置即可放下。`);
  }

  _addGroup(points, label) {
    if (this._formation.units.length + points.length > MAX_UNITS) return fail(`完整军阵会超过 ${MAX_UNITS} 个单位上限，未放置任何单位。`);
    const index = new PlacementIndex(this._formation.units);
    for (const point of points) {
      const check = validatePlacement(index, point);
      if (!check.ok) return fail(`整个军阵未放置：${check.message}`);
      index.add(point);
    }
    const used = new Set(this._formation.units.map(unit => unit.id));
    const added = points.map(point => ({ ...point, id: this._allocateId(used), angle: normalizeAngle(point.angle) }));
    this._apply({ ...this._formation, units: [...this._formation.units, ...added] }, new Set(added.map(unit => unit.id)));
    return success(`${label} ${added.length} 个单位。`, { added: added.length, skipped: 0 });
  }

  pasteAt(x, y, team) {
    if (!this._clipboard.length) return fail('剪贴板为空，请先复制选中部队。');
    if (!Number.isFinite(x) || !Number.isFinite(y)) return fail('粘贴位置无效。');
    if (team !== undefined && team !== 'red' && team !== 'blue') return fail('请选择有效的目标阵营。');
    return this._addGroup(this._clipboard.map(unit => ({ ...unit, team: team || unit.team, x: unit.x + x, y: unit.y + y })), '已粘贴');
  }

  mirrorSelection(team) {
    const selected = this._selected();
    if (!selected.length) return fail('请先选择需要镜像复制的部队。');
    if (team !== undefined && team !== 'red' && team !== 'blue') return fail('请选择有效的目标阵营。');
    return this._addGroup(selected.map(({ id: _id, ...unit }) => ({ ...unit, x: WORLD.width - unit.x,
      angle: normalizeAngle(Math.PI - unit.angle), team: team || (unit.team === 'red' ? 'blue' : 'red') })), '已镜像复制');
  }

  swapTeams() {
    this._apply({ ...this._formation, units: this._formation.units.map(unit => ({ ...unit, team: unit.team === 'red' ? 'blue' : 'red' })) });
    return success('已交换双方身份，位置和面向保持不变。');
  }

  mirrorAll() {
    this._apply({ ...this._formation, units: this._formation.units.map(unit => ({ ...unit, x: WORLD.width - unit.x, angle: normalizeAngle(Math.PI - unit.angle) })) });
    return success('已将整个战场左右镜像，阵营身份保持不变。');
  }

  clearTeam(team) {
    if (team !== 'red' && team !== 'blue') return fail('请选择需要清空的阵营。');
    return this._remove(new Set(this._formation.units.filter(unit => unit.team === team).map(unit => unit.id)));
  }

  clearAll() { return this._remove(new Set(this._formation.units.map(unit => unit.id))); }
  resetDefault() { return this.setFormation(createDefaultFormation()); }

  getCounts() {
    const counts = { red: { count: 0, cost: 0 }, blue: { count: 0, cost: 0 }, total: this._formation.units.length };
    for (const unit of this._formation.units) { counts[unit.team].count++; counts[unit.team].cost += UNIT_MAP[unit.type].cost; }
    return counts;
  }
}
