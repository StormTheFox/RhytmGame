/* ============================================================
NEON BEAT — script.js (v12)
Новое в этой версии:
1) Холды тянут звук, пока удерживаются; плавное затухание при отпускании.
2) Починено Ctrl+ЛКМ-перетаскивание в Piano Roll (в т.ч. группы нот).
3) Alt+Стрелки — выделение половины поля пианино относительно центра
   (центр показан пунктирным крестом; ярче при зажатом Alt).
4) В режиме "пианино" скрыты списки ноты и октавы.
============================================================ */

/* ============================================================
УТИЛИТЫ
============================================================ */
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const r1 = x => Math.round(x * 10) / 10;
const rand = (a, b) => a + Math.random() * (b - a);
const mulberry32 = a => () => {
  a |= 0; a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const TONES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const LCOL = ['#00e5ff', '#ff3ec8', '#ffd60a', '#7cff4f'];
const LRGB = [[0,229,255],[255,62,200],[255,214,10],[124,255,79]];
const KEYS = ['A', 'W', 'S', 'D'];
const KEYLANES = { KeyA: 0, KeyW: 1, KeyS: 2, KeyD: 3 };
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const HOLD_INF = 1e9;
const holdDur = n => (n && n.dur != null) ? (isFinite(n.dur) ? n.dur : HOLD_INF) : 0;

function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/* ============================================================
2. НАСТРОЙКИ И ПАЛИТРА
============================================================ */
const SET_KEY = 'neonbeat_settings_v4';
const PAL_DEF = {
  cyan: '#00e5ff', pink: '#ff3ec8', yellow: '#ffd60a', green: '#7cff4f',
  red: '#ff5050', bg: '#05060f', bg2: '#0a0d20', text: '#dfe7ff',
  'text-dim': 'rgba(223,231,255,0.55)', line: 'rgba(255,255,255,0.08)'
};
const PAL_KEYS = Object.keys(PAL_DEF);
const SET_DEF = { sfx: 80, mus: 70, cal: 0, grid: true, noteView: 'letter', gfx: 'normal', contrast: false, palette: {}, beats: true };
let sets = Object.assign({}, SET_DEF, JSON.parse(localStorage.getItem(SET_KEY) || '{}'));
const saveSets = () => localStorage.setItem(SET_KEY, JSON.stringify(sets));
const VIEWS = {
  classic: { lanes: ['C', 'D', 'E', 'F'] },
  numeric: { lanes: ['1', '2', '3', '4'] },
  letter:  { lanes: ['A', 'B', 'C', 'D'] }
};
const laneLabel = i => VIEWS[sets.noteView].lanes[i];
let editorActive = false;
let gameFromEditor = false;
const gfxPotato = () => sets.gfx === 'potato';
const gfxJuicy = () => sets.gfx === 'juicy';

function parsePaletteText(txt) {
  const out = {};
  txt.split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) return;
    const eq = line.indexOf('=');
    if (eq < 1) return;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (!/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))$/.test(v)) return;
    if (PAL_KEYS.includes(k)) out[k] = v;
  });
  return out;
}
function paletteToText(p) {
  if (!p || !Object.keys(p).length) return PAL_KEYS.map(k => `${k}=${PAL_DEF[k]}`).join('\n');
  return Object.keys(p).map(k => `${k}=${p[k]}`).join('\n');
}
function applyPalette() {
  const root = document.documentElement;
  const pal = Object.assign({}, PAL_DEF, sets.palette);
  if (sets.contrast) {
    pal.bg = '#000000'; pal.bg2 = '#000000'; pal.text = '#ffffff';
    pal['text-dim'] = 'rgba(255,255,255,0.65)'; pal.line = 'rgba(255,255,255,0.15)';
    document.body.classList.add('contrast');
  } else document.body.classList.remove('contrast');
  for (const k in pal) root.style.setProperty('--' + k, pal[k]);
  ['cyan', 'pink', 'yellow', 'green'].forEach((k, i) => {
    if (pal[k] && /^#/.test(pal[k])) { LCOL[i] = pal[k]; LRGB[i] = hexToRgb(pal[k]); }
  });
}
function applyPaletteFromText() {
  const p = parsePaletteText(setPalette.value);
  sets.palette = p; saveSets(); applyPalette();
}
function loadPaletteFile() { setPaletteFile.click(); }
function exportPalette() {
  const txt = paletteToText(sets.palette);
  const blob = new Blob([txt], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'neonbeat.palette.txt'; a.click();
}
function resetPalette() {
  sets.palette = {}; saveSets();
  setPalette.value = paletteToText({}); applyPalette();
}
setPaletteFile.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    const p = parsePaletteText(String(r.result));
    sets.palette = p; saveSets();
    setPalette.value = paletteToText(p); applyPalette();
  };
  r.readAsText(f);
  e.target.value = '';
});
function resetSets() {
  sets = Object.assign({}, SET_DEF, { palette: {} });
  saveSets(); applySetsToUI(); applyPalette(); AudioSys.applyVolumes();
}
function applySetsToUI() {
  setSfx.value = sets.sfx; setMus.value = sets.mus; setCal.value = sets.cal;
  setGrid.checked = sets.grid; setContrast.checked = sets.contrast;
  setPalette.value = paletteToText(sets.palette);
  const sb = document.getElementById('setBeats');
  if (sb) sb.checked = !!sets.beats;
  setSfxV.textContent = sets.sfx + '%';
  setMusV.textContent = sets.mus + '%';
  setCalV.textContent = (sets.cal > 0 ? '+' : '') + sets.cal + ' мс';
  document.querySelectorAll('input[name=nv]').forEach(r => { r.checked = (r.value === sets.noteView); });
  document.querySelectorAll('#gfxChips .chip').forEach(c => { c.classList.toggle('on', c.dataset.gfx === sets.gfx); });
  if (typeof ED !== 'undefined') ED.gridShow = sets.grid;
}

/* ============================================================
3. АУДИО
============================================================ */
const AudioSys = {
  ctx: null, sfx: null, mus: null, noise: null, customs: {},
  /* Карта активных "тянущихся" голосов холдов: ключ(объект ноты) -> {o, g} */
  holdVoices: new Map(),

  ensure() {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      this.ctx = new C();
      this.sfx = this.ctx.createGain(); this.sfx.connect(this.ctx.destination);
      this.mus = this.ctx.createGain(); this.mus.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  applyVolumes() {
    if (!this.ctx) return;
    this.sfx.gain.value = sets.sfx / 100;
    this.mus.gain.value = sets.mus / 100;
  },
  noteFreq(tone, oct) {
    const midi = (oct + 1) * 12 + TONES.indexOf(tone);
    return 440 * Math.pow(2, (midi - 69) / 12);
  },
  drumPitch(kind, tone, oct) {
    const base = { kick: 36, snare: 60, hihat: 72, openhat: 72, clap: 60, rim: 66, tom: 50, cowbell: 72, crash: 72, ride: 74, shaker: 82 };
    const def = base[kind] != null ? base[kind] : 60;
    if (tone == null) return { mul: 1, def };
    const midi = (oct + 1) * 12 + TONES.indexOf(tone);
    return { mul: Math.pow(2, (midi - def) / 12), def };
  },

  /* --- ХОЛДЫ: тянущийся звук + плавное затухание --- */
  startHold(nd, key) {
    this.ensure();
    if (nd.inst === 'synth') {
      const freq = this.noteFreq(nd.tone || 'C', nd.oct == null ? 4 : nd.oct);
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = nd.wave || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.03);
      o.connect(g); g.connect(this.sfx);
      o.start(t);
      this.holdVoices.set(key, { o, g });
    } else {
      // Для не-синтезаторных холдов — один короткий удар
      this.playNoteData(nd);
    }
  },
  stopHold(key, fast) {
    const v = this.holdVoices.get(key);
    if (!v) return;
    this.holdVoices.delete(key);
    try {
      const t = this.ctx.currentTime;
      const fade = fast ? 0.05 : 0.22;
      const cur = Math.max(0.0001, v.g.gain.value);
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(cur, t);
      v.g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
      v.o.stop(t + fade + 0.05);
    } catch (e) { /* уже остановлен */ }
  },
  stopAllHolds() {
    for (const k of Array.from(this.holdVoices.keys())) this.stopHold(k, true);
  },

  playNoteData(nd) {
    this.ensure();
    const t = this.ctx.currentTime + 0.01;
    if (nd.inst === 'empty') return;
    if (nd.inst === 'synth') {
      this.synth(this.noteFreq(nd.tone || 'C', nd.oct == null ? 4 : nd.oct), nd.wave || 'sine', t, nd.dur ? holdDur(nd) / 1000 : 0.22);
    } else if (nd.inst === 'drum') {
      this.drum(nd.drum || 'kick', t, nd.tone, nd.oct);
    } else if (nd.inst === 'custom' && nd.custom && this.customs[nd.custom]) {
      this.playBuf(this.customs[nd.custom], t);
    }
  },
  synth(freq, wave, t, dur) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = wave; o.frequency.value = freq;
    const d = Math.max(0.15, dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(this.sfx);
    o.start(t); o.stop(t + d + 0.05);
  },
  noiseHit(filterType, freq, vol, dur, t, q) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq;
    if (q != null) f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t); s.stop(t + dur + 0.03);
  },
  drumTone(freq0, freq1, vol, dur, t, type) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t + dur * 0.9);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.03);
  },
  drum(kind, t, tone, oct) {
    const { mul } = this.drumPitch(kind, tone, oct);
    const M = f => f * mul;
    switch (kind) {
      case 'kick': {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(M(150), t);
        o.frequency.exponentialRampToValueAtTime(M(45), t + 0.12);
        g.gain.setValueAtTime(0.9, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); g.connect(this.sfx);
        o.start(t); o.stop(t + 0.35);
        break;
      }
      case 'snare': {
        this.noiseHit('bandpass', M(1800), 0.55, 0.18, t, 0.8);
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'triangle'; o.frequency.value = M(190);
        g.gain.setValueAtTime(0.35, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(g); g.connect(this.sfx);
        o.start(t); o.stop(t + 0.12);
        break;
      }
      case 'hihat': this.noiseHit('highpass', M(7500), 0.32, 0.055, t, 0.7); break;
      case 'openhat': this.noiseHit('highpass', M(7000), 0.28, 0.32, t, 0.6); break;
      case 'clap': {
        const base = M(1200);
        for (let i = 0; i < 3; i++) {
          const dt = i * 0.012;
          this.noiseHit('bandpass', base, 0.55 - i * 0.12, 0.05, t + dt, 1.2);
        }
        this.noiseHit('bandpass', base * 0.85, 0.30, 0.16, t + 0.032, 1.0);
        break;
      }
      case 'rim': {
        this.noiseHit('bandpass', M(3200), 0.45, 0.035, t, 2.5);
        this.drumTone(M(1700), M(900), 0.28, 0.05, t, 'square');
        break;
      }
      case 'tom': {
        this.drumTone(M(180), M(70), 0.75, 0.30, t, 'sine');
        this.noiseHit('lowpass', M(900), 0.18, 0.04, t, 0.7);
        break;
      }
      case 'cowbell': {
        const freqs = [M(540), M(800)];
        for (const f of freqs) {
          const o = this.ctx.createOscillator(), g = this.ctx.createGain();
          o.type = 'square'; o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.18, t + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
          o.connect(g); g.connect(this.sfx);
          o.start(t); o.stop(t + 0.3);
        }
        break;
      }
      case 'crash': {
        this.noiseHit('highpass', M(4500), 0.42, 1.1, t, 0.6);
        this.noiseHit('bandpass', M(9000), 0.18, 0.9, t + 0.005, 0.9);
        break;
      }
      case 'ride': {
        this.noiseHit('highpass', M(6000), 0.20, 0.55, t, 0.8);
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'triangle'; o.frequency.value = M(1200);
        g.gain.setValueAtTime(0.10, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.connect(g); g.connect(this.sfx);
        o.start(t); o.stop(t + 0.42);
        break;
      }
      case 'shaker': {
        this.noiseHit('highpass', M(6000), 0.22, 0.09, t, 1.1);
        this.noiseHit('bandpass', M(9000), 0.10, 0.06, t + 0.01, 1.4);
        break;
      }
      default: this.drumTone(M(150), M(50), 0.8, 0.25, t, 'sine');
    }
  },
  playBuf(buf, t) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.connect(this.sfx); s.start(t);
  },
  missSound() {
    this.ensure();
    this.noiseHit('lowpass', 400, 0.16, 0.12, this.ctx.currentTime);
  },
  comboChime(n) {
    this.ensure();
    const t = this.ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.5];
    const f = freqs[Math.min(3, Math.floor(n / 25))];
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g); g.connect(this.sfx);
    o.start(t); o.stop(t + 0.4);
  },
  loadCustom(name, file) {
    return new Promise(res => {
      const r = new FileReader();
      r.onload = () => {
        this.ensure();
        this.ctx.decodeAudioData(r.result, b => { this.customs[name] = b; res(true); }, () => res(false));
      };
      r.readAsArrayBuffer(file);
    });
  }
};

/* ============================================================
3.5. ОПРЕДЕЛЕНИЕ БИТОВ (onset detection)
============================================================ */
function analyzeBeats(audioBuffer) {
  const sr = audioBuffer.sampleRate;
  const nCh = audioBuffer.numberOfChannels;
  const len = audioBuffer.length;
  if (!len) return [];
  const L = audioBuffer.getChannelData(0);
  const R = nCh > 1 ? audioBuffer.getChannelData(1) : null;
  const frameSize = 2048, hopSize = 512;
  const numFrames = Math.floor((len - frameSize) / hopSize);
  if (numFrames < 8) return [];
  const energy = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    let sum = 0;
    const start = f * hopSize;
    for (let i = 0; i < frameSize; i++) {
      const l = L[start + i] || 0;
      const s = R ? (l + (R[start + i] || 0)) * 0.5 : l;
      sum += s * s;
    }
    energy[f] = Math.sqrt(sum / frameSize);
  }
  const onset = new Float32Array(numFrames);
  for (let f = 1; f < numFrames; f++) {
    const d = energy[f] - energy[f - 1];
    onset[f] = d > 0 ? d : 0;
  }
  const cumsum = new Float64Array(numFrames + 1);
  for (let i = 0; i < numFrames; i++) cumsum[i + 1] = cumsum[i] + onset[i];
  const frameRate = sr / hopSize;
  const win = Math.max(4, Math.floor(frameRate * 0.35));
  const minGap = Math.max(2, Math.floor(frameRate * 0.18));
  const globalMean = cumsum[numFrames] / numFrames;
  const beats = [];
  let lastPeak = -minGap;
  for (let f = 1; f < numFrames - 1; f++) {
    const a = Math.max(0, f - win);
    const b = Math.min(numFrames, f + win + 1);
    const localMean = (cumsum[b] - cumsum[a]) / (b - a);
    const thresh = localMean * 1.6 + globalMean * 0.05;
    if (onset[f] > thresh && onset[f] >= onset[f - 1] && onset[f] >= onset[f + 1]) {
      if (f - lastPeak >= minGap) {
        beats.push(Math.round((f * hopSize) / sr * 1000));
        lastPeak = f;
      }
    }
  }
  return beats;
}

