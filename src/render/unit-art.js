/** Every soldier is drawn from geometry. The same drawing is used in the catalogue and battlefield. */
export const TEAM_COLORS = Object.freeze({ red: '#ff705d', blue: '#59b7fa', neutral: '#d6dfd1' });
const INK = '#142329';
const PAPER = '#edf0e6';
const TAU = Math.PI * 2;

function circle(c, x, y, r, fill, stroke = null, width = .08) {
  c.beginPath(); c.arc(x, y, r, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function ellipse(c, x, y, rx, ry, fill, stroke = null, width = .08) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function line(c, x, y, x2, y2, color, width = .1) {
  c.strokeStyle = color; c.lineWidth = width;
  c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
}
function polygon(c, points, fill, stroke = null, width = .08) {
  c.beginPath(); c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function rect(c, x, y, w, h, fill, stroke = null, width = .08) {
  if (fill) { c.fillStyle = fill; c.fillRect(x, y, w, h); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.strokeRect(x, y, w, h); }
}
function cross(c, x, y, radius, color, width = .18) {
  line(c, x - radius, y, x + radius, y, color, width);
  line(c, x, y - radius, x, y + radius, color, width);
}
function arc(c, x, y, r, start, end, color, width = .1) {
  c.strokeStyle = color; c.lineWidth = width;
  c.beginPath(); c.arc(x, y, r, start, end); c.stroke();
}
function blade(c, x, y, angle, length, color, weight = .14) {
  c.save(); c.translate(x, y); c.rotate(angle);
  line(c, -.25, 0, .18, 0, INK, .19);
  polygon(c, [.1, -weight / 2, length - .18, -weight / 2, length, 0, length - .18, weight / 2, .1, weight / 2], color, INK, .025);
  line(c, .12, -.25, .12, .25, INK, .13);
  c.restore();
}
function humanoid(c, color, gait, detail) {
  if (detail) {
    ellipse(c, -.22 + gait, -.72, .24, .17, color, INK, .05);
    ellipse(c, -.22 - gait, .72, .24, .17, color, INK, .05);
  }
  circle(c, 0, 0, .77, color, INK, .07);
}
function animalLegs(c, color, gait, scale = 1) {
  for (const sign of [-1, 1]) {
    line(c, -.52, sign * .4, -.64 + sign * gait, sign * .89 * scale, color, .24);
    line(c, .53, sign * .4, .39 - sign * gait, sign * .84 * scale, color, .23);
  }
}
function gun(c, length, recoil, color, type = 'rifle') {
  c.save(); c.translate(.32 - recoil, .58);
  rect(c, -.16, -.17, type === 'rocket' ? .95 : .85, .32, color, INK, .06);
  line(c, .58, 0, length, 0, type === 'laser' ? '#b9fff0' : PAPER, type === 'sniper' ? .1 : .14);
  if (type === 'rocket') {
    rect(c, -.4, -.27, 1.2, .54, color, INK, .09);
    polygon(c, [.8, -.25, 1.16, 0, .8, .25], PAPER);
    rect(c, -.44, -.33, .18, .66, INK);
  } else if (type === 'shotgun') {
    line(c, .58, -.1, length, -.1, PAPER, .11);
  } else if (type === 'sniper') {
    rect(c, .2, -.3, .47, .12, INK);
  } else if (type === 'machine') {
    rect(c, .2, .1, .46, .3, INK);
    line(c, length - .2, -.2, length - .2, .2, color, .08);
  } else if (type === 'laser') {
    for (let i = 0; i < 3; i++) line(c, .25 + i * .19, -.22, .25 + i * .19, .22, INK, .065);
  }
  c.restore();
}

/** Called inside a translated, rotated, radius-scaled context. Faces +X. */
export function paintUnit(c, unit, def, time, detail = true) {
  const id = def.id;
  const color = unit.hitFlash > 0 ? PAPER : TEAM_COLORS[unit.team] ?? TEAM_COLORS.red;
  const accent = def.accent ?? PAPER;
  const phase = Math.max(0, Math.min(1, unit.attackPhase ?? 0));
  const swing = Math.sin(phase * Math.PI);
  const moving = Math.min(1, Math.hypot(unit.vx ?? 0, unit.vy ?? 0) / Math.max(1, def.speed));
  const gait = detail ? Math.sin(time * 15 + (unit.id ?? 0) * 1.8) * moving * .14 : 0;
  c.lineCap = 'round'; c.lineJoin = 'round';

  switch (id) {
    case 'peasant':
      humanoid(c, color, gait, detail);
      c.save(); c.translate(.5, .61); c.rotate(-.55 + swing * 1.5);
      line(c, -.05, 0, 1.07, 0, accent, .22);
      ellipse(c, 1.1, 0, .25, .18, accent, INK, .035);
      c.restore();
      break;
    case 'swordsman':
      humanoid(c, color, gait, detail);
      blade(c, .42, .68, -.65 + swing * 1.95, 1.39, accent, .2);
      line(c, .12, -.68, .5, -.71, color, .25);
      break;
    case 'shield_guard':
      humanoid(c, color, gait, detail);
      blade(c, .38, .68, -.3 + swing, .86, accent);
      polygon(c, [.77 + swing * .12, -.78, 1.13 + swing * .12, -.6, 1.13 + swing * .12, .52, .77 + swing * .12, .74, .67 + swing * .12, .4, .67 + swing * .12, -.48], color, PAPER, .085);
      line(c, .94 + swing * .12, -.48, .94 + swing * .12, .42, INK, .08);
      break;
    case 'pikeman':
      humanoid(c, color, gait, detail);
      line(c, -.75 + swing * .55, .56, 2.58 + swing * .55, .56, accent, .1);
      polygon(c, [2.42 + swing * .55, .34, 3.08 + swing * .55, .56, 2.42 + swing * .55, .78], PAPER, INK, .04);
      circle(c, .67, .55, .16, color);
      break;
    case 'archer':
      humanoid(c, color, gait, detail);
      arc(c, .56, 0, .99, -Math.PI / 2, Math.PI / 2, accent, .1);
      line(c, .56, -.99, .41 - phase * .35, 0, PAPER, .045);
      line(c, .41 - phase * .35, 0, .56, .99, PAPER, .045);
      line(c, .25 - phase * .35, 0, 1.72, 0, PAPER, .06);
      polygon(c, [1.65, -.12, 1.98, 0, 1.65, .12], accent);
      break;
    case 'cavalry':
      animalLegs(c, color, gait, .85);
      ellipse(c, -.05, 0, 1.14, .57, color, INK, .075);
      polygon(c, [-1.04, -.18, -1.62, 0, -1.06, .18], color, INK, .06);
      ellipse(c, 1.01, 0, .48, .33, color, INK, .055);
      polygon(c, [.88, -.2, .78, -.57, 1.08, -.35], color, INK, .05);
      circle(c, -.12, 0, .45, accent, INK, .08);
      line(c, -.32, .48, 2.07 + swing * .3, .48, accent, .085);
      polygon(c, [1.96 + swing * .3, .31, 2.47 + swing * .3, .48, 1.96 + swing * .3, .65], PAPER);
      break;
    case 'rifleman': case 'shotgunner': case 'machine_gunner': case 'sniper': case 'rocketeer': case 'laser_trooper': {
      humanoid(c, color, gait, detail);
      const types = { rifleman: 'rifle', shotgunner: 'shotgun', machine_gunner: 'machine', sniper: 'sniper', rocketeer: 'rocket', laser_trooper: 'laser' };
      gun(c, id === 'sniper' ? 2.65 : id === 'machine_gunner' ? 2.15 : id === 'laser_trooper' ? 2.08 : 1.74, swing * .18, accent, types[id]);
      if (detail && id !== 'laser_trooper') arc(c, -.02, 0, .66, Math.PI * .56, Math.PI * 1.45, INK, .1);
      if (id === 'laser_trooper') line(c, .25, -.47, .25, .12, accent, .14);
      break;
    }
    case 'tank': {
      rect(c, -1.05, -.76, 2.15, 1.52, color, INK, .08);
      for (const sign of [-1, 1]) {
        rect(c, -1.14, sign * .82 - .15, 2.22, .3, INK, color, .045);
        if (detail) for (let i = 0; i < 7; i++) line(c, -.98 + i * .3 + gait * .2, sign * .82 - .1, -.98 + i * .3 + gait * .2, sign * .82 + .1, color, .045);
      }
      c.save(); c.rotate((unit.turretAngle ?? unit.angle ?? 0) - (unit.angle ?? 0));
      rect(c, .2 - swing * .15, -.13, 1.63, .26, accent, INK, .075);
      rect(c, 1.64 - swing * .15, -.18, .26, .36, INK, color, .06);
      circle(c, -.1, 0, .53, color, INK, .09);
      rect(c, -.23, -.17, .33, .34, INK);
      c.restore();
      break;
    }
    case 'fire_mage': case 'frost_mage': case 'healer': case 'necromancer': {
      polygon(c, [-1.02, -.78, .58, -.42, .82, 0, .58, .42, -1.02, .78], color, INK, .075);
      circle(c, .15, 0, .53, color, INK, .08);
      line(c, -.49, .84, 1.33, .84, accent, .095);
      const ox = 1.3 + swing * .12;
      if (id === 'fire_mage') polygon(c, [ox - .28, .84, ox, .27, ox + .27, .75, ox + .14, 1.13, ox - .12, 1.13], accent, INK, .055);
      else if (id === 'frost_mage') {
        for (let i = 0; i < 3; i++) { c.save(); c.translate(ox, .84); c.rotate(i * Math.PI / 3); line(c, -.38, 0, .38, 0, accent, .07); c.restore(); }
        circle(c, ox, .84, .1, PAPER);
      } else if (id === 'healer') {
        circle(c, ox, .84, .4, INK, accent, .06); cross(c, ox, .84, .23, accent, .13);
        cross(c, .1, 0, .2, accent, .11);
      } else {
        circle(c, ox, .84, .32, accent, INK, .05);
        circle(c, ox - .1, .8, .075, INK); circle(c, ox + .11, .8, .075, INK);
        rect(c, ox - .15, 1.03, .3, .13, accent);
      }
      break;
    }
    case 'giant':
      circle(c, -.05, 0, .83, color, INK, .07);
      circle(c, .15 - swing * .13, -.87, .31, color, INK, .06);
      circle(c, .23 + swing * .24, .83, .32, color, INK, .06);
      c.save(); c.translate(.21, .88); c.rotate(-.66 + swing * 1.95);
      line(c, 0, 0, 1.21, 0, accent, .16);
      rect(c, .9, -.39, .56, .78, accent, INK, .075);
      c.restore();
      arc(c, -.06, 0, .53, Math.PI * .6, Math.PI * 1.4, INK, .12);
      break;
    case 'dragon': {
      const flap = detail ? Math.sin(time * 5 + (unit.id ?? 0)) * .1 : 0;
      polygon(c, [-.55, -.2, -1.84, 0, -.55, .2], color, INK, .07);
      for (const sign of [-1, 1]) {
        polygon(c, [-.47, sign * .15, -.84, sign * (1.65 + flap), .34, sign * .73, .87, sign * .16], color, INK, .075);
        line(c, -.47, sign * .15, .34, sign * .73, INK, .05);
        line(c, -.84, sign * (1.65 + flap), -.12, sign * .6, INK, .045);
      }
      ellipse(c, 0, 0, .93, .34, color, INK, .08);
      polygon(c, [.6, -.25, 1.15 + swing * .15, -.25, 1.55 + swing * .15, 0, 1.15 + swing * .15, .25, .6, .25], color, INK, .06);
      circle(c, 1.09 + swing * .15, -.11, .055, INK);
      polygon(c, [.63, -.2, .57, -.49, .91, -.25], accent, INK, .035);
      break;
    }
    case 'wolf':
      animalLegs(c, color, gait);
      ellipse(c, -.12, 0, .96, .53, color, INK, .07);
      polygon(c, [-.79, -.23, -1.48, -.45, -1.13, .1, -.73, .25], color, INK, .06);
      polygon(c, [.48, -.42, .72, -.8, .98, -.36, 1.51 + swing * .16, 0, .98, .36, .72, .8, .48, .42], color, INK, .06);
      line(c, 1.1, -.1, 1.1, .1, INK, .1);
      break;
    case 'raptor':
      polygon(c, [-.4, -.25, -1.82, -.36, -.73, .19, -.36, .41, .6, .22, 1.37 + swing * .17, 0, .62, -.38], color, INK, .075);
      line(c, -.3, -.25, -.79 + gait, -.99, color, .23);
      line(c, -.3, .25, -.69 - gait, 1, color, .23);
      line(c, .48, -.25, .3, -.6, accent, .08);
      line(c, .48, .25, .3, .6, accent, .08);
      circle(c, .89, -.13, .07, INK);
      break;
    case 'rhino':
      animalLegs(c, color, gait, .78);
      ellipse(c, -.16, 0, 1.01, .72, color, INK, .075);
      ellipse(c, .84, 0, .51, .51, color, INK, .075);
      polygon(c, [1.11, -.24, 1.8 + swing * .14, 0, 1.11, .24], accent, INK, .06);
      line(c, .43, -.39, .44, .39, INK, .065);
      break;
    case 'gorilla':
      ellipse(c, -.22, 0, .73, .72, color, INK, .07);
      for (const sign of [-1, 1]) circle(c, .38 + (unit.hand === (sign > 0 ? 1 : 0) ? swing * .5 : swing * .08), sign * .78, .46, color, INK, .07);
      circle(c, .35, 0, .43, color, INK, .065);
      ellipse(c, .6, 0, .16, .26, accent, INK, .06);
      break;
    case 'mammoth':
      animalLegs(c, color, gait, .98);
      ellipse(c, -.08, 0, 1.05, .78, color, INK, .08);
      ellipse(c, .8, 0, .52, .6, color, INK, .065);
      for (const sign of [-1, 1]) {
        c.beginPath(); c.moveTo(.81, sign * .43); c.quadraticCurveTo(1.7 + swing * .13, sign * .85, 1.81 + swing * .13, sign * .08); c.strokeStyle = accent; c.lineWidth = .12; c.stroke();
        ellipse(c, .37, sign * .72, .23, .34, color, INK, .055);
      }
      line(c, .91, 0, 1.57, .09 + swing * .18, color, .23);
      break;
    case 'trex':
      polygon(c, [-.68, -.3, -1.92, -.16, -.7, .31, .24, .51, .9, .27, .9, -.27, .24, -.51], color, INK, .07);
      for (const sign of [-1, 1]) {
        line(c, -.42, sign * .28, -.56 + gait * sign, sign * .91, color, .29);
        line(c, .37, sign * .3, .29, sign * .58, accent, .075);
      }
      polygon(c, [.46, -.43, 1.36 + swing * .2, -.38, 1.56 + swing * .2, -.05, 1.3, .08, .58, .16], color, INK, .075);
      polygon(c, [.61, .16 + swing * .14, 1.36, .16 + swing * .21, 1.17, .44 + swing * .18, .52, .44], color, INK, .07);
      if (detail) for (let i = 0; i < 4; i++) polygon(c, [.8 + i * .16, .06, .87 + i * .16, .18, .93 + i * .16, .06], accent);
      circle(c, .93, -.22, .063, INK);
      break;
    case 'robot':
      rect(c, -.64, -.61, 1.23, 1.22, color, INK, .075);
      for (const sign of [-1, 1]) rect(c, -.09, sign * .85 - .16, .97 - swing * .12, .31, color, INK, .07);
      rect(c, .35, -.32, .18, .64, accent, INK, .04);
      gun(c, 1.5, swing * .1, accent, 'laser');
      break;
    case 'drone':
      for (const signX of [-1, 1]) for (const signY of [-1, 1]) {
        line(c, 0, 0, signX * .82, signY * .82, color, .12);
        circle(c, signX * .82, signY * .82, .36, null, color, .07);
        if (detail) {
          const rot = time * 34 + (unit.id ?? 0);
          line(c, signX * .82 - Math.cos(rot) * .29, signY * .82 - Math.sin(rot) * .29, signX * .82 + Math.cos(rot) * .29, signY * .82 + Math.sin(rot) * .29, accent, .055);
        }
      }
      polygon(c, [-.55, 0, 0, -.48, .73, 0, 0, .48], color, INK, .075);
      line(c, .49, 0, 1.05 - swing * .13, 0, accent, .15);
      break;
    case 'mech':
      polygon(c, [-.82, -.36, -.37, -.77, .46, -.77, .84, 0, .46, .77, -.37, .77, -.82, .36], color, INK, .075);
      for (const sign of [-1, 1]) {
        rect(c, -.22, sign * .83 - .24, .79, .48, color, INK, .07);
        rect(c, .14 - ((unit.hand ?? 0) === (sign > 0 ? 1 : 0) ? swing * .18 : 0), sign * .86 - .11, 1.37, .22, accent, INK, .07);
        rect(c, -.7 + gait * sign, sign * .48 - .1, .55, .2, INK);
      }
      rect(c, .29, -.28, .17, .56, accent, INK, .04);
      break;
    case 'blink_alien':
      polygon(c, [-.94, -.77, 1, 0, -.94, .77, -.5, 0], color, INK, .08);
      ellipse(c, -.06, -.27, .15, .09, INK);
      ellipse(c, -.06, .27, .15, .09, INK);
      blade(c, .44, .61, -.71 + swing * 2, 1.08, accent, .18);
      break;
    case 'ufo':
      ellipse(c, 0, 0, 1.11, .79, color, INK, .075);
      ellipse(c, 0, 0, .61, .5, INK, accent, .06);
      ellipse(c, .07, 0, .4, .33, color, INK, .05);
      if (detail) for (let i = 0; i < 8; i++) {
        const angle = i * TAU / 8 + time * .3;
        circle(c, Math.cos(angle) * .87, Math.sin(angle) * .6, .075, accent);
      }
      break;
    case 'bomb_chicken':
      line(c, -.27 + gait, .42, -.27 + gait, .91, accent, .085);
      line(c, .15 - gait, .39, .15 - gait, .87, accent, .085);
      polygon(c, [-.61, -.3, -1.21, -.54, -.9, .02, -.54, .2], color, INK, .055);
      ellipse(c, -.17, 0, .66, .57, color, INK, .075);
      circle(c, .63, -.22, .43, color, INK, .06);
      polygon(c, [.98, -.26, 1.45, -.1, .99, .04], accent, INK, .055);
      polygon(c, [.3, -.54, .39, -.91, .55, -.63, .7, -.88, .82, -.58], accent, INK, .04);
      circle(c, .73, -.3, .073, INK);
      circle(c, -.17, .02, .28, INK, accent, .05);
      arc(c, -.34, -.22, .21, -2.9, -.5, accent, .065);
      if (phase > 0) circle(c, -.51, -.33, .13 + swing * .11, PAPER);
      break;
    case 'boxing_kangaroo':
      polygon(c, [-.45, -.16, -1.63, .27, -.62, .43, -.29, .56], color, INK, .06);
      ellipse(c, -.17, 0, .72, .57, color, INK, .07);
      ellipse(c, .55, -.04, .37, .42, color, INK, .065);
      ellipse(c, .21, -.47, .17, .46, color, INK, .06);
      ellipse(c, .6, -.44, .16, .43, color, INK, .06);
      for (const sign of [-1, 1]) {
        const reach = (unit.hand ?? 0) === (sign > 0 ? 1 : 0) ? swing * .47 : 0;
        line(c, -.03, sign * .39, .7 + reach, sign * .74, color, .22);
        circle(c, .76 + reach, sign * .74, .32, accent, INK, .08);
      }
      circle(c, .75, -.12, .067, INK);
      break;
    case 'spring_monster':
      for (const sign of [-1, 1]) {
        c.beginPath(); c.moveTo(-.4, sign * .45);
        for (let i = 0; i < 5; i++) c.lineTo(-.56 - i * (.13 + Math.abs(gait)), sign * .45 + (i % 2 ? .17 : -.17));
        c.strokeStyle = accent; c.lineWidth = .09; c.stroke();
      }
      rect(c, -.55, -.58, 1.15, 1.16, color, INK, .075);
      circle(c, .34, -.29, .08, INK); circle(c, .34, .29, .08, INK);
      line(c, .45 + swing * .35, -.14, .45 + swing * .35, .14, PAPER, .1);
      break;
    case 'boomerang_thrower':
      humanoid(c, color, gait, detail);
      c.save(); c.translate(.85, .56); c.rotate(-.7 + swing * 1.7);
      polygon(c, [-.22, -.48, .13, .07, -.2, .62, .03, .72, .5, .08, .03, -.62], accent, INK, .06);
      c.restore();
      break;
    case 'gravity_orb':
      circle(c, 0, 0, .79, color, INK, .08);
      circle(c, 0, 0, .47, INK, accent, .055);
      circle(c, 0, 0, .18, accent);
      for (let i = 0; i < 3; i++) {
        const a = time * 1.7 + i * TAU / 3;
        arc(c, 0, 0, 1.13, a, a + 1.12, accent, .045);
        circle(c, Math.cos(a) * 1.13, Math.sin(a) * 1.13, .11, color, INK, .025);
      }
      break;
    case 'jester': case 'decoy':
      polygon(c, [-.7, 0, -.07, -.69, .79, 0, -.07, .69], color, INK, .07);
      polygon(c, [-.34, -.55, -.99, -.88, -.72, -.22, -1.1, 0, -.75, .2, -.97, .87, -.34, .55], color, INK, .06);
      circle(c, -.96, -.89, .12, accent); circle(c, -1.11, 0, .12, accent); circle(c, -.95, .88, .12, accent);
      line(c, .16, -.23, .28, -.18, INK, .085); line(c, .16, .23, .28, .18, INK, .085);
      arc(c, .23, 0, .25, -.6, .6, PAPER, .055);
      if (id === 'jester') {
        c.save(); c.translate(.6, .72); c.rotate(.3 + swing);
        rect(c, -.21, -.3, .42, .6, accent, INK, .045);
        polygon(c, [0, -.11, .09, 0, 0, .11, -.09, 0], color); c.restore();
      }
      break;
    case 'skeleton':
      circle(c, .06, 0, .69, accent, INK, .06);
      circle(c, .32, -.24, .16, INK); circle(c, .32, .24, .16, INK);
      rect(c, -.53, -.4, .22, .8, color);
      blade(c, .1, .61, -.6 + swing * 1.7, 1.06, accent, .12);
      line(c, .6, -.09, .6, .09, INK, .07);
      break;
    default:
      humanoid(c, color, gait, detail);
  }

  // A dot for red and a diamond for blue remain distinct when the team hues look similar.
  if (detail && id !== 'skeleton') {
    c.globalAlpha *= .58;
    if (unit.team === 'blue') polygon(c, [-.36, 0, -.23, -.13, -.1, 0, -.23, .13], PAPER);
    else circle(c, -.23, 0, .115, PAPER);
    c.globalAlpha /= .58;
  }
}
