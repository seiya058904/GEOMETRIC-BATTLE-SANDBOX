import {UNIT_LIST,CATEGORIES} from '../data/units.js';
import {drawUnitIcon} from '../render/renderer.js';
import {esc} from './icons.js';
export const ROLE_LABEL={melee:'近战先锋',ranged:'远程火力',heavy:'重型单位',charger:'冲锋突破',skirmisher:'侧翼游击',support:'团队治疗',summoner:'召唤支援',decoy:'战术诱饵'};
export function renderCategories(app){
  const container=document.getElementById('categories');
  if(container.dataset.categoriesReady!=='true'){
    container.innerHTML=CATEGORIES.map(c=>`<button data-action="category" data-category="${c.id}" title="${c.subtitle}" aria-pressed="false">${c.name}</button>`).join('');
    container.dataset.categoriesReady='true';
  }
  for(const button of container.querySelectorAll('[data-action="category"]')){
    const active=button.dataset.category===app.category;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
}
export function renderCatalog(app){
  const q=app.search.trim().toLowerCase();
  const units=UNIT_LIST.filter(u=>q?`${u.name} ${ROLE_LABEL[u.role]||''} ${u.role} ${u.description} ${u.id} ${u.skill||''} ${u.category} ${CATEGORIES.find(c=>c.id===u.category)?.name||''}`.toLowerCase().includes(q):u.category===app.category);
  const container=document.getElementById('catalog-list');
  container.setAttribute('aria-label',`${units.length} 种兵种`);
  const key=`${app.mode}|${app.category}|${q}`;
  if(container.dataset.catalogKey===key){
    for(const card of container.querySelectorAll('[data-action="unit"]')){
      const selected=card.dataset.type===app.type;
      card.classList.toggle('selected',selected);
      card.setAttribute('aria-pressed',String(selected));
      card.disabled=app.mode!=='PREPARING';
    }
    return;
  }
  container.dataset.catalogKey=key;
  container.innerHTML=units.length?units.map(u=>`<button data-action="unit" data-type="${u.id}" class="unit-card ${app.type===u.id?'selected':''}" ${app.mode!=='PREPARING'?'disabled':''} aria-label="选择${esc(u.name)}，${esc(ROLE_LABEL[u.role]||'单位')}" aria-pressed="${app.type===u.id}"><canvas data-unit-icon="${u.id}" width="78" height="78" aria-hidden="true"></canvas><span class="unit-copy"><span class="unit-name">${esc(u.name)}</span><span class="unit-role">${esc(ROLE_LABEL[u.role]||'自由兵种')} · ${esc(u.skill||u.description)}</span></span><span class="cost" title="强度参考，不限制部署">${u.cost.toLocaleString()}</span></button>`).join(''):'<div class="empty-search"><strong>没有找到兵种</strong><span>试试兵种名称、角色或技能关键词。</span></div>';
  // A type is one identity in the library. Team color is revealed only by the battlefield preview.
  for(const canvas of container.querySelectorAll('canvas'))drawUnitIcon(canvas,canvas.dataset.unitIcon,'neutral');
}
