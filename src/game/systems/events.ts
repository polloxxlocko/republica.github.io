/**
 * MOTOR DE EVENTOS EMERGENTES.
 * Cada evento tiene: id, categoría, condiciones (check → probabilidad), período de enfriamiento,
 * máximo de ocurrencias, participantes (contexto), opciones y consecuencias inmediatas/diferidas.
 * Solo se dispara un evento con decisión del jugador por semana, y como máximo 2 eventos en total.
 */
import type { Character, Crisis, GameState, PendingDecision, RegionId } from '../models/types';
import { Rng } from '../engine/rng';
import { DIFFICULTY, DIMS, DIM_LABELS, clamp } from '../rules/params';
import { REGIONS, REGION_BY_ID } from '../data/geography';
import { MINISTRIES, MINISTRY_BY_ID } from '../data/institutions';
import { addShock } from './economy';
import { addNews } from './news';
import { addHistory, addRelation, newId } from './util';
import { createCharacter, fullName, remember, removeOffice } from './characters';
import { members } from './parliament';
import { appointMinister, coalitionMembers } from './government';
import { formCoalition, joinCoalition } from './coalitions';
import { listIdOf } from './elections';
import { leaveParty } from './parties';
import { monthOf } from '../engine/dates';

type Ctx = Record<string, string | number>;
interface Option { id: string; label: string; hint: string }
export interface EventDef {
  id: string;
  category: Crisis['kind'] | 'politico' | 'jugador' | 'positivo';
  cooldown: number;
  maxTimes?: number;
  negative: boolean;
  check: (s: GameState, rng: Rng) => { p: number; ctx: Ctx } | null;
  auto?: (s: GameState, rng: Rng, ctx: Ctx) => void;
  decision?: (s: GameState, ctx: Ctx) => { title: string; description: string; options: Option[] };
  resolve?: (s: GameState, rng: Rng, ctx: Ctx, option: string) => string;
  defaultOption?: string;
}

const player = (s: GameState): Character => s.characters[s.player.characterId];
const isPresident = (s: GameState) => s.government.presidentId === s.player.characterId;
const playerLeads = (s: GameState) => { const p = player(s); return !!p.partyId && s.parties[p.partyId]?.leaderId === p.id; };
const isLegislator = (c: Character) => c.offices.some((o) => o.type === 'diputado' || o.type === 'senador');
const month = (s: GameState) => monthOf(s.startDate, s.week);

function startCrisis(s: GameState, kind: Crisis['kind'], name: string, cause: string, weeks: number, severity: number, regionId?: RegionId): Crisis {
  const c: Crisis = { id: newId(s, 'x'), kind, name, cause, startWeek: s.week, weeksLeft: weeks, severity, regionId };
  s.crises.push(c);
  addHistory(s, 'crisis', name, cause, severity > 60 ? 4 : 3);
  return c;
}

function defer(s: GameState, weeks: number, kind: string, payload: Ctx, source: string): void {
  s.deferred.push({ id: newId(s, 'd'), week: s.week + weeks, kind, payload, source });
}

const pickRegion = (rng: Rng, ids: RegionId[]) => rng.pick(ids);

