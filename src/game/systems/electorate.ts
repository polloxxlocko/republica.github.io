/**
 * ELECTORADO TERRITORIAL Y FUNCIÓN DE UTILIDAD ELECTORAL.
 *
 * El electorado se representa con segmentos por comuna (346 comunas × 4 tramos etarios).
 * La decisión de voto sigue un logit multinomial con opción blanco/nulo:
 *
 *   U(s, j) = −βI·1,6·dist(ideología_s, ideología_j)                    1. preferencias ideológicas
 *           + afinidad_s,partido                                          2. identificación partidaria
 *           + βCand·(calidad−50)/50   (elecciones personales)            3. evaluación del candidato
 *           + βGob·evalGob·(0,5+sensEcon)·sensNacional − fatiga          4–5. gobierno y economía
 *           − 0,3·(malestar_comuna−40)/40·sensLocal (oficialismo)        6. problemas locales
 *           + βCamp·√(gasto regional) + 0,5·βTerr·√(MM$ por 1.000 electores)·sensCampaña   7. campaña
 *           + βTerr·(organización local − 0,3)
 *           + βPop, βRej, βCred (popularidad, rechazo, credibilidad)     9. acontecimientos
 *           + shock(opción, región) + shock(opción, comuna)              10. variación estocástica
 *   Participación (8): base comunal estimada × factor etario.
 *
 * Ver SIMULATION_RULES.md §2 y TERRITORY.md.
 */
import type { GameState, Ideology, PolicyArea, RegionId, Segment } from '../models/types';
import { DIMS, VOTE, clamp } from '../rules/params';
import { dimWeightsFromPriorities, ideoDistance, zeroIdeology } from './util';
import { TERRITORY_COEF } from '../territory/model';

export interface VoteOption {
  key: string;
  partyId: string;
  ideology: Ideology;
  quality?: number;
  qualityByRegion?: Partial<Record<RegionId, number>>;
  viability?: number;
  extra?: number;
  regions?: RegionId[];
  comunas?: Set<number>;
  /** Partidos del sector de la candidatura: la identificación se mide con el sector (log-sum-exp) */
  affinityParties?: string[];
}

export interface ShareResult {
  byRegion: Record<string, Record<string, number>>;
  byComuna: Record<string, Record<string, number>>;
  blankByRegion: Record<string, number>;
  turnoutByRegion: Record<string, number>;
  blankByComuna: Record<string, number>;
  turnoutByComuna: Record<string, number>;
  national: Record<string, number>;
  totalValid: number;
  totalVoters: number;
}

export interface UtilityContext {
  govParties: Set<string>;
  oppositionParties: Set<string>;
  govEval: number;
  shocks?: Record<string, number>;
  comunaShocks?: Record<string, number>;
  campaign?: Record<string, Partial<Record<RegionId, number>>>;
  personal: boolean;
  turnoutBase: number;
  presidentParty: string | null;
  incumbencyFatigue: number;
}

export function buildUtilityContext(s: GameState, personal: boolean, turnoutBase?: number): UtilityContext {
  const gov = new Set<string>();
  const opp = new Set<string>();
  const govCoal = s.government.coalitionId ? s.coalitions[s.government.coalitionId] : null;
  const presParty = s.characters[s.government.presidentId]?.partyId;
  if (govCoal) govCoal.members.forEach((m) => gov.add(m));
  if (presParty) gov.add(presParty);
  for (const p of Object.values(s.parties)) if (p.active && !gov.has(p.id)) opp.add(p.id);
  const approval = s.opinion.governmentApproval;
  const yearsInPower = Math.max(0, (s.week - s.government.startWeek) / 52) + (s.government.coalitionTerms ?? 0) * 4;
  return {
    presidentParty: presParty ?? null, incumbencyFatigue: clamp(0.04 * yearsInPower, 0, 0.5),
    govParties: gov, oppositionParties: opp, govEval: clamp((approval - 42) / 35, -1.2, 1.2),
    personal, turnoutBase: turnoutBase ?? (s.rules.compulsoryVoting ? 1 : 0.6), campaign: s.campaignSpend,
  };
}

