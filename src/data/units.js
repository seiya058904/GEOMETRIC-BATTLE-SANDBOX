/** Battle values use world units and simulation seconds. COST is informational. */
export const WORLD = Object.freeze({ width: 2400, height: 1350 });
export const MAX_UNITS = 1200;
export const FIXED_DT = 1 / 60;
export const CATEGORIES = Object.freeze([
  { id: 'classical', name: '古典', subtitle: '剑与盾' },
  { id: 'modern', name: '现代', subtitle: '火力交锋' },
  { id: 'fantasy', name: '奇幻', subtitle: '法术与巨物' },
  { id: 'beasts', name: '生物', subtitle: '原始力量' },
  { id: 'scifi', name: '科幻', subtitle: '未来战争' },
  { id: 'weird', name: '搞怪', subtitle: '意外实验' },
].map(Object.freeze));

function unit(id, name, category, hp, speed, radius, damage, cooldown, range, armor, cost, mass, role, shape, accent, description, extra = {}) {
  return Object.freeze({ id, name, category, hp, speed, radius, damage, cooldown, range, armor, cost, mass, role, shape, accent, description, skillCooldown: 0, windup: Math.min(0.2, cooldown * 0.23), turnRate: mass > 6 ? 2.9 : 6.4, ...extra });
}

