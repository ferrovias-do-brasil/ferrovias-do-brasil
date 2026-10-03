<script lang="ts">
  import { onMount } from 'svelte';
  import MapView from './MapView.svelte';
  import TimelineSlider from './TimelineSlider.svelte';
  import SidePanel from './SidePanel.svelte';
  import Legend from './Legend.svelte';
  import { isLegendKey, type LegendKey } from './style';
  import { onThemeChange, type Theme } from '../../lib/theme';
  import { endOfYear } from '../../lib/dates';
  import { lineLengthM } from '../../lib/geo';
  import { changeBetween } from '../../lib/network';
  import type { Catalog, CompareState, MalhaFC, NetworkFC, Selection, StationsFC } from './types';

  interface Props {
    base: string;
  }
  let { base }: Props = $props();

  const MIN_YEAR = 1860;
  const MAX_YEAR = new Date().getFullYear();

  let network = $state<NetworkFC>();
  let stations = $state<StationsFC>();
  let catalog = $state<Catalog>();
  let malha = $state<MalhaFC>();
  let error = $state<string>();

  let year = $state(1912);
  let compare = $state<CompareState>({ on: false, a: 1915, b: 1975 });
  let selection = $state<Selection>(null);
  let hidden = $state<Set<LegendKey>>(new Set());
  let showHistoric = $state(false);
  let historicOpacity = $state(0.6);
  let panelOpen = $state(true);
  let urlReady = false;
  let theme = $state<Theme>('light');

  onMount(() => onThemeChange((t) => (theme = t)));

  onMount(async () => {
    panelOpen = window.innerWidth > 720;
    readUrl();
    if (selection) panelOpen = true;
    urlReady = true;
    const get = (p: string) => fetch(`${base}data/${p}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${p}: ${r.status}`))));
    try {
      [network, stations, catalog] = await Promise.all([get('network.geojson'), get('stations.geojson'), get('catalog.json')]);
    } catch (e) {
      error = (e as Error).message;
    }
    // The context layer is large and optional: load it after the main data, ignore failures.
    get('malha-sp.geojson').then((m) => (malha = m), () => {});
  });

  // ---------------------------------------------------------------- URL state
  function readUrl() {
    const q = new URLSearchParams(location.search);
    const ano = Number(q.get('ano'));
    if (ano >= MIN_YEAR && ano <= MAX_YEAR) year = ano;
    const sel = q.get('sel')?.split(':');
    if (sel?.length === 2 && (sel[0] === 'station' || sel[0] === 'segment' || sel[0] === 'osm')) selection = { kind: sel[0], id: sel[1] };
    const cmp = q.get('comparar')?.split('-').map(Number);
    if (cmp?.length === 2 && cmp.every((y) => y >= MIN_YEAR && y <= MAX_YEAR)) compare = { on: true, a: cmp[0], b: cmp[1] };
    showHistoric = q.get('antigo') === '1';
    const off = (q.get('ocultar') ?? '').split(',').filter(isLegendKey);
    hidden = new Set(off);
  }

  $effect(() => {
    const q = new URLSearchParams();
    q.set('ano', String(year));
    if (selection) q.set('sel', `${selection.kind}:${selection.id}`);
    if (compare.on) q.set('comparar', `${compare.a}-${compare.b}`);
    if (showHistoric) q.set('antigo', '1');
    if (hidden.size) q.set('ocultar', [...hidden].join(','));
    if (urlReady) history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
  });

  // ---------------------------------------------------------------- stats
  const segmentLengths = $derived.by(() => {
    const m = new Map<string, number>();
    for (const f of network?.features ?? []) if (!m.has(f.properties.segment)) m.set(f.properties.segment, lineLengthM(f.geometry));
    return m;
  });

  const operatingKm = $derived.by(() => {
    const t = endOfYear(year);
    let total = 0;
    for (const f of network?.features ?? []) {
      const p = f.properties;
      if ((p.status === 'open' || p.status === 'freight_only') && p.start <= t && t < p.end) total += segmentLengths.get(p.segment) ?? 0;
    }
    return total / 1000;
  });

  /** Segments that appeared or disappeared between the two compared years. */
  const compareSummary = $derived.by(() => {
    if (!compare.on || !network) return null;
    const ta = endOfYear(compare.a);
    const tb = endOfYear(compare.b);
    const bySegment = new Map<string, NetworkFC['features']>();
    for (const f of network.features) bySegment.set(f.properties.segment, [...(bySegment.get(f.properties.segment) ?? []), f]);
    const statusAt = (fs: NetworkFC['features'], t: number) => fs.find((f) => f.properties.start <= t && t < f.properties.end)?.properties.status ?? null;
    const added: { id: string; name: string; km: number }[] = [];
    const removed: typeof added = [];
    for (const [id, fs] of bySegment) {
      const change = changeBetween(statusAt(fs, ta), statusAt(fs, tb));
      const item = { id, name: fs[0].properties.name, km: (segmentLengths.get(id) ?? 0) / 1000 };
      if (change === 'added') added.push(item);
      if (change === 'removed') removed.push(item);
    }
    return { a: compare.a, b: compare.b, added, removed };
  });

  function select(s: Selection) {
    selection = s;
    if (s) panelOpen = true;
  }

  /** The georeferenced historic map closest in time to the selected year (opt-in overlay). */
  const historicMap = $derived(
    (catalog?.historicMaps ?? [])
      .filter((h) => h.georef_annotation)
      .sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year))[0],
  );
