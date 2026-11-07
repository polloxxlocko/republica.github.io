/**
 * Personajes: generación (todos FICTICIOS), cálculo de calidad electoral, envejecimiento,
 * retiro, memoria y relaciones personales.
 */
import type { Attributes, Character, GameState, Ideology, MemoryEntry, OfficeType, Personality, PolicyArea, RegionId } from '../models/types';
import { Rng } from '../engine/rng';
import { FEMALE, MALE, SURNAMES } from '../data/names';
import { clamp } from '../rules/params';
import { jitterIdeology, newId, addHistory } from './util';
import { yearOf } from '../engine/dates';

const PERSONALITIES: Personality[] = ['pragmatico', 'ideologico', 'ambicioso', 'conciliador', 'confrontacional', 'tecnocrata', 'territorial', 'mediatico', 'institucionalista'];
const AREAS: PolicyArea[] = ['salud', 'educacion', 'vivienda', 'pensiones', 'seguridad', 'trabajo', 'impuestos', 'transporte', 'energia', 'medioambiente', 'descentralizacion', 'infraestructura', 'exterior', 'migracion', 'ciencia', 'economia', 'probidad'];

export const PERSONALITY_LABELS: Record<Personality, string> = {
  pragmatico: 'Pragmático', ideologico: 'Ideológico', ambicioso: 'Ambicioso', conciliador: 'Conciliador',
  confrontacional: 'Confrontacional', tecnocrata: 'Tecnócrata', territorial: 'Territorial', mediatico: 'Mediático', institucionalista: 'Institucionalista',
};

/** Modificadores de conducta por personalidad (usados por IA, votaciones y negociación). */
export const PERSONALITY_TRAITS: Record<Personality, { flexibility: number; loyalty: number; rebellion: number; media: number; dealmaking: number }> = {
  pragmatico: { flexibility: 0.8, loyalty: 0.5, rebellion: 0.3, media: 0.5, dealmaking: 0.8 },
  ideologico: { flexibility: 0.2, loyalty: 0.6, rebellion: 0.6, media: 0.5, dealmaking: 0.3 },
  ambicioso: { flexibility: 0.6, loyalty: 0.3, rebellion: 0.6, media: 0.7, dealmaking: 0.6 },
  conciliador: { flexibility: 0.7, loyalty: 0.7, rebellion: 0.2, media: 0.4, dealmaking: 0.9 },
  confrontacional: { flexibility: 0.3, loyalty: 0.5, rebellion: 0.7, media: 0.8, dealmaking: 0.2 },
  tecnocrata: { flexibility: 0.6, loyalty: 0.6, rebellion: 0.2, media: 0.2, dealmaking: 0.6 },
  territorial: { flexibility: 0.5, loyalty: 0.5, rebellion: 0.5, media: 0.3, dealmaking: 0.6 },
  mediatico: { flexibility: 0.5, loyalty: 0.4, rebellion: 0.5, media: 1.0, dealmaking: 0.4 },
  institucionalista: { flexibility: 0.5, loyalty: 0.8, rebellion: 0.15, media: 0.4, dealmaking: 0.7 },
};

export function randomAttrs(rng: Rng, quality: number): Attributes {
  const a = (bias = 0) => clamp(Math.round(rng.normal(quality + bias, 13)), 5, 98);
  return {
    carisma: a(), oratoria: a(), negociacion: a(), tecnico: a(-3), liderazgo: a(), disciplina: a(),
    ambicion: a(5), integridad: a(3), comunicacion: a(), redes: a(), gestion: a(), experiencia: a(-5),
  };
}

export interface CharOpts {
  partyId: string | null;
  regionId: RegionId;
  ideology: Ideology;
  quality?: number;
  minAge?: number;
  maxAge?: number;
  ideologySd?: number;
  personality?: Personality;
  recognition?: number;
}

