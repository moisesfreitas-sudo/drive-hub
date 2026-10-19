"use strict";

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

let W = window.innerWidth;
let H = window.innerHeight;
// Limit DPR to avoid extremely large canvas sizes that can crash browsers
let DPR = Math.min(window.devicePixelRatio || 1, 2);
let qHigh = true;

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  // Clamp DPR between 1 and 2 even when qHigh is true
  DPR = qHigh ? Math.min(Math.max(1, Math.floor(3840 / Math.max(W, H))), 2) : Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.floor(W * DPR));
  cv.height = Math.max(1, Math.floor(H * DPR));
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

window.addEventListener('resize', resize);
resize();

const keys = {};
const keyMap = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ' ': 'space', n: 'nitro', N: 'nitro', ShiftLeft: 'nitro', ShiftRight: 'nitro'
};

window.addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if ('cCvV'.includes(e.key) && e.key.length === 1 && !e.repeat) toggleCam();
  if (e.key === 'Escape') showMenu();
  const mapped = keyMap[e.code] || keyMap[e.key];
  if (mapped) {
    keys[mapped] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => {
  const mapped = keyMap[e.code] || keyMap[e.key];
  if (mapped) keys[mapped] = false;
});

function bindTouchBtn(id, keyName) {
  const el = document.getElementById(id);
  if (!el) return;

  const on = (e) => {
    e.preventDefault();
    el.classList.add('on');
    keys[keyName] = true;
  };

  const off = (e) => {
    e.preventDefault();
    el.classList.remove('on');
    keys[keyName] = false;
  };

  el.addEventListener('touchstart', on, { passive: false });
  el.addEventListener('touchend', off, { passive: false });
  el.addEventListener('touchcancel', off, { passive: false });
  el.addEventListener('mousedown', on);
  el.addEventListener('mouseup', off);
  el.addEventListener('mouseleave', off);
}

bindTouchBtn('bL', 'left');
bindTouchBtn('bR', 'right');
bindTouchBtn('bGas', 'up');
bindTouchBtn('bBrake', 'down');
bindTouchBtn('bDrift', 'space');
bindTouchBtn('bNit', 'nitro');

const CARS = [
  { id: 'sport', name: 'Esportivo RS', col: '#ff5a3c', engine: 450, top: 390, grip: 8.5, gripDrift: 2.2, turn: 2.5, L: 44, W: 22 },
  { id: 'drift', name: 'Drift Spec', col: '#3cd6ff', engine: 400, top: 350, grip: 6.8, gripDrift: 1.5, turn: 3.0, L: 44, W: 22 },
  { id: 'muscle', name: 'V8 Muscle', col: '#ffd23c', engine: 540, top: 440, grip: 6.0, gripDrift: 2.6, turn: 2.1, L: 46, W: 23 },
  { id: 'compact', name: 'Urban Uno', col: '#eef2f8', engine: 380, top: 320, grip: 8.2, gripDrift: 2.0, turn: 2.8, L: 38, W: 20 }
];

const TRACKS = [
  { id: 'c1', name: 'Circuito Noite', w: 150, c: [[-900,-620],[-200,-780],[520,-700],[950,-380],[1050,120],[700,420],[900,760],[300,900],[-350,760],[-620,420],[-1000,300],[-1100,-150]] },
  { id: 'c2', name: 'Oval Veloz', w: 170, c: [[-900,-400],[0,-520],[900,-400],[1150,0],[900,400],[0,520],[-900,400],[-1150,0]] },
  { id: 'c3', name: 'Serpente', w: 120, c: [[-1000,-300],[-650,-650],[-250,-300],[150,-650],[550,-300],[1000,-600],[1150,-50],[800,350],[400,50],[0,450],[-400,50],[-800,450],[-1200,100]] }
];

const GRID_C = 440;
const ROAD_R = 140;
const INS = 14;
const hash = (i, j) => (((i * 73856093) ^ (j * 19349663)) >>> 0);
const isPark = (i, j) => hash(i, j) % 5 === 0;

function isCityBlocked(x, y) {
  const i = Math.floor(x / GRID_C);
  const j = Math.floor(y / GRID_C);
  const lx = x - i * GRID_C;
  const ly = y - j * GRID_C;
  if (lx < ROAD_R + INS || lx > GRID_C - INS || ly < ROAD_R + INS || ly > GRID_C - INS) return false;
  return !isPark(i, j);
}

let gameMode = 'city';
let selectedCarIdx = 0;
let selectedTrackIdx = 0;
let isPlaying = false;
let isFirstPerson = false;

