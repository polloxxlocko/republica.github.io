/**
 * PARLAMENTO Y GOBIERNO: negociación de un proyecto, coordinación ministerial y una negociación
 * decisiva con un socio de coalición (Presidencia). Las ofertas respetan las atribuciones reales.
 */
import type { DialogueCtx, DialogueDefinition, NegotiationItem } from '../types';
import { AREA_LABELS } from '../../rules/params';
import { REGION_BY_ID } from '../../data/geography';
import { MINISTRY_BY_ID } from '../../data/institutions';
import { fn, first } from '../world';
import { sty } from '../text';
import { dispo, noise, npcMem, npcRel, react } from './helpers';
import { evaluateProposal, recordProposal, authorityFor } from '../negotiation';

const nego = (c: DialogueCtx, offer: NegotiationItem[], ask: NegotiationItem[], round: number, bonus = 0) => {
  const ev = evaluateProposal(c.s, c.rng, c.npc.id, offer, ask, round); ev.score += bonus;
  const r = ev.score > 18 ? 'acepta' : ev.score > 4 ? 'contraoferta' : ev.score > -8 ? 'posterga' : 'rechaza';
  recordProposal(c.s, c.sess.id, c.me.id, offer, ask, round, r); c.v.why = ev.reasons.join('; ');
  return r;
};

