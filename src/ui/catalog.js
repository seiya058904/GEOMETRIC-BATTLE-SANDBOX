import {UNIT_LIST,CATEGORIES} from '../data/units.js';
import {drawUnitIcon} from '../render/renderer.js';
import {esc} from './icons.js';
export const ROLE_LABEL={melee:'近战先锋',ranged:'远程火力',heavy:'重型单位',charger:'冲锋突破',skirmisher:'侧翼游击',support:'团队治疗',summoner:'召唤支援',decoy:'战术诱饵'};
export function renderCategories(app){
  document.getElementById('categories').innerHTML=CATEGORIES.map(c=>`<button data-action="category" data-category="${c.id}" class="${app.category===c.id?'active':''}" title="${c.subtitle}">${c.name}</button>`).join('');
}
export function renderCatalog(app){
  const q=app.search.trim().toLowerCase();
  const units=UNIT_LIST.filter(u=>q?`${u.name} ${u.description} ${u.id} ${u.skill||''}`.toLowerCase().includes(q):u.category===app.category);
  const container=document.getElementById('catalog-list');
  container.style.setProperty('--active-team',app.team==='red'?'var(--red)':'var(--blue)');
  container.innerHTML=units.length?units.map(u=>`<button data-action="unit" data-type="${u.id}" class="unit-card ${app.type===u.id?'selected':''}" ${app.mode!=='PREPARING'?'disabled':''} aria-label="选择${esc(u.name)}" aria-pressed="${app.type===u.id}"><canvas data-unit-icon="${u.id}" width="78" height="78" aria-hidden="true"></canvas><span><span class="unit-name">${u.name}</span><span class="unit-role">${u.skill||ROLE_LABEL[u.role]||'自由兵种'}</span></span><span class="cost" title="参考成本，不限制部署">${u.cost.toLocaleString()}</span></button>`).join(''):'<div class="empty-search">没有找到相应兵种。<br>试试「坦克」「击退」或「召唤」。</div>';
  for(const canvas of container.querySelectorAll('canvas'))drawUnitIcon(canvas,canvas.dataset.unitIcon,app.team);
}
