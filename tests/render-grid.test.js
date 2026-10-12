import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../src/render/renderer.js';
import { WORLD } from '../src/data/units.js';

// Records submitted geometry; actual raster appearance and FPS are browser checks.
class RecordingContext {
  constructor() { this.fills = []; this.patterns = []; }
  fillRect(x,y,width,height) { this.fills.push({ x,y,width,height,style:this.fillStyle }); }
  createPattern(tile,repeat) {
    const pattern={tile,repeat,transform:null,setTransform(value){this.transform=value;}};
    this.patterns.push(pattern); return pattern;
  }
  strokeRect() {} beginPath() {} moveTo() {} lineTo() {} stroke() {} setLineDash() {} fillText() {}
}
class RecordingCanvas {
  constructor(width,height) { this.width=width;this.height=height;this.cssWidth=width;this.cssHeight=height;this.context=new RecordingContext(); }
  getContext() { return this.context; }
  getBoundingClientRect() { return {width:this.cssWidth,height:this.cssHeight}; }
}
const originalCanvas=globalThis.OffscreenCanvas;
const originalDpr=globalThis.devicePixelRatio;
beforeEach(()=>{globalThis.OffscreenCanvas=RecordingCanvas;globalThis.devicePixelRatio=1;});
afterEach(()=>{
  if(originalCanvas===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=originalCanvas;
  if(originalDpr===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=originalDpr;
});
function close(actual,expected){assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);}
function frame(r,grid=true,zones=false){const from=r.ctx.fills.length;r._field(r.ctx,r.camera.bounds,grid,zones);return r.ctx.fills.slice(from);}
function patterned(fills){return fills.filter(fill=>fill.style&&typeof fill.style==='object');}

for(const [name,width,height,zoom,dpr] of [
  ['desktop',1118,861,.731,1],
  ['mobile portrait',375,621,.232,2],
  ['mobile landscape',621,279,.35,2],
  ['minimum zoom',1118,861,.04,1],
  ['maximum zoom',1118,861,4,2],
  ['fractional DPR',860,690,.67,1.5],
]) test(`grid stays world-aligned at ${name}`,()=>{
  globalThis.devicePixelRatio=dpr;
  const r=new Renderer(new RecordingCanvas(width,height));r.camera.zoom=zoom;
  const fills=frame(r),cache=r._gridPatternCache,pattern=cache.pattern,m=pattern.transform,pixels=cache.tile.width;
  assert.equal(patterned(fills).length,1);
  assert.deepEqual(patterned(fills)[0],{x:0,y:0,width:WORLD.width,height:WORLD.height,style:pattern});
  assert.ok(cache.spacing*zoom>=20&&cache.spacing*zoom<=58);
  assert.ok(pixels<=116);assert.equal(cache.tile.width,cache.tile.height);
  assert.equal(pattern.repeat,'repeat');
  for(const index of [-2,-1,0,1,2,10]){
    close((pixels/2+index*pixels)*m.a+m.e,index*cache.spacing);
    close((pixels/2+index*pixels)*m.d+m.f,index*cache.spacing);
  }
  const dot=cache.tile.context.fills[0];
  close(dot.width*m.a*zoom,Math.max(.9,.55*zoom));
  close(dot.height*m.d*zoom,Math.max(.9,.55*zoom));
  assert.equal(dot.style,'#294047');
});

test('grid reuses one tile during pan and replaces it for zoom and DPR changes',()=>{
  globalThis.devicePixelRatio=2;
  const r=new Renderer(new RecordingCanvas(1118,861));r.camera.zoom=.7;
  frame(r);const first=r._gridPatternCache;
  frame(r);assert.equal(r._gridPatternCache,first);assert.equal(r.ctx.patterns.length,1);
  r.camera.pan(67,-23);frame(r);assert.equal(r._gridPatternCache,first);
  r.camera.zoomAt(230,120,1.2);frame(r);assert.notEqual(r._gridPatternCache,first);assert.equal(r.ctx.patterns.length,2);
  const zoomed=r._gridPatternCache;r._level='low';r.resize();frame(r);
  assert.equal(r.dpr,1);assert.notEqual(r._gridPatternCache,zoomed);assert.equal(r.ctx.patterns.length,3);
  for(let i=0;i<120;i++){r.camera.zoom=.04*100**(i/119);frame(r);assert.equal(r._gridPatternCache.pattern,r.ctx.patterns.at(-1));assert.ok(r._gridPatternCache.tile.width<=116);}
});

test('grid toggle removes its fill and restores the cached tile without affecting zones',()=>{
  const r=new Renderer(new RecordingCanvas(375,621));frame(r);const cached=r._gridPatternCache;
  const hidden=frame(r,false,true);assert.equal(patterned(hidden).length,0);assert.equal(hidden.length,3);
  assert.equal(r._gridPatternCache,cached);
  const shown=frame(r,true,true);assert.equal(patterned(shown).length,1);assert.equal(shown.length,4);assert.equal(r._gridPatternCache,cached);
});
