/**
 * CARRERA INDIVIDUAL Y RELACIONES: colaboración tras un ascenso, pedir respaldo (negociación),
 * mentoría y su posible giro a competencia, reconciliación y cobro de compromisos.
 */
import type { DialogueDefinition, DialogueCtx, NegotiationItem } from '../types';
import { REGION_BY_ID } from '../../data/geography';
import { officeLabel } from '../../systems/characters';
import { fn, first } from '../world';
import { sty, oa } from '../text';
import { dispo, myRel, noise, npcMem, npcRel, pers, react, usefulness } from './helpers';
import { evaluateProposal, recordProposal } from '../negotiation';
import { goalsOf } from '../goals';
import { memoriesOf } from '../memory';
import { getRel } from '../relations';
import { capitalOf } from '../../career/capital';

const proc = (c: DialogueCtx) => c.s.career.processes.find((p) => p.id === c.v.processId);
const negotiate = (c: DialogueCtx, offer: NegotiationItem[], ask: NegotiationItem[], round: number, bonus = 0) => {
  const ev = evaluateProposal(c.s, c.rng, c.npc.id, offer, ask, round);
  ev.score += bonus;
  const response = ev.score > 18 ? 'acepta' : ev.score > 4 ? 'contraoferta' : ev.score > -8 ? (round === 0 ? 'posterga' : 'consulta') : 'rechaza';
  recordProposal(c.s, c.sess.id, c.me.id, offer, ask, round, response);
  c.v.lastScore = Math.round(ev.score);
  return response;
};

