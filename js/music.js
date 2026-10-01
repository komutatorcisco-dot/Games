// Фоновая музыка: спокойный lo-fi бит, который синтезируется прямо в браузере (без mp3-файлов).
// Аккорды Fmaj7 → Em7 → Dm7 → Cmaj7, мягкий пэд, бас, перебор и тихие барабаны. Темп 80 BPM.
'use strict';

const Music = (() => {
  const BPM = 80;
  const STEP = 60 / BPM / 2; // восьмая нота
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  // аккорды: бас + 4 ноты пэда + ноты для перебора
  const CHORDS = [
    { bass: 41, pad: [57, 60, 64, 65], arp: [65, 69, 72, 76] }, // Fmaj7
    { bass: 40, pad: [55, 59, 62, 64], arp: [64, 67, 71, 74] }, // Em7
    { bass: 38, pad: [53, 57, 60, 62], arp: [62, 65, 69, 72] }, // Dm7
    { bass: 36, pad: [52, 55, 59, 60], arp: [60, 64, 67, 71] }, // Cmaj7
  ];
  const ARP = [0, 2, 1, 3, 2, 1, 3, 2]; // рисунок перебора на такт (8 восьмых)

  let ctx = null, master = null, filter = null, noise = null;
  let playing = false, timer = null, step = 0, nextTime = 0;

  function setup() {
    ctx = ctx || (Sound.ctx = Sound.ctx || new (window.AudioContext || window.webkitAudioContext)());
    if (master) return;
    master = ctx.createGain();
    master.gain.value = 0;
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    master.connect(filter).connect(ctx.destination);
    // белый шум для хай-хэта и «винилового» шороха
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone(freq, t, dur, type, vol, attack = 0.01) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.3);
  }

  function hat(t, vol) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise;
    f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(master);
    s.start(t); s.stop(t + 0.06);
  }

  function snare(t) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise;
    f.type = 'bandpass'; f.frequency.value = 1800;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(f).connect(g).connect(master);
    s.start(t); s.stop(t + 0.2);
  }

  function schedule(s, t) {
    const bar = Math.floor(s / 8) % CHORDS.length;
    const pos = s % 8;
    const ch = CHORDS[bar];
    const barLen = STEP * 8;
    if (pos === 0) {
      ch.pad.forEach((n) => tone(midi(n), t, barLen * 1.05, 'triangle', 0.035, 0.6));
      tone(midi(ch.bass), t, STEP * 3, 'sine', 0.22, 0.02);
    }
    if (pos === 4) tone(midi(ch.bass + 7), t, STEP * 2.5, 'sine', 0.16, 0.02);
    // перебор, слегка «раскачанный» (swing)
    const swing = pos % 2 ? STEP * 0.12 : 0;
    if (Math.random() > 0.18) tone(midi(ch.arp[ARP[pos]]), t + swing, STEP * 1.8, 'sine', 0.05, 0.005);
    // барабаны
    if (pos === 0 || pos === 5) kick(t);
    if (pos === 2 || pos === 6) snare(t);
    hat(t + swing, pos % 2 ? 0.025 : 0.04);
  }

  function tick() {
    while (nextTime < ctx.currentTime + 0.25) {
      schedule(step, nextTime);
      step++;
      nextTime += STEP;
    }
  }

  function start() {
    if (playing) return;
    try {
      setup();
      if (ctx.state === 'suspended') ctx.resume();
      playing = true;
      nextTime = ctx.currentTime + 0.1;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2);
      timer = setInterval(tick, 60);
    } catch (e) { playing = false; }
  }

  function stop() {
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    } catch (e) { /* ничего */ }
  }

  // Браузер разрешает звук только после касания экрана: стартуем на первом тапе.
  function arm() {
    const go = () => {
      if (Store.d.music) start();
      document.removeEventListener('pointerdown', go);
      document.removeEventListener('keydown', go);
    };
    document.addEventListener('pointerdown', go);
    document.addEventListener('keydown', go);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else if (Store.d.music && ctx) start();
    });
  }

  return {
    arm,
    toggle() {
      Store.d.music = !Store.d.music;
      Store.save();
      Store.d.music ? start() : stop();
      return Store.d.music;
    },
  };
})();
