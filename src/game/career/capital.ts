/**
 * CAPITAL POLÍTICO MULTIDIMENSIONAL Y BIOGRAFÍA.
 *
 * El capital no es un "nivel": cada dimensión influye de forma distinta en distintas
 * oportunidades y procesos. Un personaje puede ser muy popular y tener poco poder interno,
 * o tener mucha influencia interna y escaso respaldo ciudadano.
 */
import type { BioEntry, CareerState, Character, GameState, OfficeType, RegionId } from '../models/types';
import { clamp } from '../rules/params';
import { COMUNAS, COMUNA_BY_CUT, comunasOfDistrict, comunasOfRegion } from '../territory/data';
import { memoryBalance } from '../systems/characters';
import { currentISO } from '../systems/util';

export interface PoliticalCapital {
  territorial: number;     // arraigo en su territorio de residencia (0..100)
  partyInfluence: number;  // influencia dentro de su partido (0..100)
  recognition: number;     // reconocimiento nacional
  relations: number;       // red de relaciones (saldo de aliados)
  credibility: number;
  prestige: number;        // prestigio técnico
  experience: number;
  organization: number;    // capacidad organizativa propia (equipo, voluntarios)
  resources: number;       // recursos legales disponibles (MM$)
  factionSupport: number;  // respaldo de facciones internas
  popularity: number;
  rejection: number;
}

export function emptyCareer(): CareerState {
  return {
    origin: { education: '', occupation: '', traits: [], interests: [], organization: null },
    capital: { territory: {}, organization: 5, rejection: 10, digital: 0 },
    processes: [], opportunities: [], commitments: [], bio: [], repHistory: [],
    stats: { won: 0, lost: 0, nomWon: 0, nomLost: 0, parties: [], laws: 0, oppAccepted: 0, oppRejected: 0, peakOffice: null },
    lastProgressWeek: 0, cooldowns: {},
    intel: [], latent: [], sources: {}, reviews: [], contacts: {}, firsts: {}, workMode: 'parcial', pressure: 0, team: [], agenda: { week: -1, offers: [], used: [], lastDefs: [] },
  };
}

export const me = (s: GameState): Character => s.characters[s.player.characterId];

/** Capital territorial promedio (ponderado por electores) en un conjunto de comunas. */
export function territorialIn(s: GameState, cuts: number[]): number {
  let a = 0; let w = 0;
  for (const c of cuts) { const e = COMUNA_BY_CUT[c]?.electors ?? 0; a += (s.career.capital.territory[c] ?? 0) * e; w += e; }
  return w ? a / w : 0;
}

export function homeCut(s: GameState): number {
  const c = me(s);
  const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return COMUNAS.find((x) => x.region === c.regionId && norm(x.name) === norm(c.comuna ?? ''))?.cut
    ?? comunasOfRegion(c.regionId).sort((a, b) => b.electors - a.electors)[0].cut;
}

export function unitComunas(office: OfficeType, unitId: string): number[] {
  if (office === 'diputado') return comunasOfDistrict(Number(unitId)).map((c) => c.cut);
  if (office === 'senador' || office === 'gobernador') return comunasOfRegion(unitId as RegionId).map((c) => c.cut);
  if (office === 'presidente') return COMUNAS.map((c) => c.cut);
  return [Number(unitId)];
}

/** Influencia partidaria de cualquier personaje (para competir en procesos internos). */
export function partyInfluenceOf(s: GameState, c: Character): number {
  const p = c.partyId ? s.parties[c.partyId] : null;
  if (!p) return 0;
  const leader = p.leaderId ? s.characters[p.leaderId] : null;
  const leaderRel = leader && leader.id !== c.id ? memoryBalance(leader, c.id) : c.id === p.leaderId ? 60 : 0;
  const W: Partial<Record<OfficeType, number>> = { presidente_partido: 40, diputado: 15, senador: 20, ministro: 15, alcalde: 12, gobernador: 15, dirigente_territorial: 8, concejal: 5, asesor: 3, seremi: 6, subsecretario: 10 };
  const offices = c.offices.reduce((a, o) => a + (W[o.type] ?? 0), 0);
  const fac = p.factions.find((f) => f.id === c.factionId);
  const facLeader = fac?.leaderId === c.id ? fac.influence * 0.3 : 0;
  return clamp(c.rep.confianzaPartido * 0.45 + leaderRel * 0.2 + offices + facLeader + c.attrs.redes * 0.1 + caucusBonus(s, c), 0, 100);
}

export function factionSupportOf(s: GameState, c: Character): number {
  const p = c.partyId ? s.parties[c.partyId] : null;
  if (!p || !p.factions.length) return 0;
  let acc = 0;
  for (const f of p.factions) {
    const l = s.characters[f.leaderId];
    const rel = l ? (l.id === c.id ? 100 : memoryBalance(l, c.id)) : 0;
    acc += f.share * clamp(50 + rel * 0.5 + (c.factionId === f.id ? 20 : 0), 0, 100);
  }
  return clamp(acc, 0, 100);
}

