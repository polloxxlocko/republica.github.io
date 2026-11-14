/**
 * Tipos del sistema de encuestas. Los resultados publicados son SIEMPRE ficticios (generados por la
 * partida); los antecedentes de las encuestadoras reales viven aparte, en registry.ts, y los datos
 * históricos reales —si se agregan— en src/data/polling/historicalSurveys.ts (solo lectura).
 */
import type { PolicyArea, RegionId } from '../models/types';

export type SurveyMode = 'cati_celulares' | 'online_panel' | 'presencial' | 'mixto';
export type SurveyDesign = 'probabilistico' | 'no_probabilistico';
export type WeightVar = 'edad' | 'nse' | 'zona' | 'macrozona' | 'sexo';
export type Coverage = 'nacional' | 'regional' | 'comunal' | 'distrito';

export type SurveyTopic =
  | 'aprobacion' | 'evaluacion_gobierno' | 'partidos' | 'presidencial_espontanea' | 'presidencial_lista'
  | 'segunda_vuelta' | 'rechazo' | 'participacion' | 'figuras' | 'confianza' | 'identificacion'
  | 'economia' | 'problemas' | 'seguridad' | 'expectativas' | 'politica_publica' | 'conocimiento';

/** Período metodológico de un estudio (configurable por escenario: cambia con el tiempo). */
export interface MethodPeriod {
  from: string;                 // ISO (inclusive)
  to?: string;                  // ISO (exclusivo)
  mode: SurveyMode;
  design: SurveyDesign;
  sample: [number, number];     // rango de tamaño muestral simulado
  weighting: WeightVar[];
  universe: string;             // texto del universo declarado
  /** Exclusiones de cobertura (CUT de comunas) y restricciones de NSE documentadas */
  excludeCuts?: number[];
  excludeLowSes?: number;       // 0..1: fracción del NSE bajo fuera del universo/panel
  /** Cobertura parcial por comunas (p. ej., panel presente en ~170 comunas): fracción de población cubierta */
  comunaCoverage?: number;
  note: string;                 // descripción verificable del período
  source: string;               // URL de la fuente que respalda el período
}

export interface ScheduleRule {
  everyWeeks: number;           // cadencia normal
  campaignEveryWeeks: number;   // cadencia en campaña (≤ 16 semanas antes de una elección nacional)
  /** Probabilidad de una edición extraordinaria («flash») en semanas de crisis grave */
  flashInCrisis: number;
  offset: number;               // desfase inicial en semanas
}

export interface PollsterProfile {
  id: string;
  name: string;                 // nombre del estudio
  organization: string;         // organización responsable
  fictionalName: string;        // alternativa ficticia (si se prefieren nombres no reales)
  fictionalOrganization: string;
  real: boolean;                // false = organización ficticia del juego
  coverage: Coverage;
  periodicity: string;          // periodicidad documentada (texto)
  topics: SurveyTopic[];        // temáticas habituales
  /** Probabilidad de incluir cada temática en una edición (no todas en cada edición) */
  topicRate: Partial<Record<SurveyTopic, number>>;
  activeSince: string;          // período de funcionamiento documentado (texto)
  activeFrom: string;           // ISO
  methods: MethodPeriod[];
  schedule: ScheduleRule;
  sources: string[];
  caveats: string;
}

export interface SurveyOption { key: string; label: string; pct: number }

export interface SurveyQuestion {
  id: string;
  topic: SurveyTopic;
  text: string;                 // formulación
  options: SurveyOption[];      // porcentajes sobre la base de la pregunta (incluye NS/NR cuando aplica)
  base: number;                 // casos que respondieron la pregunta
  effN: number;                 // tamaño efectivo (tras ponderación y diseño)
  /** Valor resumen (p. ej., nota promedio 1–7) */
  mean?: number;
  /** Pares de segunda vuelta, figuras, instituciones… */
  subject?: string;
  hypothetical?: boolean;
  /** Desagregación territorial solo si la submuestra es suficiente */
  territorial?: { label: string; n: number; options: SurveyOption[] }[];
}

export interface Uncertainty {
  kind: 'moe' | 'orientativo';
  /** ± pp para una proporción de 50% con n efectivo */
  pp: number;
  text: string;
}

export interface Survey {
  id: string;
  pollsterId: string;
  edition: number;
  publishedWeek: number;
  fieldStartWeek: number;
  fieldEndWeek: number;
  fieldDays: number;
  coverage: Coverage;
  territory?: { regionId?: RegionId; cut?: number; district?: number; label: string };
  universe: string;
  mode: SurveyMode;
  design: SurveyDesign;
  weighting: WeightVar[];
  n: number;
  uncertainty: Uncertainty;
  methodNote: string;
  questions: SurveyQuestion[];
  veda?: boolean;               // edición sin preguntas electorales por veda legal
  flash?: boolean;
  privateFor?: string;          // personaje que encargó el estudio (no se publica)
  headline: string;
  reactions: string[];
}

/** Parámetros ficticios del modelo por encuestadora (estado oculto de la partida). */
export interface HouseState {
  /** desplazamiento logit por opción (partidos, candidaturas) */
  offsets: Record<string, number>;
  approval: number;             // desplazamiento logit en aprobación
  undecided: number;            // multiplicador del tratamiento de indecisos
  methodFrom: string;           // período metodológico al que corresponden
}

export interface PrivateOrder {
  id: string;
  study: PrivateStudy;
  orderedWeek: number;
  readyWeek: number;
  cost: number;
  target?: { regionId?: RegionId; cut?: number; district?: number; area?: PolicyArea };
}

export type PrivateStudy = 'sondeo_comunal' | 'estudio_regional' | 'conocimiento' | 'imagen' | 'programa' | 'apoyo_candidatura';

export interface PollEvaluation {
  resultId: string;
  electionType: string;
  week: number;
  rows: { pollsterId: string; surveyId: string; fieldEndWeek: number; mae: number; maxErr: number; marginErr: number; per: Record<string, { poll: number; result: number }> }[];
  aggregate?: { mae: number; maxErr: number; marginErr: number };
}

export interface PollingState {
  surveys: Survey[];            // publicaciones simuladas (ficticias)
  house: Record<string, HouseState>;
  common: Record<string, number>;   // componente común a todas las encuestadoras (logit)
  commonApproval: number;
  nextDue: Record<string, number>;
  editions: Record<string, number>;
  orders: PrivateOrder[];
  evaluations: PollEvaluation[];
  lastPrivateWeek: number;
}
