/**
 * MOTOR DE COBERTURA. Cada hecho de la simulación (MediaEvent) puede ser cubierto —o no— por cada
 * medio según: importancia, alcance territorial, protagonistas, impacto institucional, actualidad,
 * información verificable, prioridades editoriales, capacidad semanal, interés probable de su
 * audiencia y coberturas previas. La orientación PERCIBIDA solo pesa débilmente en la selección y el
 * tono; el periodismo de investigación cubre críticamente a cualquier sector.
 *
 * La cobertura nunca agrega hechos: el titular conserva el hecho y la bajada describe el ENFOQUE.
 */
import type { GameState, NewsItem, PolicyArea, RegionId } from '../models/types';
import type { Rng } from '../engine/rng';
import { clamp } from '../rules/params';
import { newId, currentISO } from '../systems/util';
import { REGIONS } from '../data/geography';
import { COMUNA_BY_CUT } from '../territory/data';
import { homeCut } from '../career/capital';
import type { CoverageItem, Depth, Frame, MediaEvent, OutletProfile, Scope } from './types';
import { OUTLETS, perceivedLean } from './registry';

export interface NewsOpts { regionId?: RegionId; cut?: number; actors?: string[]; parties?: string[]; area?: PolicyArea; frames?: Frame[]; verified?: boolean; interview?: { outletId: string; journalistId: string } }

export const FRAME_LABEL: Record<Frame, string> = {
  fiscal: 'los costos fiscales', social: 'el impacto social', legal: 'la dimensión legal e institucional', economico: 'las consecuencias económicas',
  gestion: 'la gestión de las autoridades', territorial: 'el impacto en el territorio', partidario: 'las reacciones partidarias', transparencia: 'la transparencia y la rendición de cuentas',
  seguridad: 'la seguridad', humano: 'las personas involucradas',
};
const FRAME_KICKER: Record<Frame, string> = {
  fiscal: 'Lectura fiscal', social: 'Impacto social', legal: 'Claves institucionales', economico: 'Perspectiva económica', gestion: 'Gestión',
  territorial: 'Mirada territorial', partidario: 'El factor partidario', transparencia: 'Transparencia', seguridad: 'Seguridad', humano: 'Protagonistas',
};
export const DEPTH_LABEL: Record<Depth, string> = { breve: 'Breve', nota: 'Nota', reportaje: 'Reportaje', analisis: 'Análisis', entrevista: 'Entrevista' };

const CATEGORY_FRAMES: Record<NewsItem['category'], Frame[]> = {
  congreso: ['legal', 'fiscal', 'partidario', 'social'], gobierno: ['gestion', 'fiscal', 'social', 'territorial'], economia: ['economico', 'fiscal', 'social'],
  partidos: ['partidario', 'humano'], coaliciones: ['partidario', 'legal'], elecciones: ['partidario', 'territorial', 'humano'], crisis: ['seguridad', 'gestion', 'social', 'humano'],
  regiones: ['territorial', 'gestion', 'social'], jugador: ['humano', 'partidario', 'territorial'], encuestas: ['partidario', 'gestion'],
};
const SCANDAL = /escándalo|irregular|investiga|probidad|denuncia|fiscalía|tribunal|querella|acusaci|cuestionamiento/i;

