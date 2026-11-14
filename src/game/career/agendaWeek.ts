/**
 * AGENDA SEMANAL DINÁMICA.
 *
 * Cada semana se ofrece una selección distinta de acciones situacionales (además de las acciones
 * permanentes). La selección depende del contexto: cargo, región, partido, calendario cívico,
 * crisis en curso, proyectos en el Congreso, campañas, equipo propio y azar. Una oferta vale solo
 * esa semana; las acciones de la semana anterior no se repiten de inmediato.
 *
 * La mayoría de las acciones se declara como datos: condiciones, atributos que deciden el éxito y
 * efectos en caso de éxito o fracaso. Algunas (personas, proyectos, encuestas, equipo) tienen lógica propia.
 */
import { orderPrivate, privateBlocked } from '../polling/private';
import type { AgendaOffer, Attributes, Character, GameState, SocialGroup, TeamRole } from '../models/types';
import { Rng } from '../engine/rng';
import { AREA_LABELS, clamp } from '../rules/params';
import { COMUNA_BY_CUT, comunasOfDistrict, comunasOfRegion } from '../territory/data';
import { REGION_BY_ID } from '../data/geography';
import { FEMALE, MALE, SURNAMES } from '../data/names';
import { ageOf, fullName, remember } from '../systems/characters';
import { partyStance } from '../systems/parliament';
import { addNews } from '../systems/news';
import { currentISO, newId } from '../systems/util';
import { addTerritory, bio, capitalOf, homeCut, me, officeRank } from './capital';

type Ctx = Record<string, string | number>;
type Cat = 'territorio' | 'medios' | 'digital' | 'partido' | 'sociedad' | 'cargo' | 'personal' | 'campana' | 'internacional' | 'calendario' | 'equipo' | 'contingencia';

export const CATEGORY_LABEL: Record<Cat, string> = {
  territorio: 'Territorio', medios: 'Medios', digital: 'Redes sociales', partido: 'Partido', sociedad: 'Sociedad civil', cargo: 'Tu cargo',
  personal: 'Vida personal', campana: 'Campaña', internacional: 'Internacional', calendario: 'Fecha especial', equipo: 'Equipo', contingencia: 'Contingencia',
};

/** Efectos de una acción (se aplican sobre el personaje y su capital; la saturación la aplica applyAction). */
interface Fx {
  terr?: number; terrRegion?: number; org?: number; rec?: number; regRec?: number; pop?: number; cred?: number; prest?: number;
  party?: number; digital?: number; funds?: number; rejection?: number; pressure?: number; campaign?: number; exp?: number;
  groups?: Partial<Record<SocialGroup, number>>; attrs?: Partial<Attributes>;
}

interface AgendaDef {
  id: string;
  cat: Cat;
  title: (s: GameState, ctx: Ctx) => string;
  desc: (s: GameState, ctx: Ctx) => string;
  cost: number;
  funds?: number;
  risk: AgendaOffer['risk'];
  when?: (s: GameState) => boolean;
  weight?: (s: GameState) => number;
  ctx?: (s: GameState, rng: Rng) => Ctx | null;
  /** atributos que deciden el éxito (pesos que suman ~1) */
  skill?: Partial<Record<keyof Attributes, number>>;
  difficulty?: number;
  ok?: Fx; bad?: Fx; okText?: string; badText?: string;
  run?: (s: GameState, rng: Rng, ctx: Ctx) => string;
  cooldown?: number;
}

// ---------------------------------------------------------------------------
// Utilidades de contexto
// ---------------------------------------------------------------------------
const P = (s: GameState) => me(s);
const rank = (s: GameState) => Math.max(0, ...P(s).offices.map((o) => officeRank(o.type)));
const has = (s: GameState, t: string) => P(s).offices.some((o) => o.type === t);
const legislator = (s: GameState) => has(s, 'diputado') || has(s, 'senador');
const md = (s: GameState) => { const d = currentISO(s); return { m: Number(d.slice(5, 7)), d: Number(d.slice(8, 10)) }; };
/** ¿La fecha actual está entre (m1,d1) y (m2,d2)? */
const between = (s: GameState, m1: number, d1: number, m2: number, d2: number) => { const { m, d } = md(s); const x = m * 100 + d; return x >= m1 * 100 + d1 && x <= m2 * 100 + d2; };
const comunaName = (cut: number | string) => COMUNA_BY_CUT[Number(cut)]?.name ?? 'tu comuna';
const regionName = (s: GameState) => P(s).regionId === 'RM' ? 'la Región Metropolitana' : REGION_BY_ID[P(s).regionId]?.name ?? 'tu región';
const campaignOn = (s: GameState) => !!s.player.campaign && s.calendar.some((e) => e.id === s.player.campaign!.electionId && !e.done && e.week - s.week <= 26);
const daysToElection = (s: GameState) => { const e = s.calendar.find((x) => x.id === s.player.campaign?.electionId); return e ? e.week - s.week : 999; };
const team = (s: GameState) => s.career.team ?? [];
const hasRole = (s: GameState, r: TeamRole) => team(s).some((m) => m.role === r);
const SOUTH = ['BI', 'AR', 'LR', 'LL', 'NB', 'AI', 'MA'];
const rural = (s: GameState) => comunasOfRegion(P(s).regionId).filter((c) => c.electors < 25000);

function ctxHome(s: GameState): Ctx { return { cut: homeCut(s) }; }
function ctxNeighbor(s: GameState, rng: Rng): Ctx {
  const home = COMUNA_BY_CUT[homeCut(s)];
  const pool = comunasOfDistrict(home.district).filter((c) => c.cut !== home.cut);
  return pool.length ? { cut: rng.pick(pool).cut } : { cut: home.cut };
}
function ctxRural(s: GameState, rng: Rng): Ctx | null { const r = rural(s); return r.length ? { cut: rng.pick(r).cut } : null; }
function ctxArea(s: GameState, rng: Rng): Ctx {
  const top = Object.entries(s.opinion.priorities).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 4);
  const area = top.length ? rng.pick(top)[0] : 'seguridad';
  return { area };
}
function ctxPerson(s: GameState, rng: Rng, filter: (c: Character) => boolean): Ctx | null {
  const pool = Object.values(s.characters).filter((c) => c.status === 'activo' && !c.isPlayer && filter(c));
  if (!pool.length) return null;
  const t = rng.pick(pool);
  return { char: t.id, name: fullName(t) };
}
const areaName = (ctx: Ctx) => (AREA_LABELS[ctx.area as keyof typeof AREA_LABELS] ?? String(ctx.area)).toLowerCase();

// ---------------------------------------------------------------------------
// Aplicación de efectos
// ---------------------------------------------------------------------------
function applyFx(s: GameState, f: Fx, ctx: Ctx, scale = 1): void {
  const c = P(s); const k = scale;
  const r = (key: 'reconocimiento' | 'popularidad' | 'credibilidad' | 'prestigioTecnico' | 'confianzaPartido', v?: number) => { if (v) c.rep[key] = clamp(c.rep[key] + v * k, 0, 100); };
  if (f.terr) addTerritory(s, [Number(ctx.cut ?? homeCut(s))], f.terr * k);
  if (f.terrRegion) addTerritory(s, comunasOfRegion(c.regionId).map((x) => x.cut), f.terrRegion * k);
  if (f.org) s.career.capital.organization = clamp(s.career.capital.organization + f.org * k, 0, 100);
  r('reconocimiento', f.rec); r('popularidad', f.pop); r('credibilidad', f.cred); r('prestigioTecnico', f.prest); r('confianzaPartido', f.party);
  if (f.regRec) c.rep.reconocimientoRegional[c.regionId] = clamp((c.rep.reconocimientoRegional[c.regionId] ?? 0) + f.regRec * k, 0, 100);
  if (f.digital) s.career.capital.digital = clamp((s.career.capital.digital ?? 0) + f.digital * k, 0, 100);
  if (f.funds) s.player.personalFunds = Math.max(0, s.player.personalFunds + f.funds * (f.funds > 0 ? k : 1));
  if (f.rejection) s.career.capital.rejection = clamp(s.career.capital.rejection + f.rejection * (f.rejection > 0 ? 1 : k), 0, 100);
  if (f.pressure) s.career.pressure = clamp(s.career.pressure + f.pressure, 0, 100);
  if (f.exp) c.attrs.experiencia = clamp(c.attrs.experiencia + f.exp * k, 0, 95);
  if (f.campaign && s.player.campaign) s.player.campaign.intensity = clamp(s.player.campaign.intensity + f.campaign * k, 0, 100);
  for (const [g, v] of Object.entries(f.groups ?? {})) c.rep.confianzaGrupos[g as SocialGroup] = clamp((c.rep.confianzaGrupos[g as SocialGroup] ?? 0) + (v ?? 0) * k, -100, 100);
  for (const [a, v] of Object.entries(f.attrs ?? {})) c.attrs[a as keyof Attributes] = clamp(c.attrs[a as keyof Attributes] + (v ?? 0) * k, 0, 95);
}

