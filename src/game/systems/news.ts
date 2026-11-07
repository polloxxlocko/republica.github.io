/**
 * MEDIOS Y NOTICIAS. Las noticias se generan exclusivamente a partir de hechos simulados.
 * Los medios son ficticios; su línea editorial (lean) influye en qué noticias cubren y el tono.
 */
import type { GameState, NewsItem } from '../models/types';
import { Rng } from '../engine/rng';
import { MEDIA } from '../data/institutions';
import { newId } from './util';

/**
 * subjectLean: -1 si la noticia favorece a la izquierda/oposición de izquierda, +1 a la derecha, 0 neutra.
 * Los medios con línea afín tienden a cubrirla con tono positivo; los opuestos, con tono crítico.
 */
export function addNews(s: GameState, rng: Rng, category: NewsItem['category'], headline: string, body: string, importance = 2, subjectLean = 0, tone: -1 | 0 | 1 = 0): void {
  const weights = MEDIA.map((m) => m.reach * (1 + 0.6 * Math.abs(subjectLean) * (m.lean * subjectLean > 0 ? 1 : 0.4)));
  const outlet = rng.weighted(MEDIA, weights);
  s.news.unshift({ id: newId(s, 'n'), week: s.week, outletId: outlet.id, headline, body, category, importance, tone });
  if (s.news.length > 250) s.news.length = 250;
}

export function outletName(id: string): string { return MEDIA.find((m) => m.id === id)?.name ?? id; }
