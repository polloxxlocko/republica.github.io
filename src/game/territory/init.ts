/**
 * Inicialización territorial de un escenario: segmentos por comuna, centrado del espacio
 * ideológico, calibración de afinidades contra resultados oficiales y organización local.
 */
import type { GameState, Ideology, RegionId } from '../models/types';
import { Rng } from '../engine/rng';
import { DIMS, clamp } from '../rules/params';
import { REGIONS } from '../data/geography';
import { calibratePartisanship, computeShares, buildUtilityContext, partyOptions, electorateCenter } from '../systems/electorate';
import { zeroIdeology } from '../systems/util';
import { buildTerritory, nationalTargets, partyTargets, TERRITORY_COEF, REFERENCE, type CalibrationMode } from './model';
import { COMUNAS, TERRITORY } from './data';

export function initTerritory(s: GameState, rng: Rng, mode: CalibrationMode, fallbackShares: Record<string, number>): void {
  const active = Object.values(s.parties).filter((p) => p.active).map((p) => p.id);
  const { segments, comunas } = buildTerritory(mode, rng, active);
  s.segments = segments; s.comunas = comunas;
  // Centrado: el centro del electorado coincide con el centro ponderado de la oferta partidaria
  const nat = nationalTargets(mode);
  const shares: Record<string, number> = {};
  for (const p of active) shares[p] = nat[p] ?? fallbackShares[p] ?? 1;
  const tot = Object.values(shares).reduce((a, b) => a + b, 0);
  const center: Ideology = zeroIdeology();
  for (const p of active) for (const d of DIMS) center[d] += s.parties[p].ideology[d] * shares[p] / tot;
  const cur = electorateCenter(s);
  for (const seg of s.segments) for (const d of DIMS) seg.ideology[d] = clamp(seg.ideology[d] + center[d] - cur[d], -95, 95);
  // Calibración de afinidades por comuna
  const targets = partyTargets(mode, active, { ...fallbackShares, ...nat });
  const fit = calibratePartisanship(s, targets, 22, TERRITORY_COEF.partisanShrink);
  const ref = REFERENCE[mode];
  s.territoryCalibration = {
    mode, fitMAE: Math.round(fit * 100) / 100,
    sources: [...new Set([...ref.leftRight, ref.populist, ref.turnout, ref.parties])].map((id) => TERRITORY.meta.sources.find((x) => x.id === id)?.label ?? id),
    notes: [
      `Afinidades calibradas contra ${ref.parties} por comuna, contraídas ${Math.round((1 - TERRITORY_COEF.partisanShrink) * 100)}% hacia la media regional.`,
      'Partidos sin lista en una comuna reciben un piso de apoyo (25% de su media regional) para permitir presencia futura.',
    ],
  };
  // Organización territorial: comunal y regional a partir del apoyo calibrado
  const res = computeShares(s, partyOptions(s), buildUtilityContext(s, false));
  for (const c of COMUNAS) {
    const v = res.byComuna[c.cut]; if (!v) continue;
    const t = Object.values(v).reduce((a, b) => a + b, 0) || 1;
    const st = s.comunas[c.cut];
    for (const p of active) st.org[p] = clamp(0.12 + ((v[p] ?? 0) / t) * 1.8, 0.05, 0.9);
    st.lastShares = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x / t]));
  }
  for (const r of REGIONS) {
    const v = res.byRegion[r.id] ?? {}; const t = Object.values(v).reduce((a, b) => a + b, 0) || 1;
    for (const p of active) s.parties[p].territorial[r.id as RegionId] = clamp(0.12 + ((v[p] ?? 0) / t) * 1.8, 0.05, 0.9);
    s.regions[r.id].lastResults = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x / t]));
  }
}

/** Alcaldías iniciales (SIMULADAS): partido con mayor apoyo modelado en la comuna, con ruido. */
export function initialMayors(s: GameState, rng: Rng): void {
  for (const r of REGIONS) s.regions[r.id].mayorsByParty = {};
  for (const c of COMUNAS) {
    const sh = s.comunas[c.cut].lastShares;
    const entries = Object.entries(sh);
    const w = rng.chance(0.12) ? 'IND' : rng.weighted(entries.map((e) => e[0]), entries.map((e) => Math.pow(e[1], 3)));
    s.comunas[c.cut].mayorParty = w;
    const reg = s.regions[c.region].mayorsByParty; reg[w] = (reg[w] ?? 0) + 1;
  }
}
