/**
 * ACCIONES DEL JUGADOR. Cada acción consume puntos de acción (PA) semanales y/o recursos,
 * de modo que existe un costo de oportunidad. Los atributos del personaje determinan los
 * resultados (con incertidumbre). Nada garantiza el éxito.
 */
import type { Character, Dim, GameState, OfficeType, PolicyArea, RegionId, Urgency } from '../models/types';
import { Rng } from '../engine/rng';
import { AREA_LABELS, DIFFICULTY, DIM_LABELS, PLAYER, clamp } from '../rules/params';
import { REGION_BY_ID } from '../data/geography';
import { MOTION_TEMPLATES, POLICY_BY_ID } from '../data/policies';
import { MINISTRY_BY_ID } from '../data/institutions';
import { PERSONALITY_TRAITS, ageOf, fullName, memoryBalance, officeLabel, remember, removeOffice } from './characters';
import { createBill, ideologicalBenefit, members, partyStance } from './parliament';
import { addHistory, addRelation, getRelation, ideoDistance, zeroIdeology } from './util';
import { addNews } from './news';
import { listIdOf } from './elections';
import { aspire, aspireBlocked, collectSignatures, electionWindow, eligibleUnits, seekBacking, withdraw } from '../career/nominations';
import { resolveOpportunity } from '../career/opportunities';
import { districtWeek } from '../career/offices';
import { EXTRA_DEFS } from '../career/agenda';
import { accessBlocked } from '../career/access';
import { hashNoise } from '../career/knowledge';
import { agendaBlocked, fireMember, runAgenda } from '../career/agendaWeek';
import { FIELD_ACTIONS, FIELD_AGENDA_CATS, LEG_COST, LEG_LABELS, isDistrictWeek, legBlocked, legOf, legRun, markField, type LegAction } from '../career/legislature';
import { addTerritory, bio, homeCut, minorRoleBlocked, progress, unitComunas } from '../career/capital';
import { ORG_LABELS } from '../career/labels';
import { coalitionAccepts, formCoalition, joinCoalition, leaveCoalition, membershipUtility } from './coalitions';
import { createParty, factionOf, leaveParty, makeFaction } from './parties';
import { announcePolicy, appointMinister, canAnnounce } from './government';
import { resolveDecision } from './events';
import { COMUNA_BY_CUT } from '../territory/data';
import { buildOrganization, investCampaign, targetComunas, targetLabel, type TerritoryTarget } from '../territory/dynamics';
import { orderPrivate, privateBlocked } from '../polling/private';
import { acceptInvite, answerInterview, declineInvite, inviteBlocked } from '../media/journalists';

export type PlayerAction =
  | { type: 'entrevista'; dim?: Dim; side?: -1 | 1 }
  | { type: 'visita_region'; region: RegionId }
  | { type: 'reunion'; charId: string }
  | { type: 'acto_politico' }
  | { type: 'recaudar'; mode: 'legal' | 'agresivo' }
  | { type: 'redes' }
  | { type: 'formacion' }
  | { type: 'mocion'; template: number }
  | { type: 'aspirar'; electionId: string; office: OfficeType; unitId: string }
  | { type: 'retirar_aspiracion'; processId: string }
  | { type: 'buscar_respaldo'; processId: string; charId: string }
  | { type: 'firmas_independiente'; electionId: string; office: OfficeType }
  | { type: 'responder_oportunidad'; id: string; option: string }
  | { type: 'asamblea' }
  | { type: 'organizacion_social' }
  | { type: 'trabajar_campana'; charId: string }
  | { type: 'propuesta_politica'; area: PolicyArea }
  | { type: 'debate_publico' }
  | { type: 'mediar_conflicto' }
  | { type: 'voto_parlamentario'; billId: string; vote: 'yes' | 'no' | 'abst' }
  | { type: 'semana_distrital' }
  | { type: 'fiscalizacion' }
  | { type: 'atender_vecinos' }
  | { type: 'renunciar_cargo'; office: OfficeType }
  | { type: 'cambiar_jornada'; mode: 'completa' | 'parcial' | 'dedicacion' }
  | { type: 'agenda'; offerId: string }
  | LegAction
  | { type: 'despedir'; memberId: string }
  | { type: 'retirar_candidatura'; electionId: string }
  | { type: 'configurar_campana'; budget: number; region: RegionId | null; message: Dim | null; side: -1 | 1 }
  | { type: 'actividad_campana' }
  | { type: 'contratar_equipo' }
  | { type: 'postular_interna' }
  | { type: 'organizar_faccion' }
  | { type: 'renunciar_partido' }
  | { type: 'unirse_partido'; partyId: string }
  | { type: 'fundar_partido'; name: string; short: string; color: string }
  | { type: 'proponer_alianza'; target: string }
  | { type: 'salir_coalicion' }
  | { type: 'disciplinar_bancada' }
  | { type: 'negociar_partido'; billId: string; partyId: string; offer: 'moderar' | 'compromiso' | 'inversion' | 'cargo' }
  | { type: 'lobby'; billId: string; charId: string }
  | { type: 'urgencia'; billId: string; urgency: Urgency }
  | { type: 'retirar_proyecto'; billId: string }
  | { type: 'decision_ejecutivo'; billId: string; decision: 'promulgar' | 'vetar' }
  | { type: 'anunciar_politica'; policyId: string }
  | { type: 'aceptar_entrevista'; inviteId: string }
  | { type: 'rechazar_entrevista'; inviteId: string }
  | { type: 'responder_entrevista'; inviteId: string; index: number; answer: 'datos' | 'linea' | 'propia' | 'evadir' }
  | { type: 'encargar_encuesta'; study: import('../polling/types').PrivateStudy; region?: RegionId; cut?: number; area?: PolicyArea }
  | { type: 'nombrar_ministro'; ministryId: string; charId: string }
  | { type: 'cadena_nacional' }
  | { type: 'gestion_local' }
  | { type: 'gestion_ministerial' }
  | { type: 'resolver_decision'; decisionId: string; optionId: string }
  | { type: 'campana_territorial'; target: TerritoryTarget; amount: number }
  | { type: 'trabajo_territorial'; target: TerritoryTarget }
  | { type: 'retirarse' };

export const ACTION_COST: Record<PlayerAction['type'], number> = {
  entrevista: 1, visita_region: 2, reunion: 1, acto_politico: 2, recaudar: 1, redes: 1, formacion: 1, mocion: 2,
  aspirar: 1, retirar_aspiracion: 0, buscar_respaldo: 1, firmas_independiente: 2, responder_oportunidad: 0, asamblea: 1, organizacion_social: 1,
  trabajar_campana: 1, propuesta_politica: 1, debate_publico: 1, mediar_conflicto: 1, voto_parlamentario: 0, semana_distrital: 1, fiscalizacion: 1,
  atender_vecinos: 1, renunciar_cargo: 0, cambiar_jornada: 0, agenda: 0, despedir: 0, ...LEG_COST, retirar_candidatura: 0, configurar_campana: 0, actividad_campana: 1, contratar_equipo: 0,
  postular_interna: 1, organizar_faccion: 1, renunciar_partido: 0, unirse_partido: 1, fundar_partido: 2, proponer_alianza: 1,
  salir_coalicion: 0, disciplinar_bancada: 1, negociar_partido: 1, lobby: 1, urgencia: 0, retirar_proyecto: 0, decision_ejecutivo: 0,
  anunciar_politica: 1, encargar_encuesta: 1, aceptar_entrevista: 1, rechazar_entrevista: 0, responder_entrevista: 0, nombrar_ministro: 0, cadena_nacional: 1, gestion_local: 2, gestion_ministerial: 1, resolver_decision: 0, retirarse: 0,
  campana_territorial: 1, trabajo_territorial: 1,
};

