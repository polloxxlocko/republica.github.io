/**
 * EJERCICIO DE CARGOS: cada cargo tiene su propia agenda (decisiones recurrentes o contingentes)
 * y sus propias acciones. Más poder abre opciones, pero también responsabilidades y riesgos.
 *
 *  - Concejal/a: sesiones del concejo, fiscalización del municipio, atención de vecinos.
 *  - Alcalde/sa: presupuesto municipal anual, emergencias comunales, pedir recursos al gobierno.
 *  - Gobernador/a: inversión regional (FNDR) y tensiones con el nivel central.
 *  - Diputado/a o senador/a: votaciones de conciencia vs. disciplina, comisiones investigadoras,
 *    semana distrital (voto propio en cada proyecto desde la pantalla Congreso).
 *  - Seremi/subsecretario/a/ministro/a: conflictos sectoriales y pedidos de la Presidencia.
 *  - Asesor/a: encargos del mentor.  Dirigente social: movilizaciones.
 */
import type { Bill, Character, GameState, OfficeType } from '../models/types';
import { clamp } from '../rules/params';
import { AREA_LABELS } from '../rules/params';
import { COMUNA_BY_CUT, comunasOfDistrict, comunasOfRegion } from '../territory/data';
import { MINISTRY_BY_ID } from '../data/institutions';
import { REGION_BY_ID } from '../data/geography';
import { fullName, memoryBalance, remember, removeOffice } from '../systems/characters';
import { members, partyStance, ideologicalBenefit, STAGE_LABELS } from '../systems/parliament';
import { addNews } from '../systems/news';
import { addTerritory, bio, homeCut, me, progress } from './capital';
import type { OpportunityDef } from './opportunities';

const has = (c: Character, t: OfficeType) => c.offices.some((o) => o.type === t);
const opt = (id: string, label: string, hint: string) => ({ id, label, hint });
const month = (s: GameState) => new Date(new Date(s.startDate).getTime() + s.week * 7 * 86400000).getUTCMonth() + 1;

