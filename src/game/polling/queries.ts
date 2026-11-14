/** Consultas sobre las publicaciones (solo información PÚBLICA: nunca lee el estado oculto). */
import type { GameState } from '../models/types';
import type { Survey, SurveyQuestion } from './types';
import { aggregate, toValidBase, type AggregateOpts, type AggregateResult, type Measurement } from './aggregator';

const VOTE_TOPICS = new Set(['partidos', 'presidencial_lista', 'presidencial_espontanea', 'segunda_vuelta']);

export function publicSurveys(s: GameState, filter?: (sv: Survey) => boolean): Survey[] {
  return (s.polling?.surveys ?? []).filter((sv) => !sv.privateFor && (!filter || filter(sv)));
}

/** Mediciones comparables de una pregunta. Las de voto se llevan a base de votos válidos por defecto. */
export function measurementsFor(s: GameState, questionId: string, opts: { basis?: 'valid' | 'all'; houses?: string[]; national?: boolean } = {}): Measurement[] {
  const out: Measurement[] = [];
  for (const sv of publicSurveys(s, (x) => (opts.national ?? true ? x.coverage === 'nacional' : true) && (!opts.houses || opts.houses.includes(x.pollsterId)))) {
    const q = sv.questions.find((x) => x.id === questionId); if (!q) continue;
    const raw: Record<string, number> = {}; for (const o of q.options) raw[o.key] = o.pct;
    const basis = opts.basis ?? (VOTE_TOPICS.has(q.topic) ? 'valid' : 'all');
    out.push({ house: sv.pollsterId, week: sv.fieldEndWeek, n: sv.n, effN: q.effN, values: basis === 'valid' ? toValidBase(raw) : raw });
  }
  return out;
}

export function latestAggregate(s: GameState, questionId: string, opts: AggregateOpts & { basis?: 'valid' | 'all' } = {}): AggregateResult | null {
  const ms = measurementsFor(s, questionId, { basis: opts.basis });
  return ms.length ? aggregate(ms, { asOf: s.week, ...opts }) : null;
}

export function lastQuestion(s: GameState, questionId: string, house?: string): { survey: Survey; q: SurveyQuestion } | null {
  const list = publicSurveys(s, (x) => !house || x.pollsterId === house);
  for (let i = list.length - 1; i >= 0; i--) { const q = list[i].questions.find((x) => x.id === questionId); if (q) return { survey: list[i], q }; }
  return null;
}
