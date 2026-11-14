/**
 * DIRECTOR DE JUGABILIDAD POLÍTICA. Cada semana responde a cuatro preguntas:
 *   1. ¿Qué ocurre en el mundo?  → tramas, movimientos autónomos (feed), competencias.
 *   2. ¿Qué oportunidades y problemas afectan al personaje? → acontecimientos condicionados (bandeja).
 *   3. ¿Qué quiere conseguir el jugador? → ambición e iniciativas.
 *   4. ¿Cómo reaccionan los demás? → consecuencias, memoria, acontecimientos posteriores.
 *
 * Ritmo: objetivo de una decisión significativa cada 1–2 semanas en fase activa (tramas, iniciativas,
 * elecciones cercanas) y menos en períodos tranquilos. Nunca se fuerzan acontecimientos
 * extraordinarios. Control de repetición: enfriamientos, historial de situaciones similares,
 * exclusión por etiquetas, equilibrio de categorías y cupos de bandeja.
 */
import type { GameState } from '../models/types';
import type { Rng } from '../engine/rng';
import type { Ctx, EventCat, EventDef, PoliticalEvent, W } from './types';
import { emptyPolitics, P, me, newPid } from './ops';
import { emptyDialogue } from '../dialogue/engine';
import { INICIAL, INTERNA } from './library/inicialInterna';
import { PERSONAL, TERRITORIAL } from './library/personalTerritorial';
import { CAMPANA, INSTITUCIONAL } from './library/campanaInstitucional';
import { PRENSA, TRAYECTORIA } from './library/prensaTrayectoria';
import { ARC_EVENTS, weeklyArcs } from './arcs';
import { weeklyInitiatives } from './initiatives';
import { weeklyContests } from './rivals';
import { weeklyNpc } from './npc';
import { refreshOffers, weeklyTasks } from './contextual';

export const LIBRARY: EventDef[] = [...INICIAL, ...INTERNA, ...PERSONAL, ...TERRITORIAL, ...CAMPANA, ...INSTITUCIONAL, ...PRENSA, ...TRAYECTORIA];
export const ALL_EVENTS: EventDef[] = [...LIBRARY, ...ARC_EVENTS];
export const EVENT_BY_ID = Object.fromEntries(ALL_EVENTS.map((d) => [d.id, d])) as Record<string, EventDef>;
const CATS: EventCat[] = ['inicial', 'interna', 'personal', 'territorial', 'campana', 'institucional', 'prensa', 'trayectoria'];

export function ensurePolitics(s: GameState): void { if (!s.politics) s.politics = emptyPolitics(); if (!s.dialogue) s.dialogue = emptyDialogue(); }

/** ¿Hay una fase política activa? (tramas vivas, proyectos en curso, elecciones o procesos cerca) */
export function activePhase(w: W): boolean {
  const st = P(w);
  return st.arcs.some((a) => a.status === 'activa' || a.status === 'escalando') || st.initiatives.some((i) => i.status === 'en_curso')
    || w.s.calendar.some((e) => !e.done && e.week - w.s.week <= 26 && e.week >= w.s.week) || w.s.career.processes.some((p) => p.status === 'abierto' || p.status === 'preseleccion');
}

const textOf = (d: EventDef, w: W, ctx: Ctx) => ({ title: d.title(w, ctx), text: d.text(w, ctx) });

/** Crea un acontecimiento en la bandeja a partir de una definición y su contexto. */
export function instantiate(w: W, d: EventDef, ctx: Ctx): PoliticalEvent | null {
  const options = d.options.filter((o) => !o.when || o.when(w, ctx)).map((o) => ({ id: o.id, label: typeof o.label === 'function' ? o.label(w, ctx) : o.label, hint: o.hint }));
  if (options.length < 2) return null;
  const actors = Object.entries(ctx).filter(([k, v]) => typeof v === 'string' && w.s.characters[v] && !['arcId', 'side'].includes(k)).map(([, v]) => String(v));
  const { title, text } = textOf(d, w, ctx);
  const ev: PoliticalEvent = { id: newPid(w.s, 'pev'), defId: d.id, cat: d.cat, tier: d.tier, week: w.s.week, expires: w.s.week + (d.expires ?? (d.tier === 'cotidiano' ? 2 : 4)), title, text, actors: [...new Set(actors)],
    cut: ctx.cut !== undefined ? Number(ctx.cut) : undefined, regionId: me(w).regionId, ctx, options, arcId: ctx.arcId ? String(ctx.arcId) : undefined, status: 'pendiente', fiction: actors.some((a) => !!w.s.characters[a]?.realId) };
  P(w).events.push(ev);
  P(w).cooldowns[`ev|${d.id}`] = w.s.week + d.cooldown;
  P(w).counts[`def|${d.id}`] = (P(w).counts[`def|${d.id}`] ?? 0) + 1;
  if (d.tier !== 'cotidiano') { P(w).pacing.lastSignificant = w.s.week; P(w).pacing.decisions.push(w.s.week); if (P(w).pacing.decisions.length > 200) P(w).pacing.decisions.shift(); }
  return ev;
}

const pending = (w: W) => P(w).events.filter((e) => e.status === 'pendiente');