// ───────────────────────── Colaboración tras un ascenso (consecuencia diferida) ─────────────────────────
export const COLABORACION_ASCENSO: DialogueDefinition = {
  id: 'colaboracion_ascenso', area: 'carrera', kind: 'estrategica', title: 'Una conversación pendiente', maxExchanges: 6, formality: 'privada', initiators: ['ia'], cooldownWeeks: 26,
  setup: (s, args) => {
    const npc = s.characters[String(args.fromId)]; if (!npc || npc.status !== 'activo') return null;
    return { participants: [npc.id], place: 'Café cerca de la sede regional', motive: `${fn(npc)} quiere conversar sobre lo que viene`, vars: { region: REGION_BY_ID[npc.regionId].name } };
  },
  start: 'inicio',
  nodes: {
    inicio: {
      text: (c) => {
        const kept = memoriesOf(c.s, c.npc.id, c.me.id).some((m) => m.kind === 'promesa_cumplida' || m.kind === 'apoyo_recibido');
        return kept
          ? sty(c, 'i1', { default: [`No me olvido de que estuviste cuando había que estar. Ahora que tengo más responsabilidades en ${c.v.region}, quiero saber qué planes tienes.`], directo: ['Tú cumpliste en la campaña. Yo no me olvido de eso. ¿Qué quieres hacer ahora?'] })
          : sty(c, 'i2', { default: [`Han pasado varios meses desde que hablamos. Me interesa saber en qué estás y si podemos trabajar juntos.`] });
      },
      options: [
        { id: 'aspira', text: 'Estoy pensando en postular en la próxima elección municipal. Me gustaría contar con tu apoyo.', next: 'eval_aspira' },
        { id: 'equipo', text: 'Me interesa seguir trabajando en el partido, con más responsabilidades.', next: 'eval_equipo' },
        { id: 'distancia', text: 'Por ahora prefiero concentrarme en mi comuna. Pero gracias por buscarme.', effects: (c) => [npcRel(c, { willingness: -2 }, 'menor')], next: 'fin_neutro' },
      ],
    },
    eval_aspira: {
      text: '',
      decide: (c) => {
        const rivalSelf = goalsOf(c.s, c.npc).some((g) => g.kind === 'candidatura');
        if (rivalSelf) return 'compite';
        const r = negotiate(c, [], [{ kind: 'apoyo_aspiracion', by: c.npc.id, label: 'Apoyo a tu aspiración' }], 0, memoriesOf(c.s, c.npc.id, c.me.id).some((m) => m.kind === 'promesa_cumplida') ? 12 : 0);
        return r === 'acepta' ? 'apoya' : r === 'contraoferta' ? 'pide_algo' : r === 'rechaza' ? 'no_apoya' : 'consultara';
      },
    },
    apoya: {
      text: (c) => sty(c, 'ap', { default: ['Cuenta conmigo cuando llegue el momento. Pero ojo: yo no decido solo, la directiva y las encuestas también pesan.'] }),
      onEnter: (c) => [{ type: 'commitment', c: { debtor: c.npc.id, creditor: c.me.id, kind: 'apoyo_aspiracion', content: `${first(c.npc)} respaldará tu próxima aspiración`, dueWeek: c.s.week + 130, conditions: {}, visibility: 'privado', importance: 'compromiso' } }, npcMem(c, 'acuerdo', 'Prometió respaldar su próxima aspiración', 'compromiso')],
      options: [{ id: 'gracias', text: 'Es todo lo que te puedo pedir.', next: 'fin_acuerdo' }],
    },
    pide_algo: {
      text: (c) => sty(c, 'pa', { default: ['Te apoyo, pero necesito algo de vuelta: en la próxima interna quiero tu voto y que trabajes con mi gente.'], directo: ['Apoyo por apoyo. En la próxima interna estás conmigo.'] }),
      options: [
        { id: 'acepta', text: 'Me parece justo. En la interna estoy contigo.', when: [{ test: (c) => !!c.me.partyId }],
          effects: (c) => [
            { type: 'commitment', c: { debtor: c.npc.id, creditor: c.me.id, kind: 'apoyo_aspiracion', content: `${first(c.npc)} respaldará tu próxima aspiración`, dueWeek: c.s.week + 130, conditions: {}, visibility: 'privado', importance: 'compromiso' } },
            { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'apoyo_interna', content: `Respaldar a ${fn(c.npc)} en la próxima interna`, dueWeek: c.s.week + 130, conditions: { partyId: c.me.partyId!, leadershipWeek: c.s.parties[c.me.partyId!].nextLeadershipWeek }, visibility: 'privado', importance: 'compromiso' } },
            npcRel(c, { trust: 6, cooperation: 6 }), npcMem(c, 'acuerdo', 'Intercambio de apoyos: aspiración por interna', 'compromiso')], next: 'fin_acuerdo' },
        { id: 'rechaza', text: 'Mi apoyo en la interna no lo puedo comprometer todavía.', effects: (c) => [npcRel(c, { willingness: -4 }, 'menor')], next: 'fin_neutro' },
      ],
    },
    no_apoya: {
      text: (c) => sty(c, 'na', { default: [`Te voy a ser honest${oa(c.npc)}: no veo condiciones para comprometerme ahora. Hay otras personas con más recorrido pidiendo lo mismo.`], formal: ['No estoy en condiciones de comprometer mi apoyo en este momento. Hay otras aspiraciones en conversación.'] }),
      onEnter: () => [react('No consigues el compromiso, aunque la relación no se rompe.')],
      options: [{ id: 'ok', text: 'Entiendo. Igual seguimos conversando.', next: 'fin_neutro' }],
    },
    consultara: {
      text: () => 'Déjame conversarlo con la gente de la directiva. Te aviso.',
      onEnter: (c) => [{ type: 'defer', inWeeks: 3, op: 'decide_backing', args: { npcId: c.npc.id }, note: 'Responderá más adelante' }],
      options: [{ id: 'ok', text: (c) => `Quedo atent${oa(c.me)}.`, next: 'fin_neutro' }],
    },
    compite: {
      text: (c) => sty(c, 'cp', { default: ['Mira, yo también estoy pensando en esa elección. Sería raro que te prometiera algo.'], directo: ['Yo también voy. No te puedo apoyar en eso.'] }),
      onEnter: (c) => [npcRel(c, { rivalry: 8 }, 'relevante'), react(`${first(c.npc)} aparece como posible competencia.`)],
      options: [
        { id: 'respeta', text: 'Lo entiendo. Que gane quien tenga más apoyo.', effects: (c) => [npcRel(c, { respect: 6 }, 'menor')], next: 'fin_neutro' },
        { id: 'pide_acuerdo', text: 'Podríamos acordar no atacarnos y que el resultado lo defina la gente.', effects: (c) => [npcRel(c, { trust: 4, rivalry: -4 }), npcMem(c, 'acuerdo', 'Acordaron competir sin atacarse', 'relevante')], next: 'fin_neutro' },
      ],
    },
    eval_equipo: { text: '', decide: (c) => (dispo(c) + usefulness(c) * 0.3 - 15 + noise(c, 8) > 0 ? 'da_equipo' : 'no_equipo') },
    da_equipo: { text: (c) => `Te quiero en el equipo regional. Vas a coordinar el trabajo territorial en ${c.v.region}.`, onEnter: (c) => [{ type: 'world', op: 'grant_role', args: { label: `Coordinación territorial en ${c.v.region}` } }, npcRel(c, { cooperation: 8, dependence: 5 })], options: [{ id: 'ok', text: 'Gracias por la confianza.', next: 'fin_acuerdo' }] },
    no_equipo: { text: 'Por ahora los espacios están ocupados. Pero te tengo en cuenta.', options: [{ id: 'ok', text: 'Entiendo.', next: 'fin_neutro' }] },
    fin_acuerdo: { speaker: 'narrador', text: 'Se despiden con un acuerdo.', end: 'acuerdo' },
    fin_neutro: { speaker: 'narrador', text: 'La conversación termina sin compromisos nuevos.', end: 'sin cambios' },
  },
};

