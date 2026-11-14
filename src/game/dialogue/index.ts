/**
 * Sistema de conversaciones: ciclo semanal e integración con el motor político.
 */
import type { GameState } from '../models/types';
import type { Rng } from '../engine/rng';
import { emptyDialogue, closeSession } from './engine';
import { ensureRace, resolveRaces } from './world';
import { verifyCommitments } from './commitments';
import { weeklyMemory } from './memory';
import { aiInitiative, expireInvitations, processDeferred } from './ai';

export { emptyDialogue };

export function weeklyDialogue(s: GameState, rng: Rng): void {
  const st = (s.dialogue ??= emptyDialogue());
  ensureRace(s, rng);
  resolveRaces(s, rng);
  verifyCommitments(s, rng);
  processDeferred(s, rng);
  expireInvitations(s);
  aiInitiative(s, rng);
  // conversaciones abandonadas: se interrumpen (la otra parte lo nota)
  for (const sess of st.sessions) if (sess.status === 'activa' && s.week - sess.week > 2) { sess.transcript.push({ speaker: 'narrador', text: 'La conversación quedó a medias.', kind: 'narracion' }); closeSession(s, sess, 'interrumpida'); }
  weeklyMemory(s);
  if (st.actionLog.length > 400) st.actionLog.splice(0, st.actionLog.length - 400);
}
