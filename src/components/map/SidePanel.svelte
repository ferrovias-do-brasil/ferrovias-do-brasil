<script lang="ts">
  import { formatDatePt, endOfYear, toDecimalYear } from '../../lib/dates';
  import { hasConflict } from '../../lib/claims';
  import { CONFIDENCE_LABEL, METHOD_LABEL, STATUS_LABEL } from './style';
  import type { Catalog, MalhaFC, Selection } from './types';

  interface Item {
    id: string;
    name: string;
    km: number;
  }

  interface Props {
    catalog: Catalog;
    malha: MalhaFC | undefined;
    selection: Selection;
    year: number;
    operatingKm: number;
    compareSummary: { a: number; b: number; added: Item[]; removed: Item[] } | null;
    base: string;
    onselect: (s: Selection) => void;
  }

  let { catalog, malha, selection, year, operatingKm, compareSummary, base, onselect }: Props = $props();

  const REPO = 'https://github.com/ferrovias-do-brasil/ferrovias-do-brasil';
  const KIND_LABEL = { a: 'em uso hoje', d: 'desativada hoje (trilhos sem tráfego)', o: 'leito antigo (sem trilhos)' } as const;
  const osmWay = $derived(
    selection?.kind === 'osm' ? malha?.features.find((f) => String(f.properties.id) === selection.id)?.properties : undefined,
  );
  function gaugeLabel(g: string) {
    const names: Record<string, string> = { '1000': 'métrica (1.000 mm)', '1600': 'larga (1.600 mm)', '600': 'estreita (600 mm)', '760': 'estreita (760 mm)' };
    return g.split(';').map((x) => names[x] ?? `${x} mm`).join(' + ');
  }
  function issueUrl(name: string | undefined, id: string) {
    const title = `História da linha: ${name ?? `trecho OSM ${id}`}`;
    return `${REPO}/issues/new?template=fato-historico.yml&title=${encodeURIComponent(title)}&lugar=${encodeURIComponent(name ?? '')}`;
  }

  const t = $derived(endOfYear(year));
  const station = $derived(selection?.kind === 'station' ? catalog.stations[selection.id] : undefined);
  const segment = $derived(selection?.kind === 'segment' ? catalog.segments[selection.id] : undefined);
  const yearEvents = $derived(catalog.events.filter((e) => Math.floor(e.t) === year));
  const currentPeriod = $derived(segment?.periods.find((p) => p.start <= t && t < p.end));
  /** A later flooding, to explain why the line runs "through" a reservoir on today's map. */
  const futureFlood = $derived(segment?.periods.find((p) => p.status === 'flooded' && p.start > t));
  const currentSite = $derived(
    station?.sites.find((s) => toDecimalYear(s.from) <= t && (!s.to || toDecimalYear(s.to) > t)),
  );

  type ClaimLike = { value: string; source: string; note?: string; circa?: boolean; preferred?: boolean };

  /** Sources that state the same date are listed together. */
  function groupClaims(list: ClaimLike[]) {
    const groups: { value: string; circa?: boolean; preferred: boolean; sources: string[]; notes: string[] }[] = [];
    for (const c of list) {
      let g = groups.find((x) => x.value === c.value && Boolean(x.circa) === Boolean(c.circa));
      if (!g) groups.push((g = { value: c.value, circa: c.circa, preferred: false, sources: [], notes: [] }));
      g.sources.push(c.source);
      if (c.note) g.notes.push(c.note);
      if (c.preferred) g.preferred = true;
    }
    return groups;
  }

  function sourceLabel(id: string) {
    const s = catalog.sources[id];
    if (!s) return id;
    if (s.author) return `${s.author}, “${s.title}”`;
    return s.publisher ? `“${s.title}”, ${s.publisher}` : s.title;
  }
</script>

