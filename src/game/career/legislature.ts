/**
 * LABOR PARLAMENTARIA DEL JUGADOR.
 *
 * Al asumir como diputado/a o senador/a, el personaje integra dos comisiones permanentes y
 * alterna semanas legislativas y una semana distrital por mes (como en el Congreso). Puede
 * intervenir en sala, presentar indicaciones, pedir sesiones especiales, interpelar o citar a
 * ministros (solo titulares ficticios), abrir una oficina distrital, formar bancadas
 * transversales, pareos, audiencias de la Ley del Lobby, competir por la presidencia de una
 * comisión o la jefatura de bancada y presentar su declaración de intereses y patrimonio.
 * Su asistencia y su registro de labor son públicos y pesan en la reelección.
 */
import type { Character, GameState, PolicyArea, SocialGroup } from '../models/types';
import { Rng } from '../engine/rng';
import { AREA_LABELS, clamp } from '../rules/params';
import { MINISTRIES, MINISTRY_BY_ID } from '../data/institutions';
import { fullName, memoryBalance, remember } from '../systems/characters';
import { addNews } from '../systems/news';
import { coalitionMembers } from '../systems/government';
import { listIdOf } from '../systems/elections';
import { partyStance } from '../systems/parliament';
import { currentISO } from '../systems/util';
import { addTerritory, bio, comunasOfDistrictSafe, homeCut, me, partyInfluenceOf, progress } from './capital';
import { pushIntel } from './knowledge';

/** Comisiones permanentes (nombres genéricos de las comisiones de ambas cámaras). */
export const COMMISSIONS: { id: string; name: string; areas: PolicyArea[] }[] = [
  { id: 'hacienda', name: 'Hacienda', areas: ['economia', 'impuestos'] },
  { id: 'educacion', name: 'Educación', areas: ['educacion'] },
  { id: 'salud', name: 'Salud', areas: ['salud'] },
  { id: 'trabajo', name: 'Trabajo y Seguridad Social', areas: ['trabajo', 'pensiones'] },
  { id: 'seguridad', name: 'Seguridad Ciudadana', areas: ['seguridad'] },
  { id: 'vivienda', name: 'Vivienda y Desarrollo Urbano', areas: ['vivienda'] },
  { id: 'obras', name: 'Obras Públicas, Transportes y Telecomunicaciones', areas: ['transporte', 'infraestructura'] },
  { id: 'ambiente', name: 'Medio Ambiente y Recursos Naturales', areas: ['medioambiente'] },
  { id: 'energia', name: 'Minería y Energía', areas: ['energia'] },
  { id: 'gobierno', name: 'Gobierno Interior y Regionalización', areas: ['descentralizacion', 'migracion'] },
  { id: 'exterior', name: 'Relaciones Exteriores', areas: ['exterior'] },
  { id: 'constitucion', name: 'Constitución, Legislación y Justicia', areas: ['probidad'] },
  { id: 'ciencia', name: 'Ciencias y Tecnología', areas: ['ciencia'] },
];
export const COMMISSION_BY_ID = Object.fromEntries(COMMISSIONS.map((c) => [c.id, c]));
export const commissionOfArea = (a: PolicyArea) => COMMISSIONS.find((c) => c.areas.includes(a)) ?? COMMISSIONS[0];

export interface LegState {
  chamber: 'camara' | 'senado';
  commissions: string[];
  chair: string | null;
  caucusLead: boolean;
  attendance: number;            // % (público)
  absentThisWeek: boolean;
  pareoThisWeek: boolean;
  districtOffice: number | null; // CUT
  declarationYear: number;       // último año con declaración de intereses presentada
  interpellations: Record<string, number>; // ministerio -> semana
  tabled: string[];              // proyectos puestos en tabla
  record: { speeches: number; indicaciones: number; motions: number; oficios: number; sessions: number; interpelaciones: number; absences: number; caucus: number; lobby: number };
}

const P = (s: GameState) => me(s);
export const legOf = (s: GameState): LegState | null => (s.career as unknown as { leg?: LegState }).leg ?? null;
const setLeg = (s: GameState, l: LegState | null) => { (s.career as unknown as { leg?: LegState | null }).leg = l; };
export const isLegislatorC = (c: Character) => c.offices.some((o) => o.type === 'diputado' || o.type === 'senador');
const chamberOf = (c: Character): 'camara' | 'senado' => (c.offices.some((o) => o.type === 'senador') ? 'senado' : 'camara');
const yearOf = (s: GameState) => Number(currentISO(s).slice(0, 4));
const md = (s: GameState) => { const d = currentISO(s); return Number(d.slice(5, 7)) * 100 + Number(d.slice(8, 10)); };

