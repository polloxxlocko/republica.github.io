/**
 * PROCESOS DE NOMINACIÓN (selección de candidaturas).
 *
 * Etapas: el personaje ASPIRA → puede ser PROPUESTO (preselección) → NOMINADO por su partido
 * (o descartado) → se INSCRIBE y COMPITE → resulta ELECTO o no (motor electoral territorial).
 * Compiten aspirantes controlados por IA (incumbentes, figuras ambiciosas, nuevos rostros).
 * Nada está garantizado: el pacto puede ceder el cupo a otro partido, una figura nacional puede
 * irrumpir y el resultado tiene incertidumbre.
 */
import type { Aspirant, Character, ElectionType, GameState, NominationProcess, OfficeType, RegionId } from '../models/types';
import { Rng } from '../engine/rng';
import { DIFFICULTY, clamp } from '../rules/params';
import { COMUNA_BY_CUT, comunasOfRegion } from '../territory/data';
import { CIRCUMSCRIPTIONS, DISTRICTS, REGION_BY_ID } from '../data/geography';
import { ELECTION_LABELS, REGISTRATION_WEEKS, canRunAgain, listIdOf } from '../systems/elections';
import { ageOf, candidateQuality, createCharacter, fullName, memoryBalance, remember } from '../systems/characters';
import { newId } from '../systems/util';
import { addNews } from '../systems/news';
import { bio, factionSupportOf, homeCut, me, partyInfluenceOf, progress, territorialIn, unitComunas, first } from './capital';

export const NOMINATED: Partial<Record<ElectionType, OfficeType>> = {
  concejales: 'concejal', alcaldes: 'alcalde', gobernadores: 'gobernador', diputados: 'diputado', senadores: 'senador', presidencial: 'presidente',
};
export const OPEN_WEEKS = 56;      // apertura antes de la elección
export const SHORTLIST_WEEKS = 30; // preselección
export const STATUS_LABEL: Record<Aspirant['status'], string> = { aspirante: 'Aspirante', propuesto: 'Propuesto/a (preselección)', nominado: 'Nominado/a', descartado: 'Descartado/a', retirado: 'Retirado/a' };

export function minAgeFor(office: OfficeType): number { return office === 'senador' || office === 'presidente' ? 35 : office === 'diputado' ? 21 : 18; }

export function unitLabel(office: OfficeType, unitId: string): string {
  if (office === 'diputado') return `Distrito ${unitId}`;
  if (office === 'senador') return `Circunscripción ${REGION_BY_ID[unitId as RegionId]?.shortName ?? unitId}`;
  if (office === 'gobernador') return unitId === 'RM' ? 'Región Metropolitana' : `Región de ${REGION_BY_ID[unitId as RegionId]?.name ?? unitId}`;
  if (office === 'presidente') return 'Chile';
  return COMUNA_BY_CUT[Number(unitId)]?.name ?? unitId;
}

/** Unidades donde el personaje puede postular (residencia en la región / comuna). */
export function eligibleUnits(s: GameState, office: OfficeType): { id: string; label: string }[] {
  const c = me(s);
  if (office === 'diputado') return DISTRICTS.filter((d) => d.regionId === c.regionId).map((d) => ({ id: String(d.id), label: `Distrito ${d.id} (${d.seats} escaños)` }));
  if (office === 'senador' || office === 'gobernador') return [{ id: c.regionId, label: unitLabel(office, c.regionId) }];
  if (office === 'presidente') return [{ id: 'nacional', label: 'Chile' }];
  const h = homeCut(s);
  return [{ id: String(h), label: COMUNA_BY_CUT[h].name }];
}

function slotsFor(s: GameState, office: OfficeType, unitId: string, partyId: string): number {
  if (office === 'alcalde' || office === 'gobernador' || office === 'presidente') return 1;
  if (office === 'concejal') return 2;
  const seats = office === 'diputado' ? DISTRICTS.find((d) => d.id === Number(unitId))?.seats ?? 3 : CIRCUMSCRIPTIONS.find((c) => c.regionId === unitId)?.seats ?? 2;
  const list = listIdOf(s, partyId);
  const members = s.coalitions[list]?.members ?? [partyId];
  const sup = (p: string) => s.nationalIntention[p] ?? 1;
  const share = sup(partyId) / members.reduce((a, p) => a + sup(p), 0);
  return clamp(Math.round((seats + 1) * share + 0.4), 1, seats);
}

