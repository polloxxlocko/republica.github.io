/**
 * VALIDACIÓN FUERA DE MUESTRA del modelo territorial.
 *
 * El modelo se calibra SOLO con 2021–2022 (modo 'validacion') y se compara con resultados
 * oficiales de 2025 que no participan de la calibración:
 *   V1  2ª vuelta presidencial 2025: proporción del bloque de derecha por comuna.
 *   V2  1ª vuelta presidencial 2025: proporciones de bloques izq / der / populista.
 *   V3  Diputados 2025: proporciones de bloques izq / der / populista.
 *   V4  Participación 2025 (1ª vuelta).
 * Se informan: error absoluto medio comunal ponderado por electores (MAE, pp), MAE tras
 * remover el desplazamiento nacional uniforme ("swing"), correlación de Pearson, y dos
 * líneas base: persistencia (repetir el dato 2021/2022 equivalente) y media nacional.
 * Nada de 2025 se usa en la calibración; el "swing" se reporta aparte justamente porque
 * corregirlo usa información futura.
 */
import type { GameState } from '../models/types';
import { COMUNAS, type Bloc } from './data';
import { buildUtilityContext, computeShares, partyOptions } from '../systems/electorate';
import { leftRight } from '../systems/util';

export interface Metric { name: string; n: number; slope: number; mae: number; maeSwingAdj: number; swing: number; r: number; baselinePersistenceMAE: number | null; baselinePersistenceSwingAdjMAE: number | null; baselineNationalMAE: number }

function stats(pred: number[], act: number[], w: number[]) {
  const W = w.reduce((a, b) => a + b, 0) || 1;
  const swing = act.reduce((a, x, i) => a + (x - pred[i]) * w[i], 0) / W;
  const mae = pred.reduce((a, p, i) => a + Math.abs(act[i] - p) * w[i], 0) / W;
  const maeAdj = pred.reduce((a, p, i) => a + Math.abs(act[i] - p - swing) * w[i], 0) / W;
  const mp = pred.reduce((a, x, i) => a + x * w[i], 0) / W; const ma = act.reduce((a, x, i) => a + x * w[i], 0) / W;
  let sxy = 0, sxx = 0, syy = 0;
  pred.forEach((p, i) => { sxy += w[i] * (p - mp) * (act[i] - ma); sxx += w[i] * (p - mp) ** 2; syy += w[i] * (act[i] - ma) ** 2; });
  const natMAE = act.reduce((a, x, i) => a + Math.abs(x - ma) * w[i], 0) / W;
  return { mae: mae * 100, maeAdj: maeAdj * 100, swing: swing * 100, r: sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0, natMAE: natMAE * 100, slope: sxx ? sxy / sxx : 0 };
}

function metric(name: string, rows: { p: number; a: number; b: number | null; w: number }[]): Metric {
  const st = stats(rows.map((x) => x.p), rows.map((x) => x.a), rows.map((x) => x.w));
  const withB = rows.filter((x) => x.b !== null);
  const bs = withB.length ? stats(withB.map((x) => x.b as number), withB.map((x) => x.a), withB.map((x) => x.w)) : null;
  return { name, n: rows.length, slope: st.slope, mae: st.mae, maeSwingAdj: st.maeAdj, swing: st.swing, r: st.r, baselinePersistenceMAE: bs ? bs.mae : null, baselinePersistenceSwingAdjMAE: bs ? bs.maeAdj : null, baselineNationalMAE: st.natMAE };
}

/** Bloque de un partido del juego según su posición (misma regla que la interfaz). */
export function partyBloc(s: GameState, partyId: string): Bloc {
  if (partyId === 'PDG') return 'pop';
  if (partyId === 'PDC') return 'centro';
  const lr = leftRight(s.parties[partyId].ideology);
  return lr < -10 ? 'izq' : lr > 10 ? 'der' : 'centro';
}