export const EVENTS: EventDef[] = [
  // ------------------------------------------------------------ crisis ambientales / naturales
  {
    id: 'incendio_forestal', category: 'ambiental', cooldown: 30, negative: true,
    check: (s, rng) => { const m = month(s); return m === 12 || m <= 3 ? { p: 0.035, ctx: { region: pickRegion(rng, ['VA', 'OH', 'ML', 'NB', 'BI', 'AR']) } } : null; },
    auto: (s, rng, ctx) => {
      const r = ctx.region as RegionId;
      startCrisis(s, 'ambiental', `Incendios forestales en ${REGION_BY_ID[r].shortName}`, 'Ola de calor y vientos', 6, 55, r);
      s.regions[r].discontent = clamp(s.regions[r].discontent + 10, 0, 100);
      s.economy.fiscalImpulse += 0.05;
      addNews(s, rng, 'crisis', `Incendios forestales afectan a ${REGION_BY_ID[r].name}`, 'El gobierno decreta alerta roja y despliega recursos de emergencia.', 4);
    },
  },
  {
    id: 'terremoto', category: 'ambiental', cooldown: 300, maxTimes: 2, negative: true,
    check: (_s, rng) => ({ p: 0.0018, ctx: { region: pickRegion(rng, ['CO', 'VA', 'RM', 'OH', 'ML', 'BI', 'TA', 'AN']) } }),
    decision: (s, ctx) => isPresident(s) ? ({ title: `Terremoto en ${REGION_BY_ID[ctx.region as RegionId].name}`, description: 'Un sismo de gran magnitud causa daños en viviendas e infraestructura. Debes definir la respuesta del gobierno.', options: [
      { id: 'plan_reconstruccion', label: 'Plan de reconstrucción ambicioso', hint: '+0,4% PIB de gasto; fuerte apoyo regional; mayor déficit' },
      { id: 'respuesta_focalizada', label: 'Respuesta focalizada y ordenada', hint: 'Costo moderado; apoyo según capacidad de gestión' },
      { id: 'delegar_regiones', label: 'Delegar en gobiernos regionales', hint: 'Bajo costo fiscal; riesgo de descoordinación' },
    ] }) : { title: '', description: '', options: [] },
    auto: (s, rng, ctx) => applyQuake(s, rng, ctx, isPresident(s) ? null : 'respuesta_focalizada'),
    resolve: (s, rng, ctx, opt) => applyQuake(s, rng, ctx, opt),
    defaultOption: 'respuesta_focalizada',
  },
  {
    id: 'sequia', category: 'ambiental', cooldown: 80, negative: true,
    check: (_s, rng) => ({ p: 0.006, ctx: { region: pickRegion(rng, ['AT', 'CO', 'VA', 'OH', 'ML']) } }),
    auto: (s, rng, ctx) => {
      const r = ctx.region as RegionId;
      startCrisis(s, 'ambiental', `Megasequía en ${REGION_BY_ID[r].shortName}`, 'Déficit de precipitaciones prolongado', 26, 40, r);
      s.regions[r].discontent = clamp(s.regions[r].discontent + 8, 0, 100);
      s.opinion.areaSatisfaction.medioambiente = (s.opinion.areaSatisfaction.medioambiente ?? 0) - 6;
      addNews(s, rng, 'regiones', `Decretan zona de escasez hídrica en ${REGION_BY_ID[r].name}`, 'Agricultores reportan pérdidas.', 3);
    },
  },
  // ------------------------------------------------------------ economía internacional
  {
    id: 'shock_cobre', category: 'internacional', cooldown: 40, negative: false,
    check: (_s, rng) => ({ p: 0.012, ctx: { dir: rng.chance(0.5) ? -1 : 1 } }),
    auto: (s, rng, ctx) => {
      const dir = Number(ctx.dir);
      s.economy.copper = clamp(s.economy.copper * (1 + dir * 0.18), 1.8, 8);
      addShock(s, `cobre ${dir > 0 ? 'alza' : 'caída'}`, dir * 0.6, 0, 26);
      addNews(s, rng, 'economia', dir > 0 ? 'El cobre se dispara en los mercados internacionales' : 'Desplome del precio del cobre golpea las proyecciones', `El metal cotiza en ${s.economy.copper.toFixed(2)} USD/lb.`, 3, 0, dir > 0 ? 1 : -1);
    },
  },
  {
    id: 'crisis_financiera', category: 'economica', cooldown: 300, maxTimes: 2, negative: true,
    check: () => ({ p: 0.0025, ctx: {} }),
    auto: (s, rng) => {
      startCrisis(s, 'economica', 'Crisis financiera internacional', 'Contagio de mercados externos', 40, 65);
      addShock(s, 'crisis financiera global', -2.4, 0.4, 40);
      s.economy.businessConfidence = clamp(s.economy.businessConfidence - 12, 0, 100);
      s.economy.exchangeRate *= 1.08;
      addNews(s, rng, 'economia', 'Turbulencia financiera global se extiende a mercados emergentes', 'El Banco Central monitorea la liquidez del sistema.', 5, 0, -1);
    },
  },
  {
    id: 'boom_inversion', category: 'positivo', cooldown: 60, negative: false,
    check: (s) => s.economy.businessConfidence > 52 ? { p: 0.012, ctx: {} } : null,
    auto: (s, rng) => { addShock(s, 'boom de inversión', 0.8, 0.1, 30); addNews(s, rng, 'economia', 'Cartera de inversión alcanza niveles récord', 'Proyectos mineros y de energías limpias impulsan la actividad.', 3, 0, 1); },
  },
  {
    id: 'acuerdo_comercial', category: 'positivo', cooldown: 150, negative: false,
    check: () => ({ p: 0.005, ctx: {} }),
    auto: (s, rng) => { s.economy.potentialGrowth = clamp(s.economy.potentialGrowth + 0.05, 0, 5); addHistory(s, 'economia', 'Chile firma un nuevo acuerdo comercial', 'Amplía el acceso de exportaciones no tradicionales.', 2); addNews(s, rng, 'economia', 'Chile suscribe nuevo acuerdo comercial', 'Exportadores celebran el acceso a nuevos mercados.', 2, 0, 1); },
  },
  {
    id: 'logro_cientifico', category: 'positivo', cooldown: 120, negative: false,
    check: () => ({ p: 0.004, ctx: {} }),
    auto: (s, rng) => { s.opinion.structuralMood = clamp(s.opinion.structuralMood + 3, -100, 100); addNews(s, rng, 'regiones', 'Observatorio en el norte logra un hallazgo astronómico de alcance mundial', 'La comunidad científica nacional destaca el impacto.', 2, 0, 1); },
  },
  // ------------------------------------------------------------ sociales y seguridad
  {
    id: 'ola_delictual', category: 'social', cooldown: 20, negative: true,
    check: (s) => ({ p: 0.012 + Math.max(0, 40 - s.opinion.securityPerception) * 0.0005, ctx: {} }),
    auto: (s, rng) => { s.opinion.securityPerception = clamp(s.opinion.securityPerception - 6, 0, 100); addNews(s, rng, 'crisis', 'Seguidilla de delitos violentos conmociona al país', 'Alcaldes exigen más recursos para seguridad.', 3, 1, -1); },
  },
  {
    id: 'protesta_social', category: 'social', cooldown: 52, negative: true,
    check: (s) => (s.opinion.presidentialApproval < 30 || s.economy.poverty > 9 || s.economy.unemployment > 10.5) ? { p: 0.02, ctx: {} } : null,
    decision: (s) => isPresident(s) ? ({ title: 'Movilizaciones masivas en las principales ciudades', description: 'Organizaciones sociales convocan a marchas por el costo de la vida y las pensiones. ¿Cómo responde el gobierno?', options: [
      { id: 'agenda_social', label: 'Anunciar agenda social de emergencia', hint: '+0,3% PIB gasto; mejora aprobación; empresarios molestos' },
      { id: 'dialogo', label: 'Mesa de diálogo nacional', hint: 'Costo bajo; efecto depende de tu capacidad de negociación' },
      { id: 'orden_publico', label: 'Priorizar el orden público', hint: 'Sube percepción de orden en algunos; riesgo de escalada' },
    ] }) : { title: '', description: '', options: [] },
    auto: (s, rng) => resolveProtest(s, rng, 'dialogo'),
    resolve: (s, rng, _ctx, opt) => resolveProtest(s, rng, opt),
    defaultOption: 'dialogo',
  },
  {
    id: 'crisis_sanitaria', category: 'sanitaria', cooldown: 400, maxTimes: 1, negative: true,
    check: () => ({ p: 0.0012, ctx: {} }),
    auto: (s, rng) => { startCrisis(s, 'sanitaria', 'Brote epidémico de nuevo virus respiratorio', 'Contagio importado', 30, 70); addShock(s, 'crisis sanitaria', -2.8, 0.5, 30); addNews(s, rng, 'crisis', 'Autoridad sanitaria decreta alerta por brote respiratorio', 'Se suspenden actividades masivas.', 5, 0, -1); },
  },
  // ------------------------------------------------------------ política
  {
    id: 'caso_corrupcion', category: 'politico', cooldown: 10, negative: true,
    check: (s, rng) => {
      const ps = Object.values(s.parties).filter((p) => p.active && p.legalStatus !== 'en_formacion');
      if (!ps.length) return null;
      const p = rng.weighted(ps, ps.map((x) => (100 - x.credibility) + 20));
      return { p: 0.02, ctx: { party: p.id } };
    },
    decision: (s, ctx) => playerLeads(s) && player(s).partyId === ctx.party ? ({ title: `Investigación por financiamiento irregular en ${s.parties[ctx.party as string].short}`, description: 'La fiscalía investiga a un dirigente de tu partido por facturas irregulares. Como presidente del partido, debes fijar la posición.', options: [
      { id: 'expulsar', label: 'Suspender su militancia de inmediato', hint: 'Credibilidad +; facción del dirigente molesta' },
      { id: 'respaldar', label: 'Respaldar la presunción de inocencia', hint: 'Cohesión +; credibilidad pública −' },
      { id: 'comision', label: 'Crear comisión de ética interna', hint: 'Efecto moderado y diferido' },
    ] }) : { title: '', description: '', options: [] },
    auto: (s, rng, ctx) => scandalAuto(s, rng, ctx.party as string, 'auto'),
    resolve: (s, rng, ctx, opt) => scandalAuto(s, rng, ctx.party as string, opt),
    defaultOption: 'comision',
  },
  {
    id: 'cambio_bancada', category: 'politico', cooldown: 8, negative: false,
    check: (s, rng) => {
      const leg = [...members(s, 'camara'), ...members(s, 'senado')].filter((c) => !c.isPlayer && c.partyId && s.parties[c.partyId]);
      const unhappy = leg.filter((c) => { const f = s.parties[c.partyId!].factions.find((x) => x.id === c.factionId); return (f?.discontent ?? 0) > 60; });
      if (!unhappy.length) return null;
      const c = rng.pick(unhappy);
      return { p: 0.025, ctx: { char: c.id, party: c.partyId! } };
    },
    decision: (s, ctx) => playerLeads(s) && player(s).partyId === ctx.party ? ({ title: `${fullName(s.characters[ctx.char as string])} amenaza con renunciar al partido`, description: 'El parlamentario reclama que la directiva ignora a su sector. Su salida reduciría la bancada.', options: [
      { id: 'conceder', label: 'Conceder espacios a su sector', hint: 'Lo retienes; la facción gana influencia y el partido se desplaza' },
      { id: 'disciplinar', label: 'Exigir disciplina', hint: '50% de que renuncie; disciplina +' },
      { id: 'dejar_ir', label: 'Dejarlo ir', hint: 'Pierdes un escaño; cohesión +' },
    ] }) : { title: '', description: '', options: [] },
    auto: (s, rng, ctx) => defection(s, rng, ctx, rng.chance(0.5) ? 'dejar_ir' : 'conceder'),
    resolve: (s, rng, ctx, opt) => defection(s, rng, ctx, opt),
    defaultOption: 'disciplinar',
  },
  {
    id: 'figura_emergente', category: 'politico', cooldown: 40, negative: false,
    check: (s, rng) => { const ps = Object.values(s.parties).filter((p) => p.active); return ps.length ? { p: 0.012, ctx: { party: rng.pick(ps).id } } : null; },
    auto: (s, rng, ctx) => {
      const p = s.parties[ctx.party as string];
      const c = createCharacter(s, rng, { partyId: p.id, regionId: rng.pick(REGIONS).id, ideology: p.ideology, quality: 70, minAge: 29, maxAge: 45, personality: rng.pick(['mediatico', 'ambicioso', 'territorial']), recognition: 48 });
      c.rep.popularidad = 62; c.ambitionTarget = 'presidente';
      addNews(s, rng, 'partidos', `${fullName(c)}, la nueva figura que crece en ${p.short}`, 'Su presencia en redes y medios la convierte en una carta presidencial a futuro.', 2);
      const pl = player(s);
      if (pl.partyId === p.id) remember(c, { week: s.week, aboutId: pl.id, kind: 'conflicto', weight: -5, note: 'Rivalidad generacional' });
    },
  },
  // ------------------------------------------------------------ decisiones del jugador
  {
    id: 'entrevista_polemica', category: 'jugador', cooldown: 14, negative: false,
    check: (s, rng) => player(s).rep.reconocimiento > 25 && player(s).partyId ? { p: 0.05, ctx: { dim: rng.pick(DIMS) } } : null,
    decision: (_s, ctx) => {
      const d = DIM_LABELS[ctx.dim as keyof typeof DIM_LABELS];
      return { title: 'Pregunta incómoda en entrevista radial', description: `Un periodista te pregunta directamente sobre ${d.name.toLowerCase()} (${d.neg} vs. ${d.pos}), un tema que divide a tu partido.`, options: [
        { id: 'linea', label: 'Defender la línea oficial del partido', hint: 'Confianza del partido +; credibilidad neutra' },
        { id: 'propia', label: 'Dar tu opinión personal y matizada', hint: 'Popularidad +; confianza partidaria −' },
        { id: 'evadir', label: 'Evadir la pregunta', hint: 'Credibilidad −' },
      ] };
    },
    resolve: (s, _rng, _ctx, opt) => {
      const c = player(s);
      if (opt === 'linea') { c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + 5, 0, 100); c.rep.popularidad = clamp(c.rep.popularidad - 1, 0, 100); return 'Tu partido valora tu lealtad.'; }
      if (opt === 'propia') { c.rep.popularidad = clamp(c.rep.popularidad + 3 + (c.attrs.comunicacion - 50) / 20, 0, 100); c.rep.confianzaPartido = clamp(c.rep.confianzaPartido - 6, 0, 100); c.rep.reconocimiento = clamp(c.rep.reconocimiento + 3, 0, 100); return 'Tu respuesta se viraliza; la directiva no quedó contenta.'; }
      c.rep.credibilidad = clamp(c.rep.credibilidad - 4, 0, 100); return 'La evasiva es criticada en redes.';
    },
    defaultOption: 'evadir',
  },
  {
    id: 'invitacion_debate', category: 'jugador', cooldown: 4, negative: false,
    check: (s) => s.player.campaign && s.player.campaign.debates < 3 ? { p: 0.25, ctx: {} } : null,
    decision: () => ({ title: 'Invitación a debate televisado', description: 'Un canal te invita a un debate con los demás candidatos de tu territorio.', options: [
      { id: 'aceptar', label: 'Aceptar el debate', hint: 'Resultado depende de oratoria y conocimiento técnico' },
      { id: 'rechazar', label: 'Rechazar', hint: 'Evitas riesgos, pero pierdes visibilidad' },
    ] }),
    resolve: (s, rng, _ctx, opt) => {
      const c = player(s); const camp = s.player.campaign;
      if (!camp) return 'La campaña ya terminó.';
      if (opt === 'rechazar') { c.rep.credibilidad = clamp(c.rep.credibilidad - 2, 0, 100); return 'Tu ausencia fue comentada por los rivales.'; }
      camp.debates += 1;
      const perf = (c.attrs.oratoria * 0.5 + c.attrs.tecnico * 0.3 + c.attrs.carisma * 0.2) / 100 + rng.normal(0, 0.15);
      if (perf > 0.62) { camp.intensity = clamp(camp.intensity + 12, 0, 100); c.rep.popularidad = clamp(c.rep.popularidad + 4, 0, 100); c.rep.reconocimiento = clamp(c.rep.reconocimiento + 5, 0, 100); return '¡Ganaste el debate según los analistas!'; }
      if (perf > 0.45) { camp.intensity = clamp(camp.intensity + 4, 0, 100); c.rep.reconocimiento = clamp(c.rep.reconocimiento + 3, 0, 100); return 'Debate parejo: ganaste visibilidad.'; }
      c.rep.popularidad = clamp(c.rep.popularidad - 3, 0, 100); camp.intensity = clamp(camp.intensity - 4, 0, 100); return 'Un error en el debate se volvió tendencia.';
    },
    defaultOption: 'rechazar',
  },
  {
    id: 'oferta_ministerio', category: 'jugador', cooldown: 52, negative: false,
    // Reemplazado por la reorganización de gabinete con competencia real (career/latent.ts)
    check: (s) => {
      const c = player(s);
      if (s.career) return null;
      if (isPresident(s) || !c.partyId || !coalitionMembers(s).includes(c.partyId) || c.offices.some((o) => o.type === 'ministro' || o.type === 'presidente_partido')) return null;
      if (c.rep.prestigioTecnico < 45 && c.rep.reconocimiento < 40) return null;
      const m = MINISTRIES.find((x) => x.area === c.specialty) ?? MINISTRIES[7];
      return { p: 0.02, ctx: { ministry: m.id } };
    },
    decision: (s, ctx) => ({ title: `El Presidente te ofrece el Ministerio de ${MINISTRY_BY_ID[ctx.ministry as string].name}`, description: `Asumir implica dejar tu cargo actual${isLegislator(player(s)) ? ' (los parlamentarios cesan en su escaño al ser nombrados ministros)' : ''}. Ganarías visibilidad y experiencia de gestión, pero quedarías atado al desempeño del gobierno.`, options: [
      { id: 'aceptar', label: 'Aceptar', hint: 'Entras al gabinete' },
      { id: 'rechazar', label: 'Rechazar con cortesía', hint: 'Relación con el Presidente −' },
    ] }),
    resolve: (s, rng, ctx, opt) => {
      if (opt === 'aceptar') { const msg = appointMinister(s, rng, ctx.ministry as string, s.player.characterId); addHistory(s, 'jugador', 'Asumes como ministro/a', msg, 5); return msg; }
      const pres = s.characters[s.government.presidentId]; if (pres) remember(pres, { week: s.week, aboutId: s.player.characterId, kind: 'conflicto', weight: -5, note: 'Rechazó ministerio' });
      return 'Declinaste el ofrecimiento.';
    },
    defaultOption: 'rechazar',
  },
  {
    id: 'propuesta_alianza', category: 'jugador', cooldown: 30, negative: false,
    check: (s, rng) => {
      if (!playerLeads(s)) return null;
      const mine = player(s).partyId!;
      const others = Object.values(s.parties).filter((p) => p.active && p.id !== mine && p.legalStatus !== 'en_formacion' && listIdOf(s, p.id) === p.id);
      if (!others.length) return null;
      return { p: 0.03, ctx: { party: rng.pick(others).id } };
    },
    decision: (s, ctx) => ({ title: `${s.parties[ctx.party as string].name} propone una alianza`, description: 'Su directiva ofrece coordinar listas parlamentarias y un programa común mínimo.', options: [
      { id: 'aceptar', label: 'Aceptar la alianza', hint: 'Suma votos a tu lista; posibles tensiones ideológicas' },
      { id: 'rechazar', label: 'Rechazar', hint: 'Relación entre partidos −' },
    ] }),
    resolve: (s, rng, ctx, opt) => {
      const mine = player(s).partyId!; const other = ctx.party as string;
      if (opt === 'rechazar') { addRelation(s, mine, other, -10); return 'Rechazaste la propuesta.'; }
      const myList = listIdOf(s, mine);
      if (s.coalitions[myList]) { joinCoalition(s, rng, other, myList); return `${s.parties[other].short} se suma a ${s.coalitions[myList].name}.`; }
      const c = formCoalition(s, `Pacto ${s.parties[mine].short}–${s.parties[other].short}`, [mine, other], mine);
      addHistory(s, 'coalicion', `Nace ${c.name}`, 'Acuerdo impulsado por la directiva del jugador.', 3);
      return `Formaste ${c.name}.`;
    },
    defaultOption: 'rechazar',
  },
  {
    id: 'region_exige', category: 'jugador', cooldown: 26, negative: false,
    check: (s) => {
      const c = player(s);
      const hot = REGIONS.filter((r) => s.regions[r.id].discontent > 52).map((r) => r.id);
      if (!hot.length) return null;
      const r = isPresident(s) ? hot[0] : hot.includes(c.regionId) && c.offices.some((o) => ['diputado', 'senador', 'gobernador', 'alcalde'].includes(o.type)) ? c.regionId : null;
      return r ? { p: 0.04, ctx: { region: r } } : null;
    },
    decision: (s, ctx) => ({ title: `${REGION_BY_ID[ctx.region as RegionId].name} exige más inversión`, description: 'Gremios, alcaldes y organizaciones sociales de la región reclaman abandono del nivel central.', options: [
      { id: 'comprometer', label: isPresident(s) ? 'Comprometer un plan de inversión regional' : 'Gestionar recursos y encabezar la demanda', hint: isPresident(s) ? '+0,05% PIB; descontento regional −' : 'Reconocimiento regional +; usa recursos' },
      { id: 'prometer', label: 'Prometer estudiar la demanda', hint: 'Alivio inmediato; si no cumples en 6 meses, credibilidad −' },
      { id: 'rechazar', label: 'Explicar que no hay recursos', hint: 'Popularidad regional −' },
    ] }),
    resolve: (s, _rng, ctx, opt) => {
      const r = ctx.region as RegionId; const reg = s.regions[r]; const c = player(s);
      if (opt === 'comprometer') {
        if (isPresident(s)) { s.economy.fiscalImpulse += 0.05; s.economy.spending += 0.03; }
        else s.player.personalFunds = Math.max(0, s.player.personalFunds - 10);
        reg.investment += 8; reg.discontent = clamp(reg.discontent - 12, 0, 100);
        c.rep.reconocimientoRegional[r] = clamp((c.rep.reconocimientoRegional[r] ?? 0) + 8, 0, 100);
        return 'La región valora el compromiso.';
      }
      if (opt === 'prometer') { reg.discontent = clamp(reg.discontent - 5, 0, 100); defer(s, 26, 'promesa_region', { region: r }, 'region_exige'); return 'Ganaste tiempo, pero la región recordará la promesa.'; }
      reg.discontent = clamp(reg.discontent + 5, 0, 100); c.rep.reconocimientoRegional[r] = clamp((c.rep.reconocimientoRegional[r] ?? 0) - 5, 0, 100); return 'La respuesta cae mal en la región.';
    },
    defaultOption: 'prometer',
  },
  {
    id: 'gremio_pide', category: 'jugador', cooldown: 30, negative: false,
    check: (s) => isLegislator(player(s)) || isPresident(s) ? { p: 0.02, ctx: {} } : null,
    decision: () => ({ title: 'Un gremio empresarial pide tu apoyo', description: 'La principal asociación gremial pide respaldar una agenda pro inversión que las centrales sindicales rechazan.', options: [
      { id: 'apoyar', label: 'Apoyar la agenda gremial', hint: 'Empresarios +, sindicatos −, aporte de campaña legal' },
      { id: 'rechazar', label: 'Mantener distancia', hint: 'Sindicatos +, empresarios −' },
    ] }),
    resolve: (s, _rng, _ctx, opt) => {
      const c = player(s); const g = c.rep.confianzaGrupos;
      if (opt === 'apoyar') { g.empresarios = clamp(g.empresarios + 15, -100, 100); g.sindicatos = clamp(g.sindicatos - 12, -100, 100); s.player.personalFunds += 15; return 'El gremio te agradece públicamente.'; }
      g.empresarios = clamp(g.empresarios - 10, -100, 100); g.sindicatos = clamp(g.sindicatos + 10, -100, 100); return 'Las centrales sindicales valoran tu postura.';
    },
    defaultOption: 'rechazar',
  },
  {
    id: 'ministro_cuestionado', category: 'jugador', cooldown: 12, negative: true,
    check: (s) => {
      if (!isPresident(s)) return null;
      const post = s.government.cabinet.find((p) => p.ministerId && (s.characters[p.ministerId]?.scandal ?? 0) > 35);
      return post ? { p: 0.3, ctx: { ministry: post.ministryId, char: post.ministerId! } } : null;
    },
    decision: (s, ctx) => ({ title: `Cuestionamientos a tu ministro/a de ${MINISTRY_BY_ID[ctx.ministry as string].name}`, description: `${fullName(s.characters[ctx.char as string])} enfrenta acusaciones en la prensa. La oposición amenaza con una acusación constitucional.`, options: [
      { id: 'respaldar', label: 'Respaldar públicamente', hint: 'Lealtad del partido del ministro +; aprobación −' },
      { id: 'renuncia', label: 'Pedir la renuncia', hint: 'Aprobación +; partido del ministro molesto' },
      { id: 'sumario', label: 'Ordenar un sumario administrativo', hint: 'Decisión diferida 8 semanas' },
    ] }),
    resolve: (s, rng, ctx, opt) => {
      const c = s.characters[ctx.char as string]; const presParty = player(s).partyId;
      if (!c) return 'El ministro ya no está en el cargo.';
      if (opt === 'respaldar') { s.opinion.presidentialApproval = clamp(s.opinion.presidentialApproval - 2.5, 0, 100); if (c.partyId && presParty) addRelation(s, c.partyId, presParty, 6); return 'Respaldaste al ministro; la oposición endurece su tono.'; }
      if (opt === 'renuncia') { const post = s.government.cabinet.find((p) => p.ministerId === c.id); if (post) { post.ministerId = null; removeOffice(s, c, 'ministro', 'renuncia'); } s.opinion.presidentialApproval = clamp(s.opinion.presidentialApproval + 1.5, 0, 100); if (c.partyId && presParty) addRelation(s, c.partyId, presParty, -10); addNews(s, rng, 'gobierno', `Renuncia ${fullName(c)}`, 'La Presidencia pidió su salida.', 3); return 'Aceptaste la renuncia. Nombra un reemplazo en la pantalla de Gobierno.'; }
      defer(s, 8, 'sumario', { char: c.id }, 'ministro_cuestionado'); return 'El sumario tomará algunas semanas.';
    },
    defaultOption: 'sumario',
  },
  {
    id: 'huelga_nacional', category: 'jugador', cooldown: 52, negative: true,
    check: (s) => isPresident(s) && (s.economy.unemployment > 9 || s.economy.inflation > 5) ? { p: 0.03, ctx: {} } : null,
    decision: () => ({ title: 'Paro nacional convocado por las centrales sindicales', description: 'Exigen reajuste del salario mínimo y medidas contra el costo de la vida.', options: [
      { id: 'negociar', label: 'Negociar un reajuste extraordinario', hint: '+0,1% PIB; aprobación +; inflación leve' },
      { id: 'mano_dura', label: 'Rechazar presiones', hint: 'Empresarios +; riesgo de escalada' },
      { id: 'mediacion', label: 'Mediación del Ministerio del Trabajo', hint: 'Resultado depende del ministro' },
    ] }),
    resolve: (s, rng, _ctx, opt) => {
      if (opt === 'negociar') { s.economy.fiscalImpulse += 0.1; addShock(s, 'reajuste extraordinario', 0.1, 0.3, 26); s.opinion.presidentialApproval += 2; return 'Se alcanza un acuerdo con las centrales.'; }
      if (opt === 'mano_dura') { if (rng.chance(0.4)) { startCrisis(s, 'social', 'Escalada de movilizaciones sindicales', 'Rechazo del gobierno a negociar', 6, 45); s.opinion.presidentialApproval -= 3; return 'El conflicto escala.'; } return 'El paro pierde fuerza.'; }
      const comp = s.characters[s.government.cabinet.find((p) => p.ministryId === 'trabajo')?.ministerId ?? '']?.attrs.negociacion ?? 50;
      if (rng.chance(comp / 100)) { s.opinion.presidentialApproval += 1; return 'La mediación logra un acuerdo razonable.'; }
      s.opinion.presidentialApproval -= 1.5; return 'La mediación fracasa.';
    },
    defaultOption: 'mediacion',
  },
  {
    id: 'escandalo_financiamiento', category: 'jugador', cooldown: 40, negative: true,
    check: (s) => player(s).scandal > 15 ? { p: 0.04 + player(s).scandal * 0.002, ctx: {} } : null,
    decision: () => ({ title: 'Reportaje sobre aportes a tu campaña', description: 'Un medio digital revela aportes de origen poco claro recaudados por tu equipo.', options: [
      { id: 'transparentar', label: 'Transparentar todo y devolver aportes', hint: 'Recursos −; credibilidad se recupera' },
      { id: 'negar', label: 'Negar las acusaciones', hint: 'Riesgo alto si hay más antecedentes' },
      { id: 'asesor', label: 'Culpar a un asesor', hint: 'Integridad percibida −; relaciones internas −' },
    ] }),
    resolve: (s, rng, _ctx, opt) => {
      const c = player(s);
      if (opt === 'transparentar') { s.player.personalFunds = Math.max(0, s.player.personalFunds - 20); c.scandal = Math.max(0, c.scandal - 25); c.rep.credibilidad = clamp(c.rep.credibilidad + 3, 0, 100); return 'Tu transparencia es reconocida.'; }
      if (opt === 'negar') { if (rng.chance(c.scandal / 80)) { c.rep.credibilidad -= 12; c.rep.popularidad -= 8; c.scandal += 20; addNews(s, rng, 'jugador', `Nuevos antecedentes complican a ${fullName(c)}`, 'Documentos contradicen su versión.', 4, 0, -1); return 'Aparecen nuevos antecedentes. Tu credibilidad se desploma.'; } return 'La polémica se diluye.'; }
      c.rep.credibilidad -= 4; c.attrs.integridad = clamp(c.attrs.integridad - 3, 0, 100); c.scandal = Math.max(0, c.scandal - 10); return 'La explicación convence a pocos.';
    },
    defaultOption: 'negar',
  },
];