let wCache: { key: string; map: Map<number, Record<string, number>> } | null = null;
function comunaWeights(s: GameState, cut: number): Record<string, number> {
  const key = `${s.id}|${s.week}|${s.segments.length}`;
  if (!wCache || wCache.key !== key) wCache = { key, map: new Map() };
  let w = wCache.map.get(cut);
  if (!w) {
    const pr: Partial<Record<PolicyArea, number>> = { ...(s.comunas?.[cut]?.priorities ?? {}) };
    for (const [a, v] of Object.entries(s.opinion.priorities) as [PolicyArea, number][]) pr[a] = (pr[a] ?? 0) + v * 1.5;
    w = dimWeightsFromPriorities(pr);
    wCache.map.set(cut, w);
  }
  return w;
}
export function segmentWeights(s: GameState, seg: Segment): Record<string, number> { return comunaWeights(s, seg.cut); }

let elCache: { key: string; map: Map<number, number> } | null = null;
export function comunaElectors(s: GameState, cut: number): number {
  const key = `${s.id}|${s.segments.length}|${s.segments[0]?.voters ?? 0}`;
  if (!elCache || elCache.key !== key) {
    elCache = { key, map: new Map() };
    for (const seg of s.segments) elCache.map.set(seg.cut, (elCache.map.get(seg.cut) ?? 0) + seg.voters);
  }
  return elCache.map.get(cut) ?? 0;
}

/** Componentes de la utilidad (orden fijo; se usan en las explicaciones territoriales). */
export const UTILITY_COMPONENTS = ['Posición ideológica', 'Identificación partidaria', 'Imagen del partido', 'Evaluación del gobierno', 'Problemas locales', 'Campaña', 'Organización local', 'Candidatura'] as const;

export function utilityParts(s: GameState, seg: Segment, opt: VoteOption, ctx: UtilityContext, weights: Record<string, number>): number[] {
  const party = s.parties[opt.partyId];
  const com = s.comunas?.[seg.cut];
  const parts = [0, 0, 0, 0, 0, 0, 0, 0];
  parts[0] = -VOTE.betaIdeology * ideoDistance(seg.ideology, opt.ideology, weights) * 1.6;
  if (opt.affinityParties && opt.affinityParties.length > 1) {
    // identificación con el sector de la candidatura (no solo con su partido)
    let m = -Infinity; for (const p of opt.affinityParties) m = Math.max(m, seg.partisanship[p] ?? -1.5);
    let acc = 0; for (const p of opt.affinityParties) acc += Math.exp((seg.partisanship[p] ?? -1.5) - m);
    parts[1] = m + Math.log(acc);
  } else parts[1] = seg.partisanship[opt.partyId] ?? -1.5;
  if (ctx.personal) parts[1] *= VOTE.affinityPersonal;
  if (party) parts[2] = VOTE.betaPopularity * (party.popularity - 50) / 50 - VOTE.betaRejection * (party.rejection / 100 - 0.3) + VOTE.betaCredibility * (party.credibility - 50) / 50;
  const nat = com?.sens.national ?? 1;
  if (ctx.govParties.has(opt.partyId)) {
    parts[3] = VOTE.betaGovernment * ctx.govEval * (0.5 + seg.econSensitivity) * nat - (opt.partyId === ctx.presidentParty ? ctx.incumbencyFatigue : ctx.incumbencyFatigue * 0.4);
    if (com) parts[4] = -0.3 * ((com.discontent - 40) / 40) * com.sens.local;
  } else if (ctx.oppositionParties.has(opt.partyId)) {
    parts[3] = -VOTE.betaGovernment * 0.25 * ctx.govEval * (0.5 + seg.econSensitivity) * nat;
  }
  const spend = ctx.campaign?.[opt.key]?.[seg.regionId] ?? 0;
  if (spend > 0) parts[5] += VOTE.betaCampaign * Math.sqrt(spend);
  if (com) {
    const local = com.campaign[opt.key] ?? 0;
    if (local > 0) parts[5] += VOTE.betaTerritorial * 0.5 * Math.sqrt(local / Math.max(1, comunaElectors(s, seg.cut) / 1000)) * com.sens.campaign * (1 - seg.loyalty * 0.5);
    parts[6] = VOTE.betaTerritorial * ((com.org[opt.partyId] ?? 0.3) - 0.3);
  } else if (party) parts[6] = VOTE.betaTerritorial * ((party.territorial[seg.regionId] ?? 0.3) - 0.4);
  if (ctx.personal) {
    const q = opt.qualityByRegion?.[seg.regionId] ?? opt.quality ?? 50;
    parts[7] = VOTE.betaCandidate * (q - 50) / 50;
  } else if (opt.qualityByRegion?.[seg.regionId] !== undefined) {
    parts[7] = 0.4 * ((opt.qualityByRegion[seg.regionId] ?? 50) - 50) / 50;
  }
  if (opt.viability !== undefined) parts[7] += VOTE.betaViability * Math.log(Math.max(0.02, opt.viability) / 0.2);
  if (opt.extra) parts[2] += opt.extra;
  if (ctx.personal) for (let i = 0; i < parts.length; i++) parts[i] *= VOTE.personalScale;
  return parts;
}

