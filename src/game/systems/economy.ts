/**
 * MODELO MACROECONÓMICO SIMPLIFICADO (paso mensual = cada 4 semanas).
 *
 * Ecuaciones (ver SIMULATION_RULES.md §6). Todas las elasticidades están en ECON (params.ts).
 *  - Brecha:   gap' = 0.92·gap + 0.08·κc·(cobre−ref) + 0.15·m(gap)·impulso − 0.12·(TPM−neutral) + 0.04·(conf−50)/10 + shocks + ε
 *              donde m(gap) = multiplicador alto con holguras (gap<0) y bajo sin holguras.
 *  - Crecimiento = potencial + 4·Δgap (suavizado)
 *  - Inflación: π' = 0.85·π + 0.15·πe + φ·gap·0.15 + traspaso cambiario + shocks
 *  - Desempleo (Okun): u' = 0.85·u + 0.15·(u* − okun·2·gap)
 *  - Banco Central AUTÓNOMO (regla de Taylor suavizada): i* = neutral + 1.5(π−3) + 0.5·gap
 *  - Fiscal: ingresos = base + elasticidad cobre + componente cíclico; deuda' = deuda − saldo/12 − deuda·(g+π)/1200
 */
import type { Economy, GameState } from '../models/types';
import { Rng } from '../engine/rng';
import { ECON, clamp } from '../rules/params';
import { addHistory } from './util';

export function initialEconomy(): Economy {
  return {
    gdp: 335, growth: 2.3, potentialGrowth: 2.2, outputGap: -0.4, inflation: 3.6, inflationExpect: 3.2, unemployment: 8.6,
    realWages: 100, productivity: 100, investment: 23, consumption: 62, debt: 42.5, fiscalBalance: -2.1, revenue: 22.8,
    spending: 24.9, copper: 4.6, exchangeRate: 940, policyRate: 4.5, businessConfidence: 45, consumerConfidence: 42,
    gini: 46, poverty: 6.5, fiscalImpulse: 0, shocks: [],
  };
}

