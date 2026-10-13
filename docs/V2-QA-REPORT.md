# GEOBATTLE V2 最终 QA 与交接

> **2026-10-13 性能追加验收（当前）**：透明边距裁剪后，当前AMD1200人三轮平均58.56FPS，软件1200人43.22FPS；旧软件300v300的550ms仍未确认根治。最新完整A/B、257项Node、源码/生产各73通过1跳过、离线3项、视觉8项及像素源码/生产各8项见 [性能后续报告](V2-PERFORMANCE-FOLLOWUP.md) 与 `evidence/v2/perf-followup/gates.json`。以下保留9f964f3原始验收，数值和旧产物散列属于该历史版本。


2026-10-13，Asia/Shanghai。结论：新UI、按位置分队、领域层严格半区、电脑/触控模拟编辑、兼容恢复与离线运行已实测。**性能没有全面达标，后台真实切页和原生Android未完成验收。** 完成功能检查不等于稳定60FPS。

## 来源与运行条件

原main/origin/main/远端核对值为924150f922e5da2cff1000aa5bb034fb34b32701；接入工作树干净、无stash、单工作树。工作分支codex/geobattle-v2；本地提交，未推送、合并、部署或创建PR。最终commit在ZIP内DELIVERY-MANIFEST.json及工作区DELIVERY-GIT-STATE.json记录，避免文档自引用散列。原v1根ZIP仍保留；V1历史evidence不被冒称V2结果。完整修前源码保存在evidence/v2/baseline-source.zip。

Windows、Node24.15.0、npm11.12.1、Playwright1.62.1、Chromium151.0.7922.34。当前无Browser插件，复用工程Playwright harness。默认强制ANGLE SwiftShader；另用相同D3D11参数完成实际AMD Radeon RX7900XT后端A/B，设备和合成/raster状态由CDP核实。不是实体屏幕手工体验。两种后端的成绩分开。

## 最终门禁

|命令|退出码|通过/失败/跳过|证据|
|---|---:|---|---|
|npm run check|0|全部模块语法通过|check-final.log|
|npm test|0|254/0/0|node-final.log|
|npm run build；verify-v2-build|0|4产物SHA与离线字节一致|build-final.json|
|npm run test:browser 源码|0|73/0/1；37截图通过|final-source/browser-all.json|
|npm run test:browser 生产|0|73/0/1；37截图通过|final-dist/browser-all-dist.json|
|npm run test:offline|0|3/0/0，外部请求0|final-dist/offline-build-verification.json|
|node tests/v2-visual.mjs 生产|0|8/0/0，页面错误0|final-visual/visual-and-input.json|
|npm run test:performance 最终生产100v100|0|1场推进/有限性通过，实际AMD后端核实|performance-production-smoke.json|

生产smoke59.42FPS、1%low31.92、1.005×、最长83.3ms，>50/100/250/500ms为1/0/0/0；单场不替代三次完整A/B。最终门禁汇总gates-final.json。最终代码/配置/文档diff-check通过（Windows CR视为行尾）。原始失败日志integration-node-initial.log有6个带空格的空行，按原样保留证据，不称全仓原始日志空白检查通过。

最后产品代码修改是确认对话框close事件保护；随后重建并完整复测源码、dist、断网和视觉。测试报告布阵跳过数量与布尔skip标记的冲突只属于报告器，已改为严格比较true并重跑。构建源SHA-256：d9a5fa307154d8ae9927ce55eff53ece0677fdd57282f75d963fbeaaf92f9158。离线文件229735字节，SHA-256：b3bdeb0364804c0a10b27880d085b94905a3b271e139eb5084667ca17d02485a。完整四产物散列与嵌入字节一致性见evidence/v2/build-final.json。

复现前置：设置PLAYWRIGHT_MODULE到可用Playwright模块；浏览器脚本自行开关本地服务器。源码npm run test:browser；生产设置GEOBATTLE_TEST_DIST=1再运行。GEOBATTLE_EVIDENCE指定独立输出目录。离线npm run test:offline直接file://加载且context.offline=true，检查外部请求为0。生产性能smoke使用PERF_SCENE=100-vs-100、PERF_SECONDS=12、GEOBATTLE_QA_NATIVE_GPU=1；完整三轮矩阵命令在性能报告。

## 真实用户旅程与图像覆盖

