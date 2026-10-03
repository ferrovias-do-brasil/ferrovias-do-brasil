import { describe, expect, it } from 'vitest';
import { compareTip, escapeHtml, malhaTip, segmentTip, stationTip, tipHtml } from '../src/components/map/tooltip';

describe('hover tooltip', () => {
  it('describes a researched segment in legend terms for the year', () => {
    const t = segmentTip({ name: 'Coroados – Birigui (centro)', status: 'closed', confidence: 'high' }, 'E.F. Noroeste do Brasil', 1975);
    expect(t.status).toBe('Desativado (sem trens) em 1975');
    expect(t.subtitle).toBe('E.F. Noroeste do Brasil');
    expect(segmentTip({ name: 'x', status: 'open', confidence: 'low' }, undefined, 1912).note).toMatch(/aproximado/);
  });

  it('names old beds that became streets by their railway', () => {
    const t = malhaTip({ k: 'o', n: 'Estrada de Ferro Noroeste do Brasil', hoje: 'Avenida José Agostinho Rossi' });
    expect(t.title).toBe('Estrada de Ferro Noroeste do Brasil');
    expect(t.status).toBe('Leito antigo (sem trilhos)');
    expect(t.note).toBe('Hoje o leito é Avenida José Agostinho Rossi');
    expect(malhaTip({ k: 'a' }).title).toMatch(/sem nome/);
  });

  it('tells whether a station still had passengers', () => {
    expect(stationTip({ name: 'Birigui', passenger_end: 1995 }, 'NOB', 1990.9999, 1990).status).toMatch(/^Recebia/);
    expect(stationTip({ name: 'Birigui', passenger_end: 1995 }, 'NOB', 2000.9999, 2000).status).toMatch(/^Sem trens/);
  });

  it('explains compare-mode changes', () => {
    expect(compareTip('Variante', 'NOB', 'added', 1915, 1975).status).toBe('Surgiu entre 1915 e 1975');
  });

  it('escapes OSM names', () => {
    expect(escapeHtml('<b>"x" & y</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;');
    expect(tipHtml(malhaTip({ k: 'a', n: '<script>' }))).not.toContain('<script>');
  });
});
