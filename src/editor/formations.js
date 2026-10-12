import { MAX_UNITS, UNIT_LIST, UNIT_MAP, WORLD } from '../data/units.js';
import { PlacementIndex, defaultAngle, validatePlacement } from './placement.js';

/** This PRNG is dedicated to deployment generation, never simulation state. */
function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A compact 40-versus-40 mixed-arms encounter, readable at mobile fit zoom. */
export function createDefaultFormation() {
  const units = [];
  const add = (type, team, x, y) => units.push({ id: units.length + 1, type, team, x, y, angle: defaultAngle(team) });
  add('giant', 'red', 980, 675);
  for (const y of [410, 500, 590, 760, 850, 940]) add('shield_guard', 'red', 940, y);
  for (const x of [850, 790]) for (let row = 0; row < 6; row++) add('swordsman', 'red', x, 460 + row * 86);
  for (const x of [650, 710]) for (let row = 0; row < 6; row++) add('archer', 'red', x, 460 + row * 86);
  for (const y of [350, 980]) for (const x of [700, 785, 870]) add('cavalry', 'red', x, y);
  for (const y of [560, 790]) add('tank', 'red', 600, y);
  add('healer', 'red', 570, 675);
  const opposingTypes = { giant: 'mech', swordsman: 'pikeman', archer: 'rifleman', cavalry: 'wolf' };
  for (const source of [...units]) add(opposingTypes[source.type] || source.type, 'blue', WORLD.width - source.x, source.y);
  return { schemaVersion: 1, seed: 314159, units };
}

export const RANDOM_SIZES = Object.freeze({ small: 20, normal: 80, large: 300, chaos: 600 });

/**
 * Generate exact counts without hidden drops. Large bodies are packed first,
 * then small bodies fill the gaps; every team has a guaranteed attacker. Random
 * sampling and the deterministic fallback both use the shared legality test.
 */
export function generateRandomFormation(seed, size = 'normal') {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('随机种子必须是 uint32 整数。');
  if (!Object.hasOwn(RANDOM_SIZES, size)) throw new RangeError('随机规模必须是 small、normal、large 或 chaos。');
  const total = Math.min(MAX_UNITS, RANDOM_SIZES[size]);
  const random = generator(seed);
  const attackers = UNIT_LIST.filter(unit => unit.attackKind !== 'heal' && unit.attackKind !== 'none' && unit.damage > 0);
  const units = [];
  const index = new PlacementIndex();
  for (const team of ['red', 'blue']) {
    const count = team === 'red' ? Math.ceil(total / 2) : Math.floor(total / 2);
    const types = Array.from({ length: count }, (_, i) => i === 0
      ? attackers[Math.floor(random() * attackers.length)]
      : UNIT_LIST[Math.floor(random() * UNIT_LIST.length)]);
    // Stable sorting also makes the random generator independent of entity IDs.
    types.sort((a, b) => b.radius - a.radius);
    const left = total >= 300 ? 75 : 560;
    const right = 1115;
    const top = total >= 300 ? 65 : 195;
    const bottom = total >= 300 ? WORLD.height - 65 : WORLD.height - 195;
    for (const definition of types) {
      let placed = null;
      for (let attempt = 0; attempt < 1800; attempt++) {
        const localX = left + random() * (right - left);
        const candidate = { id: units.length + 1, type: definition.id, team,
          x: team === 'red' ? localX : WORLD.width - localX,
          y: top + random() * (bottom - top), angle: defaultAngle(team) };
        if (validatePlacement(index, candidate).ok) { placed = candidate; break; }
      }
      if (!placed) {
        // Deterministic, fine-grained search uses the whole team half if a very
        // unusual seed densely packs the preferred region.
        const step = Math.max(7, definition.radius / 2);
        search: for (let y = definition.radius + 4; y <= WORLD.height - definition.radius - 4; y += step) {
          for (let x = definition.radius + 4; x < WORLD.width / 2 - definition.radius - 4; x += step) {
            const candidate = { id: units.length + 1, type: definition.id, team,
              x: team === 'red' ? x : WORLD.width - x, y, angle: defaultAngle(team) };
            if (validatePlacement(index, candidate).ok) { placed = candidate; break search; }
          }
        }
      }
      if (!placed) throw new Error(`无法完整部署 ${size} 随机军队；现有布阵保持不变。`);
      index.add(placed); units.push(placed);
    }
  }
  return { schemaVersion: 1, seed, units };
}
