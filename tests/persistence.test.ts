import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { newGame } from './helpers';
import { deserialize, migrate, serialize, validateGame, SaveError } from '../src/persistence/saveFormat';
import { deleteSave, listSaves, loadGame, saveGame } from '../src/persistence/db';
import { advanceWeek } from '../src/game/engine/game';
import { SCHEMA_VERSION } from '../src/game/scenarios/chile2026';

describe('Formato de guardado', () => {
  it('exporta e importa sin pérdida', () => {
    let g = newGame();
    for (let i = 0; i < 5; i++) g = advanceWeek(g).state;
    const back = deserialize(serialize(g));
    expect(JSON.stringify(back)).toBe(JSON.stringify(g));
  });
  it('migra partidas de versiones anteriores', () => {
    const g = structuredClone(newGame()) as unknown as Record<string, unknown>;
    delete g.campaignSpend; delete g.presidentialCandidates;
    const gov = g.government as Record<string, unknown>; delete gov.electId; delete gov.coalitionTerms;
    g.schemaVersion = 1;
    const m = migrate(g);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.campaignSpend).toEqual({});
    expect(Object.keys(m.comunas).length).toBe(346);
    expect(m.government.electId).toBeNull();
  });
  it('migra partidas v4 (sin modo carrera) a v5 con registro de carrera', () => {
    const g = structuredClone(newGame()) as unknown as Record<string, unknown>;
    delete g.career; g.schemaVersion = 4;
    const m = migrate(g);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.career.processes).toEqual([]);
    expect(m.career.lastOffices).toEqual(m.characters[m.player.characterId].offices.map((o) => o.type));
    expect(m.career.intel).toEqual([]); expect(m.career.latent).toEqual([]); expect(m.career.workMode).toBe('parcial');
  });
  it('migra partidas v5 (sin información imperfecta) a v6', () => {
    const g = structuredClone(newGame()) as unknown as Record<string, unknown>;
    const c = g.career as Record<string, unknown>; delete c.intel; delete c.latent; delete c.reviews; delete c.workMode; g.schemaVersion = 5;
    const m = migrate(g);
    expect(m.career.intel).toEqual([]); expect(m.career.reviews).toEqual([]); expect(m.career.workMode).toBe('parcial');
  });
  it('rechaza archivos corruptos o ajenos', () => {
    expect(() => deserialize('{no es json')).toThrow(SaveError);
    expect(() => deserialize(JSON.stringify({ hola: 1 }))).toThrow(SaveError);
    const g = structuredClone(newGame());
    g.seats = g.seats.slice(0, 10);
    expect(validateGame(g).length).toBeGreaterThan(0);
    expect(() => deserialize(serialize(g))).toThrow(/Congreso/);
  });
  it('rechaza versiones futuras', () => {
    const g = structuredClone(newGame()) as unknown as Record<string, unknown>;
    g.schemaVersion = SCHEMA_VERSION + 5;
    expect(() => migrate(g)).toThrow(SaveError);
  });
  it('recupera campos opcionales ausentes', () => {
    const g = structuredClone(newGame()) as unknown as Record<string, unknown>;
    delete g.news; delete g.history; delete g.polls;
    const back = deserialize(JSON.stringify(g));
    expect(back.news).toEqual([]); expect(back.history).toEqual([]);
  });
});

describe('IndexedDB', () => {
  it('guarda, lista, carga y elimina múltiples partidas', async () => {
    const a = newGame({}, 1); const b = newGame({ firstName: 'Beto', gender: 'm' }, 2);
    const ma = await saveGame(a, 'manual'); await saveGame(b, 'auto');
    const list = await listSaves();
    expect(list.length).toBeGreaterThanOrEqual(2);
    const loaded = await loadGame(ma.slot);
    expect(loaded.id).toBe(a.id);
    await deleteSave(ma.slot);
    expect((await listSaves()).some((x) => x.slot === ma.slot)).toBe(false);
  });
});
