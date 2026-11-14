/**
 * SISTEMA DE CONVERSACIONES — tipos. Todo el ESTADO es serializable (GameState.dialogue); las
 * DEFINICIONES (plantillas, condiciones, decisiones) son código y se referencian por id.
 */
import type { GameState, OfficeType, PolicyArea, RegionId } from '../models/types';
import type { Rng } from '../engine/rng';

export type DialogueArea = 'vida_partidaria' | 'relaciones' | 'territorial' | 'campanas' | 'internas' | 'parlamento' | 'gobierno' | 'crisis' | 'coaliciones' | 'carrera' | 'prensa';
export type DialogueKind = 'breve' | 'estrategica' | 'decisiva' | 'colectiva';
export type VerbalStyle = 'formal' | 'directo' | 'conciliador' | 'reservado' | 'tecnico' | 'persuasivo' | 'institucional';
export type Formality = 'informal' | 'privada' | 'asamblea' | 'institucional' | 'parlamentaria' | 'ministerial';
export type Importance = 'menor' | 'relevante' | 'compromiso' | 'decisivo';

/** Dimensiones almacenadas de una relación DIRECCIONAL (de `from` hacia `to`), -100..100 o 0..100. */
export interface CharacterRelationship {
  from: string; to: string;
  trust: number;          // confianza general
  respect: number;        // respeto político (capacidad)
  cooperation: number;    // historial de cooperación
  rivalry: number;        // rivalidad 0..100
  reliability: number;    // confianza en que cumple acuerdos
  personal: number;       // afinidad personal simulada
  willingness: number;    // disposición a negociar
  familiarity: number;    // conocimiento mutuo 0..100
  dependence: number;     // cuánto depende políticamente `from` de `to` 0..100
  lastWeek: number;
  /** rendimientos decrecientes: ganancias positivas acumuladas en la ventana reciente */
  recentGain: number; recentWeek: number;
}
/** Dimensiones derivadas del estado (no se almacenan): afinidad ideológica, competencia, influencia relativa. */
export interface DerivedRelation { ideological: number; competition: number; influence: number }

export interface CharacterMemory {
  id: string;
  owner: string;          // quién recuerda
  about: string;          // de quién
  participants: string[];
  week: number;
  kind: 'primer_encuentro' | 'apoyo_recibido' | 'apoyo_rechazado' | 'acuerdo' | 'promesa_cumplida' | 'promesa_incumplida' | 'conflicto' | 'colaboracion' | 'disputa_electoral' | 'negociacion' | 'reconciliacion' | 'consolidado';
  summary: string;
  importance: Importance;
  salience: number;       // relevancia actual 0..1 (decae)
  consequences: string[];
  status: 'activo' | 'consolidado' | 'resuelto';
  refs: string[];         // sesiones, compromisos, carreras relacionadas
}

export type CommitmentKind = 'apoyo_lista' | 'apoyo_interna' | 'trabajo_campana' | 'voto_proyecto' | 'reunion_seguimiento' | 'lealtad' | 'apoyo_aspiracion' | 'equipo' | 'acuerdo_programatico';
export type CommitmentStatus = 'vigente' | 'cumplido' | 'incumplido' | 'renegociado' | 'imposible' | 'terminado';
export interface PoliticalCommitment {
  id: string;
  debtor: string;         // quien se compromete
  creditor: string;       // a quien
  kind: CommitmentKind;
  content: string;
  createdWeek: number;
  dueWeek: number;
  conditions: Record<string, string | number>; // p. ej. raceId, listId, billId, partyId, electionId
  status: CommitmentStatus;
  /** para incumplimientos: deliberado / circunstancias / cambio de condiciones */
  breach?: 'deliberado' | 'circunstancias' | 'cambio_condiciones';
  visibility: 'privado' | 'conocido' | 'publico';
  importance: Importance;
  sessionId?: string;
  resolvedWeek?: number;
  note?: string;
}

export interface TranscriptLine { speaker: string; text: string; kind: 'dialogo' | 'narracion' | 'reaccion' | 'jugador' }

export interface DialogueSession {
  id: string;
  defId: string;
  week: number;
  place: string;
  participants: string[];       // interlocutores (sin el jugador)
  initiator: string;            // 'jugador' o id
  motive: string;
  formality: Formality;
  time: 'breve' | 'normal' | 'amplio';
  nodeId: string;
  exchanges: number;
  maxExchanges: number;
  vars: Record<string, string | number | boolean>;
  transcript: TranscriptLine[];
  chosen: string[];             // opciones elegidas (para no repetir y para coherencia)
  status: 'activa' | 'cerrada';
  outcome?: string;
  reactions: string[];          // cambios observables (narrativos)
  fiction: boolean;             // hay personas reales: diálogo ficticio rotulado
}

export interface ConversationInvitation {
  id: string;
  fromId: string;
  defId: string;
  week: number;
  expiresWeek: number;
  motive: string;               // lo que se sabe del motivo
  detail?: string;              // se revela si el jugador pide información
  args: Record<string, string | number>;
  status: 'pendiente' | 'aceptada' | 'rechazada' | 'reprogramada' | 'expirada';
  rescheduled?: boolean;
}