function applyQuake(s: GameState, rng: Rng, ctx: Ctx, opt: string | null): string {
  const r = ctx.region as RegionId;
  if (!s.crises.some((c) => c.name.startsWith('Terremoto') && c.startWeek === s.week)) {
    startCrisis(s, 'ambiental', `Terremoto en ${REGION_BY_ID[r].shortName}`, 'Sismo de gran magnitud', 20, 80, r);
    addShock(s, 'terremoto', -1.4, 0.3, 26);
    s.regions[r].infrastructure = clamp(s.regions[r].infrastructure - 12, 0, 100);
    addNews(s, rng, 'crisis', `Terremoto sacude ${REGION_BY_ID[r].name}`, 'Se evalúan daños en viviendas e infraestructura crítica.', 5, 0, -1);
  }
  if (!opt) return '';
  if (opt === 'plan_reconstruccion') { s.economy.fiscalImpulse += 0.4; s.economy.spending += 0.2; defer(s, 30, 'reconstruccion', { region: r, size: 10 }, 'terremoto'); s.opinion.presidentialApproval += 4; return 'Lanzas un plan de reconstrucción ambicioso.'; }
  if (opt === 'respuesta_focalizada') { s.economy.fiscalImpulse += 0.15; defer(s, 30, 'reconstruccion', { region: r, size: 5 }, 'terremoto'); s.opinion.presidentialApproval += 1.5; return 'Se implementa una respuesta focalizada.'; }
  s.regions[r].discontent += 8; defer(s, 30, 'reconstruccion', { region: r, size: 2 }, 'terremoto'); return 'Los gobiernos regionales lideran la emergencia con recursos limitados.';
}

