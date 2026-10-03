<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    Map as MlMap,
    NavigationControl,
    Popup,
    ScaleControl,
    setWorkerUrl,
    type GeoJSONSource,
    type MapLayerMouseEvent,
  } from 'maplibre-gl';
  // MapLibre 6 loads its tile worker as an ES module; let Vite bundle it and hand over the URL.
  import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import type { Feature, LineString, MultiLineString } from 'geojson';
  import {
    BASEMAP,
    COLORS,
    FONT,
    LAYER_TOGGLE,
    MALHA_LAYER_IDS,
    PALETTE,
    SEGMENT_LAYERS,
    SEGMENT_LAYER_IDS,
    activeAt,
    segmentFilter,
    segmentLayers,
    malhaLayers,
    lineVisible,
    dimBasemap,
    type LegendKey,
  } from './style';
  import type { Theme } from '../../lib/theme';
  import { compareTip, malhaTip, segmentTip, stationTip, tipHtml, type Tip } from './tooltip';
  import { changeBetween, OPEN_END } from '../../lib/network';
  import { endOfYear } from '../../lib/dates';
  import type { CompareState, EventItem, HistoricMap, MalhaFC, NetworkFC, Selection, StationsFC } from './types';

  interface Props {
    network: NetworkFC;
    stations: StationsFC;
    /** Context layer: the whole state's railways from OSM, without researched dates. */
    malha: MalhaFC | undefined;
    events: EventItem[];
    historicMaps: HistoricMap[];
    /** Researched lines, to name them in the hover tooltip. */
    lines: { network: string; name: string }[];
    year: number;
    compare: CompareState;
    selection: Selection;
    /** Legend entries switched off by the user. */
    hidden: ReadonlySet<LegendKey>;
    historicOpacity: number;
    theme: Theme;
    onselect: (s: Selection) => void;
  }

  let { network, stations, malha, events, historicMaps, lines, year, compare, selection, hidden, historicOpacity, theme, onselect }: Props =
    $props();

  const lineName = (id: string | undefined) => lines.find((l) => l.network === id)?.name;
  const segmentInfo = $derived(new Map(network.features.map((f) => [f.properties.segment, { name: f.properties.name, line: f.properties.line }])));

  let container: HTMLDivElement;
  let map: MlMap | undefined;
  let ready = $state(false);
  /** Theme of the basemap currently loaded (the style is swapped when `theme` changes). */
  let appliedTheme: Theme | undefined;

  const EMPTY = { type: 'FeatureCollection' as const, features: [] };

  // No map padding: @allmaps/maplibre assumes map.getCenter() is the canvas centre,
  // and padding would shift the historic map overlay.
  onMount(() => {
    setWorkerUrl(maplibreWorkerUrl);
    appliedTheme = theme;
    map = new MlMap({
      container,
      style: BASEMAP[theme],
      // The whole state of São Paulo; the researched NOB stands out in colour. On wide screens the
      // side panel covers the right of the map, so the centre is shifted east to keep the state visible.
      center: window.innerWidth > 720 ? [-47.5, -22.7] : [-48.6, -22.3],
      zoom: window.innerWidth > 720 ? 5.8 : 5.6,
      minZoom: 5,
      maxZoom: 17,
      hash: 'mapa',
      attributionControl: { compact: true, customAttribution: 'Traçado © colaboradores do OpenStreetMap (ODbL)' },
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    if (import.meta.env.DEV || location.hostname === "localhost") (window as unknown as { __map?: unknown }).__map = map; // test hook
    if (window.innerWidth > 720) map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');
    // Fires for the first style and after every theme switch: our sources and layers are added on top.
    map.on('style.load', () => {
      dimBasemap(map!, appliedTheme ?? 'light');
      addLayers(map!, appliedTheme ?? 'light');
      ready = true;
    });
    map.once('load', () => {
      // On small screens start with the attribution collapsed to its (i) button.
      if (window.innerWidth <= 720) container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    });
    bindEvents(map);
  });

  // Theme switch: swap the basemap; style.load re-adds our layers with the new palette.
  $effect(() => {
    const next = theme;
    if (!map || next === appliedTheme) return;
    appliedTheme = next;
    ready = false;
    warpedLayer = undefined; // custom layers do not survive setStyle
    loadedAnnotations = new Set();
    map.setStyle(BASEMAP[next], { diff: false });
  });

  onDestroy(() => map?.remove());

  function addLayers(m: MlMap, theme: Theme) {
    const c = PALETTE[theme];
    m.addSource('network', { type: 'geojson', data: network });
    m.addSource('compare', { type: 'geojson', data: EMPTY });
    m.addSource('stations', { type: 'geojson', data: stations });
    m.addSource('events', { type: 'geojson', data: EMPTY });

    m.addSource('malha', { type: 'geojson', data: malha ?? EMPTY });
    for (const { id, layer } of malhaLayers(theme)) m.addLayer({ ...layer, id, source: 'malha' });
    m.addLayer({
      id: 'malha-selected',
      type: 'line',
      source: 'malha',
      filter: ['==', ['get', 'id'], -1],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': COLORS.highlight, 'line-width': 7, 'line-opacity': 0.6 },
    });

    for (const { id, layer } of segmentLayers(theme)) m.addLayer({ ...layer, id, source: 'network' });
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
        'circle-color': c.stationFill,
        'circle-stroke-color': c.stationStroke,
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
      paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.6 },
    });
  }

  /** Pointer and click handlers, bound once; they keep working across style changes. */
  function bindEvents(m: MlMap) {
    const clickable = [...SEGMENT_LAYER_IDS, 'stations', 'cmp-added', 'cmp-removed', 'cmp-unchanged', ...MALHA_LAYER_IDS];
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
      // Priority: stations, then researched segments, then the context layer.
      const station = hits.find((f) => f.layer.id === 'stations');
      if (station) return onselect({ kind: 'station', id: station.properties.station });
      const seg = hits.find((f) => !MALHA_LAYER_IDS.includes(f.layer.id));
      if (seg) return onselect({ kind: 'segment', id: seg.properties.segment });
      const ctx = hits.find((f) => MALHA_LAYER_IDS.includes(f.layer.id));
      onselect(ctx ? { kind: 'osm', id: String(ctx.properties.id) } : null);
    });

    // Hover tooltip: what line this is (or was) and its state, in the legend's words.
    const tip = new Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: '280px', className: 'hover-tip' });
    m.on('mousemove', (e: MapLayerMouseEvent) => {
      const pad = 5;
      const box: [[number, number], [number, number]] = [
        [e.point.x - pad, e.point.y - pad],
        [e.point.x + pad, e.point.y + pad],
      ];
      const hits = m.queryRenderedFeatures(box, { layers: clickable.filter((id) => m.getLayer(id)) });
      const t = describe(hits);
      if (!t) return void tip.remove();
      tip.setLngLat(e.lngLat).setHTML(tipHtml(t));
      if (!tip.isOpen()) tip.addTo(m);
    });
    m.getCanvas().addEventListener('mouseleave', () => tip.remove());
    m.on('movestart', () => tip.remove());
  }

  function describe(hits: { layer: { id: string }; properties: Record<string, any> }[]): Tip | null {
    const station = hits.find((f) => f.layer.id === 'stations');
    if (station) {
      const t = endOfYear(compare.on ? compare.b : year);
      return stationTip(station.properties as { name: string; passenger_end: number }, lineName(station.properties.line), t, compare.on ? compare.b : year);
    }
    const cmp = hits.find((f) => f.layer.id.startsWith('cmp-'));
    if (cmp) {
      const info = segmentInfo.get(cmp.properties.segment);
      return compareTip(info?.name ?? cmp.properties.segment, lineName(info?.line), cmp.properties.change, compare.a, compare.b);
    }
    const seg = hits.find((f) => f.layer.id.startsWith('seg-') && f.layer.id !== 'seg-selected');
    if (seg) return segmentTip(seg.properties as Parameters<typeof segmentTip>[0], lineName(seg.properties.line), year);
    const ctx = hits.find((f) => MALHA_LAYER_IDS.includes(f.layer.id));
    if (ctx) return malhaTip(ctx.properties as Parameters<typeof malhaTip>[0]);
    return null;
  }

  // ------------------------------------------------------------ time filter
  $effect(() => {
    if (!ready || !map) return;
    const t = endOfYear(year);
    const comparing = compare.on;
    for (const { id, base } of SEGMENT_LAYERS) {
      map.setFilter(id, segmentFilter(base, t, hidden));
      const off = comparing || (LAYER_TOGGLE[id] !== undefined && hidden.has(LAYER_TOGGLE[id]));
      map.setLayoutProperty(id, 'visibility', off ? 'none' : 'visible');
    }
    for (const id of ['stations', 'station-labels']) map.setLayoutProperty(id, 'visibility', hidden.has('stations') ? 'none' : 'visible');
    const stT = comparing ? endOfYear(compare.b) : t;
    map.setFilter('stations', ['all', activeAt(stT), lineVisible(hidden)]);
    map.setFilter('station-labels', ['all', activeAt(stT), lineVisible(hidden)]);
    const c = PALETTE[appliedTheme ?? 'light'];
    map.setPaintProperty('stations', 'circle-color', ['case', ['>', ['get', 'passenger_end'], stT], c.stationFill, c.stationEnded]);
    const evs = comparing ? [] : events.filter((e) => Math.floor(e.t) === year && e.coords);
    (map.getSource('events') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: evs.map((e) => ({ type: 'Feature', properties: { id: e.id }, geometry: { type: 'Point', coordinates: e.coords! } })),
    });
  });

  // ------------------------------------------------------------ context layer (whole state, no dates)
  $effect(() => {
    if (!ready || !map) return;
    (map.getSource('malha') as GeoJSONSource | undefined)?.setData(malha ?? EMPTY);
  });

  $effect(() => {
    if (!ready || !map) return;
    for (const { id, key } of malhaLayers('light')) map.setLayoutProperty(id, 'visibility', hidden.has(key) ? 'none' : 'visible');
    map.setFilter('malha-selected', ['==', ['get', 'id'], selection?.kind === 'osm' ? Number(selection.id) : -1]);
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
    // Which maps to show is decided by the caller (opt-in toggle).
    const wanted = historicMaps.filter((h) => h.georef_annotation);
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
      m.addLayer(layer, 'malha-o'); // historic map below every line layer
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
