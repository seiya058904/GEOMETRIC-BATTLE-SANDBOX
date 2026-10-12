import { WORLD } from '../data/units.js';

/** Bounded, stable-order spatial hash; buckets are reused across ticks. */
export class SpatialHash {
  constructor(cellSize = 80) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(WORLD.width / cellSize);
    this.rows = Math.ceil(WORLD.height / cellSize);
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
    this.occupied = [];
  }
  rebuild(units) {
    for (const i of this.occupied) this.buckets[i].length = 0;
    this.occupied.length = 0;
    for (const u of units) if (u.alive) this.insert(u);
  }
  insert(u) {
    const col = Math.max(0, Math.min(this.cols - 1, Math.floor(u.x / this.cellSize)));
    const row = Math.max(0, Math.min(this.rows - 1, Math.floor(u.y / this.cellSize)));
    const index = row * this.cols + col, bucket = this.buckets[index];
    if (!bucket.length) this.occupied.push(index);
    bucket.push(u);
  }
  updatePosition(u, oldX, oldY) {
    const index = (x, y) => Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSize))) * this.cols + Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellSize)));
    const oldIndex = index(oldX, oldY), newIndex = index(u.x, u.y);
    if (oldIndex === newIndex) return;
    const oldBucket = this.buckets[oldIndex], position = oldBucket.indexOf(u);
    if (position >= 0) oldBucket.splice(position, 1);
    this.insert(u);
  }
  forEachBox(minX, minY, maxX, maxY, callback) {
    const l = Math.max(0, Math.floor(minX / this.cellSize));
    const r = Math.min(this.cols - 1, Math.floor(maxX / this.cellSize));
    const t = Math.max(0, Math.floor(minY / this.cellSize));
    const b = Math.min(this.rows - 1, Math.floor(maxY / this.cellSize));
    for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) {
      for (const u of this.buckets[y * this.cols + x]) if (u.alive) callback(u);
    }
  }
  forEachCircle(x, y, radius, callback) {
    const rr = radius * radius;
    this.forEachBox(x - radius, y - radius, x + radius, y + radius, u => {
      if ((u.x - x) ** 2 + (u.y - y) ** 2 <= rr) callback(u);
    });
  }
  queryCircle(x, y, radius) { const out = []; this.forEachCircle(x, y, radius, u => out.push(u)); return out; }
  /** Ring expansion finds the true nearest enemy without scanning every entity. */
  nearest(x, y, predicate) {
    const cx = Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellSize)));
    const cy = Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSize)));
    let best = null, bestD = Infinity;
    const considerCell = (col, row) => {
      if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
      for (const u of this.buckets[row * this.cols + col]) {
        if (!u.alive || !predicate(u)) continue;
        const d = (u.x - x) ** 2 + (u.y - y) ** 2;
        if (d < bestD || (d === bestD && u.id < best.id)) { best = u; bestD = d; }
      }
    };
    for (let ring = 0; ring < Math.max(this.cols, this.rows); ring++) {
      if (ring === 0) considerCell(cx, cy);
      else {
        for (let i = -ring; i <= ring; i++) { considerCell(cx + i, cy - ring); considerCell(cx + i, cy + ring); }
        for (let i = -ring + 1; i < ring; i++) { considerCell(cx - ring, cy + i); considerCell(cx + ring, cy + i); }
      }
      // Every not-yet-visited cell lies outside this square. Distance to its edge is a lower bound.
      const edge = Math.min(x - (cx - ring) * this.cellSize, (cx + ring + 1) * this.cellSize - x,
        y - (cy - ring) * this.cellSize, (cy + ring + 1) * this.cellSize - y);
      if (best && bestD <= edge * edge) return best;
    }
    return best;
  }
}
