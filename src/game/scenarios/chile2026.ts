/**
 * ESCENARIO "CHILE 2026" (fecha de referencia: noviembre de 2026).
 *
 * Reglas institucionales y electorales: documentadas (Ley 20.840, CPR, voto obligatorio).
 * Partidos: catálogo aportado por el usuario (SERVEL, corte 30-09-2026), no verificado en vivo.
 * COMPOSICIÓN DEL CONGRESO, AUTORIDADES, GOBIERNO Y TODOS LOS PERSONAJES: SIMULADOS Y FICTICIOS.
 * La configuración se genera a partir de apoyos base estimados; no reproduce resultados reales.
 */
import type { Attributes, Character, Dim, GameState, Ideology, Party, RegionId, Seat, StartRole, Difficulty } from '../models/types';
import { Rng, seedRng } from '../engine/rng';
import { dateToWeek } from '../engine/dates';
import { CONSTITUTED_PARTIES, HISTORICAL_PARTIES, PARTY_PROVENANCE, HISTORICAL_PROVENANCE, type PartySeed } from '../data/parties';
import { CIRCUMSCRIPTIONS, DISTRICTS, GEO_PROVENANCE, REGIONS } from '../data/geography';
import { DIFFICULTY, DIMS, clamp } from '../rules/params';
import { updateIntention } from '../systems/electorate';
import { initTerritory, initialMayors } from '../territory/init';
import { TERRITORY, comunasOfDistrict } from '../territory/data';
import { electorateCenter } from '../systems/electorate';
import { createCharacter, fullName } from '../systems/characters';
import { allocateWithPacts } from '../systems/dhondt';
import { emptyTerritorial, makeFaction, assignFactions, setLeader } from '../systems/parties';
import { formCoalition } from '../systems/coalitions';
import { appointCabinetAI, appointMinister, emptyBudget } from '../systems/government';
import { MINISTRIES } from '../data/institutions';
import { initialEconomy } from '../systems/economy';
import { BASE_PRIORITIES } from '../systems/opinion';
import { generateCalendar, listIdOf } from '../systems/elections';
import { addHistory, ideoDistance, pairKey, strongholdFactor, zeroIdeology } from '../systems/util';
import { initPolling } from '../polling';
import { initMedia } from '../media';
import { weeklyPlayer } from '../systems/player';
import { addTerritory, bio, emptyCareer, first, homeCut } from '../career/capital';
import { generateAgenda } from '../career/agendaWeek';
import { placeBoards, realLeaderFor, realMinisters, realPresident, realSeatsFor, seatHolder } from './realCast';
import { COVERAGE } from '../../data/characters/politicalCareers';
import { REAL_DATA_CONSULTED } from '../../data/characters/historicalSources';
import { ORGANIZATIONS } from '../career/labels';
export { ORGANIZATIONS };
import { fillVacancies } from '../systems/parliament';

export const SCHEMA_VERSION = 7;

export type Profession = 'estudiante' | 'oficio' | 'comercio' | 'abogacia' | 'economia' | 'docencia' | 'ingenieria' | 'medicina' | 'dirigencia_social' | 'periodismo' | 'empresa';
export const PROFESSIONS: Record<Profession, { label: string; bonus: Partial<Attributes>; funds?: number }> = {
  estudiante: { label: 'Estudiante', bonus: { redes: 4, comunicacion: 3 }, funds: -5 },
  oficio: { label: 'Trabajador/a con oficio', bonus: { gestion: 4, integridad: 4, carisma: 2 } },
  comercio: { label: 'Comercio / emprendimiento', bonus: { gestion: 5, redes: 4 }, funds: 8 },
  abogacia: { label: 'Abogacía', bonus: { oratoria: 8, tecnico: 5, negociacion: 5 } },
  economia: { label: 'Economía', bonus: { tecnico: 12, gestion: 6 } },
  docencia: { label: 'Docencia', bonus: { comunicacion: 6, carisma: 4, redes: 5 } },
  ingenieria: { label: 'Ingeniería', bonus: { gestion: 9, tecnico: 8 } },
  medicina: { label: 'Medicina', bonus: { tecnico: 8, integridad: 6, carisma: 2 } },
  dirigencia_social: { label: 'Dirigencia social', bonus: { redes: 10, carisma: 5, liderazgo: 5 } },
  periodismo: { label: 'Periodismo', bonus: { comunicacion: 12, oratoria: 5 } },
  empresa: { label: 'Empresa', bonus: { gestion: 8, redes: 6 }, funds: 30 },
};