</script>

<div class="app">
  {#if network && stations && catalog}
    <MapView
      {network}
      {stations}
      {malha}
      events={catalog.events}
      historicMaps={showHistoric && historicMap ? [historicMap] : []}
      {year}
      {compare}
      {selection}
      {hidden}
      {historicOpacity}
      {theme}
      onselect={select}
    />

    <Legend bind:hidden lines={catalog.lines} {historicMap} bind:showHistoric bind:historicOpacity {base} />

    <div class="side" class:collapsed={!panelOpen}>
      <button class="toggle" type="button" onclick={() => (panelOpen = !panelOpen)} aria-expanded={panelOpen}>
        {panelOpen ? 'Ocultar painel' : 'Mostrar painel'}
      </button>
      {#if panelOpen}
        <SidePanel {catalog} {malha} {selection} {year} {operatingKm} {compareSummary} {base} onselect={select} />
      {/if}
    </div>

    <div class="bottom">
      <TimelineSlider bind:year bind:compare min={MIN_YEAR} max={MAX_YEAR} events={catalog.events} />
    </div>
  {:else if error}
    <p class="status">Não foi possível carregar os dados: {error}</p>
  {:else}
    <p class="status">Carregando o mapa…</p>
  {/if}
</div>

<style>
  .app {
    position: absolute;
    inset: 0;
  }
  .status {
    margin: 2rem;
  }
  .side {
    position: absolute;
    top: 12px;
    right: 56px;
    width: min(380px, calc(100vw - 32px));
    bottom: 168px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: none;
  }
  .side > :global(*) {
    pointer-events: auto;
  }
  .side.collapsed {
    bottom: auto;
  }
  .toggle {
    align-self: flex-end;
    font: inherit;
    font-size: 0.8rem;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--ink);
    cursor: pointer;
  }
  .side :global(.panel) {
    flex: 1;
    min-height: 0;
  }
  .bottom {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 36px;
    max-width: 980px;
    margin: 0 auto;
  }
  @media (max-width: 720px) {
    .side {
      top: auto;
      right: 8px;
      left: 8px;
      width: auto;
      bottom: 196px;
      max-height: 42vh;
    }
    .side.collapsed {
      bottom: 196px;
    }
    .bottom {
      left: 8px;
      right: 8px;
      bottom: 30px;
    }
  }
</style>
