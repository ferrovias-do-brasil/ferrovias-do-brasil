<script lang="ts">
  import { onMount } from 'svelte';
  import { CONTEXT_LEGEND, LEGEND, type LegendKey } from './style';
  import type { HistoricMap } from './types';

  interface Props {
    hidden: Set<LegendKey>;
    historicMap: HistoricMap | undefined;
    showHistoric: boolean;
    historicOpacity: number;
    base: string;
  }

  let { hidden = $bindable(), historicMap, showHistoric = $bindable(), historicOpacity = $bindable(), base }: Props = $props();

  let open = $state(true);
  onMount(() => (open = window.innerWidth > 720));

  function toggle(key: LegendKey) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    hidden = next;
  }
</script>

<section class="legend" aria-label="Legenda e camadas">
  <button class="head" type="button" onclick={() => (open = !open)} aria-expanded={open}>
    Legenda <span aria-hidden="true">{open ? '▴' : '▾'}</span>
  </button>

  {#if open}
    <ul>
      {#each LEGEND as item (item.key)}
        <li>
          <label class:off={hidden.has(item.key)}>
            <input type="checkbox" checked={!hidden.has(item.key)} onchange={() => toggle(item.key)} />
            <svg width="30" height="10" aria-hidden="true"
              ><line x1="1" y1="5" x2="29" y2="5" stroke={item.color} stroke-width={item.width} stroke-dasharray={item.dash}
                stroke-opacity={item.opacity ?? 1} /></svg
            >
            {item.label}
          </label>
        </li>
      {/each}
      <li>
        <label class:off={hidden.has('stations')}>
          <input type="checkbox" checked={!hidden.has('stations')} onchange={() => toggle('stations')} />
          <svg width="30" height="10" aria-hidden="true"><circle cx="15" cy="5" r="3.5" fill="var(--station-fill)" stroke="var(--station-stroke)" stroke-width="1.8" /></svg>
          Estações
        </label>
      </li>
      <li class="sep group">Malha paulista — sem datas ainda</li>
      {#each CONTEXT_LEGEND as item (item.key)}
        <li>
          <label class:off={hidden.has(item.key)}>
            <input type="checkbox" checked={!hidden.has(item.key)} onchange={() => toggle(item.key)} />
            <svg width="30" height="10" aria-hidden="true"
              ><line x1="1" y1="5" x2="29" y2="5" stroke={item.color} stroke-width={item.width} stroke-dasharray={item.dash} /></svg
            >
            {item.label}
          </label>
        </li>
      {/each}
      {#if historicMap}
        <li class="sep">
          <label title={historicMap.title}>
            <input type="checkbox" bind:checked={showHistoric} />
            <span class="map-swatch" aria-hidden="true"></span>
            Mapa antigo ({historicMap.year})
          </label>
          {#if showHistoric}
            <label class="sub">
              Transparência
              <input type="range" min="0.1" max="1" step="0.05" bind:value={historicOpacity} aria-label="Opacidade do mapa antigo" />
            </label>
            <a class="sub hint" href="{base}fontes/#mapas" title={historicMap.title}>
              {historicMap.author?.split(' (')[0] ?? 'fonte'}{#if historicMap.accuracy_km}
                · erro típico ~{historicMap.accuracy_km.median.toLocaleString('pt-BR')} km{/if}
            </a>
          {/if}
        </li>
      {/if}
    </ul>
    <p class="hint">O fundo é o mapa de hoje: as represas do Tietê e do Paraná só existem desde 1968–1991.</p>
  {/if}
</section>

<style>
  .legend {
    position: absolute;
    top: 12px;
    left: 12px;
    width: 240px;
    max-height: calc(100% - 190px);
    overflow-y: auto;
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: var(--shadow);
    font-size: 0.82rem;
  }
  .head {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 7px 10px;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    cursor: pointer;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 10px 4px;
  }
  li {
    margin: 2px 0;
  }
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    line-height: 1.35;
  }
  label.off {
    opacity: 0.45;
  }
  input[type='checkbox'] {
    margin: 0;
    accent-color: var(--accent);
  }
  .sep {
    border-top: 1px solid var(--line);
    margin-top: 6px;
    padding-top: 6px;
  }
  .sub {
    margin-left: 22px;
  }
  .group {
    color: var(--muted);
    font-size: 0.72rem;
  }
  .sub input[type='range'] {
    width: 110px;
  }
  .map-swatch {
    display: inline-block;
    width: 30px;
    height: 10px;
    border-radius: 2px;
    background: linear-gradient(90deg, #f3d9a8, #e9b88f);
    border: 1px solid #c9a46f;
  }
  .hint {
    display: block;
    color: var(--muted);
    font-size: 0.72rem;
    margin: 2px 10px 8px;
  }
  .sub.hint {
    margin: 2px 0 0 22px;
  }
  @media (max-width: 720px) {
    .legend {
      top: 8px;
      left: 8px;
      width: auto;
      max-width: calc(100% - 64px);
    }
  }
</style>
