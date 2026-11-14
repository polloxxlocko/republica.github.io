/**
 * INICIATIVA DE LA IA Y CONSECUENCIAS DIFERIDAS. Los personajes buscan al jugador por motivos
 * concretos del estado (una lista que armar, un compromiso que se acerca, una coalición en riesgo).
 * Las consecuencias diferidas se REEVALÚAN al vencer: nada de lo programado está garantizado.
 */
import type { GameState } from '../models/types';
import type { Rng } from '../engine/rng';
import { newId } from '../systems/util';
import { DEF_BY_ID } from './definitions';
import { disposition, changeRel } from './relations';
import { addMemory } from './memory';
import { fn, playerList, worldOp } from './world';
import { goalsOf } from './goals';
import { startSession } from './engine';

function pendingFrom(s: GameState, id: string) { return s.dialogue!.invitations.some((i) => i.fromId === id && i.status === 'pendiente'); }
function invite(s: GameState, fromId: string, defId: string, args: Record<string, string | number>, motive: string, detail?: string): void {
  const st = s.dialogue!;
  if (pendingFrom(s, fromId) || (st.cooldowns[`inv|${fromId}`] ?? -1) > s.week) return;
  if (!DEF_BY_ID[defId]?.setup(s, { ...args, fromId })) return;
  st.invitations.push({ id: newId(s, 'cinv'), fromId, defId, week: s.week, expiresWeek: s.week + 3, motive, detail, args: { ...args, fromId, target: fromId }, status: 'pendiente' });
  st.cooldowns[`inv|${fromId}`] = s.week + 8;
}

/** Disparadores de la IA (una invitación nueva por semana como máximo). */
export function aiInitiative(s: GameState, rng: Rng): void {
  const st = s.dialogue!; const me = s.characters[s.player.characterId];
  if (!me || s.player.careerOver) return;
  if (st.invitations.filter((i) => i.status === 'pendiente').length >= 2) return;
  const before = st.invitations.length;
  // 1) Elección regional: las cabezas de lista buscan gente con trabajo territorial
  const race = st.races.find((r) => r.status === 'abierta' && r.partyId === me.partyId && r.regionId === me.regionId);
  if (race && !playerList(race, me.id) && race.week - s.week > 2 && rng.chance(0.3)) {
    const heads = race.lists.map((l) => ({ l, d: disposition(s, l.headId, me.id) + rng.normal(0, 10) })).sort((a, b) => b.d - a.d);
    const h = heads[0];
    if (h.d > -20) invite(s, h.l.headId, 'lista_regional', { raceId: race.id, listId: h.l.id }, `${fn(s.characters[h.l.headId])} quiere conversar sobre la elección de la directiva regional.`, `Arma una lista para la directiva regional (${race.week - s.week} semanas para la elección). Busca gente con trabajo territorial.`);
  }
  if (st.invitations.length > before) return;
  // 2) Cobro de compromisos que se acercan
  for (const cm of st.commitments) {
    if (cm.status !== 'vigente' || cm.debtor !== me.id) continue;
    const near = cm.kind === 'apoyo_interna' ? (s.parties[String(cm.conditions.partyId)]?.nextLeadershipWeek ?? 9999) - s.week <= 8 : cm.kind === 'trabajo_campana' ? cm.dueWeek - s.week <= 6 : false;
    if (near && rng.chance(0.5)) { invite(s, cm.creditor, 'cobro_compromiso', { commitmentId: cm.id }, `${fn(s.characters[cm.creditor])} quiere hablar de lo que acordaron.`); break; }
  }
  if (st.invitations.length > before) return;
  // 3) Mentoría: una figura con más peso ve condiciones en el jugador
  if (me.partyId && me.rep.reconocimiento >= 12 && me.rep.reconocimiento <= 50 && !st.commitments.some((c) => c.kind === 'lealtad' && c.debtor === me.id && c.status === 'vigente') && rng.chance(0.025)) {
    const cands = Object.values(s.characters).filter((c) => c.status === 'activo' && !c.isPlayer && c.partyId === me.partyId && c.regionId === me.regionId && c.rep.reconocimiento >= me.rep.reconocimiento + 20 && c.offices.some((o) => ['diputado', 'senador', 'alcalde', 'gobernador', 'presidente_partido'].includes(o.type)) && disposition(s, c.id, me.id) > 0);
    if (cands.length) { const m = rng.pick(cands); invite(s, m.id, 'mentoria', {}, `${fn(m)} quiere conversar contigo con calma.`); }
  }
  if (st.invitations.length > before) return;
  // 4) Advertencias de pasillo (solo sobre personajes ficticios)
  const rival = Object.values(st.rel).find((r) => r.to === me.id && r.rivalry >= 30 && !s.characters[r.from]?.realId && s.characters[r.from]?.status === 'activo');
  if (rival && rng.chance(0.06)) {
    const informant = Object.values(st.rel).find((r) => r.to === me.id && r.from !== rival.from && r.trust >= 20 && s.characters[r.from]?.status === 'activo');
    if (informant) invite(s, informant.from, 'advertencia', { subjectId: rival.from }, `${fn(s.characters[informant.from])} te quiere comentar algo.`);
  }
  // 5) Presidencia: un socio de coalición en riesgo pide audiencia
  if (me.offices.some((o) => o.type === 'presidente') && s.government.coalitionId) {
    const co = s.coalitions[s.government.coalitionId];
    if (co && co.cohesion < 45 && rng.chance(0.2)) {
      const p = co.members.filter((x) => x !== me.partyId && s.parties[x]?.leaderId).sort((a, b) => (s.partyRelations[[a, me.partyId ?? ''].sort().join('|')] ?? 0) - (s.partyRelations[[b, me.partyId ?? ''].sort().join('|')] ?? 0))[0];
      if (p) invite(s, s.parties[p].leaderId!, 'socio_coalicion', { partyId: p }, `La directiva de ${s.parties[p].short} pide audiencia.`, `La cohesión de la coalición es baja; ${s.parties[p].short} evalúa su permanencia.`);
    }
  }
}

