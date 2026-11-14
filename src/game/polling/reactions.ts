/**
 * POLL REACTION ENGINE — los actores reaccionan a lo que se PUBLICA (promedios y encuestas visibles),
 * nunca al estado oculto. Las reacciones no son automáticas: dependen de la personalidad, la
 * cohesión, las relaciones y la magnitud/consistencia de los cambios.
 */
import type { Character, GameState } from '../models/types';
import type { Rng } from '../engine/rng';
import { addNews } from '../systems/news';
import { pairKey } from '../systems/util';
import { remember } from '../systems/characters';
import { clamp } from '../rules/params';
import { pushIntel } from '../career/knowledge';
import type { Survey } from './types';
import { pollsterName } from './registry';
import { aggregate } from './aggregator';
import { measurementsFor, publicSurveys } from './queries';
import { previousOf, questionIn } from './publisher';
import { nextNational } from './scheduler';

function cooled(s: GameState, key: string, weeks: number): boolean {
  if ((s.eventCooldowns[key] ?? -1) > s.week) return false;
  s.eventCooldowns[key] = s.week + weeks; return true;
}
const full = (c: Character) => `${c.firstName} ${c.lastName}`;

const aggCache = new Map<string, ReturnType<typeof aggregate>>();
function cachedAgg(s: GameState, qid: string, asOf: number) {
  const k = `${s.id}|${s.week}|${s.polling!.surveys.length}|${qid}|${asOf}`;
  if (!aggCache.has(k)) { if (aggCache.size > 200) aggCache.clear(); aggCache.set(k, aggregate(measurementsFor(s, qid), { asOf })); }
  return aggCache.get(k) ?? null;
}
function change(s: GameState, qid: string, key: string, back: number): { now: number; before: number } | null {
  const a = cachedAgg(s, qid, s.week); const b = cachedAgg(s, qid, s.week - back);
  const now = a?.values[key]?.mean; const before = b?.values[key]?.mean;
  return now !== undefined && before !== undefined && b!.measurements >= 2 ? { now, before } : null;
}