export function electionWindow(s: GameState, electionId: string) {
  const e = s.calendar.find((x) => x.id === electionId);
  if (!e) return null;
  return { e, open: e.week - OPEN_WEEKS, shortlist: e.week - SHORTLIST_WEEKS, decision: e.week - REGISTRATION_WEEKS - 2 };
}

/** Puntaje interno (oculto al jugador): combina capital territorial, influencia, facciones, imagen. */
export function aspirantBase(s: GameState, c: Character, p: NominationProcess): number {
  const cuts = unitComunas(p.office, p.unitId);
  // Para la IA, el arraigo se infiere de su trayectoria: quien ejerce o ejerció cargos en el territorio tiene raíces
  const ROOTS: Partial<Record<OfficeType, number>> = { diputado: 55, senador: 55, alcalde: 58, gobernador: 50, concejal: 38, dirigente_territorial: 28, seremi: 25 };
  const roots = Math.max(0, ...c.offices.map((o) => ROOTS[o.type] ?? 0), ...c.pastOffices.map((o) => (ROOTS[o.type] ?? 0) * 0.7));
  const local = p.office === 'presidente' ? c.rep.reconocimiento : c.isPlayer ? Math.max(territorialIn(s, cuts), (c.rep.reconocimientoRegional[c.regionId] ?? c.rep.reconocimiento * 0.6) * 0.8) : clamp(Math.max((c.rep.reconocimientoRegional[c.regionId] ?? c.rep.reconocimiento * 0.6) * 0.8, roots), 0, 100);
  const infl = partyInfluenceOf(s, c); const fac = factionSupportOf(s, c);
  const rejection = c.isPlayer ? s.career.capital.rejection : 15;
  const incumbent = c.offices.some((o) => o.type === p.office && (o.districtId === undefined || String(o.districtId) === p.unitId)) ? 18 : 0;
  const wInfl = p.method === 'directiva' ? 0.34 : 0.18; const wFac = p.method === 'consulta_interna' ? 0.2 : 0.1;
  const recog = p.office === 'presidente' || p.office === 'senador' ? c.rep.reconocimiento : (c.rep.reconocimientoRegional[c.regionId] ?? c.rep.reconocimiento * 0.5);
  return local * 0.26 + infl * wInfl + fac * wFac + recog * 0.12 + c.rep.popularidad * 0.1 - rejection * 0.08 + c.attrs.experiencia * 0.06 + incumbent;
}

export function aspirantScore(s: GameState, p: NominationProcess, a: Aspirant): number {
  const c = s.characters[a.charId];
  if (!c || c.status !== 'activo') return -999;
  let backers = 0;
  for (const b of a.backers) { const bc = s.characters[b]; if (bc) backers += 3 + partyInfluenceOf(s, bc) / 12; }
  return aspirantBase(s, c, p) + backers + a.noise;
}

function addAspirant(s: GameState, rng: Rng, p: NominationProcess, charId: string): void {
  if (p.aspirants.some((a) => a.charId === charId)) return;
  const k = DIFFICULTY[s.settings.difficulty].pollNoise;
  p.aspirants.push({ charId, backers: [], status: 'aspirante', base: 0, noise: rng.normal(0, 7 * k), joinedWeek: s.week });
}

