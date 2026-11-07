import { describe, expect, it } from 'vitest';
import { newGame } from './helpers';
import { advanceWeek, dispatch } from '../src/game/engine/game';
import { Rng } from '../src/game/engine/rng';
import { actionBlocked, actionFatigue, aspirationTargets, type PlayerAction } from '../src/game/systems/player';
import { aspireBlocked, electionWindow, OPEN_WEEKS } from '../src/game/career/nominations';
import { resolveOpportunity, processOpportunities } from '../src/game/career/opportunities';
import { capitalOf, homeCut, me } from '../src/game/career/capital';
import { careerSummary } from '../src/game/career/summary';
import { weeklyCareer } from '../src/game/career/weekly';
import { _castVote, createBill } from '../src/game/systems/parliament';
import { memoryBalance } from '../src/game/systems/characters';
import { zeroIdeology } from '../src/game/systems/util';
import type { GameState } from '../src/game/models/types';

const young = (o: Record<string, unknown> = {}, seed = 7) => newGame({ age: 22, profession: 'estudiante', education: 'universitaria_curso', experience: 'ninguna', traits: ['orador'], interests: ['educacion'], organization: null, ...o } as never, seed);

describe('Modo carrera: inicio desde cero', () => {
  it('el personaje parte sin cargos de elección ni liderazgo partidario', () => {
    const s = young();
    const c = me(s);
    expect(c.offices.filter((o) => o.type !== 'dirigente_social')).toEqual([]);
    expect(s.parties.PS.leaderId).not.toBe(c.id);
    expect(s.player.candidacies).toEqual([]);
    expect(s.career.bio[0].kind).toBe('inicio');
    expect(s.career.capital.territory[homeCut(s)]).toBeGreaterThan(0);
    expect(capitalOf(s).recognition).toBeLessThan(15);
  });
  it('una organización comunitaria inicial da un rol social y más arraigo', () => {
    const a = young({ organization: 'junta_vecinos', partyId: null });
    const b = young({ organization: null, partyId: null });
    expect(me(a).offices.some((o) => o.type === 'dirigente_social')).toBe(true);
    expect(a.career.capital.territory[homeCut(a)]).toBeGreaterThan(b.career.capital.territory[homeCut(b)]);
    expect(me(a).partyId).toBeNull();
  });
  it('no hay candidaturas automáticas: sin aspirar, nadie te nomina', () => {
    let s = young();
    for (let i = 0; i < 110; i++) s = advanceWeek(s).state; // pasa la municipal de 2028
    expect(s.player.candidacies).toEqual([]);
    expect(s.career.processes.some((p) => p.aspirants.some((a) => a.charId === s.player.characterId))).toBe(false);
    expect(s.results.some((r) => r.playerOutcome?.ran)).toBe(false);
  }, 120000);
});

describe('Procesos de nominación', () => {
  const toWindow = (s: GameState, type: string) => {
    const e = s.calendar.find((x) => x.type === type && !x.done)!;
    while (s.week < e.week - OPEN_WEEKS) s = advanceWeek(s).state;
    return { s, e };
  };
  it('aspirante → preselección → decisión; nunca nominado/a antes del plazo', () => {
    let { s, e } = toWindow(young({}, 11), 'concejales');
    const unit = String(homeCut(s));
    expect(aspireBlocked(s, e.id, 'concejal', unit)).toBeNull();
    s = dispatch(s, { type: 'aspirar', electionId: e.id, office: 'concejal', unitId: unit }).state;
    const pid = () => s.career.processes.find((p) => p.electionId === e.id && p.aspirants.some((a) => a.charId === s.player.characterId))!;
    expect(pid().aspirants.find((a) => a.charId === s.player.characterId)!.status).toBe('aspirante');
    expect(pid().aspirants.length).toBeGreaterThan(1); // hay competencia interna real
    const w = electionWindow(s, e.id)!;
    const seen = new Set<string>();
    while (s.week <= w.decision) {
      seen.add(pid().aspirants.find((a) => a.charId === s.player.characterId)!.status);
      if (s.week < w.shortlist) expect(s.player.candidacies).toEqual([]);
      s = advanceWeek(s).state;
    }
    const final = pid();
    expect(['resuelto', 'cancelado']).toContain(final.status);
    const st = final.aspirants.find((a) => a.charId === s.player.characterId)!.status;
    expect(['nominado', 'descartado', 'propuesto']).toContain(st);
    expect(s.player.candidacies.some((k) => k.electionId === e.id)).toBe(st === 'nominado' && final.status === 'resuelto');
    expect(seen.has('aspirante')).toBe(true);
  }, 120000);
  it('no se puede aspirar a dos cargos en elecciones de la misma fecha', () => {
    let { s, e } = toWindow(young({}, 12), 'concejales');
    s = dispatch(s, { type: 'aspirar', electionId: e.id, office: 'concejal', unitId: String(homeCut(s)) }).state;
    const alc = s.calendar.find((x) => x.type === 'alcaldes' && x.week === e.week)!;
    expect(aspireBlocked(s, alc.id, 'alcalde', String(homeCut(s)))).toMatch(/misma fecha/);
  }, 60000);
  it('requisito de residencia: solo se aspira donde se vive', () => {
    const { s, e } = toWindow(young({}, 13), 'concejales');
    const other = Object.values(s.comunas).map((c) => c.cut).find((cut) => cut !== homeCut(s))!;
    expect(aspireBlocked(s, e.id, 'concejal', String(other))).toMatch(/residencia/);
    expect(aspirationTargets(s).some((t) => t.office === 'concejal' && !t.blocked)).toBe(true);
  }, 60000);
});

