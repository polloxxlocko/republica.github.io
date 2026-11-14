/**
 * SURVEY SAMPLING ENGINE — cada encuesta entrevista a personas simuladas del ELECTORADO SINTÉTICO.
 *
 * 1. Marco: probabilidades de respuesta por segmento (las mismas utilidades del motor electoral).
 * 2. Universo y cobertura: comunas/regiones incluidas, exclusiones documentadas del estudio.
 * 3. Selección: muestreo por segmento con probabilidad ∝ electores × factor de inclusión de la modalidad.
 * 4. Respuesta: cada persona responde con su segmento, más el tratamiento de indecisos y los
 *    parámetros ficticios del estudio (HouseState) y el componente común.
 * 5. Ponderación: raking (ajuste iterativo) a los márgenes del universo en las variables declaradas.
 *    La ponderación corrige la composición observable, no el sesgo dentro de cada celda (p. ej., más
 *    interés político en paneles): de ahí salen diferencias plausibles entre estudios.
 */
import type { GameState, PolicyArea, RegionId, Segment } from '../models/types';
import type { Rng } from '../engine/rng';
import { VOTE, AREA_LABELS, clamp } from '../rules/params';
import { buildUtilityContext, partyOptions, segmentWeights, turnoutOf, utility, type VoteOption, type UtilityContext } from '../systems/electorate';
import { ideoDistance, leftRight } from '../systems/util';
import { COMUNA_BY_CUT, COMUNAS } from '../territory/data';
import type { HouseState, MethodPeriod, SurveyOption, SurveyQuestion, WeightVar } from './types';
import { inclusionFactor, undecidedBase } from './methodology';

const MACRO: Record<RegionId, string> = { AP: 'Norte', TA: 'Norte', AN: 'Norte', AT: 'Norte', CO: 'Norte', VA: 'Centro', OH: 'Centro', ML: 'Centro', NB: 'Centro', BI: 'Centro', RM: 'Metropolitana', AR: 'Sur', LR: 'Sur', LL: 'Sur', AI: 'Sur', MA: 'Sur' };
export const macroOf = (r: RegionId) => MACRO[r];

// ───────────────────────────── Marco por semana ─────────────────────────────
/** Probabilidades de voto de un segmento, calculadas solo cuando alguien de ese segmento es entrevistado. */
export type ProbFn = (i: number) => Float64Array;

export interface Frame {
  key: string;
  segs: Segment[];
  ctx: UtilityContext;
  turnout: Float64Array;
  approval: Float64Array;
  partyKeys: string[];
  partyP: ProbFn;               // por segmento: [p_partido..., p_blanco]
  cand: Map<string, { keys: string[]; p: ProbFn }>;
  /** media y desviación del eje izquierda–derecha en el electorado (para autoubicación) */
  lrMean: number; lrSd: number;
  lr: Float64Array;
}
const frames = new WeakMap<GameState, Frame>();

function softmaxFor(s: GameState, seg: Segment, opts: VoteOption[], ctx: UtilityContext): Float64Array {
  const w = segmentWeights(s, seg);
  const out = new Float64Array(opts.length + 1);
  const utils = opts.map((o) => (o.regions && !o.regions.includes(seg.regionId) ? -Infinity : utility(s, seg, o, ctx, w)));
  const maxU = Math.max(...utils, VOTE.blankUtility);
  let den = 0;
  for (let i = 0; i < opts.length; i++) { out[i] = Number.isFinite(utils[i]) ? Math.exp(utils[i] - maxU) : 0; den += out[i]; }
  out[opts.length] = Math.exp(VOTE.blankUtility - maxU); den += out[opts.length];
  for (let i = 0; i <= opts.length; i++) out[i] /= den;
  return out;
}

