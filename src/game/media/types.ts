/**
 * Tipos del ecosistema de medios. Los PERFILES de medios reales (registry.ts) son datos verificados
 * con fuente y fecha; la COBERTURA, los periodistas y las entrevistas son simulación ficticia.
 */
import type { NewsItem, PolicyArea, RegionId } from '../models/types';

export type OutletType = 'diario' | 'digital' | 'radio' | 'tv' | 'investigacion';
export type Scope = 'nacional' | 'regional' | 'provincial';

/** Prioridades editoriales: PARÁMETROS DEL MODELO (0..1), no mediciones. */
export interface EditorialPriorities {
  economia: number; social: number; seguridad: number; institucional: number;
  investigacion: number; regional: number; inmediatez: number; analisis: number;
}

/** Percepción de la orientación política por las audiencias (estudio con fecha). */
export interface PerceptionRecord {
  studyId: string;
  /** % que ubica al medio en izquierda (1–3), centro (4) o derecha (5–7) */
  left: number; center: number; right: number;
  /** promedio 1–7 según la orientación de quien responde (izquierda, centro, derecha) y total */
  meanByAudience?: { left: number; center: number; right: number; all: number };
}
export interface CredibilityRecord { studyId: string; nseAlto: number; nseMedio: number; nseBajo: number }
export interface ConsumptionRecord {
  studyId: string;
  /** consumo declarado 1–7 por tipo de consumo */
  activo: number; mixto: number; pasivo: number;
  capital?: number; regiones?: number;
  /** diferencia de consumo entre audiencias alineadas y no alineadas con la orientación percibida */
  alignedGap?: number;
}

export interface OutletProfile {
  id: string;
  name: string;
  type: OutletType;
  scope: Scope;
  regionId?: RegionId;
  /** CUT de las comunas del ámbito provincial/comunal */
  cuts?: number[];
  coverageTopics: string;
  founded?: { year: number; note?: string; source: string };
  /** evidencia de funcionamiento a la fecha de referencia */
  activeEvidence: { asOf: string; source: string };
  owner?: { name: string; source: string };
  relations?: { text: string; source: string }[];
  /** posiciones editoriales expresas documentadas (vacío si no se registraron) */
  editorialPositions: { text: string; source: string }[];
  perception: PerceptionRecord[];
  credibility: CredibilityRecord[];
  consumption: ConsumptionRecord[];
  priorities: EditorialPriorities;
  /** capacidad de cobertura semanal (parámetro del modelo) */
  capacity: number;
  formats: string[];
  notes?: string;
}

export interface Study {
  id: string;
  title: string;
  authors: string;
  fieldwork: string;        // ISO de fin del trabajo de campo (fecha de referencia)
  published: string;
  method: string;
  sample: number;
  url: string;
  limitations: string;
}

export type Frame = 'fiscal' | 'social' | 'legal' | 'economico' | 'gestion' | 'territorial' | 'partidario' | 'transparencia' | 'seguridad' | 'humano';
export type Depth = 'breve' | 'nota' | 'reportaje' | 'analisis' | 'entrevista';

/** Hecho de la simulación (lo que ocurrió). La cobertura nunca agrega hechos. */
export interface MediaEvent {
  id: string;
  week: number;
  newsId: string;           // NewsItem principal asociado
  category: NewsItem['category'];
  headline: string;         // titular factual (generado por el sistema que produjo el hecho)
  body: string;
  importance: number;       // 1..5
  tone: -1 | 0 | 1;         // valencia del hecho para sus protagonistas
  subjectLean: number;      // -1 izquierda … +1 derecha: a qué sector favorece (0 neutro)
  scope: Scope;
  regionId?: RegionId;
  cut?: number;
  actors: string[];         // personajes involucrados
  parties: string[];
  frames: Frame[];          // dimensiones disponibles del hecho
  area?: PolicyArea;
  stage: Scope;             // nivel de difusión alcanzado
  virality: number;         // circulación digital 0..1
  social?: { shares: number; positive: number; negative: number; neutral: number; comments: string[] };
  verified: boolean;        // hay información verificable (hechos institucionales: sí)
}

export interface CoverageItem {
  id: string;
  eventId: string;
  outletId: string;
  week: number;
  // titular y bajada se derivan del hecho y del enfoque al mostrarse (covHeadline / covDek)
  frame: Frame;
  depth: Depth;
  tone: number;             // -1..1 tono de la cobertura hacia los protagonistas
  pickedUp?: boolean;       // recogida desde un medio de menor alcance
  journalistId?: string;
  applied?: boolean;        // efectos sobre carreras ya aplicados
}

export type InterviewStyle = 'incisivo' | 'cordial' | 'tecnico' | 'confrontacional' | 'directo';
export interface Journalist {
  id: string;
  name: string;
  outletId: string;
  specialty: 'politica' | 'economia' | 'seguridad' | 'investigacion' | 'regiones' | 'social';
  experience: number;       // años
  style: InterviewStyle;
  interests: PolicyArea[];
  relation: number;         // -100..100 con el jugador
  colleagues: string[];     // relaciones profesionales (otros periodistas)
  history: { week: number; kind: 'invitacion' | 'entrevista' | 'rechazo' | 'cobertura'; note: string; result?: number }[];
}

export interface InterviewQuestion {
  id: string;
  topic: string;
  text: string;
  followUp?: boolean;
  options: { id: 'datos' | 'linea' | 'propia' | 'evadir'; label: string }[];
  answer?: 'datos' | 'linea' | 'propia' | 'evadir';
  result?: 'bien' | 'regular' | 'mal';
}
export interface InterviewInvite {
  id: string;
  journalistId: string;
  outletId: string;
  week: number;
  expiresWeek: number;
  reason: string;
  status: 'pendiente' | 'aceptada' | 'rechazada' | 'expirada' | 'realizada';
  questions?: InterviewQuestion[];
  outcome?: { score: number; summary: string; effects: string[] };
}

export interface Appearance {
  week: number;
  outletId: string;
  kind: 'entrevista' | 'cobertura' | 'viral';
  eventId?: string;
  tone: number;
  effects: string[];
}

export interface FictionalOutlet extends OutletProfile { fictional: true; createdWeek: number; closedWeek?: number }

export interface MediaState {
  events: MediaEvent[];
  coverage: CoverageItem[];
  journalists: Journalist[];
  invites: InterviewInvite[];
  appearances: Appearance[];
  /** variación simulada de audiencia (multiplicador) por medio: historia alternativa del juego */
  audience: Record<string, number>;
  fictional: FictionalOutlet[];
  /** registro de cambios de historia alternativa (rotulados como ficción) */
  altHistory: { week: number; text: string }[];
  /** consumo vía redes sociales (tendencia simulada) */
  socialShare: number;
}