export type Education = 'media' | 'tecnica' | 'universitaria_curso' | 'universitaria' | 'postgrado';
export const EDUCATION: Record<Education, { label: string; bonus: Partial<Attributes>; prestige: number }> = {
  media: { label: 'Enseñanza media completa', bonus: { redes: 2 }, prestige: 0 },
  tecnica: { label: 'Técnico profesional', bonus: { gestion: 4 }, prestige: 4 },
  universitaria_curso: { label: 'Universitaria en curso', bonus: { tecnico: 3, comunicacion: 2 }, prestige: 3 },
  universitaria: { label: 'Universitaria completa', bonus: { tecnico: 6 }, prestige: 8 },
  postgrado: { label: 'Postgrado', bonus: { tecnico: 10 }, prestige: 14 },
};

export const TRAITS: Record<string, { label: string; bonus: Partial<Attributes>; desc: string }> = {
  carismatico: { label: 'Carismático/a', bonus: { carisma: 8 }, desc: 'Conecta rápido con la gente' },
  estudioso: { label: 'Estudioso/a', bonus: { tecnico: 8 }, desc: 'Domina los temas en detalle' },
  negociador: { label: 'Negociador/a', bonus: { negociacion: 8 }, desc: 'Encuentra acuerdos' },
  organizador: { label: 'Organizador/a', bonus: { gestion: 5, liderazgo: 3 }, desc: 'Arma equipos y convoca' },
  integro: { label: 'Íntegro/a', bonus: { integridad: 10, negociacion: -3 }, desc: 'Difícil de comprar, también de convencer' },
  ambicioso: { label: 'Ambicioso/a', bonus: { ambicion: 10, integridad: -3 }, desc: 'Va por todo; genera desconfianza' },
  orador: { label: 'Buen/a orador/a', bonus: { oratoria: 8 }, desc: 'Brilla en debates y asambleas' },
  leal: { label: 'Leal', bonus: { disciplina: 8 }, desc: 'Respeta los acuerdos de su sector' },
  combativo: { label: 'Combativo/a', bonus: { liderazgo: 6, negociacion: -3, comunicacion: 3 }, desc: 'No rehúye el conflicto' },
  reservado: { label: 'Reservado/a', bonus: { disciplina: 4, tecnico: 4, carisma: -4 }, desc: 'Prefiere trabajar sin focos' },
};


export interface PlayerConfig {
  education?: Education;
  traits?: string[];          // hasta 2
  interests?: string[];       // áreas de política (hasta 3)
  organization?: string | null; // organización comunitaria inicial

  firstName: string;
  lastName: string;
  gender: 'f' | 'm';
  age: number;
  regionId: RegionId;
  comuna: string;
  profession: Profession;
  experience: 'ninguna' | 'local' | 'nacional';
  partyId: string | null;
  ideologyOffset: Partial<Ideology>;
  goal: string;
  startRole: StartRole;
  attrPoints: Partial<Attributes>; // puntos libres repartidos (suma ≤ 20)
}

export interface NewGameConfig { name: string; seed: number; difficulty: Difficulty; scenarioId: string; player: PlayerConfig; /** Solo pruebas: 'validacion' calibra el territorio con datos 2021-2022 */ territoryMode?: 'juego' | 'validacion'; }

export const START_DATE = '2026-11-09';
export const DISCLAIMER = 'Simulación independiente, sin afiliación a partidos, instituciones ni medios, y sin respaldo de ninguna de las personas que aparecen. El punto de partida incorpora autoridades y dirigentes reales según registros públicos oficiales consultados el 7-11-2026 (Cámara de Diputadas y Diputados, SERVEL, sitios ministeriales). Todo lo que ocurre desde el inicio de la partida (9-11-2026) es ficción: decisiones, diálogos, elecciones y trayectorias son simulados y no representan declaraciones ni conductas reales. Las autoridades sin fuente verificable (algunos ministerios, gobernadores, alcaldes y parte del Senado) son personajes ficticios.';

const I = (o: Partial<Ideology> = {}): Ideology => ({ ...zeroIdeology(), ...o });

