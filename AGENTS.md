# Project Instructions

## Project and verification

- This is a JavaScript Canvas 2D browser sandbox. Preserve seeded combat, formation saves and the standalone offline distribution; inspect `src/`, `tests/` and the README for the affected area.
- Use Node 22 or newer and the existing dependency lock. For relevant changes run `npm run check`, `npm test` and `npm run build`; choose browser/offline checks proportionately from the README. Browser scripts require an existing Playwright module and compatible Chromium, selected through `PLAYWRIGHT_MODULE` and optionally `PLAYWRIGHT_EXECUTABLE`.
- CI verifies source and distribution artifacts; a successful CI run does not replace real browser or device acceptance. `main` Pages deployment and all other remote writes require the user's current authorization. Preserve user saves and unrelated changes.

## 已知问题处理决定

- 2026-10-24 审计 A02（2026-11-05 复核编号 AG-GEO-K01）：同源旧标签页可将另一页已保存的新布阵覆盖回旧自动存档。2026-11-05 经用户授权已修复：`PresetStore.saveAutosave` 写入前比对本页最后读取/写入的存档原文，不一致则返回 `code: 'stale'` 且不写入（刷新页面可载入最新布阵）；回归见 `tests/editor.test.js` 的 A02 用例。局限：localStorage 无跨标签事务，比对与写入之间的极短窗口无法完全串行化。

## Browser tool selection

- Prefer Ego Browser for exploratory navigation, visual review and interactive checks when available. Use Playwright for repeatable regression, CI, isolation, request interception or other automation requiring its APIs; combine tools when useful. If Ego is unavailable, use a suitable existing browser tool.
- Keep this repository's required browser commands, versions, profiles and safety boundaries; an exploratory check does not replace required automated tests. Do not alter real user data or production state for testing. Report the tools, coverage and any untested paths.