// ───────────────────────── Pedir respaldo (negociación con ofertas y contraofertas) ─────────────────────────
export const PEDIR_RESPALDO: DialogueDefinition = {
  id: 'pedir_respaldo', area: 'carrera', kind: 'estrategica', title: 'Pedir respaldo', maxExchanges: 8, formality: 'privada', initiators: ['jugador'], cooldownWeeks: 6,
  setup: (s, args) => {
    const p = s.career.processes.find((x) => x.id === args.processId && (x.status === 'abierto' || x.status === 'preseleccion'));
    const npc = s.characters[String(args.target)];
    const mine = p?.aspirants.find((a) => a.charId === s.player.characterId && a.status !== 'retirado');
    if (!p || !npc || npc.status !== 'activo' || !mine || mine.backers.includes(npc.id) || p.aspirants.some((a) => a.charId === npc.id && a.status !== 'retirado')) return null;
    return { participants: [npc.id], place: npc.offices.length ? `Oficina de ${fn(npc)}` : 'Sede del partido', motive: `Pedir respaldo para tu aspiración en ${p.unitLabel}`, vars: { unit: p.unitLabel, office: officeLabel(p.office, 'x') } };
  },
  label: (s, args) => `Pedir respaldo a ${fn(s.characters[String(args.target)])}`,
  start: 'inicio',
  nodes: {
    inicio: { text: (c) => sty(c, 'i', { default: ['Cuéntame, ¿en qué te puedo ayudar?'], formal: ['Buenas tardes. Me dijeron que querías conversar conmigo. Te escucho.'], directo: ['Tengo diez minutos. ¿Qué necesitas?'], reservado: ['Dime.'] }),
      options: [
        { id: 'directo', text: (c) => `Quiero pedirte tu respaldo para mi aspiración en ${c.v.unit}.`, next: 'eval_directo' },
        { id: 'interna', text: 'Si me respaldas ahora, cuenta con mi voto cuando se dispute la conducción del partido.', when: [{ test: (c) => goalsOf(c.s, c.npc).some((g) => g.kind === 'ganar_interna' || g.kind === 'proteger_liderazgo') && c.npc.partyId === c.me.partyId }], next: 'eval_interna' },
        { id: 'numeros', text: (c) => `Antes de pedirte nada, quiero mostrarte los números de mi trabajo en ${c.v.unit}: organización, contactos y resultados.`, when: [{ test: (c) => capitalOf(c.s).territorial >= 20 || c.me.rep.prestigioTecnico >= 45 }], next: 'eval_numeros' },
        { id: 'indaga', text: '¿Ya tienes una preferencia en este proceso? Quisiera entender cómo lo ves.', next: 'indaga' },
      ] },
    eval_directo: { text: '', decide: (c) => { const r = negotiate(c, [], [{ kind: 'apoyo_aspiracion', by: c.npc.id, label: 'Respaldo' }], 0); return r === 'acepta' ? 'respalda' : r === 'contraoferta' ? 'contra' : r === 'rechaza' ? 'rechaza' : 'posterga'; } },
    eval_interna: { text: '', decide: (c) => { const r = negotiate(c, [{ kind: 'apoyo_interna', by: c.me.id, label: 'Tu voto en la interna' }], [{ kind: 'apoyo_aspiracion', by: c.npc.id, label: 'Respaldo' }], 0); c.v.offeredInterna = true; return r === 'acepta' ? 'respalda' : r === 'contraoferta' ? 'contra' : r === 'rechaza' ? 'rechaza' : 'posterga'; } },
    eval_numeros: { text: '', decide: (c) => { const r = negotiate(c, [], [{ kind: 'apoyo_aspiracion', by: c.npc.id, label: 'Respaldo' }], 0, 10); return r === 'acepta' ? 'respalda' : r === 'contraoferta' ? 'contra' : r === 'rechaza' ? 'rechaza' : 'posterga'; } },
    indaga: {
      text: (c) => {
        const p = proc(c); const others = (p?.aspirants ?? []).filter((a) => a.charId !== c.me.id && a.status !== 'retirado').map((a) => c.s.characters[a.charId]).filter(Boolean);
        const fav = others.sort((a, b) => getRel(c.s, c.npc.id, b!.id).trust - getRel(c.s, c.npc.id, a!.id).trust)[0];
        return pers(c, 'tecnocrata', 'institucionalista') || !fav ? 'Todavía no tengo una preferencia. Quiero ver cómo se mueven los apoyos.' : `Te soy franc${oa(c.npc)}: con ${fn(fav)} tengo más historia. Pero nada está cerrado.`;
      },
      onEnter: (c) => [{ type: 'info', card: { source: fn(c.npc), text: `Preferencias de ${first(c.npc)} en el proceso de ${c.v.unit} (según su propia versión).`, kind: 'opinion', confirmed: false } }],
      options: [
        { id: 'pide', text: 'Entonces te pido que me consideres. Quiero tu respaldo.', next: 'eval_directo' },
        { id: 'retira', text: 'Gracias por la franqueza. Lo conversamos más adelante.', next: 'fin_neutro' },
      ] },
    respalda: { text: (c) => sty(c, 'rs', { default: ['Está bien, te voy a respaldar. Lo voy a decir en la directiva.'], directo: ['Listo, tienes mi apoyo.'], formal: ['Puedes contar con mi respaldo. Lo haré presente en las instancias que corresponda.'] }),
      onEnter: (c) => [{ type: 'world', op: 'nomination_back', args: { processId: String(c.v.processId), backer: c.npc.id } }, npcMem(c, 'acuerdo', `Respaldó su aspiración en ${c.v.unit}`, 'relevante'), npcRel(c, { cooperation: 6 }),
        ...(c.v.offeredInterna ? [{ type: 'commitment' as const, c: { debtor: c.me.id, creditor: c.npc.id, kind: 'apoyo_interna' as const, content: `Respaldar a ${fn(c.npc)} en la próxima interna`, dueWeek: c.s.week + 130, conditions: { partyId: c.me.partyId!, leadershipWeek: c.s.parties[c.me.partyId!].nextLeadershipWeek }, visibility: 'privado' as const, importance: 'compromiso' as const } }] : [])],
      options: [{ id: 'gracias', text: 'Te lo agradezco. No te voy a dejar mal.', next: 'fin_acuerdo' }] },
    contra: {
      text: (c) => {
        const g = goalsOf(c.s, c.npc)[0];
        c.v.counterKind = g.kind === 'ganar_interna' || g.kind === 'proteger_liderazgo' ? 'apoyo_interna' : g.kind === 'candidatura' ? 'trabajo_campana' : 'apoyo_publico';
        return c.v.counterKind === 'apoyo_interna' ? 'Te puedo respaldar, pero necesito saber que en la interna vas a estar conmigo.'
          : c.v.counterKind === 'trabajo_campana' ? 'Te respaldo si me ayudas en mi campaña. Necesito gente en terreno.'
          : 'Te respaldo, pero quiero que defiendas públicamente el trabajo de la directiva cuando haga falta.';
      },
      options: [
        { id: 'acepta', text: 'Trato hecho.', effects: (c) => [{ type: 'world', op: 'nomination_back', args: { processId: String(c.v.processId), backer: c.npc.id } },
          { type: 'commitment', c: c.v.counterKind === 'apoyo_interna' && c.me.partyId ? { debtor: c.me.id, creditor: c.npc.id, kind: 'apoyo_interna', content: `Respaldar a ${fn(c.npc)} en la próxima interna`, dueWeek: c.s.week + 130, conditions: { partyId: c.me.partyId, leadershipWeek: c.s.parties[c.me.partyId].nextLeadershipWeek }, visibility: 'privado', importance: 'compromiso' }
            : c.v.counterKind === 'trabajo_campana' ? { debtor: c.me.id, creditor: c.npc.id, kind: 'trabajo_campana', content: `Trabajar en la campaña de ${fn(c.npc)}`, dueWeek: c.s.week + 40, conditions: {}, visibility: 'privado', importance: 'compromiso' }
            : { debtor: c.me.id, creditor: c.npc.id, kind: 'acuerdo_programatico', content: `Defender públicamente a la directiva cuando ${first(c.npc)} lo pida`, dueWeek: c.s.week + 52, conditions: {}, visibility: 'privado', importance: 'relevante' } },
          npcMem(c, 'negociacion', `Respaldo a cambio de ${String(c.v.counterKind).replace('_', ' ')}`, 'compromiso'), npcRel(c, { cooperation: 5 })], next: 'fin_acuerdo' },
        { id: 'contraoferta', text: 'Eso no te lo puedo prometer. Lo que sí puedo es acompañarte en las actividades de la región.', next: 'eval_ronda2' },
        { id: 'rechaza', text: 'Prefiero no comprometerme así.', effects: (c) => [npcRel(c, { willingness: -3 }, 'menor')], next: 'fin_neutro' },
      ] },
    eval_ronda2: { text: '', decide: (c) => (negotiate(c, [{ kind: 'apoyo_publico', by: c.me.id, label: 'Acompañamiento en actividades' }], [{ kind: 'apoyo_aspiracion', by: c.npc.id, label: 'Respaldo' }], 1) === 'acepta' ? 'respalda' : 'fracasa') },
    fracasa: { text: (c) => sty(c, 'fr', { default: ['No me alcanza. Lo siento, esta vez no.'], conciliador: ['Te entiendo, de verdad, pero así no puedo. Sigamos conversando más adelante.'] }), onEnter: (c) => [npcMem(c, 'negociacion', 'Negociación de respaldo sin acuerdo', 'relevante'), react('La negociación fracasa, aunque ambos dejan la puerta abierta.')], end: 'negociación fallida' },
    rechaza: { text: (c) => sty(c, 'rj', { default: ['No te voy a respaldar en este proceso. No es personal.'], directo: ['No. Tengo otros compromisos.'], formal: ['Lamentablemente, no estoy en condiciones de entregarte mi respaldo en este proceso.'] }),
      onEnter: (c) => [npcMem(c, 'apoyo_rechazado', 'Le negó su respaldo', 'menor')], end: 'rechazo' },
    posterga: { text: () => 'Déjame pensarlo. Te respondo en un par de semanas.', onEnter: (c) => [{ type: 'defer', inWeeks: 2, op: 'decide_backing', args: { npcId: c.npc.id, processId: String(c.v.processId) }, note: 'Decisión pendiente' }], end: 'pendiente' },
    fin_acuerdo: { speaker: 'narrador', text: 'Sales con un acuerdo.', end: 'acuerdo' },
    fin_neutro: { speaker: 'narrador', text: 'La reunión termina sin acuerdo.', end: 'sin acuerdo' },
  },
};

