/**
 * ELECCIONES INTERNAS — «Una lista para la regional» (ejemplo completo del sistema).
 * Un/a dirigente regional ficticio/a invita a integrar su lista para la directiva regional del partido.
 * Ramas: interés (A), pedir responsabilidades (B), mantener independencia (C), crítica a la conducción (D),
 * y una opción condicionada para quien tiene base territorial propia.
 */
import type { DialogueDefinition } from '../types';
import { REGION_BY_ID } from '../../data/geography';
import { fn, first } from '../world';
import { sty, oa } from '../text';
import { comunaOf, dispo, noise, npcMem, npcRel, pers, react, respectOf, usefulness } from './helpers';
import { capitalOf } from '../../career/capital';

const raceOf = (c: { s: import('../../models/types').GameState; v: Record<string, string | number | boolean> }) => c.s.dialogue!.races.find((r) => r.id === c.v.raceId);

export const LISTA_REGIONAL: DialogueDefinition = {
  id: 'lista_regional', area: 'internas', kind: 'estrategica', title: 'Una lista para la regional', maxExchanges: 8, formality: 'privada', initiators: ['ia', 'jugador'], cooldownWeeks: 3,
  setup: (s, args) => {
    const race = s.dialogue?.races.find((r) => r.id === args.raceId && r.status === 'abierta');
    const me = s.characters[s.player.characterId];
    if (!race || !me?.partyId || me.partyId !== race.partyId) return null;
    const list = race.lists.find((l) => l.id === (args.listId ?? 'A')) ?? race.lists[0];
    const rival = race.lists.find((l) => l.id !== list.id)!;
    const head = s.characters[list.headId]; if (!head || head.status !== 'activo') return null;
    return {
      participants: [head.id], place: `Sede regional de ${s.parties[race.partyId].short}, ${REGION_BY_ID[race.regionId].name}`,
      motive: `${fn(head)} arma una lista para la elección de la directiva regional`,
      vars: { raceId: race.id, listId: list.id, rivalId: rival.headId, rival: fn(s.characters[rival.headId]), party: s.parties[race.partyId].short, region: REGION_BY_ID[race.regionId].name, weeks: race.week - s.week },
    };
  },
  label: (s, args) => { const race = s.dialogue?.races.find((r) => r.id === args.raceId); const l = race?.lists.find((x) => x.id === args.listId); return `Conversar con ${fn(s.characters[l?.headId ?? ''])} sobre la directiva regional`; },
  start: 'inicio',
  nodes: {
    inicio: {
      text: (c) => c.sess.initiator === 'jugador'
        ? sty(c, 'ini_j', { default: [`Pasa, siéntate. Me dijeron que querías conversar sobre la elección regional. Estamos armando la lista y nos faltan personas que conozcan el territorio.`], directo: ['Al grano: estoy armando lista para la regional y me sirve gente que conozca las comunas. ¿Qué tienes en mente?'] })
        : sty(c, 'ini', {
          default: [`He visto tu trabajo en las últimas actividades en ${comunaOf(c)}. Estamos preparando una lista para la elección de la directiva regional de ${c.v.party} y necesitamos personas que conozcan el territorio.`],
          directo: [`Te voy a hablar derecho: estoy armando lista para la regional de ${c.v.party} y quiero gente que haya caminado ${comunaOf(c)}. Tú lo has hecho.`],
          formal: [`Gracias por venir. Como sabes, en ${c.v.weeks} semanas elegimos la directiva regional de ${c.v.party}. Estamos conformando una lista y tu nombre apareció por el trabajo que has hecho en ${comunaOf(c)}.`],
          conciliador: [`Qué bueno que pudiste venir. Hemos visto cómo te has movido en ${comunaOf(c)} y nos gustaría que fueras parte de la lista para la regional. Queremos un equipo amplio.`],
          persuasivo: [`La regional de ${c.v.party} necesita renovarse, y eso no se hace solo con los mismos de siempre. Por eso pensé en ti: conoces ${comunaOf(c)} y la gente te ubica.`],
        }),
      options: [
        { id: 'interes', text: 'Me interesa participar. ¿Qué responsabilidades tendríamos?', next: 'explica' },
        { id: 'pedir', text: 'Estoy disponible para ayudarte, pero también quiero empezar a asumir responsabilidades.', next: 'evalua_pedido' },
        { id: 'otras', text: (c) => `Antes de comprometerme, quisiera conocer la propuesta de ${c.v.rival}.`, next: 'evalua_independencia' },
        { id: 'critica', text: 'No creo que la actual conducción sea el camino adecuado para el partido.', next: 'reaccion_critica' },
        { id: 'base', text: (c) => `Puedo sumar a la gente con la que trabajo en ${comunaOf(c)}, pero quiero que la lista tenga a alguien de esa base en un lugar visible.`,
          when: [{ test: (c) => capitalOf(c.s).territorial >= 25, why: 'Requiere una base territorial propia' }], next: 'evalua_base' },
      ],
    },
    explica: {
      text: (c) => sty(c, 'exp', {
        default: [`Necesito a alguien que coordine ${comunaOf(c)}: reuniones con las bases, despliegue puerta a puerta y la jornada de votación. Si ganamos, quiero que sigas en el equipo regional.`],
        tecnico: [`Te explico cómo lo tenemos organizado: un coordinador por comuna, metas de contacto semanales y un registro de militantes que efectivamente votan. Para ${comunaOf(c)} no tengo a nadie.`],
        directo: [`Coordinación de ${comunaOf(c)}. Puerta a puerta, reuniones y el día de la votación. Si ganamos, sigues con nosotros.`],
      }),
      options: [
        { id: 'acepta', text: (c) => `Cuenta conmigo. Me hago cargo de ${comunaOf(c)}.`,
          effects: (c) => [
            { type: 'world', op: 'race_join', args: { raceId: String(c.v.raceId), listId: String(c.v.listId) } },
            { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'apoyo_lista', content: `Integrar y trabajar por la lista de ${fn(c.npc)} en la elección regional`, dueWeek: c.s.week + Number(c.v.weeks) + 1, conditions: { raceId: String(c.v.raceId), listId: String(c.v.listId) }, visibility: 'conocido', importance: 'compromiso' } },
            npcRel(c, { trust: 6, cooperation: 8, willingness: 5 }), npcMem(c, 'acuerdo', 'Aceptó coordinar una comuna para su lista'),
            { type: 'defer', inWeeks: 40, op: 'invite_if', args: { fromId: c.npc.id, defId: 'colaboracion_ascenso', cond: 'regional_president', motive: `${first(c.npc)} quiere conversar sobre lo que viene en la regional.` }, note: 'Posible colaboración futura' },
          ], next: 'cierre_acuerdo' },
        { id: 'condiciona', text: 'Me sumo, pero quiero un lugar en la directiva si ganamos.', next: 'evalua_pedido' },
        { id: 'pensar', text: 'Déjame pensarlo unos días y te respondo.',
          effects: (c) => [{ type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'reunion_seguimiento', content: `Responder a ${fn(c.npc)} sobre la lista`, dueWeek: c.s.week + 3, conditions: {}, visibility: 'privado', importance: 'menor' } },
            { type: 'defer', inWeeks: 2, op: 'invite_if', args: { fromId: c.npc.id, defId: 'lista_regional', raceId: String(c.v.raceId), listId: String(c.v.listId), cond: 'race_open', motive: `${first(c.npc)} espera tu respuesta sobre la lista.` }, note: 'Seguimiento' }],
          next: 'cierre_pendiente' },
        { id: 'declina', text: 'Te agradezco que pensaras en mí, pero ahora no puedo comprometer el tiempo que esto requiere.',
          effects: (c) => [npcRel(c, { willingness: -3 }, 'menor'), npcMem(c, 'apoyo_rechazado', 'Declinó sumarse a su lista por falta de tiempo', 'menor')], next: 'cierre_rechazo' },
      ],
    },
    evalua_pedido: {
      text: '',
      decide: (c) => {
        const race = raceOf(c);
        const pressure = race ? Math.max(0, 12 - (race.week - c.s.week)) * 2 : 0; // cuanto más cerca la inscripción, más necesita sumar
        const score = usefulness(c) * 0.6 + dispo(c) * 0.4 + pressure - (pers(c, 'ambicioso', 'confrontacional') ? 12 : 0) + (pers(c, 'conciliador', 'pragmatico') ? 6 : 0) - 14 + noise(c, 9);
        return score > 22 ? 'ofrece_cargo' : score > 6 ? 'pide_pruebas' : score > -8 ? 'alternativa' : 'rechaza_pedido';
      },
    },
    ofrece_cargo: {
      text: (c) => sty(c, 'ofr', {
        default: [`Está bien. Si ganamos, te propongo como encargad${oa(c.me)} territorial de ${comunaOf(c)} en la directiva. Pero necesito que te la juegues en la campaña, no que aparezcas el día de la votación.`],
        directo: [`Trato: si ganamos, quedas a cargo de ${comunaOf(c)} en la directiva. A cambio, te quiero en terreno todas las semanas.`],
        formal: [`Puedo comprometer lo siguiente: de ganar la elección, propondré tu nombre como responsable territorial de ${comunaOf(c)}. Espero, a cambio, un trabajo constante en la campaña.`],
      }),
      onEnter: (c) => [react(`${first(c.npc)} acepta darte un espacio, condicionado al resultado.`)],
      options: [
        { id: 'acepta_cargo', text: 'De acuerdo. Te prometo trabajo en terreno todas las semanas.',
          effects: (c) => [
            { type: 'world', op: 'race_join', args: { raceId: String(c.v.raceId), listId: String(c.v.listId) } },
            { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'apoyo_lista', content: `Trabajar en terreno por la lista de ${fn(c.npc)} hasta la elección regional`, dueWeek: c.s.week + Number(c.v.weeks) + 1, conditions: { raceId: String(c.v.raceId), listId: String(c.v.listId) }, visibility: 'conocido', importance: 'compromiso' } },
            { type: 'commitment', c: { debtor: c.npc.id, creditor: c.me.id, kind: 'equipo', content: `Proponerte como responsable territorial si su lista gana`, dueWeek: c.s.week + Number(c.v.weeks) + 2, conditions: { raceId: String(c.v.raceId), listId: String(c.v.listId) }, visibility: 'privado', importance: 'compromiso' } },
            npcRel(c, { trust: 8, cooperation: 10, respect: 6 }), npcMem(c, 'acuerdo', 'Acordaron integración a cambio de una responsabilidad territorial', 'compromiso'),
            { type: 'defer', inWeeks: 40, op: 'invite_if', args: { fromId: c.npc.id, defId: 'colaboracion_ascenso', cond: 'regional_president', motive: `${first(c.npc)} quiere conversar sobre lo que viene en la regional.` }, note: 'Posible colaboración futura' },
          ], next: 'cierre_acuerdo' },
        { id: 'contra', text: (c) => `Prefiero ir como candidat${oa(c.me)} a la consejería regional del partido, no solo en la coordinación.`, next: 'evalua_contra' },
        { id: 'retira', text: 'Lo voy a pensar. Prefiero no comprometerme con algo que depende del resultado.', effects: (c) => [npcRel(c, { willingness: -2 }, 'menor')], next: 'cierre_pendiente' },
      ],
    },
    evalua_contra: {
      text: '',
      decide: (c) => (usefulness(c) * 0.5 + dispo(c) * 0.3 - 25 + noise(c, 10) > 0 ? 'acepta_contra' : 'rechaza_contra'),
    },
    acepta_contra: {
      text: (c) => sty(c, 'acc', { default: [`Me lo pones difícil, pero está bien. Vas en la lista como candidat${oa(c.me)} a la consejería. Que no se te olvide quién te abrió la puerta.`] }),
      options: [{ id: 'ok', text: 'No se me va a olvidar.', effects: (c) => [
        { type: 'world', op: 'race_join', args: { raceId: String(c.v.raceId), listId: String(c.v.listId) } },
        { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'apoyo_lista', content: `Competir en la lista de ${fn(c.npc)} y respaldarla hasta la elección`, dueWeek: c.s.week + Number(c.v.weeks) + 1, conditions: { raceId: String(c.v.raceId), listId: String(c.v.listId) }, visibility: 'publico', importance: 'compromiso' } },
        { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'lealtad', content: `No competir contra ${fn(c.npc)} en los próximos dos años`, dueWeek: c.s.week + 104, conditions: {}, visibility: 'privado', importance: 'compromiso' } },
        npcRel(c, { trust: 4, respect: 10, dependence: 4 }), npcMem(c, 'negociacion', 'Negoció un lugar visible en su lista', 'relevante'),
      ], next: 'cierre_acuerdo' }],
    },
    rechaza_contra: {
      text: (c) => sty(c, 'rch', { default: ['Eso no lo puedo dar. Los cupos de consejería ya están conversados con los sectores. Lo que te ofrecí sigue en pie.'], directo: ['No. Esos cupos están amarrados. Lo otro sigue en pie, tú decides.'] }),
      options: [
        { id: 'acepta_original', text: 'Está bien, acepto lo de la coordinación.', effects: (c) => [{ type: 'world', op: 'race_join', args: { raceId: String(c.v.raceId), listId: String(c.v.listId) } },
          { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'apoyo_lista', content: `Integrar la lista de ${fn(c.npc)}`, dueWeek: c.s.week + Number(c.v.weeks) + 1, conditions: { raceId: String(c.v.raceId), listId: String(c.v.listId) }, visibility: 'conocido', importance: 'compromiso' } }, npcRel(c, { trust: 4, cooperation: 5 })], next: 'cierre_acuerdo' },
        { id: 'se_va', text: 'Entonces prefiero quedarme fuera esta vez.', effects: (c) => [npcRel(c, { willingness: -5, trust: -3 }), npcMem(c, 'negociacion', 'Negociación fallida por un cupo en su lista', 'relevante')], next: 'cierre_rechazo' },
      ],
    },
    pide_pruebas: {
      text: (c) => sty(c, 'prb', {
        default: [`Las responsabilidades se ganan en la cancha. Organiza el puerta a puerta en ${comunaOf(c)} y conversamos después de la elección.`],
        conciliador: [`Te entiendo, y está bien que lo plantees. Pero primero necesito que la gente te vea trabajando. Organiza ${comunaOf(c)} y después vemos con calma.`],
        reservado: ['Veamos primero cómo resulta la campaña.'],
      }),
      options: [
        { id: 'acepta_prueba', text: 'Me parece justo. Organizo la comuna.', effects: (c) => [{ type: 'world', op: 'race_join', args: { raceId: String(c.v.raceId), listId: String(c.v.listId) } },
          { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'apoyo_lista', content: `Organizar ${comunaOf(c)} para la lista de ${fn(c.npc)}`, dueWeek: c.s.week + Number(c.v.weeks) + 1, conditions: { raceId: String(c.v.raceId), listId: String(c.v.listId) }, visibility: 'conocido', importance: 'compromiso' } },
          npcRel(c, { respect: 8, cooperation: 6 }), npcMem(c, 'acuerdo', 'Aceptó demostrar trabajo antes de pedir cargos')], next: 'cierre_acuerdo' },
        { id: 'insiste', text: 'Sin un compromiso concreto prefiero no sumarme.', next: 'evalua_insistencia' },
      ],
    },
    evalua_insistencia: { text: '', decide: (c) => (dispo(c) + usefulness(c) * 0.4 - 30 + noise(c, 12) > 0 ? 'ofrece_cargo' : 'cierre_frio_nodo') },
    cierre_frio_nodo: {
      text: (c) => sty(c, 'frio', { default: ['Entonces lo dejamos hasta aquí. Suerte con lo que decidas.'], directo: ['Como quieras. No voy a rogar.'], formal: ['Respeto tu decisión. Lo dejamos hasta aquí.'] }),
      onEnter: (c) => [npcRel(c, { willingness: -6, trust: -4 }), npcMem(c, 'negociacion', 'Exigió un cargo como condición y no hubo acuerdo', 'relevante')],
      end: 'sin acuerdo',
    },
    alternativa: {
      text: (c) => sty(c, 'alt', { default: [`No puedo prometerte un cargo: la directiva se arma conversando con los sectores. Lo que sí puedo hacer es presentarte a la gente de la regional y tenerte en cuenta más adelante.`] }),
      options: [
        { id: 'acepta_alt', text: 'Me sirve. Cuenta conmigo para la campaña.', effects: (c) => [{ type: 'world', op: 'race_join', args: { raceId: String(c.v.raceId), listId: String(c.v.listId) } },
          { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'apoyo_lista', content: `Apoyar la lista de ${fn(c.npc)}`, dueWeek: c.s.week + Number(c.v.weeks) + 1, conditions: { raceId: String(c.v.raceId), listId: String(c.v.listId) }, visibility: 'conocido', importance: 'compromiso' } },
          npcRel(c, { trust: 5, cooperation: 6 })], next: 'cierre_acuerdo' },
        { id: 'declina_alt', text: 'Con eso no me alcanza para sumarme.', effects: (c) => [npcRel(c, { willingness: -3 }, 'menor')], next: 'cierre_rechazo' },
      ],
    },
    rechaza_pedido: {
      text: (c) => sty(c, 'rpd', { default: ['Todavía te falta recorrido. Si quieres ayudar, bienvenido sea; pero cargos no estoy en condiciones de ofrecer.'], directo: ['Mira, no te conozco lo suficiente para darte un cargo. Si quieres ayudar, ayuda.'] }),
      options: [
        { id: 'acepta_igual', text: 'Entiendo. Igual me sumo.', effects: (c) => [{ type: 'world', op: 'race_join', args: { raceId: String(c.v.raceId), listId: String(c.v.listId) } },
          { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'apoyo_lista', content: `Apoyar la lista de ${fn(c.npc)}`, dueWeek: c.s.week + Number(c.v.weeks) + 1, conditions: { raceId: String(c.v.raceId), listId: String(c.v.listId) }, visibility: 'conocido', importance: 'compromiso' } },
          npcRel(c, { respect: 6, trust: 4 })], next: 'cierre_acuerdo' },
        { id: 'retira', text: 'Entonces no es mi momento. Gracias por la conversación.', effects: (c) => [npcMem(c, 'apoyo_rechazado', 'No se sumó a su lista', 'menor')], next: 'cierre_rechazo' },
      ],
    },
    evalua_independencia: { text: '', decide: (c) => (dispo(c) > 5 || pers(c, 'conciliador', 'institucionalista', 'tecnocrata') ? 'acepta_indep' : 'cuestiona_indep') },
    acepta_indep: {
      text: (c) => sty(c, 'ind', { default: [`Me parece razonable. Conversa con ${c.v.rival}, pero no te demores: la lista se inscribe en pocas semanas.`], formal: [`Es razonable que compares. Solo te pido que me respondas antes de la inscripción.`] }),
      options: [{ id: 'ok', text: 'Te respondo antes de la inscripción. Gracias por entenderlo.',
        effects: (c) => [npcRel(c, { respect: 4 }, 'menor'),
          { type: 'info', card: { source: fn(c.npc), text: `${first(c.npc)} reconoce que la lista de ${c.v.rival} tiene más apoyo en la capital regional; la suya, en las comunas.`, kind: 'opinion', confirmed: false } },
          { type: 'defer', inWeeks: 1, op: 'invite_if', args: { fromId: String(c.v.rivalId), defId: 'lista_regional', raceId: String(c.v.raceId), listId: String(c.v.listId) === 'A' ? 'B' : 'A', cond: 'race_open', motive: `${c.v.rival} supo que estás evaluando las listas y quiere conversar.` }, note: 'La otra lista puede buscarte' },
          { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'reunion_seguimiento', content: `Dar una respuesta a ${fn(c.npc)} antes de la inscripción`, dueWeek: c.s.week + 4, conditions: {}, visibility: 'privado', importance: 'menor' } }],
        next: 'cierre_pendiente' }],
    },
    cuestiona_indep: {
      text: (c) => sty(c, 'cind', { default: [`En política regional todos se conocen. Si vas a conversar con ${c.v.rival}, que sepas que eso se va a comentar.`], directo: [`¿Con ${c.v.rival}? Haz lo que quieras, pero acá todo se sabe.`] }),
      options: [
        { id: 'mantiene', text: 'Lo entiendo, pero prefiero decidir con toda la información.', effects: (c) => [npcRel(c, { trust: -3, respect: 4 }, 'menor'),
          { type: 'defer', inWeeks: 1, op: 'invite_if', args: { fromId: String(c.v.rivalId), defId: 'lista_regional', raceId: String(c.v.raceId), listId: String(c.v.listId) === 'A' ? 'B' : 'A', cond: 'race_open', motive: `${c.v.rival} supo que estás evaluando las listas.` }, note: 'La otra lista puede buscarte' }], next: 'cierre_pendiente' },
        { id: 'cede', text: 'Tienes razón, no tiene sentido dar más vueltas. Me sumo.', effects: (c) => [{ type: 'world', op: 'race_join', args: { raceId: String(c.v.raceId), listId: String(c.v.listId) } },
          { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'apoyo_lista', content: `Integrar la lista de ${fn(c.npc)}`, dueWeek: c.s.week + Number(c.v.weeks) + 1, conditions: { raceId: String(c.v.raceId), listId: String(c.v.listId) }, visibility: 'conocido', importance: 'compromiso' } }, npcRel(c, { trust: 5 })], next: 'cierre_acuerdo' },
      ],
    },
    reaccion_critica: { text: '', decide: (c) => (dispo(c) < -20 ? 'termina' : pers(c, 'conciliador', 'tecnocrata', 'institucionalista') || respectOf(c) > 10 ? 'pide_argumentos' : 'defiende') },
    pide_argumentos: {
      text: (c) => sty(c, 'arg', { default: ['¿Y qué harías distinto? Te escucho.'], tecnico: ['Dame un diagnóstico concreto. ¿Qué está fallando, según tú?'], conciliador: ['Me interesa saber por qué lo dices. ¿Qué cambiarías?'] }),
      options: [
        { id: 'territorial', text: (c) => `La regional dejó de ir a las comunas. Todo se decide en la capital regional y en ${comunaOf(c)} la gente se siente sola.`, next: 'evalua_argumento' },
        { id: 'alianzas', text: 'El partido se está diluyendo en la coalición. Perdimos perfil propio.', next: 'defiende' },
        { id: 'vago', text: 'Es una sensación general, mucha gente lo comenta.', effects: (c) => [npcRel(c, { respect: -5 }, 'menor')], next: 'defiende' },
      ],
    },
    evalua_argumento: { text: '', decide: (c) => (dispo(c) * 0.3 + usefulness(c) * 0.4 + noise(c, 10) > 6 ? 'reconoce' : 'defiende') },
    reconoce: {
      text: (c) => sty(c, 'rec', { default: [`Tienes razón en eso. Lo hemos hecho mal con las comunas. Si te sumas, quiero que ese sea tu tema: que la lista se comprometa a ir a terreno.`] }),
      onEnter: (c) => [npcRel(c, { respect: 10, trust: 4 }), react(`${first(c.npc)} reconoce el problema que planteas.`)],
      options: [
        { id: 'acuerdo_prog', text: 'Si eso queda escrito en el programa de la lista, me sumo.', effects: (c) => [{ type: 'world', op: 'race_join', args: { raceId: String(c.v.raceId), listId: String(c.v.listId) } },
          { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'apoyo_lista', content: `Integrar la lista de ${fn(c.npc)}`, dueWeek: c.s.week + Number(c.v.weeks) + 1, conditions: { raceId: String(c.v.raceId), listId: String(c.v.listId) }, visibility: 'conocido', importance: 'compromiso' } },
          { type: 'commitment', c: { debtor: c.npc.id, creditor: c.me.id, kind: 'acuerdo_programatico', content: 'Incluir trabajo en terreno en todas las comunas en el programa de la lista', dueWeek: c.s.week + 52, conditions: {}, visibility: 'conocido', importance: 'relevante' } },
          npcMem(c, 'acuerdo', 'Se sumó a su lista con un acuerdo programático territorial', 'compromiso'), { type: 'position', topic: 'descentralizacion_partido', stance: 1 }], next: 'cierre_acuerdo' },
        { id: 'aun_no', text: 'Me alegra que lo veas. Prefiero ver primero si eso se cumple.', effects: (c) => [npcRel(c, { respect: 4 }, 'menor')], next: 'cierre_pendiente' },
      ],
    },
    defiende: {
      text: (c) => sty(c, 'def', { default: ['La conducción ha hecho lo que ha podido con lo que tiene. Criticar desde afuera es fácil.'], directo: ['Es fácil hablar sin haber estado a cargo de nada.'], institucional: ['Las decisiones se tomaron en las instancias correspondientes. Puedes no compartirlas, pero fueron legítimas.'] }),
      options: [
        { id: 'insiste', text: 'No es desde afuera: es lo que se ve desde las bases. Y no voy a hacer campaña por lo mismo de siempre.',
          effects: (c) => [npcRel(c, { rivalry: 12, trust: -6, respect: 3 }), npcMem(c, 'conflicto', 'Criticó abiertamente su conducción y se negó a sumarse', 'relevante'), { type: 'position', topic: 'conduccion_regional', stance: -1 },
            { type: 'defer', inWeeks: 2, op: 'invite_if', args: { fromId: String(c.v.rivalId), defId: 'lista_regional', raceId: String(c.v.raceId), listId: String(c.v.listId) === 'A' ? 'B' : 'A', cond: 'race_open', motive: `${c.v.rival} se enteró de tus críticas a la conducción y quiere conversar.` }, note: 'La lista opositora puede buscarte' }],
          next: 'cierre_conflicto' },
        { id: 'matiza', text: 'No es algo personal contra ti. Quiero que la lista cambie el foco, nada más.', next: 'evalua_argumento' },
      ],
    },
    termina: {
      text: (c) => sty(c, 'term', { default: ['Entonces no tenemos mucho más de qué hablar.'], formal: ['Creo que no tiene sentido seguir esta conversación.'] }),
      onEnter: (c) => [npcRel(c, { rivalry: 10, willingness: -8 }), npcMem(c, 'conflicto', 'La reunión terminó mal tras sus críticas', 'relevante')],
      end: 'ruptura',
    },
    evalua_base: { text: '', decide: (c) => (usefulness(c) * 0.7 + dispo(c) * 0.3 - 28 + noise(c, 8) > 0 ? 'acepta_base' : 'pide_pruebas') },
    acepta_base: {
      text: (c) => sty(c, 'abs', { default: [`Trato hecho. Si traes a tu gente de ${comunaOf(c)}, esa base va a tener un lugar visible en la lista.`] }),
      options: [{ id: 'cierra', text: 'Entonces trabajemos juntos.', effects: (c) => [{ type: 'world', op: 'race_join', args: { raceId: String(c.v.raceId), listId: String(c.v.listId) } },
        { type: 'commitment', c: { debtor: c.me.id, creditor: c.npc.id, kind: 'apoyo_lista', content: `Sumar tu base territorial a la lista de ${fn(c.npc)}`, dueWeek: c.s.week + Number(c.v.weeks) + 1, conditions: { raceId: String(c.v.raceId), listId: String(c.v.listId) }, visibility: 'conocido', importance: 'compromiso' } },
        { type: 'commitment', c: { debtor: c.npc.id, creditor: c.me.id, kind: 'equipo', content: 'Dar a tu base un lugar visible si su lista gana', dueWeek: c.s.week + Number(c.v.weeks) + 2, conditions: { raceId: String(c.v.raceId), listId: String(c.v.listId) }, visibility: 'privado', importance: 'compromiso' } },
        npcRel(c, { respect: 10, dependence: 8, cooperation: 8 }), npcMem(c, 'acuerdo', 'Sumó su base territorial a la lista', 'compromiso')], next: 'cierre_acuerdo' }],
    },
    cierre_acuerdo: { speaker: 'narrador', text: (c) => `Quedan de acuerdo. La elección regional es en ${c.v.weeks} semanas.`, end: 'acuerdo' },
    cierre_pendiente: { speaker: 'narrador', text: 'La conversación queda abierta.', end: 'pendiente' },
    cierre_rechazo: { speaker: 'narrador', text: 'Se despiden con cordialidad, sin acuerdo.', end: 'sin acuerdo' },
    cierre_conflicto: { speaker: 'narrador', text: 'La reunión termina con tensión.', end: 'conflicto' },
  },
};