/** Crea (o devuelve) el proceso de un partido para una elección y territorio, con aspirantes de IA. */
export function ensureProcess(s: GameState, rng: Rng, electionId: string, office: OfficeType, unitId: string, partyId: string): NominationProcess | null {
  const w = electionWindow(s, electionId);
  if (!w) return null;
  const existing = s.career.processes.find((x) => x.electionId === electionId && x.unitId === unitId && x.partyId === partyId && x.office === office);
  if (existing) return existing;
  const party = s.parties[partyId];
  const method: NominationProcess['method'] = office === 'presidente' ? 'consulta_interna' : party.discipline > 66 ? 'directiva' : rng.chance(0.5) ? 'consulta_interna' : 'directiva';
  const p: NominationProcess = {
    id: newId(s, 'np'), electionId, electionType: w.e.type, office, unitId, unitLabel: unitLabel(office, unitId), partyId, method,
    openWeek: Math.max(s.week, w.open), shortlistWeek: w.shortlist, decisionWeek: w.decision, slots: slotsFor(s, office, unitId, partyId),
    aspirants: [], status: s.week >= w.shortlist ? 'preseleccion' : 'abierto', log: [`S${s.week}: ${party.short} abre la selección de candidaturas (${method === 'directiva' ? 'decide la directiva' : 'consulta a la militancia'}).`],
  };
  // Aspirantes de IA: incumbentes, figuras ambiciosas de la región y nuevos rostros
  const region: RegionId = office === 'diputado' ? DISTRICTS.find((d) => d.id === Number(unitId))!.regionId : office === 'senador' || office === 'gobernador' ? unitId as RegionId : office === 'presidente' ? me(s).regionId : COMUNA_BY_CUT[Number(unitId)].region;
  const pool = Object.values(s.characters).filter((c) => c.partyId === partyId && c.status === 'activo' && !c.isPlayer && ageOf(s, c) >= minAgeFor(office)
    && (office === 'presidente' || c.regionId === region) && !c.offices.some((o) => o.type === 'presidente' || o.type === 'ministro'));
  const incumbents = pool.filter((c) => !c.plansRetire && c.offices.some((o) => o.type === office && (office !== 'diputado' || String(o.districtId) === unitId)) && (office !== 'diputado' && office !== 'senador' ? true : canRunAgain(c, office)));
  for (const c of incumbents) addAspirant(s, rng, p, c.id);
  // Partidos grandes: más figuras compitiendo; partidos pequeños: menos competencia interna (18.10)
  const size = party.members > 40000 ? 4 : party.members > 15000 ? 3 : party.members > 5000 ? 2 : 1;
  const ambitious = pool.filter((c) => !incumbents.includes(c)).sort((a, b) => candidateQuality(b, region) - candidateQuality(a, region)).slice(0, office === 'presidente' ? size + 1 : size);
  for (const c of ambitious) if (rng.chance(party.members > 5000 ? 0.7 : 0.45)) addAspirant(s, rng, p, c.id);
  const minField = party.members > 5000 ? p.slots + 1 : p.slots;
  while (p.aspirants.length < minField) {
    const q = office === 'presidente' ? 66 : office === 'senador' ? 58 : office === 'diputado' ? 52 : 46;
    const n = createCharacter(s, rng, { partyId, regionId: region, ideology: party.ideology, quality: rng.normal(q, 8), minAge: Math.max(minAgeFor(office), 25), maxAge: 62, recognition: rng.range(10, 35) });
    if (office === 'concejal' || office === 'alcalde') n.comuna = COMUNA_BY_CUT[Number(unitId)].name;
    addAspirant(s, rng, p, n.id);
  }
  s.career.processes.push(p);
  return p;
}

/** Bloqueos legales/políticos para aspirar (null = puede aspirar). */
export function aspireBlocked(s: GameState, electionId: string, office: OfficeType, unitId: string): string | null {
  const c = me(s);
  const w = electionWindow(s, electionId);
  if (!w) return 'Elección no disponible';
  if (ageOf(s, c) + Math.floor((w.e.week - s.week) / 52) < minAgeFor(office)) return `Edad mínima: ${minAgeFor(office)} años (CPR / LOC)`;
  if (s.week < w.open) return `El proceso abre en ${w.open - s.week} semanas`;
  if (s.week >= w.shortlist) return 'La preselección ya cerró para esta elección';
  if (ageOf(s, c) < minAgeFor(office)) return `Edad mínima: ${minAgeFor(office)} años (CPR / LOC)`;
  if (!eligibleUnits(s, office).some((u) => u.id === unitId)) return 'Requisito de residencia: debes postular donde resides';
  if (!c.partyId) return office === 'alcalde' || office === 'gobernador' ? 'Como independiente debes reunir firmas (acción específica)' : 'Sin partido: necesitas un cupo de una lista (oportunidad) o afiliarte';
  if (s.parties[c.partyId]?.legalStatus === 'en_formacion') return 'Tu partido aún no está legalmente constituido';
  if (office === 'presidente' && c.offices.some((o) => o.type === 'presidente')) return 'No hay reelección presidencial inmediata';
  if ((office === 'diputado' || office === 'senador') && !canRunAgain(c, office)) return 'Alcanzaste el límite de reelección (Ley 21.238)';
  if (c.offices.some((o) => o.type === 'ministro' || o.type === 'subsecretario' || o.type === 'seremi')) return 'Inhabilidad: debes dejar tu cargo de designación antes de postular';
  const sameDay = s.calendar.filter((x) => x.week === w.e.week).map((x) => x.id);
  if (s.player.candidacies.some((k) => sameDay.includes(k.electionId))) return 'Ya eres candidato/a en una elección de esa fecha (no se puede postular a dos cargos a la vez)';
  if (s.career.processes.some((p) => sameDay.includes(p.electionId) && p.electionId !== electionId && p.aspirants.some((a) => a.charId === c.id && a.status !== 'retirado' && a.status !== 'descartado'))) return 'Ya aspiras a otro cargo en elecciones de la misma fecha';
  if (s.career.processes.some((p) => p.electionId === electionId && p.aspirants.some((a) => a.charId === c.id && a.status !== 'retirado' && a.status !== 'descartado'))) return 'Ya participas en un proceso para esta elección';
  return null;
}

