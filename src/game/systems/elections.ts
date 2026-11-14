/**
 * SISTEMA ELECTORAL CHILENO (simulado).
 *
 * - Presidencial: mayoría absoluta de votos válidamente emitidos; si nadie la obtiene,
 *   segunda vuelta entre las dos primeras mayorías 4 semanas después.
 * - Diputados (28 distritos, 155 escaños) y Senado (16 circunscripciones, 50 escaños, renovación
 *   por mitades alternadas): representación proporcional con pactos y D'Hondt.
 * - Alcaldes: mayoría relativa en cada comuna (agregado por región, ver SIMULATION_RULES.md).
 * - Gobernadores regionales: requieren más del umbral (40%) o segunda vuelta.
 * - Concejales: D'Hondt en la comuna del jugador; agregados regionales simplificados.
 * - Primarias presidenciales: voluntarias, por coalición.
 */
import type { Candidate, Character, ElectionResult, ElectionType, GameState, RegionId, ScheduledElection, Seat } from '../models/types';
import { Rng } from '../engine/rng';
import { addDaysISO, dateToWeek, nthSunday, weekToISO, yearOf } from '../engine/dates';
import { CIRCUMSCRIPTIONS, DISTRICTS, REGIONS, REGION_BY_ID } from '../data/geography';
import { VOTE, PARTY, clamp } from '../rules/params';
import { allocateWithPacts } from './dhondt';
import { buildUtilityContext, comunaElectors, computeShares, partyOptions, type ShareResult, type VoteOption } from './electorate';
import { COMUNAS, comunasOfDistrict, comunasOfRegion, councilSeats } from '../territory/data';
import { legislativeRecordBonus } from '../career/legislature';
import { nomineesFor } from '../career/nominations';
import { ageOf, candidateQuality, createCharacter, fullName, removeOffice, remember } from './characters';
import { addHistory, currentISO, ideoDistance, newId, log, strongholdFactor } from './util';
import { addNews } from './news';

export const ELECTION_LABELS: Record<ElectionType, string> = {
  presidencial: 'Presidencial (1ª vuelta)', presidencial_2v: 'Presidencial (2ª vuelta)', diputados: 'Diputadas y Diputados',
  senadores: 'Senado', alcaldes: 'Alcaldes', concejales: 'Concejales', gobernadores: 'Gobernadores regionales',
  gobernadores_2v: 'Gobernadores (2ª vuelta)', primarias: 'Primarias presidenciales',
};

/** Semanas antes de la elección en que cierra la inscripción de candidaturas (aprox. 90 días). */
export const REGISTRATION_WEEKS = 13;

// ---------------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------------
function pushElection(s: GameState, type: ElectionType, iso: string, extra: Partial<ScheduledElection> = {}): void {
  const week = dateToWeek(s.startDate, iso);
  if (week <= s.week) return;
  const id = `${type}-${iso}`;
  if (s.calendar.some((e) => e.id === id)) return;
  s.calendar.push({ id, type, week, date: iso, done: false, ...extra });
}

/**
 * Genera elecciones entre dos años. Generales: tercer domingo de noviembre cada 4 años desde
 * `generalBase`; municipales/regionales: último domingo de octubre cada 4 años desde `municipalBase`.
 */
export function generateCalendar(s: GameState, fromYear: number, toYear: number, generalBase = 2029, municipalBase = 2028): void {
  for (let y = fromYear; y <= toYear; y++) {
    if ((y - generalBase) % s.rules.presidentialTermYears === 0 && y >= generalBase) {
      const d = nthSunday(y, 11, 3);
      pushElection(s, 'primarias', addDaysISO(d, -140));
      pushElection(s, 'presidencial', d);
      pushElection(s, 'diputados', d);
      const cycle = Math.round((y - generalBase) / 4);
      const group = cycle % 2 === 0 ? 'B' : 'A';
      pushElection(s, 'senadores', d, { regions: CIRCUMSCRIPTIONS.filter((c) => c.group === group).map((c) => c.regionId) });
      pushElection(s, 'presidencial_2v', addDaysISO(d, 28));
    }
    if ((y - municipalBase) % 4 === 0 && y >= municipalBase) {
      const d = nthSunday(y, 10, -1);
      pushElection(s, 'alcaldes', d);
      pushElection(s, 'concejales', d);
      pushElection(s, 'gobernadores', d);
      pushElection(s, 'gobernadores_2v', addDaysISO(d, 28));
    }
  }
  s.calendar.sort((a, b) => a.week - b.week || a.type.localeCompare(b.type));
}

export function ensureCalendar(s: GameState): void {
  const y = yearOf(s.startDate, s.week);
  const last = s.calendar.length ? yearOf(s.startDate, s.calendar[s.calendar.length - 1].week) : y;
  if (last < y + 6) generateCalendar(s, last, y + 9);
  // depurar elecciones muy antiguas ya realizadas
  if (s.calendar.length > 40) s.calendar = s.calendar.filter((e) => !e.done || e.week > s.week - 260);
}

export function nextElection(s: GameState, types?: ElectionType[]): ScheduledElection | undefined {
  return s.calendar.find((e) => !e.done && e.week >= s.week && (!types || types.includes(e.type)));
}

// ---------------------------------------------------------------------------
// Listas y candidaturas
// ---------------------------------------------------------------------------
export function listIdOf(s: GameState, partyId: string): string {
  for (const c of Object.values(s.coalitions)) if (c.active && c.members.includes(partyId)) return c.id;
  return partyId;
}

/**
 * Subpactos dentro de un pacto: agrupación de partidos ideológicamente cercanos (clúster voraz).
 * Dentro de un subpacto, los escaños van a los candidatos más votados, sin importar su partido.
 */
export function subpacts(s: GameState, listId: string, parties: string[]): Record<string, string[]> {
  if (!s.coalitions[listId] || parties.length < 3) return Object.fromEntries(parties.map((p) => [p, [p]]));
  const sorted = [...parties].sort((a, b) => (s.nationalIntention[b] ?? 0) - (s.nationalIntention[a] ?? 0));
  const groups: { lead: string; members: string[] }[] = [];
  for (const p of sorted) {
    const g = groups.find((x) => ideoDistance(s.parties[x.lead].ideology, s.parties[p].ideology) < 0.24 && x.members.length < 4);
    if (g) g.members.push(p); else groups.push({ lead: p, members: [p] });
  }
  return Object.fromEntries(groups.map((g) => [`sub:${g.members.join('+')}`, g.members]));
}

export function listName(s: GameState, listId: string): string {
  return s.coalitions[listId]?.name ?? s.parties[listId]?.name ?? listId;
}

function competingParties(s: GameState): string[] {
  return Object.values(s.parties).filter((p) => p.active && p.legalStatus !== 'en_formacion' && p.legalStatus !== 'disuelto').map((p) => p.id);
}

function termsServed(c: Character, type: 'diputado' | 'senador'): number {
  return c.pastOffices.filter((o) => o.type === type && o.detail !== 'reemplazo').length + (c.offices.some((o) => o.type === type) ? 1 : 0);
}

/** Límite de reelección (Ley 21.238): diputados 3 períodos, senadores 2. */
export function canRunAgain(c: Character, type: 'diputado' | 'senador'): boolean {
  return termsServed(c, type) < (type === 'diputado' ? 3 : 2);
}

function playerCandidacy(s: GameState, electionId: string, unit?: string) {
  return s.player.candidacies.find((c) => c.electionId === electionId && c.approved && (unit === undefined || c.unitId === unit));
}

function isPlayerFree(s: GameState): boolean {
  return !s.player.careerOver && s.characters[s.player.characterId]?.status === 'activo';
}

// ---------------------------------------------------------------------------
// Utilidades de cómputo
// ---------------------------------------------------------------------------
function regionalPartyVotes(s: GameState, rng: Rng, regions: RegionId[] | undefined, qualityByParty: Record<string, Partial<Record<RegionId, number>>>, noise = VOTE.electionNoise) {
  const ctx = buildUtilityContext(s, false);
  const shocks: Record<string, number> = {};
  const opts: VoteOption[] = partyOptions(s).map((o) => ({ ...o, qualityByRegion: qualityByParty[o.partyId] }));
  const cshocks: Record<string, number> = {};
  for (const o of opts) for (const r of REGIONS) shocks[`${o.key}|${r.id}`] = rng.normal(0, noise);
  // variación local controlada (candidaturas, contingencia comunal)
  for (const o of opts) for (const c of COMUNAS) cshocks[`${o.key}|${c.cut}`] = rng.normal(0, noise * 0.7);
  ctx.shocks = shocks; ctx.comunaShocks = cshocks;
  return computeShares(s, opts, ctx, regions);
}

