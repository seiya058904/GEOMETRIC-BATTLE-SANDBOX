import {UNIT_MAP} from '../data/units.js';
import {button,esc,icon} from './icons.js';
const number=v=>Number(v||0).toLocaleString('zh-CN',{maximumFractionDigits:0});
export function openDialog(app,title,body,footer='',className=''){
  const dialog=app.dialog;app.dialogFocus=document.activeElement;
  dialog.className=className;dialog.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2>${button('dialog-close','关闭','close','class="icon-button" aria-label="关闭对话框"')}</div><div class="dialog-body">${body}</div>${footer?`<div class="dialog-foot ${className==='result-dialog'?'result-foot':''}">${footer}</div>`:''}`;
  if(!dialog.open)dialog.showModal();
}
export function showPresets(app){
  const result=app.store.listPresets();const presets=result.ok?result.value:[];
  openDialog(app,'军阵档案',`<p>保存这次排兵布阵，随时回来再战。战斗前的位置、兵种、面向和随机种子会一起保存。</p>
    <form data-form="save-preset" class="form-inline"><input id="preset-name" type="text" maxlength="48" placeholder="给这套军阵起个名字" aria-label="军阵名称" required><button type="submit" class="primary">${icon('save')}保存</button></form>
    ${result.ok?'':`<p class="warning-inline">${esc(result.error)}</p>`}
    <div class="preset-list">${presets.length?presets.map(p=>`<div class="preset-item"><div><strong>${esc(p.name)}</strong><small>${p.formation?.units?.length??p.unitCount??''} 个单位 · ${new Date(p.updatedAt).toLocaleDateString('zh-CN')}</small></div><div style="display:flex;gap:5px"><button data-action="load-preset" data-id="${esc(p.id)}">读取</button>${button('delete-preset','删除预设','trash',`class="icon-button" data-id="${esc(p.id)}"`)}</div></div>`).join(''):'<p class="empty-board-note">尚无已命名军阵。当前布阵还会自动保存在这个浏览器中。</p>'}</div>
    <div class="dialog-actions">${button('export','导出 JSON','export')}${button('import','导入 JSON','import')}</div>
    <div class="dialog-section"><h3>战场操作</h3><div class="dialog-actions">${button('clear-team',`清空${app.team==='red'?'红':'蓝'}队`,'trash')}${button('clear-all','清空双方','trash')}${button('reset-default','恢复示例','reset')}${button('mirror-all','左右镜像','mirror')}</div></div>
    <p class="side-note">存档保存在当前浏览器。换浏览器或电脑前，导出 JSON 留存；不会上传你的布阵。</p>`);
}
export function showRandom(app){
  openDialog(app,'随机大战',`<p>让跨越时代的军队相遇。生成之后可以继续编辑，种子相同就会得到相同的初始军阵。</p><div class="scale-options">${[['small','小型','20 单位'],['normal','普通','80 单位'],['large','大型','300 单位'],['chaos','混沌','600 单位']].map(([id,name,count])=>`<button data-action="random-size" data-size="${id}" class="${app.randomSize===id?'active':''}">${name}<small>${count}</small></button>`).join('')}</div><label class="field-row">生成种子<input id="random-seed" type="number" min="0" max="4294967295" step="1" value="${app.randomSeed}" aria-label="随机大战种子"></label><p class="side-note">巨型单位会留出更多间距。生成只替换布阵，可以撤销。规模快捷选项不限制你手动增兵。</p>`,button('random-new-seed','换个种子','shuffle','class="quiet"')+button('generate-random','生成军阵','shuffle','class="primary"'));
}
export function showSettings(app){
  const s=app.settings;
  openDialog(app,'观察与声音',`<label class="field-row">特效质量<select id="quality-select" aria-label="特效质量">${[['auto','自动'],['high','高'],['medium','中'],['low','低']].map(([v,l])=>`<option value="${v}" ${s.quality===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="field-row">显示生命条<input type="checkbox" data-setting="showHealth" ${s.showHealth?'checked':''}></label><label class="field-row">显示背景网格<input type="checkbox" data-setting="showGrid" ${s.showGrid?'checked':''}></label><label class="field-row">轻微屏幕震动<input type="checkbox" data-setting="screenShake" ${s.screenShake?'checked':''}></label><label class="field-row">自动取景<input type="checkbox" data-setting="autoCamera" ${s.autoCamera?'checked':''}></label><label class="field-row">显示性能信息<input type="checkbox" data-setting="performance" ${s.performance?'checked':''}></label><label class="field-row">静音<input type="checkbox" data-setting="muted" ${s.muted?'checked':''}></label><label class="field-row">音效音量<input id="volume-range" type="range" min="0" max="100" step="1" value="${Math.round(s.volume*100)}" aria-label="音效音量"></label><p class="side-note">画质只改变视觉细节。所有档位使用相同的生命、弹道和模拟规则。切换后台会自动暂停战斗。</p>`,button('dialog-close','完成',null,'class="primary"'));
}
export function showHelp(app){
  openDialog(app,'把想象摆上战场',`<p>选择红队或蓝队，再选一个兵种。点击空位放下它，或用笔刷、直线和矩阵一次部署整支军队。双方都至少有一名单位即可开始。</p><h3>编辑与观察</h3><p>「选择」工具可框选本方军阵，拖动已选中的单位整体移动。右侧详情面板提供旋转、复制、粘贴和镜像。战斗开始后只可观察、暂停和调整倍速。</p><div class="help-grid">${[['Space','开始 / 暂停'],['1 / 2','切换红 / 蓝队'],['B','连续笔刷'],['L / R','直线 / 矩阵'],['V / E','选择 / 擦除'],['Delete','删除选中'],['Ctrl+Z','撤销'],['Ctrl+Y','重做'],['Ctrl+C/V','复制 / 粘贴'],['F','适配军阵'],['Esc','取消操作'],['右键拖动','移动相机']].map(([k,t])=>`<div><kbd>${k}</kbd>${t}</div>`).join('')}</div><h3>触摸操作</h3><p>单指放置或使用当前工具拖动；双指缩放和平移。「镜头」工具可以单指移动视野。「兵种」打开底部目录，「详情」打开军阵编辑和单位观察。</p><h3>没有预算，没有误伤</h3><p>参考成本只是强度提示。36 种兵种可以任意混编。队友不承受任何攻击、爆炸、燃烧、减速、击退或牵引效果。悬浮单位同样能被近战击中。</p><p class="side-note">相同军阵和种子在同一浏览器、同一构建中可重演。双方同一模拟步同归于尽判平局；僵局或 240 秒超时也会明确结算。</p>`,button('dialog-close','开始实验','play','class="primary"'));
}
export function showConfirm(app,title,message,action,undoable=true){
  app.pendingConfirm=action;openDialog(app,title,`<p>${esc(message)}</p>${undoable?'<p class="side-note">完成后仍可使用撤销恢复。</p>':''}`,button('dialog-close','取消',null,'class="quiet"')+button('confirm-action','确认',null,'class="primary"'));
}
export function showResult(app){
  const r=app.sim.result;if(!r)return;const name=r.winner==='draw'?'势均力敌，平局':r.winner==='red'?'红队获胜':'蓝队获胜';
  const representative=v=>v?`${v.team==='red'?'红队':'蓝队'} · ${UNIT_MAP[v.type]?.name||v.type} #${v.id} · ${number(v.value)}`:'无';
  const rows=[];for(const team of ['red','blue'])for(const item of r.teams[team].byType||[])rows.push({...item,team});
  openDialog(app,'战斗报告',`<div class="result-hero"><div class="${r.winner}">${icon(r.winner==='draw'?'mirror':'target')}</div><h3 class="${r.winner}">${name}</h3><div class="result-time">${r.duration.toFixed(2)} 秒 · 种子 ${app.battleFormation.seed}</div><p style="margin:8px 0 0">${esc(r.reason)}</p></div>
    <div class="result-teams">${['red','blue'].map(t=>{const s=r.teams[t];return `<div class="result-team"><h3 class="${t}">${t==='red'?'红队':'蓝队'}</h3>${[['最初人数',s.initial],['初始单位幸存',s.remaining],['初始单位阵亡',s.deaths],['召唤产生 / 存活',`${s.summoned} / ${s.summonsAlive}`],['召唤物死亡 / 消失',s.summonDeaths],['造成伤害',number(s.damage)],['治疗量',number(s.healing)]].map(([k,v])=>`<div><span>${k}</span><b>${v??0}</b></div>`).join('')}</div>`}).join('')}</div>
    <div class="result-mvp"><div><span>最高伤害</span><strong>${esc(representative(r.topDamage))}</strong></div><div><span>最多击杀</span><strong>${esc(representative(r.topKills))}</strong></div></div>
    <details class="result-details"><summary>查看各兵种战绩</summary><table class="result-table"><thead><tr><th>阵营 / 兵种</th><th>击杀</th><th>伤害</th><th>治疗</th></tr></thead><tbody>${rows.map(row=>`<tr><td class="${row.team}">${row.team==='red'?'红':'蓝'} · ${UNIT_MAP[row.type]?.name||esc(row.type)}</td><td>${number(row.kills)}</td><td>${number(row.damage)}</td><td>${number(row.healing)}</td></tr>`).join('')}</tbody></table></details>`,button('return','返回布阵','undo','class="quiet"')+button('replay','同种子复现','reset','class="quiet"')+button('replay-new','新种子重赛','shuffle','class="primary"'),'result-dialog');
}