export function getFrame(s: GameState): Frame {
  const key = `${s.id}|${s.week}|${s.segments.length}`;
  const f = frames.get(s);
  if (f && f.key === key) return f;
  const ctx = buildUtilityContext(s, false);
  const opts = partyOptions(s);
  const segs = s.segments;
  const turnout = new Float64Array(segs.length); const approval = new Float64Array(segs.length);
  const presParty = s.parties[s.characters[s.government.presidentId]?.partyId ?? '']?.ideology;
  const govSet = ctx.govParties;
  const z = new Float64Array(segs.length);
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    turnout[i] = turnoutOf(s, seg, ctx);
    let ident = 0; for (const p of govSet) ident += seg.partisanship[p] ?? 0;
    z[i] = (presParty ? -2.6 * ideoDistance(seg.ideology, presParty) : 0) + 1.4 * ident - 0.8 * seg.econSensitivity * (s.opinion.economicEvaluation < 0 ? 1 : 0);
  }
  // Calibración: el promedio poblacional de aprobación coincide con el estado oculto
  const target = clamp(s.opinion.presidentialApproval / 100, 0.02, 0.98);
  let lo = -8, hi = 8;
  for (let it = 0; it < 40; it++) {
    const c = (lo + hi) / 2; let num = 0, den = 0;
    for (let i = 0; i < segs.length; i++) { num += segs[i].voters / (1 + Math.exp(-(c + z[i]))); den += segs[i].voters; }
    if (num / den > target) hi = c; else lo = c;
  }
  const c = (lo + hi) / 2;
  for (let i = 0; i < segs.length; i++) approval[i] = 1 / (1 + Math.exp(-(c + z[i])));
  let m = 0, v = 0, W = 0; const lr = new Float64Array(segs.length);
  segs.forEach((seg, i) => { const x = (lr[i] = leftRight(seg.ideology)); m += seg.voters * x; v += seg.voters * x * x; W += seg.voters; });
  m /= W; const sd = Math.sqrt(Math.max(1e-6, v / W - m * m));
  const fr: Frame = { key, segs, ctx, turnout, approval, partyKeys: opts.map((o) => o.key), partyP: lazyProbs(s, segs, opts, ctx), cand: new Map(), lrMean: m, lrSd: sd, lr };
  frames.set(s, fr);
  return fr;
}

function lazyProbs(s: GameState, segs: Segment[], opts: VoteOption[], ctx: UtilityContext): ProbFn {
  const cache: (Float64Array | undefined)[] = new Array(segs.length);
  return (i) => (cache[i] ??= softmaxFor(s, segs[i], opts, ctx));
}

export function candidateProbs(s: GameState, fr: Frame, opts: VoteOption[]): { keys: string[]; p: ProbFn } {
  const k = opts.map((o) => o.key).join(',');
  let e = fr.cand.get(k);
  if (!e) {
    const ctx = buildUtilityContext(s, true);
    e = { keys: opts.map((o) => o.key), p: lazyProbs(s, fr.segs, opts, ctx) };
    fr.cand.set(k, e);
  }
  return e;
}

// ───────────────────────────── Muestra ─────────────────────────────
export interface SampleSpec {
  method: MethodPeriod;
  n: number;
  regions?: RegionId[];
  cuts?: Set<number>;
}
export interface Respondent { i: number; w: number }
export interface Sample { resp: Respondent[]; n: number; deffW: number; universeVoters: number }

let coverageCache: { cov: number; set: Set<number> } | null = null;
function coveredCuts(cov: number): Set<number> {
  if (coverageCache?.cov === cov) return coverageCache.set;
  const sorted = [...COMUNAS].sort((a, b) => b.pop - a.pop); const tot = sorted.reduce((a, c) => a + c.pop, 0);
  const set = new Set<number>(); let acc = 0;
  for (const c of sorted) { if (acc / tot >= cov) break; set.add(c.cut); acc += c.pop; }
  coverageCache = { cov, set };
  return set;
}

