/**
 * IA DE PARTIDOS basada en utilidades.
 *
 * Cada partido pondera objetivos (votos, cargos, políticas, identidad) y actúa con información
 * IMPERFECTA: usa promedios de encuestas (no la intención real) y desconoce las decisiones
 * privadas del jugador. La "habilidad" (aiSkill) depende de la dificultad y reduce el ruido.
 *
 * Decisiones:
 *  1. Posicionamiento ideológico mensual (deriva gradual hacia sus votantes/centro vs. identidad).
 *  2. Gasto de campaña por región antes de elecciones (rendimientos decrecientes).
 *  3. Coaliciones (ver systems/coalitions.ts).
 *  4. Postura frente al gobierno y disciplina.
 */
import type { GameState, Ideology, RegionId } from '../models/types';
import { Rng } from '../engine/rng';
import { DIMS, PARTY, clamp } from '../rules/params';
import { REGIONS, REGION_BY_ID, ELECTORATE_RATIO } from '../data/geography';
import { electorateCenter, voterProfiles } from '../systems/electorate';
import { ideoDistance, zeroIdeology } from '../systems/util';
import { pollAverage, perceivedSupport } from '../systems/polls';
import { DISTRICTS } from '../data/geography';

/** Deriva ideológica mensual. */
export function monthlyPositioning(s: GameState, rng: Rng, aiSkill: number, playerLedParty: string | null): void {
  const profiles = voterProfiles(s);
  const center = electorateCenter(s);
  const polls = pollAverage(s, 'partidos', 12);
  for (const p of Object.values(s.parties)) {
    if (!p.active || p.id === playerLedParty) continue;
    const prof = profiles[p.id] ?? p.ideology;
    // Si cae en encuestas respecto de su historia, se mueve más (búsqueda de votos)
    const last = p.history[p.history.length - 1]?.votePct ?? s.nationalIntention[p.id] ?? 5;
    const pollNow = polls[p.id] ?? last;
    const pressure = clamp((last - pollNow) / Math.max(3, last), -0.5, 0.8);
    const voteSeeking = clamp(p.goals.votes + pressure * 0.3, 0, 1) * aiSkill;
    const target: Ideology = zeroIdeology();
    // facciones tiran hacia sus posiciones según influencia
    const facW = p.factions.reduce((a, f) => a + f.influence, 0) || 1;
    for (const d of DIMS) {
      const facPull = p.factions.reduce((a, f) => a + f.ideology[d] * f.influence, 0) / facW;
      const electoral = prof[d] * 0.6 + center[d] * 0.4;
      target[d] = p.goals.identity * 1.5 * p.baseIdeology[d] + voteSeeking * electoral + 0.35 * facPull;
      const wsum = p.goals.identity * 1.5 + voteSeeking + 0.35;
      target[d] /= wsum;
      const step = clamp(target[d] - p.ideology[d], -PARTY.maxDriftPerWeek * 4, PARTY.maxDriftPerWeek * 4);
      p.ideology[d] = clamp(p.ideology[d] + step * 0.5 + rng.normal(0, 0.3), -100, 100);
    }
    // tensión interna por moverse lejos de las facciones
    for (const f of p.factions) f.discontent = clamp(f.discontent + ideoDistance(p.ideology, f.ideology) * 8 - 1, 0, 100);
  }
}

function electorateMillions(r: RegionId): number { return REGION_BY_ID[r].population * ELECTORATE_RATIO / 1e6; }

/** Gasto de campaña semanal en las 16 semanas previas a una elección. */
export function campaignSpending(s: GameState, rng: Rng, weeksToElection: number, aiSkill: number, playerLedParty: string | null, playerPartyRegionFocus?: Partial<Record<RegionId, number>>): void {
  if (weeksToElection > 16 || weeksToElection < 0) return;
  const perceived: Partial<Record<RegionId, Record<string, number>>> = {};
  for (const p of Object.values(s.parties)) {
    if (!p.active || p.legalStatus === 'en_formacion') continue;
    const budget = p.funds * 0.06;
    if (budget < 1) continue;
    p.funds -= budget;
    const spend = (s.campaignSpend[p.id] ??= {});
    // prioridad regional: escaños en juego × competitividad, con ruido según habilidad
    const weights: Record<string, number> = {};
    for (const r of REGIONS) {
      const seats = DISTRICTS.filter((d) => d.regionId === r.id).reduce((a, d) => a + d.seats, 0);
      const sup = (perceived[r.id] ??= perceivedSupport(s, r.id))[p.id] ?? 0;
      const competitive = sup > 0.04 && sup < 0.35 ? 1.3 : 0.6;
      const focus = p.id === playerLedParty && playerPartyRegionFocus ? (playerPartyRegionFocus[r.id] ?? 0.2) * 3 : 1;
      weights[r.id] = Math.max(0.01, seats * competitive * focus * (1 + rng.normal(0, 0.5 * (1 - aiSkill))));
    }
    const tot = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const r of REGIONS) spend[r.id] = (spend[r.id] ?? 0) + (budget * weights[r.id] / tot) / (electorateMillions(r.id) * 40);
  }
}

/** Tras cada elección el efecto de campaña se disipa. */
export function decayCampaign(s: GameState, factor = 0.97): void {
  for (const sp of Object.values(s.campaignSpend)) for (const k of Object.keys(sp) as RegionId[]) sp[k] = (sp[k] ?? 0) * factor;
}

export function resetCampaign(s: GameState): void { s.campaignSpend = {}; }
