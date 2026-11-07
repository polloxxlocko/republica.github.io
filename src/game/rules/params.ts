/**
 * PARÁMETROS CENTRALIZADOS DE LA SIMULACIÓN.
 * Todas las constantes de balance viven aquí (sin números mágicos dispersos).
 * Ver SIMULATION_RULES.md para el significado de cada coeficiente.
 */
import type { Difficulty, Dim, PolicyArea } from '../models/types';

export const DIMS: Dim[] = ['eco', 'val', 'seg', 'inst', 'amb', 'soc', 'ord', 'lab'];

/** Etiquetas de los polos de cada eje: [polo -100, polo +100] */
export const DIM_LABELS: Record<Dim, { name: string; neg: string; pos: string }> = {
  eco: { name: 'Economía', neg: 'Intervención estatal', pos: 'Libre mercado' },
  val: { name: 'Valores', neg: 'Progresismo', pos: 'Conservadurismo' },
  seg: { name: 'Seguridad', neg: 'Enfoque preventivo', pos: 'Enfoque punitivo' },
  inst: { name: 'Institucionalidad', neg: 'Descentralización', pos: 'Centralización' },
  amb: { name: 'Medioambiente', neg: 'Protección ambiental', pos: 'Crecimiento económico' },
  soc: { name: 'Política social', neg: 'Universalismo', pos: 'Focalización' },
  ord: { name: 'Orden político', neg: 'Transformación', pos: 'Continuidad institucional' },
  lab: { name: 'Relaciones laborales', neg: 'Protección laboral', pos: 'Flexibilidad' },
};

/** Relevancia de cada eje según el área prioritaria del votante */
export const AREA_DIM: Record<PolicyArea, Partial<Record<Dim, number>>> = {
  salud: { soc: 1, eco: 0.5 },
  educacion: { soc: 1, val: 0.4 },
  vivienda: { soc: 0.8, eco: 0.5 },
  pensiones: { eco: 1, soc: 0.6 },
  seguridad: { seg: 1.4 },
  trabajo: { lab: 1.2, eco: 0.4 },
  impuestos: { eco: 1.2 },
  transporte: { inst: 0.5, eco: 0.3 },
  energia: { amb: 0.8, eco: 0.4 },
  medioambiente: { amb: 1.3 },
  descentralizacion: { inst: 1.3 },
  infraestructura: { amb: 0.4, inst: 0.4 },
  exterior: { ord: 0.4 },
  migracion: { seg: 0.9, val: 0.5 },
  ciencia: { soc: 0.2, amb: 0.2 },
  economia: { eco: 1, lab: 0.3 },
  probidad: { ord: 0.7 },
};

export const AREA_LABELS: Record<PolicyArea, string> = {
  salud: 'Salud', educacion: 'Educación', vivienda: 'Vivienda', pensiones: 'Pensiones', seguridad: 'Seguridad',
  trabajo: 'Trabajo', impuestos: 'Impuestos', transporte: 'Transporte', energia: 'Energía',
  medioambiente: 'Medioambiente', descentralizacion: 'Descentralización', infraestructura: 'Infraestructura',
  exterior: 'Política exterior', migracion: 'Migración', ciencia: 'Ciencia y tecnología', economia: 'Economía', probidad: 'Probidad',
};

/** Función de utilidad electoral (modelo logit multinomial). */
export const VOTE = {
  /** Penalización por distancia ideológica ponderada (distancia normalizada 0..~2) */
  betaIdeology: 2.4,
  /** Identificación partidaria (0..1) */
  betaPartisanship: 2.0,
  /** Peso de la identificación partidaria en elecciones unipersonales (calibrado en muestra, 2ª vuelta 2021) */
  affinityPersonal: 0.6,
  /** Escala del logit en elecciones unipersonales (heterogeneidad individual; calibrada en muestra) */
  personalScale: 0.45,
  /** Popularidad del partido (centrada en 50, escala /50) */
  betaPopularity: 0.9,
  /** Rechazo del partido (0..1) */
  betaRejection: 1.4,
  /** Evaluación del gobierno sobre partidos oficialistas/opositores */
  betaGovernment: 0.9,
  /** Efecto campaña: beta * sqrt(gasto relativo) (rendimientos decrecientes) */
  betaCampaign: 0.35,
  /** Organización territorial (0..1) */
  betaTerritorial: 0.8,
  /** Credibilidad (centrada en 50) */
  betaCredibility: 0.35,
  /** Calidad del candidato (elecciones personales; centrada en 50) */
  betaCandidate: 1.1,
  /** Bono de voto útil por tamaño (presidenciales) */
  betaViability: 0.25,
  /** Utilidad constante del voto blanco/nulo */
  blankUtility: -2.6,
  /** Desviación de shocks de partido-región por elección */
  electionNoise: 0.18,
  /** Participación con voto obligatorio (Ley 21.524 aprox.), base */
  baseTurnout: 0.84,
  /** Participación en primarias (voluntaria) */
  primaryTurnout: 0.18,
};

