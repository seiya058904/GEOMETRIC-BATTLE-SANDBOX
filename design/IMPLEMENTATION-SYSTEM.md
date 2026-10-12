# GEOBATTLE 视觉实现约定

采用 `interface-reference.png` 的主屏布局与 `battlefield-reference.png` 的红蓝几何和轻量轨迹语言。它们是设计参考，不进入实时战场；用户要求全部单位由程序化几何绘制。

- 背景为深绿石墨 `#111c20`，侧栏 `#152329`，悬停/选中表面 `#213238`。
- 主文字 `#edf0e6`，次要文字 `#95a8aa`，分隔线 `#2c3d43`。
- 红军 `#ff705d`、蓝军 `#59b7fa`、主操作 `#d3ee89`；技能辅助色不改变主体阵营。
- 系统字体：Inter（如设备已安装）/Segoe UI/Microsoft YaHei/PingFang SC/sans-serif。标题 18–22px，正文 13–14px，次级说明 11–12px。使用等宽/表格数字呈现人数、时间和属性。
- 顶栏约 64px，左侧目录 236px，右侧详情 230px，底部工具栏 62px；中央画布优先。小窗口缩窄侧栏，手机用底部抽屉替代常驻侧栏。
- 6px 常规圆角，8px 对话框/面板圆角，细线分隔；没有玻璃模糊与铺满全屏的装饰渐变。
- 统一20px线性SVG图标，按钮有明确hover、focus-visible、disabled和selected状态。
- 参考图中的示例数值/目录标签不是规则来源：全部按用户36兵种名册和实际状态填写。为完成编辑、保存、复现和无障碍工作流，补全必要的原生控件。
- 胜负弹层、存档抽屉、移动布局沿用主屏令牌。动画偏轻，战斗渲染只读取模拟时间，暂停冻结技能特效。

工程采用原生 JavaScript ESM、Canvas、Web Audio、Node测试和esbuild；相较推荐React/TypeScript/Vite，这是依赖最少的等效模块化实现，并附离线单HTML构建。
