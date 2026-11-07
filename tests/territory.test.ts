import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { cfg } from './helpers';
import { createScenario } from '../src/game/scenarios';
import { COMUNAS, TERRITORY, comunasOfDistrict, councilSeats } from '../src/game/territory/data';
import { DISTRICTS } from '../src/game/data/geography';
import { runValidation } from '../src/game/territory/validation';
import { advanceWeek, dispatch } from '../src/game/engine/game';
import { estimateComuna, explainComuna, MAX_YEARLY_DRIFT } from '../src/game/territory/dynamics';
import { checkInvariants } from '../src/game/engine/invariants';
import { DIMS } from '../src/game/rules/params';
import { computeShares, buildUtilityContext, partyOptions } from '../src/game/systems/electorate';

describe('Datos territoriales oficiales', () => {
  it('346 comunas con región, distrito y padrón', () => {
    expect(COMUNAS.length).toBe(346);
    expect(new Set(COMUNAS.map((c) => c.cut)).size).toBe(346);
    for (const c of COMUNAS) {
      expect(c.district, c.name).toBeGreaterThanOrEqual(1);
      expect(c.district, c.name).toBeLessThanOrEqual(28);
      expect(c.electors, c.name).toBeGreaterThan(0);
      expect(Math.abs(c.age.reduce((a, b) => a + b, 0) - 1), c.name).toBeLessThan(0.02);
    }
    const total = COMUNAS.reduce((a, c) => a + c.electors, 0);
    expect(total).toBeGreaterThan(15_000_000);
  });
  it('cada distrito (Ley 20.840) agrupa comunas de su propia región', () => {
    for (const d of DISTRICTS) {
      const cs = comunasOfDistrict(d.id);
      expect(cs.length, `distrito ${d.id}`).toBeGreaterThan(0);
      for (const c of cs) expect(c.region, `${c.name} en distrito ${d.id}`).toBe(d.regionId);
    }
  });
  it('los escaños oficiales 2025 por distrito suman la magnitud legal', () => {
    const seats = TERRITORY.meta.seats?.D2025;
    expect(seats).toBeDefined();
    for (const d of DISTRICTS) expect(Object.values(seats![String(d.id)] ?? {}).reduce((a, b) => a + b, 0), `D${d.id}`).toBe(d.seats);
  });
  it('concejales según tamaño (6/8/10)', () => {
    expect(councilSeats(10000)).toBe(6); expect(councilSeats(100000)).toBe(8); expect(councilSeats(300000)).toBe(10);
  });
});

describe('Calibración y validación fuera de muestra', () => {
  it('modo juego: reproduce la votación comunal de diputados 2025', () => {
    const s = createScenario(cfg({}, 5));
    expect(s.territoryCalibration.mode).toBe('juego');
    expect(s.territoryCalibration.fitMAE).toBeLessThan(1.5);
    expect(s.segments.length).toBeGreaterThan(1300);
    expect(checkInvariants(s)).toEqual([]);
  });
  it('modo validación: calibrado con 2021-2022, predice 2025 mejor que la media nacional', () => {
    const s = createScenario({ ...cfg({}, 5), territoryMode: 'validacion' });
    const m = runValidation(s);
    writeFileSync('territory-validation.json', JSON.stringify({ calibration: s.territoryCalibration, metrics: m }, null, 2));
    const v1 = m.find((x) => x.name.startsWith('V1'))!;
    // el patrón espacial debe tener poder predictivo real
    expect(v1.r).toBeGreaterThan(0.6);
    expect(v1.maeSwingAdj).toBeLessThan(v1.baselineNationalMAE);
    const v4 = m.find((x) => x.name.startsWith('V4'))!;
    expect(v4.mae).toBeLessThan(8);
  }, 120000);
});

describe('Dinámica territorial', () => {
  it('la deriva ideológica anual está acotada', () => {
    let s = createScenario(cfg({}, 8));
    const before = new Map(s.segments.map((x) => [x.id, { ...x.ideology }]));
    for (let i = 0; i < 52; i++) s = advanceWeek(s).state;
    let maxDelta = 0;
    for (const seg of s.segments) { const b = before.get(seg.id)!; for (const d of DIMS) maxDelta = Math.max(maxDelta, Math.abs(seg.ideology[d] - b[d])); }
    // tope mensual × 12 + reemplazo generacional (≤ 1 punto/año por eje)
    expect(maxDelta).toBeLessThanOrEqual(MAX_YEARLY_DRIFT + 1.01);
  }, 60000);
  it('la inversión territorial tiene efecto verificable y rendimientos decrecientes', () => {
    const s0 = createScenario(cfg({ partyId: 'PS', regionId: 'RM', comuna: 'Santiago' }, 9));
    s0.player.personalFunds = 1000; s0.player.actionPoints = 10;
    const cut = 13101;
    const share = (st: typeof s0) => {
      const r = estimateComuna(st, cut, 'PS');
      return r;
    };
    const base = share(s0);
    const a = dispatch(s0, { type: 'campana_territorial', target: { kind: 'comuna', id: cut }, amount: 50 }).state;
    expect(a.comunas[cut].campaign.PS).toBeCloseTo(50, 5);
    const b = dispatch(a, { type: 'campana_territorial', target: { kind: 'comuna', id: cut }, amount: 50 }).state;
    expect(share(b).costPerPoint).toBeGreaterThan(base.costPerPoint);
    // efecto en la utilidad real del motor (no solo en la estimación)
    const sh = (st: typeof s0) => { const r = computeShares(st, partyOptions(st), buildUtilityContext(st, false), undefined, new Set([cut])); const v = r.byComuna[cut]; return v.PS / Object.values(v).reduce((x, y) => x + y, 0); };
    const g0 = sh(s0); const g1 = sh(a); const g2 = sh(b);
    expect(g1).toBeGreaterThan(g0);
    expect(g2 - g1).toBeLessThan(g1 - g0);
  });
  it('explicaciones: sin referencia antes de una elección; con referencia tras ella', () => {
    const s = createScenario(cfg({}, 3));
    expect(explainComuna(s, 13101).since).toBeNull();
  });
  it('las elecciones municipales nombran 346 alcaldes por comuna', () => {
    let s = createScenario(cfg({}, 12));
    while (!s.results.some((r) => r.type === 'alcaldes')) s = advanceWeek(s).state;
    const r = s.results.find((x) => x.type === 'alcaldes')!;
    expect(Object.keys(r.comunas ?? {}).length).toBe(346);
    const mayors = Object.values(s.regions).reduce((a, x) => a + Object.values(x.mayorsByParty).reduce((p, q) => p + q, 0), 0);
    expect(mayors).toBe(346);
    expect(Object.values(s.comunas).every((c) => c.mayorParty !== null)).toBe(true);
  }, 120000);
});
