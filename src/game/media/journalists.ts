/**
 * PERIODISTAS FICTICIOS Y ENTREVISTAS. Los nombres se generan al azar (nunca nombres de periodistas
 * reales a quienes atribuir dichos). Cada periodista trabaja en un medio reconocible, tiene estilo,
 * especialidad y memoria de sus interacciones con el jugador.
 */
import type { GameState, PolicyArea } from '../models/types';
import type { Rng } from '../engine/rng';
import { clamp, AREA_LABELS } from '../rules/params';
import { FEMALE, MALE, SURNAMES } from '../data/names';
import { newId, ideoDistance } from '../systems/util';
import { addNews } from '../systems/news';
import { pushIntel } from '../career/knowledge';
import { remember } from '../systems/characters';
import { REGION_BY_ID } from '../data/geography';
import type { InterviewInvite, InterviewQuestion, InterviewStyle, Journalist } from './types';
import { OUTLETS, OUTLET_BY_ID, credibilityOf, perceivedLean, reachOf } from './registry';
import { currentISO } from '../systems/util';

const AREAS: PolicyArea[] = ['salud', 'educacion', 'vivienda', 'pensiones', 'seguridad', 'trabajo', 'impuestos', 'economia', 'medioambiente', 'descentralizacion', 'probidad', 'migracion'];

export function generateJournalists(rng: Rng): Journalist[] {
  const out: Journalist[] = []; const used = new Set<string>();
  for (const o of OUTLETS) {
    const n = o.scope !== 'nacional' ? 1 : o.type === 'tv' || o.type === 'radio' || o.type === 'diario' ? 2 : 1;
    for (let k = 0; k < n; k++) {
      let name = '';
      for (let t = 0; t < 20 && (!name || used.has(name)); t++) name = `${rng.chance(0.5) ? rng.pick(FEMALE) : rng.pick(MALE)} ${rng.pick(SURNAMES)} ${rng.pick(SURNAMES)}`;
      used.add(name);
      const specialty: Journalist['specialty'] = o.type === 'investigacion' ? 'investigacion' : o.scope !== 'nacional' ? 'regiones' : o.priorities.economia > 0.8 ? 'economia' : rng.weighted(['politica', 'social', 'seguridad'] as const, [o.priorities.institucional, o.priorities.social, o.priorities.seguridad]);
      const style: InterviewStyle = o.type === 'investigacion' ? 'incisivo' : o.priorities.analisis > 0.75 ? rng.pick(['tecnico', 'incisivo'] as const) : o.type === 'tv' ? rng.pick(['directo', 'confrontacional', 'cordial'] as const) : rng.pick(['cordial', 'directo', 'incisivo'] as const);
      out.push({ id: `pz${out.length}`, name, outletId: o.id, specialty, experience: rng.int(3, 32), style, interests: [rng.pick(AREAS), rng.pick(AREAS)], relation: 0, colleagues: [], history: [] });
    }
  }
  // relaciones profesionales: colegas del mismo medio y de la misma especialidad
  for (const j of out) j.colleagues = out.filter((x) => x.id !== j.id && (x.outletId === j.outletId || x.specialty === j.specialty)).slice(0, 3).map((x) => x.id);
  return out;
}

const STYLE_LABEL: Record<InterviewStyle, string> = { incisivo: 'incisivo/a', cordial: 'cordial', tecnico: 'técnico/a', confrontacional: 'confrontacional', directo: 'directo/a' };
export const styleLabel = (s: InterviewStyle) => STYLE_LABEL[s];

