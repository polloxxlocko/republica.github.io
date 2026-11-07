/**
 * ELENCO REAL DEL ESCENARIO 2026.
 *
 * Coloca en el estado inicial a las personas reales verificadas (src/data/characters):
 * Presidente de la República, ministros confirmados, directivas inscritas en SERVEL,
 * 155 diputadas y diputados en ejercicio y los senadores verificables.
 *
 * Reglas de esta capa:
 *  - Solo se usan datos con fuente. Lo que no se pudo verificar sigue siendo ficticio y se marca así.
 *  - Los parámetros del motor para personas reales son convenciones uniformes según el cargo
 *    (sin variación individual, sin personalidad, sin escándalos): ver SIMULATION_CONVENTIONS.
 *  - Desde la primera semana, todo lo que les ocurre es historia alternativa (ficción).
 */
import type { Character, GameState, Ideology, RegionId } from '../models/types';
import { clamp } from '../rules/params';
import { REAL_BY_ID, partyAt, type RealPolitician } from '../../data/characters/realPoliticians';
import { INITIAL_EXECUTIVE, INITIAL_SEATS, type RealSeat } from '../../data/characters/politicalCareers';
import { PARTY_LEADERSHIP, registeredPresident } from '../../data/characters/partyLeadership';
import { newId } from '../systems/util';

export const REAL_START = '2026-11-09';

/** Convención uniforme por rol (no es una evaluación de la persona). */
const ROLE_BASE: Record<string, { attr: number; rec: number; age: number }> = {
  presidente: { attr: 64, rec: 95, age: 55 }, ministro: { attr: 60, rec: 55, age: 55 }, presidente_partido: { attr: 60, rec: 55, age: 52 },
  senador: { attr: 58, rec: 50, age: 55 }, diputado: { attr: 54, rec: 30, age: 45 }, directiva: { attr: 50, rec: 18, age: 48 },
};

export const isReal = (c: Character | null | undefined): boolean => !!c?.realId;

/** Encuentra (o crea) el personaje de juego de una persona real; nunca duplica. */
export function realCharacter(s: GameState, person: RealPolitician, role: keyof typeof ROLE_BASE, opts: { partyId?: string | null; regionId?: RegionId } = {}): Character {
  const existing = Object.values(s.characters).find((c) => c.realId === person.id);
  const base = ROLE_BASE[role];
  if (existing) {
    // Si ya existe (p. ej., senadora y presidenta de partido), se toma la convención del rol más alto
    if (base.attr > existing.attrs.carisma) for (const k of Object.keys(existing.attrs) as (keyof Character['attrs'])[]) if (k !== 'experiencia') existing.attrs[k] = base.attr;
    existing.rep.reconocimiento = Math.max(existing.rep.reconocimiento, base.rec);
    return existing;
  }
  const membership = partyAt(person, REAL_START);
  const partyId = opts.partyId !== undefined ? opts.partyId : membership?.party ?? null;
  const party = partyId && s.parties[partyId]?.active ? s.parties[partyId] : null;
  const region = (opts.regionId ?? person.regionId ?? 'RM') as RegionId;
  const year = 2026;
  const birthYear = person.birthDate ? Number(person.birthDate.slice(0, 4)) : year - base.age;
  // Experiencia: deriva de cargos documentados (años en el Congreso, Ejecutivo); es un parámetro del motor
  const terms = person.positions.filter((p) => p.role === 'diputado' || p.role === 'senador' || p.role === 'ministro').length;
  const ideology: Ideology = party ? { ...party.ideology } : { eco: 0, val: 0, seg: 0, inst: 0, amb: 0, soc: 0, ord: 0, lab: 0 } as Ideology;
  const a = base.attr;
  const c: Character = {
    id: newId(s, 'c'), firstName: person.givenNames, lastName: person.surnames, displayName: person.publicName, realId: person.id,
    gender: person.gender ?? 'x', birthYear, birthKnown: !!person.birthDate, regionId: region, comuna: undefined,
    partyId: party ? party.id : null, factionId: null, ideology, personality: 'institucionalista',
    attrs: { carisma: a, oratoria: a, negociacion: a, tecnico: a, liderazgo: a, disciplina: a, ambicion: a, integridad: a, comunicacion: a, redes: a, gestion: a, experiencia: clamp(35 + terms * 8, 20, 90) },
    rep: { popularidad: 45, prestigioTecnico: 50, confianzaPartido: 60, credibilidad: 50, reconocimiento: base.rec, reconocimientoRegional: { [region]: clamp(base.rec + 20, 0, 100) }, relacionesParlamentarias: 50, confianzaGrupos: { empresarios: 0, sindicatos: 0, regiones: 0, jovenes: 0, adultosMayores: 0, clasesMedias: 0 } },
    offices: [], pastOffices: [], specialty: party?.priorities[0] ?? 'economia', status: 'activo', memory: [], relations: {},
    ambitionTarget: role === 'diputado' ? 'senador' : role === 'senador' || role === 'presidente_partido' ? 'presidente' : 'diputado', scandal: 0,
  };
  s.characters[c.id] = c;
  return c;
}

