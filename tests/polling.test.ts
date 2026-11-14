import { describe, expect, it } from 'vitest';
import { newGame } from './helpers';
import { advanceWeek } from '../src/game/engine/game';
import { Rng, seedRng } from '../src/game/engine/rng';
import { POLLSTER_PROFILES, PROFILE_BY_ID, SIMULATION_NOTICE } from '../src/game/polling/registry';
import { buildSurvey } from '../src/game/polling/publisher';
import { getFrame } from '../src/game/polling/sampling';
import { aggregate } from '../src/game/polling/aggregator';
import { scheduleNext, due, vedaFor } from '../src/game/polling/scheduler';
import { reactToSurvey } from '../src/game/polling/reactions';
import { pollAverage } from '../src/game/systems/polls';
import { orderPrivate } from '../src/game/polling/private';
import { HISTORICAL_SURVEYS } from '../src/data/polling/historicalSurveys';
import type { GameState } from '../src/game/models/types';
import type { Survey } from '../src/game/polling/types';

const run = (s: GameState, weeks: number) => { for (let i = 0; i < weeks; i++) s = advanceWeek(s).state; return s; };
const approvalOf = (sv: Survey) => sv.questions.find((q) => q.id === 'aprobacion')?.options.find((o) => o.key === 'aprueba')?.pct;

