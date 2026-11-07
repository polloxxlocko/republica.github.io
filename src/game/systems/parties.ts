/**
 * VIDA INTERNA DE LOS PARTIDOS: facciones, elecciones internas, finanzas, escisiones,
 * creación de nuevos partidos y fusiones.
 */
import { factionSupportOf, partyInfluenceOf } from '../career/capital';
import type { Character, Faction, GameState, Ideology, Party, RegionId } from '../models/types';
import { Rng } from '../engine/rng';
import { PARTY, clamp, DIMS } from '../rules/params';
import { REGIONS } from '../data/geography';
import { createCharacter, fullName, PERSONALITY_TRAITS, removeOffice, remember, candidateQuality } from './characters';
import { addHistory, addRelation, blendIdeology, ideoDistance, jitterIdeology, newId, zeroIdeology, leftRight } from './util';
import { addNews } from './news';
import { electorateCenter } from './electorate';
import { leaveCoalition } from './coalitions';

export function emptyTerritorial(v = 0.3): Record<RegionId, number> {
  return Object.fromEntries(REGIONS.map((r) => [r.id, v])) as Record<RegionId, number>;
}

export function makeFaction(s: GameState, rng: Rng, party: Party, kind: 'oficialista' | 'moderada' | 'dura' | 'renovadora', leader: Character, share: number): Faction {
  const center = electorateCenter(s);
  let ideo: Ideology;
  if (kind === 'moderada') ideo = blendIdeology(party.ideology, center, 0.3);
  else if (kind === 'dura') { ideo = zeroIdeology(); for (const d of DIMS) ideo[d] = clamp(party.ideology[d] + (party.ideology[d] - center[d]) * 0.3, -100, 100); }
  else if (kind === 'renovadora') ideo = jitterIdeology(rng, party.ideology, 15);
  else ideo = { ...party.ideology };
  const names: Record<string, string[]> = {
    oficialista: ['Directiva', 'Sector institucional', 'Corriente mayoritaria'],
    moderada: ['Ala moderada', 'Sector reformista', 'Corriente dialogante'],
    dura: ['Ala doctrinaria', 'Sector identitario', 'Corriente de base'],
    renovadora: ['Sector renovador', 'Nueva generación', 'Corriente territorial'],
  };
  leader.factionId = null;
  const f: Faction = {
    id: newId(s, 'f'), name: rng.pick(names[kind]), leaderId: leader.id, ideology: ideo, share, influence: clamp(share * 100 + rng.normal(0, 8), 5, 95),
    loyalty: kind === 'oficialista' ? 75 : 50, govStance: 0, coalitionStance: kind === 'dura' ? -10 : 20, discontent: kind === 'oficialista' ? 10 : 25,
    rebellion: clamp(PERSONALITY_TRAITS[leader.personality].rebellion * 100, 5, 95), ambition: kind === 'oficialista' ? 'Mantener la conducción' : 'Disputar la directiva',
  };
  leader.factionId = f.id;
  return f;
}

export function factionOf(s: GameState, c: Character): Faction | undefined {
  if (!c.partyId) return undefined;
  return s.parties[c.partyId]?.factions.find((f) => f.id === c.factionId);
}

/** Asigna a cada militante relevante la facción ideológicamente más cercana. */
export function assignFactions(s: GameState, party: Party): void {
  if (!party.factions.length) return;
  for (const c of Object.values(s.characters)) {
    if (c.partyId !== party.id || c.status !== 'activo') continue;
    if (party.factions.some((f) => f.leaderId === c.id)) { c.factionId = party.factions.find((f) => f.leaderId === c.id)!.id; continue; }
    let best = party.factions[0]; let bd = Infinity;
    for (const f of party.factions) { const d = ideoDistance(c.ideology, f.ideology); if (d < bd) { bd = d; best = f; } }
    c.factionId = best.id;
  }
}