/** Consecuencias diferidas: se reevalúan con el estado presente. */
export function processDeferred(s: GameState, rng: Rng): void {
  const st = s.dialogue!; const me = s.characters[s.player.characterId];
  const due = st.deferred.filter((d) => d.week <= s.week);
  st.deferred = st.deferred.filter((d) => d.week > s.week);
  for (const d of due) {
    const a = d.args;
    if (d.op === 'invite_if') {
      const from = s.characters[String(a.fromId)];
      if (!from || from.status !== 'activo') continue;
      let ok = true;
      if (a.cond === 'regional_president') ok = st.regionalPresidents[`${me.partyId}|${me.regionId}`] === from.id && disposition(s, from.id, me.id) > -10;
      else if (a.cond === 'race_open') ok = st.races.some((r) => r.id === a.raceId && r.status === 'abierta' && !playerList(r, me.id));
      else if (a.cond === 'mentor_rivalry') {
        const competes = me.rep.reconocimiento >= from.rep.reconocimiento - 15 || goalsOf(s, from).some((g) => g.kind === 'candidatura') && s.player.candidacies.length > 0;
        if (!competes) { if (s.week - Number(a.firstWeek ?? s.week) < 260) st.deferred.push({ ...d, week: s.week + 26, args: { ...a, firstWeek: a.firstWeek ?? s.week } }); continue; }
        changeRel(s, { type: 'rel', from: from.id, to: me.id, dims: { rivalry: 10 }, importance: 'relevante' });
      }
      if (ok) invite(s, from.id, String(a.defId), a, String(a.motive));
    } else if (d.op === 'decide_backing') {
      const npc = s.characters[String(a.npcId)]; const p = s.career.processes.find((x) => x.id === a.processId);
      if (!npc || !p || p.status === 'resuelto' || p.status === 'cancelado') continue;
      const yes = disposition(s, npc.id, me.id) + rng.normal(0, 12) > 0;
      if (yes) { worldOp(s, rng, 'nomination_back', { processId: p.id, backer: npc.id }); s.player.lastActionResults.push(`${fn(npc)} decidió respaldar tu aspiración.`); addMemory(s, { owner: npc.id, about: me.id, participants: [npc.id, me.id], kind: 'apoyo_recibido', summary: `Le dio su respaldo en ${p.unitLabel}`, importance: 'relevante' }); }
      else s.player.lastActionResults.push(`${fn(npc)} decidió no respaldarte por ahora.`);
    }
  }
}

/** Respuesta del jugador a una invitación. */
export function answerInvitation(s: GameState, rng: Rng, id: string, decision: 'aceptar' | 'rechazar' | 'reprogramar' | 'consultar'): string {
  const st = s.dialogue!; const inv = st.invitations.find((i) => i.id === id);
  if (!inv || inv.status !== 'pendiente') return 'La invitación ya no está vigente.';
  const from = s.characters[inv.fromId]; const me = s.characters[s.player.characterId];
  switch (decision) {
    case 'consultar': inv.detail = inv.detail ?? `Según lo que se sabe: ${goalsOf(s, from)[0]?.text ?? 'quiere conversar'}.`; return inv.detail;
    case 'reprogramar':
      if (inv.rescheduled) return 'Ya pediste reprogramarla una vez.';
      inv.rescheduled = true; inv.expiresWeek += 2;
      changeRel(s, { type: 'rel', from: from.id, to: me.id, dims: { willingness: -1 }, importance: 'menor' });
      return `${fn(from)} acepta mover la reunión.`;
    case 'rechazar': {
      inv.status = 'rechazada';
      const declines = st.invitations.filter((i) => i.fromId === from.id && i.status === 'rechazada' && s.week - i.week < 52).length;
      changeRel(s, { type: 'rel', from: from.id, to: me.id, dims: { willingness: -2 * declines, personal: declines > 1 ? -3 : 0 }, importance: declines > 1 ? 'relevante' : 'menor' });
      if (declines > 1) addMemory(s, { owner: from.id, about: me.id, participants: [from.id, me.id], kind: 'apoyo_rechazado', summary: 'Rechazó varias invitaciones a conversar', importance: 'relevante' });
      return declines > 1 ? `${fn(from)} lo toma como una señal.` : `Declinaste la reunión con ${fn(from)}.`;
    }
    case 'aceptar': {
      const d = DEF_BY_ID[inv.defId];
      if (d.kind !== 'breve' && s.player.actionPoints < 1) return 'No te quedan puntos de acción esta semana.';
      const r = startSession(s, rng, inv.defId, inv.args, inv.fromId);
      if (typeof r === 'string') { inv.status = 'expirada'; return `No fue posible: ${r}`; }
      inv.status = 'aceptada';
      if (d.kind !== 'breve') s.player.actionPoints -= 1;
      return `Comienza la conversación con ${fn(from)}.`;
    }
  }
}

export function expireInvitations(s: GameState): void {
  const st = s.dialogue!;
  for (const i of st.invitations) if (i.status === 'pendiente' && i.expiresWeek < s.week) {
    i.status = 'expirada';
    changeRel(s, { type: 'rel', from: i.fromId, to: s.player.characterId, dims: { willingness: -1 }, importance: 'menor' });
  }
  if (st.invitations.length > 60) st.invitations.splice(0, st.invitations.length - 60);
}

