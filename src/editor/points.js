import { MAX_UNITS, UNIT_MAP } from '../data/units.js';
import { PLACEMENT_GAP, defaultAngle, isUnitType, normalizeAngle } from './placement.js';

// A preview never creates an unbounded array, even with a malformed drag input.
// One extra candidate lets placeMany report reaching the actual capacity.
export const MAX_GENERATED_POINTS = MAX_UNITS + 1;

function options(input) {
  if (!input || !isUnitType(input.type) || !['red', 'blue'].includes(input.team)) return null;
  const minimum = UNIT_MAP[input.type].radius * 2 + PLACEMENT_GAP;
  const spacing = Number.isFinite(input.spacing) ? Math.max(minimum, input.spacing) : minimum + 4;
  const angle = input.angle === undefined ? defaultAngle(input.team) : input.angle;
  if (!Number.isFinite(angle)) return null;
  return { type: input.type, team: input.team, spacing, minimum, angle: normalizeAngle(angle) };
}

/**
 * A count, when supplied, is reduced to the number that fits the real radii.
 * Without count, points start at the drag origin and use uniform spacing.
 * @returns {Array<{type:string,team:string,x:number,y:number,angle:number}>}
 */
export function linePoints(input) {
  const o = options(input);
  if (!o || ![input.x1, input.y1, input.x2, input.y2].every(Number.isFinite)) return [];
  const dx = input.x2 - input.x1, dy = input.y2 - input.y1;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length)) return [];
  let count = Math.min(MAX_GENERATED_POINTS, Math.floor(length / o.spacing) + 1);
  let step = o.spacing;
  if (Number.isFinite(input.count)) {
    count = Math.min(MAX_GENERATED_POINTS, Math.max(1, Math.floor(input.count)), Math.floor(length / o.minimum) + 1);
    step = count > 1 ? length / (count - 1) : 0;
  }
  const points = [];
  for (let i = 0; i < count; i++) {
    const fraction = length ? i * step / length : 0;
    points.push({ type: o.type, team: o.team, x: input.x1 + dx * fraction, y: input.y1 + dy * fraction, angle: o.angle });
  }
  return points;
}

/** Axis-aligned rectangle; negative drags produce the same top-left-first grid. */
export function gridPoints(input) {
  const o = options(input);
  if (!o || ![input.x1, input.y1, input.x2, input.y2].every(Number.isFinite)) return [];
  const left = Math.min(input.x1, input.x2), right = Math.max(input.x1, input.x2);
  const top = Math.min(input.y1, input.y2), bottom = Math.max(input.y1, input.y2);
  const cols = Math.min(MAX_GENERATED_POINTS, Math.floor((right - left) / o.spacing) + 1);
  const rows = Math.min(MAX_GENERATED_POINTS, Math.floor((bottom - top) / o.spacing) + 1);
  const points = [];
  for (let row = 0; row < rows && points.length < MAX_GENERATED_POINTS; row++) {
    for (let col = 0; col < cols && points.length < MAX_GENERATED_POINTS; col++) {
      points.push({ type: o.type, team: o.team, x: left + col * o.spacing, y: top + row * o.spacing, angle: o.angle });
    }
  }
  return points;
}

/**
 * Resample a complete pointer path by arc length, carrying spacing across event
 * boundaries. A fast 600-unit pointer jump receives the same density as a slow
 * drag. Tight turns can overlap; placeMany explicitly reports such skipped points.
 */
export function brushPoints(input) {
  const o = options(input);
  if (!o || !Array.isArray(input.path) || !input.path.length) return [];
  if (!input.path.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return [];
  const first = input.path[0];
  const points = [{ type: o.type, team: o.team, x: first.x, y: first.y, angle: o.angle }];
  let distanceToNext = o.spacing;
  for (let i = 1; i < input.path.length && points.length < MAX_GENERATED_POINTS; i++) {
    const start = input.path[i - 1], end = input.path[i];
    const dx = end.x - start.x, dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (!length) continue;
    if (!Number.isFinite(length)) return [];
    let travelled = distanceToNext;
    while (travelled <= length + 1e-9 && points.length < MAX_GENERATED_POINTS) {
      const fraction = Math.min(1, travelled / length);
      points.push({ type: o.type, team: o.team, x: start.x + dx * fraction, y: start.y + dy * fraction, angle: o.angle });
      travelled += o.spacing;
    }
    distanceToNext = travelled - length;
  }
  return points;
}
