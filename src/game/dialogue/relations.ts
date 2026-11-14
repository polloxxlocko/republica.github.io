/**
 * RELACIONES MULTIDIMENSIONALES Y DIRECCIONALES. `rel(from, to)` describe lo que `from` piensa de `to`.
 * Se inicializan desde el sistema heredado (c.relations / memoria) y se mantienen coherentes con él:
 * los cambios relevantes también se registran en la memoria heredada, que usan la IA y las nominaciones.
 *
 * Cambios graduales: el efecto se escala por importancia, saturación y rendimientos decrecientes
 * (ganancias positivas recientes entre el mismo par reducen las siguientes).
 */
import type { Character, GameState } from '../models/types';
import { clamp } from '../rules/params';
import { ideoDistance } from '../systems/util';
import { memoryBalance, remember } from '../systems/characters';
import { partyInfluenceOf } from '../career/capital';
import type { CharacterRelationship, DerivedRelation, DialogueEffect, Importance } from './types';

const IMP: Record<Importance, number> = { menor: 0.25, relevante: 0.6, compromiso: 0.8, decisivo: 1 };
const DIMS = ['trust', 'respect', 'cooperation', 'rivalry', 'reliability', 'personal', 'willingness', 'familiarity', 'dependence'] as const;
const UNSIGNED = new Set(['rivalry', 'familiarity', 'dependence']);

export function relKey(from: string, to: string) { return `${from}>${to}`; }

export function getRel(s: GameState, from: string, to: string): CharacterRelationship {
  const st = s.dialogue!;
  const k = relKey(from, to);
  let r = st.rel[k];
  if (!r) {
    const a = s.characters[from];
    const base = a ? memoryBalance(a, to) : 0;
    r = { from, to, trust: clamp(base * 0.8, -100, 100), respect: clamp(base * 0.3, -100, 100), cooperation: clamp(base * 0.5, -100, 100), rivalry: clamp(-base * 0.5, 0, 100),
      reliability: clamp(base * 0.4, -100, 100), personal: clamp(base * 0.6, -100, 100), willingness: clamp(10 + base * 0.4, -100, 100), familiarity: a && a.relations[to] !== undefined ? 25 : 0, dependence: 0,
      lastWeek: s.week, recentGain: 0, recentWeek: s.week };
    st.rel[k] = r;
  }
  return r;
}

/** Peek sin crear (para la interfaz y la IA cuando no debe registrar contacto). */
export function peekRel(s: GameState, from: string, to: string): CharacterRelationship | null { return s.dialogue?.rel[relKey(from, to)] ?? null; }

export function derived(s: GameState, from: Character, to: Character): DerivedRelation {
  const ideological = clamp(100 - ideoDistance(from.ideology, to.ideology) * 160, -100, 100);
  // competencia: mismas ambiciones o mismo espacio (partido/región) con notoriedad comparable
  let competition = 0;
  if (from.ambitionTarget === to.ambitionTarget) competition += 25;
  if (from.partyId && from.partyId === to.partyId && from.regionId === to.regionId) competition += 15;
  competition += clamp(30 - Math.abs(from.rep.reconocimiento - to.rep.reconocimiento), 0, 30);
  const influence = clamp(partyInfluenceOf(s, from) - partyInfluenceOf(s, to), -100, 100);
  return { ideological, competition: clamp(competition, 0, 100), influence };
}