export const ACTION_LABELS: Record<PlayerAction['type'], string> = {
  entrevista: 'Dar una entrevista', visita_region: 'Visitar una región', reunion: 'Reunirse con un actor', acto_politico: 'Organizar un acto político',
  recaudar: 'Recaudar recursos', redes: 'Construir redes territoriales', formacion: 'Estudiar y prepararse', mocion: 'Presentar una moción',
  aspirar: 'Manifestar aspiración a una candidatura', retirar_aspiracion: 'Retirar aspiración', buscar_respaldo: 'Pedir respaldo a un dirigente',
  firmas_independiente: 'Reunir firmas (independiente)', responder_oportunidad: 'Responder a una oportunidad', asamblea: 'Asistir a una asamblea partidaria',
  organizacion_social: 'Trabajo en organización social', trabajar_campana: 'Trabajar en la campaña de otra persona', propuesta_politica: 'Publicar una propuesta',
  debate_publico: 'Participar en un debate público', mediar_conflicto: 'Mediar en un conflicto local', voto_parlamentario: 'Votar en sala',
  semana_distrital: 'Semana distrital', fiscalizacion: 'Fiscalizar al gobierno', atender_vecinos: 'Atención de vecinos', renunciar_cargo: 'Renunciar a un cargo', cambiar_jornada: 'Cambiar tu jornada laboral', agenda: 'Actividad de la agenda semanal', despedir: 'Prescindir de alguien de tu equipo', ...LEG_LABELS,
  retirar_candidatura: 'Retirar candidatura', configurar_campana: 'Configurar campaña',
  actividad_campana: 'Actividad de campaña', contratar_equipo: 'Contratar equipo', postular_interna: 'Postular a la presidencia del partido',
  organizar_faccion: 'Organizar tu sector interno', renunciar_partido: 'Renunciar al partido', unirse_partido: 'Afiliarse a un partido',
  fundar_partido: 'Fundar un partido', proponer_alianza: 'Proponer alianza', salir_coalicion: 'Salir de la coalición', disciplinar_bancada: 'Ordenar la bancada',
  negociar_partido: 'Negociar con un partido', lobby: 'Conversar con un parlamentario', urgencia: 'Asignar urgencia', retirar_proyecto: 'Retirar proyecto',
  decision_ejecutivo: 'Promulgar o vetar', anunciar_politica: 'Anunciar política', encargar_encuesta: 'Encargar encuesta', aceptar_entrevista: 'Aceptar entrevista', rechazar_entrevista: 'Rechazar entrevista', responder_entrevista: 'Responder en entrevista', nombrar_ministro: 'Nombrar ministro/a', cadena_nacional: 'Cadena nacional',
  gestion_local: 'Gestión local', gestion_ministerial: 'Gestión ministerial', resolver_decision: 'Resolver decisión', retirarse: 'Retirarse de la política',
  campana_territorial: 'Invertir en campaña territorial', trabajo_territorial: 'Trabajo territorial (organización)',
};

export const me = (s: GameState): Character => s.characters[s.player.characterId];
export const isPresident = (s: GameState) => s.government.presidentId === s.player.characterId;
export const leadsParty = (s: GameState) => { const c = me(s); return !!c.partyId && s.parties[c.partyId]?.leaderId === c.id; };
export const isLegislator = (c: Character) => c.offices.some((o) => o.type === 'diputado' || o.type === 'senador');
const hasOffice = (c: Character, t: OfficeType) => c.offices.some((o) => o.type === t);
/** Disponibilidad semanal determinista (misma respuesta durante la semana, cambia la siguiente). */
export function weeklyChance(s: GameState, key: string, p: number): boolean {
  return (hashNoise(`${s.player.characterId}:${key}`, s.week) + 1) / 2 < p;
}
const PAID: OfficeType[] = ['presidente', 'ministro', 'subsecretario', 'seremi', 'senador', 'diputado', 'gobernador', 'alcalde', 'concejal', 'asesor'];
export const hasPaidOffice = (c: Character) => c.offices.some((o) => PAID.includes(o.type));
/** Ingreso semanal de la ocupación (MM$ disponibles para la actividad política), por jornada. */
const OCC_INCOME: Record<string, number> = { Estudiante: 0.15, 'Trabajador/a con oficio': 0.45, 'Comercio / emprendimiento': 0.6 };

/** Requisitos de edad (CPR): diputado 21, senador 35, Presidente 35. */
export function minAge(office: OfficeType): number {
  return office === 'senador' || office === 'presidente' ? 35 : office === 'diputado' ? 21 : 18;
}

export function officeForElection(type: string): OfficeType | null {
  switch (type) {
    case 'diputados': return 'diputado'; case 'senadores': return 'senador'; case 'alcaldes': return 'alcalde';
    case 'concejales': return 'concejal'; case 'gobernadores': return 'gobernador'; case 'primarias': return 'presidente'; case 'presidencial': return 'presidente';
    default: return null;
  }
}