- 新人路径：同一剑士入口选一次、红蓝各一次点击，mainOperations=3；中线禁放，两边右键擦除和撤销，真实开始/暂停/继续/战报/返回。没有真实新手受试者，不能声称区域识别率或30秒人类成功率。
- 默认左拖一次绘制48名单位；整次撤销恢复。直线跨线预览11个合法、12个跳过，实际提交11，整次撤销归零。混合选择、非法部分移动原子拒绝、整组对侧粘贴、镜像/换边、旋转、撤销/重做分别由真实输入与领域测试覆盖。
- 320与375触控旅程经CDP实际触点：抽屉选兵、两侧放置、擦除、撤销、显式单指平移、第二指加入取消未提交事务、双指缩放不产生单位。节点关键目标≥44px（浏览器舍入门禁≥43px）；不是物理手指/真机测试。pointercancel另有Node事务回归。
- 中文角色、类别、技能搜索；换兵退出粘贴但保留剪贴板；跟随/解除/取消按钮在动态刷新时保持焦点，原生Space/Enter点击及战场Space互不冲突。
- 预设保存/载入/导出/重新导入，损坏/future/空字符串/跨区autosave原文保留，实际备份下载字节核查；显式兼容副本可预览并作为一次撤销记录，不改原命名预设。
- 六模拟视口：320×568、375×812、768×1024、1366×768、1920×1080、3840×2160；源码与生产截图含首屏、部署和实际战报，visual另含禁放、自然运动战斗和手机目录。DPR2另测世界坐标、禁放和两侧归属。4K截图不等于实体4K显示屏实测。
- 36兵种单一中性目录与实际几何单位；全36混编自然运行观察跨中线与代表技能，见final-visual/visual-and-input.json。未把瞬时特效观察当完整机制证明；友军无伤害/负面/冲量、弹丸归属、召唤上限、完整同种子结果由保留Node与真实重赛交叉核验。
- 独立复审发现半区标题被HUD遮挡并修复；最后四首屏单项复审ship见visual-review-final.md，只覆盖该问题，不冒称所有UI均获独立认证。三张AI参考确实生成，采用层级/主舞台/中性库，排除地形、假3D和新队伍；运行时未引入图片/字体/CDN。

## Bug与产品取舍

基线允许红军在蓝半场部署是旧规则/设计问题，不冒称随机Bug。默认全局team取消，所有准备态入口统一世界半区与真实半径+2余量。右键由平移改擦除，中键/Alt与显式平移保留镜头；高级工具完整保留但默认收起。无隐式freeDeploy旁路。

迭代实测修复：弹层遮挡移动/返回；待粘贴右键操作；空原文备份；恢复遗留粘贴；高级朝向偏转；既有实体详情错显当前画笔类型；排队旧close事件清除新确认回调。失败样本、步骤与证据见V2-BASELINE-AND-AUDIT.md及evidence/v2/pre-final-fix/。first/second/third/fix保存施工期失败与复测；不计入最终门禁数字，也不删除。

保留schemaVersion1、原数据字段与2MiB/ID/坐标/有限数/类型/容量验证。合法V1直接读取；跨区旧阵容只读待迁移、先保留精确备份、显式创建兼容副本，原team/ID/类型/种子/朝向/总人数保留，只移动非法位置。空间不足整组拒绝；兼容副本改变位置可能改变旧跨区战果，不承诺胜负保持。取消仍保护原autosave。详见V2-MIGRATION.md。

## 同条件性能，未达项公开保留

两个后端各7场×3次×前后，共84场正式A/B；统一1920×1080、DPR1、auto、请求1×、固定编队/种子、12秒墙钟/自然结束停测。1%low为最慢1%RAF间隔平均的倒数。真实可见PNG两队像素/运动与有限状态门禁均核验。V2画布约多10%像素，属于完整产品对照，不把所有差异归因alpha；同V2 UI alpha单变量三次实验另表。下表长帧为修后三场总和、最大为三场最大值；完整7场每次范围、step/draw、p95/p99与原始RAF见性能报告和JSON。

|后端/场景|FPS前→后|1%low前→后|模拟速度前→后|后最长ms|后>50/>100/>250/>500ms|
|---|---:|---:|---:|---:|---|
|SwiftShader 1v1|23.36→36.08|5.82→9.38|0.976→0.999×|183.4|217/4/0/0|
|SwiftShader 100v100|23.79→37.43|5.94→14.30|0.973→0.999×|83.3|157/0/0/0|
|SwiftShader 300v300|23.34→31.53|6.21→12.79|0.977→0.911×|550.0|41/18/9/1|
|SwiftShader 600v600|21.72→22.43|11.94→12.94|1.001→1.000×|116.7|164/1/0/0|
|AMD D3D11 100v100|60.00→60.00|59.52→59.52|1.000→0.999×|16.8|0/0/0/0|
|AMD D3D11 600v600|31.04→28.33|19.01→16.85|1.001→1.001×|66.7|49/0/0/0|

软件小场改善；软件300v300一次19.50FPS、0.733×、550ms长帧真实失败，三轮均值0.911×，实时≥0.95门槛失败，触发尚未完全定位且没有并行浏览器/构建/压缩证据可归为干扰。软件500/600与硬件600未达30目标；不能写全部绿色。实际AMD小场修前已60，V2未全面提速，大场FPS略降。