export type NegotiationItemKind = 'apoyo_publico' | 'apoyo_interna' | 'cupo_lista' | 'responsabilidad' | 'trabajo_campana' | 'voto_proyecto' | 'indicacion' | 'prioridad_territorial' | 'reunion_seguimiento' | 'apoyo_aspiracion';
export interface NegotiationItem { kind: NegotiationItemKind; by: string; refId?: string; label: string }
export interface NegotiationProposal {
  id: string; sessionId: string; round: number;
  offer: NegotiationItem[];     // lo que ofrece quien propone
  ask: NegotiationItem[];       // lo que pide
  proposer: string;
  response?: 'acepta' | 'contraoferta' | 'rechaza' | 'posterga' | 'consulta';
}

/** Información obtenida en conversaciones (rotulada por calidad). */
export interface InfoCard { id: string; week: number; source: string; text: string; kind: 'publica' | 'privada' | 'opinion' | 'rumor' | 'propuesta'; confirmed: boolean }

/** Carrera interna regional de un partido (objeto concreto del mundo). */
export interface RegionalRace {
  id: string; partyId: string; regionId: RegionId; week: number; createdWeek: number;
  lists: { id: string; headId: string; members: string[]; label: string }[];
  status: 'abierta' | 'resuelta' | 'cancelada';
  winnerList?: string;
  presidentId?: string;
}

export interface PublicPosition { week: number; topic: string; stance: number; source: string }

export interface DeferredConsequence { id: string; week: number; op: string; args: Record<string, string | number>; note: string }

export interface DialogueState {
  sessions: DialogueSession[];        // activas y cerradas (historial acotado)
  rel: Record<string, CharacterRelationship>; // clave `${from}>${to}`
  memories: CharacterMemory[];
  commitments: PoliticalCommitment[];
  invitations: ConversationInvitation[];
  proposals: NegotiationProposal[];
  info: InfoCard[];
  races: RegionalRace[];
  positions: PublicPosition[];
  deferred: DeferredConsequence[];
  cooldowns: Record<string, number>;  // `${defId}|${target}` o `npc|${id}` → semana disponible
  reputation: { cumplimiento: number; respeto: number };
  actionLog: { week: number; type: string; ref?: string; value?: string }[];
  styles: Record<string, VerbalStyle>;
  regionalPresidents: Record<string, string>; // `${partyId}|${regionId}` → charId
}

// ───────────────────────────── Definiciones (código) ─────────────────────────────
export interface DialogueCtx {
  s: GameState; sess: DialogueSession; rng: Rng;
  me: GameState['characters'][string];
  npc: GameState['characters'][string];           // interlocutor principal
  style: VerbalStyle;
  v: DialogueSession['vars'];
}
export type Text = string | ((c: DialogueCtx) => string);
export interface DialogueCondition { test: (c: DialogueCtx) => boolean; why?: string }

export type DialogueEffect =
  | { type: 'rel'; from: string; to: string; dims: Partial<Record<'trust' | 'respect' | 'cooperation' | 'rivalry' | 'reliability' | 'personal' | 'willingness' | 'familiarity' | 'dependence', number>>; importance: Importance }
  | { type: 'memory'; owner: string; about: string; kind: CharacterMemory['kind']; summary: string; importance: Importance }
  | { type: 'commitment'; c: Omit<PoliticalCommitment, 'id' | 'createdWeek' | 'status'> }
  | { type: 'rep'; dim: 'credibilidad' | 'reconocimiento' | 'confianzaPartido' | 'popularidad' | 'prestigioTecnico' | 'respeto' | 'cumplimiento' | 'territorial'; delta: number }
  | { type: 'world'; op: string; args: Record<string, string | number> }
  | { type: 'info'; card: Omit<InfoCard, 'id' | 'week'> }
  | { type: 'defer'; inWeeks: number; op: string; args: Record<string, string | number>; note: string }
  | { type: 'position'; topic: string; stance: number }
  | { type: 'reaction'; text: string };

export interface DialogueOption {
  id: string;
  text: Text;                           // lo que dice el jugador (sin etiquetas de tono)
  when?: DialogueCondition[];           // si no se cumplen, la opción NO se muestra
  effects?: (c: DialogueCtx) => DialogueEffect[];
  next: string | ((c: DialogueCtx) => string);
}
export interface DialogueNode {
  /** opcional: el id es la clave del nodo en la definición */
  id?: string;
  speaker?: 'npc' | 'narrador' | number; // índice de participante para conversaciones colectivas
  text: Text;
  options?: DialogueOption[] | ((c: DialogueCtx) => DialogueOption[]);
  /** nodo de decisión autónoma del interlocutor: devuelve el siguiente nodo */
  decide?: (c: DialogueCtx) => string;
  onEnter?: (c: DialogueCtx) => DialogueEffect[];
  end?: string;                         // resultado (cierra la conversación)
}
export interface DialogueDefinition {
  id: string;
  area: DialogueArea;
  kind: DialogueKind;
  title: string;
  maxExchanges: number;
  formality: Formality;
  /** quién la inicia: el jugador (desde la agenda), la IA (invitación) o ambos */
  initiators: ('jugador' | 'ia')[];
  /** condiciones y armado del contexto; null = no disponible */
  setup: (s: GameState, args: Record<string, string | number>) => null | { participants: string[]; place: string; motive: string; vars: DialogueSession['vars']; time?: DialogueSession['time'] };
  start: string;
  nodes: Record<string, DialogueNode>;
  /** etapa de carrera mínima: impide, p. ej., negociaciones presidenciales a un militante */
  requiresOffice?: OfficeType[];
  cooldownWeeks: number;
  label?: (s: GameState, args: Record<string, string | number>) => string;
  area_topic?: PolicyArea;
}
