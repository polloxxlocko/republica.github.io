/**
 * BIOGRAFÍA POLÍTICA Y LEGADO. Resumen evaluable incluso si nunca se llegó a la Presidencia.
 */
import type { GameState } from '../models/types';
import { clamp } from '../rules/params';
import { fullName, officeLabel } from '../systems/characters';
import { capitalOf, me, officeRank, type CareerSummary } from './capital';

export function careerSummary(s: GameState): CareerSummary {
  const c = me(s);
  const offices = [
    ...c.pastOffices.filter((o) => !['militante'].includes(o.type)).map((o) => ({ type: officeLabel(o.type, c.gender), from: o.from, to: o.to as number | null, detail: o.detail })),
    ...c.offices.map((o) => ({ type: officeLabel(o.type, c.gender), from: o.since, to: null, detail: 'en ejercicio' })),
  ].sort((a, b) => a.from - b.from);
  const peakType = [...c.pastOffices.map((o) => o.type), ...c.offices.map((o) => o.type)].sort((a, b) => officeRank(b) - officeRank(a))[0] ?? null;
  const rels = Object.entries(c.relations).filter(([id]) => s.characters[id]);
  const allies = rels.filter(([, v]) => v > 15).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => ({ id, name: fullName(s.characters[id]), score: Math.round(v) }));
  const rivals = rels.filter(([, v]) => v < -15).sort((a, b) => a[1] - b[1]).slice(0, 5).map(([id, v]) => ({ id, name: fullName(s.characters[id]), score: Math.round(v) }));
  const st = s.career.stats;
  const laws = s.bills.filter((b) => b.authorId === c.id && b.stage === 'publicada').length + st.laws;
  const cap = capitalOf(s);
  const years = Math.max(0, Math.round((s.week) / 52 * 10) / 10);
  const dims = [
    { label: 'Cargos alcanzados', value: clamp(officeRank(peakType) * 10, 0, 100) },
    { label: 'Desempeño electoral', value: st.won + st.lost ? Math.round((st.won / (st.won + st.lost)) * 100) : 0 },
    { label: 'Arraigo territorial', value: cap.territorial },
    { label: 'Influencia partidaria', value: cap.partyInfluence },
    { label: 'Reconocimiento nacional', value: cap.recognition },
    { label: 'Credibilidad', value: cap.credibility },
    { label: 'Legado legislativo y de gestión', value: clamp(laws * 15 + s.government.policies.filter((p) => p.phase === 'completada' && s.government.presidentId === c.id).length * 12, 0, 100) },
  ];
  const score = Math.round(dims.reduce((a, d) => a + d.value, 0) / dims.length);
  const peak = officeRank(peakType);
  const archetype = peak >= 10 ? 'Jefe/a de Estado'
    : peak >= 7 && cap.recognition > 55 ? 'Figura nacional'
    : peak >= 5 && cap.territorial > 50 ? 'Líder territorial'
    : cap.prestige > 60 && peak >= 4 ? 'Cuadro técnico de Estado'
    : cap.partyInfluence > 55 ? 'Operador/a partidario/a'
    : st.nomLost + st.lost >= 3 && peak < 4 ? 'Eterno/a aspirante'
    : cap.territorial > 45 ? 'Referente local'
    : years < 3 ? 'Carrera en formación'
    : 'Militante de base';
  const verdict = peak >= 10 ? 'Llegaste a la cima del poder político. La historia juzgará tu gobierno.'
    : peak >= 6 ? 'Construiste una carrera de primer nivel en la política chilena.'
    : peak >= 3 ? 'Ejerciste cargos públicos y dejaste huella en tu territorio.'
    : st.nomLost + st.lost > 0 ? 'Diste la pelea, aunque las oportunidades no se alinearon a tu favor.'
    : 'Tu trayectoria política recién comienza o se mantuvo en la base.';
  const LABELS: Record<string, string> = { partido: 'Primer partido', organizacion: 'Primera organización', mentor: 'Primer mentor/a', cargo_interno: 'Primer cargo interno', candidatura: 'Primera candidatura', victoria: 'Primera victoria', derrota: 'Primera derrota', cargo_publico: 'Primer cargo público', cambio_partido: 'Primer cambio de partido' };
  const ORDER = Object.keys(LABELS);
  const milestones = Object.entries(s.career.firsts ?? {}).sort((a, b) => a[1].week - b[1].week || ORDER.indexOf(a[0]) - ORDER.indexOf(b[0])).map(([k, v]) => ({ label: LABELS[k] ?? k, text: v.text, week: v.week }));
  const reforms = s.bills.filter((b) => b.authorId === c.id && b.stage === 'publicada').map((b) => b.title);
  return { milestones, reforms, years, offices, elections: { won: st.won, lost: st.lost }, nominations: { won: st.nomWon, lost: st.nomLost }, parties: st.parties.map((p) => s.parties[p]?.short ?? p), allies, rivals, laws, peak: peakType ? officeLabel(peakType, c.gender) : null, dimensions: dims, archetype, verdict, score };
}