export const ECON = {
  okun: 0.35,                // pp desempleo por pp de brecha
  naturalUnemployment: 7.8,
  inflationTarget: 3,
  phillips: 0.18,            // pp inflación por pp de brecha
  passThrough: 0.08,         // traspaso cambiario por 10% de depreciación
  copperRevenueElasticity: 0.18, // % PIB de ingresos por USD/lb sobre referencia
  copperRef: 3.8,
  copperGrowthEffect: 0.25,  // pp crecimiento por USD/lb de desviación
  fiscalMultiplierSlack: 0.8,
  fiscalMultiplierTight: 0.3,
  taylorInflation: 1.5,
  taylorGap: 0.5,
  neutralRate: 4.0,
  rateSmoothing: 0.75,
  monetaryLag: 0.12,         // efecto de la TPM sobre la brecha por mes
  structuralBalanceTarget: -1.0, // meta (% PIB)
  debtInterest: 0.035,
};

export const OPINION = {
  approvalInertia: 0.9,
  honeymoonBonus: 12,
  honeymoonWeeks: 16,
  approvalBase: 42,
  unemploymentWeight: 1.6,
  inflationWeight: 1.2,
  growthWeight: 1.4,
  securityWeight: 0.25,
  scandalWeight: 0.35,
};

export const PARLIAMENT = {
  deputies: 155,
  senators: 50,
  /** Pesos de la probabilidad de votar a favor (logit) */
  wIdeology: 3.2,
  wPartyLine: 3.0,
  wGovernment: 0.9,
  wPopularity: 0.6,
  wNegotiated: 1.0,
  wRelation: 0.5,
  abstentionBand: 0.18,
  committeeSize: { camara: 13, senado: 5 },
  /** Semanas por etapa según urgencia */
  stageWeeks: { ninguna: 8, simple: 4, suma: 2, discusion_inmediata: 1 } as Record<string, number>,
  vetoInsistence: 2 / 3,
  /** Archivo por inactividad (semanas) */
  archiveAfter: 104,
};

/** Quórums (fracción). "en ejercicio" = sobre miembros en ejercicio. Configurable. */
export const QUORUMS = {
  simple: { fraction: 0.5, base: 'presentes' as const },
  absoluta: { fraction: 0.5, base: 'ejercicio' as const },
  // Nota: se modela LOC con 4/7 en ejercicio de manera configurable; verificar normativa vigente.
  loc: { fraction: 4 / 7, base: 'ejercicio' as const },
  reforma_constitucional: { fraction: 4 / 7, base: 'ejercicio' as const },
};

export const PLAYER = {
  baseActionPoints: 3,
  autosaveWeeks: 4,
};

export const DIFFICULTY: Record<Difficulty, {
  aiSkill: number; pollNoise: number; startFunds: number; negotiation: number; errorTolerance: number; eventPressure: number; label: string;
}> = {
  facil: { aiSkill: 0.45, pollNoise: 0.7, startFunds: 1.6, negotiation: 0.15, errorTolerance: 1.4, eventPressure: 0.7, label: 'Fácil' },
  normal: { aiSkill: 0.7, pollNoise: 1, startFunds: 1, negotiation: 0, errorTolerance: 1, eventPressure: 1, label: 'Normal' },
  dificil: { aiSkill: 0.88, pollNoise: 1.25, startFunds: 0.75, negotiation: -0.12, errorTolerance: 0.8, eventPressure: 1.2, label: 'Difícil' },
  experto: { aiSkill: 1, pollNoise: 1.5, startFunds: 0.55, negotiation: -0.22, errorTolerance: 0.6, eventPressure: 1.4, label: 'Experto' },
};

export const PARTY = {
  /** Umbral legal simplificado: 5% nacional o 4 parlamentarios (ver SIMULATION_RULES.md) */
  survivalPct: 5,
  survivalParliamentarians: 4,
  leadershipTermWeeks: 104,
  maxDriftPerWeek: 0.35,
  schismDiscontent: 82,
  publicFundingPerVote: 0.00004, // millones CLP por voto/semana (aprox. financiamiento permanente)
};

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
