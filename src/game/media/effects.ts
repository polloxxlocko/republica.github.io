/**
 * EFECTOS DE LA COBERTURA SOBRE LA CARRERA. Se distinguen: reconocimiento (sube con cualquier
 * cobertura según alcance), evaluación (depende del TONO, la credibilidad del medio y la cercanía con
 * su audiencia), credibilidad personal (afectada por coberturas de transparencia) y reacciones de
 * otros dirigentes. Aparecer en un medio grande NO otorga popularidad por sí mismo.
 */
import type { GameState } from '../models/types';
import type { Rng } from '../engine/rng';
import { clamp } from '../rules/params';
import { currentISO } from '../systems/util';
import { remember } from '../systems/characters';
import type { CoverageItem } from './types';
import { OUTLET_BY_ID, credibilityOf, perceivedLean, reachOf } from './registry';

const DEPTH_W = { breve: 0.4, nota: 1, reportaje: 1.5, analisis: 1.2, entrevista: 1.5 } as const;

export function applyCoverageEffects(s: GameState, rng: Rng, items: CoverageItem[]): void {
  const st = s.media!; const iso = currentISO(s);
  const me = s.characters[s.player.characterId];
  const byEvent = new Map(st.events.map((e) => [e.id, e]));
  let weekTone = 0;
  // Agregación por hecho y protagonista: más medios suman, pero con rendimientos decrecientes
  const groups = new Map<string, { e: (typeof st.events)[number]; id: string; items: CoverageItem[] }>();
  for (const it of items) {
    const e = byEvent.get(it.eventId); if (!e || it.depth === 'entrevista') continue; // las entrevistas ya aplicaron sus efectos
    for (const id of e.actors) { const k = `${e.id}|${id}`; const g = groups.get(k) ?? { e, id, items: [] }; g.items.push(it); groups.set(k, g); }
  }
  for (const { e, id, items: its } of groups.values()) {
    const c = s.characters[id]; if (!c) continue;
    let wNat = 0, wTot = 0, toneW = 0, qual = 0, transp = 0;
    const lr = (c.ideology.eco * 1.4 + c.ideology.val * 0.8 + c.ideology.seg * 0.9 + c.ideology.soc * 0.8 + c.ideology.lab) / 490;
    for (const it of its) {
      const o = OUTLET_BY_ID[it.outletId] ?? st.fictional.find((f) => f.id === it.outletId); if (!o) continue;
      const reach = reachOf(o, iso, c.regionId).value * (st.audience[o.id] ?? 1);
      const local = o.scope !== 'nacional' && o.regionId !== c.regionId ? 0.2 : 1;
      const w = DEPTH_W[it.depth] * reach * local;
      const cred = credibilityOf(o, iso).value; const lean = perceivedLean(o, iso);
      const fit = lean === null ? 0.8 : 1 - 0.45 * Math.abs(lean - lr);
      if (o.scope === 'nacional') wNat += w;
      wTot += w; toneW += it.tone * w; qual += w * (0.4 + cred) * fit;
      if (it.frame === 'transparencia' && it.tone < -0.2) transp += w;
    }
    if (wTot <= 0) continue;
    const eff = (x: number) => Math.pow(x, 0.6);
    // 1) Reconocimiento: cualquier cobertura, incluso crítica
    c.rep.reconocimiento = clamp(c.rep.reconocimiento + 1.4 * eff(wNat) * (1 - c.rep.reconocimiento / 120), 0, 100);
    c.rep.reconocimientoRegional[c.regionId] = clamp((c.rep.reconocimientoRegional[c.regionId] ?? 0) + 1.6 * eff(wTot), 0, 100);
    // 2) Evaluación: tono medio × calidad (credibilidad y cercanía de la audiencia) × alcance decreciente
    const meanTone = toneW / wTot; const meanQual = qual / wTot;
    const dPop = meanTone * meanQual * 1.6 * eff(wTot);
    c.rep.popularidad = clamp(c.rep.popularidad + dPop, 0, 100);
    // 3) Credibilidad personal: coberturas críticas de transparencia
    if (transp > 0) c.rep.credibilidad = clamp(c.rep.credibilidad - 1.5 * eff(transp), 0, 100);
    if (c.id === me?.id) {
      weekTone += meanTone * eff(wTot);
      for (const it of its) st.appearances.push({ week: s.week, outletId: it.outletId, kind: 'cobertura', eventId: e.id, tone: it.tone, effects: [] });
      const last = st.appearances[st.appearances.length - 1];
      last.effects = [`Conocimiento ↑ (${its.length} medio${its.length > 1 ? 's' : ''})`, `Evaluación ${dPop >= 0.1 ? '↑' : dPop <= -0.1 ? '↓' : '≈'} ${dPop >= 0 ? '+' : ''}${dPop.toFixed(1)}`];
    }
  }
  // 4) Difusión digital: conocimiento sí; la evaluación depende del contenido (sentimiento)
  for (const e of st.events.filter((x) => x.week === s.week && x.social && x.virality > 0.55)) {
    for (const id of e.actors) {
      const c = s.characters[id]; if (!c) continue;
      c.rep.reconocimiento = clamp(c.rep.reconocimiento + 1.2 * e.virality, 0, 100);
      c.rep.popularidad = clamp(c.rep.popularidad + (e.social!.positive - e.social!.negative) * 1.5, 0, 100);
      if (c.id === me?.id) st.appearances.push({ week: s.week, outletId: 'redes', kind: 'viral', eventId: e.id, tone: e.social!.positive - e.social!.negative, effects: ['Circulación digital alta: conocimiento ↑', 'No equivale a respaldo electoral'] });
    }
  }
  // 5) Reacciones de otros dirigentes ante una semana mediática intensa (dependen de su personalidad)
  if (me?.partyId && Math.abs(weekTone) > 0.6) {
    const leader = s.characters[s.parties[me.partyId]?.leaderId ?? ''];
    if (leader && leader.id !== me.id && rng.chance(leader.personality === 'mediatico' || leader.personality === 'ambicioso' ? 0.6 : 0.3)) {
      remember(leader, { week: s.week, aboutId: me.id, kind: weekTone > 0 ? 'apoyo' : 'conflicto', weight: weekTone > 0 ? 2 : -3, note: weekTone > 0 ? 'Buena semana en los medios' : 'Cobertura crítica que incomoda al partido' });
    }
  }
  if (st.appearances.length > 120) st.appearances.splice(0, st.appearances.length - 120);
}
