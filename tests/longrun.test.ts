import { describe, expect, it } from 'vitest';
import { newGame } from './helpers';
import { advanceWeek, dispatch } from '../src/game/engine/game';
import { checkInvariants } from '../src/game/engine/invariants';

describe('Partida larga (varias décadas)', () => {
  it('24 años: seis ciclos electorales sin violar invariantes, con economía acotada y rendimiento aceptable', () => {
    let s = newGame({}, 2024);
    const t0 = performance.now();
    const violations: string[] = [];
    for (let w = 0; w < 52 * 24; w++) {
      if (w % 3 === 0) s = dispatch(s, { type: 'redes' }).state;
      s = advanceWeek(s).state;
      if (w % 26 === 0) violations.push(...checkInvariants(s).map((v) => `S${s.week}: ${v}`));
      const e = s.economy;
      expect(e.inflation).toBeGreaterThan(-3); expect(e.inflation).toBeLessThan(26);
      expect(e.unemployment).toBeGreaterThan(2); expect(e.unemployment).toBeLessThan(23);
    }
    const ms = (performance.now() - t0) / (52 * 24);
    expect(violations).toEqual([]);
    const gens = s.results.filter((r) => r.type === 'diputados').length;
    expect(gens).toBeGreaterThanOrEqual(5);
    expect(new Set(s.results.filter((r) => r.type === 'presidencial' || r.type === 'presidencial_2v').map((r) => r.winnerId)).size).toBeGreaterThan(1);
    expect(ms).toBeLessThan(150);
    const kb = JSON.stringify(s).length / 1024;
    expect(kb).toBeLessThan(6000);
    console.log(`Rendimiento: ${ms.toFixed(1)} ms/semana; tamaño final ${kb.toFixed(0)} KB; personajes ${Object.keys(s.characters).length}`);
  }, 600000);
});