function generate(w: W): void {
  const st = P(w);
  const pend = pending(w);
  const pendRel = pend.filter((e) => e.tier !== 'cotidiano').length; const pendDaily = pend.length - pendRel;
  if (pendRel >= 3 && pendDaily >= 2) return; // bandeja saturada: no se agregan más
  const active = activePhase(w);
  const quiet = w.s.week - st.pacing.lastSignificant;
  // multiplicador de ritmo: busca una decisión significativa cada 1–2 semanas en fase activa, evita saturación
  // tras un vacío largo se busca activamente algo con causa en el estado (nunca se inventa sin condiciones)
  const pace = active ? (quiet >= 4 ? 5 : quiet >= 2 ? 2.8 : quiet >= 1 ? 1.3 : 0.35) : (quiet >= 6 ? 4 : quiet >= 4 ? 1.8 : quiet >= 2 ? 0.8 : 0.3);
  // equilibrio de categorías: lo frecuente en las últimas 16 semanas pesa menos
  const recent = st.events.filter((e) => w.s.week - e.week < 16);
  const catW = Object.fromEntries(CATS.map((c) => [c, 1 / (1 + recent.filter((e) => e.cat === c).length * 0.35)])) as Record<EventCat, number>;
  const pendTags = new Set(pend.flatMap((e) => EVENT_BY_ID[e.defId]?.tags ?? []));
  const cands: { d: EventDef; ctx: Ctx; score: number }[] = [];
  for (const d of LIBRARY) {
    if (d.arcOnly || (st.cooldowns[`ev|${d.id}`] ?? -1) > w.s.week) continue;
    if (pend.some((e) => e.defId === d.id)) continue;
    if ((d.tags ?? []).some((t) => pendTags.has(t))) continue; // exclusión: no dos situaciones del mismo tipo a la vez
    if (d.tier === 'cotidiano' ? pendDaily >= 2 : pendRel >= 3) continue;
    let ctx: Ctx | null = null;
    try { ctx = d.require(w); } catch { ctx = null; }
    if (!ctx) continue;
    const seen = st.counts[`def|${d.id}`] ?? 0;
    const novelty = 1 / (1 + seen * 0.4); // historial de situaciones similares
    const p = d.p * (d.favor?.(w, ctx) ?? 1) * catW[d.cat] * novelty * (d.tier === 'cotidiano' ? 1 : pace);
    if (w.rng.chance(Math.min(0.95, p))) cands.push({ d, ctx, score: d.priority + w.rng.next() * 2 });
  }
  // como máximo un acontecimiento relevante y uno cotidiano nuevos por semana
  cands.sort((a, b) => b.score - a.score);
  const rel = cands.find((c) => c.d.tier !== 'cotidiano'); const daily = cands.find((c) => c.d.tier === 'cotidiano');
  for (const c of [rel, daily]) if (c) instantiate(w, c.d, c.ctx);
}

function followups(w: W): void {
  const st = P(w);
  const due = st.followups.filter((f) => f.week <= w.s.week); st.followups = st.followups.filter((f) => f.week > w.s.week);
  for (const f of due) {
    const d = EVENT_BY_ID[f.defId]; if (!d) continue;
    if (pending(w).some((e) => e.defId === d.id)) { if (f.week > w.s.week - 6) st.followups.push({ ...f, week: w.s.week + 1 }); continue; }
    let base: Ctx | null = null;
    try { base = d.require(w); } catch { base = null; }
    if (!base) continue; // las consecuencias posteriores se reevalúan: si ya no aplican, no ocurren
    instantiate(w, d, { ...base, ...f.ctx });
  }
}

function expire(w: W): void {
  for (const e of P(w).events) {
    if (e.status !== 'pendiente' || e.expires >= w.s.week) continue;
    const d = EVENT_BY_ID[e.defId];
    if (d?.onExpire) { const o = d.options.find((x) => x.id === d.onExpire); if (o) e.outcome = o.run(w, e.ctx, e); }
    e.status = 'vencido'; e.outcome = e.outcome ?? 'Pasó sin respuesta.';
  }
  const evs = P(w).events;
  if (evs.length > 120) evs.splice(0, evs.length - 120);
  // compactación: lo ya decidido hace meses conserva título y desenlace, no el texto completo ni el contexto
  for (const e of evs) if (e.status !== 'pendiente' && w.s.week - e.week > 26 && e.text) { e.text = ''; e.options = e.options.filter((o) => o.id === e.choice); e.ctx = {}; }
}

/** Paso semanal completo del sistema de jugabilidad. */
export function weeklyPolitics(s: GameState, rng: Rng): void {
  ensurePolitics(s);
  if (s.player.careerOver) return;
  const w: W = { s, rng };
  expire(w);
  weeklyArcs(w);
  weeklyContests(w);
  weeklyInitiatives(w);
  weeklyTasks(w);
  weeklyNpc(w);
  followups(w);
  generate(w);
  refreshOffers(w);
  const st = P(w);
  st.pacing.quiet = s.week - st.pacing.lastSignificant;
}

export function resolveEvent(s: GameState, rng: Rng, id: string, optionId: string): string {
  ensurePolitics(s);
  const w: W = { s, rng };
  const e = P(w).events.find((x) => x.id === id);
  if (!e || e.status !== 'pendiente') return 'Ese asunto ya no está pendiente.';
  const d = EVENT_BY_ID[e.defId]; const o = d?.options.find((x) => x.id === optionId);
  if (!o || !e.options.some((x) => x.id === optionId)) return 'Opción no disponible.';
  const out = o.run(w, e.ctx, e);
  e.status = 'resuelto'; e.choice = optionId; e.outcome = out;
  return out;
}

/** Bandeja priorizada: urgentes (relevantes por vencer) primero. */
export function inbox(s: GameState): PoliticalEvent[] {
  return (s.politics?.events ?? []).filter((e) => e.status === 'pendiente').sort((a, b) => (b.tier === 'cotidiano' ? 0 : 1) - (a.tier === 'cotidiano' ? 0 : 1) || a.expires - b.expires);
}
/** ¿Hay algo relevante pendiente? (para avanzar varias semanas sin interrupciones innecesarias) */
export function hasRelevantPending(s: GameState): boolean { return inbox(s).some((e) => e.tier !== 'cotidiano'); }
