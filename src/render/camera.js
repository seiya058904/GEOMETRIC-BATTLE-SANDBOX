import { WORLD } from '../data/units.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Coordinates are world units; pointer coordinates and pan deltas are local CSS pixels. */
export class Camera {
  constructor(width = 1, height = 1) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.x = WORLD.width / 2;
    this.y = WORLD.height / 2;
    this.zoom = 1;
    this.fitZoom = 1;
    this.minZoom = 0.07;
    this.maxZoom = 4;
    this._fitted = true;
    this.reset();
  }

  resize(width, height) {
    const previousFit = this.fitZoom;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.fitZoom = Math.max(0.04, Math.min((this.width - 28) / WORLD.width, (this.height - 28) / WORLD.height));
    if (this._fitted) this.zoom = this.fitZoom;
    else if (previousFit > 0) this.zoom = clamp(this.zoom * this.fitZoom / previousFit, this.minZoom, this.maxZoom);
    this._clampCenter();
  }

  screenToWorld(x, y) {
    return { x: (x - this.width / 2) / this.zoom + this.x, y: (y - this.height / 2) / this.zoom + this.y };
  }

  worldToScreen(x, y) {
    return { x: (x - this.x) * this.zoom + this.width / 2, y: (y - this.y) * this.zoom + this.height / 2 };
  }

  pan(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this._fitted = false;
    this._clampCenter();
  }

  zoomAt(x, y, factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const anchor = this.screenToWorld(x, y);
    this.zoom = clamp(this.zoom * factor, Math.min(this.minZoom, this.fitZoom * 0.7), this.maxZoom);
    this.x = anchor.x - (x - this.width / 2) / this.zoom;
    this.y = anchor.y - (y - this.height / 2) / this.zoom;
    this._fitted = false;
    this._clampCenter();
  }

  reset() {
    this.x = WORLD.width / 2;
    this.y = WORLD.height / 2;
    this.fitZoom = Math.max(0.04, Math.min((this.width - 28) / WORLD.width, (this.height - 28) / WORLD.height));
    this.zoom = this.fitZoom;
    this._fitted = true;
  }

  fit(units) {
    const live = units?.filter(unit => unit.alive !== false && Number.isFinite(unit.x) && Number.isFinite(unit.y));
    if (!live?.length) { this.reset(); return; }
    let left = WORLD.width, right = 0, top = WORLD.height, bottom = 0;
    for (const unit of live) {
      const padding = (unit.radius ?? unit.def?.radius ?? 20) * 2 + 64;
      left = Math.min(left, unit.x - padding);
      right = Math.max(right, unit.x + padding);
      top = Math.min(top, unit.y - padding);
      bottom = Math.max(bottom, unit.y + padding);
    }
    this.x = (left + right) / 2;
    this.y = (top + bottom) / 2;
    this.zoom = clamp(Math.min((this.width - 44) / Math.max(300, right - left), (this.height - 44) / Math.max(220, bottom - top)), 0.04, 1.7);
    this._fitted = false;
    this._clampCenter();
  }

  _clampCenter() {
    const horizontal = Math.max(40, this.width / this.zoom * 0.32);
    const vertical = Math.max(40, this.height / this.zoom * 0.32);
    this.x = clamp(this.x, -horizontal, WORLD.width + horizontal);
    this.y = clamp(this.y, -vertical, WORLD.height + vertical);
  }

  get bounds() {
    return { left: this.x - this.width / this.zoom / 2, right: this.x + this.width / this.zoom / 2, top: this.y - this.height / this.zoom / 2, bottom: this.y + this.height / this.zoom / 2 };
  }
}
