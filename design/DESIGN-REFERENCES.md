# AI 视觉探索

2026-10-12，使用内建 imagegen 完成两次独立 AI 生图。参考图片仅用于视觉探索，不作为游戏兵种贴图或战场背景加载；实际场景由 Canvas 2D 程序化绘制。

## 参考图与采用方向

- `battlefield-reference.png`：空旷正俯视战场、珊瑚红与天青蓝几何单位、细线攻击轨迹和克制冲击圆环。
- `interface-reference.png`：深石墨实验室界面、固定顶栏、左侧兵种目录、中央主战场、右侧单位详情、底部紧凑工具条。

以 #111c20 / #18262c 为背景，#ff705d 和 #59b7fa 为队伍色，#edf0e6 为文字主色，#d3ee89 为主要行动色。实际实现以真实可访问文本和程序化形状修正 AI 图中的文字、尺度与交互细节。

## 生图提示词 1

Use case: stylized-concept
Asset type: game visual design reference only; actual game uses procedural 2D Canvas geometry.
Primary request: a beautiful strictly two-dimensional orthographic directly overhead battle sandbox screenshot, minimalist geometric soldiers in a completely flat empty open battlefield. A lively but extremely readable clash with coral red army on the left and sky blue army on the right, groups of circles and squares with tiny outlined weapons. Include small sword circles, bulky shield squares, archers with simple curve bows, rectangular tracked tank with cannon, enormous geometric triangle-wing dragon, large heavy giant circle, a sleek laser unit with straight beam, a tiny explosive chicken made from circles and a triangle beak. Create obvious silhouettes and relative scale differences; playful laboratory-like tactical toy.
Scene/backdrop: uninterrupted deep graphite with a subtle green cast, flat color #111c20, extremely faint small grid dots. Absolutely no terrain, walls, rocks, water, buildings or isometric perspective.
Composition/framing: wide 16:10 full battlefield close view with plenty of negative space at top and bottom, armies attacking each other in central area. Approx. 75 units, believable fine arrows, short directional aim markers, restrained outlined explosion rings; controlled tiny impact sparks.
Style/medium: refined crisp flat vector-like 2D geometry with occasional subtle thin outlines and careful spacing; premium playable indie toy screenshot; no UI panels and no text.
Color palette: field #111c20, red #ff705d, blue #59b7fa, white #edf0e6, rare warm pale flashes. Controlled glows only on lasers and impact. Units have small dark inner details.
Avoid: 3D, depth perspective, isometric, shadows cast across terrain, photorealism, landscape, realistic soldier sprites, excessive bloom, detailed art sprites, pixel art, gradients across every shape, clutter, smoke clouds occluding units, interface text, watermark.

## 生图提示词 2

Use case: ui-mockup
Asset type: complete high-fidelity desktop game UI visual design reference for a buildable 2D sandbox; actual game uses procedural Canvas geometry.
Primary request: a fully composed fullscreen desktop game interface for GEOBATTLE, an elegant precise yet playful minimalist geometric battle simulator in Chinese. No marketing webpage or browser chrome. Actual playable workspace at 1600 x 1000 proportion. Background #111c20 and panels #18262c. Warm off-white #edf0e6 labels, cool subdued gray secondary labels. Coral army #ff705d, blue army #59b7fa, exciting light yellow-green #d3ee89 start button. Small 4-8 px corners and thin subtle borders, normal sans serif typography, meticulous alignment and spaciously readable content.
Composition/framing: 58px top bar with a simple geometry brand mark and exact title "GEOBATTLE" left, concise red and blue army count chips toward center and right, bright primary button "开始战斗" far right. Left sidebar approx. 220px wide, heading "兵种", compact tab filters, concise tidy list of units with little line icons and small numeric cost: "剑士", "盾兵", "枪兵", "弓箭手", "火枪手", "骑士", "坦克", "巨人", "巨龙", "激光兵", "自爆鸡". Active row has red subtle tint. Under units an understated helpful tip area. Central battlefield is the overwhelming main area, flat blank deep graphite subtle grid dots, coral red geometric soldiers gathered toward left, sky blue geometric soldiers toward right. Middle of stage left clear for battle, thin center deployment division line. Include several small circles carrying swords, shield squares, rectangle tanks and larger triangle wing dragons, all strictly 2D direct overhead with no terrain. Right sidebar approx. 230px wide, collapsible heading "单位详情", large simple coral sword circle icon, exact title "剑士", compact stat rows like "生命 100", "攻击 18", "速度 72", description, count stepper and deploy button. Bottom of central battlefield a slim floating-but-solid toolbar for "单个", "画笔", "阵列", "擦除", army color toggles, zoom percentage, quiet tool icons. Left bottom a "预设场景" control; stage corner subtle "滚轮缩放 · 空格拖动画布" hint.
Lighting/mood: crisp tactile precision, a real thoughtful premium indie toy application, calm dark neutral stage, colorful tiny troops, restrained polish.
Constraints: Chinese copy must be concise readable. Flat 2D view, operational product UI not landing page; no cards piled over battlefield, no hero banners. No glassmorphism, blur panels, giant pill corners, heavy neon, gradients, 3D, scenery, photorealism or illustration wallpaper. Sharp readable interface with varied intentional text hierarchy.

