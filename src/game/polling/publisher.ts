/**
 * SURVEY PUBLISHER — arma cada edición: universo, muestra, modalidad, preguntas pertinentes al
 * estudio y al contexto, incertidumbre adecuada al diseño y comparación con la medición anterior.
 */
import type { GameState, Poll, RegionId } from '../models/types';
import type { Rng } from '../engine/rng';
import { clamp } from '../rules/params';
import { newId } from '../systems/util';
import { REGION_BY_ID } from '../data/geography';
import type { PollsterProfile, Survey, SurveyQuestion, SurveyTopic, Uncertainty } from './types';
import { methodAt, PROFILE_BY_ID } from './registry';
import { baseDesignEffect, evolveHouse, initHouse } from './methodology';
import { askApproval, askEconomy, askExpectations, askFigures, askGovGrade, askIdentification, askPolicy, askProblems, askRejection, askSecurity, askTrust, askTurnoutIntent, askVote, candidateProbs, drawSample, getFrame, type AskCtx } from './sampling';
import { presidentialOptions } from './field';
import { nextNational, publicationISO, vedaFor, weeksTo } from './scheduler';
import { latestAggregate } from './queries';

export function uncertaintyFor(design: Survey['design'], effN: number): Uncertainty {
  const pp = 1.96 * Math.sqrt(0.25 / Math.max(30, effN)) * 100;
  return design === 'probabilistico'
    ? { kind: 'moe', pp, text: `Margen de error de ±${pp.toFixed(1)} pp para la muestra total (95% de confianza), con efecto de diseño simulado.` }
    : { kind: 'orientativo', pp, text: `Muestra no probabilística: no corresponde un margen de error muestral clásico. Variación orientativa ±${pp.toFixed(1)} pp (supuesto del modelo, no garantía estadística).` };
}

/** Figuras con notoriedad suficiente para ser medidas (el jugador solo si su notoriedad lo justifica). */
export function figuresFor(s: GameState, regionId?: RegionId, max = 7): string[] {
  const score = (id: string) => { const c = s.characters[id]; return regionId ? Math.max(c.rep.reconocimiento, c.rep.reconocimientoRegional[regionId] ?? 0) : c.rep.reconocimiento; };
  const threshold = regionId ? 40 : 50;
  const pool = Object.values(s.characters).filter((c) => c.status === 'activo' && (!regionId || c.regionId === regionId || c.rep.reconocimiento >= 60) && score(c.id) >= threshold
    && (c.offices.length > 0 || Object.values(s.presidentialCandidates).includes(c.id) || c.isPlayer));
  return pool.sort((a, b) => score(b.id) - score(a.id)).slice(0, max).map((c) => c.id);
}

function salientBill(s: GameState): string | null {
  const open = s.bills.filter((b) => !['publicada', 'rechazada', 'archivada', 'retirada'].includes(b.stage) && b.origin === 'mensaje');
  open.sort((a, b) => Math.abs(b.popularity) * (0.5 + b.intensity) - Math.abs(a.popularity) * (0.5 + a.intensity));
  return open[0]?.id ?? null;
}

function name(s: GameState, id: string): string {
  const c = s.characters[id]; if (c) return `${c.firstName} ${c.lastName.split(' ')[0]}`;
  return s.parties[id]?.short ?? id;
}

export interface BuildOpts { flash?: boolean; regionId?: RegionId; cuts?: Set<number>; territoryLabel?: string; forceTopics?: SurveyTopic[]; privateFor?: string; nOverride?: number; pollsterId?: string; figures?: string[]; voteKeys?: 'partidos' | 'presidencial' }

