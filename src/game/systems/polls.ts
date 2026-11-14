/**
 * ENCUESTAS — capa de compatibilidad. El sistema completo vive en src/game/polling (registro de
 * encuestadoras, motor muestral, calendario, promedio, reacciones, estudios privados e historial).
 * Aquí quedan las funciones que leen la información PÚBLICA para la IA y otros sistemas.
 */
import type { GameState, Poll } from '../models/types';
import { buildUtilityContext, computeShares } from './electorate';
import { aggregate } from '../polling/aggregator';
import { previewPresidentialField, presidentialOptions } from '../polling/field';

export { previewPresidentialField };

export function marginOfError(n: number): number { return 1.96 * Math.sqrt(0.25 / n) * 100; }

/** Intención presidencial «real» del motor (estado oculto: solo para el motor, nunca para la interfaz). */
export function presidentialIntention(s: GameState): Record<string, number> {
  const opts = presidentialOptions(s);
  if (opts.length === 0) return {};
  const res = computeShares(s, opts, buildUtilityContext(s, true));
  const out: Record<string, number> = {};
  for (const o of opts) out[o.key] = ((res.national[o.key] ?? 0) / Math.max(res.totalValid, 1)) * 100;
  return out;
}

/**
 * Promedio PÚBLICO de encuestas (lo que ven el jugador y la IA), con el agregador ponderado:
 * antigüedad, tamaño efectivo, tope por encuestadora y corrección parcial de efectos de casa.
 * Si no hay mediciones en la ventana pedida, se amplía hasta 16 semanas.
 */
const avgCache = new WeakMap<GameState, Map<string, Record<string, number>>>();
export function pollAverage(s: GameState, kind: Poll['kind'], weeks = 8): Record<string, number> {
  const key = `${s.week}|${kind}|${weeks}|${s.polls.length}|${s.polls[s.polls.length - 1]?.id ?? ''}`;
  let c = avgCache.get(s); if (!c) { c = new Map(); avgCache.set(s, c); }
  const hit = c.get(key); if (hit) return { ...hit };
  const res = computePollAverage(s, kind, weeks);
  c.set(key, res);
  return { ...res };
}

function computePollAverage(s: GameState, kind: Poll['kind'], weeks: number): Record<string, number> {
  const ms = s.polls.filter((p) => p.kind === kind).map((p) => ({ house: p.pollster, week: p.week, n: p.sample, effN: p.effN ?? p.sample / 2, values: p.values }));
  const agg = aggregate(ms, { asOf: s.week, window: weeks }) ?? aggregate(ms, { asOf: s.week, window: Math.max(weeks, 16) });
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(agg?.values ?? {})) out[k] = v.mean;
  return out;
}

/**
 * Apoyo regional PERCIBIDO por los actores (información imperfecta): último resultado regional
 * ajustado por la variación del promedio de encuestas nacional. La IA nunca lee la intención real.
 */
export function perceivedSupport(s: GameState, regionId: import('../models/types').RegionId): Record<string, number> {
  const reg = s.regions[regionId];
  const polls = pollAverage(s, 'partidos', 8);
  const lastNat: Record<string, number> = {};
  for (const r of Object.values(s.regions)) for (const [p, v] of Object.entries(r.lastResults)) lastNat[p] = (lastNat[p] ?? 0) + v / 16;
  const out: Record<string, number> = {};
  for (const p of Object.values(s.parties)) {
    if (!p.active || p.legalStatus === 'en_formacion') continue;
    const base = reg.lastResults[p.id];
    const poll = polls[p.id];
    if (base !== undefined && poll !== undefined && lastNat[p.id]) out[p.id] = base * Math.min(3, Math.max(0.3, (poll / 100) / lastNat[p.id] / 0.82));
    else out[p.id] = poll !== undefined ? poll / 100 : 0.01;
  }
  const tot = Object.values(out).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(out)) out[k] /= tot;
  return out;
}