function campaignBoostForPlayer(s: GameState): number {
  const c = s.player.campaign;
  if (!c) return 0;
  // Relativo a una campaña promedio: las candidaturas de la IA también hacen campaña
  return clamp((c.intensity - 45) / 100, -0.4, 0.55);
}

/** Guarda votos por comuna en el resultado (para mapas, comparaciones y explicaciones). */
export function storeComunaResults(s: GameState, result: ElectionResult, shares: ShareResult, regions?: RegionId[], keyMap?: (k: string) => string): void {
  const out: NonNullable<ElectionResult['comunas']> = {};
  for (const c of COMUNAS) {
    if (regions && !regions.includes(c.region)) continue;
    const v = shares.byComuna[c.cut]; if (!v) continue;
    const vv: Record<string, number> = {};
    for (const [k, x] of Object.entries(v)) if (x >= 0.5) vv[keyMap ? keyMap(k) : k] = Math.round(x);
    out[c.cut] = { v: vv, t: Math.round(shares.turnoutByComuna[c.cut] ?? 0), e: comunaElectors(s, c.cut) };
  }
  result.comunas = out;
  // Se conserva el detalle comunal solo de las últimas 10 elecciones (tamaño de la partida)
  const withDetail = s.results.filter((r) => r.comunas);
  if (withDetail.length > 10) for (const r of withDetail.slice(0, withDetail.length - 10)) delete r.comunas;
}

function makeResult(s: GameState, election: ScheduledElection): ElectionResult {
  return {
    id: newId(s, 'r'), electionId: election.id, type: election.type, week: s.week, date: election.date,
    nationalPartyPct: {}, seatsByParty: {}, units: [], turnoutPct: 0, countOrder: [], names: {},
  };
}

function finalizeNational(result: ElectionResult, partyTotals: Record<string, number>, totalVoters: number, electorate: number): void {
  const valid = Object.values(partyTotals).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(partyTotals)) result.nationalPartyPct[k] = valid > 0 ? (v / valid) * 100 : 0;
  result.turnoutPct = electorate > 0 ? (totalVoters / electorate) * 100 : 0;
  result.countOrder = [...result.units].sort((a, b) => a.turnout - b.turnout).map((u) => u.unitId);
}

function electorateTotal(s: GameState, regions?: RegionId[]): number {
  let t = 0;
  for (const seg of s.segments) if (!regions || regions.includes(seg.regionId)) t += seg.voters;
  return t;
}

// ---------------------------------------------------------------------------
// Elecciones proporcionales (Diputados y Senado)
// ---------------------------------------------------------------------------
interface PRUnit { unitId: number; regionId: RegionId; seats: number; name: string; weight: number; }

