/**
 * JUGABILIDAD POLÍTICA — tipos. Distingue:
 *  · ACONTECIMIENTO (evento): algo puntual que exige o permite una decisión.
 *  · TRAMA: proceso político de varias etapas que agrupa acontecimientos relacionados.
 *  · INICIATIVA: proyecto propio del jugador, de semanas o meses, con resultado incierto.
 *  · AMBICIÓN: meta declarada que orienta iniciativas (no garantiza oportunidades).
 * Todo el estado es serializable (GameState.politics); las definiciones son código.
 */
import type { GameState, RegionId } from '../models/types';
import type { Rng } from '../engine/rng';

export type Tier = 'cotidiano' | 'relevante' | 'extraordinario';
export type EventCat = 'inicial' | 'interna' | 'personal' | 'territorial' | 'campana' | 'institucional' | 'prensa' | 'trayectoria';
export type Ctx = Record<string, string | number>;

export interface EventOptionView { id: string; label: string; hint?: string }
export interface PoliticalEvent {
  id: string; defId: string; cat: EventCat; tier: Tier;
  week: number; expires: number;
  title: string; text: string;
  actors: string[]; cut?: number; regionId?: RegionId;
  ctx: Ctx; options: EventOptionView[];
  arcId?: string; initiativeId?: string;
  status: 'pendiente' | 'resuelto' | 'vencido';
  choice?: string; outcome?: string;
  /** personas reales involucradas: la situación es ficticia y se rotula */
  fiction?: boolean;
}

export type ArcStatus = 'activa' | 'escalando' | 'latente' | 'suspendida' | 'resuelta';
export interface Arc {
  id: string; defId: string; title: string; conflict: string;
  participants: string[]; partyId?: string; regionId?: RegionId;
  startWeek: number; lastWeek: number;
  stage: string; heat: number;          // intensidad 0..100: escala o pierde importancia
  status: ArcStatus; resolution?: string;
  /** objetivos declarados de los protagonistas (narrativos, derivados del estado) */
  goals: Record<string, string>;
  playerSide?: string;                  // con quién se alineó el jugador (id o 'propio' / 'neutral')
  ctx: Ctx;
  history: { week: number; text: string }[];
  spawnedFrom?: string;
}

export type InitiativeStatus = 'en_curso' | 'exitosa' | 'fallida' | 'abandonada' | 'suspendida';
export interface InitiativeStepLog { week: number; text: string; tone: -1 | 0 | 1 }
export interface Initiative {
  id: string; defId: string; title: string; objective: string;
  ownerId: string; participants: string[];
  startWeek: number; deadline: number; status: InitiativeStatus;
  requirements: string[];
  /** apoyos concretos conseguidos (personajes) y fuerza acumulada (oculta al jugador: no es una barra) */
  supporters: string[]; opponents: string[]; strength: number;
  resources: { pa: number; funds: number };
  obstacles: { id: string; text: string; active: boolean }[];
  risks: string[];
  commitments: string[];
  stepsDone: Record<string, number>;
  cut?: number; regionId?: RegionId; ctx: Ctx;
  log: InitiativeStepLog[];
  result?: string;
}

export type AmbitionKind = 'cargo_partidario' | 'candidatura' | 'congreso' | 'alcaldia' | 'territorio' | 'gabinete' | 'presidir_partido' | 'movimiento_propio' | 'presidencia';
export interface Ambition { kind: AmbitionKind; week: number }

export interface WorldMove { week: number; actorId: string; text: string; kind: 'candidatura' | 'alianza' | 'reunion' | 'respaldo' | 'iniciativa' | 'postura' | 'interna' | 'equipo' | 'retiro' | 'conflicto'; arcId?: string; regionId?: RegionId; nearPlayer: boolean }

/** Oportunidad escasa en disputa (cupo, presidencia, puesto en equipo) con competidores autónomos. */
export interface Contest {
  id: string; label: string; kind: 'candidatura' | 'presidencia_comunal' | 'presidencia_regional' | 'equipo' | 'respaldo_faccion' | 'designacion';
  closeWeek: number; status: 'abierta' | 'resuelta';
  contenders: { id: string; strategy: 'compite' | 'negocia' | 'busca_apoyos' | 'se_retira' | 'respalda'; backs?: string; score: number }[];
  winner?: string; initiativeId?: string; arcId?: string; regionId?: RegionId; cut?: number; partyId?: string;
}

/** Acción contextual concreta (sustituye a las acciones genéricas): objetivo, personas, territorio,
 *  duración, recursos, obstáculos y resultados posibles (sin probabilidades). */
