/**
 * POLL AGGREGATOR — estimación agregada (opcional) que NO es un promedio aritmético simple.
 *
 * Ponderación documentada (docs/POLLING.md):
 *  1. Base comparable: cada medición se lleva a la misma base (p. ej., votos válidamente emitidos o
 *     total de entrevistados) antes de combinar.
 *  2. Antigüedad: peso × 0,5^(edad / vida media); vida media 3 semanas (6 para estudios semestrales).
 *  3. Tamaño efectivo: n / efecto de diseño (incluye ponderación y diseño no probabilístico).
 *  4. Superposición: de una misma encuestadora, solo cuenta plenamente la medición más reciente;
 *     las anteriores entran con el peso de antigüedad y el total por casa tiene un TOPE, para que
 *     publicar más seguido no domine el promedio.
 *  5. Efectos de casa: se estiman con el historial (desviación media respecto del consenso del
 *     resto, contraída hacia 0) y se corrige la mitad. Son estimaciones dentro de la partida.
 *  6. Incertidumbre: muestral combinada + dispersión entre casas + un piso de modelo.
 */
export interface Measurement {
  house: string;
  week: number;                 // fin del trabajo de campo
  n: number;
  effN: number;
  values: Record<string, number>; // porcentajes en la base elegida
}

export interface AggregateOption { mean: number; low: number; high: number }
export interface AggregateResult {
  values: Record<string, AggregateOption>;
  houses: { house: string; weight: number; share: number; measurements: number; lastWeek: number; effect: Record<string, number> }[];
  measurements: number;
  asOf: number;
}

export interface AggregateOpts { window?: number; halfLife?: number; houseCap?: number; adjustHouse?: boolean; asOf?: number }

const HOUSE_CAP = 1.6;

function decay(age: number, halfLife: number) { return Math.pow(0.5, Math.max(0, age) / halfLife); }

/** Consenso sin ajuste en torno a una semana (para estimar efectos de casa), excluyendo una casa. */
function consensusExcluding(ms: Measurement[], week: number, exclude: string, key: string): number | null {
  let num = 0, den = 0;
  for (const m of ms) {
    if (m.house === exclude || Math.abs(m.week - week) > 4 || m.values[key] === undefined) continue;
    const w = (m.effN / 1000) * decay(Math.abs(m.week - week), 3);
    num += w * m.values[key]; den += w;
  }
  return den > 0.05 ? num / den : null;
}

export function aggregate(all: Measurement[], opts: AggregateOpts = {}): AggregateResult | null {
  const asOf = opts.asOf ?? Math.max(...all.map((m) => m.week), 0);
  const window = opts.window ?? 12;
  const ms = all.filter((m) => m.week <= asOf && asOf - m.week <= window);
  if (!ms.length) return null;
  const keys = [...new Set(ms.flatMap((m) => Object.keys(m.values)))];
  const byHouse: Record<string, Measurement[]> = {};
  for (const m of ms) (byHouse[m.house] ??= []).push(m);
  // efectos de casa con historial (26 semanas)
  const hist = all.filter((m) => m.week <= asOf && asOf - m.week <= 26);
  const effects: Record<string, Record<string, number>> = {};
  const nHouses = Object.keys(byHouse).length;
  for (const h of Object.keys(byHouse)) {
    effects[h] = {};
    if (opts.adjustHouse === false || nHouses < 3) continue;
    const mine = hist.filter((m) => m.house === h);
    for (const k of keys) {
      const res: number[] = [];
      for (const m of mine) { const c = consensusExcluding(hist, m.week, h, k); if (c !== null && m.values[k] !== undefined) res.push(m.values[k] - c); }
      if (!res.length) continue;
      const mean = res.reduce((a, b) => a + b, 0) / res.length;
      effects[h][k] = 0.5 * mean * (res.length / (res.length + 4)); // contracción y corrección parcial
    }
  }
  const houses: AggregateResult['houses'] = [];
  const est: Record<string, { num: number; den: number }> = {};
  const houseVals: Record<string, Record<string, number>> = {};
  let effTotal = 0;
  for (const [h, list] of Object.entries(byHouse)) {
    list.sort((a, b) => b.week - a.week);
    const half = opts.halfLife ?? (list.length === 1 && asOf - list[0].week > 8 ? 6 : 3);
    let wSum = 0; let wMax = 0; const vals: Record<string, { num: number; den: number }> = {};
    list.forEach((m, idx) => {
      const overlap = idx > 0 && list[idx - 1].week - m.week < 1 ? 0.3 : 1; // campo superpuesto con la siguiente
      const w = (m.effN / 1000) * decay(asOf - m.week, half) * overlap;
      wSum += w; wMax = Math.max(wMax, w); effTotal += m.effN * decay(asOf - m.week, half) * overlap;
      for (const k of keys) if (m.values[k] !== undefined) { const v = (vals[k] ??= { num: 0, den: 0 }); v.num += w * (m.values[k] - (effects[h][k] ?? 0)); v.den += w; }
    });
    // tope por casa: a lo más 1,6 veces su medición individual de mayor peso
    const W = Math.min(wSum, (opts.houseCap ?? HOUSE_CAP) * wMax);
    houseVals[h] = {};
    for (const k of keys) if (vals[k]?.den) { const v = vals[k].num / vals[k].den; houseVals[h][k] = v; const e = (est[k] ??= { num: 0, den: 0 }); e.num += W * v; e.den += W; }
    houses.push({ house: h, weight: W, share: 0, measurements: list.length, lastWeek: list[0].week, effect: effects[h] });
  }
  const totW = houses.reduce((a, h) => a + h.weight, 0) || 1;
  for (const h of houses) h.share = h.weight / totW;
  const values: Record<string, AggregateOption> = {};
  for (const k of keys) {
    if (!est[k]?.den) continue;
    const mean = est[k].num / est[k].den;
    const p = Math.min(0.99, Math.max(0.01, mean / 100));
    const sampling = Math.sqrt(p * (1 - p) / Math.max(effTotal, 50)) * 100;
    const hv = Object.values(houseVals).map((v) => v[k]).filter((x): x is number => x !== undefined);
    const between = hv.length > 1 ? Math.sqrt(hv.reduce((a, x) => a + (x - mean) ** 2, 0) / (hv.length - 1)) / Math.sqrt(hv.length) : 2;
    const se = Math.sqrt(sampling ** 2 + between ** 2 + 1.0);
    values[k] = { mean, low: Math.max(0, mean - 1.96 * se), high: Math.min(100, mean + 1.96 * se) };
  }
  return { values, houses: houses.sort((a, b) => b.weight - a.weight), measurements: ms.length, asOf };
}

/** Lleva opciones a base de votos válidos (excluye NS/NR y blanco/nulo/ninguno). */
export function toValidBase(values: Record<string, number>, exclude = ['ns', 'ninguno', 'nc']): Record<string, number> {
  const tot = Object.entries(values).filter(([k]) => !exclude.includes(k)).reduce((a, [, v]) => a + v, 0);
  const out: Record<string, number> = {};
  if (tot <= 0) return out;
  for (const [k, v] of Object.entries(values)) if (!exclude.includes(k)) out[k] = (v / tot) * 100;
  return out;
}