function runProportional(s: GameState, rng: Rng, election: ScheduledElection, chamber: 'camara' | 'senado'): ElectionResult {
  const result = makeResult(s, election);
  const type = chamber === 'camara' ? 'diputado' : 'senador';
  const units: PRUnit[] = chamber === 'camara'
    ? DISTRICTS.map((d) => {
      const regSeats = DISTRICTS.filter((x) => x.regionId === d.regionId).reduce((a, x) => a + x.seats, 0);
      return { unitId: d.id, regionId: d.regionId, seats: d.seats, name: d.name, weight: d.seats / regSeats };
    })
    : CIRCUMSCRIPTIONS.filter((c) => election.regions?.includes(c.regionId)).map((c) => ({ unitId: c.id, regionId: c.regionId, seats: c.seats, name: c.name, weight: 1 }));
  const regions = [...new Set(units.map((u) => u.regionId))];
  const parties = competingParties(s);
  const lists: Record<string, string[]> = {};
  for (const p of parties) (lists[listIdOf(s, p)] ??= []).push(p);

  // Candidaturas por unidad y partido
  const candByUnit: Record<number, Record<string, Candidate[]>> = {};
  const qualityByParty: Record<string, Partial<Record<RegionId, number>>> = {};
  const playerChar = s.characters[s.player.characterId];
  const pc = isPlayerFree(s) ? playerCandidacy(s, election.id) : undefined;
  const generated = new Set<string>();
  for (const u of units) {
    candByUnit[u.unitId] = {};
    const regSupport = s.regions[u.regionId].partySupport;
    for (const [listId, members] of Object.entries(lists)) {
      const listShare = members.reduce((a, p) => a + (regSupport[p] ?? 0), 0);
      for (const p of members) {
        const share = regSupport[p] ?? 0;
        const inList = listShare > 0 ? share / listShare : 1 / members.length;
        const expected = share * u.seats;
        let k = clamp(Math.round(expected * 1.4 + 1), 1, u.seats + 1);
        if (members.length > 1) k = clamp(Math.round((u.seats + 1) * inList + 0.5), 1, u.seats);
        const cands: Candidate[] = [];
        // incumbentes
        for (const seat of s.seats) {
          if (seat.chamber !== chamber || seat.unitId !== u.unitId || !seat.holderId) continue;
          const h = s.characters[seat.holderId];
          if (!h || h.isPlayer || h.partyId !== p || h.status !== 'activo' || !canRunAgain(h, type)) continue;
          if (ageOf(s, h) > 78) continue;
          cands.push({ id: h.id, partyId: p, listId, quality: candidateQuality(h, u.regionId) + 8 });
        }
        // diputados que saltan al Senado
        if (chamber === 'senado') {
          for (const seat of s.seats) {
            if (seat.chamber !== 'camara' || seat.regionId !== u.regionId || !seat.holderId || cands.length >= k) continue;
            const h = s.characters[seat.holderId];
            if (!h || h.isPlayer || h.partyId !== p || h.ambitionTarget === 'diputado') continue;
            if (candidateQuality(h, u.regionId) > 55 && rng.chance(0.35)) cands.push({ id: h.id, partyId: p, listId, quality: candidateQuality(h, u.regionId) + 4 });
          }
        }
        // nominados en procesos internos (personajes que ganaron la selección de su partido)
        for (const nid of nomineesFor(s, election.id, chamber === 'camara' ? String(u.unitId) : u.regionId, p)) {
          const nc = s.characters[nid];
          if (nc && nc.status === 'activo' && !cands.some((x) => x.id === nid)) cands.unshift({ id: nid, partyId: p, listId, quality: candidateQuality(nc, u.regionId) + 4 });
        }
        if (pc && playerChar && (pc.partyId === p) && String(u.unitId) === pc.unitId) {
          const q = candidateQuality(playerChar, u.regionId) + campaignBoostForPlayer(s) * 25 + (playerChar.offices.some((o) => o.type === type) ? 8 + legislativeRecordBonus(s) : 0);
          cands.push({ id: playerChar.id, partyId: p, listId, quality: clamp(q, 0, 100) });
        }
        while (cands.length < k) {
          const party = s.parties[p];
          // Los partidos pequeños concentran a sus mejores figuras en sus bastiones
          const bastion = strongholdFactor(p, `${chamber}${u.unitId}`, 0.45 + 0.45 * (1 - Math.min(1, (s.nationalIntention[p] ?? 5) / 10)));
          const smallBoost = (s.nationalIntention[p] ?? 5) < 6 && bastion > 1.2 && cands.length === 0 ? 14 : 0;
          const c = createCharacter(s, rng, { partyId: p, regionId: u.regionId, ideology: party.ideology, quality: rng.normal(48 + smallBoost, 10), minAge: 28, maxAge: 66, recognition: smallBoost ? 45 : undefined });
          generated.add(c.id);
          cands.push({ id: c.id, partyId: p, listId, quality: candidateQuality(c, u.regionId) });
        }
        candByUnit[u.unitId][p] = cands;
        const avgQ = cands.reduce((a, c) => a + c.quality, 0) / cands.length;
        (qualityByParty[p] ??= {})[u.regionId] = ((qualityByParty[p][u.regionId] ?? avgQ) + avgQ) / 2;
      }
    }
  }

  const shares = regionalPartyVotes(s, rng, regions, qualityByParty);
  const partyTotals: Record<string, number> = {};
  let totalVoters = 0;
  // Umbral opcional (reforma política)
  const threshold = chamber === 'camara' ? s.rules.deputyThresholdPct : 0;
  let excluded = new Set<string>();
  if (threshold > 0) {
    const nat = shares.national; const tot = shares.totalValid;
    excluded = new Set(Object.keys(nat).filter((k) => (nat[k] / tot) * 100 < threshold));
  }

  const elected: Record<number, { id: string; partyId: string }[]> = {};
  for (const u of units) {
    // Votos del distrito/circunscripción = suma exacta de sus comunas
    const unitComunas = chamber === 'camara' ? comunasOfDistrict(u.unitId) : comunasOfRegion(u.regionId);
    const rawVotes: Record<string, number> = {};
    let blankRaw = 0; let votersRaw = 0;
    for (const c of unitComunas) {
      const v = shares.byComuna[c.cut]; if (!v) continue;
      for (const p of parties) rawVotes[p] = (rawVotes[p] ?? 0) + (v[p] ?? 0);
      blankRaw += shares.blankByComuna[c.cut] ?? 0; votersRaw += shares.turnoutByComuna[c.cut] ?? 0;
    }
    const regTotal = Object.values(rawVotes).reduce((a, b) => a + b, 0);
    const partyVotes: Record<string, number> = {};
    let raw = 0;
    for (const p of parties) {
      // voto personal: un buen candidato (p. ej., incumbente) arrastra votos a su partido en el distrito
      const bestQ = Math.max(40, ...((candByUnit[u.unitId][p] ?? []).map((c) => c.quality)));
      const personal = Math.exp((bestQ - 50) / 30);
      const v = personal * (rawVotes[p] ?? 0) * Math.exp(rng.normal(0, 0.06));
      partyVotes[p] = v; raw += v;
    }
    const scale = raw > 0 ? regTotal / raw : 1;
    for (const p of parties) partyVotes[p] = Math.round(partyVotes[p] * scale);
    const blank = Math.round(blankRaw);
    const unitVoters = Math.round(votersRaw);
    totalVoters += unitVoters;
    // votos por candidato
    const candidateVotes: Record<string, number> = {};
    const listVotesByParty: Record<string, Record<string, number>> = {};
    const caps: Record<string, number> = {};
    for (const [p, cands] of Object.entries(candByUnit[u.unitId])) {
      partyTotals[p] = (partyTotals[p] ?? 0) + partyVotes[p];
      if (excluded.has(p)) continue;
      const ws = cands.map((c) => Math.exp((c.quality - 50) / 13) * Math.exp(rng.normal(0, 0.3)));
      const wt = ws.reduce((a, b) => a + b, 0);
      cands.forEach((c, i) => { candidateVotes[c.id] = Math.round(partyVotes[p] * ws[i] / wt); });
      const l = cands[0]?.listId ?? p;
      (listVotesByParty[l] ??= {})[p] = partyVotes[p];
      caps[p] = cands.length;
    }
    // Subpactos: D'Hondt entre listas → entre subpactos/partidos → candidatos más votados del subpacto
    const groupVotes: Record<string, Record<string, number>> = {};
    const groupCaps: Record<string, number> = {};
    const groupMembers: Record<string, string[]> = {};
    for (const [l, ps] of Object.entries(listVotesByParty)) {
      const groups = subpacts(s, l, Object.keys(ps));
      for (const [g, gm] of Object.entries(groups)) {
        (groupVotes[l] ??= {})[g] = gm.reduce((a, p) => a + (ps[p] ?? 0), 0);
        groupCaps[g] = gm.reduce((a, p) => a + (caps[p] ?? 0), 0);
        groupMembers[g] = gm;
      }
    }
    const alloc = allocateWithPacts(groupVotes, u.seats, groupCaps);
    const winners: { id: string; partyId: string }[] = [];
    for (const [g, n] of Object.entries(alloc.byParty)) {
      const pool = groupMembers[g].flatMap((p) => candByUnit[u.unitId][p] ?? []);
      const sorted = [...pool].sort((a, b) => candidateVotes[b.id] - candidateVotes[a.id]);
      for (let i = 0; i < n && i < sorted.length; i++) winners.push({ id: sorted[i].id, partyId: sorted[i].partyId });
    }
    elected[u.unitId] = winners;
    const listVotes: Record<string, number> = {};
    for (const [l, ps] of Object.entries(listVotesByParty)) listVotes[l] = Object.values(ps).reduce((a, b) => a + b, 0);
    // Conservar solo votos de candidatos relevantes
    const keep = new Set(winners.map((w) => w.id));
    if (playerChar) keep.add(playerChar.id);
    const keptVotes: Record<string, number> = {};
    for (const [id, v] of Object.entries(candidateVotes)) if (keep.has(id)) keptVotes[id] = v;
    for (const id of keep) if (s.characters[id] && keptVotes[id] !== undefined) result.names[id] = fullName(s.characters[id]);
    const electedParty: Record<string, number> = {};
    for (const w of winners) electedParty[w.partyId] = (electedParty[w.partyId] ?? 0) + 1;
    result.units.push({
      unitId: String(u.unitId), name: u.name, regionId: u.regionId, seats: u.seats, partyVotes, listVotes,
      candidateVotes: keptVotes, elected: winners.map((w) => w.id), electedParty, blankNull: blank, turnout: unitVoters,
    });
    for (const [p, n] of Object.entries(electedParty)) result.seatsByParty[p] = (result.seatsByParty[p] ?? 0) + n;
  }
  finalizeNational(result, partyTotals, totalVoters, electorateTotal(s, regions));
  storeComunaResults(s, result, shares, regions);
  if (chamber === 'camara') for (const c of COMUNAS) {
    const v = shares.byComuna[c.cut]; const st = s.comunas[c.cut]; if (!v || !st) continue;
    const tot = Object.values(v).reduce((a, b) => a + b, 0) || 1;
    st.lastShares = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x / tot]));
    st.lastTurnout = (shares.turnoutByComuna[c.cut] ?? 0) / Math.max(1, comunaElectors(s, c.cut));
  }

  // Aplicar resultados institucionales
  const termEnd = dateToWeek(s.startDate, `${yearOf(s.startDate, s.week) + (chamber === 'camara' ? s.rules.deputyTermYears : s.rules.senatorTermYears) + 1}-03-11`);
  const winnersAll = new Set(Object.values(elected).flat().map((w) => w.id));
  for (const u of units) {
    const unitSeats = s.seats.filter((st) => st.chamber === chamber && st.unitId === u.unitId);
    for (const st of unitSeats) {
      if (st.holderId && !winnersAll.has(st.holderId)) {
        const h = s.characters[st.holderId];
        if (h) removeOffice(s, h, type, 'fin de período');
      }
      st.holderId = null;
    }
    elected[u.unitId].forEach((w, i) => {
      const st = unitSeats[i];
      if (!st) return;
      const c = s.characters[w.id];
      st.holderId = w.id; st.termEndWeek = termEnd;
      if (c.offices.some((o) => o.type === type)) {
        removeOffice(s, c, type, 'reelecto');
      }
      // diputado electo senador deja la Cámara
      if (type === 'senador' && c.offices.some((o) => o.type === 'diputado')) {
        const ds = s.seats.find((x) => x.chamber === 'camara' && x.holderId === c.id);
        if (ds) ds.holderId = null;
        removeOffice(s, c, 'diputado', 'electo senador');
      }
      c.offices.push({ type, regionId: u.regionId, districtId: chamber === 'camara' ? u.unitId : undefined, since: s.week, termEndWeek: termEnd });
      c.rep.reconocimiento = clamp(c.rep.reconocimiento + 10, 0, 100);
    });
  }
  // Depurar candidatos generados que perdieron
  for (const id of generated) if (!winnersAll.has(id)) delete s.characters[id];
  if (pc && playerChar) {
    const won = winnersAll.has(playerChar.id);
    const unit = result.units.find((u) => u.unitId === pc.unitId);
    const votes = unit?.candidateVotes[playerChar.id] ?? 0;
    const unitValid = unit ? Object.values(unit.partyVotes).reduce((a, b) => a + b, 0) : 1;
    // Margen (en puntos del distrito): frente al último electo si pierde, frente al mejor no electo si gana
    const cv = Object.entries(unit?.candidateVotes ?? {}).filter(([id]) => id !== playerChar.id);
    const elected = new Set(unit?.elected ?? []);
    const losers = cv.filter(([id]) => !elected.has(id)).map(([, v]) => v);
    const ref = won ? (losers.length ? Math.max(...losers) : Infinity) : Math.min(...cv.filter(([id]) => elected.has(id)).map(([, v]) => v), Infinity);
    const raw = Number.isFinite(ref) ? ((votes - ref) / Math.max(unitValid, 1)) * 100 : undefined;
    // Con D'Hondt se puede perder con más votos que un electo de otra lista: el signo sigue al resultado
    const marginPct = raw === undefined ? undefined : won ? Math.max(raw, 0.1) : Math.min(raw, -0.1);
    result.playerOutcome = { ran: true, won, office: type, votes, pct: (votes / Math.max(unitValid, 1)) * 100, marginPct };
  }
  for (const [p, pct] of Object.entries(result.nationalPartyPct)) {
    s.parties[p]?.history.push({ week: s.week, date: election.date, election: election.type, votePct: pct, seats: result.seatsByParty[p] ?? 0 });
  }
  if (chamber === 'camara') {
    // Resultado regional = suma de los distritos de la región
    const byRegion: Record<string, Record<string, number>> = {};
    for (const u of result.units) { const acc = (byRegion[u.regionId] ??= {}); for (const [p, v] of Object.entries(u.partyVotes)) acc[p] = (acc[p] ?? 0) + v; }
    for (const [r, votes] of Object.entries(byRegion)) {
      const tot = Object.values(votes).reduce((a, b) => a + b, 0) || 1;
      s.regions[r as RegionId].lastResults = Object.fromEntries(Object.entries(votes).map(([p, v]) => [p, v / tot]));
    }
  }
  if (chamber === 'camara') checkPartySurvival(s, result);
  return result;
}

