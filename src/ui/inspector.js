import {UNIT_MAP,CATEGORIES,MAX_UNITS} from '../data/units.js';
import {drawUnitIcon} from '../render/renderer.js';
import {button,esc} from './icons.js';
import {ROLE_LABEL} from './catalog.js';
const n=v=>Number(v||0).toLocaleString('zh-CN',{maximumFractionDigits:0});
const AI={AcquireTarget:'寻找目标',Approach:'接近敌人',Reposition:'调整站位',Attack:'攻击',Cast:'施放技能',RetreatBriefly:'短暂后撤',Staggered:'硬直',KnockedDown:'倒地',Recover:'恢复',Dead:'已阵亡',Decoy:'诱饵待命',Reload:'弹匣换弹'};
export function renderInspector(app){
  const container=document.getElementById('inspector-content');
  if(app.mode!=='PREPARING'){renderBattleInspector(app,container);return;}
  const u=UNIT_MAP[app.type];const selection=app.editor.selection.size;
  document.getElementById('inspector-title').textContent=selection?`选中 ${selection} 个单位`:'单位详情';
  container.innerHTML=`<div class="unit-hero"><canvas id="detail-icon" width="228" height="228" aria-hidden="true"></canvas><h3>${u.name}</h3><p>${CATEGORIES.find(c=>c.id===u.category)?.name} · ${ROLE_LABEL[u.role]}</p></div>
    <div class="stat-rows">${[['生命',u.hp],['护甲',u.armor],['攻击',u.damage],['间隔',u.cooldown+'s'],['速度',u.speed],['射程',u.range]].map(([label,value])=>`<div><span>${label}</span><b>${value}</b></div>`).join('')}</div>
    <div class="description"><strong>${u.skill||'战斗特性'}</strong>${u.description}</div>
    <div class="inspector-group"><h3>部署设置</h3><label class="field-row">面向角度<input id="facing-input" type="number" min="-360" max="360" step="15" value="${Math.round(app.facing*180/Math.PI)}" aria-label="部署面向角度"></label>
    <label class="field-row">阵型间距<select id="spacing-select" aria-label="阵型间距"><option value="1" ${app.spacing===1?'selected':''}>紧凑</option><option value="1.5" ${app.spacing===1.5?'selected':''}>标准</option><option value="2" ${app.spacing===2?'selected':''}>宽松</option><option value="3" ${app.spacing===3?'selected':''}>分散</option></select></label>
    <label class="field-row">自由部署<input id="free-deploy" type="checkbox" ${app.settings.freeDeploy?'checked':''} aria-label="自由部署（双方不限区域）"></label>
    ${button('deploy-current','在战场上部署','single','class="primary full-width"')}<p class="side-note">参考成本 ${u.cost} · 无限预算<br>双方均可放在任意合法空位。建议区没有阵营限制。</p></div>
    <div class="inspector-group"><h3>军阵编辑${selection?` · 已选 ${selection} 个`:''}</h3>
    <div class="selection-actions">${button('select-team','全选本方','select')}${button('copy','复制','copy',selection?'':'disabled')}${button('paste','粘贴','copy',app.editor.canPaste?'':'disabled')}${button('delete','删除','trash',selection?'':'disabled')}${button('rotate-left','转 −15°','rotate',selection?'':'disabled')}${button('rotate-right','转 +15°','rotate',selection?'':'disabled')}${button('mirror','镜像给对方','mirror',selection?'':'disabled')}${button('swap','交换阵营','swap')}</div>
    <p class="side-note">选择工具框选本方，拖动选区移动。<br>复制后可切换阵营再粘贴。</p></div>
    <div class="inspector-group"><h3>本场随机种子</h3><div class="form-inline"><input id="seed-input" type="number" min="0" max="4294967295" step="1" value="${app.editor.formation.seed}" aria-label="战斗随机种子">${button('new-seed','更换种子','shuffle','class="icon-button"')}</div><p class="side-note">同编队、同种子、同构建可复现战斗。<br>活动单位保护上限 ${MAX_UNITS}，召唤物同样计入。</p></div>`;
  drawUnitIcon(document.getElementById('detail-icon'),u.id,app.team);
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
  container.innerHTML=`<div class="unit-hero"><canvas id="detail-icon" width="228" height="228"></canvas><h3>${d.name}</h3><p>${team} · #${entity.id}${entity.summoned?' · 召唤物':''}</p></div><div class="health-track"><i style="width:${Math.max(0,Math.min(100,entity.hp/entity.maxHp*100))}%"></i></div><div class="field-row"><span>生命</span><span>${n(entity.hp)} / ${entity.maxHp}</span></div><div class="unit-live-stats">${[['护甲',n(d.armor),'armor'],['状态',entity.alive?(AI[entity.aiState]||entity.aiState):'已阵亡'],['目标',target?`${target.def.name} #${target.id}`:'正在寻找'],['攻击冷却',`${Math.max(0,entity.attackCooldown).toFixed(1)} 秒`],['技能冷却',d.skill?`${Math.max(0,entity.skillCooldown).toFixed(1)} 秒`:'无主动技能'],['击杀',n(entity.stats?.kills)],['造成伤害',n(entity.stats?.damage)],['承受伤害',n(entity.stats?.taken)],['治疗',n(entity.stats?.healing)]].map(([k,v,stat])=>`<div><span>${k}</span><b${stat?` data-stat="${stat}"`:''}>${esc(v)}</b></div>`).join('')}</div><p class="side-note">${Object.entries(entity.status||{}).filter(([,v])=>v>0).map(([k,v])=>`${{burn:'燃烧',slow:'减速',stun:'眩晕',fear:'恐惧',knockdown:'倒地'}[k]||k} ${Number(v).toFixed(1)}s`).join(' · ')||'无负面状态'}</p><div class="dialog-actions">${button('follow',app.followId===entity.id?'解除跟随':'跟随单位','target',entity.alive?'':'disabled')}${button('deselect','取消选择','close')}</div><p class="description">${d.description}</p>`;
  drawUnitIcon(document.getElementById('detail-icon'),entity.type,entity.team);
}
