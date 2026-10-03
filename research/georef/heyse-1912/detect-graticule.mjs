// Detects the intersections of the map's meridians and parallels (graticule.json).
// Research tool, run once: npm i --no-save jpeg-js && node research/georef/heyse-1912/detect-graticule.mjs graticule.json
// Longitudes on this map are counted west of Rio de Janeiro (0° = 43°10'10" W of Greenwich).
// Graticule intersections on Heyse 1912 (IIIF). Colour-filtered line detection + smooth-model outlier rejection.
import jpeg from 'jpeg-js';
import { writeFileSync } from 'node:fs';
const I = 'https://iiif-cloud.princeton.edu/iiif/2/8e%2F36%2Fd2%2F8e36d24107a84af3aed599e61f7c53b3%2Fintermediate_file';
const HALF = 110;
const cache = new Map();
async function crop(x, y) {
  x = Math.round(x - HALF); y = Math.round(y - HALF);
  const url = `${I}/${x},${y},${2 * HALF},${2 * HALF}/full/0/default.jpg`;
  if (cache.has(url)) return { img: cache.get(url), x0: x, y0: y };
  for (let i = 0; i < 4; i++) { try { const r = await fetch(url); if (r.ok) { const img = jpeg.decode(Buffer.from(await r.arrayBuffer()), { useTArray: true }); cache.set(url, img); return { img, x0: x, y0: y }; } } catch {} await new Promise(r => setTimeout(r, 2000)); }
  throw new Error('fetch failed');
}
// darkness of neutral (non-blue, non-red) pixels
function field(img) { const { width: w, height: h, data } = img; const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { const r = data[4*i], g = data[4*i+1], b = data[4*i+2]; const lum = 0.3*r + 0.59*g + 0.11*b;
    const blue = b - r, red = r - g; let v = 255 - lum; if (blue > 0) v *= Math.max(0, 1 - blue / 25); if (red > 70) v *= 0.3; d[i] = v; }
  return { w, h, d }; }
function line({ w, h, d }, axis, prior, win) {
  const n = axis === 'v' ? w : h, m = axis === 'v' ? h : w; const at = (p, t) => axis === 'v' ? d[t * w + p] : d[p * w + t];
  const prof = new Float32Array(n); for (let p = 0; p < n; p++) { let s = 0; for (let t = 0; t < m; t++) s += at(p, t); prof[p] = s / m; }
  const med = [...prof].sort((a, b) => a - b)[n >> 1];
  let p0 = -1, best = -1; for (let p = Math.max(2, Math.round(prior - win)); p <= Math.min(n - 3, Math.round(prior + win)); p++) { const v = prof[p] - med; if (v > best) { best = v; p0 = p; } }
  let pts = []; for (let t = 0; t < m; t++) { let bp = p0, bv = -1; for (let q = Math.max(0, p0 - 6); q <= Math.min(n - 1, p0 + 6); q++) { const v = at(q, t); if (v > bv) { bv = v; bp = q; } } pts.push([t, bp]); }
  let a = p0, b = 0;
  for (let it = 0; it < 5; it++) { const N = pts.length; const st = pts.reduce((s, q) => s + q[0], 0), sp = pts.reduce((s, q) => s + q[1], 0), stt = pts.reduce((s, q) => s + q[0]*q[0], 0), stp = pts.reduce((s, q) => s + q[0]*q[1], 0);
    b = (N*stp - st*sp) / (N*stt - st*st); a = (sp - b*st) / N; const res = pts.map(q => Math.abs(q[1] - (a + b*q[0]))); pts = pts.filter((q, i) => res[i] <= 2.5); }
  return { a, b, contrast: best, inliers: pts.length / m };
}
async function detect(px, py, win) {
  const { img, x0, y0 } = await crop(px, py); const f = field(img);
  const v = line(f, 'v', px - x0, win), hz = line(f, 'h', py - y0, win);
  const y = (hz.a + hz.b * v.a) / (1 - hz.b * v.b), x = v.a + v.b * y;
  return { x: x0 + x, y: y0 + y, q: Math.min(v.inliers, hz.inliers), c: Math.min(v.contrast, hz.contrast) };
}
// quadratic surface fit z = f(l, lat)
function fit(pts, key) { const rows = pts.map(p => [1, p.l, p.lat, p.l*p.l, p.l*p.lat, p.lat*p.lat]); const k = 6; const A = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  pts.forEach((p, i) => { for (let r = 0; r < k; r++) { for (let c = 0; c < k; c++) A[r][c] += rows[i][r]*rows[i][c]; A[r][k] += rows[i][r]*p[key]; } });
  for (let c = 0; c < k; c++) { let piv = c; for (let r = c+1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r; [A[c], A[piv]] = [A[piv], A[c]]; for (let r = 0; r < k; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let cc = c; cc <= k; cc++) A[r][cc] -= f * A[c][cc]; } }
  const co = A.map((r, i) => r[k] / r[i]); return (l, lat) => co[0] + co[1]*l + co[2]*lat + co[3]*l*l + co[4]*l*lat + co[5]*lat*lat; }

const lons = [11, 10, 9, 8, 7, 6, 5, 4, 3], lats = [20, 21, 22, 23, 24, 25];
// pass 1: rough priors (x from top-border ticks, y from manual readings 1498 / 2369 / 3240)
let pts = [];
for (const lat of lats) for (const l of lons) {
  const px = 1189 + (10 - l) * 815, py = 2369 + (lat - 22) * 871;
  try { const r = await detect(px, py, 45); pts.push({ l, lat, ...r }); } catch (e) { }
}
// iterate: fit smooth model on good points, re-detect everything with tight window around the model
for (let round = 0; round < 3; round++) {
  let good = pts.filter(p => p.q > 0.5);
  for (let k = 0; k < 3; k++) { const fx = fit(good, 'x'), fy = fit(good, 'y'); good = good.filter(p => Math.hypot(p.x - fx(p.l, p.lat), p.y - fy(p.l, p.lat)) < (k < 2 ? 25 : 8)); }
  const fx = fit(good, 'x'), fy = fit(good, 'y');
  const next = [];
  for (const p of pts) { try { const r = await detect(fx(p.l, p.lat), fy(p.l, p.lat), 10); next.push({ l: p.l, lat: p.lat, ...r, res: Math.hypot(r.x - fx(p.l, p.lat), r.y - fy(p.l, p.lat)) }); } catch {} }
  pts = next;
  console.log(`round ${round}: ${good.length} good points used for model`);
}
const final = pts.filter(p => p.q > 0.6 && p.res < 6);
for (const p of pts) console.log(`lonRio ${p.l} lat -${p.lat}: x ${p.x.toFixed(1)} y ${p.y.toFixed(1)} q ${p.q.toFixed(2)} res ${p.res.toFixed(1)} ${final.includes(p) ? '' : 'REJECTED'}`);
writeFileSync(process.argv[2], JSON.stringify(final.map(p => ({ lonRio: p.l, lat: -p.lat, lon: -(43 + 10/60 + 10/3600 + p.l), x: +p.x.toFixed(1), y: +p.y.toFixed(1), q: +p.q.toFixed(2), res: +p.res.toFixed(1) })), null, 1));
console.log('kept', final.length, 'of', pts.length);