/* ============================================================
4. ПЕСНИ
============================================================ */
const SONG_NAMES = ['Обучение','Neon Pulse','Cyber Drift','Pixel Rain','Midnight Drive','Bass Horizon','Chrome Sky','Overdrive','Digital Storm','Final Protocol'];
function tutorialSong() {
  const bpm = 88, bt = 60000 / bpm;
  const notes = [], tut = [];
  const N = (b, l, o = {}) => notes.push(Object.assign({
    t: r1(b * bt), lane: l, type: 'tap', inst: 'synth', tone: 'C', oct: 4, wave: 'sine'
  }, o));
  const T = (b, text) => tut.push({ t: r1(b * bt), text });
  const mel = ['C', 'D', 'E', 'G', 'A'];
  T(0, 'Добро пожаловать в NEON BEAT! Ноты падают вниз. Жми клавишу, когда нота достигает линии удара.');
  T(6, 'Это дорожка 1. Жми клавишу [A] в такт!');
  [8, 10, 12, 14].forEach(b => N(b, 0));
  T(16, 'Дорожка 2 — клавиша [W].');
  [16, 18, 20, 22].forEach(b => N(b, 1, { tone: 'D' }));
  T(24, 'Дорожка 3 — клавиша [S].');
  [24, 26, 28, 30].forEach(b => N(b, 2, { tone: 'E' }));
  T(32, 'Дорожка 4 — клавиша [D].');
  [32, 34, 36, 38].forEach(b => N(b, 3, { tone: 'G' }));
  T(40, 'Отлично! Теперь чередуем дорожки — следи за цветами.');
  [0, 1, 2, 3, 3, 2, 1, 0].forEach((l, i) => N(40 + i * 2, l, { tone: mel[l] }));
  T(56, 'Новое: HOLD-ноты с хвостом! Нажми в начале и УДЕРЖИВАЙ клавишу до конца хвоста.');
  N(58, 0, { type: 'hold', dur: bt * 2 });
  N(62, 2, { type: 'hold', dur: bt * 2 });
  N(66, 1, { type: 'hold', dur: bt * 2 });
  N(70, 3, { type: 'hold', dur: bt * 2 });
  T(74, 'А это SKIP-ноты (красный ромб ⊘). Их НАЖИМАТЬ НЕЛЬЗЯ — просто пропусти!');
  N(76, 1, { type: 'skip' });
  N(78, 2, { type: 'skip' });
  N(80, 0, { type: 'skip' });
  N(82, 3, { type: 'skip' });
  T(84, 'Финальный отрезок: собери всё вместе. Удачи!');
  for (let b = 84; b < 96; b++) N(b, [0, 1, 2, 3, 2, 1][b % 6], { tone: mel[b % 5] });
  N(96, 0, { type: 'hold', dur: bt * 3 });
  T(96, 'Последний длинный холд... и держи!');
  notes.sort((a, b) => a.t - b.t);
  return { name: SONG_NAMES[0], bpm, difficulty: 0, notes, tut };
}
function genSong(lv) {
  const rng = mulberry32(1234 + lv * 99991);
  const bpm = 84 + lv * 11, bt = 60000 / bpm;
  const bars = 10 + lv * 3, total = bars * 4;
  const notes = [];
  const pent = [0, 3, 5, 7, 10];
  const waves = ['sine', 'square', 'sawtooth', 'triangle'];
  const freeAt = [-1e9, -1e9, -1e9, -1e9];
  const step = lv >= 4 ? 0.5 : 1;
  for (let b = 0; b < total; b += step) {
    const isDown = b % 1 === 0;
    const isEvenBeat = (b % 2) === 0;
    let dens = 0.30 + lv * 0.055 + (isDown ? 0.18 : 0);
    if (b < 2) dens = 1;
    if (rng() > dens) continue;
    const order = [0, 1, 2, 3].sort(() => rng() - 0.5);
    let lane = -1;
    for (const l of order) if (b * bt >= freeAt[l] + 100) { lane = l; break; }
    if (lane < 0) continue;
    const t = b * bt;
    if (lv >= 2 && isDown && rng() < 0.05 + 0.01 * lv) {
      notes.push({ t: r1(t), lane, type: 'skip', inst: 'empty' });
      freeAt[lane] = t + 230;
      continue;
    }
    const holdCh = lv >= 2 ? 0.04 + 0.022 * lv : 0;
    if (rng() < holdCh) {
      const dur = (1 + (rng() < 0.4 ? 1 : 0)) * bt;
      notes.push({ t: r1(t), lane, type: 'hold', dur: r1(dur), inst: 'synth',
        tone: TONES[pent[Math.floor(rng() * 5)]], oct: 3 + Math.floor(rng() * 2), wave: waves[Math.floor(rng() * 4)] });
      freeAt[lane] = t + dur + 100;
    } else {
      if (rng() < 0.28) {
        const kind = isEvenBeat ? 'kick' : (isDown ? (rng() < 0.5 ? 'snare' : 'clap') : 'hihat');
        notes.push({ t: r1(t), lane, type: 'tap', inst: 'drum', drum: kind });
      } else {
        notes.push({ t: r1(t), lane, type: 'tap', inst: 'synth',
          tone: TONES[pent[Math.floor(rng() * 5)]], oct: 3 + Math.floor(rng() * 3),
          wave: lv >= 5 ? waves[Math.floor(rng() * 4)] : 'sine' });
      }
      freeAt[lane] = t + 230;
      if (lv >= 6 && isDown && rng() < 0.10 + 0.03 * lv) {
        for (const l of order) {
          if (l !== lane && b * bt >= freeAt[l] + 100) {
            notes.push({ t: r1(t), lane: l, type: 'tap', inst: 'drum', drum: isEvenBeat ? 'kick' : 'snare' });
            freeAt[l] = t + 230;
            break;
          }
        }
      }
    }
  }
  notes.sort((a, b) => a.t - b.t);
  return { name: SONG_NAMES[lv], bpm, difficulty: lv, notes };
}
const SONGS = [tutorialSong()];
for (let lv = 1; lv <= 9; lv++) SONGS.push(genSong(lv));
function getCustomTracks() {
  try { return JSON.parse(localStorage.getItem('neonbeat_custom') || '[]'); } catch (e) { return []; }
}
function setCustomTracks(a) { localStorage.setItem('neonbeat_custom', JSON.stringify(a)); }

/* ============================================================
5. НАВИГАЦИЯ
============================================================ */
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  editorActive = (id === 'scr-editor');
  if (id === 'scr-songs') renderSongList();
  if (id !== 'scr-game') G.active = false;
  if (id !== 'scr-editor') edStopPreview();
  if (id !== 'scr-editor') edHideContextMenu();
  if (id === 'scr-editor') updateEdModeUI();
}
function openSongs() { show('scr-songs'); }
function openEditor() { show('scr-editor'); updateEdModeUI(); }
function exitTo(id) {
  G.active = false; G.ended = true;
  AudioSys.stopAllHolds();
  if (G.bgAudioEl) { G.bgAudioEl.pause(); G.bgAudioEl = null; }
  if (AudioSys.ctx && AudioSys.ctx.state === 'suspended') AudioSys.ctx.resume();
  pauseOv.classList.add('hidden');
  resOv.classList.add('hidden');
  show(id);
}
function exitToEditor() { gameFromEditor = false; exitTo('scr-editor'); }
function restartSong() {
  pauseOv.classList.add('hidden');
  resOv.classList.add('hidden');
  startSong(G.song, G.autoplay, gameFromEditor);
}

/* ============================================================
6. СПИСОК ПЕСЕН
============================================================ */
function renderSongList() {
  const box = document.getElementById('songList');
  box.innerHTML = '';
  SONGS.forEach((s, i) => {
    const dur = Math.max(...s.notes.map(n => n.t + (n.dur || 0)), 0) / 1000;
    const card = document.createElement('div');
    card.className = 'song-card';
    card.innerHTML = `<div class="num">${i}</div><div class="info"><div class="nm">${i === 0 ? '📖 ' : ''}${s.name}</div><div class="meta">${s.bpm} BPM · нот: ${s.notes.length} · ~${Math.round(dur)} c · <span class="stars">${'★'.repeat(Math.max(1, s.difficulty))}${'☆'.repeat(9 - s.difficulty)}</span></div></div><button class="btn small accent">▶ Играть</button>`;
    card.querySelector('button').onclick = () => startSong(s);
    box.appendChild(card);
  });
  const customs = getCustomTracks();
  if (customs.length) {
    const h = document.createElement('h3');
    h.style.marginTop = '10px';
    h.textContent = '🎵 Мои треки';
    box.appendChild(h);
    customs.forEach((s, idx) => {
      const card = document.createElement('div');
      card.className = 'song-card custom';
      card.innerHTML = `<div class="num" style="color:var(--green)">✎</div><div class="info"><div class="nm">${s.name}</div><div class="meta">${s.bpm} BPM · нот: ${s.notes.length}${s.beats && s.beats.length ? ' · 🥁 ' + s.beats.length : ''}</div></div><button class="btn small accent">▶</button><button class="btn small">✎</button><button class="btn small danger">🗑</button>`;
      const [bPlay, bEd, bDel] = card.querySelectorAll('button');
      bPlay.onclick = () => startSong(s);
      bEd.onclick = () => { edLoadTrack(s); openEditor(); };
      bDel.onclick = () => {
        if (confirm('Удалить трек?')) {
          const a = getCustomTracks();
          a.splice(idx, 1);
          setCustomTracks(a);
          renderSongList();
        }
      };
      box.appendChild(card);
    });
  }
}

/* ============================================================
7. ИГРА — СОСТОЯНИЕ
============================================================ */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const pauseOv = document.getElementById('pauseOv');
const resOv = document.getElementById('resOv');
const resRank = document.getElementById('resRank');
const resStats = document.getElementById('resStats');
const SPEED = 0.5;
const HP_MAX = 100, HP_START = 100;
const HP_PERFECT = +1.2, HP_GOOD = +0.6, HP_HOLD = +0.8, HP_SKIPOK = +0.5;
const HP_MISS = -12, HP_HOLDBREAK = -10, HP_WRONGSKIP = -14;
const G = {
  active: false, song: null, runtime: [], startTime: 0, pausedTotal: 0, pauseStart: 0,
  paused: false, ended: false, autoplay: false, score: 0, combo: 0, maxCombo: 0,
  cnt: { perfect: 0, good: 0, miss: 0, hold: 0, skip: 0 },
  effects: [], particles: [], keys: [false, false, false, false],
  bgAudioEl: null, songDur: 0, pendingStart: 0, shake: 0, missGlow: 0, perfectGlow: 0,
  hitGlow: [0, 0, 0, 0], comboPop: 0, lastCombo: 0, scorePop: 0, lastScore: 0,
  beatPulse: 0, holdEmit: 0, hp: HP_START, hpFlash: 0, hpShake: 0, defeated: false
};
let cvW = 0, cvH = 0, cachedDims = null;
function gameDims() {
  if (cvW === cv.width && cvH === cv.height && cachedDims) return cachedDims;
  const W = cv.width, H = cv.height;
  const laneW = Math.min(110, Math.max(64, W / 6));
  cachedDims = { W, H, laneW, x0: (W - laneW * 4) / 2, hitY: H - 130 };
  cvW = W; cvH = H;
  return cachedDims;
}
const songTime = () => performance.now() - G.startTime - G.pausedTotal;
const mult = () => 1 + Math.min(3, Math.floor(G.combo / 20) * 0.5);
function screenShake(a) { if (gfxPotato()) return; G.shake = Math.min(18, G.shake + a); }
function applyHp(delta) {
  if (G.autoplay || G.ended) return;
  G.hp = clamp(G.hp + delta, 0, HP_MAX);
  if (delta < 0) {
    G.hpFlash = 1;
    G.hpShake = Math.min(14, G.hpShake + Math.abs(delta) * 0.55);
  } else G.hpFlash = Math.max(G.hpFlash, 0.35);
  if (G.hp <= 0 && !G.defeated) defeatSong();
}
function defeatSong() {
  G.defeated = true; G.ended = true;
  AudioSys.stopAllHolds();
  if (G.bgAudioEl) G.bgAudioEl.pause();
  if (AudioSys.ctx) AudioSys.ctx.suspend();
  resRank.textContent = 'F';
  resRank.style.color = '#ff5050';
  resRank.style.textShadow = '0 0 40px #ff5050, 0 0 80px #ff5050';
  const total = G.runtime.length || 1;
  const acc = Math.round((G.cnt.perfect + G.cnt.good * 0.5) / total * 100);
  resStats.innerHTML = `<div style="color:#ff5050;font-weight:800;letter-spacing:.15em;margin-bottom:8px">ПОРАЖЕНИЕ — ШКАЛА ОПУСТИЛАСЬ</div>Счёт: <b>${G.score}</b><br>Макс. комбо: <b>${G.maxCombo}</b><br>Точность: <b>${acc}%</b><br><span style="font-size:14px;opacity:.8">PERFECT ${G.cnt.perfect} · GOOD ${G.cnt.good} · MISS ${G.cnt.miss} · HOLD ${G.cnt.hold} · SKIP ${G.cnt.skip}</span>`;
  refreshResultOverlay();
  resOv.classList.remove('hidden');
}

/* ============================================================
8. СТАРТ / ПАУЗА
============================================================ */
function startSong(song, autoplay = false, fromEditor = false) {
  edStopPreview();
  AudioSys.ensure();
  AudioSys.stopAllHolds();
  gameFromEditor = !!fromEditor;
  G.song = song;
  G.autoplay = !!autoplay;
  G.runtime = song.notes.map(n => ({ ...n, st: 'pending', tick: 0 }));
  G.runtime.sort((a, b) => a.t - b.t);
  G.score = 0; G.combo = 0; G.maxCombo = 0;
  G.cnt = { perfect: 0, good: 0, miss: 0, hold: 0, skip: 0 };
  G.effects = []; G.particles = [];
  G.paused = false; G.ended = false; G.pausedTotal = 0;
  G.keys = [false, false, false, false];
  G.shake = 0; G.missGlow = 0; G.perfectGlow = 0;
  G.hitGlow = [0, 0, 0, 0];
  G.comboPop = 0; G.lastCombo = 0; G.scorePop = 0; G.lastScore = 0;
  G.hp = HP_START; G.hpFlash = 0; G.hpShake = 0; G.defeated = false;
  G.songDur = (G.runtime.length ? Math.max(...G.runtime.map(n => n.t + Math.min(holdDur(n), 30000))) : 3000) + 2000;
  G.startTime = performance.now() + 2000;
  G.pendingStart = 0;
  if (song.bgUrl) {
    G.bgAudioEl = new Audio(song.bgUrl);
    G.bgAudioEl.volume = sets.mus / 100;
    setTimeout(() => { if (G.active && G.bgAudioEl) G.bgAudioEl.play().catch(() => {}); }, 2000);
  } else G.bgAudioEl = null;
  pauseOv.classList.add('hidden');
  resOv.classList.add('hidden');
  G.active = true;
  show('scr-game');
  cachedDims = null;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  cv.tabIndex = -1;
  try { cv.focus({ preventScroll: true }); } catch (err) { cv.focus(); }
}
function refreshPauseOverlay() {
  const btns = pauseOv.querySelectorAll('.menu-btns .btn');
  if (!btns.length) return;
  const back = btns[btns.length - 1];
  if (gameFromEditor) {
    back.textContent = '← Вернуться в редактор';
    back.onclick = () => { gameFromEditor = false; togglePause(); exitToEditor(); };
  } else {
    back.textContent = '⬅ Вернуться назад';
    back.onclick = () => exitTo('scr-songs');
  }
}
function refreshResultOverlay() {
  const btns = resOv.querySelectorAll('.menu-btns .btn');
  if (!btns.length) return;
  const cont = btns[0], again = btns[1];
  if (gameFromEditor) {
    cont.textContent = '← Вернуться в редактор';
    cont.onclick = () => { gameFromEditor = false; exitToEditor(); };
  } else {
    cont.textContent = 'Продолжить';
    cont.onclick = () => exitTo('scr-songs');
  }
  again.onclick = () => restartSong();
}
function togglePause() {
  if (!G.active || G.ended) return;
  if (!G.paused) {
    G.paused = true;
    G.pauseStart = performance.now();
    if (AudioSys.ctx) AudioSys.ctx.suspend();
    if (G.bgAudioEl) G.bgAudioEl.pause();
    refreshPauseOverlay();
    pauseOv.classList.remove('hidden');
  } else {
    G.pausedTotal += performance.now() - G.pauseStart;
    G.paused = false;
    if (AudioSys.ctx) AudioSys.ctx.resume();
    if (G.bgAudioEl) G.bgAudioEl.play().catch(() => {});
    pauseOv.classList.add('hidden');
  }
}

/* ============================================================
9. ХИТ-ФИДБЕК
============================================================ */
function addFx(lane, text, color) {
  G.effects.push({ lane, text, color, t0: songTime(), scale: 0 });
}
function burst(x, y, color, n, power) {
  if (gfxPotato()) return;
  const count = gfxJuicy() ? n : Math.max(2, Math.floor(n / 2));
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(power * 0.4, power);
    G.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.8 - rand(40, 140),
      life: 1, ttl: rand(0.4, 0.85), color, size: rand(2, 4.5)
    });
  }
  const max = gfxJuicy() ? 400 : 120;
  if (G.particles.length > max) G.particles.splice(0, G.particles.length - max);
}
function ringBurst(lane, color, big) {
  const d = gameDims();
  burst(d.x0 + lane * d.laneW + d.laneW / 2, d.hitY, color, big ? 18 : 12, big ? 420 : 280);
}

/* ============================================================
10. ВВОД
============================================================ */
function pressLane(lane) {
  G.keys[lane] = true;
  if (!G.active || G.paused || G.ended || G.autoplay) return;
  const st = songTime() + sets.cal;
  for (let i = G.pendingStart; i < G.runtime.length; i++) {
    const n = G.runtime[i];
    if (n.st !== 'pending') continue;
    if (n.t - st > 130) break;
    if (n.lane !== lane) continue;
    if (n.type === 'skip') {
      const dt = Math.abs(n.t - st);
      if (dt <= 130) {
        n.st = 'missed';
        G.combo = 0; G.cnt.miss++;
        addFx(lane, 'НЕЛЬЗЯ!', '#ff5050');
        G.missGlow = 1;
        screenShake(7);
        AudioSys.missSound();
        const d = gameDims();
        burst(d.x0 + lane * d.laneW + d.laneW / 2, d.hitY, '#ff5050', 14, 260);
        applyHp(HP_WRONGSKIP);
        return;
      }
    }
  }
  let best = null, bestAbs = 1e9;
  for (let i = G.pendingStart; i < G.runtime.length; i++) {
    const n = G.runtime[i];
    if (n.st !== 'pending') continue;
    if (n.t - st > 130) break;
    if (n.lane !== lane) continue;
    if (n.type === 'skip') continue;
    const dt = Math.abs(n.t - st);
    if (dt > 130) continue;
    if (dt < bestAbs) { best = n; bestAbs = dt; }
  }
  if (!best) return;
  const judge = bestAbs <= 50 ? 'PERFECT' : 'GOOD';
  if (judge === 'PERFECT') {
    G.cnt.perfect++;
    G.score += Math.round(100 * mult());
    G.perfectGlow = 0.5;
    screenShake(2.5);
  } else {
    G.cnt.good++;
    G.score += Math.round(50 * mult());
    screenShake(1.2);
  }
  G.combo++;
  G.maxCombo = Math.max(G.maxCombo, G.combo);

  // ХОЛД: запускаем тянущийся звук; ТАП: одиночный удар
  if (best.type === 'hold') {
    AudioSys.startHold(best, best);
    best.st = 'holding';
  } else {
    AudioSys.playNoteData(best);
    best.st = 'done';
  }

  addFx(lane, judge, judge === 'PERFECT' ? '#7cff4f' : '#ffd60a');
  G.hitGlow[lane] = 1;
  ringBurst(lane, LCOL[best.lane], judge === 'PERFECT');
  applyHp(judge === 'PERFECT' ? HP_PERFECT : HP_GOOD);
}
function releaseLane(lane) {
  G.keys[lane] = false;
  if (!G.active || G.paused || G.ended || G.autoplay) return;
  const n = G.runtime.find(n => n.lane === lane && n.st === 'holding');
  if (!n) return;
  if ((n.t + holdDur(n)) - songTime() > 130) {
    // Отпустили раньше времени — обрыв холда
    AudioSys.stopHold(n);
    n.st = 'released';
    G.combo = 0;
    addFx(lane, 'ОТПУЩЕНО', '#ff5050');
    screenShake(4);
    applyHp(HP_HOLDBREAK);
  } else finishHold(n);
}
function finishHold(n) {
  AudioSys.stopHold(n); // плавное затухание
  n.st = 'done';
  G.cnt.hold++;
  G.combo++;
  G.score += Math.round(50 * mult());
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  addFx(n.lane, 'HOLD +', '#00e5ff');
  G.hitGlow[n.lane] = 1;
  ringBurst(n.lane, '#00e5ff', false);
  screenShake(1.5);
  applyHp(HP_HOLD);
}

