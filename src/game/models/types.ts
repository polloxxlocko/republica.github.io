/**
 * Modelo de dominio de REPÚBLICA: CHILE.
 * Todo el estado del juego es serializable a JSON (sin clases, sin funciones, sin Map/Set),
 * para permitir guardado en IndexedDB, exportación y determinismo.
 */

// ---------------------------------------------------------------------------
// Ideología multidimensional. Escala -100..+100 en cada eje.
// Convención: negativo = polo "intervención / progresismo / transformación"; ver rules/params.ts.
// ---------------------------------------------------------------------------
export type Dim = 'eco' | 'val' | 'seg' | 'inst' | 'amb' | 'soc' | 'ord' | 'lab';
export type Ideology = Record<Dim, number>;

export type RegionId =
  | 'AP' | 'TA' | 'AN' | 'AT' | 'CO' | 'VA' | 'RM' | 'OH'
  | 'ML' | 'NB' | 'BI' | 'AR' | 'LR' | 'LL' | 'AI' | 'MA';

export type PolicyArea =
  | 'salud' | 'educacion' | 'vivienda' | 'pensiones' | 'seguridad' | 'trabajo'
  | 'impuestos' | 'transporte' | 'energia' | 'medioambiente' | 'descentralizacion'
  | 'infraestructura' | 'exterior' | 'migracion' | 'ciencia' | 'economia' | 'probidad';

export type Difficulty = 'facil' | 'normal' | 'dificil' | 'experto';

export type DataNature = 'documentado' | 'estimado' | 'simulado' | 'aportado_por_usuario';

