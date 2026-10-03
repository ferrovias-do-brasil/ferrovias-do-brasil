import type { ExpressionSpecification, FilterSpecification, LineLayerSpecification } from 'maplibre-gl';
import type { SegmentStatus } from '../../lib/schemas';
import type { Theme } from '../../lib/theme';

export const BASEMAP: Record<Theme, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
export const FONT = ['Noto Sans Regular'];

export const STATUS_LABEL: Record<SegmentStatus, string> = {
  construction: 'Em construção',
  open: 'Em operação',
  freight_only: 'Só carga',
  closed: 'Desativado',
  removed: 'Trilhos retirados',
  flooded: 'Submerso',
};

export const CONFIDENCE_LABEL = { high: 'alta', medium: 'média', low: 'baixa' } as const;

export const METHOD_LABEL = {
  'osm-current': 'via atual no OpenStreetMap',
  'osm-old': 'leito antigo mapeado no OpenStreetMap',
  waypoints: 'esquemático (linha reta entre pontos conhecidos)',
  manual: 'desenhado à mão',
} as const;

type LineLayer = Omit<LineLayerSpecification, 'id' | 'source'>;

/** Map colours per theme. Keep segment colours in sync with --seg-* in global.css. */
export const PALETTE = {
  light: {
    closed: '#8a8a8a',
    removed: '#a8a8a8',
    flooded: '#1d63b5',
    casing: '#ffffff',
    stationFill: '#ffffff',
    stationStroke: '#3a2a20',
    stationEnded: '#b9b1aa',
    label: '#2b211b',
    halo: '#ffffff',
    ctxActive: '#5a4a9c',
    ctxDisused: '#8577bd',
    ctxOld: '#9d93c9',
    ctxTies: '#ffffff',
  },
  dark: {
    closed: '#9c9c9c',
    removed: '#7c7c7c',
    flooded: '#5aa0f0',
    casing: '#0c0c0c',
    stationFill: '#1c1815',
    stationStroke: '#efe7dd',
    stationEnded: '#5a524c',
    label: '#efe7dd',
    halo: '#0c0c0c',
    ctxActive: '#b3a3ff',
    ctxDisused: '#8f82d6',
    ctxOld: '#7a70b3',
    ctxTies: '#0c0c0c',
  },
} satisfies Record<Theme, Record<string, string>>;

export const COLORS = {
  added: '#1a9850',
  removedCompare: '#d73027',
  unchanged: '#9a9a9a',
  highlight: '#f2b705',
};

/** What the legend can switch on and off. */
/** Fixed layer keys, plus `line-<network>` to hide one researched line. */
export type LegendKey = 'open' | 'freight_only' | 'approx' | 'closed' | 'removed' | 'flooded' | 'stations' | 'ctx_a' | 'ctx_d' | 'ctx_o' | `line-${string}`;

export const isLegendKey = (k: string): k is LegendKey => (LEGEND_KEYS as string[]).includes(k) || /^line-[a-z0-9-]+$/.test(k);

/** Legend entries, drawn with the same colours and dash patterns as the map layers. */
type LegendItem = { key: LegendKey; label: string; color: string; width: number; dash?: string; opacity?: number };

export const LEGEND: LegendItem[] = [
  { key: 'open', label: 'Em operação', color: 'var(--ink)', width: 4 },
  { key: 'freight_only', label: 'Só carga (sem passageiros)', color: 'var(--ink)', width: 2.5 },
  { key: 'approx', label: 'Traçado aproximado', color: 'var(--ink)', width: 3, dash: '4.5 3.6' },
  { key: 'closed', label: 'Desativado (sem trens)', color: 'var(--seg-closed)', width: 2.2, dash: '4.4 4.4' },
  { key: 'removed', label: 'Trilhos retirados', color: 'var(--seg-removed)', width: 1.5, dash: '1.5 3', opacity: 0.8 },
  { key: 'flooded', label: 'Submerso por represa', color: 'var(--seg-flooded)', width: 3, dash: '3 3.6' },
];

/** Context layer (railways without researched history yet). */
export const CONTEXT_LEGEND: (LegendItem & { ties?: boolean })[] = [
  { key: 'ctx_a', label: 'em uso hoje', color: 'var(--ctx-active)', width: 3, ties: true },
  { key: 'ctx_d', label: 'desativada hoje', color: 'var(--ctx-disused)', width: 2, dash: '5 3' },
  { key: 'ctx_o', label: 'leito antigo (sem trilhos)', color: 'var(--ctx-old)', width: 2, dash: '1.5 2.5' },
];

export const LEGEND_KEYS: LegendKey[] = [...LEGEND.map((l) => l.key), 'stations', ...CONTEXT_LEGEND.map((l) => l.key)];

/** Width that grows with zoom: thin over the whole state, bolder in close-ups. */
const byZoom = (z5: number, z12: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 5, z5, 12, z12];