// ───────────────────────── Mentoría ─────────────────────────
export const MENTORIA: DialogueDefinition = {
  id: 'mentoria', area: 'relaciones', kind: 'estrategica', title: 'Una oferta de apoyo', maxExchanges: 5, formality: 'privada', initiators: ['ia'], cooldownWeeks: 52,
  setup: (s, args) => { const npc = s.characters[String(args.fromId)]; if (!npc || npc.status !== 'activo') return null; return { participants: [npc.id], place: `Oficina de ${fn(npc)}`, motive: `${fn(npc)} quiere ofrecerte su apoyo`, vars: {} }; },
  start: 'inicio',
  nodes: {
    inicio: { text: (c) => sty(c, 'i', { default: [`Te he estado siguiendo. Tienes condiciones, pero te falta red. Si quieres, te puedo abrir algunas puertas: presentarte gente, darte consejos, respaldarte cuando corresponda.`], institucional: ['Quiero ofrecerte algo: acompañarte en tu desarrollo dentro del partido. Tengo experiencia y contactos que te pueden servir.'], directo: ['Te voy a ayudar, si quieres. Conozco a quien hay que conocer. A cambio, te pido lealtad.'] }),
      options: [
        { id: 'acepta', text: 'Te lo agradezco. Me encantaría aprender de ti.', effects: (c) => [
          { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'lealtad', content: `No competir contra ${fn(c.npc)} y respaldarl${oa(c.npc)} en lo esencial`, dueWeek: c.s.week + 156, conditions: {}, visibility: 'conocido', importance: 'compromiso' } },
          { type: 'commitment', c: { debtor: c.npc.id, creditor: c.me.id, kind: 'apoyo_aspiracion', content: `${first(c.npc)} respaldará tu próxima aspiración`, dueWeek: c.s.week + 156, conditions: {}, visibility: 'privado', importance: 'compromiso' } },
          npcRel(c, { trust: 10, cooperation: 8, personal: 6 }), myRel(c, { dependence: 15 }, 'relevante'), npcMem(c, 'acuerdo', 'Aceptó su mentoría', 'compromiso'), { type: 'world', op: 'party_trust', args: { delta: 3 } },
          { type: 'defer', inWeeks: 60, op: 'invite_if', args: { fromId: c.npc.id, defId: 'mentor_competencia', cond: 'mentor_rivalry', motive: `${first(c.npc)} pide verte. Suena serio.` }, note: 'El mentor podría ver competencia' }], next: 'fin_acuerdo' },
        { id: 'independencia', text: (c) => `Te agradezco el apoyo, pero quiero ser clar${oa(c.me)}: voy a tomar mis propias decisiones.`, effects: (c) => [npcRel(c, { respect: 8, trust: 2 }), npcMem(c, 'negociacion', 'Aceptó su consejo sin comprometer lealtad', 'relevante')], next: 'eval_indep' },
        { id: 'declina', text: 'Prefiero hacer mi camino por mi cuenta, al menos por ahora.', effects: (c) => [npcRel(c, { personal: -4, willingness: -4 }), npcMem(c, 'apoyo_rechazado', 'Rechazó su ofrecimiento de mentoría', 'relevante')], next: 'fin_neutro' },
      ] },
    eval_indep: { text: '', decide: (c) => (pers(c, 'conciliador', 'institucionalista', 'tecnocrata') || dispo(c) > 15 ? 'acepta_indep' : 'molesto') },
    acepta_indep: { text: 'Me gusta eso. Los que dicen que sí a todo no llegan lejos.', onEnter: (c) => [npcRel(c, { respect: 6 })], options: [{ id: 'ok', text: 'Entonces seguimos conversando.', next: 'fin_acuerdo' }] },
    molesto: { text: 'Bueno. Yo ofrezco una vez.', onEnter: (c) => [npcRel(c, { willingness: -6 })], end: 'sin acuerdo' },
    fin_acuerdo: { speaker: 'narrador', text: 'Comienza una relación de apoyo.', end: 'acuerdo' },
    fin_neutro: { speaker: 'narrador', text: 'Se despiden con cortesía.', end: 'sin cambios' },
  },
};