export function aspire(s: GameState, rng: Rng, electionId: string, office: OfficeType, unitId: string): string {
  const c = me(s);
  const p = ensureProcess(s, rng, electionId, office, unitId, c.partyId!);
  if (!p) return 'No fue posible abrir el proceso.';
  addAspirant(s, rng, p, c.id);
  p.log.push(`S${s.week}: ${fullName(c)} manifiesta su interés.`);
  // Los rivales lo registran
  for (const a of p.aspirants) if (a.charId !== c.id) { const r = s.characters[a.charId]; if (r) remember(r, { week: s.week, aboutId: c.id, kind: 'conflicto', weight: -4, note: `Compite por ${p.unitLabel}` }); }
  bio(s, 'nominacion', `Aspiras a la candidatura a ${office} (${p.unitLabel})`, `Proceso de ${s.parties[p.partyId].short}: ${p.aspirants.length - 1} aspirantes más.`);
  return `Te inscribiste como aspirante en ${p.unitLabel}. Compiten ${p.aspirants.length - 1} figuras más; la preselección será en ${p.shortlistWeek - s.week} semanas.`;
}

/** Pedir respaldo a un dirigente para un proceso. Puede aceptar, pedir un compromiso o negarse. */
export function seekBacking(s: GameState, rng: Rng, processId: string, charId: string): string {
  const p = s.career.processes.find((x) => x.id === processId);
  const t = s.characters[charId]; const c = me(s);
  if (!p || !t) return 'No disponible.';
  const mine = p.aspirants.find((a) => a.charId === c.id);
  if (!mine) return 'No eres aspirante en ese proceso.';
  if (mine.backers.includes(charId)) return `${fullName(t)} ya te respalda.`;
  const competing = p.aspirants.find((a) => a.charId === charId && a.status !== 'retirado');
  if (competing) return `${fullName(t)} compite en el mismo proceso: no te respaldará.`;
  const rel = memoryBalance(t, c.id);
  const sameFaction = t.factionId && t.factionId === c.factionId ? 15 : 0;
  const rivals = p.aspirants.filter((a) => a.charId !== c.id).map((a) => memoryBalance(t, a.charId));
  const bestRival = rivals.length ? Math.max(...rivals) : -50;
  const x = rel + sameFaction + c.attrs.negociacion * 0.3 - bestRival * 0.6 + rng.normal(0, 12);
  if (x > 35) { mine.backers.push(charId); remember(t, { week: s.week, aboutId: c.id, kind: 'apoyo', weight: 4, note: `Respalda su aspiración en ${p.unitLabel}` }); return `${fullName(t)} te respalda públicamente.`; }
  if (x > 10) {
    mine.backers.push(charId);
    s.career.commitments.push({ id: newId(s, 'cm'), toCharId: charId, kind: 'apoyo_interno', createdWeek: s.week, dueWeek: s.week + 80, description: `Devolver el apoyo a ${fullName(t)} cuando lo necesite`, status: 'vigente' });
    bio(s, 'compromiso', `Compromiso con ${fullName(t)}`, `A cambio de su respaldo en ${p.unitLabel}.`);
    return `${fullName(t)} te respalda, pero espera que le devuelvas el favor más adelante (compromiso registrado).`;
  }
  remember(t, { week: s.week, aboutId: c.id, kind: 'conflicto', weight: -2, note: 'Pidió respaldo' });
  return `${fullName(t)} prefiere no comprometerse${bestRival > rel ? ' (tiene más cercanía con otra figura)' : ''}.`;
}