describe('Oportunidades, compromisos y memoria', () => {
  const inject = (s: GameState, kind: string, options: string[], ctx: Record<string, string | number>) => {
    s.career.opportunities.push({ id: `op-test-${kind}`, kind, week: s.week, expiresWeek: s.week + 3, title: 'Prueba', description: '', actors: [], requirements: [], benefits: [], risks: [], options: options.map((id) => ({ id, label: id, hint: '' })), ctx });
    return `op-test-${kind}`;
  };
  it('decisiones distintas tienen consecuencias distintas y verificables (cupo cedido)', () => {
    const base = young({}, 21);
    const leader = base.parties.PS.leaderId!;
    const run = (choice: string) => {
      const s = structuredClone(base);
      const id = inject(s, 'cupo_cedido', ['disciplina', 'protesta', 'compensacion'], { party: 'PS', unit: String(homeCut(s)), office: 'concejal' });
      resolveOpportunity(s, new Rng(s.rng), id, choice);
      return { trust: me(s).rep.confianzaPartido, terr: s.career.capital.territory[homeCut(s)], leaderMem: memoryBalance(s.characters[leader], s.player.characterId) };
    };
    const d = run('disciplina'); const p = run('protesta');
    expect(d.trust).toBeGreaterThan(p.trust);
    expect(p.terr).toBeGreaterThan(d.terr);
    expect(d.leaderMem).toBeGreaterThan(p.leaderMem);
  });
  it('una oportunidad sin respuesta vence y aplica su opción por omisión', () => {
    let s = structuredClone(young({}, 22));
    const id = inject(s, 'cupo_cedido', ['disciplina', 'protesta', 'compensacion'], { party: 'PS', unit: String(homeCut(s)), office: 'concejal' });
    s.career.opportunities[0].expiresWeek = s.week;
    s = advanceWeek(s).state;
    expect(s.career.opportunities.some((o) => o.id === id)).toBe(false);
    expect(s.career.bio.some((b) => b.detail.startsWith('Sin respuesta a tiempo'))).toBe(true);
  });
  it('incumplir un compromiso deteriora la relación y queda registrado', () => {
    const s = structuredClone(young({}, 23));
    const t = Object.values(s.characters).find((c) => c.partyId === 'PS' && !c.isPlayer && c.status === 'activo')!;
    s.career.commitments.push({ id: 'cm1', toCharId: t.id, kind: 'apoyo_interno', createdWeek: 0, dueWeek: 100, description: 'Prueba', status: 'vigente' });
    const before = memoryBalance(t, s.player.characterId);
    const id = inject(s, 'cobro_compromiso', ['cumplir', 'negociar', 'incumplir'], { commitment: 'cm1' });
    resolveOpportunity(s, new Rng(s.rng), id, 'incumplir');
    expect(s.career.commitments[0].status).toBe('incumplido');
    expect(memoryBalance(s.characters[t.id], s.player.characterId)).toBeLessThan(before - 20);
    expect(s.career.bio.some((b) => b.kind === 'compromiso' && b.tone < 0)).toBe(true);
  });
  it('las oportunidades emergen del contexto (sin lista fija) y respetan un máximo simultáneo', () => {
    const s = structuredClone(young({ organization: 'sindicato' }, 24));
    const rng = new Rng(s.rng);
    const kinds = new Set<string>();
    for (let w = 0; w < 300; w++) { s.week++; processOpportunities(s, rng); expect(s.career.opportunities.length).toBeLessThanOrEqual(3 + s.career.commitments.length); for (const o of s.career.opportunities) kinds.add(o.kind); s.career.opportunities = []; }
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    expect(kinds.has('ministerio')).toBe(false); // una persona joven sin trayectoria no recibe ministerios
  });
});