/* ============================================================
11. ОБНОВЛЕНИЕ
============================================================ */
function updateGame(st, dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 700 * dt; p.vx *= 0.985;
    p.life -= dt / p.ttl;
    if (p.life <= 0 || p.y > cv.height + 40) G.particles.splice(i, 1);
  }
  G.hitGlow = G.hitGlow.map(v => v * 0.9);
  G.missGlow *= 0.9; G.perfectGlow *= 0.9;
  G.comboPop *= 0.85; G.scorePop *= 0.85; G.beatPulse *= 0.9;
  if (G.paused || G.ended) return;
  const beatMs = 60000 / G.song.bpm;
  if (st > 0 && ((st % beatMs) + beatMs) % beatMs < 40) G.beatPulse = 1;
  if (G.autoplay) {
    while (G.pendingStart < G.runtime.length &&
      G.runtime[G.pendingStart].st !== 'pending' &&
      G.runtime[G.pendingStart].st !== 'holding') G.pendingStart++;
    for (let i = G.pendingStart; i < G.runtime.length; i++) {
      const n = G.runtime[i];
      if (n.st === 'pending') {
        if (n.t > st) break;
        if (n.type === 'skip') {
          if (st >= n.t + 130) { n.st = 'done'; G.cnt.skip++; }
          continue;
        }
        if (n.type === 'hold') AudioSys.startHold(n, n);
        else AudioSys.playNoteData(n);
        G.cnt.perfect++; G.combo++;
        G.score += Math.round(100 * mult());
        addFx(n.lane, 'PERFECT', '#7cff4f');
        G.hitGlow[n.lane] = 1;
        ringBurst(n.lane, LCOL[n.lane], true);
        n.st = (n.type === 'hold') ? 'holding' : 'done';
      } else if (n.st === 'holding' && st >= n.t + holdDur(n)) finishHold(n);
    }
  } else {
    while (G.pendingStart < G.runtime.length &&
      G.runtime[G.pendingStart].st !== 'pending' &&
      G.runtime[G.pendingStart].st !== 'holding') G.pendingStart++;
    const missThresh = -(130 + Math.abs(sets.cal));
    for (let i = G.pendingStart; i < G.runtime.length; i++) {
      const n = G.runtime[i];
      const diff = n.t - st;
      if (n.st === 'pending') {
        if (diff > 130) break;
        if (n.type === 'skip') {
          if (diff < missThresh) {
            n.st = 'done'; G.cnt.skip++;
            G.score += 30;
            addFx(n.lane, 'ПРОПУСК OK', '#7cff4f');
            applyHp(HP_SKIPOK);
          }
          continue;
        }
        if (diff < missThresh) {
          n.st = 'missed';
          G.combo = 0; G.cnt.miss++;
          addFx(n.lane, 'MISS', '#ff5050');
          G.missGlow = 1;
          screenShake(5);
          AudioSys.missSound();
          const d = gameDims();
          burst(d.x0 + n.lane * d.laneW + d.laneW / 2, d.hitY, '#ff5050', 8, 200);
          applyHp(HP_MISS);
        }
      } else if (n.st === 'holding') {
        if (st >= n.t + holdDur(n)) {
          if (G.keys[n.lane]) finishHold(n);
          else {
            AudioSys.stopHold(n);
            n.st = 'released'; G.combo = 0; applyHp(HP_HOLDBREAK);
          }
        } else if (G.keys[n.lane]) {
          const ticks = Math.floor((st - n.t) / 100);
          if (ticks > n.tick) {
            G.score += 2 * (ticks - n.tick);
            n.tick = ticks;
            G.holdEmit--;
            if (G.holdEmit <= 0) {
              const d = gameDims();
              burst(d.x0 + n.lane * d.laneW + d.laneW / 2, d.hitY, LCOL[n.lane], 2, 120);
              G.holdEmit = 4;
            }
          }
        }
      }
    }
  }
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  if (G.combo !== G.lastCombo) {
    if (G.combo > G.lastCombo && G.combo > 4 && G.combo % 10 === 0) {
      AudioSys.comboChime(G.combo);
      G.comboPop = 1;
    }
    G.lastCombo = G.combo;
  }
  if (G.score !== G.lastScore) { G.scorePop = 1; G.lastScore = G.score; }
  if (st > G.songDur) endSong();
}
function endSong() {
  if (G.ended) return;
  G.ended = true;
  G.runtime.forEach(n => { if (n.st === 'holding') finishHold(n); });
  AudioSys.stopAllHolds();
  if (G.bgAudioEl) G.bgAudioEl.pause();
  const total = G.runtime.length || 1;
  const acc = Math.round((G.cnt.perfect + G.cnt.good * 0.5) / total * 100);
  const rank = acc >= 95 ? 'S' : acc >= 88 ? 'A' : acc >= 75 ? 'B' : acc >= 60 ? 'C' : 'D';
  const rcol = { S: '#ffd60a', A: '#7cff4f', B: '#00e5ff', C: '#ff3ec8', D: '#ff5050' }[rank];
  resRank.textContent = rank;
  resRank.style.color = rcol;
  resRank.style.textShadow = `0 0 40px ${rcol}, 0 0 80px ${rcol}`;
  resStats.innerHTML = `Счёт: <b>${G.score}</b><br>Макс. комбо: <b>${G.maxCombo}</b><br>Точность: <b>${acc}%</b><br><span style="font-size:14px;opacity:.8">PERFECT ${G.cnt.perfect} · GOOD ${G.cnt.good} · MISS ${G.cnt.miss} · HOLD ${G.cnt.hold} · SKIP ${G.cnt.skip}</span>`;
  refreshResultOverlay();
  resOv.classList.remove('hidden');
}

/* ============================================================
12. РЕНДЕР ИГРЫ
============================================================ */
function fitCanvas(c) {
  const w = c.clientWidth | 0, h = c.clientHeight | 0;
  if (c.width !== w || c.height !== h) {
    c.width = w; c.height = h;
    if (c === cv) cachedDims = null;
    if (c === edCv) edCachedDims = null;
  }
}
function drawNoteHead(d, x, y, n, active) {
  const lane = n.lane;
  const cx = x + d.laneW / 2;
  const w = d.laneW - 16;
  const h = 30;
  if (n.type === 'skip') {
    ctx.save();
    ctx.translate(cx, y);
    ctx.fillStyle = '#ff5050';
    if (!gfxPotato()) { ctx.shadowBlur = 16; ctx.shadowColor = '#ff5050'; }
    ctx.beginPath();
    ctx.moveTo(0, -16); ctx.lineTo(16, 0); ctx.lineTo(0, 16); ctx.lineTo(-16, 0);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = '#001018'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(5, 5); ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 1;
    return;
  }
  if (n.inst === 'drum') {
    ctx.save();
    ctx.translate(cx, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = LCOL[lane];
    ctx.fillRect(-13, -13, 26, 26);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(-8, -8, 16, 16);
    ctx.restore();
  } else if (n.inst === 'custom') {
    ctx.fillStyle = LCOL[lane];
    roundRect(ctx, x + 8, y - h / 2, w, h, 6);
    ctx.fill();
    ctx.fillStyle = '#001018';
    ctx.font = 'bold 14px "Segoe UI"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('★', cx, y);
    ctx.textBaseline = 'alphabetic';
  } else if (n.inst === 'empty') {
    ctx.fillStyle = rgba(LRGB[lane], 0.12);
    roundRect(ctx, x + 8, y - h / 2, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = LCOL[lane]; ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    roundRect(ctx, x + 8, y - h / 2, w, h, 6);
    ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = 1;
    ctx.fillStyle = LCOL[lane];
    ctx.font = 'bold 16px "Segoe UI"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('∅', cx, y + 1);
    ctx.textBaseline = 'alphabetic';
  } else {
    if (gfxPotato()) {
      ctx.fillStyle = LCOL[lane];
    } else {
      const grad = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, LCOL[lane]);
      grad.addColorStop(1, LCOL[lane]);
      ctx.fillStyle = grad;
    }
    roundRect(ctx, x + 8, y - h / 2, w, h, 6);
    ctx.fill();
    if (!gfxPotato()) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      roundRect(ctx, x + 11, y - h / 2 + 3, w - 6, 6, 3);
      ctx.fill();
    }
    ctx.fillStyle = '#001018';
    ctx.font = 'bold 12px "Segoe UI"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((n.tone || '') + (n.oct == null ? '' : n.oct), cx, y + 2);
    ctx.textBaseline = 'alphabetic';
  }
  if (active) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    roundRect(ctx, x + 8, y - h / 2, w, h, 6);
    ctx.stroke(); ctx.lineWidth = 1;
  }
}
function drawGame(st) {
  fitCanvas(cv);
  const d = gameDims();
  const beatMs = 60000 / G.song.bpm;
  const potato = gfxPotato();
  const juicy = gfxJuicy();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, d.W, d.H);
  if (!potato && G.shake > 0.5) {
    ctx.translate(rand(-G.shake, G.shake), rand(-G.shake, G.shake));
    G.shake *= 0.88;
  } else G.shake = 0;
  if (potato) {
    ctx.fillStyle = '#000';
    ctx.fillRect(-40, -40, d.W + 80, d.H + 80);
  } else {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, d.H);
    bgGrad.addColorStop(0, '#05060f');
    bgGrad.addColorStop(0.7, '#080b1c');
    bgGrad.addColorStop(1, '#05060f');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(-40, -40, d.W + 80, d.H + 80);
  }
  if (juicy && G.beatPulse > 0.02) {
    const g = ctx.createRadialGradient(d.W / 2, d.hitY, 20, d.W / 2, d.hitY, d.W * 0.75);
    g.addColorStop(0, rgba(LRGB[0], G.beatPulse * 0.22));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, d.W, d.H);
  }
  for (let i = 0; i < 4; i++) {
    const x = d.x0 + i * d.laneW;
    ctx.fillStyle = potato
      ? (G.keys[i] ? 'rgba(255,255,255,0.1)' : 'transparent')
      : rgba(LRGB[i], G.keys[i] ? 0.18 : 0.05);
    ctx.fillRect(x, 0, d.laneW, d.H);
    if (!potato && G.hitGlow[i] > 0.02) {
      const g = ctx.createLinearGradient(0, d.hitY - 240, 0, d.hitY + 40);
      g.addColorStop(0, 'transparent');
      g.addColorStop(0.7, rgba(LRGB[i], G.hitGlow[i] * 0.4));
      g.addColorStop(1, rgba(LRGB[i], G.hitGlow[i] * 0.75));
      ctx.fillStyle = g;
      ctx.fillRect(x, d.hitY - 240, d.laneW, 280);
    }
  }
  const bFirst = Math.ceil((st - (d.H + 200) / SPEED) / beatMs);
  const bLast = Math.floor((st + 200 / SPEED) / beatMs);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let b = bFirst; b <= bLast; b++) {
    const y = d.hitY - (b * beatMs - st) * SPEED;
    if (y < -10 || y > d.H + 10) continue;
    ctx.moveTo(d.x0, y);
    ctx.lineTo(d.x0 + 4 * d.laneW, y);
  }
  ctx.stroke();
  if (sets.beats && G.song.beats && G.song.beats.length && !potato) {
    ctx.strokeStyle = 'rgba(255,214,10,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath();
    const beats = G.song.beats;
    for (let i = 0; i < beats.length; i++) {
      const y = d.hitY - (beats[i] - st) * SPEED;
      if (y < -20) continue;
      if (y > d.H + 20) break;
      ctx.moveTo(d.x0, y);
      ctx.lineTo(d.x0 + 4 * d.laneW, y);
    }
    ctx.stroke(); ctx.lineWidth = 1;
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const x = d.x0 + i * d.laneW;
    ctx.moveTo(x, 0); ctx.lineTo(x, d.H);
  }
  ctx.stroke();
  // HOLD-хвосты
  for (let i = 0; i < G.runtime.length; i++) {
    const n = G.runtime[i];
    if (n.type !== 'hold') continue;
    if (n.st === 'done' || n.st === 'missed' || n.st === 'released') continue;
    const yHead = d.hitY - (n.t - st) * SPEED;
    let yTail = d.hitY - (n.t + holdDur(n) - st) * SPEED;
    yTail = Math.max(yTail, -80);
    if (yTail > d.H + 80 || yHead < -80) continue;
    const x = d.x0 + n.lane * d.laneW;
    const hw = d.laneW * 0.40;
    const hx = x + d.laneW * 0.30;
    const topY = Math.min(yHead, yTail);
    const botY = Math.max(yHead, yTail);
    const active = n.st === 'holding';
    if (potato) {
      ctx.fillStyle = rgba(LRGB[n.lane], active ? 0.5 : 0.25);
    } else {
      const gg = ctx.createLinearGradient(0, topY, 0, botY);
      gg.addColorStop(0, rgba(LRGB[n.lane], active ? 0.75 : 0.35));
      gg.addColorStop(1, rgba(LRGB[n.lane], active ? 0.35 : 0.16));
      ctx.fillStyle = gg;
    }
    ctx.fillRect(hx, topY, hw, Math.max(2, botY - topY));
    ctx.strokeStyle = rgba(LRGB[n.lane], active ? 1 : 0.75);
    ctx.lineWidth = 2;
    ctx.strokeRect(hx, topY, hw, Math.max(2, botY - topY));
    ctx.lineWidth = 1;
  }
  // Ноты
  for (let i = 0; i < G.runtime.length; i++) {
    const n = G.runtime[i];
    if (n.st === 'done' || n.st === 'missed' || n.st === 'released') continue;
    const yHead = d.hitY - (n.t - st) * SPEED;
    if (yHead > d.H + 80 || (yHead < -80 && n.type !== 'hold')) continue;
    const x = d.x0 + n.lane * d.laneW;
    if (!potato && yHead > 0 && yHead < d.H) {
      ctx.fillStyle = rgba(LRGB[n.lane], 0.18);
      ctx.fillRect(x + d.laneW * 0.35, yHead - 60, d.laneW * 0.3, 58);
    }
    drawNoteHead(d, x, yHead, n, n.st === 'holding');
  }
  if (!potato) {
    for (let i = 0; i < G.particles.length; i++) {
      const p = G.particles[i];
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      const s = p.size * (0.4 + p.life * 0.6);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
  const hitPulse = 1 + G.beatPulse * 0.6 + G.perfectGlow * 0.8;
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 3 * hitPulse;
  if (!potato) { ctx.shadowBlur = 14 + G.beatPulse * 26; ctx.shadowColor = '#00e5ff'; }
  ctx.beginPath();
  ctx.moveTo(d.x0 - 22, d.hitY);
  ctx.lineTo(d.x0 + 4 * d.laneW + 22, d.hitY);
  ctx.stroke();
  ctx.shadowBlur = 0; ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const x = d.x0 + i * d.laneW;
    const cx = x + d.laneW / 2;
    const pressed = G.keys[i];
    const rx = x + 6, ry = d.hitY - 22, rw = d.laneW - 12, rh = 48;
    if (pressed && !potato) { ctx.shadowBlur = 18; ctx.shadowColor = LCOL[i]; }
    ctx.strokeStyle = LCOL[i];
    ctx.lineWidth = pressed ? 3 : 1.5;
    roundRect(ctx, rx, ry, rw, rh, 9);
    ctx.stroke();
    if (pressed) {
      ctx.fillStyle = rgba(LRGB[i], 0.28);
      roundRect(ctx, rx, ry, rw, rh, 9);
      ctx.fill();
    }
    ctx.shadowBlur = 0; ctx.lineWidth = 1;
    ctx.fillStyle = LCOL[i];
    ctx.font = 'bold 20px "Segoe UI"';
    ctx.textAlign = 'center';
    ctx.fillText(laneLabel(i), cx, d.hitY + 9);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '11px "Segoe UI"';
    ctx.fillText('[' + KEYS[i] + ']', cx, d.hitY + 36);
  }
  G.effects = G.effects.filter(e => st - e.t0 < 800);
  for (let i = 0; i < G.effects.length; i++) {
    const e = G.effects[i];
    const age = (st - e.t0) / 800;
    const alpha = 1 - age;
    const x = d.x0 + e.lane * d.laneW + d.laneW / 2;
    ctx.globalAlpha = alpha;
    if (!potato) {
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 4 * (1 - age) + 1;
      ctx.beginPath();
      ctx.arc(x, d.hitY, 22 + age * 70, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = e.color;
    ctx.font = `bold ${Math.round(18 * (1 - age * 0.35))}px "Segoe UI"`;
    ctx.textAlign = 'center';
    if (!potato) { ctx.shadowBlur = 16; ctx.shadowColor = e.color; }
    ctx.fillText(e.text, x, d.hitY - 55 - age * 45);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '13px "Segoe UI"';
  ctx.fillText(G.song.name + (G.autoplay ? ' · ДЕМО' : ''), 14, 24);
  const scoreScale = 1 + G.scorePop * 0.18;
  ctx.save();
  ctx.translate(d.W - 14, 30);
  ctx.scale(scoreScale, scoreScale);
  ctx.textAlign = 'right';
  ctx.font = 'bold 22px "Segoe UI"';
  ctx.fillStyle = '#fff';
  if (!potato) { ctx.shadowBlur = 12 * G.scorePop; ctx.shadowColor = '#00e5ff'; }
  ctx.fillText(G.score, 0, 0);
  ctx.restore();
  ctx.shadowBlur = 0;
  ctx.textAlign = 'right';
  ctx.font = '11px "Segoe UI"';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('×' + mult().toFixed(2), d.W - 14, 50);
  const lastEnd = G.songDur - 2000;
  const pw = d.W * 0.5;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(d.W * 0.25, 8, pw, 5);
  if (!potato) {
    const pg = ctx.createLinearGradient(d.W * 0.25, 0, d.W * 0.75, 0);
    pg.addColorStop(0, '#00e5ff');
    pg.addColorStop(1, '#ff3ec8');
    ctx.fillStyle = pg;
  } else ctx.fillStyle = '#fff';
  ctx.fillRect(d.W * 0.25, 8, pw * clamp(st / lastEnd, 0, 1), 5);
  // ШКАЛА ПОБЕД
  {
    const bw = Math.min(360, d.W * 0.5);
    const bx = (d.W - bw) / 2;
    const by = 22, bh = 14;
    ctx.save();
    if (G.hpShake > 0.5 && !potato) ctx.translate(rand(-G.hpShake, G.hpShake), 0);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, bx - 2, by - 2, bw + 4, bh + 4, 6);
    ctx.fill();
    const frac = G.hp / HP_MAX;
    const hue = frac > 0.5 ? '#7cff4f' : frac > 0.25 ? '#ffd60a' : '#ff5050';
    if (potato) {
      ctx.fillStyle = hue;
    } else {
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, hue);
      g.addColorStop(1, frac > 0.5 ? '#00e5ff' : hue);
      ctx.fillStyle = g;
    }
    roundRect(ctx, bx, by, Math.max(2, bw * frac), bh, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    roundRect(ctx, bx, by, bw, bh, 5);
    ctx.stroke();
    if (G.hpFlash > 0.02 && !potato) {
      ctx.globalAlpha = G.hpFlash * 0.5;
      ctx.fillStyle = hue;
      roundRect(ctx, bx - 2, by - 2, bw + 4, bh + 4, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 10px "Segoe UI"';
    ctx.textAlign = 'center';
    ctx.fillText('ШКАЛА ПОБЕД ' + Math.round(G.hp) + '%', d.W / 2, by - 6);
    ctx.restore();
    G.hpFlash *= 0.92;
    G.hpShake *= 0.85;
  }
  if (G.combo > 4) {
    const scale = 1 + G.comboPop * 0.55;
    ctx.save();
    ctx.translate(d.W / 2, d.H * 0.3);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px "Segoe UI"';
    if (potato) ctx.fillStyle = '#fff';
    else {
      const cgrad = ctx.createLinearGradient(0, -30, 0, 30);
      cgrad.addColorStop(0, '#fff');
      cgrad.addColorStop(1, '#ffd60a');
      ctx.fillStyle = cgrad;
      ctx.shadowBlur = 22; ctx.shadowColor = '#ffd60a';
    }
    ctx.fillText(G.combo, 0, 0);
    ctx.shadowBlur = 0;
    ctx.font = '12px "Segoe UI"';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('COMBO', 0, 20);
    ctx.restore();
  }
  if (st < 0) {
    const n = Math.ceil(-st / 1000);
    const frac = 1 - (-st % 1000) / 1000;
    ctx.save();
    ctx.translate(d.W / 2, d.H / 2);
    ctx.scale(0.9 + (1 - frac) * 0.4, 0.9 + (1 - frac) * 0.4);
    ctx.textAlign = 'center';
    ctx.font = 'bold 110px "Segoe UI"';
    ctx.fillStyle = '#00e5ff';
    if (!potato) { ctx.shadowBlur = 40; ctx.shadowColor = '#00e5ff'; }
    ctx.fillText(n > 0 ? n : 'GO!', 0, 0);
    ctx.restore();
    ctx.shadowBlur = 0;
  }
  if (G.song.tut) {
    let cur = null;
    for (const m of G.song.tut) { if (st >= m.t) cur = m; else break; }
    if (cur) {
      ctx.font = '15px "Segoe UI"';
      const tw = ctx.measureText(cur.text).width;
      ctx.fillStyle = 'rgba(5,8,20,0.88)';
      roundRect(ctx, d.W / 2 - tw / 2 - 16, 46, tw + 32, 38, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,229,255,0.6)'; ctx.lineWidth = 1.5;
      roundRect(ctx, d.W / 2 - tw / 2 - 16, 46, tw + 32, 38, 10);
      ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = '#dfe7ff';
      ctx.textAlign = 'center';
      ctx.fillText(cur.text, d.W / 2, 71);
    }
  }
  if (!potato && G.missGlow > 0.02) {
    const v = ctx.createRadialGradient(d.W / 2, d.H / 2, d.H * 0.2, d.W / 2, d.H / 2, d.W * 0.75);
    v.addColorStop(0, 'transparent');
    v.addColorStop(1, rgba([255, 60, 60], G.missGlow * 0.5));
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, d.W, d.H);
  }
  if (!potato && G.perfectGlow > 0.02) {
    ctx.fillStyle = rgba([200, 255, 220], G.perfectGlow * 0.08);
    ctx.fillRect(0, 0, d.W, d.H);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/* ============================================================
13. КЛАВИШИ / ТАЧ
============================================================ */
window.addEventListener('keydown', e => {
  const t = e.target;
  const isEditable = t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

  // Отслеживаем Alt для подсветки центра пианино
  if (e.key === 'Alt') ED.altDown = true;

  if (editorActive && isEditable) return;

  if (G.active) {
    if (!isEditable && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === '/' || e.key === "'" || e.key === 'Backspace' || e.key.length === 1) e.preventDefault();
    }
  }

  // F1 — помощь по редактору
  if (editorActive && e.code === 'F1') {
    e.preventDefault();
    edToggleHelp();
    return;
  }

  // ALT + СТРЕЛКИ — выделение половины поля пианино
  if (editorActive && ED.mode === 'piano' && e.altKey) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
      e.preventDefault();
      pianoSelectHalf(e.code, e.shiftKey);
      return;
    }
  }

  // Escape закрывает контекстное меню редактора
  if (editorActive && e.code === 'Escape' && edCtxMenuEl) {
    e.preventDefault();
    edHideContextMenu();
    return;
  }

  // Undo / Redo
  if (editorActive && (e.ctrlKey || e.metaKey)) {
    if (e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); edUndo(); return; }
    if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) { e.preventDefault(); edRedo(); return; }
  }

  // Escape отменяет Ctrl-перетаскивание в Piano Roll
  if (editorActive && ED.ctrlDrag && e.code === 'Escape') {
    e.preventDefault();
    pianoCancelCtrlDrag();
    return;
  }

  // Delete / Backspace удаляют выделенные ноты в Piano Roll
  if (editorActive && ED.mode === 'piano' &&
      (e.code === 'Delete' || e.code === 'Backspace') &&
      ED.pianoSelection && ED.pianoSelection.size) {
    e.preventDefault();
    edPushHistory();
    ED.notes = ED.notes.filter(n => !ED.pianoSelection.has(n));
    ED.pianoSelection.clear();
    ED.pianoSelected = null;
    edUpdateList();
    return;
  }

  // Назначение дорожки для ожидающей ноты в Piano Roll
  if (editorActive && ED.mode === 'piano' && ED.pianoPending) {
    if (e.code === 'Escape') {
      ED.pianoPending = null;
      ED.pianoDrag = null;
      e.preventDefault();
      return;
    }
    const lane = KEYLANES[e.code];
    if (lane != null) {
      e.preventDefault();
      pianoAssignKey(lane);
      return;
    }
  }

  // Пробел — прослушивание в редакторе
  if (editorActive && e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) edPreview(ED.demo);
    return;
  }

  // Игровые клавиши A W S D
  const lane = KEYLANES[e.code];
  if (lane != null) {
    e.preventDefault();
    if (!e.repeat) pressLane(lane);
    return;
  }

  if (G.active) {
    if (G.ended && e.code === 'Enter') {
      e.preventDefault();
      if (!e.repeat) restartSong();
      return;
    }
    if (e.code === 'Escape' || e.code === 'Enter') {
      e.preventDefault();
      if (!e.repeat) togglePause();
      return;
    }
  }
});
window.addEventListener('keyup', e => {
  if (e.key === 'Alt') ED.altDown = false;
  if (e.key === 'Control' && ED.ctrlDrag) pianoCtrlDragEnd();
  const lane = KEYLANES[e.code];
  if (lane != null) {
    G.keys[lane] = false;
    if (G.active) releaseLane(lane);
  }
});
window.addEventListener('keypress', e => {
  if (!G.active) return;
  const t = e.target;
  const isEditable = t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
  if (isEditable || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length === 1) e.preventDefault();
}, true);
const touchLanes = {};
cv.addEventListener('pointerdown', e => {
  if (!G.active || G.ended) return;
  if (G.paused) { togglePause(); return; }
  const r = cv.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const d = gameDims();
  if (y > d.hitY - 150) {
    const lane = Math.floor((x - d.x0) / d.laneW);
    if (lane >= 0 && lane < 4) { touchLanes[e.pointerId] = lane; pressLane(lane); return; }
  }
  togglePause();
});
const touchEnd = e => {
  const l = touchLanes[e.pointerId];
  if (l != null) { releaseLane(l); delete touchLanes[e.pointerId]; }
};
cv.addEventListener('pointerup', touchEnd);
cv.addEventListener('pointercancel', touchEnd);

