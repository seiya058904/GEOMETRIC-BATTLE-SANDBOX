import { icon, button } from './icons.js';

// `TOOLS` also supplies the controller's keyboard help text and button state.
export const TOOLS = [
  ['brush', '部署', 'brush', '左键点击或拖动部署；右键可快速擦除'],
  ['erase', '擦除', 'erase', '拖动擦除单位'],
  ['pan', '平移', 'hand', '拖动移动视野'],
  ['single', '单点', 'single', '单点部署'],
  ['line', '直线', 'line', '拖动绘制直线队列'],
  ['grid', '矩阵', 'grid', '拖动绘制矩阵队列'],
  ['select', '选择', 'select', '框选并移动单位'],
];

export function createShell(root) {
  root.classList.add('inspector-hidden');
  root.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#" aria-label="GEOBATTLE 几何战争沙盒">
        <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2 30 28H2Z" fill="none" stroke="#d3ee89" stroke-width="2"/><circle cx="10" cy="21" r="5" fill="#ff705d"/><path d="m20 11 8 14H12Z" fill="#59b7fa"/></svg>
        <span>GEO<span class="brand-light">BATTLE</span><small>几何战争沙盒</small></span>
      </a>
      <div class="scoreboard" role="group" aria-label="双方人数">
        <div class="team-counter red" title="红军人数"><i aria-hidden="true"></i><span>红军</span><strong id="red-count">0</strong></div>
        <span class="versus" aria-hidden="true">VS</span>
        <div class="team-counter blue" title="蓝军人数"><i aria-hidden="true"></i><span>蓝军</span><strong id="blue-count">0</strong></div>
      </div>
      <div class="top-actions">
        <span class="phase-label" id="phase-label">准备布阵</span>
        ${button('presets', '军阵档案', 'folder', 'class="quiet utility-action"')}
        ${button('settings', '设置', 'settings', 'class="icon-button" aria-label="设置"')}
        ${button('help', '操作说明', 'help', 'class="icon-button help-button" aria-label="操作说明"')}
        ${button('start', '开始战斗', 'play', 'class="primary start-button" id="start-button"')}
      </div>
    </header>
    <main class="workspace">
      <aside class="catalog panel" id="catalog" aria-label="兵种图鉴">
        <div class="panel-heading">
          <div><h2>兵种图鉴</h2><span class="panel-subtitle">36 种单位 · 双方共用</span></div>
          ${button('catalog-close', '关闭兵种图鉴', 'close', 'class="icon-button mobile-only"')}
        </div>
        <label class="search-field">${icon('search')}<input id="unit-search" type="search" placeholder="搜索兵种、角色或技能" aria-label="搜索兵种、角色或技能" autocomplete="off"><kbd>/</kbd></label>
        <div class="category-tabs" id="categories" role="group" aria-label="兵种类别"></div>
        <div class="catalog-list" id="catalog-list"></div>
        <div class="catalog-foot"><span class="small-dot" aria-hidden="true"></span><span>选中单位后，在战场点击或拖动部署</span></div>
      </aside>
      <section class="arena" aria-label="战场区域">
        <canvas id="battlefield" tabindex="0" aria-label="几何战争战场。选择一个兵种，点击或拖动部署；战斗时点击单位查看详情。"></canvas>
        <div class="arena-top">
          <div class="arena-label"><i id="mode-light" aria-hidden="true"></i><span id="arena-state">部署你的军队</span><span class="arena-time" id="sim-time">00:00</span></div>
          <div class="arena-top-actions">
            ${button('return', '返回布阵', 'undo', 'class="arena-button" id="return-button" hidden')}
            ${button('inspector-toggle', '详情与编辑', 'eye', 'class="arena-button" aria-controls="inspector"')}
          </div>
        </div>
        <div class="playback" id="playback" hidden aria-label="战斗速度"><span>速度</span>${[.25, .5, 1, 2, 4].map(s => `<button data-action="speed" data-speed="${s}" class="${s === 1 ? 'active' : ''}" aria-pressed="${s === 1}">${s}×</button>`).join('')}</div>
        <div class="edit-controls" aria-label="批量布阵">
          <label for="brush-size">范围</label><select id="brush-size" aria-label="部署与擦除范围" title="中、大范围可一次铺多排；擦除范围随缩放保持可见大小"><option value="small">小</option><option value="medium">中</option><option value="large">大</option></select>
          ${button('quick-clear', '清空', 'trash', 'class="arena-button" title="一键清空双方，可撤销" aria-label="一键清空双方，可撤销"')}
        </div>
        <div class="observation-controls" aria-label="观察尺度">
          ${button('inspect-close', '近看', 'eye', 'class="arena-button" title="拉近观察单位"')}
          ${button('reset-camera', '全图', 'target', 'class="arena-button"')}
        </div>
        <div class="camera-controls" aria-label="镜头缩放">
          ${button('zoom-out', '缩小', 'minus', 'class="icon-button"')}<span id="zoom-label">100%</span>${button('zoom-in', '放大', 'plus', 'class="icon-button"')}
          ${button('fit', '适配军阵', 'fit', 'class="icon-button"')}
        </div>
        <div class="arena-bottom"><span id="tool-hint">左键部署 · 右键擦除 · 滚轮缩放</span><span id="performance" hidden></span><span id="load-warning"></span></div>
        <div class="mobile-launchers">
          ${button('catalog-toggle', '兵种', 'menu', 'class="arena-button" aria-controls="catalog"')}
          ${button('presets', '军阵', 'folder', 'class="arena-button"')}
          ${button('inspector-toggle', '详情', 'eye', 'class="arena-button" aria-controls="inspector"')}
        </div>
      </section>
      <aside class="inspector panel" id="inspector" aria-label="单位详情与高级编辑">
        <div class="panel-heading"><div><h2 id="inspector-title">单位详情</h2><span class="panel-subtitle">查看属性与高级编辑</span></div>${button('inspector-close', '收起详情', 'close', 'class="icon-button"')}</div>
        <div class="inspector-content" id="inspector-content"></div>
      </aside>
    </main>
    <footer class="bottom-bar">
      <div class="scene-actions">
        ${button('random', '随机军阵', 'shuffle', 'class="quiet"')}
        ${button('undo', '撤销', 'undo', 'class="icon-button" id="undo-button" aria-label="撤销"')}
        ${button('redo', '重做', 'redo', 'class="icon-button" id="redo-button" aria-label="重做"')}
      </div>
<div class="battle-guide" id="battle-guide" hidden><strong>观察 → 调整 → 再试一次</strong><span>点击单位查看状态；暂停后仍可移动镜头。</span></div>
      <div class="deployment-tools" role="toolbar" aria-label="战场操作">
        ${[['brush', '部署', 'brush', '左键点击或拖动部署，右键擦除'], ['erase', '擦除', 'erase', '擦除单位'], ['pan', '平移', 'hand', '平移视野']].map(([id, name, ico, hint]) => button(`tool-${id}`, name, ico, `class="tool-button ${id === 'brush' ? 'active' : ''}" aria-label="${hint}" data-tool="${id}" aria-pressed="${id === 'brush'}"`)).join('')}
      </div>
      <div class="bottom-info"><span id="formation-count">0 单位</span><span class="safe-label">自动战斗 · 无友军误伤</span>${button('mute', '声音', 'sound', 'class="icon-button" id="mute-button" aria-label="声音"')}</div>
    </footer>
    <div id="drawer-backdrop" class="drawer-backdrop" hidden></div>
    <div id="toast" role="status" aria-live="polite"></div>
    <dialog id="dialog" aria-labelledby="dialog-title"></dialog>
    <input id="import-file" type="file" accept=".json,.geobattle.json,application/json" hidden>
  `;
}
