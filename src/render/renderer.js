import { WORLD, UNIT_MAP, SUMMON_DEFS } from '../data/units.js';
import { Camera } from './camera.js';
import { paintUnit, TEAM_COLORS } from './unit-art.js';

const TAU = Math.PI * 2;
const PAPER = '#edf0e6';
const FIELD = '#111c20';
const isGroundEffect = kind => kind === 'gravity' || kind === 'summon' || kind === 'heal';
const IMPORTANT_EFFECTS = new Set(['laser', 'explosion', 'shockwave', 'roar', 'gravity', 'fire', 'blink']);
const getDef = unit => unit.def ?? UNIT_MAP[unit.type] ?? SUMMON_DEFS[unit.type];
const valid = value => Number.isFinite(value);
function visible(x, y, radius, bounds) {
  return valid(x) && valid(y) && x + radius >= bounds.left && x - radius <= bounds.right && y + radius >= bounds.top && y - radius <= bounds.bottom;
}
function strokeLine(ctx, x, y, x2, y2, color, width) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function circle(ctx, x, y, radius, color, width) {
  if (!(radius > 0)) return;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function dot(ctx, x, y, radius, color) {
  ctx.beginPath(); ctx.arc(x, y, Math.max(.01, radius), 0, TAU); ctx.fillStyle = color; ctx.fill();
}

/** A read-only projection of the simulation. The owner supplies the single requestAnimationFrame. */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    // Prefer CPU-backed Canvas2D for this bounded geometric scene. A controlled
    // same-scene run removed multi-second accelerated-2D stalls in the available
    // SwiftShader browser. This is a browser hint, not a hardware speed guarantee.
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: false, willReadFrequently: true });
    if (!this.ctx) throw new Error('浏览器无法创建 Canvas 2D 画布。');
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.camera = new Camera();
    this._level = 'high';
    this._sprites = new Map();
    this._gridPatternCache = null;
    this._editorFrame = null;
    this.metrics = { drawnUnits: 0, drawnProjectiles: 0, effects: 0, quality: 'high', pixelRatio: 1 };
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || this.canvas.clientWidth || 1);
    const height = Math.max(1, rect.height || this.canvas.clientHeight || 1);
    if (width !== this.width || height !== this.height) {
      this.width = width; this.height = height;
      this.camera.resize(width, height);
    }
    this._resizeBuffer();
  }

  _resizeBuffer() {
    const cap = this._level === 'low' ? 1 : this._level === 'medium' ? 1.5 : 2;
    const dpr = Math.max(1, Math.min(cap, globalThis.devicePixelRatio || 1));
    const w = Math.round(this.width * dpr), h = Math.round(this.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.dpr = dpr;
  }

  draw({ formation = [], sim = null, mode = 'edit', selection = new Set(), hover = null, preview = [], selectionRect = null, quality = 'auto', showHealth = true, showGrid = true, showZones = true, followId = null, screenShake = true } = {}) {
    const battle = sim && !['edit', 'editing', 'deployment', 'preparing'].includes(String(mode).toLowerCase());
    const units = battle ? sim.units : (Array.isArray(formation) ? formation : formation?.units ?? []);
    const time = battle ? sim.time : 0;
    const effects = battle ? sim.effects : [];
    const level = quality === 'auto' ? (units.length > 700 ? 'low' : units.length > 300 ? 'medium' : 'high') : ['high', 'medium', 'low'].includes(quality) ? quality : 'high';
    if (level !== this._level) { this._level = level; this._resizeBuffer(); }
    const c = this.ctx, cam = this.camera;
    // The editor publishes frozen immutable formations. Retain an unchanged idle
    // frame instead of continuously submitting identical Canvas work to the GPU.
    // Mutable test fixtures and every battle frame always take the normal path.
    if (!battle && String(mode).toLowerCase() === 'preparing' && !Array.isArray(formation) && Object.isFrozen(formation)) {
      const key = [this.width, this.height, this.dpr, cam.x, cam.y, cam.zoom, level, showGrid, showZones, showHealth,
        typeof hover === 'number' ? hover : hover?.id, hover?.type, hover?.team, hover?.x, hover?.y, hover?.angle, hover?.valid, hover?.invalid,
        selectionRect?.x, selectionRect?.y, selectionRect?.width, selectionRect?.height,
        selectionRect?.x1, selectionRect?.y1, selectionRect?.x2, selectionRect?.y2].join('|');
      const previous = this._editorFrame;
      if (previous?.formation === formation && previous.selection === selection && previous.preview === preview && previous.key === key) return;
      this._editorFrame = { formation, selection, preview, key };
    } else this._editorFrame = null;
    const bounds = cam.bounds;
    this.metrics.drawnUnits = 0; this.metrics.drawnProjectiles = 0; this.metrics.effects = 0;
    this.metrics.quality = level; this.metrics.pixelRatio = this.dpr;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = '#0c1519'; c.fillRect(0, 0, this.width, this.height);
    c.save();
    let shakeX = 0, shakeY = 0;
    if (battle && screenShake && level !== 'low') {
      let strongest = 0, shakeId = 0;
      for (let i = Math.max(0, effects.length - 60); i < effects.length; i++) {
        const effect = effects[i];
        if ((effect.kind === 'explosion' || effect.kind === 'shockwave') && effect.age < .26 && visible(effect.x, effect.y, effect.radius, bounds)) {
          const force = Math.min(3.3, (effect.radius ?? 40) * .028) * Math.max(0, 1 - effect.age / .26);
          if (force > strongest) { strongest = force; shakeId = effect.id; }
        }
      }
      shakeX = Math.sin(time * 78 + shakeId) * strongest;
      shakeY = Math.cos(time * 87 + shakeId * 1.7) * strongest * .65;
    }
    c.translate(this.width / 2 + shakeX, this.height / 2 + shakeY);
    c.scale(cam.zoom, cam.zoom); c.translate(-cam.x, -cam.y);
    c.lineCap = 'round'; c.lineJoin = 'round';
    this._field(c, bounds, showGrid, showZones && !battle);

    const budget = level === 'high' ? 200 : level === 'medium' ? 115 : 55;
    const effectStart = Math.max(0, effects.length - budget * 2);
    let usedEffects = 0;
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1) {
        // Bodies are layered over ground effects; bullets and impacts stay above bodies.
        for (const unit of units) this._unit(c, unit, time, bounds, selection, hover, showHealth, level, battle);
        if (battle) for (const projectile of sim.projectiles) this._projectile(c, projectile, time, bounds, level);
      }
      const passBudget = pass === 0 ? Math.ceil(budget * .35) : budget;
      for (let i = effects.length - 1; i >= effectStart && usedEffects < passBudget; i--) {
        const effect = effects[i];
        if (isGroundEffect(effect.kind) !== (pass === 0)) continue;
        if (level === 'low' && !IMPORTANT_EFFECTS.has(effect.kind) && effect.id % 3 !== 0) continue;
        if (!visible(effect.x, effect.y, (effect.radius || 25) + Math.abs((effect.x2 ?? effect.x) - effect.x) + Math.abs((effect.y2 ?? effect.y) - effect.y), bounds)) continue;
        this._effect(c, effect, level);
        usedEffects++;
      }
    }
    this.metrics.effects = usedEffects;

    if (!battle) {
      const previewUnits = Array.isArray(preview) ? preview : preview?.units ?? [];
      if (hover && typeof hover === 'object' && hover.type && valid(hover.x) && valid(hover.y) && !previewUnits.length) {
        // Hover is editor-owned state, so copy the list rather than mutate its preview array.
        this._ghost(c, hover, bounds);
      }
      for (const unit of previewUnits) {
        this._ghost(c, unit, bounds);
      }
      if (selectionRect) this._selection(c, selectionRect);
    }
    c.restore();
    if (!units.length && !preview?.length) {
      c.fillStyle = '#93a4a8'; c.font = '500 14px system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText('自由实验，从第一位士兵开始', this.width / 2, this.height / 2 - 10);
      c.fillStyle = '#5f757d'; c.font = '12px system-ui, sans-serif';
      c.fillText('选择兵种，在战场上点击部署', this.width / 2, this.height / 2 + 15);
    }
    c.globalAlpha = 1;
  }

  _ghost(c, unit, bounds) {
    const def = getDef(unit), cam = this.camera;
    if (!def || !visible(unit.x, unit.y, def.radius * 4, bounds)) return;
    const invalid = unit.valid === false || unit.invalid;
    c.save();
    c.globalAlpha = invalid ? .26 : .5;
    c.translate(unit.x, unit.y); c.rotate(unit.angle ?? (unit.team === 'blue' ? Math.PI : 0)); c.scale(def.radius, def.radius);
    paintUnit(c, unit, def, 0, true); c.restore();
    c.globalAlpha = .85;
    c.setLineDash([4 / cam.zoom, 4 / cam.zoom]);
    const radius = def.radius + 3 / cam.zoom;
    circle(c, unit.x, unit.y, radius, invalid ? '#facc65' : TEAM_COLORS[unit.team], 1 / cam.zoom);
    c.setLineDash([]);
    if (invalid) strokeLine(c, unit.x - radius * .7, unit.y + radius * .7, unit.x + radius * .7, unit.y - radius * .7, '#facc65', 1.4 / cam.zoom);
    c.globalAlpha = 1;
  }

  _field(c, bounds, grid, zones) {
    const z = this.camera.zoom;
    c.fillStyle = FIELD; c.fillRect(0, 0, WORLD.width, WORLD.height);
    if (zones) {
      c.fillStyle = 'rgba(255,112,93,0.021)'; c.fillRect(0, 0, WORLD.width / 2, WORLD.height);
      c.fillStyle = 'rgba(89,183,250,0.021)'; c.fillRect(WORLD.width / 2, 0, WORLD.width / 2, WORLD.height);
    }
    if (grid) {
      let spacing = 50;
      while (spacing * z < 20) spacing *= 2;
      while (spacing * z > 58) spacing /= 2;
      c.fillStyle = this._gridPattern(c, spacing);
      c.fillRect(0, 0, WORLD.width, WORLD.height);
    }
    c.strokeStyle = '#304249'; c.lineWidth = 1 / z; c.strokeRect(0, 0, WORLD.width, WORLD.height);
    if (zones) {
      c.globalAlpha = .8; c.setLineDash([6 / z, 8 / z]);
      strokeLine(c, WORLD.width / 2, 18 / z, WORLD.width / 2, WORLD.height - 18 / z, '#3b5157', 1 / z);
      c.setLineDash([]); c.globalAlpha = 1;
      c.font = `500 ${Math.max(11 / z, 12)}px system-ui, sans-serif`; c.textAlign = 'left';
      c.fillStyle = '#ad7770'; c.fillText('红方建议区', 22 / z, 29 / z);
      c.textAlign = 'right'; c.fillStyle = '#698eaa'; c.fillText('蓝方建议区', WORLD.width - 22 / z, 29 / z);
    }
    // Small corner marks are a board boundary guide, never collision geometry.
    const length = 18 / z;
    c.strokeStyle = '#4b6269'; c.lineWidth = 1 / z;
    for (const [x, y, dx, dy] of [[0, 0, 1, 1], [WORLD.width, 0, -1, 1], [0, WORLD.height, 1, -1], [WORLD.width, WORLD.height, -1, -1]]) {
      c.beginPath(); c.moveTo(x, y + length * dy); c.lineTo(x, y); c.lineTo(x + length * dx, y); c.stroke();
    }
  }

  _gridPattern(c, spacing) {
    const zoom = this.camera.zoom, dpr = this.dpr;
    const cached = this._gridPatternCache;
    if (cached && cached.spacing === spacing && cached.zoom === zoom && cached.dpr === dpr) return cached.pattern;
    // One small, transparent tile replaces thousands of tiny per-frame GPU draws.
    // Map the rounded bitmap size back to the exact world spacing so pan/zoom
    // cannot accumulate a drifting grid phase or change the original dot size.
    const pixels = Math.max(1, Math.ceil(spacing * zoom * dpr));
    const tile = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(pixels, pixels) : document.createElement('canvas');
    tile.width = pixels; tile.height = pixels;
    const ctx = tile.getContext('2d', { willReadFrequently: true });
    const dotPixels = Math.max(.9 / zoom, .55) * pixels / spacing;
    ctx.fillStyle = '#294047';
    ctx.fillRect((pixels - dotPixels) / 2, (pixels - dotPixels) / 2, dotPixels, dotPixels);
    const pattern = c.createPattern(tile, 'repeat');
    const scale = spacing / pixels;
    // The tile's centre is the world origin; all other centres are n * spacing.
    pattern.setTransform({ a: scale, b: 0, c: 0, d: scale, e: -spacing / 2, f: -spacing / 2 });
    this._gridPatternCache = { spacing, zoom, dpr, tile, pattern };
    return pattern;
  }

  _unit(c, unit, time, bounds, selection, hover, showHealth, level, battle) {
    const def = getDef(unit);
    if (!def || !visible(unit.x, unit.y, def.radius * 4.5, bounds)) return;
    const dead = unit.alive === false;
    const deadAge = dead ? Math.max(0, time - (unit.deadAt ?? time)) : 0;
    if (dead && (deadAge > 1.6 || level === 'low')) return;
    const radius = unit.radius ?? def.radius;
    const z = this.camera.zoom;
    const team = TEAM_COLORS[unit.team] ?? TEAM_COLORS.red;
    const selected = selection?.has?.(unit.id) || (typeof hover === 'number' ? hover === unit.id : hover?.id === unit.id);
    if (selected && !dead) {
      c.globalAlpha = .13; dot(c, unit.x, unit.y, radius + 8 / z, '#d3ee89');
      c.globalAlpha = 1; circle(c, unit.x, unit.y, radius + 7 / z, '#d3ee89', 1.2 / z);
    }
    c.save(); c.translate(unit.x, unit.y);
    c.rotate(unit.angle ?? (unit.team === 'blue' ? Math.PI : 0));
    c.scale(radius, radius);
    if (dead) {
      c.globalAlpha = .23 * (1 - deadAge / 1.6);
      c.rotate(deadAge * .13); c.scale(.88, .78);
    } else if (unit.status?.knockdown > 0) {
      c.scale(1.18, .72); c.rotate(.16);
    } else if (unit.airborne > 0) {
      const lift = Math.min(.18, unit.airborne * .35); c.scale(1 + lift, 1 + lift);
    }
    if (radius * z < 2.7 && level !== 'high') {
      if (def.shape === 'square' || def.shape === 'hexagon') {
        c.fillStyle = unit.hitFlash > 0 ? PAPER : team; c.fillRect(-.75, -.75, 1.5, 1.5);
      } else dot(c, 0, 0, .77, unit.hitFlash > 0 ? PAPER : team);
      strokeLine(c, .25, .45, 1.55, .45, def.accent, .2);
    } else if (level === 'low' && radius * z <= 24 && !unit.hitFlash && !selected && def.id !== 'tank') {
      // At low quality, reuse geometry rendered into a small transparent atlas entry.
      // Real positions, aim, impacts, status, health and collision never come from the atlas.
      // Two poses preserve an attack tell while avoiding thousands of repeated paths.
      const sprite = this._unitSprite(unit, def);
      c.drawImage(sprite, -4, -4, 8, 8);
    } else paintUnit(c, unit, def, time, level !== 'low' && radius * z > 3.8);
    c.restore();
    this.metrics.drawnUnits++;
    if (dead) return;
    if (battle && unit.status) this._status(c, unit, radius, time, level);
    if (battle && (selected || (showHealth && (radius * z >= 4.2 || radius >= 24))) && unit.hp < (unit.maxHp ?? def.hp)) {
      const size = Math.max(13 / z, radius * 1.6), height = Math.max(2 / z, 2.4);
      const y = unit.y - radius * (def.id === 'dragon' ? 2.05 : 1.48) - 4 / z;
      const ratio = Math.max(0, Math.min(1, unit.hp / (unit.maxHp ?? def.hp)));
      c.fillStyle = '#091216'; c.fillRect(unit.x - size / 2 - 1 / z, y - 1 / z, size + 2 / z, height + 2 / z);
      c.fillStyle = '#294048'; c.fillRect(unit.x - size / 2, y, size, height);
      c.fillStyle = ratio > .3 ? team : '#f2d69e'; c.fillRect(unit.x - size / 2, y, size * ratio, height);
    }
  }

  _unitSprite(unit, def) {
    const pose = (unit.attackPhase ?? 0) > .07 ? 1 : 0;
    const key = `${def.id}/${unit.team}/${pose}`;
    let sprite = this._sprites.get(key);
    if (!sprite) {
      sprite = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(128, 128) : document.createElement('canvas');
      sprite.width = 128; sprite.height = 128;
      // Keep cached image sources on the same preferred backing as the main
      // canvas, avoiding repeated reads from an accelerated source in CPU draws.
      const ctx = sprite.getContext('2d', { willReadFrequently: true });
      ctx.translate(64, 64); ctx.scale(16, 16);
      paintUnit(ctx, { id: 0, team: unit.team, angle: 0, attackPhase: pose ? .5 : 0 }, def, 0, false);
      this._sprites.set(key, sprite);
    }
    return sprite;
  }

  _status(c, unit, radius, time, level) {
    const s = unit.status, z = this.camera.zoom;
    if (s.slow > 0) {
      c.globalAlpha = .65; circle(c, unit.x, unit.y, radius * 1.07, '#a7eeef', 1 / z); c.globalAlpha = 1;
    }
    if (s.burn > 0) {
      const pulse = .65 + Math.sin(time * 12 + unit.id) * .2;
      c.globalAlpha = pulse;
      c.beginPath(); c.moveTo(unit.x - radius * .38, unit.y - radius * .45); c.lineTo(unit.x, unit.y - radius * (1.4 + pulse * .2)); c.lineTo(unit.x + radius * .3, unit.y - radius * .55);
      c.strokeStyle = '#ffbd73'; c.lineWidth = 1.25 / z; c.stroke(); c.globalAlpha = 1;
    }
    if (level === 'low') return;
    if (s.stun > 0 || s.knockdown > 0) {
      const a = time * 4 + unit.id;
      for (let i = 0; i < 3; i++) {
        const px = unit.x + Math.cos(a + i * TAU / 3) * radius * 1.08, py = unit.y + Math.sin(a + i * TAU / 3) * radius * .8;
        strokeLine(c, px - 2 / z, py, px + 2 / z, py, '#eadb93', 1 / z);
        strokeLine(c, px, py - 2 / z, px, py + 2 / z, '#eadb93', 1 / z);
      }
    }
    if (s.fear > 0) {
      c.globalAlpha = .7; c.setLineDash([3 / z, 3 / z]);
      circle(c, unit.x, unit.y, radius * 1.32, '#cbb6ed', .85 / z); c.setLineDash([]); c.globalAlpha = 1;
    }
  }

  _projectile(c, p, time, bounds, level) {
    if (p.alive === false || !visible(p.x, p.y, 70, bounds)) return;
    const z = this.camera.zoom, color = TEAM_COLORS[p.team] ?? PAPER;
    const kind = p.kind ?? 'bullet';
    const speed = Math.hypot(p.vx ?? 0, p.vy ?? 0);
    const angle = speed > .01 ? Math.atan2(p.vy, p.vx) : p.angle ?? 0;
    c.save(); c.translate(p.x, p.y); c.rotate(angle);
    c.lineCap = 'round';
    if (kind === 'arrow') {
      strokeLine(c, -16, 0, 4, 0, '#e5d4ae', Math.max(1.1, .9 / z));
      c.beginPath(); c.moveTo(6, 0); c.lineTo(0, -2.5); c.lineTo(0, 2.5); c.closePath(); c.fillStyle = PAPER; c.fill();
      if (level !== 'low') { strokeLine(c, -15, -2, -11, 0, color, 1); strokeLine(c, -15, 2, -11, 0, color, 1); }
    } else if (kind === 'bullet' || kind === 'sniper' || kind === 'pellet') {
      c.globalAlpha = .75;
      strokeLine(c, kind === 'sniper' ? -37 : kind === 'pellet' ? -7 : -15, 0, 2, 0, kind === 'sniper' ? '#f4e9ce' : '#efce92', Math.max(kind === 'sniper' ? 1.7 : 1.05, .85 / z));
      c.globalAlpha = 1; dot(c, 1, 0, Math.max(.9 / z, 1.2), PAPER);
    } else if (['rocket', 'missile', 'shell'].includes(kind)) {
      const r = Math.max(3.2, p.radius || 3.5);
      if (level !== 'low') {
        c.globalAlpha = .18; strokeLine(c, -26, 0, -4, 0, '#edb47b', r * 1.3);
        c.globalAlpha = .65; strokeLine(c, -15, 0, -5, 0, '#ffe3a7', r * .5); c.globalAlpha = 1;
      }
      if (kind === 'shell') dot(c, 0, 0, r, '#f1dcaf');
      else { c.fillStyle = color; c.beginPath(); c.moveTo(r * 2, 0); c.lineTo(-r, -r); c.lineTo(-r, r); c.closePath(); c.fill(); dot(c, -r, 0, r * .48, '#ffdc96'); }
    } else if (kind === 'fireball') {
      const r = Math.max(4, p.radius ?? 5);
      c.globalAlpha = .24; strokeLine(c, -r * 3.7, 0, -r * .2, 0, '#ff9f62', r * 1.5); c.globalAlpha = 1;
      dot(c, 0, 0, r, '#ffaf69'); dot(c, r * .2, 0, r * .45, '#fff0bc');
    } else if (kind === 'ice') {
      const r = Math.max(4, p.radius ?? 4);
      c.fillStyle = '#afeef3'; c.beginPath(); c.moveTo(r * 1.5, 0); c.lineTo(0, -r); c.lineTo(-r * 1.5, 0); c.lineTo(0, r); c.closePath(); c.fill();
      if (level !== 'low') strokeLine(c, -r * 3, 0, -r * 1.7, 0, '#8fd4e4', 1.2);
    } else if (kind === 'boomerang') {
      c.rotate(time * 16 + p.id);
      c.beginPath(); c.moveTo(-6, -6); c.lineTo(2, 0); c.lineTo(-6, 6); c.strokeStyle = '#f3d4a4'; c.lineWidth = 3; c.stroke();
    } else if (kind === 'card') {
      c.rotate(time * 12 + p.id); c.fillStyle = '#f0d3e5'; c.fillRect(-4, -6, 8, 12);
      c.fillStyle = color; c.fillRect(-1.5, -2, 3, 4);
    } else {
      const accent = kind === 'spirit' || kind === 'gravity_bolt' ? '#d7b6f8' : '#b7f3de';
      const r = Math.max(2.3 / z, p.radius ?? 3);
      c.globalAlpha = .28; strokeLine(c, -18, 0, 0, 0, accent, r * 1.3); c.globalAlpha = 1;
      dot(c, 0, 0, r * .68, accent); dot(c, 1, 0, r * .26, PAPER);
    }
    c.restore(); this.metrics.drawnProjectiles++;
  }

  _effect(c, effect, level) {
    const age = Math.max(0, effect.age ?? 0), duration = Math.max(.001, effect.duration ?? .3);
    const progress = Math.min(1, age / duration), fade = 1 - progress;
    if (fade <= 0) return;
    const r = Math.max(2, effect.radius ?? 20), z = this.camera.zoom;
    const color = TEAM_COLORS[effect.team] ?? '#d7c9a9';
    const angle = effect.angle ?? 0;
    c.save(); c.translate(effect.x, effect.y);
    c.globalAlpha = fade;
    switch (effect.kind) {
      case 'laser': {
        const x2 = (effect.x2 ?? effect.x + Math.cos(angle) * r) - effect.x;
        const y2 = (effect.y2 ?? effect.y + Math.sin(angle) * r) - effect.y;
        c.globalAlpha = fade * .2; strokeLine(c, 0, 0, x2, y2, color, 5 / z);
        c.globalAlpha = fade * .95; strokeLine(c, 0, 0, x2, y2, '#caffea', 1.2 / z);
        dot(c, x2, y2, 2.2 / z, PAPER);
        break;
      }
      case 'slash':
        c.rotate(angle); c.strokeStyle = PAPER; c.lineWidth = Math.max(1.1 / z, 2.7 * fade);
        c.beginPath(); c.arc(0, 0, r * (.65 + progress * .3), -.95 + progress * .4, .9 + progress * .2); c.stroke();
        c.globalAlpha = fade * .23; c.lineWidth = 4 / z; c.stroke();
        break;
      case 'stab':
        c.rotate(angle); strokeLine(c, r * progress * .45, 0, r * (.6 + progress * .4), 0, PAPER, 1.4 / z);
        break;
      case 'muzzle':
        c.rotate(angle); c.beginPath(); c.moveTo(0, -r * .4); c.lineTo(r * 1.4 * fade, 0); c.lineTo(0, r * .4); c.closePath(); c.fillStyle = '#ffe4a4'; c.fill();
        break;
      case 'explosion': {
        const size = r * Math.sqrt(progress);
        if (progress < .3) { c.globalAlpha = (.3 - progress) * .42; dot(c, 0, 0, Math.max(2, size), '#ffdda0'); }
        c.globalAlpha = fade * .65; circle(c, 0, 0, size, '#e8c89b', Math.max(1.05 / z, 2.9 * fade));
        c.globalAlpha = fade * .35; circle(c, 0, 0, size * .71, color, 1.2 / z);
        if (level !== 'low') {
          const sparks = level === 'high' ? 10 : 6;
          c.globalAlpha = fade * .85;
          for (let i = 0; i < sparks; i++) {
            const a = i * TAU / sparks + effect.id * 2.39;
            const distance = size * (.72 + ((effect.id + i * 17) % 10) * .024);
            strokeLine(c, Math.cos(a) * distance, Math.sin(a) * distance, Math.cos(a) * (distance + 6 * fade), Math.sin(a) * (distance + 6 * fade), i % 3 ? '#ffd69c' : color, 1.2 / z);
          }
        }
        break;
      }
      case 'shockwave': case 'roar': {
        const size = r * (.15 + progress * .85);
        c.globalAlpha = fade * .72;
        if (effect.kind === 'roar') c.setLineDash([10 / z, 9 / z]);
        circle(c, 0, 0, size, effect.kind === 'roar' ? '#decaac' : '#e3dda8', 1.6 / z);
        c.setLineDash([]); c.globalAlpha = fade * .23;
        circle(c, 0, 0, size * .77, color, 1 / z);
        break;
      }
      case 'heal': {
        c.globalAlpha = fade * .42; circle(c, 0, 0, r * (.45 + progress * .55), '#c4f3a5', 1.2 / z);
        if (valid(effect.x2) && valid(effect.y2)) {
          c.setLineDash([3 / z, 8 / z]); strokeLine(c, 0, 0, effect.x2 - effect.x, effect.y2 - effect.y, '#c4f3a5', 1 / z); c.setLineDash([]);
        }
        c.globalAlpha = fade * .83;
        const rise = -progress * 18, half = 3 / z;
        strokeLine(c, -half, rise, half, rise, '#c4f3a5', 1.5 / z);
        strokeLine(c, 0, rise - half, 0, rise + half, '#c4f3a5', 1.5 / z);
        break;
      }
      case 'fire': {
        c.rotate(angle);
        const count = level === 'high' ? 9 : level === 'medium' ? 6 : 3;
        for (let i = 0; i < count; i++) {
          const travel = (progress + i / count) % 1;
          const a = (i % 3 - 1) * .2;
          const dist = r * (.15 + travel * .85);
          c.globalAlpha = (1 - travel) * fade * .64;
          strokeLine(c, Math.cos(a) * dist, Math.sin(a) * dist, Math.cos(a) * (dist + r * .12), Math.sin(a) * (dist + r * .12), i % 3 === 0 ? '#ffd9a0' : '#fba376', Math.max(1.5 / z, r * .025 * (1 + travel)));
        }
        break;
      }
      case 'ice':
        c.globalAlpha = fade * .8;
        for (let i = 0; i < 6; i++) {
          const a = i * TAU / 6 + .3;
          strokeLine(c, Math.cos(a) * r * progress * .45, Math.sin(a) * r * progress * .45, Math.cos(a) * r * (.3 + progress * .7), Math.sin(a) * r * (.3 + progress * .7), '#a7e9eb', 1 / z);
        }
        break;
      case 'gravity': {
        c.globalAlpha = fade * .28; circle(c, 0, 0, r, '#c2ace8', .8 / z);
        const size = r * (1 - progress * .8);
        c.globalAlpha = fade * .65;
        for (let i = 0; i < (level === 'low' ? 3 : 6); i++) {
          const a = angle + progress * 4 + i * Math.PI / 3;
          c.beginPath(); c.arc(0, 0, Math.max(2, size - i * 2), a, a + .53); c.strokeStyle = '#c9b2f0'; c.lineWidth = 1.05 / z; c.stroke();
        }
        if (valid(effect.x2) && valid(effect.y2)) strokeLine(c, 0, 0, effect.x2 - effect.x, effect.y2 - effect.y, '#c9b2f0', 1 / z);
        break;
      }
      case 'blink':
        c.globalAlpha = fade * .65;
        if (valid(effect.x2) && valid(effect.y2)) { c.setLineDash([7 / z, 11 / z]); strokeLine(c, 0, 0, effect.x2 - effect.x, effect.y2 - effect.y, '#d8baff', 1 / z); c.setLineDash([]); }
        c.rotate(progress); c.strokeStyle = '#d8baff'; c.lineWidth = 1 / z;
        c.strokeRect(-r * fade, -r * fade, r * fade * 2, r * fade * 2);
        break;
      case 'summon':
        c.globalAlpha = fade * .7; c.rotate(-progress * 1.8); c.strokeStyle = '#cfb3ed'; c.lineWidth = 1 / z;
        c.beginPath();
        for (let i = 0; i <= 6; i++) { const a = i * TAU / 6; const x = Math.cos(a) * r * (.6 + progress * .4), y = Math.sin(a) * r * (.6 + progress * .4); if (!i) c.moveTo(x, y); else c.lineTo(x, y); }
        c.stroke();
        break;
      case 'death':
        c.globalAlpha = fade * .55;
        for (let i = 0; i < 4; i++) {
          const a = angle + i * TAU / 4;
          const dist = r * (.5 + progress * 1.15);
          strokeLine(c, Math.cos(a) * dist, Math.sin(a) * dist, Math.cos(a) * (dist + 4 * fade), Math.sin(a) * (dist + 4 * fade), color, 1.25 / z);
        }
        break;
      case 'charge':
        c.rotate(angle); c.globalAlpha = fade * .5;
        for (const sign of [-1, 1]) strokeLine(c, -r * (.8 + progress), sign * r * .64, r * .13, sign * r * .64, color, 1 / z);
        break;
      case 'impact': default:
        c.rotate(angle + progress * .3); c.globalAlpha = fade * .8;
        for (let i = 0; i < 4; i++) { const a = i * TAU / 4; const distance = r * (.2 + progress * .5); strokeLine(c, Math.cos(a) * distance * .35, Math.sin(a) * distance * .35, Math.cos(a) * distance, Math.sin(a) * distance, PAPER, 1 / z); }
    }
    c.restore();
  }

  _selection(c, rect) {
    const x1 = rect.x1 ?? rect.start?.x ?? rect.x ?? 0;
    const y1 = rect.y1 ?? rect.start?.y ?? rect.y ?? 0;
    const x2 = rect.x2 ?? rect.end?.x ?? x1 + (rect.width ?? rect.w ?? 0);
    const y2 = rect.y2 ?? rect.end?.y ?? y1 + (rect.height ?? rect.h ?? 0);
    const x = Math.min(x1, x2), y = Math.min(y1, y2), width = Math.abs(x2 - x1), height = Math.abs(y2 - y1);
    c.fillStyle = 'rgba(211,238,137,0.08)'; c.fillRect(x, y, width, height);
    c.strokeStyle = '#d3ee89'; c.lineWidth = 1 / this.camera.zoom; c.setLineDash([5 / this.camera.zoom, 4 / this.camera.zoom]);
    c.strokeRect(x, y, width, height); c.setLineDash([]);
  }
}

/** Draw a crisp, transparent menu icon; no sprite sheet or external image dependency. */
export function drawUnitIcon(canvas, type, team = 'red') {
  const def = typeof type === 'string' ? UNIT_MAP[type] ?? SUMMON_DEFS[type] : type;
  if (!def || !canvas) return;
  const bounds = canvas.getBoundingClientRect();
  const width = bounds.width || Number(canvas.getAttribute('width')) || 42;
  const height = bounds.height || Number(canvas.getAttribute('height')) || 42;
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  const c = canvas.getContext('2d', { willReadFrequently: true });
  if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, width, height);
  c.save(); c.translate(width * .45, height * .55); c.rotate(-.57);
  const scale = Math.min(width, height) / (def.id === 'pikeman' ? 5.1 : 4.1);
  c.scale(scale, scale); paintUnit(c, { id: 0, type: def.id, team, angle: -.57 }, def, 0, true); c.restore();
}
