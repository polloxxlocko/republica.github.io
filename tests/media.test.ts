import { describe, expect, it } from 'vitest';
import { newGame } from './helpers';
import { advanceWeek, dispatch } from '../src/game/engine/game';
import { Rng, seedRng } from '../src/game/engine/rng';
import { addNews } from '../src/game/systems/news';
import { MEDIA_NOTICE, OUTLETS, OUTLET_BY_ID, STUDIES, perceptionAt, perceivedLean } from '../src/game/media/registry';
import { coverScore, weeklyCoverage, buildItem, covHeadline } from '../src/game/media/coverage';
import { applyCoverageEffects } from '../src/game/media/effects';
import { homeCut } from '../src/game/career/capital';
import type { GameState } from '../src/game/models/types';

const fresh = (seed = 42) => structuredClone(newGame({}, seed));
const lastEvent = (s: GameState) => s.media!.events[s.media!.events.length - 1];

describe('Ecosistema de medios', () => {
  it('1-2. cada medio tiene datos verificables y las percepciones se atribuyen a estudios', () => {
    for (const o of OUTLETS) {
      expect(o.name && o.type && o.scope && o.coverageTopics).toBeTruthy();
      expect(o.activeEvidence.source).toMatch(/^https:\/\//);
      if (o.founded) expect(o.founded.source).toMatch(/^https:\/\//);
      if (o.owner) expect(o.owner.source).toMatch(/^https:\/\//);
      if (o.scope !== 'nacional') expect(o.regionId).toBeTruthy();
      for (const p of o.perception) {
        expect(STUDIES[p.studyId]?.url).toMatch(/^https:\/\//);
        expect(Math.abs(p.left + p.center + p.right - 100)).toBeLessThan(1.5);
      }
      for (const c of o.credibility) expect(STUDIES[c.studyId]).toBeTruthy();
      // sin estudio no hay orientación asignada
      if (!o.perception.length) expect(perceivedLean(o, '2026-11-01')).toBeNull();
    }
    for (const id of ['elmercurio', 'latercera', 'emol', 'df', 'elmostrador', 'ciper', 'theclinic', 'eldesconcierto', 'ellibero', 'exante', 'biobio', 'cooperativa', 'adn', 'agricultura', 'cnnchile', 'tvn', 'canal13', 'mega', 'chv']) expect(OUTLET_BY_ID[id]).toBeTruthy();
    expect(OUTLETS.filter((o) => o.scope !== 'nacional').length).toBeGreaterThanOrEqual(10);
  });

  it('3-4. la cobertura se origina en hechos de la partida y conserva el hecho en el titular', () => {
    let s = newGame();
    for (let i = 0; i < 12; i++) s = advanceWeek(s).state;
    const m = s.media!;
    const ids = new Set(m.events.map((e) => e.id));
    const news = new Set(s.news.map((n) => n.id));
    expect(m.coverage.length).toBeGreaterThan(0);
    for (const c of m.coverage) {
      expect(ids.has(c.eventId)).toBe(true);
      const e = m.events.find((x) => x.id === c.eventId)!;
      expect(covHeadline(e, c).endsWith(e.headline)).toBe(true); // mismo hecho, a lo más un antetítulo de enfoque
    }
    for (const e of m.events.filter((x) => s.week - x.week < 20)) expect(news.has(e.newsId)).toBe(true);
  }, 120000);

  it('5-6. los medios no son extensiones de partidos y cubren críticamente a distintos sectores', () => {
    const s = fresh(); const rng = new Rng(seedRng(5));
    const right = OUTLET_BY_ID.elmercurio; const left = OUTLET_BY_ID.ciper;
    // hecho favorable a la izquierda: un medio percibido de derecha también lo cubre y no siempre en tono crítico
    let pos = 0, neg = 0;
    for (let i = 0; i < 40; i++) {
      addNews(s, rng, 'congreso', `Es ley: proyecto social ${i}`, 'Aprobado con votos de la izquierda.', 4, -1, 1);
      const it = buildItem(s, rng, right, lastEvent(s)); if (it.tone > 0.2) pos++; if (it.tone < -0.2) neg++;
    }
    expect(pos).toBeGreaterThan(neg);
    // escándalo que perjudica a la derecha: el medio percibido de derecha lo cubre críticamente; y viceversa
    addNews(s, rng, 'partidos', 'Fiscalía investiga irregularidades en un partido de derecha', 'Denuncia por financiamiento.', 4, -1, -1);
    const eR = lastEvent(s);
    addNews(s, rng, 'partidos', 'Fiscalía investiga irregularidades en un partido de izquierda', 'Denuncia por financiamiento.', 4, 1, -1);
    const eL = lastEvent(s);
    let critR = 0, critL = 0;
    for (let i = 0; i < 30; i++) { if (buildItem(s, rng, right, eR).tone < 0) critR++; if (buildItem(s, rng, left, eL).tone < 0) critL++; }
    expect(critR).toBeGreaterThan(20);
    expect(critL).toBeGreaterThan(20);
    expect(eR.frames).toContain('transparencia');
    expect(coverScore(s, left, eL)).toBeGreaterThan(0.2); // la investigación cubre a todos los sectores
  });

  it('7-8. la cobertura responde a la relevancia territorial y la difusión es coherente', () => {
    const s = fresh(); const rng = new Rng(seedRng(9));
    const me = s.characters[s.player.characterId]; // Concepción (Biobío)
    addNews(s, rng, 'jugador', `${me.firstName} ${me.lastName} organiza una asamblea vecinal`, 'Actividad en su comuna.', 2, 0, 1, { actors: [me.id], cut: homeCut(s) });
    const e = lastEvent(s);
    expect(e.scope).toBe('provincial');
    const local = coverScore(s, OUTLET_BY_ID.elsur, e); const national = coverScore(s, OUTLET_BY_ID.latercera, e); const other = coverScore(s, OUTLET_BY_ID.mercurioantofagasta, e);
    expect(local).toBeGreaterThan(national * 3);
    expect(other).toBe(0);
    // difusión: el nivel nunca baja y lo recogido proviene de un ámbito menor
    let st = s;
    for (let i = 0; i < 4; i++) { const before = st.media!.events.map((x) => x.stage); st.week++; weeklyCoverage(st, rng); st.media!.events.forEach((x, k) => expect(['provincial', 'regional', 'nacional'].indexOf(x.stage)).toBeGreaterThanOrEqual(['provincial', 'regional', 'nacional'].indexOf(before[k]))); }
    for (const c of st.media!.coverage.filter((x) => x.pickedUp)) {
      const ev = st.media!.events.find((x) => x.id === c.eventId)!;
      expect(ev.stage).not.toBe(ev.scope);
    }
    void st;
  });

  it('9. los periodistas ficticios recuerdan las interacciones', () => {
    let s = fresh(); const rng = new Rng(seedRng(3));
    const j = s.media!.journalists[0];
    s.media!.invites.push({ id: 'inv1', journalistId: j.id, outletId: j.outletId, week: s.week, expiresWeek: s.week + 2, reason: 'prueba', status: 'pendiente' });
    s = dispatch(s, { type: 'rechazar_entrevista', inviteId: 'inv1' }).state;
    const j1 = s.media!.journalists[0];
    expect(j1.relation).toBeLessThan(0);
    expect(j1.history.some((h) => h.kind === 'rechazo')).toBe(true);
    s.media!.invites.push({ id: 'inv2', journalistId: j.id, outletId: j.outletId, week: s.week, expiresWeek: s.week + 2, reason: 'prueba', status: 'pendiente' });
    s = dispatch(s, { type: 'aceptar_entrevista', inviteId: 'inv2' }).state;
    for (let k = 0; k < 6; k++) {
      const inv = s.media!.invites.find((i) => i.id === 'inv2')!;
      const idx = inv.questions!.findIndex((q) => !q.answer); if (idx < 0) break;
      s = dispatch(s, { type: 'responder_entrevista', inviteId: 'inv2', index: idx, answer: 'datos' }).state;
    }
    const inv = s.media!.invites.find((i) => i.id === 'inv2')!;
    expect(inv.status).toBe('realizada');
    expect(s.media!.journalists[0].history.some((h) => h.kind === 'entrevista')).toBe(true);
    expect(s.media!.appearances.some((a) => a.kind === 'entrevista')).toBe(true);
    void rng;
  });

  it('10. aparecer en medios da conocimiento, pero no popularidad automática', () => {
    const s = fresh(); const rng = new Rng(seedRng(11));
    const me = s.characters[s.player.characterId];
    me.rep.reconocimiento = 55; me.rep.popularidad = 50;
    addNews(s, rng, 'jugador', `Fiscalía investiga denuncia contra ${me.firstName} ${me.lastName}`, 'Cuestionamientos por uso de recursos.', 4, 0, -1, { actors: [me.id] });
    const e = lastEvent(s);
    const items = ['latercera', 'biobio', 'mega', 'ciper'].map((id) => { const it = buildItem(s, rng, OUTLET_BY_ID[id], e); it.tone = Math.min(it.tone, -0.5); return it; });
    applyCoverageEffects(s, rng, items);
    expect(me.rep.reconocimiento).toBeGreaterThan(55);
    expect(me.rep.popularidad).toBeLessThan(50);
  });

  it('11-12. ficción rotulada y perfiles fechados según el estudio vigente', () => {
    expect(MEDIA_NOTICE).toMatch(/ficticios/);
    const merc = OUTLET_BY_ID.elmercurio;
    expect(perceptionAt(merc, '2025-06-01')!.studyId).toBe('pucv2025');
    expect(perceptionAt(merc, '2026-11-01')!.studyId).toBe('pucv2026');
    expect(perceptionAt(merc, '2024-01-01')).toBeNull();
    expect(perceptionAt(OUTLET_BY_ID.ellibero, '2025-06-01')).toBeNull(); // El Líbero no figura en el estudio 2025
    // los medios ficticios que surgen en la partida se identifican como tales
    let s = newGame({}, 2);
    s.media!.audience = {};
    for (let i = 0; i < 52 * 4; i++) s = advanceWeek(s).state;
    for (const f of s.media!.fictional) expect(f.name).toMatch(/ficticio/);
    for (const h of s.media!.altHistory) expect(h.text).toMatch(/ficticio|Historia alternativa|No es un dato real/);
  }, 600000);
});