export function buildSurvey(s: GameState, rng: Rng, p: PollsterProfile, o: BuildOpts = {}): Survey {
  const pol = s.polling!;
  const iso = publicationISO(s, s.week);
  const method = methodAt(p, iso);
  const fr = getFrame(s);
  // parámetros ficticios del estudio
  const keys = [...fr.partyKeys, ...presidentialOptions(s).map((x) => x.key)];
  const hid = o.privateFor ? 'privado' : p.id;
  let house = pol.house[hid];
  if (!house || house.methodFrom !== method.from) house = pol.house[hid] = initHouse(rng, method.from, keys);
  else evolveHouse(house, rng, keys);
  const n = o.nOverride ?? rng.int(method.sample[0], method.sample[1]);
  const sample = drawSample(s, fr, rng, { method, n, regions: o.regionId ? [o.regionId] : undefined, cuts: o.cuts });
  const effN = sample.n / (baseDesignEffect(method) * sample.deffW);
  const toE = weeksTo(s);
  const c: AskCtx = { s, fr, rng, sample, house, common: pol.common, commonApproval: pol.commonApproval, method, effN, weeksToElection: toE, national: !o.regionId && !o.cuts };
  const veda = !o.privateFor && !!vedaFor(s);
  const qs: SurveyQuestion[] = [];
  const want = (t: SurveyTopic) => (o.forceTopics ? o.forceTopics.includes(t) : p.topics.includes(t) && rng.chance(p.topicRate[t] ?? 0.4));
  const pres = nextNational(s, ['presidencial']);
  const presW = pres ? pres.week - s.week : 999;
  // ── Política nacional
  if (o.forceTopics ? o.forceTopics.includes('aprobacion') : p.topics.includes('aprobacion')) qs.push(askApproval(c));
  if (want('evaluacion_gobierno')) qs.push(askGovGrade(c));
  // ── Módulo electoral (sujeto a veda)
  if (!veda) {
    const dip = nextNational(s, ['diputados']);
    const partyLabels = Object.fromEntries(fr.partyKeys.map((k) => [k, s.parties[k]?.short ?? k]));
    const partyQ = o.forceTopics ? o.forceTopics.includes('partidos') : p.coverage === 'regional' || ((p.topics.includes('partidos') || (dip && dip.week - s.week <= 30)) && rng.chance(p.topicRate.partidos ?? 0.5));
    if (partyQ) qs.push(askVote(c, { id: 'partidos', topic: 'partidos', text: 'Si este domingo fueran las elecciones de diputadas y diputados, ¿por cuál partido votaría?', keys: fr.partyKeys, p: fr.partyP, labels: partyLabels, likelyVoter: false }));
    const presTopics = o.forceTopics ? o.forceTopics.some((t) => t.startsWith('presidencial') || t === 'segunda_vuelta') : p.topics.includes('presidencial_lista') && presW <= 52 && p.coverage === 'nacional';
    if (presTopics) {
      const opts = presidentialOptions(s);
      if (opts.length >= 2) {
        const cp = candidateProbs(s, fr, opts);
        const labels = Object.fromEntries(opts.map((x) => [x.key, name(s, x.key)]));
        if (p.topics.includes('presidencial_espontanea') && presW <= 70 && rng.chance(0.6)) {
          const recall = Object.fromEntries(opts.map((x) => [x.key, clamp(0.25 + 0.7 * (s.characters[x.key].rep.reconocimiento / 100), 0.1, 0.95)]));
          qs.push(askVote(c, { id: 'presidencial_espontanea', topic: 'presidencial_espontanea', text: 'Si las elecciones presidenciales fueran este domingo, ¿por quién votaría? (pregunta abierta, sin lista)', keys: cp.keys, p: cp.p, labels, spontaneous: recall }));
        }
        qs.push(askVote(c, { id: 'presidencial_lista', topic: 'presidencial_lista', text: 'De la siguiente lista de candidaturas, ¿por quién votaría para Presidente/a?', keys: cp.keys, p: cp.p, labels }));
        if (presW <= 40) {
          // la encuestadora elige el par según la información PÚBLICA (promedio de encuestas), no el estado oculto
          const agg = latestAggregate(s, 'presidencial_lista');
          const top = agg ? Object.entries(agg.values).filter(([k]) => labels[k]).sort((a, b) => b[1].mean - a[1].mean).slice(0, 2).map(([k]) => k) : cp.keys.slice(0, 2);
          if (top.length === 2) {
            const pair = presidentialOptions(s, top);
            const pp = candidateProbs(s, fr, pair);
            qs.push({ ...askVote(c, { id: `segunda_vuelta_${top.join('_')}`, topic: 'segunda_vuelta', text: `Si hubiera segunda vuelta entre ${labels[top[0]]} y ${labels[top[1]]}, ¿por quién votaría? (escenario hipotético)`, keys: pp.keys, p: pp.p, labels, hypothetical: true }), subject: top.join('|') });
          }
          if (rng.chance(0.35)) qs.push(askRejection(c, cp.keys, cp.p, labels));
          if (rng.chance(0.3)) qs.push(askTurnoutIntent(c));
        }
      }
    }
    // Entre vueltas: segunda vuelta real con las dos candidaturas finalistas
    const run2 = nextNational(s, ['presidencial_2v']);
    const first = [...s.results].reverse().find((r) => r.type === 'presidencial');
    if (run2 && first?.winnerId && first.runnerUpId && first.week < s.week && p.coverage === 'nacional' && (o.forceTopics ? o.forceTopics.includes('segunda_vuelta') : p.topics.includes('segunda_vuelta'))) {
      const pair = [first.winnerId, first.runnerUpId].filter((id) => s.characters[id]?.status === 'activo');
      if (pair.length === 2) {
        const opts = presidentialOptions(s, pair);
        const pp = candidateProbs(s, fr, opts);
        const labels = Object.fromEntries(pair.map((id) => [id, name(s, id)]));
        if (pp.keys.length === 2) qs.push({ ...askVote(c, { id: `segunda_vuelta_${pair.join('_')}`, topic: 'segunda_vuelta', text: `En la segunda vuelta entre ${labels[pair[0]]} y ${labels[pair[1]]}, ¿por quién votará?`, keys: pp.keys, p: pp.p, labels }), subject: pair.join('|') });
      }
    }
  }
  // ── Otras temáticas
  if (want('identificacion')) qs.push(askIdentification(c));
  if (want('confianza')) qs.push(...askTrust(c));
  if (want('economia')) qs.push(askEconomy(c));
  if (want('problemas')) qs.push(askProblems(c));
  if (want('seguridad')) qs.push(askSecurity(c));
  if (want('expectativas')) qs.push(askExpectations(c));
  if (want('politica_publica')) { const b = salientBill(s); const q = b ? askPolicy(c, b) : null; if (q) qs.push(q); }
  if (want('figuras')) { const f = o.figures ?? figuresFor(s, o.regionId); qs.push(...askFigures(c, f)); }
  const fieldDays = method.mode === 'presencial' ? rng.int(35, 55) : method.mode === 'cati_celulares' ? rng.int(3, 4) : rng.int(2, 5);
  const fieldEnd = method.mode === 'presencial' ? s.week - rng.int(2, 4) : s.week;
  const id = newId(s, 'enc');
  const edition = o.privateFor ? 0 : (pol.editions[p.id] = (pol.editions[p.id] ?? 0) + 1);
  const survey: Survey = {
    id, pollsterId: o.privateFor ? 'privado' : p.id, edition, publishedWeek: s.week, fieldEndWeek: fieldEnd, fieldStartWeek: fieldEnd - Math.ceil(fieldDays / 7) + 1, fieldDays,
    coverage: o.cuts ? 'comunal' : o.regionId ? 'regional' : 'nacional', territory: o.regionId || o.cuts ? { regionId: o.regionId, label: o.territoryLabel ?? (o.regionId ? REGION_BY_ID[o.regionId].name : '') } : undefined,
    universe: o.regionId ? `${method.universe} — ${o.territoryLabel ?? REGION_BY_ID[o.regionId].name}` : method.universe, mode: method.mode, design: method.design, weighting: method.weighting, n: sample.n,
    uncertainty: uncertaintyFor(method.design, effN), methodNote: method.note, questions: qs, veda, flash: o.flash, privateFor: o.privateFor, headline: '', reactions: [],
  };
  survey.headline = headlineOf(s, survey);
  return survey;
}