/** Devuelve null si la acción es posible; en otro caso, el motivo. */
export function actionBlocked(s: GameState, a: PlayerAction): string | null {
  const c = me(s);
  if (s.player.careerOver && a.type !== 'resolver_decision') return 'Tu carrera política terminó';
  const cost = ACTION_COST[a.type];
  if (cost > s.player.actionPoints) return `Requiere ${cost} PA (tienes ${s.player.actionPoints})`;
  switch (a.type) {
    // Acciones que dependen de la semana: no siempre hay una invitación, un debate o un conflicto que mediar
    case 'entrevista': return weeklyChance(s, 'entrevista', 0.3 + c.rep.reconocimiento / 140 + (s.career.team ?? []).filter((m) => m.role === 'prensa').length * 0.25) ? null : 'Ningún medio te invitó esta semana';
    case 'reunion': { const t = s.characters[a.charId]; return !t || t.status !== 'activo' ? 'Persona no disponible' : accessBlocked(s, t); }
    case 'acto_politico': return !weeklyChance(s, 'acto', 0.55) ? 'No conseguiste lugar ni permisos para un acto esta semana' : s.player.personalFunds < 8 ? 'Requiere 8 MM$ en recursos' : null;
    case 'visita_region': return s.player.personalFunds < 2 ? 'Requiere 2 MM$' : null;
    case 'mocion': {
      if (!isLegislator(c)) return 'Solo parlamentarios pueden presentar mociones';
      const t = MOTION_TEMPLATES[a.template]; if (!t) return 'Proyecto inválido';
      if (s.bills.some((b) => b.title === t.title && b.closedWeek === undefined)) return 'Ya existe un proyecto idéntico en tramitación';
      return null;
    }
    case 'aspirar': return aspireBlocked(s, a.electionId, a.office, a.unitId);
    case 'retirar_aspiracion': return s.career.processes.some((p) => p.id === a.processId && p.status !== 'resuelto' && p.aspirants.some((x) => x.charId === c.id && (x.status === 'aspirante' || x.status === 'propuesto'))) ? null : 'No participas en ese proceso';
    case 'buscar_respaldo': return s.career.processes.some((p) => p.id === a.processId && p.status !== 'resuelto' && p.status !== 'cancelado') ? null : 'Proceso no disponible';
    case 'firmas_independiente': {
      if (c.partyId) return 'Las candidaturas por firmas son para independientes (renuncia antes a tu partido)';
      if (a.office !== 'alcalde' && a.office !== 'gobernador') return 'Solo alcaldías y gobernaciones admiten este camino en el juego';
      const w = electionWindow(s, a.electionId); if (!w) return 'Elección no disponible';
      if (s.week < w.open || s.week >= w.decision) return 'Fuera del período de recolección de firmas';
      if (ageOf(s, c) < 18) return 'Edad mínima: 18 años';
      if (s.player.candidacies.some((x) => x.electionId === a.electionId)) return 'Ya eres candidato/a en esta elección';
      if (c.offices.some((o) => o.type === 'ministro' || o.type === 'subsecretario' || o.type === 'seremi')) return 'Inhabilidad: debes dejar tu cargo de designación';
      return s.player.personalFunds < 15 ? 'Requiere 15 MM$ (notaría, equipo de firmas)' : null;
    }
    case 'responder_oportunidad': {
      const o = s.career.opportunities.find((x) => x.id === a.id);
      return !o ? 'La oportunidad ya no está disponible' : o.options.some((x) => x.id === a.option) ? null : 'Opción inválida';
    }
    case 'asamblea': return c.partyId ? null : 'No militas en un partido';
    case 'organizacion_social': return null;
    case 'trabajar_campana': return campaignTargets(s).some((x) => x.id === a.charId) ? null : 'Esa persona no está en campaña';
    case 'propuesta_politica': return null;
    case 'debate_publico': return c.rep.reconocimiento < 6 && !c.offices.length ? 'Nadie te invita aún a debatir: necesitas darte a conocer o tener algún cargo' : !weeklyChance(s, 'debate', 0.35 + c.rep.reconocimiento / 200) ? 'No hay foros ni debates a los que te inviten esta semana' : null;
    case 'mediar_conflicto': if (!weeklyChance(s, 'conflicto', 0.3 + (s.comunas[homeCut(s)]?.discontent ?? 40) / 200)) return 'No hay un conflicto local que requiera mediación esta semana';
      return c.offices.some((o) => ['dirigente_social', 'concejal', 'alcalde', 'dirigente_territorial', 'diputado', 'seremi'].includes(o.type)) || s.career.capital.territory[homeCut(s)] > 25 ? null : 'Requiere un rol local o una base vecinal reconocible en tu comuna';
    case 'voto_parlamentario': {
      if (!isLegislator(c)) return 'Solo parlamentarios votan en sala';
      const b = s.bills.find((x) => x.id === a.billId);
      return !b || b.closedWeek !== undefined ? 'Proyecto no disponible' : null;
    }
    case 'semana_distrital': return !isLegislator(c) ? 'Solo parlamentarios' : isDistrictWeek(s) ? null : 'Solo en la semana distrital (la última de cada mes)';
    case 'fiscalizacion': return isLegislator(c) ? null : 'Solo parlamentarios';
    case 'atender_vecinos': return hasOffice(c, 'concejal') || hasOffice(c, 'alcalde') || legOf(s)?.districtOffice ? null : 'Requiere ser concejal, alcalde/sa o tener oficina distrital';
    case 'intervencion_sala': case 'indicaciones': case 'poner_en_tabla': case 'sesion_especial': case 'interpelacion': case 'citar_comision': case 'oficina_distrital': case 'bancada_transversal': case 'declaracion_intereses': case 'pareo': case 'presidir_comision': case 'jefatura_bancada': case 'audiencia_lobby': return legBlocked(s, a);
    case 'agenda': return agendaBlocked(s, a.offerId);
    case 'despedir': return (s.career.team ?? []).some((m) => m.id === a.memberId) ? null : 'No está en tu equipo';
    case 'cambiar_jornada': return hasPaidOffice(c) ? 'Con un cargo remunerado no necesitas otra jornada' : s.career.workMode === a.mode ? 'Ya tienes esa jornada' : (s.career.cooldowns.jornada ?? -99) > s.week ? 'Cambiaste de jornada hace poco' : a.mode === 'dedicacion' && s.player.personalFunds < 6 ? 'Sin ahorros (6 MM$) no puedes dejar tu trabajo' : null;
    case 'renunciar_cargo': return hasOffice(c, a.office) ? (['presidente'].includes(a.office) ? 'No puedes renunciar a la Presidencia en el juego' : null) : 'No ejerces ese cargo';
    case 'actividad_campana': return s.player.campaign ? null : 'No tienes una campaña activa';
    case 'contratar_equipo': return !s.player.campaign ? 'No tienes campaña activa' : s.player.campaign.team >= 3 ? 'Equipo completo' : s.player.personalFunds < 15 ? 'Requiere 15 MM$' : null;
    case 'postular_interna': return !c.partyId ? 'No militas en un partido' : leadsParty(s) ? 'Ya presides el partido' : s.player.candidacies.some((x) => x.electionId === `interna-${c.partyId}`) ? 'Ya estás inscrito/a' : null;
    case 'organizar_faccion': return c.partyId ? null : 'No militas en un partido';
    case 'renunciar_partido': return c.partyId ? null : 'No militas en un partido';
    case 'unirse_partido': return c.partyId ? 'Primero debes renunciar a tu partido' : !s.parties[a.partyId]?.active ? 'Partido no disponible' : null;
    case 'fundar_partido': return c.rep.reconocimiento < 25 ? 'Requiere reconocimiento nacional ≥ 25' : s.player.personalFunds < 50 ? 'Requiere 50 MM$' : !a.name.trim() || !a.short.trim() ? 'Indica nombre y sigla' : Object.values(s.parties).some((p) => p.name.toLowerCase() === a.name.trim().toLowerCase() || p.short.toLowerCase() === a.short.trim().toLowerCase()) ? 'Nombre o sigla ya existen' : null;
    case 'disciplinar_bancada': if (legOf(s)?.caucusLead) return null;
      return leadsParty(s) ? null : 'Debes presidir tu partido o ser jefe/a de bancada';
    case 'proponer_alianza': case 'salir_coalicion': return leadsParty(s) ? (a.type === 'salir_coalicion' && c.partyId && listIdOf(s, c.partyId) === c.partyId ? 'Tu partido no está en una coalición' : null) : 'Debes presidir tu partido';
    case 'negociar_partido': case 'lobby': {
      const b = s.bills.find((x) => x.id === a.billId);
      if (!b || b.closedWeek !== undefined) return 'Proyecto no disponible';
      if (b.authorId !== c.id && !isPresident(s) && !leadsParty(s) && !isLegislator(c)) return 'No tienes posición para negociar este proyecto';
      if (a.type === 'negociar_partido' && a.offer === 'cargo' && !isPresident(s)) return 'Solo el Presidente puede ofrecer cargos';
      if (a.type === 'negociar_partido' && a.offer === 'inversion' && !isPresident(s) && s.player.personalFunds < 10) return 'Requiere 10 MM$';
      return null;
    }
    case 'urgencia': case 'retirar_proyecto': case 'decision_ejecutivo': case 'anunciar_politica': case 'nombrar_ministro': case 'cadena_nacional':
      if (!isPresident(s)) return 'Solo el Presidente de la República';
      if (a.type === 'anunciar_politica') return canAnnounce(s, a.policyId);
      return null;
    case 'gestion_local': return hasOffice(c, 'alcalde') || hasOffice(c, 'gobernador') || hasOffice(c, 'concejal') ? null : 'Requiere un cargo local';
    case 'gestion_ministerial': return hasOffice(c, 'ministro') ? null : 'Requiere ser ministro/a';
    case 'campana_territorial': {
      if (!(a.amount > 0)) return 'Indica un monto positivo';
      if (a.amount > s.player.personalFunds) return `Recursos insuficientes (tienes ${Math.floor(s.player.personalFunds)} MM$)`;
      if (!c.partyId && !s.player.campaign) return 'Necesitas un partido o una candidatura activa';
      return targetComunas(a.target).length ? null : 'Territorio inválido';
    }
    case 'encargar_encuesta': return privateBlocked(s, a.study);
    case 'aceptar_entrevista': return inviteBlocked(s, a.inviteId, 'aceptar');
    case 'rechazar_entrevista': return inviteBlocked(s, a.inviteId, 'rechazar');
    case 'responder_entrevista': { const inv = s.media?.invites.find((i) => i.id === a.inviteId); return !inv || inv.status !== 'aceptada' ? 'Entrevista no disponible' : inv.questions?.[a.index] && !inv.questions[a.index].answer ? null : 'Pregunta no disponible'; }
    case 'trabajo_territorial': return c.partyId ? (targetComunas(a.target).length ? null : 'Territorio inválido') : 'Necesitas militar en un partido';
    default: return null;
  }
}

function bump(c: Character, attr: keyof Character['attrs'], v = 0.4): void { c.attrs[attr] = clamp(c.attrs[attr] + v, 0, 100); }

/** Aplica la acción (muta el estado clonado). Devuelve un mensaje para el jugador. */
const REP_KEYS = ['popularidad', 'prestigioTecnico', 'confianzaPartido', 'credibilidad', 'reconocimiento'] as const;
const NO_FATIGUE = new Set<PlayerAction['type']>(['agenda', 'despedir', 'responder_oportunidad', 'resolver_decision', 'voto_parlamentario', 'configurar_campana', 'retirar_candidatura', 'retirar_aspiracion', 'renunciar_cargo', 'retirarse', 'aspirar', 'firmas_independiente', 'responder_entrevista', 'rechazar_entrevista']);

/** Factor de fatiga por repetir la misma acción (rendimientos decrecientes; se recupera ~20%/semana). */
export function actionFatigue(s: GameState, type: PlayerAction['type']): number {
  if (NO_FATIGUE.has(type)) return 1;
  const v = s.career.cooldowns[`use:${type}`] ?? 0; const w = s.career.cooldowns[`usew:${type}`] ?? s.week;
  const cur = v * Math.pow(0.8, Math.max(0, s.week - w));
  return 1 / (1 + 0.45 * cur);
}

/**
 * Aplica una acción con rendimientos decrecientes: (1) repetir la misma acción rinde menos;
 * (2) las ganancias de reputación, arraigo y organización se saturan cerca del máximo.
 * Las pérdidas no se atenúan.
 */
export function applyAction(s: GameState, rng: Rng, a: PlayerAction): string {
  const blocked = actionBlocked(s, a);
  if (blocked) return `No es posible: ${blocked}`;
  const c = me(s);
  const fat = actionFatigue(s, a.type);
  const rep0 = Object.fromEntries(REP_KEYS.map((k) => [k, c.rep[k]])) as Record<typeof REP_KEYS[number], number>;
  const terr0 = { ...s.career.capital.territory }; const org0 = s.career.capital.organization; const funds0 = s.player.personalFunds;
  if (FIELD_ACTIONS.has(a.type) || (a.type === 'agenda' && FIELD_AGENDA_CATS.has(s.career.agenda?.offers.find((o) => o.id === a.offerId)?.category ?? ''))) markField(s);
  const lg = legOf(s); if (lg) { if (a.type === 'mocion') lg.record.motions++; if (a.type === 'fiscalizacion') lg.record.oficios++; }
  const msg = applyActionInner(s, rng, a);
  const sat = (before: number, after: number) => after > before ? before + (after - before) * fat * Math.max(0.05, 1 - before / 105) : after;
  for (const k of REP_KEYS) c.rep[k] = sat(rep0[k], c.rep[k]);
  for (const [cut, v] of Object.entries(s.career.capital.territory)) s.career.capital.territory[cut] = sat(terr0[cut] ?? 0, v);
  s.career.capital.organization = sat(org0, s.career.capital.organization);
  if (a.type === 'recaudar' && s.player.personalFunds > funds0) s.player.personalFunds = funds0 + (s.player.personalFunds - funds0) * fat;
  if (!NO_FATIGUE.has(a.type)) {
    const v = s.career.cooldowns[`use:${a.type}`] ?? 0; const w = s.career.cooldowns[`usew:${a.type}`] ?? s.week;
    s.career.cooldowns[`use:${a.type}`] = v * Math.pow(0.8, Math.max(0, s.week - w)) + 1; s.career.cooldowns[`usew:${a.type}`] = s.week;
  }
  return fat < 0.7 ? `${msg} (Rendimiento decreciente: repetir la misma acción rinde menos.)` : msg;
}

