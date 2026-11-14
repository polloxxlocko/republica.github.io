/**
 * VIDA PARTIDARIA COTIDIANA: advertencias e información de pasillo. Los rumores se rotulan como no
 * confirmados y solo involucran a personajes FICTICIOS (nunca acusaciones sobre personas reales).
 */
import type { DialogueDefinition } from '../types';
import { fn, first } from '../world';
import { sty } from '../text';
import { npcRel } from './helpers';

export const ADVERTENCIA: DialogueDefinition = {
  id: 'advertencia', area: 'vida_partidaria', kind: 'breve', title: 'Un aviso de pasillo', maxExchanges: 3, formality: 'informal', initiators: ['ia'], cooldownWeeks: 10,
  setup: (s, args) => {
    const npc = s.characters[String(args.fromId)]; const subj = s.characters[String(args.subjectId)];
    if (!npc || npc.status !== 'activo' || !subj || subj.realId) return null; // nunca rumores sobre personas reales
    return { participants: [npc.id], place: 'A la salida de una reunión', motive: `${fn(npc)} te quiere contar algo`, vars: { subject: fn(subj), subjectId: subj.id } };
  },
  start: 'inicio',
  nodes: {
    inicio: { text: (c) => sty(c, 'i', { default: [`Oye, para que sepas: ${c.v.subject} anda diciendo que tú no vas a durar en la directiva. No sé cuánto hay de cierto, pero se está moviendo.`], reservado: [`Solo un dato: ${c.v.subject} se está moviendo contra ti. Tómalo con cautela.`] }),
      onEnter: (c) => [{ type: 'info', card: { source: fn(c.npc), text: `Rumor: ${c.v.subject} estaría hablando en contra de ti en el partido.`, kind: 'rumor', confirmed: false } }],
      options: [
        { id: 'gracias', text: 'Gracias por avisarme. Lo voy a tener en cuenta.', effects: (c) => [npcRel(c, { trust: 3, cooperation: 2 }, 'menor')], next: 'fin' },
        { id: 'detalles', text: '¿Quién te lo dijo? Quiero saber qué tan firme es eso.', next: 'detalles' },
        { id: 'desestima', text: 'Prefiero no darle vueltas a los comentarios de pasillo.', effects: (c) => [npcRel(c, { willingness: -2 }, 'menor')], next: 'fin' },
      ] },
    detalles: { text: (c) => `Me lo comentaron dos personas de la regional. Directamente no se lo escuché a ${first(c.s.characters[String(c.v.subjectId)])}.`, onEnter: (c) => [{ type: 'info', card: { source: fn(c.npc), text: 'El rumor viene de segunda mano: nadie lo escuchó directamente.', kind: 'opinion', confirmed: false } }], end: 'información recibida' },
    fin: { speaker: 'narrador', text: 'Cada uno sigue su camino.', end: 'sin cambios' },
  },
};