const TEAM_BONUS: Partial<Record<Cat, TeamRole[]>> = { medios: ['prensa'], digital: ['digital', 'prensa'], territorio: ['territorial'], campana: ['territorial', 'digital'], cargo: ['tecnico'], sociedad: ['tecnico'], internacional: ['tecnico'], partido: ['territorial'] };

function genericRun(s: GameState, rng: Rng, def: AgendaDef, ctx: Ctx): string {
  const c = P(s);
  const sk = def.skill ?? { carisma: 0.4, redes: 0.3, comunicacion: 0.3 };
  let score = 0; for (const [a, w] of Object.entries(sk)) score += (c.attrs[a as keyof Attributes] / 100) * (w ?? 0);
  const bonus = team(s).filter((m) => (TEAM_BONUS[def.cat] ?? []).includes(m.role)).reduce((acc, m) => acc + m.skill / 600, 0);
  const roll = score + bonus + rng.normal(0, def.risk === 'alto' ? 0.24 : def.risk === 'medio' ? 0.18 : 0.12);
  const success = roll > (def.difficulty ?? 0.42);
  if (success) { applyFx(s, def.ok ?? {}, ctx); return fill(def.okText ?? 'Sale bien.', s, ctx); }
  if (def.risk === 'bajo') { applyFx(s, def.ok ?? {}, ctx, 0.4); return fill(def.badText ?? 'Resultado discreto.', s, ctx); }
  applyFx(s, def.bad ?? {}, ctx); return fill(def.badText ?? 'No resulta como esperabas.', s, ctx);
}