/** Una semana distrital al mes (la última del mes): no hay sesiones de sala ni de comisiones. */
export function isDistrictWeek(s: GameState): boolean { return Number(currentISO(s).slice(8, 10)) >= 23; }

/** Inicializa o actualiza la labor parlamentaria al asumir (o al cambiar de cámara). */
export function ensureLeg(s: GameState, rng: Rng): LegState | null {
  const c = P(s);
  if (!isLegislatorC(c)) { if (legOf(s)) setLeg(s, null); return null; }
  const ch = chamberOf(c);
  const cur = legOf(s);
  if (cur && cur.chamber === ch) return cur;
  const prefs = [c.specialty, ...s.career.origin.interests].map((a) => commissionOfArea(a as PolicyArea).id);
  const comms = [...new Set(prefs)];
  while (comms.length < 2) { const x = rng.pick(COMMISSIONS).id; if (!comms.includes(x)) comms.push(x); }
  const l: LegState = { chamber: ch, commissions: comms.slice(0, 2), chair: null, caucusLead: false, attendance: 100, absentThisWeek: false, pareoThisWeek: false, districtOffice: cur?.districtOffice ?? null,
    declarationYear: cur?.declarationYear ?? 0, interpellations: {}, tabled: [], record: cur?.record ?? { speeches: 0, indicaciones: 0, motions: 0, oficios: 0, sessions: 0, interpelaciones: 0, absences: 0, caucus: 0, lobby: 0 } };
  setLeg(s, l);
  bio(s, 'cargo', `Integras las comisiones de ${l.commissions.map((x) => COMMISSION_BY_ID[x].name).join(' y ')}`, ch === 'camara' ? 'Cámara de Diputadas y Diputados' : 'Senado', 0);
  return l;
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------
export type LegAction =
  | { type: 'intervencion_sala'; area: PolicyArea }
  | { type: 'indicaciones'; billId: string }
  | { type: 'poner_en_tabla'; billId: string }
  | { type: 'sesion_especial'; area: PolicyArea }
  | { type: 'interpelacion'; ministryId: string }
  | { type: 'citar_comision'; ministryId: string }
  | { type: 'oficina_distrital' }
  | { type: 'bancada_transversal'; area: PolicyArea }
  | { type: 'declaracion_intereses' }
  | { type: 'pareo' }
  | { type: 'presidir_comision'; commissionId: string }
  | { type: 'jefatura_bancada' }
  | { type: 'audiencia_lobby'; group: SocialGroup };

export const LEG_COST: Record<LegAction['type'], number> = { intervencion_sala: 1, indicaciones: 1, poner_en_tabla: 0, sesion_especial: 2, interpelacion: 2, citar_comision: 1, oficina_distrital: 0, bancada_transversal: 1, declaracion_intereses: 0, pareo: 0, presidir_comision: 1, jefatura_bancada: 1, audiencia_lobby: 1 };
export const LEG_LABELS: Record<LegAction['type'], string> = {
  intervencion_sala: 'Intervenir en sala', indicaciones: 'Presentar indicaciones a un proyecto', poner_en_tabla: 'Poner un proyecto en tabla', sesion_especial: 'Pedir una sesión especial',
  interpelacion: 'Interpelar a un/a ministro/a', citar_comision: 'Citar a un/a ministro/a a tu comisión', oficina_distrital: 'Abrir una oficina distrital', bancada_transversal: 'Formar una bancada transversal',
  declaracion_intereses: 'Presentar la declaración de intereses y patrimonio', pareo: 'Pactar un pareo', presidir_comision: 'Postular a la presidencia de una comisión', jefatura_bancada: 'Postular a la jefatura de bancada', audiencia_lobby: 'Audiencia de la Ley del Lobby',
};
const SESSION_ACTIONS = new Set<LegAction['type']>(['intervencion_sala', 'indicaciones', 'poner_en_tabla', 'sesion_especial', 'interpelacion', 'citar_comision', 'pareo', 'presidir_comision', 'jefatura_bancada']);

/** Proyectos en comisión en tu cámara (para indicaciones). */
export function billsInMyCommissionStage(s: GameState): GameState['bills'] {
  const l = legOf(s); if (!l) return [];
  return s.bills.filter((b) => b.closedWeek === undefined && ((b.stage === 'comision_origen' && b.chamberOfOrigin === l.chamber) || (b.stage === 'comision_revisora' && b.chamberOfOrigin !== l.chamber)));
}
const opposition = (s: GameState) => { const c = P(s); return !c.partyId || !coalitionMembers(s).includes(c.partyId); };
function blocSeats(s: GameState, chamber: 'camara' | 'senado'): number {
  const c = P(s); const mine = c.partyId ? listIdOf(s, c.partyId) : null;
  return s.seats.filter((x) => x.chamber === chamber && x.holderId && (() => { const h = s.characters[x.holderId!]; if (!h) return false; return opposition(s) ? !h.partyId || !coalitionMembers(s).includes(h.partyId) : (mine && h.partyId ? listIdOf(s, h.partyId) === mine : false); })()).length;
}

export function legBlocked(s: GameState, a: LegAction): string | null {
  const c = P(s); const l = legOf(s);
  if (!l || !isLegislatorC(c)) return 'Solo para parlamentarios';
  const dw = isDistrictWeek(s);
  if (SESSION_ACTIONS.has(a.type) && dw) return 'Semana distrital: no hay sesiones de sala ni de comisiones';
  switch (a.type) {
    case 'indicaciones': return billsInMyCommissionStage(s).some((b) => b.id === a.billId) ? null : 'El proyecto no está en una comisión de tu cámara';
    case 'poner_en_tabla': {
      if (!l.chair) return 'Solo quien preside una comisión fija su tabla';
      const b = billsInMyCommissionStage(s).find((x) => x.id === a.billId);
      if (!b) return 'El proyecto no está en una comisión de tu cámara';
      if (!COMMISSION_BY_ID[l.chair].areas.includes(b.area)) return 'El proyecto no corresponde a tu comisión';
      return l.tabled.includes(b.id) ? 'Ya lo pusiste en tabla' : null;
    }
    case 'sesion_especial': { const need = l.chamber === 'camara' ? 52 : 17; return blocSeats(s, l.chamber) >= need ? null : `Se requieren ${need} firmas (un tercio de la cámara): tu sector no las reúne`; }
    case 'interpelacion': {
      if (l.chamber !== 'camara') return 'La interpelación es una facultad de la Cámara';
      if (!opposition(s)) return 'Solo desde la oposición se interpela al propio gobierno… y tu sector es oficialista';
      if (blocSeats(s, 'camara') < 52) return 'Se requieren 52 firmas (un tercio de la Cámara)';
      const post = s.government.cabinet.find((p) => p.ministryId === a.ministryId); const m = post?.ministerId ? s.characters[post.ministerId] : null;
      if (!m) return 'La cartera no tiene titular';
      if (m.realId) return 'En esta simulación no se interpela a ministros que son personas reales';
      return (l.interpellations[a.ministryId] ?? -999) > s.week - 52 ? 'Ya se interpeló a esta cartera en el último año' : null;
    }
    case 'citar_comision': {
      const mi = MINISTRY_BY_ID[a.ministryId]; if (!mi) return 'Cartera inexistente';
      return l.commissions.some((x) => COMMISSION_BY_ID[x].areas.includes(mi.area)) ? null : 'Esa cartera no corresponde a tus comisiones';
    }
    case 'oficina_distrital': return l.districtOffice ? 'Ya tienes oficina distrital' : s.player.personalFunds < 10 ? 'Requiere 10 MM$ (arriendo y habilitación)' : null;
    case 'bancada_transversal': case 'intervencion_sala': return null;
    case 'declaracion_intereses': return l.declarationYear >= yearOf(s) ? 'Ya la presentaste este año' : md(s) < 301 || md(s) > 430 ? 'Se presenta entre marzo y abril de cada año' : null;
    case 'pareo': return l.pareoThisWeek ? 'Ya tienes pareo esta semana' : null;
    case 'presidir_comision': return md(s) < 311 || md(s) > 331 ? 'Las presidencias de comisión se eligen en marzo' : l.chair ? 'Ya presides una comisión' : l.commissions.includes(a.commissionId) ? null : 'No integras esa comisión';
    case 'jefatura_bancada': return !c.partyId ? 'Sin partido no hay bancada' : md(s) < 311 || md(s) > 331 ? 'La jefatura de bancada se elige en marzo' : l.caucusLead ? 'Ya eres jefe/a de bancada' : null;
    case 'audiencia_lobby': return null;
  }
}

export function legRun(s: GameState, rng: Rng, a: LegAction): string {
  const c = P(s); const l = legOf(s)!;
  const r = (k: 'reconocimiento' | 'prestigioTecnico' | 'credibilidad' | 'confianzaPartido' | 'popularidad', v: number) => { c.rep[k] = clamp(c.rep[k] + v, 0, 100); };
  const roll = (w: Partial<Record<keyof Character['attrs'], number>>) => Object.entries(w).reduce((acc, [k, v]) => acc + (c.attrs[k as keyof Character['attrs']] / 100) * (v ?? 0), 0) + rng.normal(0, 0.15);
  switch (a.type) {
    case 'intervencion_sala': {
      l.record.speeches++; const ok = roll({ oratoria: 0.6, tecnico: 0.4 }) > 0.45;
      r('reconocimiento', ok ? 1.5 : 0.5); r('prestigioTecnico', ok ? 1 : 0.3);
      return ok ? `Tu intervención sobre ${AREA_LABELS[a.area].toLowerCase()} se cita en la prensa.` : 'Intervienes en la hora de incidentes ante una sala semivacía.';
    }
    case 'indicaciones': {
      const b = s.bills.find((x) => x.id === a.billId)!; l.record.indicaciones++;
      const inMine = l.commissions.some((x) => COMMISSION_BY_ID[x].areas.includes(b.area));
      b.moderation = clamp(b.moderation + (inMine ? 0.07 : 0.03), 0, 0.9); b.modifiedInRevision = b.stage === 'comision_revisora' || b.modifiedInRevision;
      b.log.push(`S${s.week}: Indicaciones de ${fullName(c)}`);
      r('prestigioTecnico', inMine ? 2 : 1);
      const line = c.partyId ? partyStance(s, c.partyId, b) : 0;
      if (line > 0.3) r('confianzaPartido', 1);
      return inMine ? `Tus indicaciones a «${b.title}» se aprueban en tu comisión: el proyecto se modera.` : `Presentas indicaciones a «${b.title}» desde fuera de la comisión: tienen menos peso.`;
    }
    case 'poner_en_tabla': {
      const b = s.bills.find((x) => x.id === a.billId)!; l.tabled.push(b.id); b.stageWeek -= 4;
      b.log.push(`S${s.week}: La presidencia de la comisión lo pone en tabla`);
      return `«${b.title}» entra en tabla: su tramitación se acelera.`;
    }
    case 'sesion_especial': {
      l.record.sessions++; r('reconocimiento', 3);
      s.opinion.priorities[a.area] = clamp((s.opinion.priorities[a.area] ?? 0) + 0.01, 0, 1);
      addNews(s, rng, 'congreso', `Sesión especial sobre ${AREA_LABELS[a.area].toLowerCase()}`, `A solicitud de ${fullName(c)} y su sector.`, 2);
      return `Consigues la sesión especial: ${AREA_LABELS[a.area].toLowerCase()} sube en la agenda pública.`;
    }
    case 'interpelacion': {
      const post = s.government.cabinet.find((p) => p.ministryId === a.ministryId)!; const m = s.characters[post.ministerId!];
      l.interpellations[a.ministryId] = s.week; l.record.interpelaciones++;
      const ok = roll({ tecnico: 0.5, oratoria: 0.5 }) > 0.35 + m.attrs.comunicacion / 250;
      const pres = s.characters[s.government.presidentId];
      if (pres) remember(pres, { week: s.week, aboutId: c.id, kind: 'conflicto', weight: -8, note: `Interpeló a ${MINISTRY_BY_ID[a.ministryId].name}` });
      addNews(s, rng, 'congreso', `Interpelación a ${fullName(m)} (${MINISTRY_BY_ID[a.ministryId].name})`, `Impulsada por ${fullName(c)}.`, 3, 0, ok ? -1 : 1);
      if (ok) { post.performance = clamp(post.performance - 8, 0, 100); s.opinion.presidentialApproval = clamp(s.opinion.presidentialApproval - 1.5, 5, 90); r('reconocimiento', 5); r('confianzaPartido', 3); bio(s, 'decision', `Interpelas a ${fullName(m)}`, 'La interpelación deja mal parado al gobierno.', 1); progress(s); return 'La interpelación golpea al gobierno: tu figura crece en la oposición.'; }
      r('reconocimiento', 2); r('credibilidad', -2); return 'El/la ministro/a sale bien parado/a: la interpelación se percibe como un show.';
    }
    case 'citar_comision': {
      const post = s.government.cabinet.find((p) => p.ministryId === a.ministryId); const m = post?.ministerId ? s.characters[post.ministerId] : null;
      r('prestigioTecnico', 2); r('reconocimiento', 1); l.record.oficios++;
      if (m && !m.realId && post && opposition(s)) post.performance = clamp(post.performance - 2, 0, 100);
      return m ? `${m.realId ? '(Sesión simulada) ' : ''}${fullName(m)} asiste a tu comisión: obtienes compromisos de información.` : 'La cartera envía a su subsecretaría.';
    }
    case 'oficina_distrital': {
      s.player.personalFunds -= 10; l.districtOffice = homeCut(s);
      bio(s, 'decision', 'Abres una oficina distrital', '', 1);
      return 'Abres una oficina distrital: atenderá vecinos todas las semanas.';
    }
    case 'bancada_transversal': {
      l.record.caucus++;
      const others = Object.values(s.characters).filter((x) => x.status === 'activo' && !x.isPlayer && x.partyId !== c.partyId && x.offices.some((o) => o.type === (l.chamber === 'camara' ? 'diputado' : 'senador')));
      const picked = others.sort((x, y) => memoryBalance(y, c.id) - memoryBalance(x, c.id) + rng.normal(0, 10)).slice(0, 2);
      for (const t of picked) { remember(t, { week: s.week, aboutId: c.id, kind: 'colaboracion', weight: 6, note: `Bancada transversal por ${AREA_LABELS[a.area].toLowerCase()}` }); c.relations[t.id] = clamp((c.relations[t.id] ?? 0) + 5, -100, 100); }
      r('prestigioTecnico', 1);
      if (c.partyId && picked.some((t) => t.partyId && coalitionMembers(s).includes(t.partyId) !== coalitionMembers(s).includes(c.partyId!))) r('confianzaPartido', -1);
      return `Formas una bancada transversal por ${AREA_LABELS[a.area].toLowerCase()} con ${picked.map((t) => fullName(t)).join(' y ')}${picked.some((t) => t.realId) ? ' (situación simulada)' : ''}.`;
    }
    case 'declaracion_intereses': { l.declarationYear = yearOf(s); r('credibilidad', 2); return 'Presentas a tiempo tu declaración de intereses y patrimonio.'; }
    case 'pareo': {
      l.pareoThisWeek = true; l.absentThisWeek = false;
      const t = Object.values(s.characters).find((x) => x.status === 'activo' && !x.isPlayer && x.offices.some((o) => o.type === (l.chamber === 'camara' ? 'diputado' : 'senador')) && x.partyId !== c.partyId);
      if (t) remember(t, { week: s.week, aboutId: c.id, kind: 'acuerdo_cumplido', weight: 2, note: 'Pareo' });
      return `Pactas un pareo${t ? ` con ${fullName(t)}` : ''}: puedes ausentarte esta semana sin afectar las votaciones ni tu asistencia.`;
    }
    case 'presidir_comision': {
      const share = blocSeats(s, l.chamber) / (l.chamber === 'camara' ? 155 : 50);
      const ok = rng.chance(clamp(0.15 + share * 0.6 + c.attrs.negociacion / 300 + partyInfluenceOf(s, c) / 400, 0.05, 0.85));
      if (ok) { l.chair = a.commissionId; r('reconocimiento', 3); bio(s, 'cargo', `Presides la comisión de ${COMMISSION_BY_ID[a.commissionId].name}`, '', 1); progress(s); return `Te eligen presidente/a de la comisión de ${COMMISSION_BY_ID[a.commissionId].name}: controlas su tabla.`; }
      return 'Otra bancada se queda con la presidencia de la comisión.';
    }
    case 'jefatura_bancada': {
      const ok = rng.chance(clamp(0.1 + c.rep.confianzaPartido / 200 + c.attrs.liderazgo / 300, 0.05, 0.8));
      if (ok) { l.caucusLead = true; r('confianzaPartido', 3); bio(s, 'cargo', 'Asumes la jefatura de bancada', '', 1); progress(s); return 'Tu bancada te elige como jefe/a: coordinas votos y vocerías.'; }
      return 'La bancada elige a otra persona.';
    }
    case 'audiencia_lobby': {
      l.record.lobby++;
      c.rep.confianzaGrupos[a.group] = clamp(c.rep.confianzaGrupos[a.group] + 3, -100, 100);
      const b = s.bills.find((x) => x.closedWeek === undefined);
      if (b) pushIntel(s, { topic: 'oportunidad', source: 'contacto', reliability: 'media', truth: true, text: `En una audiencia (Ley del Lobby) te advierten que «${b.title}» enfrentará resistencias en su próxima votación.` });
      return 'Audiencia registrada en la plataforma de la Ley del Lobby: escuchas sus planteamientos de forma transparente.';
    }
  }
}

// ---------------------------------------------------------------------------
// Semana: asistencia, oficina distrital, plazos y registro
// ---------------------------------------------------------------------------
/** Acciones de terreno que implican faltar a sesiones en una semana legislativa. */
export const FIELD_ACTIONS = new Set(['visita_region', 'acto_politico', 'actividad_campana', 'organizacion_social', 'mediar_conflicto', 'trabajo_territorial', 'campana_territorial', 'trabajar_campana', 'atender_vecinos']);
export const FIELD_AGENDA_CATS = new Set(['territorio', 'campana', 'calendario']);

export function markField(s: GameState): void { const l = legOf(s); if (l && !isDistrictWeek(s) && !l.pareoThisWeek) l.absentThisWeek = true; }

export function weeklyLeg(s: GameState, rng: Rng): void {
  const l = ensureLeg(s, rng); if (!l) return;
  const c = P(s);
  if (!isDistrictWeek(s)) {
    if (l.absentThisWeek) { l.attendance = clamp(l.attendance - 3, 0, 100); l.record.absences++; }
    else l.attendance = clamp(l.attendance + 0.5, 0, 100);
    if (l.attendance < 75 && rng.chance(0.08)) { addNews(s, rng, 'congreso', `Cuestionan la asistencia de ${fullName(c)}`, `Su asistencia a sesiones cae a ${Math.round(l.attendance)}%.`, 2, 0, -1); c.rep.credibilidad = clamp(c.rep.credibilidad - 2, 0, 100); }
  }
  l.absentThisWeek = false; l.pareoThisWeek = false;
  if (l.districtOffice) { addTerritory(s, [l.districtOffice], 0.4); addTerritory(s, comunasOfDistrictSafe(l.districtOffice), 0.1); }
  // Plazo de la declaración de intereses: 30 de abril
  if (md(s) > 430 && md(s) <= 507 && l.declarationYear < yearOf(s)) {
    l.declarationYear = yearOf(s) - 0; c.rep.credibilidad = clamp(c.rep.credibilidad - 5, 0, 100);
    addNews(s, rng, 'congreso', `${fullName(c)} no presentó a tiempo su declaración de intereses`, 'El plazo venció el 30 de abril.', 2, 0, -1);
    bio(s, 'decision', 'No presentas a tiempo tu declaración de intereses', '', -1);
  }
  // Las presidencias de comisión y jefaturas duran un año legislativo
  if (md(s) >= 311 && md(s) <= 317 && (l.chair || l.caucusLead)) { l.chair = null; l.caucusLead = false; }
}

/** Bono del registro parlamentario en la reelección (público: asistencia, leyes, labor). */
export function legislativeRecordBonus(s: GameState): number {
  const l = legOf(s); if (!l) return 0;
  const laws = s.bills.filter((b) => b.authorId === s.player.characterId && b.stage === 'publicada').length;
  return clamp((l.attendance - 85) / 3 + Math.min(6, laws * 2) + Math.min(5, l.record.speeches * 0.15 + l.record.indicaciones * 0.3 + l.record.oficios * 0.2), -8, 12);
}

export const MINISTRY_OPTIONS = MINISTRIES;
