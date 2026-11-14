/**
 * PRIVATE POLLING SYSTEM — estudios encargados por el equipo del jugador.
 *
 * Costos, plazos y tamaños son PARÁMETROS DE JUEGO (no precios de empresas reales). Los informes
 * son privados: no se publican ni los ve la IA. Se generan con el mismo motor muestral, por lo que
 * tienen error, cobertura y efectos de método: no revelan el estado electoral oculto.
 */
import type { GameState, PolicyArea, RegionId } from '../models/types';
import type { Rng } from '../engine/rng';
import { AREA_LABELS } from '../rules/params';
import { newId } from '../systems/util';
import { REGION_BY_ID } from '../data/geography';
import { COMUNA_BY_CUT, comunasOfDistrict } from '../territory/data';
import { homeCut } from '../career/capital';
import { ideoDistance } from '../systems/util';
import type { PollsterProfile, PrivateStudy, Survey, SurveyTopic } from './types';
import { buildSurvey, figuresFor } from './publisher';
import { getFrame, tally } from './sampling';

export interface PrivateSpec { label: string; description: string; cost: number; weeks: number; n: number; scope: 'comuna' | 'region' | 'nacional' | 'candidatura' }
/** Parámetros de juego (MM$ y semanas). */
export const PRIVATE_SPECS: Record<PrivateStudy, PrivateSpec> = {
  sondeo_comunal: { label: 'Sondeo comunal', description: 'Intención de voto por partido, aprobación, problemas locales y tu conocimiento en una comuna.', cost: 6, weeks: 2, n: 400, scope: 'comuna' },
  estudio_regional: { label: 'Estudio regional', description: 'Intención por partido, aprobación, problemas y figuras de la región.', cost: 14, weeks: 3, n: 700, scope: 'region' },
  conocimiento: { label: 'Conocimiento público', description: 'Cuánta gente te conoce a nivel nacional, comparado con otras figuras.', cost: 9, weeks: 2, n: 800, scope: 'nacional' },
  imagen: { label: 'Evaluación de imagen', description: 'Opinión positiva/negativa sobre ti y figuras de referencia.', cost: 11, weeks: 3, n: 800, scope: 'nacional' },
  programa: { label: 'Opinión sobre un programa', description: 'Apoyo ciudadano a una propuesta tuya en un área de política pública.', cost: 12, weeks: 3, n: 800, scope: 'nacional' },
  apoyo_candidatura: { label: 'Medición de candidatura', description: 'Intención de voto por partido y tu conocimiento en el territorio de tu candidatura.', cost: 10, weeks: 2, n: 600, scope: 'candidatura' },
};

const PRIVATE_PROFILE: PollsterProfile = {
  id: 'privado', name: 'Estudio encargado por tu equipo', organization: 'Consultora contratada (ficticia)', real: false, fictionalName: 'Estudio encargado por tu equipo', fictionalOrganization: 'Consultora contratada (ficticia)',
  coverage: 'nacional', periodicity: 'A pedido', topics: [], topicRate: {}, activeSince: '—', activeFrom: '1990-01-01',
  methods: [{ from: '1990-01-01', mode: 'mixto', design: 'no_probabilistico', sample: [400, 800], weighting: ['edad', 'nse', 'zona'], universe: 'Personas de 18 años o más del territorio encargado', note: 'Estudio privado mixto (online y telefónico) con cuotas por edad, NSE y zona. Organización ficticia.', source: '—' }],
  schedule: { everyWeeks: 999, campaignEveryWeeks: 999, flashInCrisis: 0, offset: 0 }, sources: [], caveats: 'Estudio privado de juego.',
};

