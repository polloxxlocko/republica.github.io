/** Candidaturas presidenciales probables y su conocimiento público (sin crear personajes). */
import type { GameState } from '../models/types';
import { candidateQuality, ageOf } from '../systems/characters';
import { listIdOf, presidentialOptions as electionOptions } from '../systems/elections';
import type { VoteOption } from '../systems/electorate';

export function previewPresidentialField(s: GameState): { id: string; partyId: string; listId: string }[] {
  // Tras el cierre de inscripción, las encuestas miden exactamente las candidaturas inscritas
  const next = s.calendar.find((x) => !x.done && x.type === 'presidencial' && x.week >= s.week);
  if (next && s.registeredPresidential?.electionId === next.id) return s.registeredPresidential.field.filter((f) => s.characters[f.id]?.status === 'activo');
  const lists = new Set(Object.values(s.parties).filter((p) => p.active && p.legalStatus !== 'en_formacion').map((p) => listIdOf(s, p.id)));
  const out: { id: string; partyId: string; listId: string }[] = [];
  for (const l of lists) {
    const membersOf = s.coalitions[l]?.members ?? [l];
    const support = membersOf.reduce((a, p) => a + (s.nationalIntention[p] ?? 0), 0);
    if (!s.coalitions[l] && support < 4) continue;
    let id = s.presidentialCandidates[l];
    if (!id || s.characters[id]?.status !== 'activo') {
      let best = ''; let bestQ = -1;
      for (const c of Object.values(s.characters)) {
        if (c.status !== 'activo' || !c.partyId || !membersOf.includes(c.partyId) || c.offices.some((o) => o.type === 'presidente') || ageOf(s, c) < 35) continue;
        if (c.isPlayer && !s.player.candidacies.some((x) => x.office === 'presidente' && x.approved)) continue;
        const q = candidateQuality(c) + (s.nationalIntention[c.partyId] ?? 0) * 0.6;
        if (q > bestQ) { bestQ = q; best = c.id; }
      }
      id = best;
    }
    if (id) out.push({ id, partyId: s.characters[id].partyId ?? l, listId: l });
  }
  return out;
}

/** Opciones de voto con la misma especificación que usa el motor electoral (viabilidad incluida). */
export function presidentialOptions(s: GameState, ids?: string[]): VoteOption[] {
  const preview = previewPresidentialField(s);
  // con ids explícitos (p. ej., finalistas reales de la primera vuelta) se usan aunque no estén en la vista previa
  const field = ids ? ids.filter((id) => s.characters[id]).map((id) => preview.find((f) => f.id === id) ?? { id, partyId: s.characters[id].partyId ?? 'IND', listId: s.characters[id].partyId ? listIdOf(s, s.characters[id].partyId!) : id }) : preview;
  const viability: Record<string, number> = {};
  const sup = (f: { partyId: string; listId: string }) => Math.max(0.5, (s.coalitions[f.listId]?.members ?? [f.partyId]).reduce((x, p) => x + (s.nationalIntention[p] ?? 0), 0));
  const tot = field.reduce((a, f) => a + sup(f), 0) || 1;
  for (const f of field) viability[f.id] = ids && ids.length === 2 ? 0.5 : sup(f) / tot;
  return electionOptions(s, field, viability);
}
