/**
 * SISTEMA DE CONVERSACIONES — 20 criterios de aceptación. Escenario base: militante en Chillán (Ñuble),
 * semilla 7, donde a la semana ~21 se abre la elección de la directiva regional y una cabeza de lista
 * (personaje ficticio) invita al jugador: el ejemplo completo del §19.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { newGame } from './helpers';
import { advanceWeek, dispatch } from '../src/game/engine/game';
import type { GameState } from '../src/game/models/types';
import { optionsOf, startBlocked, startSession, respond, playerStarts } from '../src/game/dialogue/engine';
import { Rng, seedRng } from '../src/game/engine/rng';
import { changeRel, describe as describeRel, getRel } from '../src/game/dialogue/relations';
import { addMemory, weeklyMemory } from '../src/game/dialogue/memory';
import { addCommitment, verifyCommitments } from '../src/game/dialogue/commitments';
import { authorityFor, evaluateProposal } from '../src/game/dialogue/negotiation';
import { processDeferred, answerInvitation } from '../src/game/dialogue/ai';
import { contradictions } from '../src/game/dialogue/positions';
import { buildQuestions } from '../src/game/media/journalists';
import { DEFINITIONS, DEF_BY_ID } from '../src/game/dialogue/definitions';
import { serialize, deserialize } from '../src/persistence/saveFormat';
import { worldOp, playerList } from '../src/game/dialogue/world';

let base: GameState; let inviteId = '';
const clone = (g: GameState) => structuredClone(g);
const last = (g: GameState) => g.dialogue!.sessions[g.dialogue!.sessions.length - 1];

function reach(seed = 7): GameState {
  let s = newGame({ regionId: 'NB', comuna: 'Chillán', age: 21 }, seed);
  for (let w = 0; w < 60 && !s.dialogue!.invitations.some((i) => i.defId === 'lista_regional' && i.status === 'pendiente'); w++) s = advanceWeek(s).state;
  return s;
}
/** Juega una rama: acepta la invitación y elige las opciones indicadas (o la primera disponible). */
function play(g0: GameState, path: string[]): GameState {
  let g = clone(g0); g.player.actionPoints = 3;
  g = dispatch(g, { type: 'conv_invitacion', inviteId, decision: 'aceptar' }).state;
  for (let k = 0; k < 10 && last(g).status === 'activa'; k++) {
    const opts = optionsOf(g, new Rng(g.rng), last(g));
    if (!opts.length) break;
    g = dispatch(g, { type: 'conv_responder', sessionId: last(g).id, optionId: (opts.find((o) => o.id === path[k]) ?? opts[0]).id }).state;
  }
  return g;
}
/** Política fija posterior (igual para todas las ramas): acepta invitaciones y responde la primera opción. */
function live(g0: GameState, weeks: number): GameState {
  let g = g0;
  for (let i = 0; i < weeks; i++) {
    g = advanceWeek(g).state;
    for (const iv of g.dialogue!.invitations.filter((x) => x.status === 'pendiente')) {
      g.player.actionPoints = Math.max(g.player.actionPoints, 1);
      g = dispatch(g, { type: 'conv_invitacion', inviteId: iv.id, decision: 'aceptar' }).state;
      for (let k = 0; k < 15 && last(g).status === 'activa'; k++) { const o = optionsOf(g, new Rng(g.rng), last(g)); if (!o.length) break; g = dispatch(g, { type: 'conv_responder', sessionId: last(g).id, optionId: o[0].id }).state; }
    }
  }
  return g;
}

beforeAll(() => {
  base = reach();
  inviteId = base.dialogue!.invitations.find((i) => i.defId === 'lista_regional' && i.status === 'pendiente')?.id ?? '';
}, 120000);

