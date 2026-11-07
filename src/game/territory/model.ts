/**
 * MOTOR ELECTORAL TERRITORIAL: construcción del electorado por comuna y calibración.
 *
 * Cada comuna se representa con 4 segmentos etarios (18-29, 30-49, 50-69, 70+; pesos del padrón 2023).
 * La posición ideológica de cada segmento combina:
 *   (a) un componente latente izquierda-derecha estimado a partir de resultados históricos
 *       de segunda vuelta (no de la votación partidaria directa),
 *   (b) un componente antiestablishment estimado a partir de la votación de candidaturas populistas,
 *   (c) covariables censales (religión, educación, densidad) con efectos MODERADOS,
 *   (d) diferencias por edad.
 * La identificación partidaria es un parámetro separado (afinidad en log-odds) calibrado para
 * reproducir la votación de diputados por comuna, con contracción hacia la media regional.
 * Así, votar por un partido no se interpreta mecánicamente como compartir su ideología.
 *
 * Modos: 'juego' calibra con todo lo anterior al inicio del escenario (2021-2025);
 *        'validacion' calibra solo con 2021-2022 para predecir 2025 (ver tests/territory).
 */
import type { ComunaState, GameState, Ideology, PolicyArea, Segment } from '../models/types';
import { Rng } from '../engine/rng';
import { DIMS, clamp } from '../rules/params';
import { COMUNAS, type ComunaStatic } from './data';
import { REGION_BY_ID } from '../data/geography';
import { zeroIdeology } from '../systems/util';

export type CalibrationMode = 'juego' | 'validacion';

/** Elecciones de referencia por modo (nunca se usan datos posteriores al corte del modo). */
export const REFERENCE: Record<CalibrationMode, { leftRight: string[]; populist: string; turnout: string; parties: string; mayors: string | null }> = {
  juego: { leftRight: ['P2025_2', 'P2021_2'], populist: 'P2025_1', turnout: 'P2025_1', parties: 'D2025', mayors: 'A2021' },
  validacion: { leftRight: ['P2021_2'], populist: 'P2021_1', turnout: 'PLEB2022', parties: 'D2021', mayors: 'A2021' },
};

/** Coeficientes de la proyección de rasgos comunales a ideología (escala −100..100). Estimados. */
export const TERRITORY_COEF = {
  /** Escala del componente espacial izquierda-derecha (calibrada en muestra con la 2ª vuelta 2021) */
  lrScale: 1,
  leftRight: { eco: 40, soc: 34, lab: 34, ord: 28, val: 30, seg: 28, amb: 24, inst: 0 },
  populist: { seg: 30, ord: -28, eco: 6 },
  religionVal: { evang: 60, cath: 25, norel: -45 },
  eduAmb: -25,
  age: [
    { val: -24, amb: -16, ord: -12, seg: -6 },
    { val: -4, amb: -4, ord: -2, seg: 0 },
    { val: 10, amb: 6, ord: 8, seg: 6 },
    { val: 20, amb: 10, ord: 14, seg: 12 },
  ] as Partial<Ideology>[],
  /** Contracción de la afinidad comunal hacia la media regional (fidelidad vs. efecto candidato) */
  partisanShrink: 0.8,
  /** Piso de apoyo objetivo para partidos ausentes en la comuna (presencia futura posible) */
  absentFloor: 0.25,
  /** Participación relativa por edad (SERVEL, base de participación 2024, aprox.) */
  turnoutAge: [0.92, 0.98, 1.04, 0.98],
};

const logit = (p: number) => Math.log(clamp(p, 0.01, 0.99) / (1 - clamp(p, 0.01, 0.99)));

function weightedMean(values: number[], weights: number[]): number {
  let a = 0; let w = 0;
  for (let i = 0; i < values.length; i++) { a += values[i] * weights[i]; w += weights[i]; }
  return w > 0 ? a / w : 0;
}

interface Latent { z: number; pop: number; turnout: number; volatility: number }

