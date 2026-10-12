import test from 'node:test';
import assert from 'node:assert/strict';
import { Editor, validatePlacement } from '../src/editor/index.js';
import { BattlefieldInput } from '../src/input.js';

const formation = () => ({ schemaVersion: 1, seed: 1, units: [] });
function fixture(initial = formation()) {
  const previousWindow = globalThis.window;
  const listeners = new Map();
  globalThis.window = { addEventListener: (type, callback) => listeners.set(type, callback) };
  const canvas = { addEventListener() {}, focus() {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const app = {
    editor: new Editor(initial), mode: 'PREPARING', tool: 'brush', team: 'red', type: 'peasant', spacing: 1.5, facing: 0, brushRadius: 35,
    dialog: { open: false }, followId: null, lastResult: null, edits: 0, actions: [], sim: { units: [] },
    renderer: { camera: { zoom: 1, screenToWorld: (x, y) => ({ x, y }), pan() {}, zoomAt() {} } },
    refresh() {}, refreshCounters() {}, refreshInspector() {}, refreshZoom() {}, refreshToolHint() {}, setToolHint() {}, closeDrawers() {},
    toast() {}, focusUnit() {}, afterEdit() { this.edits++; },
    editResult(result) { this.lastResult = result; if (result.ok) this.afterEdit(); },
    handleAction(action) { this.actions.push(action); },
  };
  let input;
  try { input = new BattlefieldInput(canvas, app); }
  finally { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
  return { input, app, listeners };
}
const pointer = (x, y, extra = {}) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, preventDefault() {}, ...extra });
const keyboard = (key, extra = {}) => ({ key, code: key === ' ' ? 'Space' : key, target: { tagName: 'CANVAS' }, preventDefault() {}, ...extra });

test('default brush uses one selected identity on both halves and locks each stroke',()=>{
  const {input,app}=fixture();app.type='peasant';
  input.down(pointer(100,200));input.move(pointer(1800,200));input.up(pointer(1800,200));
  const red=app.editor.formation;assert.ok(red.units.length>=30);assert.ok(red.units.every(u=>u.team==='red'&&u.x<1200));
  app.editor.undo();assert.equal(app.editor.formation.units.length,0);app.editor.redo();assert.deepEqual(app.editor.formation,red);
  input.down(pointer(1800,400));input.up(pointer(1800,400));assert.equal(app.editor.formation.units.at(-1).team,'blue');
});
test('right mouse erases both teams by hit and entire stroke undo restores identity',()=>{
  const {input,app}=fixture();app.editor.place('peasant','blue',200,200);app.editor.place('peasant','red',1800,200);const before=app.editor.formation;
  input.down(pointer(200,200,{button:2}));input.move(pointer(1800,200,{button:2}));input.up(pointer(1800,200,{button:2}));
  assert.equal(app.editor.formation.units.length,0);app.editor.undo();assert.deepEqual(app.editor.formation,before);
});
test('pointercancel and second touch restore erased units and history',()=>{
  const {input,app}=fixture();app.tool='erase';app.editor.place('peasant','red',200,200);const before=app.editor.formation;
  input.down(pointer(200,200,{pointerType:'touch'}));assert.equal(app.editor.formation.units.length,0);input.cancel(pointer(200,200));assert.deepEqual(app.editor.formation,before);
  input.down(pointer(200,200,{pointerType:'touch'}));input.down(pointer(300,300,{pointerId:2,pointerType:'touch'}));input.up(pointer(300,300,{pointerId:2}));input.up(pointer(200,200));assert.deepEqual(app.editor.formation,before);
});
test('invalid paste keeps clipboard and paste mode until a legal complete release',()=>{
  const {input,app}=fixture();app.editor.place('tank','red',200,200);app.editor.select([1]);app.editor.copySelection();input.beginPaste();
  input.down(pointer(1200,600));input.up(pointer(1200,600));assert.equal(app.editor.formation.units.length,1);assert.equal(input.pasteMode,true);assert.equal(app.editor.canPaste,true);
  input.down(pointer(1600,600));input.up(pointer(1600,600));assert.equal(app.editor.formation.units.at(-1).team,'blue');assert.equal(input.pasteMode,false);
});
test('right click while paste is armed always erases and cannot deploy clipboard',()=>{
  const {input,app}=fixture();app.editor.place('tank','red',200,200);app.editor.select([1]);app.editor.copySelection();input.beginPaste();
  input.down(pointer(1800,600,{button:2}));input.up(pointer(1800,600,{button:2}));assert.equal(app.editor.formation.units.length,1);
  input.down(pointer(200,200,{button:2}));input.up(pointer(200,200,{button:2}));assert.equal(app.editor.formation.units.length,0);assert.equal(app.editor.canPaste,true);
});
test('advanced facing offset applies consistently to preview and both team brush paths',()=>{
  const {input,app}=fixture();app.facing=Math.PI/2;
  input.down(pointer(200,200));input.move(pointer(400,200));input.up(pointer(400,200));assert.ok(app.editor.formation.units.every(u=>u.angle===Math.PI/2));
  input.down(pointer(1800,400));input.move(pointer(2100,400));input.up(pointer(2100,400));assert.ok(app.editor.formation.units.filter(u=>u.team==='blue').every(u=>u.angle===Math.PI*1.5));
  input.move(pointer(2200,600));assert.equal(input.renderState().hover.angle,Math.PI*1.5);
});

test('real pointer brush path is a single Editor transaction and fast drags fill the path', () => {
  const { input, app } = fixture();
  input.down(pointer(100, 200)); input.move(pointer(850, 200));
  assert.equal(app.editor.transactionActive, true); assert.equal(app.editor.canUndo, false);
  assert.ok(app.editor.formation.units.length >= 20);
  input.up(pointer(850, 200));
  assert.equal(app.editor.transactionActive, false); assert.equal(app.edits, 1);
  const saved = app.editor.formation;
  assert.equal(app.editor.undo().ok, true); assert.equal(app.editor.formation.units.length, 0);
  app.editor.redo(); assert.deepEqual(app.editor.formation, saved);
});
test('a second touch cancels the in-progress brush before turning into a pinch', () => {
  const { input, app } = fixture();
  input.down(pointer(100, 200)); input.move(pointer(500, 200));
  assert.ok(app.editor.formation.units.length > 1);
  input.down(pointer(700, 500, { pointerId: 2 }));
  assert.equal(app.editor.transactionActive, false); assert.equal(app.editor.formation.units.length, 0);
  assert.equal(app.editor.canUndo, false); assert.equal(input.drag, null);
  input.up(pointer(700, 500, { pointerId: 2 })); input.up(pointer(500, 200));
  assert.equal(input.pointers.size, 0);
});
test('pointer cancellation rolls back the complete stroke and clears its preview', () => {
  const { input, app } = fixture(); input.down(pointer(100, 200)); input.move(pointer(500, 200));
  input.cancel(pointer(500, 200));
  assert.equal(app.editor.formation.units.length, 0); assert.equal(app.editor.transactionActive, false);
  assert.equal(input.preview.length, 0); assert.equal(input.drag, null);
});
test('real line and grid gestures pass compatible point data to placeMany', () => {
  const { input, app } = fixture(); app.tool = 'line';
  input.down(pointer(100, 200)); input.move(pointer(400, 200));
  const expectedLine = input.preview.length; assert.ok(expectedLine > 1); input.up(pointer(400, 200));
  assert.equal(app.editor.formation.units.length, expectedLine);
  app.tool = 'grid'; input.down(pointer(600, 300)); input.move(pointer(800, 500));
  const expectedGrid = input.preview.length; input.up(pointer(800, 500));
  assert.equal(app.editor.formation.units.length, expectedLine + expectedGrid);
});
test('selected group drag uses the complete selected IDs and remains atomically legal', () => {
  const source = formation(); source.units = [
    { id: 1, type: 'peasant', team: 'red', x: 200, y: 200, angle: 0 },
    { id: 2, type: 'peasant', team: 'red', x: 260, y: 200, angle: 0 },
    { id: 3, type: 'tank', team: 'red', x: 360, y: 200, angle: 0 },
  ];
  const { input, app } = fixture(source); app.tool = 'select'; app.editor.select([1, 2]);
  const before = app.editor.formation;
  input.down(pointer(200, 200)); input.move(pointer(300, 200));
  assert.deepEqual([...app.editor.selection], [1, 2]); assert.equal(input.preview.length, 2);
  input.up(pointer(300, 200));
  assert.equal(app.lastResult.ok, false); assert.equal(app.editor.formation, before);
  assert.equal(input.preview.length, 0);
});
test('preview legality agrees with actual place rejection', () => {
  const { input, app } = fixture(); app.tool = 'single'; app.editor.place('giant', 'blue', 100, 100);
  input.move(pointer(120, 100));
  const state = input.renderState(); assert.equal(state.hover.valid, false);
  input.down(pointer(120, 100)); input.up(pointer(120, 100)); assert.equal(app.editor.formation.units.length, 1);
  assert.equal(validatePlacement(app.editor.formation.units, state.hover).ok, false);
});
test('battle observation accepts camera gestures without creating editor entities', () => {
  const { input, app } = fixture(); app.mode = 'FIGHTING';
  input.down(pointer(100, 200)); input.move(pointer(500, 200)); input.up(pointer(500, 200));
  assert.equal(app.editor.formation.units.length, 0); assert.equal(app.editor.transactionActive, false);
  assert.equal(app.edits, 0);
});
test('paste mode consumes the destination click without also placing the selected type', () => {
  const { input, app } = fixture(); app.editor.place('tank', 'red', 200, 200); app.editor.select([1]); app.editor.copySelection();
  app.type = 'peasant'; app.team = 'red'; input.beginPaste(); input.down(pointer(1400, 700)); input.up(pointer(1400, 700));
  assert.equal(app.editor.formation.units.length, 2); assert.equal(app.editor.formation.units[1].type, 'tank');
  assert.equal(app.editor.formation.units[1].team, 'blue'); assert.equal(input.pasteMode, false);
});
test('keyboard shortcuts ignore inputs, editable text and modal dialogs', () => {
  const { input, app } = fixture();
  input.key(keyboard(' ', { target: { tagName: 'INPUT' } }));
  input.key(keyboard('1', { target: { tagName: 'SELECT' } }));
  input.key(keyboard('z', { ctrlKey: true, target: { tagName: 'DIV', isContentEditable: true } }));
  app.dialog.open = true; input.key(keyboard(' ')); input.key(keyboard('Delete'));
  assert.deepEqual(app.actions, []);
});
test('undo and both redo shortcuts work; obsolete team shortcuts cannot change deployment', () => {
  const { input, app } = fixture();
  input.key(keyboard('z', { ctrlKey: true })); input.key(keyboard('z', { ctrlKey: true, shiftKey: true }));
  input.key(keyboard('y', { ctrlKey: true })); input.key(keyboard('1')); input.key(keyboard('2'));
  assert.deepEqual(app.actions, ['undo', 'redo', 'redo']);
});

test('Space on a focused button retains native activation without toggling battle', () => {
  const { input, app } = fixture(); app.mode = 'PAUSED';
  let prevented = false;
  input.key(keyboard(' ', { target: { tagName: 'BUTTON' }, preventDefault() { prevented = true; } }));
  assert.deepEqual(app.actions, []); assert.equal(prevented, false);
  input.key(keyboard(' ')); assert.deepEqual(app.actions, ['start']);
});
test('battle mode blocks deployment shortcuts but retains pause and fit controls', () => {
  const { input, app } = fixture(); app.mode = 'PAUSED';
  input.key(keyboard('b')); input.key(keyboard('Delete')); input.key(keyboard('z', { ctrlKey: true }));
  input.key(keyboard(' ')); input.key(keyboard('f'));
  assert.deepEqual(app.actions, ['start', 'fit']);
});

test('single placement waits for release on both touch and mouse', () => {
  const { input, app } = fixture(); app.tool = 'single';
  input.down(pointer(200, 200, { pointerType: 'touch' })); assert.equal(app.editor.formation.units.length, 0);
  input.up(pointer(200, 200, { pointerType: 'touch' })); assert.equal(app.editor.formation.units.length, 1);
  input.down(pointer(300, 200, { pointerType: 'mouse' })); assert.equal(app.editor.formation.units.length, 1);
  input.up(pointer(300, 200, { pointerType: 'mouse' })); assert.equal(app.editor.formation.units.length, 2);
});
test('two-finger pinch cancels a pending single touch without a ghost unit or history entry', () => {
  const { input, app } = fixture(); app.tool = 'single';
  input.down(pointer(200, 200, { pointerType: 'touch' }));
  input.down(pointer(300, 200, { pointerId: 2, pointerType: 'touch' }));
  input.move(pointer(170, 200, { pointerType: 'touch' }));
  input.move(pointer(330, 200, { pointerId: 2, pointerType: 'touch' }));
  input.up(pointer(170, 200, { pointerType: 'touch' }));
  input.up(pointer(330, 200, { pointerId: 2, pointerType: 'touch' }));
  assert.equal(app.editor.formation.units.length, 0); assert.equal(app.editor.canUndo, false);
});
test('cancel, Escape and a moved finger cannot commit a pending touch unit', () => {
  const { input, app } = fixture(); app.tool = 'single';
  input.down(pointer(200, 200, { pointerType: 'touch' })); input.cancel(pointer(200, 200, { pointerType: 'touch' }));
  input.down(pointer(200, 200, { pointerType: 'touch' })); input.key(keyboard('Escape')); input.up(pointer(200, 200, { pointerType: 'touch' }));
  input.down(pointer(200, 200, { pointerType: 'touch' })); input.move(pointer(225, 200, { pointerType: 'touch' })); input.up(pointer(225, 200, { pointerType: 'touch' }));
  assert.equal(app.editor.formation.units.length, 0);
});
test('touch clipboard paste is also deferred and cannot fire during a pinch', () => {
  const { input, app } = fixture(); app.editor.place('tank', 'red', 500, 500); app.editor.select([1]); app.editor.copySelection();
  input.beginPaste(); input.down(pointer(1000, 700, { pointerType: 'touch' }));
  input.down(pointer(1100, 700, { pointerId: 2, pointerType: 'touch' }));
  input.up(pointer(1000, 700, { pointerType: 'touch' })); input.up(pointer(1100, 700, { pointerId: 2, pointerType: 'touch' }));
  assert.equal(app.editor.formation.units.length, 1);
  input.down(pointer(1000, 700, { pointerType: 'touch' })); input.up(pointer(1000, 700, { pointerType: 'touch' }));
  assert.equal(app.editor.formation.units.length, 2); assert.equal(input.pasteMode, false);
});
