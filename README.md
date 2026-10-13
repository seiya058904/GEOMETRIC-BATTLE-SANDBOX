<h1 align="center">GEOBATTLE</h1>

<p align="center"><strong>Build the armies. Let the battle decide.</strong></p>

<p align="center">
  几何战争沙盒 · 自由排兵，自动交战，观察每一次调整的结果。<br>
  从剑士、弓箭手到坦克与巨龙，36 种单位，红蓝双方共用一个战场。
</p>

<p align="center">
  <a href="https://seiya058904.github.io/GEOMETRIC-BATTLE-SANDBOX/"><strong>▶ Play Online</strong></a>
  &nbsp;·&nbsp;
  <a href="https://seiya058904.github.io/GEOMETRIC-BATTLE-SANDBOX/GEOBATTLE-OFFLINE.html">⬇ Offline Single HTML</a>
  &nbsp;·&nbsp;
  <a href="#how-to-play">怎么玩</a>
  &nbsp;·&nbsp;
  <a href="#development">源码与开发</a>
  &nbsp;·&nbsp;
  <a href="docs/PUBLIC-CLOSEOUT.md">验收记录</a>
</p>

<p align="center"><sub>36 PRESET UNITS · RED vs BLUE · AUTOMATED BATTLES · OFFLINE PLAY · DESKTOP + TOUCH</sub></p>

<p align="center">
  <img width="900" src="docs/media/deployment.jpg" alt="GEOBATTLE 实际游戏画面：默认红蓝各40人的军阵、统一兵种图鉴和范围部署工具">
</p>
<p align="center"><sub>当前游戏的真实 Chromium 截图，默认红蓝各 40 人；不是概念图。</sub></p>

---

## 先排兵，再看它们怎么打

没有金币预算，也没有需要先解锁的兵种。选一个单位，在左半场部署红军，在右半场部署蓝军；点击开始，军队自己寻找目标、移动、攻击与施放技能。

### 把一个想法变成两支军队

用同一份兵种图鉴给双方混编。点击放下一个单位，拖动铺出一排；想快一点，就把**范围切到中或大**，一次铺多排。直线、矩阵、框选、旋转、复制与镜像藏在高级编辑里，需要时再展开。

### 调整比重来更快

右键或「擦除」模式连续扫过，快速划过的整段路径也会命中。战场上的**清空**一键移除双方；清空和整次绘制、擦除都能撤销。手机有明确的部署、擦除、平移模式，第二根手指加入时会取消当前编辑，转为镜头操作。

### 从全图看到一次交锋

开战后专心观察：拉近看武器与技能，点击单位查看状态，暂停分析，或调整到 0.25×—4×。返回布阵会恢复完整战前军阵，方便继续改，不把尸体和召唤物留在编辑器里。

<p align="center">
  <img width="900" src="docs/media/battle.jpg" alt="GEOBATTLE 实际战斗近看：坦克、盾兵与远程单位交锋，战斗暂停在约8秒">
</p>
<p align="center"><sub>默认军阵自然运行约 8 秒后暂停并近看；效果与单位来自实际模拟。</sub></p>

### 让下一次实验有个参照

军阵档案内有盾面方向、枪阵错位、密集与分散三组实验，共六个预设。战报列出双方损失、伤害、治疗与兵种明细，并对照本次会话最近两场。用同种子重赛检查复现，用新种子再试一次；数据差异提供参照，不自动解释胜负因果。

<a id="how-to-play"></a>
## 三步开始