// ---------------------------------------------------------------------------
// Dinámica semanal
// ---------------------------------------------------------------------------
export function weeklyParties(s: GameState, rng: Rng, aiSkill: number): void {
  const govCoal = s.government.coalitionId ? s.coalitions[s.government.coalitionId] : null;
  for (const p of Object.values(s.parties)) {
    if (!p.active) continue;
    // Finanzas: aporte estatal por voto (aprox.), cuotas, gastos fijos
    const lastVotes = (p.history[p.history.length - 1]?.votePct ?? s.nationalIntention[p.id] ?? 1) / 100 * 8_000_000;
    const income = lastVotes * PARTY.publicFundingPerVote + p.members * 0.00005;
    p.funds = clamp(p.funds + income - (2 + p.organization * 0.03), 0, 50000);
    // Organización territorial: reversión lenta
    for (const r of REGIONS) p.territorial[r.id] = clamp(p.territorial[r.id] + 0.002 * (0.3 - p.territorial[r.id]), 0.02, 1);
    // Militancia
    p.members = Math.max(50, Math.round(p.members * (1 + ((p.popularity - 50) / 50) * 0.0008)));
    // Facciones
    const leader = p.leaderId ? s.characters[p.leaderId] : null;
    for (const f of p.factions) {
      const dist = ideoDistance(f.ideology, p.ideology);
      const leaderFaction = leader && leader.factionId === f.id;
      const isGov = govCoal?.members.includes(p.id) ?? false;
      const govPain = isGov ? Math.max(0, 40 - s.opinion.presidentialApproval) * 0.03 : 0;
      const target = clamp(dist * 140 + (leaderFaction ? -15 : 10) + govPain * 10 - (p.cohesion - 50) * 0.3, 0, 100);
      f.discontent = clamp(0.97 * f.discontent + 0.03 * target, 0, 100);
      f.govStance = clamp(0.98 * f.govStance + 0.02 * ((isGov ? 40 : -30) + (s.opinion.presidentialApproval - 40)), -100, 100);
      f.influence = clamp(f.influence + (leaderFaction ? 0.05 : -0.02) + rng.normal(0, 0.2), 3, 97);
    }
    p.cohesion = clamp(p.cohesion + 0.02 * (65 - p.cohesion) - avg(p.factions.map((f) => f.discontent)) * 0.002, 0, 100);
    if (!p.leaderId || s.characters[p.leaderId]?.status !== 'activo') chooseLeader(s, rng, p, aiSkill, true);
    // Formación de partidos nuevos
    if (p.legalStatus === 'en_formacion') {
      p.formationProgress = clamp((p.formationProgress ?? 0) + 1.2 + p.organization * 0.03 + (p.isPlayerFounded ? (s.characters[s.player.characterId]?.attrs.redes ?? 50) * 0.02 : 1), 0, 100);
      if (p.formationProgress >= 100) {
        p.legalStatus = p.isPlayerFounded || p.parentPartyId ? 'ficticio' : 'ficticio';
        p.legalStatus = 'ficticio';
        addHistory(s, 'partido', `${p.name} se constituye legalmente`, 'Reunió las firmas exigidas y queda habilitado para competir (partido ficticio de la partida).', 3);
        addNews(s, rng, 'partidos', `${p.name} queda inscrito como partido`, 'Podrá presentar candidaturas en las próximas elecciones.', 3);
        if (p.isPlayerFounded) s.player.lastActionResults.push(`Tu partido ${p.name} quedó legalmente constituido.`);
      }
    }
  }
  // Elecciones internas
  for (const p of Object.values(s.parties)) if (p.active && s.week >= p.nextLeadershipWeek) internalElection(s, rng, p, aiSkill);
  // Escisiones
  if (s.week % 4 === 0) for (const p of Object.values(s.parties)) if (p.active) maybeSchism(s, rng, p);
  // Nuevos partidos espontáneos (antiestablishment) si la confianza es muy baja
  const activeCount = Object.values(s.parties).filter((p) => p.active).length;
  if (s.week % 4 === 0 && rng.chance((s.opinion.institutionalTrust < 32 ? 0.015 : 0.004) + Math.max(0, 10 - activeCount) * 0.012)) spontaneousParty(s, rng);
}

function avg(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }

export function chooseLeader(s: GameState, rng: Rng, p: Party, aiSkill: number, interim = false): void {
  const cands = Object.values(s.characters).filter((c) => c.partyId === p.id && c.status === 'activo' && !c.isPlayer && !c.offices.some((o) => o.type === 'presidente' || o.type === 'ministro'));
  let best: Character | undefined; let bs = -Infinity;
  for (const c of cands) {
    const sc = c.attrs.liderazgo * 0.4 + c.rep.confianzaPartido * 0.4 + c.rep.reconocimiento * 0.2 + rng.normal(0, 10 * (1.2 - aiSkill));
    if (sc > bs) { bs = sc; best = c; }
  }
  best ??= createCharacter(s, rng, { partyId: p.id, regionId: 'RM', ideology: p.ideology, quality: 58 });
  setLeader(s, p, best);
  if (interim) p.nextLeadershipWeek = Math.min(p.nextLeadershipWeek, s.week + 26);
}