function resolveProtest(s: GameState, rng: Rng, opt: string): string {
  startCrisis(s, 'social', 'Movilizaciones sociales masivas', 'Malestar por costo de vida y pensiones', 8, 55);
  s.opinion.presidentialApproval -= 3;
  addNews(s, rng, 'crisis', 'Miles marchan en las principales ciudades', 'Las organizaciones convocantes anuncian nuevas jornadas.', 4, -1, 0);
  if (opt === 'agenda_social') { s.economy.fiscalImpulse += 0.3; s.economy.spending += 0.15; s.opinion.presidentialApproval += 4; s.economy.businessConfidence -= 3; return 'Anuncias una agenda social; las marchas pierden fuerza.'; }
  if (opt === 'orden_publico') { s.opinion.securityPerception += 2; if (rng.chance(0.45)) { s.opinion.presidentialApproval -= 4; return 'Incidentes en las marchas agravan la crisis.'; } return 'Se restablece la normalidad en las calles.'; }
  const neg = s.characters[s.government.presidentId]?.attrs.negociacion ?? 50;
  s.opinion.presidentialApproval += neg > 60 ? 2 : 0;
  return neg > 60 ? 'La mesa de diálogo logra acuerdos iniciales.' : 'El diálogo avanza lentamente.';
}