function makeParty(seed: PartySeed, active: boolean): Party {
  return {
    id: seed.id, name: seed.name, short: seed.short, color: seed.color, founded: seed.founded, constitutedOn: seed.constitutedOn, legalStatus: seed.legalStatus,
    family: seed.family, description: seed.description + (seed.statusNote ? ` (${seed.statusNote})` : ''), ideology: { ...seed.ideology }, baseIdeology: { ...seed.ideology },
    members: seed.members, funds: Math.round(seed.members * 0.01 + seed.baseShare * 40), territorial: emptyTerritorial(0.25), leaderId: null, factions: [],
    popularity: clamp(40 + seed.baseShare, 30, 70), rejection: 30 + Math.abs(seed.ideology.eco) / 6, credibility: 50, discipline: 65, cohesion: 65, organization: 30 + Math.min(40, seed.members / 1500),
    mobilization: 40, priorities: seed.priorities, goals: seed.goals, history: [], coalitionHistory: [], provenance: active ? PARTY_PROVENANCE : HISTORICAL_PROVENANCE,
    estimatedFields: ['ideology', 'members', 'funds', 'territorial', 'popularity', 'rejection', 'credibility', 'discipline', 'cohesion', 'organization', 'mobilization', 'factions', 'goals'],
    active, mergedInto: seed.mergedInto, nextLeadershipWeek: 0,
  };
}