export function privateBlocked(s: GameState, study: PrivateStudy): string | null {
  const spec = PRIVATE_SPECS[study];
  const pol = s.polling; if (!pol) return 'Sistema de encuestas no disponible';
  if (pol.orders.length > 0) return 'Ya tienes un estudio en curso';
  if (s.week - pol.lastPrivateWeek < 4) return `Tu equipo aún procesa el último estudio (${4 - (s.week - pol.lastPrivateWeek)} sem.)`;
  if (s.player.personalFunds < spec.cost) return `Requiere ${spec.cost} MM$ (tienes ${s.player.personalFunds.toFixed(1)})`;
  if (study === 'apoyo_candidatura' && !s.player.candidacies.length) return 'Necesitas una candidatura en curso';
  return null;
}

export function orderPrivate(s: GameState, study: PrivateStudy, target: { regionId?: RegionId; cut?: number; area?: PolicyArea } = {}): string {
  const b = privateBlocked(s, study); if (b) return `No es posible: ${b}`;
  const spec = PRIVATE_SPECS[study];
  s.player.personalFunds -= spec.cost;
  const me = s.characters[s.player.characterId];
  const t = { ...target };
  if (spec.scope === 'comuna') t.cut ??= homeCut(s);
  if (spec.scope === 'region') t.regionId ??= me.regionId;
  if (study === 'programa') t.area ??= me.specialty;
  s.polling!.orders.push({ id: newId(s, 'ord'), study, orderedWeek: s.week, readyWeek: s.week + spec.weeks, cost: spec.cost, target: t });
  s.polling!.lastPrivateWeek = s.week;
  return `Encargaste un ${spec.label.toLowerCase()} (${spec.cost} MM$). El informe estará listo en ${spec.weeks} semanas.`;
}

function candidacyTerritory(s: GameState): { cuts?: Set<number>; regionId?: RegionId; label: string } {
  const k = s.player.candidacies[0];
  const me = s.characters[s.player.characterId];
  if (k.office === 'diputado' && k.unitId) { const d = Number(k.unitId); return { cuts: new Set(comunasOfDistrict(d).map((c) => c.cut)), label: `Distrito ${d}` }; }
  if ((k.office === 'senador' || k.office === 'gobernador') && k.unitId) return { regionId: k.unitId as RegionId, label: REGION_BY_ID[k.unitId as RegionId]?.name ?? k.unitId };
  if (k.office === 'alcalde' || k.office === 'concejal') { const cut = homeCut(s); return { cuts: new Set([cut]), label: COMUNA_BY_CUT[cut]?.name ?? '' }; }
  if (k.office === 'presidente') return { label: 'Nacional' };
  return { regionId: me.regionId, label: REGION_BY_ID[me.regionId].name };
}