export interface RealCastReport { seats: number; senators: number; deputies: number; leaders: string[]; vacantLeaders: string[]; ministers: number }

/** Escaños reales disponibles por unidad (distrito o región para el Senado). */
export function realSeatsFor(chamber: 'camara' | 'senado', key: number | string): RealSeat[] {
  return INITIAL_SEATS.filter((x) => x.chamber === chamber && (chamber === 'camara' ? x.unit === key : x.regionId === key));
}

export function seatHolder(s: GameState, seat: RealSeat): Character | null {
  const p = REAL_BY_ID[seat.personId]; if (!p) return null;
  const party = seat.party && s.parties[seat.party]?.active ? seat.party : null;
  return realCharacter(s, p, seat.chamber === 'camara' ? 'diputado' : 'senador', { partyId: party, regionId: seat.regionId as RegionId });
}

/** Presidentes de partido inscritos (o null si vacante / sin registro). */
export function realLeaderFor(s: GameState, partyId: string): Character | null | 'vacante' {
  const e = registeredPresident(partyId);
  if (!e) return null;
  if (e.vacant || !e.personId) return 'vacante';
  const p = REAL_BY_ID[e.personId]; if (!p) return null;
  return realCharacter(s, p, 'presidente_partido', { partyId });
}

/** Integrantes de directivas (referentes reales de cada partido, sin cargo de elección asignado). */
export function placeBoards(s: GameState): number {
  let n = 0;
  for (const e of PARTY_LEADERSHIP) {
    if (e.vacant || !e.personId || !s.parties[e.party]?.active) continue;
    const p = REAL_BY_ID[e.personId]; if (!p) continue;
    realCharacter(s, p, 'directiva', { partyId: e.party }); n++;
  }
  return n;
}

export function realPresident(s: GameState): Character | null {
  const e = INITIAL_EXECUTIVE.find((x) => x.role === 'presidente'); const p = e ? REAL_BY_ID[e.personId] : null;
  return p ? realCharacter(s, p, 'presidente', { partyId: 'REP' }) : null;
}

export function realMinisters(s: GameState): { ministry: string; c: Character }[] {
  return INITIAL_EXECUTIVE.filter((x) => x.role === 'ministro' && x.ministry).map((x) => ({ ministry: x.ministry!, c: realCharacter(s, REAL_BY_ID[x.personId], 'ministro') }));
}

/** Cargo real (documentado) para la tarjeta del personaje: etiqueta del primer cargo vigente al inicio. */
export function realOfficeAtStart(personId: string): string | null {
  const p = REAL_BY_ID[personId]; if (!p) return null;
  const cur = p.positions.filter((x) => (!x.from || x.from <= REAL_START) && (!x.to || x.to > REAL_START));
  return cur.map((x) => x.label).join(' · ') || null;
}

