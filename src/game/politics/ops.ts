/**
 * OPERACIONES de los acontecimientos, tramas e iniciativas. Ningún acontecimiento modifica el mundo
 * directamente: usa estas funciones, que conectan con los sistemas existentes (relaciones y memoria
 * del sistema de conversaciones, compromisos, capital territorial, partidos, noticias, biografía).
 */
import type { Attributes, Character, GameState, OfficeType, RegionId } from '../models/types';
import type { Arc, Ctx, PoliticsState, W, WorldMove } from './types';
import { clamp } from '../rules/params';
import { newId } from '../systems/util';
import { addNews } from '../systems/news';
import { COMUNA_BY_CUT } from '../territory/data';
import { REGION_BY_ID } from '../data/geography';
import { addTerritory, bio, homeCut, partyInfluenceOf, capitalOf } from '../career/capital';
import { changeRel, disposition, getRel } from '../dialogue/relations';
import { addMemory } from '../dialogue/memory';
import { addCommitment } from '../dialogue/commitments';
import { regionalFigure, worldOp } from '../dialogue/world';
import type { CharacterMemory, CommitmentKind, Importance } from '../dialogue/types';
import { emptyDialogue } from '../dialogue/engine';

export function emptyPolitics(): PoliticsState {
  return { offers: [], tasks: [], events: [], arcs: [], initiatives: [], contests: [], ambition: null, ambitionHistory: [], feed: [], followups: [], cooldowns: {}, counts: {},
    pacing: { lastSignificant: 0, lastExtraordinary: -999, quiet: 0, decisions: [] } };
}
export const P = (w: W) => w.s.politics!;
export const me = (w: W): Character => w.s.characters[w.s.player.characterId];
export const party = (w: W) => { const c = me(w); return c.partyId ? w.s.parties[c.partyId] : null; };
export const home = (w: W) => homeCut(w.s);
export const comuna = (cut: number | string | undefined) => COMUNA_BY_CUT[Number(cut)]?.name ?? 'la comuna';
export const region = (id: string | undefined) => (id ? REGION_BY_ID[id as RegionId]?.name ?? id : 'la región');
export const name = (w: W, id: string | number | undefined) => { const c = w.s.characters[String(id)]; return c ? `${c.firstName} ${c.lastName}` : 'alguien'; };
export const firstN = (w: W, id: string | number | undefined) => w.s.characters[String(id)]?.firstName ?? 'alguien';
export const ch = (w: W, id: string | number | undefined) => w.s.characters[String(id)];
export const has = (c: Character | undefined, ...t: OfficeType[]) => !!c?.offices.some((o) => t.includes(o.type));
export const isLeg = (c: Character | undefined) => has(c, 'diputado', 'senador');
export const elected = (c: Character | undefined) => has(c, 'concejal', 'alcalde', 'diputado', 'senador', 'gobernador', 'presidente');
export const exec = (c: Character | undefined) => has(c, 'ministro', 'subsecretario', 'seremi', 'presidente');
export const terr = (w: W) => capitalOf(w.s).territorial;
export const infl = (w: W, c?: Character) => partyInfluenceOf(w.s, c ?? me(w));
export const disp = (w: W, npc: string | number) => disposition(w.s, String(npc), me(w).id);
export const relOf = (w: W, npc: string | number) => getRel(w.s, String(npc), me(w).id);
export const chance = (w: W, p: number) => w.rng.chance(clamp(p, 0, 1));
/** Habilidad del jugador en ciertos atributos, 0..1, con incertidumbre. */
export const skill = (w: W, ...a: (keyof Attributes)[]) => clamp(a.reduce((t, k) => t + me(w).attrs[k], 0) / a.length / 100 + w.rng.normal(0, 0.15), 0, 1);
export const nextElection = (w: W, types?: string[]) => w.s.calendar.filter((e) => !e.done && e.week >= w.s.week && (!types || types.includes(e.type))).sort((a, b) => a.week - b.week)[0];
export const weeksTo = (w: W, types: string[]) => { const e = nextElection(w, types); return e ? e.week - w.s.week : 999; };

/** Personajes ficticios activos que cumplen un filtro (para conflictos nunca se usan personas reales). */
export function fictional(w: W, f: (c: Character) => boolean): Character[] {
  return Object.values(w.s.characters).filter((c) => c.status === 'activo' && !c.isPlayer && !c.realId && f(c));
}
export function pickW(w: W, pool: Character[], weight: (c: Character) => number = () => 1): Character | null {
  return pool.length ? w.rng.weighted(pool, pool.map((c) => Math.max(0.01, weight(c)))) : null;
}
/** Figura ficticia del partido del jugador en su región (se crea si no existe). */
export function localFigure(w: W, exclude: string[] = []): Character | null {
  const c = me(w); if (!c.partyId) return null;
  return regionalFigure(w.s, w.rng, c.partyId, c.regionId, [c.id, ...exclude]);
}
/** Conocidos del jugador (personajes con relación registrada). */
export function contacts(w: W, f: (c: Character) => boolean = () => true): Character[] {
  const c = me(w);
  const ids = new Set([...Object.keys(c.relations), ...Object.values(w.s.dialogue?.rel ?? {}).filter((r) => r.to === c.id).map((r) => r.from)]);
  return [...ids].map((id) => w.s.characters[id]).filter((x): x is Character => !!x && x.status === 'activo' && !x.isPlayer && f(x));
}