export function createChile2026(cfg: NewGameConfig): GameState {
  const rng = new Rng(seedRng(cfg.seed));
  const diff = DIFFICULTY[cfg.difficulty];
  const s = {
    schemaVersion: SCHEMA_VERSION, id: `game-${cfg.seed}-${Date.now().toString(36)}`, name: cfg.name, createdAt: new Date().toISOString(),
    settings: { difficulty: cfg.difficulty, seed: cfg.seed, scenarioId: cfg.scenarioId, autosaveEvery: 4 }, rng: rng.state, week: 0, startDate: START_DATE, nextId: 0,
    characters: {}, parties: {}, partyRelations: {}, coalitions: {}, regions: {} as GameState['regions'], segments: [], seats: [], bills: [],
    government: { presidentId: '', coalitionId: null, startWeek: 0, endWeek: 0, cabinet: [], policies: [], budget: emptyBudget(2026, 22.8, 24.9), nextBudget: null, stateCapacity: 55, coordination: 55, contraloriaFlags: 0, promises: [], honeymoon: 0, electId: null, electCoalitionId: null },
    economy: initialEconomy(), economyHistory: [], opinionHistory: [],
    opinion: { presidentialApproval: 44, governmentApproval: 41, institutionalTrust: 32, economicEvaluation: -5, securityPerception: 30, partyTrust: 18, priorities: { ...BASE_PRIORITIES }, structuralMood: -5, areaSatisfaction: {} },
    calendar: [], results: [], polls: [], news: [], history: [], pending: [], crises: [], deferred: [], eventCooldowns: {}, eventCounts: {},
    career: emptyCareer(),
    player: { characterId: '', goal: cfg.player.goal, startRole: cfg.player.startRole, actionPoints: 3, maxActionPoints: 3, personalFunds: 0, influence: 0, xp: 0, candidacies: [], campaign: null, achievements: [], actionsThisWeek: [], careerOver: false, lastActionResults: [], tutorialStep: 0, seenResultIds: [] },
    nationalIntention: {}, campaignSpend: {}, presidentialCandidates: {},
    rules: { era: '2015-presente (Ley 20.840)', deputyThresholdPct: 0, compulsoryVoting: true, presidentialTermYears: 4, presidentialReelection: 'no_inmediata', runoffThreshold: 50, governorThreshold: 40, deputyTermYears: 4, senatorTermYears: 8, method: 'dhondt' },
    scenarioMeta: { id: 'chile2026', name: 'Chile 2026', referenceDate: '2026-09-30', disclaimer: DISCLAIMER, provenance: [PARTY_PROVENANCE, GEO_PROVENANCE, { source: 'Simulación', cutoff: '-', confidence: 'baja', nature: 'simulado', version: '1.0.0', notes: 'Congreso inicial, gobierno, autoridades, encuestas, economía inicial (aprox.) y personajes son simulados.' }] },
    log: [],
  } as unknown as GameState;

  // Partidos
  for (const p of CONSTITUTED_PARTIES) s.parties[p.id] = makeParty(p, true);
  for (const p of HISTORICAL_PARTIES) s.parties[p.id] = makeParty(p, false);
  const active = CONSTITUTED_PARTIES;

  // Regiones
  for (const r of REGIONS) {
    s.regions[r.id] = { id: r.id, unemployment: r.unemployment, incomeIndex: r.incomeIndex, infrastructure: r.infrastructure, priorities: { ...BASE_PRIORITIES, ...r.priorities } as GameState['regions'][RegionId]['priorities'], problems: r.problems, investment: 0, governorId: null, mayorsByParty: {}, partySupport: {}, lastResults: {}, discontent: 40 };
  }
  // Electorado territorial (346 comunas) calibrado con resultados oficiales anteriores al escenario
  initTerritory(s, rng, cfg.territoryMode ?? 'juego', Object.fromEntries(active.map((p) => [p.id, p.baseShare])));

  // Relaciones entre partidos
  const ids = active.map((p) => p.id);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const d = ideoDistance(s.parties[ids[i]].ideology, s.parties[ids[j]].ideology);
    s.partyRelations[pairKey(ids[i], ids[j])] = clamp(Math.round(55 - d * 130 + rng.normal(0, 8)), -80, 80);
  }

  // Coaliciones iniciales (configuración simulada de la partida)
  const gov = formCoalition(s, 'Alianza de Gobierno', ['REP', 'PNL', 'PCC', 'UDI', 'RN', 'EVO'], 'REP');
  formCoalition(s, 'Bloque Progresista', ['FA', 'PC', 'PS', 'PPD', 'PR', 'PL', 'FRVS', 'PDC'], 'PS');
  gov.isGovernment = true;
  for (const c of Object.values(s.coalitions)) for (const a of c.members) for (const b of c.members) if (a < b) s.partyRelations[pairKey(a, b)] = clamp((s.partyRelations[pairKey(a, b)] ?? 0) + 25, -80, 85);
  updateIntention(s);

  // Personajes de cada partido: liderazgo, facciones y figuras nacionales
  for (const ps of active) {
    const p = s.parties[ps.id];
    const big = ps.baseShare >= 6;
    // Presidencia inscrita en SERVEL (persona real); si figura vacante, el partido la elegirá en la partida
    const real = realLeaderFor(s, p.id);
    const leader = real && real !== 'vacante' ? real : createCharacter(s, rng, { partyId: p.id, regionId: 'RM', ideology: p.ideology, quality: big ? 66 : 58, minAge: 38, maxAge: 66, recognition: big ? 55 : 35 });
    if (real === 'vacante') { p.leaderId = null; addHistory(s, 'partido', `${p.short}: presidencia nacional vacante`, 'Así figura en el registro de SERVEL al inicio del escenario; el partido elegirá una nueva presidencia en las próximas semanas (simulación).', 2); }
    else setLeader(s, p, leader);
    const mod = createCharacter(s, rng, { partyId: p.id, regionId: rng.pick(REGIONS).id, ideology: p.ideology, quality: 60, minAge: 35, maxAge: 64 });
    const hard = createCharacter(s, rng, { partyId: p.id, regionId: rng.pick(REGIONS).id, ideology: p.ideology, quality: 58, minAge: 32, maxAge: 64, personality: rng.pick(['ideologico', 'confrontacional', 'ambicioso']) });
    p.factions = [makeFaction(s, rng, p, 'oficialista', leader, 0.5), makeFaction(s, rng, p, 'moderada', mod, 0.3), makeFaction(s, rng, p, 'dura', hard, 0.2)];
    const notables = big ? 4 : 2;
    for (let i = 0; i < notables; i++) {
      const c = createCharacter(s, rng, { partyId: p.id, regionId: rng.pick(REGIONS).id, ideology: p.ideology, quality: rng.range(58, 74), minAge: 38, maxAge: 66, recognition: rng.range(30, 62) });
      c.ambitionTarget = 'presidente';
    }
    // Calendario de la próxima elección interna: convención de simulación (los estatutos reales no se modelan)
    p.nextLeadershipWeek = real === 'vacante' ? rng.int(6, 12) : rng.int(20, 104);
  }
  placeBoards(s);

  // Cámara inicial: distribución de escaños por distrito y partido según resultados OFICIALES
  // preliminares 2025 (SERVEL). Si el dato no está completo, se usa una asignación D'Hondt sobre
  // el apoyo calibrado (simulada). Los diputados son SIEMPRE personajes ficticios.
  const termDep = dateToWeek(START_DATE, '2030-03-11');
  const lists: Record<string, string[]> = {};
  for (const p of active) (lists[listIdOf(s, p.id)] ??= []).push(p.id);
  const official = TERRITORY.meta.seats?.D2025;
  const officialOk = !!official && DISTRICTS.every((d) => Object.values(official[String(d.id)] ?? {}).reduce((a, b) => a + b, 0) === d.seats);
  s.scenarioMeta.provenance.push(officialOk
    ? { source: 'SERVEL — Diputados 2025, resultados preliminares (partido de cada electo por distrito)', cutoff: '2025-11-16', consulted: '2026-11-06', confidence: 'alta', nature: 'documentado', version: '1', notes: 'Composición de la Cámara por partido y distrito. Las personas son ficticias; los independientes se modelan sin partido.' }
    : { source: 'Simulación (D\'Hondt sobre apoyo calibrado)', cutoff: '-', confidence: 'baja', nature: 'simulado', version: '1' });
  for (const d of DISTRICTS) {
    let byParty: Record<string, number>;
    if (officialOk) byParty = { ...official![String(d.id)] };
    else {
      const dist = comunasOfDistrict(d.id); const sup: Record<string, number> = {};
      for (const c of dist) for (const [p, v] of Object.entries(s.comunas[c.cut].lastShares)) sup[p] = (sup[p] ?? 0) + v * c.electors;
      const lv: Record<string, Record<string, number>> = {}; const caps: Record<string, number> = {};
      for (const [l, ms] of Object.entries(lists)) for (const p of ms) { (lv[l] ??= {})[p] = sup[p] ?? 0; caps[p] = d.seats; }
      byParty = allocateWithPacts(lv, d.seats, caps).byParty;
    }
    let idx = 0;
    // Diputadas y diputados reales en ejercicio (Cámara, datos abiertos + distrito según SERVEL)
    const realDeps = realSeatsFor('camara', d.id);
    if (realDeps.length === d.seats) {
      for (const rs of realDeps) {
        const c = seatHolder(s, rs)!;
        c.offices.push({ type: 'diputado', regionId: d.regionId, districtId: d.id, since: -35, termEndWeek: termDep });
        s.seats.push({ id: `D${d.id}-${idx}`, chamber: 'camara', unitId: d.id, regionId: d.regionId, holderId: c.id, termEndWeek: termDep });
        idx++;
      }
      continue;
    }
    for (const [p0, n] of Object.entries(byParty)) for (let k = 0; k < n; k++) {
      const p = s.parties[p0]?.active ? p0 : null;
      const ideo = p ? s.parties[p].ideology : electorateCenter(s);
      const c = createCharacter(s, rng, { partyId: p, regionId: d.regionId, ideology: ideo, quality: rng.normal(54, 8), minAge: 28, maxAge: 70, recognition: rng.range(15, 40) });
      const prevTerms = rng.int(0, 2);
      for (let t = 0; t < prevTerms; t++) c.pastOffices.push({ type: 'diputado', from: -208 * (t + 2), to: -208 * (t + 1), detail: 'período anterior (simulado)' });
      c.offices.push({ type: 'diputado', regionId: d.regionId, districtId: d.id, since: -35, termEndWeek: termDep });
      s.seats.push({ id: `D${d.id}-${idx}`, chamber: 'camara', unitId: d.id, regionId: d.regionId, holderId: c.id, termEndWeek: termDep });
      idx++;
    }
  }
  for (const circ of CIRCUMSCRIPTIONS) {
    const sup = s.regions[circ.regionId].lastResults;
    const termEnd = dateToWeek(START_DATE, circ.group === 'A' ? '2034-03-11' : '2030-03-11');
    const lv: Record<string, Record<string, number>> = {}; const caps: Record<string, number> = {};
    for (const [l, ms] of Object.entries(lists)) for (const p of ms) { (lv[l] ??= {})[p] = (sup[p] ?? 0) * strongholdFactor(p, `senado${circ.id}`, 0.45) * Math.exp(rng.normal(0, 0.15)); caps[p] = circ.seats; }
    const alloc = allocateWithPacts(lv, circ.seats, caps);
    let idx = 0;
    // Senadoras y senadores reales verificables (SERVEL 2025; 2021 calculado con votos TRICEL)
    const realSen = realSeatsFor('senado', circ.regionId);
    for (const rs of realSen.slice(0, circ.seats)) {
      const c = seatHolder(s, rs)!;
      const te = dateToWeek(START_DATE, rs.to);
      c.offices.push({ type: 'senador', regionId: circ.regionId, since: dateToWeek(START_DATE, rs.from), termEndWeek: te });
      s.seats.push({ id: `S${circ.id}-${idx}`, chamber: 'senado', unitId: circ.id, regionId: circ.regionId, holderId: c.id, termEndWeek: te });
      idx++;
      if (rs.party && alloc.byParty[rs.party]) alloc.byParty[rs.party] -= 1;
    }
    let missing = circ.seats - idx;
    for (const [p, n0] of Object.entries(alloc.byParty)) for (let k = 0; k < n0 && missing > 0; k++) {
      missing--;
      const c = createCharacter(s, rng, { partyId: p, regionId: circ.regionId, ideology: s.parties[p].ideology, quality: rng.normal(58, 8), minAge: 38, maxAge: 74, recognition: rng.range(25, 55) });
      c.offices.push({ type: 'senador', regionId: circ.regionId, since: circ.group === 'A' ? -35 : -243, termEndWeek: termEnd });
      if (rng.chance(0.4)) c.pastOffices.push({ type: 'diputado', from: -800, to: -400, detail: 'trayectoria previa (simulada)' });
      s.seats.push({ id: `S${circ.id}-${idx}`, chamber: 'senado', unitId: circ.id, regionId: circ.regionId, holderId: c.id, termEndWeek: termEnd });
      idx++;
    }
  }
  for (const p of active) assignFactions(s, s.parties[p.id]);

  // Autoridades regionales y municipales SIMULADAS
  initialMayors(s, rng);
  for (const r of REGIONS) {
    const sup = s.regions[r.id].partySupport;
    const top = Object.entries(sup).sort((a, b) => b[1] - a[1] + rng.normal(0, 0.03))[0][0];
    const g = createCharacter(s, rng, { partyId: top, regionId: r.id, ideology: s.parties[top].ideology, quality: 60, recognition: 40 });
    g.offices.push({ type: 'gobernador', regionId: r.id, since: -100, termEndWeek: dateToWeek(START_DATE, '2029-01-06') });
    s.regions[r.id].governorId = g.id;
  }

  // Gobierno incumbente SIMULADO (personaje ficticio)
  // Presidente de la República (persona real: ganó la segunda votación de 2025 según SERVEL)
  const newsBefore = s.news.length;
  const pres = realPresident(s) ?? createCharacter(s, rng, { partyId: 'REP', regionId: 'RM', ideology: s.parties.REP.ideology, quality: 70, minAge: 50, maxAge: 64, recognition: 95 });
  s.government.presidentId = pres.id; s.government.coalitionId = gov.id;
  s.government.startWeek = dateToWeek(START_DATE, '2026-03-11'); s.government.endWeek = dateToWeek(START_DATE, '2030-03-11');
  pres.offices.push({ type: 'presidente', since: s.government.startWeek, termEndWeek: s.government.endWeek });
  // Ministros: solo los confirmados en sitios oficiales son personas reales; el resto de las carteras
  // tienen titulares FICTICIOS (no se usa a otras personas reales para no inventar nombramientos)
  s.government.cabinet = MINISTRIES.map((m) => ({ ministryId: m.id, ministerId: null, since: s.government.startWeek, performance: 50 }));
  for (const { ministry, c } of realMinisters(s)) { appointMinister(s, rng, ministry, c.id); c.offices.find((o) => o.type === 'ministro')!.since = s.government.startWeek; }
  const coalParties = s.coalitions[gov.id].members;
  for (const post of s.government.cabinet) if (!post.ministerId) {
    const pid = rng.pick(coalParties);
    const m = createCharacter(s, rng, { partyId: rng.chance(0.4) ? null : pid, regionId: 'RM', ideology: s.parties[pid].ideology, quality: rng.range(58, 70), minAge: 40, maxAge: 66, recognition: rng.range(25, 50) });
    appointMinister(s, rng, post.ministryId, m.id);
    m.offices.find((o) => o.type === 'ministro')!.since = s.government.startWeek;
  }
  s.news.splice(newsBefore);
  fillVacancies(s, rng);
  s.scenarioMeta.provenance.push({ source: 'Personas reales: Cámara (datos abiertos), SERVEL (resultados 2025 y 2021, directivas inscritas), sitios ministeriales', cutoff: REAL_DATA_CONSULTED, consulted: REAL_DATA_CONSULTED, confidence: 'alta', nature: 'documentado', version: '1',
    notes: `Diputados ${COVERAGE.deputies}/155, senadores ${COVERAGE.senators}/50 (sin verificar: ${COVERAGE.senateAmbiguousRegions2021.join(', ') || 'ninguna'}), Presidente, ministros confirmados en sitios oficiales y directivas centrales inscritas. Gobernadores, alcaldes y ministerios no confirmados: ficticios.` });

  generateCalendar(s, 2026, 2036);
  s.history.push({ id: 'h0', week: 0, date: START_DATE, category: 'gobierno', title: 'Comienza la partida: Chile, noviembre de 2026', detail: `Gobierno de ${fullName(pres)} (Republicanos), en ejercicio desde el 11 de marzo de 2026. La coalición de gobierno de la partida es una configuración simulada. ${DISCLAIMER}`, importance: 5 });

  initMedia(s, rng);
  // Jugador
  createPlayer(s, rng, cfg, diff.startFunds);
  generateAgenda(s, rng);
  updateIntention(s);
  initPolling(s, rng);
  weeklyPlayer(s);
  s.rng = rng.state;
  return s;
}

