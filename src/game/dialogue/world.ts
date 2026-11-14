/**
 * OBJETOS CONCRETOS DEL MUNDO que las conversaciones pueden crear o modificar, y operaciones
 * registradas («world ops»). La interfaz nunca modifica el mundo directamente: todo pasa por aquí.
 */
import type { Character, GameState, RegionId } from '../models/types';
import type { Rng } from '../engine/rng';
import { clamp } from '../rules/params';
import { newId } from '../systems/util';
import { createCharacter } from '../systems/characters';
import { addNews } from '../systems/news';
import { REGION_BY_ID } from '../data/geography';
import { minorRoleBlocked, partyInfluenceOf, capitalOf, bio } from '../career/capital';
import type { RegionalRace } from './types';
import { getRel, changeRel } from './relations';
import { addMemory } from './memory';

export const fn = (c: Character | undefined) => (c ? `${c.firstName} ${c.lastName}` : 'alguien');
export const first = (c: Character | undefined) => (c ? c.firstName : 'alguien');

/** Dirigente regional ficticio del partido (se crea si no existe uno disponible). Nunca usa personas reales. */
export function regionalFigure(s: GameState, rng: Rng, partyId: string, regionId: RegionId, exclude: string[] = []): Character {
  const pool = Object.values(s.characters).filter((c) => c.status === 'activo' && !c.isPlayer && !c.realId && c.partyId === partyId && c.regionId === regionId && !exclude.includes(c.id)
    && !c.offices.some((o) => ['presidente', 'ministro', 'senador', 'diputado', 'gobernador'].includes(o.type)));
  if (pool.length) return pool.sort((a, b) => partyInfluenceOf(s, b) - partyInfluenceOf(s, a))[0];
  const p = s.parties[partyId];
  const c = createCharacter(s, rng, { partyId, regionId, ideology: p.ideology, ideologySd: 12, quality: rng.normal(55, 8), minAge: 34, maxAge: 62, recognition: rng.range(8, 22) });
  c.offices.push({ type: 'dirigente_territorial', regionId, since: s.week, label: `Dirigencia regional de ${p.short}` });
  return c;
}

/** Elección de la directiva regional del partido del jugador (cada ~2 años en la partida). */
export function ensureRace(s: GameState, rng: Rng): RegionalRace | null {
  const st = s.dialogue!; const me = s.characters[s.player.characterId];
  if (!me?.partyId || s.player.careerOver) return null;
  const open = st.races.find((r) => r.status === 'abierta' && r.partyId === me.partyId && r.regionId === me.regionId);
  if (open) return open;
  const last = [...st.races].reverse().find((r) => r.partyId === me.partyId && r.regionId === me.regionId);
  if (last && s.week - last.week < 100) return null;
  if (s.week < 20 && !last) return null; // la primera se convoca tras unos meses de partida
  const a = regionalFigure(s, rng, me.partyId, me.regionId);
  const b = regionalFigure(s, rng, me.partyId, me.regionId, [a.id]);
  const race: RegionalRace = { id: newId(s, 'rr'), partyId: me.partyId, regionId: me.regionId, week: s.week + 16, createdWeek: s.week, status: 'abierta',
    lists: [{ id: 'A', headId: a.id, members: [a.id], label: `Lista de ${fn(a)}` }, { id: 'B', headId: b.id, members: [b.id], label: `Lista de ${fn(b)}` }] };
  st.races.push(race);
  return race;
}

export function playerList(race: RegionalRace, playerId: string) { return race.lists.find((l) => l.members.includes(playerId)); }

