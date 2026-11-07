/**
 * OPINIÓN PÚBLICA. Distingue cambios coyunturales (aprobación semanal, con inercia) de tendencias
 * estructurales (structuralMood, confianza institucional) que se mueven lentamente.
 */
import type { GameState, PolicyArea } from '../models/types';
import { Rng } from '../engine/rng';
import { OPINION, clamp } from '../rules/params';
import { economicMood } from './economy';
import { pollAverage } from './polls';

export const BASE_PRIORITIES: Record<PolicyArea, number> = {
  seguridad: 0.3, salud: 0.16, economia: 0.12, pensiones: 0.1, educacion: 0.07, vivienda: 0.06, migracion: 0.07, trabajo: 0.05,
  probidad: 0.03, impuestos: 0.01, transporte: 0.01, energia: 0.005, medioambiente: 0.01, descentralizacion: 0.005,
  infraestructura: 0.005, exterior: 0.0, ciencia: 0.0,
};

export function weeklyOpinion(s: GameState, rng: Rng): void {
  const o = s.opinion; const e = s.economy; const g = s.government;
  // Escándalos en el gabinete
  let scandal = 0;
  for (const post of g.cabinet) if (post.ministerId) scandal += s.characters[post.ministerId]?.scandal ?? 0;
  scandal = scandal / Math.max(1, g.cabinet.length) + (s.characters[g.presidentId]?.scandal ?? 0) * 0.5;
  const crisisPenalty = s.crises.reduce((a, c) => a + c.severity * 0.08, 0);
  const coal = g.coalitionId ? s.coalitions[g.coalitionId] : null;
  const president = s.characters[g.presidentId];
  const target = OPINION.approvalBase
    + (g.honeymoon > 0 ? OPINION.honeymoonBonus * (g.honeymoon / OPINION.honeymoonWeeks) : 0)
    - (e.unemployment - 8.5) * OPINION.unemploymentWeight
    - Math.max(0, e.inflation - 3.5) * OPINION.inflationWeight
    + (e.growth - 2) * OPINION.growthWeight
    + (o.securityPerception - 40) * OPINION.securityWeight
    - scandal * OPINION.scandalWeight
    - crisisPenalty
    + (coal ? (coal.cohesion - 60) * 0.08 : -3)
    + (president ? (president.attrs.comunicacion - 50) * 0.08 : 0)
    + o.structuralMood * 0.1
    // desgaste: tras la luna de miel, la aprobación tiende a erosionarse con el tiempo en el poder
    - clamp((s.week - g.startWeek - OPINION.honeymoonWeeks) / 52 * 2.5, 0, 9);
  o.presidentialApproval = clamp(OPINION.approvalInertia * o.presidentialApproval + (1 - OPINION.approvalInertia) * target + rng.normal(0, 0.6), 8, 85);
  o.governmentApproval = clamp(0.9 * o.governmentApproval + 0.1 * (o.presidentialApproval - 3), 5, 85);
  if (g.honeymoon > 0) g.honeymoon -= 1;
  // Evaluación económica y percepción de seguridad
  o.economicEvaluation = clamp(0.9 * o.economicEvaluation + 0.1 * (economicMood(s) - 50) * 2, -100, 100);
  const secPolicies = (o.areaSatisfaction.seguridad ?? 0) * 0.1;
  o.securityPerception = clamp(0.97 * o.securityPerception + 0.03 * (32 + secPolicies) + rng.normal(0, 0.3), 5, 95);
  // Confianza institucional y estado de ánimo estructural (lentos)
  const partyScandals = Object.values(s.parties).filter((p) => p.active).reduce((a, p) => a + (100 - p.credibility), 0) / Math.max(1, Object.values(s.parties).filter((p) => p.active).length);
  o.institutionalTrust = clamp(0.995 * o.institutionalTrust + 0.005 * (45 - partyScandals * 0.2 + (o.presidentialApproval - 40) * 0.2), 5, 90);
  o.partyTrust = clamp(0.995 * o.partyTrust + 0.005 * (25 - partyScandals * 0.1), 3, 70);
  // Clima político: componente estructural lento + paseo aleatorio persistente (diversidad entre partidas)
  o.structuralMood = clamp(0.995 * o.structuralMood + 0.005 * ((economicMood(s) - 50) + (o.securityPerception - 40) * 0.5) + rng.normal(0, 1.1), -100, 100);
  // Prioridades ciudadanas dinámicas
  const pr: Record<PolicyArea, number> = { ...BASE_PRIORITIES };
  pr.seguridad += (40 - o.securityPerception) * 0.004;
  pr.economia += Math.max(0, e.unemployment - 8) * 0.02 + Math.max(0, -e.growth) * 0.03;
  pr.trabajo += Math.max(0, e.unemployment - 8) * 0.015;
  pr.economia += Math.max(0, e.inflation - 4) * 0.02;
  for (const c of s.crises) {
    const area: PolicyArea = c.kind === 'sanitaria' ? 'salud' : c.kind === 'ambiental' ? 'medioambiente' : c.kind === 'economica' ? 'economia' : c.kind === 'social' ? 'pensiones' : 'probidad';
    pr[area] += c.severity * 0.002;
  }
  for (const [a, v] of Object.entries(o.areaSatisfaction) as [PolicyArea, number][]) pr[a] = Math.max(0, pr[a] - v * 0.0008);
  const tot = Object.values(pr).reduce((a, b) => a + Math.max(0, b), 0);
  for (const k of Object.keys(pr) as PolicyArea[]) o.priorities[k] = 0.85 * (o.priorities[k] ?? 0) + 0.15 * Math.max(0, pr[k]) / tot;
  for (const k of Object.keys(o.areaSatisfaction) as PolicyArea[]) o.areaSatisfaction[k] = (o.areaSatisfaction[k] ?? 0) * 0.995;

  // Popularidad de partidos: reversión a la media, efecto gobierno, credibilidad
  const govMembers = new Set(coal?.members ?? []);
  const presParty = president?.partyId;
  for (const p of Object.values(s.parties)) {
    if (!p.active) continue;
    const isGov = govMembers.has(p.id) || p.id === presParty;
    p.popularity = clamp(p.popularity + 0.02 * (50 - p.popularity) + (isGov ? (o.presidentialApproval - 42) * 0.008 * (p.id === presParty ? 1.5 : 1) : 0) + rng.normal(0, 0.15), 5, 95);
    p.rejection = clamp(p.rejection + 0.015 * (40 - p.rejection) + (isGov ? (42 - o.presidentialApproval) * 0.005 : 0), 5, 95);
    p.credibility = clamp(p.credibility + 0.01 * (55 - p.credibility), 5, 95);
  }
  // Personajes: reversión lenta de popularidad y desvanecimiento de escándalos
  for (const c of Object.values(s.characters)) {
    if (c.status !== 'activo') continue;
    c.rep.popularidad = clamp(c.rep.popularidad + 0.01 * (45 - c.rep.popularidad), 0, 100);
    c.scandal = Math.max(0, c.scandal * 0.97 - 0.05);
    if (c.offices.length === 0 && !c.isPlayer) c.rep.reconocimiento = Math.max(0, c.rep.reconocimiento - 0.03);
  }
  if (president) president.rep.popularidad = clamp(0.8 * president.rep.popularidad + 0.2 * o.presidentialApproval, 0, 100);
  if (s.week % 4 === 0) {
    // Se registra el PROMEDIO DE ENCUESTAS (lo observable), no la intención real oculta
    s.opinionHistory.push({ week: s.week, approval: o.presidentialApproval, parties: pollAverage(s, 'partidos', 6) });
    if (s.opinionHistory.length > 800) s.opinionHistory.splice(0, s.opinionHistory.length - 800);
  }
}