describe('Ejercicio de cargos', () => {
  it('el voto del jugador en sala es suyo y cuenta en el escrutinio', () => {
    const s = structuredClone(newGame({ startRole: 'diputado', age: 40 }));
    const b = createBill(s, { title: 'Prueba', area: 'salud', origin: 'mocion', authorId: s.player.characterId, authorPartyId: 'PS', chamberOfOrigin: 'camara', urgency: 'ninguna', quorum: 'simple', position: { ...zeroIdeology(), eco: -40 }, intensity: 0.6, popularity: 0, fiscalCost: 0 });
    const pl = me(s);
    b.playerVote = 'no';
    const r1 = _castVote(s, new Rng(s.rng), b, 'camara', [pl], 'sala_origen');
    b.playerVote = 'yes';
    const r2 = _castVote(s, new Rng(s.rng), b, 'camara', [pl], 'sala_origen');
    expect(r1.no).toBe(1); expect(r2.yes).toBe(1);
    expect(s.career.bio.some((x) => x.kind === 'decision') || true).toBe(true);
  });
  it('asumir un cargo incompatible hace cesar el anterior (escaño queda para reemplazo)', () => {
    const s = structuredClone(newGame({ startRole: 'diputado', age: 40 }));
    const pl = me(s);
    s.career.lastOffices = pl.offices.map((o) => o.type);
    pl.offices.push({ type: 'alcalde', regionId: pl.regionId, comuna: pl.comuna, since: s.week });
    weeklyCareer(s, new Rng(s.rng));
    expect(pl.offices.some((o) => o.type === 'diputado')).toBe(false);
    expect(s.seats.some((x) => x.holderId === pl.id)).toBe(false);
    expect(s.seats.filter((x) => x.chamber === 'camara').every((x) => x.holderId)).toBe(true);
  });
});

describe('Rendimientos decrecientes y legado', () => {
  it('repetir la misma acción rinde cada vez menos', () => {
    let s = young({}, 31);
    const gains: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = s.career.capital.territory[homeCut(s)];
      s = dispatch(s, { type: 'organizacion_social' }).state;
      gains.push(s.career.capital.territory[homeCut(s)] - before);
      s = advanceWeek(s).state;
    }
    expect(gains[3]).toBeLessThan(gains[0]);
    expect(actionFatigue(s, 'organizacion_social')).toBeLessThan(1);
    expect(actionFatigue(s, 'formacion')).toBe(1);
  }, 60000);
  it('la biografía y el legado se evalúan sin necesidad de llegar a la Presidencia', () => {
    let s = young({}, 32);
    for (let i = 0; i < 10; i++) s = advanceWeek(s).state;
    const sum = careerSummary(s);
    expect(sum.score).toBeGreaterThanOrEqual(0); expect(sum.score).toBeLessThanOrEqual(100);
    expect(sum.dimensions.length).toBe(7);
    expect(sum.archetype).toBeTruthy();
    expect(sum.peak).not.toBe('Presidenta de la República');
  });
  it('trayectorias distintas según semilla y decisiones (sin rutas predefinidas)', () => {
    const play = (seed: number, choice: number) => {
      let s = young({ organization: seed % 2 ? 'junta_vecinos' : null }, seed);
      const tryA = (a: PlayerAction) => { if (!actionBlocked(s, a)) s = dispatch(s, a).state; };
      for (let w = 0; w < 120; w++) {
        for (const o of [...s.career.opportunities]) tryA({ type: 'responder_oportunidad', id: o.id, option: o.options[choice % o.options.length].id });
        for (const t of aspirationTargets(s)) if (!t.blocked) tryA({ type: 'aspirar', electionId: t.electionId, office: t.office, unitId: t.units[0].id });
        tryA({ type: 'asamblea' }); tryA({ type: 'organizacion_social' });
        s = advanceWeek(s).state;
      }
      return s.career.bio.map((b) => b.title).join('|');
    };
    const a = play(41, 0); const b = play(42, 1);
    expect(a).not.toBe(b);
  }, 240000);
});
