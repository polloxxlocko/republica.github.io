/**
 * FORMATO DE GUARDADO: envoltorio versionado, validación estructural, migraciones y recuperación.
 */
import type { GameState } from '../game/models/types';
import { SCHEMA_VERSION } from '../game/scenarios/chile2026';
import { emptyPolling } from '../game/polling';
import { initMedia } from '../game/media';
import { Rng, seedRng } from '../game/engine/rng';
import { initTerritory, initialMayors } from '../game/territory/init';
import { emptyCareer } from '../game/career/capital';

export const SAVE_FORMAT = 'republica-chile-save';

export interface SaveEnvelope { format: string; schemaVersion: number; exportedAt: string; game: GameState; }

export class SaveError extends Error {}

type Migration = (g: Record<string, unknown>) => Record<string, unknown>;

/** Migraciones secuenciales: MIGRATIONS[n] convierte de la versión n a n+1. */
export const MIGRATIONS: Record<number, Migration> = {
  1: (g) => ({ ...g, campaignSpend: g.campaignSpend ?? {}, presidentialCandidates: g.presidentialCandidates ?? {} }),
  6: (g) => {
    // v6 → v7: agenda semanal, equipo propio y presencia digital
    const c = (g.career ?? {}) as Record<string, unknown>;
    const cap = (c.capital ?? {}) as Record<string, unknown>;
    return { ...g, career: { ...c, team: c.team ?? [], agenda: c.agenda ?? { week: -1, offers: [], used: [], lastDefs: [] }, capital: { ...cap, digital: cap.digital ?? 0 } } };
  },
  5: (g) => {
    // v5 → v6: información imperfecta, situaciones latentes, balances electorales, contactos, hitos y agenda personal
    const c = (g.career ?? emptyCareer()) as unknown as Record<string, unknown>;
    return { ...g, career: { ...c, intel: c.intel ?? [], latent: c.latent ?? [], sources: c.sources ?? {}, reviews: c.reviews ?? [], contacts: c.contacts ?? {}, firsts: c.firsts ?? {}, workMode: c.workMode ?? 'parcial', pressure: c.pressure ?? 0 } };
  },
  4: (g) => {
    // v4 → v5: modo carrera. La partida conserva su punto de inicio; se crea el registro de carrera vacío.
    if (g.career) return g;
    const st = g as unknown as GameState;
    const career = emptyCareer();
    const pc = st.characters?.[st.player?.characterId];
    career.lastOffices = pc ? pc.offices.map((o) => o.type) : [];
    career.lastProgressWeek = st.week ?? 0;
    if (pc?.partyId) career.stats.parties.push(pc.partyId);
    return { ...g, career };
  },
  3: (g) => {
    // v3 → v4: electorado regional → territorial (346 comunas). Se recalibra con datos oficiales;
    // se conservan partidos, personajes, Congreso, gobierno, economía e historial.
    const st = g as unknown as GameState;
    const rng = new Rng(st.rng);
    const fallback = Object.fromEntries(Object.values(st.parties).filter((p) => p.active).map((p) => [p.id, st.nationalIntention?.[p.id] ?? 2]));
    initTerritory(st, rng, 'juego', fallback);
    initialMayors(st, rng);
    st.rng = rng.state;
    return st as unknown as Record<string, unknown>;
  },
  2: (g) => {
    const gov = (g.government ?? {}) as Record<string, unknown>;
    return { ...g, government: { ...gov, electId: gov.electId ?? null, electCoalitionId: gov.electCoalitionId ?? null, coalitionTerms: gov.coalitionTerms ?? 0 } };
  },
};

export function migrate(raw: Record<string, unknown>): GameState {
  let v = Number(raw.schemaVersion ?? 1);
  if (!Number.isFinite(v) || v < 1) v = 1;
  if (v > SCHEMA_VERSION) throw new SaveError(`La partida fue creada con una versión más nueva del juego (esquema ${v}).`);
  let g = { ...raw };
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new SaveError(`No existe migración desde el esquema ${v}`);
    g = m(g); v += 1; g.schemaVersion = v;
  }
  return g as unknown as GameState;
}

const REQUIRED: [string, string][] = [
  ['id', 'string'], ['week', 'number'], ['startDate', 'string'], ['characters', 'object'], ['parties', 'object'],
  ['regions', 'object'], ['segments', 'object'], ['seats', 'object'], ['government', 'object'], ['economy', 'object'],
  ['opinion', 'object'], ['calendar', 'object'], ['player', 'object'], ['rng', 'object'], ['settings', 'object'],
];