/**
 * Subsistencia legal (aproximación a la Ley 18.603, art. 56): un partido se disuelve si no alcanza
 * el 5% de los votos válidos de diputados en al menos 8 regiones o en 3 regiones contiguas, salvo
 * que elija al menos 4 parlamentarios. Se asume que todos están constituidos en las 16 regiones.
 */
export function survivesLegally(s: GameState, result: ElectionResult, partyId: string): { ok: boolean; regionsOver: number; contiguous: number; parl: number } {
  const regPct: Record<string, number> = {};
  const regTot: Record<string, number> = {};
  const regP: Record<string, number> = {};
  for (const u of result.units) {
    const tot = Object.values(u.partyVotes).reduce((a, b) => a + b, 0);
    regTot[u.regionId] = (regTot[u.regionId] ?? 0) + tot;
    regP[u.regionId] = (regP[u.regionId] ?? 0) + (u.partyVotes[partyId] ?? 0);
  }
  for (const r of Object.keys(regTot)) regPct[r] = (regP[r] / Math.max(1, regTot[r])) * 100;
  const order = [...REGIONS].sort((a, b) => a.order - b.order).map((r) => r.id);
  let run = 0; let best = 0; let over = 0;
  for (const r of order) { if ((regPct[r] ?? 0) >= PARTY.survivalPct) { run++; over++; best = Math.max(best, run); } else run = 0; }
  const parl = s.seats.filter((st) => st.holderId && s.characters[st.holderId]?.partyId === partyId).length;
  return { ok: over >= 8 || best >= 3 || parl >= PARTY.survivalParliamentarians, regionsOver: over, contiguous: best, parl };
}

function checkPartySurvival(s: GameState, result: ElectionResult): void {
  const status: Record<string, ReturnType<typeof survivesLegally>> = {};
  for (const p of Object.values(s.parties)) if (p.active && p.legalStatus !== 'en_formacion') status[p.id] = survivesLegally(s, result, p.id);
  for (const p of Object.values(s.parties)) {
    if (!p.active || p.legalStatus === 'en_formacion') continue;
    const pct = result.nationalPartyPct[p.id] ?? 0;
    const sv = status[p.id];
    const parl = sv.parl;
    if (!sv.ok) {
      // Alternativa: fusión con el socio de coalición (que sí subsiste) ideológicamente más cercano, como ocurrió con el FA en 2024
      const coal = Object.values(s.coalitions).find((c) => c.active && c.members.includes(p.id));
      const partner = coal?.members.filter((m) => m !== p.id && s.parties[m]?.active && status[m]?.ok).map((m) => s.parties[m]).sort((a, b) => ideoDistance(a.ideology, p.ideology) - ideoDistance(b.ideology, p.ideology))[0];
      if (partner && ideoDistance(partner.ideology, p.ideology) < 0.4) { mergeParty(s, p.id, partner.id, pct, parl); continue; }
      p.legalStatus = 'disuelto'; p.active = false;
      for (const c of Object.values(s.characters)) if (c.partyId === p.id && c.status === 'activo') {
        if (c.isPlayer) s.player.lastActionResults.push(`Tu partido, ${p.name}, fue disuelto por no alcanzar el umbral legal. Quedas como independiente.`);
        c.partyId = null; c.factionId = null;
      }
      for (const coal of Object.values(s.coalitions)) coal.members = coal.members.filter((m) => m !== p.id);
      cleanupCoalitions(s);
      addHistory(s, 'partido', `${p.name} pierde su inscripción legal`, `Obtuvo ${pct.toFixed(1)}% (≥5% en ${sv.regionsOver} regiones; ${sv.contiguous} contiguas) y ${parl} parlamentarios: no cumple los requisitos de subsistencia.`, 4);
    }
  }
}

export function cleanupCoalitions(s: GameState): void {
  for (const c of Object.values(s.coalitions)) if (c.active && c.members.filter((m) => s.parties[m]?.active).length < 2) {
    c.active = false; c.dissolvedWeek = s.week; c.members = c.members.filter((m) => s.parties[m]?.active);
    if (s.government.coalitionId === c.id) c.isGovernment = true;
    addHistory(s, 'coalicion', `Se extingue ${c.name}`, 'Quedó con menos de dos partidos.', 2);
  }
}

/** Fusión: militantes, parlamentarios y afinidades del electorado pasan al partido receptor. */
export function mergeParty(s: GameState, fromId: string, intoId: string, pct: number, parl: number): void {
  const from = s.parties[fromId]; const into = s.parties[intoId];
  from.legalStatus = 'fusionado'; from.active = false; from.mergedInto = intoId;
  into.members += Math.round(from.members * 0.7);
  for (const seg of s.segments) {
    const a = seg.partisanship[intoId] ?? -3; const b = seg.partisanship[fromId] ?? -3;
    seg.partisanship[intoId] = Math.log(Math.exp(a) + 0.8 * Math.exp(b));
  }
  for (const c of Object.values(s.characters)) if (c.partyId === fromId) {
    if (from.leaderId === c.id) removeOffice(s, c, 'presidente_partido', from.short);
    c.partyId = intoId; c.factionId = into.factions[0]?.id ?? null;
    if (c.isPlayer) s.player.lastActionResults.push(`Tu partido se fusionó con ${into.name}.`);
  }
  from.leaderId = null;
  for (const coal of Object.values(s.coalitions)) coal.members = coal.members.filter((m) => m !== fromId);
  cleanupCoalitions(s);
  addHistory(s, 'partido', `${from.name} se fusiona con ${into.name}`, `Con ${pct.toFixed(1)}% y ${parl} parlamentarios no alcanzaba los requisitos legales de subsistencia.`, 4);
}

// ---------------------------------------------------------------------------
// Presidencial
// ---------------------------------------------------------------------------
export function pickPresidentialCandidate(s: GameState, rng: Rng, listId: string): string | null {
  const coal = s.coalitions[listId];
  const members = coal ? coal.members : [listId];
  let best: Character | null = null; let bestScore = -Infinity;
  for (const c of Object.values(s.characters)) {
    if (c.status !== 'activo' || c.isPlayer || !c.partyId || !members.includes(c.partyId)) continue;
    if (c.offices.some((o) => o.type === 'presidente')) continue; // sin reelección inmediata
    if (ageOf(s, c) < 35) continue; // requisito constitucional de edad
    const partyWeight = (s.nationalIntention[c.partyId] ?? 1) / 10;
    const score = candidateQuality(c) + partyWeight * 6 + (c.ambitionTarget === 'presidente' ? 6 : 0) + rng.normal(0, 4);
    if (score > bestScore) { best = c; bestScore = score; }
  }
  if (!best) {
    const lead = coal ? coal.leaderPartyId : listId;
    const party = s.parties[lead];
    if (!party) return null;
    best = createCharacter(s, rng, { partyId: lead, regionId: 'RM', ideology: party.ideology, quality: 66, minAge: 45, maxAge: 65, recognition: 55 });
  }
  return best.id;
}

function presidentialField(s: GameState, rng: Rng): { id: string; partyId: string; listId: string }[] {
  const lists = new Set(competingParties(s).map((p) => listIdOf(s, p)));
  const field: { id: string; partyId: string; listId: string }[] = [];
  for (const l of lists) {
    const support = (s.coalitions[l]?.members ?? [l]).reduce((a, p) => a + (s.nationalIntention[p] ?? 0), 0);
    // Partidos pequeños sin coalición no siempre presentan candidatura (requisito de firmas/costo)
    if (!s.coalitions[l] && support < 4 && !rng.chance(support / 8)) continue;
    let id = s.presidentialCandidates[l];
    if (!id || s.characters[id]?.status !== 'activo') id = pickPresidentialCandidate(s, rng, l) ?? '';
    if (!id) continue;
    if (s.characters[id].isPlayer && !(playerCandidacy(s, `presidencial`) || s.player.candidacies.some((c) => c.office === 'presidente' && c.approved))) {
      id = pickPresidentialCandidate(s, rng, l) ?? '';
    }
    if (!id) continue;
    s.presidentialCandidates[l] = id;
    const c = s.characters[id];
    field.push({ id, partyId: c.partyId ?? l, listId: l });
  }
  // Candidaturas díscolas: partidos con apoyo propio que no se resignan al candidato de su coalición
  for (const p of Object.values(s.parties)) {
    if (!p.active || p.legalStatus === 'en_formacion' || (s.nationalIntention[p.id] ?? 0) < 6) continue;
    const l = listIdOf(s, p.id);
    if (l === p.id || field.some((f) => f.partyId === p.id)) continue;
    const coalCand = field.find((f) => f.listId === l);
    const dist = coalCand ? ideoDistance(s.characters[coalCand.id].ideology, p.ideology) : 1;
    if (rng.chance(0.12 + dist * 0.5)) {
      const id = pickPresidentialCandidate(s, rng, p.id);
      if (id && !s.characters[id].isPlayer) field.push({ id, partyId: p.id, listId: p.id });
    }
  }
  // Candidatura independiente "outsider" (fenómeno recurrente en Chile)
  if (rng.chance(0.55)) {
    const center = { eco: 10, val: 0, seg: 30, inst: -30, amb: 10, soc: 0, ord: -40, lab: 5 };
    const o = createCharacter(s, rng, { partyId: null, regionId: rng.pick(REGIONS).id, ideology: center, ideologySd: 20, quality: rng.normal(60, 6), minAge: 38, maxAge: 62, personality: 'mediatico', recognition: 40 });
    field.push({ id: o.id, partyId: 'IND', listId: o.id });
  }
  addPlayerPresidential(s, field);
  return field;
}

