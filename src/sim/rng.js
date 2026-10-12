/** Mulberry32. A seed of zero is valid, and no simulation path uses Math.random. */
export class RNG {
  constructor(seed = 1) { this.state = seed >>> 0; }
  next() {
    let t = this.state = (this.state + 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  between(a, b) { return a + (b - a) * this.next(); }
  int(n) { return Math.floor(this.next() * n); }
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export function turnToward(angle, desired, maxDelta) { return angle + clamp(angleDelta(angle, desired), -maxDelta, maxDelta); }

/** First intersection parameter for a segment against a circle, including initial overlap. */
export function segmentCircle(ax, ay, bx, by, cx, cy, radius) {
  const dx = bx - ax, dy = by - ay, ox = ax - cx, oy = ay - cy;
  const c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a < 1e-10) return null;
  const b = 2 * (ox * dx + oy * dy), disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