/** Context layers, drawn below the researched lines, in their own hue so they never read as roads. */
export function malhaLayers(theme: Theme): { id: string; key: LegendKey; layer: LineLayer }[] {
  const c = PALETTE[theme];
  return [
    {
      id: 'malha-o',
      key: 'ctx_o',
      layer: {
        type: 'line',
        filter: ['==', ['get', 'k'], 'o'],
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': c.ctxOld, 'line-width': byZoom(1.3, 2.6), 'line-dasharray': [0.6, 2] },
      },
    },
    {
      id: 'malha-d',
      key: 'ctx_d',
      layer: {
        type: 'line',
        filter: ['==', ['get', 'k'], 'd'],
        paint: { 'line-color': c.ctxDisused, 'line-width': byZoom(1.3, 2.8), 'line-dasharray': [3, 2] },
      },
    },
    {
      id: 'malha-a',
      key: 'ctx_a',
      layer: {
        type: 'line',
        filter: ['==', ['get', 'k'], 'a'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': c.ctxActive, 'line-width': byZoom(1.6, 5) },
      },
    },
    {
      // Classic railway symbol: light "sleepers" inside the line, once there is room for them.
      id: 'malha-a-ties',
      key: 'ctx_a',
      layer: {
        type: 'line',
        minzoom: 8.5,
        filter: ['==', ['get', 'k'], 'a'],
        paint: { 'line-color': c.ctxTies, 'line-width': byZoom(0.6, 2.6), 'line-dasharray': [0.5, 3] },
      },
    },
  ];
}
export const MALHA_LAYER_IDS = ['malha-o', 'malha-d', 'malha-a', 'malha-a-ties'];

/**
 * Tone down the basemap so railways stand out: roads fade, the basemap's own railways are hidden
 * (we draw our own), road labels and shields soften.
 */
export function dimBasemap(map: { getStyle(): { layers?: { id: string; type: string; 'source-layer'?: string }[] }; setLayoutProperty(id: string, k: string, v: unknown): void; setPaintProperty(id: string, k: string, v: unknown): void }, theme: Theme) {
  for (const l of map.getStyle().layers ?? []) {
    const sl = l['source-layer'];
    if (sl === 'transportation' && l.type === 'line') {
      if (l.id.startsWith('railway')) map.setLayoutProperty(l.id, 'visibility', 'none');
      else map.setPaintProperty(l.id, 'line-opacity', theme === 'dark' ? 0.32 : 0.4);
    } else if (sl === 'transportation_name' && l.type === 'symbol') {
      map.setPaintProperty(l.id, 'text-opacity', 0.55);
      map.setPaintProperty(l.id, 'icon-opacity', 0.45);
    }
  }
}

/** Feature active at decimal year t. */
export function activeAt(t: number): ExpressionSpecification {
  return ['all', ['<=', ['get', 'start'], t], ['>', ['get', 'end'], t]];
}

const status = (...s: SegmentStatus[]): ExpressionSpecification => ['in', ['get', 'status'], ['literal', s]];
const lowConfidence: ExpressionSpecification = ['==', ['get', 'confidence'], 'low'];
const lineColor = (theme: Theme): ExpressionSpecification => ['get', theme === 'dark' ? 'color_dark' : 'color'];

/** Segment layers, bottom to top. Each gets `activeAt(t)` and-ed onto its base filter. */
export function segmentLayers(theme: Theme): { id: string; base: ExpressionSpecification; layer: LineLayer }[] {
  const c = PALETTE[theme];
  return [
    {
      id: 'seg-removed',
      base: status('removed'),
      layer: { type: 'line', paint: { 'line-color': c.removed, 'line-width': 1.5, 'line-opacity': theme === 'dark' ? 0.8 : 0.55, 'line-dasharray': [1, 2] } },
    },
    {
      id: 'seg-flooded',
      base: status('flooded'),
      layer: { type: 'line', paint: { 'line-color': c.flooded, 'line-width': 3, 'line-opacity': 0.95, 'line-dasharray': [1, 1.2] } },
    },
    {
      id: 'seg-closed',
      base: status('closed'),
      layer: { type: 'line', paint: { 'line-color': c.closed, 'line-width': 2.2, 'line-dasharray': [2, 2] } },
    },
    {
      id: 'seg-construction',
      base: status('construction'),
      layer: { type: 'line', paint: { 'line-color': lineColor(theme), 'line-width': 2.5, 'line-dasharray': [3, 2] } },
    },
    {
      id: 'seg-casing',
      base: ['all', status('open', 'freight_only'), ['!', lowConfidence]],
      layer: {
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.casing, 'line-width': ['match', ['get', 'status'], 'open', 7, 5], 'line-opacity': 0.9 },
      },
    },
    {
      id: 'seg-operating',
      base: ['all', status('open', 'freight_only'), ['!', lowConfidence]],
      layer: {
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': lineColor(theme),
          'line-width': ['match', ['get', 'status'], 'open', 4, 2.5],
          'line-opacity': ['match', ['get', 'confidence'], 'medium', 0.85, 1],
        },
      },
    },
    {
      id: 'seg-operating-schematic',
      base: ['all', status('open', 'freight_only'), lowConfidence],
      layer: {
        type: 'line',
        paint: { 'line-color': lineColor(theme), 'line-width': 3, 'line-dasharray': [1.5, 1.2], 'line-opacity': 0.9 },
      },
    },
  ];
}

export const SEGMENT_LAYERS = segmentLayers('light');

export const SEGMENT_LAYER_IDS = SEGMENT_LAYERS.map((l) => l.id).filter((id) => id !== 'seg-casing');

/** Statuses switched off in the legend are filtered out of every segment layer. */
export function segmentFilter(base: ExpressionSpecification, t: number, hidden: ReadonlySet<LegendKey>): FilterSpecification {
  const statuses: SegmentStatus[] = ['construction', 'open', 'freight_only', 'closed', 'removed', 'flooded'];
  const shown = statuses.filter((st) => !hidden.has(st as LegendKey));
  return ['all', base, activeAt(t), ['in', ['get', 'status'], ['literal', shown]], lineVisible(hidden)];
}

/** Hides features of researched lines switched off in the legend (by their `line` property). */
export function lineVisible(hidden: ReadonlySet<LegendKey>): ExpressionSpecification {
  const off = [...hidden].filter((k) => k.startsWith('line-')).map((k) => k.slice(5));
  return ['!', ['in', ['get', 'line'], ['literal', off]]];
}

/** Layers that disappear entirely when a legend entry is off. */
export const LAYER_TOGGLE: Record<string, LegendKey> = { 'seg-operating-schematic': 'approx' };
