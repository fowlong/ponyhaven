type Sound =
  | 'feed'
  | 'brush'
  | 'bath'
  | 'play'
  | 'rest'
  | 'pet'
  | 'transform'
  | 'buy'
  | 'rip'
  | 'reveal'
  | 'reward'
  | 'unlock'
  | 'move'
  | 'rotate'
  | 'drop'
  | 'clear'
  | 'start'
  | 'visit';
class GameSound {
  muted = false;
  private context: AudioContext | null = null;
  private lastMove = 0;
  unlock() {
    if (this.muted) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume();
    } catch {}
  }
  play(name: Sound, tier = 1) {
    if (this.muted) return;
    this.unlock();
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running') return;
    if (name === 'move' && performance.now() - this.lastMove < 65) return;
    if (name === 'move') this.lastMove = performance.now();
    const now = ctx.currentTime;
    const tone = (
      frequency: number,
      offset = 0,
      duration = 0.12,
      volume = 0.04,
      type: OscillatorType = 'sine',
    ) => {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(frequency, now + offset);
      g.gain.setValueAtTime(0, now + offset);
      g.gain.linearRampToValueAtTime(volume, now + offset + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + duration);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now + offset);
      o.stop(now + offset + duration + 0.01);
    };
    const noise = (duration = 0.15) => {
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate),
        data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.13;
      const source = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain();
      source.buffer = buffer;
      filter.type = 'lowpass';
      filter.frequency.value = name === 'rip' ? 1800 : 850;
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    };
    if (['brush', 'bath', 'rip'].includes(name)) {
      noise(name === 'rip' ? 0.32 : 0.18);
      if (name === 'bath') tone(820, 0, 0.12, 0.025);
      return;
    }
    const notes: Record<string, number[]> = {
      feed: [440, 554, 659],
      play: [523, 659, 784],
      rest: [392, 330],
      pet: [659, 784],
      transform: [392, 523, 659, 784, 1046],
      buy: [740, 988],
      reveal: [523, 659, 784, ...(tier >= 4 ? [1046] : [])],
      reward: [523, 659, 784, 1046, 1318],
      unlock: [392, 523, 784, 1046],
      move: [180],
      rotate: [330, 440],
      drop: [130, 196],
      clear: [523, 659, 784, 1046],
      start: [392, 523, 659],
      visit: [659, 523, 784],
    };
    (notes[name] || [440]).forEach((f, i) =>
      tone(
        f,
        i * (name === 'move' ? 0.02 : 0.075),
        name === 'reward' ? 0.4 : 0.2,
        name === 'move' ? 0.012 : 0.035,
        name === 'drop' ? 'triangle' : 'sine',
      ),
    );
  }
}
export const sound = new GameSound();
