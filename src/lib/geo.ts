import type { LineString, MultiLineString, Position } from 'geojson';

const EARTH_RADIUS_M = 6_371_008.8;

/** Great-circle distance in metres between two [lng, lat] positions. */
export function haversine(a: Position, b: Position): number {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLng = (b[0] - a[0]) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function lineLengthM(geometry: LineString | MultiLineString): number {
  const parts = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  let total = 0;
  for (const part of parts) for (let i = 1; i < part.length; i++) total += haversine(part[i - 1], part[i]);
  return total;
}

/** Distance in metres from point p to segment ab (equirectangular approximation, fine at city scale). */
export function pointToSegmentM(p: Position, a: Position, b: Position): { distance: number; point: Position } {
  const kx = Math.cos((p[1] * Math.PI) / 180);
  const ax = (a[0] - p[0]) * kx, ay = a[1] - p[1];
  const bx = (b[0] - p[0]) * kx, by = b[1] - p[1];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const point: Position = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { distance: haversine(p, point), point };
}

export function bboxOf(positions: Position[]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of positions) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}