// ───────────────────────────── Creación del hecho ─────────────────────────────
export function inferOpts(s: GameState, category: NewsItem['category'], text: string, o: NewsOpts = {}): Required<Pick<NewsOpts, 'actors' | 'parties'>> & NewsOpts {
  const actors = new Set(o.actors ?? []);
  const me = s.characters[s.player.characterId];
  if (me && (category === 'jugador' || text.includes(`${me.firstName} ${me.lastName}`))) actors.add(me.id);
  const pres = s.characters[s.government.presidentId];
  if (pres && text.includes(pres.lastName.split(' ')[0]) && text.includes(pres.firstName)) actors.add(pres.id);
  let regionId = o.regionId; let cut = o.cut;
  if (!regionId && o.cut) regionId = COMUNA_BY_CUT[o.cut]?.region as RegionId;
  // La actividad de una figura poco conocida es, en principio, noticia local (puede escalar después)
  if (!regionId && me && actors.has(me.id) && actors.size === 1 && category === 'jugador') {
    if (me.rep.reconocimiento < 22) { regionId = me.regionId; cut = homeCut(s); }
    else if (me.rep.reconocimiento < 50) regionId = me.regionId;
  }
  if (!regionId) regionId = REGIONS.find((r) => text.includes(r.name) || (r.shortName && text.includes(r.shortName)))?.id as RegionId | undefined;
  const parties = new Set(o.parties ?? []);
  for (const p of Object.values(s.parties)) if (p.active && p.short.length >= 2 && new RegExp(`\\b${p.short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) parties.add(p.id);
  return { ...o, regionId, cut, actors: [...actors], parties: [...parties] };
}

export function makeEvent(s: GameState, rng: Rng, news: NewsItem, subjectLean: number, o: ReturnType<typeof inferOpts>): MediaEvent {
  const text = `${news.headline} ${news.body}`;
  const frames = new Set<Frame>(o.frames ?? CATEGORY_FRAMES[news.category]);
  if (SCANDAL.test(text)) frames.add('transparencia');
  if (o.area === 'seguridad' || /delincuen|homicid|seguridad|crimen/i.test(text)) frames.add('seguridad');
  if (o.regionId) frames.add('territorial');
  // un hecho territorial de gran importancia es noticia nacional (y también de su región)
  const scope: Scope = o.cut ? 'provincial' : o.regionId && news.importance <= 3 ? 'regional' : 'nacional';
  const notoriety = Math.max(0, ...o.actors.map((id) => (s.characters[id]?.rep.reconocimiento ?? 0) / 100));
  const virality = clamp(0.08 + 0.12 * news.importance / 5 + 0.2 * Math.abs(news.tone) + 0.3 * notoriety + (frames.has('transparencia') ? 0.12 : 0) + rng.normal(0, 0.08), 0, 1);
  return {
    id: newId(s, 'mev'), week: s.week, newsId: news.id, category: news.category, headline: news.headline, body: news.body, importance: news.importance, tone: news.tone,
    subjectLean, scope, regionId: o.regionId, cut: o.cut, actors: o.actors, parties: o.parties, frames: [...frames], area: o.area, stage: scope,
    virality, verified: o.verified ?? true,
  };
}

// ───────────────────────────── Decisión de cobertura ─────────────────────────────
const RANK: Record<Scope, number> = { provincial: 0, regional: 1, nacional: 2 };

function scopeFit(o: OutletProfile, e: MediaEvent): number {
  const stage = e.stage;
  if (o.scope === 'nacional') return stage === 'nacional' ? 1 : stage === 'regional' ? 0.12 + 0.18 * e.importance / 5 : 0.03 + 0.07 * (e.importance >= 4 ? 1 : 0);
  if (o.scope === 'regional') {
    if (e.regionId && e.regionId === o.regionId) return 1;
    if (!e.regionId) return 0.35 * e.importance / 5; // los medios regionales seleccionan la agenda nacional
    return 0;
  }
  // provincial/comunal
  if (e.cut && o.cuts?.includes(e.cut)) return 1;
  if (e.regionId && e.regionId === o.regionId) return 0.45;
  return e.regionId ? 0 : 0.15 * e.importance / 5;
}

function topicWeight(o: OutletProfile, e: MediaEvent): number {
  const p = o.priorities;
  const byCat: Record<NewsItem['category'], number> = {
    congreso: p.institucional, gobierno: (p.institucional + p.social) / 2, economia: p.economia, partidos: p.institucional * 0.9, coaliciones: p.institucional * 0.9,
    elecciones: p.institucional, crisis: (p.seguridad + p.social) / 2, regiones: p.regional, jugador: (p.institucional + p.regional) / 2, encuestas: (p.analisis + p.institucional) / 2,
  };
  let w = byCat[e.category];
  if (e.frames.includes('transparencia')) w = Math.max(w, p.investigacion);
  if (e.frames.includes('seguridad')) w = Math.max(w, p.seguridad * 0.9);
  return w;
}

/** Puntaje de interés de un medio por un hecho (probabilidad de cubrirlo, antes de capacidad). */
export function coverScore(s: GameState, o: OutletProfile, e: MediaEvent): number {
  const iso = currentISO(s);
  const fit = scopeFit(o, e); if (fit <= 0) return 0;
  const imp = Math.pow(e.importance / 5, 1.2);
  const notoriety = Math.max(0, ...e.actors.map((id) => (s.characters[id]?.rep.reconocimiento ?? 0) / 100));
  const fresh = Math.pow(0.55, Math.max(0, s.week - e.week)); // actualidad
  const lean = perceivedLean(o, iso) ?? 0;
  const audience = 1 + 0.12 * lean * e.subjectLean * (e.tone || 0.5); // interés probable de la audiencia: efecto débil
  const verif = e.verified ? 1 : 0.4 + 0.5 * o.priorities.investigacion;
  return clamp(0.8 * fit * (0.15 + 0.85 * topicWeight(o, e) ** 1.4) * (0.35 + 0.65 * imp + 0.25 * notoriety) * fresh * audience * verif * (1 + 0.35 * e.virality), 0, 0.97);
}

/** Medio principal que publica primero el hecho (para el registro de noticias). */
export function primaryOutlet(s: GameState, rng: Rng, e: MediaEvent): string {
  const cands = OUTLETS.map((o) => ({ o, w: coverScore(s, o, e) })).filter((x) => x.w > 0.02);
  if (!cands.length) return OUTLETS[0].id;
  return rng.weighted(cands.map((x) => x.o.id), cands.map((x) => x.w ** 2));
}

function pickFrame(rng: Rng, o: OutletProfile, e: MediaEvent): Frame {
  const p = o.priorities;
  const w: Record<Frame, number> = {
    fiscal: (p.economia + p.analisis) / 2, economico: p.economia, social: p.social, legal: (p.institucional + p.analisis) / 2, gestion: p.institucional,
    territorial: p.regional, partidario: p.institucional * 0.8, transparencia: p.investigacion * 1.3, seguridad: p.seguridad, humano: (p.inmediatez + p.social) / 2,
  };
  return rng.weighted(e.frames, e.frames.map((f) => 0.05 + w[f]));
}

function pickDepth(o: OutletProfile, e: MediaEvent, frame: Frame, rng: Rng): Depth {
  if (o.type === 'investigacion') return frame === 'transparencia' ? 'reportaje' : 'analisis';
  if (o.type === 'tv' || o.type === 'radio') return e.importance <= 2 && rng.chance(0.6) ? 'breve' : 'nota';
  if (e.importance >= 3 && rng.chance(o.priorities.analisis * 0.6)) return 'analisis';
  return e.importance <= 1 ? 'breve' : 'nota';
}

/** Tono: el hecho manda; la línea percibida pesa poco y la investigación es crítica con todos. */
export function toneFor(o: OutletProfile, e: MediaEvent, frame: Frame, rng: Rng, iso: string): number {
  const lean = perceivedLean(o, iso) ?? 0;
  let t = e.tone * 0.65 + 0.15 * lean * e.subjectLean + rng.normal(0, 0.25);
  if (frame === 'transparencia') t -= 0.35 * o.priorities.investigacion;
  if (frame === 'fiscal' && e.category === 'congreso') t -= 0.1 * o.priorities.economia;
  return clamp(t, -1, 1);
}

function toneText(t: number): string {
  return t < -0.35 ? 'con un tratamiento crítico hacia sus protagonistas' : t > 0.35 ? 'destacando aspectos favorables para sus protagonistas' : 'con un tratamiento principalmente descriptivo';
}

export function buildItem(s: GameState, rng: Rng, o: OutletProfile, e: MediaEvent, opts: { pickedUp?: boolean; depth?: Depth; journalistId?: string } = {}): CoverageItem {
  const frame = pickFrame(rng, o, e);
  const depth = opts.depth ?? pickDepth(o, e, frame, rng);
  const tone = toneFor(o, e, frame, rng, currentISO(s));
  return { id: newId(s, 'cov'), eventId: e.id, outletId: o.id, week: s.week, frame, depth, tone: Math.round(tone * 100) / 100, pickedUp: opts.pickedUp || undefined, journalistId: opts.journalistId };
}

/** Titular del medio: el mismo hecho; análisis y reportajes agregan un antetítulo de enfoque. */
export function covHeadline(e: MediaEvent, c: CoverageItem): string {
  return c.depth === 'analisis' || c.depth === 'reportaje' ? `${FRAME_KICKER[c.frame]} | ${e.headline}` : e.headline;
}
/** Bajada: describe el enfoque y el tono de la cobertura (no agrega hechos). */
export function covDek(c: CoverageItem): string {
  return `${DEPTH_LABEL[c.depth]} que aborda el hecho desde ${FRAME_LABEL[c.frame]}, ${toneText(c.tone)}.${c.pickedUp ? ' El tema fue recogido desde medios de menor alcance.' : ''}`;
}

/**
 * Pasada semanal: cada medio elige, con su capacidad, qué hechos cubre (de esta semana y en
 * difusión). Los hechos locales pueden escalar a medios regionales y nacionales.
 */
export function weeklyCoverage(s: GameState, rng: Rng): CoverageItem[] {
  const st = s.media!;
  const recent = st.events.filter((e) => s.week - e.week <= 3);
  // Difusión: un hecho local con relevancia puede subir de nivel
  for (const e of recent) {
    if (e.stage === 'nacional') continue;
    const covered = st.coverage.filter((c) => c.eventId === e.id).length;
    const notoriety = Math.max(0, ...e.actors.map((id) => (s.characters[id]?.rep.reconocimiento ?? 0) / 100));
    const escalation = clamp(0.35 * e.importance / 5 + 0.07 * covered + 0.35 * e.virality + 0.15 * notoriety + (e.frames.includes('transparencia') ? 0.08 : 0) - 0.15, 0, 0.9);
    if (rng.chance(escalation ** 2)) e.stage = e.stage === 'provincial' ? 'regional' : 'nacional';
  }
  const items: CoverageItem[] = [];
  const active = [...OUTLETS, ...st.fictional.filter((f) => f.closedWeek === undefined)];
  for (const o of active) {
    const already = new Set(st.coverage.filter((c) => c.outletId === o.id).map((c) => c.eventId));
    const cand = recent.filter((e) => !already.has(e.id)).map((e) => ({ e, p: coverScore(s, o, e) * (st.audience[o.id] ?? 1) ** 0.3 })).filter((x) => x.p > 0.03).sort((a, b) => b.p - a.p);
    let used = 0;
    for (const { e, p } of cand) {
      if (used >= o.capacity) break;
      if (!rng.chance(p)) continue;
      const pickedUp = RANK[e.scope] < RANK[o.scope] && e.stage !== e.scope;
      const it = buildItem(s, rng, o, e, { pickedUp });
      items.push(it); used++;
    }
  }
  st.coverage.push(...items);
  return items;
}