/** Invitaciones: más frecuentes con notoriedad, cargos y hechos recientes; locales al comienzo. */
export function weeklyInvites(s: GameState, rng: Rng): void {
  const st = s.media!; const me = s.characters[s.player.characterId];
  if (!me || s.player.careerOver) return;
  for (const inv of st.invites) if (inv.status === 'pendiente' && inv.expiresWeek < s.week) { inv.status = 'expirada'; const j = st.journalists.find((x) => x.id === inv.journalistId); if (j) { j.relation = clamp(j.relation - 2, -100, 100); j.history.push({ week: s.week, kind: 'rechazo', note: 'La invitación expiró sin respuesta' }); } }
  if (st.invites.some((i) => i.status === 'pendiente' || i.status === 'aceptada')) return;
  const rec = me.rep.reconocimiento; const regRec = me.rep.reconocimientoRegional[me.regionId] ?? 0;
  const recentEvents = st.events.filter((e) => s.week - e.week <= 2 && e.actors.includes(me.id));
  const p = clamp(0.06 + rec / 260 + regRec / 400 + recentEvents.length * 0.12 + me.offices.length * 0.04, 0, 0.6);
  if (!rng.chance(p)) return;
  const cands = st.journalists.filter((j) => { const o = OUTLET_BY_ID[j.outletId]; return o && (o.scope === 'nacional' || o.regionId === me.regionId); });
  const iso = currentISO(s);
  const w = cands.map((j) => {
    const o = OUTLET_BY_ID[j.outletId];
    const reach = reachOf(o, iso, me.regionId).value;
    const fame = o.scope === 'nacional' ? (rec / 100) ** 1.3 + (recentEvents.some((e) => e.stage === 'nacional') ? 0.3 : 0) : 0.5 * (1 - rec / 160) + regRec / 200;
    return Math.max(0.001, reach * fame * (1 + j.relation / 120) * (j.interests.includes(me.specialty) ? 1.4 : 1));
  });
  if (!cands.length) return;
  const j = rng.weighted(cands, w);
  const ev = recentEvents[0];
  const reason = ev ? `Quiere conversar sobre «${ev.headline}».` : j.interests.includes(me.specialty) ? `Prepara un tema sobre ${AREA_LABELS[me.specialty].toLowerCase()} y busca tu opinión.` : `Busca voces de ${REGION_BY_ID[me.regionId].name} para su pauta.`;
  st.invites.push({ id: newId(s, 'inv'), journalistId: j.id, outletId: j.outletId, week: s.week, expiresWeek: s.week + 2, reason, status: 'pendiente' });
  j.history.push({ week: s.week, kind: 'invitacion', note: reason });
}

function q(id: string, topic: string, text: string, followUp = false): InterviewQuestion {
  return { id, topic, text, followUp, options: [
    { id: 'datos', label: 'Responder con datos y propuestas concretas' }, { id: 'linea', label: 'Defender la posición de tu partido' },
    { id: 'propia', label: 'Marcar una posición propia' }, { id: 'evadir', label: 'Evitar el punto y cambiar de tema' },
  ] };
}