export interface ContextOffer {
  id: string; tpl: string; variant: string; week: number;
  title: string; objective: string; persons: string[]; cut?: number;
  weeks: number; cost: number; funds: number;
  obstacles: string[]; outcomes: string[]; ctx: Ctx;
}
export interface ContextTask { id: string; tpl: string; variant: string; title: string; startWeek: number; dueWeek: number; persons: string[]; cut?: number; ctx: Ctx; result?: string }

export interface PoliticsState {
  offers: ContextOffer[];
  tasks: ContextTask[];
  events: PoliticalEvent[];
  arcs: Arc[];
  initiatives: Initiative[];
  contests: Contest[];
  ambition: Ambition | null;
  ambitionHistory: Ambition[];
  feed: WorldMove[];
  followups: { week: number; defId: string; ctx: Ctx }[];
  cooldowns: Record<string, number>;
  counts: Record<string, number>;
  pacing: { lastSignificant: number; lastExtraordinary: number; quiet: number; decisions: number[] };
}

// ───────────────────────────── Definiciones ─────────────────────────────
/** Mundo de evaluación de un acontecimiento (selectores y efectos). */
export interface W { s: GameState; rng: Rng }

export interface EventOptionDef {
  id: string; label: string | ((w: W, ctx: Ctx) => string); hint?: string;
  /** condiciones: si no se cumplen, la opción no aparece */
  when?: (w: W, ctx: Ctx) => boolean;
  run: (w: W, ctx: Ctx, ev: PoliticalEvent) => string;
}

export interface EventDef {
  id: string; cat: EventCat; tier: Tier;
  /** prioridad para el director de ritmo (mayor = se prefiere si compiten) */
  priority: number;
  cooldown: number;
  /** etiquetas para exclusiones mutuas (no dos del mismo tipo pendientes a la vez) */
  tags?: string[];
  /** condiciones obligatorias + elección de personajes y territorio; null = no aplica */
  require: (w: W) => Ctx | null;
  /** condiciones favorecedoras: multiplicador de probabilidad (1 = neutro) */
  favor?: (w: W, ctx: Ctx) => number;
  /** probabilidad contextual base por semana */
  p: number;
  /** pertenece a una etapa de trama: solo surge desde la trama, nunca suelto */
  arcOnly?: boolean;
  title: (w: W, ctx: Ctx) => string;
  text: (w: W, ctx: Ctx) => string;
  options: EventOptionDef[];
  expires?: number;
  /** si vence sin respuesta se aplica esta opción */
  onExpire?: string;
}

export interface ArcStageDef { id: string; label: string; events: string[]; next?: string[] }
export interface ArcDef {
  id: string; title: string;
  /** condiciones de inicio y protagonistas */
  start: (w: W) => (Partial<Omit<Arc, 'id' | 'defId' | 'startWeek' | 'lastWeek' | 'status' | 'history' | 'stage'>> & { title: string; conflict: string }) | null;
  p: number; cooldown: number;
  stages: ArcStageDef[];
  /** evolución semanal autónoma (escala, decae, cambia protagonistas); devuelve texto para el feed o null */
  tick: (w: W, a: Arc) => string | null;
  /** condición de resolución; devuelve la resolución o null */
  resolve: (w: W, a: Arc) => string | null;
  /** consecuencias persistentes y posibles tramas derivadas */
  onResolve: (w: W, a: Arc) => void;
}

export interface InitiativeStepDef {
  id: string; label: string; detail: string; cost: number; funds?: number;
  /** máximo de veces (rendimientos decrecientes después de la primera) */
  max?: number;
  when?: (w: W, i: Initiative) => string | null; // motivo de bloqueo
  run: (w: W, i: Initiative) => string;
}
export interface InitiativeDef {
  id: string; title: string; ambition: AmbitionKind[];
  /** disponible y por qué no; construye objetivos, participantes, territorio, plazo */
  available: (w: W) => { ok: true; build: () => Omit<Initiative, 'id' | 'defId' | 'ownerId' | 'startWeek' | 'status' | 'supporters' | 'opponents' | 'strength' | 'resources' | 'commitments' | 'stepsDone' | 'log'> } | { ok: false; why: string } | null;
  steps: InitiativeStepDef[];
  /** obstáculos que pueden aparecer durante el proceso (acontecimientos ligados) */
  obstacleEvents?: string[];
  /** desenlace incierto al vencer el plazo o cuando se fuerza la definición */
  conclude: (w: W, i: Initiative) => { success: boolean; text: string };
}
