/**
 * Jugador automatizado para pruebas de jugabilidad. Juega como una persona activa: declara una
 * ambición, inicia proyectos, avanza sus pasos, toma acciones concretas, responde la bandeja con
 * criterio variable (semilla propia) y avanza el calendario. Registra métricas de experiencia.
 */
import type { GameState } from '../src/game/models/types';
import { advanceWeek, dispatch } from '../src/game/engine/game';
import { Rng, seedRng } from '../src/game/engine/rng';
import { INITIATIVE_BY_ID, initiativesAvailable, stepBlocked } from '../src/game/politics/initiatives';
import { newGame } from './helpers';

export interface Metrics {
  weeks: number;
  decisions: { week: number; defId: string; cat: string; tier: string; option: string }[];
  uniqueByYear: number[];
  arcsStarted: number; arcsResolved: number; arcsMultiTurn: number; arcResolutions: string[];
  initiatives: Record<string, number>;
  npcMoves: number;
  longestQuietGap: number;
  activeGapsMean: number;
  firstCandidacyWeek: number | null; firstOfficeWeek: number | null; firstDefeatWeek: number | null; decisionsAfterDefeat: number;
  offices: string[];
  maxCategoryShare: number;
  impossible: string[];
  offersTaken: number; distinctOfferTitles: number;
  extraordinary: number;
}