// ───────────────────────── Negociación de un proyecto de ley ─────────────────────────
export const NEGOCIACION_PROYECTO: DialogueDefinition = {
  id: 'negociacion_proyecto', area: 'parlamento', kind: 'estrategica', title: 'Negociar un proyecto', maxExchanges: 8, formality: 'parlamentaria', initiators: ['jugador'], cooldownWeeks: 6,
  requiresOffice: ['diputado', 'senador'],
  setup: (s, args) => {
    const b = s.bills.find((x) => x.id === args.billId && x.closedWeek === undefined); const npc = s.characters[String(args.target)];
    if (!b || !npc || npc.status !== 'activo' || npc.isPlayer) return null;
    return { participants: [npc.id], place: 'Pasillo de la Sala, Congreso Nacional (Valparaíso)', motive: `Negociar «${b.title.replace(/^Mensaje: /, '')}»`, vars: { bill: b.title.replace(/^Mensaje: /, ''), area: AREA_LABELS[b.area], region: REGION_BY_ID[s.characters[s.player.characterId].regionId].name } };
  },
  label: (s, args) => `Negociar «${s.bills.find((b) => b.id === args.billId)?.title.replace(/^Mensaje: /, '').slice(0, 50)}» con ${fn(s.characters[String(args.target)])}`,
  start: 'inicio',
  nodes: {
    inicio: { text: (c) => sty(c, 'i', { default: [`Me dijeron que tienes dudas con el proyecto de ${String(c.v.area).toLowerCase()}. Necesito votos, así que te escucho.`], tecnico: ['Si tienes observaciones técnicas al proyecto, prefiero conocerlas ahora y no en la votación.'], directo: ['¿Cuánto me cuesta tu voto?'] }),
      options: [
        { id: 'voto_x_indicacion', text: (c) => `Te puedo dar mi voto si incorporas una indicación que proteja a ${c.v.region}.`, next: 'eval_indicacion' },
        { id: 'voto_x_mi_proyecto', text: 'Te doy mi voto si tú apoyas mi proyecto cuando llegue a la Sala.', when: [{ test: (c) => c.s.bills.some((b) => b.authorId === c.me.id && b.closedWeek === undefined) }], next: 'eval_cruce' },
        { id: 'objecion', text: 'Tal como está, no puedo votarlo a favor. El financiamiento no está claro.', when: [{ test: (c) => c.me.rep.prestigioTecnico >= 40 || c.me.attrs.tecnico >= 55 }], effects: (c) => [{ type: 'position', topic: `proyecto:${c.v.billId}`, stance: -1 }, npcRel(c, { respect: 5 })], next: 'objecion' },
        { id: 'apoyo_simple', text: 'Lo voy a votar a favor. Solo quería que lo supieras.', effects: (c) => [{ type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'voto_proyecto', content: `Votar a favor de «${c.v.bill}»`, dueWeek: c.s.week + 60, conditions: { billId: String(c.v.billId) }, visibility: 'conocido', importance: 'relevante' } }, npcRel(c, { trust: 4, cooperation: 4 }), { type: 'position', topic: `proyecto:${c.v.billId}`, stance: 1 }], next: 'fin' },
      ] },
    eval_indicacion: { text: '', decide: (c) => {
      const ask: NegotiationItem[] = [{ kind: 'indicacion', by: c.npc.id, label: 'Indicación territorial' }];
      if (authorityFor(c.s, c.npc, ask[0])) return 'sin_atribucion';
      const r = nego(c, [{ kind: 'voto_proyecto', by: c.me.id, refId: String(c.v.billId), label: 'Tu voto' }], ask, 0);
      return r === 'acepta' ? 'acuerdo_indicacion' : r === 'contraoferta' ? 'contra' : r === 'posterga' ? 'consulta' : 'rechaza'; } },
    sin_atribucion: { text: 'Eso no depende de mí: las indicaciones las tiene que patrocinar el Ejecutivo o algún parlamentario. Puedo llevar la propuesta, pero no prometértela.',
      options: [{ id: 'ok', text: 'Llévala, entonces. Mi voto depende de eso.', effects: (c) => [npcRel(c, { respect: 2 }, 'menor')], next: 'fin_sin' }] },
    acuerdo_indicacion: { text: (c) => sty(c, 'ai', { default: [`Trato. Presento la indicación para ${c.v.region} y tú votas a favor.`], directo: ['Hecho. Indicación por voto.'] }),
      onEnter: (c) => [{ type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'voto_proyecto', content: `Votar a favor de «${c.v.bill}»`, dueWeek: c.s.week + 60, conditions: { billId: String(c.v.billId) }, visibility: 'conocido', importance: 'compromiso' } },
        { type: 'world', op: 'bill_support', args: { billId: String(c.v.billId), charId: c.me.id, amount: 6 } }, { type: 'world', op: 'bill_moderate', args: { billId: String(c.v.billId), amount: 0.05 } },
        { type: 'rep', dim: 'territorial', delta: 3 }, npcRel(c, { cooperation: 8, trust: 4 }), npcMem(c, 'acuerdo', `Intercambio: indicación territorial por voto en «${c.v.bill}»`, 'compromiso'), { type: 'position', topic: `proyecto:${c.v.billId}`, stance: 1 }],
      end: 'acuerdo' },
    contra: { text: 'La indicación completa no. Puedo comprometer un artículo transitorio para tu región, más acotado.',
      options: [
        { id: 'acepta', text: 'Con eso me alcanza.', effects: (c) => [{ type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'voto_proyecto', content: `Votar a favor de «${c.v.bill}»`, dueWeek: c.s.week + 60, conditions: { billId: String(c.v.billId) }, visibility: 'conocido', importance: 'compromiso' } }, { type: 'world', op: 'bill_support', args: { billId: String(c.v.billId), charId: c.me.id, amount: 4 } }, { type: 'rep', dim: 'territorial', delta: 1 }, npcRel(c, { cooperation: 5 })], next: 'fin' },
        { id: 'no', text: 'Así no puedo comprometer mi voto.', effects: (c) => [npcMem(c, 'negociacion', 'Negociación sin acuerdo por un proyecto', 'relevante')], next: 'fin_sin' },
      ] },
    consulta: { text: 'Lo tengo que consultar con mi bancada y con el Ejecutivo. Te respondo antes de la votación.', end: 'pendiente' },
    rechaza: { text: (c) => sty(c, 'rj', { default: ['No puedo cambiar el proyecto por un voto. Lo siento.'] }) + (c.v.why ? ` (${c.v.why})` : ''), end: 'rechazo' },
    eval_cruce: { text: '', decide: (c) => (nego(c, [{ kind: 'voto_proyecto', by: c.me.id, refId: String(c.v.billId), label: 'Tu voto' }], [{ kind: 'voto_proyecto', by: c.npc.id, label: 'Su voto' }], 0) === 'acepta' ? 'cruce_ok' : 'rechaza') },
    cruce_ok: { text: 'Hecho. Votos cruzados, y que quede entre nosotros.', onEnter: (c) => { const mine = c.s.bills.find((b) => b.authorId === c.me.id && b.closedWeek === undefined)!; return [
      { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'voto_proyecto', content: `Votar a favor de «${c.v.bill}»`, dueWeek: c.s.week + 60, conditions: { billId: String(c.v.billId) }, visibility: 'privado', importance: 'compromiso' } },
      { type: 'world', op: 'bill_support', args: { billId: mine.id, charId: c.npc.id, amount: 8 } }, npcMem(c, 'acuerdo', 'Votos cruzados', 'compromiso')]; }, end: 'acuerdo' },
    objecion: { text: (c) => sty(c, 'ob', { default: ['Es una objeción seria. ¿Qué necesitarías para votarlo?'], directo: ['Puede ser. ¿Y qué propones?'] }),
      options: [
        { id: 'informe', text: 'Un informe financiero actualizado antes de la votación en Sala.', next: 'eval_informe' },
        { id: 'no', text: 'Que se rehaga el financiamiento. Si no, voto en contra.', effects: (c) => [npcRel(c, { respect: 3, cooperation: -2 })], next: 'fin_sin' },
      ] },
    eval_informe: { text: '', decide: (c) => (dispo(c) + noise(c) > -5 ? 'informe_ok' : 'rechaza') },
    informe_ok: { text: 'Lo pido. Si llega a tiempo, cuento con tu voto.', onEnter: (c) => [{ type: 'world', op: 'bill_moderate', args: { billId: String(c.v.billId), amount: 0.03 } }, { type: 'rep', dim: 'prestigioTecnico', delta: 2 }, npcRel(c, { respect: 6 })], end: 'acuerdo condicionado' },
    fin: { speaker: 'narrador', text: 'Quedan de acuerdo.', end: 'acuerdo' },
    fin_sin: { speaker: 'narrador', text: 'No hay acuerdo por ahora.', end: 'sin acuerdo' },
  },
};

