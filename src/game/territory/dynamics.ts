/**
 * DINÁMICA TERRITORIAL: evolución gradual de las preferencias comunales, campañas por
 * territorio, estimaciones (con incertidumbre) visibles para el jugador y explicaciones.
 *
 * Evolución ideológica (mensual, acotada): ningún eje de un segmento puede moverse más de
 * MAX_YEARLY_DRIFT puntos por año. Causas modeladas:
 *  - Reemplazo generacional (anual): cada tramo etario converge lentamente al tramo más joven.
 *  - Economía: desempleo regional sobre el natural desplaza 'eco' hacia mayor intervención.
 *  - Desempeño del gobierno y políticas: efecto termostático (el electorado se mueve levemente
 *    en dirección contraria a las políticas completadas por el gobierno).
 *  - Crisis de seguridad y sociales: desplazan 'seg' / prioridades en la región afectada.
 *  - Campañas: la persuasión en comunas con inversión mueve marginalmente el eje del mensaje.
 *  - Nuevos liderazgos y transformaciones partidarias actúan vía popularidad y posición de los
 *    partidos (no vía ideología del electorado).
 */
import type { ComunaState, Dim, GameState, RegionId, Segment } from '../models/types';
import { Rng } from '../engine/rng';
import { DIMS, ECON, clamp } from '../rules/params';
import { POLICY_BY_ID } from '../data/policies';
import { COMUNAS, COMUNA_BY_CUT, comunasOfDistrict, comunasOfRegion } from './data';
import { UTILITY_COMPONENTS, buildUtilityContext, comunaElectors, segmentWeights, utilityParts } from '../systems/electorate';
import { pollAverage } from '../systems/polls';
import { yearOf } from '../engine/dates';

export const MAX_YEARLY_DRIFT = 3;
const MONTHLY_CAP = MAX_YEARLY_DRIFT / 12;

/** Cambio aplicado a un segmento con tope mensual. */
function nudge(seg: Segment, d: Dim, delta: number): void {
  seg.ideology[d] = clamp(seg.ideology[d] + clamp(delta, -MONTHLY_CAP, MONTHLY_CAP), -95, 95);
}

export function monthlyTerritorialDrift(s: GameState, rng: Rng): void {
  // Termostato: dirección media de las políticas completadas en los últimos 12 meses
  const recent = s.government.policies.filter((p) => p.phase === 'completada' && s.week - p.phaseWeek < 52);
  const thermo: Partial<Record<Dim, number>> = {};
  for (const p of recent) { const def = POLICY_BY_ID[p.defId]; for (const d of DIMS) thermo[d] = (thermo[d] ?? 0) - def.position[d] * 0.004; }
  const secCrisis = new Set(s.crises.filter((c) => c.kind === 'social' || c.name.toLowerCase().includes('delit')).map((c) => c.regionId ?? 'ALL'));
  for (const seg of s.segments) {
    const reg = s.regions[seg.regionId];
    const steps: Partial<Record<Dim, number>> = {};
    steps.eco = -Math.max(0, reg.unemployment - ECON.naturalUnemployment) * 0.05 * seg.econSensitivity;
    for (const [d, v] of Object.entries(thermo)) steps[d as Dim] = (steps[d as Dim] ?? 0) + (v ?? 0);
    if (secCrisis.has('ALL') || secCrisis.has(seg.regionId)) steps.seg = (steps.seg ?? 0) + 0.15;
    // persuasión de campaña del jugador (mensaje con eje), proporcional a la inversión local
    const camp = s.player.campaign;
    const com = s.comunas[seg.cut];
    if (camp?.message && com) {
      const key = s.player.candidacies.find((c) => c.electionId === camp.electionId)?.partyId;
      const inv = key ? com.campaign[key] ?? 0 : 0;
      if (inv > 0) steps[camp.message] = (steps[camp.message] ?? 0) + camp.messageSide * Math.sqrt(inv / Math.max(1, comunaElectors(s, seg.cut) / 1000)) * 0.08 * (1 - seg.loyalty);
    }
    for (const [d, v] of Object.entries(steps)) if (v) nudge(seg, d as Dim, v + rng.normal(0, 0.02));
  }
  // Malestar comunal: sigue al regional, con problemas locales
  for (const c of COMUNAS) {
    const st = s.comunas[c.cut]; const reg = s.regions[c.region];
    st.discontent = clamp(0.9 * st.discontent + 0.1 * (reg.discontent + (c.inet < 0.4 ? 5 : 0) + (st.campaign ? 0 : 0)) + rng.normal(0, 0.8), 0, 100);
    // Decaimiento de la inversión de campaña y de la organización
    for (const k of Object.keys(st.campaign)) { st.campaign[k] *= 0.8; if (st.campaign[k] < 0.05) delete st.campaign[k]; }
    for (const k of Object.keys(st.org)) st.org[k] = clamp(st.org[k] + 0.01 * (0.3 - st.org[k]), 0.02, 1);
  }
}