export const UNIT_LIST = Object.freeze([
  unit('peasant', '农民', 'classical', 70, 92, 9, 10, .95, 23, 0, 20, 1, 'melee', 'circle', '#d4bd8e', '轻装短棒。用数量、包围与拥挤实验最朴素的战斗。', { attackKind: 'club' }),
  unit('swordsman', '剑士', 'classical', 140, 96, 11, 20, .85, 31, 8, 65, 1.5, 'melee', 'circle', '#dee8e5', '前方扇形挥剑，可同时斩中相邻敌人。', { attackKind: 'sword' }),
  unit('shield_guard', '盾兵', 'classical', 235, 72, 12, 15, 1.1, 30, 30, 105, 2.8, 'melee', 'circle', '#dbe3e2', '正面 120° 格挡：弹道伤害 ×0.4，近战 ×0.7；背后没有格挡。', { attackKind: 'bash' }),
  unit('pikeman', '长枪兵', 'classical', 115, 78, 10, 19, 1.25, 76, 6, 85, 1.4, 'melee', 'circle', '#ece6d8', '狭窄长枪突刺。迎面刺中高速冲锋者会制动并打断冲锋。', { attackKind: 'pike', windup: .19 }),
  unit('archer', '弓箭手', 'classical', 85, 78, 9, 17, 1.2, 350, 0, 90, 1, 'ranged', 'circle', '#e2c394', '真实飞行箭矢；敌人贴近时有限后撤，随后重新交战。', { attackKind: 'arrow' }),
  unit('cavalry', '骑兵', 'classical', 290, 166, 17, 31, 1.1, 42, 15, 250, 4.5, 'charger', 'oval', '#f0ddba', '跑出加速距离后骑枪冲撞；首次高速触敌才触发额外伤害和击退。', { attackKind: 'lance', skillCooldown: 5.5, skill: '加速冲锋' }),
  unit('rifleman', '步枪兵', 'modern', 125, 82, 10, 25, .8, 450, 5, 140, 1.5, 'ranged', 'circle', '#f2d898', '精准的中距离单发步枪，有真实子弹飞行和后坐。', { attackKind: 'bullet' }),
  unit('shotgunner', '霰弹枪兵', 'modern', 185, 85, 12, 11, 1.65, 155, 9, 175, 2, 'ranged', 'circle', '#efc995', '每轮 6 枚独立散弹；近距离集中爆发，随飞行距离衰减。', { attackKind: 'shotgun', pellets: 6 }),
  unit('machine_gunner', '机枪兵', 'modern', 160, 65, 12, 9, .15, 490, 11, 275, 2.2, 'ranged', 'circle', '#ead996', '每 0.15 秒连射，10 发弹匣耗尽后必须换弹 2 秒。', { attackKind: 'machine', windup: .025 }),
  unit('sniper', '狙击手', 'modern', 95, 70, 10, 112, 3.2, 760, 0, 350, 1.5, 'ranged', 'circle', '#f0e5c4', '偏好高价值后排；高精度子弹最多贯穿 2 名敌人，每人仅命中一次。', { attackKind: 'sniper', windup: .32 }),
  unit('rocketeer', '火箭兵', 'modern', 110, 65, 11, 80, 3.4, 540, 3, 330, 1.9, 'ranged', 'circle', '#ecad82', '慢速火箭飞行后爆炸，半径 78，只击退和伤害敌方。', { attackKind: 'rocket', blastRadius: 78 }),
  unit('tank', '坦克', 'modern', 1200, 67, 26, 160, 3.5, 620, 115, 1100, 15, 'heavy', 'square', '#f0d498', '独立旋转炮塔、半径 68 的炮击；靠近敌阵时可重型碾压。', { attackKind: 'shell', blastRadius: 68, skillCooldown: 3.8, skill: '重型碾压', turnRate: 1.65 }),
  unit('fire_mage', '火法师', 'fantasy', 105, 85, 10, 38, 2.2, 410, 0, 235, 1, 'ranged', 'circle', '#ffac67', '火球半径 60 爆炸；敌人燃烧 4 秒，每秒 5 点基础伤害。', { attackKind: 'fireball', blastRadius: 60 }),
  unit('frost_mage', '冰法师', 'fantasy', 110, 83, 10, 28, 2.1, 390, 3, 250, 1, 'ranged', 'circle', '#a7eeef', '冰弹小范围命中，减速 40% 持续 3 秒；不会叠成完全冻结。', { attackKind: 'ice', blastRadius: 40 }),
  unit('healer', '治疗师', 'fantasy', 135, 85, 10, 30, 1.35, 265, 0, 240, 1, 'support', 'circle', '#d8ffb7', '优先救援濒危队友；没有敌对攻击，不能自疗、复活或超过最大生命。', { attackKind: 'heal' }),
  unit('necromancer', '死灵法师', 'fantasy', 175, 69, 12, 10, 2.1, 320, 6, 400, 1.5, 'summoner', 'circle', '#d3b4f4', '每 7 秒召唤至多 2 只骷髅，每人最多 8 只，骷髅寿命 22 秒。', { attackKind: 'spirit', skillCooldown: 7, skill: '骷髅召唤' }),
  unit('giant', '巨人', 'fantasy', 1850, 52, 35, 120, 2.35, 105, 55, 1250, 18, 'heavy', 'circle', '#e8d0a1', '大锤横扫多个敌人；每 8 秒践踏，震倒近旁敌军。', { attackKind: 'hammer', windup: .48, skillCooldown: 8, skill: '践踏' }),
  unit('dragon', '巨龙', 'fantasy', 1750, 110, 32, 82, 2.1, 64, 65, 1750, 13, 'heavy', 'triangle', '#ffb66f', '巨口撕咬；每 7 秒持续喷出锥形火焰并施加烧伤。', { attackKind: 'bite', skillCooldown: 7, skill: '锥形龙息' }),
  unit('wolf', '野狼', 'beasts', 95, 148, 9, 14, .62, 27, 0, 65, 1.1, 'skirmisher', 'oval', '#e9e6d7', '快速侧翼包夹，优先追逐孤立、虚弱或残血目标。', { attackKind: 'bite' }),
  unit('raptor', '迅猛龙', 'beasts', 155, 161, 11, 24, .8, 33, 4, 165, 1.8, 'skirmisher', 'diamond', '#c8dfa7', '每 4.5 秒短距离高速跃扑，沿实际运动路径命中并击退。', { attackKind: 'bite', skillCooldown: 4.5, skill: '跃扑' }),
  unit('rhino', '犀牛', 'beasts', 530, 140, 21, 43, 1.3, 43, 35, 440, 9, 'charger', 'oval', '#dce0d4', '长距离蓄势顶撞；一次冲刺可撞击路径中的多个敌人。', { attackKind: 'horn', skillCooldown: 6, skill: '顶撞冲刺' }),
  unit('gorilla', '大猩猩', 'beasts', 660, 95, 20, 65, 1.55, 46, 25, 540, 7, 'heavy', 'circle', '#dcc6ab', '每轮连续双拳，第二拳伤害较轻但冲量更强。', { attackKind: 'double_punch' }),
  unit('mammoth', '猛犸象', 'beasts', 1330, 82, 31, 80, 2.05, 79, 75, 1050, 17, 'heavy', 'oval', '#ecd9b8', '宽阔象牙前向扫击，重体型可挤开轻型单位并强力击退敌人。', { attackKind: 'tusk', windup: .36 }),
  unit('trex', '霸王龙', 'beasts', 2150, 103, 35, 168, 2.75, 72, 65, 1650, 19, 'heavy', 'triangle', '#dce9b1', '高伤害巨口撕咬；每 8 秒咆哮，附近敌人暂时恐惧退缩。', { attackKind: 'bite', skillCooldown: 8, skill: '威慑咆哮', windup: .36 }),
  unit('robot', '战斗机器人', 'scifi', 210, 80, 12, 19, .45, 390, 25, 235, 2.8, 'ranged', 'square', '#d0efdf', '规律机械连射，护甲可靠，转向与步频有机械节奏。', { attackKind: 'plasma', turnRate: 4.2 }),
  unit('laser_trooper', '激光兵', 'scifi', 115, 95, 10, 17, .27, 555, 7, 265, 1.3, 'ranged', 'circle', '#b9fff0', '瞬时细激光脉冲穿透最多 2 名敌人，友军不遮挡射线。', { attackKind: 'laser', windup: .025 }),
  unit('drone', '攻击无人机', 'scifi', 105, 143, 9, 14, .42, 370, 0, 250, .9, 'ranged', 'diamond', '#b4edeb', '滑行巡航、侧移射击；悬浮是视觉效果，近战仍然可以命中。', { attackKind: 'drone_bolt' }),
  unit('mech', '战斗机甲', 'scifi', 1450, 87, 27, 76, .95, 580, 95, 1420, 13, 'heavy', 'hexagon', '#c6ebe3', '双臂交替射击；每 5 秒齐射 3 枚独立的小型爆炸导弹。', { attackKind: 'mech_bolt', skillCooldown: 5, skill: '导弹齐射', turnRate: 2.4 }),
  unit('blink_alien', '闪现外星人', 'scifi', 165, 132, 11, 28, .72, 36, 4, 265, 1.4, 'skirmisher', 'triangle', '#dfbaf9', '每 6 秒短距离闪现至敌人侧后方；仅选择合法空位，没有无敌帧。', { attackKind: 'energy_blade', skillCooldown: 6, skill: '侧后闪现' }),
  unit('ufo', '外星飞碟', 'scifi', 940, 108, 29, 48, 1.35, 550, 60, 1080, 9, 'heavy', 'oval', '#b7f0d9', '每 8 秒牵引一小群敌人，短暂聚拢后能量轰击；可被地面兵攻击。', { attackKind: 'ufo_bolt', skillCooldown: 8, skill: '牵引光束' }),
  unit('bomb_chicken', '自爆鸡', 'weird', 48, 191, 8, 145, .4, 30, 0, 85, .6, 'melee', 'circle', '#ffe89a', '贴敌闪烁 0.4 秒后自爆，或受击死亡时爆炸；半径 75，队友零伤害零击退。', { attackKind: 'suicide', blastRadius: 75, windup: .4 }),
  unit('boxing_kangaroo', '拳击袋鼠', 'weird', 275, 120, 14, 36, .6, 35, 9, 245, 2.5, 'melee', 'oval', '#edc4a0', '交替左右拳，持续命中同一目标积攒连击，击退增强至最多 4 层。', { attackKind: 'combo_punch' }),
  unit('spring_monster', '弹簧怪', 'weird', 205, 151, 13, 44, 1.3, 38, 6, 245, 2, 'skirmisher', 'square', '#efefa5', '每 5 秒向敌人弹跳，落地震退周围敌人，有真实位移和落点。', { attackKind: 'spring_hit', skillCooldown: 5, skill: '弹跳砸地' }),
  unit('boomerang_thrower', '回旋镖投手', 'weird', 125, 93, 10, 27, 1.65, 350, 0, 155, 1.3, 'ranged', 'circle', '#f4d6aa', '弧线飞出后返回投手，最多穿过 4 个敌人；每个阶段每人至多命中一次。', { attackKind: 'boomerang' }),
  unit('gravity_orb', '引力球', 'weird', 440, 67, 18, 13, .65, 185, 35, 465, 5, 'ranged', 'circle', '#ceb8fa', '每 5 秒脉冲只牵引敌人，随后引爆中心附近的敌军；吸附不越过质量规则。', { attackKind: 'gravity_bolt', skillCooldown: 5, skill: '引力脉冲' }),
  unit('jester', '小丑', 'weird', 145, 115, 11, 19, .9, 315, 0, 190, 1, 'ranged', 'diamond', '#f0c4e6', '每 9 秒产生可被摧毁的短命诱饵，吸引附近敌人重新选择目标。', { attackKind: 'card', skillCooldown: 9, skill: '诱饵把戏' }),
]);

export const UNIT_MAP = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(UNIT_LIST.map(u => [u.id, u]))));

/** Skill derivatives are never part of the deployable roster. */
export const SUMMON_DEFS = Object.freeze({
  skeleton: unit('skeleton', '骷髅', 'fantasy', 58, 92, 8, 13, 1, 24, 0, 0, .8, 'melee', 'circle', '#e2e0d5', '死灵法师召唤，最多存活 22 秒，战绩归属主人。', { attackKind: 'sword' }),
  decoy: unit('decoy', '小丑诱饵', 'weird', 62, 0, 11, 0, 99, 0, 0, 0, 1, 'decoy', 'diamond', '#f6d5ec', '吸引附近敌人，不能攻击或接受治疗，最多存活 6 秒。', { attackKind: 'none' }),
});
