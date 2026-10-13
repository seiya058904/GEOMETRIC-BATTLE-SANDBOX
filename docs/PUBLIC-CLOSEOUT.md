# GEOBATTLE 公开与 GitHub Pages 收尾

2026-10-13，Asia/Shanghai。用户授权原仓库公开、功能分支快进集成、GitHub Pages、README 和公开元数据整理。本次不改玩法、单位数值、模拟/渲染核心或存档协议，不制作 APK、Release/tag 或新 ZIP；不删除历史分支与证据。

## 公开前闸门：PASS

目标经 Git 与 GitHub API 双重核对为 `seiya058904/GEOMETRIC-BATTLE-SANDBOX`。执行前 Private、默认main=`924150f922e5da2cff1000aa5bb034fb34b32701`，功能分支=`8b548a81ae20850b8ea29b8afd146f71d78bcdc6`，ahead4/behind0；6个正式历史提交，无stash、一个工作树，无已有Actions运行，Pages API返回404。用户附件是唯一未跟踪输入，保留在本机，通过 `.git/info/exclude` 排除；未纳入公开提交。

| 检查 | 范围与结果 |
| --- | --- |
| 历史与refs | 扫描所有可达本地refs，包括两条正式分支及Codex本地快照；1402个唯一blob，约350.90 MB历史blob。正式远端只有main与功能分支，无tag |
| 秘密与隐私 | 检查提供商token、私钥、凭据赋值、Bearer、会话cookie、JWT、文本邮箱与联系方式候选；0候选。提交邮箱为GitHub noreply。无害本机路径仅属交付文档/本地附件，未作为README公网链接 |
| 归档 | 两份baseline-source.zip全部209个成员读取并扫描，内容均为本项目源码/文档/游戏证据；三份gzip trace完整解压并扫描，解压合计385.22 MB。含归档累计扫描约750.49 MB，未跳过加密或未知二进制 |
| 图片 | 1020张历史/归档图片，去重963张；16页联系表逐页检查，均为本项目UI/战斗/测试画面与5张已记录的AI概念参考。图片无附带元数据字段，未见私人桌面/浏览器会话或其他作品截图 |
| 素材与许可 | 运行画面、图标和音效为程序化代码；无外部字体/商业音轨/游戏素材包。5张AI参考的生成记录在design；README使用本项目新截取的真实画面。esbuild是MIT开发依赖，不包含在游戏运行时模块中。未发现需要阻断公开的第三方许可缺口 |
| 仓库体积 | 原1750个跟踪文件，共413,194,528 bytes，其中evidence403,783,204 bytes；保留已有历史。Pages仅上传dist，不发布证据目录。未来可单独设计证据归档方案，本次未重写历史 |

本机未安装gitleaks/trufflehog；使用自定义Python规则扫描、Git对象读取、ZIP/gzip逐成员扫描及图像/来源人工复核。PASS表示本次完整范围内未发现实际阻断风险，不是永远不存在秘密/版权问题的保证。原始详细对象、归档、脱敏元数据及联系表存于本轮本机证据目录。

**Public不等于开源授权。** 没有增加MIT/GPL/Apache等项目许可证；README明确未声明项目级LICENSE。公开范围为既有原仓库及合法历史，未另建仓库规避风险。

## README 与发布实现

实际读取四个参考项目最新默认main分支README：Dont-stop（`a004f833`）、INSTANCE（`40b370be`）、Hardware-Monitoring（`400d6bcd`）、个人站（`68217db5`）。采用中心入口、玩家收益先于菜单、开发细节收起与真实限制/权利说明；没有复制它们的口号、图像或玩法。

README新增两张1600×900真实Chromium截图（压缩JPEG合计226,342 bytes）：默认80人布阵，及真实Start/自然RAF运行8秒/Pause/近看。源画面对应8b548a8游戏构建，后续本轮未改游戏源码和生产脚本/样式字节。截图不是概念画或模拟性能证据。

`.github/workflows/pages.yml` 使用Node24、npm ci/check/test/build、生产校验、configure-pages@v5、upload-pages-artifact@v4与deploy-pages@v4。PR只构建，main push及main上的手动运行才部署；部署经needs串行，并使用github-pages环境和限定权限。不默认在无Playwright的CI中运行浏览器脚本。

`scripts/prepare-pages.mjs` 检查非空的相对路径生产入口、JS/CSS与离线嵌入一致，暂存离线HTML供公网访问，输出包含部署commit及四产物SHA-256的build-info.json。两个暂存文件明确忽略，不替代根目录权威离线HTML，不把历史evidence打包进网站。

当前生产固定字节：game.js=`b517fe3046fcad794729d1bd907a31a4168ba84c8377f19c194289e895bd130c`；style.css=`64797a37f2dbadd06ea751a18dd87c3a280e6194227a3957ddc2bcdea0dd40fa`；离线HTML=`17f4bc9368d06d0c9ff698680777ea71be0bf1dccae44f1c3c084e6e43c3e5ab`。本地与线上验收将在下面追加。