/* ============================================================
14. РЕДАКТОР
============================================================ */
const edCv = document.getElementById('edCv');
const edCtx = edCv.getContext('2d');
const PIANO_KEYS_COUNT = 36;
const PIANO_Y_LABELS = Array.from({ length: PIANO_KEYS_COUNT }, (_, i) => {
  const pitchIdx = PIANO_KEYS_COUNT - 1 - i;
  return TONES[pitchIdx % 12] + (3 + Math.floor(pitchIdx / 12));
});
const ED = {
  bpm: 120, name: 'Мой трек', notes: [], grid: 4, gridShow: true, scroll: 0,
  mode: 'tap', inst: 'synth', tone: 'C', oct: 4, wave: 'sine',
  drum: 'kick', customSel: null,
  holdLen: 1, selected: null,
  playing: false, demo: false, playStart: 0, fromBeat: 0, prevBeat: 0,
  bgUrl: null, resizing: null, dragging: false, customs: [],
  pianoScrollX: 0, pianoScrollY: 0, pianoPending: null,
  pianoNoteType: 'tap',
  keys: [false, false, false, false],
  beats: [],
  pianoSelected: null,
  pianoSelection: new Set(),
  pianoDrag: null,
  ctrlDrag: null,
  panning: null,
  resizeHistPushed: false,
  altDown: false,
  previewHolds: new Map(),
  beatRec: { audio: null, recording: false, finished: false, duration: 0, lastTap: -Infinity }
};
const PXB = 80;
let edCachedDims = null, edW = 0, edH = 0;
function edSongObj() {
  return {
    name: ED.name, bpm: ED.bpm, difficulty: 0, custom: true, bgUrl: ED.bgUrl,
    beats: Array.isArray(ED.beats) ? ED.beats.slice() : [],
    notes: ED.notes.map(n => {
      const c = { ...n, t: Math.round(n.t) };
      if (c.dur != null) c.dur = Math.round(holdDur(c));
      return c;
    })
  };
}
const edBeatMs = () => 60000 / ED.bpm;
function edDims() {
  if (edW === edCv.width && edH === edCv.height && edCachedDims) return edCachedDims;
  const W = edCv.width, H = edCv.height;
  const laneW = Math.min(110, Math.max(64, W / 6));
  edCachedDims = { W, H, laneW, x0: (W - laneW * 4) / 2, lineY: H - 70 };
  edW = W; edH = H;
  return edCachedDims;
}
function edMode(m) {
  ED.mode = m;
  ED.pianoDrag = null;
  ED.pianoSelected = null;
  ED.pianoSelection.clear();
  ED.panning = null;
  ED.ctrlDrag = null;
  document.getElementById('edModeTap').classList.toggle('on', m === 'tap');
  document.getElementById('edModePiano').classList.toggle('on', m === 'piano');
  document.getElementById('edHint').textContent = m === 'piano'
    ? 'Пианино: тап по клетке — выбрать · ПКМ — меню · Shift+ЛКМ-рамка — выделить · Ctrl+ЛКМ — перетащить · Alt+Стрелки — выделить половину · Delete — удалить · СКМ/Alt+ЛКМ — панорама · Пробел — прослушивание · F1 — помощь'
    : 'ЛКМ — добавить · ПКМ — меню · ⊘ — обязательный пропуск · ЛКМ по ноте — выбрать · СКМ/Alt+ЛКМ — панорама · колесо по холду — длина · колесо — прокрутка · Пробел — прослушивание · F1 — помощь';
  ED.pianoPending = null;
  updateEdModeUI();
}
function updateEdModeUI() {
  const isPiano = ED.mode === 'piano';
  document.getElementById('edModeTap').classList.toggle('on', !isPiano);
  document.getElementById('edModePiano').classList.toggle('on', isPiano);
  document.getElementById('grpHoldLen').classList.toggle('hidden', isPiano);
  // ПУНКТ 4: в режиме пианино прячем списки ноты и октавы
  const toneWrap = document.getElementById('synthToneWrap');
  if (toneWrap) toneWrap.classList.toggle('hidden', isPiano);
  document.getElementById('chipTap').classList.toggle('on', ED.pianoNoteType === 'tap');
  document.getElementById('chipHold').classList.toggle('on', ED.pianoNoteType === 'hold');
  const sk = document.getElementById('chipSkip');
  if (sk) sk.classList.toggle('on', ED.pianoNoteType === 'skip');
  document.getElementById('chipHold').disabled = ED.inst === 'drum';
  if (sk) sk.disabled = ED.inst === 'drum';
  updateEdInfo();
}
function updateEdInfo() {
  const box = document.getElementById('edInfo');
  if (!box) return;
  const skipped = ED.notes.filter(n => n.type === 'skip').length;
  const holds = ED.notes.filter(n => n.type === 'hold').length;
  box.innerHTML =
    `<b>BPM:</b> ${ED.bpm}<br>` +
    `<b>Нот:</b> ${ED.notes.length}<br>` +
    `<b>Холдов:</b> ${holds}<br>` +
    `<b>⊘ Пропусков:</b> ${skipped}<br>` +
    `<b>Битов:</b> ${ED.beats ? ED.beats.length : 0}<br>` +
    `<b>Режим:</b> ${ED.mode === 'piano' ? 'Пианино' : 'Тап/Холд'}<br>` +
    `<b>Сетка:</b> 1/${ED.grid}<br>` +
    (ED.pianoSelection && ED.pianoSelection.size ? `<b>Выделено:</b> ${ED.pianoSelection.size}<br>` : '') +
    (ED.playing ? '<b style="color:var(--yellow)">▶ Играет</b>' : '');
}
function edInst(i) {
  ED.inst = i;
  instSynth.classList.toggle('on', i === 'synth');
  instDrum.classList.toggle('on', i === 'drum');
  instEmpty.classList.toggle('on', i === 'empty');
  instCustom.classList.toggle('on', i === 'custom');
  synthParams.classList.toggle('hidden', i !== 'synth');
  drumParams.classList.toggle('hidden', i !== 'drum');
  customParams.classList.toggle('hidden', i !== 'custom');
  if (i === 'drum' && ED.pianoNoteType !== 'tap') ED.pianoNoteType = 'tap';
  updateEdModeUI();
}
function edHoldLen(d) {
  ED.holdLen = clamp(ED.holdLen + d, 0.5, 8);
  edHoldLenV.textContent = ED.holdLen;
}
function edTestSound() {
  AudioSys.playNoteData({
    inst: ED.inst, tone: ED.tone, oct: +ED.oct, wave: ED.wave,
    drum: ED.drum, custom: ED.customSel
  });
}
function edCurParams() {
  return {
    inst: ED.inst, tone: ED.tone, oct: +ED.oct, wave: ED.wave,
    drum: ED.drum, custom: ED.customSel
  };
}

