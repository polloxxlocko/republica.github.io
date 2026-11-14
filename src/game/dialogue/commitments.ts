/**
 * COMPROMISOS POLÍTICOS. El cumplimiento se VERIFICA con lo que el jugador (o la IA) hace después,
 * no con la respuesta elegida. Se distingue el incumplimiento deliberado del causado por circunstancias
 * externas, el cambio de condiciones, la renegociación y el término del acuerdo.
 */
import type { GameState } from '../models/types';
import type { Rng } from '../engine/rng';
import { clamp } from '../rules/params';
import { newId } from '../systems/util';
import { bio } from '../career/capital';
import type { PoliticalCommitment, CommitmentStatus } from './types';
import { changeRel, disposition } from './relations';
import { addMemory } from './memory';
import { fn, playerList } from './world';

export function addCommitment(s: GameState, c: Omit<PoliticalCommitment, 'id' | 'createdWeek' | 'status'>): PoliticalCommitment {
  const cm: PoliticalCommitment = { id: newId(s, 'pc'), createdWeek: s.week, status: 'vigente', ...c };
  s.dialogue!.commitments.push(cm);
  if (c.debtor === s.player.characterId) bio(s, 'compromiso', `Compromiso con ${fn(s.characters[c.creditor])}`, c.content, 0);
  return cm;
}

const logAfter = (s: GameState, cm: PoliticalCommitment, type: string) => s.dialogue!.actionLog.filter((a) => a.week >= cm.createdWeek && a.type === type);

export function resolve(s: GameState, cm: PoliticalCommitment, status: CommitmentStatus, breach?: PoliticalCommitment['breach'], note?: string): void {
  cm.status = status; cm.breach = breach; cm.resolvedWeek = s.week; cm.note = note;
  const st = s.dialogue!; const pid = s.player.characterId;
  const playerDebtor = cm.debtor === pid;
  const owner = playerDebtor ? cm.creditor : pid; // quien evalúa el cumplimiento
  const about = cm.debtor;
  const ref = [cm.id, ...(cm.sessionId ? [cm.sessionId] : [])];
  if (status === 'cumplido') {
    changeRel(s, { type: 'rel', from: owner, to: about, dims: { trust: 12, reliability: 20, cooperation: 8 }, importance: 'compromiso' });
    addMemory(s, { owner, about, participants: [owner, about], kind: 'promesa_cumplida', summary: `Cumplió: ${cm.content}`, importance: 'compromiso', refs: ref });
    if (playerDebtor) { st.reputation.cumplimiento = clamp(st.reputation.cumplimiento + 3, 0, 100); bio(s, 'compromiso', `Cumples tu compromiso con ${fn(s.characters[cm.creditor])}`, cm.content, 1); }
  } else if (status === 'incumplido') {
    const deliberate = breach === 'deliberado';
    changeRel(s, { type: 'rel', from: owner, to: about, dims: deliberate ? { trust: -25, reliability: -40, rivalry: 20, personal: -10 } : breach === 'cambio_condiciones' ? { trust: -8, reliability: -14 } : { trust: -3, reliability: -6 }, importance: deliberate ? 'decisivo' : 'relevante' });
    addMemory(s, { owner, about, participants: [owner, about], kind: 'promesa_incumplida', summary: `${deliberate ? 'No cumplió' : 'No pudo cumplir'}: ${cm.content}${note ? ` (${note})` : ''}`, importance: deliberate ? 'decisivo' : 'relevante', refs: ref });
    if (playerDebtor) {
      st.reputation.cumplimiento = clamp(st.reputation.cumplimiento - (deliberate ? 8 : breach === 'cambio_condiciones' ? 3 : 1), 0, 100);
      if (deliberate) { const me = s.characters[pid]; me.rep.credibilidad = clamp(me.rep.credibilidad - 2, 0, 100); }
      bio(s, 'compromiso', `${deliberate ? 'Incumples' : 'No puedes cumplir'} tu compromiso con ${fn(s.characters[cm.creditor])}`, note ?? cm.content, -1);
    }
  } else if (status === 'renegociado') {
    changeRel(s, { type: 'rel', from: owner, to: about, dims: { reliability: -3, trust: 2 }, importance: 'menor' });
  }
}

