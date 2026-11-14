/**
 * CONVERSACIONES COLECTIVAS: asamblea partidaria y reunión de bancada. Cada participante tiene una
 * postura propia y evalúa la intervención del jugador según SUS objetivos: no hay una reacción
 * colectiva única. Los participantes también se responden entre sí.
 */
import type { DialogueCtx, DialogueDefinition, DialogueEffect, DialogueOption } from '../types';
import type { GameState } from '../../models/types';
import { ideoDistance, leftRight } from '../../systems/util';
import { partyInfluenceOf } from '../../career/capital';
import { REGION_BY_ID } from '../../data/geography';
import { fn, first } from '../world';
import { styleOf } from '../text';
import { react, relOf } from './helpers';

/** Postura (-1, 0, +1) de un participante frente a la moción. */
function stanceOf(s: GameState, id: string, motion: string, ref: string): number {
  const c = s.characters[id]; if (!c) return 0;
  const p = c.partyId ? s.parties[c.partyId] : null;
  const f = p?.factions.find((x) => x.id === c.factionId);
  if (motion === 'proyecto') {
    const b = s.bills.find((x) => x.id === ref); if (!b) return 0;
    const d = ideoDistance(c.ideology, b.position);
    return d < 0.3 ? 1 : d > 0.45 ? -1 : 0;
  }
  if (motion === 'acuerdo') {
    // cercanía ideológica con el otro partido, postura de su facción frente a alianzas y temperamento propio
    const t = s.parties[ref]; if (!t) return 0;
    const temper = c.personality === 'ideologico' ? 0.07 : c.personality === 'pragmatico' ? -0.05 : 0;
    const d = ideoDistance(c.ideology, t.ideology) - (f ? f.coalitionStance / 250 : 0) + temper;
    return d < 0.17 ? 1 : d > 0.26 ? -1 : 0;
  }
  return 0;
}

function speech(c: DialogueCtx, id: string, st: number): string {
  const who = c.s.characters[id]; const style = styleOf(c.s, who);
  const m = String(c.v.motionLabel);
  const lines: Record<string, Record<number, string>> = {
    directo: { 1: `Yo estoy por ${m}. No le demos más vueltas.`, 0: 'No me convence ni lo uno ni lo otro. Falta información.', [-1]: `Me opongo. ${m.charAt(0).toUpperCase() + m.slice(1)} es un error.` },
    formal: { 1: `Propongo que la instancia apruebe ${m}.`, 0: 'Sugiero que se reúnan más antecedentes antes de votar.', [-1]: `No puedo respaldar ${m} en los términos planteados.` },
    conciliador: { 1: `Creo que ${m} nos puede unir, si lo hacemos bien.`, 0: 'Busquemos una fórmula en la que todos podamos estar.', [-1]: 'Entiendo el ánimo, pero esto nos va a dividir.' },
    tecnico: { 1: 'Los antecedentes respaldan la propuesta.', 0: 'Los números no son concluyentes todavía.', [-1]: 'Los costos superan los beneficios, según lo que tenemos.' },
    persuasivo: { 1: `Esta es la oportunidad: ${m} es lo que la gente espera de nosotros.`, 0: 'Antes de decidir, preguntémonos qué le explicamos a nuestras bases.', [-1]: 'Si aprobamos esto, vamos a perder lo que nos diferencia.' },
    institucional: { 1: `La directiva recomienda ${m}.`, 0: 'Corresponde una deliberación más amplia.', [-1]: 'No están dadas las condiciones institucionales para aprobar esto.' },
    reservado: { 1: 'Estoy a favor.', 0: 'Me abstengo por ahora.', [-1]: 'En contra.' },
  };
  return (lines[style] ?? lines.formal)[st];
}