/** Camino rápido (sin asignaciones): equivalente a sumar utilityParts. */
export function utility(s: GameState, seg: Segment, opt: VoteOption, ctx: UtilityContext, weights: Record<string, number>): number {
  const wa = weightArray(weights);
  const oi = opt.ideology; const si = seg.ideology;
  let sq = 0; let ws = 0;
  for (let i = 0; i < 8; i++) { const d = DIMS[i]; const diff = (si[d] - oi[d]) / 100; sq += wa[i] * diff * diff; ws += wa[i]; }
  let u = -VOTE.betaIdeology * Math.sqrt(sq / ws) * 1.6;
  let aff: number;
  if (opt.affinityParties && opt.affinityParties.length > 1) {
    let m = -Infinity; for (const p of opt.affinityParties) { const v = seg.partisanship[p] ?? -1.5; if (v > m) m = v; }
    let acc = 0; for (const p of opt.affinityParties) acc += Math.exp((seg.partisanship[p] ?? -1.5) - m);
    aff = m + Math.log(acc);
  } else aff = seg.partisanship[opt.partyId] ?? -1.5;
  u += ctx.personal ? aff * VOTE.affinityPersonal : aff;
  const party = s.parties[opt.partyId];
  const com = s.comunas?.[seg.cut];
  if (party) u += VOTE.betaPopularity * (party.popularity - 50) / 50 - VOTE.betaRejection * (party.rejection / 100 - 0.3) + VOTE.betaCredibility * (party.credibility - 50) / 50;
  const nat = com ? com.sens.national : 1;
  if (ctx.govParties.has(opt.partyId)) {
    u += VOTE.betaGovernment * ctx.govEval * (0.5 + seg.econSensitivity) * nat - (opt.partyId === ctx.presidentParty ? ctx.incumbencyFatigue : ctx.incumbencyFatigue * 0.4);
    if (com) u -= 0.3 * ((com.discontent - 40) / 40) * com.sens.local;
  } else if (ctx.oppositionParties.has(opt.partyId)) u -= VOTE.betaGovernment * 0.25 * ctx.govEval * (0.5 + seg.econSensitivity) * nat;
  const spend = ctx.campaign?.[opt.key]?.[seg.regionId];
  if (spend) u += VOTE.betaCampaign * Math.sqrt(spend);
  if (com) {
    const local = com.campaign[opt.key];
    if (local) u += VOTE.betaTerritorial * 0.5 * Math.sqrt(local / Math.max(1, comunaElectors(s, seg.cut) / 1000)) * com.sens.campaign * (1 - seg.loyalty * 0.5);
    u += VOTE.betaTerritorial * ((com.org[opt.partyId] ?? 0.3) - 0.3);
  } else if (party) u += VOTE.betaTerritorial * ((party.territorial[seg.regionId] ?? 0.3) - 0.4);
  if (ctx.personal) {
    const q = opt.qualityByRegion?.[seg.regionId] ?? opt.quality ?? 50;
    u += VOTE.betaCandidate * (q - 50) / 50;
  } else if (opt.qualityByRegion) { const q = opt.qualityByRegion[seg.regionId]; if (q !== undefined) u += 0.4 * (q - 50) / 50; }
  if (opt.viability !== undefined) u += VOTE.betaViability * Math.log(Math.max(0.02, opt.viability) / 0.2);
  if (opt.extra) u += opt.extra;
  if (ctx.personal) u *= VOTE.personalScale;
  if (ctx.shocks) { const sh = ctx.shocks[`${opt.key}|${seg.regionId}`]; if (sh) u += sh; }
  if (ctx.comunaShocks) { const cs = ctx.comunaShocks[`${opt.key}|${seg.cut}`]; if (cs) u += cs; }
  return u;
}