/* ------------------------------------------------------------
Контекстное меню редактора
------------------------------------------------------------ */
let edCtxMenuEl = null;
function edHideContextMenu() {
  if (edCtxMenuEl) { edCtxMenuEl.remove(); edCtxMenuEl = null; }
  document.querySelectorAll('.ed-context-menu').forEach(el => el.remove());
}
document.addEventListener('mousedown', e => {
  if (edCtxMenuEl && !edCtxMenuEl.contains(e.target)) edHideContextMenu();
});
window.addEventListener('blur', edHideContextMenu);
function edShowContextMenu(clientX, clientY, items) {
  edHideContextMenu();
  const parent = document.getElementById('scr-editor');
  const pr = parent.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'ed-context-menu';
  menu.style.left = (clientX - pr.left) + 'px';
  menu.style.top = (clientY - pr.top) + 'px';
  menu.addEventListener('mousedown', e => e.stopPropagation());
  menu.addEventListener('contextmenu', e => e.stopPropagation());
  items.forEach(item => {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'ed-context-sep';
      menu.appendChild(sep);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'ed-context-item' + (item.disabled ? ' disabled' : '');
    let html = item.icon ? item.icon + ' ' : '';
    html += item.label;
    if (item.wip) html += '<span class="ed-wip">WIP</span>';
    btn.innerHTML = html;
    btn.addEventListener('click', ev => {
      ev.stopPropagation();
      if (!item.disabled && item.action) item.action();
      edHideContextMenu();
    });
    menu.appendChild(btn);
  });
  parent.appendChild(menu);
  edCtxMenuEl = menu;
  requestAnimationFrame(() => {
    const mr = menu.getBoundingClientRect();
    if (mr.right > pr.right - 8) menu.style.left = Math.max(8, (clientX - pr.left) - mr.width) + 'px';
    if (mr.bottom > pr.bottom - 8) menu.style.top = Math.max(8, (clientY - pr.top) - mr.height) + 'px';
  });
}
function edPromptHoldDuration(note) {
  const beatMs = edBeatMs();
  const current = isFinite(note.dur) ? r1(note.dur / beatMs) : 'inf';
  const input = prompt('Длительность холда (в долях; "inf" = бесконечно):', String(current));
  if (input === null) return;
  const trimmed = input.trim().toLowerCase();
  if (trimmed === 'inf' || trimmed === 'infinity' || trimmed === '∞') {
    edPushHistory();
    note.dur = Infinity;
  } else {
    const val = parseFloat(trimmed);
    if (!isFinite(val) || val <= 0) { alert('Введите положительное число или "inf".'); return; }
    edPushHistory();
    note.dur = r1(val * beatMs);
  }
  edUpdateList();
}
function edBuildNoteMenu(note) {
  const items = [];
  if (note.type === 'hold') {
    items.push({ icon: '⏱', label: 'Длительность холда…', action: () => edPromptHoldDuration(note) });
    items.push({ separator: true });
  }
  items.push({ icon: '◉', label: 'Тип: Тап', action: () => { edPushHistory(); note.type = 'tap'; delete note.dur; edUpdateList(); } });
  items.push({
    icon: '〰', label: 'Тип: Холд',
    action: () => {
      edPushHistory();
      note.type = 'hold';
      if (note.dur == null || !isFinite(note.dur) || note.dur <= 0) note.dur = r1(edBeatMs());
      edUpdateList();
    }
  });
  items.push({ icon: '⊘', label: 'Тип: Пропуск', action: () => { edPushHistory(); note.type = 'skip'; note.inst = 'empty'; delete note.dur; edUpdateList(); } });
  items.push({ separator: true });
  items.push({
    icon: '🗑', label: 'Удалить ноту',
    action: () => {
      edPushHistory();
      ED.notes = ED.notes.filter(n => n !== note);
      if (ED.selected === note) ED.selected = null;
      ED.pianoSelection.delete(note);
      edUpdateList();
    }
  });
  return items;
}
function edBuildLaneMenu() {
  return [
    { icon: '➕', label: 'Добавить дорожку 5', wip: true, disabled: true },
    { icon: '➕', label: 'Добавить дорожку 6', wip: true, disabled: true },
    { icon: '➖', label: 'Удалить дорожку', wip: true, disabled: true },
    { separator: true },
    { icon: '🔀', label: 'Переименовать дорожку', wip: true, disabled: true },
    { icon: '🎨', label: 'Цвет дорожки', wip: true, disabled: true }
  ];
}
function edOpenContextAt(e) {
  const p = edPos(e);
  const d = edDims();
  if (ED.mode === 'piano') {
    const cell = pianoGetCell(p.x, p.y);
    if (!cell) { edShowContextMenu(e.clientX, e.clientY, edBuildLaneMenu()); return; }
    const notesHere = pianoNotesAt(cell.beat, cell.tone, cell.oct);
    if (notesHere.length) {
      edShowContextMenu(e.clientX, e.clientY, edBuildNoteMenu(notesHere[0]));
    } else {
      const items = KEYS.map((k, i) => ({
        icon: k, label: `Добавить на дорожку ${k}`,
        action: () => { ED.pianoPending = cell; pianoAssignKey(i); }
      }));
      items.push({ separator: true });
      items.push(...edBuildLaneMenu());
      edShowContextMenu(e.clientX, e.clientY, items);
    }
  } else {
    const n = edHitNote(p.x, p.y);
    if (n) {
      edShowContextMenu(e.clientX, e.clientY, edBuildNoteMenu(n));
    } else {
      const lane = Math.floor((p.x - d.x0) / d.laneW);
      if (lane >= 0 && lane <= 3) {
        const beat = edQuant((d.lineY - p.y) / PXB + ED.scroll);
        const items = [
          { icon: '➕', label: 'Добавить ноту', action: () => edAddNote(lane, beat) },
          { separator: true },
          ...edBuildLaneMenu()
        ];
        edShowContextMenu(e.clientX, e.clientY, items);
      } else {
        edShowContextMenu(e.clientX, e.clientY, edBuildLaneMenu());
      }
    }
  }
}
function edToggleHelp() {
  let ov = document.getElementById('edHelpOv');
  if (ov) { ov.classList.toggle('hidden'); return; }
  ov = document.createElement('div');
  ov.id = 'edHelpOv';
  ov.className = 'overlay';
  ov.innerHTML = `<h2>📖 ПОМОЩЬ — РЕДАКТОР</h2>
  <div class="ed-help-content">
    <h3>Общие</h3>
    <p><b>F1</b> — эта помощь</p>
    <p><b>Пробел</b> — прослушивание</p>
    <p><b>ПКМ</b> — контекстное меню ноты/поля</p>
    <p><b>СКМ / Alt+ЛКМ</b> — панорамирование</p>
    <h3>Режим Тап/Холд</h3>
    <p><b>ЛКМ</b> — добавить ноту</p>
    <p><b>ЛКМ по ноте</b> — выбрать</p>
    <p><b>Колесо по холду</b> — изменить длину</p>
    <p><b>Колесо</b> — прокрутка</p>
    <h3>Режим Пианино</h3>
    <p><b>Тап по клетке</b> — выбрать/прослушать</p>
    <p><b>A / W / S / D</b> — назначить дорожку</p>
    <p><b>Shift + ЛКМ-рамка</b> — выделить группу</p>
    <p><b>Ctrl + ЛКМ</b> — перетащить ноту или всё выделение</p>
    <p><b>Alt + Стрелки</b> — выделить половину поля относительно центра (←→↑↓). <b>Shift+Alt+Стрелка</b> — добавить к выделению.</p>
    <p><b>Delete</b> — удалить выделенное</p>
    <h3>Холды</h3>
    <p>Холд звучит, пока удерживается клавиша, и плавно затихает при отпускании.</p>
    <p>ПКМ по холду → «Длительность холда…» — любое положительное число долей или <b>inf</b>.</p>
  </div>
  <button class="btn" onclick="edToggleHelp()">✖ Закрыть</button>`;
  document.getElementById('scr-editor').appendChild(ov);
}

/* ------------------------------------------------------------
Стандартный режим
------------------------------------------------------------ */
function edAddNote(lane, beat) {
  edPushHistory();
  const type = ED.inst === 'drum' ? 'tap'
    : (ED.pianoNoteType === 'skip' ? 'skip' : ED.pianoNoteType);
  const n = { t: r1(beat * edBeatMs()), lane, type, ...edCurParams() };
  if (n.type === 'hold') n.dur = r1(ED.holdLen * edBeatMs());
  if (n.type === 'skip') n.inst = 'empty';
  ED.notes.push(n);
  ED.selected = n;
  if (n.type !== 'skip') AudioSys.playNoteData(n);
  edUpdateList();
}
function edHitNote(x, y) {
  const d = edDims();
  const lane = Math.floor((x - d.x0) / d.laneW);
  if (lane < 0 || lane > 3) return null;
  let best = null, bd = 1e9;
  for (const n of ED.notes) {
    if (n.lane !== lane) continue;
    const beat = n.t / edBeatMs();
    const yH = d.lineY - (beat - ED.scroll) * PXB;
    if (n.type === 'hold') {
      let yT = d.lineY - ((n.t + holdDur(n)) / edBeatMs() - ED.scroll) * PXB;
      yT = Math.max(yT, -60);
      if (y >= yT - 14 && y <= yH + 14) {
        const dist = Math.min(Math.abs(y - yH), Math.abs(y - yT), 10);
        if (dist < bd) { bd = dist; best = n; }
      }
    } else if (Math.abs(y - yH) < 16 && Math.abs(y - yH) < bd) {
      bd = Math.abs(y - yH); best = n;
    }
  }
  return best;
}

/* ------------------------------------------------------------
Piano Roll
------------------------------------------------------------ */
function pianoMetrics(d) {
  const marginLeft = 64;
  const rowH = Math.max(24, Math.floor(d.H / PIANO_KEYS_COUNT));
  const pxPerBeat = Math.max(120, Math.floor((d.W - marginLeft) / 10));
  return { marginLeft, rowH, pxPerBeat };
}
function pianoClampScroll(d) {
  const m = pianoMetrics(d);
  const totalH = PIANO_KEYS_COUNT * m.rowH;
  const maxY = Math.max(0, totalH - d.H);
  ED.pianoScrollY = clamp(ED.pianoScrollY, 0, maxY);
  const visibleBeats = Math.max(1, (d.W - m.marginLeft) / m.pxPerBeat);
  const lastBeat = ED.notes.length ? Math.max(...ED.notes.map(n => (n.t + holdDur(n)) / edBeatMs())) : 0;
  const maxBeat = Math.max(16, lastBeat + 4);
  const maxX = Math.max(0, maxBeat - visibleBeats + 2);
  ED.pianoScrollX = clamp(ED.pianoScrollX, 0, maxX);
}
function pianoGetCell(x, y) {
  const d = edDims();
  const m = pianoMetrics(d);
  if (x < m.marginLeft) return null;
  const row = Math.floor((y + ED.pianoScrollY) / m.rowH);
  if (row < 0 || row >= PIANO_KEYS_COUNT) return null;
  const beatRaw = ED.pianoScrollX + (x - m.marginLeft) / m.pxPerBeat;
  const step = 1 / ED.grid;
  const beat = Math.max(0, Math.floor(beatRaw / step + 1e-9) * step);
  const pitchIdx = PIANO_KEYS_COUNT - 1 - row;
  const tone = TONES[pitchIdx % 12];
  const oct = 3 + Math.floor(pitchIdx / 12);
  return {
    beat, row, tone, oct,
    x: m.marginLeft + (beat - ED.pianoScrollX) * m.pxPerBeat,
    y: row * m.rowH - ED.pianoScrollY,
    w: m.pxPerBeat * step,
    h: m.rowH
  };
}
function pianoNotesAt(beat, tone, oct) {
  const t = beat * edBeatMs();
  return ED.notes.filter(n => Math.abs(n.t - t) < 1 && n.tone === tone && n.oct === oct);
}
function pianoPreviewCell(cell) {
  const existing = pianoNotesAt(cell.beat, cell.tone, cell.oct);
  if (existing.length) {
    ED.pianoSelected = existing[0];
    if (existing[0].type !== 'skip') AudioSys.playNoteData(existing[0]);
  } else {
    ED.pianoSelected = null;
    AudioSys.playNoteData({
      inst: ED.inst, tone: cell.tone, oct: cell.oct, wave: ED.wave,
      drum: ED.drum, custom: ED.customSel
    });
  }
}

/* ПУНКТ 3: выделение половины поля относительно центра */
function pianoSelectHalf(dir, additive) {
  const d = edDims();
  const m = pianoMetrics(d);
  const bt = edBeatMs();
  const cx = (m.marginLeft + d.W) / 2;
  const cy = d.H / 2;
  const centerBeat = ED.pianoScrollX + (cx - m.marginLeft) / m.pxPerBeat;
  const centerRow = (cy + ED.pianoScrollY) / m.rowH;
  const centerPitchIdx = PIANO_KEYS_COUNT - 1 - centerRow;

  const newSel = additive ? new Set(ED.pianoSelection) : new Set();
  for (const n of ED.notes) {
    if (n.oct == null || TONES.indexOf(n.tone) < 0) continue;
    const beatVal = n.t / bt;
    const pitchIdx = (n.oct - 3) * 12 + TONES.indexOf(n.tone);
    let include = false;
    if (dir === 'ArrowLeft') include = beatVal < centerBeat;
    else if (dir === 'ArrowRight') include = beatVal > centerBeat;
    else if (dir === 'ArrowUp') include = pitchIdx > centerPitchIdx;
    else if (dir === 'ArrowDown') include = pitchIdx < centerPitchIdx;
    if (include) newSel.add(n);
  }
  ED.pianoSelection = newSel;
  ED.pianoSelected = null;
  updateEdInfo();
}

function pianoUpdateBoxSelection(d) {
  const drag = ED.pianoDrag;
  if (!drag || drag.mode !== 'select') return;
  const x1 = Math.min(drag.startX, drag.curX);
  const x2 = Math.max(drag.startX, drag.curX);
  const y1 = Math.min(drag.startY, drag.curY);
  const y2 = Math.max(drag.startY, drag.curY);
  const m = pianoMetrics(d);
  const bt = edBeatMs();
  const sel = new Set(drag.baseSel || []);
  for (const n of ED.notes) {
    const toneIndex = TONES.indexOf(n.tone);
    if (toneIndex < 0 || n.oct == null) continue;
    const pitchIdx = (n.oct - 3) * 12 + toneIndex;
    const row = PIANO_KEYS_COUNT - 1 - pitchIdx;
    if (row < 0 || row >= PIANO_KEYS_COUNT) continue;
    const y = row * m.rowH - ED.pianoScrollY;
    const x = m.marginLeft + (n.t / bt - ED.pianoScrollX) * m.pxPerBeat;
    const w = n.type === 'hold' ? Math.min((holdDur(n) / bt) * m.pxPerBeat, d.W) : m.pxPerBeat * (1 / ED.grid);
    if (x + w >= x1 && x <= x2 && y + m.rowH >= y1 && y <= y2) sel.add(n);
  }
  ED.pianoSelection = sel;
}

