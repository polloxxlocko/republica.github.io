import { describe, expect, it } from 'vitest';
import { cfg, newGame } from './helpers';
import { createScenario } from '../src/game/scenarios';
import { advanceWeek, dispatch } from '../src/game/engine/game';
import { checkInvariants } from '../src/game/engine/invariants';
import { Rng, seedRng } from '../src/game/engine/rng';
import { CONSTITUTED_PARTIES } from '../src/game/data/parties';
import type { StartRole } from '../src/game/models/types';
import { nthSunday } from '../src/game/engine/dates';

describe('Generador aleatorio', () => {
  it('es determinista con la misma semilla', () => {
    const a = new Rng(seedRng(123)); const b = new Rng(seedRng(123));
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('produce valores en [0,1) y semillas distintas divergen', () => {
    const a = new Rng(seedRng(1)); const b = new Rng(seedRng(2));
    let diff = 0;
    for (let i = 0; i < 50; i++) { const x = a.next(); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); if (x !== b.next()) diff++; }
    expect(diff).toBeGreaterThan(45);
  });
});

describe('Calendario', () => {
  it('calcula domingos correctamente', () => {
    expect(nthSunday(2029, 11, 3)).toBe('2029-11-18');
    expect(nthSunday(2028, 10, -1)).toBe('2028-10-29');
  });
});

describe('Escenario Chile 2026 y creación de personaje', () => {
  const g = newGame();
  it('incluye los 15 partidos del catálogo como constituidos y activos', () => {
    for (const p of CONSTITUTED_PARTIES) { expect(g.parties[p.id]).toBeDefined(); expect(g.parties[p.id].active).toBe(true); expect(g.parties[p.id].legalStatus).toBe('constituido'); }
    expect(CONSTITUTED_PARTIES.length).toBe(15);
  });
  it('distingue partidos históricos/fusionados que no compiten', () => {
    expect(g.parties.FA.legalStatus).toBe('constituido');
    expect(g.parties.RD.legalStatus).toBe('fusionado');
    expect(g.parties.RD.mergedInto).toBe('FA');
    for (const id of ['PSC', 'PH', 'DEM', 'AMA', 'PEV', 'IGU', 'PTR']) expect(g.parties[id].active).toBe(false);
  });
  it('crea un Congreso de 155 + 50 escaños sin violar invariantes', () => {
    expect(g.seats.filter((s) => s.chamber === 'camara').length).toBe(155);
    expect(g.seats.filter((s) => s.chamber === 'senado').length).toBe(50);
    expect(checkInvariants(g)).toEqual([]);
  });
  it('crea al jugador con los datos ingresados', () => {
    const c = g.characters[g.player.characterId];
    expect(c.firstName).toBe('Ana'); expect(c.partyId).toBe('PS'); expect(c.regionId).toBe('BI'); expect(c.isPlayer).toBe(true);
    expect(c.attrs.carisma).toBeGreaterThan(42);
  });
  it('admite todos los puntos de partida', () => {
    const roles: StartRole[] = ['militante', 'dirigente_territorial', 'concejal', 'alcalde', 'diputado', 'senador', 'presidente_partido', 'candidato_presidencial', 'presidente'];
    for (const r of roles) {
      const s = createScenario(cfg({ startRole: r, age: 45 }, 9));
      expect(checkInvariants(s), r).toEqual([]);
      const c = s.characters[s.player.characterId];
      if (r === 'diputado') expect(c.offices.some((o) => o.type === 'diputado')).toBe(true);
      if (r === 'presidente') expect(s.government.presidentId).toBe(c.id);
      if (r === 'presidente_partido') expect(s.parties.PS.leaderId).toBe(c.id);
    }
  });
});

describe('Motor temporal y determinismo', () => {
  it('avanza una semana sin mutar el estado anterior', () => {
    const g = newGame();
    const before = JSON.stringify(g);
    const r = advanceWeek(g);
    expect(JSON.stringify(g)).toBe(before);
    expect(r.state.week).toBe(1);
  });
  it('misma semilla + mismas acciones = misma partida', () => {
    const run = () => {
      let s = newGame({}, 77);
      for (let i = 0; i < 20; i++) {
        s = dispatch(s, { type: 'entrevista' }).state;
        s = dispatch(s, { type: 'redes' }).state;
        s = advanceWeek(s).state;
      }
      return s;
    };
    const a = run(); const b = run();
    a.createdAt = b.createdAt = ''; a.id = b.id = '';
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('las acciones consumen puntos de acción y se bloquean sin PA', () => {
    let s = newGame();
    const ap = s.player.actionPoints;
    s = dispatch(s, { type: 'redes' }).state;
    expect(s.player.actionPoints).toBe(ap - 1);
    s = dispatch(s, { type: 'redes' }).state; s = dispatch(s, { type: 'redes' }).state;
    const r = dispatch(s, { type: 'redes' });
    expect(r.message).toMatch(/No es posible/);
    expect(advanceWeek(r.state).state.player.actionPoints).toBeGreaterThan(0);
  });
});
