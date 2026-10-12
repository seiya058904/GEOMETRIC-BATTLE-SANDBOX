import {icon,button} from './icons.js';
export const TOOLS=[['single','放置','single','点击放置单个单位'],['brush','笔刷','brush','按住并拖动，连续部署'],['line','直线','line','拖动绘制等距军阵'],['grid','矩阵','grid','拖动区域，自动排列'],['select','选择','select','框选本方单位；拖动选区移动'],['erase','擦除','erase','拖动擦除当前阵营'],['pan','镜头','hand','拖动画布，双指缩放']];
export function createShell(root){
root.innerHTML=`
  <header class="topbar">
    <a class="brand" href="#" aria-label="GEOBATTLE 几何战争沙盒"><svg width="29" height="30" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2 30 28H2Z" fill="none" stroke="#d3ee89" stroke-width="2"/><circle cx="10" cy="21" r="5" fill="#ff705d"/><path d="m20 11 8 14H12Z" fill="#59b7fa"/></svg><span>GEO<span class="brand-light">BATTLE</span><small>几何战争沙盒</small></span></a>
    <div class="scoreboard" aria-label="阵营人数">
      <button data-action="team-red" class="team-counter red active" title="切换到红队"><i></i><span>红队</span><strong id="red-count">0</strong></button>
      <span class="versus">VS</span>
      <button data-action="team-blue" class="team-counter blue" title="切换到蓝队"><i></i><span>蓝队</span><strong id="blue-count">0</strong></button>
    </div>
    <div class="top-actions">
      <span class="phase-label" id="phase-label">准备布阵</span>
      ${button('presets','军阵','folder','class="quiet utility-action"')}
      ${button('settings','设置','settings','class="icon-button" aria-label="设置"')}
      ${button('help','操作说明','help','class="icon-button help-button" aria-label="操作说明"')}
      ${button('start','开始战斗','play','class="primary start-button" id="start-button"')}
    </div>
  </header>
  <main class="workspace">
    <aside class="catalog panel" id="catalog" aria-label="兵种目录">
      <div class="panel-heading"><h2>兵种库 <span>36</span></h2>${button('catalog-close','关闭兵种库','close','class="icon-button mobile-only"')}</div>
      <div class="team-switch" aria-label="当前部署阵营"><button class="active red" data-action="team-red"><i></i>红队 <kbd>1</kbd></button><button class="blue" data-action="team-blue"><i></i>蓝队 <kbd>2</kbd></button></div>
      <label class="search-field">${icon('search')}<input id="unit-search" type="search" placeholder="搜索兵种或技能" aria-label="搜索兵种或技能" autocomplete="off"><kbd>/</kbd></label>
      <div class="category-tabs" id="categories" role="group" aria-label="兵种分类"></div>
      <div class="catalog-list" id="catalog-list"></div>
      <div class="catalog-foot"><span class="small-dot"></span> 全部已解锁 · 自由混编 <b>∞</b></div>
    </aside>
    <section class="arena" aria-label="战场区域">
      <canvas id="battlefield" tabindex="0" aria-label="几何战争战场。选择兵种后点击放置，拖动部署工具创建军阵。"></canvas>
      <div class="arena-top"><div class="arena-label"><i id="mode-light"></i><span id="arena-state">部署你的军队</span><span class="arena-time" id="sim-time">00:00</span></div><div class="arena-top-actions">${button('return','返回布阵','undo','class="arena-button" id="return-button" hidden')}${button('inspector-toggle','详情','eye','class="arena-button"')}</div></div>
      <div class="playback" id="playback" hidden aria-label="战斗速度"><span>倍速</span>${[.25,.5,1,2,4].map(s=>`<button data-action="speed" data-speed="${s}" class="${s===1?'active':''}">${s}×</button>`).join('')}</div>
      <div class="camera-controls">${button('zoom-out','缩小','minus','class="icon-button"')}<span id="zoom-label">100%</span>${button('zoom-in','放大','plus','class="icon-button"')}${button('fit','适配军阵','fit','class="icon-button"')}${button('reset-camera','全图','target','class="icon-button"')}</div>
      <div class="arena-bottom"><span id="tool-hint">点击放置 · 滚轮缩放 · 右键拖动画布</span><span id="performance" hidden></span><span id="load-warning"></span></div>
      <div class="mobile-launchers">${button('catalog-toggle','兵种','menu','class="arena-button"')}${button('presets','军阵','folder','class="arena-button"')}</div>
    </section>
    <aside class="inspector panel" id="inspector" aria-label="单位详情">
      <div class="panel-heading"><h2 id="inspector-title">单位详情</h2>${button('inspector-close','收起详情','close','class="icon-button"')}</div>
      <div class="inspector-content" id="inspector-content"></div>
    </aside>
  </main>
  <footer class="bottom-bar">
    <div class="scene-actions">${button('random','随机大战','shuffle','class="quiet"')}${button('undo','撤销','undo','class="icon-button" id="undo-button"')}${button('redo','重做','redo','class="icon-button" id="redo-button"')}</div>
    <div class="deployment-tools" role="toolbar" aria-label="部署工具">${TOOLS.map(([id,name,ico,hint])=>button(`tool-${id}`,name,ico,`class="tool-button ${id==='single'?'active':''}" aria-label="${hint}" data-tool="${id}"`)).join('')}</div>
    <div class="bottom-info"><span id="formation-count">0 单位</span><span class="safe-label">无友军误伤</span>${button('mute','声音','sound','class="icon-button" id="mute-button"')}</div>
  </footer>
  <div id="drawer-backdrop" class="drawer-backdrop" hidden></div>
  <div id="toast" role="status" aria-live="polite"></div>
  <dialog id="dialog" aria-labelledby="dialog-title"></dialog>
  <input id="import-file" type="file" accept=".json,.geobattle.json,application/json" hidden>
`;
}
