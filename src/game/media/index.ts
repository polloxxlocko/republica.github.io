/**
 * Ecosistema de medios: inicialización y ciclo semanal
 * (cobertura → efectos en carreras → invitaciones a entrevistas → evolución anual → retención).
 */
import type { GameState } from '../models/types';
import type { Rng } from '../engine/rng';
import type { MediaState } from './types';
import { weeklyCoverage } from './coverage';
import { applyCoverageEffects } from './effects';
import { generateJournalists, weeklyInvites } from './journalists';
import { yearlyEvolution } from './evolution';

export function initMedia(s: GameState, rng: Rng): MediaState {
  const st: MediaState = { events: [], coverage: [], journalists: generateJournalists(rng), invites: [], appearances: [], audience: {}, fictional: [], altHistory: [], socialShare: 0.55 };
  s.media = st;
  return st;
}

export function mediaWeekly(s: GameState, rng: Rng): void {
  const st = s.media; if (!st) return;
  weeklyCoverage(s, rng);
  const pending = st.coverage.filter((c) => !c.applied);
  applyCoverageEffects(s, rng, pending);
  for (const c of pending) c.applied = true;
  weeklyInvites(s, rng);
  yearlyEvolution(s, rng);
  // retención acotada
  if (st.events.length > 100) {
    const drop = new Set(st.events.splice(0, st.events.length - 100).map((e) => e.id));
    st.coverage = st.coverage.filter((c) => !drop.has(c.eventId));
  }
  if (st.invites.length > 40) st.invites.splice(0, st.invites.length - 40);
  if (st.altHistory.length > 60) st.altHistory.splice(0, st.altHistory.length - 60);
  for (const j of st.journalists) if (j.history.length > 20) j.history.splice(0, j.history.length - 20);
}
