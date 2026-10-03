<script lang="ts">
  import { onMount } from 'svelte';
  import MapView from './MapView.svelte';
  import TimelineSlider from './TimelineSlider.svelte';
  import SidePanel from './SidePanel.svelte';
  import { endOfYear } from '../../lib/dates';
  import { lineLengthM } from '../../lib/geo';
  import { changeBetween } from '../../lib/network';
  import type { Catalog, CompareState, NetworkFC, Selection, StationsFC } from './types';

  interface Props {
    base: string;
  }
  let { base }: Props = $props();

  const MIN_YEAR = 1900;
  const MAX_YEAR = new Date().getFullYear();

  let network = $state<NetworkFC>();
  let stations = $state<StationsFC>();
  let catalog = $state<Catalog>();
  let error = $state<string>();

  let year = $state(1912);
  let compare = $state<CompareState>({ on: false, a: 1915, b: 1975 });
  let selection = $state<Selection>(null);
  let showRemoved = $state(true);
  let historicOpacity = $state(0.7);
  let panelOpen = $state(true);
  let urlReady = false;

  onMount(async () => {
    panelOpen = window.innerWidth > 720;
    readUrl();
    if (selection) panelOpen = true;
    urlReady = true;
    try {
      const get = (p: string) => fetch(`${base}data/${p}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${p}: ${r.status}`))));
      [network, stations, catalog] = await Promise.all([get('network.geojson'), get('stations.geojson'), get('catalog.json')]);
    } catch (e) {
      error = (e as Error).message;
    }
  });

  // ---------------------------------------------------------------- URL state
  function readUrl() {
    const q = new URLSearchParams(location.search);
    const ano = Number(q.get('ano'));
    if (ano >= MIN_YEAR && ano <= MAX_YEAR) year = ano;
    const sel = q.get('sel')?.split(':');
    if (sel?.length === 2 && (sel[0] === 'station' || sel[0] === 'segment')) selection = { kind: sel[0], id: sel[1] };
    const cmp = q.get('comparar')?.split('-').map(Number);
    if (cmp?.length === 2 && cmp.every((y) => y >= MIN_YEAR && y <= MAX_YEAR)) compare = { on: true, a: cmp[0], b: cmp[1] };
  }

  $effect(() => {
    const q = new URLSearchParams();
    q.set('ano', String(year));
    if (selection) q.set('sel', `${selection.kind}:${selection.id}`);
    if (compare.on) q.set('comparar', `${compare.a}-${compare.b}`);
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

  const activeHistoric = $derived(
    catalog?.historicMaps.filter((h) => h.georef_annotation && (h.show_from ?? -Infinity) <= year && year <= (h.show_to ?? Infinity)) ?? [],
  );
</script>

<div class="app">
  {#if network && stations && catalog}
    <MapView
      {network}
      {stations}
      events={catalog.events}
      historicMaps={catalog.historicMaps}
      {year}
      {compare}
      {selection}
      {showRemoved}
      {historicOpacity}
      padRight={panelOpen ? 420 : 0}
      onselect={select}
    />

    <div class="layers">
      <label><input type="checkbox" bind:checked={showRemoved} /> Leitos desaparecidos</label>
      {#if activeHistoric.length}
        <label>
          Mapa antigo
          <input type="range" min="0" max="1" step="0.05" bind:value={historicOpacity} aria-label="Opacidade do mapa antigo" />
        </label>
      {:else}
        <span class="hint" title="Nenhum mapa antigo georreferenciado para este ano ainda">Mapas antigos: em breve</span>
      {/if}
    </div>

    <div class="side" class:collapsed={!panelOpen}>
      <button class="toggle" type="button" onclick={() => (panelOpen = !panelOpen)} aria-expanded={panelOpen}>
        {panelOpen ? 'Ocultar painel' : 'Mostrar painel'}
      </button>
      {#if panelOpen}
        <SidePanel {catalog} {selection} {year} {operatingKm} {compareSummary} {base} onselect={select} />
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
  .layers {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 10px;
    font-size: 0.82rem;
    box-shadow: var(--shadow);
  }
  .layers label {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .hint {
    color: var(--muted);
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
    .layers {
      top: 8px;
      left: 8px;
    }
  }
</style>