const waCache = new WeakMap<Record<string, number>, Float64Array>();
function weightArray(w: Record<string, number>): Float64Array {
  let a = waCache.get(w);
  if (!a) { a = new Float64Array(8); for (let i = 0; i < 8; i++) a[i] = w[DIMS[i]] ?? 1; waCache.set(w, a); }
  return a;
}

const AGE_FACTOR_INDEX = (seg: Segment) => Number(seg.id.split('-')[1] ?? 1);
export function turnoutOf(s: GameState, seg: Segment, ctx: UtilityContext): number {
  const base = s.comunas?.[seg.cut]?.baseTurnout ?? VOTE.baseTurnout;
  const ageF = TERRITORY_COEF.turnoutAge[AGE_FACTOR_INDEX(seg)] ?? 1;
  if (ctx.turnoutBase < 0.5) return clamp(ctx.turnoutBase * (0.6 + seg.interest) * ageF, 0.01, 0.9);
  return clamp(base * ageF * ctx.turnoutBase, 0.05, 0.98);
}

export function computeShares(s: GameState, options: VoteOption[], ctx: UtilityContext, regionFilter?: RegionId[], comunaFilter?: Set<number>): ShareResult {
  const byRegion: Record<string, Record<string, number>> = {}; const byComuna: Record<string, Record<string, number>> = {};
  const blankByRegion: Record<string, number> = {}; const turnoutByRegion: Record<string, number> = {};
  const blankByComuna: Record<string, number> = {}; const turnoutByComuna: Record<string, number> = {};
  const national: Record<string, number> = {};
  let totalValid = 0; let totalVoters = 0;
  const filter = regionFilter ? new Set(regionFilter) : null;
  for (const seg of s.segments) {
    if (filter && !filter.has(seg.regionId)) continue;
    if (comunaFilter && !comunaFilter.has(seg.cut)) continue;
    const opts = options.filter((o) => (!o.regions || o.regions.includes(seg.regionId)) && (!o.comunas || o.comunas.has(seg.cut)));
    if (opts.length === 0) continue;
    const w = segmentWeights(s, seg);
    const utils = opts.map((o) => utility(s, seg, o, ctx, w));
    const maxU = Math.max(...utils, VOTE.blankUtility);
    const exps = utils.map((u) => Math.exp(u - maxU));
    const blankExp = Math.exp(VOTE.blankUtility - maxU);
    const denom = exps.reduce((a, b) => a + b, 0) + blankExp;
    const voters = seg.voters * turnoutOf(s, seg, ctx);
    const reg = (byRegion[seg.regionId] ??= {}); const com = (byComuna[seg.cut] ??= {});
    for (let i = 0; i < opts.length; i++) {
      const v = voters * exps[i] / denom;
      reg[opts[i].key] = (reg[opts[i].key] ?? 0) + v;
      com[opts[i].key] = (com[opts[i].key] ?? 0) + v;
      national[opts[i].key] = (national[opts[i].key] ?? 0) + v;
      totalValid += v;
    }
    const bl = voters * blankExp / denom;
    blankByRegion[seg.regionId] = (blankByRegion[seg.regionId] ?? 0) + bl;
    blankByComuna[seg.cut] = (blankByComuna[seg.cut] ?? 0) + bl;
    turnoutByRegion[seg.regionId] = (turnoutByRegion[seg.regionId] ?? 0) + voters;
    turnoutByComuna[seg.cut] = (turnoutByComuna[seg.cut] ?? 0) + voters;
    totalVoters += voters;
  }
  return { byRegion, byComuna, blankByRegion, turnoutByRegion, blankByComuna, turnoutByComuna, national, totalValid, totalVoters };
}

export function partyOptions(s: GameState): VoteOption[] {
  return Object.values(s.parties).filter((p) => p.active && p.legalStatus !== 'en_formacion').map((p) => ({ key: p.id, partyId: p.id, ideology: p.ideology }));
}

/**
 * Calibración de afinidades partidarias por comuna: intercepto (log-odds) por partido y comuna
 * ajustado para reproducir los objetivos; luego se contrae hacia la media regional (`shrink`).
 * Devuelve el error absoluto medio comunal (pp por partido, ponderado por electores).
 */