/** Validación estructural. Devuelve lista de problemas (vacía = válido). */
export function validateGame(g: unknown): string[] {
  const errs: string[] = [];
  if (!g || typeof g !== 'object') return ['El archivo no contiene una partida'];
  const o = g as Record<string, unknown>;
  for (const [k, t] of REQUIRED) if (typeof o[k] !== t || o[k] === null) errs.push(`Falta o es inválido: ${k}`);
  if (errs.length) return errs;
  const s = o as unknown as GameState;
  if (!Array.isArray(s.rng) || s.rng.length !== 4 || s.rng.some((x) => typeof x !== 'number')) errs.push('Estado aleatorio inválido');
  if (!Array.isArray(s.seats) || s.seats.length !== 205) errs.push('Composición del Congreso inválida (se esperan 205 escaños)');
  if (!s.characters[s.player.characterId]) errs.push('El personaje del jugador no existe');
  if (!s.characters[s.government.presidentId]) errs.push('El Presidente en ejercicio no existe');
  if (!Array.isArray(s.segments) || s.segments.length < 16) errs.push('Electorado inválido');
  if (!s.comunas || Object.keys(s.comunas).length !== 346) errs.push('Territorio inválido (se esperan 346 comunas)');
  if (s.week < 0 || !Number.isInteger(s.week)) errs.push('Semana inválida');
  return errs;
}

/** Recuperación de campos opcionales ausentes o corruptos (sin alterar lo esencial). */
export function repairGame(g: GameState): GameState {
  g.news ??= []; g.history ??= []; g.polls ??= []; g.polling ??= emptyPolling();
  if (!g.media) initMedia(g, new Rng(seedRng(g.settings.seed ?? 1)));
  for (const n of g.news) n.outletId ??= 'elmercurio'; g.results ??= []; g.pending ??= []; g.crises ??= []; g.deferred ??= [];
  g.eventCooldowns ??= {}; g.eventCounts ??= {}; g.bills ??= []; g.economyHistory ??= []; g.opinionHistory ??= []; g.log ??= [];
  g.player.candidacies ??= []; g.player.achievements ??= []; g.player.lastActionResults ??= []; g.player.seenResultIds ??= [];
  g.career ??= emptyCareer();
  { const e = emptyCareer(); for (const k of Object.keys(e) as (keyof typeof e)[]) if (g.career[k] === undefined) (g.career as unknown as Record<string, unknown>)[k] = e[k]; }
  g.partyRelations ??= {}; g.coalitions ??= {}; g.nationalIntention ??= {}; g.campaignSpend ??= {}; g.presidentialCandidates ??= {};
  for (const c of Object.values(g.characters)) { c.memory ??= []; c.relations ??= {}; c.offices ??= []; c.pastOffices ??= []; c.scandal = Number.isFinite(c.scandal) ? c.scandal : 0; }
  for (const [k, v] of Object.entries(g.economy)) if (typeof v === 'number' && !Number.isFinite(v)) (g.economy as unknown as Record<string, number>)[k] = 0;
  return g;
}

export function serialize(g: GameState): string {
  const env: SaveEnvelope = { format: SAVE_FORMAT, schemaVersion: g.schemaVersion, exportedAt: new Date().toISOString(), game: g };
  return JSON.stringify(env);
}

/** Lee un archivo exportado (o una partida "cruda"), migra, valida y repara. */
export function deserialize(text: string): GameState {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new SaveError('El archivo no es JSON válido o está dañado.'); }
  let raw: Record<string, unknown>;
  if (parsed && typeof parsed === 'object' && (parsed as SaveEnvelope).format === SAVE_FORMAT) raw = (parsed as SaveEnvelope).game as unknown as Record<string, unknown>;
  else if (parsed && typeof parsed === 'object' && 'characters' in (parsed as object)) raw = parsed as Record<string, unknown>;
  else throw new SaveError('El archivo no corresponde a una partida de REPÚBLICA: CHILE.');
  const g = repairGame(migrate(raw));
  const errs = validateGame(g);
  if (errs.length) throw new SaveError(`Partida inválida: ${errs.join('; ')}`);
  return g;
}