function applyActionInner(s: GameState, rng: Rng, a: PlayerAction): string {
  const c = me(s);
  s.player.actionPoints -= ACTION_COST[a.type];
  s.player.actionsThisWeek.push(a.type);
  s.player.xp += ACTION_COST[a.type];
  const diff = DIFFICULTY[s.settings.difficulty];
  const party = c.partyId ? s.parties[c.partyId] : null;
  switch (a.type) {
    case 'entrevista': {
      const skill = (c.attrs.comunicacion * 0.5 + c.attrs.oratoria * 0.3 + c.attrs.carisma * 0.2) / 100;
      const r = skill + rng.normal(0, 0.2) * diff.errorTolerance;
      bump(c, 'comunicacion');
      // Una persona desconocida consigue entrevistas de poco alcance; el alcance crece con el reconocimiento
      c.rep.reconocimiento = clamp(c.rep.reconocimiento + (2 + skill * 3) * (0.3 + c.rep.reconocimiento / 110), 0, 100);
      if (a.dim && a.side && party) {
        const shift = a.side * 12;
        c.ideology[a.dim] = clamp(c.ideology[a.dim] + shift * 0.15, -100, 100);
        const against = Math.sign(party.ideology[a.dim]) !== a.side && Math.abs(party.ideology[a.dim]) > 20;
        if (against) c.rep.confianzaPartido = clamp(c.rep.confianzaPartido - 4, 0, 100);
        else c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + 1, 0, 100);
      }
      if (r > 0.45) { c.rep.popularidad = clamp(c.rep.popularidad + 2 + skill * 2, 0, 100); return 'La entrevista fue bien recibida.'; }
      if (r > 0.25) return 'Entrevista sin sobresaltos; ganas algo de visibilidad.';
      c.rep.popularidad = clamp(c.rep.popularidad - 3, 0, 100); c.rep.credibilidad = clamp(c.rep.credibilidad - 2, 0, 100);
      return 'Una frase desafortunada generó polémica.';
    }
    case 'visita_region': {
      s.player.personalFunds -= 2;
      const reg = c.rep.reconocimientoRegional;
      reg[a.region] = clamp((reg[a.region] ?? 0) + 5 + c.attrs.carisma / 15, 0, 100);
      if (party) party.territorial[a.region] = clamp(party.territorial[a.region] + 0.008, 0, 1);
      bump(c, 'redes', 0.3);
      c.rep.confianzaGrupos.regiones = clamp(c.rep.confianzaGrupos.regiones + 2, -100, 100);
      return `Recorriste ${REGION_BY_ID[a.region].name}: más reconocimiento regional y redes.`;
    }
    case 'reunion': {
      const t = s.characters[a.charId];
      if (!t) return 'Personaje no encontrado.';
      const ideo = ideoDistance(c.ideology, t.ideology);
      const gain = (4 + c.attrs.negociacion / 10) * (1.2 - ideo) * PERSONALITY_TRAITS[t.personality].dealmaking * (1 + diff.negotiation);
      remember(t, { week: s.week, aboutId: c.id, kind: 'colaboracion', weight: clamp(gain, -5, 20), note: 'Reunión de trabajo' });
      c.relations[t.id] = clamp((c.relations[t.id] ?? 0) + gain, -100, 100);
      bump(c, 'negociacion', 0.3); bump(c, 'redes', 0.2);
      if (party && t.partyId === party.id && party.leaderId === t.id) c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + gain / 3, 0, 100);
      if (party && t.partyId && t.partyId !== party.id && s.parties[t.partyId]?.leaderId === t.id) addRelation(s, party.id, t.partyId, gain / 4);
      if (isLegislator(t)) c.rep.relacionesParlamentarias = clamp(c.rep.relacionesParlamentarias + gain / 4, 0, 100);
      return `${t.realId ? '(Conversación simulada) ' : ''}Reunión con ${fullName(t)}: ${gain > 9 ? 'la conversación fluye y queda una buena impresión' : gain > 3 ? 'una conversación cordial' : gain > 0 ? 'una reunión fría, de compromiso' : 'la reunión deja más distancia que antes'}.`;
    }
    case 'acto_politico': {
      s.player.personalFunds -= 8;
      const org = party ? party.territorial[c.regionId] : 0.2;
      const success = (c.attrs.carisma / 100) * 0.5 + org * 0.5 + rng.normal(0, 0.15);
      if (party) party.mobilization = clamp(party.mobilization + 0.5, 0, 100);
      if (success > 0.35) { c.rep.popularidad = clamp(c.rep.popularidad + 3, 0, 100); c.rep.reconocimientoRegional[c.regionId] = clamp((c.rep.reconocimientoRegional[c.regionId] ?? 0) + 5, 0, 100); if (s.player.campaign) s.player.campaign.intensity = clamp(s.player.campaign.intensity + 6, 0, 100); return 'Acto masivo: tu figura gana fuerza.'; }
      return 'Baja convocatoria al acto; la prensa lo destacó.';
    }
    case 'recaudar': {
      // Quien no es conocido/a recauda poco: los aportes siguen al reconocimiento, las redes y los cargos
      const base = 0.5 + c.attrs.redes * 0.02 + c.rep.reconocimiento * 0.07 + Math.max(0, c.rep.confianzaGrupos.empresarios) * 0.02 + (hasPaidOffice(c) ? 2 : 0);
      if (a.mode === 'agresivo') {
        s.player.personalFunds += base * 2;
        if (rng.chance((100 - c.attrs.integridad) / 160)) c.scandal = clamp(c.scandal + 12, 0, 100);
        return `Recaudaste ${(base * 2).toFixed(0)} MM$ con métodos agresivos (riesgo de cuestionamientos).`;
      }
      s.player.personalFunds += base;
      bump(c, 'redes', 0.2);
      return `Recaudaste ${base.toFixed(0)} MM$ en aportes legales declarados.`;
    }
    case 'redes': {
      bump(c, 'redes', 0.8);
      if (party) party.territorial[c.regionId] = clamp(party.territorial[c.regionId] + 0.012, 0, 1);
      c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + 1.5, 0, 100);
      const f = factionOf(s, c); if (f) f.influence = clamp(f.influence + 0.5, 0, 100);
      return 'Fortaleciste tus redes territoriales y la organización local.';
    }
    case 'formacion': {
      bump(c, 'tecnico', 0.8); bump(c, 'gestion', 0.3);
      c.rep.prestigioTecnico = clamp(c.rep.prestigioTecnico + 1.5, 0, 100);
      return 'Profundizaste tu preparación técnica.';
    }
    case 'mocion': {
      const t = MOTION_TEMPLATES[a.template];
      const pos = { ...zeroIdeology(), ...t.position };
      const st = s.seats.find((x) => x.holderId === c.id);
      createBill(s, { title: t.title, area: t.area, origin: 'mocion', authorId: c.id, authorPartyId: c.partyId, chamberOfOrigin: st?.chamber ?? 'camara', urgency: 'ninguna', quorum: t.quorum, position: pos, intensity: 0.6, popularity: Math.round((s.opinion.priorities[t.area] ?? 0) * 150 + rng.normal(0, 10)), fiscalCost: 0 });
      bump(c, 'tecnico', 0.3);
      c.rep.prestigioTecnico = clamp(c.rep.prestigioTecnico + 1, 0, 100);
      return `Presentaste "${t.title}". Sin urgencia del Ejecutivo, deberás negociar para que avance.`;
    }
    case 'aspirar': return aspire(s, rng, a.electionId, a.office, a.unitId);
    case 'retirar_aspiracion': return withdraw(s, a.processId);
    case 'buscar_respaldo': return seekBacking(s, rng, a.processId, a.charId);
    case 'firmas_independiente': return collectSignatures(s, rng, a.electionId, a.office);
    case 'responder_oportunidad': return resolveOpportunity(s, rng, a.id, a.option, false, EXTRA_DEFS);
    case 'asamblea': {
      const skill = (c.attrs.oratoria * 0.5 + c.attrs.redes * 0.5) / 100;
      c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + 1 + skill * 2.5, 0, 100);
      const peers = Object.values(s.characters).filter((x) => x.id !== c.id && x.partyId === c.partyId && (x.regionId === c.regionId || x.offices.length > 0));
      const t = peers.length ? rng.pick(peers) : null;
      if (t) {
        const g = 3 + skill * 6 + rng.normal(0, 2);
        remember(t, { week: s.week, aboutId: c.id, kind: g > 0 ? 'colaboracion' : 'conflicto', weight: clamp(g, -4, 10), note: 'Coincidieron en una asamblea' });
        c.relations[t.id] = clamp((c.relations[t.id] ?? 0) + g, -100, 100);
      }
      s.career.capital.organization = clamp(s.career.capital.organization + 0.6, 0, 100);
      bump(c, 'oratoria', 0.2);
      return `Asamblea de ${party!.short}: tu voz se escucha más en el partido${t ? `; conoces a ${fullName(t)}${t.offices.length ? ` (${officeLabel(t.offices[0].type, t.gender)})` : ''}` : ''}.`;
    }
    case 'organizacion_social': {
      const home = homeCut(s);
      const g = 2.5 + c.attrs.redes / 30 + (s.career.origin.organization ? 1.5 : 0);
      addTerritory(s, [home], g);
      s.career.capital.organization = clamp(s.career.capital.organization + 1.2, 0, 100);
      c.rep.confianzaGrupos.clasesMedias = clamp((c.rep.confianzaGrupos.clasesMedias ?? 0) + 0.5, -100, 100);
      bump(c, 'redes', 0.4); bump(c, 'liderazgo', 0.2);
      if (!c.offices.some((o) => o.type === 'dirigente_social') && !minorRoleBlocked(c, 'dirigente_social') && s.career.capital.territory[home] > 18 && rng.chance(0.15)) {
        c.offices.push({ type: 'dirigente_social', regionId: c.regionId, comuna: c.comuna, since: s.week, label: s.career.origin.organization ? ORG_LABELS[s.career.origin.organization] : 'Organización comunitaria' });
        return 'Tu trabajo es reconocido: te eligen en la directiva de la organización.';
      }
      return `Trabajo comunitario en ${c.comuna}: más vecinos y vecinas te reconocen.`;
    }
    case 'trabajar_campana': {
      const t = s.characters[a.charId];
      const g = 5 + c.attrs.redes / 15 + rng.normal(0, 2);
      remember(t, { week: s.week, aboutId: c.id, kind: 'apoyo', weight: clamp(g, 1, 14), note: 'Trabajó en su campaña' });
      c.relations[t.id] = clamp((c.relations[t.id] ?? 0) + g * 0.6, -100, 100);
      const tgt = campaignTargets(s).find((x) => x.id === a.charId)!;
      addTerritory(s, tgt.cuts.slice(0, 40), 1.5);
      s.career.capital.organization = clamp(s.career.capital.organization + 1, 0, 100);
      if (t.partyId && t.partyId === c.partyId) c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + 1, 0, 100);
      bump(c, 'experiencia', 0.4);
      return `Trabajas en la campaña de ${fullName(t)}: ganas experiencia y ${g > 7 ? 'su confianza' : 'algo de cercanía'}.`;
    }
    case 'propuesta_politica': {
      const q = c.attrs.tecnico / 100 + rng.normal(0, 0.15);
      const sal = s.opinion.priorities[a.area] ?? 0;
      c.rep.prestigioTecnico = clamp(c.rep.prestigioTecnico + 1 + q * 2, 0, 100);
      c.rep.reconocimiento = clamp(c.rep.reconocimiento + sal * 8, 0, 100);
      bump(c, 'tecnico', 0.3);
      if (q > 0.55) { c.rep.credibilidad = clamp(c.rep.credibilidad + 1.5, 0, 100); return `Tu propuesta sobre ${AREA_LABELS[a.area].toLowerCase()} es citada por especialistas.`; }
      return `Publicas una propuesta sobre ${AREA_LABELS[a.area].toLowerCase()}; ${sal > 0.1 ? 'el tema es prioritario y gana algo de eco' : 'tiene poco eco: no es prioridad ciudadana ahora'}.`;
    }
    case 'debate_publico': {
      const skill = (c.attrs.oratoria * 0.6 + c.attrs.tecnico * 0.2 + c.attrs.carisma * 0.2) / 100;
      const r = skill + rng.normal(0, 0.18) * diff.errorTolerance;
      // Foros y radios locales: dan a conocer en la región, apenas a nivel nacional
      c.rep.reconocimiento = clamp(c.rep.reconocimiento + 0.4, 0, 100);
      c.rep.reconocimientoRegional[c.regionId] = clamp((c.rep.reconocimientoRegional[c.regionId] ?? 0) + 3, 0, 100);
      bump(c, 'oratoria', 0.4);
      if (r > 0.55) { c.rep.popularidad = clamp(c.rep.popularidad + 2.5, 0, 100); addTerritory(s, [homeCut(s)], 1.5); return 'Ganas el debate a juicio de la prensa local.'; }
      if (r > 0.35) return 'Debate parejo; te das a conocer.';
      c.rep.credibilidad = clamp(c.rep.credibilidad - 2, 0, 100); s.career.capital.rejection = clamp(s.career.capital.rejection + 2, 0, 100);
      return 'Pierdes el debate: un error de datos circula en redes.';
    }
    case 'mediar_conflicto': {
      const r = (c.attrs.negociacion * 0.6 + c.attrs.integridad * 0.4) / 100 + rng.normal(0, 0.2);
      if (r > 0.45) { addTerritory(s, [homeCut(s)], 4); c.rep.credibilidad = clamp(c.rep.credibilidad + 2, 0, 100); bump(c, 'negociacion', 0.4); return 'Consigues un acuerdo entre vecinos y empresa: tu arraigo crece.'; }
      addTerritory(s, [homeCut(s)], 0.5); s.career.capital.rejection = clamp(s.career.capital.rejection + 1.5, 0, 100);
      return 'La mediación fracasa; algunas partes te culpan.';
    }
    case 'voto_parlamentario': {
      const b = s.bills.find((x) => x.id === a.billId)!;
      b.playerVote = a.vote;
      return `Registrado: votarás ${a.vote === 'yes' ? 'a favor' : a.vote === 'no' ? 'en contra' : 'abstención'} en "${b.title}" cuando llegue a sala.`;
    }
    case 'semana_distrital': return districtWeek(s);
    case 'fiscalizacion': {
      const r = c.attrs.tecnico / 100 + rng.normal(0, 0.2);
      const opp = !s.government.coalitionId || !c.partyId || listIdOf(s, c.partyId) !== s.government.coalitionId;
      c.rep.prestigioTecnico = clamp(c.rep.prestigioTecnico + 1.5, 0, 100);
      if (!opp) c.rep.confianzaPartido = clamp(c.rep.confianzaPartido - 2, 0, 100);
      if (r > 0.5) { c.rep.reconocimiento = clamp(c.rep.reconocimiento + 2, 0, 100); c.rep.credibilidad = clamp(c.rep.credibilidad + 1.5, 0, 100); if (opp) s.opinion.presidentialApproval = clamp(s.opinion.presidentialApproval - 0.3, 5, 90); return `Tu oficio de fiscalización expone falencias del Ejecutivo${opp ? '' : '; en el oficialismo no gusta'}.`; }
      return 'La fiscalización no encuentra irregularidades relevantes.';
    }
    case 'atender_vecinos': {
      const o = c.offices.find((x) => x.type === 'alcalde' || x.type === 'concejal')!;
      const cut = homeCut(s);
      addTerritory(s, [cut], 2 + c.attrs.carisma / 40);
      c.rep.popularidad = clamp(c.rep.popularidad + 0.5, 0, 100);
      return `Atiendes vecinos en ${o.comuna ?? c.comuna}: el arraigo crece lentamente.`;
    }
    case 'intervencion_sala': case 'indicaciones': case 'poner_en_tabla': case 'sesion_especial': case 'interpelacion': case 'citar_comision': case 'oficina_distrital': case 'bancada_transversal': case 'declaracion_intereses': case 'pareo': case 'presidir_comision': case 'jefatura_bancada': case 'audiencia_lobby': return legRun(s, rng, a);
    case 'agenda': { const o = s.career.agenda!.offers.find((x) => x.id === a.offerId)!; s.player.actionPoints -= o.cost; return runAgenda(s, rng, a.offerId); }
    case 'despedir': return fireMember(s, a.memberId);
    case 'cambiar_jornada': {
      s.career.workMode = a.mode; s.career.cooldowns.jornada = s.week + 8;
      return a.mode === 'completa' ? 'Vuelves a trabajar a tiempo completo: más ingresos, menos tiempo para la política.' : a.mode === 'parcial' ? 'Pasas a una jornada parcial: equilibrio entre ingresos y política.' : 'Dejas tu trabajo para dedicarte a la política: más tiempo, pero vives de tus ahorros.';
    }
    case 'renunciar_cargo': {
      removeOffice(s, c, a.office, 'Renuncia voluntaria');
      if (a.office === 'ministro') for (const p of s.government.cabinet) if (p.ministerId === c.id) p.ministerId = null;
      if (a.office === 'presidente_partido' && party?.leaderId === c.id) party.leaderId = null;
      bio(s, 'fin_cargo', `Renuncias: ${officeLabel(a.office, c.gender)}`, '', 0);
      return `Renunciaste a tu cargo de ${officeLabel(a.office, c.gender)}.`;
    }
    case 'retirar_candidatura':
      s.player.candidacies = s.player.candidacies.filter((x) => x.electionId !== a.electionId);
      if (s.player.campaign?.electionId === a.electionId) s.player.campaign = null;
      return 'Retiraste tu candidatura.';
    case 'configurar_campana': {
      const camp = s.player.campaign;
      if (!camp) return 'No tienes campaña activa.';
      const add = clamp(a.budget, 0, s.player.personalFunds);
      s.player.personalFunds -= add; camp.budget += add;
      camp.message = a.message; camp.messageSide = a.side;
      if (a.region) camp.regionFocus = { [a.region]: 1 };
      return `Campaña actualizada: presupuesto ${camp.budget.toFixed(0)} MM$${a.message ? `, mensaje en ${DIM_LABELS[a.message].name.toLowerCase()}` : ''}.`;
    }
    case 'actividad_campana': {
      const camp = s.player.campaign!;
      const spend = Math.min(camp.budget - camp.spent, Math.max(3, camp.budget * 0.12));
      camp.spent += Math.max(0, spend);
      // el mensaje rinde más si conecta con las prioridades ciudadanas
      let msgBonus = 0;
      if (camp.message) {
        const salience = Object.entries(s.opinion.priorities).reduce((acc, [area, w]) => acc + (w ?? 0) * (area === 'seguridad' && camp.message === 'seg' ? 3 : area === 'economia' && camp.message === 'eco' ? 2 : 0), 0);
        msgBonus = salience * 10;
        c.ideology[camp.message] = clamp(c.ideology[camp.message] + camp.messageSide * 1.5, -100, 100);
      }
      const gain = 3 + Math.sqrt(Math.max(0, spend)) * 0.8 + camp.team * 1.5 + c.attrs.carisma / 25 + msgBonus + rng.normal(0, 1);
      camp.intensity = clamp(camp.intensity + gain, 0, 100);
      const pid = s.player.candidacies.find((x) => x.electionId === camp.electionId)?.partyId ?? c.partyId;
      if (pid) {
        const r = (Object.keys(camp.regionFocus)[0] as RegionId | undefined) ?? c.regionId;
        const sp = (s.campaignSpend[pid] ??= {});
        sp[r] = (sp[r] ?? 0) + Math.max(0, spend) / (REGION_BY_ID[r].population * 0.85 / 1e6 * 40);
      }
      c.rep.reconocimientoRegional[c.regionId] = clamp((c.rep.reconocimientoRegional[c.regionId] ?? 0) + 2, 0, 100);
      return `Jornada de campaña: intensidad ${camp.intensity.toFixed(0)}/100.`;
    }
    case 'contratar_equipo': {
      s.player.personalFunds -= 15; s.player.campaign!.team += 1;
      return `Contrataste un equipo profesional (${s.player.campaign!.team}/3).`;
    }
    case 'postular_interna': {
      s.player.candidacies.push({ electionId: `interna-${c.partyId}`, office: 'presidente_partido', partyId: c.partyId!, approved: true });
      const w = party!.nextLeadershipWeek - s.week;
      return `Inscribiste tu candidatura a la presidencia de ${party!.short}. La elección interna será en ${w} semanas.`;
    }
    case 'organizar_faccion': {
      let f = factionOf(s, c);
      if (!f || f.leaderId !== c.id) {
        if (party!.factions.length >= 5) { if (f) { f.influence += 1; } return 'Trabajaste dentro de tu sector, que ya tiene liderazgo.'; }
        f = makeFaction(s, rng, party!, 'renovadora', c, 0.05);
        f.ideology = { ...c.ideology }; f.name = `Sector de ${fullName(c)}`;
        party!.factions.push(f);
        return `Fundaste un sector interno: "${f.name}".`;
      }
      f.share = clamp(f.share + 0.02 + c.attrs.liderazgo / 2000, 0, 0.8);
      f.influence = clamp(f.influence + 2, 0, 100);
      const tot = party!.factions.reduce((a2, x) => a2 + x.share, 0);
      for (const x of party!.factions) x.share /= tot;
      bump(c, 'liderazgo', 0.4);
      return `Tu sector crece: ${(f.share * 100).toFixed(0)}% de la militancia.`;
    }
    case 'renunciar_partido': {
      const name = party!.short;
      leaveParty(s, rng, c);
      s.player.candidacies = s.player.candidacies.filter((x) => x.partyId !== party!.id);
      addHistory(s, 'jugador', `Renuncias a ${name}`, 'Pasas a ser independiente.', 4);
      return `Renunciaste a ${name}. Ahora eres independiente.`;
    }
    case 'unirse_partido': {
      const p = s.parties[a.partyId];
      const dist = ideoDistance(c.ideology, p.ideology);
      const leader = p.leaderId ? s.characters[p.leaderId] : null;
      const acc = 0.9 - dist * 1.6 + (leader ? memoryBalance(leader, c.id) / 200 : 0) + c.rep.reconocimiento / 300;
      if (!rng.chance(clamp(acc, 0.05, 0.98))) return `${p.short} rechazó tu afiliación por diferencias ideológicas.`;
      c.partyId = p.id; c.factionId = p.factions[0]?.id ?? null; c.rep.confianzaPartido = 40;
      addHistory(s, 'jugador', `Te afilias a ${p.short}`, '', 3);
      return `Te afiliaste a ${p.name}.`;
    }
    case 'fundar_partido': {
      s.player.personalFunds -= 50;
      if (party) leaveParty(s, rng, c);
      const np = createParty(s, rng, { name: a.name.trim(), short: a.short.trim(), color: a.color, ideology: { ...c.ideology }, leader: c, members: 500 + Math.round(c.rep.reconocimiento * 40), popularity: clamp(40 + c.rep.popularidad * 0.2, 20, 70), playerFounded: true });
      // parlamentarios afines podrían sumarse
      let joined = 0;
      for (const l of [...members(s, 'camara'), ...members(s, 'senado')]) {
        if (l.isPlayer || joined >= 3) continue;
        const rel = (c.relations[l.id] ?? 0) + memoryBalance(l, c.id);
        if (rel > 25 && ideoDistance(l.ideology, c.ideology) < 0.25 && rng.chance(0.4)) { l.partyId = np.id; joined++; }
      }
      addHistory(s, 'jugador', `Fundas ${np.name}`, `${joined} parlamentarios se suman. Comienza la recolección de firmas.`, 5);
      addNews(s, rng, 'partidos', `${fullName(c)} lanza ${np.name}`, `El nuevo referente busca constituirse legalmente.`, 4);
      s.player.achievements.push('fundador');
      return `Fundaste ${np.name}. Debe completar su proceso de constitución (firmas) antes de competir.`;
    }
    case 'proponer_alianza': return proposeAlliance(s, rng, a.target);
    case 'salir_coalicion': {
      leaveCoalition(s, rng, c.partyId!, 'decisión de la directiva encabezada por el jugador');
      return 'Tu partido abandonó la coalición.';
    }
    case 'disciplinar_bancada': {
      party!.discipline = clamp(party!.discipline + 4 + c.attrs.liderazgo / 25, 0, 100);
      party!.cohesion = clamp(party!.cohesion - 2, 0, 100);
      for (const f of party!.factions) if (f.leaderId !== c.id) f.discontent = clamp(f.discontent + 3, 0, 100);
      return 'Ordenaste la bancada: las votaciones serán más disciplinadas, aunque algunos sectores lo resienten.';
    }
    case 'negociar_partido': return negotiateWithParty(s, rng, a.billId, a.partyId, a.offer);
    case 'lobby': {
      const b = s.bills.find((x) => x.id === a.billId)!;
      const t = s.characters[a.charId];
      if (!t) return 'Parlamentario no encontrado.';
      const ben = ideologicalBenefit(t.ideology, b);
      const traits = PERSONALITY_TRAITS[t.personality];
      const gain = clamp((c.attrs.negociacion / 100) * traits.flexibility * (1 + diff.negotiation) * (1 + ben * 0.8) + (memoryBalance(t, c.id) / 200) + rng.normal(0, 0.15), -0.3, 1.2);
      b.personalSupport[t.id] = clamp((b.personalSupport[t.id] ?? 0) + gain, -1, 2);
      remember(t, { week: s.week, aboutId: c.id, kind: 'colaboracion', weight: 3, note: `Conversación sobre ${b.title}` });
      bump(c, 'negociacion', 0.4);
      return gain > 0.4 ? `${fullName(t)} se muestra receptivo/a.` : gain > 0 ? `${fullName(t)} lo evaluará.` : `${fullName(t)} no se deja convencer.`;
    }
    case 'urgencia': {
      const b = s.bills.find((x) => x.id === a.billId);
      if (!b || b.closedWeek !== undefined) return 'Proyecto no disponible.';
      b.urgency = a.urgency; b.log.push(`S${s.week}: El Ejecutivo hace presente ${a.urgency.replace('_', ' ')}`);
      return `Urgencia asignada: ${a.urgency.replace('_', ' ')}.`;
    }
    case 'retirar_proyecto': {
      const b = s.bills.find((x) => x.id === a.billId);
      if (!b || b.closedWeek !== undefined) return 'Proyecto no disponible.';
      if (b.origin !== 'mensaje') return 'Solo puedes retirar mensajes del Ejecutivo.';
      b.stage = 'retirada'; b.closedWeek = s.week; b.log.push(`S${s.week}: Retirado por el Ejecutivo`);
      s.opinion.presidentialApproval = clamp(s.opinion.presidentialApproval - 1, 0, 100);
      return 'Retiraste el proyecto.';
    }
    case 'decision_ejecutivo': {
      const b = s.bills.find((x) => x.id === a.billId);
      if (!b || b.stage !== 'ejecutivo') return 'El proyecto no está en etapa de promulgación.';
      b.execDecision = a.decision;
      return a.decision === 'vetar' ? 'Formulaste veto: el Congreso necesitará 2/3 para insistir.' : 'Promulgarás la ley.';
    }
    case 'anunciar_politica': return announcePolicy(s, rng, a.policyId);
    case 'nombrar_ministro': return appointMinister(s, rng, a.ministryId, a.charId);
    case 'cadena_nacional': {
      const skill = (c.attrs.comunicacion + c.attrs.oratoria) / 200;
      const delta = (skill - 0.45) * 6 + rng.normal(0, 1.2);
      s.opinion.presidentialApproval = clamp(s.opinion.presidentialApproval + delta, 5, 90);
      return delta > 0 ? `Tu mensaje al país mejora la aprobación (+${delta.toFixed(1)}).` : `La cadena nacional no convence (${delta.toFixed(1)}).`;
    }
    case 'gestion_local': {
      const reg = s.regions[c.regionId];
      const g = (c.attrs.gestion / 100) * (0.6 + rng.next() * 0.6);
      reg.infrastructure = clamp(reg.infrastructure + g * 1.5, 0, 100);
      reg.discontent = clamp(reg.discontent - g * 3, 0, 100);
      c.rep.reconocimientoRegional[c.regionId] = clamp((c.rep.reconocimientoRegional[c.regionId] ?? 0) + 3, 0, 100);
      c.rep.popularidad = clamp(c.rep.popularidad + g * 2, 0, 100);
      c.rep.prestigioTecnico = clamp(c.rep.prestigioTecnico + g, 0, 100);
      bump(c, 'gestion', 0.5);
      return g > 0.5 ? 'Tu gestión local es reconocida por los vecinos.' : 'Avances modestos en la gestión local.';
    }
    case 'gestion_ministerial': {
      const post = s.government.cabinet.find((p) => p.ministerId === c.id);
      if (!post) return 'No encabezas una cartera.';
      post.performance = clamp(post.performance + 3 + c.attrs.gestion / 20, 0, 100);
      c.rep.prestigioTecnico = clamp(c.rep.prestigioTecnico + 2, 0, 100);
      c.rep.reconocimiento = clamp(c.rep.reconocimiento + 1, 0, 100);
      bump(c, 'gestion', 0.5);
      return `Impulsas la gestión de ${MINISTRY_BY_ID[post.ministryId].name}: ${post.performance > 65 ? 'los resultados empiezan a notarse' : post.performance > 45 ? 'avances parciales' : 'la cartera sigue con problemas'}.`;
    }
    case 'resolver_decision': return resolveDecision(s, rng, a.decisionId, a.optionId);
    case 'campana_territorial': {
      const key = s.player.candidacies.find((x) => x.electionId === s.player.campaign?.electionId)?.partyId ?? c.partyId!;
      s.player.personalFunds -= a.amount;
      const spread = investCampaign(s, key, a.target, a.amount);
      if (s.player.campaign) { s.player.campaign.spent += a.amount; s.player.campaign.intensity = clamp(s.player.campaign.intensity + Math.sqrt(a.amount) * 0.6, 0, 100); }
      for (const cut of Object.keys(spread)) { const reg = c.rep.reconocimientoRegional; const r = COMUNA_BY_CUT[Number(cut)].region; reg[r] = clamp((reg[r] ?? 0) + 0.2, 0, 100); }
      return `Invertiste ${a.amount.toFixed(0)} MM$ en ${targetLabel(a.target)} (${Object.keys(spread).length} comunas). El efecto decrece con la inversión acumulada y se diluye con el tiempo.`;
    }
    case 'trabajo_territorial': {
      buildOrganization(s, c.partyId!, a.target, 0.5 + c.attrs.redes / 100);
      bump(c, 'redes', 0.3);
      return `Fortaleciste la organización de ${s.parties[c.partyId!].short} en ${targetLabel(a.target)}.`;
    }
    case 'aceptar_entrevista': return acceptInvite(s, rng, a.inviteId);
    case 'rechazar_entrevista': return declineInvite(s, a.inviteId);
    case 'responder_entrevista': return answerInterview(s, rng, a.inviteId, a.index, a.answer);
    case 'encargar_encuesta': return orderPrivate(s, a.study, { regionId: a.region, cut: a.cut, area: a.area });
    case 'retirarse': {
      s.player.careerOver = true;
      addHistory(s, 'jugador', 'Te retiras de la vida política', 'Tu trayectoria queda registrada en la historia de la partida.', 5);
      return 'Te retiraste de la política. Puedes seguir observando la simulación.';
    }
  }
}