/** Reemplazo generacional (anual): convergencia lenta hacia la cohorte más joven de la comuna. */
export function yearlyGenerationalChange(s: GameState): void {
  const byCut = new Map<number, Segment[]>();
  for (const seg of s.segments) { const a = byCut.get(seg.cut) ?? []; a.push(seg); byCut.set(seg.cut, a); }
  for (const segs of byCut.values()) {
    segs.sort((a, b) => Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]));
    for (let k = segs.length - 1; k >= 1; k--) {
      for (const d of DIMS) segs[k].ideology[d] = clamp(segs[k].ideology[d] + clamp((segs[k - 1].ideology[d] - segs[k].ideology[d]) / 20, -1, 1), -95, 95);
    }
    // crecimiento leve del padrón (inscripción automática de nuevas cohortes)
    if (segs[0]) segs[0].voters = Math.round(segs[0].voters * 1.01);
  }
  void yearOf;
}

// ---------------------------------------------------------------------------
// Campaña territorial
// ---------------------------------------------------------------------------
export type TerritoryTarget = { kind: 'region'; id: RegionId } | { kind: 'distrito'; id: number } | { kind: 'comuna'; id: number };

export function targetComunas(t: TerritoryTarget): number[] {
  if (t.kind === 'comuna') return [t.id];
  if (t.kind === 'distrito') return comunasOfDistrict(t.id).map((c) => c.cut);
  return comunasOfRegion(t.id).map((c) => c.cut);
}

export function targetLabel(t: TerritoryTarget): string {
  if (t.kind === 'comuna') return COMUNA_BY_CUT[t.id]?.name ?? String(t.id);
  if (t.kind === 'distrito') return `Distrito ${t.id}`;
  return t.id;
}

/** Distribuye `amount` (MM$) entre comunas según electores. Devuelve el gasto por comuna. */
export function investCampaign(s: GameState, key: string, t: TerritoryTarget, amount: number): Record<number, number> {
  const cuts = targetComunas(t);
  const tot = cuts.reduce((a, c) => a + COMUNA_BY_CUT[c].electors, 0) || 1;
  const out: Record<number, number> = {};
  for (const c of cuts) {
    const x = amount * COMUNA_BY_CUT[c].electors / tot;
    const st = s.comunas[c]; st.campaign[key] = (st.campaign[key] ?? 0) + x; out[c] = x;
  }
  return out;
}

/** Trabajo territorial: fortalece la organización local de un partido (rendimiento decreciente). */
export function buildOrganization(s: GameState, partyId: string, t: TerritoryTarget, effort: number): void {
  for (const c of targetComunas(t)) {
    const st = s.comunas[c];
    const cur = st.org[partyId] ?? 0.1;
    st.org[partyId] = clamp(cur + effort * (1 - cur) * 0.08 / Math.sqrt(Math.max(1, targetComunas(t).length / 3)), 0, 0.95);
  }
}

/** IA: reparte gasto de campaña de cada partido en comunas competitivas (información percibida). */
export function aiTerritorialCampaign(s: GameState, rng: Rng, weeksToElection: number, aiSkill: number, skipParty: string | null): void {
  if (weeksToElection > 16 || weeksToElection < 0 || s.week % 2 !== 0) return;
  for (const p of Object.values(s.parties)) {
    if (!p.active || p.legalStatus === 'en_formacion' || p.id === skipParty) continue;
    const budget = Math.min(p.funds * 0.03, 200);
    if (budget < 1) continue;
    p.funds -= budget;
    // prioriza comunas grandes donde está cerca del umbral competitivo (percibido: último resultado)
    const scored = COMUNAS.map((c) => {
      const sh = s.comunas[c.cut].lastShares[p.id] ?? 0;
      const comp = sh > 0.05 && sh < 0.35 ? 1.4 : sh > 0.02 ? 0.8 : 0.2;
      return { c, w: c.electors * comp * (1 + rng.normal(0, 0.6 * (1 - aiSkill))) };
    }).sort((a, b) => b.w - a.w).slice(0, 40);
    const tot = scored.reduce((a, x) => a + Math.max(0, x.w), 0) || 1;
    for (const x of scored) { const st = s.comunas[x.c.cut]; st.campaign[p.id] = (st.campaign[p.id] ?? 0) + budget * Math.max(0, x.w) / tot; }
  }
}

