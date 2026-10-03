<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { CompareState, EventItem } from './types';

  interface Props {
    year: number;
    min: number;
    max: number;
    events: EventItem[];
    compare: CompareState;
  }

  let { year = $bindable(), min, max, events, compare = $bindable() }: Props = $props();

  let playing = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  const pct = (y: number) => ((y - min) / (max - min)) * 100;
  const eventYears = $derived([...new Set(events.map((e) => Math.floor(e.t)))]);
  const yearEvents = $derived(events.filter((e) => Math.floor(e.t) === year));

  function togglePlay() {
    playing = !playing;
    if (playing) {
      if (year >= max) year = min;
      timer = setInterval(() => {
        if (year >= max) return stop();
        year += 1;
      }, 450);
    } else stop();
  }

  function stop() {
    playing = false;
    clearInterval(timer);
  }

  function step(delta: number) {
    stop();
    year = Math.min(max, Math.max(min, year + delta));
  }

  function jumpToEvent(direction: 1 | -1) {
    stop();
    const ys = direction > 0 ? eventYears.filter((y) => y > year) : eventYears.filter((y) => y < year).reverse();
    if (ys.length) year = ys[0];
  }

  onDestroy(stop);
</script>

<section class="timeline" aria-label="Linha do tempo">
  <div class="row">
    <div class="year" aria-live="polite">
      {#if compare.on}
        <span class="cmp">{compare.a} <small>×</small> {compare.b}</span>
      {:else}
        {year}
      {/if}
    </div>

    <div class="controls">
      <button type="button" onclick={() => jumpToEvent(-1)} title="Evento anterior" aria-label="Evento anterior" disabled={compare.on}>« evento</button>
      <button type="button" onclick={() => step(-1)} title="Ano anterior" aria-label="Ano anterior" disabled={compare.on}>−1</button>
      <button type="button" class="play" onclick={togglePlay} aria-pressed={playing} disabled={compare.on}>
        {playing ? '❚❚ Pausar' : '▶ Animar'}
      </button>
      <button type="button" onclick={() => step(1)} title="Próximo ano" aria-label="Próximo ano" disabled={compare.on}>+1</button>
      <button type="button" onclick={() => jumpToEvent(1)} title="Próximo evento" aria-label="Próximo evento" disabled={compare.on}>evento »</button>
    </div>

    <label class="compare-toggle">
      <input type="checkbox" bind:checked={compare.on} onchange={stop} />
      Comparar dois anos
    </label>
    {#if compare.on}
      <div class="compare-years">
        <input type="number" {min} {max} bind:value={compare.a} aria-label="Primeiro ano" />
        <span>×</span>
        <input type="number" {min} {max} bind:value={compare.b} aria-label="Segundo ano" />
      </div>
    {/if}
  </div>

  {#if !compare.on}
    <div class="track">
      <input type="range" {min} {max} step="1" bind:value={year} oninput={stop} aria-label="Ano" />
      <div class="ticks" aria-hidden="true">
        {#each eventYears as y (y)}
          <span class="tick" class:current={y === year} style:left="{pct(y)}%"></span>
        {/each}
      </div>
      <div class="scale" aria-hidden="true">
        {#each [1860, 1880, 1900, 1920, 1940, 1960, 1980, 2000, 2020] as y (y)}
          <span style:left="{pct(y)}%">{y}</span>
        {/each}
      </div>
    </div>
    <p class="year-events">
      {#each yearEvents as e, i (e.id)}{i ? ' · ' : ''}{e.title}{/each}
    </p>
  {/if}
</section>

<style>
  .timeline {
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 10px 16px 12px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .year {
    font-family: var(--font-display);
    font-size: 2rem;
    font-variant-numeric: tabular-nums;
    min-width: 4ch;
    line-height: 1;
  }
  .cmp {
    font-size: 1.5rem;
  }
  .controls {
    display: flex;
    gap: 4px;
  }
  button {
    font: inherit;
    font-size: 0.85rem;
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--ink);
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .play {
    min-width: 7.5em;
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .compare-toggle {
    margin-left: auto;
    font-size: 0.85rem;
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .compare-years {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .compare-years input {
    width: 5.5em;
    font: inherit;
    padding: 2px 4px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    color: var(--ink);
  }
  .track {
    position: relative;
    margin-top: 8px;
    height: 38px;
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
    position: relative;
    z-index: 1;
    margin: 0;
  }
  .ticks,
  .scale {
    position: absolute;
    left: 8px;
    right: 8px;
    pointer-events: none;
  }
  .ticks {
    top: -4px;
    height: 6px;
  }
  .tick {
    position: absolute;
    width: 2px;
    height: 6px;
    background: var(--accent);
    opacity: 0.55;
    transform: translateX(-1px);
  }
  .tick.current {
    opacity: 1;
    height: 9px;
  }
  .scale {
    bottom: 0;
    height: 1.1rem;
    font-size: 0.7rem;
    line-height: 1.1rem;
    color: var(--muted);
  }
  .scale span {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
  }
  .year-events {
    min-height: 1.3em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 6px 0 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  @media (max-width: 640px) {
    .timeline {
      padding: 8px 10px 8px;
    }
    .row {
      gap: 8px;
    }
    .year {
      font-size: 1.5rem;
    }
    button {
      padding: 3px 6px;
      font-size: 0.8rem;
    }
    .play {
      min-width: 6em;
    }
    .compare-toggle {
      font-size: 0.8rem;
    }
    .compare-toggle {
      margin-left: 0;
    }
  }
</style>