export interface Provenance {
  source: string;
  cutoff: string;
  consulted?: string;
  confidence: 'alta' | 'media' | 'baja';
  nature: DataNature;
  version: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Personajes
// ---------------------------------------------------------------------------
export type Personality =
  | 'pragmatico' | 'ideologico' | 'ambicioso' | 'conciliador' | 'confrontacional'
  | 'tecnocrata' | 'territorial' | 'mediatico' | 'institucionalista';

export interface Attributes {
  carisma: number; oratoria: number; negociacion: number; tecnico: number;
  liderazgo: number; disciplina: number; ambicion: number; integridad: number;
  comunicacion: number; redes: number; gestion: number; experiencia: number;
}

export interface Reputation {
  popularidad: number;        // 0..100 imagen positiva ciudadana
  prestigioTecnico: number;   // 0..100
  confianzaPartido: number;   // 0..100 confianza de la dirigencia del propio partido
  credibilidad: number;       // 0..100
  reconocimiento: number;     // 0..100 conocimiento nacional
  reconocimientoRegional: Partial<Record<RegionId, number>>; // 0..100
  relacionesParlamentarias: number; // 0..100
  confianzaGrupos: Record<SocialGroup, number>; // -100..100
}

export type SocialGroup = 'empresarios' | 'sindicatos' | 'regiones' | 'jovenes' | 'adultosMayores' | 'clasesMedias';

export type OfficeType =
  | 'presidente' | 'ministro' | 'subsecretario' | 'seremi' | 'senador' | 'diputado' | 'gobernador' | 'alcalde'
  | 'concejal' | 'presidente_partido' | 'dirigente_territorial' | 'dirigente_social' | 'asesor' | 'militante';

export interface Office {
  type: OfficeType;
  regionId?: RegionId;
  districtId?: number;   // diputados
  ministryId?: string;   // ministros
  comuna?: string;       // alcaldes / concejales
  partyId?: string;      // presidente_partido
  since: number;         // semana absoluta
  termEndWeek?: number;  // semana absoluta de término
  label?: string;        // descripción libre (organización social, asesoría)
}

export interface MemoryEntry {
  week: number;
  aboutId: string;       // id de personaje o partido
  kind: 'acuerdo_cumplido' | 'promesa_incumplida' | 'traicion' | 'apoyo' | 'conflicto' | 'colaboracion';
  weight: number;        // -100..100
  note: string;
}

export interface Character {
  id: string;
  firstName: string;
  lastName: string;
  /** 'x' = no documentado (persona real sin dato de sexo en las fuentes): la interfaz usa formas inclusivas */
  gender: 'f' | 'm' | 'x';
  birthYear: number;
  regionId: RegionId;
  comuna?: string;
  partyId: string | null;
  factionId: string | null;
  ideology: Ideology;
  personality: Personality;
  attrs: Attributes;
  rep: Reputation;
  offices: Office[];          // cargos vigentes (puede ser presidente de partido + diputado)
  pastOffices: { type: OfficeType; from: number; to: number; detail?: string }[];
  specialty: PolicyArea;
  status: 'activo' | 'retirado' | 'fallecido';
  isPlayer?: boolean;
  memory: MemoryEntry[];
  relations: Record<string, number>; // id personaje -> -100..100 (lista acotada)
  ambitionTarget: OfficeType;
  scandal: number;            // 0..100 exposición a cuestionamientos
  /** Semana de la elección en la que decidió no repostular (privado: el jugador solo lo sabe por rumores) */
  plansRetire?: number;
  /** Persona real: id en src/data/characters (datos verificados separados de la historia simulada) */
  realId?: string;
  /** Nombre público tal como figura en las fuentes (personas reales) */
  displayName?: string;
  /** false = el año de nacimiento es una convención de simulación (no documentado) */
  birthKnown?: boolean;
}

// ---------------------------------------------------------------------------
// Partidos
// ---------------------------------------------------------------------------
export type LegalStatus = 'constituido' | 'en_formacion' | 'disuelto' | 'historico' | 'fusionado' | 'ficticio';

export interface Faction {
  id: string;
  name: string;
  leaderId: string;
  ideology: Ideology;
  share: number;          // fracción de militancia 0..1
  influence: number;      // 0..100
  loyalty: number;        // 0..100 lealtad a la directiva
  govStance: number;      // -100 oposición dura .. +100 apoyo
  coalitionStance: number;// -100 rechaza la coalición actual .. +100
  discontent: number;     // 0..100
  rebellion: number;      // 0..100 capacidad de rebelión
  ambition: string;       // descripción
}

export interface PartyGoals { votes: number; office: number; policy: number; identity: number; }

export interface PartyHistoryEntry {
  week: number;
  date: string;
  election: ElectionType;
  votePct: number;
  seats: number;
}

export interface Party {
  id: string;
  name: string;
  short: string;
  color: string;
  founded: string;
  constitutedOn?: string;     // constitución legal (SERVEL)
  legalStatus: LegalStatus;
  family: string;
  description: string;
  ideology: Ideology;
  baseIdeology: Ideology;
  members: number;
  funds: number;              // millones de CLP
  territorial: Record<RegionId, number>; // 0..1 fuerza organizativa por región
  leaderId: string | null;
  factions: Faction[];
  popularity: number;         // 0..100 simpatía
  rejection: number;          // 0..100 rechazo
  credibility: number;
  discipline: number;
  cohesion: number;
  organization: number;
  mobilization: number;
  priorities: PolicyArea[];
  goals: PartyGoals;
  history: PartyHistoryEntry[];
  coalitionHistory: { week: number; coalitionId: string; event: 'entra' | 'sale' }[];
  provenance: Provenance;
  estimatedFields: string[];  // campos que son parámetros estimados de balance
  active: boolean;            // compite y opera en la simulación
  foundedWeek?: number;
  parentPartyId?: string;
  mergedInto?: string;
  formationProgress?: number; // 0..100 para partidos en formación
  nextLeadershipWeek: number;
  isPlayerFounded?: boolean;
}

export interface Coalition {
  id: string;
  name: string;
  members: string[];
  leaderPartyId: string;
  program: Ideology;
  cohesion: number;
  formedWeek: number;
  dissolvedWeek?: number;
  conflicts: string[];
  isGovernment: boolean;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Territorio y electorado
// ---------------------------------------------------------------------------
export interface RegionState {
  id: RegionId;
  unemployment: number;     // %
  incomeIndex: number;      // 100 = promedio nacional
  infrastructure: number;   // 0..100
  priorities: Record<PolicyArea, number>; // pesos normalizados
  problems: string[];
  investment: number;       // inversión pública regional acumulada (índice)
  governorId: string | null;
  mayorsByParty: Record<string, number>;
  partySupport: Record<string, number>; // intención "real" regional estimada (0..1), oculta
  lastResults: Record<string, number>;  // último resultado diputados (0..1)
  discontent: number;       // 0..100 malestar regional
}

export type AgeGroup = 'joven' | 'adulto' | 'mayor';
export type Ses = 'bajo' | 'medio' | 'alto';

export interface Segment {
  id: string;
  cut: number;               // comuna (código único territorial)
  regionId: RegionId;
  age: AgeGroup;
  ses: Ses;
  zone: 'urbano' | 'rural';
  voters: number;
  education: number;        // 0..1
  interest: number;         // 0..1
  ideology: Ideology;
  partisanship: Record<string, number>; // 0..1 identificación con partidos
  loyalty: number;          // 0..1 fidelidad
  econSensitivity: number;  // 0..1
  institutionalTrust: number; // 0..1
  priorities: Partial<Record<PolicyArea, number>>;
}

/** Estado dinámico de cada una de las 346 comunas. */
export interface ComunaState {
  cut: number;
  discontent: number;                        // malestar local 0..100
  org: Record<string, number>;               // organización territorial local por partido (0..1)
  campaign: Record<string, number>;          // inversión de campaña vigente (MM$) por partido o candidatura
  lastShares: Record<string, number>;        // último resultado de diputados (proporción de votos válidos)
  lastTurnout: number;                       // participación de la última elección (0..1)
  mayorParty: string | null;
  priorities: Partial<Record<PolicyArea, number>>;
  baseTurnout: number;                       // participación estructural estimada (voto obligatorio)
  swing: number;                             // proporción estimada de votantes volátiles
  sens: { campaign: number; national: number; local: number };
  snapshot?: { week: number; party: string; comps: number[]; share: number };
}

export interface TerritorialCalibration {
  mode: 'juego' | 'validacion';
  sources: string[];
  fitMAE: number;          // error absoluto medio comunal (pp) en el ajuste de partidos
  notes: string[];
}

// ---------------------------------------------------------------------------
// Elecciones
// ---------------------------------------------------------------------------
export type ElectionType =
  | 'presidencial' | 'presidencial_2v' | 'diputados' | 'senadores'
  | 'alcaldes' | 'concejales' | 'gobernadores' | 'gobernadores_2v' | 'primarias';

export interface ScheduledElection {
  id: string;
  type: ElectionType;
  week: number;             // semana absoluta en que se vota (domingo de esa semana)
  date: string;             // ISO del domingo
  done: boolean;
  regions?: RegionId[];     // senado: circunscripciones que renuevan
  coalitionId?: string;     // primarias
}

export interface Candidate {
  id: string;               // id personaje
  partyId: string;
  listId: string;           // coalición o partido
  quality: number;          // 0..100 (carisma, reconocimiento, etc.)
}

export interface DistrictResult {
  unitId: string;           // distrito, circunscripción o región
  name: string;
  regionId: RegionId;
  seats: number;
  partyVotes: Record<string, number>;
  listVotes: Record<string, number>;
  candidateVotes: Record<string, number>;
  elected: string[];        // ids personajes
  electedParty: Record<string, number>;
  blankNull: number;
  turnout: number;
}

export interface ElectionResult {
  id: string;
  electionId: string;
  type: ElectionType;
  week: number;
  date: string;
  nationalPartyPct: Record<string, number>;
  nationalCandidatePct?: Record<string, number>;
  candidates?: { id: string; partyId: string; listId: string }[];
  seatsByParty: Record<string, number>;
  units: DistrictResult[];
  turnoutPct: number;
  winnerId?: string;        // presidencial / gobernador / primarias
  runoffNeeded?: boolean;
  playerOutcome?: { ran: boolean; won: boolean; office?: string; votes?: number; pct?: number; marginPct?: number };
  countOrder: string[];     // orden de escrutinio de unidades (para noche electoral)
  comunas?: Record<string, { v: Record<string, number>; t: number; e: number; w?: string }>; // votos por comuna (v), votantes (t), electores (e)
  names: Record<string, string>; // nombres de candidatos relevantes (sobreviven a la depuración)
  runnerUpId?: string;
}

export interface Poll {
  id: string;
  week: number;
  pollster: string;
  sample: number;
  moe: number;              // margen de error en puntos
  kind: 'partidos' | 'presidencial' | 'aprobacion';
  values: Record<string, number>; // porcentaje estimado
  undecided: number;
}

export interface Pollster { id: string; name: string; houseEffect: Record<string, number>; sample: number; method: string; frequency: number; }

export interface Campaign {
  electionId: string;
  budget: number;            // millones CLP disponibles
  spent: number;
  regionFocus: Partial<Record<RegionId, number>>; // pesos
  message: Dim | null;       // eje del mensaje
  messageSide: -1 | 1;
  team: number;              // 0..3 equipos contratados
  debates: number;
  intensity: number;         // 0..100 acumulado
}

// ---------------------------------------------------------------------------
// Congreso
// ---------------------------------------------------------------------------
export type Chamber = 'camara' | 'senado';

export interface Seat {
  id: string;
  chamber: Chamber;
  unitId: number;            // distrito (1..28) o circunscripción (1..16)
  regionId: RegionId;
  holderId: string | null;
  termEndWeek: number;
}

export type BillStage =
  | 'comision_origen' | 'sala_origen' | 'comision_revisora' | 'sala_revisora'
  | 'tercer_tramite' | 'comision_mixta' | 'ejecutivo' | 'insistencia_veto' | 'tribunal_constitucional'
  | 'publicada' | 'rechazada' | 'archivada' | 'retirada';

export type Quorum = 'simple' | 'absoluta' | 'loc' | 'reforma_constitucional';
export type Urgency = 'ninguna' | 'simple' | 'suma' | 'discusion_inmediata';

export interface VoteRecord {
  week: number;
  chamber: Chamber;
  stage: BillStage;
  yes: number; no: number; abst: number;
  required: number;
  passed: boolean;
  byParty: Record<string, { yes: number; no: number; abst: number }>;
}

export interface Concession { week: number; kind: string; partyId?: string; charId?: string; description: string; fulfilled?: boolean; dueWeek?: number; }

export interface Bill {
  id: string;
  title: string;
  area: PolicyArea;
  origin: 'mensaje' | 'mocion';
  authorId: string;           // personaje
  authorPartyId: string | null;
  policyId?: string;          // política pública asociada
  chamberOfOrigin: Chamber;
  stage: BillStage;
  stageWeek: number;          // semana en que ingresó a la etapa
  urgency: Urgency;
  quorum: Quorum;
  position: Ideology;         // contenido ideológico del proyecto
  intensity: number;          // 0..1 ambición (afecta impacto y resistencia)
  moderation: number;         // 0..1 cuánto se ha moderado vía indicaciones
  popularity: number;         // -100..100 apoyo ciudadano
  fiscalCost: number;         // % PIB anual
  modifiedInRevision: boolean;
  votes: VoteRecord[];
  concessions: Concession[];
  sideSupport: Record<string, number>; // partyId -> bonificación negociada
  personalSupport: Record<string, number>; // charId -> bonificación negociada
  submittedWeek: number;
  closedWeek?: number;
  vetoed?: boolean;
  execDecision?: 'promulgar' | 'vetar';
  playerVote?: 'yes' | 'no' | 'abst';   // voto propio del jugador parlamentario
  budgetYear?: number;
  log: string[];
}

// ---------------------------------------------------------------------------
// Gobierno
// ---------------------------------------------------------------------------
export interface Ministry { id: string; name: string; area: PolicyArea; weight: number; }

export interface MinisterPost { ministryId: string; ministerId: string | null; since: number; performance: number; }

export type PolicyPhase =
  | 'anunciada' | 'formulacion' | 'tramitacion' | 'aprobada' | 'financiamiento'
  | 'implementacion' | 'evaluacion' | 'completada' | 'fracasada' | 'abandonada';

export interface PolicyDef {
  id: string;
  name: string;
  area: PolicyArea;
  objective: string;
  position: Ideology;          // dirección ideológica
  fiscalCost: number;          // % PIB anual en régimen
  politicalCost: number;       // 0..100
  implWeeks: number;
  capacityRequired: number;    // 0..100
  effects: PolicyEffects;
  beneficiaries: string;
  opponents: string;
  risks: string;
  sideEffects: string;
  requiresLaw: boolean;
  quorum: Quorum;
  exclusivePresidential: boolean;
}

export interface PolicyEffects {
  growth?: number;        // pp de crecimiento potencial (largo plazo)
  shortGrowth?: number;   // pp de corto plazo
  inflation?: number;
  unemployment?: number;
  poverty?: number;       // pp
  inequality?: number;    // puntos Gini*100
  revenue?: number;       // % PIB de recaudación adicional
  security?: number;      // percepción de seguridad (+ mejora)
  approval?: number;      // efecto directo en aprobación al completarse
  investmentConfidence?: number;
  regional?: number;      // inversión regional
  satisfaction?: Partial<Record<PolicyArea, number>>;
}

export interface ActivePolicy {
  id: string;
  defId: string;
  phase: PolicyPhase;
  phaseWeek: number;
  progress: number;       // 0..100 dentro de la fase de implementación
  billId?: string;
  ministryId: string;
  quality: number;        // 0..1 calidad de diseño
  funded: boolean;
  outcome?: number;       // -1..1 evaluación
  log: string[];
}

export interface Budget {
  year: number;
  revenue: number;        // % PIB
  spending: number;       // % PIB
  byArea: Partial<Record<PolicyArea, number>>; // % PIB
  investment: number;     // % PIB
  approved: boolean;
  status: 'vigente' | 'en_discusion' | 'proyecto';
  execution: number;      // 0..1
}

export interface Government {
  presidentId: string;
  coalitionId: string | null;
  startWeek: number;
  endWeek: number;
  cabinet: MinisterPost[];
  policies: ActivePolicy[];
  budget: Budget;
  nextBudget: Budget | null;
  stateCapacity: number;      // 0..100
  coordination: number;       // 0..100
  contraloriaFlags: number;
  promises: Concession[];
  honeymoon: number;          // semanas restantes
  electId: string | null;     // presidente/a electo/a a la espera de asumir
  coalitionTerms?: number;    // períodos consecutivos previos del mismo bloque
  electCoalitionId: string | null;
}

// ---------------------------------------------------------------------------
// Economía
// ---------------------------------------------------------------------------
export interface Economy {
  gdp: number;              // miles de millones USD
  growth: number;           // % anual
  potentialGrowth: number;  // %
  outputGap: number;        // %
  inflation: number;        // % anual
  inflationExpect: number;
  unemployment: number;     // %
  realWages: number;        // índice 100
  productivity: number;     // índice 100
  investment: number;       // % PIB
  consumption: number;      // % PIB
  debt: number;             // % PIB
  fiscalBalance: number;    // % PIB
  revenue: number;          // % PIB
  spending: number;         // % PIB
  copper: number;           // USD/lb
  exchangeRate: number;     // CLP/USD
  policyRate: number;       // TPM %
  businessConfidence: number; // 0..100
  consumerConfidence: number; // 0..100
  gini: number;             // 0..100
  poverty: number;          // %
  fiscalImpulse: number;    // % PIB pendiente de efectos
  shocks: { name: string; growth: number; inflation: number; weeksLeft: number }[];
}

// ---------------------------------------------------------------------------
// Opinión pública y medios
// ---------------------------------------------------------------------------
export interface Opinion {
  presidentialApproval: number;
  governmentApproval: number;
  institutionalTrust: number;
  economicEvaluation: number; // -100..100
  securityPerception: number; // 0..100 (alto = seguro)
  partyTrust: number;         // 0..100
  priorities: Record<PolicyArea, number>;
  structuralMood: number;     // tendencia de largo plazo -100..100
  areaSatisfaction: Partial<Record<PolicyArea, number>>;
}

export interface MediaOutlet { id: string; name: string; kind: 'diario' | 'radio' | 'tv' | 'digital' | 'revista'; lean: number; reach: number; }

export interface NewsItem {
  id: string;
  week: number;
  outletId: string;
  headline: string;
  body: string;
  category: 'elecciones' | 'congreso' | 'gobierno' | 'economia' | 'partidos' | 'coaliciones' | 'crisis' | 'regiones' | 'jugador' | 'encuestas';
  importance: number; // 1..5
  tone: -1 | 0 | 1;
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------
export interface PendingDecision {
  id: string;
  eventId: string;
  week: number;
  title: string;
  description: string;
  options: { id: string; label: string; hint: string }[];
  context: Record<string, string | number>;
  expiresWeek: number;
}

export interface Crisis {
  id: string;
  kind: 'economica' | 'politica' | 'institucional' | 'social' | 'sanitaria' | 'ambiental' | 'internacional';
  name: string;
  cause: string;
  startWeek: number;
  weeksLeft: number;
  severity: number;  // 0..100
  response?: string;
  regionId?: RegionId;
}

export interface DeferredEffect {
  id: string;
  week: number;          // semana de aplicación
  kind: string;
  payload: Record<string, string | number>;
  source: string;
}

export interface HistoryEntry {
  id: string;
  week: number;
  date: string;
  category: 'eleccion' | 'gobierno' | 'reforma' | 'crisis' | 'coalicion' | 'partido' | 'jugador' | 'congreso' | 'economia';
  title: string;
  detail: string;
  importance: number;
}

// ---------------------------------------------------------------------------
// Jugador
// ---------------------------------------------------------------------------
export type StartRole =
  | 'militante' | 'dirigente_territorial' | 'concejal' | 'alcalde' | 'diputado'
  | 'senador' | 'presidente_partido' | 'candidato_presidencial' | 'presidente';

export interface PlayerState {
  characterId: string;
  goal: string;
  startRole: StartRole;
  actionPoints: number;
  maxActionPoints: number;
  personalFunds: number;    // millones CLP (recursos políticos legales)
  influence: number;        // 0..100 influencia política agregada
  xp: number;
  candidacies: { electionId: string; office: OfficeType; unitId?: string; partyId: string; approved: boolean }[];
  campaign: Campaign | null;
  achievements: string[];
  actionsThisWeek: string[];
  careerOver: boolean;
  lastActionResults: string[];
  tutorialStep: number;
  seenResultIds: string[];
}

// ---------------------------------------------------------------------------
// Carrera política individual
// ---------------------------------------------------------------------------
export type AspirantStatus = 'aspirante' | 'propuesto' | 'nominado' | 'descartado' | 'retirado';
export interface Aspirant { charId: string; backers: string[]; status: AspirantStatus; base: number; noise: number; joinedWeek: number }

/** Proceso de selección de candidaturas de un partido en un territorio (propuesto ≠ nominado ≠ electo). */
export interface NominationProcess {
  id: string;
  electionId: string;
  electionType: ElectionType;
  office: OfficeType;
  unitId: string;            // comuna (CUT), distrito, circunscripción (región) o 'nacional'
  unitLabel: string;
  partyId: string;
  method: 'directiva' | 'consulta_interna' | 'acuerdo_coalicion';
  openWeek: number;
  shortlistWeek: number;
  decisionWeek: number;
  slots: number;
  aspirants: Aspirant[];
  status: 'abierto' | 'preseleccion' | 'resuelto' | 'cancelado';
  outcome?: string;
  log: string[];
  /** Estado oculto: tirada y probabilidad de cesión del cupo al pacto (se fijan en la preselección) */
  cedeRoll?: number;
  cedeP?: number;
}

export interface OpportunityOption { id: string; label: string; hint: string }
export interface Opportunity {
  id: string;
  kind: string;
  week: number;
  expiresWeek: number;
  title: string;
  description: string;
  actors: string[];
  requirements: string[];
  benefits: string[];
  risks: string[];
  options: OpportunityOption[];
  ctx: Record<string, string | number>;
  office?: OfficeType;        // si es parte de la agenda de un cargo
}

export interface Commitment {
  id: string;
  toCharId: string;
  kind: 'apoyo_interno' | 'lealtad' | 'voto' | 'cargo' | 'agenda';
  createdWeek: number;
  dueWeek: number;
  description: string;
  status: 'vigente' | 'cumplido' | 'incumplido';
  ctx?: Record<string, string | number>;
}

export interface BioEntry {
  week: number;
  date: string;
  kind: 'inicio' | 'cargo' | 'fin_cargo' | 'eleccion' | 'nominacion' | 'partido' | 'oportunidad' | 'decision' | 'relacion' | 'ley' | 'retiro' | 'compromiso';
  title: string;
  detail: string;
  tone: -1 | 0 | 1;
}

export interface CareerOrigin {
  education: string;
  occupation: string;
  traits: string[];
  interests: PolicyArea[];
  organization: string | null;
}

/** Fuente y calidad de una información recibida por el personaje (18.11). */
export type IntelSource = 'publica' | 'contacto' | 'reservada' | 'rumor' | 'estimacion';
export interface IntelReport {
  id: string;
  week: number;
  topic: 'directiva' | 'candidaturas' | 'reputacion' | 'oportunidad' | 'red' | 'coalicion' | 'gobierno';
  text: string;
  source: IntelSource;
  sourceId?: string;          // personaje que lo cuenta (si aplica)
  reliability: 'alta' | 'media' | 'baja';
  /** Veracidad real (estado oculto; la interfaz no la muestra hasta que se verifica) */
  truth: boolean;
  latentId?: string;
  verified?: 'confirmado' | 'desmentido';
}

/** Situación latente del mundo: existe aunque el jugador no la conozca (18.3). */
export interface LatentSituation {
  id: string;
  kind: 'equipo_figura' | 'retiro_parlamentario' | 'vacante' | 'reorganizacion_gabinete' | 'crisis_liderazgo' | 'reorganizacion_coalicion' | 'faccion_renovacion';
  actorId: string;            // quién decide
  week: number;
  decideWeek: number;
  status: 'latente' | 'materializada' | 'disipada';
  partyId?: string;
  ctx: Record<string, string | number>;
  chosenId?: string;
  knownToPlayer: boolean;
}

export interface ElectionReview {
  week: number;
  electionId: string;
  office: string;
  won: boolean;
  pct?: number;
  marginPct?: number;
  expectation: 'por_sobre' | 'en_linea' | 'por_debajo';
  closeness: 'estrecha' | 'clara' | 'amplia';
  strong: string[];            // comunas con mejor desempeño (información pública)
  weak: string[];
  popularity: { before: string; after: string };
  decisions: string[];         // hitos de la biografía durante la campaña
  events: string[];            // acontecimientos nacionales del período
  allies: { name: string; behavior: string }[];
  effects: string[];           // consecuencias aplicadas (experiencia, relaciones...)
}

export interface CareerState {
  origin: CareerOrigin;
  capital: { territory: Record<string, number>; organization: number; rejection: number };
  processes: NominationProcess[];
  opportunities: Opportunity[];
  commitments: Commitment[];
  bio: BioEntry[];
  repHistory: { week: number; pop: number; rec: number; infl: number; party: number; cred: number; terr: number }[];
  stats: { won: number; lost: number; nomWon: number; nomLost: number; parties: string[]; laws: number; oppAccepted: number; oppRejected: number; peakOffice: string | null };
  lastProgressWeek: number;
  cooldowns: Record<string, number>;
  lastOffices?: string[];
  intel: IntelReport[];
  latent: LatentSituation[];
  sources: Record<string, { hits: number; misses: number }>;
  reviews: ElectionReview[];
  contacts: Record<string, { metWeek: number; context: string; lastOffice: string | null }>;
  firsts: Record<string, { week: number; text: string }>;
  workMode: 'completa' | 'parcial' | 'dedicacion';
  pressure: number;            // presión por éxito prematuro (oculta; se muestra cualitativamente)
}

// ---------------------------------------------------------------------------
// Estado global
// ---------------------------------------------------------------------------
export interface ElectoralRules {
  era: string;
  deputyThresholdPct: number;     // umbral nacional para obtener escaños (0 = sin umbral)
  compulsoryVoting: boolean;
  presidentialTermYears: number;
  presidentialReelection: 'no_inmediata' | 'permitida';
  runoffThreshold: number;        // % votos válidos para ganar en primera vuelta
  governorThreshold: number;      // % para gobernador regional en primera vuelta
  deputyTermYears: number;
  senatorTermYears: number;
  method: 'dhondt' | 'binominal';
}

export interface Settings {
  difficulty: Difficulty;
  seed: number;
  scenarioId: string;
  autosaveEvery: number;
}

export interface GameState {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  settings: Settings;
  rng: [number, number, number, number];
  week: number;               // semana absoluta (0 = inicio del escenario)
  startDate: string;          // ISO lunes de la semana 0
  nextId: number;
  characters: Record<string, Character>;
  parties: Record<string, Party>;
  partyRelations: Record<string, number>; // "a|b" ordenado -> -100..100
  coalitions: Record<string, Coalition>;
  regions: Record<RegionId, RegionState>;
  segments: Segment[];
  comunas: Record<string, ComunaState>;
  territoryCalibration: TerritorialCalibration;
  seats: Seat[];
  bills: Bill[];
  government: Government;
  economy: Economy;
  economyHistory: { week: number; growth: number; inflation: number; unemployment: number; debt: number; copper: number; policyRate: number; approval: number; poverty: number }[];
  opinion: Opinion;
  opinionHistory: { week: number; approval: number; parties: Record<string, number> }[];
  calendar: ScheduledElection[];
  results: ElectionResult[];
  polls: Poll[];
  news: NewsItem[];
  history: HistoryEntry[];
  pending: PendingDecision[];
  crises: Crisis[];
  deferred: DeferredEffect[];
  eventCooldowns: Record<string, number>; // eventId -> semana a partir de la cual puede repetirse
  eventCounts: Record<string, number>;
  player: PlayerState;
  career: CareerState;
  nationalIntention: Record<string, number>; // intención "real" nacional (oculta al jugador)
  campaignSpend: Record<string, Partial<Record<RegionId, number>>>; // gasto de campaña acumulado con decaimiento
  rules: ElectoralRules;
  presidentialCandidates: Record<string, string>; // coalición/partido -> personaje (próxima presidencial)
  scenarioMeta: { id: string; name: string; referenceDate: string; disclaimer: string; provenance: Provenance[] };
  log: string[];              // registro técnico de cambios del último turno
  gameOver?: string;
}

export interface TickResult {
  state: GameState;
  events: string[];
  newResults: string[];
  newDecisions: string[];
  newOpportunities: string[];
}
