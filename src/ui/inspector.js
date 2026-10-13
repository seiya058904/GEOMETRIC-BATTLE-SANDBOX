import {UNIT_MAP,CATEGORIES,MAX_UNITS} from '../data/units.js';
import {drawUnitIcon} from '../render/renderer.js';
import {button,esc} from './icons.js';
import {ROLE_LABEL} from './catalog.js';
const n=v=>Number(v||0).toLocaleString('zh-CN',{maximumFractionDigits:0});
const AI={AcquireTarget:'寻找目标',Approach:'接近敌人',Reposition:'调整站位',Attack:'攻击',Cast:'施放技能',RetreatBriefly:'短暂后撤',Staggered:'硬直',KnockedDown:'倒地',Recover:'恢复',Dead:'已阵亡',Decoy:'诱饵待命',Reload:'弹匣换弹'};
export function renderInspector(app){
  const container=document.getElementById('inspector-content');
  if(app.mode!=='PREPARING'){renderBattleInspector(app,container);return;}
  const focused=container.contains(document.activeElement)?document.activeElement:null;
  const focusedId=focused?.id||'';
  const focusedAction=focused?.dataset?.action||'';
  const focusOccurrence=focusedAction?[...container.querySelectorAll(`[data-action="${focusedAction}"]`)].indexOf(focused):-1;
  const advancedOpen=container.querySelector('[data-inspector-advanced]')?.open??false;
  const selection=app.editor.selection.size;const deployed=selection===1?app.editor.formation.units.find(unit=>app.editor.selection.has(unit.id)):null;const u=UNIT_MAP[deployed?.type||app.type];
  document.getElementById('inspector-title').textContent=selection?`选中 ${selection} 个单位`:'单位详情';
  container.innerHTML=`${app.experiment?`<div class="experiment-context"><strong>${esc(app.experiment.title)}</strong>${esc(app.experiment.watch)}</div>`:''}${selection?`<section class="selection-quick" aria-label="选中单位操作"><strong>已选中 ${selection} 个单位</strong><div>${button('copy','复制','copy')}${button('delete','删除选中','trash')}${button('mirror','镜像到对侧','mirror')}</div></section>`:''}
    <section class="unit-overview" aria-label="${esc(u.name)}单位资料">
      <div class="unit-hero"><canvas id="detail-icon" width="228" height="228" aria-hidden="true"></canvas><div><h3>${esc(u.name)}</h3><p>${esc(CATEGORIES.find(c=>c.id===u.category)?.name)} · ${esc(ROLE_LABEL[u.role])}</p>${deployed?`<p data-selected-team="${deployed.team}" class="${deployed.team}">${deployed.team==='red'?'红军 ●':'蓝军 ■'} · #${deployed.id}</p>`:''}</div></div>
      <p class="description"><strong>${esc(u.skill||'战斗特性')}</strong>${esc(u.description)}</p>
      <div class="stat-rows">${[['生命',u.hp],['护甲',u.armor],['攻击',u.damage],['间隔',`${u.cooldown}s`],['速度',u.speed],['射程',u.range]].map(([label,value])=>`<div><span>${label}</span><b>${esc(value)}</b></div>`).join('')}</div>
      <p class="side-note">参考成本 ${n(u.cost)} · 不限制部署</p>
      ${deployed?button('deploy-same',`部署同类${u.name}`,'brush',`data-type="${u.id}" class="primary full-width"`):button('deploy-current','继续部署','brush','class="primary full-width"')}
      <p class="deployment-hint">在兵种库选中一次，再点红侧和蓝侧。半场决定队伍。</p>
    </section>
    <details class="inspector-group advanced-group" data-inspector-advanced ${advancedOpen?'open':''}><summary>高级编辑与军阵设置</summary>
      <div class="advanced-content">
        <label class="field-row">朝向偏转<input id="facing-input" type="number" min="-360" max="360" step="15" value="${Math.round(app.facing*180/Math.PI)}" aria-label="相对默认朝向中线的偏转角度"></label>
        <label class="field-row">阵型间距<select id="spacing-select" aria-label="阵型间距"><option value="1" ${app.spacing===1?'selected':''}>紧凑</option><option value="1.5" ${app.spacing===1.5?'selected':''}>标准</option><option value="2" ${app.spacing===2?'selected':''}>宽松</option><option value="3" ${app.spacing===3?'selected':''}>分散</option></select></label>
        <div class="selection-actions">
          ${button('tool-select','框选与移动','select','data-tool="select" aria-pressed="false"')}
          ${button('tool-line','直线编队','line','data-tool="line" aria-pressed="false"')}
          ${button('tool-grid','矩阵编队','grid','data-tool="grid" aria-pressed="false"')}
          ${button('select-red','选择红军','single')}${button('select-blue','选择蓝军','single')}
          ${button('copy','复制','copy',selection?'':'disabled')}${button('paste','粘贴','copy',app.editor.canPaste?'':'disabled')}
          ${button('delete','删除选中','trash',selection?'':'disabled')}${button('rotate-left','转 −15°','rotate',selection?'':'disabled')}${button('rotate-right','转 +15°','rotate',selection?'':'disabled')}
          ${button('mirror','镜像到对侧','mirror',selection?'':'disabled')}${button('swap','对调两军','swap')}
        </div>
        <p class="side-note">选中单位的副本与镜像会根据目标位置重新校验队伍和部署区域。</p>
        <div class="selection-actions team-actions">${button('clear-red','清空红半场','trash')}${button('clear-blue','清空蓝半场','trash')}${button('clear-all','清空双方','trash')}${button('mirror-all','左右镜像','mirror')}</div>
        <label class="field-row">本场随机种子<input id="seed-input" type="number" min="0" max="4294967295" step="1" value="${app.editor.formation.seed}" aria-label="战斗随机种子"></label>
        <div class="form-inline">${button('new-seed','更换种子','shuffle','class="quiet"')}<span class="side-note">同军阵、同种子和同构建可复现战斗。容量上限 ${MAX_UNITS}，召唤物也计入。</span></div>
      </div>
    </details>`;
  drawUnitIcon(document.getElementById('detail-icon'),u.id,deployed?.team||'neutral');
  if(focusedId)container.querySelector(`#${focusedId}`)?.focus({preventScroll:true});
  else if(focusedAction){
    const matches=[...container.querySelectorAll(`[data-action="${focusedAction}"]`)];
    (matches[Math.max(0,focusOccurrence)]||matches[0])?.focus({preventScroll:true});
  }
}
function renderBattleInspector(app,container){
  const entity=app.selectedId!=null?app.sim?.getEntity(app.selectedId):null;
  if(!entity){
    document.getElementById('inspector-title').textContent='战场观察';
    const counts={red:0,blue:0},summons={red:0,blue:0};for(const u of app.sim?.units||[])if(u.alive){counts[u.team]++;if(u.summoned)summons[u.team]++;}
    const total=counts.red+counts.blue;
    const teamSummaries=['red','blue'].map(t=>{const s=app.sim?.teamStats?.[t],name=t==='red'?'红队':'蓝队';return `<div data-battle-team="${t}" role="group" aria-label="${name}实时统计"><div class="battle-team-row ${t}"><span>${name}当前在场</span><strong data-stat="active">${n(counts[t])}</strong></div><p class="side-note">初始 <span data-stat="initial">${n(s?.initial)}</span> · 初始阵亡 <span data-stat="initial-deaths">${n(s?.deaths)}</span><br>初始存活 <span data-stat="initial-alive">${n(s?.remaining)}</span> · 召唤在场 <span data-stat="summons-alive">${n(summons[t])}</span><br>在场含召唤 · 累计召唤 <span data-stat="summons-total">${n(s?.summoned)}</span></p></div>`;}).join('');
    container.innerHTML=`<div class="battle-side-hint">战斗由单位自主进行。<br>点击战场上的单位，查看它正在做什么。</div><div class="mini-meter"><i style="width:${total?counts.red/total*100:50}%"></i><i style="flex:1"></i></div>${teamSummaries}<div class="inspector-group" style="margin-top:25px"><h3>观察方式</h3><p class="description">拖动平移，滚轮缩放。<br>点击任一单位查看目标、伤害和冷却。选择“跟随单位”可锁定镜头。<br><br>暂停会冻结物理、生命和特效，仍可移动相机。</p></div><div class="inspector-group"><h3>复现种子</h3><p class="description">${app.battleFormation?.seed??app.editor.formation.seed}</p></div>`;return;
  }
  const d=entity.def,team=entity.team==='red'?'红队':'蓝队';document.getElementById('inspector-title').textContent=entity.alive?'单位观察':'阵亡记录';
  const target=entity.targetId!=null?app.sim.getEntity(entity.targetId):null;
  container.style.setProperty('--active-team',entity.team==='red'?'var(--red)':'var(--blue)');
  const readout=`<div class="unit-hero"><canvas id="detail-icon" width="228" height="228"></canvas><h3>${d.name}</h3><p>${team}${entity.team==='red'?' ●':' ■'} · #${entity.id}${entity.summoned?' · 召唤物':''}</p></div><div class="health-track"><i style="width:${Math.max(0,Math.min(100,entity.hp/entity.maxHp*100))}%"></i></div><div class="field-row"><span>生命</span><span>${n(entity.hp)} / ${entity.maxHp}</span></div><div class="unit-live-stats">${[['护甲',n(d.armor),'armor'],['状态',entity.alive?(AI[entity.aiState]||entity.aiState):'已阵亡'],['目标',target?`${target.def.name} #${target.id}`:'正在寻找'],['攻击冷却',`${Math.max(0,entity.attackCooldown).toFixed(1)} 秒`],['技能冷却',d.skill?`${Math.max(0,entity.skillCooldown).toFixed(1)} 秒`:'无主动技能'],['击杀',n(entity.stats?.kills)],['造成伤害',n(entity.stats?.damage)],['承受伤害',n(entity.stats?.taken)],['治疗',n(entity.stats?.healing)]].map(([k,v,stat])=>`<div><span>${k}</span><b${stat?` data-stat="${stat}"`:''}>${esc(v)}</b></div>`).join('')}</div><p class="side-note">${Object.entries(entity.status||{}).filter(([,v])=>v>0).map(([k,v])=>`${{burn:'燃烧',slow:'减速',stun:'眩晕',fear:'恐惧',knockdown:'倒地'}[k]||k} ${Number(v).toFixed(1)}s`).join(' · ')||'无负面状态'}</p>`;
  // Keep observation controls mounted while refreshing live stats, so keyboard
  // focus and native button activation survive the periodic HUD update.
  const key=`${entity.id}:${entity.type}:${entity.team}`;
  let readoutNode=container.querySelector('[data-battle-readout]');
  if(!readoutNode||container.dataset.observedUnit!==key){
    container.innerHTML=`<div data-battle-readout></div><div class="dialog-actions">${button('follow','跟随单位','target')}${button('deselect','取消选择','close')}</div><p class="description">${d.description}</p>`;
    container.dataset.observedUnit=key;readoutNode=container.querySelector('[data-battle-readout]');
  }
  readoutNode.innerHTML=readout;
  const follow=container.querySelector('[data-action="follow"]'),label=app.followId===entity.id?'解除跟随':'跟随单位';
  follow.disabled=!entity.alive;follow.title=label;follow.querySelector('span').textContent=label;
  drawUnitIcon(document.getElementById('detail-icon'),entity.type,entity.team);
}
