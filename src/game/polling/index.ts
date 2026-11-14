/**
 * Orquestación semanal del sistema de encuestas:
 * calendario → publicación (muestra del electorado sintético) → registros públicos → noticias →
 * reacciones de los actores → entrega de estudios privados → evaluación tras elecciones.
 */
import type { GameState } from '../models/types';
import type { Rng } from '../engine/rng';
import { addNews } from '../systems/news';
import type { PollingState, Survey } from './types';
import { POLLSTER_PROFILES, pollsterName } from './registry';
import { evolveCommon } from './methodology';
import { buildSurvey, legacyPolls, previousOf, pctOf, questionIn } from './publisher';
import { due, scheduleNext, inCampaign } from './scheduler';
import { reactToSurvey } from './reactions';
import { deliverPrivate } from './private';
import { evaluateResults } from './history';
import { getFrame } from './sampling';
import { presidentialOptions } from './field';
import { REGIONS } from '../data/geography';
import type { RegionId } from '../models/types';

export function emptyPolling(): PollingState {
  return { surveys: [], house: {}, common: {}, commonApproval: 0, nextDue: {}, editions: {}, orders: [], evaluations: [], lastPrivateWeek: -99 };
}

/** ¿Merece la edición una noticia? Solo si hay algo políticamente relevante (no inundar la portada). */
function newsworthiness(s: GameState, sv: Survey): number {
  let score = 0;
  const prev = previousOf(s, sv);
  const a = pctOf(questionIn(sv, 'aprobacion'), 'aprueba'); const b = pctOf(questionIn(prev, 'aprobacion'), 'aprueba');
  if (a !== undefined && b !== undefined) score += Math.abs(a - b) / 2;
  const p1 = questionIn(sv, 'presidencial_lista'); const p0 = questionIn(prev, 'presidencial_lista');
  if (p1 && p0 && p1.options[0]?.key !== p0.options[0]?.key) score += 4;
  if (p1) score += 1;
  if (sv.pollsterId === 'cep') score += 3;
  if (sv.flash) score += 2;
  if (sv.questions.some((q) => q.id === `figura_${s.player.characterId}`)) score += 3;
  return score;
}

function pickRegion(s: GameState, rng: Rng): RegionId {
  const me = s.characters[s.player.characterId];
  const ws = REGIONS.map((r) => (r.id === me.regionId ? 4 : 1) * Math.sqrt(s.segments.filter((x) => x.regionId === r.id).reduce((a, x) => a + x.voters, 0)));
  return rng.weighted(REGIONS, ws).id as RegionId;
}

export function weeklyPolling(s: GameState, rng: Rng): void {
  const pol = (s.polling ??= emptyPolling());
  getFrame(s); // marco de la semana (una vez)
  const keys = [...Object.keys(s.parties), ...presidentialOptions(s).map((x) => x.key)];
  evolveCommon(pol.common, rng, keys);
  pol.commonApproval = 0.96 * pol.commonApproval + rng.normal(0, 0.02);
  const published: Survey[] = [];
  for (const p of POLLSTER_PROFILES) {
    const d = due(s, rng, p); if (!d) continue;
    const regionId = p.coverage === 'regional' ? pickRegion(s, rng) : undefined;
    const sv = buildSurvey(s, rng, p, { flash: d === 'flash', regionId });
    if (!sv.questions.length) continue;
    pol.surveys.push(sv); published.push(sv);
    s.polls.push(...legacyPolls(s, sv));
    if (d === 'regular') scheduleNext(s, rng, p);
  }
  // Noticias: como máximo dos por semana, las más relevantes
  const ranked = published.map((sv) => ({ sv, score: newsworthiness(s, sv) })).sort((a, b) => b.score - a.score);
  ranked.forEach(({ sv, score }, i) => {
    if (i < 2 && (score >= 2 || (i === 0 && inCampaign(s)))) addNews(s, rng, 'encuestas', `${pollsterName(s, sv.pollsterId)} (simulada): ${sv.headline}`, `${sv.veda ? 'Edición en período de veda: sin preguntas de preferencia electoral. ' : ''}Encuesta ficticia generada por el juego. Trabajo de campo de ${sv.fieldDays} días, ${sv.n} casos.`, 2);
  });
  for (const sv of published) reactToSurvey(s, rng, sv);
  deliverPrivate(s, rng);
  evaluateResults(s);
  compactSurveys(s);
  if (s.polls.length > 900) s.polls.splice(0, s.polls.length - 900);
}

/** Estado inicial: una edición de referencia por estudio nacional activo (publicada al inicio). */
export function initPolling(s: GameState, rng: Rng): void {
  s.polling = emptyPolling();
  getFrame(s);
  for (const p of POLLSTER_PROFILES) {
    if (p.coverage !== 'nacional' || p.id === 'cep') { s.polling.nextDue[p.id] = p.schedule.offset; continue; }
    const sv = buildSurvey(s, rng, p, { forceTopics: ['aprobacion', 'partidos', ...p.topics.filter((t) => ['figuras', 'economia', 'problemas'].includes(t))] });
    s.polling.surveys.push(sv); s.polls.push(...legacyPolls(s, sv));
    s.polling.nextDue[p.id] = Math.max(1, p.schedule.offset || p.schedule.everyWeeks);
  }
}

/**
 * Retención acotada: dos años de publicaciones; las anteriores solo si alguna evaluación las cita.
 * Tras 8 semanas se descartan detalles secundarios (submuestras, figuras ajenas al jugador) para
 * mantener la partida liviana; las series del comparador se conservan.
 */
function compactSurveys(s: GameState): void {
  const pol = s.polling!;
  const cited = new Set(pol.evaluations.flatMap((e) => e.rows.map((r) => r.surveyId)));
  pol.surveys = pol.surveys.filter((sv) => s.week - sv.publishedWeek <= 104 || cited.has(sv.id));
  const me = s.player.characterId;
  for (const sv of pol.surveys) {
    if (s.week - sv.publishedWeek !== 8) continue;
    sv.questions = sv.questions.filter((q) => q.topic !== 'figuras' || q.subject === me).map((q) => ({ ...q, territorial: undefined, effN: Math.round(q.effN) }));
  }
}