/** Aplica un cambio de relación con proporcionalidad y rendimientos decrecientes. */
export function changeRel(s: GameState, e: Extract<DialogueEffect, { type: 'rel' }>): number {
  const r = getRel(s, e.from, e.to);
  if (s.week - r.recentWeek > 12) { r.recentGain = 0; r.recentWeek = s.week; }
  const scale = IMP[e.importance];
  let positive = 0;
  for (const d of DIMS) {
    const raw = e.dims[d]; if (!raw) continue;
    let delta = raw * scale;
    const cur = r[d];
    // saturación: cuesta más mover una dimensión que ya está en el extremo en esa dirección
    delta *= 1 - Math.min(0.85, Math.max(0, Math.sign(delta) * cur) / 120);
    // rendimientos decrecientes en ganancias repetidas (no en pérdidas)
    if (delta > 0 && !UNSIGNED.has(d)) { delta /= 1 + r.recentGain / 25; positive += delta; }
    r[d] = UNSIGNED.has(d) ? clamp(cur + delta, 0, 100) : clamp(cur + delta, -100, 100);
  }
  r.recentGain += positive;
  r.lastWeek = s.week;
  r.familiarity = clamp(r.familiarity + 2 * scale, 0, 100);
  // coherencia con el sistema heredado (IA, nominaciones, fuentes de información)
  const a = s.characters[e.from];
  const net = ((e.dims.trust ?? 0) + (e.dims.personal ?? 0) + (e.dims.cooperation ?? 0) - (e.dims.rivalry ?? 0)) * scale * 0.35;
  if (a && Math.abs(net) >= 1) a.relations[e.to] = clamp((a.relations[e.to] ?? 0) + net, -100, 100);
  return positive;
}

/** Índice compuesto de disposición de `from` a cooperar con `to` (para decisiones de la IA). */
export function disposition(s: GameState, from: string, to: string): number {
  const r = getRel(s, from, to);
  const a = s.characters[from]; const b = s.characters[to];
  const d = a && b ? derived(s, a, b) : { ideological: 0, competition: 0, influence: 0 };
  return r.trust * 0.3 + r.respect * 0.2 + r.cooperation * 0.15 + r.personal * 0.1 + r.reliability * 0.15 + r.willingness * 0.1 - r.rivalry * 0.35 + d.ideological * 0.12 - d.competition * 0.12;
}

/** Descripción narrativa (sin números) de cómo te ve un personaje. */
export function describe(s: GameState, from: string, to: string): string[] {
  const r = peekRel(s, from, to); if (!r) return ['No te conoce'];
  const out: string[] = [];
  if (r.familiarity < 12) out.push('Te conoce poco'); else if (r.familiarity > 45) out.push('Te conoce bien');
  if (r.trust > 30) out.push('Te tiene confianza'); else if (r.trust > 12) out.push('Empieza a confiar en ti'); else if (r.trust < -25) out.push('Desconfía de ti'); else if (r.trust < -5) out.push('Te mira con reservas');
  if (r.respect > 25 && r.personal < 0) out.push('Te respeta, aunque no hay simpatía');
  else if (r.respect > 25) out.push('Respeta tu trabajo político');
  else if (r.respect < -20) out.push('No te toma en serio');
  if (r.personal > 25 && r.trust < 0) out.push('El trato es cordial, pero no confía en tus acuerdos');
  if (r.reliability > 25) out.push('Cree que cumples lo que prometes'); else if (r.reliability > 10) out.push('Has cumplido con lo acordado'); else if (r.reliability < -25) out.push('Recuerda que no cumpliste');
  if (r.rivalry > 40) out.push('Te ve como un rival'); else if (r.rivalry > 10) out.push('Hay roces entre ustedes');
  if (r.dependence > 40) out.push('Depende de tu apoyo');
  if (r.cooperation > 25) out.push('Han trabajado juntos');
  if (!out.length) out.push('Relación neutra');
  return out;
}

/** Los recuerdos relevantes también se inscriben en la memoria heredada (con peso proporcional). */
export function legacyRemember(s: GameState, owner: string, about: string, kind: 'apoyo' | 'conflicto' | 'colaboracion' | 'acuerdo_cumplido' | 'promesa_incumplida' | 'traicion', weight: number, note: string): void {
  const c = s.characters[owner]; if (!c) return;
  remember(c, { week: s.week, aboutId: about, kind, weight, note });
}