function scandalAuto(s: GameState, rng: Rng, partyId: string, opt: string): string {
  const p = s.parties[partyId];
  if (!p) return '';
  // Nunca se atribuyen investigaciones ni irregularidades a personas reales (solo a personajes ficticios)
  const leg = [...members(s, 'camara'), ...members(s, 'senado')].filter((c) => c.partyId === partyId && !c.isPlayer && !c.realId);
  const target = leg.length ? rng.pick(leg) : null;
  if (target) target.scandal = clamp(target.scandal + 40, 0, 100);
  p.credibility = clamp(p.credibility - 10, 0, 100); p.popularity = clamp(p.popularity - 3, 0, 100); p.rejection = clamp(p.rejection + 3, 0, 100);
  addNews(s, rng, 'partidos', `Fiscalía investiga financiamiento irregular en ${p.short}`, target ? `Uno de los involucrados sería ${fullName(target)}.` : 'La directiva niega irregularidades.', 3, 0, -1);
  addHistory(s, 'partido', `Escándalo de financiamiento en ${p.short}`, '', 2);
  if (opt === 'expulsar') { p.credibility += 6; if (target) { const f = p.factions.find((x) => x.id === target.factionId); if (f) f.discontent += 15; target.partyId = null; } return 'Suspendiste al dirigente; la ciudadanía valora la señal.'; }
  if (opt === 'respaldar') { p.cohesion += 5; p.credibility -= 5; return 'El partido cierra filas, pero la prensa es dura.'; }
  if (opt === 'comision') { defer(s, 6, 'comision_etica', { party: partyId }, 'caso_corrupcion'); return 'La comisión de ética entregará su informe en semanas.'; }
  return '';
}