// ───────────────────────── Coordinación ministerial ─────────────────────────
export const COORDINACION_MINISTERIAL: DialogueDefinition = {
  id: 'coordinacion_ministerial', area: 'gobierno', kind: 'estrategica', title: 'Coordinación presupuestaria', maxExchanges: 6, formality: 'ministerial', initiators: ['jugador'], cooldownWeeks: 10,
  requiresOffice: ['ministro'],
  setup: (s) => {
    const me = s.characters[s.player.characterId];
    const myMin = me.offices.find((o) => o.type === 'ministro')?.ministryId;
    const hacienda = s.government.cabinet.find((p) => p.ministryId === 'hacienda')?.ministerId;
    const npc = hacienda && hacienda !== me.id ? s.characters[hacienda] : s.characters[s.government.presidentId];
    if (!myMin || !npc) return null;
    return { participants: [npc.id], place: 'Teatinos 120, Santiago', motive: `Discutir el presupuesto de ${MINISTRY_BY_ID[myMin]?.name ?? 'tu cartera'}`, vars: { ministry: MINISTRY_BY_ID[myMin]?.name ?? 'tu cartera', area: MINISTRY_BY_ID[myMin]?.area ?? 'economia' } };
  },
  label: () => 'Negociar presupuesto con Hacienda',
  start: 'inicio',
  nodes: {
    inicio: { text: (c) => sty(c, 'i', { default: ['Sabes cómo está la caja. Dime qué necesitas y por qué no puede esperar.'], tecnico: ['Antes de hablar de montos, necesito ver la justificación técnica y la ejecución de este año.'], institucional: ['La Dirección de Presupuestos evaluará cualquier solicitud. Te escucho.'] }),
      options: [
        { id: 'datos', text: 'Traigo la ejecución al día y una evaluación del programa. Los resultados justifican ampliar la cobertura.', when: [{ test: (c) => c.me.rep.prestigioTecnico >= 40 }], next: 'eval_datos' },
        { id: 'politica', text: 'La coalición está preguntando por este programa. Si no hay recursos, el costo político lo pagamos todos.', next: 'eval_politica' },
        { id: 'cede', text: 'Entiendo la restricción. Puedo reasignar dentro de mi presupuesto y no pedir nuevos recursos.', effects: (c) => [npcRel(c, { trust: 8, respect: 4 }), { type: 'rep', dim: 'prestigioTecnico', delta: 1 }], next: 'fin_cede' },
      ] },
    eval_datos: { text: '', decide: (c) => (dispo(c) * 0.3 + c.me.rep.prestigioTecnico * 0.4 - 15 + noise(c) > 0 ? 'aprueba' : 'parcial') },
    eval_politica: { text: '', decide: (c) => (c.npc.personality === 'tecnocrata' ? 'molesto' : dispo(c) + noise(c, 10) > 10 ? 'parcial' : 'molesto') },
    aprueba: { text: 'Está bien fundamentado. Te aprobamos una ampliación acotada, con metas trimestrales.', onEnter: (c) => [{ type: 'world', op: 'area_priority', args: { area: String(c.v.area), amount: 4 } }, { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'acuerdo_programatico', content: `Cumplir metas trimestrales en ${c.v.ministry}`, dueWeek: c.s.week + 52, conditions: {}, visibility: 'privado', importance: 'relevante' } }, npcRel(c, { respect: 6 })], end: 'acuerdo' },
    parcial: { text: 'Te puedo dar una parte, no todo. Y quiero ver resultados antes de la próxima ley de presupuestos.', onEnter: (c) => [{ type: 'world', op: 'area_priority', args: { area: String(c.v.area), amount: 2 } }], end: 'acuerdo parcial' },
    molesto: { text: 'Las presiones políticas no cambian los números. La respuesta es no.', onEnter: (c) => [npcRel(c, { trust: -6, respect: -3 }), react('Hacienda se cierra. Tu cartera queda sin recursos adicionales.')], end: 'rechazo' },
    fin_cede: { speaker: 'narrador', text: 'Hacienda toma nota de tu disposición.', end: 'acuerdo' },
  },
};