export function reactToSurvey(s: GameState, rng: Rng, sv: Survey): void {
  const label = `${pollsterName(s, sv.pollsterId)} (encuesta simulada)`;
  const me = s.characters[s.player.characterId];
  // 1. Partidos: tendencias sostenidas en el promedio, no una sola medición
  if (questionIn(sv, 'partidos')) {
    for (const p of Object.values(s.parties)) {
      if (!p.active || !p.leaderId) continue;
      const ch = change(s, 'partidos', p.id, 8); if (!ch) continue;
      const d = ch.now - ch.before;
      if (d <= -2.5 && cooled(s, `enc_caida_${p.id}`, 12)) {
        const leader = s.characters[p.leaderId];
        const rivals = Object.values(s.characters).filter((c) => c.status === 'activo' && c.partyId === p.id && c.id !== p.leaderId && (c.personality === 'ambicioso' || c.personality === 'confrontacional') && c.attrs.ambicion > 55);
        const prob = 0.12 + (d <= -4 ? 0.25 : 0) + (p.cohesion < 50 ? 0.15 : 0) + (rivals.length ? 0.2 : 0) - (leader?.personality === 'conciliador' ? 0.08 : 0);
        if (rng.chance(prob)) {
          const rival = rivals.length ? rng.pick(rivals) : null;
          p.cohesion = clamp(p.cohesion - rng.int(3, 6), 0, 100);
          if (rival && leader) remember(rival, { week: s.week, aboutId: leader.id, kind: 'conflicto', weight: -6, note: 'Cuestionó a la directiva tras la caída en encuestas' });
          const txt = `Tras la caída de ${p.short} en las encuestas (${ch.before.toFixed(1)}% → ${ch.now.toFixed(1)}% en el promedio), ${rival ? full(rival) : 'sectores internos'} cuestiona${rival ? '' : 'n'} la conducción de ${leader ? full(leader) : 'la directiva'}.`;
          addNews(s, rng, 'partidos', `Tensión en ${p.short} por su baja en las encuestas`, txt, 3);
          sv.reactions.push(txt);
          if (me.partyId === p.id) pushIntel(s, { topic: 'directiva', text: `En ${p.short} se habla de cambios en la directiva por las encuestas.`, source: rival ? 'contacto' : 'rumor', sourceId: rival?.id, reliability: 'media', truth: true });
        } else sv.reactions.push(`${p.short} baja en el promedio, pero su dirigencia no acusa recibo por ahora.`);
      } else if (d >= 2.5 && cooled(s, `enc_alza_${p.id}`, 12)) {
        p.cohesion = clamp(p.cohesion + 2, 0, 100);
        const txt = `${p.short} sube en el promedio de encuestas (${ch.before.toFixed(1)}% → ${ch.now.toFixed(1)}%); su dirigencia lo celebra y endurece sus condiciones en las negociaciones.`;
        addNews(s, rng, 'partidos', `${p.short} se fortalece en las encuestas`, txt, 2);
        sv.reactions.push(txt);
      }
    }
  }
  // 2. Candidaturas presidenciales con bajo apoyo: reconsideración según personalidad
  const pres = questionIn(sv, 'presidencial_lista');
  const presE = nextNational(s, ['presidencial']);
  if (pres && presE && presE.week - s.week > 8) {
    const agg = aggregate(measurementsFor(s, 'presidencial_lista'), { asOf: s.week });
    for (const [id, v] of Object.entries(agg?.values ?? {})) {
      const c = s.characters[id]; if (!c || c.isPlayer || v.mean >= 4) continue;
      const pr = { pragmatico: 0.2, institucionalista: 0.18, conciliador: 0.18, tecnocrata: 0.12, territorial: 0.1, mediatico: 0.06, ambicioso: 0.04, ideologico: 0.04, confrontacional: 0.03 }[c.personality] ?? 0.08;
      if (cooled(s, `enc_reconsidera_${id}`, 16) && rng.chance(pr)) {
        const txt = `${full(c)} admite que evalúa su candidatura presidencial: no supera el ${Math.ceil(v.high)}% en el promedio de encuestas.`;
        addNews(s, rng, 'elecciones', `${c.firstName} ${c.lastName.split(' ')[0]} evalúa su continuidad en la carrera presidencial`, txt, 3);
        sv.reactions.push(txt);
        if (me.partyId && c.partyId && (me.partyId === c.partyId)) pushIntel(s, { topic: 'candidaturas', text: `${full(c)} podría bajar su candidatura presidencial.`, source: 'contacto', reliability: 'media', truth: true });
      }
    }
    // alta indecisión
    const ns = pres.options.find((o) => o.key === 'ns')?.pct ?? 0;
    if (ns >= 30 && cooled(s, 'enc_indecision', 10)) { const t = `Un ${ns.toFixed(0)}% no sabe por quién votar según ${label}: los comandos reordenan sus equipos y prioridades.`; addNews(s, rng, 'elecciones', 'La indecisión domina la carrera presidencial', t, 2); sv.reactions.push(t); }
    // nuevas candidaturas medidas
    const prev = questionIn(previousOf(s, sv), 'presidencial_lista');
    if (prev) for (const o of pres.options) if (s.characters[o.key] && !prev.options.some((x) => x.key === o.key) && cooled(s, `enc_nueva_${o.key}`, 52)) {
      const t = `${label} incorpora por primera vez a ${o.label} en su lista presidencial (${o.pct.toFixed(0)}%).`; addNews(s, rng, 'elecciones', `${o.label} entra a las encuestas presidenciales`, t, 2); sv.reactions.push(t);
    }
  }
  // 3. Resultados contradictorios entre estudios
  if (pres || questionIn(sv, 'aprobacion')) {
    const qid = pres ? 'presidencial_lista' : 'aprobacion';
    const key = pres ? pres.options[0]?.key : 'aprueba';
    const recent = publicSurveys(s, (x) => x.coverage === 'nacional' && s.week - x.publishedWeek <= 3);
    const last = new Map<string, number>();
    for (const x of recent) { const q = questionIn(x, qid); const v = q?.options.find((o) => o.key === key)?.pct; if (v !== undefined) last.set(x.pollsterId, v); }
    const vals = [...last.values()];
    if (vals.length >= 3 && Math.max(...vals) - Math.min(...vals) >= 7 && cooled(s, 'enc_divergencia', 8)) {
      const t = `Las encuestas no coinciden: entre estudios hay hasta ${(Math.max(...vals) - Math.min(...vals)).toFixed(0)} puntos de diferencia en ${pres ? `el apoyo a ${pres.options[0].label}` : 'la aprobación presidencial'}. Los equipos discuten qué medición creer.`;
      addNews(s, rng, 'encuestas', 'Encuestas (simuladas) divergentes alimentan el debate', t, 3); sv.reactions.push(t);
    }
  }
  // 4. Aprobación presidencial: caídas sostenidas tensionan a la coalición de gobierno
  if (questionIn(sv, 'aprobacion')) {
    const ch = change(s, 'aprobacion', 'aprueba', 6);
    const presParty = s.characters[s.government.presidentId]?.partyId;
    const coal = s.government.coalitionId ? s.coalitions[s.government.coalitionId] : null;
    if (ch && presParty && ch.now - ch.before <= -5 && cooled(s, 'enc_aprob_caida', 10)) {
      let distanced = 0;
      for (const pid of coal?.members ?? []) {
        if (pid === presParty) continue;
        const leader = s.characters[s.parties[pid]?.leaderId ?? ''];
        const pr = leader ? ({ confrontacional: 0.55, ideologico: 0.45, ambicioso: 0.4, mediatico: 0.4 } as Record<string, number>)[leader.personality] ?? 0.15 : 0.1;
        if (rng.chance(pr)) { const k = pairKey(pid, presParty); s.partyRelations[k] = clamp((s.partyRelations[k] ?? 0) - 4, -100, 100); distanced++; }
      }
      const t = `La aprobación presidencial cae en el promedio (${ch.before.toFixed(0)}% → ${ch.now.toFixed(0)}%).${distanced ? ` ${distanced} partido(s) del oficialismo toman distancia del Ejecutivo.` : ' El oficialismo cierra filas por ahora.'}`;
      addNews(s, rng, 'gobierno', 'El Gobierno acusa el golpe en las encuestas', t, 3); sv.reactions.push(t);
    }
  }
  // 5. El jugador en las encuestas
  const fig = questionIn(sv, `figura_${me.id}`);
  if (fig) {
    const known = 100 - (fig.options.find((o) => o.key === 'nc')?.pct ?? 100);
    const pos = fig.options.find((o) => o.key === 'pos')?.pct ?? 0;
    const firstTime = !publicSurveys(s, (x) => x.id !== sv.id && x.questions.some((q) => q.id === `figura_${me.id}`)).length;
    if (firstTime) {
      me.rep.reconocimiento = clamp(me.rep.reconocimiento + 1, 0, 100);
      const t = `${label} te incluye por primera vez en su evaluación de figuras: te conoce un ${known.toFixed(0)}% y ${pos.toFixed(0)}% tiene una opinión positiva.`;
      addNews(s, rng, 'jugador', `${me.firstName} ${me.lastName.split(' ')[0]} aparece por primera vez en ${pollsterName(s, sv.pollsterId)}`, t, 3); sv.reactions.push(t);
    }
  }
}
