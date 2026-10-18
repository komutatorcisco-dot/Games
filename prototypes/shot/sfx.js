// Звуки «Удара» — без файлов, синтез в WebAudio: удар по мячу, сетка, штанга, руки вратаря, трибуны (гул, «у-у-у», рёв на гол).
// Звук включается после первого касания экрана (так требуют браузеры).
let ac = null, master = null, noiseBuf = null, crowd = null;
// настройки «Звук» и «Вибрация» из меню (общие для всех режимов, хранятся на телефоне)
const pref = (k) => { try { return localStorage.getItem(k) !== '0'; } catch (e) { return true; } };
let muted = !pref('sj.sound'), vibro = pref('sj.vibro');
export function setSound(on) { muted = !on; try { localStorage.setItem('sj.sound', on ? '1' : '0'); } catch (e) { /* без памяти */ } if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ac.currentTime, 0.05); }
export function setVibro(on) { vibro = on; try { localStorage.setItem('sj.vibro', on ? '1' : '0'); } catch (e) { /* без памяти */ } }
export const soundOn = () => !muted, vibroOn = () => vibro;
// пауза: весь звук (и гул трибун) замолкает, при продолжении — возвращается
let held = false;
export function pause(on) { held = on; if (!ac) return; if (on) ac.suspend(); else ac.resume(); }

function init() {
  if (ac) { if (ac.state === 'suspended' && !held) ac.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  ac = new C(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.9;
  const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
  // 2 секунды «розового» шума — из него делаем и трибуны, и шелест
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + w * 0.03; b1 = 0.985 * b1 + w * 0.06; b2 = 0.95 * b2 + w * 0.12; d[i] = (b0 + b1 + b2 + w * 0.08) * 0.9; }
  startCrowd();
}
addEventListener('pointerdown', init, { capture: true }); addEventListener('keydown', init, { capture: true });

const now = () => ac.currentTime;
function noise(dur, { type = 'bandpass', f = 1000, q = 1, gain = 0.5, attack = 0.002, f2 = null, at = 0 } = {}) {
  const t = now() + at, s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q; if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}
function tone(f0, f1, dur, gain, type = 'sine', at = 0) {
  const t = now() + at, o = ac.createOscillator(), g = ac.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}

// удар по мячу: глухой «бум» (сила), щелчок кожи и короткий свист воздуха
export function kick(p = 0.7) {
  if (!ac) return;
  tone(150 + p * 40, 45, 0.16 + p * 0.06, 0.55 + p * 0.45);
  noise(0.05, { type: 'bandpass', f: 1400, q: 0.9, gain: 0.5 + p * 0.4 });
  noise(0.018, { type: 'highpass', f: 3500, gain: 0.35 });
  noise(0.35 + p * 0.25, { type: 'bandpass', f: 600, f2: 2600, q: 1.5, gain: 0.05 + p * 0.07, attack: 0.05, at: 0.03 });
}
export function bounce(v) { if (ac && v > 1.2) { tone(120, 60, 0.08, Math.min(0.35, v * 0.05)); noise(0.03, { f: 900, gain: Math.min(0.2, v * 0.03) }); } }
export function touch() { if (ac) { tone(110, 70, 0.06, 0.18); noise(0.025, { f: 1100, gain: 0.12 }); } } // касание при ведении
export function net(v) { if (!ac) return; const k = Math.min(1, v / 25); noise(0.7, { type: 'bandpass', f: 2800, q: 0.6, gain: 0.25 + k * 0.3, attack: 0.01 }); tone(90, 50, 0.25, 0.3 * k); }
export function post() { if (!ac) return; [523, 1187, 2091, 3320].forEach((f, i) => tone(f, f * 0.995, 1.1 - i * 0.2, 0.22 / (i + 1), 'sine')); tone(160, 60, 0.12, 0.5); }
export function hands(caught) { if (!ac) return; tone(caught ? 95 : 130, 50, 0.12, 0.5); noise(caught ? 0.12 : 0.06, { type: 'lowpass', f: 1200, gain: 0.45 }); }
export function whistle() { if (!ac) return; const t = now(); for (const f of [2850, 2910]) { const o = ac.createOscillator(), g = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();
  o.frequency.value = f; l.frequency.value = 28; lg.gain.value = 60; l.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.02); g.gain.setValueAtTime(0.08, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(g); g.connect(master); o.start(t); l.start(t); o.stop(t + 0.45); l.stop(t + 0.45); } }

// трибуны: постоянный гул; level — напряжение (0..1), roar — гол, ooh — «у-у-у»
function startCrowd() {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
  const bp = ac.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 450; bp.gain.value = 6;
  const g = ac.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.16, now() + 2);
  s.connect(lp); lp.connect(bp); bp.connect(g); g.connect(master); s.start();
  crowd = { g, lp, base: 0.16, busyUntil: 0 };
}
export function level(k) { // плавно: подбегаешь к воротам — трибуны оживают
  if (!crowd || now() < crowd.busyUntil) return;
  const v = 0.14 + k * 0.14; crowd.g.gain.setTargetAtTime(v, now(), 0.6); crowd.lp.frequency.setTargetAtTime(650 + k * 700, now(), 0.6);
}
export function roar() {
  if (!crowd) return; const t = now(); crowd.busyUntil = t + 4.5;
  crowd.g.gain.cancelScheduledValues(t); crowd.g.gain.setTargetAtTime(0.75, t, 0.12); crowd.g.gain.setTargetAtTime(0.16, t + 2.4, 0.9);
  crowd.lp.frequency.cancelScheduledValues(t); crowd.lp.frequency.setTargetAtTime(2600, t, 0.1); crowd.lp.frequency.setTargetAtTime(700, t + 2.4, 0.9);
}
export function ooh() { // вздох трибун: звук «у» поднимается и опадает
  if (!crowd) return; const t = now(); crowd.busyUntil = t + 1.8;
  noise(1.6, { type: 'bandpass', f: 320, f2: 520, q: 3, gain: 0.5, attack: 0.25 });
  noise(1.6, { type: 'bandpass', f: 640, f2: 900, q: 4, gain: 0.25, attack: 0.3 });
  crowd.g.gain.setTargetAtTime(0.3, t, 0.15); crowd.g.gain.setTargetAtTime(0.16, t + 1.2, 0.5);
}

// вибрация: в Telegram — его отдача, на Android — vibrate (iPhone в браузере не умеет)
export function buzz(kind = 'medium') {
  if (!vibro) return;
  try {
    const tg = window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback;
    if (tg && Telegram.WebApp.initData) return tg.impactOccurred(kind);
    if (navigator.vibrate) navigator.vibrate(kind === 'heavy' ? 35 : kind === 'light' ? 10 : 20);
  } catch (e) { /* без вибрации */ }
}
