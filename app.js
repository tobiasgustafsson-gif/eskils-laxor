'use strict';
/* Eskils läxor. En sida, inga beroenden. Data i Supabase via tre funktioner som kräver familjenyckeln. */

/* ================= grund ================= */
const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.random() * a.length | 0];
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
};
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
function idag(d = new Date()) { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
function plusDagar(dag, n) { const d = new Date(dag + 'T12:00:00'); d.setDate(d.getDate() + n); return idag(d); }
function veckodag(dag) { return new Date(dag + 'T12:00:00').toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }); }
function isoVecka(d = new Date()) { d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const w = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - w); const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return [d.getUTCFullYear(), Math.ceil(((d - y) / 864e5 + 1) / 7)]; }
function norm(s) { return String(s).trim().toLowerCase().replace(/[‐-―]/g, '-').replace(/\s+/g, ' '); }
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }

/* ================= familjenyckel ================= */
(function () {
  const p = new URLSearchParams(location.search);
  if (p.get('k')) ls.set('nyckel', p.get('k'));
})();
const NYCKEL = ls.get('nyckel', null);

/* ================= lagring och synk ================= */
const S = {
  status: {},          // item -> {item, box, due, ratt, fel, senast, senast_dag}
  bockar: {},          // läx-id -> bool
  dagar: [],           // [{dag, laxa, kalla, antal, sekunder, ratt}]
  online: null,        // true, false, eller null (okänt)
  felNyckel: false,
};
let ko = ls.get('ko', { forsok: [], status: {}, bockar: {} });
const cache = ls.get('cache', null);
if (cache) { S.status = cache.status || {}; S.bockar = cache.bockar || {}; S.dagar = cache.dagar || []; }
applyKo();