// ---------------------------------------------------------------------------
// Candidaturas
// ---------------------------------------------------------------------------
/** Personas de tu sector en campaña (elección en ≤ 30 semanas) a las que puedes ayudar. */
export function campaignTargets(s: GameState): { id: string; name: string; label: string; cuts: number[] }[] {
  const c = me(s);
  const next = s.calendar.find((e) => !e.done && e.week >= s.week && e.week - s.week <= 30 && e.type !== 'primarias');
  if (!next) return [];
  const mine = c.partyId ? listIdOf(s, c.partyId) : null;
  const out: { id: string; name: string; label: string; cuts: number[] }[] = [];
  for (const p of s.career.processes) {
    if (p.electionId !== next.id || p.status !== 'resuelto') continue;
    if (mine && listIdOf(s, p.partyId) !== mine) continue;
    if (!mine && p.unitId !== String(homeCut(s)) && !unitComunas(p.office, p.unitId).includes(homeCut(s))) continue;
    for (const a of p.aspirants) if (a.status === 'nominado' && a.charId !== c.id && s.characters[a.charId]) out.push({ id: a.charId, name: fullName(s.characters[a.charId]), label: `${p.office} · ${p.unitLabel}`, cuts: unitComunas(p.office, p.unitId) });
  }
  // Incumbentes del sector en la región que irán a reelección
  if (!out.length) for (const x of Object.values(s.characters)) {
    if (x.isPlayer || x.regionId !== c.regionId || (mine && (!x.partyId || listIdOf(s, x.partyId) !== mine))) continue;
    const o = x.offices.find((o) => (o.type === 'diputado' && next.type === 'diputados') || (o.type === 'alcalde' && next.type === 'alcaldes') || (o.type === 'senador' && next.type === 'senadores'));
    if (o) out.push({ id: x.id, name: fullName(x), label: `${officeLabel(o.type, x.gender)} en reelección`, cuts: o.type === 'diputado' ? unitComunas('diputado', String(o.districtId)) : o.type === 'senador' ? unitComunas('senador', x.regionId) : [homeCut(s)] });
    if (out.length >= 8) break;
  }
  return out.slice(0, 10);
}