/* ПУНКТ 2: реализация Ctrl+ЛКМ-перетаскивания (ранее отсутствовала) */
function pianoStartCtrlDrag(p, d) {
  const cell = pianoGetCell(p.x, p.y);
  if (!cell) return false;
  const notesHere = pianoNotesAt(cell.beat, cell.tone, cell.oct);
  let dragNotes = [];
  if (notesHere.length) {
    // Если кликнули по ноте из текущего выделения — тянем всё выделение
    if (ED.pianoSelection.size > 0 && notesHere.some(n => ED.pianoSelection.has(n))) {
      dragNotes = Array.from(ED.pianoSelection);
    } else {
      dragNotes = [notesHere[0]];
    }
  } else if (ED.pianoSelection.size > 0) {
    // Ctrl+клик по пустому месту тоже тянет выделение
    dragNotes = Array.from(ED.pianoSelection);
  }
  if (!dragNotes.length) return false;
  ED.ctrlDrag = {
    notes: dragNotes,
    originals: dragNotes.map(n => ({ t: n.t, tone: n.tone, oct: n.oct })),
    startBeat: cell.beat,
    startTone: cell.tone,
    startOct: cell.oct,
    lastBeat: cell.beat,
    lastTone: cell.tone,
    lastOct: cell.oct,
    historyPushed: false
  };
  edCv.style.cursor = 'move';
  return true;
}
function pianoCtrlDragMove(p, d) {
  const drag = ED.ctrlDrag;
  if (!drag) return;
  const cell = pianoGetCell(p.x, p.y);
  if (!cell) return;
  if (cell.beat === drag.lastBeat && cell.tone === drag.lastTone && cell.oct === drag.lastOct) return;
  if (!drag.historyPushed) {
    edPushHistory();
    drag.historyPushed = true;
  }
  drag.lastBeat = cell.beat;
  drag.lastTone = cell.tone;
  drag.lastOct = cell.oct;
  const btMs = edBeatMs();
  const dt = cell.beat - drag.startBeat;
  const dToneIdx = TONES.indexOf(cell.tone) - TONES.indexOf(drag.startTone);
  const dOct = cell.oct - drag.startOct;
  const dPitch = dOct * 12 + dToneIdx;
  for (let i = 0; i < drag.notes.length; i++) {
    const n = drag.notes[i];
    const orig = drag.originals[i];
    n.t = Math.max(0, r1(orig.t + dt * btMs));
    const toneIdx = TONES.indexOf(orig.tone);
    if (toneIdx < 0 || orig.oct == null) continue;
    const oldPitchIdx = (orig.oct - 3) * 12 + toneIdx;
    let newPitchIdx = clamp(oldPitchIdx + dPitch, 0, PIANO_KEYS_COUNT - 1);
    n.tone = TONES[newPitchIdx % 12];
    n.oct = 3 + Math.floor(newPitchIdx / 12);
  }
  if (drag.notes[0] && drag.notes[0].type !== 'skip') AudioSys.playNoteData(drag.notes[0]);
}
function pianoCtrlDragEnd() {
  if (!ED.ctrlDrag) return;
  ED.ctrlDrag = null;
  edCv.style.cursor = '';
  edUpdateList();
}
function pianoCancelCtrlDrag() {
  if (!ED.ctrlDrag) return;
  const drag = ED.ctrlDrag;
  for (let i = 0; i < drag.notes.length; i++) {
    const n = drag.notes[i];
    const orig = drag.originals[i];
    n.t = orig.t; n.tone = orig.tone; n.oct = orig.oct;
  }
  if (drag.historyPushed && ED_HISTORY.undo.length) {
    ED_HISTORY.undo.pop();
    edUpdateHistoryUI();
  }
  ED.ctrlDrag = null;
  edCv.style.cursor = '';
  edUpdateList();
}
function pianoMouseDown(e, p, d) {
  const m = pianoMetrics(d);
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    e.preventDefault();
    ED.panning = {
      startX: p.x, startY: p.y,
      sx: ED.pianoScrollX, sy: ED.pianoScrollY,
      pxPerBeat: m.pxPerBeat
    };
    edCv.style.cursor = 'grabbing';
    return;
  }
  if (e.button === 0 && e.ctrlKey && !e.altKey) {
    e.preventDefault();
    if (pianoStartCtrlDrag(p, d)) {
      if (ED.ctrlDrag.notes[0] && ED.ctrlDrag.notes[0].type !== 'skip') {
        AudioSys.playNoteData(ED.ctrlDrag.notes[0]);
      }
    }
    return;
  }
  if (e.button !== 0) return;
  if (p.x < m.marginLeft) {
    const row = Math.floor((p.y + ED.pianoScrollY) / m.rowH);
    if (row >= 0 && row < PIANO_KEYS_COUNT) {
      const pitchIdx = PIANO_KEYS_COUNT - 1 - row;
      const tone = TONES[pitchIdx % 12];
      const oct = 3 + Math.floor(pitchIdx / 12);
      AudioSys.playNoteData({
        inst: ED.inst, tone, oct, wave: ED.wave,
        drum: ED.drum, custom: ED.customSel
      });
    }
    return;
  }
  if (e.shiftKey) {
    const baseSel = new Set(ED.pianoSelection);
    if (ED.pianoSelected) baseSel.add(ED.pianoSelected);
    ED.pianoDrag = { mode: 'select', startX: p.x, startY: p.y, curX: p.x, curY: p.y, baseSel };
    return;
  }
  const cell = pianoGetCell(p.x, p.y);
  if (!cell) {
    ED.pianoPending = null;
    ED.pianoSelected = null;
    ED.pianoSelection.clear();
    return;
  }
  ED.pianoSelection.clear();
  ED.pianoPending = cell;
  pianoPreviewCell(cell);
  ED.pianoDrag = { mode: 'paint', lastTone: cell.tone, lastBeat: cell.beat };
}
function pianoMouseMove(e) {
  const p = edPos(e);
  if (ED.panning) {
    const d = edDims();
    const m = pianoMetrics(d);
    ED.pianoScrollX = ED.panning.sx - (p.x - ED.panning.startX) / m.pxPerBeat;
    ED.pianoScrollY = ED.panning.sy - (p.y - ED.panning.startY);
    pianoClampScroll(d);
    return;
  }
  if (ED.ctrlDrag) { pianoCtrlDragMove(p, edDims()); return; }
  if (!ED.pianoDrag) return;
  const d = edDims();
  if (ED.pianoDrag.mode === 'select') {
    ED.pianoDrag.curX = p.x;
    ED.pianoDrag.curY = p.y;
    pianoUpdateBoxSelection(d);
    return;
  }
  if (ED.pianoDrag.mode === 'paint') {
    const cell = pianoGetCell(p.x, p.y);
    if (!cell) return;
    if (cell.tone === ED.pianoDrag.lastTone && cell.beat === ED.pianoDrag.lastBeat) return;
    ED.pianoDrag.lastTone = cell.tone;
    ED.pianoDrag.lastBeat = cell.beat;
    ED.pianoPending = cell;
    pianoPreviewCell(cell);
  }
}
function pianoAssignKey(lane) {
  if (!ED.pianoPending) return;
  const { beat, tone, oct } = ED.pianoPending;
  const timeMs = beat * edBeatMs();
  const idx = ED.notes.findIndex(n =>
    Math.abs(n.t - timeMs) < 1 && n.tone === tone && n.oct === oct && n.lane === lane
  );
  edPushHistory();
  if (idx >= 0) {
    ED.notes.splice(idx, 1);
    edUpdateList();
    return;
  }
  const type = ED.inst === 'drum' ? 'tap' : ED.pianoNoteType;
  const n = { ...edCurParams(), t: r1(timeMs), lane, type, tone, oct };
  if (n.type === 'hold') n.dur = r1(edBeatMs());
  if (n.type === 'skip') n.inst = 'empty';
  ED.notes.push(n);
  if (n.type !== 'skip') {
    AudioSys.playNoteData({ inst: ED.inst, tone, oct, wave: ED.wave, drum: ED.drum, custom: ED.customSel });
  }
  edUpdateList();
}

/* ------------------------------------------------------------
Рендер Piano Roll
------------------------------------------------------------ */
function drawPiano(d, bt) {
  const m = pianoMetrics(d);
  pianoClampScroll(d);
  const firstRow = Math.max(0, Math.floor(ED.pianoScrollY / m.rowH));
  const lastRow = Math.min(PIANO_KEYS_COUNT - 1, Math.floor((ED.pianoScrollY + d.H) / m.rowH));
  const potato = gfxPotato();
  for (let i = firstRow; i <= lastRow; i++) {
    const pitchIdx = PIANO_KEYS_COUNT - 1 - i;
    const tone = TONES[pitchIdx % 12];
    const isBlack = tone.includes('#');
    const y = i * m.rowH - ED.pianoScrollY;
    edCtx.fillStyle = isBlack ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
    edCtx.fillRect(m.marginLeft, y, d.W - m.marginLeft, m.rowH);
    edCtx.strokeStyle = 'rgba(255,255,255,0.05)';
    edCtx.beginPath();
    edCtx.moveTo(m.marginLeft, y);
    edCtx.lineTo(d.W, y);
    edCtx.stroke();
    edCtx.fillStyle = isBlack ? '#0b0e1a' : '#12172c';
    edCtx.fillRect(0, y, m.marginLeft, m.rowH);
    edCtx.fillStyle = 'rgba(255,255,255,0.55)';
    edCtx.font = '10px "Segoe UI"';
    edCtx.textAlign = 'right';
    edCtx.fillText(PIANO_Y_LABELS[i], m.marginLeft - 6, y + m.rowH / 2 + 3);
  }
  const step = 1 / ED.grid;
  const visibleBeats = (d.W - m.marginLeft) / m.pxPerBeat + 2;
  let beat = Math.floor(ED.pianoScrollX / step) * step;
  for (; beat < ED.pianoScrollX + visibleBeats; beat += step) {
    if (beat < 0) continue;
    const x = m.marginLeft + (beat - ED.pianoScrollX) * m.pxPerBeat;
    if (x < m.marginLeft || x > d.W) continue;
    const nearest = Math.round(beat);
    const isBeat = Math.abs(beat - nearest) < 1e-6;
    const isBar = isBeat && nearest % 4 === 0;
    if (isBar) edCtx.strokeStyle = 'rgba(0,229,255,0.35)';
    else if (isBeat) edCtx.strokeStyle = 'rgba(255,255,255,0.16)';
    else edCtx.strokeStyle = 'rgba(255,255,255,0.07)';
    edCtx.beginPath();
    edCtx.moveTo(x, 0);
    edCtx.lineTo(x, d.H);
    edCtx.stroke();
  }
  if (sets.beats && ED.beats && ED.beats.length && !potato) {
    const bdur = edBeatMs();
    edCtx.strokeStyle = 'rgba(255,214,10,0.45)';
    edCtx.lineWidth = 1;
    edCtx.beginPath();
    for (let i = 0; i < ED.beats.length; i++) {
      const b = ED.beats[i] / bdur;
      const x = m.marginLeft + (b - ED.pianoScrollX) * m.pxPerBeat;
      if (x < m.marginLeft) continue;
      if (x > d.W) break;
      edCtx.moveTo(x, 0);
      edCtx.lineTo(x, d.H);
    }
    edCtx.stroke();
  }

  // ПУНКТ 3: центральный крест (визуальный разделитель на 4 части)
  {
    const cx = (m.marginLeft + d.W) / 2;
    const cy = d.H / 2;
    const alpha = ED.altDown ? 0.35 : 0.07;
    edCtx.strokeStyle = `rgba(255,255,255,${alpha})`;
    edCtx.lineWidth = 1;
    edCtx.setLineDash([8, 6]);
    edCtx.beginPath();
    edCtx.moveTo(cx, 0);
    edCtx.lineTo(cx, d.H);
    edCtx.moveTo(m.marginLeft, cy);
    edCtx.lineTo(d.W, cy);
    edCtx.stroke();
    edCtx.setLineDash([]);
  }

  const drawn = new Set();
  const visibleTop = -m.rowH * 2;
  const visibleBot = d.H + m.rowH * 2;
  for (const n of ED.notes) {
    const toneIndex = TONES.indexOf(n.tone);
    if (toneIndex < 0 || n.oct == null) continue;
    const pitchIdx = (n.oct - 3) * 12 + toneIndex;
    const row = PIANO_KEYS_COUNT - 1 - pitchIdx;
    if (row < 0 || row >= PIANO_KEYS_COUNT) continue;
    const y = row * m.rowH - ED.pianoScrollY;
    if (y > visibleBot || y + m.rowH < visibleTop) continue;
    const beatVal = n.t / bt;
    const x = m.marginLeft + (beatVal - ED.pianoScrollX) * m.pxPerBeat;
    const w = n.type === 'hold'
      ? Math.min((holdDur(n) / bt) * m.pxPerBeat, d.W + 200)
      : m.pxPerBeat / ED.grid;
    if (x + w < m.marginLeft || x > d.W) continue;
    const dedupKey = row + '|' + Math.round(beatVal * 1000) + '|' + (n.type === 'hold' ? 'H' + Math.round(holdDur(n)) : 'T');
    if (drawn.has(dedupKey)) continue;
    drawn.add(dedupKey);
    const isDragged = ED.ctrlDrag && ED.ctrlDrag.notes.includes(n);
    if (n.type === 'skip') {
      edCtx.fillStyle = '#ff5050';
      edCtx.fillRect(x + 1, y + 1, Math.max(6, w - 2), m.rowH - 2);
      if (!potato && w > 16) {
        edCtx.fillStyle = '#fff';
        edCtx.font = 'bold 11px "Segoe UI"';
        edCtx.textAlign = 'center';
        edCtx.fillText('⊘', x + w / 2, y + m.rowH / 2 + 4);
      }
    } else if (n.inst === 'empty') {
      edCtx.fillStyle = rgba(LRGB[n.lane], 0.15);
      edCtx.fillRect(x + 1, y + 1, Math.max(6, w - 2), m.rowH - 2);
      edCtx.strokeStyle = LCOL[n.lane];
      edCtx.lineWidth = 2;
      edCtx.setLineDash([4, 3]);
      edCtx.strokeRect(x + 1.5, y + 1.5, Math.max(6, w - 3), m.rowH - 3);
      edCtx.setLineDash([]);
      edCtx.lineWidth = 1;
      if (!potato && w > 16) {
        edCtx.fillStyle = LCOL[n.lane];
        edCtx.font = 'bold 11px "Segoe UI"';
        edCtx.textAlign = 'center';
        edCtx.fillText('∅', x + w / 2, y + m.rowH / 2 + 4);
      }
    } else {
      edCtx.fillStyle = LCOL[n.lane];
      edCtx.globalAlpha = 0.85;
      edCtx.fillRect(x + 1, y + 1, Math.max(6, w - 2), m.rowH - 2);
      edCtx.globalAlpha = 1;
      if (!potato && w > 16) {
        edCtx.fillStyle = 'rgba(0,0,0,0.85)';
        edCtx.font = 'bold 10px "Segoe UI"';
        edCtx.textAlign = 'center';
        edCtx.fillText(KEYS[n.lane], x + w / 2, y + m.rowH / 2 + 3);
      }
    }
    if (isDragged) {
      edCtx.shadowBlur = 14;
      edCtx.shadowColor = '#ffffff';
    }
    const inSel = ED.pianoSelection.has(n);
    const isPrimary = ED.pianoSelected === n;
    if (inSel || isPrimary) {
      edCtx.strokeStyle = isPrimary ? '#fff' : 'rgba(255,255,255,0.85)';
      edCtx.lineWidth = 2;
      edCtx.strokeRect(x + 1.5, y + 1.5, Math.max(6, w - 3), m.rowH - 3);
      edCtx.lineWidth = 1;
    }
    edCtx.shadowBlur = 0;
  }
  if (ED.pianoPending) {
    const px = ED.pianoPending.x;
    const py = ED.pianoPending.y;
    if (px >= m.marginLeft && px <= d.W && py + m.rowH >= 0 && py <= d.H) {
      edCtx.strokeStyle = '#fff';
      edCtx.lineWidth = 2;
      edCtx.setLineDash([4, 4]);
      edCtx.strokeRect(px, py, ED.pianoPending.w, ED.pianoPending.h);
      edCtx.setLineDash([]);
      edCtx.lineWidth = 1;
    }
  }
  if (ED.pianoDrag && ED.pianoDrag.mode === 'select') {
    const x1 = Math.min(ED.pianoDrag.startX, ED.pianoDrag.curX);
    const x2 = Math.max(ED.pianoDrag.startX, ED.pianoDrag.curX);
    const y1 = Math.min(ED.pianoDrag.startY, ED.pianoDrag.curY);
    const y2 = Math.max(ED.pianoDrag.startY, ED.pianoDrag.curY);
    edCtx.fillStyle = 'rgba(0,229,255,0.12)';
    edCtx.fillRect(x1, y1, x2 - x1, y2 - y1);
    edCtx.strokeStyle = 'rgba(0,229,255,0.9)';
    edCtx.lineWidth = 1;
    edCtx.setLineDash([4, 3]);
    edCtx.strokeRect(x1 + 0.5, y1 + 0.5, x2 - x1, y2 - y1);
    edCtx.setLineDash([]);
  }
  if (ED.playing) {
    const curBeat = (performance.now() - ED.playStart) / bt + ED.fromBeat;
    let x = m.marginLeft + (curBeat - ED.pianoScrollX) * m.pxPerBeat;
    if (x < m.marginLeft || x > d.W - 60) {
      ED.pianoScrollX = Math.max(0, curBeat - 2);
      pianoClampScroll(d);
      x = m.marginLeft + (curBeat - ED.pianoScrollX) * m.pxPerBeat;
    }
    edCtx.strokeStyle = '#ffd60a';
    edCtx.lineWidth = 2;
    if (!potato) { edCtx.shadowBlur = 10; edCtx.shadowColor = '#ffd60a'; }
    edCtx.beginPath();
    edCtx.moveTo(x, 0);
    edCtx.lineTo(x, d.H);
    edCtx.stroke();
    edCtx.shadowBlur = 0;
    edCtx.lineWidth = 1;
  }
  if (ED.beatRec.recording && ED.beatRec.audio) {
    const beat = ED.beatRec.audio.currentTime * 1000 / bt;
    const x = m.marginLeft + (beat - ED.pianoScrollX) * m.pxPerBeat;
    edCtx.strokeStyle = '#fff';
    edCtx.lineWidth = 1;
    edCtx.setLineDash([5, 5]);
    edCtx.beginPath();
    edCtx.moveTo(x, 0);
    edCtx.lineTo(x, d.H);
    edCtx.stroke();
    edCtx.setLineDash([]);
  }
  edCtx.strokeStyle = 'rgba(0,229,255,0.25)';
  edCtx.beginPath();
  edCtx.moveTo(m.marginLeft, 0);
  edCtx.lineTo(m.marginLeft, d.H);
  edCtx.stroke();
}

/* ------------------------------------------------------------
История изменений (Undo / Redo)
------------------------------------------------------------ */
const ED_HISTORY = { undo: [], redo: [], MAX: 100 };
let edHistGroupKey = null;
let edHistGroupTime = 0;
function edSnapshot() { return JSON.stringify(ED.notes); }
function edRestoreSnapshot(snap) {
  try { ED.notes = JSON.parse(snap); } catch (e) { ED.notes = []; }
  ED.selected = null;
  ED.pianoSelected = null;
  ED.pianoSelection.clear();
  ED.ctrlDrag = null;
  ED.panning = null;
  ED.pianoPending = null;
  edUpdateList();
}
function edPushHistory(groupKey = null) {
  const now = performance.now();
  if (groupKey != null && groupKey === edHistGroupKey && now - edHistGroupTime < 700) {
    edHistGroupTime = now;
    return;
  }
  edHistGroupKey = groupKey;
  edHistGroupTime = now;
  ED_HISTORY.undo.push(edSnapshot());
  if (ED_HISTORY.undo.length > ED_HISTORY.MAX) ED_HISTORY.undo.shift();
  ED_HISTORY.redo.length = 0;
  edUpdateHistoryUI();
}
function edUndo() {
  if (!ED_HISTORY.undo.length) return;
  ED_HISTORY.redo.push(edSnapshot());
  edRestoreSnapshot(ED_HISTORY.undo.pop());
  edHistGroupKey = null;
  edUpdateHistoryUI();
}
function edRedo() {
  if (!ED_HISTORY.redo.length) return;
  ED_HISTORY.undo.push(edSnapshot());
  edRestoreSnapshot(ED_HISTORY.redo.pop());
  edHistGroupKey = null;
  edUpdateHistoryUI();
}
function edUpdateHistoryUI() {
  const u = document.getElementById('edUndoBtn');
  const r = document.getElementById('edRedoBtn');
  if (u) u.disabled = !ED_HISTORY.undo.length;
  if (r) r.disabled = !ED_HISTORY.redo.length;
}

/* ------------------------------------------------------------
Снятие фокуса с полей ввода
------------------------------------------------------------ */
function edBlurActiveInput() {
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) el.blur();
}