export function createCharacter(s: GameState, rng: Rng, o: CharOpts): Character {
  const gender = rng.chance(0.47) ? 'f' : 'm';
  const firstName = rng.pick(gender === 'f' ? FEMALE : MALE);
  const lastName = `${rng.pick(SURNAMES)} ${rng.pick(SURNAMES)}`;
  const year = yearOf(s.startDate, s.week);
  const age = rng.int(o.minAge ?? 30, o.maxAge ?? 68);
  const quality = o.quality ?? 50;
  const id = newId(s, 'c');
  const recog = o.recognition ?? clamp(rng.normal(quality - 25, 12), 2, 90);
  const c: Character = {
    id, firstName, lastName, gender, birthYear: year - age, regionId: o.regionId, partyId: o.partyId, factionId: null,
    ideology: jitterIdeology(rng, o.ideology, o.ideologySd ?? 12),
    personality: o.personality ?? rng.pick(PERSONALITIES),
    attrs: randomAttrs(rng, quality),
    rep: {
      popularidad: clamp(rng.normal(45, 10), 10, 85), prestigioTecnico: clamp(rng.normal(quality - 5, 12), 5, 95),
      confianzaPartido: clamp(rng.normal(55, 12), 10, 95), credibilidad: clamp(rng.normal(50, 10), 10, 90),
      reconocimiento: recog, reconocimientoRegional: { [o.regionId]: clamp(recog + 20, 0, 100) }, relacionesParlamentarias: clamp(rng.normal(45, 12), 5, 95),
      confianzaGrupos: { empresarios: 0, sindicatos: 0, regiones: 0, jovenes: 0, adultosMayores: 0, clasesMedias: 0 },
    },
    offices: [], pastOffices: [], specialty: rng.pick(AREAS), status: 'activo', memory: [], relations: {},
    ambitionTarget: 'diputado', scandal: 0,
  };
  c.ambitionTarget = quality > 70 ? 'presidente' : quality > 58 ? 'senador' : quality > 45 ? 'diputado' : 'alcalde';
  s.characters[id] = c;
  return c;
}

export function fullName(c: Character | undefined | null): string {
  if (!c) return '—';
  if (c.displayName) return c.displayName;
  return `${c.firstName} ${c.lastName.split(' ')[0]}`;
}

export function ageOf(s: GameState, c: Character): number { return yearOf(s.startDate, s.week) - c.birthYear; }

/** Calidad electoral 0..100 de un candidato */
export function candidateQuality(c: Character, regionId?: RegionId): number {
  const regional = regionId ? (c.rep.reconocimientoRegional[regionId] ?? c.rep.reconocimiento * 0.6) : c.rep.reconocimiento;
  const q = 0.18 * c.attrs.carisma + 0.12 * c.attrs.comunicacion + 0.08 * c.attrs.oratoria + 0.18 * c.rep.popularidad
    + 0.16 * regional + 0.1 * c.rep.credibilidad + 0.08 * c.attrs.redes + 0.1 * c.attrs.experiencia - 0.25 * c.scandal;
  return clamp(q, 0, 100);
}

export function hasOffice(c: Character, type: OfficeType): boolean { return c.offices.some((o) => o.type === type); }

/** Forma inclusiva cuando el sexo no está documentado: «Presidente/a», «Alcalde/sa». */
function inclusive(m: string, f: string): string {
  if (m === f) return m;
  const mw = m.split(' '); const fw = f.split(' ');
  if (mw.length !== fw.length) return `${m}/${f}`;
  return mw.map((w, i) => { const v = fw[i]; if (w === v) return w; let k = 0; while (k < w.length && w[k] === v[k]) k++; return `${w}/${v.slice(k)}`; }).join(' ');
}

export function officeLabel(type: OfficeType, gender: 'f' | 'm' | 'x' = 'm'): string {
  if (gender === 'x') return inclusive(officeLabel(type, 'm'), officeLabel(type, 'f'));
  const f = gender === 'f';
  switch (type) {
    case 'presidente': return f ? 'Presidenta de la República' : 'Presidente de la República';
    case 'ministro': return f ? 'Ministra' : 'Ministro';
    case 'senador': return f ? 'Senadora' : 'Senador';
    case 'diputado': return f ? 'Diputada' : 'Diputado';
    case 'gobernador': return f ? 'Gobernadora regional' : 'Gobernador regional';
    case 'alcalde': return f ? 'Alcaldesa' : 'Alcalde';
    case 'concejal': return f ? 'Concejala' : 'Concejal';
    case 'presidente_partido': return f ? 'Presidenta de partido' : 'Presidente de partido';
    case 'dirigente_territorial': return f ? 'Dirigenta territorial' : 'Dirigente territorial';
    case 'subsecretario': return f ? 'Subsecretaria' : 'Subsecretario';
    case 'seremi': return 'Seremi';
    case 'dirigente_social': return f ? 'Dirigenta social' : 'Dirigente social';
    case 'asesor': return f ? 'Asesora política' : 'Asesor político';
    default: return f ? 'Militante' : 'Militante';
  }
}

export function removeOffice(s: GameState, c: Character, type: OfficeType, detail?: string): void {
  const idx = c.offices.findIndex((o) => o.type === type);
  if (idx >= 0) {
    const o = c.offices[idx];
    c.pastOffices.push({ type, from: o.since, to: s.week, detail });
    c.offices.splice(idx, 1);
  }
}