async function rpc(fn, args, keepalive) {
  const r = await fetch(`${KONFIG.url}/rest/v1/rpc/${fn}`, {
    method: 'POST', keepalive: !!keepalive,
    headers: { apikey: KONFIG.nyckel, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_nyckel: NYCKEL, ...args }),
  });
  if (!r.ok) { const t = await r.text(); const e = new Error(t); e.status = r.status; e.felNyckel = /fel nyckel|28000/.test(t); throw e; }
  const txt = await r.text(); return txt ? JSON.parse(txt) : null;
}
function applyKo() {
  for (const k in ko.status) S.status[k] = ko.status[k];
  for (const k in ko.bockar) S.bockar[k] = ko.bockar[k];
}
function sparaCache() { ls.set('cache', { status: S.status, bockar: S.bockar, dagar: S.dagar }); }
async function hamta() {
  if (!NYCKEL) return;
  try {
    const d = await rpc('hamta', {});
    S.status = {}; (d.status || []).forEach(r => S.status[r.item] = r);
    S.bockar = d.bockar || {}; S.dagar = d.dagar || [];
    applyKo(); S.online = true; sparaCache();
  } catch (e) { if (e.felNyckel) S.felNyckel = true; S.online = false; }
}
let flushTimer = null, flushing = false;
function planeraFlush() { clearTimeout(flushTimer); flushTimer = setTimeout(flush, 1500); }
async function flush(keepalive) {
  if (!NYCKEL || flushing) return;
  const f = ko.forsok, st = Object.values(ko.status), bo = ko.bockar;
  if (!f.length && !st.length && !Object.keys(bo).length) return;
  flushing = true;
  try {
    for (const k in bo) await rpc('bocka', { p_laxa: k, p_klar: bo[k] }, keepalive);
    for (let i = 0; i < Math.max(f.length, 1); i += 500) {
      await rpc('spara', { p_forsok: f.slice(i, i + 500), p_status: i === 0 ? st : [] }, keepalive);
    }
    // töm bara det som skickades
    const skickade = new Set(f.map(x => x.id));
    ko = { forsok: ko.forsok.filter(x => !skickade.has(x.id)),
           status: Object.fromEntries(Object.entries(ko.status).filter(([k, v]) => !st.includes(v))),
           bockar: Object.fromEntries(Object.entries(ko.bockar).filter(([k, v]) => bo[k] !== v)) };
    ls.set('ko', ko); S.online = true;
    // lägg till försöken i dagssummeringen lokalt
  } catch (e) { S.online = false; if (e.felNyckel) S.felNyckel = true; }
  flushing = false;
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
window.addEventListener('online', () => flush());

/* ================= repetition över dagar ================= */
// Låda 0 = nytt eller fel. Rätt första försöket för dagen flyttar upp en låda. Fel tar ner till låda 0.
// "Kan" = låda 3 eller högre, vilket kräver rätt på minst tre olika dagar.
const INTERVALL = [0, 1, 2, 4, 7, 14, 30];
const KAN = 3;
function nivå(item) { const s = S.status[item]; if (!s) return 'ej'; return s.box >= KAN ? 'kan' : 'lar'; }
function behovs(item, dag = idag()) { const s = S.status[item]; return !!s && s.due && s.due <= dag && s.box < INTERVALL.length; }
function registrera(item, laxa, ratt, kalla, lage, sekunder) {
  const dag = idag(), nu = new Date().toISOString();
  const s = { ...(S.status[item] || { item, box: 0, due: dag, ratt: 0, fel: 0 }) };
  const förstIdag = s.senast_dag !== dag;
  if (ratt) s.ratt++; else s.fel++;
  if (förstIdag) {
    if (ratt) { s.box = Math.min(s.box + 1, INTERVALL.length - 1); s.due = plusDagar(dag, INTERVALL[s.box]); }
    else { s.box = 0; s.due = dag; }
  } else if (ratt && s.due <= dag) {
    // rättat senare samma dag: tillbaka i morgon, ingen ny låda
    s.due = plusDagar(dag, 1);
  } else if (!ratt && s.box > 0 && s.due > dag) {
    // fel senare samma dag efter ett rätt: tillbaka till repetition i morgon
    s.box = Math.max(s.box - 1, 0); s.due = plusDagar(dag, 1);
  }
  s.senast = nu; s.senast_dag = dag;
  S.status[item] = s; ko.status[item] = s;
  ko.forsok.push({ id: uuid(), ts: nu, item, laxa, ratt, kalla, lage, sekunder: Math.max(0, Math.min(600, Math.round(sekunder || 0))) });
  const rad = S.dagar.find(r => r.dag === dag && r.laxa === laxa && r.kalla === kalla);
  if (rad) { rad.antal++; rad.sekunder += Math.round(sekunder || 0); if (ratt) rad.ratt++; }
  else S.dagar.push({ dag, laxa, kalla, antal: 1, sekunder: Math.round(sekunder || 0), ratt: ratt ? 1 : 0 });
  ls.set('ko', ko); sparaCache(); planeraFlush();
}
function bocka(id, klar) { S.bockar[id] = klar; ko.bockar[id] = klar; ls.set('ko', ko); sparaCache(); planeraFlush(); }

/* ================= innehåll ================= */
const REGIONER = [
  { id: 'norden', namn: 'Norden och Baltikum' }, { id: 'vast', namn: 'Västeuropa' }, { id: 'central', namn: 'Centraleuropa' },
  { id: 'syd', namn: 'Italien, Grekland och öarna' }, { id: 'balkan', namn: 'Balkan' }, { id: 'ost', namn: 'Östeuropa och Kaukasus' },
];
const LANDALT = { 'Bosnien-Hercegovina': ['bosnien och hercegovina', 'bosnien hercegovina', 'bosnien'], 'Belarus': ['vitryssland'],
  'Vatikanstaten': ['vatikanen'], 'Nordmakedonien': ['nord-makedonien', 'makedonien'], 'Storbritannien': ['england', 'uk'], 'Tjeckien': ['tjeckiska republiken'] };
const STADALT = { 'Kiev': ['kyiv', 'kiev', 'kyjiv'], 'Köpenhamn': ['köpenhamn', 'kobenhavn'], 'Helsingfors': ['helsingfors', 'helsinki'] };
// Kartan byggs i webbläsaren från Natural Earth (world-atlas) och projiceras med d3-geo. Flaggor från flag-icons.
const CDN = 'https://cdn.jsdelivr.net/npm/';
let EUROPA = null, europaLaddas = null;
function laddaEuropa() { return EUROPA ? Promise.resolve(EUROPA) : (europaLaddas = europaLaddas || byggEuropa()); }
async function byggEuropa() {
  const [geo, topo, world] = await Promise.all([
    import(CDN + 'd3-geo@3.1.2/+esm'), import(CDN + 'topojson-client@3.1.0/+esm'),
    fetch(CDN + 'world-atlas@2.0.2/countries-50m.json').then(r => r.json())]);
  const W = 1000, H = 860;
  const features = topo.feature(world, world.objects.countries).features;
  const perNamn = {}; features.forEach(f => (perNamn[f.properties.name] = perNamn[f.properties.name] || []).push(f));
  perNamn['Cyprus'] = (perNamn['Cyprus'] || []).concat(perNamn['N. Cyprus'] || []);
  const ram = { type: 'MultiPoint', coordinates: [[-24.5, 63.5], [-10, 36], [34.5, 34.3], [50.5, 40], [58, 66], [30, 71.2], [-10, 58]] };
  const proj = geo.geoConicConformal().parallels([40, 65]).rotate([-14, 0]).fitExtent([[18, 18], [W - 18, H - 18]], ram);
  proj.clipExtent([[-500, -450], [W + 500, H + 450]]);
  const path = geo.geoPath(proj).digits(1);
  const Pr = xy => proj(xy).map(v => Math.round(v * 10) / 10);
  const quiz = new Set(EUROPA_LANDER.map(c => c.en)); quiz.add('N. Cyprus');
  const countries = EUROPA_LANDER.map(c => {
    const fs = perNamn[c.en] || []; const d = fs.map(f => path(f)).filter(Boolean).join('');
    let b = [[Infinity, Infinity], [-Infinity, -Infinity]];
    fs.forEach(f => { const q = path.bounds(f); b = [[Math.min(b[0][0], q[0][0]), Math.min(b[0][1], q[0][1])], [Math.max(b[1][0], q[1][0]), Math.max(b[1][1], q[1][1])]]; });
    b = [[Math.max(b[0][0], -20), Math.max(b[0][1], -20)], [Math.min(b[1][0], W + 20), Math.min(b[1][1], H + 20)]];
    const lab = c.microLL ? Pr(c.microLL) : c.labLL ? Pr(c.labLL) : path.centroid(fs[0]).map(Math.round);
    return { sv: c.sv, cap: c.cap, region: c.region, nr: c.nr, d, b, lab, capXY: c.capLL ? Pr(c.capLL) : null, micro: c.microLL ? Pr(c.microLL) : null,
      flag: `${CDN}flag-icons@7.6.0/flags/4x3/${c.flagga}.svg`, emo: c.emo, fact: c.fakta };
  });
  const bg = features.filter(f => !quiz.has(f.properties.name)).filter(f => { const q = path.bounds(f); return q[1][0] > -450 && q[0][0] < W + 450 && q[1][1] > -400 && q[0][1] < H + 400; }).map(f => path(f)).filter(Boolean);
  EUROPA = { W, H, countries, bg }; return EUROPA;
}

function alla() { return VECKOR.flatMap(v => v.läxor.map(l => ({ ...l, vecka: v.vecka, år: v.år }))); }
function hittaLaxa(id) { return alla().find(l => l.id === id); }

// Spår: en läxa kan ha flera (karta: länder + huvudstäder)
function spår(l) {
  if (l.typ === 'karta') return [
    { id: 'land', namn: 'Länder', huvud: true },
    { id: 'stad', namn: 'Huvudstäder (bonus)', huvud: false },
  ];
  if (l.typ === 'glosor') return [{ id: 'glosor', namn: 'Glosor', huvud: true }];
  return [];
}
function moment(l, sp) {
  if (l.typ === 'karta') {
    const C = EUROPA ? EUROPA.countries : [];
    if (sp === 'land') return C.map((c, i) => ({ id: `europa:land:${c.sv}`, typ: 'land', i, namn: c.sv, grupp: c.region, liten: c.nr <= 20 }));
    if (sp === 'stad') return C.map((c, i) => c.cap ? { id: `europa:stad:${c.sv}`, typ: 'stad', i, namn: `${c.sv} – ${c.cap}`, grupp: c.region } : null).filter(Boolean);
  }
  if (l.typ === 'glosor') return l.grupper.flatMap(g => g.ord.map(([en, sv, emo]) => ({ id: `en:${en}`, typ: 'glosa', en, sv, emo, namn: `${en} – ${sv}`, grupp: g.namn })));
  return [];
}
function grupper(l, sp) {
  if (l.typ === 'karta') return REGIONER.map(r => ({ id: r.id, namn: r.namn }));
  if (l.typ === 'glosor') return l.grupper.map(g => ({ id: g.namn, namn: g.namn }));
  return [];
}
function räkna(items) {
  const r = { kan: 0, lar: 0, ej: 0, idag: 0, n: items.length };
  items.forEach(m => { r[nivå(m.id)]++; if (behovs(m.id)) r.idag++; });
  return r;
}
function segHtml(r) { if (!r.n) return ''; return `<div class="seg"><i class="k" style="width:${r.kan / r.n * 100}%"></i><i class="l" style="width:${r.lar / r.n * 100}%"></i></div>`; }
const LEGEND = `<div class="legend"><span style="--c:var(--kan)">Kan</span><span style="--c:var(--lar)">Lär sig</span><span style="--c:var(--ej)">Inte börjat</span></div>`;

/* ================= uppläsning ================= */
const kanTala = 'speechSynthesis' in window;
let röster = [];
if (kanTala) { const ladda = () => röster = speechSynthesis.getVoices(); ladda(); speechSynthesis.onvoiceschanged = ladda; }
function röst(lang) { const v = röster.filter(v => (v.lang || '').replace('_', '-').toLowerCase().startsWith(lang)); for (const p of (lang === 'en' ? ['en-gb', 'en-us'] : ['sv-se'])) { const m = v.filter(x => x.lang.replace('_', '-').toLowerCase() === p); if (m.length) return m.find(x => x.localService) || m[0]; } return v[0] || null; }
function säg(t, lang = 'en', långsamt = false) { if (!kanTala) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = lang === 'en' ? 'en-GB' : 'sv-SE'; const v = röst(lang); if (v) u.voice = v; u.rate = långsamt ? .55 : .9; speechSynthesis.speak(u); } catch (e) { } }
const talKnappar = t => kanTala ? `<div class="speak"><button class="sp" data-say="${esc(t)}">🔊 Lyssna</button><button class="sp" data-say="${esc(t)}" data-slow="1">🐢 Långsamt</button></div>` : '';
function kopplaTal(root = $app) { root.querySelectorAll('[data-say]').forEach(b => b.onclick = e => { e.stopPropagation(); säg(b.dataset.say, 'en', !!b.dataset.slow); }); }