function interventionEffects(c: DialogueCtx, playerStance: number, kind: 'postura' | 'alternativa' | 'puente' | 'silencio'): DialogueEffect[] {
  const out: DialogueEffect[] = [];
  const lines: string[] = [];
  c.sess.participants.forEach((id, i) => {
    const st = Number(c.v[`st${i}`]);
    const who = c.s.characters[id];
    if (kind === 'silencio') { if (i === 0 && c.me.offices.length) out.push(relOf(c, id, { respect: -2 }, 'menor')); return; }
    if (kind === 'alternativa' || kind === 'puente') {
      const gain = st === 0 ? 6 : 2;
      out.push(relOf(c, id, { respect: gain, cooperation: kind === 'puente' ? 3 : 1 }, 'relevante'));
      if (st !== 0 && who?.personality === 'ideologico') { out.push(relOf(c, id, { trust: -2 }, 'menor')); lines.push(`${first(who)} reclama que «las medias tintas no sirven».`); }
      return;
    }
    const agree = st * playerStance;
    if (agree > 0) { out.push(relOf(c, id, { cooperation: 6, trust: 4, respect: 3 }, 'relevante')); lines.push(`${first(who)} respalda tu intervención.`); }
    else if (agree < 0) { out.push(relOf(c, id, { trust: -4, rivalry: who?.personality === 'confrontacional' ? 8 : 3 }, 'relevante')); lines.push(`${first(who)} ${who?.personality === 'confrontacional' ? 'te responde con dureza' : 'marca su desacuerdo contigo'}.`); }
    else out.push(relOf(c, id, { respect: 2 }, 'menor'));
  });
  // los participantes reaccionan también entre sí
  const ids = c.sess.participants;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = Number(c.v[`st${i}`]); const b = Number(c.v[`st${j}`]);
    if (a * b < 0) { out.push({ type: 'rel', from: ids[i], to: ids[j], dims: { rivalry: 3, trust: -2 }, importance: 'menor' }); if (lines.length < 4) lines.push(`${first(c.s.characters[ids[i]])} y ${first(c.s.characters[ids[j]])} discuten.`); }
  }
  out.push({ type: 'position', topic: String(c.v.topic), stance: kind === 'postura' ? playerStance : 0 });
  c.v.playerStance = kind === 'postura' ? playerStance : 0;
  c.v.bridge = kind === 'puente' || kind === 'alternativa' ? 1 : 0;
  if (lines.length) out.push(react(lines.join(' ')));
  return out;
}

const OPTIONS: DialogueOption[] = [
  { id: 'respalda', text: (c) => `Respaldo ${c.v.motionLabel}. Creo que es lo que corresponde y lo voy a defender afuera.`, effects: (c) => interventionEffects(c, 1, 'postura'), next: 'votacion' },
  { id: 'disiente', text: (c) => `No voy a respaldar ${c.v.motionLabel}. Prefiero decirlo aquí que en la prensa.`, effects: (c) => interventionEffects(c, -1, 'postura'), next: 'votacion' },
  { id: 'alternativa', text: 'Propongo condicionar la decisión: respaldo, pero con exigencias concretas y un plazo para evaluarlo.', when: [{ test: (c) => partyInfluenceOf(c.s, c.me) >= 25 || c.s.dialogue!.reputation.respeto >= 35, why: 'Requiere peso interno' }], effects: (c) => interventionEffects(c, 0, 'alternativa'), next: 'votacion' },
  { id: 'puente', text: 'Busquemos un texto que podamos firmar todos. Prefiero un acuerdo amplio a ganar por un voto.', when: [{ test: (c) => c.me.attrs.negociacion >= 45 }], effects: (c) => interventionEffects(c, 0, 'puente'), next: 'votacion' },
  { id: 'silencio', text: 'Prefiero escuchar antes de opinar.', effects: (c) => interventionEffects(c, 0, 'silencio'), next: 'votacion' },
];

