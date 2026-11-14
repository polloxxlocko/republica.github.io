/** Utilidades para escribir definiciones de diálogo de forma legible. */
import type { DialogueCtx, DialogueEffect, Importance } from '../types';
import { capitalOf, partyInfluenceOf, homeCut } from '../../career/capital';
import { COMUNA_BY_CUT } from '../../territory/data';
import { disposition, getRel } from '../relations';
import { historyWeight } from '../memory';

export const npcRel = (c: DialogueCtx, dims: Extract<DialogueEffect, { type: 'rel' }>['dims'], importance: Importance = 'relevante'): DialogueEffect => ({ type: 'rel', from: c.npc.id, to: c.me.id, dims, importance });
export const myRel = (c: DialogueCtx, dims: Extract<DialogueEffect, { type: 'rel' }>['dims'], importance: Importance = 'relevante'): DialogueEffect => ({ type: 'rel', from: c.me.id, to: c.npc.id, dims, importance });
export const relOf = (c: DialogueCtx, who: string, dims: Extract<DialogueEffect, { type: 'rel' }>['dims'], importance: Importance = 'relevante'): DialogueEffect => ({ type: 'rel', from: who, to: c.me.id, dims, importance });
export const npcMem = (c: DialogueCtx, kind: Extract<DialogueEffect, { type: 'memory' }>['kind'], summary: string, importance: Importance = 'relevante'): DialogueEffect => ({ type: 'memory', owner: c.npc.id, about: c.me.id, kind, summary, importance });
export const react = (text: string): DialogueEffect => ({ type: 'reaction', text });

/** Cuánto le sirve el jugador a su interlocutor (capital territorial e influencia), 0..100. */
export const usefulness = (c: DialogueCtx) => Math.min(100, capitalOf(c.s).territorial * 0.9 + partyInfluenceOf(c.s, c.me) * 0.6 + c.me.rep.reconocimiento * 0.3);
/** Disposición del interlocutor hacia el jugador (relación + historia compartida). */
export const dispo = (c: DialogueCtx) => disposition(c.s, c.npc.id, c.me.id) + historyWeight(c.s, c.npc.id, c.me.id) * 0.6;
export const respectOf = (c: DialogueCtx) => getRel(c.s, c.npc.id, c.me.id).respect;
export const comunaOf = (c: DialogueCtx) => COMUNA_BY_CUT[homeCut(c.s)]?.name ?? c.me.comuna ?? 'tu comuna';
export const noise = (c: DialogueCtx, sd = 8) => c.rng.normal(0, sd);
export const pers = (c: DialogueCtx, ...p: DialogueCtx['npc']['personality'][]) => p.includes(c.npc.personality);
