/**
 * PRUEBAS DE JUGABILIDAD (§16). Simulan carreras completas con un jugador automatizado activo y
 * varias semillas. No miden solo el número de eventos: miden variedad, ritmo, continuidad de las
 * historias, autonomía de los personajes, consecuencias, fracasos posibles y ausencia de situaciones
 * imposibles. Etapas: primeros seis meses, primer año, tres años, primera candidatura, primera
 * derrota, primer cargo y diez años de trayectoria.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { playCareer, type Metrics } from './playtest';
import { newGame } from './helpers';
import { advanceWeek, dispatch } from '../src/game/engine/game';
import { LIBRARY, ALL_EVENTS, EVENT_BY_ID } from '../src/game/politics/engine';
import { ARCS } from '../src/game/politics/arcs';
import { INITIATIVES } from '../src/game/politics/initiatives';
import { serialize, deserialize } from '../src/persistence/saveFormat';
import type { GameState } from '../src/game/models/types';

const CONFLICT = new Set(['a_conflicto_militantes', 'a_dirigente_cuestiona', 'b_competencia_dirigentes', 'b_nueva_faccion', 'c_rival_acuerdo', 'c_incumple', 'c_cambio_partido', 'g_dirigente_responde', 'c_contactos_incompatibles']);
const runs: { seed: number; s: GameState; m: Metrics }[] = [];

beforeAll(() => {
  for (const [seed, regionId, comuna, partyId] of [[3, 'BI', 'Concepción', 'PS'], [11, 'NB', 'Chillán', 'RN'], [19, 'VA', 'Valparaíso', 'FA']] as const) {
    const r = playCareer(seed, 156, { regionId, comuna, partyId });
    runs.push({ seed, ...r });
  }
}, 900000);

describe('Biblioteca y estructura', () => {
  it('al menos 80 acontecimientos en 8 categorías, con condiciones, opciones y enfriamiento', () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(80);
    const cats = new Set(LIBRARY.map((d) => d.cat)); expect(cats.size).toBe(8);
    for (const c of cats) expect(LIBRARY.filter((d) => d.cat === c).length).toBeGreaterThanOrEqual(10);
    for (const d of ALL_EVENTS) { expect(d.options.length).toBeGreaterThanOrEqual(2); expect(d.cooldown).toBeGreaterThan(0); expect(typeof d.require).toBe('function'); }
    expect(ARCS.length).toBeGreaterThanOrEqual(10);
    expect(INITIATIVES.length).toBeGreaterThanOrEqual(6);
  });
});

describe('Carreras simuladas (3 semillas × 3 años)', () => {
  it('1 · decisiones variadas: muchas situaciones distintas cada año, sin una categoría dominante', () => {
    for (const { m } of runs) {
      for (const u of m.uniqueByYear) expect(u).toBeGreaterThanOrEqual(20);
      expect(m.maxCategoryShare).toBeLessThan(0.35);
    }
  });
  it('2 · aparecen oportunidades relevantes con regularidad (ritmo de 1–3 semanas en promedio)', () => {
    for (const { m } of runs) {
      const relevant = m.decisions.filter((d) => d.tier !== 'cotidiano').length;
      expect(relevant / 3).toBeGreaterThanOrEqual(15);
      expect(m.activeGapsMean).toBeLessThanOrEqual(3);
    }
  });
  it('3 · los personajes actúan por su cuenta (movimientos registrados)', () => {
    for (const { m } of runs) expect(m.npcMoves).toBeGreaterThanOrEqual(45);
  });
  it('4 · las acciones producen consecuencias persistentes (memoria, compromisos, relaciones)', () => {
    for (const { s } of runs) {
      expect(s.dialogue!.memories.filter((x) => x.about === s.player.characterId).length).toBeGreaterThanOrEqual(8); // los recuerdos menores se consolidan
      expect(s.dialogue!.commitments.length).toBeGreaterThan(0);
      expect(Object.values(s.dialogue!.rel).filter((r) => r.to === s.player.characterId && Math.max(Math.abs(r.trust), r.rivalry, Math.abs(r.cooperation), Math.abs(r.respect), Math.abs(r.reliability)) > 6).length).toBeGreaterThanOrEqual(3);
    }
  });
  it('5 · las historias continúan durante varios turnos y se resuelven de distintas maneras', () => {
    const resolutions = new Set(runs.flatMap((r) => r.m.arcResolutions));
    for (const { m } of runs) { expect(m.arcsMultiTurn).toBeGreaterThanOrEqual(3); expect(m.arcsResolved).toBeGreaterThanOrEqual(2); }
    expect(resolutions.size).toBeGreaterThanOrEqual(6);
  });
  it('6 · los acontecimientos responden al contexto (región, partido, cargo)', () => {
    const sets = runs.map((r) => new Set(r.m.decisions.map((d) => d.defId)));
    const inter = [...sets[0]].filter((x) => sets[1].has(x) && sets[2].has(x)).length;
    expect(inter / sets[0].size).toBeLessThan(0.9); // no es la misma secuencia con otros nombres
    // un/a independiente no recibe acontecimientos de vida partidaria interna
    let s = newGame({ partyId: null as never, regionId: 'LL', comuna: 'Puerto Montt' }, 41);
    for (let i = 0; i < 40; i++) s = advanceWeek(s).state;
    const ids = s.politics!.events.map((e) => e.defId);
    for (const id of ['a_primera_reunion', 'a_interna_convocada', 'b_nueva_faccion', 'b_prioridades', 'a_responsabilidad_disponible']) expect(ids).not.toContain(id);
  }, 120000);
  it('7 · las derrotas no terminan la jugabilidad', () => {
    for (const { s, m } of runs) { expect(m.firstDefeatWeek).not.toBeNull(); const after = s.week - m.firstDefeatWeek!; expect(m.decisionsAfterDefeat / Math.max(1, after)).toBeGreaterThan(0.4); }
  });
  it('8 · las acciones no son repetitivas (situación concreta distinta casi siempre)', () => {
    for (const { m } of runs) {
      expect(m.distinctOfferTitles / Math.max(1, m.offersTaken)).toBeGreaterThan(0.4);
      const perYear: Record<string, number> = {}; for (const d of m.decisions) { const k = `${Math.floor(d.week / 52)}|${d.defId}`; perYear[k] = (perYear[k] ?? 0) + 1; }
      expect(Math.max(...Object.values(perYear))).toBeLessThanOrEqual(4);
    }
  });
  it('9 · no aparecen acontecimientos imposibles ni conflictos inventados con personas reales', () => {
    for (const { s, m } of runs) {
      expect(m.impossible).toEqual([]);
      for (const e of s.politics!.events) if (CONFLICT.has(e.defId)) for (const a of e.actors) expect(s.characters[a]?.realId, `${e.defId} con persona real`).toBeFalsy();
      for (const e of s.politics!.events) expect(EVENT_BY_ID[e.defId]).toBeTruthy();
      // a las personas reales no se les atribuyen apoyos, patrocinios ni oposiciones inventadas
      // (sí pueden figurar como aspirantes en un proceso de nominación del sistema institucional)
      for (const i of s.politics!.initiatives) for (const x of [...i.supporters, ...(i.defId === 'candidatura' ? [] : i.opponents)]) expect(s.characters[x]?.realId, `${i.defId} con persona real`).toBeFalsy();
    }
  });
  it('10 · los proyectos pueden fracasar (y también tener éxito)', () => {
    const tot = runs.reduce((a, r) => ({ ok: a.ok + (r.m.initiatives.exitosa ?? 0), ko: a.ko + (r.m.initiatives.fallida ?? 0) + (r.m.initiatives.abandonada ?? 0) }), { ok: 0, ko: 0 });
    expect(tot.ko).toBeGreaterThan(0); expect(tot.ok).toBeGreaterThan(0);
  });
  it('11 · hay períodos tranquilos sin perder interés (vacíos acotados)', () => {
    for (const { m } of runs) { expect(m.longestQuietGap).toBeGreaterThanOrEqual(3); expect(m.longestQuietGap).toBeLessThanOrEqual(16); }
    for (const { m } of runs) expect(m.extraordinary).toBeLessThan(15); // nada fuerza crisis extraordinarias
  });
  it('12 · el jugador puede impulsar objetivos propios (ambición, proyectos, primer cargo)', () => {
    for (const { s, m } of runs) { expect(s.politics!.ambitionHistory.length + (s.politics!.ambition ? 1 : 0)).toBeGreaterThan(0); expect(Object.values(m.initiatives).reduce((a, b) => a + b, 0)).toBeGreaterThan(1); }
    expect(runs.some((r) => r.m.firstOfficeWeek !== null)).toBe(true);
    expect(runs.some((r) => r.m.firstCandidacyWeek !== null)).toBe(true);
  });
  it('etapas tempranas: los primeros seis meses ya ofrecen decisiones y acciones concretas', () => {
    for (const { m } of runs) {
      const first6 = m.decisions.filter((d) => d.week <= 26);
      expect(new Set(first6.map((d) => d.defId)).size).toBeGreaterThanOrEqual(12);
      expect(first6.filter((d) => d.cat === 'inicial').length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('Persistencia y diez años de trayectoria', () => {
  it('guardar y cargar conserva tramas, iniciativas y bandeja; la simulación sigue idéntica', () => {
    const { s } = runs[0];
    const loaded = deserialize(serialize(s));
    expect(JSON.stringify(loaded.politics)).toBe(JSON.stringify(s.politics));
    const a = advanceWeek(s).state; const b = advanceWeek(loaded).state;
    expect(JSON.stringify(b.politics)).toBe(JSON.stringify(a.politics));
  });
  it('una carrera de diez años sigue produciendo conflictos, oportunidades y decisiones distintas', () => {
    const { s, m } = playCareer(7, 520, { regionId: 'NB', comuna: 'Chillán', partyId: 'PS' });
    expect(s.week).toBeGreaterThanOrEqual(500);
    for (const u of m.uniqueByYear) expect(u).toBeGreaterThanOrEqual(15);
    expect(m.arcsStarted).toBeGreaterThanOrEqual(12);
    expect(m.npcMoves).toBeGreaterThanOrEqual(100);
    // las acciones dependen del contexto: un/a jugador/a que no hace nada sigue recibiendo un mundo vivo
    let idle = newGame({}, 5); for (let i = 0; i < 52; i++) idle = advanceWeek(idle).state;
    expect(idle.politics!.feed.length).toBeGreaterThan(10);
    expect(dispatch(idle, { type: 'pol_ambicion', kind: 'presidencia' }).message).toMatch(/ambición/);
  }, 900000);
});
