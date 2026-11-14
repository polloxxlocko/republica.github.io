/**
 * OBJETIVOS AUTÓNOMOS de los personajes, derivados del estado simulado (no de un guion). Determinan
 * qué valoran en una negociación y por qué buscan al jugador.
 */
import type { Character, GameState } from '../models/types';

export type GoalKind = 'proteger_liderazgo' | 'ganar_interna' | 'candidatura' | 'aprobar_proyecto' | 'armar_lista' | 'ampliar_red' | 'coalicion' | 'gestion';
export interface Goal { kind: GoalKind; ref?: string; urgency: number; text: string }

export function goalsOf(s: GameState, c: Character): Goal[] {
  const out: Goal[] = [];
  const p = c.partyId ? s.parties[c.partyId] : null;
  if (p?.leaderId === c.id) out.push({ kind: 'proteger_liderazgo', urgency: p.nextLeadershipWeek - s.week < 30 ? 0.9 : 0.4, text: `Mantener la conducción de ${p.short}` });
  if (p && p.factions.some((f) => f.leaderId === c.id) && p.leaderId !== c.id) out.push({ kind: 'ganar_interna', urgency: p.nextLeadershipWeek - s.week < 40 ? 0.85 : 0.35, text: `Disputar la conducción de ${p.short}` });
  const proc = s.career.processes.find((x) => x.status !== 'resuelto' && x.status !== 'cancelado' && x.aspirants.some((a) => a.charId === c.id && a.status !== 'retirado'));
  if (proc) out.push({ kind: 'candidatura', ref: proc.id, urgency: 0.9, text: `Obtener la candidatura en ${proc.unitLabel}` });
  const bill = s.bills.find((b) => b.authorId === c.id && b.closedWeek === undefined);
  if (bill) out.push({ kind: 'aprobar_proyecto', ref: bill.id, urgency: 0.7, text: `Aprobar «${bill.title.replace(/^Mensaje: /, '')}»` });
  const race = s.dialogue?.races.find((r) => r.status === 'abierta' && r.lists.some((l) => l.headId === c.id));
  if (race) out.push({ kind: 'armar_lista', ref: race.id, urgency: race.week - s.week < 10 ? 0.9 : 0.6, text: 'Ganar la directiva regional' });
  if (c.offices.some((o) => o.type === 'ministro')) out.push({ kind: 'gestion', urgency: 0.6, text: 'Sacar adelante su gestión' });
  if (p && s.government.coalitionId && s.coalitions[s.government.coalitionId]?.members.includes(p.id) && p.leaderId === c.id) out.push({ kind: 'coalicion', urgency: 0.5, text: 'Cuidar su lugar en la coalición' });
  out.push({ kind: 'ampliar_red', urgency: 0.2, text: 'Ampliar su red política' });
  return out.sort((a, b) => b.urgency - a.urgency);
}