describe('Sistema de encuestas', () => {
  it('1-2. cada estudio tiene perfil documentado y calendario propio configurable', () => {
    for (const p of POLLSTER_PROFILES) {
      expect(p.name && p.organization && p.periodicity && p.activeSince).toBeTruthy();
      expect(p.topics.length).toBeGreaterThan(0);
      expect(p.methods.length).toBeGreaterThan(0);
      for (const m of p.methods) { expect(m.note.length).toBeGreaterThan(10); if (p.real) expect(m.source).toMatch(/^https:\/\//); }
      if (p.real) expect(p.sources.length).toBeGreaterThan(0);
    }
    expect(new Set(POLLSTER_PROFILES.map((p) => p.schedule.everyWeeks)).size).toBeGreaterThan(2); // no hay frecuencia universal
    expect(PROFILE_BY_ID.cadem.methods.map((m) => m.mode)).toEqual(['cati_celulares', 'online_panel']); // cambio metodológico 2026
    const s = structuredClone(newGame());
    const custom = { ...PROFILE_BY_ID.criteria, id: 'x', schedule: { everyWeeks: 3, campaignEveryWeeks: 3, flashInCrisis: 0, offset: 0 } };
    scheduleNext(s, new Rng(s.rng), custom);
    expect(s.polling!.nextDue.x).toBe(s.week + 3);
    expect(due(s, new Rng(s.rng), custom)).toBe(false);
  });

  it('3-5. las encuestas miden el electorado sintético, difieren entre sí y sus diferencias no son arbitrarias', () => {
    const s = structuredClone(newGame());
    // el marco reproduce la intención del motor
    const fr = getFrame(s);
    let tot = 0; const sum: Record<string, number> = {};
    fr.segs.forEach((seg, i) => { const v = seg.voters * fr.turnout[i]; const p = fr.partyP(i); fr.partyKeys.forEach((k, j) => { sum[k] = (sum[k] ?? 0) + v * p[j]; tot += v * p[j]; }); });
    for (const k of Object.keys(s.nationalIntention)) expect(Math.abs((sum[k] ?? 0) / tot * 100 - s.nationalIntention[k])).toBeLessThan(0.6);
    // la aprobación encuestada sigue al estado subyacente
    const rng = new Rng([1, 2, 3, 4]);
    const measure = (appr: number) => { s.opinion.presidentialApproval = appr; delete (s as Partial<GameState>).polling; s.polling = { surveys: [], house: {}, common: {}, commonApproval: 0, nextDue: {}, editions: {}, orders: [], evaluations: [], lastPrivateWeek: -9 }; s.week += 1; return approvalOf(buildSurvey(s, rng, PROFILE_BY_ID.cep, { nOverride: 6000, forceTopics: ['aprobacion'] }))!; };
    const lo = measure(25); const hi = measure(60);
    expect(hi - lo).toBeGreaterThan(25);
    expect(Math.abs(hi / (1 - 0.05) - 60)).toBeLessThan(7); // NS ~5% en presencial
    // estudios distintos, misma semana: resultados distintos
    const a = approvalOf(buildSurvey(s, rng, PROFILE_BY_ID.cadem, { forceTopics: ['aprobacion'] }))!;
    const b = approvalOf(buildSurvey(s, rng, PROFILE_BY_ID.pulso, { forceTopics: ['aprobacion'] }))!;
    expect(a).not.toBeCloseTo(b, 3);
    expect(Math.abs(a - b)).toBeLessThan(15);
  });

  it('6-7. no hay porcentajes imposibles y los indecisos se contabilizan', () => {
    const s = run(newGame(), 12);
    for (const sv of s.polling!.surveys) for (const q of sv.questions) {
      for (const o of q.options) { expect(o.pct).toBeGreaterThanOrEqual(0); expect(o.pct).toBeLessThanOrEqual(100); expect(Number.isFinite(o.pct)).toBe(true); }
      if (q.topic !== 'problemas') expect(Math.abs(q.options.reduce((x, o) => x + o.pct, 0) - 100)).toBeLessThan(0.6); // redondeo a 0,1
      if (q.topic === 'partidos') { expect(q.options.some((o) => o.key === 'ns')).toBe(true); expect(q.base).toBe(sv.n); }
    }
  }, 120000);

  it('8. las estimaciones territoriales exigen submuestras suficientes y la cobertura queda declarada', () => {
    const s = run(newGame(), 6);
    for (const sv of s.polling!.surveys) {
      if (!sv.privateFor) expect(sv.coverage).not.toBe('comunal');
      for (const q of sv.questions) for (const t of q.territorial ?? []) expect(t.n).toBeGreaterThanOrEqual(200);
    }
    s.player.personalFunds = 100;
    expect(orderPrivate(s, 'sondeo_comunal')).toMatch(/Encargaste/);
    const s2 = run(s, 3);
    const priv = s2.polling!.surveys.filter((x) => x.privateFor);
    expect(priv.length).toBe(1);
    expect(priv[0].coverage).toBe('comunal');
    expect(priv[0].questions.some((q) => q.territorial)).toBe(false);
    expect(s2.polls.some((p) => p.pollster === 'privado')).toBe(false); // lo privado no llega a la IA
  }, 120000);

  it('9. el promedio no se deja dominar por una encuestadora que publica más seguido', () => {
    const ms = [
      ...Array.from({ length: 10 }, (_, i) => ({ house: 'A', week: 20 - i * 0.5, n: 1000, effN: 500, values: { x: 60 } })),
      { house: 'B', week: 20, n: 1000, effN: 500, values: { x: 40 } },
      { house: 'C', week: 19, n: 1000, effN: 500, values: { x: 50 } },
    ];
    const agg = aggregate(ms, { asOf: 20, adjustHouse: false })!;
    const naive = ms.reduce((a, m) => a + m.values.x, 0) / ms.length;
    expect(naive).toBeGreaterThan(56);
    expect(agg.values.x.mean).toBeLessThan(54);
    expect(agg.values.x.low).toBeLessThan(agg.values.x.mean);
    expect(agg.houses.find((h) => h.house === 'A')!.share).toBeLessThan(0.5);
  });

  it('10. la IA reacciona a publicaciones relevantes según personalidad y contexto (no siempre)', () => {
    const base = newGame({}, 42);
    const rate = (cohesion: number) => { let reacted = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = structuredClone(base);
      const p = Object.values(s.parties).find((x) => x.active && x.leaderId)!;
      p.cohesion = cohesion;
      const mk = (week: number, v: number, house: string): Survey => ({ id: `t${week}${house}`, pollsterId: house, edition: 1, publishedWeek: week, fieldStartWeek: week, fieldEndWeek: week, fieldDays: 3, coverage: 'nacional', universe: '', mode: 'online_panel', design: 'no_probabilistico', weighting: [], n: 1000, uncertainty: { kind: 'orientativo', pp: 4, text: '' }, methodNote: '', headline: '', reactions: [],
        questions: [{ id: 'partidos', topic: 'partidos', text: '', base: 1000, effN: 500, options: [{ key: p.id, label: p.short, pct: v }, { key: 'otro', label: 'otro', pct: 100 - v }] }] });
      s.week = 20;
      for (const h of ['cadem', 'pulso', 'criteria']) { s.polling!.surveys.push(mk(8, 20, h), mk(10, 20, h), mk(19, 12, h), mk(20, 11, h)); }
      const before = p.cohesion;
      const sv = s.polling!.surveys[s.polling!.surveys.length - 1];
      reactToSurvey(s, new Rng(seedRng(seed * 7919)), sv);
      expect(sv.reactions.length).toBeGreaterThan(0); // al menos se registra la lectura
      if (s.parties[p.id].cohesion < before) reacted++;
    } return reacted / 40; };
    const tense = rate(35); const calm = rate(85);
    expect(tense).toBeGreaterThan(0);
    expect(tense).toBeLessThan(1);      // no es automático
    expect(calm).toBeLessThan(tense);   // depende del contexto interno
  });

  it('11-12. la información visible es pública e imperfecta y se rotula como ficticia', () => {
    const s = run(newGame(), 10);
    const avg = pollAverage(s, 'partidos');
    const hidden = structuredClone(s.nationalIntention);
    for (const k of Object.keys(s.nationalIntention)) s.nationalIntention[k] = 99;
    expect(pollAverage(s, 'partidos')).toEqual(avg); // el promedio no lee el estado oculto
    const diffs = Object.keys(avg).map((k) => Math.abs(avg[k] - (hidden[k] ?? 0)));
    expect(Math.max(...diffs)).toBeGreaterThan(0.3);
    expect(SIMULATION_NOTICE).toMatch(/Encuesta ficticia generada por REPÚBLICA: CHILE/);
    for (const n of s.news.filter((x) => x.category === 'encuestas')) expect(n.headline).toMatch(/simulada/);
  }, 120000);

  it('13. los datos históricos reales están separados y no se modifican', () => {
    const snap = JSON.stringify(HISTORICAL_SURVEYS);
    run(newGame(), 4);
    expect(Object.isFrozen(HISTORICAL_SURVEYS)).toBe(true);
    expect(JSON.stringify(HISTORICAL_SURVEYS)).toBe(snap);
  }, 60000);

  it('veda: sin preguntas electorales dentro de los 15 días previos a una elección', () => {
    let s = newGame();
    const e = s.calendar.find((x) => x.type === 'alcaldes' || x.type === 'diputados')!;
    while (s.week < e.week - 1) s = advanceWeek(s).state;
    expect(vedaFor(s)).not.toBeNull();
    s = advanceWeek(s).state;
    const lastWeek = s.polling!.surveys.filter((x) => x.publishedWeek === s.week - 1 || x.publishedWeek === s.week);
    for (const sv of lastWeek.filter((x) => x.veda)) expect(sv.questions.some((q) => ['partidos', 'presidencial_lista', 'segunda_vuelta', 'presidencial_espontanea'].includes(q.topic))).toBe(false);
  }, 400000);
});