export const MENTOR_COMPETENCIA: DialogueDefinition = {
  id: 'mentor_competencia', area: 'relaciones', kind: 'estrategica', title: 'Una conversación incómoda', maxExchanges: 6, formality: 'privada', initiators: ['ia'], cooldownWeeks: 52,
  setup: (s, args) => { const npc = s.characters[String(args.fromId)]; if (!npc || npc.status !== 'activo') return null; return { participants: [npc.id], place: `Oficina de ${fn(npc)}`, motive: `${fn(npc)} quiere hablar de tus planes`, vars: {} }; },
  start: 'inicio',
  nodes: {
    inicio: { text: (c) => sty(c, 'i', { default: ['Me dicen que estás pensando en ir por más. Prefiero escucharlo de ti antes que en los pasillos.'], directo: ['Voy al punto: ¿estás pensando en competir conmigo?'] }),
      options: [
        { id: 'tranquiliza', text: 'No voy a competir contigo. Lo que tengo te lo debo en parte a ti.', effects: (c) => [npcRel(c, { trust: 6, rivalry: -6 }), { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'lealtad', content: `No competir contra ${fn(c.npc)} en los próximos dos años`, dueWeek: c.s.week + 104, conditions: {}, visibility: 'privado', importance: 'compromiso' } }], next: 'fin' },
        { id: 'franco', text: 'Sí, lo estoy pensando. Creo que tengo derecho a crecer, y quería que lo supieras por mí.', next: 'eval_franco' },
        { id: 'propone', text: 'Podemos repartirnos el espacio: tú sigues en lo tuyo y yo busco en otro territorio.', next: 'eval_propone' },
      ] },
    eval_franco: { text: '', decide: (c) => (pers(c, 'conciliador', 'institucionalista') && dispo(c) > 10 ? 'acepta_franco' : 'ruptura') },
    acepta_franco: { text: 'Duele, pero lo respeto. Que sea limpio.', onEnter: (c) => [npcRel(c, { respect: 8, rivalry: 15 }), npcMem(c, 'conflicto', 'Le anunció que competiría', 'relevante')], end: 'competencia leal' },
    ruptura: { text: 'Entonces se acabó lo que había. No esperes nada más de mí.', onEnter: (c) => [npcRel(c, { trust: -20, rivalry: 30, personal: -12 }, 'decisivo'), npcMem(c, 'conflicto', 'Decidió competir contra quien le apoyó', 'decisivo'), react('Tu antiguo apoyo pasa a ser un competidor.')], end: 'ruptura' },
    eval_propone: { text: '', decide: (c) => (dispo(c) + noise(c, 10) > 0 ? 'acepta_reparto' : 'ruptura') },
    acepta_reparto: { text: 'Eso puede funcionar. Pero tiene que ser de verdad.', onEnter: (c) => [npcRel(c, { trust: 4, rivalry: -3 }), npcMem(c, 'acuerdo', 'Acordaron no disputar el mismo territorio', 'compromiso')], end: 'acuerdo' },
    fin: { speaker: 'narrador', text: 'La tensión baja, por ahora.', end: 'acuerdo' },
  },
};

