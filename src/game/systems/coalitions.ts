/**
 * COALICIONES Y ALIANZAS. La formación y ruptura depende de compatibilidad ideológica,
 * conveniencia electoral (estimación de escaños con D'Hondt), relaciones, confianza e historial.
 */
import type { Coalition, GameState, Ideology } from '../models/types';
import { Rng } from '../engine/rng';
import { DISTRICTS } from '../data/geography';
import { DIMS, clamp } from '../rules/params';
import { allocateWithPacts } from './dhondt';
import { addHistory, addRelation, getRelation, ideoDistance, newId, zeroIdeology } from './util';
import { addNews } from './news';
import { listIdOf } from './elections';
import { perceivedSupport } from './polls';

export function coalitionProgram(s: GameState, members: string[]): Ideology {
  const r = zeroIdeology(); let w = 0;
  for (const m of members) {
    const p = s.parties[m]; if (!p) continue;
    const weight = Math.max(1, s.nationalIntention[m] ?? 1);
    for (const d of DIMS) r[d] += p.ideology[d] * weight;
    w += weight;
  }
  if (w > 0) for (const d of DIMS) r[d] /= w;
  return r;
}

/** Estimación rápida de escaños de diputados bajo una configuración de listas. */
export function estimateSeats(s: GameState, lists: Record<string, string[]>): Record<string, number> {
  const seats: Record<string, number> = {};
  const perceived: Record<string, Record<string, number>> = {};
  for (const d of DISTRICTS) {
    const sup = (perceived[d.regionId] ??= perceivedSupport(s, d.regionId));
    const lv: Record<string, Record<string, number>> = {};
    const caps: Record<string, number> = {};
    for (const [l, ms] of Object.entries(lists)) for (const p of ms) {
      if (!sup[p]) continue;
      (lv[l] ??= {})[p] = sup[p];
      caps[p] = d.seats;
    }
    const a = allocateWithPacts(lv, d.seats, caps);
    for (const [p, n] of Object.entries(a.byParty)) seats[p] = (seats[p] ?? 0) + n;
  }
  return seats;
}

export function currentLists(s: GameState): Record<string, string[]> {
  const lists: Record<string, string[]> = {};
  for (const p of Object.values(s.parties)) if (p.active && p.legalStatus !== 'en_formacion') (lists[listIdOf(s, p.id)] ??= []).push(p.id);
  return lists;
}

/** Utilidad (para el partido `partyId`) de pertenecer a la lista `members`. */
export function membershipUtility(s: GameState, partyId: string, members: string[], baseSeats?: Record<string, number>): number {
  const p = s.parties[partyId];
  const lists = currentLists(s);
  // quitar al partido de su lista actual y armar la hipotética
  for (const k of Object.keys(lists)) lists[k] = lists[k].filter((m) => m !== partyId && !members.includes(m));
  for (const k of Object.keys(lists)) if (lists[k].length === 0) delete lists[k];
  lists['__h'] = [...new Set([...members, partyId])];
  const seatsWith = estimateSeats(s, lists);
  const alone = currentLists(s);
  for (const k of Object.keys(alone)) alone[k] = alone[k].filter((m) => m !== partyId);
  for (const k of Object.keys(alone)) if (alone[k].length === 0) delete alone[k];
  alone['__solo'] = [partyId];
  const seatsAlone = baseSeats ?? estimateSeats(s, alone);
  const gain = (seatsWith[partyId] ?? 0) - (seatsAlone[partyId] ?? 0);
  const prog = coalitionProgram(s, members);
  const dist = ideoDistance(p.ideology, prog);
  const rel = members.reduce((a, m) => a + getRelation(s, partyId, m), 0) / Math.max(1, members.length);
  const g = p.goals;
  if (members.length && dist > 0.62) return -50; // incompatibilidad ideológica: pacto inviable
  return clamp(gain, -6, 6) * (g.votes + g.office) * 1.1 - dist * 24 * (0.4 + g.identity * 2) + rel / 25 + (members.length ? 0.5 : 0);
}

