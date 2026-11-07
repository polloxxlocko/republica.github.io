/**
 * Simulaciones automáticas de muchas partidas para detectar desequilibrios:
 * partidos que ganan siempre, inflación descontrolada, crecimiento absurdo, cambios bruscos,
 * estancamiento (sin alternancia) y frecuencia excesiva de crisis.
 * Ejecutar con: npm run balance   (genera balance-report.json)
 */
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { newGame } from '../helpers';
import { advanceWeek } from '../../src/game/engine/game';

const SEEDS = Number(process.env.BALANCE_SEEDS ?? 10);
const YEARS = Number(process.env.BALANCE_YEARS ?? 12);

describe('Balance', () => {
  it(`${SEEDS} partidas × ${YEARS} años`, () => {
    const presWinners: Record<string, number> = {};
    const topChamber: Record<string, number> = {};
    const survivors: number[] = [];
    let maxInfl = 0; let minGrowth = 99; let maxGrowth = -99; let crises = 0; let alternations = 0; let elections = 0; let maxSwing = 0;
    const perRun: unknown[] = [];
    for (let k = 0; k < SEEDS; k++) {
      let s = newGame({}, 1000 + k * 37);
      let prevChamber: Record<string, number> | null = null;
      for (let w = 0; w < 52 * YEARS; w++) {
        s = advanceWeek(s).state;
        maxInfl = Math.max(maxInfl, s.economy.inflation);
        if (w > 26) { minGrowth = Math.min(minGrowth, s.economy.growth); maxGrowth = Math.max(maxGrowth, s.economy.growth); }
      }
      const pres = s.results.filter((r) => (r.type === 'presidencial' && !r.runoffNeeded) || r.type === 'presidencial_2v');
      let prevBloc = 'REP';
      for (const r of pres) {
        const p = s.characters[r.winnerId!]?.partyId ?? 'IND';
        presWinners[p] = (presWinners[p] ?? 0) + 1;
        elections++;
        const bloc = r.candidates?.find((c) => c.id === r.winnerId)?.listId ?? p;
        if (bloc !== prevBloc) alternations++;
        prevBloc = bloc;
      }
      for (const r of s.results.filter((x) => x.type === 'diputados')) {
        const top = Object.entries(r.seatsByParty).sort((a, b) => b[1] - a[1])[0];
        topChamber[top[0]] = (topChamber[top[0]] ?? 0) + 1;
        if (prevChamber) for (const [p, n] of Object.entries(r.seatsByParty)) maxSwing = Math.max(maxSwing, Math.abs(n - (prevChamber[p] ?? 0)));
        prevChamber = r.seatsByParty;
      }
      crises += s.history.filter((h) => h.category === 'crisis' && !h.title.startsWith('Termina')).length;
      survivors.push(Object.values(s.parties).filter((p) => p.active).length);
      perRun.push({ seed: 1000 + k * 37, presidents: pres.map((r) => s.characters[r.winnerId!]?.partyId), activeParties: Object.values(s.parties).filter((p) => p.active).map((p) => p.short), debt: +s.economy.debt.toFixed(1) });
    }
    const report = { seeds: SEEDS, years: YEARS, presWinners, topChamber, avgActiveParties: survivors.reduce((a, b) => a + b, 0) / survivors.length, maxInflation: maxInfl, minGrowth, maxGrowth, crisesPerDecade: (crises / SEEDS) * (10 / YEARS), alternationRate: elections ? alternations / elections : 0, maxSeatSwing: maxSwing, perRun };
    writeFileSync('balance-report.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 1).slice(0, 2500));
    const totalPres = Object.values(presWinners).reduce((a, b) => a + b, 0);
    // Ningún partido gana más del 75% de las presidenciales simuladas
    for (const n of Object.values(presWinners)) expect(n / totalPres).toBeLessThan(0.75);
    expect(maxInfl).toBeLessThan(20);
    expect(maxGrowth).toBeLessThan(9);
    expect(minGrowth).toBeGreaterThan(-9);
    expect(report.avgActiveParties).toBeGreaterThan(5);
    expect(report.alternationRate).toBeGreaterThan(0.2);
    expect(report.crisesPerDecade).toBeLessThan(25);
  });
});
