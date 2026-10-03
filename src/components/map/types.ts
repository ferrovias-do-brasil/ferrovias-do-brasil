import type { FeatureCollection, LineString, MultiLineString, Point } from 'geojson';
import type { SiteData } from '../../lib/site-data';
import type { SegmentFeatureProps, StationFeatureProps } from '../../lib/network';

export type Catalog = SiteData['catalog'];
export type SegmentMeta = Catalog['segments'][string];
export type StationMeta = Catalog['stations'][string];
export type EventItem = Catalog['events'][number];
export type HistoricMap = Catalog['historicMaps'][number];

export type NetworkFC = FeatureCollection<LineString | MultiLineString, SegmentFeatureProps>;
export type StationsFC = FeatureCollection<Point, StationFeatureProps>;

export type Selection = { kind: 'station' | 'segment' | 'osm'; id: string } | null;

/** Context layer: a railway way from OpenStreetMap without researched history (scripts/import-malha.ts). */
export interface MalhaProps {
  id: number;
  /** a = in use today, d = disused, o = old bed (abandoned/razed). */
  k: 'a' | 'd' | 'o';
  n?: string;
  hoje?: string;
  op?: string;
  sd?: string;
  gauge?: string;
}
export type MalhaFC = FeatureCollection<LineString, MalhaProps>;

export interface CompareState {
  on: boolean;
  a: number;
  b: number;
}
