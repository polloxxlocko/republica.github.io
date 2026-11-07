import { grantNomination } from '../src/game/career/nominations';
import { describe, expect, it } from 'vitest';
import { newGame } from './helpers';
import { advanceWeek, dispatch } from '../src/game/engine/game';
import { checkInvariants } from '../src/game/engine/invariants';
import { runElection, survivesLegally, subpacts } from '../src/game/systems/elections';
import { Rng } from '../src/game/engine/rng';
import type { GameState } from '../src/game/models/types';

function advanceTo(s: GameState, predicate: (g: GameState) => boolean, max = 400): GameState {
  for (let i = 0; i < max && !predicate(s); i++) s = advanceWeek(s).state;
  return s;
}

describe('Elecciones', () => {
  it('elección de diputados: 155 electos, porcentajes coherentes, sin duplicados', () => {
    const s = structuredClone(newGame({}, 5));
    const e = s.calendar.find((x) => x.type === 'diputados')!;
    const r = runElection(s, new Rng(s.rng), { ...e, week: s.week });
    expect(Object.values(r.seatsByParty).reduce((a, b) => a + b, 0)).toBe(155);
    expect(Object.values(r.nationalPartyPct).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1);
    const elected = r.units.flatMap((u) => u.elected);
    expect(new Set(elected).size).toBe(elected.length);
    for (const u of r.units) expect(u.elected.length).toBe(u.seats);
    expect(checkInvariants(s)).toEqual([]);
  });
  it('presidencial: segunda vuelta solo si nadie supera el 50%', () => {
    const s = structuredClone(newGame({}, 6));
    const e = s.calendar.find((x) => x.type === 'presidencial')!;
    const r = runElection(s, new Rng(s.rng), { ...e, week: s.week });
    const top = Math.max(...Object.values(r.nationalCandidatePct ?? {}));
    expect(Object.values(r.nationalCandidatePct ?? {}).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1);
    expect(!!r.runoffNeeded).toBe(top <= 50);
    if (!r.runoffNeeded) expect(s.government.electId).toBe(r.winnerId);
  });
  it('subpactos agrupan partidos cercanos de una coalición', () => {
    const s = newGame();
    const coal = Object.values(s.coalitions).find((c) => c.name === 'Bloque Progresista')!;
    const groups = subpacts(s, coal.id, coal.members);
    const all = Object.values(groups).flat();
    expect(all.sort()).toEqual([...coal.members].sort());
    expect(Object.keys(groups).length).toBeLessThan(coal.members.length);
  });
  it('ciclo completo: municipales, primarias, parlamentarias, presidencial y cambio de mando', () => {
    let s = newGame({}, 11);
    s = advanceTo(s, (g) => g.results.some((r) => r.type === 'alcaldes'));
    expect(s.results.find((r) => r.type === 'alcaldes')!.units.length).toBe(16);
    const mayors = Object.values(s.regions).reduce((a, r) => a + Object.values(r.mayorsByParty).reduce((x, y) => x + y, 0), 0);
    expect(mayors).toBe(346);
    const presBefore = s.government.presidentId;
    s = advanceTo(s, (g) => g.week > 0 && g.government.presidentId !== presBefore, 300);
    expect(s.results.some((r) => r.type === 'diputados')).toBe(true);
    expect(s.results.some((r) => r.type === 'presidencial')).toBe(true);
    expect(s.government.presidentId).not.toBe(presBefore);
    expect(checkInvariants(s)).toEqual([]);
    const dip = s.results.find((r) => r.type === 'diputados')!;
    for (const p of Object.keys(s.parties)) if (s.parties[p].legalStatus === 'disuelto') expect(survivesLegally(s, dip, p).ok).toBe(false);
  }, 120000);
});

describe('Carrera del jugador', () => {
  it('postula a diputado/a, hace campaña y la elección registra su resultado y cambios institucionales', () => {
    let s = newGame({ startRole: 'presidente_partido', age: 45, regionId: 'RM', partyId: 'REP' }, 31);
    const e = s.calendar.find((x) => x.type === 'diputados')!;
    s = advanceTo(s, (g) => e.week - g.week <= 30);
    s = structuredClone(s); grantNomination(s, e.id, 'diputado', '10', 'REP');
    expect(s.player.candidacies.length).toBe(1);
    s.player.personalFunds += 100;
    s = dispatch(s, { type: 'configurar_campana', budget: 60, region: 'RM', message: 'seg', side: 1 }).state;
    while (s.week < e.week) {
      s = dispatch(s, { type: 'actividad_campana' }).state;
      s = advanceWeek(s).state;
    }
    const r = s.results.find((x) => x.type === 'diputados')!;
    expect(r.playerOutcome?.ran).toBe(true);
    const me = s.characters[s.player.characterId];
    expect(me.offices.some((o) => o.type === 'diputado')).toBe(r.playerOutcome!.won);
    if (r.playerOutcome!.won) expect(s.seats.some((st) => st.holderId === me.id && st.unitId === 10)).toBe(true);
  }, 120000);
});