export function capitalOf(s: GameState): PoliticalCapital {
  const c = me(s);
  const rels = Object.values(c.relations);
  const allies = rels.filter((r) => r > 20).length; const rivals = rels.filter((r) => r < -20).length;
  const home = homeCut(s);
  const region = comunasOfRegion(c.regionId).map((x) => x.cut);
  return {
    territorial: Math.round(0.6 * (s.career.capital.territory[home] ?? 0) + 0.4 * territorialIn(s, region)),
    partyInfluence: Math.round(partyInfluenceOf(s, c)),
    recognition: Math.round(c.rep.reconocimiento),
    relations: clamp(50 + (allies - rivals) * 6, 0, 100),
    credibility: Math.round(c.rep.credibilidad),
    prestige: Math.round(c.rep.prestigioTecnico),
    experience: Math.round(c.attrs.experiencia),
    organization: Math.round(s.career.capital.organization),
    resources: Math.round(s.player.personalFunds),
    factionSupport: Math.round(factionSupportOf(s, c)),
    popularity: Math.round(c.rep.popularidad),
    rejection: Math.round(s.career.capital.rejection),
  };
}

/** Cargos públicos (de elección o designación). */
export const PUBLIC_OFFICES: OfficeType[] = ['presidente', 'ministro', 'subsecretario', 'seremi', 'senador', 'diputado', 'gobernador', 'alcalde', 'concejal'];
/** Roles menores que no pueden ejercerse junto a un cargo público. */
export const MINOR_ROLES: OfficeType[] = ['asesor', 'dirigente_social', 'dirigente_territorial'];

/**
 * ¿Puede el personaje asumir un rol menor? Un/a parlamentario/a, autoridad o funcionario/a de
 * gobierno no puede ser a la vez asesor/a de otra persona ni dirigente de una organización social.
 * La directiva regional del partido solo es compatible con un cargo de concejal/a.
 */
export function minorRoleBlocked(c: Character, role: OfficeType): string | null {
  const pub = c.offices.filter((o) => PUBLIC_OFFICES.includes(o.type));
  if (!pub.length) return null;
  if (role === 'dirigente_territorial' && pub.every((o) => o.type === 'concejal')) return null;
  return `Incompatible con tu cargo de ${pub.map((o) => o.type).join(', ')}`;
}

/** Comunas del distrito de una comuna (para efectos distritales). */
export function comunasOfDistrictSafe(cut: number): number[] { const d = COMUNA_BY_CUT[cut]?.district; return d ? comunasOfDistrict(d).map((c) => c.cut) : [cut]; }

/** Influencia extra del jugador por ser jefe/a de bancada. */
export function caucusBonus(s: GameState, c: Character): number { return c.isPlayer && (s.career as unknown as { leg?: { caucusLead?: boolean } }).leg?.caucusLead ? 12 : 0; }

export function addTerritory(s: GameState, cuts: number[], amount: number): void {
  for (const cut of cuts) {
    const cur = s.career.capital.territory[cut] ?? 0;
    s.career.capital.territory[cut] = clamp(cur + amount * (1 - cur / 110), 0, 100);
  }
}

// ---------------------------------------------------------------------------
// Biografía
// ---------------------------------------------------------------------------
/** Registra un "primer" hito de la carrera (primera candidatura, primer mentor...) si aún no existe. */
export function first(s: GameState, key: string, text: string): void {
  s.career.firsts ??= {};
  if (!s.career.firsts[key]) s.career.firsts[key] = { week: s.week, text };
}

export function bio(s: GameState, kind: BioEntry['kind'], title: string, detail = '', tone: -1 | 0 | 1 = 0): void {
  s.career.bio.push({ week: s.week, date: currentISO(s), kind, title, detail, tone });
  if (s.career.bio.length > 600) s.career.bio.splice(0, s.career.bio.length - 600);
}

export function progress(s: GameState): void { s.career.lastProgressWeek = s.week; }

export function stagnationWeeks(s: GameState): number { return s.week - s.career.lastProgressWeek; }

const OFFICE_RANK: Partial<Record<OfficeType, number>> = { presidente: 10, ministro: 8, senador: 7, gobernador: 6.5, diputado: 6, subsecretario: 5.5, presidente_partido: 5, alcalde: 5, seremi: 4, concejal: 3, asesor: 2, dirigente_territorial: 2, dirigente_social: 1.5 };
export function officeRank(t: OfficeType | string | null): number { return t ? OFFICE_RANK[t as OfficeType] ?? 0 : 0; }

export interface CareerSummary {
  years: number;
  offices: { type: string; from: number; to: number | null; detail?: string }[];
  elections: { won: number; lost: number };
  nominations: { won: number; lost: number };
  parties: string[];
  allies: { id: string; name: string; score: number }[];
  rivals: { id: string; name: string; score: number }[];
  laws: number;
  peak: string | null;
  dimensions: { label: string; value: number }[];
  archetype: string;
  verdict: string;
  /** Uso interno (pruebas, ordenamiento): la interfaz muestra solo descripciones cualitativas */
  score: number;
  milestones: { label: string; text: string; week: number }[];
  reforms: string[];
}
