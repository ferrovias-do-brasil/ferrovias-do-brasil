<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    Map as MlMap,
    NavigationControl,
    ScaleControl,
    setWorkerUrl,
    type GeoJSONSource,
    type MapLayerMouseEvent,
  } from 'maplibre-gl';
  // MapLibre 6 loads its tile worker as an ES module; let Vite bundle it and hand over the URL.
  import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import type { Feature, LineString, MultiLineString } from 'geojson';
  import { BASEMAP, COLORS, FONT, SEGMENT_LAYERS, SEGMENT_LAYER_IDS, activeAt, segmentFilter } from './style';
  import { changeBetween, OPEN_END } from '../../lib/network';
  import { endOfYear } from '../../lib/dates';
  import type { CompareState, EventItem, HistoricMap, NetworkFC, Selection, StationsFC } from './types';

  interface Props {
    network: NetworkFC;
    stations: StationsFC;
    events: EventItem[];
    historicMaps: HistoricMap[];
    year: number;
    compare: CompareState;
    selection: Selection;
    showRemoved: boolean;
    historicOpacity: number;
    onselect: (s: Selection) => void;
  }

  let { network, stations, events, historicMaps, year, compare, selection, showRemoved, historicOpacity, onselect }: Props = $props();

  let container: HTMLDivElement;
  let map: MlMap | undefined;
  let ready = $state(false);

  const EMPTY = { type: 'FeatureCollection' as const, features: [] };

  // No map padding: @allmaps/maplibre assumes map.getCenter() is the canvas centre,
  // and padding would shift the historic map overlay.
  onMount(() => {
    setWorkerUrl(maplibreWorkerUrl);
    map = new MlMap({
      container,
      style: BASEMAP,
      center: [-50.3, -21.45],
      zoom: 7.2,
      minZoom: 5,
      maxZoom: 17,
      hash: 'mapa',
      attributionControl: { compact: true, customAttribution: 'Traçado © colaboradores do OpenStreetMap (ODbL)' },
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    if (window.innerWidth > 720) map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');
    map.on('load', () => {
      addLayers(map!);
      ready = true;
      // On small screens start with the attribution collapsed to its (i) button.
      if (window.innerWidth <= 720) container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    });
  });

  onDestroy(() => map?.remove());

  function addLayers(m: MlMap) {
    m.addSource('network', { type: 'geojson', data: network });
    m.addSource('compare', { type: 'geojson', data: EMPTY });
    m.addSource('stations', { type: 'geojson', data: stations });
    m.addSource('events', { type: 'geojson', data: EMPTY });

    for (const { id, layer } of SEGMENT_LAYERS) m.addLayer({ ...layer, id, source: 'network' });
    m.addLayer({
      id: 'seg-selected',
      type: 'line',
      source: 'network',
      filter: ['==', ['get', 'segment'], ''],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': COLORS.highlight, 'line-width': 9, 'line-opacity': 0.55 },
    });

    m.addLayer({
      id: 'cmp-unchanged',
      type: 'line',
      source: 'compare',
      filter: ['==', ['get', 'change'], 'unchanged'],
      paint: { 'line-color': COLORS.unchanged, 'line-width': 2.5 },
    });
    m.addLayer({
      id: 'cmp-removed',
      type: 'line',
      source: 'compare',
      filter: ['==', ['get', 'change'], 'removed'],
      paint: { 'line-color': COLORS.removedCompare, 'line-width': 4, 'line-dasharray': [2, 1] },
    });
    m.addLayer({
      id: 'cmp-added',
      type: 'line',
      source: 'compare',
      filter: ['==', ['get', 'change'], 'added'],
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': COLORS.added, 'line-width': 4.5 },
    });

    m.addLayer({
      id: 'events',
      type: 'circle',
      source: 'events',
      paint: {
        'circle-radius': 14,
        'circle-color': COLORS.highlight,
        'circle-opacity': 0.25,
        'circle-stroke-color': COLORS.highlight,
        'circle-stroke-width': 2,
      },
    });

    m.addLayer({
      id: 'stations',
      type: 'circle',
      source: 'stations',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['match', ['get', 'detail'], 'full', 4, 2.5], 12, 7],
        'circle-color': '#ffffff',
        'circle-stroke-color': '#3a2a20',
        'circle-stroke-width': ['match', ['get', 'detail'], 'full', 2.2, 1.4],
        'circle-opacity': ['match', ['get', 'confidence'], 'low', 0.7, 1],
        'circle-stroke-opacity': ['match', ['get', 'confidence'], 'low', 0.7, 1],
      },
    });
    m.addLayer({
      id: 'station-labels',
      type: 'symbol',
      source: 'stations',
      minzoom: 7,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 7, ['match', ['get', 'detail'], 'full', 12, 10.5], 12, 14],
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': '#2b211b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    });

    const clickable = [...SEGMENT_LAYER_IDS, 'stations', 'cmp-added', 'cmp-removed', 'cmp-unchanged'];
    for (const id of clickable) {
      m.on('mouseenter', id, () => (m.getCanvas().style.cursor = 'pointer'));
      m.on('mouseleave', id, () => (m.getCanvas().style.cursor = ''));
    }
    m.on('click', (e: MapLayerMouseEvent) => {
      const pad = 6;
      const box: [[number, number], [number, number]] = [
        [e.point.x - pad, e.point.y - pad],
        [e.point.x + pad, e.point.y + pad],
      ];
      const hits = m.queryRenderedFeatures(box, { layers: clickable.filter((id) => m.getLayer(id)) });
      const station = hits.find((f) => f.layer.id === 'stations');
      if (station) return onselect({ kind: 'station', id: station.properties.station });
      const seg = hits[0];
      onselect(seg ? { kind: 'segment', id: seg.properties.segment } : null);
    });
  }

  // ------------------------------------------------------------ time filter
  $effect(() => {
    if (!ready || !map) return;
    const t = endOfYear(year);
    const comparing = compare.on;
    for (const { id, base } of SEGMENT_LAYERS) {
      map.setFilter(id, segmentFilter(base, t));
      const hidden = comparing || (id === 'seg-removed' && !showRemoved);
      map.setLayoutProperty(id, 'visibility', hidden ? 'none' : 'visible');
    }
    const stT = comparing ? endOfYear(compare.b) : t;
    map.setFilter('stations', activeAt(stT));
    map.setFilter('station-labels', activeAt(stT));
    map.setPaintProperty('stations', 'circle-color', [
      'case',
      ['>', ['get', 'passenger_end'], stT],
      '#ffffff',
      '#b9b1aa',
    ]);
    const evs = comparing ? [] : events.filter((e) => Math.floor(e.t) === year && e.coords);
    (map.getSource('events') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: evs.map((e) => ({ type: 'Feature', properties: { id: e.id }, geometry: { type: 'Point', coordinates: e.coords! } })),
    });
  });

  // ------------------------------------------------------------ compare mode
  $effect(() => {
    if (!ready || !map) return;
    const source = map.getSource('compare') as GeoJSONSource;
    if (!compare.on) {
      source.setData(EMPTY);
      return;
    }
    const ta = endOfYear(compare.a);
    const tb = endOfYear(compare.b);
    const bySegment = new Map<string, Feature<LineString | MultiLineString, typeof network.features[number]['properties']>[]>();
    for (const f of network.features) {
      const list = bySegment.get(f.properties.segment) ?? [];
      list.push(f);
      bySegment.set(f.properties.segment, list);
    }
    const statusAt = (fs: typeof network.features, t: number) =>
      fs.find((f) => f.properties.start <= t && t < (f.properties.end ?? OPEN_END))?.properties.status ?? null;
    const features = [...bySegment].map(([segment, fs]) => ({
      type: 'Feature' as const,
      geometry: fs[0].geometry,
      properties: { segment, change: changeBetween(statusAt(fs, ta), statusAt(fs, tb)) },
    }));
    source.setData({ type: 'FeatureCollection', features: features.filter((f) => f.properties.change !== 'absent') });
  });

  // ------------------------------------------------------------ selection highlight
  $effect(() => {
    if (!ready || !map) return;
    const id = selection?.kind === 'segment' ? selection.id : '';
    map.setFilter('seg-selected', ['all', ['==', ['get', 'segment'], id], compare.on ? true : activeAt(endOfYear(year))]);
  });

  // ------------------------------------------------------------ historic maps (Allmaps)
  let warpedLayer: { setOpacity(o: number): void } | undefined;
  let loadedAnnotations = new Set<string>();

  $effect(() => {
    if (!ready || !map) return;
    const wanted = historicMaps.filter(
      (h) => h.georef_annotation && (h.show_from ?? -Infinity) <= year && year <= (h.show_to ?? Infinity),
    );
    // Relative annotation paths are served with the site, next to the page.
    void syncHistoricMaps(map, wanted.map((h) => new URL(h.georef_annotation!, document.baseURI).href));
  });

  $effect(() => {
    warpedLayer?.setOpacity(historicOpacity);
  });

  async function syncHistoricMaps(m: MlMap, urls: string[]) {
    if (urls.length === 0 && !warpedLayer) return;
    const { WarpedMapLayer } = await import('@allmaps/maplibre');
    let layer = warpedLayer as InstanceType<typeof WarpedMapLayer> | undefined;
    if (!layer) {
      layer = new WarpedMapLayer({ layerId: 'historic-maps' });
      m.addLayer(layer, SEGMENT_LAYERS[0].id);
      warpedLayer = layer;
      layer.setOpacity(historicOpacity);
    }
    for (const url of loadedAnnotations) {
      if (!urls.includes(url)) {
        await layer.removeGeoreferenceAnnotationByUrl(url);
        loadedAnnotations.delete(url);
      }
    }
    for (const url of urls) {
      if (!loadedAnnotations.has(url)) {
        // Allmaps picks a coarse triangulation by default (~1100 px here); the strong local
        // corrections of old frontier maps need finer triangles to be drawn where they belong.
        await layer.addGeoreferenceAnnotationByUrl(url, { resourceResolution: 120 });
        loadedAnnotations.add(url);
      }
    }
  }

  export function flyTo(coords: [number, number], zoom = 12) {
    map?.flyTo({ center: coords, zoom });
  }
</script>

<div class="map" bind:this={container} role="application" aria-label="Mapa interativo das ferrovias"></div>

<style>
  .map {
    position: absolute;
    inset: 0;
  }
</style>