先profile再优化：trace支持软件raster/present瓶颈，未盲改模拟空间网格。alpha同V2 UI受控100v100提高28.7%FPS/59.9%low；desynchronized虽59.75FPS但合成为空，拒绝且保留失败。CPU hint在AMD600v600 true/false三次几乎无差异，保留原值。模拟/单位数据源无差异，固定步长/唯一时钟/胜负/人数未为成绩改动。

自然长测181.408墙钟/180.000模拟（0.992×）、9局完成、8次自然完成重赛；逐局完整结果JSON一致。观察段最大RAF150ms，含进程/CDP/截图探针边界最大1416.7ms明确是测量边界，不伪称游戏长帧。状态/对象池有限，页面错误0。JS堆增加约12.07MiB且有回落，未强制GC，不证明无泄漏；进程CPU/WorkingSet/PrivateMemory与DOM监听/节点原始读数均保留。

1200布阵最终7个可信输入到下一RAF为6.1–14.9ms，浏览器EventTiming样本24–56ms。之前同类7样本6.0–310.4ms的慢样本仍保留在visual-final/visual-and-input.json，不用最后一次较快结果宣称稳定低延迟。缺少同口径V1输入延迟基线；这些均不是物理输入到光子的测量，不宣称输入延迟前后改善。最终36混编观察16种特效、9个实际跨中线实体。

## 未验证与跳过

- 实际后台切页：无头及一次有头bringToFront均未让document.hidden变true；源码/生产各跳过1项，未通过派发假的visibilitychange冒充实际生命周期。现有处理器静态可见，真实OS切换暂停与返回需另验。
- Android模拟器已连接（Android14、Chrome113），Maestro inspect驱动启动超时，随后ADB启动Chrome被自动审批以blocked by policy拒绝。没有绕过，没有原生浏览器成绩。物理Android/iOS、实体4K屏幕、Firefox/Safari、扬声器听感/耳机、连续数小时长期泄漏、新手用户研究未验证。记录见android-attempt.json。
- 1200人仅保护上限，不承诺流畅；保留渲染LOD与手动画质选择，没有改人数/数值/假静态士兵。

## 17项最终审查回答

|问题|回答与证据|
|---|---|
|同兵三次操作部署两军|是，真实输入mainOperations3；非新人研究|
|任意落点分队/禁放与原因|所测是，世界坐标/DPR2、半径36种边界；不能据此宣称所有浏览器|
|所有准备入口绝不跨区|严格共用验证；Node与E2E覆盖点击/笔刷/矩阵/高级/导入/随机/历史|
|战中可跨中线|是，自然36兵战斗记录实际越线，无模拟边界改动|
|默认左画右删一次撤销|是，48人手势、两侧删除、一次undo|
|手机单双指|触控模拟通过；原生模拟器/真机受阻，未验证|
|36单图鉴/小图标|单一中性库，全部36实际渲染与六视口截图；未做用户辨识统计|
|默认信息降复杂度|三模式、只读人数、收起高级；关键触控≥44px，截图复核|
|人数/战局/胜方/重赛|真实开始、暂停、自然结果、重赛、返回路径已测|
|焦点/搜索/粘贴原修复|全部保留，原生键盘与真实输入回归通过|
|V1与旧跨区无静默丢失|合法直接读、精确备份/只读预览/显式副本；E2E与领域回归|
|离线/友军/确定性/1200/固定步长|通过所测门禁，数值与模拟源码未改变；非全设备保障|
|先profile且可见自然推进|是，84样本+控制实验+trace+长测，拒绝空白高FPS|
|所有性能维度同时改善|**否**；硬件大场及软件300失败保留，输入无前基线，不能声称全改善|
|桌面/320/4K检查|六模拟视口真实截图、关键目标遮挡检查；实体4K未测|
|真实AI生图及转化|是，三PNG/精确prompt/采用与排除记录；无运行时位图|
|源码/dist/HTML/ZIP/commit一致|以build-final及最终manifest/CRC/逐文件SHA核验；本地提交未推送|

## 交接

完整源码、保留测试、dist、离线HTML、文档、三张AI设计参考、原始基线/失败/最终截图、性能JSON/trace和长测记录随GEOBATTLE-V2-DELIVERY.zip交付。ZIP不含node_modules或.git；原v1根ZIP留在原工作区，历史tracked证据与修前source.zip随V2包保留。解压后双击离线HTML；源码npm ci可复现。

脚本只接受干净HEAD，检查源码SHA、四构建散列和嵌入字节再打包；manifest记录每个文件大小/SHA和commit，文件自散列省略以避免循环。包外DELIVERY-GIT-STATE.json记录ZIP自身SHA。最终逐文件/CRC验收记录在包外DELIVERY-VERIFICATION.json。