export function previousOf(s: GameState, sv: Survey): Survey | undefined {
  return [...s.polling!.surveys].reverse().find((x) => x.pollsterId === sv.pollsterId && x.id !== sv.id && x.publishedWeek <= sv.publishedWeek && x.coverage === sv.coverage && !x.privateFor);
}
export function questionIn(sv: Survey | undefined, id: string) { return sv?.questions.find((q) => q.id === id); }
export function pctOf(q: SurveyQuestion | undefined, key: string) { return q?.options.find((o) => o.key === key)?.pct; }

function headlineOf(s: GameState, sv: Survey): string {
  const prev = previousOf(s, sv);
  const pres = sv.questions.find((q) => q.topic === 'presidencial_lista');
  if (pres) { const [a, b] = pres.options; if (a && b && a.key !== 'ns') return `${a.label} ${a.pct.toFixed(0)}% · ${b.label} ${b.pct.toFixed(0)}% en primera vuelta`; }
  // El titular destaca el hallazgo más llamativo de la edición, no siempre la aprobación
  const cands: { score: number; text: string }[] = [];
  for (const q of sv.questions) {
    const pq = questionIn(prev, q.id);
    if (q.topic === 'figuras' && q.subject && s.characters[q.subject]) {
      const pos = pctOf(q, 'pos') ?? 0; const d = pq ? pos - (pctOf(pq, 'pos') ?? pos) : 0;
      const ch = s.characters[q.subject];
      if (Math.abs(d) >= 4) cands.push({ score: Math.abs(d), text: `${ch.firstName} ${ch.lastName.split(' ')[0]} ${d > 0 ? 'sube' : 'cae'} ${Math.abs(d).toFixed(0)} puntos en evaluación positiva (${pos.toFixed(0)}%)` });
      if (q.subject === s.player.characterId) cands.push({ score: 6, text: `Primera medición pública de ${ch.firstName} ${ch.lastName.split(' ')[0]}: ${(100 - (pctOf(q, 'nc') ?? 100)).toFixed(0)}% lo/la conoce` });
    }
    if (q.topic === 'problemas' && q.options[0]) cands.push({ score: 1.5, text: `${q.options[0].label} lidera las preocupaciones ciudadanas (${q.options[0].pct.toFixed(0)}%)` });
    if (q.id === 'economia') { const v = pctOf(q, 'mala') ?? 0; const d = pq ? v - (pctOf(pq, 'mala') ?? v) : 0; cands.push({ score: 1 + Math.abs(d) / 2, text: `${v.toFixed(0)}% califica como mala la situación económica` }); }
    if (q.id === 'seguridad') cands.push({ score: 1.2, text: `${(pctOf(q, 'inseguro') ?? 0).toFixed(0)}% se siente inseguro/a en su barrio` });
    if (q.id === 'expectativas') cands.push({ score: 1.1, text: `${(pctOf(q, 'malo') ?? 0).toFixed(0)}% cree que el país va por mal camino` });
    if (q.topic === 'politica_publica' && q.subject) { const f = pctOf(q, 'favor') ?? 0; cands.push({ score: 1.6, text: `${f.toFixed(0)}% apoya «${q.subject}»` }); }
    if (q.topic === 'confianza' && q.subject === 'Congreso') cands.push({ score: 1, text: `Solo ${(pctOf(q, 'confia') ?? 0).toFixed(0)}% confía en el Congreso` });
  }
  const ap = questionIn(sv, 'aprobacion');
  if (ap) {
    const v0 = pctOf(ap, 'aprueba')!; const b0 = pctOf(questionIn(prev, 'aprobacion'), 'aprueba');
    cands.push({ score: b0 !== undefined ? 1.3 + Math.abs(v0 - b0) / 1.5 : 1.3, text: '' });
  }
  const best = cands.sort((a, b) => b.score - a.score)[0];
  if (best && best.text) return best.text;
  if (ap) {
    const v = pctOf(ap, 'aprueba')!; const before = pctOf(questionIn(prev, 'aprobacion'), 'aprueba');
    const d = before !== undefined ? v - before : null;
    return `Aprobación presidencial ${v.toFixed(0)}%${d !== null ? ` (${d >= 0 ? '+' : ''}${d.toFixed(0)} respecto de la medición anterior)` : ''}`;
  }
  const party = questionIn(sv, 'partidos');
  if (party) { const [a] = party.options; return `${a.label} encabeza la intención de voto por partido con ${a.pct.toFixed(0)}%`; }
  return `${PROFILE_BY_ID[sv.pollsterId]?.name ?? 'Estudio'}: ${sv.questions.length} preguntas`;
}