function collective(id: 'asamblea_partidaria' | 'reunion_bancada'): DialogueDefinition {
  const bancada = id === 'reunion_bancada';
  return {
    id, area: bancada ? 'parlamento' : 'vida_partidaria', kind: 'colectiva', title: bancada ? 'Reunión de bancada' : 'Asamblea del partido', maxExchanges: 3, formality: bancada ? 'parlamentaria' : 'asamblea', initiators: ['jugador'], cooldownWeeks: 6,
    requiresOffice: bancada ? ['diputado', 'senador'] : undefined,
    setup: (s, args) => {
      const me = s.characters[s.player.characterId]; const p = s.parties[String(args.partyId)];
      if (!p || me.partyId !== p.id) return null;
      const legis = (c: GameState['characters'][string]) => c.offices.some((o) => o.type === 'diputado' || o.type === 'senador');
      let people = Object.values(s.characters).filter((c) => c.status === 'activo' && !c.isPlayer && c.partyId === p.id);
      people = bancada ? people.filter(legis) : people.filter((c) => c.id === p.leaderId || p.factions.some((f) => f.leaderId === c.id) || (c.regionId === me.regionId && !c.realId));
      const ordered = [...people].sort((a, b) => (b.id === p.leaderId ? 1 : 0) - (a.id === p.leaderId ? 1 : 0) || partyInfluenceOf(s, b) - partyInfluenceOf(s, a)).slice(0, 4);
      if (ordered.length < 2) return null;
      // moción concreta del estado: un proyecto en trámite o un acuerdo electoral
      const bill = s.bills.filter((b) => b.closedWeek === undefined && b.origin === 'mensaje').sort((a, b) => Math.abs(b.popularity) - Math.abs(a.popularity))[0];
      const other = Object.values(s.parties).filter((x) => x.active && x.id !== p.id).sort((a, b) => ideoDistance(a.ideology, p.ideology) - ideoDistance(b.ideology, p.ideology))[0];
      const motion = bill && (bancada || leftRight(p.ideology) * leftRight(s.parties[s.characters[s.government.presidentId]?.partyId ?? '']?.ideology ?? p.ideology) > 0 || !other) ? 'proyecto' : 'acuerdo';
      const ref = motion === 'proyecto' ? bill?.id ?? '' : other?.id ?? '';
      if (!ref) return null;
      const label = motion === 'proyecto' ? `respaldar el proyecto «${bill!.title.replace(/^Mensaje: /, '')}»` : `explorar un acuerdo electoral con ${other!.short}`;
      const vars: Record<string, string | number> = { motion, ref, motionLabel: label, topic: `${motion}:${ref}`, party: p.short };
      ordered.forEach((c, i) => { vars[`st${i}`] = stanceOf(s, c.id, motion, ref); });
      return { participants: ordered.map((c) => c.id), place: bancada ? 'Sala de reuniones de la bancada, Valparaíso' : `Sede regional de ${p.short}, ${REGION_BY_ID[me.regionId].name}`, motive: `Debate: ${label}`, vars };
    },
    label: (s, args) => (bancada ? 'Convocar a la bancada' : `Participar en la asamblea de ${s.parties[String(args.partyId)]?.short ?? 'tu partido'}`),
    start: 'apertura',
    nodes: {
      apertura: { speaker: 'narrador', text: (c) => `${bancada ? 'La bancada' : `La asamblea de ${c.v.party}`} se reúne. Punto en tabla: ${c.v.motionLabel}.`,
        decide: () => 'posturas' },
      posturas: {
        speaker: 'narrador',
        text: (c) => c.sess.participants.map((id, i) => `${fn(c.s.characters[id])}: «${speech(c, id, Number(c.v[`st${i}`]))}»`).join('\n'),
        options: OPTIONS,
      },
      votacion: { text: '', speaker: 'narrador',
        decide: (c) => {
          let tot = 0;
          c.sess.participants.forEach((id, i) => { const w = 1 + partyInfluenceOf(c.s, c.s.characters[id]) / 50; tot += Number(c.v[`st${i}`]) * w; });
          tot += Number(c.v.playerStance ?? 0) * (0.6 + partyInfluenceOf(c.s, c.me) / 40) + c.rng.normal(0, 0.6);
          c.v.result = Number(c.v.bridge) && Math.abs(tot) < 1.2 ? 'condicionada' : tot > 0 ? 'aprobada' : 'rechazada';
          return 'resultado';
        } },
      resultado: { speaker: 'narrador',
        text: (c) => c.v.result === 'aprobada' ? `Se aprueba: ${c.v.motionLabel}.` : c.v.result === 'condicionada' ? 'Se aprueba una fórmula condicionada, con exigencias y plazo de evaluación.' : `Se rechaza ${c.v.motionLabel}.`,
        onEnter: (c) => {
          const out: DialogueEffect[] = [];
          const pid = c.me.partyId!;
          const approved = c.v.result !== 'rechazada';
          if (c.v.motion === 'proyecto') out.push({ type: 'world', op: 'bill_side', args: { billId: String(c.v.ref), partyId: pid, amount: c.v.result === 'aprobada' ? 8 : c.v.result === 'condicionada' ? 3 : -6 } });
          else out.push({ type: 'world', op: 'party_relation', args: { a: pid, b: String(c.v.ref), delta: c.v.result === 'aprobada' ? 8 : c.v.result === 'condicionada' ? 3 : -4 } });
          // quienes perdieron la votación acumulan malestar; el jugador gana respeto si su postura coincidió con el resultado
          c.sess.participants.forEach((id, i) => { const st = Number(c.v[`st${i}`]); if (st && (st > 0) !== approved) { const f = c.s.parties[pid]?.factions.find((x) => x.leaderId === id); if (f) out.push({ type: 'world', op: 'faction_discontent', args: { partyId: pid, factionId: f.id, delta: 4 } }); } });
          const ps = Number(c.v.playerStance ?? 0);
          if (ps && (ps > 0) === approved) out.push({ type: 'rep', dim: 'respeto', delta: 2 });
          if (Number(c.v.bridge)) out.push({ type: 'rep', dim: 'respeto', delta: 3 });
          return out;
        },
        end: 'deliberación concluida' },
    },
  };
}

export const ASAMBLEA = collective('asamblea_partidaria');
export const BANCADA = collective('reunion_bancada');
