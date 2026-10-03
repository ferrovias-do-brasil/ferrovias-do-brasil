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
    ctxActive: '#7d736b',
    ctxDisused: '#978e86',
    ctxOld: '#ada59e',
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
    ctxActive: '#9d948c',
    ctxDisused: '#857c75',
    ctxOld: '#6c645e',
  },
} satisfies Record<Theme, Record<string, string>>;

export const COLORS = {
  added: '#1a9850',
  removedCompare: '#d73027',
  unchanged: '#9a9a9a',
  highlight: '#f2b705',
};

/** What the legend can switch on and off. */
export type LegendKey = 'open' | 'freight_only' | 'approx' | 'closed' | 'removed' | 'flooded' | 'stations' | 'ctx_a' | 'ctx_d' | 'ctx_o';

/** Legend entries, drawn with the same colours and dash patterns as the map layers. */
export const LEGEND: { key: LegendKey; label: string; color: string; width: number; dash?: string; opacity?: number }[] = [
  { key: 'open', label: 'Em operação', color: 'var(--line-nob)', width: 4 },
  { key: 'freight_only', label: 'Só carga (sem passageiros)', color: 'var(--line-nob)', width: 2.5 },
  { key: 'approx', label: 'Traçado aproximado', color: 'var(--line-nob)', width: 3, dash: '4.5 3.6' },
  { key: 'closed', label: 'Desativado (sem trens)', color: 'var(--seg-closed)', width: 2.2, dash: '4.4 4.4' },
  { key: 'removed', label: 'Trilhos retirados', color: 'var(--seg-removed)', width: 1.5, dash: '1.5 3', opacity: 0.8 },
  { key: 'flooded', label: 'Submerso por represa', color: 'var(--seg-flooded)', width: 3, dash: '3 3.6' },
];

/** Context layer (railways without researched history yet). */
export const CONTEXT_LEGEND: typeof LEGEND = [
  { key: 'ctx_a', label: 'em uso hoje', color: 'var(--ctx-active)', width: 1.8 },
  { key: 'ctx_d', label: 'desativada hoje', color: 'var(--ctx-disused)', width: 1.5, dash: '4 3' },
  { key: 'ctx_o', label: 'leito antigo (sem trilhos)', color: 'var(--ctx-old)', width: 1.5, dash: '1.5 2.5' },
];

export const LEGEND_KEYS: LegendKey[] = [...LEGEND.map((l) => l.key), 'stations', ...CONTEXT_LEGEND.map((l) => l.key)];

/** Context layers, drawn below the researched lines. */
export function malhaLayers(theme: Theme): { id: string; key: LegendKey; layer: LineLayer }[] {
  const c = PALETTE[theme];
  return [
    {
      id: 'malha-o',
      key: 'ctx_o',
      layer: { type: 'line', filter: ['==', ['get', 'k'], 'o'], paint: { 'line-color': c.ctxOld, 'line-width': 1.4, 'line-dasharray': [1, 1.8] } },
    },
    {
      id: 'malha-d',
      key: 'ctx_d',
      layer: { type: 'line', filter: ['==', ['get', 'k'], 'd'], paint: { 'line-color': c.ctxDisused, 'line-width': 1.4, 'line-dasharray': [3, 2] } },
    },
    {
      id: 'malha-a',
      key: 'ctx_a',
      layer: { type: 'line', filter: ['==', ['get', 'k'], 'a'], layout: { 'line-join': 'round' }, paint: { 'line-color': c.ctxActive, 'line-width': 1.7 } },
    },
  ];
}
export const MALHA_LAYER_IDS = ['malha-o', 'malha-d', 'malha-a'];

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
  return ['all', base, activeAt(t), ['in', ['get', 'status'], ['literal', shown]]];
}

/** Layers that disappear entirely when a legend entry is off. */
export const LAYER_TOGGLE: Record<string, LegendKey> = { 'seg-operating-schematic': 'approx' };