/** ¿Está el segmento dentro del universo del estudio? (peso de universo 0..1) */
function universeWeight(seg: Segment, spec: SampleSpec): number {
  const m = spec.method;
  if (spec.regions && !spec.regions.includes(seg.regionId)) return 0;
  if (spec.cuts && !spec.cuts.has(seg.cut)) return 0;
  if (m.excludeCuts?.includes(seg.cut)) return 0;
  if (m.comunaCoverage && !coveredCuts(m.comunaCoverage).has(seg.cut)) return 0;
  return seg.ses === 'bajo' && m.excludeLowSes ? 1 - m.excludeLowSes : 1;
}

const MACRO_IDX: Record<string, number> = { Norte: 0, Centro: 1, Metropolitana: 2, Sur: 3 };
/** Códigos enteros de celda por variable de ponderación (cacheados por marco). */
const cellCache = new WeakMap<Frame, Record<string, Uint8Array>>();
function cellCodes(fr: Frame, v: WeightVar): Uint8Array {
  let c = cellCache.get(fr); if (!c) { c = {}; cellCache.set(fr, c); }
  if (!c[v]) {
    const a = new Uint8Array(fr.segs.length);
    fr.segs.forEach((seg, i) => {
      a[i] = v === 'edad' ? (seg.age === 'joven' ? 0 : seg.age === 'adulto' ? 1 : 2) : v === 'nse' ? (seg.ses === 'bajo' ? 0 : seg.ses === 'medio' ? 1 : 2)
        : v === 'zona' ? (seg.zone === 'urbano' ? 0 : 1) : v === 'macrozona' ? MACRO_IDX[MACRO[seg.regionId]] : 0;
    });
    c[v] = a;
  }
  return c[v];
}
const inclCache = new WeakMap<Frame, Record<string, Float64Array>>();
function inclusion(fr: Frame, mode: SampleSpec['method']['mode']): Float64Array {
  let c = inclCache.get(fr); if (!c) { c = {}; inclCache.set(fr, c); }
  return (c[mode] ??= Float64Array.from(fr.segs, (seg) => inclusionFactor(mode, seg)));
}

export function drawSample(_s: GameState, fr: Frame, rng: Rng, spec: SampleSpec): Sample {
  const segs = fr.segs;
  const cum = new Float64Array(segs.length); let acc = 0; let universe = 0;
  const vars = spec.method.weighting.filter((v) => v !== 'sexo'); // el electorado sintético no distingue sexo
  const codes = vars.map((v) => cellCodes(fr, v));
  const target = vars.map(() => new Float64Array(4));
  const incl = inclusion(fr, spec.method.mode);
  for (let i = 0; i < segs.length; i++) {
    const u = universeWeight(segs[i], spec) * segs[i].voters;
    universe += u;
    acc += u * incl[i];
    cum[i] = acc;
    if (u > 0) for (let j = 0; j < vars.length; j++) target[j][codes[j][i]] += u;
  }
  const resp: Respondent[] = [];
  if (acc <= 0) return { resp, n: 0, deffW: 1, universeVoters: 0 };
  for (let k = 0; k < spec.n; k++) {
    const x = rng.next() * acc;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < x) lo = mid + 1; else hi = mid; }
    resp.push({ i: lo, w: 1 });
  }
  // Raking a los márgenes del universo
  const tTot = target.map((t) => t.reduce((a, b) => a + b, 0));
  for (let it = 0; it < 8; it++) {
    for (let j = 0; j < vars.length; j++) {
      const have = new Float64Array(4); let hTot = 0;
      for (const r of resp) { have[codes[j][r.i]] += r.w; hTot += r.w; }
      const f = new Float64Array(4);
      for (let c = 0; c < 4; c++) f[c] = have[c] > 0 ? (target[j][c] / tTot[j]) / (have[c] / hTot) : 1;
      for (const r of resp) r.w *= f[codes[j][r.i]];
    }
  }
  const mean = resp.reduce((a, r) => a + r.w, 0) / resp.length;
  for (const r of resp) r.w = clamp(r.w / mean, 0.2, 5); // recorte de pesos extremos
  const sw = resp.reduce((a, r) => a + r.w, 0); const sw2 = resp.reduce((a, r) => a + r.w * r.w, 0);
  return { resp, n: resp.length, deffW: resp.length * sw2 / (sw * sw), universeVoters: universe };
}

