/** Read-only teaching material. Every variant is an ordinary editable v1 army. */
export const EXPERIMENTS = Object.freeze([
  { id: 'shield', title: '盾面与来弹', question: '只改变盾兵的初始朝向，第一轮来弹会怎样？', watch: '用 0.25× 观察首次接敌；盾兵会自主转向，初始朝向不是永久命令。', adjust: '再试一次：改变弓箭手与盾兵的距离。', variants: ['盾面迎敌', '背向迎敌'] },
  { id: 'charge', title: '长枪与冲锋', question: '同样的长枪兵，集中迎击与错开站位有什么区别？', watch: '观察骑兵是否跑出加速距离，以及长枪命中后的制动。', adjust: '再试一次：只移动一排长枪兵，保留人数与种子。', variants: ['集中枪阵', '错开枪阵'] },
  { id: 'blast', title: '密集与分散', question: '面对相同火箭火力，站位间距会改变同时受击的人数吗？', watch: '观察第一次爆炸的覆盖范围；随后对照双方损失与伤害。', adjust: '再试一次：在两种间距之间找一个中间值。', variants: ['密集站位', '分散站位'] },
].map(item => Object.freeze({ ...item, variants: Object.freeze(item.variants) })));

export function experimentFormation(id, variant) {
  if (!EXPERIMENTS.some(item => item.id === id) || ![0, 1].includes(variant)) throw new Error('未知实验预设。');
  const units = [];
  const add = (type, team, x, y, angle = team === 'red' ? 0 : Math.PI) => units.push({ id: units.length + 1, type, team, x, y, angle });
  if (id === 'shield') {
    for (let i = 0; i < 6; i++) add('shield_guard', 'red', 1145, 475 + i * 80, variant ? Math.PI : 0);
    for (let i = 0; i < 6; i++) add('archer', 'blue', 1405, 475 + i * 80);
  } else if (id === 'charge') {
    for (let i = 0; i < 8; i++) add('pikeman', 'red', variant ? 1000 - (i % 2) * 180 : 1000, 465 + i * 60);
    for (let i = 0; i < 4; i++) add('cavalry', 'blue', 1660, 495 + i * 120);
  } else {
    const gap = variant ? 125 : 28;
    for (let i = 0; i < 12; i++) add('swordsman', 'red', 930 - (i % 3) * gap, 675 + (Math.floor(i / 3) - 1.5) * gap);
    for (let i = 0; i < 3; i++) add('rocketeer', 'blue', 1410, 555 + i * 120);
  }
  return { schemaVersion: 1, seed: 20261013, units };
}
