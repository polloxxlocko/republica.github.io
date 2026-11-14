/**
 * SURVEY SCHEDULER — calendarios simulados por estudio (cadencia configurable por escenario y período),
 * campañas, crisis y veda legal.
 *
 * Veda: la Ley 18.700 (art. 37) permite divulgar encuestas sobre preferencias electorales solo hasta
 * el decimoquinto día anterior a la elección o plebiscito, inclusive. Durante la veda, las ediciones
 * se publican sin preguntas de preferencia electoral (aprobación y otros temas siguen permitidos).
 */
import type { GameState, ScheduledElection } from '../models/types';
import type { Rng } from '../engine/rng';
import { weekToISO } from '../engine/dates';
import type { PollsterProfile } from './types';

const NATIONAL: ScheduledElection['type'][] = ['presidencial', 'presidencial_2v', 'diputados'];
export const VEDA_DAYS = 15;

export function publicationISO(s: GameState, week: number): string {
  const d = new Date(`${weekToISO(s.startDate, week)}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 6); // domingo
  return d.toISOString().slice(0, 10);
}

export function nextNational(s: GameState, types = NATIONAL): ScheduledElection | null {
  return s.calendar.filter((e) => !e.done && types.includes(e.type) && e.week >= s.week).sort((a, b) => a.week - b.week)[0] ?? null;
}

export function weeksTo(s: GameState, types = NATIONAL): number {
  const e = nextNational(s, types); return e ? e.week - s.week : 999;
}

/** Elección cuya veda cubre la fecha de publicación de esta semana (si la hay). */
export function vedaFor(s: GameState, week = s.week): ScheduledElection | null {
  const pub = Date.parse(`${publicationISO(s, week)}T12:00:00Z`);
  for (const e of s.calendar) {
    if (e.done) continue;
    const days = (Date.parse(`${e.date}T12:00:00Z`) - pub) / 86_400_000;
    if (days >= 0 && days < VEDA_DAYS) return e;
  }
  return null;
}

export function inCampaign(s: GameState): boolean { return weeksTo(s) <= 16; }

export function severeCrisis(s: GameState): boolean { return s.crises.some((c) => c.severity >= 65); }

export type Due = false | 'regular' | 'flash';

export function due(s: GameState, rng: Rng, p: PollsterProfile): Due {
  const pol = s.polling!;
  if (p.activeFrom > publicationISO(s, s.week)) return false;
  if (p.coverage === 'regional') {
    const e = nextNational(s, ['diputados', 'senadores', 'gobernadores']);
    if (!e || e.week - s.week > 20) return false;
  }
  const next = pol.nextDue[p.id] ?? p.schedule.offset;
  if (s.week >= next) return 'regular';
  if (p.schedule.flashInCrisis > 0 && severeCrisis(s) && rng.chance(p.schedule.flashInCrisis)) return 'flash';
  return false;
}

export function scheduleNext(s: GameState, rng: Rng, p: PollsterProfile): void {
  const every = inCampaign(s) || p.coverage === 'regional' ? p.schedule.campaignEveryWeeks : p.schedule.everyWeeks;
  // pequeñas irregularidades en estudios no semanales (feriados, coyuntura)
  const jitter = every >= 4 ? rng.int(-1, 1) : every === 2 ? (rng.chance(0.15) ? 1 : 0) : 0;
  s.polling!.nextDue[p.id] = s.week + Math.max(1, every + jitter);
}