// ───────────────────────────── Preguntas ─────────────────────────────
export function tally(resp: Respondent[], answers: string[], order: string[], labels: Record<string, string>): { options: SurveyOption[]; base: number } {
  const t: Record<string, number> = {}; let tot = 0;
  for (let k = 0; k < resp.length; k++) { const a = answers[k]; if (!a) continue; t[a] = (t[a] ?? 0) + resp[k].w; tot += resp[k].w; }
  const keys = [...new Set([...order, ...Object.keys(t)])];
  return { options: keys.filter((k) => t[k] !== undefined || order.includes(k)).map((k) => ({ key: k, label: labels[k] ?? k, pct: tot ? Math.round(((t[k] ?? 0) / tot) * 1000) / 10 : 0 })), base: answers.filter(Boolean).length };
}

const logit = (p: number) => Math.log(clamp(p, 1e-6, 1 - 1e-6) / (1 - clamp(p, 1e-6, 1 - 1e-6)));
const sigm = (x: number) => 1 / (1 + Math.exp(-x));

export interface AskCtx {
  s: GameState; fr: Frame; rng: Rng; sample: Sample; house: HouseState; common: Record<string, number>; commonApproval: number;
  method: MethodPeriod; effN: number; weeksToElection: number;
  /** Solo las encuestas nacionales informan submuestras por macrozona */
  national: boolean;
}

function territorial(c: AskCtx, answers: string[], order: string[], labels: Record<string, string>): SurveyQuestion['territorial'] {
  if (!c.national) return undefined;
  const groups: Record<string, number[]> = {};
  c.sample.resp.forEach((r, k) => { (groups[MACRO[c.fr.segs[r.i].regionId]] ??= []).push(k); });
  const out: NonNullable<SurveyQuestion['territorial']> = [];
  for (const [g, idx] of Object.entries(groups)) {
    if (idx.length < 200) continue; // submuestra insuficiente: no se informa
    const t = tally(idx.map((k) => c.sample.resp[k]), idx.map((k) => answers[k]), order, labels);
    out.push({ label: g, n: idx.length, options: t.options });
  }
  return out.length ? out : undefined;
}

/** Intención de voto (partidos o candidaturas), con indecisos y blanco/nulo explícitos. */
export function askVote(c: AskCtx, q: { id: string; topic: SurveyQuestion['topic']; text: string; keys: string[]; p: ProbFn; labels: Record<string, string>; spontaneous?: Record<string, number>; hypothetical?: boolean; likelyVoter?: boolean }): SurveyQuestion {
  const { rng, sample, fr, house, common } = c;
  const timeF = clamp(0.45 + c.weeksToElection / 60, 0.45, 1.2);
  const und0 = undecidedBase(c.method.mode) * house.undecided * timeF * (q.hypothetical ? 0.7 : 1);
  const shift = q.keys.map((k) => Math.exp((house.offsets[k] ?? 0) + (common[k] ?? 0)));
  const answers: string[] = [];
  for (const r of sample.resp) {
    const seg = fr.segs[r.i];
    if (q.likelyVoter && rng.next() > clamp(fr.turnout[r.i] + 0.1, 0, 0.99)) { answers.push(''); continue; }
    if (rng.next() < clamp(und0 * (1.35 - 0.7 * seg.interest), 0.02, 0.75)) { answers.push('ns'); continue; }
    const p = q.p(r.i); let den = p[q.keys.length];
    for (let k = 0; k < q.keys.length; k++) den += p[k] * shift[k];
    let x = rng.next() * den; let pick = 'ninguno';
    for (let k = 0; k < q.keys.length; k++) { x -= p[k] * shift[k]; if (x <= 0) { pick = q.keys[k]; break; } }
    if (q.spontaneous && pick !== 'ninguno' && rng.next() > q.spontaneous[pick]) pick = 'ns';
    answers.push(pick);
  }
  const labels = { ...q.labels, ns: 'No sabe / no responde', ninguno: 'Ninguno / blanco / nulo' };
  const order = [...q.keys, 'ninguno', 'ns'];
  const t = tally(sample.resp, answers, order, labels);
  t.options.sort((a, b) => (a.key === 'ns' || a.key === 'ninguno' ? 1 : 0) - (b.key === 'ns' || b.key === 'ninguno' ? 1 : 0) || b.pct - a.pct);
  return { id: q.id, topic: q.topic, text: q.text, options: t.options, base: t.base, effN: c.effN * (t.base / Math.max(1, sample.n)), hypothetical: q.hypothetical, territorial: q.topic === 'partidos' || q.topic === 'presidencial_lista' ? territorial(c, answers, order, labels) : undefined };
}