## 验收与发布状态

最终提交前串行门禁通过：语法检查、275/275 Node、生产浏览器73通过/0失败/1跳过、V3 UI 12/12、批量编辑9/9、离线3/3（外部请求0、错误0）、缓存34/34、生产/离线字节一致、diff-check。六要求视口的控件与抽屉实测通过；73项回归另覆盖4K/DPR2、36兵种、取消/撤销、存档、自然战斗/结算/重赛。测试输出分别在本轮local-regression、local-ui、local-bulk、local-offline、local-cache及build-final.json。GitHub Markdown API实际渲染README，12个本地文件链接与两个手写锚点校验通过；公网图片与窄屏将在公开后实际检查。

**PUBLIC & DEPLOYED / CLEAN & SYNCED。** 原仓库已实际设为Public，Pages发布源已通过API确认为`build_type: workflow`，HTTPS启用。原main安全快进924150f→c86b290，没有重写四个既有功能提交；首次上线完整SHA为`c86b290720a510657342010985902b55cdae1a6c`，[对应Actions](https://github.com/seiya058904/GEOMETRIC-BATTLE-SANDBOX/actions/runs/38354492531)的build/deploy均成功。最后收尾提交仅补充本报告，随后正常推送功能分支并再次快进main；最终main与功能分支相同，保留功能分支。当前精确发布SHA可从[线上build-info.json](https://seiya058904.github.io/GEOMETRIC-BATTLE-SANDBOX/build-info.json)及[Pages工作流](https://github.com/seiya058904/GEOMETRIC-BATTLE-SANDBOX/actions/workflows/pages.yml)核对，避免文档自身提交散列循环。

- [公开仓库](https://github.com/seiya058904/GEOMETRIC-BATTLE-SANDBOX)、[在线游戏](https://seiya058904.github.io/GEOMETRIC-BATTLE-SANDBOX/)、[最终README](https://github.com/seiya058904/GEOMETRIC-BATTLE-SANDBOX/blob/main/README.md)已匿名访问。About描述、六个实际相关topics与验证过的homepage已写入并重新查询。
- 正式子路径下完整生产回归**73通过/0失败/1跳过**、UI**12/12**、批量编辑**9/9**。真实鼠标/触点验证选兵、左右半场、中线保护、大范围部署/扫擦、松手、整笔撤销/重做、第二指取消、战斗锁定、自然结算、暂停、重赛、返回、保存与刷新。来源URL为实际Pages路径；没有用localhost替代线上。
- 额外公开/产物/README专项**5/5**：匿名API确认Public，线上build-info.commit匹配本地HEAD；入口、JS、CSS、离线HTML均200且MIME正确，四文件SHA与本地逐一一致；生产子路径加载/刷新与默认军阵战斗；公网单HTML加载只请求自身；GitHub实际README渲染、主试玩链接、两个锚点、两图匿名200/自然宽度、390px正文不横向溢出。页面错误0；桌面与手机截图保留。
- 第一次README专项的额外图片HTTP请求发生`ECONNRESET`，当次4通过/1失败；浏览器图片已加载，但没有将这一失败冒称通过。请求诊断保留错误类别并移除匿名会话请求头；增加有限网络重试后，保持原图像/HTTP/布局断言完整重跑5/5通过。记录为public-site-first-redacted.json与public-site-accepted.json。
- 最后一份报告提交部署后再次确认Actions最终SHA成功、线上manifest与四产物散列一致、真实浏览器与README可用；文档更新没有改变已完整实测的游戏字节。最终本地main工作区干净，origin/main...main为0/0；功能分支也同步。测试进程/服务器关闭，仅清理本轮拥有的dist暂存副本，保留所有用户ZIP、附件、历史记录与测试JSON。没有新ZIP、Release、tag、PR或APK。

线上证据位于online-regression、online-ui、online-bulk、public-site-accepted.json及最后public-site-final.json；离线与本地证据在上述local-*目录。SHA清单包括下载离线单HTML，不只是主页首屏截图。

本轮证据目录：`C:/Users/admin/.codex/visualizations/2026/10/13/01a1339d-24ca-7dd1-907d-70c279bb0a46/public-closeout/`。这是本机交付定位，不是公网证据链接；公众可查看本报告及仓库已有evidence。

## 保留限制

真实后台切页旧跳过、Android/iOS真机、Firefox/Safari与物理声音听感未验证。300v300波动和历史软件550ms长帧未确认根治；此前同机三轮58.26→57.07 FPS（-2.04%）对应相同游戏字节，本次不修改模拟或核心渲染，未重跑600秒或大规模矩阵。不以本次发布表示历史性能/设备门禁全部绿色。

官方依据：[仓库可见性](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)、[自定义Pages工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[发布源设置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。