1. **[打开在线游戏](https://seiya058904.github.io/GEOMETRIC-BATTLE-SANDBOX/)。** 无需账号、安装或游戏服务器。
2. **直接用默认军阵，或选择兵种部署双方。** 默认红蓝各 40 人；双方至少各有一个单位才能开战。
3. **点击「开始战斗」。** 观察、暂停、查看战报，再返回布阵调整。

**离线玩：** [打开单 HTML](https://seiya058904.github.io/GEOMETRIC-BATTLE-SANDBOX/GEOBATTLE-OFFLINE.html)，在浏览器中另存为 `GEOBATTLE-OFFLINE.html`，然后双击保存的文件。也可以从[仓库文件页](GEOBATTLE-OFFLINE.html)下载原文件。它内嵌全部游戏脚本和样式，不需要 Node.js、账号、CDN 或联网；不要只保存开发入口 `index.html`。

### 操作速查

| 场景 | 操作 |
| --- | --- |
| 电脑部署 / 擦除 | 左键点击或拖动部署；右键拖动扫擦；「范围」可选小、中、大 |
| 电脑镜头 | 中键或 Alt 拖动平移，滚轮缩放；「近看 / 全图」切换观察尺度 |
| 撤销 / 重做 | `Ctrl+Z` / `Ctrl+Y` 或 `Ctrl+Shift+Z`；底部也有按钮 |
| 战斗时间 | `Space` 开始、暂停、继续；战斗中编辑工具锁定 |
| 快捷工具 | `B` 部署、`E` 擦除、`V` 框选、`L / R` 直线 / 矩阵、`Delete` 删除选区 |
| 搜索 / 取消 | `/` 搜索兵种、`F` 适配军阵、`Esc` 取消操作或收起面板 |
| 手机与平板 | 单指使用当前模式；双指缩放与平移，取消未完成编辑 |

macOS 可用 Command 代替 Ctrl。输入框、对话框与模态抽屉内不会穿透游戏快捷键。

初始单位必须完整留在本方半场；中线附近、场外、重叠位置不可部署。一次绘制锁定起始阵营，越线候选会跳过并报告；开战后单位可以正常跨线作战。

## 战场里有什么

| 能力 | 实际行为 |
| --- | --- |
| 36 种预设单位 | 古典、现代、奇幻、生物、科幻、搞怪六类，双方全部可用；[兵种与机制](docs/UNIT-ROSTER.md) |
| 自主交战 | 自动 AI、弹道、近战、技能、控制、治疗与召唤；友军不会受到伤害或负面效果 |
| 胜负与战报 | 消灭敌军或明确判平局；可看贡献与损失、重赛或恢复战前布阵 |
| 保存军阵 | 当前浏览器自动保存、具名预设、JSON 导入导出；[存档兼容说明](docs/V2-MIGRATION.md) |
| 完全离线 | Canvas 2D 程序化画面、Web Audio 合成音效，无第三方运行时网络依赖 |

这是单机观战沙盒，没有多人联机、战役、经济或地形系统。碰撞使用软圆形分离与冲量，并非通用刚体物理。**1200 是全场活动单位的保护上限，包含召唤物；不是流畅人数保证。** 默认 80 人是直接试玩的入口。

存档绑定当前浏览器与站点地址，不自动跨设备同步；线上与本地文件的存档也分开。导出 JSON 可迁移或备份军阵。相同军阵、种子与构建可复现战斗；不承诺不同浏览器/CPU 的浮点状态逐字节一致，新种子也不保证改变胜负。

<a id="development"></a>
## 源码与开发

原生 JavaScript ESM / JSDoc、Canvas 2D、Web Audio、Node 内置测试与 esbuild。需要 **Node.js 22+**；Pages CI 使用 Node 24。

```bash
npm ci
npm run dev
```

打开 `http://127.0.0.1:4178/`。开发服务器不包含热更新，修改后刷新；可用 `npm run dev -- --port 4180` 改端口。

```bash
npm run check
npm test
npm run build
npm run preview
```

`build` 生成 `dist/` 生产页面与根目录离线 HTML，`preview` 提供生产预览。运行游戏不需要安装构建依赖。

<details>
<summary><strong>浏览器验收、目录与部署</strong></summary>

浏览器脚本需要另行准备 Playwright 与 Chromium，不属于默认构建依赖。可使用已有安装并将 `PLAYWRIGHT_MODULE` 指向其 `index.mjs`；可选 `PLAYWRIGHT_EXECUTABLE` 指定兼容 Chromium。设置 `GEOBATTLE_TEST_DIST=1` 测生产版、`GEOBATTLE_EVIDENCE` 隔离输出、`GEOBATTLE_TEST_URL` 选空闲本机端口。PowerShell 使用 `$env:变量='值'`。

```bash
node tests/browser.mjs
node tests/v3-browser.mjs
node tests/bulk-editor.mjs
node tests/offline.mjs
```

| 目录 | 职责 |
| --- | --- |
| `src/data/` · `src/sim/` | 单位、固定步模拟、AI、战斗与种子 RNG |
| `src/editor/` · `src/persistence/` | 部署校验、历史与军阵存档 |
| `src/render/` · `src/ui/` | 程序化画面、合成音、界面与战报 |
| `tests/` · `scripts/` | 单元/浏览器回归、构建、部署产物校验 |
| `docs/` · `evidence/` | 当前说明与各历史构建的真实验收证据 |

GitHub Pages 工作流依次运行安装、语法、单元测试、构建与部署产物校验。只发布 `dist/`，不上传历史 `evidence/`；PR 只做构建校验，`main` 的 push 或手动运行才部署。浏览器验收在本地与实际线上站点执行，不在缺少浏览器依赖的 CI 中伪称通过。[公开与部署记录](docs/PUBLIC-CLOSEOUT.md)

</details>

## 状态与已知边界

- Windows Chromium 已实测桌面、手机横竖屏与触控模拟。**真实 Android/iOS、Firefox/Safari、物理声音听感仍未验收**；真实后台切页有一项自动化跳过，不能视为通过。
- **性能仍有波动。** 300v300 已有低帧记录，历史软件渲染 550ms 长帧未确认根治；大规模军阵建议降低画质。功能测试通过不等于所有设备稳定 60 FPS，也不证明没有内存泄漏。
- 密集碰撞可能短暂压挤，36 兵种未宣称竞技平衡。战场依赖视觉与指针操作，尚无覆盖整个 Canvas 的屏幕阅读器操作模式。

完整数据与失败记录：[综合质量迭代](docs/QUALITY-ITERATION.md) · [历史 V2 QA](docs/V2-QA-REPORT.md) · [历史性能调查](docs/V2-PERFORMANCE-INVESTIGATION.md)。文档中的 V2/V3 是内部迭代与验收阶段，历史数据只对应各自构建。

## Rights & Credits

本仓库公开供查看和试玩，**目前没有项目级 `LICENSE`，不授予任意复制、修改或再分发的开源许可**。

游戏单位、图标、战场与特效由代码绘制，声音由 Web Audio 合成，字体使用系统字体栈；没有捆绑商业音轨、外部字体文件或第三方游戏素材包。`design/` 内五张 AI 生成图片是项目视觉探索参考，来源和提示词见[参考说明](design/DESIGN-REFERENCES.md)与[V2 记录](design/V2-IMAGE-PROMPTS.md)，不作为游戏运行资源。README 两张图片是本项目真实游戏截图。

esbuild 仅用于开发构建，依赖锁文件记录其 MIT 许可；这不构成对本项目代码或图像的统一授权。再使用任何内容前，请分别核对相应权利与许可。

---

<p align="center"><sub>排兵。观察。调整。再试一次。</sub></p>