export function askApproval(c: AskCtx): SurveyQuestion {
  const { rng, sample, fr } = c;
  const nsBase = c.method.mode === 'presencial' ? 0.05 : 0.08;
  const answers = sample.resp.map((r) => {
    const seg = fr.segs[r.i];
    if (rng.next() < nsBase * (1.4 - 0.8 * seg.interest)) return 'ns';
    return rng.next() < sigm(logit(fr.approval[r.i]) + c.house.approval + c.commonApproval) ? 'aprueba' : 'desaprueba';
  });
  const labels = { aprueba: 'Aprueba', desaprueba: 'Desaprueba', ns: 'No sabe / no responde' };
  const t = tally(sample.resp, answers, ['aprueba', 'desaprueba', 'ns'], labels);
  const pres = c.s.characters[c.s.government.presidentId];
  return { id: 'aprobacion', topic: 'aprobacion', text: `¿Usted aprueba o desaprueba la forma en que ${pres ? `${pres.firstName} ${pres.lastName.split(' ')[0]}` : 'el Presidente'} está conduciendo su gobierno?`, options: t.options, base: t.base, effN: c.effN, territorial: territorial(c, answers, ['aprueba', 'desaprueba', 'ns'], labels) };
}

export function askGovGrade(c: AskCtx): SurveyQuestion {
  const { rng, sample, fr } = c;
  const grades: number[] = []; const answers = sample.resp.map((r) => {
    const g = clamp(Math.round(rng.normal(2.3 + 3.6 * sigm(logit(fr.approval[r.i]) + c.house.approval), 1.0)), 1, 7);
    grades.push(g); return g <= 3 ? 'baja' : g === 4 ? 'media' : 'alta';
  });
  const sw = sample.resp.reduce((a, r) => a + r.w, 0);
  const mean = sample.resp.reduce((a, r, k) => a + r.w * grades[k], 0) / sw;
  const t = tally(sample.resp, answers, ['alta', 'media', 'baja'], { alta: 'Nota 5 a 7', media: 'Nota 4', baja: 'Nota 1 a 3' });
  return { id: 'evaluacion_gobierno', topic: 'evaluacion_gobierno', text: 'Con nota de 1 a 7, ¿cómo evalúa la gestión del Gobierno?', options: t.options, base: t.base, effN: c.effN, mean };
}

export function askIdentification(c: AskCtx): SurveyQuestion {
  const { rng, sample, fr } = c;
  const answers = sample.resp.map((r) => {
    const seg = fr.segs[r.i];
    if (rng.next() < 0.62 - 0.45 * seg.interest) return 'ninguna';
    // autoubicación relativa a la distribución del electorado, con ruido de respuesta
    const z = (fr.lr[r.i] - fr.lrMean) / fr.lrSd + rng.normal(0, 0.45);
    return z < -0.3 ? 'izquierda' : z > 0.3 ? 'derecha' : 'centro';
  });
  const t = tally(sample.resp, answers, ['izquierda', 'centro', 'derecha', 'ninguna'], { izquierda: 'Izquierda / centroizquierda', centro: 'Centro', derecha: 'Derecha / centroderecha', ninguna: 'Ninguna / no se identifica' });
  return { id: 'identificacion', topic: 'identificacion', text: 'Tradicionalmente en nuestro país la gente define sus posiciones políticas como más cercanas a la izquierda, el centro o la derecha. ¿Con cuál se identifica más?', options: t.options, base: t.base, effN: c.effN };
}

