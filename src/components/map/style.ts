import type { ExpressionSpecification, FilterSpecification, LayerSpecification } from 'maplibre-gl';
import type { SegmentStatus } from '../../lib/schemas';

export const BASEMAP = 'https://tiles.openfreemap.org/styles/positron';
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

export const COLORS = {
  closed: '#8a8a8a',
  removed: '#a8a8a8',
  flooded: '#1d63b5',
  added: '#1a9850',
  removedCompare: '#d73027',
  unchanged: '#9a9a9a',
  highlight: '#f2b705',
};

/** What the legend can switch on and off. */
export type LegendKey = 'open' | 'freight_only' | 'approx' | 'closed' | 'removed' | 'flooded' | 'stations';

/** Legend entries, drawn with the same colours and dash patterns as the map layers. */
export const LEGEND: { key: LegendKey; label: string; color: string; width: number; dash?: string; opacity?: number }[] = [
  { key: 'open', label: 'Em operação', color: 'var(--line-nob)', width: 4 },
  { key: 'freight_only', label: 'Só carga (sem passageiros)', color: 'var(--line-nob)', width: 2.5 },
  { key: 'approx', label: 'Traçado aproximado', color: 'var(--line-nob)', width: 3, dash: '4.5 3.6' },
  { key: 'closed', label: 'Desativado (sem trens)', color: COLORS.closed, width: 2.2, dash: '4.4 4.4' },
  { key: 'removed', label: 'Trilhos retirados', color: COLORS.removed, width: 1.5, dash: '1.5 3', opacity: 0.8 },
  { key: 'flooded', label: 'Submerso por represa', color: COLORS.flooded, width: 3, dash: '3 3.6' },
];

export const LEGEND_KEYS: LegendKey[] = [...LEGEND.map((l) => l.key), 'stations'];

/** Feature active at decimal year t. */
export function activeAt(t: number): ExpressionSpecification {
  return ['all', ['<=', ['get', 'start'], t], ['>', ['get', 'end'], t]];
}

const status = (...s: SegmentStatus[]): ExpressionSpecification => ['in', ['get', 'status'], ['literal', s]];
const lowConfidence: ExpressionSpecification = ['==', ['get', 'confidence'], 'low'];
const lineColor: ExpressionSpecification = ['get', 'color'];

/** Segment layers, bottom to top. Each gets `activeAt(t)` and-ed onto its base filter. */
export const SEGMENT_LAYERS: { id: string; base: ExpressionSpecification; layer: Omit<LayerSpecification, 'id' | 'source' | 'filter'> & { type: 'line' } }[] = [
  {
    id: 'seg-removed',
    base: status('removed'),
    layer: { type: 'line', paint: { 'line-color': COLORS.removed, 'line-width': 1.5, 'line-opacity': 0.55, 'line-dasharray': [1, 2] } },
  },
  {
    id: 'seg-flooded',
    base: status('flooded'),
    layer: { type: 'line', paint: { 'line-color': COLORS.flooded, 'line-width': 3, 'line-opacity': 0.95, 'line-dasharray': [1, 1.2] } },
  },
  {
    id: 'seg-closed',
    base: status('closed'),
    layer: { type: 'line', paint: { 'line-color': COLORS.closed, 'line-width': 2.2, 'line-dasharray': [2, 2] } },
  },
  {
    id: 'seg-construction',
    base: status('construction'),
    layer: { type: 'line', paint: { 'line-color': lineColor, 'line-width': 2.5, 'line-dasharray': [3, 2] } },
  },
  {
    id: 'seg-casing',
    base: ['all', status('open', 'freight_only'), ['!', lowConfidence]],
    layer: {
      type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': ['match', ['get', 'status'], 'open', 7, 5], 'line-opacity': 0.9 },
    },
  },
  {
    id: 'seg-operating',
    base: ['all', status('open', 'freight_only'), ['!', lowConfidence]],
    layer: {
      type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': lineColor,
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
      paint: { 'line-color': lineColor, 'line-width': 3, 'line-dasharray': [1.5, 1.2], 'line-opacity': 0.9 },
    },
  },
];

export const SEGMENT_LAYER_IDS = SEGMENT_LAYERS.map((l) => l.id).filter((id) => id !== 'seg-casing');

/** Statuses switched off in the legend are filtered out of every segment layer. */
export function segmentFilter(base: ExpressionSpecification, t: number, hidden: ReadonlySet<LegendKey>): FilterSpecification {
  const statuses: SegmentStatus[] = ['construction', 'open', 'freight_only', 'closed', 'removed', 'flooded'];
  const shown = statuses.filter((st) => !hidden.has(st as LegendKey));
  return ['all', base, activeAt(t), ['in', ['get', 'status'], ['literal', shown]]];
}

/** Layers that disappear entirely when a legend entry is off. */
export const LAYER_TOGGLE: Record<string, LegendKey> = { 'seg-operating-schematic': 'approx' };
