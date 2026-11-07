/**
 * ACCESO A FIGURAS POLÍTICAS (punto 7): nadie se reúne libremente con cualquier dirigente nacional.
 * El acceso depende de relaciones previas, cargo, peso en el partido y cercanía territorial.
 */
import type { Character, GameState } from '../models/types';
import { me, officeRank, partyInfluenceOf } from './capital';
import { memoryBalance } from '../systems/characters';

export function isNationalFigure(s: GameState, t: Character): boolean {
  return t.id === s.government.presidentId || t.offices.some((o) => ['presidente', 'ministro', 'presidente_partido', 'senador'].includes(o.type)) || t.rep.reconocimiento >= 60;
}

/** null si el personaje puede pedir una reunión; si no, el motivo (cualitativo). */
export function accessBlocked(s: GameState, t: Character): string | null {
  const c = me(s);
  if (t.id === c.id) return 'No puedes reunirte contigo';
  const known = Math.abs(c.relations[t.id] ?? 0) >= 5 || t.memory.some((m) => m.aboutId === c.id);
  if (known && memoryBalance(t, c.id) > -30) return null;
  const rank = Math.max(0, ...c.offices.map((o) => officeRank(o.type)));
  const infl = c.partyId && c.partyId === t.partyId ? partyInfluenceOf(s, c) : 0;
  if (t.id === s.government.presidentId) return rank >= 6 || (infl >= 70) ? null : 'La Presidencia no recibe a quien no tiene un cargo relevante o un vínculo previo';
  if (isNationalFigure(s, t)) {
    if (rank >= 5 || infl >= 45) return null;
    if (t.regionId === c.regionId && (rank >= 2 || infl >= 25)) return null;
    return 'No tienes acceso directo: necesitas un cargo, más peso en tu partido o alguien que te presente';
  }
  if (t.regionId === c.regionId || infl >= 20 || rank >= 3) return null;
  return 'No tienes vínculos con esta persona ni presencia en su territorio';
}