/* ------------------------------------------------------------
События редактора
------------------------------------------------------------ */
function edPos(e) {
  const r = edCv.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function edQuant(b) {
  const s = 1 / ED.grid;
  return Math.max(0, Math.round(b / s) * s);
}
edCv.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (!editorActive) return;
  if (ED.beatRec.recording) return;
  edOpenContextAt(e);
});
edCv.addEventListener('mousedown', e => {
  edBlurActiveInput();
  if (edCtxMenuEl) { edHideContextMenu(); return; }
  const p = edPos(e);
  const d = edDims();
  if (ED.beatRec.recording) {
    if (e.button === 0) edRecordBeatAtCurrentTime();
    return;
  }
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    e.preventDefault();
    ED.panning = {
      startX: p.x, startY: p.y,
      sx: ED.mode === 'piano' ? ED.pianoScrollX : 0,
      sy: ED.mode === 'piano' ? ED.pianoScrollY : ED.scroll
    };
    edCv.style.cursor = 'grabbing';
    return;
  }
  if (ED.mode === 'piano') {
    pianoMouseDown(e, p, d);
    return;
  }
  if (e.shiftKey) { ED.dragging = { y: p.y, sc: ED.scroll }; return; }
  if (e.button !== 0) return;
  const n = edHitNote(p.x, p.y);
  if (n) {
    ED.selected = n;
    if (n.type !== 'skip') AudioSys.playNoteData(n);
    if (n.type === 'hold') {
      let yT = d.lineY - ((n.t + holdDur(n)) / edBeatMs() - ED.scroll) * PXB;
      yT = Math.max(yT, -60);
      if (Math.abs(p.y - yT) < 14) {
        ED.resizing = n;
        ED.resizeHistPushed = false;
        return;
      }
    }
    return;
  }
  const lane = Math.floor((p.x - d.x0) / d.laneW);
  if (lane < 0 || lane > 3) return;
  const beat = edQuant((d.lineY - p.y) / PXB + ED.scroll);
  edAddNote(lane, beat);
});
edCv.addEventListener('mousemove', e => {
  if (ED.panning) {
    const p = edPos(e);
    const d = edDims();
    if (ED.mode === 'piano') {
      const m = pianoMetrics(d);
      ED.pianoScrollX = ED.panning.sx - (p.x - ED.panning.startX) / m.pxPerBeat;
      ED.pianoScrollY = ED.panning.sy - (p.y - ED.panning.startY);
      pianoClampScroll(d);
    } else {
      ED.scroll = Math.max(0, ED.panning.sy - (p.y - ED.panning.startY) / PXB);
    }
    return;
  }
  if (ED.ctrlDrag) {
    pianoCtrlDragMove(edPos(e), edDims());
    return;
  }
  if (ED.mode === 'piano') {
    pianoMouseMove(e);
    return;
  }
  const p = edPos(e);
  const d = edDims();
  if (ED.dragging) {
    ED.scroll = Math.max(0, ED.dragging.sc + (p.y - ED.dragging.y) / PXB);
    return;
  }
  if (ED.resizing) {
    const n = ED.resizing;
    if (!ED.resizeHistPushed) {
      edPushHistory();
      ED.resizeHistPushed = true;
    }
    const s = 1 / ED.grid;
    const beatEnd = (d.lineY - p.y) / PXB + ED.scroll;
    const startBeat = n.t / edBeatMs();
    n.dur = r1(Math.max(s, Math.round((beatEnd - startBeat) / s) * s) * edBeatMs());
    edUpdateList();
  }
});
window.addEventListener('mouseup', () => {
  if (ED.ctrlDrag) pianoCtrlDragEnd();
  ED.resizing = null;
  ED.dragging = null;
  ED.pianoDrag = null;
  if (ED.panning) {
    ED.panning = null;
    edCv.style.cursor = 'crosshair';
  }
});
edCv.addEventListener('wheel', e => {
  e.preventDefault();
  const d = edDims();
  if (ED.mode === 'piano') {
    const m = pianoMetrics(d);
    if (e.shiftKey) {
      const dir = (e.deltaY !== 0 ? e.deltaY : e.deltaX) > 0 ? 1 : -1;
      ED.pianoScrollX += dir * (1 / ED.grid);
    } else {
      const dir = e.deltaY > 0 ? 1 : -1;
      ED.pianoScrollY += dir * m.rowH * 2;
    }
    pianoClampScroll(d);
    return;
  }
  const p = edPos(e);
  const n = edHitNote(p.x, p.y);
  if (n && n.type === 'hold') {
    edPushHistory('wheelHold');
    const step = edBeatMs() / ED.grid;
    n.dur = Math.max(step, r1(holdDur(n) + (e.deltaY < 0 ? step : -step)));
    edUpdateList();
    return;
  }
  ED.scroll = Math.max(0, ED.scroll + (e.deltaY > 0 ? -1 : 1));
}, { passive: false });

/* ------------------------------------------------------------
Preview / Demo
------------------------------------------------------------ */
function edPreview(demo) {
  if (ED.playing) { edStopPreview(); return; }
  if (!ED.notes.length) return;
  AudioSys.ensure();
  ED.demo = !!demo;
  ED.playing = true;
  ED.fromBeat = ED.mode === 'piano' ? Math.floor(ED.pianoScrollX) : Math.floor(ED.scroll);
  ED.prevBeat = ED.fromBeat;
  ED.playStart = performance.now();
  ED.previewHolds.clear();
  updateEdInfo();
}
function edStopPreview() {
  ED.playing = false;
  ED.demo = false;
  ED.keys = [false, false, false, false];
  if (ED.previewHolds) {
    for (const n of ED.previewHolds.keys()) AudioSys.stopHold(n);
    ED.previewHolds.clear();
  }
  updateEdInfo();
}
function edPlayDemo(autoplay = false) {
  if (!ED.notes.length) return;
  startSong(edSongObj(), !!autoplay, true);
}
function edAutoDemo() { edPlayDemo(true); }
function edUpdate() {
  if (!ED.playing) return;
  const bt = edBeatMs();
  const beat = (performance.now() - ED.playStart) / bt + ED.fromBeat;
  for (const n of ED.notes) {
    const nb = n.t / bt;
    if (nb > ED.prevBeat && nb <= beat) {
      if (n.type !== 'skip') {
        if (n.type === 'hold') {
          AudioSys.startHold(n, n);
          ED.previewHolds.set(n, n.t + holdDur(n));
        } else {
          AudioSys.playNoteData(n);
        }
        ED.keys[n.lane] = true;
        setTimeout(() => ED.keys[n.lane] = false, 100);
      }
    }
  }
  ED.prevBeat = beat;
  const curMs = beat * bt;
  for (const [n, endMs] of Array.from(ED.previewHolds.entries())) {
    if (curMs >= endMs) {
      AudioSys.stopHold(n);
      ED.previewHolds.delete(n);
    }
  }
  const lastBeat = Math.max(...ED.notes.map(n => (n.t + Math.min(holdDur(n), 30000)) / bt));
  if (beat > lastBeat + 2) edStopPreview();
}

/* ------------------------------------------------------------
Отрисовка стандартного редактора
------------------------------------------------------------ */
function drawEditorStandard(d, bt) {
  const potato = gfxPotato();
  for (let i = 0; i < 4; i++) {
    edCtx.fillStyle = rgba(LRGB[i], 0.05);
    edCtx.fillRect(d.x0 + i * d.laneW, 0, d.laneW, d.H);
  }
  if (sets.grid) {
    const visBeats = d.H / PXB + 2;
    const start = Math.floor(ED.scroll);
    const step = 1 / ED.grid;
    edCtx.lineWidth = 1;
    for (let b = start; b < ED.scroll + visBeats; b += step) {
      if (b < 0) continue;
      const y = d.lineY - (b - ED.scroll) * PXB;
      if (y < -10) break;
      const isBeat = Math.abs(b - Math.round(b)) < 1e-6;
      const isBar = isBeat && Math.round(b) % 4 === 0;
      if (isBar) edCtx.strokeStyle = 'rgba(0,229,255,0.35)';
      else if (isBeat) edCtx.strokeStyle = 'rgba(255,255,255,0.16)';
      else edCtx.strokeStyle = 'rgba(255,255,255,0.06)';
      edCtx.beginPath();
      edCtx.moveTo(d.x0, y);
      edCtx.lineTo(d.x0 + 4 * d.laneW, y);
      edCtx.stroke();
      if (isBar && !potato) {
        edCtx.fillStyle = 'rgba(0,229,255,0.7)';
        edCtx.font = '11px "Segoe UI"';
        edCtx.textAlign = 'right';
        edCtx.fillText('такт ' + (Math.round(b) / 4 + 1), d.x0 - 8, y + 4);
      }
    }
  }
  if (sets.beats && ED.beats && ED.beats.length && !potato) {
    const bdur = edBeatMs();
    edCtx.strokeStyle = 'rgba(255,214,10,0.55)';
    edCtx.lineWidth = 1;
    edCtx.beginPath();
    for (let i = 0; i < ED.beats.length; i++) {
      const b = ED.beats[i] / bdur;
      const y = d.lineY - (b - ED.scroll) * PXB;
      if (y < -10) continue;
      if (y > d.H + 10) break;
      edCtx.moveTo(d.x0, y);
      edCtx.lineTo(d.x0 + 4 * d.laneW, y);
    }
    edCtx.stroke();
  }
  for (const n of ED.notes) {
    if (n.type !== 'hold') continue;
    const b0 = n.t / bt;
    const yH = d.lineY - (b0 - ED.scroll) * PXB;
    let yT = d.lineY - ((n.t + holdDur(n)) / bt - ED.scroll) * PXB;
    yT = Math.max(yT, -60);
    if (yT > d.H + 40 || yH < -40) continue;
    const x = d.x0 + n.lane * d.laneW;
    edCtx.fillStyle = rgba(LRGB[n.lane], 0.35);
    edCtx.fillRect(x + d.laneW * 0.34, yT, d.laneW * 0.32, Math.max(2, yH - yT));
    edCtx.strokeStyle = LCOL[n.lane];
    edCtx.strokeRect(x + d.laneW * 0.34, yT, d.laneW * 0.32, Math.max(2, yH - yT));
    edCtx.fillStyle = '#fff';
    edCtx.fillRect(x + d.laneW * 0.34, yT - 3, d.laneW * 0.32, 6);
  }
  const drawn = new Set();
  for (const n of ED.notes) {
    const b0 = n.t / bt;
    const yH = d.lineY - (b0 - ED.scroll) * PXB;
    if (yH > d.H + 40 || yH < -40) continue;
    const key = n.lane + '|' + Math.round(b0 * 1000);
    if (drawn.has(key)) continue;
    drawn.add(key);
    const x = d.x0 + n.lane * d.laneW;
    if (n.type === 'skip') {
      edCtx.save();
      edCtx.translate(x + d.laneW / 2, yH);
      edCtx.fillStyle = '#ff5050';
      edCtx.beginPath();
      edCtx.moveTo(0, -14); edCtx.lineTo(14, 0); edCtx.lineTo(0, 14); edCtx.lineTo(-14, 0);
      edCtx.closePath(); edCtx.fill();
      edCtx.strokeStyle = '#fff'; edCtx.lineWidth = 1.5; edCtx.stroke();
      edCtx.strokeStyle = '#001018'; edCtx.lineWidth = 2;
      edCtx.beginPath(); edCtx.arc(0, 0, 6, 0, Math.PI * 2); edCtx.stroke();
      edCtx.beginPath(); edCtx.moveTo(-4, -4); edCtx.lineTo(4, 4); edCtx.stroke();
      edCtx.restore();
      edCtx.lineWidth = 1;
    } else if (n.inst === 'drum') {
      edCtx.fillStyle = LCOL[n.lane];
      edCtx.save();
      edCtx.translate(x + d.laneW / 2, yH);
      edCtx.rotate(Math.PI / 4);
      edCtx.fillRect(-11, -11, 22, 22);
      edCtx.restore();
    } else if (n.inst === 'empty') {
      edCtx.fillStyle = rgba(LRGB[n.lane], 0.15);
      roundRect(edCtx, x + 8, yH - 13, d.laneW - 16, 26, 5);
      edCtx.fill();
      edCtx.strokeStyle = LCOL[n.lane];
      edCtx.lineWidth = 2;
      edCtx.setLineDash([4, 3]);
      roundRect(edCtx, x + 8, yH - 13, d.laneW - 16, 26, 5);
      edCtx.stroke();
      edCtx.setLineDash([]);
      edCtx.lineWidth = 1;
      if (!potato) {
        edCtx.fillStyle = LCOL[n.lane];
        edCtx.font = 'bold 13px "Segoe UI"';
        edCtx.textAlign = 'center';
        edCtx.fillText('∅', x + d.laneW / 2, yH + 4);
      }
    } else {
      edCtx.fillStyle = LCOL[n.lane];
      roundRect(edCtx, x + 8, yH - 13, d.laneW - 16, 26, 5);
      edCtx.fill();
      if (!potato) {
        edCtx.fillStyle = '#001018';
        edCtx.font = 'bold 10px "Segoe UI"';
        edCtx.textAlign = 'center';
        edCtx.fillText(
          n.inst === 'custom' ? '★' : (n.tone || '') + n.oct,
          x + d.laneW / 2, yH + 4
        );
      }
    }
    if (ED.selected === n) {
      const y2 = n.type === 'hold'
        ? Math.max(d.lineY - ((n.t + holdDur(n)) / bt - ED.scroll) * PXB, -60)
        : yH;
      edCtx.strokeStyle = '#fff';
      edCtx.setLineDash([5, 5]);
      edCtx.strokeRect(x + 2, y2 - 20, d.laneW - 4, (yH - y2) + 40);
      edCtx.setLineDash([]);
    }
  }
  edCtx.strokeStyle = '#00e5ff';
  edCtx.lineWidth = 3;
  if (!potato) { edCtx.shadowBlur = 12; edCtx.shadowColor = '#00e5ff'; }
  edCtx.beginPath();
  edCtx.moveTo(d.x0 - 16, d.lineY);
  edCtx.lineTo(d.x0 + 4 * d.laneW + 16, d.lineY);
  edCtx.stroke();
  edCtx.shadowBlur = 0;
  edCtx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const x = d.x0 + i * d.laneW;
    const pressed = G.keys[i];
    edCtx.strokeStyle = LCOL[i];
    edCtx.lineWidth = pressed ? 3 : 1;
    roundRect(edCtx, x + 6, d.lineY - 16, d.laneW - 12, 32, 6);
    edCtx.stroke();
    if (pressed) {
      edCtx.fillStyle = rgba(LRGB[i], 0.28);
      roundRect(edCtx, x + 6, d.lineY - 16, d.laneW - 12, 32, 6);
      edCtx.fill();
    }
    edCtx.lineWidth = 1;
    edCtx.fillStyle = LCOL[i];
    edCtx.font = 'bold 14px "Segoe UI"';
    edCtx.textAlign = 'center';
    edCtx.fillText(laneLabel(i), x + d.laneW / 2, d.lineY + 5);
  }
  if (ED.playing) {
    const beat = (performance.now() - ED.playStart) / bt + ED.fromBeat;
    const y = d.lineY - (beat - ED.scroll) * PXB;
    edCtx.strokeStyle = '#ffd60a';
    edCtx.lineWidth = 2;
    if (!potato) { edCtx.shadowBlur = 10; edCtx.shadowColor = '#ffd60a'; }
    edCtx.beginPath();
    edCtx.moveTo(0, y);
    edCtx.lineTo(d.W, y);
    edCtx.stroke();
    edCtx.shadowBlur = 0;
    edCtx.lineWidth = 1;
    if (ED.scroll > beat - 1) ED.scroll = Math.max(0, beat - 1);
  }
  if (ED.beatRec.recording && ED.beatRec.audio) {
    const beat = ED.beatRec.audio.currentTime * 1000 / bt;
    const y = d.lineY - (beat - ED.scroll) * PXB;
    edCtx.strokeStyle = '#fff';
    edCtx.lineWidth = 1;
    edCtx.setLineDash([5, 5]);
    edCtx.beginPath();
    edCtx.moveTo(0, y);
    edCtx.lineTo(d.W, y);
    edCtx.stroke();
    edCtx.setLineDash([]);
  }
}
function edDraw() {
  fitCanvas(edCv);
  const d = edDims();
  const bt = edBeatMs();
  edCtx.setTransform(1, 0, 0, 1, 0, 0);
  edCtx.fillStyle = '#05060f';
  edCtx.fillRect(0, 0, d.W, d.H);
  if (ED.mode === 'piano') drawPiano(d, bt);
  else drawEditorStandard(d, bt);
}