/* ================= karta ================= */
const NS = 'http://www.w3.org/2000/svg';
const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
class Karta {
  constructor(host, data, onTap) {
    this.D = data; this.C = data.countries; this.onTap = onTap; this.W = data.W; this.H = data.H;
    host.innerHTML = `<div class="mapwrap"><svg xmlns="${NS}"><rect class="sea" x="-3000" y="-3000" width="7000" height="7000"/><g class="bgl"></g><g class="cs"></g><g class="ms"></g><g class="caps"></g><g class="labels"></g></svg>
      <div class="zoom"><button data-z="in" aria-label="Zooma in">+</button><button data-z="out" aria-label="Zooma ut">−</button><button data-z="fit" aria-label="Visa allt">⤢</button></div></div>`;
    this.svg = host.querySelector('svg'); const g = s => this.svg.querySelector(s);
    this.gC = g('.cs'); this.gM = g('.ms'); this.gL = g('.labels'); this.gCap = g('.caps');
    data.bg.forEach(d => g('.bgl').appendChild(mk('path', { d })));
    this.els = this.C.map((c, i) => {
      const p = mk('path', { d: c.d, class: 'c', 'data-c': i }); this.gC.appendChild(p); const out = [p];
      if (c.micro) { const v = mk('circle', { cx: c.micro[0], cy: c.micro[1], r: 4, class: 'm', 'data-c': i }); const h = mk('circle', { cx: c.micro[0], cy: c.micro[1], r: 8, class: 'mh', 'data-c': i }); this.gM.appendChild(v); this.gM.appendChild(h); out.push(v); }
      return out;
    });
    this.vb = { x: 0, y: 0, w: this.W, h: this.H }; this.hem = [[0, 0], [this.W, this.H]];
    this.pek(); host.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { const r = this.rect(); if (b.dataset.z === 'fit') this.gåTill(this.hem); else this.zooma(b.dataset.z === 'in' ? 1 / 1.4 : 1.4, r.width / 2, r.height / 2); });
    this._rs = () => this.gåTill(this.hem, true); window.addEventListener('resize', this._rs);
    requestAnimationFrame(() => this.gåTill(this.hem, true));
  }
  stäng() { window.removeEventListener('resize', this._rs); }
  rect() { return this.svg.getBoundingClientRect(); }
  skala() { return this.rect().width / this.vb.w || 1; }
  sätt() {
    const v = this.vb; this.svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); const s = this.skala();
    this.gM.querySelectorAll('.m').forEach(e => e.setAttribute('r', 6 / s)); this.gM.querySelectorAll('.mh').forEach(e => e.setAttribute('r', 13 / s));
    this.gL.querySelectorAll('text').forEach(t => { t.setAttribute('font-size', 16 / s); t.setAttribute('stroke-width', 4 / s); });
    this.gCap.querySelectorAll('circle').forEach(c => c.setAttribute('r', 5 / s));
  }
  ruta(b) {
    const r = this.rect(), a = (r.width || this.W) / (r.height || this.H); let bw = b[1][0] - b[0][0], bh = b[1][1] - b[0][1];
    const pad = bw >= this.W - 1 ? 0 : Math.max(bw, bh) * .1 + 30; bw += pad * 2; bh += pad * 2; bw = Math.max(bw, 170); bh = Math.max(bh, 170);
    let w = Math.max(bw, bh * a); w = Math.min(w, this.W * 1.3); const h = w / a; const cx = (b[0][0] + b[1][0]) / 2, cy = (b[0][1] + b[1][1]) / 2; return { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  gåTill(b, direkt) {
    const to = this.ruta(b), fr = { ...this.vb }; cancelAnimationFrame(this.anim);
    if (direkt) { this.vb = to; this.sätt(); return; }
    const t0 = performance.now(); const steg = t => { const k = Math.min(1, (t - t0) / 420), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; for (const q of 'xywh') this.vb[q] = fr[q] + (to[q] - fr[q]) * e; this.sätt(); if (k < 1) this.anim = requestAnimationFrame(steg); };
    this.anim = requestAnimationFrame(steg);
  }
  union(ids) { return ids.reduce((b, i) => { const q = this.C[i].b; return [[Math.min(b[0][0], q[0][0]), Math.min(b[0][1], q[0][1])], [Math.max(b[1][0], q[1][0]), Math.max(b[1][1], q[1][1])]]; }, [[1e9, 1e9], [-1e9, -1e9]]); }
  synlig(i) { const b = this.C[i].b, v = this.vb; return b[1][0] > v.x && b[0][0] < v.x + v.w && b[1][1] > v.y && b[0][1] < v.y + v.h; }
  zooma(k, sx, sy) { const r = this.rect(), v = this.vb; k = Math.min(Math.max(k, 60 / v.w), this.W * 1.3 / v.w); const px = v.x + sx / r.width * v.w, py = v.y + sy / r.height * v.h; v.w *= k; v.h *= k; v.x = px - sx / r.width * v.w; v.y = py - sy / r.height * v.h; this.sätt(); }
  pek() {
    const svg = this.svg, P = new Map(); let g0 = null, flyttad = false, nyp = false;
    svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); P.set(e.pointerId, { x: e.clientX, y: e.clientY }); cancelAnimationFrame(this.anim);
      if (P.size === 1) { flyttad = false; nyp = false; g0 = { x: e.clientX, y: e.clientY, vb: { ...this.vb } }; }
      if (P.size === 2) { nyp = true; const [a, b] = [...P.values()]; g0 = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, vb: { ...this.vb } }; } });
    svg.addEventListener('pointermove', e => { if (!P.has(e.pointerId)) return; P.set(e.pointerId, { x: e.clientX, y: e.clientY }); const r = this.rect();
      if (P.size === 1 && !nyp) { const dx = e.clientX - g0.x, dy = e.clientY - g0.y; if (!flyttad && Math.hypot(dx, dy) < 9) return; flyttad = true; this.vb.x = g0.vb.x - dx * g0.vb.w / r.width; this.vb.y = g0.vb.y - dy * g0.vb.h / r.height; this.sätt(); }
      else if (P.size === 2) { const [a, b] = [...P.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y) || 1; const k = Math.min(Math.max(g0.d / d, 60 / g0.vb.w), this.W * 1.3 / g0.vb.w); const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const px = g0.vb.x + (g0.mx - r.left) / r.width * g0.vb.w, py = g0.vb.y + (g0.my - r.top) / r.height * g0.vb.h; this.vb.w = g0.vb.w * k; this.vb.h = g0.vb.h * k; this.vb.x = px - (mx - r.left) / r.width * this.vb.w; this.vb.y = py - (my - r.top) / r.height * this.vb.h; this.sätt(); } });
    const upp = e => { if (!P.has(e.pointerId)) return; const en = P.size === 1; P.delete(e.pointerId);
      if (en && !flyttad && !nyp && e.type === 'pointerup') { const el = document.elementFromPoint(e.clientX, e.clientY); const c = el && el.closest && el.closest('[data-c]'); if (c && this.onTap) this.onTap(+c.getAttribute('data-c')); } };
    svg.addEventListener('pointerup', upp); svg.addEventListener('pointercancel', upp);
    svg.addEventListener('wheel', e => { e.preventDefault(); const r = this.rect(); this.zooma(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  }
  kl(i, ...k) { this.els[i].forEach(e => e.setAttribute('class', (e.tagName === 'circle' ? 'm' : 'c') + (k.length ? ' ' + k.join(' ') : ''))); }
  måla(fn) { this.C.forEach((c, i) => { const k = fn(i); this.kl(i, ...(k ? k.split(' ').filter(Boolean) : [])); }); }
  etikett(i, text, fel) { const [x, y] = this.C[i].lab; const t = mk('text', { x, y: y - (this.C[i].micro ? 14 / this.skala() : 0) }); t.textContent = text; if (fel) t.setAttribute('class', 'badl'); this.gL.appendChild(t); this.sätt(); }
  stad(i, namn) { const [x, y] = this.C[i].capXY; this.gCap.appendChild(mk('circle', { cx: x, cy: y, r: 4 })); if (namn) { const t = mk('text', { x, y: y - 10 / this.skala() }); t.textContent = namn; this.gL.appendChild(t); } this.sätt(); }
  rensa() { this.gL.innerHTML = ''; this.gCap.innerHTML = ''; }
  tryck(på) { this.svg.classList.toggle('taps', på); }
}

/* ================= vyer ================= */
let karta = null;
function stängKarta() { if (karta) { karta.stäng(); karta = null; } }
function syncRad() {
  const v = ko.forsok.length;
  if (S.felNyckel) return `<p class="note warn">Länken har fel familjenyckel. Öppna appen via rätt länk.</p>`;
  if (S.online === false) return `<p class="sync">Offline. ${v ? v + ' svar sparas när nätet är tillbaka.' : ''}</p>`;
  return `<p class="sync">${v ? 'Sparar…' : 'Allt sparat.'}</p>`;
}

function vyStart() {
  stängKarta(); document.title = 'Eskils läxor';
  if (!NYCKEL) { $app.innerHTML = `<div class="page"><h1>Eskils läxor</h1><p class="note warn">Den här länken saknar familjenyckeln. Öppna appen via länken du fått.</p></div>`; return; }
  const [y, w] = isoVecka();
  const sort = [...VECKOR].sort((a, b) => (b.år - a.år) || (b.vecka - a.vecka));
  const nu = sort.find(v => v.år === y && v.vecka === w) || sort.find(v => v.år < y || (v.år === y && v.vecka <= w)) || sort[0];
  const kommande = sort.filter(v => v !== nu && (v.år > nu.år || (v.år === nu.år && v.vecka > nu.vecka))).reverse();
  const äldre = sort.filter(v => v !== nu && !kommande.includes(v));
  const vecka = (v, stor) => {
    const n = v.läxor.filter(l => S.bockar[l.id]).length;
    return `<${stor ? 'h2' : 'h3'}>Vecka ${v.vecka}</${stor ? 'h2' : 'h3'}><p class="sub">${n} av ${v.läxor.length} klara</p>` + v.läxor.map(l => kort({ ...l, vecka: v.vecka })).join('');
  };
  $app.innerHTML = `<div class="page"><h1>Eskils läxor</h1>${vecka(nu, true)}${kommande.map(v => vecka(v, true)).join('')}
    ${äldre.length ? `<details><summary class="sub" style="cursor:pointer;margin-top:20px">Tidigare veckor (${äldre.length})</summary>${äldre.map(v => vecka(v, false)).join('')}</details>` : ''}
    <button class="link" id="oversikt">Översikt: hur mycket Eskil har övat</button>${syncRad()}</div>`;
  $app.querySelectorAll('[data-open]').forEach(b => b.onclick = () => location.hash = 'l/' + b.dataset.open);
  $app.querySelectorAll('[data-chk]').forEach(b => b.onclick = () => { bocka(b.dataset.chk, !S.bockar[b.dataset.chk]); vyStart(); });
  document.getElementById('oversikt').onclick = () => location.hash = 'oversikt';
}
function kort(l) {
  const klar = !!S.bockar[l.id], öva = l.typ !== 'uppgift';
  let extra = '';
  if (öva && (l.typ !== 'karta' || EUROPA)) {
    const sp = spår(l).find(s => s.huvud), r = räkna(moment(l, sp.id));
    extra = `<small>Kan ${r.kan} av ${r.n}${r.idag ? ` · <b style="display:inline;font-size:inherit;color:#1f56a8">${r.idag} att repetera i dag</b>` : ''}</small>${segHtml(r)}`;
  }
  return `<div class="card${klar ? ' klar' : ''}"><button class="main${öva ? '' : ' static'}" ${öva ? `data-open="${l.id}"` : ''}>
    <span class="ic">${l.ikon || '📘'}</span><span class="t"><span class="amne">${esc(l.ämne)}</span><b>${esc(l.titel)}</b>
    ${l.text ? `<small>${esc(l.text)}</small>` : ''}${l.datumText ? `<span class="tag">${esc(l.datumText)}</span>` : ''}${extra}</span></button>
    <button class="chk" data-chk="${l.id}" aria-label="Markera som klar"><span class="box">${klar ? '✓' : ''}</span>${klar ? 'Klar' : 'Inte klar'}</button></div>`;
}

function vyLaxa(id) {
  stängKarta(); const l = hittaLaxa(id); if (!l || l.typ === 'uppgift') return vyStart();
  if (l.typ === 'karta' && !EUROPA) { $app.innerHTML = '<div class="page"><p class="sub">Laddar kartan…</p></div>'; return laddaEuropa().then(() => vyLaxa(id)); }
  document.title = l.titel;
  const delar = spår(l).map(sp => {
    const m = moment(l, sp.id), r = räkna(m), nya = m.filter(x => !S.status[x.id]).length;
    const dagens = r.idag + Math.min(nya, NYA_PER_PASS);
    return `<h2>${esc(sp.namn)}</h2><p class="sub">Kan ${r.kan} av ${r.n} · lär sig ${r.lar} · inte börjat ${r.ej}</p>${segHtml(r)}
      <button class="btn primary" data-play="ova" data-sp="${sp.id}" ${dagens ? '' : 'disabled'}>Dagens övning<small>${dagens ? `${r.idag} att repetera${nya ? ` och ${Math.min(nya, NYA_PER_PASS)} nya` : ''}` : 'Klart för i dag. Kom tillbaka i morgon.'}</small></button>
      <details><summary class="link">Öva en del extra</summary>${grupper(l, sp.id).map(g => { const mm = m.filter(x => x.grupp === g.id); if (!mm.length) return ''; const rr = räkna(mm);
        return `<button class="btn" data-play="extra" data-sp="${sp.id}" data-g="${esc(g.id)}">${esc(g.namn)}<span class="cnt">kan ${rr.kan}/${rr.n}</span>${segHtml(rr)}</button>`; }).join('')}
        <button class="btn" data-play="extra" data-sp="${sp.id}" data-g="*">Allt<span class="cnt">kan ${r.kan}/${r.n}</span></button></details>
      <div class="grid2"><button class="btn" data-play="forhor" data-sp="${sp.id}">📝 Förhör<small>Allt en gång, som på provet</small></button>
      <button class="btn" data-papper="${sp.id}">✏️ Papper<small>Skriv ut och rätta</small></button></div>`;
  }).join('');
  $app.innerHTML = `<div class="page"><button class="back" id="tillbaka">← Alla läxor</button><div class="amne" style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">${esc(l.ämne)} · vecka ${l.vecka}</div>
    <h1>${esc(l.titel)}</h1>${l.datumText ? `<span class="tag">${esc(l.datumText)}</span>` : ''}${LEGEND}${delar}
    ${l.typ === 'glosor' ? `<button class="btn" id="lista">📖 Ordlistan<small>Läs och lyssna på alla ord</small></button>` : ''}
    <p class="hint">Ett ord eller land räknas som <b>kan</b> när du svarat rätt på tre olika dagar. Fel gör att det kommer tillbaka.</p>${syncRad()}</div>`;
  document.getElementById('tillbaka').onclick = () => location.hash = '';
  $app.querySelectorAll('[data-play]').forEach(b => b.onclick = () => starta(l, b.dataset.sp, b.dataset.play, b.dataset.g));
  $app.querySelectorAll('[data-papper]').forEach(b => b.onclick = () => vyPapper(l, b.dataset.papper));
  const li = document.getElementById('lista'); if (li) li.onclick = () => vyOrdlista(l);
}

function vyOrdlista(l) {
  const m = moment(l, 'glosor');
  $app.innerHTML = `<div class="page"><button class="back" id="tillbaka">← ${esc(l.titel)}</button><h1>Ordlistan</h1><p class="sub">Tryck på ett ord för att höra det.</p>
    ${l.grupper.map(g => `<h3>${esc(g.namn)}</h3><table class="list">${m.filter(x => x.grupp === g.namn).map(x => `<tr data-say="${esc(x.en)}" style="cursor:pointer"><td style="width:40px;font-size:24px">${x.emo}</td><td><b>${esc(x.en)}</b></td><td style="color:var(--muted)">${esc(x.sv)}</td><td style="width:30px">${nivå(x.id) === 'kan' ? '✓' : ''}</td></tr>`).join('')}</table>`).join('')}</div>`;
  document.getElementById('tillbaka').onclick = () => vyLaxa(l.id);
  kopplaTal();
}

/* ================= övning ================= */
const NYA_PER_PASS = 8, MAX_PASS = 20;
let P = null; // aktuellt pass
function starta(l, sp, läge, grupp) {
  let m = moment(l, sp);
  if (läge === 'ova') {
    const dag = idag(); const rep = shuffle(m.filter(x => behovs(x.id, dag)));
    const nya = shuffle(m.filter(x => !S.status[x.id])).slice(0, NYA_PER_PASS);
    m = [...rep, ...nya].slice(0, MAX_PASS);
  } else if (läge === 'extra') { m = shuffle(grupp === '*' ? m : m.filter(x => x.grupp === grupp)); }
  else m = shuffle(m);
  if (!m.length) return vyLaxa(l.id);
  P = { l, sp, läge, grupp, kö: m, pos: 0, försökt: new Set(), förstRätt: 0, fel: new Set(), märk: {}, alla: m.map(x => x.id), t0: 0, försök: 0 };
  if (l.typ === 'karta') laddaEuropa().then(() => nästa()); else nästa();
}
function typAv(x) {
  const box = (S.status[x.id] || {}).box || 0, prov = P.läge === 'forhor';
  if (x.typ === 'land') return x.liten ? 'placera' : prov ? 'namnskriv' : box === 0 ? 'placera' : box === 1 ? 'namnval' : 'namnskriv';
  if (x.typ === 'stad') return prov || box >= 2 ? 'stadskriv' : 'stadval';
  if (x.typ === 'glosa') return prov || box >= 2 ? 'skriv' : box === 1 ? 'hörval' : 'seval';
}
function huvud() {
  const tot = P.kö.length, nr = Math.min(P.pos + 1, tot);
  const poäng = P.läge === 'forhor' ? ` · ${P.förstRätt} rätt` : '';
  return `<div class="row"><button class="back" id="avsluta">✕ Avsluta</button><span class="spacer"></span><span class="prog">${nr} av ${tot}${poäng}</span></div>`;
}
function nästa() {
  if (P.pos >= P.kö.length) return klart();
  const x = P.kö[P.pos]; P.x = x; P.typ = typAv(x); P.t0 = performance.now(); P.låst = false; P.försök = 0;
  const kartläge = x.typ === 'land' || x.typ === 'stad';
  if (kartläge) return frågaKarta(x);
  stängKarta(); return frågaGlosa(x);
}
function sekunder() { return Math.min(60, (performance.now() - P.t0) / 1000); }
function svar(ratt) {
  const x = P.x, först = !P.försökt.has(x.id);
  if (först || P.läge !== 'forhor') registrera(x.id, P.l.id, ratt, 'app', P.typ, sekunder());
  P.t0 = performance.now();
  if (först) { P.försökt.add(x.id); if (ratt) P.förstRätt++; P.märk[x.id] = ratt ? 'mok' : 'mbad'; }
  if (!ratt) P.fel.add(x.id);
}
function gåVidare(ratt, ms) {
  P.låst = true;
  if (!ratt && P.läge !== 'forhor') P.kö.splice(Math.min(P.pos + 3, P.kö.length), 0, P.x);
  P.pos++;
  P.timer = setTimeout(nästa, ms);
}
function avsluta() { clearTimeout(P && P.timer); const id = P.l.id; P = null; vyLaxa(id); }

/* --- kartfrågor --- */
function frågaKarta(x) {
  const D = EUROPA, C = D.countries, c = C[x.i];
  if (!karta || !document.querySelector('.play .mapwrap')) {
    $app.innerHTML = `<div class="play"><div class="top" id="top"></div><div class="stage" id="stage"></div><div class="bottom" id="bottom"></div></div>`;
    karta = new Karta(document.getElementById('stage'), D, i => tryckKarta(i));
    const ids = P.kö.map(m => m.i), kärna = [[70, 150], [880, 800]]; karta.hem = P.läge === 'extra' && P.grupp && P.grupp !== '*' ? karta.union(ids) : kärna;
  }
  karta.rensa();
  const inPass = new Set(P.kö.map(m => m.i));
  const begränsa = P.läge === 'extra' && P.grupp && P.grupp !== '*';
  karta.måla(i => [begränsa && !inPass.has(i) ? 'dim' : '', i !== x.i && P.märk[`${x.typ === 'stad' ? 'europa:stad:' : 'europa:land:'}${C[i].sv}`] || ''].join(' '));
  const top = document.getElementById('top'), bot = document.getElementById('bottom');
  const fakta = `<div class="fact"><img src="${c.flag}" alt="Flagga"><span class="e">${c.emo}</span><span>${esc(c.fact)}</span></div>`;
  if (P.typ === 'placera') {
    karta.tryck(true);
    top.innerHTML = huvud() + `<p class="ask">Var ligger</p><div class="big">${esc(c.sv)}?</div>`;
    bot.innerHTML = `${P.läge === 'forhor' ? '' : fakta}<p class="hint">Tryck på landet. Nyp för att zooma.</p><div class="fb" id="fb"></div>`;
    if (!karta.synlig(x.i) || P.läge === 'ova') karta.gåTill(karta.hem);
  } else {
    karta.tryck(false); karta.kl(x.i, 'target');
    if (x.typ === 'stad') karta.stad(x.i);
    // zooma till landet och dess grannar så att även små länder syns
    karta.gåTill(c.b[1][0] - c.b[0][0] > 250 ? karta.hem : karta.union([x.i, ...närmast(x.i, 3)]));
    const fråga = x.typ === 'stad' ? `<p class="ask">Vad heter huvudstaden i</p><div class="big">${esc(c.sv)}?</div>` : `<p class="ask">Vad heter det orange landet?</p>`;
    top.innerHTML = huvud() + fråga;
    if (P.typ === 'namnval' || P.typ === 'stadval') {
      const nära = närmast(x.i, 6, j => x.typ !== 'stad' || C[j].cap);
      const alt = shuffle([x.i, ...shuffle(nära).slice(0, 3)]);
      bot.innerHTML = `<div class="opts">${alt.map(j => `<button class="opt" data-j="${j}">${esc(x.typ === 'stad' ? C[j].cap : C[j].sv)}</button>`).join('')}</div><div class="fb" id="fb"></div>`;
      bot.querySelectorAll('.opt').forEach(b => b.onclick = () => valKarta(+b.dataset.j, b));
    } else {
      bot.innerHTML = `<form id="f"><input class="ans" id="ans" autocomplete="off" autocapitalize="sentences" autocorrect="off" spellcheck="false" placeholder="${x.typ === 'stad' ? 'Huvudstaden' : 'Landets namn'}"><button class="btn primary" style="margin-top:8px">Svara</button></form><div class="fb" id="fb"></div>`;
      const f = document.getElementById('f'), inp = document.getElementById('ans');
      f.onsubmit = e => { e.preventDefault(); if (!P.låst && inp.value.trim()) skrivKarta(inp.value); };
      setTimeout(() => inp.focus(), 60);
    }
  }
  document.getElementById('avsluta').onclick = avsluta;
}
function närmast(i, n, filt) { const C = EUROPA.countries, [x, y] = C[i].lab; return C.map((c, j) => j).filter(j => j !== i && (!filt || filt(j))).sort((a, b) => Math.hypot(C[a].lab[0] - x, C[a].lab[1] - y) - Math.hypot(C[b].lab[0] - x, C[b].lab[1] - y)).slice(0, n); }
function tryckKarta(i) {
  if (!P || P.låst || P.typ !== 'placera') return;
  const C = EUROPA.countries, x = P.x, fb = document.getElementById('fb');
  if (i === x.i) {
    svar(true); karta.rensa(); karta.kl(i, 'okf'); karta.etikett(i, C[i].sv);
    fb.className = 'fb ok'; fb.textContent = P.försök ? 'Där är det.' : 'Rätt!';
    P.låst = true; P.pos++; P.timer = setTimeout(nästa, P.försök ? 1300 : 900);
    return;
  }
  P.försök++; svar(false);
  karta.rensa(); karta.kl(i, 'badf'); karta.etikett(i, 'Det där är ' + C[i].sv, true);
  if (P.läge === 'forhor') {
    // försök igen tills rätt, efter tre fel blinkar rätt land
    fb.className = 'fb bad'; fb.textContent = P.försök >= 3 ? 'Titta efter det blinkande landet.' : 'Fel. Försök igen.';
    P.låst = true; setTimeout(() => { if (!P) return; const m = P.märk[`europa:land:${C[i].sv}`]; karta.kl(i, ...(m ? [m] : [])); if (P.försök >= 3) karta.kl(x.i, 'reveal'); P.låst = false; }, 900);
  } else {
    karta.kl(x.i, 'reveal'); karta.etikett(x.i, C[x.i].sv); if (!karta.synlig(x.i)) karta.gåTill(karta.union([x.i, i]));
    fb.className = 'fb bad'; fb.textContent = `${C[x.i].sv} är det blå landet.`;
    gåVidare(false, 2300);
  }
}
function valKarta(j, btn) {
  if (P.låst) return; const C = EUROPA.countries, x = P.x, ok = j === x.i, fb = document.getElementById('fb');
  document.querySelectorAll('.opt').forEach(b => { b.disabled = true; if (+b.dataset.j === x.i) b.classList.add('ok'); });
  svar(ok); visaSvarKarta(x);
  if (ok) { fb.className = 'fb ok'; fb.textContent = 'Rätt!'; } else { btn.classList.add('bad'); fb.className = 'fb bad'; fb.textContent = `Det är ${x.typ === 'stad' ? C[x.i].cap : C[x.i].sv}.`; }
  gåVidare(ok, ok ? 1300 : 2500);
}
function skrivKarta(v) {
  const C = EUROPA.countries, x = P.x, c = C[x.i], fb = document.getElementById('fb'), inp = document.getElementById('ans');
  const rätt = x.typ === 'stad' ? c.cap : c.sv, alt = (x.typ === 'stad' ? STADALT[c.cap] : LANDALT[c.sv]) || [];
  const acc = [norm(rätt), ...alt.map(norm)], n = norm(v);
  const exakt = acc.includes(n), nära = !exakt && acc.some(a => a.length >= 5 && lev(n, a) <= 1);
  inp.disabled = true; svar(exakt || nära); visaSvarKarta(x);
  if (exakt || nära) { inp.style.borderColor = 'var(--ok)'; fb.className = 'fb ok'; fb.textContent = exakt ? 'Rätt!' : `Rätt! Det stavas ${rätt}.`; }
  else { inp.style.borderColor = 'var(--bad)'; fb.className = 'fb bad'; fb.textContent = `Det är ${rätt}.`; }
  gåVidare(exakt || nära, exakt ? 1300 : 2600);
}
function visaSvarKarta(x) { const C = EUROPA.countries; karta.rensa(); if (x.typ === 'stad') karta.stad(x.i, C[x.i].cap); else karta.etikett(x.i, C[x.i].sv); }

/* --- glosfrågor --- */
function frågaGlosa(x) {
  $app.innerHTML = `<div class="play nomap"><div class="top" id="top"></div><div class="stage" id="stage"></div><div class="bottom" id="bottom"></div></div>`;
  const top = document.getElementById('top'), st = document.getElementById('stage'), bot = document.getElementById('bottom');
  top.innerHTML = huvud();
  if (P.typ === 'seval' || P.typ === 'hörval') {
    const alla_ = moment(P.l, 'glosor').filter(m => m.id !== x.id && m.sv !== x.sv);
    const alt = shuffle([x, ...[...shuffle(alla_.filter(m => m.grupp === x.grupp)), ...shuffle(alla_.filter(m => m.grupp !== x.grupp))].slice(0, 3)]);
    st.innerHTML = `<div class="qcard">${P.typ === 'seval' ? `<div class="emo">${x.emo}</div><div class="word">${esc(x.en)}</div><p class="ask">Vad betyder det på svenska?</p>` : `<div class="emo">👂</div><div class="word">Lyssna</div><p class="ask">Vilket ord hörde du?</p>`}${talKnappar(x.en)}</div>`;
    bot.innerHTML = `<div class="opts">${alt.map(m => `<button class="opt" data-id="${esc(m.id)}">${esc(m.sv)}</button>`).join('')}</div><div class="fb" id="fb"></div>`;
    bot.querySelectorAll('.opt').forEach(b => b.onclick = () => valGlosa(b.dataset.id, b));
    setTimeout(() => säg(x.en), 250);
  } else {
    st.innerHTML = `<div class="qcard"><div class="emo">${P.läge === 'forhor' ? '' : x.emo}</div><div class="word">${esc(x.sv)}</div><p class="ask">Skriv på engelska</p></div>`;
    bot.innerHTML = `<form id="f"><input class="ans" id="ans" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="på engelska"><button class="btn primary" style="margin-top:8px">Svara</button></form><div class="fb" id="fb"></div>`;
    const f = document.getElementById('f'), inp = document.getElementById('ans');
    f.onsubmit = e => { e.preventDefault(); if (!P.låst && inp.value.trim()) skrivGlosa(inp.value); };
    setTimeout(() => inp.focus(), 60);
  }
  kopplaTal(); document.getElementById('avsluta').onclick = avsluta;
}
function valGlosa(id, btn) {
  if (P.låst) return; const x = P.x, ok = id === x.id, fb = document.getElementById('fb');
  document.querySelectorAll('.opt').forEach(b => { b.disabled = true; if (b.dataset.id === x.id) b.classList.add('ok'); });
  svar(ok);
  if (P.typ === 'hörval') { document.querySelector('.qcard').innerHTML = `<div class="emo">${x.emo}</div><div class="word">${esc(x.en)}</div><p class="ask">${esc(x.sv)}</p>${talKnappar(x.en)}`; kopplaTal(); }
  if (ok) { fb.className = 'fb ok'; fb.textContent = 'Rätt!'; } else { btn.classList.add('bad'); fb.className = 'fb bad'; fb.textContent = `${x.en} betyder ${x.sv}.`; }
  säg(x.en); gåVidare(ok, ok ? 1400 : 2600);
}
function skrivGlosa(v) {
  const x = P.x, fb = document.getElementById('fb'), inp = document.getElementById('ans'), ok = norm(v) === norm(x.en);
  inp.disabled = true; inp.style.borderColor = ok ? 'var(--ok)' : 'var(--bad)'; svar(ok);
  if (ok) { fb.className = 'fb ok'; fb.textContent = 'Rätt stavat!'; } else { fb.className = 'fb bad'; fb.innerHTML = `Det stavas <u>${esc(x.en)}</u>`; }
  säg(x.en); gåVidare(ok, ok ? 1400 : 3000);
}

/* --- efter passet --- */
function klart() {
  stängKarta(); const l = P.l, sp = P.sp, m = moment(l, sp), r = räkna(m), unika = new Set(P.alla).size;
  const felLista = [...P.fel].map(id => m.find(x => x.id === id)).filter(Boolean);
  const rubrik = P.läge === 'forhor' ? `${P.förstRätt} av ${unika} rätt` : 'Klart för den här gången';
  $app.innerHTML = `<div class="page"><h1>${rubrik}</h1><p class="sub">${P.läge === 'forhor' ? 'Bara första försöket räknas.' : `${P.förstRätt} av ${unika} rätt på första försöket.`}</p>
    <p class="sub" style="margin-bottom:0">${esc(spår(l).find(s => s.id === sp).namn)}: kan ${r.kan} av ${r.n}${r.idag ? `, ${r.idag} kvar att repetera i dag` : ''}</p>${segHtml(r)}${LEGEND}
    ${felLista.length ? `<h3>Öva lite extra på</h3><table class="list">${felLista.map(x => `<tr><td>${esc(x.namn)}</td></tr>`).join('')}</table>` : ''}
    <button class="btn primary" id="igen">${P.läge === 'ova' && r.idag ? 'Fortsätt öva' : 'Tillbaka'}</button>${syncRad()}</div>`;
  const igen = P.läge === 'ova' && r.idag; const sparad = { l, sp, läge: P.läge, grupp: P.grupp }; P = null;
  document.getElementById('igen').onclick = () => igen ? starta(sparad.l, sparad.sp, 'ova') : vyLaxa(l.id);
  flush();
}

/* ================= papper ================= */
async function vyPapper(l, sp) {
  if (l.typ === 'karta') await laddaEuropa();
  const m = moment(l, sp);
  const P2 = {}; // id -> true/false
  const rad = x => `<tr><td>${esc(x.namn)}</td><td><div class="tri"><button data-id="${esc(x.id)}" data-v="1" class="y">✓</button><button data-id="${esc(x.id)}" data-v="0" class="n">✗</button></div></td></tr>`;
  $app.innerHTML = `<div class="page"><button class="back" id="tillbaka">← ${esc(l.titel)}</button><h1>Öva på papper</h1>
    <p class="sub">Skriv ut bladet, öva utan att titta, rätta med facit. Bocka sedan av här vad du kunde, så räknas det in.</p>
    <div class="grid2"><button class="btn" id="blad">🖨️ Skriv ut övningsblad</button><button class="btn" id="facit">🖨️ Skriv ut facit</button></div>
    <h2>Rätta</h2><p class="sub">Markera bara det du övade på. Tomma rader räknas inte.</p>
    <table class="list">${m.map(rad).join('')}</table><button class="btn primary" id="spara">Spara rättningen</button><div class="fb" id="fb"></div></div>`;
  document.getElementById('tillbaka').onclick = () => vyLaxa(l.id);
  document.getElementById('blad').onclick = () => skrivUt(l, sp, false);
  document.getElementById('facit').onclick = () => skrivUt(l, sp, true);
  $app.querySelectorAll('.tri button').forEach(b => b.onclick = () => {
    const id = b.dataset.id, v = b.dataset.v === '1'; P2[id] = P2[id] === v ? undefined : v;
    b.parentElement.querySelectorAll('button').forEach(o => o.classList.toggle('on', P2[id] === (o.dataset.v === '1')));
  });
  document.getElementById('spara').onclick = () => {
    const val = Object.entries(P2).filter(([, v]) => v !== undefined); if (!val.length) return;
    val.forEach(([id, v]) => registrera(id, l.id, v, 'papper', 'papper', 0));
    flush(); const fb = document.getElementById('fb'); fb.className = 'fb ok'; fb.textContent = `Sparat: ${val.filter(([, v]) => v).length} rätt, ${val.filter(([, v]) => !v).length} fel.`;
    setTimeout(() => vyLaxa(l.id), 1400);
  };
}
function skrivUt(l, sp, facit) {
  const pr = document.getElementById('print'); let html = '';
  const namnrad = `<div class="name">Namn: ______________________ &nbsp; Datum: ____________</div>`;
  if (l.typ === 'karta') {
    const D = EUROPA, C = D.countries;
    const etiketter = C.map(c => { const [x, y] = c.micro || c.lab; return (sp === 'stad' && !c.cap) ? '' : `<text x="${x}" y="${y + 6}" font-size="${c.micro ? 13 : 16}">${facit ? esc(sp === 'stad' ? c.cap : c.sv) : c.nr}</text>`; }).join('');
    const svg = `<svg class="ptext" viewBox="0 0 ${D.W} ${D.H}" xmlns="${NS}">${D.bg.map(d => `<path class="bgp" d="${d}"/>`).join('')}${C.map(c => `<path d="${c.d}"/>`).join('')}${C.filter(c => c.micro).map(c => `<circle cx="${c.micro[0]}" cy="${c.micro[1]}" r="5" fill="#fff" stroke="#555"/>`).join('')}${etiketter}</svg>`;
    const lista = C.filter(c => sp !== 'stad' || c.cap).sort((a, b) => a.nr - b.nr).map(c => `<div>${c.nr}. ${facit ? esc(sp === 'stad' ? `${c.sv}: ${c.cap}` : c.sv) : sp === 'stad' ? `${esc(c.sv)}: ` : ''}</div>`).join('');
    html = `<div class="sheet"><h1>${esc(l.titel)}${sp === 'stad' ? ': huvudstäder' : ''}${facit ? ' (facit)' : ''}</h1>${facit ? '' : namnrad}${svg}</div>
      <div class="sheet"><h1>${sp === 'stad' ? 'Skriv huvudstaden' : 'Skriv landets namn vid siffran'}${facit ? ' (facit)' : ''}</h1><div class="lines">${lista}</div></div>`;
  } else if (l.typ === 'glosor') {
    const m = moment(l, 'glosor');
    html = `<div class="sheet"><h1>${esc(l.titel)}${facit ? ' (facit)' : ''}</h1>${facit ? '' : namnrad}<table class="gtab">${m.map(x => `<tr><td>${esc(x.sv)}</td><td>${facit ? esc(x.en) : ''}</td></tr>`).join('')}</table></div>`;
  }
  pr.innerHTML = html; setTimeout(() => window.print(), 50);
}

/* ================= översikt ================= */
async function vyOversikt() {
  stängKarta(); document.title = 'Översikt';
  if (alla().some(l => l.typ === 'karta')) await laddaEuropa();
  const dag = idag(); const dagar = []; for (let i = 13; i >= 0; i--) dagar.push(plusDagar(dag, -i));
  const per = d => { const r = S.dagar.filter(x => x.dag === d); return { app: r.filter(x => x.kalla === 'app').reduce((s, x) => s + x.antal, 0), min: Math.round(r.reduce((s, x) => s + x.sekunder, 0) / 60), papper: r.filter(x => x.kalla === 'papper').reduce((s, x) => s + x.antal, 0) }; };
  const rader = dagar.map(d => ({ d, ...per(d) }));
  const maxA = Math.max(1, ...rader.map(r => r.app + r.papper));
  const läxor = alla().filter(l => l.typ !== 'uppgift').sort((a, b) => (b.år - a.år) || (b.vecka - a.vecka)).slice(0, 6);
  const svåra = läxor.flatMap(l => spår(l).flatMap(sp => moment(l, sp.id))).map(x => ({ x, s: S.status[x.id] })).filter(o => o.s && o.s.fel > 0)
    .sort((a, b) => (b.s.fel - b.s.ratt / 2) - (a.s.fel - a.s.ratt / 2)).slice(0, 10);
  $app.innerHTML = `<div class="page"><button class="back" id="tillbaka">← Alla läxor</button><h1>Översikt</h1>
    <p class="sub">Senaste två veckorna. Minuter räknas från tiden per svar, högst en minut per svar.</p>
    <table class="list"><tr><th>Dag</th><th>Svar i appen</th><th>Min</th><th>På papper</th></tr>${rader.reverse().map(r => `<tr><td>${veckodag(r.d)}</td><td><div style="display:flex;align-items:center;gap:6px"><span style="display:inline-block;height:8px;border-radius:4px;background:var(--accent);width:${(r.app / maxA) * 100}px"></span>${r.app || ''}</div></td><td>${r.min || ''}</td><td>${r.papper || ''}</td></tr>`).join('')}</table>
    <h2>Läget per läxa</h2>${LEGEND}${läxor.map(l => spår(l).map(sp => { const r = räkna(moment(l, sp.id)); return `<p style="margin:12px 0 0"><b>${esc(l.titel)}</b>${spår(l).length > 1 ? `, ${esc(sp.namn.toLowerCase())}` : ''} <span class="sub">v. ${l.vecka}</span><br><span class="sub">Kan ${r.kan} · lär sig ${r.lar} · inte börjat ${r.ej}${r.idag ? ` · ${r.idag} att repetera i dag` : ''}</span></p>${segHtml(r)}`; }).join('')).join('')}
    ${svåra.length ? `<h2>Svårast just nu</h2><table class="list"><tr><th>Ord eller land</th><th>Rätt</th><th>Fel</th></tr>${svåra.map(o => `<tr><td>${esc(o.x.namn)}</td><td>${o.s.ratt}</td><td>${o.s.fel}</td></tr>`).join('')}</table>` : ''}
    ${syncRad()}</div>`;
  document.getElementById('tillbaka').onclick = () => location.hash = '';
}

/* ================= start ================= */
function route() {
  if (P) { clearTimeout(P.timer); P = null; }
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('l/')) return vyLaxa(h.slice(2));
  if (h === 'oversikt') return vyOversikt();
  vyStart();
}
window.addEventListener('hashchange', route);
(async function () {
  route();
  if (!NYCKEL) return;
  await Promise.all([hamta(), alla().some(l => l.typ === 'karta') ? laddaEuropa() : null]);
  if (ko.forsok.length || Object.keys(ko.status).length || Object.keys(ko.bockar).length) { await flush(); await hamta(); }
  if (!P) route();
})();