// ───────────────────────── Reconciliación ─────────────────────────
export const RECONCILIACION: DialogueDefinition = {
  id: 'reconciliacion', area: 'relaciones', kind: 'estrategica', title: 'Buscar una reconciliación', maxExchanges: 5, formality: 'privada', initiators: ['jugador'], cooldownWeeks: 12,
  setup: (s, args) => { const npc = s.characters[String(args.target)]; if (!npc || npc.status !== 'activo') return null; return { participants: [npc.id], place: 'Un café neutral', motive: `Intentar recomponer la relación con ${fn(npc)}`, vars: {} }; },
  label: (s, args) => `Buscar una reconciliación con ${fn(s.characters[String(args.target)])}`,
  start: 'inicio',
  nodes: {
    inicio: { text: (c) => { const broken = memoriesOf(c.s, c.npc.id, c.me.id).find((m) => m.kind === 'promesa_incumplida'); return broken ? `Vine porque me lo pediste. Pero no me olvido de lo que pasó: ${broken.summary.toLowerCase()}.` : sty(c, 'i', { default: ['Me sorprendió tu llamado. ¿Qué quieres?'], formal: ['Agradezco la invitación. Te escucho.'] }); },
      options: [
        { id: 'disculpa', text: 'Quiero reconocer que me equivoqué contigo. No vengo a pedirte nada, solo a decirlo.', next: 'eval_disculpa' },
        { id: 'conveniencia', text: 'No tenemos que ser amigos. Pero en lo que viene nos conviene trabajar coordinados.', next: 'eval_conveniencia' },
        { id: 'explica', text: 'Quiero explicarte lo que pasó. No fue una decisión contra ti: cambiaron las condiciones.', when: [{ test: (c) => c.s.dialogue!.commitments.some((x) => x.creditor === c.npc.id && x.debtor === c.me.id && x.status === 'incumplido' && x.breach !== 'deliberado') }], next: 'eval_explica' },
      ] },
    eval_disculpa: { text: '', decide: (c) => { const old = memoriesOf(c.s, c.npc.id, c.me.id).filter((m) => m.kind === 'conflicto' || m.kind === 'promesa_incumplida').every((m) => c.s.week - m.week > 26); return (old && !pers(c, 'confrontacional')) || pers(c, 'conciliador') ? 'acepta' : 'parcial'; } },
    acepta: { text: 'Te lo agradezco. No es fácil decir eso. Empecemos de nuevo, con calma.', onEnter: (c) => [npcRel(c, { trust: 10, rivalry: -12, personal: 8 }), npcMem(c, 'reconciliacion', 'Reconoció su error y pidió recomponer la relación', 'relevante')], end: 'reconciliación' },
    parcial: { text: 'Te escucho. Pero la confianza no se recupera con una conversación.', onEnter: (c) => [npcRel(c, { trust: 3, rivalry: -4 }), npcMem(c, 'reconciliacion', 'Intentó recomponer la relación', 'menor')], end: 'reconciliación parcial' },
    eval_conveniencia: { text: '', decide: (c) => (pers(c, 'pragmatico', 'ambicioso', 'territorial') ? 'pragmatico' : 'frio') },
    pragmatico: { text: 'De acuerdo. Coordinemos lo que nos conviene a ambos. El resto, ya veremos.', onEnter: (c) => [npcRel(c, { willingness: 10, rivalry: -5 }), npcMem(c, 'acuerdo', 'Cooperación por conveniencia', 'relevante')], end: 'cooperación por conveniencia' },
    frio: { text: 'No es así como funciono. Si no hay confianza, no hay coordinación.', end: 'sin acuerdo' },
    eval_explica: { text: '', decide: (c) => (dispo(c) + noise(c, 8) > -25 ? 'entiende' : 'parcial') },
    entiende: { text: 'Visto así, lo entiendo mejor. No te voy a decir que no me molestó.', onEnter: (c) => [npcRel(c, { reliability: 10, trust: 6 }), npcMem(c, 'reconciliacion', 'Explicó las circunstancias de un incumplimiento', 'relevante')], end: 'reconciliación parcial' },
  },
};