export function formCoalition(s: GameState, name: string, members: string[], leader: string): Coalition {
  const c: Coalition = { id: newId(s, 'k'), name, members: [...members], leaderPartyId: leader, program: coalitionProgram(s, members), cohesion: 60, formedWeek: s.week, conflicts: [], isGovernment: false, active: true };
  s.coalitions[c.id] = c;
  for (const m of members) s.parties[m]?.coalitionHistory.push({ week: s.week, coalitionId: c.id, event: 'entra' });
  return c;
}

export function leaveCoalition(s: GameState, rng: Rng, partyId: string, reason: string): void {
  for (const c of Object.values(s.coalitions)) {
    if (!c.active || !c.members.includes(partyId)) continue;
    c.members = c.members.filter((m) => m !== partyId);
    s.parties[partyId]?.coalitionHistory.push({ week: s.week, coalitionId: c.id, event: 'sale' });
    for (const m of c.members) addRelation(s, partyId, m, -12);
    c.conflicts.push(`S${s.week}: sale ${s.parties[partyId]?.short} (${reason})`);
    addHistory(s, 'coalicion', `${s.parties[partyId]?.name} abandona ${c.name}`, reason, 3);
    addNews(s, rng, 'coaliciones', `${s.parties[partyId]?.short} rompe con ${c.name}`, reason, 3);
    if (c.members.length < 2) dissolveCoalition(s, c, 'quedó con un solo integrante');
    else if (c.leaderPartyId === partyId) c.leaderPartyId = c.members.reduce((a, m) => ((s.nationalIntention[m] ?? 0) > (s.nationalIntention[a] ?? 0) ? m : a), c.members[0]);
  }
}

export function dissolveCoalition(s: GameState, c: Coalition, reason: string): void {
  c.active = false; c.dissolvedWeek = s.week;
  if (s.government.coalitionId === c.id && c.members.length < 1) s.government.coalitionId = null;
  addHistory(s, 'coalicion', `Se disuelve ${c.name}`, reason, 3);
}

export function joinCoalition(s: GameState, rng: Rng, partyId: string, coalId: string): void {
  const c = s.coalitions[coalId];
  for (const other of Object.values(s.coalitions)) if (other.active && other.members.includes(partyId) && other.id !== coalId) leaveCoalition(s, rng, partyId, `para sumarse a ${c.name}`);
  c.members.push(partyId);
  c.program = coalitionProgram(s, c.members);
  s.parties[partyId]?.coalitionHistory.push({ week: s.week, coalitionId: c.id, event: 'entra' });
  for (const m of c.members) addRelation(s, partyId, m, 6);
  addHistory(s, 'coalicion', `${s.parties[partyId]?.name} se suma a ${c.name}`, '', 3);
  addNews(s, rng, 'coaliciones', `${s.parties[partyId]?.short} se incorpora a ${c.name}`, 'El acuerdo incluye coordinación electoral y programática.', 3);
}

/** Respuesta de los miembros de una coalición a la solicitud de un partido. */
export function coalitionAccepts(s: GameState, coalId: string, partyId: string, bonus = 0): { accepted: boolean; score: number; vetoes: string[] } {
  const c = s.coalitions[coalId];
  const vetoes: string[] = [];
  let score = 0;
  for (const m of c.members) {
    const mp = s.parties[m];
    const with_ = membershipUtility(s, m, [...c.members.filter((x) => x !== m), partyId]);
    const without = membershipUtility(s, m, c.members.filter((x) => x !== m));
    const u = with_ - without + getRelation(s, m, partyId) / 30 + bonus;
    const weight = Math.max(1, s.nationalIntention[m] ?? 1);
    score += u * weight;
    if (u < -2 && (mp.goals.identity > 0.2)) vetoes.push(m);
  }
  return { accepted: score > 0 && vetoes.length === 0, score, vetoes };
}

const COALITION_NAMES = ['Acuerdo Democrático', 'Frente Regional', 'Unidad Ciudadana', 'Pacto por el Cambio', 'Alianza Republicana', 'Convergencia Popular', 'Centro Unido', 'Bloque Social', 'Fuerza Austral', 'Compromiso País'];

/**
 * Dinámica semanal de coaliciones (IA). Más activa en los 60 semanas previas a elecciones.
 */