/** Parámetros ficticios del modelo (logit base de confianza); no son datos reales. */
const INSTITUTIONS: { key: string; label: string; base: number; right: number }[] = [
  { key: 'carabineros', label: 'Carabineros', base: 0.2, right: 0.012 }, { key: 'ffaa', label: 'Fuerzas Armadas', base: 0.1, right: 0.012 },
  { key: 'municipios', label: 'Municipalidades', base: -0.4, right: 0 }, { key: 'tribunales', label: 'Tribunales de Justicia', base: -1.3, right: 0 },
  { key: 'gobierno', label: 'Gobierno', base: 0, right: 0 }, { key: 'congreso', label: 'Congreso', base: -1.9, right: 0 }, { key: 'partidos', label: 'Partidos políticos', base: -2.6, right: 0 },
];
export function askTrust(c: AskCtx): SurveyQuestion[] {
  const { rng, sample, fr, s } = c;
  const mood = (s.opinion.institutionalTrust - 50) / 25;
  return INSTITUTIONS.map((inst) => {
    const answers = sample.resp.map((r) => {
      const seg = fr.segs[r.i];
      const x = inst.key === 'gobierno' ? logit(fr.approval[r.i]) - 0.7 : inst.base + 2.2 * (seg.institutionalTrust - 0.5) + 0.5 * mood + inst.right * fr.lr[r.i];
      return rng.next() < sigm(x) ? 'confia' : 'no';
    });
    const t = tally(sample.resp, answers, ['confia', 'no'], { confia: 'Mucha o bastante confianza', no: 'Poca o ninguna confianza' });
    return { id: `confianza_${inst.key}`, topic: 'confianza', subject: inst.label, text: `¿Cuánta confianza tiene usted en: ${inst.label}?`, options: t.options, base: t.base, effN: c.effN };
  });
}

export function askEconomy(c: AskCtx): SurveyQuestion {
  const { rng, sample, fr, s } = c;
  const base = s.opinion.economicEvaluation / 100;
  const answers = sample.resp.map((r) => {
    const seg = fr.segs[r.i];
    const x = base + (seg.ses === 'alto' ? 0.15 : seg.ses === 'bajo' ? -0.1 : 0) - 0.2 * seg.econSensitivity + rng.normal(0, 0.45);
    return x > 0.22 ? 'buena' : x < -0.22 ? 'mala' : 'regular';
  });
  const t = tally(sample.resp, answers, ['buena', 'regular', 'mala'], { buena: 'Buena o muy buena', regular: 'Ni buena ni mala', mala: 'Mala o muy mala' });
  return { id: 'economia', topic: 'economia', text: '¿Cómo calificaría usted la actual situación económica del país?', options: t.options, base: t.base, effN: c.effN };
}

export function askSecurity(c: AskCtx): SurveyQuestion {
  const { rng, sample, fr, s } = c;
  const answers = sample.resp.map((r) => (rng.next() < sigm(-(s.opinion.securityPerception - 50) / 14 + (fr.segs[r.i].zone === 'urbano' ? 0.3 : -0.3)) ? 'inseguro' : 'seguro'));
  const t = tally(sample.resp, answers, ['inseguro', 'seguro'], { inseguro: 'Se siente inseguro/a en su barrio', seguro: 'Se siente seguro/a en su barrio' });
  return { id: 'seguridad', topic: 'seguridad', text: 'En general, ¿qué tan seguro/a se siente en el barrio donde vive?', options: t.options, base: t.base, effN: c.effN };
}