/** Candidatura del jugador fuera de coalición (independiente o propio partido). */
function addPlayerPresidential(s: GameState, field: { id: string; partyId: string; listId: string }[]): void {
  const player = s.characters[s.player.characterId];
  if (player && isPlayerFree(s) && s.player.candidacies.some((c) => c.office === 'presidente' && c.approved && c.electionId.startsWith('presidencial')) && !field.some((f) => f.id === player.id)) {
    const l = player.partyId ? listIdOf(s, player.partyId) : player.id;
    const existing = field.findIndex((f) => f.listId === l);
    if (existing >= 0) field.splice(existing, 1);
    field.push({ id: player.id, partyId: player.partyId ?? 'IND', listId: l });
  }
}

/** Semanas antes de la presidencial en que se cierra la inscripción de candidaturas (regla del juego, ~90 días). */
export const PRES_REGISTRATION_WEEKS = 13;

/** Cierre de inscripción: el campo presidencial queda fijo; las encuestas miden esas candidaturas. */
export function registerPresidentialField(s: GameState, rng: Rng): void {
  const e = s.calendar.find((x) => !x.done && x.type === 'presidencial' && x.week >= s.week);
  if (!e || e.week - s.week > PRES_REGISTRATION_WEEKS || s.registeredPresidential?.electionId === e.id) return;
  const field = presidentialField(s, rng);
  s.registeredPresidential = { electionId: e.id, week: s.week, field };
  addNews(s, rng, 'elecciones', `Cierra la inscripción: ${field.length} candidaturas presidenciales`, field.map((f) => fullName(s.characters[f.id])).join(', ') + '.', 4);
}

export function presidentialOptions(s: GameState, field: { id: string; partyId: string; listId: string }[], viability: Record<string, number>): VoteOption[] {
  return field.map((f) => {
    const c = s.characters[f.id];
    const boost = c.isPlayer ? campaignBoostForPlayer(s) * 22 : clamp((s.parties[f.partyId]?.funds ?? 0) / 400, 0, 1) * 10;
    return {
      key: f.id, partyId: f.partyId, ideology: c.ideology, quality: clamp(candidateQuality(c) + boost, 0, 100), viability: viability[f.id],
      affinityParties: s.coalitions[f.listId]?.members ?? undefined,
    };
  });
}