/** Rasgos latentes por comuna a partir de resúmenes históricos (con respaldo regional si faltan). */
export function latentTraits(mode: CalibrationMode): Map<number, Latent> {
  const ref = REFERENCE[mode];
  const electors = COMUNAS.map((c) => c.electors);
  const rightOf = (c: ComunaStatic) => {
    const vals = ref.leftRight.map((id) => c.hist[id]?.bl.der).filter((v): v is number => v !== undefined);
    return vals.length ? (mode === 'juego' && vals.length > 1 ? 0.7 * vals[0] + 0.3 * vals[1] : vals[0]) : NaN;
  };
  const rights = COMUNAS.map(rightOf);
  const natRight = weightedMean(rights.map((v) => (Number.isFinite(v) ? v : 0.5)), electors);
  const pops = COMUNAS.map((c) => c.hist[ref.populist]?.bl.pop ?? NaN);
  const natPop = weightedMean(pops.map((v) => (Number.isFinite(v) ? v : 0.1)), electors);
  const out = new Map<number, Latent>();
  COMUNAS.forEach((c, i) => {
    const r = Number.isFinite(rights[i]) ? rights[i] : natRight;
    const p = Number.isFinite(pops[i]) ? pops[i] : natPop;
    const t = c.hist[ref.turnout]?.t ?? 0.8;
    // volatilidad: diferencia entre la derecha de primera y segunda vuelta (voto no alineado)
    const firstId = ref.leftRight[0].replace('_2', '_1');
    const r1 = c.hist[firstId]?.bl.der;
    const vol = r1 !== undefined ? Math.abs(r - r1) : 0.1;
    out.set(c.cut, { z: logit(r) - logit(natRight), pop: (p - natPop) / Math.max(natPop, 0.02), turnout: t, volatility: vol });
  });
  return out;
}

/** Ideología de un segmento (edad k) de la comuna c. */
export function segmentIdeology(c: ComunaStatic, lat: Latent, k: number, nat: { evang: number; cath: number; norel: number; eduSup: number }): Ideology {
  const C = TERRITORY_COEF; const i = zeroIdeology();
  for (const d of DIMS) i[d] = (C.leftRight[d] ?? 0) * lat.z * C.lrScale;
  i.seg += C.populist.seg * clamp(lat.pop, -1, 2) * 0.5;
  i.ord += C.populist.ord * clamp(lat.pop, -1, 2) * 0.5;
  i.eco += C.populist.eco * clamp(lat.pop, -1, 2) * 0.5;
  i.val += C.religionVal.evang * (c.evang - nat.evang) + C.religionVal.cath * (c.cath - nat.cath) + C.religionVal.norel * (c.norel - nat.norel);
  i.amb += C.eduAmb * (c.eduSup - nat.eduSup);
  i.inst += c.region === 'RM' ? 8 : -12 - (c.density !== null && c.density < 30 ? 8 : 0);
  const a = C.age[k];
  for (const d of DIMS) i[d] += a[d] ?? 0;
  for (const d of DIMS) i[d] = clamp(i[d], -95, 95);
  return i;
}

function comunaPriorities(c: ComunaStatic): Partial<Record<PolicyArea, number>> {
  const base: Partial<Record<PolicyArea, number>> = { ...REGION_BY_ID[c.region].priorities };
  const urban = c.density !== null && c.density > 1000;
  if (urban) base.seguridad = (base.seguridad ?? 1) + 0.3;
  if (c.wood > 0.5) { base.medioambiente = (base.medioambiente ?? 0.5) + 0.2; base.energia = (base.energia ?? 0.4) + 0.3; }
  if (c.inet < 0.4) { base.infraestructura = (base.infraestructura ?? 0.5) + 0.4; base.salud = (base.salud ?? 1) + 0.2; }
  if (c.age[3] > 0.15) base.pensiones = (base.pensiones ?? 0.6) + 0.4;
  if (c.imm > 0.12) base.migracion = (base.migracion ?? 0.5) + 0.4;
  if (c.indig > 0.3) base.descentralizacion = (base.descentralizacion ?? 0.5) + 0.3;
  return base;
}

