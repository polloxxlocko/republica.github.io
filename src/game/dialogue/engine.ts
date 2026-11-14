/**
 * MOTOR DE CONVERSACIONES. Flujo: contexto → interlocutores → definición válida → diálogo → opciones →
 * respuesta → reacción autónoma → relaciones → compromisos → consecuencias diferidas → historial.
 * La interfaz solo invoca acciones (dispatch); nunca modifica el mundo directamente.
 */
import type { GameState } from '../models/types';
import type { Rng } from '../engine/rng';
import { clamp } from '../rules/params';
import { newId, currentISO } from '../systems/util';
import type { DialogueCtx, DialogueDefinition, DialogueEffect, DialogueOption, DialogueSession, DialogueState } from './types';
import { DEFINITIONS, DEF_BY_ID } from './definitions';
import { render, styleOf } from './text';
import { changeRel, getRel } from './relations';
import { addMemory, memoriesOf } from './memory';
import { addCommitment } from './commitments';
import { worldOp } from './world';
import { homeCut } from '../career/capital';

export function emptyDialogue(): DialogueState {
  return { sessions: [], rel: {}, memories: [], commitments: [], invitations: [], proposals: [], info: [], races: [], positions: [], deferred: [], cooldowns: {},
    reputation: { cumplimiento: 50, respeto: 20 }, actionLog: [], styles: {}, regionalPresidents: {} };
}

export function ctxOf(s: GameState, rng: Rng, sess: DialogueSession): DialogueCtx {
  const me = s.characters[s.player.characterId];
  const npc = s.characters[sess.participants[0]];
  return { s, sess, rng, me, npc, style: styleOf(s, npc), v: sess.vars };
}

const cdKey = (d: DialogueDefinition, args: Record<string, string | number>, target?: string) => `${d.id}|${target ?? args.target ?? ''}`;

/** Por qué no se puede iniciar (null si se puede). Basado en circunstancias del juego. */
export function startBlocked(s: GameState, defId: string, args: Record<string, string | number>): string | null {
  const d = DEF_BY_ID[defId]; if (!d) return 'Conversación desconocida';
  const st = s.dialogue!;
  if (st.sessions.some((x) => x.status === 'activa')) return 'Termina primero la conversación en curso';
  const me = s.characters[s.player.characterId];
  if (d.requiresOffice && !me.offices.some((o) => d.requiresOffice!.includes(o.type))) return 'No tienes un cargo que permita esta conversación';
  const setup = d.setup(s, args);
  if (!setup) return 'No hay condiciones para esta conversación ahora';
  const target = setup.participants[0];
  const cd = st.cooldowns[cdKey(d, args, target)] ?? -1;
  if (cd > s.week) return `Hablaron hace poco; podrás retomar el tema en ${cd - s.week} semana(s)`;
  const busy = st.cooldowns[`npc|${target}`] ?? -1;
  if (busy > s.week && d.kind !== 'breve') return 'Su agenda está copada esta semana';
  return null;
}

function enterNode(s: GameState, rng: Rng, sess: DialogueSession, nodeId: string, guard = 0): void {
  const d = DEF_BY_ID[sess.defId];
  const node = d.nodes[nodeId];
  if (!node) { closeSession(s, sess, 'sin resultado'); return; }
  sess.nodeId = nodeId;
  const c = ctxOf(s, rng, sess);
  for (const e of node.onEnter?.(c) ?? []) applyEffect(s, rng, sess, e);
  const txt = render(node.text, c);
  if (txt) {
    const speaker = node.speaker === 'narrador' ? 'narrador' : typeof node.speaker === 'number' ? sess.participants[node.speaker] : sess.participants[0];
    sess.transcript.push({ speaker, text: txt, kind: node.speaker === 'narrador' ? 'narracion' : 'dialogo' });
  }
  if (node.decide && guard < 6) { enterNode(s, rng, sess, node.decide(c), guard + 1); return; }
  if (node.end) { closeSession(s, sess, node.end); return; }
  // límite de extensión: la conversación se cierra con naturalidad
  if (sess.exchanges >= sess.maxExchanges) { sess.transcript.push({ speaker: 'narrador', text: 'Se acaba el tiempo de la reunión; quedan en volver a hablar.', kind: 'narracion' }); closeSession(s, sess, 'sin acuerdo (tiempo)'); }
}

export function optionsOf(s: GameState, rng: Rng, sess: DialogueSession): DialogueOption[] {
  if (sess.status !== 'activa') return [];
  const d = DEF_BY_ID[sess.defId]; const node = d.nodes[sess.nodeId];
  const c = ctxOf(s, rng, sess);
  const opts = typeof node.options === 'function' ? node.options(c) : node.options ?? [];
  return opts.filter((o) => (o.when ?? []).every((w) => w.test(c)) && !sess.chosen.includes(`${sess.nodeId}:${o.id}`));
}