export function setLeader(s: GameState, p: Party, c: Character): void {
  if (p.leaderId && s.characters[p.leaderId]) removeOffice(s, s.characters[p.leaderId], 'presidente_partido', p.short);
  p.leaderId = c.id;
  c.offices.push({ type: 'presidente_partido', partyId: p.id, since: s.week });
  c.rep.reconocimiento = clamp(c.rep.reconocimiento + 8, 0, 100);
}

/** Elección interna: compiten líderes de facciones (y el jugador si postula). */
export function internalElection(s: GameState, rng: Rng, p: Party, aiSkill: number): void {
  p.nextLeadershipWeek = s.week + PARTY.leadershipTermWeeks;
  const player = s.characters[s.player.characterId];
  const playerRuns = player && player.partyId === p.id && !s.player.careerOver && (p.leaderId === player.id || s.player.candidacies.some((c) => c.electionId === `interna-${p.id}` && c.approved));
  const contenders: { c: Character; score: number; faction?: Faction }[] = [];
  for (const f of p.factions) {
    const c = s.characters[f.leaderId];
    if (!c || c.status !== 'activo' || c.isPlayer || c.partyId !== p.id) continue;
    contenders.push({ c, faction: f, score: f.share * 60 + f.influence * 0.3 + candidateQuality(c) * 0.25 + rng.normal(0, 6 * (1.3 - aiSkill)) });
  }
  // Quien preside el partido compite por su continuidad si no lidera ya una facción (ventaja de incumbencia)
  const incumbent = p.leaderId ? s.characters[p.leaderId] : null;
  if (incumbent && incumbent.status === 'activo' && !incumbent.isPlayer && incumbent.partyId === p.id && !contenders.some((x) => x.c.id === incumbent.id)) {
    const f = p.factions.find((x) => x.id === incumbent.factionId);
    contenders.push({ c: incumbent, faction: f, score: (f?.share ?? 0.3) * 60 + 10 + candidateQuality(incumbent) * 0.25 + rng.normal(0, 6 * (1.3 - aiSkill)) });
  }
  if (playerRuns && player) {
    const f = factionOf(s, player);
    // El peso completo de un sector solo lo tiene quien lo lidera; si no, el jugador divide votos con su líder
    const leadsF = f?.leaderId === player.id;
    contenders.push({ c: player, faction: f, score: (f?.share ?? 0.1) * (leadsF ? 60 : 18) + (p.leaderId === player.id ? 8 : 0) + partyInfluenceOf(s, player) * 0.22 + factionSupportOf(s, player) * 0.08 + player.attrs.liderazgo * 0.1 + candidateQuality(player) * 0.12 + rng.normal(0, 6) });
  }
  if (contenders.length === 0) { chooseLeader(s, rng, p, aiSkill); return; }
  contenders.sort((a, b) => b.score - a.score);
  const winner = contenders[0];
  const prevLeader = p.leaderId;
  setLeader(s, p, winner.c);
  for (const f of p.factions) {
    if (f.id === winner.faction?.id) { f.discontent = clamp(f.discontent - 20, 0, 100); f.influence = clamp(f.influence + 8, 0, 100); }
    else { f.discontent = clamp(f.discontent + 10, 0, 100); }
  }
  if (playerRuns) {
    s.player.candidacies = s.player.candidacies.filter((c) => c.electionId !== `interna-${p.id}`);
    s.player.lastActionResults.push(winner.c.isPlayer ? `¡Ganaste la elección interna! Presides ${p.name}.` : `Perdiste la elección interna de ${p.name} frente a ${fullName(winner.c)}.`);
    addHistory(s, 'jugador', winner.c.isPlayer ? `Asumes la presidencia de ${p.short}` : `Derrota en la interna de ${p.short}`, '', 4);
    if (!winner.c.isPlayer && player) { player.rep.confianzaPartido = clamp(player.rep.confianzaPartido - 6, 0, 100); remember(winner.c, { week: s.week, aboutId: player.id, kind: 'conflicto', weight: -10, note: 'Disputa interna' }); }
  }
  if (prevLeader !== winner.c.id && (p.history.length > 0 || s.week > 4)) {
    addHistory(s, 'partido', `${fullName(winner.c)} gana la presidencia de ${p.short}`, `Facción: ${winner.faction?.name ?? 'sin facción'}.`, 2);
    addNews(s, rng, 'partidos', `${p.short} elige a ${fullName(winner.c)} como presidente${winner.c.gender === 'f' ? 'a' : ''}`, `Se impuso en la elección interna con el respaldo de ${winner.faction?.name ?? 'diversos sectores'}.`, 2);
  }
}

