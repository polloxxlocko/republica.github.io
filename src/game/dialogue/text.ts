/**
 * Estilos verbales y selección determinista de variantes. Los estilos son un PERFIL NARRATIVO DEL
 * JUEGO derivado de la personalidad simulada; no describen a las personas reales.
 */
import type { Character, GameState } from '../models/types';
import type { DialogueCtx, Text, VerbalStyle } from './types';

const BY_PERSONALITY: Record<Character['personality'], VerbalStyle[]> = {
  pragmatico: ['directo', 'conciliador'], ideologico: ['persuasivo', 'directo'], ambicioso: ['directo', 'persuasivo'], conciliador: ['conciliador', 'formal'],
  confrontacional: ['directo', 'directo'], tecnocrata: ['tecnico', 'reservado'], territorial: ['directo', 'conciliador'], mediatico: ['persuasivo', 'directo'], institucionalista: ['institucional', 'formal'],
};

export function hash(str: string): number { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function styleOf(s: GameState, c: Character | undefined): VerbalStyle {
  if (!c) return 'formal';
  const st = s.dialogue!;
  return (st.styles[c.id] ??= BY_PERSONALITY[c.personality][hash(c.id) % 2]);
}

/** Variante por estilo (con alternativas) elegida de forma determinista según sesión y nodo. */
export function sty(c: DialogueCtx, key: string, m: Partial<Record<VerbalStyle, string[]>> & { default: string[] }): string {
  const list = m[c.style] ?? m.default;
  return list[hash(`${c.sess.id}|${key}`) % list.length];
}

export function render(t: Text, c: DialogueCtx): string { return typeof t === 'function' ? t(c) : t; }

/** Concordancia de género simple para el jugador (o/a) y para terceros. */
export const oa = (c: Character | undefined) => (c?.gender === 'f' ? 'a' : c?.gender === 'x' ? 'e' : 'o');
export const elLa = (c: Character | undefined) => (c?.gender === 'f' ? 'la' : 'el');