function fill(t: string, s: GameState, ctx: Ctx): string {
  return t.replace(/\{comuna\}/g, comunaName(ctx.cut ?? homeCut(s))).replace(/\{region\}/g, regionName(s)).replace(/\{name\}/g, String(ctx.name ?? '')).replace(/\{area\}/g, areaName(ctx));
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------
const T = (t: string) => (s: GameState, ctx: Ctx) => fill(t, s, ctx);

const DEFS: AgendaDef[] = [
  // ------------------------------------------------------------- territorio
  { id: 'feria_libre', cat: 'territorio', cost: 1, risk: 'bajo', ctx: (s) => ctxHome(s), title: T('Recorrer la feria libre de {comuna}'), desc: T('Conversar con feriantes y vecinos en día de feria.'), skill: { carisma: 0.6, redes: 0.4 }, ok: { terr: 3, pop: 0.5, groups: { clasesMedias: 1 } }, okText: 'Te reconocen en varios puestos; te piden volver.', badText: 'Pasas bastante desapercibido/a.' },
  { id: 'puerta_a_puerta', cat: 'territorio', cost: 2, risk: 'bajo', ctx: (s, r) => ctxNeighbor(s, r), title: T('Puerta a puerta en {comuna}'), desc: T('Una jornada completa tocando timbres en un sector donde no te conocen.'), skill: { carisma: 0.4, redes: 0.3, disciplina: 0.3 }, ok: { terr: 5, org: 1 }, okText: 'Dejas tu nombre en cientos de casas de {comuna}.', badText: 'Poca gente abre; avanzas lento.' },
  { id: 'cabildo', cat: 'territorio', cost: 2, risk: 'medio', when: (s) => capitalOf(s).territorial >= 12, ctx: (s) => ctxHome(s), title: T('Convocar un cabildo vecinal en {comuna}'), desc: T('Un encuentro abierto para recoger demandas. Puede llenarse… o quedar vacío.'), skill: { liderazgo: 0.4, redes: 0.4, oratoria: 0.2 }, ok: { terr: 6, cred: 2, org: 2 }, bad: { terr: 1, rejection: 1 }, okText: 'Sala llena: sales con un listado de demandas y nuevos voluntarios.', badText: 'Llegan pocas personas; alguien lo comenta en redes.' },
  { id: 'operativo_social', cat: 'territorio', cost: 1, funds: 4, risk: 'bajo', ctx: (s, r) => ctxNeighbor(s, r), title: T('Operativo de trámites y asesoría gratuita en {comuna}'), desc: T('Con voluntarios, ayudas a vecinos con trámites de vivienda, salud y pensiones.'), skill: { gestion: 0.5, redes: 0.5 }, ok: { terr: 4, pop: 1, groups: { adultosMayores: 2 } }, okText: 'El operativo resuelve casos concretos: te lo agradecen.', badText: 'Organización débil: atiendes a pocos.' },
  { id: 'campamento', cat: 'territorio', cost: 1, risk: 'medio', when: (s) => (s.opinion.priorities.vivienda ?? 0) > 0.06, ctx: (s, r) => ctxNeighbor(s, r), title: T('Visitar un campamento en {comuna}'), desc: T('Familias sin vivienda piden ser escuchadas. Prometer de más tiene costos.'), skill: { integridad: 0.5, carisma: 0.5 }, ok: { terr: 4, cred: 2, groups: { clasesMedias: -1 } }, bad: { cred: -2 }, okText: 'Te comprometes a gestiones concretas y cumples con transmitirlas.', badText: 'Te reprochan que los políticos solo aparecen para la foto.' },
  { id: 'club_deportivo', cat: 'territorio', cost: 1, risk: 'bajo', ctx: (s) => ctxHome(s), title: T('Torneo del club deportivo de {comuna}'), desc: T('Entregas los premios y conversas con jóvenes y apoderados.'), skill: { carisma: 0.7, redes: 0.3 }, ok: { terr: 3, groups: { jovenes: 2 } }, okText: 'Buena tarde de deporte; te invitan a la próxima.', badText: 'Llegas tarde a la premiación.' },
  { id: 'olla_comun', cat: 'territorio', cost: 1, funds: 2, risk: 'bajo', when: (s) => (s.regions[P(s).regionId]?.unemployment ?? 0) > 7.5, ctx: (s, r) => ctxNeighbor(s, r), title: T('Apoyar una olla común en {comuna}'), desc: T('Cesantía alta en la región: vecinos organizados cocinan para el barrio.'), skill: { integridad: 0.5, redes: 0.5 }, ok: { terr: 4, cred: 1, groups: { sindicatos: 2 } }, okText: 'Trabajas en silencio, sin cámaras; el barrio lo valora.', badText: 'Tu presencia se percibe algo forzada.' },
  { id: 'adultos_mayores', cat: 'territorio', cost: 1, risk: 'bajo', ctx: (s) => ctxHome(s), title: T('Encuentro con el club de adultos mayores de {comuna}'), desc: T('Pensiones, salud y soledad: escuchar sin prometer milagros.'), skill: { carisma: 0.5, integridad: 0.5 }, ok: { terr: 3, groups: { adultosMayores: 3 } }, okText: 'Te piden volver con respuestas.', badText: 'Conversación correcta, sin mayor impacto.' },
  { id: 'bomberos', cat: 'territorio', cost: 1, risk: 'bajo', ctx: (s) => ctxHome(s), title: T('Visitar la compañía de bomberos de {comuna}'), desc: T('Conocer sus necesidades de equipamiento.'), skill: { redes: 0.6, carisma: 0.4 }, ok: { terr: 2, cred: 1 }, okText: 'Te comprometes a gestionar apoyo; queda un buen vínculo.', badText: 'Visita breve y protocolar.' },
  { id: 'recorrido_rural', cat: 'territorio', cost: 2, funds: 2, risk: 'bajo', ctx: (s, r) => ctxRural(s, r), title: T('Recorrido rural por {comuna}'), desc: T('Caminos, agua y conectividad: los temas del mundo rural.'), skill: { carisma: 0.4, redes: 0.3, gestion: 0.3 }, ok: { terr: 6, regRec: 3, groups: { regiones: 3 } }, okText: 'En {comuna} valoran que alguien llegue hasta allá.', badText: 'El viaje rinde poco: pocas reuniones concretadas.' },
  { id: 'plaza_limpieza', cat: 'territorio', cost: 1, risk: 'bajo', ctx: (s) => ctxHome(s), title: T('Jornada de recuperación de una plaza en {comuna}'), desc: T('Limpieza, pintura y plantación con vecinos y jóvenes.'), skill: { liderazgo: 0.5, redes: 0.5 }, ok: { terr: 3, org: 1, groups: { jovenes: 1 } }, okText: 'La plaza queda distinta y con una nueva red de vecinos activos.', badText: 'Llueve; la jornada se suspende a medias.' },
  { id: 'centro_padres', cat: 'territorio', cost: 1, risk: 'bajo', ctx: (s) => ctxHome(s), title: T('Reunión con un centro de padres de {comuna}'), desc: T('Seguridad en el entorno escolar, transporte y convivencia.'), skill: { comunicacion: 0.5, carisma: 0.5 }, ok: { terr: 3, groups: { clasesMedias: 2 } }, okText: 'Acuerdan trabajar juntos una propuesta para el municipio.', badText: 'La reunión se va en quejas sin acuerdos.' },
  // ------------------------------------------------------------- medios
  { id: 'radio_regional', cat: 'medios', cost: 1, risk: 'bajo', title: T('Entrevista en una radio de {region}'), desc: T('Un programa matinal regional te invita a comentar la contingencia.'), skill: { comunicacion: 0.6, oratoria: 0.4 }, ok: { regRec: 4, rec: 0.5 }, okText: 'Buena entrevista: te vuelven a llamar.', badText: 'Entrevista correcta, poco memorable.' },
  { id: 'matinal_tv', cat: 'medios', cost: 1, risk: 'alto', when: (s) => P(s).rep.reconocimiento >= 18, title: T('Panel en un matinal de televisión'), desc: T('Mucha audiencia, poco tiempo y un tema polémico.'), skill: { comunicacion: 0.5, oratoria: 0.3, carisma: 0.2 }, difficulty: 0.48, ok: { rec: 4, pop: 2 }, bad: { rec: 2, cred: -3, rejection: 2 }, okText: 'Tu intervención se comenta durante el día.', badText: 'Un cruce con otro panelista se viraliza en tu contra.' },
  { id: 'columna', cat: 'medios', cost: 1, risk: 'bajo', ctx: (s, r) => ctxArea(s, r), title: T('Escribir una columna de opinión sobre {area}'), desc: T('Un medio digital (ficticio) publica tu análisis.'), skill: { tecnico: 0.6, comunicacion: 0.4 }, ok: { prest: 2, rec: 0.8 }, okText: 'La columna circula entre especialistas.', badText: 'Pasa sin pena ni gloria.' },
  { id: 'carta_director', cat: 'medios', cost: 0, risk: 'bajo', ctx: (s, r) => ctxArea(s, r), title: T('Carta al director sobre {area}'), desc: T('Breve, pero leída por quienes deciden.'), skill: { tecnico: 0.5, comunicacion: 0.5 }, ok: { prest: 1, cred: 0.5 }, okText: 'Te la publican; un par de dirigentes la comentan.', badText: 'No te la publican.' },
  { id: 'podcast', cat: 'medios', cost: 1, risk: 'medio', title: T('Invitación a un podcast de política'), desc: T('Conversación larga y distendida con audiencia joven.'), skill: { carisma: 0.4, comunicacion: 0.4, tecnico: 0.2 }, ok: { digital: 4, groups: { jovenes: 3 }, rec: 1 }, bad: { digital: 1, cred: -1 }, okText: 'El episodio se comparte bastante.', badText: 'Una frase sacada de contexto circula en redes.' },
  { id: 'conferencia_prensa', cat: 'medios', cost: 1, risk: 'medio', when: (s) => rank(s) >= 3, ctx: (s, r) => ctxArea(s, r), title: T('Conferencia de prensa sobre {area}'), desc: T('Tu cargo te da tribuna: los medios vienen si el tema pega.'), skill: { comunicacion: 0.5, tecnico: 0.3, oratoria: 0.2 }, ok: { rec: 3, regRec: 3 }, bad: { cred: -2 }, okText: 'Tu anuncio es titular en medios regionales.', badText: 'Una pregunta incómoda opaca el anuncio.' },
  { id: 'entrevista_larga', cat: 'medios', cost: 2, risk: 'alto', when: (s) => P(s).rep.reconocimiento >= 35, title: T('Entrevista de fondo en un diario nacional (ficticio)'), desc: T('Dos páginas, preguntas sobre tu trayectoria y tus ambiciones.'), skill: { comunicacion: 0.4, tecnico: 0.3, integridad: 0.3 }, difficulty: 0.5, ok: { rec: 5, cred: 3, prest: 2 }, bad: { cred: -4, rejection: 3 }, okText: 'La entrevista te posiciona como una voz con contenido.', badText: 'Un titular sobre tu ambición personal genera ruido.' },
  { id: 'debate_universitario', cat: 'medios', cost: 1, risk: 'medio', title: T('Foro debate en una universidad de {region}'), desc: T('Estudiantes exigentes y preguntas directas.'), skill: { oratoria: 0.5, tecnico: 0.3, carisma: 0.2 }, ok: { groups: { jovenes: 3 }, prest: 1, regRec: 2 }, bad: { groups: { jovenes: -2 } }, okText: 'Ganas la discusión y varios estudiantes se acercan después.', badText: 'Te abuchean en una respuesta.' },
  // ------------------------------------------------------------- redes
  { id: 'video_corto', cat: 'digital', cost: 1, risk: 'medio', ctx: (s, r) => ctxArea(s, r), title: T('Grabar un video corto sobre {area}'), desc: T('Un minuto para explicar tu postura. Las redes premian la claridad… y castigan el error.'), skill: { comunicacion: 0.6, carisma: 0.4 }, ok: { digital: 5, rec: 1 }, bad: { digital: 1, rejection: 1 }, okText: 'El video se comparte más de lo esperado.', badText: 'Comentarios hostiles dominan la conversación.' },
  { id: 'en_vivo', cat: 'digital', cost: 1, risk: 'bajo', title: T('Transmisión en vivo para responder preguntas'), desc: T('Una hora respondiendo dudas de vecinos y seguidores.'), skill: { comunicacion: 0.5, tecnico: 0.3, carisma: 0.2 }, ok: { digital: 3, terr: 1, cred: 1 }, okText: 'La transmisión crea una comunidad pequeña pero fiel.', badText: 'Poca conexión; problemas técnicos.' },
  { id: 'desmentir', cat: 'digital', cost: 1, risk: 'medio', when: (s) => (s.career.capital.digital ?? 0) >= 8 || P(s).rep.reconocimiento >= 20, title: T('Aclarar una información falsa que circula sobre ti'), desc: T('Una cadena distorsiona algo que dijiste. Responder también la amplifica.'), skill: { comunicacion: 0.5, integridad: 0.5 }, ok: { cred: 3, digital: 1 }, bad: { rejection: 2, digital: 1 }, okText: 'Tu aclaración convence y la cadena pierde fuerza.', badText: 'Responder le da más vuelo al rumor.' },
  { id: 'pauta_pagada', cat: 'digital', cost: 0, funds: 6, risk: 'bajo', title: T('Pauta pagada en redes sociales'), desc: T('Publicidad segmentada en {region} (gasto declarado).'), skill: { comunicacion: 0.5, gestion: 0.5 }, ok: { digital: 4, regRec: 2 }, okText: 'Tu contenido llega a miles de personas de la región.', badText: 'Mala segmentación: llega a pocos.' },
  { id: 'hilo_explicativo', cat: 'digital', cost: 1, risk: 'bajo', ctx: (s, r) => ctxArea(s, r), title: T('Publicar un hilo explicativo sobre {area}'), desc: T('Datos y propuestas, paso a paso.'), skill: { tecnico: 0.7, comunicacion: 0.3 }, ok: { prest: 1.5, digital: 2 }, okText: 'Especialistas lo comparten.', badText: 'Pasa inadvertido.' },
  { id: 'tendencia', cat: 'digital', cost: 1, risk: 'alto', weight: () => 0.6, title: T('Subirte a una tendencia viral'), desc: T('Puede ser tu gran momento… o un bochorno.'), skill: { carisma: 0.5, comunicacion: 0.5 }, difficulty: 0.55, ok: { digital: 9, rec: 3, groups: { jovenes: 3 } }, bad: { digital: 2, cred: -3, rejection: 3 }, okText: '¡Se viraliza! Miles de nuevos seguidores.', badText: 'Lo consideran oportunista: llueven las críticas.' },
  // ------------------------------------------------------------- partido
  { id: 'consejo_regional', cat: 'partido', cost: 1, risk: 'bajo', when: (s) => !!P(s).partyId, title: T('Sesión del consejo regional del partido'), desc: T('Se discute la estrategia en {region}.'), skill: { oratoria: 0.4, negociacion: 0.4, redes: 0.2 }, ok: { party: 3, org: 1 }, okText: 'Tu intervención ordena la discusión.', badText: 'Sesión larga sin acuerdos.' },
  { id: 'escuela_formacion', cat: 'partido', cost: 1, risk: 'bajo', when: (s) => !!P(s).partyId && P(s).attrs.tecnico >= 45, ctx: (s, r) => ctxArea(s, r), title: T('Dictar un taller de formación sobre {area}'), desc: T('Militantes nuevos del partido en la región.'), skill: { tecnico: 0.5, oratoria: 0.5 }, ok: { party: 2, prest: 1, org: 1 }, okText: 'Varios militantes jóvenes quieren trabajar contigo.', badText: 'Taller poco concurrido.' },
  { id: 'cena_partido', cat: 'partido', cost: 1, funds: 3, risk: 'bajo', when: (s) => !!P(s).partyId, title: T('Cena de recaudación del partido'), desc: T('Aportes declarados para la campaña del sector.'), skill: { redes: 0.6, carisma: 0.4 }, ok: { party: 3, funds: 6 }, okText: 'Buena recaudación; la directiva lo nota.', badText: 'Recaudación modesta.' },
  { id: 'juventud', cat: 'partido', cost: 1, risk: 'bajo', when: (s) => !!P(s).partyId && ageOf(s, P(s)) < 40, title: T('Encuentro de la juventud del partido'), desc: T('Debate sobre el rumbo del partido.'), skill: { liderazgo: 0.5, carisma: 0.5 }, ok: { party: 2, org: 2, groups: { jovenes: 2 } }, okText: 'Te eligen para coordinar un grupo de trabajo.', badText: 'Discusión intensa sin acuerdos.' },
  { id: 'documento_programatico', cat: 'partido', cost: 2, risk: 'medio', when: (s) => !!P(s).partyId, ctx: (s, r) => ctxArea(s, r), title: T('Redactar un documento programático sobre {area}'), desc: T('Para la próxima convención del partido.'), skill: { tecnico: 0.6, negociacion: 0.4 }, ok: { party: 4, prest: 3 }, bad: { party: -1 }, okText: 'El documento se adopta como base de trabajo.', badText: 'Lo critican por apartarse de la línea.' },
  { id: 'sede_regional', cat: 'partido', cost: 2, funds: 3, risk: 'bajo', when: (s) => !!P(s).partyId, title: T('Gira por las sedes comunales del partido en {region}'), desc: T('Conocer a las bases fuera de tu comuna.'), skill: { redes: 0.5, carisma: 0.5 }, ok: { party: 2, terrRegion: 1, regRec: 2 }, okText: 'Construyes red en toda la región.', badText: 'Varias sedes estaban cerradas.' },
  // ------------------------------------------------------------- sociedad civil
  { id: 'sindicato', cat: 'sociedad', cost: 1, risk: 'medio', title: T('Reunión con un sindicato de {region}'), desc: T('Salarios, seguridad laboral y negociación colectiva.'), skill: { negociacion: 0.5, integridad: 0.5 }, ok: { groups: { sindicatos: 4 }, cred: 1 }, bad: { groups: { sindicatos: -2 } }, okText: 'Acuerdan una agenda común.', badText: 'Te enrostran posiciones de tu sector.' },
  { id: 'gremio', cat: 'sociedad', cost: 1, risk: 'medio', title: T('Desayuno con un gremio de pymes de {region}'), desc: T('Permisos, créditos y competencia.'), skill: { negociacion: 0.5, tecnico: 0.5 }, ok: { groups: { empresarios: 4 }, funds: 2 }, bad: { groups: { empresarios: -2 } }, okText: 'Te ven como alguien que entiende a las pymes.', badText: 'El desayuno se tensiona.' },
  { id: 'ambientalistas', cat: 'sociedad', cost: 1, risk: 'medio', title: T('Mesa con organizaciones ambientales de {region}'), desc: T('Proyectos extractivos, agua y áreas protegidas.'), skill: { tecnico: 0.5, integridad: 0.5 }, ok: { groups: { jovenes: 2 }, cred: 2 }, bad: { cred: -1 }, okText: 'Construyes confianza con un sector exigente.', badText: 'Te acusan de tibieza.' },
  { id: 'interreligioso', cat: 'sociedad', cost: 1, risk: 'bajo', title: T('Encuentro con comunidades religiosas de {comuna}'), ctx: (s) => ctxHome(s), desc: T('Acción social y convivencia en el barrio.'), skill: { carisma: 0.5, integridad: 0.5 }, ok: { terr: 2, cred: 1 }, okText: 'Un encuentro cordial y una red de acción social.', badText: 'Visita protocolar.' },
  { id: 'seminario_academico', cat: 'sociedad', cost: 1, risk: 'bajo', ctx: (s, r) => ctxArea(s, r), title: T('Panelista en un seminario académico sobre {area}'), desc: T('Investigadores y estudiantes de postgrado.'), skill: { tecnico: 0.8, oratoria: 0.2 }, ok: { prest: 3 }, okText: 'Tu exposición se cita en el resumen del seminario.', badText: 'Tus datos quedan en entredicho.' },
  { id: 'pueblos_originarios', cat: 'sociedad', cost: 2, risk: 'medio', when: (s) => SOUTH.includes(P(s).regionId) || ['AP', 'TA', 'AN'].includes(P(s).regionId), title: T('Conversación con comunidades indígenas de {region}'), desc: T('Tierras, agua, educación intercultural.'), skill: { integridad: 0.5, negociacion: 0.5 }, ok: { groups: { regiones: 3 }, cred: 2, regRec: 2 }, bad: { cred: -1 }, okText: 'Un diálogo respetuoso que abre puertas.', badText: 'Desconfianza: te piden compromisos que no puedes asumir.' },
  { id: 'colegio_profesional', cat: 'sociedad', cost: 1, risk: 'bajo', title: T('Exponer en un colegio profesional'), desc: T('Médicos, profesores o ingenieros discuten una reforma.'), skill: { tecnico: 0.6, comunicacion: 0.4 }, ok: { prest: 2, groups: { clasesMedias: 2 } }, okText: 'Te invitan a seguir colaborando.', badText: 'Recibes críticas técnicas.' },
  { id: 'migrantes', cat: 'sociedad', cost: 1, risk: 'medio', when: (s) => (s.opinion.priorities.migracion ?? 0) > 0.04, ctx: (s) => ctxHome(s), title: T('Encuentro con la comunidad migrante de {comuna}'), desc: T('Regularización, empleo y convivencia. Un tema que divide.'), skill: { integridad: 0.4, comunicacion: 0.6 }, ok: { cred: 2, terr: 2 }, bad: { rejection: 2 }, okText: 'Planteas una postura clara y matizada.', badText: 'Tu postura molesta a parte de tus votantes.' },
  // ------------------------------------------------------------- cargos
  { id: 'fiscalizar_contrato', cat: 'cargo', cost: 1, risk: 'medio', when: (s) => has(s, 'concejal'), title: T('Fiscalizar un contrato municipal'), desc: T('Una licitación de aseo genera dudas en el concejo.'), skill: { tecnico: 0.5, integridad: 0.5 }, ok: { cred: 3, terr: 2 }, bad: { party: -2 }, okText: 'Detectas irregularidades administrativas: el municipio corrige.', badText: 'No encuentras nada y te acusan de hacer show.' },
  { id: 'inaugurar_obra', cat: 'cargo', cost: 1, risk: 'bajo', when: (s) => has(s, 'alcalde') || has(s, 'gobernador'), title: T('Inaugurar una obra en {comuna}'), ctx: (s) => ctxHome(s), desc: T('Una plaza, un consultorio o una pavimentación.'), skill: { gestion: 0.6, carisma: 0.4 }, ok: { pop: 2, terr: 3 }, okText: 'Los vecinos valoran la obra terminada a tiempo.', badText: 'La obra tiene detalles pendientes.' },
  { id: 'cuenta_publica_municipal', cat: 'cargo', cost: 2, risk: 'medio', when: (s) => has(s, 'alcalde') && between(s, 4, 1, 4, 30), title: T('Cuenta pública municipal'), desc: T('Rendición anual de tu gestión ante el concejo y la comunidad.'), skill: { gestion: 0.5, oratoria: 0.5 }, ok: { pop: 3, cred: 2, rec: 1 }, bad: { cred: -2 }, okText: 'Cuenta pública sólida y bien recibida.', badText: 'La oposición municipal desmiente varias cifras.' },
  { id: 'reunion_alcaldes', cat: 'cargo', cost: 1, risk: 'bajo', when: (s) => has(s, 'gobernador'), title: T('Reunión con alcaldes de {region}'), desc: T('Coordinar inversión regional.'), skill: { negociacion: 0.6, gestion: 0.4 }, ok: { terrRegion: 1.5, groups: { regiones: 3 } }, okText: 'Acuerdan una cartera común de proyectos.', badText: 'Los alcaldes se quejan de discriminación.' },
  { id: 'proyecto_acuerdo', cat: 'cargo', cost: 1, risk: 'bajo', when: legislator, ctx: (s, r) => ctxArea(s, r), title: T('Presentar un proyecto de resolución sobre {area}'), desc: T('Una solicitud al Ejecutivo votada en sala.'), skill: { tecnico: 0.5, negociacion: 0.5 }, ok: { prest: 2, rec: 1 }, okText: 'Se aprueba con votos de distintos sectores.', badText: 'No alcanza el quórum de sala.' },
  { id: 'comision_terreno', cat: 'cargo', cost: 2, risk: 'medio', when: legislator, title: T('Sesión de comisión en terreno en {region}'), desc: T('Llevas la comisión a tu región para escuchar a la comunidad.'), skill: { gestion: 0.5, negociacion: 0.5 }, ok: { regRec: 4, prest: 2, terrRegion: 1 }, bad: { cred: -1 }, okText: 'La sesión se convierte en noticia regional.', badText: 'Asisten pocos parlamentarios.' },
  { id: 'bancada', cat: 'cargo', cost: 1, risk: 'bajo', when: legislator, title: T('Reunión de bancada'), desc: T('Ordenar votaciones y vocerías de la semana.'), skill: { negociacion: 0.5, disciplina: 0.5 }, ok: { party: 3 }, okText: 'Te dan una vocería relevante.', badText: 'Discusión interna sin resultados.' },
  { id: 'visita_ministerial', cat: 'cargo', cost: 2, risk: 'medio', when: (s) => has(s, 'ministro') || has(s, 'subsecretario') || has(s, 'seremi'), title: T('Visita a terreno de tu servicio en {region}'), desc: T('Revisar en persona cómo funciona la oferta pública.'), skill: { gestion: 0.6, carisma: 0.4 }, ok: { rec: 2, prest: 2 }, bad: { pressure: 4 }, okText: 'Detectas problemas y anuncias correcciones.', badText: 'Funcionarios molestos: la visita se lee como fiscalización.' },
  // ------------------------------------------------------------- personal
  { id: 'descanso', cat: 'personal', cost: 1, risk: 'bajo', title: T('Un fin de semana con tu familia'), desc: T('Recuperar energía: las acciones repetidas vuelven a rendir y baja la presión.'), run: (s) => { for (const k of Object.keys(s.career.cooldowns)) if (k.startsWith('use:')) s.career.cooldowns[k] *= 0.5; s.career.pressure = Math.max(0, s.career.pressure - 8); P(s).rep.popularidad = clamp(P(s).rep.popularidad + 0.5, 0, 100); return 'Descansas y vuelves con energía.'; } },
  { id: 'curso', cat: 'personal', cost: 1, funds: 6, risk: 'bajo', ctx: (s, r) => ctxArea(s, r), title: T('Curso de especialización en {area}'), desc: T('Diplomado de fin de semana.'), skill: { tecnico: 0.5, disciplina: 0.5 }, ok: { attrs: { tecnico: 2 }, prest: 2 }, okText: 'Terminas el curso con buenas calificaciones.', badText: 'No logras seguir el ritmo.' },
  { id: 'media_training', cat: 'personal', cost: 1, funds: 8, risk: 'bajo', title: T('Entrenamiento de vocería y medios'), desc: T('Con un/a consultor/a de comunicaciones.'), skill: { disciplina: 0.6, carisma: 0.4 }, ok: { attrs: { comunicacion: 2, oratoria: 1 } }, okText: 'Mejoras notoriamente frente a cámara.', badText: 'Aprendes poco.' },
  { id: 'deporte', cat: 'personal', cost: 1, risk: 'bajo', title: T('Retomar el deporte'), desc: T('Una semana con más ejercicio y menos reuniones.'), run: (s) => { s.career.pressure = Math.max(0, s.career.pressure - 5); P(s).attrs.disciplina = clamp(P(s).attrs.disciplina + 0.5, 0, 95); return 'Duermes mejor y manejas mejor la presión.'; } },
  { id: 'libro', cat: 'personal', cost: 2, risk: 'medio', when: (s) => P(s).rep.reconocimiento >= 25 && P(s).attrs.tecnico >= 50, ctx: (s, r) => ctxArea(s, r), title: T('Publicar un libro sobre {area}'), desc: T('Meses de escritura que culminan en un lanzamiento.'), skill: { tecnico: 0.6, comunicacion: 0.4 }, cooldown: 104, ok: { prest: 6, rec: 3 }, bad: { prest: 2 }, okText: 'El libro tiene buena recepción y te invitan a presentarlo en regiones.', badText: 'El libro vende poco.' },
  { id: 'voluntariado', cat: 'personal', cost: 1, risk: 'bajo', ctx: (s) => ctxHome(s), title: T('Voluntariado sin cámaras en {comuna}'), desc: T('Ayudar sin buscar rédito.'), skill: { integridad: 1 }, ok: { cred: 2, terr: 1 }, okText: 'Nadie lo publica, pero quienes te vieron lo recuerdan.', badText: 'Una jornada tranquila.' },
  // ------------------------------------------------------------- campaña
  { id: 'brigada', cat: 'campana', cost: 1, risk: 'bajo', when: campaignOn, ctx: (s, r) => ctxNeighbor(s, r), title: T('Brigada de volanteo en {comuna}'), desc: T('Voluntarios, volantes y conversación en esquinas.'), skill: { liderazgo: 0.5, redes: 0.5 }, ok: { campaign: 6, terr: 3 }, okText: 'La brigada llega a miles de personas.', badText: 'Pocos voluntarios.' },
  { id: 'caravana', cat: 'campana', cost: 2, funds: 4, risk: 'medio', when: campaignOn, title: T('Caravana por {region}'), desc: T('Vehículos, música y paradas en varias comunas.'), skill: { carisma: 0.5, gestion: 0.5 }, ok: { campaign: 9, terrRegion: 1 }, bad: { campaign: 2, rejection: 1 }, okText: 'Caravana masiva: tu campaña gana visibilidad.', badText: 'Atochamiento y vecinos molestos.' },
  { id: 'debate_candidatos', cat: 'campana', cost: 1, risk: 'alto', when: campaignOn, title: T('Debate de candidaturas en una radio local'), desc: T('Todos contra todos, en vivo.'), skill: { oratoria: 0.5, tecnico: 0.3, carisma: 0.2 }, difficulty: 0.47, ok: { campaign: 8, regRec: 3 }, bad: { campaign: -3, cred: -2 }, okText: 'Ganas el debate según la audiencia.', badText: 'Pierdes el debate.' },
  { id: 'spot', cat: 'campana', cost: 1, funds: 8, risk: 'medio', when: campaignOn, title: T('Grabar un spot de campaña'), desc: T('Para redes y la franja (cuando corresponda).'), skill: { comunicacion: 0.6, carisma: 0.4 }, ok: { campaign: 7, digital: 3 }, bad: { campaign: 2 }, okText: 'El spot conecta.', badText: 'El spot no logra destacar.' },
  { id: 'cierre_campana', cat: 'campana', cost: 2, funds: 6, risk: 'medio', when: (s) => campaignOn(s) && daysToElection(s) <= 2, weight: () => 8, title: T('Cierre de campaña'), desc: T('El último gran acto antes de la elección.'), skill: { carisma: 0.4, liderazgo: 0.3, gestion: 0.3 }, ok: { campaign: 14 }, bad: { campaign: 4 }, okText: 'Cierre multitudinario.', badText: 'Asistencia menor a la esperada.' },
  { id: 'apoderados', cat: 'campana', cost: 1, risk: 'bajo', when: (s) => campaignOn(s) && daysToElection(s) <= 6, title: T('Organizar apoderados de mesa'), desc: T('Cuidar el voto el día de la elección.'), skill: { gestion: 0.6, redes: 0.4 }, ok: { org: 3, campaign: 3 }, okText: 'Tienes apoderados en la mayoría de los locales.', badText: 'Faltan apoderados en varios locales.' },
  // ------------------------------------------------------------- internacional
  { id: 'seminario_internacional', cat: 'internacional', cost: 2, funds: 5, risk: 'bajo', when: (s) => P(s).rep.reconocimiento >= 30 || rank(s) >= 5, ctx: (s, r) => ctxArea(s, r), title: T('Seminario internacional sobre {area}'), desc: T('Una fundación extranjera (ficticia) te invita a exponer.'), skill: { tecnico: 0.6, comunicacion: 0.4 }, ok: { prest: 4, exp: 1 }, okText: 'Vuelves con contactos y nuevas ideas.', badText: 'Viaje de poco provecho.' },
  { id: 'delegacion', cat: 'internacional', cost: 1, risk: 'bajo', when: legislator, title: T('Recibir a una delegación parlamentaria extranjera'), desc: T('Cooperación en energía y comercio.'), skill: { negociacion: 0.5, comunicacion: 0.5 }, ok: { prest: 2, rec: 1 }, okText: 'Se acuerda un intercambio técnico.', badText: 'Reunión protocolar.' },
  // ------------------------------------------------------------- calendario cívico (fechas reales; actividades simuladas)
  { id: 'verano_costumbrista', cat: 'calendario', cost: 1, risk: 'bajo', when: (s) => between(s, 1, 5, 2, 25), weight: () => 3, ctx: (s, r) => ctxRural(s, r) ?? ctxHome(s), title: T('Fiesta costumbrista de verano en {comuna}'), desc: T('Temporada de fiestas y ferias en las comunas.'), skill: { carisma: 0.7, redes: 0.3 }, ok: { terr: 5, pop: 1 }, okText: 'Bailas, conversas y te sacas fotos con medio pueblo.', badText: 'Llegas cuando todo terminaba.' },
  { id: 'inicio_clases', cat: 'calendario', cost: 1, risk: 'bajo', when: (s) => between(s, 2, 25, 3, 15), weight: () => 3, ctx: (s) => ctxHome(s), title: T('Inicio del año escolar en {comuna}'), desc: T('Recorrer escuelas: infraestructura, transporte y útiles.'), skill: { gestion: 0.5, carisma: 0.5 }, ok: { terr: 3, groups: { clasesMedias: 2 } }, okText: 'Detectas problemas concretos y los haces visibles.', badText: 'Visita breve.' },
  { id: 'dia_mujer', cat: 'calendario', cost: 1, risk: 'medio', when: (s) => between(s, 3, 1, 3, 12), weight: () => 3, title: T('Actividades por el Día Internacional de la Mujer (8 de marzo)'), desc: T('Marchas, foros y demandas de igualdad.'), skill: { integridad: 0.5, comunicacion: 0.5 }, ok: { groups: { jovenes: 2, clasesMedias: 1 }, cred: 1 }, bad: { rejection: 1 }, okText: 'Tu participación se valora como genuina.', badText: 'Te critican por instrumentalizar la fecha.' },
  { id: 'primero_mayo', cat: 'calendario', cost: 1, risk: 'medio', when: (s) => between(s, 4, 26, 5, 5), weight: () => 3, title: T('Acto del Día del Trabajo (1 de mayo)'), desc: T('Organizaciones sindicales convocan en {region}.'), skill: { oratoria: 0.5, integridad: 0.5 }, ok: { groups: { sindicatos: 4 } }, bad: { groups: { empresarios: -1 } }, okText: 'Te dan la palabra: un buen discurso.', badText: 'Pifias desde un sector del público.' },
  { id: 'cuenta_publica', cat: 'calendario', cost: 1, risk: 'medio', when: (s) => between(s, 5, 26, 6, 6), weight: () => 3, title: T('Analizar la Cuenta Pública presidencial (1 de junio)'), desc: T('Medios y redes buscan reacciones al mensaje presidencial.'), skill: { tecnico: 0.5, comunicacion: 0.5 }, ok: { rec: 2, prest: 1, digital: 2 }, bad: { cred: -1 }, okText: 'Tu análisis es de los más citados.', badText: 'Tu reacción se lee como mero libreto partidario.' },
  { id: 'we_tripantu', cat: 'calendario', cost: 1, risk: 'bajo', when: (s) => between(s, 6, 18, 6, 26) && SOUTH.includes(P(s).regionId), weight: () => 3, title: T('Invitación a una ceremonia de año nuevo indígena (solsticio de invierno)'), desc: T('Comunidades de {region} te invitan como observador/a.'), skill: { integridad: 0.6, carisma: 0.4 }, ok: { groups: { regiones: 3 }, regRec: 2 }, okText: 'Asistes con respeto y aprendes; el gesto se valora.', badText: 'Tu presencia se percibe como protocolar.' },
  { id: 'fiestas_patrias', cat: 'calendario', cost: 1, risk: 'medio', when: (s) => between(s, 9, 10, 9, 22), weight: () => 4, ctx: (s) => ctxHome(s), title: T('Fondas y ramadas en {comuna} (Fiestas Patrias)'), desc: T('Cueca, empanadas y mucha gente.'), skill: { carisma: 0.8, redes: 0.2 }, ok: { terr: 6, pop: 3 }, bad: { pop: -1, rejection: 1 }, okText: 'Bailas una cueca aplaudida: la foto recorre la comuna.', badText: 'Tu cueca se vuelve meme.' },
  { id: 'navidad', cat: 'calendario', cost: 1, funds: 3, risk: 'bajo', when: (s) => between(s, 12, 10, 12, 24), weight: () => 3, ctx: (s) => ctxHome(s), title: T('Fiesta de Navidad con juntas de vecinos de {comuna}'), desc: T('Regalos y actividades para niños del sector.'), skill: { redes: 0.5, gestion: 0.5 }, ok: { terr: 4, pop: 1 }, okText: 'Una tarde emotiva con las familias.', badText: 'Faltan regalos para todos.' },
  { id: 'aniversario_comunal', cat: 'calendario', cost: 1, risk: 'bajo', weight: () => 0.5, ctx: (s) => ctxHome(s), title: T('Aniversario de {comuna}'), desc: T('Desfile, feria y actividades culturales.'), skill: { carisma: 0.6, redes: 0.4 }, ok: { terr: 4 }, okText: 'Participas en todas las actividades.', badText: 'Apenas alcanzas a pasar.' },
];

// ---------------------------------------------------------------------------
// Acciones con lógica propia: personas, proyectos, crisis, encuestas y equipo
// ---------------------------------------------------------------------------
const ROLE_INFO: Record<TeamRole, { label: string; salary: number; desc: string }> = {
  prensa: { label: 'Jefe/a de prensa', salary: 1.2, desc: 'Mejora el resultado de medios y redes.' },
  territorial: { label: 'Coordinador/a territorial', salary: 1.0, desc: 'Organización y arraigo semanal; una acción más en tu agenda.' },
  tecnico: { label: 'Asesor/a técnico/a', salary: 1.3, desc: 'Prestigio técnico semanal; mejora acciones de cargo y sociedad civil.' },
  digital: { label: 'Encargado/a de redes', salary: 0.9, desc: 'Presencia digital semanal; mejora acciones en redes.' },
  finanzas: { label: 'Encargado/a de finanzas', salary: 0.8, desc: 'Ordena la recaudación legal: más recursos cada semana.' },
};
export const TEAM_ROLES = ROLE_INFO;

const SPECIAL: AgendaDef[] = [
  ...(Object.keys(ROLE_INFO) as TeamRole[]).map((role): AgendaDef => ({
    id: `contratar_${role}`, cat: 'equipo', cost: 0, risk: 'bajo', weight: () => 0.9,
    when: (s) => !hasRole(s, role) && team(s).length < 5 && s.player.personalFunds >= ROLE_INFO[role].salary * 6,
    ctx: (_s, rng) => { const f = rng.chance(0.5); return { name: `${rng.pick(f ? FEMALE : MALE)} ${rng.pick(SURNAMES)}`, skill: Math.round(rng.range(40, 85)), g: f ? 'f' : 'm' }; },
    title: (_s, ctx) => `${ctx.name} busca trabajo como ${ROLE_INFO[role].label.toLowerCase()}`,
    desc: (_s, ctx) => `${ROLE_INFO[role].desc} Costo: ${ROLE_INFO[role].salary.toFixed(1)} MM$ por semana. Referencias: ${Number(ctx.skill) > 70 ? 'muy buenas' : Number(ctx.skill) > 55 ? 'buenas' : 'irregulares'}.`,
    run: (s, _rng, ctx) => { (s.career.team ??= []).push({ id: newId(s, 'tm'), role, name: String(ctx.name), since: s.week, salary: ROLE_INFO[role].salary, skill: Number(ctx.skill) }); bio(s, 'decision', `Contratas a ${ctx.name} (${ROLE_INFO[role].label.toLowerCase()})`, '', 0); return `${ctx.name} se suma a tu equipo.`; },
  })),
  {
    id: 'encuesta_propia', cat: 'contingencia', cost: 0, risk: 'bajo', weight: () => 0.8, when: (s) => privateBlocked(s, 'estudio_regional') === null,
    title: () => 'Encargar un estudio regional sobre tu figura', desc: () => 'Una consultora (ficticia) mide intención por partido, problemas y tu conocimiento e imagen en la región. Es un estudio muestral: tiene error y efectos de método.',
    run: (s) => orderPrivate(s, 'estudio_regional', { regionId: P(s).regionId }),
  },
  {
    id: 'acompanar_autoridad', cat: 'contingencia', cost: 1, risk: 'medio', weight: () => 1.2,
    ctx: (s, rng) => ctxPerson(s, rng, (c) => c.regionId === P(s).regionId && c.offices.some((o) => ['ministro', 'senador', 'gobernador', 'presidente_partido'].includes(o.type)) && (!P(s).partyId || !c.partyId || c.partyId === P(s).partyId) && !c.memory.some((m) => m.aboutId === s.player.characterId)),
    title: (s, ctx) => `Acompañar la visita de ${ctx.name} a ${regionName(s)}`, desc: () => 'Una oportunidad de presentarte en persona a una figura con la que no tienes vínculo.',
    run: (s, rng, ctx) => {
      const t = s.characters[String(ctx.char)]; const c = P(s); if (!t) return 'La visita se suspende.';
      const ok = rng.chance(0.35 + c.attrs.carisma / 250 + c.attrs.redes / 250);
      remember(t, { week: s.week, aboutId: c.id, kind: 'colaboracion', weight: ok ? 8 : 3, note: 'Lo/la acompañó en una visita a la región' });
      c.relations[t.id] = clamp((c.relations[t.id] ?? 0) + (ok ? 6 : 2), -100, 100);
      return `${t.realId ? '(Situación simulada) ' : ''}${ok ? `Tienes una conversación larga con ${fullName(t)}: ahora te conoce.` : `Apenas alcanzas a saludar a ${fullName(t)}, pero ya sabe quién eres.`}`;
    },
  },
  {
    id: 'pronunciarse_proyecto', cat: 'contingencia', cost: 1, risk: 'medio', weight: () => 1.3,
    ctx: (s, rng) => { const b = s.bills.filter((x) => x.closedWeek === undefined && Math.abs(x.popularity) >= 15); if (!b.length) return null; const x = rng.pick(b); return { bill: x.id, name: x.title.replace(/^Mensaje: /, '') }; },
    title: (_s, ctx) => `Tomar posición sobre «${ctx.name}»`, desc: (s, ctx) => { const b = s.bills.find((x) => x.id === ctx.bill); return `Un proyecto en el Congreso que ${b && b.popularity > 0 ? 'cuenta con apoyo ciudadano' : 'genera rechazo ciudadano'}. Tu partido ${b && P(s).partyId ? (partyStance(s, P(s).partyId!, b) > 0.3 ? 'lo apoya' : partyStance(s, P(s).partyId!, b) < -0.3 ? 'lo rechaza' : 'está dividido') : 'no tiene línea'}.`; },
    run: (s, _rng, ctx) => {
      const b = s.bills.find((x) => x.id === ctx.bill); const c = P(s); if (!b) return 'El proyecto ya no está en discusión.';
      const line = c.partyId ? partyStance(s, c.partyId, b) : 0;
      const favor = line >= 0;
      c.rep.reconocimiento = clamp(c.rep.reconocimiento + 1, 0, 100);
      c.rep.popularidad = clamp(c.rep.popularidad + (favor === b.popularity > 0 ? 1.5 : -1.5), 0, 100);
      if (c.partyId) c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + 1, 0, 100);
      return `Te pronuncias ${favor ? 'a favor' : 'en contra'}, en línea con tu sector: ${favor === b.popularity > 0 ? 'la ciudadanía te acompaña' : 'vas contra la corriente de la opinión pública'}.`;
    },
  },
  {
    id: 'zona_crisis', cat: 'contingencia', cost: 2, funds: 3, risk: 'alto', weight: () => 2.5, when: (s) => s.crises.length > 0,
    ctx: (s) => (s.crises[0] ? { name: s.crises[0].name } : null),
    title: (_s, ctx) => `Ir a terreno por la crisis: ${ctx.name}`, desc: () => 'Ayudar en terreno puede fortalecer tu figura… o parecer oportunismo.',
    run: (s, rng) => {
      const c = P(s); const ok = rng.chance(0.3 + c.attrs.gestion / 250 + c.attrs.integridad / 250);
      if (ok) { addTerritory(s, [homeCut(s)], 5); c.rep.credibilidad = clamp(c.rep.credibilidad + 3, 0, 100); c.rep.reconocimiento = clamp(c.rep.reconocimiento + 2, 0, 100); return 'Tu trabajo en terreno es reconocido por la comunidad afectada.'; }
      s.career.capital.rejection = clamp(s.career.capital.rejection + 3, 0, 100); return 'Te acusan de llegar a sacarte la foto.';
    },
  },
  {
    id: 'mesa_dialogo_regional', cat: 'contingencia', cost: 2, risk: 'alto', weight: () => 2, when: (s) => (s.regions[P(s).regionId]?.discontent ?? 0) > 60,
    title: () => 'Convocar una mesa de diálogo por el malestar regional', desc: (s) => `El malestar en ${regionName(s)} está alto. Mediar te expone, pero te posiciona.`,
    run: (s, rng) => {
      const c = P(s); const reg = s.regions[c.regionId];
      if (rng.chance(0.25 + c.attrs.negociacion / 200 + rank(s) * 0.04)) { reg.discontent = clamp(reg.discontent - 5, 0, 100); c.rep.reconocimientoRegional[c.regionId] = clamp((c.rep.reconocimientoRegional[c.regionId] ?? 0) + 5, 0, 100); c.rep.credibilidad = clamp(c.rep.credibilidad + 2, 0, 100); addNews(s, rng, 'regiones', `Mesa de diálogo en ${REGION_BY_ID[c.regionId].name} logra primeros acuerdos`, `Impulsada por ${fullName(c)}.`, 2, 0, 1); return 'La mesa logra acuerdos iniciales: el malestar baja.'; }
      c.rep.credibilidad = clamp(c.rep.credibilidad - 2, 0, 100); return 'La mesa fracasa: las partes se levantan.';
    },
  },
  {
    id: 'lanzamiento_dirigente', cat: 'partido', cost: 1, risk: 'bajo', weight: () => 1,
    ctx: (s, rng) => P(s).partyId ? ctxPerson(s, rng, (c) => c.partyId === P(s).partyId && c.offices.length > 0 && c.regionId === P(s).regionId) : null,
    title: (_s, ctx) => `Asistir a una actividad de ${ctx.name}`, desc: () => 'Una figura de tu partido en la región presenta su trabajo. Tu presencia se nota.',
    run: (s, _rng, ctx) => { const t = s.characters[String(ctx.char)]; const c = P(s); if (!t) return 'La actividad se suspende.'; remember(t, { week: s.week, aboutId: c.id, kind: 'apoyo', weight: 4, note: 'Asistió a su actividad' }); c.relations[t.id] = clamp((c.relations[t.id] ?? 0) + 3, -100, 100); return `${t.realId ? '(Situación simulada) ' : ''}${fullName(t)} agradece tu presencia.`; },
  },
  {
    id: 'reunion_empresarios', cat: 'sociedad', cost: 1, risk: 'alto', weight: () => 0.8, when: (s) => P(s).rep.reconocimiento >= 15,
    title: () => 'Almuerzo privado con empresarios de la región', desc: () => 'Aportes legales posibles. La prensa podría leerlo mal.',
    run: (s, rng) => { const c = P(s); s.player.personalFunds += 8; c.rep.confianzaGrupos.empresarios = clamp(c.rep.confianzaGrupos.empresarios + 4, -100, 100); if (rng.chance(0.25 - c.attrs.integridad / 600)) { c.rep.credibilidad = clamp(c.rep.credibilidad - 4, 0, 100); return 'Recibes aportes declarados, pero una crónica cuestiona el encuentro.'; } return 'Recibes aportes declarados y abres puertas en el mundo empresarial.'; },
  },
];

