import { describe, expect, it } from 'vitest';
import { newGame } from './helpers';
import { advanceWeek, dispatch } from '../src/game/engine/game';
import { Rng } from '../src/game/engine/rng';
import { AGENDA_DEFS, generateAgenda, runAgenda, weeklyTeamAndDigital } from '../src/game/career/agendaWeek';
import { actionBlocked } from '../src/game/systems/player';
import { dateToWeek } from '../src/game/engine/dates';
import type { GameState } from '../src/game/models/types';

const young = (seed = 5) => structuredClone(newGame({ age: 24, experience: 'ninguna', startRole: 'militante' } as never, seed));

describe('Agenda semanal dinámica', () => {
  it('hay un catálogo amplio de acciones situacionales', () => {
    expect(AGENDA_DEFS.length).toBeGreaterThanOrEqual(75);
    expect(new Set(AGENDA_DEFS.map((d) => d.id)).size).toBe(AGENDA_DEFS.length);
  });
  it('la partida comienza con una agenda y cambia cada semana sin repetir la anterior', () => {
    let s = young();
    expect(s.career.agenda!.offers.length).toBeGreaterThanOrEqual(5);
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const prev = new Set(s.career.agenda!.offers.map((o) => o.defId));
      s = advanceWeek(s).state;
      const now = s.career.agenda!.offers.map((o) => o.defId);
      expect(s.career.agenda!.week).toBe(s.week);
      for (const d of now) { expect(prev.has(d)).toBe(false); seen.add(d); }
    }
    expect(seen.size).toBeGreaterThanOrEqual(35);
  }, 120000);
  it('una actividad cuesta PA, se hace una vez y expira con la semana', () => {
    let s = young();
    const o = s.career.agenda!.offers.find((x) => x.cost <= s.player.actionPoints && x.funds <= s.player.personalFunds)!;
    const ap = s.player.actionPoints;
    s = dispatch(s, { type: 'agenda', offerId: o.id }).state;
    expect(s.player.actionPoints).toBe(ap - o.cost);
    expect(actionBlocked(s, { type: 'agenda', offerId: o.id })).toMatch(/Ya la realizaste/);
    s = advanceWeek(s).state;
    expect(actionBlocked(s, { type: 'agenda', offerId: o.id })).toMatch(/ya no está/);
  });
  it('todas las acciones del catálogo se ejecutan sin errores', () => {
    const s = young(9); const rng = new Rng(s.rng);
    s.player.personalFunds = 500;
    for (const d of AGENDA_DEFS) {
      const ctx = d.ctx ? d.ctx(s, rng) : {};
      if (ctx === null) continue;
      s.career.agenda = { week: s.week, offers: [{ id: `t-${d.id}`, defId: d.id, category: d.cat, title: '', desc: '', cost: 0, funds: 0, risk: d.risk, ctx }], used: [], lastDefs: [] };
      const msg = runAgenda(s, rng, `t-${d.id}`);
      expect(typeof msg).toBe('string'); expect(msg.length).toBeGreaterThan(3);
    }
  });
  it('las fechas especiales dependen del calendario cívico', () => {
    const s = young();
    const fp = AGENDA_DEFS.find((d) => d.id === 'fiestas_patrias')!;
    expect(fp.when!(s)).toBe(false); // noviembre
    const sep: GameState = { ...s, week: dateToWeek(s.startDate, '2027-09-15') };
    expect(fp.when!(sep)).toBe(true);
  });
  it('lo disponible depende del cargo: un/a militante no ve acciones de parlamentario', () => {
    const s = young(); const rng = new Rng(s.rng);
    for (let i = 0; i < 30; i++) { generateAgenda(s, rng); for (const o of s.career.agenda!.offers) expect(['proyecto_acuerdo', 'bancada', 'comision_terreno', 'delegacion']).not.toContain(o.defId); s.week++; }
  });
});

describe('Acciones permanentes que dependen de la semana', () => {
  it('las invitaciones a entrevistas y debates no están todas las semanas', () => {
    const s = young(); s.player.actionPoints = 9;
    const res = new Set<boolean>();
    for (let i = 0; i < 30; i++) { s.week = i; res.add(actionBlocked(s, { type: 'entrevista' }) === null); }
    expect(res).toEqual(new Set([true, false]));
    expect(actionBlocked({ ...s, week: 3 }, { type: 'entrevista' })).toBe(actionBlocked({ ...s, week: 3 }, { type: 'entrevista' }));
  });
});

describe('Equipo propio y presencia digital', () => {
  it('contratar cuesta cada semana y la persona se va si no hay recursos', () => {
    const s = young(); const rng = new Rng(s.rng);
    s.player.personalFunds = 50;
    const d = AGENDA_DEFS.find((x) => x.id === 'contratar_digital')!;
    s.career.agenda = { week: s.week, offers: [{ id: 'h', defId: d.id, category: 'equipo', title: '', desc: '', cost: 0, funds: 0, risk: 'bajo', ctx: d.ctx!(s, rng)! }], used: [], lastDefs: [] };
    runAgenda(s, rng, 'h');
    expect(s.career.team!.length).toBe(1);
    const f0 = s.player.personalFunds; const dg0 = s.career.capital.digital ?? 0;
    weeklyTeamAndDigital(s);
    expect(s.player.personalFunds).toBeLessThan(f0);
    expect(s.career.capital.digital ?? 0).toBeGreaterThan(dg0 * 0.985);
    s.player.personalFunds = 0; weeklyTeamAndDigital(s);
    expect(s.career.team!.length).toBe(0);
  });
});