export function calibratePartisanship(s: GameState, targets: Map<number, Record<string, number>>, iterations = 25, shrink = 1): number {
  const ctx = buildUtilityContext(s, false);
  ctx.govEval = 0; ctx.incumbencyFatigue = 0;
  const opts = partyOptions(s);
  for (const seg of s.segments) for (const o of opts) seg.partisanship[o.partyId] = 0;
  const segsByCut = new Map<number, Segment[]>();
  for (const seg of s.segments) { const a = segsByCut.get(seg.cut) ?? []; a.push(seg); segsByCut.set(seg.cut, a); }
  let res = computeShares(s, opts, ctx);
  for (let it = 0; it < iterations; it++) {
    for (const [cut, segs] of segsByCut) {
      const votes = res.byComuna[cut]; const t = targets.get(cut);
      if (!votes || !t) continue;
      const tot = Object.values(votes).reduce((a, b) => a + b, 0) || 1;
      for (const o of opts) {
        const adj = Math.log(Math.max(t[o.key] ?? 0.002, 1e-4) / Math.max((votes[o.key] ?? 0) / tot, 1e-4)) * 0.85;
        for (const seg of segs) seg.partisanship[o.partyId] = clamp((seg.partisanship[o.partyId] ?? 0) + adj, -8, 8);
      }
    }
    res = computeShares(s, opts, ctx);
  }
  if (shrink < 1) {
    const regMean: Record<string, Record<string, number>> = {}; const regW: Record<string, number> = {};
    for (const seg of s.segments) {
      const m = (regMean[seg.regionId] ??= {}); regW[seg.regionId] = (regW[seg.regionId] ?? 0) + seg.voters;
      for (const o of opts) m[o.partyId] = (m[o.partyId] ?? 0) + (seg.partisanship[o.partyId] ?? 0) * seg.voters;
    }
    for (const seg of s.segments) for (const o of opts) {
      const mean = regMean[seg.regionId][o.partyId] / regW[seg.regionId];
      seg.partisanship[o.partyId] = mean + shrink * ((seg.partisanship[o.partyId] ?? 0) - mean);
    }
    res = computeShares(s, opts, ctx);
  }
  let err = 0; let w = 0;
  for (const [cut, votes] of Object.entries(res.byComuna)) {
    const t = targets.get(Number(cut)); if (!t) continue;
    const tot = Object.values(votes).reduce((a, b) => a + b, 0) || 1;
    const e = comunaElectors(s, Number(cut));
    for (const o of opts) err += Math.abs((votes[o.key] ?? 0) / tot - (t[o.key] ?? 0)) * 100 * e / opts.length;
    w += e;
  }
  return w ? err / w : 0;
}

export function updateIntention(s: GameState): void {
  const ctx = buildUtilityContext(s, false);
  const res = computeShares(s, partyOptions(s), ctx);
  const nat: Record<string, number> = {};
  for (const [k, v] of Object.entries(res.national)) nat[k] = (v / Math.max(res.totalValid, 1)) * 100;
  s.nationalIntention = nat;
  for (const [reg, votes] of Object.entries(res.byRegion)) {
    const tot = Object.values(votes).reduce((a, b) => a + b, 0);
    const sup: Record<string, number> = {};
    for (const [k, v] of Object.entries(votes)) sup[k] = v / Math.max(tot, 1);
    s.regions[reg as RegionId].partySupport = sup;
  }
}

export function voterProfiles(s: GameState): Record<string, Ideology> {
  const ctx = buildUtilityContext(s, false);
  const opts = partyOptions(s);
  const sums: Record<string, Ideology> = {}; const w: Record<string, number> = {};
  for (const seg of s.segments) {
    const ws = segmentWeights(s, seg);
    const utils = opts.map((o) => utility(s, seg, o, ctx, ws));
    const maxU = Math.max(...utils);
    const ex = utils.map((u) => Math.exp(u - maxU));
    const den = ex.reduce((a, b) => a + b, 0);
    opts.forEach((o, i) => {
      const v = seg.voters * ex[i] / den;
      const acc = (sums[o.key] ??= zeroIdeology());
      for (const d of DIMS) acc[d] += seg.ideology[d] * v;
      w[o.key] = (w[o.key] ?? 0) + v;
    });
  }
  for (const k of Object.keys(sums)) for (const d of DIMS) sums[k][d] /= Math.max(w[k], 1);
  return sums;
}

export function electorateCenter(s: GameState): Ideology {
  const r = zeroIdeology(); let t = 0;
  for (const seg of s.segments) { for (const d of DIMS) r[d] += seg.ideology[d] * seg.voters; t += seg.voters; }
  for (const d of DIMS) r[d] /= Math.max(t, 1);
  return r;
}