export function withdraw(s: GameState, processId: string): string {
  const p = s.career.processes.find((x) => x.id === processId);
  const a = p?.aspirants.find((x) => x.charId === s.player.characterId);
  if (!p || !a) return 'No disponible.';
  a.status = 'retirado';
  p.log.push(`S${s.week}: ${fullName(me(s))} retira su aspiración.`);
  bio(s, 'nominacion', `Retiras tu aspiración en ${p.unitLabel}`, '', 0);
  return 'Retiraste tu aspiración.';
}

/** Otorga una nominación (usado por el proceso y por oportunidades excepcionales). */
export function grantNomination(s: GameState, electionId: string, office: OfficeType, unitId: string, partyId: string): void {
  const c = me(s);
  const e = s.calendar.find((x) => x.id === electionId);
  if (!e) return;
  const targetElection = office === 'presidente' ? (s.calendar.find((x) => x.type === 'primarias' && !x.done && x.week < e.week && x.week > s.week && s.coalitions[listIdOf(s, partyId)]) ?? e) : e;
  s.player.candidacies = s.player.candidacies.filter((x) => x.electionId !== targetElection.id);
  s.player.candidacies.push({ electionId: targetElection.id, office, unitId: office === 'diputado' || office === 'senador' ? (office === 'senador' ? String(CIRCUMSCRIPTIONS.find((x) => x.regionId === unitId)?.id ?? unitId) : unitId) : unitId, partyId, approved: true });
  if (office === 'presidente' && targetElection.type === 'presidencial') s.presidentialCandidates[listIdOf(s, partyId)] = c.id;
  if (!s.player.campaign || s.player.campaign.electionId !== targetElection.id) s.player.campaign = { electionId: targetElection.id, budget: 0, spent: 0, regionFocus: { [c.regionId]: 1 }, message: null, messageSide: 1, team: 0, debates: 0, intensity: 10 };
  s.career.stats.nomWon += 1;
  progress(s);
  first(s, 'candidatura', `${ELECTION_LABELS[targetElection.type]} (${unitLabel(office, unitId)})`);
  bio(s, 'nominacion', `Nominado/a: ${ELECTION_LABELS[targetElection.type]} (${unitLabel(office, unitId)})`, partyId === 'IND' ? 'Candidatura independiente.' : `Por ${s.parties[partyId]?.short ?? partyId}.`, 1);
}

/** Nominados (personajes) de un partido para una elección y unidad (para el motor electoral). */
export function nomineesFor(s: GameState, electionId: string, unitId: string, partyId: string): string[] {
  const p = s.career.processes.find((x) => x.electionId === electionId && x.unitId === unitId && x.partyId === partyId && x.status === 'resuelto');
  return p ? p.aspirants.filter((a) => a.status === 'nominado' && !s.characters[a.charId]?.isPlayer).map((a) => a.charId) : [];
}