/** Elecciones en las que el jugador puede aspirar ahora (para la interfaz). */
export function aspirationTargets(s: GameState): { electionId: string; office: OfficeType; units: { id: string; label: string }[]; blocked: string | null; label: string; week: number }[] {
  const out: { electionId: string; office: OfficeType; units: { id: string; label: string }[]; blocked: string | null; label: string; week: number }[] = [];
  const offices: Partial<Record<string, OfficeType[]>> = { municipales: ['alcalde', 'concejal'], alcaldes: ['alcalde'], concejales: ['concejal'], gobernadores: ['gobernador'], diputados: ['diputado'], senadores: ['senador'], presidencial: ['presidente'] };
  for (const e of s.calendar) {
    if (e.done || e.week < s.week || e.week - s.week > 80) continue;
    for (const office of offices[e.type] ?? []) {
      const units = eligibleUnits(s, office);
      if (!units.length) continue;
      out.push({ electionId: e.id, office, units, blocked: aspireBlocked(s, e.id, office, units[0].id), label: e.type, week: e.week });
    }
  }
  return out;
}

void progress;

// ---------------------------------------------------------------------------
// Alianzas y negociación
// ---------------------------------------------------------------------------
function proposeAlliance(s: GameState, rng: Rng, target: string): string {
  const c = me(s); const mine = c.partyId!;
  const bonus = (c.attrs.negociacion - 50) / 25 + DIFFICULTY[s.settings.difficulty].negotiation * 4;
  if (s.coalitions[target]) {
    const res = coalitionAccepts(s, target, mine, bonus);
    if (res.accepted) { joinCoalition(s, rng, mine, target); return `¡${s.coalitions[target].name} acepta a tu partido!`; }
    for (const v of res.vetoes) addRelation(s, mine, v, -3);
    return `La coalición rechazó la incorporación${res.vetoes.length ? ` (veto de ${res.vetoes.map((v) => s.parties[v].short).join(', ')})` : ''}.`;
  }
  const other = s.parties[target];
  if (!other || !other.active) return 'Partido no disponible.';
  const otherList = listIdOf(s, other.id);
  if (otherList !== other.id) return `${other.short} ya integra ${s.coalitions[otherList].name}; propón la alianza a la coalición.`;
  const u = membershipUtility(s, other.id, [mine]) - membershipUtility(s, other.id, []) + getRelation(s, mine, other.id) / 30 + bonus;
  if (u > 0) {
    const myList = listIdOf(s, mine);
    if (s.coalitions[myList]) { joinCoalition(s, rng, other.id, myList); return `${other.short} se suma a tu coalición.`; }
    const k = formCoalition(s, `Pacto ${s.parties[mine].short}–${other.short}`, [mine, other.id], mine);
    addHistory(s, 'coalicion', `Nace ${k.name}`, 'Alianza negociada por el jugador.', 3);
    addNews(s, rng, 'coaliciones', `${s.parties[mine].short} y ${other.short} sellan un pacto`, '', 3);
    return `Formaste ${k.name}.`;
  }
  addRelation(s, mine, other.id, -2);
  return `${other.short} considera que la alianza no le conviene por ahora.`;
}