export function monthlyEconomy(s: GameState, rng: Rng): void {
  const e = s.economy;
  const prevGap = e.outputGap;
  const prevCopper = e.copper;
  // Precio del cobre: AR(1) en logaritmos en torno a 4,2 USD/lb
  e.copper = clamp(Math.exp(0.96 * Math.log(e.copper) + 0.04 * Math.log(4.2) + rng.normal(0, 0.07)), 1.8, 8);
  const copperShock = e.shocks.reduce((a, sh) => a + (sh.name.includes('cobre') ? sh.growth : 0), 0);
  if (copperShock) e.copper = clamp(e.copper * (1 + copperShock / 40), 1.8, 8);
  // Tipo de cambio: se aprecia con alza del cobre y diferencial de tasas
  const dCopper = Math.log(e.copper / prevCopper);
  e.exchangeRate = clamp(e.exchangeRate * Math.exp(-0.35 * dCopper - 0.004 * (e.policyRate - 4) + 0.03 * Math.log(930 / e.exchangeRate) + rng.normal(0, 0.015)), 600, 1500);
  const depreciation = (Math.log(e.exchangeRate / 930)) * 100;
  // Shocks vigentes
  let shG = 0; let shPi = 0;
  for (const sh of e.shocks) { shG += sh.growth; shPi += sh.inflation; sh.weeksLeft -= 4; }
  e.shocks = e.shocks.filter((x) => x.weeksLeft > 0);
  // Brecha del producto
  const multiplier = e.outputGap < 0 ? ECON.fiscalMultiplierSlack : ECON.fiscalMultiplierTight;
  const debtPenalty = e.debt > 60 ? (e.debt - 60) * 0.01 : 0; // primas de riesgo con deuda alta
  let gap = 0.92 * e.outputGap
    + 0.08 * ECON.copperGrowthEffect * (e.copper - ECON.copperRef) * 4
    + 0.15 * multiplier * e.fiscalImpulse
    - ECON.monetaryLag * (e.policyRate - ECON.neutralRate)
    + 0.04 * ((e.businessConfidence + e.consumerConfidence) / 2 - 50) / 10
    + shG * 0.12 - debtPenalty * 0.1
    + rng.normal(0, 0.3);
  gap = clamp(gap, -9, 6);
  e.outputGap = gap;
  e.fiscalImpulse *= 0.85;
  const rawGrowth = e.potentialGrowth + 4 * (gap - prevGap) + shG * 0.4;
  e.growth = clamp(0.75 * e.growth + 0.25 * rawGrowth, -9, 10);
  e.gdp *= 1 + e.growth / 1200;
  // Inflación
  const passThrough = ECON.passThrough * depreciation / 10 * 0.25;
  e.inflation = clamp(0.85 * e.inflation + 0.15 * e.inflationExpect + ECON.phillips * gap * 0.15 + passThrough * 0.1 + shPi * 0.15 + rng.normal(0, 0.12), -2, 25);
  e.inflationExpect = clamp(0.9 * e.inflationExpect + 0.07 * ECON.inflationTarget + 0.03 * e.inflation, 1, 15);
  // Desempleo (Okun)
  e.unemployment = clamp(0.85 * e.unemployment + 0.15 * (ECON.naturalUnemployment - ECON.okun * 2 * gap) + rng.normal(0, 0.08), 3, 22);
  // Banco Central (autónomo): regla de Taylor suavizada, en múltiplos de 25 pb
  const target = ECON.neutralRate + ECON.taylorInflation * (e.inflation - ECON.inflationTarget) + ECON.taylorGap * gap;
  const newRate = ECON.rateSmoothing * e.policyRate + (1 - ECON.rateSmoothing) * target;
  e.policyRate = clamp(Math.round(newRate * 4) / 4, 0.5, 15);
  // Productividad y salarios
  e.productivity *= 1 + e.potentialGrowth / 2400;
  e.realWages = clamp(e.realWages * (1 + (e.potentialGrowth * 0.5 - Math.max(0, e.inflation - e.inflationExpect) * 0.3 - (e.unemployment - ECON.naturalUnemployment) * 0.15) / 1200), 60, 200);
  // Confianza
  e.businessConfidence = clamp(0.9 * e.businessConfidence + 0.1 * (50 + e.growth * 4 - Math.max(0, e.debt - 50) * 0.3 + (e.copper - 4) * 3) + rng.normal(0, 1), 5, 95);
  e.consumerConfidence = clamp(0.9 * e.consumerConfidence + 0.1 * (50 + (ECON.naturalUnemployment - e.unemployment) * 4 - (e.inflation - 3) * 4 + e.growth * 2) + rng.normal(0, 1), 5, 95);
  e.investment = clamp(0.95 * e.investment + 0.05 * (22 + (e.businessConfidence - 50) / 5 - (e.policyRate - ECON.neutralRate) * 0.5), 14, 32);
  e.consumption = clamp(0.95 * e.consumption + 0.05 * (62 + (e.consumerConfidence - 50) / 10), 50, 70);
  // Fiscal
  const g = s.government;
  const policyRevenue = g.policies.filter((p) => p.phase === 'completada' || p.phase === 'implementacion').reduce((a, p) => a + (POLICY_REVENUE[p.defId] ?? 0) * (p.phase === 'completada' ? 1 : p.progress / 100), 0);
  const policySpend = g.policies.filter((p) => p.funded && (p.phase === 'implementacion' || p.phase === 'completada' || p.phase === 'evaluacion')).reduce((a, p) => a + Math.max(0, POLICY_COST[p.defId] ?? 0) * (p.phase === 'implementacion' ? 0.5 + p.progress / 200 : 1), 0);
  const policySavings = g.policies.filter((p) => (p.phase === 'implementacion' || p.phase === 'completada') && (POLICY_COST[p.defId] ?? 0) < 0).reduce((a, p) => a + (POLICY_COST[p.defId] ?? 0), 0);
  e.revenue = clamp(g.budget.revenue + ECON.copperRevenueElasticity * (e.copper - ECON.copperRef) + 0.25 * gap + policyRevenue - Math.max(0, -policySavings) * 0, 14, 35);
  const stabilizers = Math.max(0, e.unemployment - ECON.naturalUnemployment) * 0.1;
  const interest = e.debt * ECON.debtInterest * (1 + (e.policyRate - 4) * 0.05);
  const prevSpending = e.spending;
  e.spending = clamp((g.budget.spending + policySpend + policySavings + stabilizers) * (0.85 + 0.15 * g.budget.execution) + interest * 0.1, 15, 40);
  e.fiscalBalance = e.revenue - e.spending - interest * 0.3;
  e.fiscalImpulse += (e.spending - prevSpending) * 0.8;
  e.debt = clamp(e.debt - e.fiscalBalance / 12 - e.debt * (e.growth + e.inflation) / 1200, 5, 200);
  // Indicadores sociales (lentos)
  e.poverty = clamp(e.poverty + ((e.unemployment - ECON.naturalUnemployment) * 0.02 - (e.growth - 2) * 0.015 + (e.inflation - 3) * 0.01), 1, 40);
  e.gini = clamp(e.gini + ((e.unemployment - ECON.naturalUnemployment) * 0.004), 30, 60);
  // Desempleo regional sigue al nacional con persistencia local
  for (const r of Object.values(s.regions)) {
    r.unemployment = clamp(r.unemployment + (e.unemployment - prevNational(s)) * 0.9 + rng.normal(0, 0.05), 2, 20);
    r.discontent = clamp(0.95 * r.discontent + 0.05 * (40 + (r.unemployment - 7) * 4 - (r.infrastructure - 50) * 0.3 - r.investment * 0.2), 0, 100);
    r.investment *= 0.98;
  }
  s.economyHistory.push({ week: s.week, growth: e.growth, inflation: e.inflation, unemployment: e.unemployment, debt: e.debt, copper: e.copper, policyRate: e.policyRate, approval: s.opinion.presidentialApproval, poverty: e.poverty });
  if (s.economyHistory.length > 1000) s.economyHistory.splice(0, s.economyHistory.length - 1000);
  // Hitos
  if (prevGap > -2 && gap <= -2.5 && e.growth < 0) addHistory(s, 'economia', 'La economía entra en recesión', `Crecimiento anualizado de ${e.growth.toFixed(1)}%.`, 4);
}

function prevNational(s: GameState): number {
  const h = s.economyHistory[s.economyHistory.length - 1];
  return h ? h.unemployment : s.economy.unemployment;
}

/** Tablas de costo/ingreso de políticas (se llenan desde el catálogo al cargar el módulo). */
import { POLICIES } from '../data/policies';
const POLICY_COST: Record<string, number> = Object.fromEntries(POLICIES.map((p) => [p.id, p.fiscalCost]));
const POLICY_REVENUE: Record<string, number> = Object.fromEntries(POLICIES.map((p) => [p.id, p.effects.revenue ?? 0]));

export function addShock(s: GameState, name: string, growth: number, inflation: number, weeks: number): void {
  s.economy.shocks.push({ name, growth, inflation, weeksLeft: weeks });
}

/** Indicadores agregados para la interfaz y la IA */
export function economicMood(s: GameState): number {
  const e = s.economy;
  return clamp(50 + e.growth * 6 - (e.unemployment - 8) * 5 - (e.inflation - 3) * 4, 0, 100);
}