export function playCareer(seed: number, weeks: number, opts: { regionId?: string; comuna?: string; age?: number; partyId?: string } = {}): { s: GameState; m: Metrics } {
  let s = newGame({ regionId: (opts.regionId ?? 'BI') as never, comuna: opts.comuna ?? 'Concepción', age: opts.age ?? 24, partyId: opts.partyId ?? 'PS' }, seed);
  const r = new Rng(seedRng(seed * 31 + 7));
  const m: Metrics = { weeks, decisions: [], uniqueByYear: [], arcsStarted: 0, arcsResolved: 0, arcsMultiTurn: 0, arcResolutions: [], initiatives: {}, npcMoves: 0, longestQuietGap: 0, activeGapsMean: 0,
    firstCandidacyWeek: null, firstOfficeWeek: null, firstDefeatWeek: null, decisionsAfterDefeat: 0, offices: [], maxCategoryShare: 0, impossible: [], offersTaken: 0, distinctOfferTitles: 0, extraordinary: 0 };
  const ambitions = ['cargo_partidario', 'candidatura', 'territorio', 'congreso', 'alcaldia'] as const;
  const offerTitles = new Set<string>();
  const pid = () => s.player.characterId;
  const startOffices = s.characters[pid()].offices.length;
  for (let i = 0; i < weeks && !s.player.careerOver; i++) {
    s = advanceWeek(s).state;
    const P = s.politics!;
    if (i === 2 || (i > 0 && i % 104 === 0)) s = dispatch(s, { type: 'pol_ambicion', kind: ambitions[r.int(0, ambitions.length - 1)] }).state;
    // 1) bandeja: decide con criterio variable
    for (const e of P.events.filter((x) => x.status === 'pendiente')) {
      if (r.chance(0.12) && e.tier === 'cotidiano') continue; // a veces deja pasar lo cotidiano
      const o = e.options[r.int(0, e.options.length - 1)];
      const before = s.politics!.events.find((x) => x.id === e.id);
      // imposibles: actores inexistentes o inactivos al momento de decidir
      for (const a of before?.actors ?? []) { const c = s.characters[a]; if (!c) m.impossible.push(`${e.defId}: actor inexistente`); }
      s = dispatch(s, { type: 'pol_resolver', eventId: e.id, optionId: o.id }).state;
      m.decisions.push({ week: s.week, defId: e.defId, cat: e.cat, tier: e.tier, option: o.id });
      if (m.firstDefeatWeek !== null) m.decisionsAfterDefeat++;
    }
    // 2) proyectos: inicia uno si no hay y avanza pasos disponibles
    const live = s.politics!.initiatives.filter((x) => x.status === 'en_curso');
    if (!live.length && r.chance(0.25)) {
      const av = initiativesAvailable({ s, rng: new Rng(s.rng) }).filter((x) => x.ok);
      if (av.length) s = dispatch(s, { type: 'pol_iniciar', defId: av[r.int(0, av.length - 1)].def.id }).state;
    }
    for (const ini of s.politics!.initiatives.filter((x) => x.status === 'en_curso')) {
      const steps = INITIATIVE_BY_ID[ini.defId].steps.filter((st) => !stepBlocked({ s, rng: new Rng(s.rng) }, ini, st.id));
      if (steps.length && s.player.actionPoints > 0 && r.chance(0.7)) s = dispatch(s, { type: 'pol_paso', initiativeId: ini.id, stepId: steps[r.int(0, steps.length - 1)].id }).state;
    }
    // 3) acciones concretas
    const offers = s.politics!.offers.filter((o) => o.cost <= s.player.actionPoints && o.funds <= s.player.personalFunds);
    if (offers.length && r.chance(0.8)) { const o = offers[r.int(0, offers.length - 1)]; offerTitles.add(o.title); s = dispatch(s, { type: 'pol_oferta', offerId: o.id }).state; m.offersTaken++; }
    // 4) invitaciones de conversación: acepta a veces
    for (const inv of s.dialogue!.invitations.filter((x) => x.status === 'pendiente')) if (r.chance(0.4)) s = dispatch(s, { type: 'conv_invitacion', inviteId: inv.id, decision: r.chance(0.7) ? 'aceptar' : 'rechazar' }).state;
    const sess = s.dialogue!.sessions.find((x) => x.status === 'activa');
    if (sess) { for (let k = 0; k < 10 && s.dialogue!.sessions.find((x) => x.id === sess.id)?.status === 'activa'; k++) { const st = s.dialogue!.sessions.find((x) => x.id === sess.id)!; const ids = (st.transcript.length, ['acepta', 'interes', 'pedir', 'gracias']); const opt = ids[r.int(0, ids.length - 1)]; s = dispatch(s, { type: 'conv_responder', sessionId: sess.id, optionId: opt }).state; if (s.dialogue!.sessions.find((x) => x.id === sess.id)?.status === 'activa') { s.dialogue!.sessions.find((x) => x.id === sess.id)!.status = 'cerrada'; } } }
    // hitos de carrera
    const me = s.characters[pid()];
    if (m.firstCandidacyWeek === null && (s.player.candidacies.length || s.career.processes.some((p) => p.aspirants.some((a) => a.charId === pid())))) m.firstCandidacyWeek = s.week;
    if (m.firstOfficeWeek === null && me.offices.length > startOffices) m.firstOfficeWeek = s.week;
    if (m.firstDefeatWeek === null && (s.career.stats.lost > 0 || s.career.stats.nomLost > 0 || s.politics!.initiatives.some((x) => x.status === 'fallida'))) m.firstDefeatWeek = s.week;
  }
  const P = s.politics!;
  const years = Math.ceil(weeks / 52);
  for (let y = 0; y < years; y++) m.uniqueByYear.push(new Set(m.decisions.filter((d) => Math.floor((d.week - 1) / 52) === y).map((d) => d.defId)).size);
  m.arcsStarted = P.arcs.length; m.arcsResolved = P.arcs.filter((a) => a.status === 'resuelta').length;
  m.arcsMultiTurn = P.arcs.filter((a) => a.lastWeek - a.startWeek >= 4 || (a.status === 'resuelta' && a.history.length >= 2)).length;
  m.arcResolutions = P.arcs.filter((a) => a.resolution).map((a) => a.resolution!);
  for (const i of P.initiatives) m.initiatives[i.status] = (m.initiatives[i.status] ?? 0) + 1;
  m.npcMoves = P.feed.length;
  const sig = m.decisions.filter((d) => d.tier !== 'cotidiano').map((d) => d.week);
  let last = 1; const gaps: number[] = []; for (const w of sig) { gaps.push(w - last); last = w; }
  gaps.push(s.week - last);
  m.longestQuietGap = Math.max(0, ...gaps); m.activeGapsMean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 99;
  const byCat: Record<string, number> = {}; for (const d of m.decisions) byCat[d.cat] = (byCat[d.cat] ?? 0) + 1;
  m.maxCategoryShare = Math.max(...Object.values(byCat)) / Math.max(1, m.decisions.length);
  m.offices = s.characters[pid()].offices.map((o) => o.label ?? o.type);
  m.distinctOfferTitles = offerTitles.size;
  m.extraordinary = m.decisions.filter((d) => d.tier === 'extraordinario').length + s.crises.length;
  return { s, m };
}