/** Verificación semanal de los compromisos vigentes contra lo que efectivamente ocurrió. */
export function verifyCommitments(s: GameState, rng: Rng): void {
  const st = s.dialogue!; const pid = s.player.characterId; const me = s.characters[pid];
  for (const cm of st.commitments) {
    if (cm.status !== 'vigente') continue;
    const creditor = s.characters[cm.creditor]; const debtor = s.characters[cm.debtor];
    if (!creditor || creditor.status !== 'activo' || !debtor || debtor.status !== 'activo') { resolve(s, cm, 'terminado', undefined, 'una de las partes dejó la vida política'); continue; }
    switch (cm.kind) {
      case 'apoyo_lista': {
        const race = st.races.find((r) => r.id === cm.conditions.raceId);
        if (!race || race.status === 'cancelada') { resolve(s, cm, 'terminado', undefined, 'la elección regional no se realizó'); break; }
        const myList = playerList(race, pid);
        if (myList && myList.id !== cm.conditions.listId) { resolve(s, cm, 'incumplido', 'deliberado', 'se sumó a otra lista'); break; }
        if (race.status === 'resuelta') resolve(s, cm, myList?.id === cm.conditions.listId ? 'cumplido' : 'incumplido', myList ? undefined : 'deliberado', myList ? undefined : 'se retiró de la lista');
        break;
      }
      case 'apoyo_interna': {
        const p = s.parties[String(cm.conditions.partyId)];
        if (me.partyId !== cm.conditions.partyId) { resolve(s, cm, 'incumplido', 'cambio_condiciones', 'dejó el partido'); break; }
        const otherSupport = logAfter(s, cm, 'apoyo_interna').find((a) => a.ref !== cm.creditor);
        const ranAgainst = logAfter(s, cm, 'postular_interna').length > 0;
        if (otherSupport || ranAgainst) { resolve(s, cm, 'incumplido', 'deliberado', ranAgainst ? 'compitió en la misma elección interna' : 'respaldó a otra figura'); break; }
        if (p && p.nextLeadershipWeek > Number(cm.conditions.leadershipWeek)) resolve(s, cm, 'cumplido');
        else if (s.week > cm.dueWeek) resolve(s, cm, 'terminado', undefined, 'no hubo elección en el plazo');
        break;
      }
      case 'trabajo_campana': {
        if (logAfter(s, cm, 'trabajar_campana').some((a) => a.ref === cm.creditor)) { resolve(s, cm, 'cumplido'); break; }
        if (s.week > cm.dueWeek) {
          const ownCampaign = s.player.candidacies.length > 0;
          resolve(s, cm, 'incumplido', ownCampaign ? 'cambio_condiciones' : 'deliberado', ownCampaign ? 'tenía su propia campaña' : 'no se sumó a la campaña');
        }
        break;
      }
      case 'voto_proyecto': {
        const v = logAfter(s, cm, 'voto_parlamentario').find((a) => a.ref === cm.conditions.billId);
        if (v) { resolve(s, cm, v.value === 'yes' ? 'cumplido' : v.value === 'abst' ? 'renegociado' : 'incumplido', v.value === 'no' ? 'deliberado' : undefined, v.value === 'no' ? 'votó en contra' : undefined); break; }
        const b = s.bills.find((x) => x.id === cm.conditions.billId);
        if (!b || b.closedWeek !== undefined) resolve(s, cm, 'terminado', undefined, 'el proyecto no llegó a votarse');
        break;
      }
      case 'reunion_seguimiento': {
        if (st.sessions.some((x) => x.week > cm.createdWeek && x.participants.includes(cm.creditor === pid ? cm.debtor : cm.creditor))) resolve(s, cm, 'cumplido');
        else if (s.week > cm.dueWeek) resolve(s, cm, 'terminado', undefined, 'la reunión no se concretó');
        break;
      }
      case 'lealtad': {
        const mentor = cm.creditor;
        const competed = s.career.processes.some((p) => p.aspirants.some((a) => a.charId === pid && a.joinedWeek >= cm.createdWeek) && p.aspirants.some((a) => a.charId === mentor && a.status !== 'retirado'));
        if (competed) { resolve(s, cm, 'incumplido', 'deliberado', 'compitió contra su mentor/a'); break; }
        if (s.week > cm.dueWeek) resolve(s, cm, 'cumplido');
        break;
      }
      case 'apoyo_aspiracion': {
        // la IA decide de forma autónoma al llegar el momento: puede cumplir o no
        if (cm.debtor === pid) break;
        const proc = s.career.processes.find((p) => p.status !== 'resuelto' && p.status !== 'cancelado' && p.aspirants.some((a) => a.charId === pid && a.joinedWeek >= cm.createdWeek && a.status !== 'retirado'));
        if (proc) {
          const npcRuns = proc.aspirants.some((a) => a.charId === cm.debtor && a.status !== 'retirado');
          const disp = disposition(s, cm.debtor, pid) + rng.normal(0, 10);
          const mine = proc.aspirants.find((a) => a.charId === pid)!;
          if (npcRuns) resolve(s, cm, 'incumplido', 'cambio_condiciones', `${fn(debtor)} también aspira a ese cupo`);
          else if (disp > -10) { if (!mine.backers.includes(cm.debtor)) mine.backers.push(cm.debtor); resolve(s, cm, 'cumplido'); s.player.lastActionResults.push(`${fn(debtor)} cumple su palabra y respalda tu aspiración en ${proc.unitLabel}.`); }
          else resolve(s, cm, 'incumplido', 'deliberado', `${fn(debtor)} prefirió no respaldarte`);
        } else if (s.week > cm.dueWeek) resolve(s, cm, 'terminado', undefined, 'no hubo una aspiración en el plazo');
        break;
      }
      case 'equipo': {
        if (cm.conditions.raceId) {
          const race = st.races.find((r) => r.id === cm.conditions.raceId);
          if (!race || race.status === 'cancelada') { resolve(s, cm, 'terminado', undefined, 'no hubo elección'); break; }
          if (race.status === 'resuelta') {
            const debtorIsNpc = cm.debtor !== pid;
            if (race.winnerList !== cm.conditions.listId) resolve(s, cm, 'terminado', undefined, 'la lista no ganó');
            else if (!playerList(race, pid) || playerList(race, pid)!.id !== cm.conditions.listId) resolve(s, cm, 'terminado', undefined, 'ya no integraba la lista');
            else if (debtorIsNpc) {
              // la IA decide si cumple: una lista ganadora puede reacomodar sus espacios
              const keep = disposition(s, cm.debtor, pid) + rng.normal(0, 10) > -15;
              if (keep && !me.offices.some((o) => o.type === 'dirigente_territorial')) me.offices.push({ type: 'dirigente_territorial', regionId: me.regionId, since: s.week, label: 'Responsabilidad territorial en la directiva regional' });
              resolve(s, cm, keep ? 'cumplido' : 'incumplido', keep ? undefined : 'deliberado', keep ? undefined : 'los espacios se repartieron entre los sectores');
            } else resolve(s, cm, 'cumplido');
          }
          break;
        }
        if (logAfter(s, cm, 'renunciar_partido').length) resolve(s, cm, 'incumplido', 'cambio_condiciones', 'renunció al partido');
        else if (s.week > cm.dueWeek) resolve(s, cm, 'cumplido');
        break;
      }
      case 'acuerdo_programatico': {
        if (logAfter(s, cm, 'renunciar_partido').length) resolve(s, cm, 'incumplido', 'cambio_condiciones', 'renunció al partido');
        else if (s.week > cm.dueWeek) resolve(s, cm, 'cumplido');
        break;
      }
    }
  }
}