function defection(s: GameState, rng: Rng, ctx: Ctx, opt: string): string {
  const c = s.characters[ctx.char as string]; const p = s.parties[ctx.party as string];
  if (!c || !p || c.partyId !== p.id) return 'La situación ya no es vigente.';
  const f = p.factions.find((x) => x.id === c.factionId);
  if (opt === 'conceder') { if (f) { f.influence += 8; f.discontent -= 20; for (const d of DIMS) p.ideology[d] += (f.ideology[d] - p.ideology[d]) * 0.08; } return 'Retienes al parlamentario; su sector gana influencia.'; }
  if (opt === 'disciplinar') { p.discipline = clamp(p.discipline + 5, 0, 100); if (rng.chance(0.5)) { leaveParty(s, rng, c); return `${fullName(c)} renuncia al partido.`; } return 'El parlamentario se alinea, por ahora.'; }
  leaveParty(s, rng, c); p.cohesion = clamp(p.cohesion + 4, 0, 100);
  return `${fullName(c)} deja el partido.`;
}

// ---------------------------------------------------------------------------
// Procesamiento semanal
// ---------------------------------------------------------------------------
export function processEvents(s: GameState, rng: Rng): string[] {
  const out: string[] = [];
  const pressure = DIFFICULTY[s.settings.difficulty].eventPressure;
  let fired = 0; let decisions = s.pending.length;
  const order = rng.shuffle([...EVENTS]);
  for (const ev of order) {
    if (fired >= 2) break;
    if ((s.eventCooldowns[ev.id] ?? 0) > s.week) continue;
    if (ev.maxTimes !== undefined && (s.eventCounts[ev.id] ?? 0) >= ev.maxTimes) continue;
    const r = ev.check(s, rng);
    if (!r) continue;
    const p = r.p * (ev.negative ? pressure : 1);
    if (!rng.chance(p)) continue;
    const dec = ev.decision?.(s, r.ctx);
    if (dec && dec.options.length && !s.player.careerOver) {
      if (decisions >= 2) continue;
      const pd: PendingDecision = { id: newId(s, 'e'), eventId: ev.id, week: s.week, title: dec.title, description: dec.description, options: dec.options, context: r.ctx, expiresWeek: s.week + 3 };
      // efecto inmediato del evento natural (si aplica) antes de la decisión
      if (ev.id === 'terremoto') applyQuake(s, rng, r.ctx, null);
      s.pending.push(pd); decisions++; out.push(pd.id);
    } else if (ev.auto) ev.auto(s, rng, r.ctx);
    else continue;
    s.eventCooldowns[ev.id] = s.week + ev.cooldown;
    s.eventCounts[ev.id] = (s.eventCounts[ev.id] ?? 0) + 1;
    fired++;
  }
  // decisiones vencidas → opción por defecto
  for (const pd of [...s.pending]) if (s.week > pd.expiresWeek) {
    const ev = EVENTS.find((e) => e.id === pd.eventId);
    resolveDecision(s, rng, pd.id, ev?.defaultOption ?? pd.options[0].id, true);
  }
  // crisis vigentes
  for (const c of s.crises) { c.weeksLeft -= 1; c.severity = Math.max(0, c.severity - 0.5); }
  const ended = s.crises.filter((c) => c.weeksLeft <= 0);
  s.crises = s.crises.filter((c) => c.weeksLeft > 0);
  for (const c of ended) addHistory(s, 'crisis', `Termina: ${c.name}`, c.response ?? '', 1);
  processDeferred(s, rng);
  return out;
}