// ───────────────────────── Cobro de un compromiso ─────────────────────────
export const COBRO: DialogueDefinition = {
  id: 'cobro_compromiso', area: 'relaciones', kind: 'estrategica', title: 'Un compromiso pendiente', maxExchanges: 5, formality: 'privada', initiators: ['ia'], cooldownWeeks: 8,
  setup: (s, args) => { const cm = s.dialogue?.commitments.find((x) => x.id === args.commitmentId && x.status === 'vigente'); const npc = cm ? s.characters[cm.creditor] : null; if (!cm || !npc || npc.status !== 'activo') return null; return { participants: [npc.id], place: 'Sede del partido', motive: `${fn(npc)} quiere hablar de lo que acordaron`, vars: { content: cm.content, commitmentId: cm.id } }; },
  start: 'inicio',
  nodes: {
    inicio: { text: (c) => sty(c, 'i', { default: [`Se acerca el momento. Te quiero recordar lo que conversamos: ${String(c.v.content).toLowerCase()}. ¿Sigue en pie?`], directo: [`¿Sigue en pie lo que acordamos? (${String(c.v.content).toLowerCase()})`] }),
      options: [
        { id: 'confirma', text: 'Sigue en pie. Cuenta conmigo.', effects: (c) => { const cm = c.s.dialogue!.commitments.find((x) => x.id === c.v.commitmentId); return [npcRel(c, { trust: 5, reliability: 6 }), ...(cm?.kind === 'apoyo_interna' ? [{ type: 'world' as const, op: 'declare_support', args: { charId: c.npc.id } }] : [])]; }, next: 'fin' },
        { id: 'renegocia', text: 'Las cosas cambiaron. Quiero cumplir, pero necesito que ajustemos los términos.', next: 'eval_reneg' },
        { id: 'rompe', text: 'No voy a poder cumplir. Prefiero decírtelo de frente.', next: 'rompe' },
      ] },
    eval_reneg: { text: '', decide: (c) => (dispo(c) + noise(c, 8) > 5 ? 'acepta_reneg' : 'no_reneg') },
    acepta_reneg: { text: 'Está bien. Lo ajustamos, pero que no se vuelva costumbre.', onEnter: (c) => { const cm = c.s.dialogue!.commitments.find((x) => x.id === c.v.commitmentId); if (cm) { cm.status = 'renegociado'; cm.resolvedWeek = c.s.week; } return [npcRel(c, { reliability: -3 }, 'menor')]; }, end: 'renegociado' },
    no_reneg: { text: 'Un acuerdo es un acuerdo. Si no cumples, lo voy a tener presente.', options: [
      { id: 'cumple', text: 'Entonces cumplo.', effects: (c) => [npcRel(c, { trust: 3 }, 'menor')], next: 'fin' },
      { id: 'rompe2', text: 'Lo siento. No puedo.', next: 'rompe' },
    ] },
    rompe: { text: 'Te agradezco que me lo digas de frente. No te voy a mentir: esto cambia las cosas entre nosotros.', onEnter: (c) => { const cm = c.s.dialogue!.commitments.find((x) => x.id === c.v.commitmentId); if (cm && cm.status === 'vigente') { cm.status = 'incumplido'; cm.breach = 'deliberado'; cm.resolvedWeek = c.s.week; cm.note = 'avisó de frente'; } return [npcRel(c, { trust: -12, reliability: -18, rivalry: 8 }, 'compromiso'), npcMem(c, 'promesa_incumplida', `Avisó que no cumpliría: ${String(c.v.content).toLowerCase()}`, 'compromiso'), { type: 'rep', dim: 'cumplimiento', delta: -4 }]; }, end: 'incumplimiento declarado' },
    fin: { speaker: 'narrador', text: 'El acuerdo se mantiene.', end: 'acuerdo' },
  },
};