// ---------------------------------------------------------------------------
// Estimaciones visibles (sin información oculta)
// ---------------------------------------------------------------------------
export interface TerritoryEstimate {
  electors: number;
  support: number;          // apoyo estimado (proporción) del partido consultado
  low: number; high: number; // intervalo de incertidumbre
  leader: string | null; leaderShare: number;
  margin: number;           // diferencia entre las dos primeras fuerzas estimadas
  turnout: number;          // participación esperada
  organization: number;
  ownInvestment: number;    // MM$ vigentes del partido consultado
  costPerPoint: number;     // MM$ estimados para +1 punto (rendimientos decrecientes)
  uncertainty: number;      // semiamplitud en puntos
  priorities: [string, number][];
}

/**
 * Estimación que haría el equipo del jugador: último resultado de la comuna ajustado por la
 * variación del promedio de encuestas desde esa elección. NO usa la intención real oculta.
 */
export function estimateComuna(s: GameState, cut: number, partyId: string | null): TerritoryEstimate {
  const st: ComunaState = s.comunas[cut]; const c = COMUNA_BY_CUT[cut];
  const polls = pollAverage(s, 'partidos', 8);
  const lastPollAtElection = s.opinionHistory.length ? s.opinionHistory[Math.max(0, s.opinionHistory.findIndex((h) => h.week >= lastElectionWeek(s)) - 1)]?.parties ?? polls : polls;
  const est: Record<string, number> = {};
  for (const [p, v] of Object.entries(st.lastShares)) {
    const ratio = polls[p] && lastPollAtElection[p] ? clamp(polls[p] / lastPollAtElection[p], 0.5, 2) : 1;
    est[p] = v * ratio;
  }
  const tot = Object.values(est).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(est)) est[k] /= tot;
  const ranking = Object.entries(est).sort((a, b) => b[1] - a[1]);
  const weeksSince = s.week - lastElectionWeek(s);
  const unc = clamp(2 + 25 / Math.sqrt(Math.max(c.electors, 500) / 100) + weeksSince * 0.03, 2, 18);
  const support = partyId ? est[partyId] ?? 0 : 0;
  const invest = partyId ? st.campaign[partyId] ?? 0 : 0;
  const perK = Math.max(1, c.electors / 1000);
  // costo marginal de +1 pp con rendimientos decrecientes (derivada de la raíz)
  const costPerPoint = Math.round(perK * (0.6 + Math.sqrt(invest / perK) * 1.2) * 10) / 10;
  const pri = Object.entries(st.priorities).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 3) as [string, number][];
  return {
    electors: c.electors, support, low: Math.max(0, support - unc / 100), high: Math.min(1, support + unc / 100),
    leader: ranking[0]?.[0] ?? null, leaderShare: ranking[0]?.[1] ?? 0, margin: (ranking[0]?.[1] ?? 0) - (ranking[1]?.[1] ?? 0),
    turnout: st.baseTurnout, organization: partyId ? st.org[partyId] ?? 0 : 0, ownInvestment: invest, costPerPoint, uncertainty: unc, priorities: pri,
  };
}

function lastElectionWeek(s: GameState): number {
  const r = [...s.results].reverse().find((x) => x.type === 'diputados' || x.type === 'alcaldes');
  return r ? r.week : 0;
}

export function estimateTerritory(s: GameState, t: TerritoryTarget, partyId: string | null): TerritoryEstimate {
  const cuts = targetComunas(t);
  const parts = cuts.map((c) => ({ e: estimateComuna(s, c, partyId), w: COMUNA_BY_CUT[c].electors }));
  const W = parts.reduce((a, x) => a + x.w, 0) || 1;
  const avg = (f: (e: TerritoryEstimate) => number) => parts.reduce((a, x) => a + f(x.e) * x.w, 0) / W;
  const unc = parts.length > 1 ? avg((e) => e.uncertainty) / Math.sqrt(Math.min(parts.length, 9)) : parts[0]?.e.uncertainty ?? 5;
  const leaders: Record<string, number> = {};
  for (const c of cuts) for (const [p, v] of Object.entries(s.comunas[c].lastShares)) leaders[p] = (leaders[p] ?? 0) + v * COMUNA_BY_CUT[c].electors;
  const rk = Object.entries(leaders).sort((a, b) => b[1] - a[1]);
  const support = avg((e) => e.support);
  return {
    electors: W, support, low: Math.max(0, support - unc / 100), high: Math.min(1, support + unc / 100), leader: rk[0]?.[0] ?? null, leaderShare: (rk[0]?.[1] ?? 0) / W,
    margin: ((rk[0]?.[1] ?? 0) - (rk[1]?.[1] ?? 0)) / W, turnout: avg((e) => e.turnout), organization: avg((e) => e.organization), ownInvestment: parts.reduce((a, x) => a + x.e.ownInvestment, 0),
    costPerPoint: Math.round(parts.reduce((a, x) => a + x.e.costPerPoint, 0) * 10) / 10, uncertainty: unc, priorities: parts[0]?.e.priorities ?? [],
  };
}