export function startSession(s: GameState, rng: Rng, defId: string, args: Record<string, string | number>, initiator = 'jugador'): DialogueSession | string {
  const blocked = startBlocked(s, defId, args); if (blocked) return blocked;
  const d = DEF_BY_ID[defId]; const setup = d.setup(s, args)!;
  const st = s.dialogue!;
  const sess: DialogueSession = {
    id: newId(s, 'conv'), defId, week: s.week, place: setup.place, participants: setup.participants, initiator, motive: setup.motive, formality: d.formality,
    time: setup.time ?? (d.kind === 'breve' ? 'breve' : d.kind === 'decisiva' ? 'amplio' : 'normal'), nodeId: d.start, exchanges: 0, maxExchanges: d.maxExchanges,
    vars: { ...setup.vars, ...args }, transcript: [], chosen: [], status: 'activa', reactions: [], fiction: setup.participants.some((id) => !!s.characters[id]?.realId),
  };
  st.sessions.push(sess);
  for (const p of sess.participants) {
    const first = !memoriesOf(s, p, s.player.characterId).length && (getRel(s, p, s.player.characterId).familiarity < 10);
    if (first) addMemory(s, { owner: p, about: s.player.characterId, participants: [p, s.player.characterId], kind: 'primer_encuentro', summary: `Primera conversación: ${d.title.toLowerCase()}`, importance: 'menor', refs: [sess.id] });
    st.cooldowns[`npc|${p}`] = s.week + (d.kind === 'breve' ? 0 : 1);
  }
  st.cooldowns[cdKey(d, args, setup.participants[0])] = s.week + d.cooldownWeeks;
  enterNode(s, rng, sess, d.start);
  return sess;
}

export function respond(s: GameState, rng: Rng, sessionId: string, optionId: string): string {
  const sess = s.dialogue!.sessions.find((x) => x.id === sessionId);
  if (!sess || sess.status !== 'activa') return 'La conversación ya terminó.';
  const opt = optionsOf(s, rng, sess).find((o) => o.id === optionId);
  if (!opt) return 'Esa respuesta no está disponible.';
  const c = ctxOf(s, rng, sess);
  sess.transcript.push({ speaker: s.player.characterId, text: render(opt.text, c), kind: 'jugador' });
  sess.chosen.push(`${sess.nodeId}:${opt.id}`);
  sess.exchanges++;
  const before = sess.reactions.length;
  for (const e of opt.effects?.(c) ?? []) applyEffect(s, rng, sess, e);
  const next = typeof opt.next === 'function' ? opt.next(c) : opt.next;
  enterNode(s, rng, sess, next);
  const closed = (sess.status as string) === 'cerrada';
  return sess.reactions.slice(before).join(' ') || (closed ? `Conversación terminada: ${sess.outcome}.` : '');
}

export function closeSession(s: GameState, sess: DialogueSession, outcome: string): void {
  sess.status = 'cerrada'; sess.outcome = outcome;
  // familiaridad y registro histórico
  // conversar construye conocimiento mutuo (en ambas direcciones), con saturación
  for (const p of sess.participants) for (const [a, b] of [[p, s.player.characterId], [s.player.characterId, p]]) { const r = getRel(s, a, b); r.familiarity = Math.min(100, r.familiarity + (100 - r.familiarity) * (sess.exchanges >= 3 ? 0.2 : 0.12)); }
  const st = s.dialogue!;
  const closed = st.sessions.filter((x) => x.status === 'cerrada');
  if (closed.length > 80) { const drop = new Set(closed.slice(0, closed.length - 80).map((x) => x.id)); st.sessions = st.sessions.filter((x) => !drop.has(x.id)); }
}