function runPresidential(s: GameState, rng: Rng, election: ScheduledElection): ElectionResult {
  const result = makeResult(s, election);
  let field: { id: string; partyId: string; listId: string }[];
  if (election.type === 'presidencial') {
    const reg = s.registeredPresidential?.electionId === election.id ? s.registeredPresidential.field.filter((f) => s.characters[f.id]?.status === 'activo') : null;
    if (reg && reg.length >= 2) { field = [...reg]; addPlayerPresidential(s, field); } else field = presidentialField(s, rng);
  }
  else {
    const first = [...s.results].reverse().find((r) => r.type === 'presidencial');
    field = (first?.candidates ?? []).filter((c) => c.id === first?.winnerId || c.id === first?.runnerUpId);
  }
  // viabilidad (voto útil) a partir del apoyo de su lista
  const viability: Record<string, number> = {};
  const totalSupport = field.reduce((a, f) => a + Math.max(0.5, (s.coalitions[f.listId]?.members ?? [f.partyId]).reduce((x, p) => x + (s.nationalIntention[p] ?? 0), 0)), 0);
  for (const f of field) viability[f.id] = Math.max(0.5, (s.coalitions[f.listId]?.members ?? [f.partyId]).reduce((x, p) => x + (s.nationalIntention[p] ?? 0), 0)) / totalSupport;
  if (election.type === 'presidencial_2v') for (const f of field) viability[f.id] = 0.5;
  const ctx = buildUtilityContext(s, true);
  const shocks: Record<string, number> = {};
  for (const f of field) { const nat = rng.normal(0, 0.1); for (const r of REGIONS) shocks[`${f.id}|${r.id}`] = nat + rng.normal(0, 0.08); }
  ctx.shocks = shocks;
  const opts = presidentialOptions(s, field, viability);
  for (const o of opts) if (s.parties[o.partyId] === undefined) o.partyId = o.partyId; // independiente
  const res = computeShares(s, opts, ctx);
  storeComunaResults(s, result, res);
  result.candidates = field;
  for (const f of field) result.names[f.id] = fullName(s.characters[f.id]);
  const nat: Record<string, number> = {};
  for (const f of field) nat[f.id] = ((res.national[f.id] ?? 0) / Math.max(res.totalValid, 1)) * 100;
  result.nationalCandidatePct = nat;
  for (const f of field) result.nationalPartyPct[f.partyId] = (result.nationalPartyPct[f.partyId] ?? 0) + nat[f.id];
  for (const r of REGIONS) {
    const v = res.byRegion[r.id] ?? {};
    const cv: Record<string, number> = {};
    for (const f of field) cv[f.id] = Math.round(v[f.id] ?? 0);
    const partyVotes: Record<string, number> = {};
    for (const f of field) partyVotes[f.partyId] = (partyVotes[f.partyId] ?? 0) + cv[f.id];
    const winner = Object.entries(cv).sort((a, b) => b[1] - a[1])[0]?.[0];
    result.units.push({ unitId: r.id, name: r.name, regionId: r.id, seats: 1, partyVotes, listVotes: {}, candidateVotes: cv, elected: winner ? [winner] : [], electedParty: {}, blankNull: Math.round(res.blankByRegion[r.id] ?? 0), turnout: Math.round(res.turnoutByRegion[r.id] ?? 0) });
  }
  result.turnoutPct = (res.totalVoters / electorateTotal(s)) * 100;
  result.countOrder = [...result.units].sort((a, b) => a.turnout - b.turnout).map((u) => u.unitId);
  const ranking = Object.entries(nat).sort((a, b) => b[1] - a[1]);
  const [first, second] = ranking;
  if (!first) return result;
  result.runnerUpId = second?.[0];
  const player = s.characters[s.player.characterId];
  if (election.type === 'presidencial' && first[1] <= s.rules.runoffThreshold && second) {
    result.runoffNeeded = true;
    result.winnerId = first[0];
    addHistory(s, 'eleccion', 'Presidencial: habrá segunda vuelta', `${fullName(s.characters[first[0]])} (${first[1].toFixed(1)}%) y ${fullName(s.characters[second[0]])} (${second[1].toFixed(1)}%) pasan al balotaje.`, 5);
  } else {
    result.winnerId = first[0];
    const runoff = s.calendar.find((e) => e.type === 'presidencial_2v' && !e.done && e.week > s.week && e.week - s.week <= 6);
    if (election.type === 'presidencial' && runoff) runoff.done = true; // no se requiere balotaje
    const w = s.characters[first[0]];
    s.government.electId = w.id;
    s.government.electCoalitionId = w.partyId ? listIdOf(s, w.partyId) : null;
    if (s.government.electCoalitionId && !s.coalitions[s.government.electCoalitionId]) s.government.electCoalitionId = null;
    w.rep.reconocimiento = 100;
    addHistory(s, 'eleccion', `${fullName(w)} es elegid${w.gender === 'f' ? 'a Presidenta' : 'o Presidente'} de la República`, `Con ${first[1].toFixed(1)}% de los votos válidos (${ELECTION_LABELS[election.type]}). Asume el 11 de marzo.`, 5);
  }
  if (player && field.some((f) => f.id === player.id)) {
    const won = !result.runoffNeeded && result.winnerId === player.id;
    result.playerOutcome = { ran: true, won, office: 'presidente', pct: nat[player.id] };
  }
  // Candidatos derrotados: memoria y reputación
  for (const f of field) if (f.id !== result.winnerId && !result.runoffNeeded) {
    const c = s.characters[f.id];
    if (c) c.rep.popularidad = clamp(c.rep.popularidad - 4, 0, 100);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Primarias
// ---------------------------------------------------------------------------
function runPrimaries(s: GameState, rng: Rng, election: ScheduledElection): ElectionResult {
  const result = makeResult(s, election);
  const player = s.characters[s.player.characterId];
  const playerPre = isPlayerFree(s) && player?.partyId ? s.player.candidacies.find((c) => c.electionId === election.id && c.approved) : undefined;
  const allCands: { id: string; partyId: string; listId: string }[] = [];
  const nat: Record<string, number> = {};
  for (const coal of Object.values(s.coalitions)) {
    if (!coal.active || coal.members.length < 2) continue;
    // Cada partido grande de la coalición presenta precandidatura si su apoyo supera 3%
    const cands: { id: string; partyId: string; listId: string }[] = [];
    for (const p of coal.members) {
      if ((s.nationalIntention[p] ?? 0) < 3 && !(playerPre && player.partyId === p)) continue;
      let id: string | null = null;
      if (playerPre && player.partyId === p) id = player.id;
      else id = pickPresidentialCandidate(s, rng, p);
      if (id && !cands.some((c) => c.id === id)) cands.push({ id, partyId: p, listId: coal.id });
    }
    if (cands.length < 2) {
      if (cands[0]) s.presidentialCandidates[coal.id] = cands[0].id;
      continue;
    }
    const ctx = buildUtilityContext(s, true, VOTE.primaryTurnout);
    const shocks: Record<string, number> = {};
    for (const c of cands) for (const r of REGIONS) shocks[`${c.id}|${r.id}`] = rng.normal(0, 0.2);
    ctx.shocks = shocks;
    const opts: VoteOption[] = cands.map((c) => ({ key: c.id, partyId: c.partyId, ideology: s.characters[c.id].ideology, quality: clamp(candidateQuality(s.characters[c.id]) + (s.characters[c.id].isPlayer ? campaignBoostForPlayer(s) * 25 : 0), 0, 100) }));
    // Solo votan simpatizantes de la coalición: ponderamos por el apoyo regional de la coalición
    const res = computeShares(s, opts, ctx);
    const votes: Record<string, number> = {};
    for (const r of REGIONS) {
      const coalShare = coal.members.reduce((a, p) => a + (s.regions[r.id].partySupport[p] ?? 0), 0);
      for (const c of cands) votes[c.id] = (votes[c.id] ?? 0) + (res.byRegion[r.id]?.[c.id] ?? 0) * coalShare * 2;
    }
    const tot = Object.values(votes).reduce((a, b) => a + b, 0);
    for (const c of cands) { nat[c.id] = (votes[c.id] / tot) * 100; result.names[c.id] = fullName(s.characters[c.id]); }
    const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
    s.presidentialCandidates[coal.id] = winner;
    allCands.push(...cands);
    addHistory(s, 'eleccion', `Primarias de ${coal.name}`, `${fullName(s.characters[winner])} gana con ${nat[winner].toFixed(1)}%.`, 3);
    if (player && cands.some((c) => c.id === player.id)) {
      result.playerOutcome = { ran: true, won: winner === player.id, office: 'primarias', pct: nat[player.id] };
      if (winner === player.id) {
        s.player.candidacies.push({ electionId: 'presidencial', office: 'presidente', partyId: player.partyId!, approved: true });
      }
    }
    for (const c of cands) if (c.id !== winner) {
      const loser = s.characters[c.id];
      remember(loser, { week: s.week, aboutId: winner, kind: 'conflicto', weight: -10, note: 'Derrota en primarias' });
    }
  }
  result.candidates = allCands;
  result.nationalCandidatePct = nat;
  for (const c of allCands) result.nationalPartyPct[c.partyId] = (result.nationalPartyPct[c.partyId] ?? 0) + (nat[c.id] ?? 0);
  result.turnoutPct = VOTE.primaryTurnout * 100;
  return result;
}

// ---------------------------------------------------------------------------
// Municipales y regionales
// ---------------------------------------------------------------------------
function coalitionBlocks(s: GameState): Record<string, string[]> {
  const lists: Record<string, string[]> = {};
  for (const p of competingParties(s)) (lists[listIdOf(s, p)] ??= []).push(p);
  return lists;
}

function runMayors(s: GameState, rng: Rng, election: ScheduledElection): ElectionResult {
  const result = makeResult(s, election);
  const shares = regionalPartyVotes(s, rng, undefined, {}, 0.12);
  const lists = coalitionBlocks(s);
  const player = s.characters[s.player.characterId];
  const pc = isPlayerFree(s) ? playerCandidacy(s, election.id) : undefined;
  const myCut = pc && player ? playerComunaCut(s) : null;
  const partyTotals: Record<string, number> = {};
  const winners: Record<string, string> = {};
  for (const r of REGIONS) s.regions[r.id].mayorsByParty = {};
  // 346 carreras comunales: cada bloque presenta un candidato; incumbencia y factores locales
  for (const c of COMUNAS) {
    const votes = shares.byComuna[c.cut]; if (!votes) continue;
    const tot = Object.values(votes).reduce((a, b) => a + b, 0) || 1;
    for (const [p, v] of Object.entries(votes)) partyTotals[p] = (partyTotals[p] ?? 0) + v;
    if (myCut === c.cut) continue; // la comuna del jugador se resuelve en su carrera personal
    const st = s.comunas[c.cut];
    const prev = st?.mayorParty ?? null;
    let best = ''; let bestV = -1;
    for (const members of Object.values(lists)) {
      const lv = members.reduce((a, p) => a + (votes[p] ?? 0) / tot, 0) * (members.length > 1 ? 0.93 : 1);
      // candidato del bloque: partido con más arraigo en la comuna (ponderado)
      const cand = rng.weighted(members, members.map((p) => Math.pow((votes[p] ?? 0) / tot + 0.001, 2) * (p === prev ? 2.5 : 1)));
      const incumbency = prev && members.includes(prev) ? 1.25 : 1;
      const v = lv * incumbency * Math.exp(rng.normal(0, 0.35));
      if (v > bestV) { bestV = v; best = cand; }
    }
    // independientes fuera de pacto (fenómeno local frecuente)
    const indChance = 0.1 + (prev === 'IND' ? 0.35 : 0) + (c.electors < 15000 ? 0.05 : 0);
    const winner = rng.chance(indChance) ? 'IND' : best;
    winners[c.cut] = winner;
    if (st) st.mayorParty = winner;
    const reg = s.regions[c.region];
    reg.mayorsByParty[winner] = (reg.mayorsByParty[winner] ?? 0) + 1;
  }
  for (const r of REGIONS) {
    const votes = shares.byRegion[r.id] ?? {};
    const partyVotes: Record<string, number> = {};
    for (const [p, v] of Object.entries(votes)) partyVotes[p] = Math.round(v);
    result.units.push({ unitId: r.id, name: r.name, regionId: r.id, seats: r.comunas, partyVotes, listVotes: {}, candidateVotes: {}, elected: [], electedParty: { ...s.regions[r.id].mayorsByParty }, blankNull: Math.round(shares.blankByRegion[r.id] ?? 0), turnout: Math.round(shares.turnoutByRegion[r.id] ?? 0) });
  }
  finalizeNational(result, partyTotals, shares.totalVoters, electorateTotal(s));
  storeComunaResults(s, result, shares);
  if (result.comunas) for (const [cut, w] of Object.entries(winners)) if (result.comunas[cut]) result.comunas[cut].w = w;
  // Carrera personal del jugador por alcaldía
  if (pc && player) {
    const won = playerLocalRace(s, rng, player, 'alcalde', result);
    if (myCut !== null) {
      const st = s.comunas[myCut]; const reg = s.regions[player.regionId];
      const w = won ? (player.partyId ?? 'IND') : (Object.entries(shares.byComuna[myCut] ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'IND');
      if (st) st.mayorParty = w;
      reg.mayorsByParty[w] = (reg.mayorsByParty[w] ?? 0) + 1;
    }
    if (won) {
      removeOffice(s, player, 'concejal', 'electo alcalde');
      removeOffice(s, player, 'alcalde', 'reelecto');
      player.offices.push({ type: 'alcalde', regionId: player.regionId, comuna: player.comuna, since: s.week, termEndWeek: s.week + 4 * 52 });
    } else removeOffice(s, player, 'alcalde', 'derrota');
  } else if (player && player.offices.some((o) => o.type === 'alcalde')) removeOffice(s, player, 'alcalde', 'fin de período');
  for (const u of result.units) u.electedParty = { ...s.regions[u.regionId].mayorsByParty };
  result.seatsByParty = {};
  for (const r of REGIONS) for (const [p, n] of Object.entries(s.regions[r.id].mayorsByParty)) result.seatsByParty[p] = (result.seatsByParty[p] ?? 0) + n;
  return result;
}

/** Comuna de residencia del jugador (código CUT) según su nombre y región. */
export function playerComunaCut(s: GameState): number | null {
  const c = s.characters[s.player.characterId];
  if (!c) return null;
  const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const m = COMUNAS.find((x) => x.region === c.regionId && norm(x.name) === norm(c.comuna ?? ''));
  return m?.cut ?? COMUNAS.filter((x) => x.region === c.regionId).sort((a, b) => b.electors - a.electors)[0]?.cut ?? null;
}

/** Carrera local del jugador (alcalde o gobernador): utilidad con candidatos reales del bloque rival. */
function playerLocalRace(s: GameState, rng: Rng, player: Character, office: 'alcalde' | 'gobernador', result: ElectionResult): boolean {
  const lists = coalitionBlocks(s);
  const ownList = player.partyId ? listIdOf(s, player.partyId) : 'IND';
  const opts: VoteOption[] = [];
  const q = clamp(candidateQuality(player, player.regionId) + campaignBoostForPlayer(s) * 25 + (player.offices.some((o) => o.type === office) ? 12 : 0), 0, 100);
  opts.push({ key: player.id, partyId: player.partyId ?? 'IND', ideology: player.ideology, quality: q });
  for (const [l, members] of Object.entries(lists)) {
    if (l === ownList) continue;
    const support = members.reduce((a, p) => a + (s.regions[player.regionId].partySupport[p] ?? 0), 0);
    if (support < 0.08) continue;
    const top = members.reduce((a, p) => ((s.regions[player.regionId].partySupport[p] ?? 0) > (s.regions[player.regionId].partySupport[a] ?? 0) ? p : a), members[0]);
    const rival = createCharacter(s, rng, { partyId: top, regionId: player.regionId, ideology: s.parties[top].ideology, quality: rng.normal(52, 9) });
    opts.push({ key: rival.id, partyId: top, ideology: rival.ideology, quality: candidateQuality(rival, player.regionId) + 8 });
    result.names[rival.id] = fullName(rival);
  }
  const ctx = buildUtilityContext(s, true);
  const shocks: Record<string, number> = {};
  for (const o of opts) shocks[`${o.key}|${player.regionId}`] = rng.normal(0, 0.3);
  ctx.shocks = shocks;
  const myCut = office === 'alcalde' ? playerComunaCut(s) : null;
  if (myCut !== null) for (const o of opts) shocks[`${o.key}|${player.regionId}`] = (shocks[`${o.key}|${player.regionId}`] ?? 0) * 1.5;
  const res = computeShares(s, opts, ctx, [player.regionId], myCut !== null ? new Set([myCut]) : undefined);
  const tot = Math.max(res.totalValid, 1);
  const pct = ((res.national[player.id] ?? 0) / tot) * 100;
  const ranking = Object.entries(res.national).sort((a, b) => b[1] - a[1]);
  const threshold = office === 'gobernador' ? s.rules.governorThreshold : 0;
  const won = ranking[0]?.[0] === player.id && (office !== 'gobernador' || pct > threshold || ranking.length < 2 || pct - ((ranking[1][1] / tot) * 100) > 8);
  result.names[player.id] = fullName(player);
  const other = ranking.find(([id]) => id !== player.id);
  const marginPct = other ? pct - (other[1] / tot) * 100 : undefined;
  result.playerOutcome = { ran: true, won, office, votes: Math.round(res.national[player.id] ?? 0), pct, marginPct };
  for (const o of opts) if (o.key !== player.id) delete s.characters[o.key];
  return won;
}

function runCouncil(s: GameState, rng: Rng, election: ScheduledElection): ElectionResult {
  const result = makeResult(s, election);
  const player = s.characters[s.player.characterId];
  const pc = isPlayerFree(s) ? playerCandidacy(s, election.id) : undefined;
  const shares = regionalPartyVotes(s, rng, undefined, {}, 0.12);
  const partyTotals: Record<string, number> = {};
  const regionSeats: Record<string, Record<string, number>> = {};
  // D'Hondt por comuna con 6, 8 o 10 concejales según electores (Ley 18.695)
  for (const c of COMUNAS) {
    const votes = shares.byComuna[c.cut]; if (!votes) continue;
    for (const [p, v] of Object.entries(votes)) partyTotals[p] = (partyTotals[p] ?? 0) + v;
    const lv: Record<string, Record<string, number>> = {}; const caps: Record<string, number> = {};
    const n = councilSeats(c.electors);
    for (const [p, v] of Object.entries(votes)) { (lv[listIdOf(s, p)] ??= {})[p] = v * Math.exp(rng.normal(0, 0.15)); caps[p] = n; }
    const alloc = allocateWithPacts(lv, n, caps);
    const acc = (regionSeats[c.region] ??= {});
    for (const [p, k] of Object.entries(alloc.byParty)) acc[p] = (acc[p] ?? 0) + k;
  }
  for (const r of REGIONS) {
    const votes = shares.byRegion[r.id] ?? {};
    const partyVotes: Record<string, number> = {};
    for (const [p, v] of Object.entries(votes)) partyVotes[p] = Math.round(v);
    const seats = regionSeats[r.id] ?? {};
    const n = Object.values(seats).reduce((a, b) => a + b, 0);
    result.units.push({ unitId: r.id, name: r.name, regionId: r.id, seats: n, partyVotes, listVotes: {}, candidateVotes: {}, elected: [], electedParty: seats, blankNull: Math.round(shares.blankByRegion[r.id] ?? 0), turnout: Math.round(shares.turnoutByRegion[r.id] ?? 0) });
    for (const [p, k] of Object.entries(seats)) result.seatsByParty[p] = (result.seatsByParty[p] ?? 0) + k;
  }
  finalizeNational(result, partyTotals, shares.totalVoters, electorateTotal(s));
  storeComunaResults(s, result, shares);
  if (pc && player && player.partyId) {
    const cut = playerComunaCut(s);
    const local = (cut !== null ? shares.byComuna[cut] : null) ?? shares.byRegion[player.regionId] ?? {};
    const n = cut !== null ? councilSeats(COMUNAS.find((x) => x.cut === cut)!.electors) : 8;
    const lv: Record<string, Record<string, number>> = {}; const caps: Record<string, number> = {};
    for (const [p, v] of Object.entries(local)) { (lv[listIdOf(s, p)] ??= {})[p] = v * Math.exp(rng.normal(0, 0.2)); caps[p] = 3; }
    const alloc = allocateWithPacts(lv, n, caps);
    const partySeats = alloc.byParty[player.partyId] ?? 0;
    const myQ = candidateQuality(player, player.regionId) + campaignBoostForPlayer(s) * 25;
    const mates = [rng.normal(45, 10), rng.normal(45, 10)];
    const rank = mates.filter((m) => m > myQ + rng.normal(0, 8)).length;
    const won = rank < partySeats;
    result.playerOutcome = { ran: true, won, office: 'concejal' };
    result.names[player.id] = fullName(player);
    if (won) {
      removeOffice(s, player, 'concejal', 'reelecto');
      player.offices.push({ type: 'concejal', regionId: player.regionId, comuna: player.comuna, since: s.week, termEndWeek: s.week + 4 * 52 });
    } else removeOffice(s, player, 'concejal', 'derrota');
  } else if (player && player.offices.some((o) => o.type === 'concejal')) removeOffice(s, player, 'concejal', 'fin de período');
  return result;
}

function runGovernors(s: GameState, rng: Rng, election: ScheduledElection): ElectionResult {
  const result = makeResult(s, election);
  const lists = coalitionBlocks(s);
  const player = s.characters[s.player.characterId];
  const pc = isPlayerFree(s) ? playerCandidacy(s, election.id) : undefined;
  const isRunoff = election.type === 'gobernadores_2v';
  const prev = isRunoff ? [...s.results].reverse().find((r) => r.type === 'gobernadores') : undefined;
  const partyTotals: Record<string, number> = {};
  let totalVoters = 0;
  for (const r of REGIONS) {
    if (pc && player && player.regionId === r.id) continue; // se resuelve en carrera personal
    let candidates: { id: string; partyId: string }[] = [];
    if (isRunoff) {
      const u = prev?.units.find((x) => x.unitId === r.id);
      if (!u || u.elected.length > 0) continue;
      candidates = Object.entries(u.candidateVotes).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => ({ id, partyId: s.characters[id]?.partyId ?? 'IND' })).filter((c) => s.characters[c.id]);
      if (candidates.length < 2) continue;
    } else {
      for (const members of Object.values(lists)) {
        const support = members.reduce((a, p) => a + (s.regions[r.id].partySupport[p] ?? 0), 0);
        if (support < 0.06) continue;
        const top = rng.weighted(members, members.map((p) => Math.pow((s.regions[r.id].partySupport[p] ?? 0) * strongholdFactor(p, `gob${r.id}`, 0.5), 1.5)));
        const inc = s.regions[r.id].governorId ? s.characters[s.regions[r.id].governorId!] : null;
        let cand: Character;
        if (inc && inc.partyId && members.includes(inc.partyId) && inc.status === 'activo' && inc.pastOffices.filter((o) => o.type === 'gobernador').length < 1) cand = inc;
        else cand = createCharacter(s, rng, { partyId: top, regionId: r.id, ideology: s.parties[top].ideology, quality: rng.normal(55, 8), recognition: 35 });
        candidates.push({ id: cand.id, partyId: top });
      }
    }
    const ctx = buildUtilityContext(s, true);
    const shocks: Record<string, number> = {};
    for (const c of candidates) shocks[`${c.id}|${r.id}`] = rng.normal(0, 0.2);
    ctx.shocks = shocks;
    const opts: VoteOption[] = candidates.map((c) => ({ key: c.id, partyId: c.partyId, ideology: s.characters[c.id].ideology, quality: candidateQuality(s.characters[c.id], r.id) + (s.regions[r.id].governorId === c.id ? 10 : 0) }));
    const res = computeShares(s, opts, ctx, [r.id]);
    const tot = Math.max(res.totalValid, 1);
    const cv: Record<string, number> = {};
    const partyVotes: Record<string, number> = {};
    for (const c of candidates) {
      cv[c.id] = Math.round(res.national[c.id] ?? 0);
      partyVotes[c.partyId] = (partyVotes[c.partyId] ?? 0) + cv[c.id];
      partyTotals[c.partyId] = (partyTotals[c.partyId] ?? 0) + cv[c.id];
      result.names[c.id] = fullName(s.characters[c.id]);
    }
    totalVoters += res.totalVoters;
    const ranking = Object.entries(cv).sort((a, b) => b[1] - a[1]);
    const topPct = ranking[0] ? (ranking[0][1] / tot) * 100 : 0;
    const elected = isRunoff || topPct > s.rules.governorThreshold ? [ranking[0][0]] : [];
    result.units.push({ unitId: r.id, name: r.name, regionId: r.id, seats: 1, partyVotes, listVotes: {}, candidateVotes: cv, elected, electedParty: elected.length ? { [s.characters[elected[0]].partyId ?? 'IND']: 1 } : {}, blankNull: Math.round(res.blankByRegion[r.id] ?? 0), turnout: Math.round(res.totalVoters) });
    if (elected.length) installGovernor(s, r.id, elected[0]);
    // depurar perdedores generados
    if (!isRunoff) { /* se conservan para posible segunda vuelta */ } else for (const c of candidates) if (c.id !== elected[0]) cleanupGenerated(s, c.id);
  }
  if (pc && player) {
    const won = playerLocalRace(s, rng, player, 'gobernador', result);
    if (won) installGovernor(s, player.regionId, player.id);
    result.units.push({ unitId: player.regionId, name: REGION_BY_ID[player.regionId].name, regionId: player.regionId, seats: 1, partyVotes: {}, listVotes: {}, candidateVotes: { [player.id]: result.playerOutcome?.votes ?? 0 }, elected: won ? [player.id] : [], electedParty: won ? { [player.partyId ?? 'IND']: 1 } : {}, blankNull: 0, turnout: 0 });
  }
  for (const u of result.units) for (const [p, n] of Object.entries(u.electedParty)) result.seatsByParty[p] = (result.seatsByParty[p] ?? 0) + n;
  finalizeNational(result, partyTotals, totalVoters, electorateTotal(s));
  if (!isRunoff && !result.units.some((u) => u.elected.length === 0)) {
    const r2 = s.calendar.find((e) => e.type === 'gobernadores_2v' && !e.done && e.week > s.week && e.week - s.week <= 6);
    if (r2) r2.done = true;
  }
  return result;
}

function cleanupGenerated(s: GameState, id: string): void {
  const c = s.characters[id];
  if (c && !c.isPlayer && c.offices.length === 0 && c.pastOffices.length === 0 && c.rep.reconocimiento < 50) delete s.characters[id];
}

function installGovernor(s: GameState, regionId: RegionId, charId: string): void {
  const reg = s.regions[regionId];
  if (reg.governorId && reg.governorId !== charId) {
    const old = s.characters[reg.governorId];
    if (old) removeOffice(s, old, 'gobernador', 'fin de período');
  }
  const c = s.characters[charId];
  if (c.offices.some((o) => o.type === 'gobernador')) removeOffice(s, c, 'gobernador', 'reelecto');
  c.offices.push({ type: 'gobernador', regionId, since: s.week, termEndWeek: s.week + 4 * 52 });
  reg.governorId = charId;
}

// ---------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------
export function runElection(s: GameState, rng: Rng, e: ScheduledElection): ElectionResult {
  switch (e.type) {
    case 'diputados': return runProportional(s, rng, e, 'camara');
    case 'senadores': return runProportional(s, rng, e, 'senado');
    case 'presidencial': case 'presidencial_2v': return runPresidential(s, rng, e);
    case 'primarias': return runPrimaries(s, rng, e);
    case 'alcaldes': return runMayors(s, rng, e);
    case 'concejales': return runCouncil(s, rng, e);
    case 'gobernadores': case 'gobernadores_2v': return runGovernors(s, rng, e);
  }
}

/** Ejecuta todas las elecciones programadas para la semana actual. */
export function processElections(s: GameState, rng: Rng): string[] {
  const ids: string[] = [];
  const due = s.calendar.filter((e) => !e.done && e.week === s.week);
  // orden: primero proporcionales (para que la composición del Congreso esté disponible)
  const order: ElectionType[] = ['primarias', 'diputados', 'senadores', 'presidencial', 'presidencial_2v', 'alcaldes', 'concejales', 'gobernadores', 'gobernadores_2v'];
  due.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  for (const e of due) {
    const r = runElection(s, rng, e);
    e.done = true;
    s.results.push(r);
    ids.push(r.id);
    log(s, `Elección ${e.type} realizada (${r.id}).`);
    if (e.type === 'diputados') {
      const top = Object.entries(r.seatsByParty).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, n]) => `${s.parties[p]?.short ?? p} ${n}`).join(', ');
      addHistory(s, 'eleccion', 'Elección de Diputadas y Diputados', `Nueva Cámara: ${top}…`, 4);
    }
    if (e.type === 'senadores') addHistory(s, 'eleccion', 'Renovación parcial del Senado', `${r.units.length} circunscripciones renovadas.`, 3);
    if (e.type === 'alcaldes') addHistory(s, 'eleccion', 'Elecciones municipales', `Mayor número de alcaldías: ${Object.entries(r.seatsByParty).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'}.`, 3);
    if (r.playerOutcome?.ran) {
      addHistory(s, 'jugador', r.playerOutcome.won ? `Victoria electoral: ${ELECTION_LABELS[e.type]}` : `Derrota electoral: ${ELECTION_LABELS[e.type]}`, r.playerOutcome.pct !== undefined ? `Obtuviste ${r.playerOutcome.pct.toFixed(1)}%.` : '', 5);
    }
  }
  // limpiar candidaturas del jugador ya resueltas y campaña
  if (due.length) {
    const doneIds = new Set(due.map((e) => e.id));
    const hadCampaign = s.player.campaign && doneIds.has(s.player.campaign.electionId);
    s.player.candidacies = s.player.candidacies.filter((c) => !doneIds.has(c.electionId) && !(c.electionId === 'presidencial' && due.some((e) => e.type === 'presidencial_2v' || (e.type === 'presidencial' && !s.results[s.results.length - 1]?.runoffNeeded))));
    if (hadCampaign) s.player.campaign = null;
    // tras la elección general se reinician candidaturas presidenciales
    if (due.some((e) => e.type === 'presidencial_2v' || e.type === 'presidencial') && s.government.electId) s.presidentialCandidates = {};
  }
  return ids;
}

export function electionDateLabel(e: ScheduledElection): string { return `${ELECTION_LABELS[e.type]} — ${e.date}`; }

export function weeksUntil(s: GameState, e: ScheduledElection): number { return e.week - s.week; }

export function currentDateISO(s: GameState): string { return currentISO(s); }

export function seatsHeldBy(s: GameState, chamber: Seat['chamber']): Record<string, number> {
  const out: Record<string, number> = {};
  for (const st of s.seats) {
    if (st.chamber !== chamber) continue;
    const p = st.holderId ? s.characters[st.holderId]?.partyId ?? 'IND' : 'VAC';
    out[p] = (out[p] ?? 0) + 1;
  }
  return out;
}

export { weekToISO };
