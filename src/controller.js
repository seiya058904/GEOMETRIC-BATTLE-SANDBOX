import {UNIT_MAP,FIXED_DT,MAX_UNITS} from './data/units.js';
import {Editor,generateRandomFormation} from './editor/index.js';
import {PresetStore,parseFormationJSON,exportFormationJSON,MAX_FILE_BYTES} from './persistence/index.js';
import {Simulation} from './sim/engine.js';
import {Renderer} from './render/renderer.js';
import {SynthAudio} from './render/audio.js';
import {BattlefieldInput} from './input.js';
import {createShell,TOOLS} from './ui/shell.js';
import {renderCatalog,renderCategories} from './ui/catalog.js';
import {renderInspector} from './ui/inspector.js';
import {showHelp,showPresets,showRandom,showResult,showSettings,showConfirm} from './ui/dialogs.js';
import {icon} from './ui/icons.js';

function freshSeed(){const n=new Uint32Array(1);if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(n);else n[0]=(Date.now()^(performance.now()*100000))>>>0;return n[0];}
const editActions=new Set(['unit','category','team-red','team-blue','presets','random','undo','redo','copy','paste','delete','rotate-left','rotate-right','mirror','swap','select-team','deploy-current','new-seed','clear-team','clear-all','reset-default','mirror-all','export','import','load-preset','delete-preset','generate-random','random-size','random-new-seed','confirm-action']);