function createPlayer(s: GameState, rng: Rng, cfg: NewGameConfig, fundsMult: number): void {
  const pc = cfg.player;
  const party = pc.partyId ? s.parties[pc.partyId] : null;
  const base: Ideology = party ? { ...party.ideology } : I();
  for (const d of DIMS) base[d] = clamp(base[d] + (pc.ideologyOffset[d as Dim] ?? 0), -100, 100);
  const c: Character = createCharacter(s, rng, { partyId: pc.partyId, regionId: pc.regionId, ideology: base, quality: 46, ideologySd: 0 });
  c.firstName = pc.firstName.trim() || 'Sin nombre'; c.lastName = pc.lastName.trim() || 'Sin apellido'; c.gender = pc.gender;
  c.birthYear = 2026 - pc.age; c.comuna = pc.comuna; c.isPlayer = true; c.ideology = base; c.personality = 'pragmatico';
  // atributos: base 42 + profesión + experiencia + puntos libres
  const attrs = c.attrs;
  for (const k of Object.keys(attrs) as (keyof Attributes)[]) attrs[k] = 42;
  for (const [k, v] of Object.entries(PROFESSIONS[pc.profession].bonus)) attrs[k as keyof Attributes] += v ?? 0;
  for (const [k, v] of Object.entries(EDUCATION[pc.education ?? 'universitaria'].bonus)) attrs[k as keyof Attributes] += v ?? 0;
  for (const t of (pc.traits ?? []).slice(0, 2)) for (const [k, v] of Object.entries(TRAITS[t]?.bonus ?? {})) attrs[k as keyof Attributes] += v ?? 0;
  // A los 18-24 años la experiencia política es necesariamente escasa
  if (pc.age < 25) attrs.experiencia -= 6;
  const exp = pc.experience === 'nacional' ? { experiencia: 30, redes: 12 } : pc.experience === 'local' ? { experiencia: 15, redes: 6 } : { experiencia: -15, redes: 0 };
  attrs.experiencia += exp.experiencia; attrs.redes += exp.redes;
  let pool = 20;
  for (const [k, v] of Object.entries(pc.attrPoints)) { const add = Math.min(pool, Math.max(0, v ?? 0)); attrs[k as keyof Attributes] += add; pool -= add; }
  for (const k of Object.keys(attrs) as (keyof Attributes)[]) attrs[k] = clamp(attrs[k], 5, 95);
  c.rep = { ...c.rep, popularidad: 45, prestigioTecnico: 35, confianzaPartido: 50, credibilidad: 55, reconocimiento: pc.experience === 'nacional' ? 22 : pc.experience === 'local' ? 10 : 4, reconocimientoRegional: { [pc.regionId]: pc.experience === 'ninguna' ? 8 : 25 }, relacionesParlamentarias: 20 };
  c.ambitionTarget = 'presidente';
  c.factionId = party?.factions[0]?.id ?? null;
  s.player.characterId = c.id;
  s.player.personalFunds = Math.max(2, Math.round((10 + (PROFESSIONS[pc.profession].funds ?? 0)) * fundsMult));
  c.rep.prestigioTecnico = clamp(c.rep.prestigioTecnico - 10 + EDUCATION[pc.education ?? 'universitaria'].prestige, 0, 100);
  if (pc.experience === 'ninguna') c.rep.confianzaPartido = 40;
  const role = pc.startRole;
  const promote = (rec: number, conf: number, funds: number) => { c.rep.reconocimiento = Math.max(c.rep.reconocimiento, rec); c.rep.confianzaPartido = Math.max(c.rep.confianzaPartido, conf); s.player.personalFunds += Math.round(funds * fundsMult); attrs.experiencia = clamp(attrs.experiencia + rec / 4, 0, 95); };
  switch (role) {
    case 'dirigente_territorial': c.offices.push({ type: 'dirigente_territorial', regionId: pc.regionId, since: 0 }); promote(8, 58, 5); break;
    case 'concejal': c.offices.push({ type: 'concejal', regionId: pc.regionId, comuna: pc.comuna, since: -100, termEndWeek: 104 }); promote(12, 55, 8); break;
    case 'alcalde': c.offices.push({ type: 'alcalde', regionId: pc.regionId, comuna: pc.comuna, since: -100, termEndWeek: 104 }); promote(24, 60, 20); if (party) s.regions[pc.regionId].mayorsByParty[party.id] = (s.regions[pc.regionId].mayorsByParty[party.id] ?? 0) + 1; break;
    case 'diputado': case 'senador': {
      const chamber = role === 'diputado' ? 'camara' : 'senado';
      const seats = s.seats.filter((st) => st.chamber === chamber && st.regionId === pc.regionId);
      const seat: Seat = seats.find((st) => st.holderId && s.characters[st.holderId]?.partyId === pc.partyId) ?? seats[0];
      if (seat.holderId) delete s.characters[seat.holderId];
      seat.holderId = c.id;
      c.offices.push({ type: role, regionId: pc.regionId, districtId: role === 'diputado' ? seat.unitId : undefined, since: -35, termEndWeek: seat.termEndWeek });
      promote(role === 'diputado' ? 28 : 40, 62, role === 'diputado' ? 25 : 40);
      if (role === 'senador' && c.birthYear > 2026 - 35) c.birthYear = 2026 - 35;
      break;
    }
    case 'presidente_partido': if (party) { setLeader(s, party, c); party.nextLeadershipWeek = 104; promote(35, 75, 30); } break;
    case 'candidato_presidencial': {
      promote(55, 70, 60);
      if (party) { setLeader(s, party, c); party.nextLeadershipWeek = 104; s.presidentialCandidates[listIdOf(s, party.id)] = c.id; }
      if (c.birthYear > 2026 - 35) c.birthYear = 2026 - 35;
      const e = s.calendar.find((x) => x.type === 'presidencial');
      if (e) s.player.candidacies.push({ electionId: e.id, office: 'presidente', partyId: pc.partyId ?? 'IND', approved: true });
      break;
    }
    case 'presidente': {
      const old = s.characters[s.government.presidentId];
      if (old) { old.offices = old.offices.filter((o) => o.type !== 'presidente'); delete s.characters[old.id]; }
      if (c.birthYear > 2026 - 35) c.birthYear = 2026 - 35;
      s.government.presidentId = c.id;
      const coal = pc.partyId ? listIdOf(s, pc.partyId) : null;
      for (const k of Object.values(s.coalitions)) k.isGovernment = k.id === coal;
      s.government.coalitionId = coal && s.coalitions[coal] ? coal : null;
      c.offices.push({ type: 'presidente', since: s.government.startWeek, termEndWeek: s.government.endWeek });
      promote(95, 80, 80);
      c.rep.popularidad = 50;
      for (const post of s.government.cabinet) if (post.ministerId) { const m = s.characters[post.ministerId]; if (m) m.offices = m.offices.filter((o) => o.type !== 'ministro'); }
      appointCabinetAI(s, rng);
      fillVacancies(s, rng);
      addHistory(s, 'gobierno', 'Historia alternativa: asumes la Presidencia', 'Inicio avanzado: gobiernas desde el primer turno con la coalición de tu partido.', 5);
      break;
    }
    default: break;
  }
  if (party) {
    const lf = party.factions.find((f) => ideoDistance(f.ideology, c.ideology) < 0.2) ?? party.factions[0];
    c.factionId = lf?.id ?? null;
  }
  // Carrera: origen, arraigo inicial en la comuna de residencia, biografía
  const org = pc.organization ?? null;
  s.career.origin = { education: EDUCATION[pc.education ?? 'universitaria'].label, occupation: PROFESSIONS[pc.profession].label, traits: (pc.traits ?? []).slice(0, 2), interests: (pc.interests ?? []).slice(0, 3) as never, organization: org };
  const home = homeCut(s);
  const roots = 4 + (org ? 8 : 0) + (pc.experience === 'local' ? 6 : pc.experience === 'nacional' ? 10 : 0) + (pc.profession === 'dirigencia_social' ? 5 : 0) + Math.max(0, 6 - Math.abs(pc.age - 35) / 5);
  addTerritory(s, [home], roots);
  s.career.capital.organization = 5 + (org ? 10 : 0) + (pc.traits?.includes('organizador') ? 6 : 0);
  if (org) c.offices.push({ type: 'dirigente_social', regionId: pc.regionId, comuna: pc.comuna, since: 0, label: ORGANIZATIONS[org]?.label });
  if (party) { s.career.stats.parties.push(party.id); first(s, 'partido', party.name); }
  if (org) first(s, 'organizacion', ORGANIZATIONS[org]?.label ?? org);
  s.career.lastOffices = c.offices.map((o) => o.type);
  bio(s, 'inicio', `${c.firstName} ${c.lastName}, ${pc.age} años, ${pc.comuna}`, [PROFESSIONS[pc.profession].label, EDUCATION[pc.education ?? 'universitaria'].label, party ? `militante de ${party.short}` : 'independiente', org ? ORGANIZATIONS[org]?.label : ''].filter(Boolean).join(' · '), 0);
}