export function buildQuestions(s: GameState, rng: Rng, j: Journalist): InterviewQuestion[] {
  const me = s.characters[s.player.characterId];
  const party = me.partyId ? s.parties[me.partyId] : null;
  const ev = s.media!.events.filter((e) => e.actors.includes(me.id)).slice(-1)[0];
  const hard = j.style === 'incisivo' || j.style === 'confrontacional' || j.relation < -20;
  const pool: InterviewQuestion[] = [];
  const area = j.interests.includes(me.specialty) ? me.specialty : rng.pick(j.interests);
  pool.push(q('area', AREA_LABELS[area], `${hard ? 'Muchos dicen que no hay propuestas serias en' : '¿Qué propone para'} ${AREA_LABELS[area].toLowerCase()}${hard ? '. ¿Qué responde?' : '?'}`));
  if (ev) pool.push(q('hecho', 'Hecho reciente', `Hablemos de «${ev.headline}». ${hard ? '¿No cree que le debe una explicación a la ciudadanía?' : '¿Cómo lo evalúa?'}`));
  if (party) pool.push(q('partido', 'Partido', party.cohesion < 50 || me.rep.confianzaPartido < 40 ? `En ${party.short} se habla de tensiones internas. ¿Está alineado/a con la directiva?` : `¿Comparte el rumbo que lleva ${party.short}?`));
  const appr = Math.round(s.opinion.presidentialApproval);
  pool.push(q('gobierno', 'Gobierno', `Con una aprobación presidencial cercana al ${appr}% en las encuestas, ¿cómo evalúa al Gobierno?`));
  pool.push(q('region', 'Territorio', `¿Cuál es el principal problema de ${REGION_BY_ID[me.regionId].name} y qué haría usted?`));
  const out: InterviewQuestion[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return out;
}

/** Evalúa una respuesta según atributos, estilo del periodista y tipo de respuesta. */
export function scoreAnswer(s: GameState, rng: Rng, j: Journalist, qq: InterviewQuestion): 'bien' | 'regular' | 'mal' {
  const me = s.characters[s.player.characterId];
  const a = me.attrs;
  const skill = qq.answer === 'datos' ? (a.tecnico * 0.6 + a.comunicacion * 0.4) / 100
    : qq.answer === 'linea' ? (a.comunicacion * 0.5 + a.disciplina * 0.5) / 100
    : qq.answer === 'propia' ? (a.carisma * 0.4 + a.oratoria * 0.6) / 100
    : (a.comunicacion * 0.6 + a.carisma * 0.4) / 100 - 0.18;
  const difficulty = ({ incisivo: 0.12, confrontacional: 0.16, tecnico: qq.answer === 'datos' ? -0.02 : 0.1, cordial: -0.08, directo: 0.04 } as Record<InterviewStyle, number>)[j.style] + (qq.followUp ? 0.08 : 0) - j.relation / 400;
  const x = skill - difficulty + rng.normal(0, 0.15);
  return x > 0.5 ? 'bien' : x > 0.32 ? 'regular' : 'mal';
}

export function answerInterview(s: GameState, rng: Rng, inviteId: string, index: number, answer: NonNullable<InterviewQuestion['answer']>): string {
  const st = s.media!; const inv = st.invites.find((i) => i.id === inviteId);
  if (!inv || inv.status !== 'aceptada' || !inv.questions) return 'Entrevista no disponible.';
  const qq = inv.questions[index]; if (!qq || qq.answer) return 'Pregunta no disponible.';
  const j = st.journalists.find((x) => x.id === inv.journalistId)!;
  qq.answer = answer; qq.result = scoreAnswer(s, rng, j, qq);
  // repregunta: periodistas incisivos no dejan pasar una evasiva
  if (answer === 'evadir' && !qq.followUp && (j.style === 'incisivo' || j.style === 'confrontacional' || rng.chance(0.3))) {
    inv.questions.splice(index + 1, 0, q(`${qq.id}_re`, qq.topic, `Insisto: no respondió. ${qq.text}`, true));
    return `${j.name} repregunta.`;
  }
  if (inv.questions.every((x) => x.answer)) return finishInterview(s, rng, inv);
  return qq.result === 'bien' ? 'Respuesta sólida.' : qq.result === 'regular' ? 'Respuesta correcta, sin brillo.' : 'Respuesta débil.';
}

/** Cierre: efectos diferenciados (conocimiento, evaluación, prestigio, confianza, reacciones). */
export function finishInterview(s: GameState, rng: Rng, inv: InterviewInvite): string {
  const st = s.media!; const me = s.characters[s.player.characterId];
  const j = st.journalists.find((x) => x.id === inv.journalistId)!; const o = OUTLET_BY_ID[inv.outletId];
  const iso = currentISO(s);
  const qs = inv.questions!;
  const val = { bien: 1, regular: 0.2, mal: -0.8 } as const;
  const score = qs.reduce((a, x) => a + val[x.result!], 0) / qs.length;
  const reach = reachOf(o, iso, me.regionId).value * (st.audience[o.id] ?? 1);
  const cred = credibilityOf(o, iso).value;
  const effects: string[] = [];
  const dRec = (o.scope === 'nacional' ? 3 : 1.2) * (0.5 + reach) * (1 - me.rep.reconocimiento / 130);
  me.rep.reconocimiento = clamp(me.rep.reconocimiento + dRec, 0, 100); effects.push(`Conocimiento +${dRec.toFixed(1)}`);
  if (o.regionId) { const r = o.regionId; me.rep.reconocimientoRegional[r] = clamp((me.rep.reconocimientoRegional[r] ?? 0) + 3 * (0.5 + reach), 0, 100); effects.push('Conocimiento regional al alza'); }
  // evaluación: depende del desempeño, la credibilidad del medio y la cercanía con su audiencia percibida
  const lean = perceivedLean(o, iso);
  const myLR = (me.ideology.eco * 1.4 + me.ideology.val * 0.8 + me.ideology.seg * 0.9 + me.ideology.soc * 0.8 + me.ideology.lab) / 490; // ≈ -1..1
  const fit = lean === null ? 0.8 : 1 - 0.5 * Math.abs(lean - myLR);
  const dPop = score * (0.6 + cred) * (0.5 + reach) * fit * 2.2;
  me.rep.popularidad = clamp(me.rep.popularidad + dPop, 0, 100); effects.push(`Evaluación ${dPop >= 0 ? '+' : ''}${dPop.toFixed(1)}`);
  const datosOk = qs.filter((x) => x.answer === 'datos' && x.result === 'bien').length;
  if (datosOk) { me.rep.prestigioTecnico = clamp(me.rep.prestigioTecnico + 1.5 * datosOk, 0, 100); effects.push(`Prestigio técnico +${(1.5 * datosOk).toFixed(1)}`); }
  const party = me.partyId ? s.parties[me.partyId] : null;
  const lines = qs.filter((x) => x.answer === 'linea').length; const own = qs.filter((x) => x.answer === 'propia').length;
  if (party) {
    const dist = ideoDistance(me.ideology, party.ideology);
    const dConf = lines * 1.5 - own * (dist > 0.25 ? 2.5 : 0.5);
    if (dConf) { me.rep.confianzaPartido = clamp(me.rep.confianzaPartido + dConf, 0, 100); effects.push(`Confianza del partido ${dConf >= 0 ? '+' : ''}${dConf.toFixed(1)}`); }
  }
  const evasions = qs.filter((x) => x.answer === 'evadir').length;
  if (evasions) { me.rep.credibilidad = clamp(me.rep.credibilidad - 2 * evasions, 0, 100); effects.push(`Credibilidad −${2 * evasions}`); }
  // memoria del periodista
  const dRel = Math.round(score * 10 - evasions * (j.style === 'incisivo' || j.style === 'confrontacional' ? 6 : 2));
  j.relation = clamp(j.relation + dRel, -100, 100);
  j.history.push({ week: s.week, kind: 'entrevista', note: `Entrevista: ${qs.map((x) => `${x.topic} (${x.result})`).join(', ')}`, result: score });
  // reacciones de dirigentes (no automáticas)
  if (party?.leaderId && Math.abs(score) > 0.5 && rng.chance(0.5)) {
    const leader = s.characters[party.leaderId];
    if (leader && leader.id !== me.id) { remember(leader, { week: s.week, aboutId: me.id, kind: score > 0 ? 'apoyo' : 'conflicto', weight: score > 0 ? 3 : -3, note: `Entrevista en ${o.name}` }); effects.push(score > 0 ? `${leader.firstName} ${leader.lastName.split(' ')[0]} valora tu desempeño` : `${leader.firstName} ${leader.lastName.split(' ')[0]} toma nota de tus dichos`); }
  }
  if (score > 0.5 && o.scope === 'nacional') pushIntel(s, { topic: 'oportunidad', text: `Tras tu entrevista en ${o.name}, en tu sector comentan que podrías tener más espacio. No hay nada asegurado.`, source: 'rumor', reliability: 'media', truth: true });
  inv.status = 'realizada';
  inv.outcome = { score, summary: score > 0.4 ? 'Entrevista bien recibida' : score < -0.2 ? 'Entrevista mal recibida' : 'Entrevista sin grandes repercusiones', effects };
  const tone: -1 | 0 | 1 = score > 0.4 ? 1 : score < -0.2 ? -1 : 0;
  addNews(s, rng, 'jugador', `${me.firstName} ${me.lastName} conversa con ${j.name} en ${o.name}`, `Temas: ${qs.map((x) => x.topic.toLowerCase()).join(', ')}. ${inv.outcome.summary}.`, o.scope === 'nacional' ? 3 : 2, 0, tone, { actors: [me.id], regionId: o.scope === 'nacional' ? undefined : o.regionId, interview: { outletId: o.id, journalistId: j.id } });
  st.appearances.push({ week: s.week, outletId: o.id, kind: 'entrevista', tone: score, effects });
  return `${inv.outcome.summary}. ${effects.join(' · ')}.`;
}

export function inviteBlocked(s: GameState, id: string, want: 'aceptar' | 'rechazar'): string | null {
  const inv = s.media?.invites.find((i) => i.id === id);
  if (!inv) return 'Invitación no disponible';
  if (inv.status !== 'pendiente') return 'La invitación ya fue respondida';
  if (want === 'aceptar' && s.media!.invites.some((i) => i.status === 'aceptada')) return 'Termina primero la entrevista en curso';
  return null;
}

export function acceptInvite(s: GameState, rng: Rng, id: string): string {
  const b = inviteBlocked(s, id, 'aceptar'); if (b) return `No es posible: ${b}`;
  const inv = s.media!.invites.find((i) => i.id === id)!; const j = s.media!.journalists.find((x) => x.id === inv.journalistId)!;
  inv.status = 'aceptada'; inv.questions = buildQuestions(s, rng, j);
  return `Aceptaste la entrevista con ${j.name} (${OUTLET_BY_ID[inv.outletId].name}). Estilo ${styleLabel(j.style)}.`;
}
export function declineInvite(s: GameState, id: string): string {
  const b = inviteBlocked(s, id, 'rechazar'); if (b) return `No es posible: ${b}`;
  const inv = s.media!.invites.find((i) => i.id === id)!; const j = s.media!.journalists.find((x) => x.id === inv.journalistId)!;
  inv.status = 'rechazada'; j.relation = clamp(j.relation - 4, -100, 100); j.history.push({ week: s.week, kind: 'rechazo', note: 'Rechazaste la entrevista' });
  return `Rechazaste la invitación de ${j.name}. Lo recordará.`;
}