export function resolveRaces(s: GameState, rng: Rng): void {
  const st = s.dialogue!; const me = s.characters[s.player.characterId];
  for (const race of st.races) {
    if (race.status !== 'abierta' || s.week < race.week) continue;
    const scores = race.lists.map((l) => {
      let sc = 0;
      for (const id of l.members) { const c = s.characters[id]; if (!c || c.status !== 'activo') continue; sc += partyInfluenceOf(s, c) * (id === l.headId ? 1.5 : 0.8); if (c.isPlayer) sc += (capitalOf(s).territorial ?? 0) * 0.5; }
      return { l, sc: sc + rng.normal(0, 10) };
    }).sort((x, y) => y.sc - x.sc);
    const win = scores[0].l;
    race.status = 'resuelta'; race.winnerList = win.id; race.presidentId = win.headId;
    st.regionalPresidents[`${race.partyId}|${race.regionId}`] = win.headId;
    const head = s.characters[win.headId];
    const p = s.parties[race.partyId];
    addNews(s, rng, 'partidos', `${fn(head)} presidirá ${p.short} en ${REGION_BY_ID[race.regionId].name}`, `Su lista se impuso en la elección de la directiva regional.`, 2, 0, 0, { regionId: race.regionId, actors: [head.id] });
    if (me && playerList(race, me.id)) {
      const mine = playerList(race, me.id)!;
      if (mine.id === win.id) {
        me.rep.confianzaPartido = clamp(me.rep.confianzaPartido + 4, 0, 100);
        // los cargos en la directiva dependen de lo acordado (compromisos de tipo «equipo»), no de haber ganado
        bio(s, 'partido', `Tu lista gana la directiva regional de ${p.short}`, `Preside ${fn(head)}.`, 1);
        changeRel(s, { type: 'rel', from: head.id, to: me.id, dims: { trust: 10, cooperation: 12, respect: 6 }, importance: 'relevante' });
        addMemory(s, { owner: head.id, about: me.id, participants: [head.id, me.id], kind: 'apoyo_recibido', summary: `Integró su lista en la elección regional de ${p.short}`, importance: 'relevante', refs: [race.id] });
      } else {
        me.rep.confianzaPartido = clamp(me.rep.confianzaPartido - 2, 0, 100);
        bio(s, 'partido', `Tu lista pierde la directiva regional de ${p.short}`, `Gana ${fn(head)}.`, -1);
        changeRel(s, { type: 'rel', from: head.id, to: me.id, dims: { rivalry: 10, trust: -4 }, importance: 'relevante' });
        addMemory(s, { owner: head.id, about: me.id, participants: [head.id, me.id], kind: 'disputa_electoral', summary: `Compitió en la lista rival en la elección regional de ${p.short}`, importance: 'relevante', refs: [race.id] });
      }
    }
  }
}

export function grantRole(s: GameState, c: Character, role: 'dirigente_territorial', label: string): boolean {
  if (c.offices.some((o) => o.type === role)) return false;
  if (minorRoleBlocked(c, role)) return false;
  c.offices.push({ type: role, regionId: c.regionId, since: s.week, label });
  return true;
}