export function runValidation(s: GameState): Metric[] {
  if (s.territoryCalibration.mode !== 'validacion') throw new Error('El estado debe estar calibrado en modo validación (2021-2022)');
  const res = computeShares(s, partyOptions(s), { ...buildUtilityContext(s, false), govEval: 0, incumbencyFatigue: 0 });
  const blocPred = new Map<number, Partial<Record<Bloc, number>>>();
  for (const c of COMUNAS) {
    const v = res.byComuna[c.cut]; if (!v) continue;
    const tot = Object.values(v).reduce((a, b) => a + b, 0) || 1;
    const b: Partial<Record<Bloc, number>> = {};
    for (const [p, x] of Object.entries(v)) { const k = partyBloc(s, p); b[k] = (b[k] ?? 0) + x / tot; }
    blocPred.set(c.cut, b);
  }
  const out: Metric[] = [];
  // Carrera entre candidaturas de bloque: ideología = centroide del bloque; identificación = sector
  const blocRace = (blocs: Bloc[][]) => {
    const opts = blocs.map((members) => {
      const ps = Object.values(s.parties).filter((p) => p.active && members.includes(partyBloc(s, p.id)));
      const w = ps.map((p) => Math.max(0.5, s.nationalIntention[p.id] ?? 1)); const W = w.reduce((a, b) => a + b, 0);
      const ideology = { ...ps[0].ideology };
      for (const k of Object.keys(ideology) as (keyof typeof ideology)[]) ideology[k] = ps.reduce((a, p, i) => a + p.ideology[k] * w[i], 0) / W;
      const lead = ps[w.indexOf(Math.max(...w))].id;
      return { key: members.join('+'), partyId: lead, ideology, quality: 50, affinityParties: ps.map((p) => p.id) };
    });
    const r = computeShares(s, opts, { ...buildUtilityContext(s, true), govEval: 0, incumbencyFatigue: 0 });
    const m = new Map<number, Record<string, number>>();
    for (const [cut, v] of Object.entries(r.byComuna)) { const t = Object.values(v).reduce((a, b) => a + b, 0) || 1; m.set(Number(cut), Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x / t]))); }
    return m;
  };
  const runoff = blocRace([['der'], ['izq', 'centro']]);
  // V0: misma carrera contra la 2ª vuelta 2021 (EN MUESTRA): sirve para calibrar la escala espacial
  out.push(metric('V0 · 2ª vuelta 2021 (en muestra)', COMUNAS.filter((c) => c.hist.P2021_2 && runoff.has(c.cut)).map((c) => ({
    p: runoff.get(c.cut)!.der ?? 0, a: c.hist.P2021_2.bl.der ?? 0, b: null, w: c.electors,
  }))));
  out.push(metric('V1 · 2ª vuelta 2025: derecha (proporción)', COMUNAS.filter((c) => c.hist.P2025_2 && runoff.has(c.cut)).map((c) => ({
    p: runoff.get(c.cut)!.der ?? 0, a: c.hist.P2025_2.bl.der ?? 0, b: c.hist.P2021_2?.bl.der ?? null, w: c.electors,
  }))));
  const first = blocRace([['izq'], ['der'], ['pop'], ['centro']]);
  for (const b of ['izq', 'der', 'pop'] as Bloc[]) {
    out.push(metric(`V2 · 1ª vuelta 2025: bloque ${b}`, COMUNAS.filter((c) => c.hist.P2025_1 && first.has(c.cut)).map((c) => ({
      p: first.get(c.cut)![b] ?? 0, a: c.hist.P2025_1.bl[b] ?? 0, b: c.hist.P2021_1?.bl[b] ?? null, w: c.electors,
    }))));
    out.push(metric(`V3 · Diputados 2025: bloque ${b}`, COMUNAS.filter((c) => c.hist.D2025 && blocPred.has(c.cut)).map((c) => ({
      p: blocPred.get(c.cut)![b] ?? 0, a: c.hist.D2025.bl[b] ?? 0, b: c.hist.D2021?.bl[b] ?? null, w: c.electors,
    }))));
  }
  out.push(metric('V4 · Participación 2025 (1ª vuelta)', COMUNAS.filter((c) => c.hist.P2025_1).map((c) => {
    const voters = res.turnoutByComuna[c.cut] ?? 0;
    const el = s.segments.filter((x) => x.cut === c.cut).reduce((a, x) => a + x.voters, 0) || 1;
    return { p: voters / el, a: c.hist.P2025_1.t, b: c.hist.PLEB2022?.t ?? null, w: c.electors };
  })));
  return out;
}
