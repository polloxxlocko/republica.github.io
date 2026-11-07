/**
 * API PÚBLICA DEL MOTOR (independiente de React).
 *
 *   advanceWeek(estado) → { estado nuevo, eventos, resultados, decisiones }
 *   dispatch(estado, acción) → { estado nuevo, mensaje }
 *
 * Ambas funciones son puras respecto de su entrada: clonan el estado y usan el generador
 * pseudoaleatorio guardado en él. Misma semilla + misma secuencia de acciones = misma partida.
 */
import type { GameState, TickResult } from '../models/types';
import { Rng } from './rng';
import { yearOf } from './dates';
import { DIFFICULTY } from '../rules/params';
import { MOTION_TEMPLATES } from '../data/policies';
import { yearlyAging } from '../systems/characters';
import { ensureCalendar, nextElection, processElections } from '../systems/elections';
import { updateIntention } from '../systems/electorate';
import { weeklyOpinion } from '../systems/opinion';
import { monthlyEconomy } from '../systems/economy';
import { weeklyParties } from '../systems/parties';
import { coalitionDynamics } from '../systems/coalitions';
import { campaignSpending, decayCampaign, monthlyPositioning } from '../ai/partyAI';
import { fillVacancies, motionPublished, processBills, spawnMotions } from '../systems/parliament';
import { inaugurate, isInaugurationWeek, onPolicyBillClosed, presidentDecision, weeklyGovernment } from '../systems/government';
import { processEvents } from '../systems/events';
import { weeklyPolls } from '../systems/polls';
import { applyAction, leadsParty, me, weeklyPlayer, type PlayerAction } from '../systems/player';
import { generateWeeklyNews } from '../systems/newsGen';
import { checkInvariants } from './invariants';
import { weeklyCareer } from '../career/weekly';
import { setLongMemory } from '../systems/characters';
import { aiTerritorialCampaign, monthlyTerritorialDrift, snapshotPlayerParty, yearlyGenerationalChange } from '../territory/dynamics';
import { addNews } from '../systems/news';

export function clone<T>(x: T): T { return structuredClone(x); }

export function advanceWeek(prev: GameState, opts: { checkInvariants?: boolean } = {}): TickResult {
  const s = clone(prev);
  setLongMemory(s.player.characterId);
  const rng = new Rng(s.rng);
  const aiSkill = DIFFICULTY[s.settings.difficulty].aiSkill;
  s.log = [];
  s.player.lastActionResults = [];
  const prevYear = yearOf(s.startDate, s.week);
  const snapshot = { intention: { ...s.nationalIntention }, approval: s.opinion.presidentialApproval, inflation: s.economy.inflation, unemployment: s.economy.unemployment, growth: s.economy.growth, rate: s.economy.policyRate };
  s.week += 1;
  if (yearOf(s.startDate, s.week) !== prevYear) { yearlyAging(s, rng); yearlyGenerationalChange(s); }
  ensureCalendar(s);
  fillVacancies(s, rng);
  updateIntention(s);
  weeklyOpinion(s, rng);
  if (s.week % 4 === 0) {
    monthlyEconomy(s, rng);
    monthlyTerritorialDrift(s, rng);
    monthlyPositioning(s, rng, aiSkill, leadsParty(s) ? me(s).partyId : null);
  }
  weeklyParties(s, rng, aiSkill);
  const general = nextElection(s, ['diputados', 'alcaldes']);
  const playerLed = leadsParty(s) ? me(s).partyId : null;
  coalitionDynamics(s, rng, general ? general.week - s.week : 999, aiSkill, playerLed);
  const anyElection = nextElection(s, ['diputados', 'alcaldes', 'presidencial', 'presidencial_2v', 'gobernadores']);
  decayCampaign(s, anyElection && anyElection.week - s.week <= 16 ? 0.99 : 0.9);
  campaignSpending(s, rng, anyElection ? anyElection.week - s.week : 999, aiSkill, playerLed, s.player.campaign?.regionFocus);
  aiTerritorialCampaign(s, rng, anyElection ? anyElection.week - s.week : 999, aiSkill, playerLed);
  spawnMotions(s, rng, MOTION_TEMPLATES);
  processBills(s, rng, (st, b, outcome) => {
    if (b.policyId) onPolicyBillClosed(st, rng, b, outcome);
    else if (outcome === 'publicada' && !b.budgetYear) motionPublished(st, b);
    if (b.budgetYear && outcome === 'rechazada') { b.stage = 'publicada'; b.log.push(`S${st.week}: Rige el proyecto del Ejecutivo (art. 67 CPR) pese al rechazo`); }
    if (!b.budgetYear) addNews(st, rng, 'congreso', outcome === 'publicada' ? `Es ley: ${b.title.replace(/^Mensaje: /, '')}` : `Se cae en el Congreso: ${b.title.replace(/^Mensaje: /, '')}`, b.log[b.log.length - 1] ?? '', b.origin === 'mensaje' ? 4 : 2, 0, outcome === 'publicada' ? 1 : -1);
  }, (b) => presidentDecision(s, b));
  weeklyGovernment(s, rng);
  if (s.government.electId && isInaugurationWeek(s)) inaugurate(s, rng);
  const decisions = processEvents(s, rng);
  weeklyPolls(s, rng);
  const newResults = processElections(s, rng);
  if (newResults.length) {
    updateIntention(s); decayCampaign(s, 0.2);
    for (const st of Object.values(s.comunas)) st.campaign = {};
    if (s.results.some((r) => r.week === s.week && (r.type === 'diputados' || r.type === 'alcaldes'))) snapshotPlayerParty(s);
  }
  weeklyPlayer(s);
  const oppsBefore = new Set(s.career.opportunities.map((o) => o.id));
  weeklyCareer(s, rng);
  const newOpportunities = s.career.opportunities.filter((o) => !oppsBefore.has(o.id)).map((o) => o.id);
  generateWeeklyNews(s, rng, snapshot);
  if (opts.checkInvariants) for (const v of checkInvariants(s)) s.log.push(`INVARIANTE: ${v}`);
  s.rng = rng.state;
  return { state: s, events: [...s.log], newResults, newDecisions: decisions, newOpportunities };
}

export function dispatch(prev: GameState, action: PlayerAction): { state: GameState; message: string } {
  const s = clone(prev);
  setLongMemory(s.player.characterId);
  const rng = new Rng(s.rng);
  const message = applyAction(s, rng, action);
  s.rng = rng.state;
  return { state: s, message };
}

/** Avanza varias semanas (detiene si aparece una decisión o una elección del jugador). */
export function advanceUntil(prev: GameState, maxWeeks: number, stopOnDecision = true): { state: GameState; weeks: number; results: string[] } {
  let s = prev; let w = 0; const results: string[] = [];
  while (w < maxWeeks) {
    const r = advanceWeek(s);
    s = r.state; w++;
    results.push(...r.newResults);
    if (stopOnDecision && (r.newDecisions.length || r.newResults.length || r.newOpportunities.length)) break;
  }
  return { state: s, weeks: w, results };
}

export type { PlayerAction };