export function coalitionDynamics(s: GameState, rng: Rng, weeksToElection: number, aiSkill: number, playerPartyLed: string | null): void {
  // Cohesión
  for (const c of Object.values(s.coalitions)) {
    if (!c.active) continue;
    c.program = coalitionProgram(s, c.members);
    let spread = 0;
    for (const m of c.members) spread += ideoDistance(s.parties[m].ideology, c.program);
    spread /= Math.max(1, c.members.length);
    let rel = 0; let n = 0;
    for (let i = 0; i < c.members.length; i++) for (let j = i + 1; j < c.members.length; j++) { rel += getRelation(s, c.members[i], c.members[j]); n++; }
    rel = n ? rel / n : 0;
    const govEffect = c.isGovernment ? (s.opinion.presidentialApproval - 40) * 0.05 : 0;
    const target = clamp(70 - spread * 80 + rel * 0.3 + govEffect, 5, 95);
    c.cohesion = clamp(0.95 * c.cohesion + 0.05 * target + rng.normal(0, 0.5), 0, 100);
  }
  const active = weeksToElection <= 60 && weeksToElection > 13; // inscripción de pactos ~ 13 semanas antes
  if (!active || !rng.chance(0.35)) return;
  const parties = Object.values(s.parties).filter((p) => p.active && p.legalStatus !== 'en_formacion');
  // 1) Salidas por baja cohesión o mejor alternativa
  for (const c of Object.values(s.coalitions)) {
    if (!c.active || c.cohesion > 35) continue;
    let worst: string | null = null; let worstU = Infinity;
    for (const m of c.members) {
      if (m === playerPartyLed) continue;
      const u = membershipUtility(s, m, c.members.filter((x) => x !== m)) - membershipUtility(s, m, []);
      if (u < worstU) { worstU = u; worst = m; }
    }
    if (worst && worstU < -1 && rng.chance(0.3 * aiSkill + 0.1)) leaveCoalition(s, rng, worst, 'diferencias programáticas y baja cohesión del bloque');
  }
  // 2) Partidos sin coalición buscan la mejor
  for (const p of parties) {
    if (p.id === playerPartyLed) continue;
    if (listIdOf(s, p.id) !== p.id) continue;
    let best: string | null = null; let bestU = membershipUtility(s, p.id, []) + 0.5;
    for (const c of Object.values(s.coalitions)) {
      if (!c.active) continue;
      const u = membershipUtility(s, p.id, c.members) + rng.normal(0, 1 - aiSkill);
      if (u > bestU) { bestU = u; best = c.id; }
    }
    if (best && coalitionAccepts(s, best, p.id).accepted) { joinCoalition(s, rng, p.id, best); return; }
    // 3) Nuevo pacto entre dos partidos sin coalición, ideológicamente cercanos
    for (const q of parties) {
      if (q.id === p.id || listIdOf(s, q.id) !== q.id || q.id === playerPartyLed) continue;
      if (ideoDistance(p.ideology, q.ideology) > 0.28 || getRelation(s, p.id, q.id) < -20) continue;
      const u1 = membershipUtility(s, p.id, [q.id]) - membershipUtility(s, p.id, []);
      const u2 = membershipUtility(s, q.id, [p.id]) - membershipUtility(s, q.id, []);
      if (u1 > 0.3 && u2 > 0.3) {
        const lead = (s.nationalIntention[p.id] ?? 0) >= (s.nationalIntention[q.id] ?? 0) ? p.id : q.id;
        const c = formCoalition(s, rng.pick(COALITION_NAMES.filter((n) => !Object.values(s.coalitions).some((x) => x.active && x.name === n))) ?? 'Nuevo Pacto', [p.id, q.id], lead);
        addHistory(s, 'coalicion', `Nace ${c.name}`, `${p.short} y ${q.short} sellan un pacto electoral.`, 3);
        addNews(s, rng, 'coaliciones', `${p.short} y ${q.short} forman "${c.name}"`, 'El nuevo pacto buscará maximizar escaños bajo el sistema D\'Hondt.', 3);
        return;
      }
    }
  }
}
