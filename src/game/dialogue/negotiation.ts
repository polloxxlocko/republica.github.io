/**
 * NEGOCIACIÓN POLÍTICA. Propuesta → evaluación → respuesta (acepta, contraoferta, posterga, consulta o
 * rechaza). Nadie puede ofrecer lo que no controla: las ofertas se validan con la autoridad real del
 * personaje (cargos, liderazgo de lista, escaño, etc.). Las evaluaciones dependen de los objetivos del
 * interlocutor, la relación, la reputación de cumplimiento y una incertidumbre irreducible.
 */
import type { Character, GameState } from '../models/types';
import type { Rng } from '../engine/rng';
import { newId } from '../systems/util';
import { partyInfluenceOf, capitalOf } from '../career/capital';
import type { NegotiationItem, NegotiationProposal } from './types';
import { disposition, getRel } from './relations';
import { goalsOf } from './goals';

const LEGISLATOR = ['diputado', 'senador'];
const TERRITORIAL_AUTH = ['alcalde', 'gobernador', 'diputado', 'senador', 'ministro', 'presidente'];

/** ¿Puede este personaje ofrecer este elemento? Devuelve el motivo si no puede. */
export function authorityFor(s: GameState, c: Character, it: NegotiationItem): string | null {
  const types = c.offices.map((o) => o.type);
  switch (it.kind) {
    case 'cupo_lista': return s.dialogue!.races.some((r) => r.status === 'abierta' && r.lists.some((l) => l.headId === c.id)) ? null : 'Solo quien encabeza una lista puede ofrecer cupos';
    case 'responsabilidad': return (c.partyId && s.parties[c.partyId]?.leaderId === c.id) || Object.values(s.dialogue!.regionalPresidents).includes(c.id) || s.dialogue!.races.some((r) => r.status === 'abierta' && r.lists.some((l) => l.headId === c.id)) ? null : 'No tiene atribuciones para asignar responsabilidades internas';
    case 'voto_proyecto': case 'indicacion': return types.some((t) => LEGISLATOR.includes(t)) ? null : 'Solo un/a parlamentario/a vota proyectos y presenta indicaciones';
    case 'prioridad_territorial': return types.some((t) => TERRITORIAL_AUTH.includes(t)) ? null : 'No controla recursos ni prioridades territoriales';
    case 'apoyo_interna': return c.partyId ? null : 'Sin militancia no participa de la interna';
    default: return null;
  }
}

/** Valor de un elemento para quien lo recibe, según sus objetivos actuales. */
function valueFor(s: GameState, receiver: Character, giver: Character, it: NegotiationItem): number {
  const goals = goalsOf(s, receiver).map((g) => g.kind);
  const weight = (k: string) => (goals.includes(k as never) ? 1.6 : 1);
  const giverInfluence = partyInfluenceOf(s, giver) / 100;
  switch (it.kind) {
    case 'apoyo_interna': return 18 * weight('ganar_interna') * (0.4 + giverInfluence);
    case 'apoyo_publico': return 10 * (0.4 + giver.rep.reconocimiento / 100);
    case 'trabajo_campana': return 14 * weight('candidatura') * (0.5 + (giver.isPlayer ? capitalOf(s).territorial / 60 : 0.3));
    case 'cupo_lista': return 26 * weight('ampliar_red');
    case 'responsabilidad': return 24;
    case 'voto_proyecto': return 30 * weight('aprobar_proyecto');
    case 'indicacion': return 12;
    case 'prioridad_territorial': return 16;
    case 'reunion_seguimiento': return 3;
    case 'apoyo_aspiracion': return 20 * weight('candidatura');
  }
}
/** Costo para quien entrega el elemento. */
function costFor(it: NegotiationItem): number {
  switch (it.kind) {
    case 'cupo_lista': return 14; case 'responsabilidad': return 18; case 'voto_proyecto': return 16; case 'apoyo_interna': return 10;
    case 'apoyo_aspiracion': return 12; case 'prioridad_territorial': return 10; case 'trabajo_campana': return 8; default: return 4;
  }
}

export interface Evaluation { score: number; response: NonNullable<NegotiationProposal['response']>; reasons: string[] }

/** Evalúa la propuesta del jugador (offer → npc, ask ← npc). */
export function evaluateProposal(s: GameState, rng: Rng, npcId: string, offer: NegotiationItem[], ask: NegotiationItem[], round: number): Evaluation {
  const npc = s.characters[npcId]; const me = s.characters[s.player.characterId];
  const reasons: string[] = [];
  let score = 0;
  for (const it of offer) score += valueFor(s, npc, me, it);
  for (const it of ask) { const a = authorityFor(s, npc, it); if (a) { reasons.push(a); score -= 40; } else score -= costFor(it); }
  const r = getRel(s, npcId, me.id);
  const rep = s.dialogue!.reputation.cumplimiento;
  // las promesas valen según la confianza en que se cumplan
  const promiseFactor = 0.5 + Math.max(-0.4, Math.min(0.6, (r.reliability + (rep - 50)) / 120));
  score = score * (offer.length ? promiseFactor : 1) + disposition(s, npcId, me.id) * 0.35 - round * 4 + rng.normal(0, 9);
  if (r.rivalry > 50) reasons.push('Hay rivalidad de por medio');
  const response: Evaluation['response'] = score > 18 ? 'acepta' : score > 4 ? 'contraoferta' : score > -8 ? (round === 0 ? 'posterga' : 'consulta') : 'rechaza';
  return { score, response, reasons };
}

export function recordProposal(s: GameState, sessionId: string, proposer: string, offer: NegotiationItem[], ask: NegotiationItem[], round: number, response: NegotiationProposal['response']): NegotiationProposal {
  const p: NegotiationProposal = { id: newId(s, 'np'), sessionId, round, offer, ask, proposer, response };
  s.dialogue!.proposals.push(p);
  if (s.dialogue!.proposals.length > 200) s.dialogue!.proposals.splice(0, s.dialogue!.proposals.length - 200);
  return p;
}