export const AGENDA_DEFS: AgendaDef[] = [...DEFS, ...SPECIAL];
const BY_ID: Record<string, AgendaDef> = Object.fromEntries(AGENDA_DEFS.map((d) => [d.id, d]));

// ---------------------------------------------------------------------------
// Generación semanal
// ---------------------------------------------------------------------------
export function agendaSize(s: GameState): number {
  return 5 + (rank(s) >= 5 ? 2 : rank(s) >= 2 ? 1 : 0) + (hasRole(s, 'territorial') ? 1 : 0) + (campaignOn(s) ? 1 : 0);
}

export function generateAgenda(s: GameState, rng: Rng): void {
  if (s.player.careerOver) { s.career.agenda = { week: s.week, offers: [], used: [], lastDefs: [] }; return; }
  const last = new Set(s.career.agenda?.offers.map((o) => o.defId) ?? []);
  const pool: { d: AgendaDef; w: number }[] = [];
  for (const d of AGENDA_DEFS) {
    if (last.has(d.id)) continue;
    if ((s.career.cooldowns[`ag:${d.id}`] ?? -1) > s.week) continue;
    if (d.when && !d.when(s)) continue;
    pool.push({ d, w: Math.max(0.05, d.weight ? d.weight(s) : 1) });
  }
  const n = Math.min(agendaSize(s), pool.length);
  const offers: AgendaOffer[] = [];
  const usedCats: Record<string, number> = {};
  while (offers.length < n && pool.length) {
    // Variedad: cada categoría repetida pesa menos en el sorteo
    const pick = rng.weighted(pool, pool.map((x) => x.w / (1 + (usedCats[x.d.cat] ?? 0) * 1.2)));
    pool.splice(pool.indexOf(pick), 1);
    const ctx = pick.d.ctx ? pick.d.ctx(s, rng) : {};
    if (ctx === null) continue;
    usedCats[pick.d.cat] = (usedCats[pick.d.cat] ?? 0) + 1;
    offers.push({ id: newId(s, 'ag'), defId: pick.d.id, category: pick.d.cat, title: pick.d.title(s, ctx), desc: pick.d.desc(s, ctx), cost: pick.d.cost, funds: pick.d.funds ?? 0, risk: pick.d.risk, ctx });
  }
  s.career.agenda = { week: s.week, offers, used: [], lastDefs: [...last] };
}

