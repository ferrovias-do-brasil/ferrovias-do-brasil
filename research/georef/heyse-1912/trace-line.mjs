// Traces the railway line by colour between station waypoints (traces/*.json, pixel coordinates).
// Research tool, run once: npm i --no-save jpeg-js && node research/georef/heyse-1912/trace-line.mjs stations.json legs.json debug.html
// Trace a coloured railway line on a IIIF map between waypoints (min-cost path over "line-coloured" pixels).
import jpeg from 'jpeg-js';
import { writeFileSync, readFileSync } from 'node:fs';
const I = 'https://iiif-cloud.princeton.edu/iiif/2/8e%2F36%2Fd2%2F8e36d24107a84af3aed599e61f7c53b3%2Fintermediate_file';
const [X0, Y0, W, H] = [2380, 1080, 1140, 760];
async function region() {
  const tiles = []; const T = 512;
  const img = { w: W, h: H, d: new Uint8Array(W * H * 3) };
  for (let ty = 0; ty < H; ty += T) for (let tx = 0; tx < W; tx += T) {
    const w = Math.min(T, W - tx), h = Math.min(T, H - ty);
    const url = `${I}/${X0 + tx},${Y0 + ty},${w},${h}/full/0/default.jpg`;
    let buf; for (let i = 0; i < 4 && !buf; i++) { try { const r = await fetch(url); if (r.ok) buf = Buffer.from(await r.arrayBuffer()); } catch {} if (!buf) await new Promise(r => setTimeout(r, 2000)); }
    const t = jpeg.decode(buf, { useTArray: true });
    for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) { const s = 4 * (y * t.width + x), o = 3 * ((ty + y) * W + tx + x); img.d[o] = t.data[s]; img.d[o + 1] = t.data[s + 1]; img.d[o + 2] = t.data[s + 2]; }
  }
  return img;
}
const img = await region();
// line colour: dark olive green. score how "line-like" a pixel is.
const cost = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) { const r = img.d[3*i], g = img.d[3*i+1], b = img.d[3*i+2];
  const dark = (r + g + b) / 3 < 130; const olive = g >= r - 8 && g >= b + 2 && b < 110; const blue = b > r + 15;
  cost[i] = dark && olive && !blue ? 1 : (dark && !blue ? 6 : 40); }
function path(a, b) { // Dijkstra on 8-neighbour grid within bbox margin
  const [ax, ay] = [Math.round(a[0] - X0), Math.round(a[1] - Y0)], [bx, by] = [Math.round(b[0] - X0), Math.round(b[1] - Y0)];
  const m = 60, x0 = Math.max(0, Math.min(ax, bx) - m), x1 = Math.min(W - 1, Math.max(ax, bx) + m), y0 = Math.max(0, Math.min(ay, by) - m), y1 = Math.min(H - 1, Math.max(ay, by) + m);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1; const dist = new Float64Array(bw * bh).fill(Infinity), prev = new Int32Array(bw * bh).fill(-1);
  const heap = []; const push = (i, d) => { heap.push([i, d]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][1] <= heap[k][1]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2*k+1, r = l+1; let s = k; if (l < heap.length && heap[l][1] < heap[s][1]) s = l; if (r < heap.length && heap[r][1] < heap[s][1]) s = r; if (s === k) break; [heap[s], heap[k]] = [heap[k], heap[s]]; k = s; } } return top; };
  const idx = (x, y) => (y - y0) * bw + (x - x0); const s = idx(ax, ay), t = idx(bx, by); dist[s] = 0; push(s, 0);
  while (heap.length) { const [i, d] = pop(); if (i === t) break; if (d > dist[i]) continue; const x = x0 + (i % bw), y = y0 + Math.floor(i / bw);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) { const nx = x + dx, ny = y + dy; if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue; const j = idx(nx, ny); const nd = d + cost[ny * W + nx] * (dx && dy ? 1.414 : 1); if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push(j, nd); } } }
  const out = []; for (let i = t; i !== -1; i = prev[i]) out.push([x0 + (i % bw) + X0, y0 + Math.floor(i / bw) + Y0]); return out.reverse(); }
// simplify (Ramer–Douglas–Peucker, tolerance px)
function rdp(pts, eps) { if (pts.length < 3) return pts; const [a, b] = [pts[0], pts.at(-1)]; let md = 0, mi = 0; for (let i = 1; i < pts.length - 1; i++) { const p = pts[i]; const d = Math.abs((b[1]-a[1])*p[0] - (b[0]-a[0])*p[1] + b[0]*a[1] - b[1]*a[0]) / Math.hypot(b[1]-a[1], b[0]-a[0]); if (d > md) { md = d; mi = i; } } return md > eps ? [...rdp(pts.slice(0, mi + 1), eps).slice(0, -1), ...rdp(pts.slice(mi), eps)] : [a, b]; }
const stations = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const legs = {};
for (let i = 1; i < stations.length; i++) { const a = stations[i - 1], b = stations[i]; const p = rdp(path([a.x, a.y], [b.x, b.y]), 1.5); legs[`${a.id}->${b.id}`] = p; console.log(`${a.id} -> ${b.id}: ${p.length} pts`); }
writeFileSync(process.argv[3], JSON.stringify(legs));
// debug overlay page
const svg = Object.values(legs).map(p => `<polyline points="${p.map(([x, y]) => `${x - X0},${y - Y0}`).join(' ')}" fill="none" stroke="magenta" stroke-width="2.5" opacity="0.85"/>`).join('') + stations.map(s => `<circle cx="${s.x - X0}" cy="${s.y - Y0}" r="6" fill="none" stroke="red" stroke-width="2"/>`).join('');
writeFileSync(process.argv[4], `<html><body style="margin:0"><div style="position:relative;width:${W}px;height:${H}px"><img src="${I}/${X0},${Y0},${W},${H}/full/0/default.jpg" style="position:absolute;left:0;top:0"/><svg width="${W}" height="${H}" style="position:absolute;left:0;top:0">${svg}</svg></div></body></html>`);