/** Aplica un efecto estructurado. Es el ÚNICO punto por el que una conversación cambia el mundo. */
export function applyEffect(s: GameState, rng: Rng, sess: DialogueSession, e: DialogueEffect): void {
  const st = s.dialogue!; const me = s.characters[s.player.characterId];
  switch (e.type) {
    case 'rel': changeRel(s, e); break;
    case 'memory': addMemory(s, { owner: e.owner, about: e.about, participants: [e.owner, e.about], kind: e.kind, summary: e.summary, importance: e.importance, refs: [sess.id] }); break;
    case 'commitment': { const cm = addCommitment(s, { ...e.c, sessionId: sess.id }); sess.reactions.push(`Compromiso: ${cm.content}.`); break; }
    case 'rep': {
      if (e.dim === 'respeto' || e.dim === 'cumplimiento') st.reputation[e.dim] = clamp(st.reputation[e.dim] + e.delta, 0, 100);
      else if (e.dim === 'territorial') { const t = s.career.capital.territory; const cut = homeCut(s); if (cut) t[cut] = clamp((t[cut] ?? 0) + e.delta, 0, 100); }
      else me.rep[e.dim] = clamp(me.rep[e.dim] + e.delta, 0, 100);
      break;
    }
    case 'world': { const msg = worldOp(s, rng, e.op, e.args); if (msg) sess.reactions.push(msg); break; }
    case 'info': st.info.push({ id: newId(s, 'info'), week: s.week, ...e.card }); if (st.info.length > 120) st.info.splice(0, st.info.length - 120); sess.reactions.push(e.card.kind === 'rumor' ? 'Te quedas con un rumor (no confirmado).' : 'Obtienes información nueva.'); break;
    case 'defer': st.deferred.push({ id: newId(s, 'df'), week: s.week + e.inWeeks, op: e.op, args: { ...e.args, sessionId: sess.id }, note: e.note }); break;
    case 'position': st.positions.push({ week: s.week, topic: e.topic, stance: e.stance, source: sess.id }); if (st.positions.length > 80) st.positions.shift(); break;
    case 'reaction': sess.reactions.push(e.text); break;
  }
}

/** Conversaciones que el jugador puede iniciar ahora (con su motivo de bloqueo si no puede). */
export function playerStarts(s: GameState): { defId: string; args: Record<string, string | number>; label: string; blocked: string | null; kind: DialogueDefinition['kind'] }[] {
  const out: { defId: string; args: Record<string, string | number>; label: string; blocked: string | null; kind: DialogueDefinition['kind'] }[] = [];
  for (const d of DEFINITIONS) {
    if (!d.initiators.includes('jugador') || !d.label) continue;
    // contenido por etapa: lo que exige un cargo ni siquiera se ofrece a quien no lo tiene
    if (d.requiresOffice && !s.characters[s.player.characterId].offices.some((o) => d.requiresOffice!.includes(o.type))) continue;
    for (const args of playerTargets(s, d)) {
      if (!d.setup(s, args)) continue;
      out.push({ defId: d.id, args, label: d.label(s, args), blocked: startBlocked(s, d.id, args), kind: d.kind });
    }
  }
  return out;
}

function playerTargets(s: GameState, d: DialogueDefinition): Record<string, string | number>[] {
  const me = s.characters[s.player.characterId];
  switch (d.id) {
    case 'pedir_respaldo': {
      const p = s.career.processes.find((x) => x.status === 'abierto' || x.status === 'preseleccion');
      if (!p || !p.aspirants.some((a) => a.charId === me.id && a.status !== 'retirado')) return [];
      return Object.values(s.characters).filter((c) => c.status === 'activo' && !c.isPlayer && c.partyId === p.partyId && (c.regionId === me.regionId || c.offices.length) && (me.relations[c.id] !== undefined || c.id === s.parties[p.partyId]?.leaderId)).slice(0, 6).map((c) => ({ target: c.id, processId: p.id }));
    }
    case 'reconciliacion': return Object.values(s.dialogue!.rel).filter((r) => r.to === me.id && (r.trust < -15 || r.rivalry > 35) && s.characters[r.from]?.status === 'activo').slice(0, 4).map((r) => ({ target: r.from }));
    case 'lista_regional': { const race = s.dialogue!.races.find((r) => r.status === 'abierta' && r.partyId === me.partyId && r.regionId === me.regionId); return race ? race.lists.map((l) => ({ target: l.headId, raceId: race.id, listId: l.id })) : []; }
    case 'negociacion_proyecto': return s.bills.filter((b) => b.closedWeek === undefined && b.authorId !== me.id && s.characters[b.authorId]?.status === 'activo' && !s.characters[b.authorId]?.isPlayer).slice(0, 4).map((b) => ({ target: b.authorId, billId: b.id }));
    case 'asamblea_partidaria': return me.partyId ? [{ partyId: me.partyId }] : [];
    case 'reunion_bancada': return me.partyId ? [{ partyId: me.partyId }] : [];
    case 'coordinacion_ministerial': return [{}];
    case 'socio_coalicion': { const co = s.government.coalitionId ? s.coalitions[s.government.coalitionId] : null; return (co?.members ?? []).filter((p) => p !== me.partyId && s.parties[p]?.leaderId).map((p) => ({ target: s.parties[p].leaderId!, partyId: p })); }
    default: return [];
  }
}

export const isoNow = (s: GameState) => currentISO(s);