/** Avance semanal de los procesos (IA: respaldos; preselección; decisión; cesión de cupos). */
export function weeklyNominations(s: GameState, rng: Rng, onPlayerLost: (p: NominationProcess, reason: string) => void): void {
  const c = me(s);
  // Apertura automática de procesos en los territorios del jugador (si milita)
  if (c?.partyId && s.parties[c.partyId]?.active && s.parties[c.partyId].legalStatus !== 'en_formacion') {
    for (const e of s.calendar) {
      const office = NOMINATED[e.type]; if (!office || office === 'presidente' || e.done) continue;
      if (s.week !== e.week - OPEN_WEEKS && !(s.week > e.week - OPEN_WEEKS && s.week < e.week - SHORTLIST_WEEKS && !s.career.processes.some((p) => p.electionId === e.id))) continue;
      if (e.type === 'senadores' && !e.regions?.includes(c.regionId)) continue;
      for (const u of eligibleUnits(s, office).slice(0, office === 'diputado' ? 1 : 1)) {
        const unit = office === 'diputado' ? String(COMUNA_BY_CUT[homeCut(s)].district) : u.id;
        ensureProcess(s, rng, e.id, office, unit, c.partyId);
      }
    }
  }
  for (const p of s.career.processes) {
    if (p.status === 'resuelto' || p.status === 'cancelado') continue;
    const playerA = p.aspirants.find((a) => a.charId === s.player.characterId && a.status !== 'retirado' && a.status !== 'descartado');
    // Quien se retira respalda a su sucesor/a elegido/a (situación latente materializada)
    for (const l of s.career.latent) {
      if (l.kind !== 'retiro_parlamentario' || l.status !== 'materializada' || !l.chosenId || l.partyId !== p.partyId) continue;
      const heir = p.aspirants.find((a) => a.charId === l.chosenId && (a.status === 'aspirante' || a.status === 'propuesto'));
      if (heir && !heir.backers.includes(l.actorId) && s.characters[l.actorId]) { heir.backers.push(l.actorId); p.log.push(`S${s.week}: ${fullName(s.characters[l.actorId])}, que no repostula, respalda a ${fullName(s.characters[heir.charId])}.`); }
    }
    // IA: los dirigentes del partido respaldan a sus cercanos
    if (rng.chance(0.15)) {
      const party = s.parties[p.partyId];
      const leaders = [party.leaderId, ...party.factions.map((f) => f.leaderId)].filter((x): x is string => !!x && !!s.characters[x]);
      const l = rng.pick(leaders);
      if (l && !p.aspirants.some((a) => a.backers.includes(l)) && !p.aspirants.some((a) => a.charId === l)) {
        const lc = s.characters[l];
        const options = p.aspirants.filter((a) => a.status === 'aspirante' || a.status === 'propuesto');
        if (options.length) {
          const pick = options.map((a) => ({ a, v: memoryBalance(lc, a.charId) + (s.characters[a.charId]?.factionId === lc.factionId ? 20 : 0) + rng.normal(0, 10) })).sort((x, y) => y.v - x.v)[0];
          if (pick.v > 5) { pick.a.backers.push(l); p.log.push(`S${s.week}: ${fullName(lc)} respalda a ${fullName(s.characters[pick.a.charId])}.`); }
        }
      }
    }
    if (p.status === 'abierto' && s.week >= p.shortlistWeek) {
      const ranked = p.aspirants.filter((a) => a.status === 'aspirante').map((a) => ({ a, v: aspirantScore(s, p, a) })).sort((x, y) => y.v - x.v);
      ranked.forEach((r, i) => { r.a.status = i < p.slots + 1 ? 'propuesto' : 'descartado'; });
      p.status = 'preseleccion';
      // La negociación del pacto se juega desde ahora (oculta): solo se filtra como rumor
      const coalS = s.coalitions[listIdOf(s, p.partyId)];
      if (coalS && coalS.members.length > 1) {
        const cutsS = unitComunas(p.office, p.unitId);
        const shareS = (pid: string) => cutsS.reduce((a, cut) => a + (s.comunas[cut]?.lastShares[pid] ?? 0) * (COMUNA_BY_CUT[cut]?.electors ?? 0), 0);
        const bestS = coalS.members.filter((m) => m !== p.partyId).sort((a, b) => shareS(b) - shareS(a))[0];
        p.cedeP = clamp(0.15 + (bestS ? (shareS(bestS) - shareS(p.partyId)) / Math.max(1, shareS(bestS) + shareS(p.partyId)) : -1) * 0.6, 0.03, 0.6);
        p.cedeRoll = rng.next();
      }
      p.log.push(`S${s.week}: Preselección: ${ranked.filter((r) => r.a.status === 'propuesto').map((r) => fullName(s.characters[r.a.charId])).join(', ')}.`);
      if (playerA) {
        if (playerA.status === 'propuesto') bio(s, 'nominacion', `Quedas en la preselección (${p.unitLabel})`, '', 1);
        else { s.career.stats.nomLost += 1; bio(s, 'nominacion', `No quedas en la preselección (${p.unitLabel})`, '', -1); onPlayerLost(p, 'preseleccion'); }
      }
    }
    if (p.status === 'preseleccion' && s.week >= p.decisionWeek) {
      // ¿El pacto cede el territorio a un socio? (cupos limitados)
      const list = listIdOf(s, p.partyId);
      const coal = s.coalitions[list];
      if (coal && coal.members.length > 1 && (p.office === 'alcalde' || p.office === 'gobernador' || p.slots === 1 && p.office !== 'presidente')) {
        const cuts = unitComunas(p.office, p.unitId);
        const share = (pid: string) => cuts.reduce((a, cut) => a + (s.comunas[cut]?.lastShares[pid] ?? 0) * (COMUNA_BY_CUT[cut]?.electors ?? 0), 0);
        const mineShare = share(p.partyId); const best = coal.members.filter((m) => m !== p.partyId).sort((a, b) => share(b) - share(a))[0];
        const pCede = p.cedeP ?? clamp(0.15 + (best ? (share(best) - mineShare) / Math.max(1, share(best) + mineShare) : -1) * 0.6, 0.03, 0.6);
        if (best && (p.cedeRoll ?? rng.next()) < pCede) {
          p.status = 'cancelado'; p.outcome = `El pacto ${coal.name} asignó el cupo a ${s.parties[best].short}.`;
          p.log.push(`S${s.week}: ${p.outcome}`);
          if (playerA) { s.career.stats.nomLost += 1; bio(s, 'nominacion', `El pacto cede tu territorio (${p.unitLabel}) a ${s.parties[best].short}`, 'Decisión de las directivas de la coalición.', -1); onPlayerLost(p, 'cupo_cedido'); }
          continue;
        }
      }
      const ranked = p.aspirants.filter((a) => a.status === 'propuesto').map((a) => ({ a, v: aspirantScore(s, p, a) })).sort((x, y) => y.v - x.v);
      ranked.forEach((r, i) => { r.a.status = i < p.slots ? 'nominado' : 'descartado'; });
      p.status = 'resuelto';
      const winners = ranked.filter((r) => r.a.status === 'nominado').map((r) => r.a.charId);
      p.outcome = `Nominados: ${winners.map((w) => fullName(s.characters[w])).join(', ')}.`;
      p.log.push(`S${s.week}: ${p.outcome}`);
      if (playerA) {
        if (playerA.status === 'nominado') {
          grantNomination(s, p.electionId, p.office, p.unitId, p.partyId);
          addNews(s, rng, 'jugador', `${s.parties[p.partyId].short} nomina a ${fullName(c)} en ${p.unitLabel}`, `Se impuso en un proceso con ${p.aspirants.length} aspirantes.`, 2);
        } else {
          s.career.stats.nomLost += 1;
          bio(s, 'nominacion', `Pierdes la nominación en ${p.unitLabel}`, p.outcome, -1);
          for (const w of winners) { const wc = s.characters[w]; if (wc) { c.relations[w] = clamp((c.relations[w] ?? 0) - 6, -100, 100); remember(wc, { week: s.week, aboutId: c.id, kind: 'conflicto', weight: -5, note: 'Rival en la nominación' }); } }
          onPlayerLost(p, 'decision');
        }
      }
    }
  }
  if (s.career.processes.length > 60) s.career.processes = s.career.processes.filter((p) => s.week - p.decisionWeek < 200 || p.aspirants.some((a) => a.charId === s.player.characterId));
}

/** Candidatura independiente: reunir firmas (alcalde, gobernador). */
export function collectSignatures(s: GameState, rng: Rng, electionId: string, office: OfficeType): string {
  const c = me(s);
  const w = electionWindow(s, electionId);
  if (!w) return 'Elección no disponible.';
  const unit = eligibleUnits(s, office)[0];
  const terr = territorialIn(s, unitComunas(office, unit.id));
  const pOk = clamp(0.2 + terr / 90 + s.career.capital.organization / 200 + c.attrs.redes / 300, 0.05, 0.95);
  s.player.personalFunds -= 15;
  if (!rng.chance(pOk)) { bio(s, 'nominacion', 'No reúnes las firmas para una candidatura independiente', unit.label, -1); return 'No alcanzaste las firmas requeridas: tu red territorial y tu organización no bastaron esta vez.'; }
  grantNomination(s, electionId, office, unit.id, 'IND');
  return `Reuniste las firmas: eres candidato/a independiente en ${unit.label}.`;
}

export const _test = { comunasOfRegion };