/* ------------------------------------------------------------
Список нот / сохранение / импорт
------------------------------------------------------------ */
function edUpdateList() {
  const box = document.getElementById('edNoteList');
  const last = ED.notes.slice(-10);
  box.innerHTML = last.map((n, i) => {
    const idx = ED.notes.length - last.length + i;
    const what = n.type === 'skip' ? '⊘ пропуск'
      : n.inst === 'drum' ? ('🥁 ' + n.drum)
      : n.inst === 'custom' ? ('★ ' + (n.custom || '—'))
      : n.inst === 'empty' ? '∅ пустая'
      : ('🎹 ' + n.tone + n.oct);
    return `<span>${what} · ${laneLabel(n.lane)}${n.type === 'hold' ? ' · холд' : ''} · ${(n.t / 1000).toFixed(1)}c <a href="#" onclick="edDel(${idx});return false" style="color:#ff5050">✖</a></span>`;
  }).join('');
  updateEdInfo();
}
function edDel(i) {
  if (i < 0 || i >= ED.notes.length) return;
  edPushHistory();
  ED.notes.splice(i, 1);
  edUpdateList();
}
function edSave() {
  ED.name = edName.value || 'Мой трек';
  ED.bpm = clamp(+edBpm.value || 120, 40, 300);
  const arr = getCustomTracks();
  const s = edSongObj();
  const idx = arr.findIndex(t => t.name === s.name);
  if (idx >= 0) arr[idx] = s;
  else arr.push(s);
  setCustomTracks(arr);
  alert('Трек «' + s.name + '» сохранён!');
}
function edClear() {
  if (confirm('Удалить все ноты?')) {
    edPushHistory();
    ED.notes = [];
    ED.selected = null;
    ED.pianoPending = null;
    ED.pianoSelected = null;
    ED.pianoSelection.clear();
    ED.ctrlDrag = null;
    edUpdateList();
  }
}
function edExport() {
  const blob = new Blob([JSON.stringify(edSongObj(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (edName.value || 'track') + '.neonbeat.json';
  a.click();
}
edImportFile.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      if (!Array.isArray(j.notes)) throw 0;
      ED.notes = j.notes;
      ED.bpm = clamp(j.bpm || 120, 40, 300);
      ED.name = j.name || 'Импорт';
      ED.beats = Array.isArray(j.beats) ? j.beats.slice() : [];
      edBpm.value = ED.bpm;
      edName.value = ED.name;
      ED.selected = null;
      ED.pianoSelected = null;
      ED.pianoSelection.clear();
      ED.ctrlDrag = null;
      edUpdateList();
    } catch (err) {
      alert('Не удалось прочитать файл трека.');
    }
  };
  r.readAsText(f);
  e.target.value = '';
});
function edLoadTrack(t) {
  edStopBeatAudio();
  ED.beatRec.recording = false;
  ED.beatRec.finished = false;
  edPushHistory();
  ED.notes = JSON.parse(JSON.stringify(t.notes));
  ED.bpm = t.bpm;
  ED.name = t.name;
  ED.beats = Array.isArray(t.beats) ? t.beats.slice() : [];
  edBpm.value = t.bpm;
  edName.value = t.name;
  ED.selected = null;
  ED.pianoSelected = null;
  ED.pianoSelection.clear();
  ED.pianoDrag = null;
  ED.panning = null;
  ED.ctrlDrag = null;
  ED.scroll = 0;
  ED.pianoScrollX = 0;
  ED.pianoScrollY = 0;
  edUpdateList();
}
function edBeatRecEls() {
  return {
    info: document.getElementById('edBeatRecInfo'),
    start: document.getElementById('edBeatRecStart'),
    stop: document.getElementById('edBeatRecStop'),
    save: document.getElementById('edBeatRecSave'),
    clear: document.getElementById('edBeatRecClear')
  };
}
function edUpdateBeatRecUI() {
  const el = edBeatRecEls();
  if (!el.info) return;
  const r = ED.beatRec;
  const count = Array.isArray(ED.beats) ? ED.beats.length : 0;
  el.info.textContent = r.recording
    ? `🔴 Запись: ${count} битов · ${r.audio ? r.audio.currentTime.toFixed(1) : '0.0'} c`
    : r.finished
      ? `✓ Разметка готова: ${count} битов · трек закончен`
      : `Автоанализ: ${count} битов`;
  el.start.disabled = !ED.bgUrl || r.recording;
  el.stop.disabled = !r.recording;
  el.save.disabled = r.recording || !r.finished || !count;
  el.clear.disabled = r.recording;
  el.start.classList.toggle('ed-beat-rec-active', r.recording);
  edCv.classList.toggle('beat-recording', r.recording);
  edCv.classList.toggle('beat-rec-done', r.finished && !r.recording);
}
function edStopBeatAudio() {
  const r = ED.beatRec;
  if (r.audio) {
    r.audio.pause();
    try { r.audio.currentTime = 0; } catch (e) {}
  }
}
function edStartBeatRecording() {
  if (!ED.bgUrl) {
    alert('Сначала загрузите фоновую песню кнопкой 🎧.');
    return;
  }
  edStopPreview();
  const r = ED.beatRec;
  edStopBeatAudio();
  ED.beats = [];
  r.finished = false;
  r.recording = true;
  r.lastTap = -Infinity;
  r.audio = new Audio(ED.bgUrl);
  r.audio.preload = 'auto';
  r.audio.volume = sets.mus / 100;
  r.audio.onloadedmetadata = () => {
    r.duration = isFinite(r.audio.duration) ? r.audio.duration : 0;
    edUpdateBeatRecUI();
  };
  r.audio.ontimeupdate = () => { if (r.recording) edUpdateBeatRecUI(); };
  r.audio.onended = () => {
    r.recording = false;
    r.finished = true;
    if (r.audio) r.duration = isFinite(r.audio.duration) ? r.audio.duration : r.duration;
    edUpdateBeatRecUI();
    updateEdInfo();
  };
  r.audio.play().catch(err => {
    console.warn('Beat recording playback failed:', err);
    r.recording = false;
    r.finished = false;
    edUpdateBeatRecUI();
    alert('Не удалось запустить фоновую песню. Нажмите «Разметить вручную» ещё раз.');
  });
  edUpdateBeatRecUI();
}
function edRecordBeatAtCurrentTime() {
  const r = ED.beatRec;
  if (!r.recording || !r.audio || r.audio.paused || r.audio.ended) return;
  const ms = Math.max(0, Math.round(r.audio.currentTime * 1000));
  // Защита от двойного события pointer/touch и случайных двойных нажатий.
  if (ms - r.lastTap < 45) return;
  r.lastTap = ms;
  ED.beats.push(ms);
  ED.beats.sort((a, b) => a - b);
  edUpdateBeatRecUI();
  updateEdInfo();
}
function edStopBeatRecording() {
  const r = ED.beatRec;
  if (!r.recording) return;
  edStopBeatAudio();
  r.recording = false;
  r.finished = true;
  edUpdateBeatRecUI();
}
function edSaveBeatRecording() {
  const r = ED.beatRec;
  if (r.recording) {
    alert('Сначала дождитесь конца песни или нажмите «Остановить».');
    return;
  }
  if (!r.finished) return;
  ED.beats = Array.from(new Set((ED.beats || []).map(v => Math.max(0, Math.round(+v))).filter(Number.isFinite))).sort((a, b) => a - b);
  edUpdateBeatRecUI();
  updateEdInfo();
  edSave();
}
function edClearBeats() {
  if (ED.beatRec.recording) return;
  ED.beats = [];
  ED.beatRec.finished = false;
  edUpdateBeatRecUI();
  updateEdInfo();
}

function edImportBg() { edBgFile.click(); }
edBgFile.addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  edStopBeatAudio();
  ED.beatRec.recording = false;
  ED.beatRec.finished = false;
  ED.bgUrl = URL.createObjectURL(f);
  edBgName.classList.remove('done');
  edBgName.classList.add('analyzing');
  edBgName.textContent = '🎧 ' + f.name + ' · анализ…';
  await new Promise(r => setTimeout(r, 30));
  try {
    const arr = await f.arrayBuffer();
    AudioSys.ensure();
    const buf = await AudioSys.ctx.decodeAudioData(arr.slice(0));
    ED.beats = analyzeBeats(buf);
    ED.beatRec.finished = false;
    edBgName.classList.remove('analyzing');
    edBgName.classList.add('done');
    edBgName.textContent = '🎧 ' + f.name + ' · битов: ' + ED.beats.length;
    updateEdInfo();
    edUpdateBeatRecUI();
  } catch (err) {
    console.warn('Beat analysis failed:', err);
    ED.beats = [];
    ED.beatRec.finished = false;
    edBgName.classList.remove('analyzing');
    edBgName.classList.add('done');
    edBgName.textContent = '🎧 ' + f.name + ' (биты: ошибка)';
    updateEdInfo();
    edUpdateBeatRecUI();
  }
  e.target.value = '';
});
edCustomFile.addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  const ok = await AudioSys.loadCustom(f.name, f);
  if (ok) {
    if (!ED.customs.includes(f.name)) ED.customs.push(f.name);
    edCustomSel.innerHTML = ED.customs.map(c => `<option>${c}</option>`).join('');
    edCustomSel.value = f.name;
    ED.customSel = f.name;
  } else {
    alert('Не удалось декодировать звук.');
  }
  e.target.value = '';
});
edCustomSel.addEventListener('change', () => {
  ED.customSel = edCustomSel.value || null;
});

/* ------------------------------------------------------------
UI editor init
------------------------------------------------------------ */
TONES.forEach(t => {
  const o = document.createElement('option');
  o.value = o.textContent = t;
  edTone.appendChild(o);
});
edTone.onchange = () => ED.tone = edTone.value;
edOct.onchange = () => ED.oct = +edOct.value;
edWave.onchange = () => ED.wave = edWave.value;
edBpm.addEventListener('input', () => { ED.bpm = clamp(+edBpm.value || 120, 40, 300); updateEdInfo(); });
edGrid.onchange = () => { ED.grid = +edGrid.value; updateEdInfo(); };
edName.addEventListener('input', () => { ED.name = edName.value; });
const DRUMS = [
  ['kick', 'Kick'], ['snare', 'Snare'], ['hihat', 'Hi-Hat'], ['openhat', 'Open Hat'],
  ['clap', 'Clap'], ['rim', 'Rim'], ['tom', 'Tom'], ['cowbell', 'Cowbell'],
  ['crash', 'Crash'], ['ride', 'Ride'], ['shaker', 'Shaker']
];
DRUMS.forEach(([id, lab], i) => {
  const b = document.createElement('button');
  b.className = 'chip' + (i === 0 ? ' on' : '');
  b.textContent = lab;
  b.onclick = () => {
    ED.drum = id;
    drumChips.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
    b.classList.add('on');
    AudioSys.playNoteData({ inst: 'drum', drum: id, tone: ED.tone, oct: +ED.oct });
  };
  drumChips.appendChild(b);
});
document.getElementById('edModeTap').onclick = () => edMode('tap');
document.getElementById('edModePiano').onclick = () => edMode('piano');
document.getElementById('chipTap').onclick = () => { ED.pianoNoteType = 'tap'; updateEdModeUI(); };
document.getElementById('chipHold').onclick = () => {
  if (ED.inst === 'drum') return;
  ED.pianoNoteType = 'hold';
  updateEdModeUI();
};
document.getElementById('chipSkip').onclick = () => {
  if (ED.inst === 'drum') return;
  ED.pianoNoteType = 'skip';
  updateEdModeUI();
};
function exitEditor() {
  edStopPreview();
  ED.ctrlDrag = null;
  edHideContextMenu();
  show('scr-menu');
}

/* ============================================================
14.5. TOUCH-УПРАВЛЕНИЕ РЕДАКТОРОМ (мобильные)
============================================================ */
(function initEditorTouch() {
  if (!edCv) return;
  let longTimer = null, touchActive = false, startX = 0, startY = 0;
  edCv.addEventListener('touchstart', e => {
    if (e.touches.length > 1) { touchActive = false; return; }
    touchActive = true;
    if (ED.beatRec.recording) {
      e.preventDefault();
      return;
    }
    const t = e.touches[0];
    const r = edCv.getBoundingClientRect();
    startX = t.clientX - r.left;
    startY = t.clientY - r.top;
    longTimer = setTimeout(() => {
      if (!touchActive) return;
      if (ED.mode === 'piano') {
        const cell = pianoGetCell(startX, startY);
        if (cell) {
          const notesHere = pianoNotesAt(cell.beat, cell.tone, cell.oct);
          if (notesHere.length) {
            edPushHistory();
            ED.notes = ED.notes.filter(n => !notesHere.includes(n));
            edUpdateList();
            touchActive = false;
            return;
          }
        }
      } else {
        const n = edHitNote(startX, startY);
        if (n) {
          edPushHistory();
          ED.notes = ED.notes.filter(q => q !== n);
          if (ED.selected === n) ED.selected = null;
          edUpdateList();
          touchActive = false;
          return;
        }
      }
      ED.panning = {
        startX, startY,
        sx: ED.mode === 'piano' ? ED.pianoScrollX : 0,
        sy: ED.mode === 'piano' ? ED.pianoScrollY : ED.scroll
      };
    }, 420);
  }, { passive: true });
  edCv.addEventListener('touchmove', e => {
    if (!touchActive) return;
    const t = e.touches[0];
    const r = edCv.getBoundingClientRect();
    const x = t.clientX - r.left;
    const y = t.clientY - r.top;
    if (ED.panning) {
      const d = edDims();
      if (ED.mode === 'piano') {
        const m = pianoMetrics(d);
        ED.pianoScrollX = ED.panning.sx - (x - ED.panning.startX) / m.pxPerBeat;
        ED.pianoScrollY = ED.panning.sy - (y - ED.panning.startY);
        pianoClampScroll(d);
      } else {
        ED.scroll = Math.max(0, ED.panning.sy - (y - ED.panning.startY) / PXB);
      }
      e.preventDefault();
    } else if (Math.hypot(x - startX, y - startY) > 12) {
      clearTimeout(longTimer);
    }
  }, { passive: false });
  edCv.addEventListener('touchend', e => {
    clearTimeout(longTimer);
    if (!touchActive) return;
    if (ED.beatRec.recording) {
      e.preventDefault();
      edRecordBeatAtCurrentTime();
      touchActive = false;
      return;
    }
    const wasPanning = !!ED.panning;
    ED.panning = null;
    if (wasPanning) { touchActive = false; return; }
    if (ED.mode === 'piano') {
      const cell = pianoGetCell(startX, startY);
      if (cell) {
        pianoPreviewCell(cell);
        ED.pianoPending = cell;
        edShowLaneMenu(cell);
      }
    } else {
      const d = edDims();
      const n = edHitNote(startX, startY);
      if (n) {
        ED.selected = n;
        if (n.type !== 'skip') AudioSys.playNoteData(n);
      } else {
        const lane = Math.floor((startX - d.x0) / d.laneW);
        if (lane >= 0 && lane <= 3) {
          const beat = edQuant((d.lineY - startY) / PXB + ED.scroll);
          edAddNote(lane, beat);
        }
      }
    }
    touchActive = false;
  }, { passive: true });
  function edShowLaneMenu(cell) {
    let menu = document.getElementById('edLaneMenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'edLaneMenu';
      menu.className = 'ed-lane-menu';
      menu.innerHTML = KEYS.map((k, i) =>
        `<button class="chip" data-lane="${i}">${k}<span>${laneLabel(i)}</span></button>`
      ).join('') + `<button class="chip danger" data-del="1">Удалить</button>`;
      document.getElementById('scr-editor').appendChild(menu);
      menu.addEventListener('click', ev => {
        const btn = ev.target.closest('button');
        if (!btn) return;
        if (btn.dataset.del) {
          const c = menu._cell;
          if (c) {
            const t = c.beat * edBeatMs();
            edPushHistory();
            ED.notes = ED.notes.filter(n => !(Math.abs(n.t - t) < 1 && n.tone === c.tone && n.oct === c.oct));
            edUpdateList();
          }
        } else {
          pianoAssignKey(+btn.dataset.lane);
        }
        menu.classList.remove('show');
      });
    }
    menu._cell = cell;
    menu.classList.add('show');
    clearTimeout(menu._hide);
    menu._hide = setTimeout(() => menu.classList.remove('show'), 5000);
  }
})();

/* ============================================================
15. ИНИЦИАЛИЗАЦИЯ
============================================================ */
setSfx.oninput = () => { sets.sfx = +setSfx.value; setSfxV.textContent = sets.sfx + '%'; AudioSys.applyVolumes(); saveSets(); };
setMus.oninput = () => { sets.mus = +setMus.value; setMusV.textContent = sets.mus + '%'; AudioSys.applyVolumes(); saveSets(); };
setCal.oninput = () => { sets.cal = +setCal.value; setCalV.textContent = (sets.cal > 0 ? '+' : '') + sets.cal + ' мс'; saveSets(); };
setGrid.onchange = () => { sets.grid = setGrid.checked; saveSets(); };
setContrast.onchange = () => { sets.contrast = setContrast.checked; saveSets(); applyPalette(); };
const setBeatsEl = document.getElementById('setBeats');
if (setBeatsEl) setBeatsEl.onchange = () => { sets.beats = setBeatsEl.checked; saveSets(); };
document.querySelectorAll('#gfxChips .chip').forEach(c => {
  c.onclick = () => { sets.gfx = c.dataset.gfx; saveSets(); applySetsToUI(); };
});
document.querySelectorAll('input[name=nv]').forEach(r => {
  r.onchange = () => { sets.noteView = r.value; saveSets(); };
});
applySetsToUI();
applyPalette();
edBpm.value = ED.bpm;
edName.value = ED.name;
edHoldLenV.textContent = ED.holdLen;
updateEdInfo();
edUpdateBeatRecUI();
document.getElementById('scr-editor').addEventListener('mousedown', e => {
  if (!e.target.closest('input, textarea, select')) edBlurActiveInput();
});
edName.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); edName.blur(); }
});
edBpm.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); edBpm.blur(); }
});
edUpdateHistoryUI();
window.addEventListener('resize', () => { cachedDims = null; edCachedDims = null; });
let lastFrameTime = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = lastFrameTime ? Math.min(0.05, (now - lastFrameTime) / 1000) : 0.016;
  lastFrameTime = now;
  if (G.active) {
    const st = G.paused ? (G.pauseStart - G.startTime - G.pausedTotal) : songTime();
    updateGame(st, dt);
    drawGame(st);
  } else if (editorActive) {
    fitCanvas(edCv);
    edUpdate();
    edDraw();
  }
}
requestAnimationFrame(loop);