/** Construye segmentos y estado comunal (sin calibrar afinidades). */
export function buildTerritory(mode: CalibrationMode, rng: Rng, activeParties: string[]): { segments: Segment[]; comunas: Record<string, ComunaState> } {
  const lat = latentTraits(mode);
  const el = COMUNAS.map((c) => c.electors);
  const nat = {
    evang: weightedMean(COMUNAS.map((c) => c.evang), el), cath: weightedMean(COMUNAS.map((c) => c.cath), el),
    norel: weightedMean(COMUNAS.map((c) => c.norel), el), eduSup: weightedMean(COMUNAS.map((c) => c.eduSup), el),
  };
  const segments: Segment[] = [];
  const comunas: Record<string, ComunaState> = {};
  const ages = ['joven', 'adulto', 'adulto', 'mayor'] as const;
  for (const c of COMUNAS) {
    const l = lat.get(c.cut)!;
    for (let k = 0; k < 4; k++) {
      const voters = Math.round(c.electors * c.age[k]);
      if (voters < 1) continue;
      const ideo = segmentIdeology(c, l, k, nat);
      for (const d of DIMS) ideo[d] = clamp(ideo[d] + rng.normal(0, 2), -95, 95);
      const ses = c.eduSup > 0.35 ? 'alto' : c.eduSup > 0.2 ? 'medio' : 'bajo';
      segments.push({
        id: `${c.cut}-${k}`, cut: c.cut, regionId: c.region, age: ages[k], ses, zone: c.density !== null && c.density < 60 ? 'rural' : 'urbano',
        voters, education: clamp(c.eduSup + (k === 0 ? 0.08 : k === 3 ? -0.1 : 0), 0, 1),
        interest: clamp(l.turnout * TERRITORY_COEF.turnoutAge[k] * 0.6, 0.05, 0.95), ideology: ideo, partisanship: {},
        loyalty: clamp(0.35 + k * 0.08 - l.volatility, 0.05, 0.9), econSensitivity: clamp(0.75 - c.eduSup * 0.6, 0.2, 0.9),
        institutionalTrust: clamp(0.4 - l.pop * 0.1, 0.05, 0.9), priorities: {},
      });
    }
    const vol = clamp(l.volatility * 2 + (l.pop > 0 ? l.pop * 0.1 : 0), 0.05, 0.6);
    comunas[c.cut] = {
      cut: c.cut, discontent: 40, org: Object.fromEntries(activeParties.map((p) => [p, 0.3])), campaign: {}, lastShares: {}, lastTurnout: l.turnout,
      mayorParty: null, priorities: comunaPriorities(c), baseTurnout: clamp(l.turnout, 0.3, 0.97), swing: vol,
      sens: { campaign: clamp(0.6 + vol, 0.3, 1.4), national: clamp(0.7 + (1 - c.eduSup) * 0.4, 0.5, 1.3), local: clamp(0.6 + (c.electors < 20000 ? 0.5 : 0) + c.wood * 0.2, 0.5, 1.5) },
    };
  }
  return { segments, comunas };
}

/** Objetivos de calibración: proporción de votos por partido y comuna (renormalizada a partidos activos). */
export function partyTargets(mode: CalibrationMode, active: string[], nationalFallback: Record<string, number>): Map<number, Record<string, number>> {
  const ref = REFERENCE[mode].parties;
  const out = new Map<number, Record<string, number>>();
  // media regional (para partidos ausentes en la comuna)
  const regAvg: Record<string, Record<string, number>> = {};
  const regW: Record<string, number> = {};
  for (const c of COMUNAS) {
    const sh = c.parties[ref]; if (!sh) continue;
    const acc = (regAvg[c.region] ??= {}); regW[c.region] = (regW[c.region] ?? 0) + c.electors;
    for (const [p, v] of Object.entries(sh)) acc[p] = (acc[p] ?? 0) + v * c.electors;
  }
  for (const r of Object.keys(regAvg)) for (const p of Object.keys(regAvg[r])) regAvg[r][p] /= regW[r];
  for (const c of COMUNAS) {
    const sh = c.parties[ref] ?? {};
    const t: Record<string, number> = {};
    for (const p of active) {
      const v = sh[p] ?? 0;
      const reg = regAvg[c.region]?.[p] ?? (nationalFallback[p] ?? 1) / 100;
      t[p] = Math.max(v, reg * TERRITORY_COEF.absentFloor, (nationalFallback[p] ?? 0.5) / 100 * 0.15, 0.002);
    }
    const tot = Object.values(t).reduce((a, b) => a + b, 0);
    for (const p of active) t[p] /= tot;
    out.set(c.cut, t);
  }
  return out;
}

export function nationalTargets(mode: CalibrationMode): Record<string, number> {
  const ref = REFERENCE[mode].parties;
  const acc: Record<string, number> = {}; let w = 0;
  for (const c of COMUNAS) { const sh = c.parties[ref]; if (!sh) continue; w += c.electors; for (const [p, v] of Object.entries(sh)) acc[p] = (acc[p] ?? 0) + v * c.electors; }
  for (const p of Object.keys(acc)) acc[p] = (acc[p] / w) * 100;
  return acc;
}

/** Partido del alcalde de 2021 por comuna (dato oficial; útil como incumbencia histórica). */
export function historicalMayors(): Record<number, string | null> {
  return Object.fromEntries(COMUNAS.map((c) => [c.cut, c.mayor2021]));
}

export function totalElectors(): number { return COMUNAS.reduce((a, c) => a + c.electors, 0); }

export type { GameState };