export const OFFICE_AGENDA: OpportunityDef[] = [
  {
    kind: 'sesion_concejo', cooldown: 4,
    generate: (s, rng) => {
      const c = me(s); if (!has(c, 'concejal')) return null;
      const mayorParty = s.comunas[homeCut(s)]?.mayorParty;
      const topics = ['concesión del aseo municipal', 'plan comunal de seguridad', 'modificación presupuestaria', 'cierre de calles para un mercado', 'patentes de alcoholes'];
      return { p: 0.6, build: () => ({ office: 'concejal', title: `Sesión del concejo: ${rng.pick(topics)}`, description: `El alcalde (${mayorParty ? s.parties[mayorParty]?.short ?? 'independiente' : '—'}) somete una propuesta a votación. Tu voto puede definir la mayoría.`, actors: [],
        requirements: [], benefits: [], risks: [], options: [opt('apoyar', 'Votar a favor', 'Buena relación con el alcalde'), opt('rechazar', 'Votar en contra', 'Perfil fiscalizador'), opt('negociar', 'Condicionar tu voto a cambios', 'Depende de tu negociación')], ctx: { mayorParty: mayorParty ?? '' } }) };
    },
    resolve: (s, rng, o, ch) => {
      const c = me(s); const same = o.ctx.mayorParty && o.ctx.mayorParty === c.partyId;
      if (ch === 'apoyar') { if (same) c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + 2, 0, 100); else c.rep.credibilidad = clamp(c.rep.credibilidad - 1, 0, 100); return 'La propuesta se aprueba con tu voto.'; }
      if (ch === 'rechazar') { c.rep.credibilidad = clamp(c.rep.credibilidad + 2, 0, 100); if (same) c.rep.confianzaPartido = clamp(c.rep.confianzaPartido - 4, 0, 100); addTerritory(s, [homeCut(s)], 1); return 'Te opones; la prensa local destaca tu perfil fiscalizador.'; }
      if (rng.chance(0.35 + c.attrs.negociacion / 200)) { addTerritory(s, [homeCut(s)], 3); return 'Logras incorporar cambios que benefician a tu sector.'; }
      return 'El alcalde no acoge tus condiciones.';
    },
    onExpire: 'apoyar',
  },
  {
    kind: 'presupuesto_municipal', cooldown: 40,
    generate: (s) => {
      const c = me(s); if (!has(c, 'alcalde') || ![10, 11].includes(month(s))) return null;
      return { p: 0.9, build: () => ({ office: 'alcalde', title: `Presupuesto municipal de ${COMUNA_BY_CUT[homeCut(s)].name}`, description: 'Debes definir la prioridad del presupuesto del próximo año. Los recursos no alcanzan para todo.', actors: [], requirements: [], benefits: [], risks: [],
        options: [opt('seguridad', 'Seguridad municipal', 'Respuesta a la principal demanda; menos para servicios'), opt('salud', 'Salud primaria (CESFAM)', 'Efecto lento y valorado'), opt('obras', 'Obras y espacios públicos', 'Visible; riesgo de sobrecostos'), opt('social', 'Programas sociales', 'Apoyo de sectores vulnerables')], ctx: {}, expires: 6 }) };
    },
    resolve: (s, rng, _o, ch) => {
      const cut = homeCut(s); const st = s.comunas[cut]; const c = me(s);
      const pri = st.priorities;
      const area = ch === 'seguridad' ? 'seguridad' : ch === 'salud' ? 'salud' : ch === 'obras' ? 'infraestructura' : 'vivienda';
      const fit = (pri[area as keyof typeof pri] ?? 0.5);
      const ok = rng.chance(0.4 + c.attrs.gestion / 200);
      st.discontent = clamp(st.discontent - (ok ? 6 + fit * 3 : 1), 0, 100);
      c.rep.popularidad = clamp(c.rep.popularidad + (ok ? 2 + fit : -1), 0, 100);
      addTerritory(s, [cut], ok ? 4 : 1);
      bio(s, 'decision', `Presupuesto municipal: prioridad ${AREA_LABELS[area as keyof typeof AREA_LABELS]}`, ok ? 'Ejecución exitosa.' : 'Ejecución deficiente.', ok ? 1 : -1);
      return ok ? 'La ejecución es buena y los vecinos lo notan.' : 'La ejecución tiene problemas (licitaciones desiertas, retrasos).';
    },
    onExpire: 'social',
  },
  {
    kind: 'emergencia_comunal', cooldown: 30,
    generate: (s, rng) => {
      const c = me(s); if (!has(c, 'alcalde')) return null;
      const kinds = ['un temporal que inunda varios sectores', 'un incendio en un campamento', 'una crisis en la recolección de basura', 'una seguidilla de delitos violentos'];
      return { p: 0.035, build: () => ({ office: 'alcalde', title: 'Emergencia comunal', description: `Tu comuna enfrenta ${rng.pick(kinds)}. Los vecinos esperan respuestas inmediatas.`, actors: [s.government.presidentId], requirements: [], benefits: [], risks: [],
        options: [opt('gasto', 'Gasto municipal extraordinario', 'Respuesta rápida; deja menos recursos'), opt('gobierno', 'Pedir apoyo al gobierno', 'Depende de tu relación con el oficialismo'), opt('terreno', 'Estar en terreno y coordinar voluntarios', 'Imagen de cercanía; eficacia limitada')], ctx: {} }) };
    },
    resolve: (s, rng, _o, ch) => {
      const c = me(s); const cut = homeCut(s); const st = s.comunas[cut];
      const gov = s.characters[s.government.presidentId];
      if (ch === 'gasto') { st.discontent = clamp(st.discontent - 5, 0, 100); c.rep.popularidad = clamp(c.rep.popularidad + 2, 0, 100); return 'La respuesta municipal es rápida.'; }
      if (ch === 'gobierno') {
        const friendly = gov && (gov.partyId === c.partyId || memoryBalance(gov, c.id) > 10);
        if (friendly || rng.chance(0.35)) { st.discontent = clamp(st.discontent - 8, 0, 100); s.regions[c.regionId].investment += 2; return 'El gobierno envía recursos.'; }
        c.rep.popularidad = clamp(c.rep.popularidad - 2, 0, 100); return 'El gobierno tarda en responder; te culpan a ti también.';
      }
      addTerritory(s, [cut], 5); c.rep.popularidad = clamp(c.rep.popularidad + 1, 0, 100); return 'Tu presencia en terreno es valorada.';
    },
    onExpire: 'terreno',
  },
  {
    kind: 'inversion_regional', cooldown: 40,
    generate: (s) => {
      const c = me(s); if (!has(c, 'gobernador') || month(s) !== 4) return null;
      return { p: 0.9, build: () => ({ office: 'gobernador', title: `Fondo Nacional de Desarrollo Regional (${REGION_BY_ID[c.regionId].shortName})`, description: 'Debes priorizar la cartera de inversión regional y negociarla con el consejo regional.', actors: [], requirements: [], benefits: [], risks: [],
        options: [opt('capital', 'Concentrar en la capital regional', 'Más electores beneficiados'), opt('rural', 'Priorizar comunas rurales y aisladas', 'Equidad territorial'), opt('conflicto', 'Exigir más recursos al nivel central', 'Popularidad regional; tensión con el gobierno')], ctx: {} }) };
    },
    resolve: (s, _rng, _o, ch) => {
      const c = me(s); const cuts = comunasOfRegion(c.regionId);
      if (ch === 'capital') { const big = cuts.sort((a, b) => b.electors - a.electors).slice(0, 3).map((x) => x.cut); addTerritory(s, big, 5); return 'La inversión se concentra en las comunas más pobladas.'; }
      if (ch === 'rural') { const small = cuts.sort((a, b) => a.electors - b.electors).slice(0, Math.ceil(cuts.length / 2)).map((x) => x.cut); addTerritory(s, small, 6); for (const x of small) s.comunas[x].discontent -= 3; return 'Las comunas rurales reciben inversión.'; }
      c.rep.reconocimientoRegional[c.regionId] = clamp((c.rep.reconocimientoRegional[c.regionId] ?? 0) + 5, 0, 100); const p = s.characters[s.government.presidentId]; if (p) remember(p, { week: s.week, aboutId: c.id, kind: 'conflicto', weight: -6, note: 'Exigió recursos públicamente' });
      return 'Tu demanda gana apoyo regional, pero tensiona la relación con La Moneda.';
    },
    onExpire: 'capital',
  },
  {
    kind: 'votacion_conciencia', cooldown: 6,
    generate: (s) => {
      const c = me(s); const chamber = has(c, 'diputado') ? 'camara' : has(c, 'senador') ? 'senado' : null;
      if (!chamber || !c.partyId) return null;
      const b = s.bills.find((x) => x.closedWeek === undefined && x.playerVote === undefined && ((x.stage === 'sala_origen' && x.chamberOfOrigin === chamber) || (x.stage === 'sala_revisora' && x.chamberOfOrigin !== chamber))
        && Math.abs(partyStance(s, c.partyId!, x)) > 0.4 && Math.sign(partyStance(s, c.partyId!, x)) !== Math.sign(ideologicalBenefit(c.ideology, x)) && Math.abs(ideologicalBenefit(c.ideology, x)) > 0.15);
      if (!b) return null;
      return { p: 0.7, build: () => {
        const line = partyStance(s, c.partyId!, b) > 0 ? 'a favor' : 'en contra';
        return { office: chamber === 'camara' ? 'diputado' : 'senador', title: `Votación de conciencia: ${b.title}`, description: `Tu bancada votará ${line}, pero el proyecto choca con tus convicciones. Etapa: ${STAGE_LABELS[b.stage]}.`, actors: s.parties[c.partyId!].leaderId ? [s.parties[c.partyId!].leaderId!] : [],
          requirements: [], benefits: [], risks: [], options: [opt('linea', `Votar con la bancada (${line})`, 'Confianza partidaria'), opt('conciencia', 'Votar según tus convicciones', 'Credibilidad propia; tensión con la directiva'), opt('abstencion', 'Abstenerte', 'Ni lo uno ni lo otro')], ctx: { bill: b.id, line: line === 'a favor' ? 'yes' : 'no' } };
      } };
    },
    resolve: (s, _rng, o, ch) => {
      const b = s.bills.find((x) => x.id === o.ctx.bill); if (!b) return 'El proyecto ya fue votado.';
      const line = o.ctx.line as 'yes' | 'no';
      b.playerVote = ch === 'linea' ? line : ch === 'abstencion' ? 'abst' : (line === 'yes' ? 'no' : 'yes');
      return 'Tu voto quedará registrado en la próxima votación en sala.';
    },
    onExpire: 'linea',
  },
  {
    kind: 'comision_investigadora', cooldown: 52,
    generate: (s) => {
      const c = me(s); if (!(has(c, 'diputado') || has(c, 'senador'))) return null;
      const scandal = s.government.cabinet.find((p) => p.ministerId && (s.characters[p.ministerId]?.scandal ?? 0) > 30);
      if (!scandal) return null;
      return { p: 0.15, build: () => ({ office: has(c, 'diputado') ? 'diputado' : 'senador', title: `Comisión investigadora: ${MINISTRY_BY_ID[scandal.ministryId].name}`, description: `Se constituye una comisión para investigar a ${fullName(s.characters[scandal.ministerId!])}. Te ofrecen presidirla.`, actors: [scandal.ministerId!],
        requirements: [], benefits: [], risks: [], options: [opt('presidir', 'Presidir la comisión', 'Visibilidad y credibilidad; enemistad con el gobierno'), opt('integrar', 'Integrarla con perfil bajo', ''), opt('rechazar', 'Rechazar', '')], ctx: { minister: scandal.ministerId! } }) };
    },
    resolve: (s, _rng, o, ch) => {
      const c = me(s);
      if (ch === 'presidir') { c.rep.reconocimiento = clamp(c.rep.reconocimiento + 6, 0, 100); c.rep.credibilidad = clamp(c.rep.credibilidad + 3, 0, 100); const m = s.characters[String(o.ctx.minister)]; if (m) remember(m, { week: s.week, aboutId: c.id, kind: 'conflicto', weight: -15, note: 'Presidió la comisión que lo investigó' }); const p = s.characters[s.government.presidentId]; if (p && p.partyId !== c.partyId) remember(p, { week: s.week, aboutId: c.id, kind: 'conflicto', weight: -6, note: 'Fiscalizó al gobierno' }); else if (p) c.rep.confianzaPartido = clamp(c.rep.confianzaPartido - 5, 0, 100); bio(s, 'decision', 'Presides una comisión investigadora', '', 1); progress(s); return 'Encabezas la investigación: ganas notoriedad nacional.'; }
      if (ch === 'integrar') { c.rep.credibilidad = clamp(c.rep.credibilidad + 1, 0, 100); return 'Participas con bajo perfil.'; }
      return 'No participas.';
    },
    onExpire: 'rechazar',
  },
  {
    kind: 'conflicto_sectorial', cooldown: 20,
    generate: (s, rng) => {
      const c = me(s); const post = c.offices.find((o) => o.type === 'ministro' || o.type === 'subsecretario' || o.type === 'seremi');
      if (!post?.ministryId) return null;
      return { p: 0.08, build: () => ({ office: post.type, title: `Conflicto en ${MINISTRY_BY_ID[post.ministryId!].name}`, description: `${rng.pick(['Un gremio del sector', 'Funcionarios públicos', 'Una federación estudiantil', 'Productores regionales'])} amenaza con movilizaciones por una medida de tu cartera.`, actors: [s.government.presidentId],
        requirements: [], benefits: [], risks: [], options: [opt('negociar', 'Abrir una mesa de negociación', 'Depende de tu negociación'), opt('firmeza', 'Mantener la medida', 'Respaldo de Hacienda; riesgo de escalada'), opt('escalar', 'Llevarlo a la Presidencia', 'Te quita protagonismo')], ctx: { ministry: post.ministryId! } }) };
    },
    resolve: (s, rng, o, ch) => {
      const c = me(s); const post = s.government.cabinet.find((p) => p.ministerId === c.id);
      if (ch === 'negociar') { if (rng.chance(0.3 + c.attrs.negociacion / 160)) { if (post) post.performance += 6; c.rep.prestigioTecnico += 2; return 'Alcanzas un acuerdo razonable.'; } if (post) post.performance -= 4; return 'La negociación fracasa y el conflicto se prolonga.'; }
      if (ch === 'firmeza') { if (rng.chance(0.5)) { c.rep.prestigioTecnico += 1; return 'El conflicto se diluye.'; } c.scandal = clamp(c.scandal + 15, 0, 100); s.opinion.presidentialApproval -= 1; addNews(s, rng, 'gobierno', `Escala el conflicto en ${MINISTRY_BY_ID[String(o.ctx.ministry)].name}`, '', 3, 0, -1); return 'El conflicto escala y te cuestionan públicamente.'; }
      const p = s.characters[s.government.presidentId]; if (p) remember(p, { week: s.week, aboutId: c.id, kind: 'conflicto', weight: -4, note: 'Le traspasó un conflicto' });
      return 'La Presidencia toma el control del conflicto.';
    },
    onExpire: 'escalar',
  },
  {
    kind: 'pedido_presidente', cooldown: 26,
    generate: (s) => {
      const c = me(s); if (!has(c, 'ministro')) return null;
      const pol = s.government.policies.find((p) => ['tramitacion', 'implementacion'].includes(p.phase));
      if (!pol) return null;
      return { p: 0.06, build: () => ({ office: 'ministro', title: 'La Presidencia te pide defender una medida impopular', description: 'Debes salir a los medios a defender una política del gobierno que genera rechazo.', actors: [s.government.presidentId], requirements: [], benefits: [], risks: [],
        options: [opt('defender', 'Defenderla con convicción', 'Confianza presidencial; desgaste propio'), opt('matizar', 'Defenderla con matices', 'Equilibrio'), opt('distancia', 'Tomar distancia', 'Protege tu imagen; riesgo de salida del gabinete')], ctx: {} }) };
    },
    resolve: (s, rng, _o, ch) => {
      const c = me(s); const p = s.characters[s.government.presidentId];
      if (ch === 'defender') { if (p) remember(p, { week: s.week, aboutId: c.id, kind: 'apoyo', weight: 10, note: 'Defendió al gobierno' }); c.rep.popularidad = clamp(c.rep.popularidad - 3, 0, 100); return 'Defiendes la medida; el Presidente lo valora.'; }
      if (ch === 'matizar') return 'Defiendes la medida con matices.';
      if (p) remember(p, { week: s.week, aboutId: c.id, kind: 'traicion', weight: -15, note: 'Se desmarcó en público' });
      c.rep.popularidad = clamp(c.rep.popularidad + 2, 0, 100);
      if (rng.chance(0.35)) { const post = s.government.cabinet.find((x) => x.ministerId === c.id); if (post) post.ministerId = null; removeOffice(s, c, 'ministro', 'salida del gabinete'); bio(s, 'fin_cargo', 'Sales del gabinete tras desmarcarte', '', -1); return 'Tu desmarque te cuesta el cargo: sales del gabinete.'; }
      return 'Tomas distancia; la relación con La Moneda se resiente.';
    },
    onExpire: 'matizar',
  },
  {
    kind: 'encargo_mentor', cooldown: 20,
    generate: (s) => {
      const c = me(s); if (!has(c, 'asesor')) return null;
      const mentor = Object.entries(c.relations).sort((a, b) => b[1] - a[1]).map(([id]) => s.characters[id]).find((x) => x && x.offices.length && x.status === 'activo');
      if (!mentor) return null;
      return { p: 0.08, build: () => ({ office: 'asesor', title: `${fullName(mentor)} te encarga una tarea delicada`, description: 'Debes conseguir apoyos para su agenda en el partido, presionando a dirigentes que no te conocen.', actors: [mentor.id], requirements: [], benefits: [], risks: [],
        options: [opt('cumplir', 'Hacerlo', 'Gana su confianza; crea roces'), opt('rechazar', 'Excusarte', 'Su confianza baja')], ctx: { mentor: mentor.id } }) };
    },
    resolve: (s, rng, o, ch) => {
      const c = me(s); const m = s.characters[String(o.ctx.mentor)];
      if (!m) return '';
      if (ch === 'cumplir') { remember(m, { week: s.week, aboutId: c.id, kind: 'acuerdo_cumplido', weight: 8, note: 'Cumplió un encargo' }); c.attrs.negociacion = clamp(c.attrs.negociacion + 1, 0, 100); if (rng.chance(0.4)) c.rep.confianzaPartido = clamp(c.rep.confianzaPartido - 2, 0, 100); return 'Cumples el encargo.'; }
      remember(m, { week: s.week, aboutId: c.id, kind: 'conflicto', weight: -6, note: 'No cumplió un encargo' }); return 'Te excusas; tu mentor lo nota.';
    },
    onExpire: 'rechazar',
  },
];