/** Registros heredados (s.polls) que leen la IA y otros sistemas: misma información pública. */
export function legacyPolls(s: GameState, sv: Survey): Poll[] {
  const out: Poll[] = [];
  const mk = (kind: Poll['kind'], values: Record<string, number>, undecided: number, effN: number): Poll => ({ id: newId(s, 'p'), week: sv.fieldEndWeek, pollster: sv.pollsterId, sample: sv.n, moe: sv.uncertainty.pp, kind, values, undecided, effN });
  const ap = questionIn(sv, 'aprobacion');
  if (ap) out.push(mk('aprobacion', { aprueba: pctOf(ap, 'aprueba') ?? 0, desaprueba: pctOf(ap, 'desaprueba') ?? 0 }, pctOf(ap, 'ns') ?? 0, ap.effN));
  for (const [qid, kind] of [['partidos', 'partidos'], ['presidencial_lista', 'presidencial']] as const) {
    const q = questionIn(sv, qid); if (!q) continue;
    const v: Record<string, number> = {}; for (const o of q.options) if (o.key !== 'ns' && o.key !== 'ninguno') v[o.key] = o.pct;
    out.push(mk(kind, v, (pctOf(q, 'ns') ?? 0) + (pctOf(q, 'ninguno') ?? 0), q.effN));
  }
  return out;
}
