/**
 * SURVEY METHODOLOGY — efectos de medición según la MODALIDAD y el DISEÑO (no según la organización).
 *
 * Los factores de cobertura por modalidad son supuestos genéricos del modelo, inspirados en
 * regularidades conocidas de la investigación por encuestas: los paneles online sobrerrepresentan a
 * personas conectadas, más educadas y más interesadas en política; el teléfono pierde a parte de los
 * mayores y del mundo rural; la entrevista presencial cubre mejor, con algo de no respuesta. NO son
 * evaluaciones de ninguna empresa real. Los efectos específicos de cada estudio dentro de la partida
 * (HouseState) se sortean con la semilla y se rotulan como «parámetros ficticios del modelo».
 */
import type { Segment } from '../models/types';
import type { Rng } from '../engine/rng';
import type { HouseState, MethodPeriod, SurveyMode } from './types';

/** Probabilidad relativa de que una persona del segmento termine en la muestra. */
export function inclusionFactor(mode: SurveyMode, seg: Segment): number {
  const age = seg.age === 'joven' ? 0 : seg.age === 'adulto' ? 1 : 2;
  const ses = seg.ses === 'bajo' ? 0 : seg.ses === 'medio' ? 1 : 2;
  switch (mode) {
    case 'online_panel':
      return [1.25, 1.05, 0.6][age] * [0.7, 1.05, 1.35][ses] * (seg.zone === 'rural' ? 0.55 : 1.05) * (0.6 + 0.8 * seg.interest) * (0.8 + 0.4 * seg.education);
    case 'cati_celulares':
      return [0.9, 1.05, 0.85][age] * [0.9, 1.0, 1.05][ses] * (seg.zone === 'rural' ? 0.8 : 1.0) * (0.8 + 0.4 * seg.interest);
    case 'presencial':
      return [0.95, 1.0, 1.05][age] * [1.0, 1.0, 0.85][ses] * (0.92 + 0.16 * seg.interest);
    case 'mixto':
      return [1.0, 1.0, 0.85][age] * [0.85, 1.0, 1.15][ses] * (seg.zone === 'rural' ? 0.75 : 1.0) * (0.75 + 0.5 * seg.interest);
  }
}

/** Efecto de diseño base (más allá de la ponderación) usado para la incertidumbre orientativa. */
export function baseDesignEffect(m: MethodPeriod): number {
  if (m.design === 'probabilistico') return m.mode === 'presencial' ? 1.6 : 1.4; // conglomerados / no respuesta
  return 2.0; // muestras no probabilísticas: la incertidumbre real supera la muestral
}

/** Propensión base a declararse indeciso/a según la modalidad (sin entrevistador, se declara más NS). */
export function undecidedBase(mode: SurveyMode): number {
  return mode === 'online_panel' ? 0.2 : mode === 'presencial' ? 0.15 : 0.13;
}

export function initHouse(rng: Rng, from: string, keys: string[]): HouseState {
  const offsets: Record<string, number> = {};
  for (const k of keys) offsets[k] = rng.normal(0, 0.09);
  return { offsets, approval: rng.normal(0, 0.1), undecided: Math.exp(rng.normal(0, 0.15)), methodFrom: from };
}

/** Deriva lenta de los parámetros ficticios (AR(1)): las desviaciones persisten, pero no son eternas. */
export function evolveHouse(h: HouseState, rng: Rng, keys: string[]): void {
  const phi = 0.94; const sd = 0.09 * Math.sqrt(1 - phi * phi);
  for (const k of keys) h.offsets[k] = phi * (h.offsets[k] ?? rng.normal(0, 0.09)) + rng.normal(0, sd);
  h.approval = phi * h.approval + rng.normal(0, 0.1 * Math.sqrt(1 - phi * phi));
}

/** Componente común a todas las encuestadoras (p. ej., quienes responden encuestas en general). */
export function evolveCommon(common: Record<string, number>, rng: Rng, keys: string[]): void {
  const phi = 0.96; const sd = 0.07 * Math.sqrt(1 - phi * phi);
  for (const k of keys) common[k] = phi * (common[k] ?? rng.normal(0, 0.07)) + rng.normal(0, sd);
}