const TUNE0 = { acc: 1, vmax: 1, grip: 1, steer: 1, bld: 1, hue: 0, fov: 1, fog: 1, npc: 1 };
let TUNE = Object.assign({}, TUNE0);
const ENV = { tempo: 'entardecer', rain: 0, traffic: 0.5, carHue: 10, lum: 1, sun: 1 };

const car = { x: 0, y: 0, a: 0, vx: 0, vy: 0, steer: 0, L: 44, W: 22, drifting: false, onRoad: true };
const cam = { x: 0, y: 0, zoom: 1.0, targetZoom: 1.0 };
let nitro = 1.0;

let trackPts = [], trackN = 0, trackRoadW = 150, trackScenery = [], trackMM = { cx: 0, cy: 0, s: 0.04 };
const skids = [], particles = [], npcs = [];
const telemetry = { crash: 0, vsum: 0, n: 0 };

let combo = 0, totalScore = 0, comboMult = 1, comboTimer = 0;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  };
}

function buildTrack(idx) {
  const T = TRACKS[idx];
  const c = T.c.map((a) => ({ x: a[0], y: a[1] }));
  trackRoadW = T.w;
  trackPts = [];

  for (let i = 0; i < c.length; i++) {
    const p0 = c[(i - 1 + c.length) % c.length];
    const p1 = c[i];
    const p2 = c[(i + 1) % c.length];
    const p3 = c[(i + 2) % c.length];
    for (let s = 0; s < 40; s++) trackPts.push(catmull(p0, p1, p2, p3, s / 40));
  }

  trackN = trackPts.length;
  trackScenery = [];
  for (let i = 0; i < trackN; i += 4) {
    const t = getTrackTangent(i);
    const nx = -t.y;
    const ny = t.x;
    for (const sd of [-1, 1]) {
      if (Math.random() < 0.65) {
        const d = sd * (trackRoadW + 70 + Math.random() * 280);
        trackScenery.push({ x: trackPts[i].x + nx * d, y: trackPts[i].y + ny * d, k: Math.random() < 0.3 ? 1 : 0 });
      }
    }
  }

  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const p of trackPts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  trackMM = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, s: Math.min(96 / (maxX - minX), 82 / (maxY - minY)) * 0.92 };
}

function getTrackTangent(i) {
  const a = trackPts[(i - 1 + trackN) % trackN];
  const b = trackPts[(i + 1) % trackN];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  return { x: dx / L, y: dy / L };
}

function getNearestTrackPt(px, py) {
  let best = 1e18;
  let bi = 0;
  for (let i = 0; i < trackN; i += 2) {
    const d = (trackPts[i].x - px) ** 2 + (trackPts[i].y - py) ** 2;
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  return { x: trackPts[bi].x, y: trackPts[bi].y, idx: bi, dist: Math.sqrt(best) };
}

function resetCarPosition() {
  if (gameMode === 'drift') {
    buildTrack(selectedTrackIdx);
    const p = trackPts[0];
    const t = getTrackTangent(0);
    car.x = p.x;
    car.y = p.y;
    car.a = Math.atan2(t.y, t.x);
  } else {
    car.x = ROAD_R / 2;
    car.y = 0;
    car.a = -Math.PI / 2;
  }

  car.vx = 0;
  car.vy = 0;
  car.steer = 0;
  const spec = CARS[selectedCarIdx];
  car.L = spec.L;
  car.W = spec.W;
  cam.x = car.x;
  cam.y = car.y;
}

function checkCityHits(x, y, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  for (const [px, py] of [[22,10],[22,-10],[-22,10],[-22,-10],[0,0]]) {
    if (isCityBlocked(x + px * c - py * s, y + px * s + py * c)) return true;
  }
  return false;
}

const DA = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

function spawnNPC(n) {
  let attempts = 0;
  do {
    const hz = Math.random() < 0.5;
    const dir = hz ? (Math.random() < 0.5 ? 0 : 2) : (Math.random() < 0.5 ? 1 : 3);
    const ri = (hz ? Math.floor(car.y / GRID_C) : Math.floor(car.x / GRID_C)) + Math.floor(Math.random() * 7) - 3;
    const along = (hz ? car.x : car.y) + (Math.random() * 2 - 1) * 1100;
    const lane = ri * GRID_C + ROAD_R / 2 + ((dir === 0 || dir === 3) ? 35 : -35);
    n.dir = dir;
    n.a = DA[dir];
    n.x = hz ? along : lane;
    n.y = hz ? lane : along;
    n.lane = lane;
  } while (Math.hypot(n.x - car.x, n.y - car.y) < 300 && ++attempts < 8);

... (file continues)