export function resolveDecision(s: GameState, rng: Rng, decisionId: string, optionId: string, expired = false): string {
  const pd = s.pending.find((p) => p.id === decisionId);
  if (!pd) return 'Decisión inexistente';
  const ev = EVENTS.find((e) => e.id === pd.eventId);
  s.pending = s.pending.filter((p) => p.id !== decisionId);
  if (!ev?.resolve) return '';
  const msg = ev.resolve(s, rng, pd.context, optionId);
  const opt = pd.options.find((o) => o.id === optionId);
  addHistory(s, 'jugador', `${pd.title}`, `${expired ? 'Sin respuesta a tiempo: ' : ''}${opt?.label ?? optionId}. ${msg}`, 2);
  s.player.lastActionResults.push(`${expired ? '⏱ ' : ''}${pd.title}: ${msg}`);
  return msg;
}

function processDeferred(s: GameState, rng: Rng): void {
  const due = s.deferred.filter((d) => d.week <= s.week);
  s.deferred = s.deferred.filter((d) => d.week > s.week);
  for (const d of due) {
    switch (d.kind) {
      case 'promesa_region': {
        const r = d.payload.region as RegionId;
        if (s.regions[r].investment < 6) {
          const c = player(s); c.rep.credibilidad = clamp(c.rep.credibilidad - 6, 0, 100);
          c.rep.reconocimientoRegional[r] = clamp((c.rep.reconocimientoRegional[r] ?? 0) - 6, 0, 100);
          s.regions[r].discontent = clamp(s.regions[r].discontent + 10, 0, 100);
          addNews(s, rng, 'regiones', `${REGION_BY_ID[r].name} acusa promesas incumplidas`, 'Dirigentes regionales recuerdan compromisos no cumplidos.', 3, 0, -1);
          s.player.lastActionResults.push(`La región de ${REGION_BY_ID[r].shortName} te reprocha una promesa incumplida.`);
        }
        break;
      }
      case 'reconstruccion': addShock(s, 'reconstrucción', Number(d.payload.size) / 10, 0.1, 40); s.regions[d.payload.region as RegionId].infrastructure += Number(d.payload.size); break;
      case 'sumario': {
        const c = s.characters[d.payload.char as string];
        if (c && c.offices.some((o) => o.type === 'ministro')) {
          if (c.scandal > 45) { const post = s.government.cabinet.find((p) => p.ministerId === c.id); if (post) { post.ministerId = null; removeOffice(s, c, 'ministro', 'sumario'); } s.player.lastActionResults.push(`El sumario confirma faltas de ${fullName(c)}; deja el gabinete.`); }
          else { c.scandal = Math.max(0, c.scandal - 20); s.player.lastActionResults.push(`El sumario descarta faltas graves de ${fullName(c)}.`); }
        }
        break;
      }
      case 'comision_etica': { const p = s.parties[d.payload.party as string]; if (p) p.credibility = clamp(p.credibility + 4, 0, 100); break; }
      default: break;
    }
  }
}
