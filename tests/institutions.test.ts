import { describe, expect, it } from 'vitest';
import { newGame } from './helpers';
import { createBill, members, processBills, requiredYes, voteProbabilities, whipCount } from '../src/game/systems/parliament';
import { Rng } from '../src/game/engine/rng';
import { estimateSeats, currentLists, formCoalition, joinCoalition, leaveCoalition } from '../src/game/systems/coalitions';
import { checkInvariants } from '../src/game/engine/invariants';
import { announcePolicy, inaugurate } from '../src/game/systems/government';
import { advanceWeek, dispatch } from '../src/game/engine/game';
import type { Bill, GameState, Ideology } from '../src/game/models/types';

const zero: Ideology = { eco: 0, val: 0, seg: 0, inst: 0, amb: 0, soc: 0, ord: 0, lab: 0 };
const mkBill = (s: GameState, pos: Partial<Ideology>, extra: Partial<Bill> = {}) => createBill(s, { title: 'Proyecto de prueba', area: 'seguridad', origin: 'mocion', authorId: s.government.presidentId, authorPartyId: null, chamberOfOrigin: 'camara', urgency: 'discusion_inmediata', quorum: 'simple', position: { ...zero, ...pos }, intensity: 0.8, popularity: 0, fiscalCost: 0, ...extra });

describe('Quórums', () => {
  it('calcula mayorías', () => {
    expect(requiredYes('absoluta', 155, 140)).toBe(78);
    expect(requiredYes('loc', 155, 150)).toBe(89);
    expect(requiredYes('reforma_constitucional', 50, 50)).toBe(29);
    expect(requiredYes('simple', 155, 100)).toBe(51);
  });
});

describe('Comportamiento de voto', () => {
  it('cada parlamentario decide según su ideología: un proyecto de derecha divide a la Cámara', () => {
    const s = structuredClone(newGame());
    const b = mkBill(s, { seg: 80, eco: 60 });
    const mem = members(s, 'camara');
    const right = mem.filter((c) => c.partyId === 'REP');
    const left = mem.filter((c) => c.partyId === 'PC');
    const avg = (xs: typeof mem) => xs.reduce((a, c) => a + voteProbabilities(s, c, b).yes, 0) / xs.length;
    expect(avg(right)).toBeGreaterThan(0.75);
    expect(avg(left)).toBeLessThan(0.25);
  });
  it('la negociación con un partido aumenta los votos esperados', () => {
    const s = structuredClone(newGame());
    const b = mkBill(s, { seg: -30, soc: -30 });
    const before = whipCount(s, b, 'camara').yes;
    b.sideSupport.RN = 1; b.sideSupport.UDI = 1;
    expect(whipCount(s, b, 'camara').yes).toBeGreaterThan(before + 5);
  });
  it('tramitación completa: un proyecto consensuado se publica; uno extremo se rechaza', () => {
    const s = structuredClone(newGame());
    const ok = mkBill(s, { amb: -10 }, { popularity: 60, sideSupport: {} });
    const bad = mkBill(s, { eco: -100, val: -100, seg: -100, lab: -100, ord: -100 }, { quorum: 'reforma_constitucional' });
    const rng = new Rng(s.rng);
    const closed: Record<string, string> = {};
    for (let w = 0; w < 40; w++) { s.week++; processBills(s, rng, (_st, bill, out) => { closed[bill.id] = out; }, () => 'promulgar'); }
    expect(['publicada']).toContain(ok.stage);
    expect(bad.stage).toBe('rechazada');
    expect(ok.votes.length).toBeGreaterThanOrEqual(4);
  });
  it('un veto requiere 2/3 para ser superado', () => {
    const s = structuredClone(newGame());
    const b = mkBill(s, { eco: -40, soc: -40 });
    const rng = new Rng(s.rng);
    for (let w = 0; w < 40 && b.closedWeek === undefined; w++) { s.week++; processBills(s, rng, () => undefined, () => 'vetar'); }
    if (b.vetoed) {
      const ins = b.votes.filter((v) => v.stage === 'insistencia_veto');
      expect(ins.length).toBe(2);
      expect(ins[0].required).toBeGreaterThanOrEqual(Math.ceil(50 * 2 / 3));
    }
  });
});

describe('Coaliciones', () => {
  it('la estimación de escaños suma 155', () => {
    const s = newGame();
    expect(Object.values(estimateSeats(s, currentLists(s))).reduce((a, b) => a + b, 0)).toBe(155);
  });
  it('formar, unirse y salir mantiene invariantes', () => {
    const s = structuredClone(newGame());
    const rng = new Rng(s.rng);
    leaveCoalition(s, rng, 'PDC', 'prueba');
    leaveCoalition(s, rng, 'EVO', 'prueba');
    const k = formCoalition(s, 'Centro Unido', ['PDC', 'EVO'], 'PDC');
    expect(checkInvariants(s)).toEqual([]);
    leaveCoalition(s, rng, 'PDG', 'prueba');
    joinCoalition(s, rng, 'PDG', k.id);
    expect(s.coalitions[k.id].members).toContain('PDG');
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('Gobierno', () => {
  it('anunciar una política no la ejecuta: debe pasar por formulación y Congreso', () => {
    let s = structuredClone(newGame({ startRole: 'presidente', age: 50, partyId: 'REP' }));
    const msg = announcePolicy(s, new Rng(s.rng), 'plan_seguridad');
    expect(msg).toMatch(/Anunciaste/);
    const p = s.government.policies.find((x) => x.defId === 'plan_seguridad')!;
    expect(p.phase).toBe('anunciada');
    for (let i = 0; i < 16; i++) s = advanceWeek(s).state;
    const p2 = s.government.policies.find((x) => x.defId === 'plan_seguridad')!;
    expect(['tramitacion', 'aprobada', 'financiamiento', 'implementacion', 'fracasada']).toContain(p2.phase);
    if (p2.billId) expect(s.bills.find((b) => b.id === p2.billId)).toBeDefined();
  });
  it('el Presidente no fija la tasa del Banco Central (no existe acción para ello)', () => {
    const s = newGame({ startRole: 'presidente', age: 50 });
    // @ts-expect-error acción inexistente a propósito
    const r = dispatch(s, { type: 'fijar_tpm', value: 1 });
    expect(r.state.economy.policyRate).toBe(s.economy.policyRate);
  });
  it('la investidura instala un nuevo gobierno y gabinete', () => {
    const s = structuredClone(newGame());
    const cand = Object.values(s.characters).find((c) => c.partyId === 'FA' && !c.offices.length)!;
    s.government.electId = cand.id; s.government.electCoalitionId = Object.values(s.coalitions).find((k) => k.members.includes('FA'))!.id;
    inaugurate(s, new Rng(s.rng));
    expect(s.government.presidentId).toBe(cand.id);
    expect(s.government.cabinet.filter((p) => p.ministerId).length).toBe(25);
    expect(checkInvariants(s)).toEqual([]);
  });
});
