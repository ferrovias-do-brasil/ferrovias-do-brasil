/**
 * Hover tooltip text for map features, in the same words as the legend.
 * Pure functions (no MapLibre) so they can be unit-tested.
 */
import type { SegmentStatus } from '../../lib/schemas';

export const STATUS_TIP: Record<SegmentStatus, string> = {
  construction: 'Em construção',
  open: 'Em operação',
  freight_only: 'Só carga (sem passageiros)',
  closed: 'Desativado (sem trens)',
  removed: 'Trilhos retirados',
  flooded: 'Submerso por represa',
};

const MALHA_TIP = { a: 'Em uso hoje', d: 'Desativada hoje', o: 'Leito antigo (sem trilhos)' } as const;

const CHANGE_TIP = {
  added: (a: number, b: number) => `Surgiu entre ${a} e ${b}`,
  removed: (a: number, b: number) => `Deixou de operar entre ${a} e ${b}`,
  unchanged: (a: number, b: number) => `Operava em ${a} e em ${b}`,
} as const;

export interface Tip {
  title: string;
  /** Railway company / line, or a short kind label. */
  subtitle?: string;
  /** Status in legend terms, with a colour hint. */
  status: string;
  tone: 'active' | 'freight' | 'inactive' | 'flooded' | 'context' | 'added' | 'removed';
  note?: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function tipHtml(t: Tip): string {
  return [
    `<div class="tip-title">${escapeHtml(t.title)}</div>`,
    t.subtitle ? `<div class="tip-sub">${escapeHtml(t.subtitle)}</div>` : '',
    `<div class="tip-status tone-${t.tone}">${escapeHtml(t.status)}</div>`,
    t.note ? `<div class="tip-note">${escapeHtml(t.note)}</div>` : '',
  ].join('');
}

const toneOf = (s: SegmentStatus): Tip['tone'] =>
  s === 'open' || s === 'construction' ? 'active' : s === 'freight_only' ? 'freight' : s === 'flooded' ? 'flooded' : 'inactive';

/** A researched segment, as drawn for the selected year. */
export function segmentTip(p: { name: string; status: SegmentStatus; confidence: string }, lineName: string | undefined, year: number): Tip {
  return {
    title: p.name,
    subtitle: lineName,
    status: `${STATUS_TIP[p.status]} em ${year}`,
    tone: toneOf(p.status),
    note: p.confidence === 'low' ? 'Traçado aproximado: posição incerta' : undefined,
  };
}

/** The context layer: OSM railways without researched dates (situation today). */
export function malhaTip(p: { k: 'a' | 'd' | 'o'; n?: string; hoje?: string; op?: string }): Tip {
  const title = p.n ?? 'Ferrovia sem nome no OpenStreetMap';
  const today = p.k === 'o' && p.hoje ? `Hoje o leito é ${p.hoje}` : p.op ? `Operador hoje: ${p.op}` : undefined;
  return {
    title,
    subtitle: 'Malha paulista — sem datas pesquisadas',
    status: MALHA_TIP[p.k],
    tone: 'context',
    note: today,
  };
}

/** A station marker for the selected year. */
export function stationTip(p: { name: string; passenger_end: number }, lineName: string | undefined, t: number, year: number): Tip {
  const ended = p.passenger_end <= t;
  return {
    title: `Estação ${p.name}`,
    subtitle: lineName,
    status: ended ? `Sem trens de passageiros em ${year}` : `Recebia passageiros em ${year}`,
    tone: ended ? 'inactive' : 'active',
  };
}

/** Compare mode: how a segment changed between the two years. */
export function compareTip(name: string, lineName: string | undefined, change: 'added' | 'removed' | 'unchanged', a: number, b: number): Tip {
  return {
    title: name,
    subtitle: lineName,
    status: CHANGE_TIP[change](a, b),
    tone: change === 'added' ? 'added' : change === 'removed' ? 'removed' : 'context',
  };
}