/** Registro de operaciones del mundo invocables desde efectos de diálogo. */
export function worldOp(s: GameState, rng: Rng, op: string, args: Record<string, string | number>): string | null {
  const st = s.dialogue!; const me = s.characters[s.player.characterId];
  switch (op) {
    case 'race_join': {
      const race = st.races.find((r) => r.id === args.raceId); if (!race || race.status !== 'abierta') return null;
      for (const l of race.lists) l.members = l.members.filter((x) => x !== me.id);
      race.lists.find((l) => l.id === args.listId)?.members.push(me.id);
      st.actionLog.push({ week: s.week, type: 'race_join', ref: race.id, value: String(args.listId) });
      return `Integras ${race.lists.find((l) => l.id === args.listId)?.label ?? 'una lista'}.`;
    }
    case 'race_leave': {
      const race = st.races.find((r) => r.id === args.raceId); if (!race) return null;
      for (const l of race.lists) l.members = l.members.filter((x) => x !== me.id);
      return null;
    }
    case 'race_add_member': { // un personaje (IA) se suma a una lista
      const race = st.races.find((r) => r.id === args.raceId); const l = race?.lists.find((x) => x.id === args.listId);
      if (l && !l.members.includes(String(args.charId))) l.members.push(String(args.charId));
      return null;
    }
    case 'party_trust': me.rep.confianzaPartido = clamp(me.rep.confianzaPartido + Number(args.delta), 0, 100); return null;
    case 'nomination_back': {
      const p = s.career.processes.find((x) => x.id === args.processId); const a = p?.aspirants.find((x) => x.charId === me.id);
      if (a && !a.backers.includes(String(args.backer))) { a.backers.push(String(args.backer)); return `${fn(s.characters[String(args.backer)])} respalda tu aspiración.`; }
      return null;
    }
    case 'bill_support': {
      const b = s.bills.find((x) => x.id === args.billId); if (!b) return null;
      b.personalSupport[String(args.charId)] = (b.personalSupport[String(args.charId)] ?? 0) + Number(args.amount);
      return null;
    }
    case 'party_relation': {
      const k = [String(args.a), String(args.b)].sort().join('|');
      s.partyRelations[k] = clamp((s.partyRelations[k] ?? 0) + Number(args.delta), -100, 100); return null;
    }
    case 'coalition_cohesion': { const co = s.coalitions[String(args.coalitionId)]; if (co) co.cohesion = clamp(co.cohesion + Number(args.delta), 0, 100); return null; }
    case 'faction_discontent': {
      const p = s.parties[String(args.partyId)]; const f = p?.factions.find((x) => x.id === args.factionId);
      if (f) f.discontent = clamp(f.discontent + Number(args.delta), 0, 100); return null;
    }
    case 'party_cohesion': { const p = s.parties[String(args.partyId)]; if (p) p.cohesion = clamp(p.cohesion + Number(args.delta), 0, 100); return null; }
    case 'declare_support': st.actionLog.push({ week: s.week, type: 'apoyo_interna', ref: String(args.charId) }); return null;
    case 'grant_role': return grantRole(s, me, 'dirigente_territorial', String(args.label ?? 'Responsabilidad territorial')) ? 'Asumes una responsabilidad territorial en el partido.' : null;
    case 'invite': {
      const from = s.characters[String(args.fromId)]; if (!from || from.status !== 'activo') return null;
      st.invitations.push({ id: newId(s, 'cinv'), fromId: from.id, defId: String(args.defId), week: s.week, expiresWeek: s.week + 3, motive: String(args.motive ?? 'Quiere conversar contigo.'), detail: args.detail ? String(args.detail) : undefined, args, status: 'pendiente' });
      return null;
    }
    case 'bill_side': { const b = s.bills.find((x) => x.id === args.billId); if (b) b.sideSupport[String(args.partyId)] = (b.sideSupport[String(args.partyId)] ?? 0) + Number(args.amount); return null; }
    case 'bill_moderate': { const b = s.bills.find((x) => x.id === args.billId); if (b) b.moderation = clamp(b.moderation + Number(args.amount), 0, 1); return null; }
    case 'area_priority': { const a = args.area as keyof typeof s.opinion.areaSatisfaction; s.opinion.areaSatisfaction[a] = clamp((s.opinion.areaSatisfaction[a] ?? 50) + Number(args.amount), 0, 100); return null; }
    case 'coalition_exit': {
      const co = s.coalitions[String(args.coalitionId)]; const pid = String(args.partyId); if (!co || !co.members.includes(pid)) return null;
      co.members = co.members.filter((x) => x !== pid); co.cohesion = clamp(co.cohesion - 10, 0, 100);
      co.conflicts.push(`S${s.week}: sale ${s.parties[pid]?.short}`);
      s.parties[pid].coalitionHistory.push({ week: s.week, coalitionId: co.id, event: 'sale' });
      const presParty = s.characters[s.government.presidentId]?.partyId;
      if (presParty) { const k = [pid, presParty].sort().join('|'); s.partyRelations[k] = clamp((s.partyRelations[k] ?? 0) - 20, -100, 100); }
      addNews(s, rng, 'coaliciones', `${s.parties[pid]?.short} abandona la coalición de gobierno`, 'Tras una reunión en La Moneda sin acuerdo.', 4);
      return `${s.parties[pid]?.short} sale de la coalición.`;
    }
    default: return null;
  }
}

export function relSnapshot(s: GameState, a: string, b: string) { return getRel(s, a, b); }
