import type { Dim, GameState, Ideology, PolicyArea } from '../models/types';
import { AREA_DIM, DIMS, clamp } from '../rules/params';
import { Rng } from '../engine/rng';
import { weekToISO } from '../engine/dates';

export function newId(s: GameState, prefix: string): string {
  s.nextId += 1;
  return `${prefix}${s.nextId}`;
}

export function zeroIdeology(): Ideology { return { eco: 0, val: 0, seg: 0, inst: 0, amb: 0, soc: 0, ord: 0, lab: 0 }; }

export function cloneIdeology(i: Ideology): Ideology { return { ...i }; }

/** Distancia ideológica normalizada (0 = idénticos, ~1 = extremos opuestos en promedio). */
export function ideoDistance(a: Ideology, b: Ideology, weights?: Partial<Record<Dim, number>>): number {
  let sum = 0; let wsum = 0;
  for (const d of DIMS) {
    const w = weights?.[d] ?? 1;
    const diff = (a[d] - b[d]) / 100;
    sum += w * diff * diff;
    wsum += w;
  }
  return Math.sqrt(sum / Math.max(wsum, 1e-9));
}

/** Pesos por eje derivados de prioridades temáticas */
export function dimWeightsFromPriorities(pr: Partial<Record<PolicyArea, number>>): Record<Dim, number> {
  const w: Record<Dim, number> = { eco: 1, val: 0.8, seg: 0.8, inst: 0.4, amb: 0.5, soc: 0.7, ord: 0.6, lab: 0.6 };
  for (const [area, p] of Object.entries(pr) as [PolicyArea, number][]) {
    const m = AREA_DIM[area];
    for (const [d, v] of Object.entries(m) as [Dim, number][]) w[d] += (v ?? 0) * (p ?? 0) * 0.5;
  }
  return w;
}

export function blendIdeology(a: Ideology, b: Ideology, t: number): Ideology {
  const r = zeroIdeology();
  for (const d of DIMS) r[d] = a[d] + (b[d] - a[d]) * t;
  return r;
}

export function jitterIdeology(rng: Rng, base: Ideology, sd: number): Ideology {
  const r = zeroIdeology();
  for (const d of DIMS) r[d] = clamp(base[d] + rng.normal(0, sd), -100, 100);
  return r;
}

/** Posición "izquierda-derecha" resumida (solo para visualización/orden) */
export function leftRight(i: Ideology): number {
  return (i.eco * 1.4 + i.val * 0.8 + i.seg * 0.9 + i.soc * 0.8 + i.lab * 1.0 + i.ord * 0.5 + i.amb * 0.5) / 5.9;
}

export function pairKey(a: string, b: string): string { return a < b ? `${a}|${b}` : `${b}|${a}`; }

export function getRelation(s: GameState, a: string, b: string): number {
  if (a === b) return 100;
  return s.partyRelations[pairKey(a, b)] ?? 0;
}
export function addRelation(s: GameState, a: string, b: string, delta: number): void {
  if (a === b) return;
  const k = pairKey(a, b);
  s.partyRelations[k] = clamp((s.partyRelations[k] ?? 0) + delta, -100, 100);
}

export function currentISO(s: GameState): string { return weekToISO(s.startDate, s.week); }

export function sum(values: number[]): number { let t = 0; for (const v of values) t += v; return t; }

export function normalize(rec: Record<string, number>): Record<string, number> {
  const t = sum(Object.values(rec));
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = t > 0 ? v / t : 0;
  return out;
}

export function activeParties(s: GameState) {
  return Object.values(s.parties).filter((p) => p.active);
}

export function addHistory(s: GameState, category: import('../models/types').HistoryEntry['category'], title: string, detail: string, importance = 2): void {
  s.history.push({ id: newId(s, 'h'), week: s.week, date: currentISO(s), category, title, detail, importance });
  if (s.history.length > 3000) s.history.splice(0, s.history.length - 3000);
}

export function log(s: GameState, msg: string): void {
  s.log.push(msg);
  if (s.log.length > 200) s.log.splice(0, s.log.length - 200);
}

export function fmtPct(v: number, digits = 1): string { return `${v.toFixed(digits).replace('.', ',')}%`; }

/** Hash determinista (FNV-1a) → [0,1). Para heterogeneidad territorial estable sin consumir RNG. */
export function hash01(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0) / 4294967296;
}
/** Factor de "bastión" partido-distrito (lognormal estable, sd configurable). */
export function strongholdFactor(partyId: string, unit: string, sd = 0.4): number {
  const u = Math.max(1e-9, hash01(`${partyId}#${unit}`)); const v = hash01(`${unit}#${partyId}#2`);
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.exp(z * sd - (sd * sd) / 2);
}
