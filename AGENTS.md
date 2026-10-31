# Project Instructions

## Project and verification

- This is a JavaScript Canvas 2D browser sandbox. Preserve seeded combat, formation saves and the standalone offline distribution; inspect `src/`, `tests/` and the README for the affected area.
- Use Node 22 or newer and the existing dependency lock. For relevant changes run `npm run check`, `npm test` and `npm run build`; choose browser/offline checks proportionately from the README. Browser scripts require an existing Playwright module and compatible Chromium, selected through `PLAYWRIGHT_MODULE` and optionally `PLAYWRIGHT_EXECUTABLE`.
- CI verifies source and distribution artifacts; a successful CI run does not replace real browser or device acceptance. `main` Pages deployment and all other remote writes require the user's current authorization. Preserve user saves and unrelated changes.

## 已知问题处理决定

- 2026-10-24 审计 A02：已知同源旧标签页可将另一页已保存的新布阵覆盖回旧自动存档；用户决定本轮不修，未经用户重新授权不要自动修复或重构保存协议。

## Browser tool selection

- Prefer Ego Browser for exploratory navigation, visual review and interactive checks when available. Use Playwright for repeatable regression, CI, isolation, request interception or other automation requiring its APIs; combine tools when useful. If Ego is unavailable, use a suitable existing browser tool.
- Keep this repository's required browser commands, versions, profiles and safety boundaries; an exploratory check does not replace required automated tests. Do not alter real user data or production state for testing. Report the tools, coverage and any untested paths.