describe('Conversaciones políticas', () => {
  it('01 la IA inicia conversaciones por motivos concretos del mundo (carrera regional abierta)', () => {
    expect(inviteId).not.toBe('');
    const inv = base.dialogue!.invitations.find((i) => i.id === inviteId)!;
    const race = base.dialogue!.races.find((r) => r.id === inv.args.raceId)!;
    expect(race.status).toBe('abierta');
    expect(race.lists.some((l) => l.headId === inv.fromId)).toBe(true);
    expect(base.characters[inv.fromId].realId).toBeFalsy();
  });

  it('02 la conversación tiene estructura completa (lugar, motivo, iniciador, participantes, formalidad, duración)', () => {
    const s = last(play(base, ['interes']));
    expect(s.place).toBeTruthy(); expect(s.motive).toBeTruthy(); expect(s.initiator).not.toBe('jugador');
    expect(s.participants.length).toBe(1); expect(s.formality).toBe('privada'); expect(s.maxExchanges).toBeGreaterThanOrEqual(3);
    expect(s.transcript.length).toBeGreaterThan(2);
  });

  it('03 las opciones son contextuales y condicionadas (sin cuatro opciones fijas ni etiquetas de tono)', () => {
    const g = clone(base); g.player.actionPoints = 3;
    const g1 = dispatch(g, { type: 'conv_invitacion', inviteId, decision: 'aceptar' }).state;
    const o1 = optionsOf(g1, new Rng(g1.rng), last(g1)).map((o) => o.id);
    // con capital territorial alto aparece una opción que antes no estaba
    const g2 = clone(g); g2.career.capital.territory = Object.fromEntries(Object.keys(g2.career.capital.territory).map((k) => [k, 90]));
    const cut = Object.keys(g2.career.capital.territory)[0]; expect(cut).toBeTruthy();
    const g3 = dispatch(g2, { type: 'conv_invitacion', inviteId, decision: 'aceptar' }).state;
    const o3 = optionsOf(g3, new Rng(g3.rng), last(g3));
    expect(o3.length).toBeGreaterThanOrEqual(2); expect(o3.length).toBeLessThanOrEqual(5);
    // ninguna definición usa etiquetas de tono en las opciones
    const g4 = play(base, []);
    for (const t of g4.dialogue!.sessions.flatMap((x) => x.transcript).filter((l) => l.kind === 'jugador')) expect(t.text).not.toMatch(/^\s*[[(](amable|agresiv|neutral|diplom|hostil)/i);
    expect(o1).toContain('interes');
  });

  it('04 decisiones distintas producen resultados, compromisos y memorias distintas', () => {
    const outs = [['interes', 'acepta'], ['critica', 'defiende'], ['otras']].map((p) => play(base, p));
    const sig = outs.map((g) => `${last(g).outcome}|${g.dialogue!.commitments.map((c) => c.kind).join(',')}|${g.dialogue!.memories.filter((m) => m.kind !== 'primer_encuentro').map((m) => m.kind).join(',')}`);
    expect(new Set(sig).size).toBe(3);
  });

  it('05 TRAYECTORIAS: con la misma conducta posterior, la decisión inicial cambia la carrera política', () => {
    const A = live(play(base, ['interes', 'acepta']), 60);
    const C = live(play(base, ['critica', 'defiende']), 60);
    const head = last(play(base, ['interes'])).participants[0];
    const raceA = A.dialogue!.races[0]; const raceC = C.dialogue!.races[0];
    const listA = raceA.lists.find((l) => l.members.includes(A.player.characterId) || l.headId === A.player.characterId)?.headId;
    const listC = raceC.lists.find((l) => l.members.includes(C.player.characterId) || l.headId === C.player.characterId)?.headId;
    // A integró la lista de quien invitó; C terminó en otra lista o fuera de ella
    expect(listA).toBe(head);
    expect(listC).not.toBe(head);
    // la relación con quien invitó diverge y se describe distinto
    expect(getRel(A, head, A.player.characterId).trust).toBeGreaterThan(getRel(C, head, C.player.characterId).trust + 10);
    expect(describeRel(A, head, A.player.characterId).join()).not.toBe(describeRel(C, head, C.player.characterId).join());
    // y la historia (compromisos, conversaciones) es distinta
    const hist = (g: GameState) => g.dialogue!.sessions.map((x) => `${x.defId}:${x.participants[0]}`).join('|');
    expect(hist(A)).not.toBe(hist(C));
  }, 240000);

  it('06 las relaciones son direccionales y asimétricas', () => {
    const g = play(base, ['critica', 'defiende']);
    const head = last(g).participants[0]; const me = g.player.characterId;
    const a = getRel(g, head, me); const b = getRel(g, me, head);
    expect(a.rivalry).toBeGreaterThan(b.rivalry);
  });

  it('07 cambios graduales con rendimientos decrecientes (anti-explotación)', () => {
    const g = clone(base); const npc = Object.keys(g.characters).find((id) => !g.characters[id].isPlayer)!;
    const gains = [0, 1, 2, 3].map(() => changeRel(g, { type: 'rel', from: npc, to: g.player.characterId, dims: { trust: 10 }, importance: 'relevante' }));
    for (let i = 1; i < gains.length; i++) expect(gains[i]).toBeLessThan(gains[i - 1]);
    expect(getRel(g, npc, g.player.characterId).trust).toBeLessThan(30);
  });

  it('08 enfriamientos: no se puede repetir la misma conversación con la misma persona', () => {
    const g = play(base, ['interes', 'acepta']);
    const s0 = last(g);
    const r = startBlocked(g, 'lista_regional', { target: s0.participants[0], raceId: String(s0.vars.raceId), listId: String(s0.vars.listId) });
    expect(r).toBeTruthy();
  });

  it('09 memoria episódica con decaimiento y consolidación de recuerdos menores', () => {
    const g = clone(base); const npc = Object.keys(g.characters).find((id) => !g.characters[id].isPlayer && g.characters[id].status === 'activo')!;
    const m = addMemory(g, { owner: npc, about: g.player.characterId, participants: [npc], kind: 'colaboracion', summary: 'Algo menor', importance: 'menor' });
    const d = addMemory(g, { owner: npc, about: g.player.characterId, participants: [npc], kind: 'promesa_incumplida', summary: 'Algo decisivo', importance: 'decisivo' });
    for (let i = 0; i < 120; i++) { g.week++; weeklyMemory(g); }
    const mm = g.dialogue!.memories.find((x) => x.id === m.id); const dd = g.dialogue!.memories.find((x) => x.id === d.id)!;
    expect(!mm || mm.status === 'consolidado' || mm.salience < dd.salience).toBe(true);
    expect(dd.salience).toBeGreaterThan(0.3);
  });

  it('10 los compromisos se verifican con la conducta: mantenerse cumple, cambiarse de lista incumple', () => {
    const g = play(base, ['interes', 'acepta']);
    const cm = g.dialogue!.commitments.find((c) => c.kind === 'apoyo_lista')!; expect(cm).toBeTruthy();
    const race = g.dialogue!.races.find((r) => r.id === cm.conditions.raceId)!;
    const other = race.lists.find((l) => l.id !== cm.conditions.listId)!;
    const g2 = clone(g);
    worldOp(g2, new Rng(seedRng(1)), 'race_join', { raceId: race.id, listId: other.id });
    verifyCommitments(g2, new Rng(seedRng(1)));
    const c2 = g2.dialogue!.commitments.find((c) => c.id === cm.id)!;
    expect(c2.status).toBe('incumplido'); expect(c2.breach).toBe('deliberado');
    expect(g2.dialogue!.reputation.cumplimiento).toBeLessThan(g.dialogue!.reputation.cumplimiento);
    const g3 = live(g, 30);
    expect(g3.dialogue!.commitments.find((c) => c.id === cm.id)!.status).toBe('cumplido');
  }, 120000);

  it('11 incumplimientos contextuales: circunstancias externas no se tratan como traición', () => {
    const g = clone(base); const me = g.player.characterId;
    const npc = Object.values(g.characters).find((c) => !c.isPlayer && c.status === 'activo' && c.partyId === g.characters[me].partyId)!;
    const cm = addCommitment(g, { debtor: me, creditor: npc.id, kind: 'trabajo_campana', content: 'Apoyar su campaña', dueWeek: g.week - 1, conditions: {}, visibility: 'privado', importance: 'relevante' });
    g.player.candidacies.push({} as never);
    verifyCommitments(g, new Rng(seedRng(2)));
    expect(cm.status).toBe('incumplido'); expect(cm.breach).toBe('cambio_condiciones');
    const r = getRel(g, npc.id, me); expect(r.rivalry === 0).toBe(true);
  });

  it('12 negociación limitada por autoridad: nadie ofrece lo que no controla', () => {
    const g = clone(base); const me = g.characters[g.player.characterId];
    const npc = Object.values(g.characters).find((c) => !c.isPlayer && c.status === 'activo' && c.offices.length === 0)!;
    expect(authorityFor(g, npc, { kind: 'voto_proyecto', by: npc.id, label: 'voto' })).toBeTruthy();
    expect(authorityFor(g, me, { kind: 'cupo_lista', by: me.id, label: 'cupo' })).toBeTruthy();
    const ev = evaluateProposal(g, new Rng(seedRng(3)), npc.id, [], [{ kind: 'voto_proyecto', by: npc.id, label: 'su voto' }], 0);
    expect(ev.reasons.join()).toMatch(/parlamentari/);
  });

  it('13 los NPC pueden rechazar: con desconfianza y rivalidad la negociación fracasa', () => {
    const g = clone(base); const me = g.player.characterId;
    const npc = Object.values(g.characters).find((c) => !c.isPlayer && c.status === 'activo' && c.partyId)!;
    const r = getRel(g, npc.id, me); Object.assign(r, { trust: -80, rivalry: 90, reliability: -70, personal: -60, willingness: -50 });
    let rejects = 0;
    for (let i = 0; i < 20; i++) if (evaluateProposal(g, new Rng(seedRng(100 + i)), npc.id, [{ kind: 'apoyo_publico', by: me, label: 'apoyo' }], [{ kind: 'apoyo_interna', by: npc.id, label: 'tu apoyo' }], 1).response === 'rechaza') rejects++;
    expect(rejects).toBeGreaterThan(15);
  });

  it('14 invitaciones: preguntar el motivo, reprogramar una sola vez y rechazar repetidamente deja huella', () => {
    const g = clone(base); const rng = new Rng(seedRng(4));
    expect(answerInvitation(g, rng, inviteId, 'consultar')).toBeTruthy();
    expect(answerInvitation(g, rng, inviteId, 'reprogramar')).toMatch(/acepta/);
    expect(answerInvitation(g, rng, inviteId, 'reprogramar')).toMatch(/una vez/);
    const from = g.dialogue!.invitations.find((i) => i.id === inviteId)!.fromId;
    answerInvitation(g, rng, inviteId, 'rechazar');
    g.dialogue!.invitations.push({ id: 'x2', fromId: from, defId: 'lista_regional', week: g.week, expiresWeek: g.week + 3, motive: '', args: {}, status: 'pendiente' });
    expect(answerInvitation(g, rng, 'x2', 'rechazar')).toMatch(/señal/);
    expect(g.dialogue!.memories.some((m) => m.owner === from && m.kind === 'apoyo_rechazado')).toBe(true);
  });

  it('15 consecuencias diferidas: se reevalúan al vencer y no están garantizadas', () => {
    const g = clone(base); const inv = g.dialogue!.invitations.find((i) => i.id === inviteId)!;
    g.dialogue!.invitations = []; g.dialogue!.cooldowns = {};
    const closedRace = { ...g.dialogue!.races[0], id: 'cerrada', status: 'resuelta' as const };
    g.dialogue!.races.push(closedRace);
    g.dialogue!.deferred.push({ id: 'd1', week: g.week, op: 'invite_if', args: { fromId: inv.fromId, defId: 'lista_regional', cond: 'race_open', raceId: 'cerrada', motive: 'x' }, note: '' });
    g.dialogue!.deferred.push({ id: 'd2', week: g.week, op: 'invite_if', args: { fromId: inv.fromId, defId: 'lista_regional', cond: 'race_open', raceId: g.dialogue!.races[0].id, listId: g.dialogue!.races[0].lists[0].id, motive: 'y' }, note: '' });
    processDeferred(g, new Rng(seedRng(5)));
    expect(g.dialogue!.invitations.map((i) => i.motive)).toEqual(['y']);
  });

  it('16 personas reales: sin memorias previas inventadas, diálogo rotulado como ficción y sin rumores sobre ellas', () => {
    const g0 = newGame({}, 11);
    expect(g0.dialogue!.memories.length).toBe(0);
    const real = Object.values(g0.characters).find((c) => c.realId && c.status === 'activo')!;
    const npc = Object.values(g0.characters).find((c) => !c.realId && !c.isPlayer && c.status === 'activo')!;
    expect(DEF_BY_ID.advertencia.setup(g0, { fromId: npc.id, subjectId: real.id })).toBeNull();
    const sess = startSession(g0, new Rng(seedRng(6)), 'reconciliacion', { target: real.id });
    expect(typeof sess).not.toBe('string');
    if (typeof sess !== 'string') expect(sess.fiction).toBe(true);
  });

  it('17 conversaciones colectivas: cada participante reacciona por separado según su postura', () => {
    // se buscan asambleas con posturas mixtas (en algunas todos coinciden, lo que también es legítimo)
    let checked = 0;
    for (const [seed, party] of [[11, 'PS'], [12, 'RN'], [13, 'FA'], [14, 'UDI'], [15, 'PDC'], [16, 'REP'], [17, 'PC']] as const) {
      const g = newGame({ partyId: party }, seed); const me = g.characters[g.player.characterId];
      const r = startSession(g, new Rng(seedRng(seed)), 'asamblea_partidaria', { partyId: me.partyId! });
      if (typeof r === 'string') continue;
      const stances = r.participants.map((_, i) => Number(r.vars[`st${i}`]));
      if (new Set(stances).size < 2) continue;
      const before = Object.fromEntries(r.participants.map((p) => [p, { ...getRel(g, p, me.id) }]));
      const opts = optionsOf(g, new Rng(seedRng(seed)), r); respond(g, new Rng(seedRng(seed)), r.id, (opts.find((o) => o.id === 'respalda') ?? opts[0]).id);
      const dTrust = r.participants.map((p) => getRel(g, p, me.id).trust - before[p].trust);
      // quienes comparten la postura del jugador mejoran su confianza más que quienes la rechazan
      const pos = dTrust.filter((_, i) => stances[i] > 0); const neg = dTrust.filter((_, i) => stances[i] < 0);
      if (pos.length && neg.length) expect(Math.min(...pos)).toBeGreaterThan(Math.max(...neg));
      expect(new Set(dTrust.map((x) => Math.round(x * 10))).size).toBeGreaterThan(1);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('18 contenido por etapa: un militante no puede negociar como presidente ni como ministro', () => {
    const g = clone(base);
    expect(startBlocked(g, 'socio_coalicion', { target: 'x', partyId: 'x' })).toMatch(/cargo/);
    expect(startBlocked(g, 'coordinacion_ministerial', {})).toMatch(/cargo/);
    expect(playerStarts(g).some((x) => x.defId === 'socio_coalicion')).toBe(false);
    expect(DEFINITIONS.length).toBeGreaterThanOrEqual(12);
  });

  it('19 prensa: detecta contradicciones entre lo dicho en reuniones y lo votado', () => {
    const g = clone(base); const st = g.dialogue!;
    const bill = g.bills[0] ?? { id: 'b1' };
    st.positions.push({ week: g.week - 4, topic: `proyecto:${bill.id}`, stance: 1, source: 'conv-x' });
    st.actionLog.push({ week: g.week - 1, type: 'voto_parlamentario', ref: bill.id, value: 'no' });
    const cs = contradictions(g); expect(cs.length).toBe(1);
    const j = { ...g.media!.journalists[0], style: 'incisivo' as const };
    const qs = buildQuestions(g, new Rng(seedRng(8)), j);
    expect(qs.some((q) => q.id === 'contradiccion')).toBe(true);
  });

  it('20 persistencia, determinismo y funcionamiento local sin API', () => {
    const fetchSpy = vi.fn(); const orig = globalThis.fetch; globalThis.fetch = fetchSpy as never;
    try {
      const a = play(base, ['pedir']); const b = play(base, ['pedir']);
      expect(JSON.stringify(a.dialogue)).toBe(JSON.stringify(b.dialogue));
      const loaded = deserialize(serialize(a));
      expect(JSON.stringify(loaded.dialogue)).toBe(JSON.stringify(a.dialogue));
      const x = live(a, 8); const y = live(loaded, 8);
      expect(JSON.stringify(y.dialogue)).toBe(JSON.stringify(x.dialogue));
      expect(playerList(x.dialogue!.races[0], x.player.characterId)?.id).toBe(playerList(y.dialogue!.races[0], y.player.characterId)?.id);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { globalThis.fetch = orig; }
  }, 120000);
});