/** Negociación de votos con un partido para un proyecto. */
function negotiateWithParty(s: GameState, rng: Rng, billId: string, partyId: string, offer: 'moderar' | 'compromiso' | 'inversion' | 'cargo'): string {
  const c = me(s); const b = s.bills.find((x) => x.id === billId)!; const p = s.parties[partyId];
  if (!p) return 'Partido no encontrado.';
  const stance = partyStance(s, partyId, b);
  const leader = p.leaderId ? s.characters[p.leaderId] : null;
  const trust = (getRelation(s, c.partyId ?? '', partyId) + (leader ? memoryBalance(leader, c.id) : 0)) / 100;
  const skill = c.attrs.negociacion / 100 + DIFFICULTY[s.settings.difficulty].negotiation;
  const incompat = Math.max(0, -ideologicalBenefit(p.ideology, b)); // cuánto le daña ideológicamente
  let value = 0; let note = '';
  switch (offer) {
    case 'moderar':
      b.moderation = clamp(b.moderation + 0.1, 0, 0.9);
      value = 0.35; note = 'Aceptaste indicaciones que moderan el proyecto.';
      break;
    case 'compromiso':
      value = 0.4 + trust * 0.3;
      const promise = { week: s.week, kind: 'compromiso_programatico', partyId, description: `Apoyar una prioridad de ${p.short} (${p.priorities[0]})`, dueWeek: s.week + 26 };
      b.concessions.push(promise);
      if (isPresident(s)) s.government.promises.push(promise);
      note = `Te comprometiste a apoyar su agenda de ${p.priorities[0]} en 6 meses.`;
      break;
    case 'inversion':
      value = 0.45;
      if (isPresident(s)) { s.economy.spending += 0.02; s.economy.fiscalImpulse += 0.02; }
      else s.player.personalFunds -= 10;
      note = 'Ofreciste compromisos de inversión en sus territorios.';
      break;
    case 'cargo':
      value = 0.7; note = 'Ofreciste incorporar a un militante al gobierno (deberás nombrarlo).';
      b.concessions.push({ week: s.week, kind: 'cargo', partyId, description: `Cargo de gobierno para ${p.short}`, dueWeek: s.week + 8 });
      s.government.promises.push({ week: s.week, kind: 'cargo', partyId, description: `Nombrar a un militante de ${p.short}`, dueWeek: s.week + 8 });
      break;
  }
  const accept = value * (0.6 + skill) + trust * 0.3 - incompat * (0.6 + p.goals.identity) + rng.normal(0, 0.15);
  b.concessions.push({ week: s.week, kind: offer, partyId, description: note });
  c.attrs.negociacion = clamp(c.attrs.negociacion + 0.4, 0, 100);
  if (accept > 0.15) {
    b.sideSupport[partyId] = clamp((b.sideSupport[partyId] ?? 0) + 0.25 + accept * 0.5, -1, 1.5);
    if (leader) remember(leader, { week: s.week, aboutId: c.id, kind: 'acuerdo_cumplido', weight: 6, note: `Acuerdo por ${b.title}` });
    addRelation(s, c.partyId ?? partyId, partyId, 3);
    return `${p.short} acepta: apoyará el proyecto${stance < -0.3 ? ', pese a sus reparos iniciales' : ''}. ${note}`;
  }
  return `${p.short} rechaza la oferta: el costo ideológico para su base es alto. ${note}`;
}