export function askExpectations(c: AskCtx): SurveyQuestion {
  const { rng, sample, fr, s } = c;
  const answers = sample.resp.map((r) => (rng.next() < sigm(logit(fr.approval[r.i]) - 0.35 + s.opinion.structuralMood / 120 + s.opinion.economicEvaluation / 220) ? 'bueno' : rng.next() < 0.12 ? 'ns' : 'malo'));
  const t = tally(sample.resp, answers, ['bueno', 'malo', 'ns'], { bueno: 'Va por buen camino', malo: 'Va por mal camino', ns: 'No sabe / no responde' });
  return { id: 'expectativas', topic: 'expectativas', text: 'En términos generales, ¿diría usted que el país va por un buen o un mal camino?', options: t.options, base: t.base, effN: c.effN };
}

export function askProblems(c: AskCtx): SurveyQuestion {
  const { rng, sample, fr, s } = c;
  const mentions: Record<string, number> = {}; let tot = 0;
  const areas = Object.keys(s.opinion.priorities) as PolicyArea[];
  const cache = new Map<number, Float64Array>();
  for (const r of sample.resp) {
    let base = cache.get(r.i);
    if (!base) {
      const seg = fr.segs[r.i];
      base = Float64Array.from(areas, (a) => Math.max(0.01, (s.opinion.priorities[a] ?? 0) + (seg.priorities[a] ?? 0) * 0.8) ** 1.6);
      cache.set(r.i, base);
    }
    const ws = Float64Array.from(base);
    for (let k = 0; k < 3; k++) {
      let sum = 0; for (let j = 0; j < ws.length; j++) sum += ws[j];
      let x = rng.next() * sum;
      for (let j = 0; j < ws.length; j++) { x -= ws[j]; if (x <= 0) { mentions[areas[j]] = (mentions[areas[j]] ?? 0) + r.w; ws[j] = 0; break; } }
    }
    tot += r.w;
  }
  const options = Object.entries(mentions).map(([k, v]) => ({ key: k, label: AREA_LABELS[k as PolicyArea] ?? k, pct: Math.round((v / tot) * 1000) / 10 })).sort((a, b) => b.pct - a.pct).slice(0, 8);
  return { id: 'problemas', topic: 'problemas', text: '¿Cuáles son los tres problemas a los que debería dedicar el mayor esfuerzo el Gobierno? (respuesta múltiple: suma más de 100%)', options, base: sample.n, effN: c.effN };
}

/** Evaluación de figuras: conocimiento y opinión. Solo se incluye a quien tiene notoriedad suficiente. */
export function askFigures(c: AskCtx, ids: string[], regionId?: RegionId): SurveyQuestion[] {
  const { rng, sample, fr, s } = c;
  return ids.map((id) => {
    const ch = s.characters[id];
    const dist = new Map<number, number>();
    const known = regionId ? Math.max(ch.rep.reconocimiento, ch.rep.reconocimientoRegional[regionId] ?? 0) : ch.rep.reconocimiento;
    const answers = sample.resp.map((r) => {
      const seg = fr.segs[r.i];
      if (rng.next() > clamp(0.04 + 0.95 * (known / 100) ** 1.15 * (0.75 + 0.4 * seg.interest), 0, 0.98)) return 'nc';
      // la opinión sobre quien gobierna se ancla en la aprobación individual
      let d = dist.get(r.i); if (d === undefined) { d = ideoDistance(seg.ideology, ch.ideology); dist.set(r.i, d); }
      const x = id === s.government.presidentId ? logit(fr.approval[r.i]) + c.house.approval
        : (ch.rep.popularidad - 50) / 20 - 3.0 * (d - 0.33) - ch.scandal / 60 + (c.house.offsets[id] ?? 0);
      return rng.next() < sigm(x) ? 'pos' : 'neg';
    });
    const t = tally(sample.resp, answers, ['pos', 'neg', 'nc'], { pos: 'Opinión positiva', neg: 'Opinión negativa', nc: 'No lo/la conoce o no responde' });
    return { id: `figura_${id}`, topic: 'figuras', subject: id, text: `¿Tiene usted una opinión positiva o negativa de ${ch.firstName} ${ch.lastName}?`, options: t.options, base: t.base, effN: c.effN };
  });
}