// ───────────────────────────── efectos ─────────────────────────────
type Dims = Parameters<typeof changeRel>[1]['dims'];
export function rel(w: W, npc: string | number, dims: Dims, importance: Importance = 'relevante'): void {
  if (!w.s.dialogue) w.s.dialogue = emptyDialogue();
  changeRel(w.s, { type: 'rel', from: String(npc), to: me(w).id, dims, importance });
}
export function mem(w: W, npc: string | number, kind: CharacterMemory['kind'], summary: string, importance: Importance = 'relevante'): void {
  if (!w.s.dialogue) w.s.dialogue = emptyDialogue();
  addMemory(w.s, { owner: String(npc), about: me(w).id, participants: [String(npc), me(w).id], kind, summary, importance });
}
type RepDim = 'popularidad' | 'prestigioTecnico' | 'confianzaPartido' | 'credibilidad' | 'reconocimiento' | 'relacionesParlamentarias';
export function rep(w: W, dim: RepDim, delta: number): void { const c = me(w); c.rep[dim] = clamp(c.rep[dim] + delta, 0, 100); }
export function regRep(w: W, regionId: string, delta: number): void { const r = me(w).rep.reconocimientoRegional; r[regionId as RegionId] = clamp((r[regionId as RegionId] ?? 0) + delta, 0, 100); }
export function land(w: W, cut: number | string | undefined, amount: number): void { addTerritory(w.s, [Number(cut ?? home(w))], amount); }
export function org(w: W, d: number): void { w.s.career.capital.organization = clamp(w.s.career.capital.organization + d, 0, 100); }
export function rejection(w: W, d: number): void { w.s.career.capital.rejection = clamp(w.s.career.capital.rejection + d, 0, 100); }
export function funds(w: W, d: number): void { w.s.player.personalFunds += d; }
export function discontent(w: W, cut: number | string, d: number): void { const c = w.s.comunas[String(cut)]; if (c) c.discontent = clamp(c.discontent + d, 0, 100); }
export function partyTerr(w: W, d: number): void { const p = party(w); if (p) p.territorial[me(w).regionId] = clamp(p.territorial[me(w).regionId] + d, 0, 1); }
export function cohesion(w: W, d: number, partyId?: string): void { const p = partyId ? w.s.parties[partyId] : party(w); if (p) p.cohesion = clamp(p.cohesion + d, 0, 100); }
export function npcRep(w: W, npc: string | number, dim: RepDim, d: number): void { const c = ch(w, npc); if (c) c.rep[dim] = clamp(c.rep[dim] + d, 0, 100); }
export function commit(w: W, creditor: string | number, kind: CommitmentKind, content: string, weeks: number, conditions: Record<string, string | number> = {}, importance: Importance = 'compromiso', debtorIsNpc = false): void {
  if (!w.s.dialogue) w.s.dialogue = emptyDialogue();
  const pid = me(w).id;
  addCommitment(w.s, { debtor: debtorIsNpc ? String(creditor) : pid, creditor: debtorIsNpc ? pid : String(creditor), kind, content, dueWeek: w.s.week + weeks, conditions, visibility: 'conocido', importance });
}
export function invite(w: W, fromId: string | number, defId: string, args: Record<string, string | number>, motive: string): void {
  if (!w.s.dialogue) w.s.dialogue = emptyDialogue();
  worldOp(w.s, w.rng, 'invite', { fromId: String(fromId), defId, motive, target: String(fromId), ...args });
}
export function follow(w: W, defId: string, inWeeks: number, ctx: Ctx): void { P(w).followups.push({ week: w.s.week + inWeeks, defId, ctx }); }
export function feed(w: W, actorId: string, kind: WorldMove['kind'], text: string, arcId?: string): void {
  const a = ch(w, actorId);
  const near = !!a && (a.regionId === me(w).regionId || a.partyId === me(w).partyId);
  P(w).feed.push({ week: w.s.week, actorId, kind, text, arcId, regionId: a?.regionId, nearPlayer: near });
  if (P(w).feed.length > 120) P(w).feed.splice(0, P(w).feed.length - 120);
}
export function news(w: W, cat: 'partidos' | 'regiones' | 'jugador' | 'congreso' | 'gobierno' | 'elecciones' | 'coaliciones', headline: string, body: string, importance = 2, actors: string[] = []): void {
  addNews(w.s, w.rng, cat, headline, body, importance, 0, 0, { actors, regionId: me(w).regionId });
}
export function life(w: W, kind: Parameters<typeof bio>[1], title: string, detail = '', tone: -1 | 0 | 1 = 0): void { bio(w.s, kind, title, detail, tone); }
export function newPid(s: GameState, prefix: string) { return newId(s, prefix); }

// ───────────────────────────── tramas ─────────────────────────────
export const arcById = (w: W, id: string | number | undefined) => P(w).arcs.find((a) => a.id === String(id));
export function heat(w: W, arc: Arc | undefined, d: number, note?: string): void {
  if (!arc || arc.status === 'resuelta') return;
  arc.heat = clamp(arc.heat + d, 0, 100); arc.lastWeek = w.s.week;
  arc.status = arc.heat >= 70 ? 'escalando' : arc.heat <= 12 ? 'latente' : 'activa';
  if (note) arc.history.push({ week: w.s.week, text: note });
}
export function stage(w: W, arc: Arc | undefined, st: string, note: string): void {
  if (!arc || arc.status === 'resuelta') return;
  arc.stage = st; arc.lastWeek = w.s.week; arc.history.push({ week: w.s.week, text: note });
}
export function side(arc: Arc | undefined, who: string): void { if (arc) arc.playerSide = who; }