const NAME_A = ['Partido', 'Movimiento', 'Fuerza', 'Acción', 'Unión', 'Convergencia', 'Alianza'];
const NAME_B = ['Ciudadana', 'Regional', 'Austral', 'Nacional Renovada', 'del Futuro', 'Popular Democrática', 'Social Republicana', 'Libre', 'Patriótica', 'Progresista Regional', 'Andina', 'de Centro'];

export function fictionalPartyName(s: GameState, rng: Rng): { name: string; short: string } {
  for (let i = 0; i < 40; i++) {
    const name = `${rng.pick(NAME_A)} ${rng.pick(NAME_B)}`;
    if (Object.values(s.parties).some((p) => p.name === name)) continue;
    const short = name.split(' ').filter((w) => w.length > 2 && w[0] === w[0].toUpperCase()).map((w) => w[0]).join('');
    if (Object.values(s.parties).some((p) => p.short === short)) continue;
    return { name, short };
  }
  const n = s.nextId;
  return { name: `Movimiento Ciudadano ${n}`, short: `MC${n}` };
}

export function createParty(s: GameState, rng: Rng, o: { name: string; short: string; ideology: Ideology; leader: Character; parentId?: string; color?: string; members: number; popularity: number; playerFounded?: boolean }): Party {
  const id = `N${newId(s, '')}`;
  const p: Party = {
    id, name: o.name, short: o.short, color: o.color ?? `hsl(${Math.floor(rng.range(0, 360))} 60% 55%)`, founded: String(new Date(Date.UTC(2026, 0, 1) + s.week * 7 * 86400000).getUTCFullYear()),
    legalStatus: 'en_formacion', family: leftRight(o.ideology) < -20 ? 'Izquierda (nuevo)' : leftRight(o.ideology) > 20 ? 'Derecha (nuevo)' : 'Centro (nuevo)',
    description: o.parentId ? `Escisión de ${s.parties[o.parentId]?.name}.` : 'Nueva fuerza política surgida durante la partida.', ideology: { ...o.ideology }, baseIdeology: { ...o.ideology },
    members: o.members, funds: 40, territorial: emptyTerritorial(0.15), leaderId: null, factions: [], popularity: o.popularity, rejection: 30, credibility: 50,
    discipline: 60, cohesion: 75, organization: 30, mobilization: 40, priorities: [o.leader.specialty], goals: { votes: 0.45, office: 0.2, policy: 0.2, identity: 0.15 },
    history: [], coalitionHistory: [], provenance: { source: 'Generado durante la partida', cutoff: '-', confidence: 'baja', nature: 'simulado', version: '1' }, estimatedFields: ['todos'],
    active: true, foundedWeek: s.week, parentPartyId: o.parentId, formationProgress: 0, nextLeadershipWeek: s.week + PARTY.leadershipTermWeeks, isPlayerFounded: o.playerFounded,
  };
  p.territorial[o.leader.regionId] = 0.45;
  s.parties[id] = p;
  for (const q of Object.values(s.parties)) if (q.id !== id) s.partyRelations[[id, q.id].sort().join('|')] = clamp(40 - ideoDistance(q.ideology, p.ideology) * 120, -60, 40);
  // afinidad de los segmentos: hereda una fracción del partido padre
  for (const seg of s.segments) {
    const parent = o.parentId ? seg.partisanship[o.parentId] ?? -2 : -2.2;
    seg.partisanship[id] = parent - 0.6;
  }
  if (o.leader.partyId && o.leader.partyId !== id && s.parties[o.leader.partyId]?.leaderId === o.leader.id) removeOffice(s, o.leader, 'presidente_partido');
  o.leader.partyId = id;
  setLeader(s, p, o.leader);
  p.factions = [makeFaction(s, rng, p, 'oficialista', o.leader, 1)];
  return p;
}