// ───────────────────────── Negociación decisiva con un socio de coalición ─────────────────────────
export const SOCIO_COALICION: DialogueDefinition = {
  id: 'socio_coalicion', area: 'coaliciones', kind: 'decisiva', title: 'La coalición en juego', maxExchanges: 15, formality: 'institucional', initiators: ['jugador', 'ia'], cooldownWeeks: 26,
  requiresOffice: ['presidente'],
  setup: (s, args) => {
    const co = s.government.coalitionId ? s.coalitions[s.government.coalitionId] : null;
    const p = s.parties[String(args.partyId)]; const npc = s.characters[String(args.target ?? p?.leaderId ?? '')];
    if (!co || !p || !co.members.includes(p.id) || !npc || npc.status !== 'activo') return null;
    return { participants: [npc.id], place: 'Palacio de La Moneda', motive: `${p.short} evalúa su permanencia en la coalición`, vars: { party: p.short, partyId: p.id, coalitionId: co.id, round: 0, cohesion: Math.round(co.cohesion) }, time: 'amplio' };
  },
  label: (s, args) => `Reunirse con la directiva de ${s.parties[String(args.partyId)]?.short}`,
  start: 'inicio',
  nodes: {
    inicio: { text: (c) => sty(c, 'i', { default: [`Presidente${c.me.gender === 'f' ? 'a' : ''}, vengo a decirle lo que se está conversando en ${c.v.party}: hay mucha gente que cree que ya no tiene sentido seguir en el Gobierno.`], directo: [`Le voy a hablar claro: ${c.v.party} está a un paso de salir de la coalición.`], institucional: [`Presidente${c.me.gender === 'f' ? 'a' : ''}, la mesa de ${c.v.party} me pidió transmitirle formalmente su preocupación por el rumbo de la coalición.`] }),
      options: [
        { id: 'escucha', text: '¿Qué es exactamente lo que les preocupa? Quiero entenderlo antes de responder.', next: 'demandas' },
        { id: 'firmeza', text: 'La coalición no se negocia con amenazas. Si quieren irse, que lo decidan sus órganos.', next: 'eval_firmeza' },
        { id: 'oferta_rapida', text: (c) => `Estoy dispuest${c.me.gender === 'f' ? 'a' : 'o'} a revisar la participación de su partido en el gabinete.`, next: 'eval_gabinete' },
      ] },
    demandas: { text: () => `Sienten que el Gobierno no los escucha: las decisiones se toman sin ellos y el costo lo pagan en sus territorios. Quieren más presencia en el gabinete y una señal en la agenda legislativa.`,
      onEnter: (c) => [{ type: 'info', card: { source: fn(c.npc), text: `${c.v.party} pide más presencia en el gabinete y una señal legislativa (versión de su directiva).`, kind: 'propuesta', confirmed: true } }],
      options: [
        { id: 'gabinete', text: 'Puedo ofrecer una subsecretaría relevante y mesas de coordinación semanales.', next: 'eval_gabinete' },
        { id: 'agenda', text: 'Puedo priorizar uno de sus proyectos en la agenda legislativa del Gobierno.', next: 'eval_agenda' },
        { id: 'ambas', text: 'Ofrezco ambas cosas, a cambio de un compromiso de lealtad hasta el fin del mandato.', next: 'eval_ambas' },
        { id: 'firmeza', text: 'Entiendo, pero no voy a premiar la presión con cargos.', next: 'eval_firmeza' },
      ] },
    eval_gabinete: { text: '', decide: (c) => { c.v.round = Number(c.v.round) + 1; return dispo(c) + 14 + noise(c, 10) - Number(c.v.round) * 4 > 10 ? 'acuerdo' : 'contra'; } },
    eval_agenda: { text: '', decide: (c) => { c.v.round = Number(c.v.round) + 1; return dispo(c) + 8 + noise(c, 10) - Number(c.v.round) * 4 > 10 ? 'acuerdo' : 'contra'; } },
    eval_ambas: { text: '', decide: (c) => { c.v.round = Number(c.v.round) + 1; return dispo(c) + 24 + noise(c, 10) > 6 ? 'acuerdo_lealtad' : 'contra'; } },
    eval_firmeza: { text: '', decide: (c) => (c.npc.personality === 'confrontacional' || c.npc.personality === 'ambicioso' ? 'salida' : dispo(c) + noise(c, 12) > 10 ? 'tregua' : 'salida') },
    contra: { text: (c) => Number(c.v.round) >= 3 ? 'No veo voluntad real. Voy a informar a mi partido que no hubo acuerdo.' : 'No alcanza. Necesitamos algo más concreto.',
      options: (c) => Number(c.v.round) >= 3 ? [{ id: 'ultima', text: 'Entonces le pido una semana más antes de que decidan.', next: 'tregua' }] : [
        { id: 'gabinete', text: 'Entonces ofrezco un ministerio sectorial en el próximo ajuste.', next: 'eval_gabinete' },
        { id: 'agenda', text: 'Pongo urgencia a uno de sus proyectos este mismo mes.', next: 'eval_agenda' },
        { id: 'firmeza', text: 'No tengo más que ofrecer. Ustedes deciden.', next: 'eval_firmeza' },
      ] },
    acuerdo: { text: 'Con eso puedo volver a mi partido. No le garantizo que todos estén conformes, pero vamos a seguir.', onEnter: (c) => [{ type: 'world', op: 'coalition_cohesion', args: { coalitionId: String(c.v.coalitionId), delta: 12 } }, { type: 'world', op: 'party_relation', args: { a: c.me.partyId ?? '', b: String(c.v.partyId), delta: 8 } }, { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'acuerdo_programatico', content: `Cumplir lo ofrecido a ${c.v.party} para mantener la coalición`, dueWeek: c.s.week + 26, conditions: {}, visibility: 'conocido', importance: 'decisivo' } }, npcMem(c, 'acuerdo', 'Acuerdo para mantener la coalición', 'decisivo')], end: 'coalición preservada' },
    acuerdo_lealtad: { text: 'Hay acuerdo. Y le doy mi palabra: hasta el final del mandato.', onEnter: (c) => [{ type: 'world', op: 'coalition_cohesion', args: { coalitionId: String(c.v.coalitionId), delta: 18 } }, { type: 'commitment', c: { debtor: c.npc.id, creditor: c.me.id, kind: 'lealtad', content: `${c.v.party} se queda en la coalición hasta el fin del mandato`, dueWeek: c.s.week + 104, conditions: {}, visibility: 'publico', importance: 'decisivo' } }, { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'acuerdo_programatico', content: `Cumplir lo ofrecido a ${c.v.party}`, dueWeek: c.s.week + 26, conditions: {}, visibility: 'conocido', importance: 'decisivo' } }], end: 'coalición preservada' },
    tregua: { text: 'Le doy una semana. Después, no respondo por lo que decida mi partido.', onEnter: (c): import('../types').DialogueEffect[] => [{ type: 'world', op: 'coalition_cohesion', args: { coalitionId: String(c.v.coalitionId), delta: 2 } }, { type: 'defer', inWeeks: 2, op: 'invite_if', args: { fromId: c.npc.id, defId: 'socio_coalicion', partyId: String(c.v.partyId), cond: 'always', motive: `La directiva de ${c.v.party} vuelve a pedir audiencia.` }, note: 'Segunda ronda' }], end: 'tregua' },
    salida: { text: (c) => `Entonces no hay más que hablar. ${c.v.party} va a salir de la coalición.`, onEnter: (c) => [{ type: 'world', op: 'coalition_exit', args: { coalitionId: String(c.v.coalitionId), partyId: String(c.v.partyId) } }, npcMem(c, 'conflicto', 'Ruptura de la coalición', 'decisivo'), react(`${first(c.npc)} anuncia la salida de su partido del Gobierno.`)], end: 'ruptura de la coalición' },
  },
};