/**
 * Actor cuya memoria se conserva a largo plazo (el personaje del jugador): sus recuerdos no se
 * descartan por antigüedad frente a otros y su relación nunca se poda. Así, una campaña
 * compartida a los 22 años puede pesar dos décadas después (consecuencias diferidas, 18.4).
 */
let longMemoryId = '';
export function setLongMemory(id: string): void { longMemoryId = id; }

export function remember(c: Character, entry: MemoryEntry): void {
  c.memory.push(entry);
  if (c.memory.length > 30) {
    const mine = c.memory.filter((m) => m.aboutId === longMemoryId);
    const rest = c.memory.filter((m) => m.aboutId !== longMemoryId);
    // se conservan hasta 12 recuerdos sobre el jugador; los más antiguos se condensan en la relación
    while (mine.length > 12) mine.shift();
    while (rest.length + mine.length > 30) rest.shift();
    c.memory = [...rest, ...mine].sort((a, b) => a.week - b.week);
  }
  const cur = c.relations[entry.aboutId] ?? 0;
  c.relations[entry.aboutId] = clamp(cur + entry.weight * 0.5, -100, 100);
  const keys = Object.keys(c.relations).filter((k) => k !== longMemoryId);
  if (keys.length > 40) {
    keys.sort((a, b) => Math.abs(c.relations[a]) - Math.abs(c.relations[b]));
    delete c.relations[keys[0]];
  }
}

/** Saldo de memoria de un personaje sobre otro actor (acuerdos, traiciones...) */
export function memoryBalance(c: Character, aboutId: string): number {
  let t = 0;
  for (const m of c.memory) if (m.aboutId === aboutId) t += m.weight;
  return clamp(t + (c.relations[aboutId] ?? 0) * 0.5, -100, 100);
}

/** Envejecimiento y retiro anual (se llama en la primera semana de cada año). */
export function yearlyAging(s: GameState, rng: Rng): void {
  for (const c of Object.values(s.characters)) {
    if (c.status !== 'activo' || c.isPlayer) continue;
    if (c.id === s.government.presidentId || c.id === s.government.electId) continue; // el Presidente en ejercicio no se retira
    const age = ageOf(s, c);
    const pRetire = age < 65 ? 0.01 : age < 72 ? 0.07 : age < 80 ? 0.18 : 0.4;
    const holdsKey = c.offices.some((o) => ['presidente', 'senador', 'diputado', 'ministro', 'gobernador'].includes(o.type));
    if (c.realId) {
      // Personas reales: retiro voluntario simulado al no ejercer cargos (sin conjeturas sobre su salud)
      const anyOffice = c.offices.some((o) => o.type !== 'militante');
      if (!anyOffice && rng.chance(age < 60 ? 0.04 : age < 70 ? 0.12 : 0.3)) retire(s, c, 'retirado');
      continue;
    }
    if (rng.chance(holdsKey ? pRetire * 0.35 : pRetire)) retire(s, c, age > 85 && rng.chance(0.3) ? 'fallecido' : 'retirado');
    else if (age < 60) {
      c.attrs.experiencia = clamp(c.attrs.experiencia + 1, 0, 100);
    }
  }
}

export function retire(s: GameState, c: Character, status: 'retirado' | 'fallecido'): void {
  c.status = status;
  for (const o of [...c.offices]) {
    if (o.type === 'diputado' || o.type === 'senador') {
      // Reemplazo: en Chile la vacante la provee el partido; se modela con un nuevo personaje del mismo partido.
      const seat = s.seats.find((st) => st.holderId === c.id);
      if (seat) seat.holderId = null;
    }
    if (o.type === 'ministro') {
      const post = s.government.cabinet.find((p) => p.ministerId === c.id);
      if (post) post.ministerId = null;
    }
    if (o.type === 'presidente_partido' && c.partyId && s.parties[c.partyId]?.leaderId === c.id) s.parties[c.partyId].leaderId = null;
    if (o.type === 'gobernador' && o.regionId) s.regions[o.regionId].governorId = null;
    removeOffice(s, c, o.type, status);
  }
  if (c.offices.length === 0 && (c.rep.reconocimiento > 55)) {
    addHistory(s, 'partido', `${status === 'fallecido' ? 'Fallece' : 'Se retira'} ${fullName(c)}`, c.realId ? 'Retiro voluntario simulado: deja la vida pública en esta partida (ficción).' : `Figura política de ${c.partyId ?? 'independiente'} deja la vida pública.`, 1);
  }
}