/** Aplica la consecuencia del voto propio del jugador en una votación de sala. */
export function playerVoteConsequence(s: GameState, b: Bill, vote: 'yes' | 'no' | 'abst'): void {
  const c = me(s); if (!c.partyId) return;
  const line = partyStance(s, c.partyId, b);
  const against = (line > 0.3 && vote === 'no') || (line < -0.3 && vote === 'yes');
  if (against) {
    c.rep.confianzaPartido = clamp(c.rep.confianzaPartido - 5, 0, 100);
    c.rep.credibilidad = clamp(c.rep.credibilidad + 2, 0, 100);
    bio(s, 'decision', `Votas contra tu bancada: ${b.title}`, '', 0);
  } else if (b.origin === 'mensaje') bio(s, 'decision', `Votas ${vote === 'yes' ? 'a favor' : vote === 'no' ? 'en contra' : 'abstención'}: ${b.title}`, '', 0);
  if (b.popularity > 30 && vote === 'yes') c.rep.popularidad = clamp(c.rep.popularidad + 1, 0, 100);
  if (b.popularity < -30 && vote === 'yes') c.rep.popularidad = clamp(c.rep.popularidad - 1, 0, 100);
}

/** Acción de distrito (parlamentarios): capital territorial en su distrito/circunscripción. */
export function districtWeek(s: GameState): string {
  const c = me(s);
  const o = c.offices.find((x) => x.type === 'diputado' || x.type === 'senador')!;
  const cuts = o.type === 'diputado' ? comunasOfDistrict(o.districtId!).map((x) => x.cut) : comunasOfRegion(o.regionId!).map((x) => x.cut);
  addTerritory(s, cuts, 3);
  c.rep.reconocimientoRegional[c.regionId] = clamp((c.rep.reconocimientoRegional[c.regionId] ?? 0) + 2, 0, 100);
  return `Semana distrital: recorres ${cuts.length} comunas.`;
}

export { members };