/** Resumen semanal del jugador (PA, influencia, campaña, logros, fin de carrera). */
export function weeklyPlayer(s: GameState): void {
  const c = me(s); const pl = s.player;
  if (!c) return;
  let ap = PLAYER.baseActionPoints;
  // Agenda personal (18.12): sin cargo remunerado, el trabajo consume tiempo y da sustento
  const paid = hasPaidOffice(c);
  if (!paid && s.career) {
    const inc = OCC_INCOME[s.career.origin.occupation] ?? 0.7;
    const mode = s.career.workMode ?? 'parcial';
    if (mode === 'completa') { ap -= 1; pl.personalFunds += inc; c.rep.prestigioTecnico = clamp(c.rep.prestigioTecnico + 0.02, 0, 100); }
    else if (mode === 'parcial') pl.personalFunds += inc * 0.4;
    else {
      ap += 1; pl.personalFunds -= 0.35;
      if (pl.personalFunds < 1) { s.career.workMode = 'parcial'; pl.lastActionResults.push('Se acabaron tus ahorros: vuelves a trabajar media jornada.'); }
    }
  }
  if (c.offices.some((o) => o.type === 'presidente')) ap += 2;
  else if (c.offices.some((o) => ['senador', 'diputado', 'ministro', 'gobernador', 'presidente_partido', 'alcalde', 'subsecretario'].includes(o.type))) ap += 1;
  if (pl.campaign) ap += Math.min(1, pl.campaign.team);
  pl.maxActionPoints = ap; pl.actionPoints = ap; pl.actionsThisWeek = [];
  if (pl.campaign) pl.campaign.intensity = clamp(pl.campaign.intensity - 1, 0, 100);
  // Influencia: cargos, reconocimiento, redes y liderazgo partidario
  const officeWeight: Partial<Record<OfficeType, number>> = { presidente: 60, ministro: 30, senador: 28, diputado: 20, gobernador: 22, presidente_partido: 25, alcalde: 14, subsecretario: 16, seremi: 8, concejal: 6, dirigente_territorial: 4, asesor: 3, dirigente_social: 2 };
  const off = c.offices.reduce((a, o) => a + (officeWeight[o.type] ?? 0), 0);
  pl.influence = clamp(off * 0.7 + c.rep.reconocimiento * 0.2 + c.attrs.redes * 0.1 + c.rep.relacionesParlamentarias * 0.05, 0, 100);
  // Ingresos legales (dieta parlamentaria/cargos permiten aportes de terceros moderados)
  pl.personalFunds = clamp(pl.personalFunds + (paid ? 1.2 : 0), 0, 100000);
  // Logros
  const add = (k: string, title: string) => { if (!pl.achievements.includes(k)) { pl.achievements.push(k); addHistory(s, 'jugador', `Logro: ${title}`, '', 4); } };
  for (const o of c.offices) {
    if (o.type === 'diputado') add('diputado', 'Diputado/a de la República');
    if (o.type === 'senador') add('senador', 'Senador/a de la República');
    if (o.type === 'presidente') add('presidente', 'Presidente/a de la República');
    if (o.type === 'presidente_partido') add('lider', 'Presidente/a de partido');
    if (o.type === 'alcalde') add('alcalde', 'Alcalde/sa');
    if (o.type === 'gobernador') add('gobernador', 'Gobernador/a regional');
    if (o.type === 'ministro') add('ministro', 'Ministro/a de Estado');
  }
  const laws = s.bills.filter((b) => b.authorId === c.id && b.stage === 'publicada').length;
  if (laws >= 1) add('ley1', 'Primera ley de tu autoría');
  if (laws >= 5) add('ley5', 'Legislador/a prolífico/a (5 leyes)');
  // Fin de carrera por edad avanzada
  if (!pl.careerOver && ageOf(s, c) >= 88) { pl.careerOver = true; addHistory(s, 'jugador', 'Te retiras por edad', 'Una larga trayectoria llega a su fin.', 5); }
  // Promesas del jugador como presidente: cargo cumplido si nombró a alguien del partido
  for (const pr of s.government.promises) {
    if (pr.kind === 'cargo' && pr.fulfilled === undefined && pr.partyId && s.government.cabinet.some((p) => p.ministerId && s.characters[p.ministerId]?.partyId === pr.partyId && p.since >= pr.week)) pr.fulfilled = true;
    if (pr.kind === 'compromiso_programatico' && pr.fulfilled === undefined && pr.partyId) {
      const prio = s.parties[pr.partyId]?.priorities[0];
      if (prio && s.government.policies.some((p) => POLICY_BY_ID[p.defId]?.area === prio && p.phaseWeek >= pr.week)) pr.fulfilled = true;
    }
  }
}