export function agendaBlocked(s: GameState, offerId: string): string | null {
  const a = s.career.agenda;
  const o = a?.offers.find((x) => x.id === offerId);
  if (!a || !o || a.week !== s.week) return 'Esta actividad ya no está en tu agenda';
  if (a.used.includes(offerId)) return 'Ya la realizaste esta semana';
  if (o.cost > s.player.actionPoints) return `Requiere ${o.cost} PA`;
  if (o.funds > s.player.personalFunds) return `Requiere ${o.funds} MM$`;
  return null;
}

export function runAgenda(s: GameState, rng: Rng, offerId: string): string {
  const a = s.career.agenda!; const o = a.offers.find((x) => x.id === offerId)!;
  const d = BY_ID[o.defId];
  a.used.push(offerId);
  s.player.personalFunds = Math.max(0, s.player.personalFunds - o.funds);
  if (d.cooldown) s.career.cooldowns[`ag:${d.id}`] = s.week + d.cooldown;
  const msg = d.run ? d.run(s, rng, o.ctx) : genericRun(s, rng, d, o.ctx);
  return msg;
}

// ---------------------------------------------------------------------------
// Equipo y presencia digital: efectos semanales
// ---------------------------------------------------------------------------
export function weeklyTeamAndDigital(s: GameState): void {
  const c = P(s); if (!c) return;
  const t = s.career.team ?? [];
  for (const m of [...t]) {
    if (s.player.personalFunds < m.salary) {
      s.career.team = (s.career.team ?? []).filter((x) => x.id !== m.id);
      bio(s, 'decision', `${m.name} deja tu equipo`, 'No pudiste pagar sus honorarios.', -1);
      s.player.lastActionResults.push(`${m.name} deja tu equipo: no alcanzan los recursos para pagarle.`);
      continue;
    }
    s.player.personalFunds -= m.salary;
    const q = m.skill / 100;
    if (m.role === 'territorial') { s.career.capital.organization = clamp(s.career.capital.organization + 0.4 * q, 0, 100); addTerritory(s, [homeCut(s)], 0.25 * q); }
    if (m.role === 'tecnico') c.rep.prestigioTecnico = clamp(c.rep.prestigioTecnico + 0.08 * q, 0, 100);
    if (m.role === 'digital') s.career.capital.digital = clamp((s.career.capital.digital ?? 0) + 0.4 * q, 0, 100);
    if (m.role === 'prensa') c.rep.reconocimiento = clamp(c.rep.reconocimiento + 0.05 * q, 0, 100);
    if (m.role === 'finanzas') s.player.personalFunds += 0.9 + 1.2 * q + c.rep.reconocimiento * 0.01;
  }
  // La presencia digital da reconocimiento y llega a los jóvenes, y se desgasta si no se alimenta
  const dg = s.career.capital.digital ?? 0;
  c.rep.reconocimiento = clamp(c.rep.reconocimiento + dg * 0.0015, 0, 100);
  c.rep.confianzaGrupos.jovenes = clamp(c.rep.confianzaGrupos.jovenes + dg * 0.002, -100, 100);
  s.career.capital.digital = Math.max(0, dg * 0.985);
}

export function fireMember(s: GameState, memberId: string): string {
  const m = (s.career.team ?? []).find((x) => x.id === memberId);
  if (!m) return 'No está en tu equipo.';
  s.career.team = (s.career.team ?? []).filter((x) => x.id !== memberId);
  bio(s, 'decision', `Prescindes de ${m.name}`, ROLE_INFO[m.role].label, 0);
  return `${m.name} deja tu equipo.`;
}