export function askPolicy(c: AskCtx, billId: string): SurveyQuestion | null {
  const { rng, sample, fr, s } = c;
  const b = s.bills.find((x) => x.id === billId); if (!b) return null;
  const answers = sample.resp.map((r) => {
    const seg = fr.segs[r.i];
    if (rng.next() < 0.1 + 0.15 * (1 - seg.interest)) return 'ns';
    return rng.next() < sigm(b.popularity / 45 - 2.4 * (ideoDistance(seg.ideology, b.position) - 0.35)) ? 'favor' : 'contra';
  });
  const t = tally(sample.resp, answers, ['favor', 'contra', 'ns'], { favor: 'A favor', contra: 'En contra', ns: 'No sabe / no responde' });
  return { id: `politica_${b.id}`, topic: 'politica_publica', subject: b.title.replace(/^Mensaje: /, ''), text: `¿Está usted a favor o en contra del proyecto «${b.title.replace(/^Mensaje: /, '')}»?`, options: t.options, base: t.base, effN: c.effN };
}

export function askTurnoutIntent(c: AskCtx): SurveyQuestion {
  const { rng, sample, fr } = c;
  const answers = sample.resp.map((r) => { const p = clamp(fr.turnout[r.i] + 0.08, 0, 0.99); const x = rng.next(); return x < p * 0.8 ? 'seguro' : x < p ? 'probable' : 'no'; });
  const t = tally(sample.resp, answers, ['seguro', 'probable', 'no'], { seguro: 'Seguro irá a votar', probable: 'Probablemente irá', no: 'Probablemente no / no irá' });
  return { id: 'participacion', topic: 'participacion', text: '¿Qué tan probable es que usted vaya a votar en la próxima elección presidencial?', options: t.options, base: t.base, effN: c.effN };
}

export function askRejection(c: AskCtx, keys: string[], p: ProbFn, labels: Record<string, string>): SurveyQuestion {
  const { rng, sample, s } = c;
  const known = keys.map((k) => (s.characters[k]?.rep.reconocimiento ?? 30) / 100);
  const answers = sample.resp.map((r) => {
    const pr = p(r.i); const ws = keys.map((_, j) => (rng.next() < known[j] ? (1 - pr[j]) ** 6 : 0));
    const sum = ws.reduce((a, b) => a + b, 0);
    if (sum < 0.05 || rng.next() < 0.15) return 'ns';
    let x = rng.next() * sum; for (let j = 0; j < keys.length; j++) { x -= ws[j]; if (x <= 0) return keys[j]; }
    return 'ns';
  });
  const t = tally(sample.resp, answers, [...keys, 'ns'], { ...labels, ns: 'Ninguno / no sabe' });
  t.options.sort((a, b) => (a.key === 'ns' ? 1 : 0) - (b.key === 'ns' ? 1 : 0) || b.pct - a.pct);
  return { id: 'rechazo', topic: 'rechazo', text: '¿Por cuál de estas personas nunca votaría para Presidente/a?', options: t.options, base: t.base, effN: c.effN };
}

export function askKnowledge(c: AskCtx, id: string, regionId?: RegionId): SurveyQuestion {
  const [q] = askFigures(c, [id], regionId);
  const known = q.options.filter((o) => o.key !== 'nc').reduce((a, o) => a + o.pct, 0);
  return { ...q, id: `conocimiento_${id}`, topic: 'conocimiento', text: `¿Conoce o ha oído hablar de ${c.s.characters[id].firstName} ${c.s.characters[id].lastName}?`, options: [{ key: 'conoce', label: 'Lo/la conoce', pct: known }, { key: 'nc', label: 'No lo/la conoce', pct: 100 - known }] };
}

export function comunaLabel(cut: number) { return COMUNA_BY_CUT[cut]?.name ?? String(cut); }
