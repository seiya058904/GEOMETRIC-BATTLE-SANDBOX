# V2 操作参考分析

访问日期 2026-10-13（Asia/Shanghai）。实际读取官方网页和公开开发说明，未安装或实玩 TABS/UEBS2；下面的适配结论是设计推论，不称用户研究。

## TABS：直接修改可见的对象

[Landfall 官方资料](https://landfall.se/tabs-press-kit)与[Steam 产品说明](https://store.steampowered.com/app/508440/Totally_Accurate_Battle_Simulator/)把红蓝军队与观看自动混战作为核心。官方移动版[Place & Remove Units](https://www.taptap.io/tw/post/3517166)实际描述：PC 点击及按住左键拖动连续部署；手机滑动通常意味着调镜头，因此加入放置/移除控件，明确区分修改与浏览。

玩家觉得直观的原因不是按钮少，而是动作与战场立即对应：指到哪里就改哪里，删除和添加同样直接，开战是阶段转换。GEOBATTLE 的旧工具栏要求先选阵营再选兵种/工具，把“放在另一侧”的自然意图变成隐藏状态。V2 移除队伍输入；统一兵种图鉴选一次，红侧点一次、蓝侧点一次即可。PC 默认绘制，右键擦除，触摸则显式部署/擦除/平移，双指随时取消修改并接管镜头。

项目没有地形或金币，区域就是主要空间线索，因此半区必须比旧版建议区明显，并按完整碰撞体判断，不是仅凭红蓝背景猜队伍。中线禁放幽灵解释原因；每次拖动锁队，不能一次手势混入敌军。没有友军伤害，不把敌我交错阵容当必要高级功能；历史跨区存档用明确恢复入口保存原军队身份。

社区 [Controls](https://tabs.wiki.gg/wiki/Controls) 已请求但读取失败；右键移除规范来自本任务要求，未把不可读社区页当已核实来源。移动版双手按按钮设计没有照搬：本项目要求单手可用，所以采用持久、可见的三模式，而不是必须两手同时按住。

## UEBS2：大军阵先看整体关系

实际读取[官方 Steam 介绍](https://store.steampowered.com/app/1468720/Ultimate_Epic_Battle_Simulator_2/)。它强调规模、自由军阵和观赏。社区[Battle Setup](https://ultimate-epic-battle-simulator.fandom.com/wiki/Battle_Setup)请求失败，无法独立核实其朝向箭头交互细节；有色阵型区域与朝向反馈作为文档提供的设计线索使用，不冒称实机结果。

可借鉴的原则是远景呈现队伍几何，近景呈现个体。GEOBATTLE 保留直线、矩阵、旋转、整组复制/移动/镜像，但收进高级入口；预览实际候选单位和非法轮廓，提交成功/跳过数量与一次撤销一致。队伍形状、武器朝向和红圆/蓝菱标记帮助玩家理解，而非默认暴露方向数字表。

本项目只保留36固定兵种、自动战斗、离线Canvas2D和1200活动实体保护上限。UEBS2 的 GPU 技术/百万级规模、实时指挥、附身、战役均不移植。远景LOD仍绘出每个真实参战单位；拉近能辨识枪炮、治疗、召唤与巨型单位，不用静态军团贴图掩盖人数。

## 对照落实

|参考操作原理|本项目落地|必要代价|
|---|---|---|
|指到哪里修改哪里|落点分队，预览/提交共用验证器|所有编辑与导入路径同步升级|
|添加与移除同等直接|左画右删；触屏明确模式|右键平移迁到中键/Alt/平移控件|
|布阵与观战分层|战场主舞台；战时隐藏编辑，清楚暂停/重赛|旧高级入口需要按需展开|
|军阵几何优先|整组预览、原子移动/镜像、明确换边|跨线或重叠组拒绝，保留剪贴板|
|身份与队伍分离|单一中性图鉴，落点幽灵显示队色|保留36真实程序化造型，不复制品牌资产|

技术参考也实际读取了 [MDN Canvas 优化](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)、[context 属性](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getContextAttributes)、[OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)、[Chrome Performance](https://developer.chrome.com/docs/devtools/performance/overview)。它们支持测量与缓存的调查方向，但不能证明某个 hint 在本机器更快；本轮通过同条件控制和合成截图判断，拒绝空白战场的高FPS结果。
