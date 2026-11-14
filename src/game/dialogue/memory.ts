/**
 * MEMORIA POLÍTICA. Episódica (cada recuerdo con importancia y relevancia que decae), persistente
 * (los compromisos y hechos decisivos casi no decaen: pueden pesar años después) y selectiva (los
 * recuerdos menores se consolidan en un recuerdo agregado por par y se eliminan).
 */
import type { GameState } from '../models/types';
import { newId } from '../systems/util';
import type { CharacterMemory, Importance } from './types';
import { legacyRemember } from './relations';

const DECAY: Record<Importance, number> = { menor: 0.95, relevante: 0.99, compromiso: 0.997, decisivo: 0.999 };
const LEGACY_W: Partial<Record<CharacterMemory['kind'], number>> = {
  apoyo_recibido: 8, apoyo_rechazado: -5, acuerdo: 6, promesa_cumplida: 12, promesa_incumplida: -20, conflicto: -8, colaboracion: 5, disputa_electoral: -6, negociacion: 2, reconciliacion: 8,
};
const LEGACY_KIND: Partial<Record<CharacterMemory['kind'], 'apoyo' | 'conflicto' | 'colaboracion' | 'acuerdo_cumplido' | 'promesa_incumplida'>> = {
  apoyo_recibido: 'apoyo', apoyo_rechazado: 'conflicto', acuerdo: 'colaboracion', promesa_cumplida: 'acuerdo_cumplido', promesa_incumplida: 'promesa_incumplida', conflicto: 'conflicto', colaboracion: 'colaboracion', disputa_electoral: 'conflicto', reconciliacion: 'colaboracion',
};

export function addMemory(s: GameState, m: Omit<CharacterMemory, 'id' | 'week' | 'salience' | 'status' | 'consequences' | 'refs'> & { refs?: string[]; consequences?: string[] }): CharacterMemory {
  const st = s.dialogue!;
  // los saludos y gestos rutinarios no se registran como hechos históricos
  const recentSame = st.memories.find((x) => x.owner === m.owner && x.about === m.about && x.kind === m.kind && m.importance === 'menor' && s.week - x.week < 6);
  if (recentSame) { recentSame.salience = Math.min(1, recentSame.salience + 0.1); return recentSame; }
  const mem: CharacterMemory = { id: newId(s, 'mem'), week: s.week, salience: 1, status: 'activo', consequences: m.consequences ?? [], refs: m.refs ?? [], ...m };
  st.memories.push(mem);
  if (m.importance !== 'menor' && LEGACY_W[m.kind] !== undefined && LEGACY_KIND[m.kind]) {
    legacyRemember(s, m.owner, m.about, LEGACY_KIND[m.kind]!, LEGACY_W[m.kind]! * (m.importance === 'decisivo' ? 1.5 : 1), m.summary);
  }
  return mem;
}

export function memoriesOf(s: GameState, owner: string, about: string): CharacterMemory[] {
  return (s.dialogue?.memories ?? []).filter((m) => m.owner === owner && m.about === about).sort((a, b) => b.week - a.week);
}

/** Peso de la historia compartida en una decisión actual (positivo/negativo), ponderado por relevancia. */
export function historyWeight(s: GameState, owner: string, about: string): number {
  let w = 0;
  for (const m of memoriesOf(s, owner, about)) w += (LEGACY_W[m.kind] ?? 0) * m.salience * (m.importance === 'decisivo' ? 1.5 : m.importance === 'compromiso' ? 1.2 : 1);
  return w;
}

export function weeklyMemory(s: GameState): void {
  const st = s.dialogue!;
  for (const m of st.memories) if (m.status === 'activo') m.salience *= DECAY[m.importance];
  // consolidación de recuerdos menores desvanecidos en un recuerdo agregado por par
  const faded = st.memories.filter((m) => m.status === 'activo' && m.importance === 'menor' && m.salience < 0.2);
  for (const f of faded) {
    let agg = st.memories.find((m) => m.kind === 'consolidado' && m.owner === f.owner && m.about === f.about);
    if (!agg) { agg = { id: newId(s, 'mem'), owner: f.owner, about: f.about, participants: f.participants, week: f.week, kind: 'consolidado', summary: 'Contactos ocasionales', importance: 'relevante', salience: 0.5, consequences: [], status: 'consolidado', refs: [] }; st.memories.push(agg); }
    agg.refs.push(f.id); agg.summary = `Contactos ocasionales (${agg.refs.length})`;
  }
  if (faded.length) { const drop = new Set(faded.map((f) => f.id)); st.memories = st.memories.filter((m) => !drop.has(m.id)); }
  if (st.memories.length > 900) {
    st.memories.sort((a, b) => (b.importance === 'decisivo' ? 2 : 0) + b.salience - ((a.importance === 'decisivo' ? 2 : 0) + a.salience));
    st.memories.length = 900;
  }
}