// ---------------------------------------------------------------------------
// Explicaciones: por qué se ganó o perdió apoyo en un territorio
// ---------------------------------------------------------------------------
/** Componentes medios de la utilidad de un partido en una comuna (ponderados por electores). */
export function utilityComponents(s: GameState, cut: number, partyId: string): number[] {
  const party = s.parties[partyId];
  if (!party) return UTILITY_COMPONENTS.map(() => 0);
  const ctx = buildUtilityContext(s, false);
  const acc = UTILITY_COMPONENTS.map(() => 0); let w = 0;
  for (const seg of s.segments) {
    if (seg.cut !== cut) continue;
    const p = utilityParts(s, seg, { key: partyId, partyId, ideology: party.ideology }, ctx, segmentWeights(s, seg));
    for (let i = 0; i < acc.length; i++) acc[i] += p[i] * seg.voters;
    w += seg.voters;
  }
  return acc.map((x) => (w ? x / w : 0));
}

/** Guarda la "fotografía" de componentes del partido del jugador en cada comuna (tras elecciones). */
export function snapshotPlayerParty(s: GameState): void {
  const p = s.characters[s.player.characterId]?.partyId;
  if (!p || !s.parties[p]) return;
  for (const c of COMUNAS) {
    const st = s.comunas[c.cut];
    st.snapshot = { week: s.week, party: p, comps: utilityComponents(s, c.cut, p).map((x) => Math.round(x * 1000) / 1000), share: st.lastShares[p] ?? 0 };
  }
}

export interface Explanation { factor: string; effect: 'sube' | 'baja' | 'neutro'; magnitude: 'leve' | 'moderado' | 'fuerte'; detail: string }

/**
 * Explica la variación del apoyo esperado del partido del jugador en una comuna desde la última
 * fotografía. Se excluye la identificación partidaria de fondo y los shocks aleatorios (no
 * observables); se presentan magnitudes cualitativas, no valores internos.
 */
export function explainComuna(s: GameState, cut: number): { since: number | null; items: Explanation[]; note: string } {
  const st = s.comunas[cut];
  const p = s.characters[s.player.characterId]?.partyId;
  if (!p || !st.snapshot || st.snapshot.party !== p) return { since: null, items: [], note: 'Aún no hay una elección de referencia para tu partido en esta comuna.' };
  const now = utilityComponents(s, cut, p);
  const items: Explanation[] = [];
  const DETAIL: Record<string, [string, string]> = {
    'Posición ideológica': ['tu partido se acercó a las preferencias del electorado local', 'tu partido se alejó de las preferencias del electorado local'],
    'Imagen del partido': ['mejoró la imagen nacional del partido (popularidad, credibilidad)', 'empeoró la imagen nacional del partido'],
    'Evaluación del gobierno': ['el juicio sobre el gobierno favorece a tu sector', 'el juicio sobre el gobierno perjudica a tu sector'],
    'Problemas locales': ['bajó el malestar local con el oficialismo', 'aumentó el malestar por problemas locales'],
    'Campaña': ['tu campaña tiene más presencia que antes', 'tu campaña perdió presencia relativa'],
    'Organización local': ['se fortaleció la organización territorial', 'se debilitó la organización territorial'],
  };
  UTILITY_COMPONENTS.forEach((name, i) => {
    if (name === 'Identificación partidaria' || name === 'Candidatura') return;
    const d = now[i] - st.snapshot!.comps[i];
    if (Math.abs(d) < 0.03) return;
    const magnitude = Math.abs(d) > 0.3 ? 'fuerte' : Math.abs(d) > 0.1 ? 'moderado' : 'leve';
    items.push({ factor: name, effect: d > 0 ? 'sube' : 'baja', magnitude, detail: DETAIL[name]?.[d > 0 ? 0 : 1] ?? '' });
  });
  items.sort((a, b) => (b.magnitude === 'fuerte' ? 2 : b.magnitude === 'moderado' ? 1 : 0) - (a.magnitude === 'fuerte' ? 2 : a.magnitude === 'moderado' ? 1 : 0));
  return { since: st.snapshot.week, items, note: 'Análisis de tu equipo con información pública (encuestas, resultados, actividad observable). Excluye factores no observables y la incertidumbre propia de cada elección.' };
}