{#snippet sourceLink(id: string)}
  {@const s = catalog.sources[id]}
  {#if s?.url}<a href={s.url} target="_blank" rel="noopener">{sourceLabel(id)}</a>{:else}{sourceLabel(id)}{/if}
{/snippet}

{#snippet claims(list: ClaimLike[])}
  {#if hasConflict(list)}
    <span class="badge" title="As fontes não concordam">fontes divergem</span>
  {/if}
  <ul class="claims">
    {#each groupClaims(list) as g, i (i)}
      <li class:preferred={g.preferred || !hasConflict(list)}>
        <strong>{formatDatePt(g.value, g.circa)}</strong> —
        {#each g.sources as src, j (src)}{j ? '; ' : ''}{@render sourceLink(src)}{/each}
        {#each g.notes as n (n)}<div class="note">{n}</div>{/each}
      </li>
    {/each}
  </ul>
{/snippet}

<aside class="panel" aria-live="polite">
  {#if station}
    <button class="close" type="button" onclick={() => onselect(null)} aria-label="Fechar">×</button>
    <p class="kicker">Estação</p>
    <h2>{station.name}</h2>
    <p>{station.summary}</p>

    <h3>Inauguração</h3>
    {@render claims(station.opened)}

    {#if station.passenger_end}
      <h3>Fim dos trens de passageiros</h3>
      {@render claims(station.passenger_end)}
    {/if}
    {#if station.closed}
      <h3>Fechamento</h3>
      {@render claims(station.closed)}
    {/if}

    {#if station.km.length}
      <h3>Quilometragem</h3>
      <ul class="plain">
        {#each station.km as k (k.year + k.source)}
          <li>km {k.value.toLocaleString('pt-BR')} ({k.year}) — {@render sourceLink(k.source)}{#if k.note}<div class="note">{k.note}</div>{/if}</li>
        {/each}
      </ul>
    {/if}

    {#if currentSite}
      <h3>Localização em {year}</h3>
      <p class="note">
        Confiança <strong>{CONFIDENCE_LABEL[currentSite.confidence]}</strong>.
        {currentSite.note ?? ''}
      </p>
    {/if}

    {#if station.detail === 'full'}
      <p><a class="more" href="{base}estacoes/{station.id}/">História completa da estação →</a></p>
    {/if}
  {:else if segment}
    <button class="close" type="button" onclick={() => onselect(null)} aria-label="Fechar">×</button>
    <p class="kicker">Trecho · {segment.alignment === 'variant' ? 'variante' : segment.alignment === 'bypass' ? 'contorno' : segment.alignment === 'branch' ? 'ramal' : 'traçado original'}</p>
    <h2>{segment.name}</h2>
    <p class="status-now">
      Em {year}:
      <strong>{currentPeriod ? STATUS_LABEL[currentPeriod.status] : 'ainda não existia'}</strong>
    </p>
    {#if futureFlood}
      <p class="flood-note">
        Hoje este trecho está debaixo d'água: foi submerso por uma represa a partir de
        {formatDatePt(futureFlood.from, futureFlood.circa)}. Em {year} o rio ainda não tinha sido represado; por isso a
        linha parece passar por dentro do lago no mapa atual.
      </p>
    {/if}

    <h3>Linha do tempo do trecho</h3>
    <ol class="periods">
      {#each segment.periods as p, i (i)}
        <li class:current={p === currentPeriod}>
          <span class="status s-{p.status}">{STATUS_LABEL[p.status]}</span> desde
          {@render claims(p.claims)}
          {#if p.note}<div class="note">{p.note}</div>{/if}
        </li>
      {/each}
    </ol>

    {#if segment.replaces.length || segment.replacedBy.length}
      <h3>Variantes</h3>
      <ul class="plain">
        {#each segment.replaces as id (id)}
          <li>Substitui: <button class="link" type="button" onclick={() => onselect({ kind: 'segment', id })}>{catalog.segments[id]?.name}</button></li>
        {/each}
        {#each segment.replacedBy as id (id)}
          <li>Substituído por: <button class="link" type="button" onclick={() => onselect({ kind: 'segment', id })}>{catalog.segments[id]?.name}</button></li>
        {/each}
      </ul>
    {/if}

    <h3>De onde vem este traçado</h3>
    <p class="note">
      {METHOD_LABEL[segment.geometry.method]} · confiança <strong>{CONFIDENCE_LABEL[segment.geometry.confidence]}</strong>.
      {segment.geometry.note ?? ''}
    </p>
  {:else if selection?.kind === 'osm'}
    <button class="close" type="button" onclick={() => onselect(null)} aria-label="Fechar">×</button>
    <p class="kicker">Malha paulista · sem história pesquisada</p>
    {#if osmWay}
      <h2>{osmWay.n ?? 'Ferrovia sem nome no OpenStreetMap'}</h2>
      <p class="status-now">Situação: <strong>{KIND_LABEL[osmWay.k]}</strong></p>
      {#if osmWay.hoje}<p>O antigo leito hoje é <strong>{osmWay.hoje}</strong>.</p>{/if}
      <ul class="plain">
        {#if osmWay.op}<li>Operador hoje: {osmWay.op}</li>{/if}
        {#if osmWay.gauge}<li>Bitola: {gaugeLabel(osmWay.gauge)}</li>{/if}
        {#if osmWay.sd}<li>O OpenStreetMap registra início em <strong>{osmWay.sd}</strong> <span class="note">(sem fonte; precisa ser conferido)</span></li>{/if}
      </ul>
      <p class="note">
        Esta linha ainda não tem linha do tempo pesquisada: aparece em todos os anos com a situação de hoje, segundo o
        OpenStreetMap. A Noroeste, em cor, é a única linha já pesquisada.
      </p>
      <p>
        <a href={issueUrl(osmWay.n, selection.id)} target="_blank" rel="noopener">Conhece a história desta linha? Conte para nós →</a>
      </p>
      <p class="note">
        <a href="https://www.openstreetmap.org/way/{selection.id}" target="_blank" rel="noopener">Ver o trecho no OpenStreetMap</a>
      </p>
    {:else}
      <p class="muted">Carregando a malha…</p>
    {/if}
  {:else if compareSummary}
    <p class="kicker">Comparação</p>
    <h2>{compareSummary.a} × {compareSummary.b}</h2>
    {#each [['added', 'Surgiram', compareSummary.added], ['removed', 'Deixaram de operar', compareSummary.removed]] as const as [kind, label, items] (kind)}
      <h3><span class="swatch {kind}"></span>{label}: {items.reduce((t, i) => t + i.km, 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km</h3>
      {#if items.length}
        <ul class="plain">
          {#each items as item (item.id)}
            <li>
              <button class="link" type="button" onclick={() => onselect({ kind: 'segment', id: item.id })}>{item.name}</button>
              <span class="note">{item.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Nada.</p>
      {/if}
    {/each}
    <p class="note">Em cinza, os trechos que operavam nos dois anos.</p>
  {:else}
    <p class="kicker">Ferrovias do Brasil</p>
    <h2>{year}</h2>
    <p class="stat">
      <strong>{operatingKm.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km</strong> de linhas pesquisadas em operação
      <span class="note">(por enquanto, só a Noroeste; o resto da malha aparece em cinza, sem datas)</span>
    </p>
    {#if yearEvents.length}
      <h3>Neste ano</h3>
      <ul class="events">
        {#each yearEvents as e (e.id)}
          <li>
            <strong>{e.title}</strong> <span class="date">{formatDatePt(e.date, e.circa)}</span>
            <div>{e.summary}</div>
            <div class="note">Fonte: {#each e.sources as s, i (s)}{i ? '; ' : ''}{@render sourceLink(s)}{/each}</div>
            {#if e.stations[0]}
              <button class="link" type="button" onclick={() => onselect({ kind: 'station', id: e.stations[0] })}>ver estação</button>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted">Nenhum evento registrado neste ano. Use <em>evento »</em> para pular ao próximo.</p>
    {/if}
    <h3>Como usar</h3>
    <ul class="plain help">
      <li>Arraste o ano ou clique em <em>Animar</em> para ver a linha crescer.</li>
      <li>Clique numa linha ou estação para ver sua história e as fontes.</li>
      <li>Na <em>Legenda</em>, marque ou desmarque cada tipo de linha para mostrá-lo ou escondê-lo.</li>
      <li><em>Comparar dois anos</em> mostra em verde o que surgiu e em vermelho o que sumiu.</li>
    </ul>
  {/if}
</aside>

<style>
  .panel {
    position: relative;
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 16px 18px;
    overflow-y: auto;
    font-size: 0.92rem;
    line-height: 1.45;
  }
  h2 {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.6rem;
    margin: 0 0 6px;
    line-height: 1.15;
  }
  h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin: 16px 0 6px;
  }
  .kicker {
    margin: 0 0 2px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent);
  }
  .close {
    position: absolute;
    top: 8px;
    right: 10px;
    border: 0;
    background: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--muted);
  }
  ul,
  ol {
    margin: 0;
    padding-left: 1.1em;
  }
  .plain,
  .claims,
  .events {
    list-style: none;
    padding: 0;
  }
  .claims li {
    margin: 2px 0;
    opacity: 0.75;
  }
  .claims li.preferred {
    opacity: 1;
  }
  .events li {
    margin-bottom: 10px;
  }
  .note {
    font-size: 0.82rem;
    color: var(--muted);
  }
  .muted {
    color: var(--muted);
  }
  .date {
    color: var(--muted);
    font-size: 0.82rem;
  }
  .badge {
    display: inline-block;
    font-size: 0.7rem;
    background: #fde7c2;
    color: #6b4200;
    border-radius: 999px;
    padding: 1px 8px;
    margin: 2px 0 4px;
  }
  .periods li {
    margin-bottom: 8px;
  }
  .periods li.current {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-radius: 6px;
    padding: 2px 6px;
    margin-left: -6px;
  }
  .status {
    font-weight: 600;
  }
  .s-closed,
  .s-removed {
    color: #6b6b6b;
  }
  .s-flooded {
    color: #2c6aa3;
  }
  .stat {
    margin: 0 0 8px;
  }
  .link {
    text-align: left;
    border: 0;
    background: none;
    padding: 0;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
  }
  a {
    color: var(--accent);
  }
  .more {
    font-weight: 600;
  }
  .flood-note {
    font-size: 0.85rem;
    background: color-mix(in srgb, #1d63b5 14%, transparent);
    border-left: 3px solid #1d63b5;
    border-radius: 0 6px 6px 0;
    padding: 6px 8px;
  }
  .help li {
    margin-bottom: 4px;
  }
  .swatch {
    display: inline-block;
    width: 18px;
    height: 4px;
    margin-right: 6px;
    vertical-align: middle;
    border-radius: 2px;
  }
  .swatch.added {
    background: #1a9850;
  }
  .swatch.removed {
    background: #d73027;
  }
</style>
