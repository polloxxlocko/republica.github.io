import { describe, expect, it } from 'vitest';
import { allocateWithPacts, dhondt, dhondtQuotients } from '../src/game/systems/dhondt';

describe("Método D'Hondt", () => {
  it('reproduce un ejemplo clásico', () => {
    // A 100.000, B 80.000, C 30.000, D 20.000 — 8 escaños → A 4, B 3, C 1, D 0
    expect(dhondt({ A: 100000, B: 80000, C: 30000, D: 20000 }, 8)).toEqual({ A: 4, B: 3, C: 1, D: 0 });
  });
  it('nunca asigna más escaños que los disponibles', () => {
    for (let seats = 1; seats <= 8; seats++) {
      const r = dhondt({ A: 51, B: 30, C: 19 }, seats);
      expect(Object.values(r).reduce((a, b) => a + b, 0)).toBe(seats);
    }
  });
  it('respeta topes de candidaturas', () => {
    const r = dhondt({ A: 1000, B: 10 }, 5, { A: 2, B: 5 });
    expect(r.A).toBe(2); expect(r.B).toBe(3);
  });
  it('los cocientes elegidos coinciden con la asignación', () => {
    const q = dhondtQuotients({ A: 100, B: 60, C: 30 }, 5).filter((x) => x.elected);
    const count: Record<string, number> = {};
    for (const x of q) count[x.key] = (count[x.key] ?? 0) + 1;
    const exp = Object.fromEntries(Object.entries(dhondt({ A: 100, B: 60, C: 30 }, 5)).filter(([, v]) => v > 0));
    expect(count).toEqual(exp);
  });
  it('los pactos suman votos y luego reparten entre partidos', () => {
    // Pacto P (X 30, Y 25) vs. partido Z 40, 3 escaños: el pacto obtiene 2 (55 vs 40)
    const r = allocateWithPacts({ P: { X: 30, Y: 25 }, Z: { Z: 40 } }, 3, { X: 3, Y: 3, Z: 3 });
    expect(r.byList.P).toBe(2); expect(r.byList.Z).toBe(1);
    expect(r.byParty.X).toBe(1); expect(r.byParty.Y).toBe(1);
  });
  it('maneja votaciones vacías', () => {
    expect(dhondt({}, 3)).toEqual({});
    expect(dhondt({ A: 0 }, 3)).toEqual({});
  });
});
