/**
 * MEDIOS Y NOTICIAS. Las noticias se generan exclusivamente a partir de hechos simulados.
 * Cada noticia es un HECHO (MediaEvent) que los medios del registro cubren de forma autónoma
 * (src/game/media). El NewsItem conserva el titular factual y el medio que lo publicó primero.
 * Toda cobertura atribuida a medios reales es ficticia y se rotula como tal en la interfaz.
 */
import type { GameState, NewsItem } from '../models/types';
import { Rng } from '../engine/rng';
import { newId } from './util';
import { OUTLETS, OUTLET_BY_ID } from '../media/registry';
import { buildItem, inferOpts, makeEvent, primaryOutlet, type NewsOpts } from '../media/coverage';
import { socialCirculation } from '../media/social';

/**
 * subjectLean: -1 si la noticia favorece a la izquierda/oposición de izquierda, +1 a la derecha, 0 neutra.
 * opts: territorio, protagonistas y dimensiones del hecho (si se omiten, se infieren del texto).
 */
export function addNews(s: GameState, rng: Rng, category: NewsItem['category'], headline: string, body: string, importance = 2, subjectLean = 0, tone: -1 | 0 | 1 = 0, opts: NewsOpts = {}): void {
  const item: NewsItem = { id: newId(s, 'n'), week: s.week, outletId: OUTLETS[0].id, headline, body, category, importance, tone };
  if (s.media) {
    const o = inferOpts(s, category, `${headline} ${body}`, opts);
    const e = makeEvent(s, rng, item, subjectLean, o);
    socialCirculation(s, rng, e);
    s.media.events.push(e);
    item.eventId = e.id;
    if (opts.interview && OUTLET_BY_ID[opts.interview.outletId]) {
      item.outletId = opts.interview.outletId;
      const cov = buildItem(s, rng, OUTLET_BY_ID[opts.interview.outletId], e, { depth: 'entrevista', journalistId: opts.interview.journalistId });
      s.media.coverage.push(cov);
    } else {
      item.outletId = primaryOutlet(s, rng, e);
      s.media.coverage.push(buildItem(s, rng, OUTLET_BY_ID[item.outletId], e));
    }
  }
  s.news.unshift(item);
  if (s.news.length > 250) s.news.length = 250;
}

const LEGACY: Record<string, string> = { brujula: 'Diario La Brújula (ficticio)', observador: 'El Observador Austral (ficticio)', portal: 'Portal Ciudadano (ficticio)', andina: 'Radio Andina (ficticio)', hemiciclo: 'Revista Hemiciclo (ficticio)', canalsur: 'Señal Sur TV (ficticio)' };
export function outletName(id: string, g?: GameState | null): string {
  return OUTLET_BY_ID[id]?.name ?? g?.media?.fictional.find((f) => f.id === id)?.name ?? LEGACY[id] ?? (id === 'redes' ? 'Redes sociales' : id);
}