export class GameController{
  constructor(root){
    this.root=root;createShell(root);this.dialog=document.getElementById('dialog');
    this.store=new PresetStore();const restored=this.store.loadAutosave();this.editor=new Editor(restored.ok&&restored.value?restored.value:undefined);
    this.mode='PREPARING';this.sim=null;this.battleFormation=null;this.team='red';this.type='swordsman';this.category='classical';this.search='';this.tool='single';this.spacing=1.5;this.facing=0;this.brushRadius=35;this.speed=1;this.selectedId=null;this.followId=null;this.randomSize='normal';this.randomSeed=freshSeed();
    this.settings={quality:'auto',showHealth:false,showGrid:true,screenShake:!matchMedia('(prefers-reduced-motion: reduce)').matches,autoCamera:false,performance:false,muted:false,volume:.24,freeDeploy:false};
    this.loadSettings();this.renderer=new Renderer(document.getElementById('battlefield'));this.audio=new SynthAudio();this.audio.setVolume(this.settings.volume);this.audio.setMuted(this.settings.muted);this.input=new BattlefieldInput(document.getElementById('battlefield'),this);
    this.accumulator=0;this.lastFrame=0;this.lastUI=0;this.lastCamera=0;this.frameMs=16.7;this.stepMs=0;this.lastFrameSteps=0;this.lastFrameStepMs=0;this.drawMs=0;this.realSpeed=0;this.speedMeasure={wall:0,sim:0};this.resultShown=false;this.toastUntil=0;this.autosaveAt=0;this.autosaveErrorShown=false;this.performanceSamples=[];this.rafCount=0;
    this.resizeObserver=new ResizeObserver(()=>{this.renderer.resize();this.refreshZoom();});this.resizeObserver.observe(document.getElementById('battlefield'));
    root.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b&&!b.disabled){e.preventDefault();this.handleAction(b.dataset.action,b);}});
    root.addEventListener('input',e=>this.onInput(e));root.addEventListener('change',e=>this.onChange(e));root.addEventListener('submit',e=>this.onSubmit(e));
    document.querySelector('.brand').addEventListener('click',e=>e.preventDefault());
    this.dialog.addEventListener('cancel',()=>{this.pendingConfirm=null;});this.dialog.addEventListener('close',()=>{this.pendingConfirm=null;this.dialogFocus?.focus?.({preventScroll:true});});
    document.getElementById('drawer-backdrop').addEventListener('click',()=>this.closeDrawers());
    document.getElementById('import-file').addEventListener('change',e=>this.importFile(e.target.files?.[0]));
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.mode==='FIGHTING'){this.pause();this.toast('页面进入后台，战斗已自动暂停。');}this.lastFrame=0;});
    window.addEventListener('pagehide',()=>{if(this.autosaveAt)this.saveAutosave();});
    this.refresh();this.renderer.resize();this.renderer.camera.fit(this.editor.formation.units);this.refreshZoom();
    if(!restored.ok)this.toast(restored.error,true);else if(restored.value)this.toast('已恢复最近一次布阵。');
    this.frame=this.frame.bind(this);this.raf=requestAnimationFrame(this.frame);
  }
  loadSettings(){try{const saved=JSON.parse(localStorage.getItem('geobattle.settings.v1')||'null');if(!saved||typeof saved!=='object')return;for(const k of Object.keys(this.settings)){if(typeof this.settings[k]==='boolean'&&typeof saved[k]==='boolean')this.settings[k]=saved[k];}if(['auto','high','medium','low'].includes(saved.quality))this.settings.quality=saved.quality;if(Number.isFinite(saved.volume))this.settings.volume=Math.max(0,Math.min(1,saved.volume));}catch{/* Optional visual preferences do not block the game. */}}
  persistSettings(){try{localStorage.setItem('geobattle.settings.v1',JSON.stringify(this.settings));}catch{this.toast('设置已应用，本次未能保存在浏览器中。',true);}}
  toast(message,error=false){if(!message)return;const el=document.getElementById('toast');el.textContent=message;el.className=error?'visible error':'visible';this.toastUntil=performance.now()+4200;}
  closeDialog(){if(this.dialog.open)this.dialog.close();}
  closeDrawers(){document.getElementById('catalog').classList.remove('open');document.getElementById('inspector').classList.remove('open');document.getElementById('drawer-backdrop').hidden=true;}
  openCatalog(){if(this.mode!=='PREPARING')return;this.closeDrawers();if(innerWidth<=760){document.getElementById('catalog').classList.add('open');document.getElementById('drawer-backdrop').hidden=false;}}
  openInspector(){if(innerWidth<=1000){this.closeDrawers();document.getElementById('inspector').classList.add('open');document.getElementById('drawer-backdrop').hidden=false;}else{this.root.classList.remove('inspector-hidden');}}
  handleAction(action,el){
    if(this.mode!=='PREPARING'&&(editActions.has(action)||action.startsWith('tool-')&&action!=='tool-pan')){this.toast('战斗已锁定布阵，请先返回布阵。');return;}
    if(action.startsWith('tool-')){this.input.cancelOperation();this.tool=action.slice(5);this.refresh();return;}
    switch(action){
      case 'start':if(this.mode==='PREPARING')this.start();else if(this.mode==='FIGHTING')this.pause();else if(this.mode==='PAUSED')this.resume();else showResult(this);break;
      case 'return':this.returnToEditor();break;
      case 'replay':this.replay(false);break;case 'replay-new':this.replay(true);break;
      case 'speed':this.speed=Number(el.dataset.speed);this.refreshPlayback();break;
      case 'team-red':case 'team-blue':this.team=action.slice(5);this.facing=this.team==='red'?0:Math.PI;this.editor.select([]);this.refresh();break;
      case 'category':this.category=el.dataset.category;this.search='';document.getElementById('unit-search').value='';renderCategories(this);renderCatalog(this);break;
      case 'unit':this.input.cancelOperation();this.type=el.dataset.type;if(this.tool==='select'||this.tool==='erase'||this.tool==='pan')this.tool='single';renderCatalog(this);this.refreshInspector();this.refreshToolHint();this.refreshToolButtons();if(innerWidth<=760)this.closeDrawers();break;
      case 'deploy-current':this.input.cancelOperation();this.tool='single';this.closeDrawers();this.refreshToolButtons();this.refreshToolHint();this.toast(`已选${UNIT_MAP[this.type].name}，点击战场放置。`);break;
      case 'undo':this.editResult(this.editor.undo());break;case 'redo':this.editResult(this.editor.redo());break;
      case 'copy':{const r=this.editor.copySelection();this.toast(r.message,!r.ok);this.refreshInspector();break;}
      case 'paste':if(this.editor.canPaste){this.closeDrawers();this.input.beginPaste();}else this.toast('请先选择并复制一组单位。');break;
      case 'delete':this.editResult(this.editor.deleteSelection());break;
      case 'rotate-left':this.editResult(this.editor.rotateSelection(-Math.PI/12));break;
      case 'rotate-right':this.editResult(this.editor.rotateSelection(Math.PI/12));break;
      case 'mirror':this.editResult(this.editor.mirrorSelection(this.team==='red'?'blue':'red'));break;
      case 'swap':this.editResult(this.editor.swapTeams());break;
      case 'select-team':this.editor.select(this.editor.formation.units.filter(u=>u.team===this.team).map(u=>u.id));this.tool='select';this.refresh();break;
      case 'new-seed':this.editResult(this.editor.setSeed(freshSeed()));break;
      case 'zoom-in':case 'zoom-out':this.followId=null;this.renderer.camera.zoomAt(this.renderer.camera.width/2,this.renderer.camera.height/2,action==='zoom-in'?1.25:.8);this.refreshZoom();break;
      case 'fit':this.followId=null;this.renderer.camera.fit(this.mode==='PREPARING'?this.editor.formation.units:this.sim?.units);this.refreshZoom();break;
      case 'reset-camera':this.followId=null;this.renderer.camera.reset();this.refreshZoom();break;
      case 'presets':showPresets(this);break;case 'random':this.randomSeed=freshSeed();showRandom(this);break;
      case 'random-size':this.randomSeed=Number(document.getElementById('random-seed').value);this.randomSize=el.dataset.size;showRandom(this);break;
      case 'random-new-seed':this.randomSeed=freshSeed();document.getElementById('random-seed').value=this.randomSeed;break;
      case 'generate-random':this.generateRandom();break;
      case 'settings':showSettings(this);break;case 'help':showHelp(this);break;case 'dialog-close':this.closeDialog();break;
      case 'clear-team':showConfirm(this,`清空${this.team==='red'?'红':'蓝'}队？`,'只删除当前阵营，另一方保持原样。',()=>this.editResult(this.editor.clearTeam(this.team)));break;
      case 'clear-all':showConfirm(this,'清空整个战场？','删除红蓝双方的全部部署，开始一次新的实验。',()=>this.editResult(this.editor.clearAll()));break;
      case 'reset-default':showConfirm(this,'恢复默认示例？','用可直接开始的示例军阵替换当前布阵。',()=>{this.editResult(this.editor.resetDefault());this.renderer.camera.fit(this.editor.formation.units);});break;
      case 'mirror-all':this.editResult(this.editor.mirrorAll());break;
      case 'confirm-action':{const fn=this.pendingConfirm;this.closeDialog();this.pendingConfirm=null;fn?.();break;}
      case 'export':this.exportFile();break;case 'import':document.getElementById('import-file').click();break;
      case 'load-preset':{const r=this.store.loadPreset(el.dataset.id);if(r.ok){this.closeDialog();this.editResult(this.editor.setFormation(r.value));this.renderer.camera.fit(this.editor.formation.units);}else this.toast(r.error,true);break;}
      case 'delete-preset':{const id=el.dataset.id;showConfirm(this,'删除这个预设？','当前战场不受影响。如果需要长期保留，可先导出 JSON。',()=>{const r=this.store.deletePreset(id);this.toast(r.ok?'预设已删除。':r.error,!r.ok);showPresets(this);},false);break;}
      case 'mute':this.settings.muted=!this.settings.muted;this.audio.setMuted(this.settings.muted);this.refreshSound();this.persistSettings();break;
      case 'catalog-toggle':if(document.getElementById('catalog').classList.contains('open'))this.closeDrawers();else this.openCatalog();break;
      case 'catalog-close':this.closeDrawers();break;
      case 'inspector-toggle':if(innerWidth<=1000&&document.getElementById('inspector').classList.contains('open'))this.closeDrawers();else if(innerWidth>1000&&!this.root.classList.contains('inspector-hidden'))this.root.classList.add('inspector-hidden');else this.openInspector();break;
      case 'inspector-close':if(innerWidth<=1000)this.closeDrawers();else this.root.classList.add('inspector-hidden');break;
      case 'follow':this.followId=this.followId===this.selectedId?null:this.selectedId;this.closeDrawers();this.refreshInspector();break;
      case 'deselect':this.selectedId=null;this.followId=null;this.refreshInspector();break;
    }
  }
  onInput(e){const t=e.target;if(t.id==='unit-search'){this.search=t.value;renderCatalog(this);}if(t.id==='volume-range'){this.settings.volume=Number(t.value)/100;this.audio.setVolume(this.settings.volume);this.persistSettings();}}
  onChange(e){
    const t=e.target;if(t.dataset.setting){const k=t.dataset.setting;if(typeof this.settings[k]==='boolean')this.settings[k]=t.checked;this.audio.setMuted(this.settings.muted);document.getElementById('performance').hidden=!this.settings.performance;this.refreshSound();this.persistSettings();return;}
    if(t.id==='quality-select'){this.settings.quality=t.value;this.renderer.resize();this.persistSettings();return;}
    if(this.mode!=='PREPARING')return;
    if(t.id==='facing-input'){if(Number.isFinite(Number(t.value)))this.facing=Number(t.value)*Math.PI/180;}
    if(t.id==='spacing-select')this.spacing=Number(t.value);
    if(t.id==='free-deploy'){this.settings.freeDeploy=t.checked;this.persistSettings();}
    if(t.id==='seed-input')this.editResult(this.editor.setSeed(Number(t.value)));
  }
  onSubmit(e){if(e.target.dataset.form==='save-preset'){e.preventDefault();if(this.mode!=='PREPARING')return;const r=this.store.savePreset(document.getElementById('preset-name').value,this.editor.formation);this.toast(r.ok?'军阵已保存。':r.error,!r.ok);if(r.ok)showPresets(this);}}
  editResult(result){if(result?.message)this.toast(result.message,!result.ok);if(result?.ok)this.afterEdit();else this.refresh();}
  afterEdit(){this.autosaveAt=performance.now()+550;this.refresh();}
  saveAutosave(){this.autosaveAt=0;const r=this.store.saveAutosave(this.editor.formation);if(!r.ok&&!this.autosaveErrorShown){this.toast(r.error,true);this.autosaveErrorShown=true;}else if(r.ok)this.autosaveErrorShown=false;}
  generateRandom(){const seed=Number(document.getElementById('random-seed').value);if(!Number.isInteger(seed)||seed<0||seed>4294967295){this.toast('请输入 0–4294967295 的整数种子。',true);return;}try{const formation=generateRandomFormation(seed,this.randomSize);this.closeDialog();this.editResult(this.editor.setFormation(formation));this.renderer.camera.fit(this.editor.formation.units);this.refreshZoom();}catch(e){this.toast(e.message,true);}}
  exportFile(){const result=exportFormationJSON(this.editor.formation);if(!result.ok){this.toast(result.error,true);return;}const url=URL.createObjectURL(new Blob([result.value],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`军阵-${this.editor.formation.seed}.geobattle.json`;document.body.append(link);link.click();link.remove();this.downloadURLs??=[];this.downloadURLs.push({url,expires:performance.now()+30000});this.toast('已导出军阵 JSON。');}
  async importFile(file){if(!file)return;document.getElementById('import-file').value='';if(this.mode!=='PREPARING')return;if(file.size>MAX_FILE_BYTES){this.toast('文件超过 2 MiB，未导入。',true);return;}try{const result=parseFormationJSON(await file.text());if(this.mode!=='PREPARING')return;if(!result.ok){this.toast(result.error,true);return;}this.closeDialog();this.editResult(this.editor.setFormation(result.value));this.renderer.camera.fit(this.editor.formation.units);}catch{this.toast('无法读取文件，当前布阵未改变。',true);}}
  start(formation=null){
    this.input.cancelOperation();formation??=this.editor.formation;
    const red=formation.units.some(u=>u.team==='red'),blue=formation.units.some(u=>u.team==='blue');if(!red||!blue){this.toast('双方各至少部署 1 个单位，才可以开始战斗。',true);return;}
    this.closeDrawers();this.closeDialog();this.saveAutosave();
    try{this.battleFormation=structuredClone(formation);this.sim=new Simulation(this.battleFormation);this.mode='FIGHTING';this.selectedId=null;this.followId=null;this.accumulator=0;this.lastFrame=0;this.lastFrameSteps=0;this.lastFrameStepMs=0;this.resultShown=false;this.speedMeasure={wall:0,sim:0};this.audio.reset();this.audio.unlock();this.refresh();}catch(e){this.toast(`无法开始战斗：${e.message}`,true);}
  }
  pause(){if(this.mode!=='FIGHTING')return;this.mode='PAUSED';this.audio.silence();this.lastFrame=0;this.refresh();}
  resume(){if(this.mode!=='PAUSED')return;this.mode='FIGHTING';this.lastFrame=0;this.audio.unlock();this.refresh();}
  returnToEditor(){this.closeDialog();this.audio.silence();this.mode='PREPARING';this.sim=null;this.selectedId=null;this.followId=null;this.accumulator=0;this.input.cancelOperation();this.refresh();this.toast('已恢复开战前的完整军阵。');}
  replay(newSeed){if(!this.battleFormation)return;const formation=structuredClone(this.battleFormation);if(newSeed)formation.seed=freshSeed();this.start(formation);}
  focusUnit(id){this.selectedId=id;this.followId=null;this.refreshInspector();if(id!=null)this.openInspector();}
  refresh(){this.root.classList.toggle('control-locked',this.mode!=='PREPARING');renderCategories(this);renderCatalog(this);this.refreshCounters();this.refreshInspector();this.refreshToolButtons();this.refreshPlayback();this.refreshSound();this.refreshToolHint();this.refreshZoom();}
  refreshInspector(){renderInspector(this);}
  refreshToolButtons(){for(const b of document.querySelectorAll('[data-tool]')){b.classList.toggle('active',this.tool===b.dataset.tool);b.disabled=this.mode!=='PREPARING'&&b.dataset.tool!=='pan';b.setAttribute('aria-pressed',String(this.tool===b.dataset.tool));}for(const b of document.querySelectorAll('[data-action="team-red"],[data-action="team-blue"]')){b.classList.toggle('active',b.dataset.action===`team-${this.team}`);b.disabled=this.mode!=='PREPARING';}}
  refreshCounters(){
    const counts=this.editor.getCounts();let red=counts.red.count,blue=counts.blue.count;
    if(this.sim){red=0;blue=0;for(const u of this.sim.units)if(u.alive){if(u.team==='red')red++;else blue++;}}
    document.getElementById('red-count').textContent=red;document.getElementById('blue-count').textContent=blue;
    document.querySelector('.team-counter.red').title=this.sim?`红队在场 ${red}（含召唤物）`:`红队 ${red} · 参考成本 ${counts.red.cost.toLocaleString()}`;
    document.querySelector('.team-counter.blue').title=this.sim?`蓝队在场 ${blue}（含召唤物）`:`蓝队 ${blue} · 参考成本 ${counts.blue.cost.toLocaleString()}`;
    document.getElementById('formation-count').textContent=`${red+blue} ${this.sim?'在场':'单位'}`;
    document.getElementById('undo-button').disabled=this.mode!=='PREPARING'||!this.editor.canUndo;document.getElementById('redo-button').disabled=this.mode!=='PREPARING'||!this.editor.canRedo;
    const seconds=this.sim?.time||0;document.getElementById('sim-time').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
    const phases={PREPARING:'准备布阵',FIGHTING:'自动战斗',PAUSED:'已暂停',FINISHED:'战斗结束'};
    document.getElementById('phase-label').textContent=phases[this.mode];document.getElementById('arena-state').textContent=this.mode==='PREPARING'?`部署你的军队 · ${counts.total} 单位`:this.mode==='FIGHTING'?'自动交战 · 含召唤物':phases[this.mode];
    const load=red+blue;const slow=this.accumulator>.5&&this.mode==='FIGHTING';document.getElementById('load-warning').textContent=slow?`实际 ${this.realSpeed.toFixed(1)}× · 受性能限制`:this.sim?.capacityWarning?'部分召唤因活动上限未生成':load>=1000?'高负载 · 建议降低特效':load>=600?'大规模战斗':'';
  }
  refreshPlayback(){
    const label=this.mode==='PREPARING'?'开始战斗':this.mode==='FIGHTING'?'暂停战斗':this.mode==='PAUSED'?'继续战斗':'查看战报';
    const b=document.getElementById('start-button');b.innerHTML=icon(this.mode==='FIGHTING'?'pause':'play')+`<span>${label}</span>`;b.title=label;b.classList.toggle('paused',this.mode==='FIGHTING');
    document.getElementById('playback').hidden=this.mode==='PREPARING';document.getElementById('return-button').hidden=this.mode==='PREPARING';
    for(const b of document.querySelectorAll('[data-speed]')){b.classList.toggle('active',Number(b.dataset.speed)===this.speed);b.setAttribute('aria-pressed',String(Number(b.dataset.speed)===this.speed));}
    for(const action of ['presets','random'])for(const el of document.querySelectorAll(`[data-action="${action}"]`))el.disabled=this.mode!=='PREPARING';
  }
  refreshSound(){const b=document.getElementById('mute-button');b.innerHTML=icon(this.settings.muted?'mute':'sound');b.title=this.settings.muted?'开启声音':'静音';b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',String(this.settings.muted));}
  refreshZoom(){document.getElementById('zoom-label').textContent=`${Math.round(this.renderer.camera.zoom/this.renderer.camera.fitZoom*100)}%`;}
  setToolHint(text){document.getElementById('tool-hint').textContent=text;}
  refreshToolHint(){this.setToolHint(this.mode==='PREPARING'?`${TOOLS.find(t=>t[0]===this.tool)?.[3]||''} · 滚轮缩放 / 右键平移`:'点击观察单位 · 拖动平移 · 滚轮缩放');}
  frame(now){
    this.rafCount++;const wallElapsed=this.lastFrame?Math.max(0,(now-this.lastFrame)/1000):0;const elapsed=Math.min(.1,wallElapsed);this.lastFrame=now;
    if(wallElapsed>0)this.frameMs=this.frameMs*.93+wallElapsed*1000*.07;
    let steps=0,stepElapsed=0;
    if(this.mode==='FIGHTING'&&this.sim&&!this.sim.result){
      this.accumulator+=elapsed*this.speed;const budgetStart=performance.now();
      while(this.accumulator+1e-9>=FIXED_DT&&steps<120){const stepStart=performance.now();this.sim.step();stepElapsed+=performance.now()-stepStart;this.accumulator-=FIXED_DT;steps++;if(this.sim.result||performance.now()-budgetStart>10)break;}
      if(steps)this.stepMs=this.stepMs*.9+stepElapsed/steps*.1;
      this.speedMeasure.wall+=wallElapsed;this.speedMeasure.sim+=steps*FIXED_DT;
      if(this.speedMeasure.wall>=.5){this.realSpeed=this.speedMeasure.sim/this.speedMeasure.wall;this.speedMeasure={wall:0,sim:0};}
      this.audio.consume(this.sim.effects,this.sim.time);
      if(this.sim.result){this.mode='FINISHED';this.accumulator=0;this.refresh();if(!this.resultShown){this.resultShown=true;this.audio.playResult(this.sim.result.winner);showResult(this);}}
    }
    // Raw per-RAF work counters for tick-weighted measurements; stepMs above remains a HUD EMA.
    this.lastFrameSteps=steps;this.lastFrameStepMs=stepElapsed;
    if(this.followId!=null&&this.sim){const unit=this.sim.getEntity(this.followId);if(unit?.alive){const camera=this.renderer.camera;camera.x+=(unit.x-camera.x)*.13;camera.y+=(unit.y-camera.y)*.13;}else this.followId=null;}
    else if(this.settings.autoCamera&&this.mode==='FIGHTING'&&now-this.lastCamera>1200){const camera=this.renderer.camera;const old={x:camera.x,y:camera.y,zoom:camera.zoom};camera.fit(this.sim.units);camera.x=old.x+(camera.x-old.x)*.2;camera.y=old.y+(camera.y-old.y)*.2;camera.zoom=old.zoom+(camera.zoom-old.zoom)*.15;this.lastCamera=now;this.refreshZoom();}
    const drawStart=performance.now();this.renderer.draw({formation:this.editor.formation,sim:this.sim,mode:this.mode,selection:this.mode==='PREPARING'?this.editor.selection:new Set(this.selectedId!=null?[this.selectedId]:[]),...this.input.renderState(),quality:this.settings.quality,showHealth:this.settings.showHealth,showGrid:this.settings.showGrid,showZones:!this.settings.freeDeploy,followId:this.followId,screenShake:this.settings.screenShake});this.drawMs=performance.now()-drawStart;
    if(now-this.lastUI>220){this.refreshCounters();if(this.mode!=='PREPARING'&&!this.dialog.open)this.refreshInspector();const fps=Math.round(1000/this.frameMs);document.getElementById('performance').hidden=!this.settings.performance;document.getElementById('performance').textContent=`${fps} FPS · ${this.stepMs.toFixed(2)} ms/tick · ${this.realSpeed.toFixed(2)}×`;this.lastUI=now;
      this.performanceSamples.push({at:now,fps,stepMs:this.stepMs,simTime:this.sim?.time||0,units:this.sim?.units.filter(u=>u.alive).length||this.editor.formation.units.length,mode:this.mode});if(this.performanceSamples.length>1500)this.performanceSamples.splice(0,500);
    }
    if(this.toastUntil&&now>this.toastUntil){document.getElementById('toast').className='';this.toastUntil=0;}
    if(this.autosaveAt&&now>this.autosaveAt&&!this.editor.transactionActive)this.saveAutosave();
    if(this.downloadURLs?.length){this.downloadURLs=this.downloadURLs.filter(item=>{if(now>item.expires){URL.revokeObjectURL(item.url);return false;}return true;});}
    this.raf=requestAnimationFrame(this.frame);
  }
}
