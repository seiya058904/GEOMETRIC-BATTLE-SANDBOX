/** Procedural, bounded Web Audio feedback. Audio never owns or advances simulation time. */
export class SynthAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.volume = .42;
    this.muted = false;
    this.voices = new Set();
    this.maxVoices = 10;
    this.seen = new Set();
    this.highestSeen = -Infinity;
    this.lastTime = -Infinity;
    this.lastSound = new Map();
    this.noise = null;
    this.failed = false;
  }

  /** Call from a real click/tap. A denied or missing audio device must never stop the game. */
  async unlock() {
    try {
      if (!this.context) {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Context) { this.failed = true; return false; }
        const context = new Context({ latencyHint: 'interactive' });
        this.context = context;
        this.master = context.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume * .55;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -19;
        limiter.knee.value = 9;
        limiter.ratio.value = 5;
        limiter.attack.value = .004;
        limiter.release.value = .16;
        this.master.connect(limiter); limiter.connect(context.destination);
        this.noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const samples = this.noise.getChannelData(0);
        let seed = 0x12f40a3b;
        for (let i = 0; i < samples.length; i++) {
          seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
          samples[i] = ((seed >>> 0) / 4294967296 * 2 - 1) * .75;
        }
      }
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context.state === 'running';
    } catch {
      this.failed = true;
      return false;
    }
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : .42));
    this._updateGain();
  }

  setMuted(value) {
    this.muted = Boolean(value);
    this._updateGain();
    if (this.muted) this.silence();
  }

  _updateGain() {
    if (!this.context || !this.master) return;
    try { this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * .55, this.context.currentTime, .02); } catch { /* Device can disappear independently. */ }
  }

  /** Event IDs are consumed once even when muted or dropped by the sound budget. */
  consume(effects = [], time = 0) {
    if (!Number.isFinite(time)) return;
    if (time < this.lastTime) this.reset();
    if (time === this.lastTime) return;
    this.lastTime = time;
    const previousHighest = this.highestSeen;
    let highest = previousHighest;
    let played = 0;
    for (let i = effects.length - 1; i >= 0; i--) {
      const event = effects[i];
      if (Number.isFinite(event.id)) highest = Math.max(highest, event.id);
      if ((Number.isFinite(event.id) && event.id <= previousHighest) || this.seen.has(event.id)) continue;
      this.seen.add(event.id);
      if (event.age > .16 || played >= 5 || this.muted || this.volume <= 0 || !this.context || this.context.state !== 'running') continue;
      const category = this._category(event.kind);
      if (!category) continue;
      const now = this.context.currentTime;
      const spacing = category === 'explosion' ? .14 : category === 'gun' ? .075 : category === 'impact' ? .09 : .13;
      if (now - (this.lastSound.get(category) ?? -Infinity) < spacing || this.voices.size >= this.maxVoices) continue;
      this.lastSound.set(category, now);
      try { this._play(category, event.id ?? 0, event.radius ?? 20); played++; } catch { /* Audio is optional. */ }
    }
    // Only currently visible event IDs need to be remembered after a bounded prune.
    this.highestSeen = highest;
    if (this.seen.size > 2048) this.seen = new Set(effects.slice(-2048).map(event => event.id));
  }

  _category(kind) {
    if (kind === 'explosion') return 'explosion';
    if (kind === 'shockwave' || kind === 'roar') return 'heavy';
    if (kind === 'muzzle') return 'gun';
    if (kind === 'laser') return 'laser';
    if (kind === 'slash' || kind === 'stab') return 'swish';
    if (kind === 'impact' || kind === 'death') return 'impact';
    if (kind === 'heal') return 'heal';
    if (kind === 'fire' || kind === 'ice' || kind === 'summon' || kind === 'gravity' || kind === 'blink') return 'magic';
    return null;
  }

  _play(category, id, radius = 20) {
    if (!this.context || this.context.state !== 'running' || this.voices.size >= this.maxVoices) return;
    const variation = .94 + ((id * 19) % 17) / 140;
    const specs = {
      explosion: { duration: .27, noise: true, hz: Math.max(110, 370 - radius * 1.2), end: 48, volume: .32, tone: 75, wave: 'sine' },
      heavy: { duration: .3, noise: true, hz: 240, end: 65, volume: .22, tone: 58, wave: 'triangle' },
      gun: { duration: .065, noise: true, hz: 1600, end: 180, volume: .17, tone: 135, wave: 'triangle' },
      laser: { duration: .085, noise: false, hz: 940, end: 285, volume: .09, wave: 'triangle' },
      swish: { duration: .09, noise: true, hz: 1700, end: 430, volume: .08 },
      impact: { duration: .055, noise: true, hz: 920, end: 180, volume: .095, tone: 175, wave: 'sine' },
      heal: { duration: .16, noise: false, hz: 660, end: 890, volume: .065, wave: 'sine' },
      magic: { duration: .19, noise: false, hz: 310, end: 685, volume: .063, wave: 'sine' },
      place: { duration: .055, noise: false, hz: 380, end: 620, volume: .07, wave: 'sine' },
      result: { duration: .48, noise: false, hz: 440, end: 660, volume: .1, tone: 880, wave: 'sine' },
    };
    const spec = specs[category];
    if (!spec) return;
    const ctx = this.context, now = ctx.currentTime;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(.0001, now);
    envelope.gain.exponentialRampToValueAtTime(spec.volume, now + .006);
    envelope.gain.exponentialRampToValueAtTime(.0001, now + spec.duration);
    envelope.connect(this.master);
    const sources = [], nodes = [envelope];
    if (spec.noise) {
      const source = ctx.createBufferSource(); source.buffer = this.noise;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = .65;
      filter.frequency.setValueAtTime(spec.hz * variation, now);
      filter.frequency.exponentialRampToValueAtTime(spec.end, now + spec.duration);
      source.connect(filter); filter.connect(envelope);
      source.start(now, ((id % 13) / 20)); source.stop(now + spec.duration + .01);
      sources.push(source); nodes.push(source, filter);
    } else {
      const source = ctx.createOscillator(); source.type = spec.wave || 'sine';
      source.frequency.setValueAtTime(spec.hz * variation, now);
      source.frequency.exponentialRampToValueAtTime(spec.end * variation, now + spec.duration);
      source.connect(envelope); source.start(now); source.stop(now + spec.duration + .01);
      sources.push(source); nodes.push(source);
    }
    if (spec.tone) {
      const tone = ctx.createOscillator(), toneGain = ctx.createGain();
      tone.type = spec.wave || 'triangle'; toneGain.gain.value = .32;
      tone.frequency.setValueAtTime(spec.tone * variation, now);
      tone.frequency.exponentialRampToValueAtTime(spec.tone * (category === 'result' ? 1.125 : .58), now + spec.duration);
      tone.connect(toneGain); toneGain.connect(envelope); tone.start(now); tone.stop(now + spec.duration + .01);
      sources.push(tone); nodes.push(tone, toneGain);
    }
    let ended = false;
    const voice = { stop: () => {
      if (ended) return;
      ended = true;
      for (const source of sources) { try { source.stop(); } catch { /* Already ended. */ } }
      for (const node of nodes) { try { node.disconnect(); } catch { /* Device closed. */ } }
      this.voices.delete(voice);
    } };
    this.voices.add(voice);
    sources[0].onended = voice.stop;
  }

  /** Optional quiet placement cue for the editor. */
  place() {
    if (this.muted || !this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    if (now - (this.lastSound.get('place') ?? -Infinity) < .065) return;
    this.lastSound.set('place', now);
    try { this._play('place', 0); } catch { /* Keep editing usable without audio. */ }
  }

  /** One neutral completion chime; the visual report communicates the winner. */
  playResult() {
    if (this.muted || this.volume <= 0) return;
    try { this._play('result', 0); } catch { /* Keep the result report available. */ }
  }

  silence() {
    for (const voice of [...this.voices]) voice.stop();
  }

  reset() {
    this.silence(); this.seen.clear(); this.highestSeen = -Infinity; this.lastSound.clear(); this.lastTime = -Infinity;
  }

  dispose() {
    this.reset();
    try { this.context?.close()?.catch(() => {}); } catch { /* Already closed. */ }
    this.context = null; this.master = null; this.noise = null;
  }
}