function maybeSchism(s: GameState, rng: Rng, p: Party): void {
  if (p.factions.length < 2) return;
  for (const f of p.factions) {
    const leader = s.characters[f.leaderId];
    if (!leader || leader.isPlayer || leader.id === p.leaderId) continue;
    if (f.discontent < PARTY.schismDiscontent || f.rebellion < 50 || f.share < 0.12) continue;
    if (!rng.chance(0.06)) continue;
    const { name, short } = fictionalPartyName(s, rng);
    const np = createParty(s, rng, { name, short, ideology: f.ideology, leader, parentId: p.id, members: Math.round(p.members * f.share * 0.5), popularity: clamp(p.popularity * 0.6 + 10, 10, 70) });
    for (const seg of s.segments) seg.partisanship[np.id] = (seg.partisanship[p.id] ?? -2) + Math.log(Math.max(0.05, f.share * 0.8));
    // Militantes y parlamentarios de la facción migran
    let parl = 0;
    for (const c of Object.values(s.characters)) {
      if (c.partyId !== p.id || c.factionId !== f.id || c.isPlayer) continue;
      if (rng.chance(0.75)) { c.partyId = np.id; c.factionId = np.factions[0].id; if (c.offices.some((o) => o.type === 'diputado' || o.type === 'senador')) parl++; }
    }
    np.legalStatus = 'en_formacion'; np.formationProgress = 40;
    p.members = Math.round(p.members * (1 - f.share * 0.5));
    p.factions = p.factions.filter((x) => x.id !== f.id);
    const tot = p.factions.reduce((a, x) => a + x.share, 0) || 1;
    for (const x of p.factions) x.share /= tot;
    p.cohesion = clamp(p.cohesion + 10, 0, 100);
    addRelation(s, p.id, np.id, -40);
    addHistory(s, 'partido', `Escisión en ${p.short}: nace ${np.name}`, `${fullName(leader)} se lleva a ${parl} parlamentarios.`, 4);
    addNews(s, rng, 'partidos', `Quiebre en ${p.short}: ${fullName(leader)} funda ${np.name}`, `La facción "${f.name}" acusa a la directiva de abandonar sus principios.`, 4);
    return;
  }
}

function spontaneousParty(s: GameState, rng: Rng): void {
  const recent = Object.values(s.parties).some((p) => p.foundedWeek !== undefined && s.week - p.foundedWeek < 104 && !p.parentPartyId);
  if (recent) return;
  // Se ubica en el espacio ideológico peor representado (mayor distancia media de los votantes a los partidos)
  let best = electorateCenter(s); let bestGap = -1;
  for (let i = 0; i < 12; i++) {
    const seg = rng.pick(s.segments);
    const gap = Math.min(...Object.values(s.parties).filter((p) => p.active).map((p) => ideoDistance(p.ideology, seg.ideology)));
    if (gap * seg.voters > bestGap) { bestGap = gap * seg.voters; best = seg.ideology; }
  }
  const ideo = jitterIdeology(rng, { ...best, ord: Math.min(best.ord, -20) }, 10);
  const leader = createCharacter(s, rng, { partyId: null, regionId: rng.pick(REGIONS).id, ideology: ideo, quality: 68, personality: 'mediatico', recognition: 45 });
  const { name, short } = fictionalPartyName(s, rng);
  const p = createParty(s, rng, { name, short, ideology: ideo, leader, members: 3000, popularity: 58 });
  addHistory(s, 'partido', `Surge ${p.name}`, `Liderado por ${fullName(leader)}, capitaliza el descontento con los partidos tradicionales.`, 3);
  addNews(s, rng, 'partidos', `Nueva fuerza antiestablishment: ${p.name}`, `${fullName(leader)} inicia la recolección de firmas.`, 3);
}

/** Abandono de partido por un personaje (incluye jugador). */
export function leaveParty(s: GameState, rng: Rng, c: Character): void {
  const p = c.partyId ? s.parties[c.partyId] : null;
  if (!p) return;
  if (p.leaderId === c.id) { removeOffice(s, c, 'presidente_partido', p.short); p.leaderId = null; }
  const leader = p.leaderId ? s.characters[p.leaderId] : null;
  if (leader) remember(leader, { week: s.week, aboutId: c.id, kind: 'traicion', weight: -30, note: `Renunció a ${p.short}` });
  c.partyId = null; c.factionId = null;
  p.cohesion = clamp(p.cohesion - 3, 0, 100);
  addNews(s, rng, 'partidos', `${fullName(c)} renuncia a ${p.short}`, 'Su salida abre interrogantes sobre la unidad del partido.', c.offices.length ? 3 : 2);
  void leaveCoalition;
}
