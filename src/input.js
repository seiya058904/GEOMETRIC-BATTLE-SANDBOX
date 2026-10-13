import {UNIT_MAP} from './data/units.js';
import {linePoints,gridPoints,brushPoints,validatePlacement,resolvePlacementCandidate,teamForDeploymentPosition} from './editor/index.js';
import {PlacementIndex} from './editor/placement.js';
const EMPTY_PREVIEW = Object.freeze([]);

/** Pointer and keyboard input; the editor owns all mutations and history. */
export class BattlefieldInput{
  constructor(canvas,app){
    this.canvas=canvas;this.app=app;this.pointers=new Map();this.drag=null;this.hover=null;this.preview=[];this.selectionRect=null;this.pasteMode=false;
    canvas.addEventListener('pointerdown',e=>this.down(e));
    canvas.addEventListener('pointermove',e=>this.move(e));
    canvas.addEventListener('pointerup',e=>this.up(e));
    canvas.addEventListener('pointercancel',e=>this.cancel(e));
    canvas.addEventListener('lostpointercapture',e=>{if(this.pointers.has(e.pointerId))this.cancel(e);});
    canvas.addEventListener('pointerleave',()=>{if(!this.drag)this.hover=null;});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('wheel',e=>{e.preventDefault();const p=this.local(e);app.manualCamera?.();app.followId=null;app.renderer.camera.zoomAt(p.x,p.y,Math.exp(-e.deltaY*.0014));app.refreshZoom();},{passive:false});
    window.addEventListener('keydown',e=>this.key(e));
  }
  local(e){const r=this.canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  world(p){return this.app.renderer.camera.screenToWorld(p.x,p.y);}
  nearest(p,units,team){let found=null,best=Infinity;const allowance=5/this.app.renderer.camera.zoom;for(const u of units){if(team&&u.team!==team)continue;if(u.alive===false)continue;const radius=u.radius||UNIT_MAP[u.type]?.radius||10;const d=Math.hypot(u.x-p.x,u.y-p.y);if(d<=radius+allowance&&d<best){best=d;found=u;}}return found;}
  point(p,lockedTeam){const a=this.app;const team=lockedTeam||teamForDeploymentPosition(a.type,p.x,p.y)||'red';const r=resolvePlacementCandidate(a.type,{...p,angle:a.facing+(team==='blue'?Math.PI:0)},lockedTeam);return r.candidate||{type:a.type,team,x:p.x,y:p.y,angle:a.facing+(team==='blue'?Math.PI:0)};}
  cancelOperation(){if(this.drag?.transaction)this.app.editor.cancelTransaction();this.drag=null;this.preview=[];this.selectionRect=null;this.pasteMode=false;this.pinch=null;this.app.refresh();}
  down(e){
    if(e.button>2)return;e.preventDefault();this.canvas.focus({preventScroll:true});this.canvas.setPointerCapture(e.pointerId);
    const screen=this.local(e);this.pointers.set(e.pointerId,screen);
    if(this.pointers.size>=2){if(this.drag?.transaction)this.app.editor.cancelTransaction();this.drag=null;this.preview=[];this.selectionRect=null;this.pinch=this.pinchData();return;}
    const point=this.world(screen);const app=this.app;app.manualCamera?.();app.followId=null;if(app.mode==='PREPARING'&&e.button===0)app.audio?.unlock();
    if(e.button===1||e.altKey||e.code==='Space'||app.tool==='pan'){this.drag={kind:'pan',last:screen,start:screen};return;}
    if(app.mode!=='PREPARING'){this.drag={kind:'observe',start:screen,last:screen,point,moved:false};return;}
    if(this.pasteMode&&e.button===0){this.drag={kind:'tap',start:screen,point,paste:true,moved:false};return;}
    // A touch is not known to be a tap until release: a second finger may turn
    // it into a camera gesture. Mouse placement keeps its immediate feedback.
    if(e.button===2||app.tool==='erase'){
      app.editor.beginTransaction();this.drag={kind:'erase',start:point,last:point,transaction:true,deleted:0,radius:0};
      const r=app.editor.eraseAt(point.x,point.y,0);this.drag.deleted+=r.deleted||0;
      app.refresh();return;
    }
    const hit=this.nearest(point,app.editor.formation.units);
    if(app.tool==='select'||hit&&['brush','single'].includes(app.tool)){
      if(hit){app.editor.select([hit.id],e.shiftKey||app.editor.selection.has(hit.id));app.refreshInspector();this.drag={kind:'move',start:point,end:point,units:app.editor.formation.units.filter(u=>app.editor.selection.has(u.id)).map(u=>({...u}))};}
      else{this.drag={kind:'select',start:point,end:point,append:e.shiftKey};this.selectionRect={x:point.x,y:point.y,width:0,height:0};}
      return;
    }
    if(app.tool==='single'){this.drag={kind:'tap',start:screen,point,candidate:this.point(point),moved:false};return;}
    const team=teamForDeploymentPosition(app.type,point.x,point.y);
    if(!team){const r=resolvePlacementCandidate(app.type,point);app.toast(r.message,true);return;}
    if(app.tool==='brush'){
      app.editor.beginTransaction();this.drag={kind:'brush',start:point,last:point,transaction:true,team,added:0,skipped:0};
      const r=app.editor.placeMany([this.point(point,team)]);this.drag.added+=r.added||0;this.drag.skipped+=r.skipped||0;app.refresh();return;
    }
    if(app.tool==='line'||app.tool==='grid'){this.drag={kind:app.tool,team,start:point,end:point};this.updatePreview(point);return;}
  }
  pinchData(){const [a,b]=[...this.pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};}
  move(e){
    const p=this.local(e),world=this.world(p);if(this.pointers.has(e.pointerId))this.pointers.set(e.pointerId,p);
    if(this.pointers.size>=2){const n=this.pinchData();if(this.pinch){this.app.renderer.camera.pan(n.x-this.pinch.x,n.y-this.pinch.y);this.app.renderer.camera.zoomAt(n.x,n.y,n.distance/this.pinch.distance);this.app.refreshZoom();}this.pinch=n;return;}
    this.hover=world;
    if(!this.drag){if(this.pasteMode)this.preview=this.app.editor.getPastePreview?.(world.x,world.y)?.candidates||[];return;}
    const d=this.drag,app=this.app;
    if(d.kind==='tap'){if(Math.hypot(p.x-d.start.x,p.y-d.start.y)>8)d.moved=true;return;}
    if(d.kind==='pan'||d.kind==='observe'){
      if(d.kind==='pan'||Math.hypot(p.x-d.start.x,p.y-d.start.y)>4||d.moved){app.renderer.camera.pan(p.x-d.last.x,p.y-d.last.y);d.moved=true;}d.last=p;return;
    }
    if(d.kind==='brush'){
      const spacing=(UNIT_MAP[app.type].radius*2+5)*app.spacing;
      const distance=Math.hypot(world.x-d.last.x,world.y-d.last.y);
      if(distance>=spacing){const points=brushPoints({type:app.type,team:d.team,path:[d.last,world],spacing,angle:app.facing+(d.team==='red'?0:Math.PI)});const r=app.editor.placeMany(points);d.added+=r.added||0;d.skipped+=r.skipped||0;d.last=points.at(-1)||d.last;app.refreshCounters();app.setToolHint(`已部署 ${d.added} · 跳过 ${d.skipped} · 本次仅${d.team==='red'?'红':'蓝'}军`);}return;
    }
    if(d.kind==='erase'){const distance=Math.hypot(world.x-d.last.x,world.y-d.last.y);const n=Math.min(600,Math.max(1,Math.ceil(distance/8)));for(let i=1;i<=n;i++){const r=app.editor.eraseAt(d.last.x+(world.x-d.last.x)*i/n,d.last.y+(world.y-d.last.y)*i/n,d.radius);d.deleted+=r.deleted||0;}d.last=world;app.refreshCounters();return;}
    d.end=world;
    if(d.kind==='line'||d.kind==='grid')this.updatePreview(world);
    if(d.kind==='select')this.selectionRect={x:Math.min(d.start.x,world.x),y:Math.min(d.start.y,world.y),width:Math.abs(world.x-d.start.x),height:Math.abs(world.y-d.start.y)};
    if(d.kind==='move'){this.preview=app.editor.getMovePreview?.(world.x-d.start.x,world.y-d.start.y)?.candidates||d.units.map(u=>({...u,x:u.x+world.x-d.start.x,y:u.y+world.y-d.start.y}));}
  }
  updatePreview(end){
    const d=this.drag,a=this.app;const args={type:a.type,team:d.team,x1:d.start.x,y1:d.start.y,x2:end.x,y2:end.y,spacing:(UNIT_MAP[a.type].radius*2+5)*a.spacing,angle:d.team==='red'?a.facing:Math.PI+a.facing};
    this.preview=(d.kind==='line'?linePoints(args):gridPoints(args)).slice(0,1201);const index=new PlacementIndex(a.editor.formation.units);let valid=0;for(const p of this.preview){const r=validatePlacement(index,p);if(r.ok){valid++;index.add(p);}}a.setToolHint(`可部署 ${valid} · 跳过 ${this.preview.length-valid} · 松开完成`);
  }
  up(e){
    if(this.pointers.size>=2){this.pointers.delete(e.pointerId);this.pinch=null;this.drag=null;return;}
    this.pointers.delete(e.pointerId);const d=this.drag,app=this.app;this.drag=null;
    if(d){
      if(d.kind==='tap'&&!d.moved&&app.mode==='PREPARING'){
        const released=this.local(e);
        if(Math.hypot(released.x-d.start.x,released.y-d.start.y)<=8){
          if(d.paste){const r=app.editor.pasteAt(d.point.x,d.point.y);app.editResult(r);if(r.ok)this.pasteMode=false;}
          else {const p=d.candidate;app.editResult(app.editor.place(p.type,p.team,p.x,p.y,p.angle));}
        }
      }
      if(d.kind==='observe'&&!d.moved){const hit=this.nearest(d.point,app.sim?.units||[]);app.focusUnit(hit?.id??null);}
      if(d.kind==='brush'||d.kind==='erase'){app.editor.commitTransaction();app.afterEdit();if(d.kind==='brush'&&d.added>0)app.audio?.place();app.toast(d.kind==='brush'?`已部署 ${d.added} 个${d.skipped?` · ${d.skipped} 个位置被跳过`:''}`:`已删除 ${d.deleted} 个单位`);}
      if(d.kind==='line'||d.kind==='grid')app.editResult(app.editor.placeMany(this.preview));
      if(d.kind==='select'){app.editor.selectRect(d.start.x,d.start.y,d.end.x,d.end.y,undefined,d.append);app.refresh();}
      if(d.kind==='move')app.editResult(app.editor.moveSelection(d.end.x-d.start.x,d.end.y-d.start.y));
    }
    this.preview=[];this.selectionRect=null;app.refreshToolHint();
  }
  cancel(e){this.pointers.delete(e.pointerId);this.cancelOperation();}
  beginPaste(){this.pasteMode=true;this.app.toast('点击目标半场粘贴整组；越线或重叠不会放置，Esc 取消。');}
  key(e){
    const app=this.app,tag=e.target?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag)||e.target?.isContentEditable||app.dialog.open||app.panels?.active?.getAttribute('aria-modal')==='true')return;
    const mod=e.ctrlKey||e.metaKey;
    if(e.key==='Escape'){this.cancelOperation();app.closeDrawers();return;}
    if(e.code==='Space'){if(tag==='BUTTON')return;e.preventDefault();app.handleAction('start');return;}
    if(e.key.toLowerCase()==='f'){e.preventDefault();app.handleAction('fit');return;}
    if(e.key==='/'&&app.mode==='PREPARING'){e.preventDefault();app.openCatalog();document.getElementById('unit-search').focus();return;}
    if(app.mode!=='PREPARING')return;
    if(mod){const k=e.key.toLowerCase();if(['z','y','c','v'].includes(k))e.preventDefault();if(k==='z')app.handleAction(e.shiftKey?'redo':'undo');if(k==='y')app.handleAction('redo');if(k==='c')app.handleAction('copy');if(k==='v')app.handleAction('paste');return;}
    const keys={b:'tool-brush',l:'tool-line',r:'tool-grid',v:'tool-select',e:'tool-erase',Delete:'delete'};
    const action=keys[e.key]||keys[e.key.toLowerCase()];if(action){e.preventDefault();app.handleAction(action);}
  }
  renderState(){
    const a=this.app;if(a.mode!=='PREPARING')return {hover:null,preview:EMPTY_PREVIEW,selectionRect:null};let hover=null;if(this.hover&&a.tool!=='pan'&&a.tool!=='select'){
      const candidate=this.point(this.hover,this.drag?.team);const resolved=resolvePlacementCandidate(a.type,this.hover,this.drag?.team);const valid=resolved.ok?validatePlacement(a.editor.formation.units,candidate):resolved;hover={...candidate,valid:valid.ok!==false,reason:valid.message,radius:UNIT_MAP[a.type].radius,erase:a.tool==='erase'||this.drag?.kind==='erase'};
    }
    if(!this.preview.length)return {hover:this.pasteMode?null:hover,preview:EMPTY_PREVIEW,selectionRect:this.selectionRect};
    const ignore=this.drag?.kind==='move'?a.editor.selection:new Set();const index=new PlacementIndex(a.editor.formation.units.filter(u=>!ignore.has(u.id)));
    const group=this.pasteMode&&this.hover?a.editor.getPastePreview(this.hover.x,this.hover.y):this.drag?.kind==='move'?a.editor.getMovePreview(this.drag.end.x-this.drag.start.x,this.drag.end.y-this.drag.start.y):null;
    const preview=this.preview.map(p=>{const r=validatePlacement(index,p);if(r.ok)index.add(p);return {...p,valid:r.ok&&group?.ok!==false,reason:group?.ok===false?group.message:r.message};});
    return {hover:this.pasteMode?null:hover,preview,selectionRect:this.selectionRect};
  }
}
