import test from 'node:test';
import assert from 'node:assert/strict';
import { SynthAudio } from '../src/render/audio.js';

test('audio event consumption is bounded, deduplicated and silent while muted', () => {
  const audio = new SynthAudio(), played = [];
  audio.context = { state: 'running', currentTime: 1 };
  audio._play = category => played.push(category);
  const kinds = ['explosion', 'shockwave', 'muzzle', 'laser', 'slash', 'heal', 'summon'];
  const effects = Array.from({ length: 4000 }, (_, id) => ({ id, kind: kinds[id % kinds.length], age: 0 }));
  audio.consume(effects, 1); assert.ok(played.length <= 5); assert.ok(played.length > 0); assert.ok(audio.seen.size <= 2048);
  const count = played.length; audio.consume(effects, 2); assert.equal(played.length, count);
  let stopped = false; audio.voices.add({ stop() { stopped = true; audio.voices.clear(); } });
  audio.setMuted(true); assert.equal(stopped, true); assert.equal(audio.voices.size, 0);
  audio.consume([{ id: 4001, kind: 'explosion', age: 0 }], 3); assert.equal(played.length, count);
  audio.setMuted(false); audio.consume([{ id: 4001, kind: 'explosion', age: 0 }], 4); assert.equal(played.length, count);
});

test('missing audio device leaves optional feedback safe', async () => {
  const audio = new SynthAudio();
  assert.equal(await audio.unlock(), false); assert.equal(audio.failed, true);
  assert.doesNotThrow(() => { audio.place(); audio.playResult(); audio.consume([{ id: 1, kind: 'impact', age: 0 }], 1); audio.dispose(); });
});
