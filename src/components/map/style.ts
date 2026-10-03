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
  flooded: '#3b82c4',
  added: '#1a9850',
  removedCompare: '#d73027',
  unchanged: '#9a9a9a',
  highlight: '#f2b705',
};

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
    layer: { type: 'line', paint: { 'line-color': COLORS.flooded, 'line-width': 2, 'line-opacity': 0.8, 'line-dasharray': [1, 1.5] } },
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

export function segmentFilter(base: ExpressionSpecification, t: number): FilterSpecification {
  return ['all', base, activeAt(t)];
}
