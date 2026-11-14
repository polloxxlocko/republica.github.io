/**
 * SURVEY HISTORY — evaluación descriptiva tras cada elección: encuestas publicadas y estimación
 * agregada frente a los resultados oficiales (ficticios) de la partida. Son métricas de esta
 * partida; no son juicios sobre la calidad real de ninguna organización.
 */
import type { ElectionResult, GameState } from '../models/types';
import type { PollEvaluation } from './types';
import { toValidBase, aggregate } from './aggregator';
import { measurementsFor, publicSurveys } from './queries';

function compare(poll: Record<string, number>, result: Record<string, number>) {
  const keys = Object.keys(result).filter((k) => (result[k] ?? 0) >= 1 || (poll[k] ?? 0) >= 1);
  const per: Record<string, { poll: number; result: number }> = {};
  let sum = 0, max = 0;
  for (const k of keys) { const e = Math.abs((poll[k] ?? 0) - result[k]); per[k] = { poll: poll[k] ?? 0, result: result[k] }; sum += e; max = Math.max(max, e); }
  const [a, b] = Object.entries(result).sort((x, y) => y[1] - x[1]);
  const marginErr = a && b ? Math.abs(((poll[a[0]] ?? 0) - (poll[b[0]] ?? 0)) - (a[1] - b[1])) : 0;
  return { mae: keys.length ? sum / keys.length : 0, maxErr: max, marginErr, per };
}

function questionFor(r: ElectionResult): string | null {
  if (r.type === 'diputados') return 'partidos';
  if (r.type === 'presidencial') return 'presidencial_lista';
  if (r.type === 'presidencial_2v') { const ks = Object.entries(r.nationalCandidatePct ?? {}).sort((a, b) => b[1] - a[1]).map(([k]) => k); return ks.length >= 2 ? `segunda_vuelta_${ks[0]}_${ks[1]}` : null; }
  return null;
}

export function evaluateResults(s: GameState): void {
  const pol = s.polling!;
  for (const r of s.results) {
    if (pol.evaluations.some((e) => e.resultId === r.id)) continue;
    let qid = questionFor(r); if (!qid) continue;
    const official = r.type === 'diputados' ? r.nationalPartyPct : r.nationalCandidatePct ?? {};
    const surveys = publicSurveys(s, (x) => x.coverage === 'nacional' && x.publishedWeek < r.week && r.week - x.publishedWeek <= 10);
    if (r.type === 'presidencial_2v' && !surveys.some((x) => x.questions.some((q) => q.id === qid))) {
      const [a, b] = qid.replace('segunda_vuelta_', '').split('_'); const alt = `segunda_vuelta_${b}_${a}`;
      if (surveys.some((x) => x.questions.some((q) => q.id === alt))) qid = alt;
    }
    const rows: PollEvaluation['rows'] = [];
    const byHouse = new Map<string, typeof surveys[number]>();
    for (const sv of surveys) if (sv.questions.some((q) => q.id === qid)) byHouse.set(sv.pollsterId, sv);
    for (const [h, sv] of byHouse) {
      const q = sv.questions.find((x) => x.id === qid)!;
      const raw: Record<string, number> = {}; for (const o of q.options) raw[o.key] = o.pct;
      const c = compare(toValidBase(raw), official);
      rows.push({ pollsterId: h, surveyId: sv.id, fieldEndWeek: sv.fieldEndWeek, mae: c.mae, maxErr: c.maxErr, marginErr: c.marginErr, per: c.per });
    }
    const ms = measurementsFor(s, qid).filter((m) => m.week < r.week);
    const agg = ms.length ? aggregate(ms, { asOf: r.week - 1 }) : null;
    const aggregateCmp = agg ? compare(Object.fromEntries(Object.entries(agg.values).map(([k, v]) => [k, v.mean])), official) : null;
    pol.evaluations.push({ resultId: r.id, electionType: r.type, week: r.week, rows: rows.sort((a, b) => a.mae - b.mae), aggregate: aggregateCmp ? { mae: aggregateCmp.mae, maxErr: aggregateCmp.maxErr, marginErr: aggregateCmp.marginErr } : undefined });
  }
}