export function deliverPrivate(s: GameState, rng: Rng): Survey[] {
  const pol = s.polling!;
  const out: Survey[] = [];
  const me = s.characters[s.player.characterId];
  for (const o of [...pol.orders]) {
    if (o.readyWeek > s.week) continue;
    pol.orders = pol.orders.filter((x) => x.id !== o.id);
    const spec = PRIVATE_SPECS[o.study];
    const t = o.target ?? {};
    let topics: SurveyTopic[] = []; let cuts: Set<number> | undefined; let regionId: RegionId | undefined; let label: string | undefined;
    let figures: string[] = [me.id];
    switch (o.study) {
      case 'sondeo_comunal': topics = ['partidos', 'aprobacion', 'problemas', 'figuras']; cuts = new Set([t.cut!]); regionId = COMUNA_BY_CUT[t.cut!]?.region as RegionId; label = COMUNA_BY_CUT[t.cut!]?.name; break;
      case 'estudio_regional': topics = ['partidos', 'aprobacion', 'problemas', 'figuras']; regionId = t.regionId; figures = [me.id, ...figuresFor(s, t.regionId, 5).filter((x) => x !== me.id)]; break;
      case 'conocimiento': topics = ['figuras']; figures = [me.id, ...figuresFor(s, undefined, 4).filter((x) => x !== me.id)]; break;
      case 'imagen': topics = ['figuras', 'identificacion']; figures = [me.id, ...figuresFor(s, undefined, 4).filter((x) => x !== me.id)]; break;
      case 'programa': topics = ['problemas']; break;
      case 'apoyo_candidatura': { const ter = candidacyTerritory(s); topics = ['partidos', 'figuras']; cuts = ter.cuts; regionId = ter.regionId ?? (ter.cuts ? COMUNA_BY_CUT[[...ter.cuts][0]]?.region as RegionId : undefined); label = ter.label; if (ter.cuts) regionId = undefined; break; }
    }
    const sv = buildSurvey(s, rng, PRIVATE_PROFILE, { forceTopics: topics, cuts, regionId: cuts ? undefined : regionId, territoryLabel: label, privateFor: me.id, nOverride: Math.round(spec.n * (0.9 + rng.next() * 0.2)), figures });
    if (cuts && regionId === undefined) sv.territory = { label: label ?? 'Territorio encargado' };
    // conocimiento explícito del jugador
    const fr = getFrame(s);
    if (o.study === 'conocimiento' || o.study === 'apoyo_candidatura' || o.study === 'sondeo_comunal') {
      const k = sv.questions.find((q) => q.id === `figura_${me.id}`);
      if (k) { const known = 100 - (k.options.find((x) => x.key === 'nc')?.pct ?? 100); sv.questions.unshift({ ...k, id: `conocimiento_${me.id}`, topic: 'conocimiento', text: `¿Conoce o ha oído hablar de ${me.firstName} ${me.lastName}?`, options: [{ key: 'conoce', label: 'Lo/la conoce', pct: known }, { key: 'nc', label: 'No lo/la conoce', pct: 100 - known }] }); }
    }
    if (o.study === 'programa' && t.area) {
      // propuesta del jugador en el área: apoyo según cercanía ideológica y prioridad del tema
      const area = t.area; const prio = s.opinion.priorities[area] ?? 0.1;
      const answers: string[] = [];
      // submuestra nacional para la pregunta de la propuesta
      const segs = fr.segs; const n = sv.n; const sampleResp: { i: number; w: number }[] = [];
      const cum: number[] = []; let acc = 0; for (const sg of segs) { acc += sg.voters; cum.push(acc); }
      for (let k = 0; k < n; k++) { const x = rng.next() * acc; let lo = 0, hi = segs.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < x) lo = m + 1; else hi = m; } sampleResp.push({ i: lo, w: 1 }); }
      for (const r of sampleResp) {
        const seg = segs[r.i];
        if (rng.next() < 0.12) { answers.push('ns'); continue; }
        const x = 0.6 * Math.log(1 + 8 * prio) - 2.6 * (ideoDistance(seg.ideology, me.ideology) - 0.35) + (me.rep.credibilidad - 50) / 60;
        answers.push(rng.next() < 1 / (1 + Math.exp(-x)) ? 'favor' : 'contra');
      }
      const tq = tally(sampleResp, answers, ['favor', 'contra', 'ns'], { favor: 'A favor', contra: 'En contra', ns: 'No sabe / no responde' });
      sv.questions.unshift({ id: `programa_${area}`, topic: 'politica_publica', subject: AREA_LABELS[area], text: `Le voy a leer una propuesta de ${me.firstName} ${me.lastName} en ${AREA_LABELS[area].toLowerCase()}. ¿Está a favor o en contra?`, options: tq.options, base: tq.base, effN: sv.n / 2.4 });
    }
    sv.headline = `${spec.label}${label ? ` · ${label}` : regionId ? ` · ${REGION_BY_ID[regionId].name}` : ''}: informe entregado`;
    pol.surveys.push(sv);
    out.push(sv);
    s.player.lastActionResults = [...(s.player.lastActionResults ?? []), `Tu equipo entregó el informe: ${spec.label}.`].slice(-8);
  }
  return out;
}
