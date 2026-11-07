/**
 * CONGRESO NACIONAL: escaños individuales, comportamiento de voto, tramitación legislativa.
 *
 * Tramitación (simplificada, ver SIMULATION_RULES.md §5):
 *   comisión (cámara de origen) → sala → comisión (cámara revisora) → sala →
 *   [tercer trámite si hubo modificaciones] → [comisión mixta si se rechazan] →
 *   ejecutivo (promulga o veta) → [insistencia 2/3] → [Tribunal Constitucional si LOC/reforma] → publicación.
 * La duración de cada etapa depende de la urgencia (simple, suma, discusión inmediata).
 */
import type { Bill, BillStage, Chamber, Character, GameState, Ideology, Quorum, Urgency, VoteRecord, Seat } from '../models/types';
import { Rng } from '../engine/rng';
import { AREA_DIM, DIMS, PARLIAMENT, QUORUMS, clamp, sigmoid } from '../rules/params';
import { PERSONALITY_TRAITS, fullName, memoryBalance, remember } from './characters';
import { addHistory, ideoDistance, newId, zeroIdeology } from './util';
import { createCharacter } from './characters';
import { REGION_BY_ID } from '../data/geography';
import { POLICY_BY_ID } from '../data/policies';

export const STAGE_LABELS: Record<BillStage, string> = {
  comision_origen: 'Comisión (cámara de origen)', sala_origen: 'Sala (cámara de origen)', comision_revisora: 'Comisión (cámara revisora)',
  sala_revisora: 'Sala (cámara revisora)', tercer_tramite: 'Tercer trámite', comision_mixta: 'Comisión mixta', ejecutivo: 'Ejecutivo (promulgación o veto)',
  insistencia_veto: 'Votación de insistencia (veto)', tribunal_constitucional: 'Tribunal Constitucional', publicada: 'Publicada (ley)',
  rechazada: 'Rechazada', archivada: 'Archivada', retirada: 'Retirada',
};
export const QUORUM_LABELS: Record<Quorum, string> = {
  simple: 'Simple (mayoría de presentes)', absoluta: 'Mayoría absoluta en ejercicio', loc: 'Ley orgánica (4/7 en ejercicio)', reforma_constitucional: 'Reforma constitucional (4/7)',
};
export const URGENCY_LABELS: Record<Urgency, string> = { ninguna: 'Sin urgencia', simple: 'Urgencia simple', suma: 'Suma urgencia', discusion_inmediata: 'Discusión inmediata' };

/** Hook para aplicar consecuencias del voto del jugador (lo registra el motor). */
export let onPlayerVote: ((s: GameState, b: Bill, vote: 'yes' | 'no' | 'abst') => void) | null = null;
/** Gancho de designación de reemplazos (lo registra el módulo de carrera). */
let vacancyHook: ((s: GameState, rng: Rng, seat: Seat, partyId: string) => string | 'pending' | null) | undefined;
export function setVacancyHook(f: typeof vacancyHook): void { vacancyHook = f; }
export const _castVote = (...a: Parameters<typeof castVote>) => castVote(...a);
export function setPlayerVoteHook(f: typeof onPlayerVote): void { onPlayerVote = f; }

export function members(s: GameState, chamber: Chamber): Character[] {
  const out: Character[] = [];
  for (const st of s.seats) if (st.chamber === chamber && st.holderId) {
    const c = s.characters[st.holderId];
    if (c && c.status === 'activo') out.push(c);
  }
  return out;
}

export function otherChamber(c: Chamber): Chamber { return c === 'camara' ? 'senado' : 'camara'; }

/** Contenido efectivo del proyecto tras moderación (indicaciones). */
export function effectivePosition(b: Bill): Ideology {
  const r = zeroIdeology();
  for (const d of DIMS) r[d] = b.position[d] * b.intensity * (1 - b.moderation * 0.7);
  return r;
}

function billWeights(b: Bill): Partial<Record<keyof Ideology, number>> {
  const w: Partial<Record<keyof Ideology, number>> = {};
  for (const d of DIMS) w[d] = Math.abs(b.position[d]) > 5 ? 1 : 0.05;
  for (const [d, v] of Object.entries(AREA_DIM[b.area])) w[d as keyof Ideology] = (w[d as keyof Ideology] ?? 0) + (v ?? 0);
  return w;
}

/** Beneficio ideológico de aprobar el proyecto para un actor con ideología `ideo` (-1..1 aprox.). */
export function ideologicalBenefit(ideo: Ideology, b: Bill): number {
  const w = billWeights(b);
  const before = ideoDistance(ideo, zeroIdeology(), w);
  const after = ideoDistance(ideo, effectivePosition(b), w);
  return (before - after) * 3;
}

/** Postura oficial del partido frente al proyecto (-1..1). */
export function partyStance(s: GameState, partyId: string, b: Bill): number {
  const p = s.parties[partyId];
  if (!p) return 0;
  let st = ideologicalBenefit(p.ideology, b) * 1.3;
  const isGovBill = b.origin === 'mensaje';
  const inGov = s.government.coalitionId ? s.coalitions[s.government.coalitionId]?.members.includes(partyId) : false;
  const presParty = s.characters[s.government.presidentId]?.partyId;
  if (isGovBill) st += inGov || presParty === partyId ? 0.45 : -0.15;
  if (b.authorPartyId === partyId) st += 0.6;
  st += (b.sideSupport[partyId] ?? 0) * 1.6; // acuerdos negociados con la directiva
  st += b.popularity / 250;
  return clamp(st, -1.6, 1.6);
}

/** Probabilidades de voto de un parlamentario (a favor, en contra, abstención). */
export function voteProbabilities(s: GameState, c: Character, b: Bill): { yes: number; no: number; abst: number } {
  const traits = PERSONALITY_TRAITS[c.personality];
  const party = c.partyId ? s.parties[c.partyId] : null;
  const own = ideologicalBenefit(c.ideology, b);
  const line = party ? partyStance(s, party.id, b) : 0;
  const discipline = party ? (party.discipline / 100) * (0.65 + 0.35 * traits.loyalty) * (0.55 + party.cohesion / 220) : 0;
  let x = PARLIAMENT.wIdeology * own * (1.2 - 0.5 * traits.flexibility);
  x += PARLIAMENT.wPartyLine * line * discipline;
  const presParty = s.characters[s.government.presidentId]?.partyId;
  const govSupporter = party && (presParty === party.id || (s.government.coalitionId && s.coalitions[s.government.coalitionId]?.members.includes(party.id)));
  if (b.origin === 'mensaje') x += PARLIAMENT.wGovernment * (govSupporter ? 0.6 : -0.3);
  // presión electoral: popularidad del proyecto en su región y cercanía de elecciones
  const regionMood = s.regions[c.regionId].discontent / 100;
  x += PARLIAMENT.wPopularity * (b.popularity / 100) * (1 + regionMood);
  x += PARLIAMENT.wNegotiated * (b.personalSupport[c.id] ?? 0);
  x += PARLIAMENT.wRelation * (memoryBalance(c, b.authorId) / 100);
  const pYesRaw = sigmoid(x);
  const abst = PARLIAMENT.abstentionBand * Math.exp(-x * x * 1.5);
  return { yes: pYesRaw * (1 - abst), no: (1 - pYesRaw) * (1 - abst), abst };
}

export function requiredYes(q: Quorum, inOffice: number, present: number): number {
  const rule = QUORUMS[q];
  const base = rule.base === 'ejercicio' ? inOffice : present;
  if (rule.fraction === 0.5) return Math.floor(base / 2) + 1;
  return Math.ceil(base * rule.fraction);
}

/** Proyección (valor esperado) de una votación, para la interfaz de negociación. */
export function whipCount(s: GameState, b: Bill, chamber: Chamber) {
  const mem = members(s, chamber);
  let yes = 0; let no = 0; let abst = 0;
  const byParty: Record<string, { yes: number; no: number; abst: number; n: number }> = {};
  for (const c of mem) {
    const p = voteProbabilities(s, c, b);
    yes += p.yes; no += p.no; abst += p.abst;
    const k = c.partyId ?? 'IND';
    const e = (byParty[k] ??= { yes: 0, no: 0, abst: 0, n: 0 });
    e.yes += p.yes; e.no += p.no; e.abst += p.abst; e.n += 1;
  }
  const inOffice = chamber === 'camara' ? PARLIAMENT.deputies : PARLIAMENT.senators;
  return { yes, no, abst, required: requiredYes(b.quorum, inOffice, mem.length), byParty, total: mem.length };
}

function castVote(s: GameState, rng: Rng, b: Bill, chamber: Chamber, voters: Character[], stage: BillStage, quorumOverride?: number): VoteRecord {
  let yes = 0; let no = 0; let abst = 0;
  const byParty: VoteRecord['byParty'] = {};
  const rebels: Character[] = [];
  for (const c of voters) {
    const p = voteProbabilities(s, c, b);
    const r = rng.next();
    const k = c.partyId ?? 'IND';
    const e = (byParty[k] ??= { yes: 0, no: 0, abst: 0 });
    let v: 'yes' | 'no' | 'abst';
    if (r < p.yes) v = 'yes'; else if (r < p.yes + p.no) v = 'no'; else v = 'abst';
    if (c.isPlayer && !stage.startsWith('comision')) {
      // El jugador decide su propio voto; si no se pronunció, vota con la línea de su bancada
      const line = c.partyId ? partyStance(s, c.partyId, b) : 0;
      v = b.playerVote ?? (line > 0.3 ? 'yes' : line < -0.3 ? 'no' : 'abst');
      if (b.playerVote) onPlayerVote?.(s, b, b.playerVote);
    }
    if (v === 'yes') { yes++; e.yes++; } else if (v === 'no') { no++; e.no++; } else { abst++; e.abst++; }
    if (c.partyId) {
      const line = partyStance(s, c.partyId, b);
      if ((line > 0.3 && v === 'no') || (line < -0.3 && v === 'yes')) rebels.push(c);
    }
  }
  const inOffice = stage.startsWith('comision') ? voters.length : chamber === 'camara' ? PARLIAMENT.deputies : PARLIAMENT.senators;
  const present = yes + no + abst;
  const required = quorumOverride ?? (stage.startsWith('comision') ? Math.floor(voters.length / 2) + 1 : requiredYes(b.quorum, inOffice, present));
  const passed = b.quorum === 'simple' && !stage.startsWith('comision') && quorumOverride === undefined ? yes > no : yes >= required;
  // memoria de desmarques (descolgados)
  for (const r of rebels) {
    const party = r.partyId ? s.parties[r.partyId] : null;
    if (party?.leaderId && s.characters[party.leaderId]) {
      remember(s.characters[party.leaderId], { week: s.week, aboutId: r.id, kind: 'traicion', weight: -6, note: `Votó contra la línea en "${b.title}"` });
    }
    if (party) party.cohesion = clamp(party.cohesion - 0.15, 0, 100);
  }
  return { week: s.week, chamber, stage, yes, no, abst, required, passed, byParty };
}

function committee(s: GameState, rng: Rng, chamber: Chamber, b: Bill): Character[] {
  const mem = members(s, chamber);
  const size = PARLIAMENT.committeeSize[chamber];
  // proporcionalidad aproximada: especialistas del área primero, luego sorteo determinista
  const spec = mem.filter((c) => c.specialty === b.area);
  const rest = rng.shuffle(mem.filter((c) => c.specialty !== b.area));
  return [...spec.slice(0, Math.ceil(size / 3)), ...rest].slice(0, size);
}

function stageDuration(b: Bill): number { return PARLIAMENT.stageWeeks[b.urgency] ?? 6; }

function advance(s: GameState, b: Bill, stage: BillStage, note: string): void {
  b.stage = stage; b.stageWeek = s.week; b.log.push(`S${s.week}: ${note}`);
  if (['publicada', 'rechazada', 'archivada', 'retirada'].includes(stage)) b.closedWeek = s.week;
}

export function createBill(s: GameState, o: Omit<Bill, 'id' | 'stage' | 'stageWeek' | 'votes' | 'concessions' | 'sideSupport' | 'personalSupport' | 'submittedWeek' | 'log' | 'moderation' | 'modifiedInRevision'>): Bill {
  const b: Bill = {
    ...o, id: newId(s, 'b'), stage: 'comision_origen', stageWeek: s.week, votes: [], concessions: [], sideSupport: {}, personalSupport: {},
    submittedWeek: s.week, log: [`S${s.week}: Ingresa a tramitación en ${o.chamberOfOrigin === 'camara' ? 'la Cámara' : 'el Senado'}`], moderation: 0, modifiedInRevision: false,
  };
  s.bills.push(b);
  return b;
}

/** Callback para notificar a otros sistemas la publicación/rechazo (evita dependencias circulares). */
export type BillHook = (s: GameState, b: Bill, outcome: 'publicada' | 'rechazada') => void;

/** Avanza la tramitación de todos los proyectos activos una semana. */
export function processBills(s: GameState, rng: Rng, onClose: BillHook, presidentDecides: (b: Bill) => 'promulgar' | 'vetar' | 'pendiente'): void {
  for (const b of s.bills) {
    if (b.closedWeek !== undefined) continue;
    const waited = s.week - b.stageWeek;
    if (waited < stageDuration(b)) continue;
    const origin = b.chamberOfOrigin; const rev = otherChamber(origin);
    switch (b.stage) {
      case 'comision_origen':
      case 'comision_revisora': {
        const ch = b.stage === 'comision_origen' ? origin : rev;
        const com = committee(s, rng, ch, b);
        const v = castVote(s, rng, b, ch, com, b.stage);
        b.votes.push(v);
        if (!v.passed) {
          // Sin urgencia, la comisión puede congelar el proyecto; con urgencia debe informarlo a la sala.
          if (b.urgency === 'ninguna' && rng.chance(0.55)) {
            if (waited > PARLIAMENT.archiveAfter / 4) advance(s, b, 'archivada', 'Archivado tras quedar sin votación en comisión');
            else b.log.push(`S${s.week}: La comisión posterga la votación (informe negativo)`);
            break;
          }
          b.moderation = clamp(b.moderation + 0.12, 0, 0.9);
          if (b.stage === 'comision_revisora') b.modifiedInRevision = true;
        } else if (b.stage === 'comision_revisora' && rng.chance(0.45)) {
          b.moderation = clamp(b.moderation + 0.05, 0, 0.9);
          b.modifiedInRevision = true;
        }
        advance(s, b, b.stage === 'comision_origen' ? 'sala_origen' : 'sala_revisora', `Informe de comisión (${v.yes}-${v.no}-${v.abst})${b.modifiedInRevision ? ' con indicaciones' : ''}`);
        break;
      }
      case 'sala_origen': {
        const v = castVote(s, rng, b, origin, members(s, origin), b.stage);
        b.votes.push(v);
        if (v.passed) advance(s, b, 'comision_revisora', `Aprobado en sala de origen (${v.yes}-${v.no}-${v.abst})`);
        else { advance(s, b, 'rechazada', `Rechazado en sala de origen (${v.yes}-${v.no}-${v.abst}; requería ${v.required})`); onClose(s, b, 'rechazada'); }
        break;
      }
      case 'sala_revisora': {
        const v = castVote(s, rng, b, rev, members(s, rev), b.stage);
        b.votes.push(v);
        if (v.passed) advance(s, b, b.modifiedInRevision ? 'tercer_tramite' : 'ejecutivo', `Aprobado en cámara revisora (${v.yes}-${v.no}-${v.abst})`);
        else advance(s, b, 'comision_mixta', `Rechazado en cámara revisora; pasa a comisión mixta`);
        break;
      }
      case 'tercer_tramite': {
        const v = castVote(s, rng, b, origin, members(s, origin), b.stage);
        b.votes.push(v);
        if (v.passed) advance(s, b, 'ejecutivo', 'Cámara de origen aprueba las modificaciones');
        else advance(s, b, 'comision_mixta', 'Cámara de origen rechaza modificaciones; comisión mixta');
        break;
      }
      case 'comision_mixta': {
        b.moderation = clamp(b.moderation + 0.15, 0, 0.9);
        const v1 = castVote(s, rng, b, origin, members(s, origin), b.stage);
        const v2 = castVote(s, rng, b, rev, members(s, rev), b.stage);
        b.votes.push(v1, v2);
        if (v1.passed && v2.passed) advance(s, b, 'ejecutivo', 'Informe de comisión mixta aprobado por ambas cámaras');
        else { advance(s, b, 'rechazada', 'Informe de comisión mixta rechazado'); onClose(s, b, 'rechazada'); }
        break;
      }
      case 'ejecutivo': {
        const d = presidentDecides(b);
        if (d === 'pendiente') break;
        if (d === 'vetar') { b.vetoed = true; advance(s, b, 'insistencia_veto', 'El Presidente formula veto'); }
        else advance(s, b, needsTC(b) ? 'tribunal_constitucional' : 'publicada', 'Despachado al Ejecutivo y promulgado');
        if ((b.stage as BillStage) === 'publicada') onClose(s, b, 'publicada');
        break;
      }
      case 'insistencia_veto': {
        const v1 = castVote(s, rng, b, origin, members(s, origin), b.stage, Math.ceil(PARLIAMENT.deputies * PARLIAMENT.vetoInsistence));
        const v2 = castVote(s, rng, b, rev, members(s, rev), b.stage, Math.ceil(PARLIAMENT.senators * PARLIAMENT.vetoInsistence));
        if (origin === 'senado') { v1.required = Math.ceil(PARLIAMENT.senators * PARLIAMENT.vetoInsistence); v2.required = Math.ceil(PARLIAMENT.deputies * PARLIAMENT.vetoInsistence); v1.passed = v1.yes >= v1.required; v2.passed = v2.yes >= v2.required; }
        b.votes.push(v1, v2);
        if (v1.passed && v2.passed) { advance(s, b, needsTC(b) ? 'tribunal_constitucional' : 'publicada', 'El Congreso insiste por 2/3: se promulga'); if ((b.stage as BillStage) === 'publicada') onClose(s, b, 'publicada'); }
        else { advance(s, b, 'rechazada', 'Veto acogido: no se alcanzan los 2/3 para insistir'); onClose(s, b, 'rechazada'); }
        break;
      }
      case 'tribunal_constitucional': {
        // Control preventivo obligatorio para normas orgánicas; probabilidad baja de objeción parcial.
        if (rng.chance(0.08 + b.intensity * 0.08)) { b.moderation = clamp(b.moderation + 0.1, 0, 0.9); b.log.push(`S${s.week}: TC declara inconstitucionales algunas normas`); }
        advance(s, b, 'publicada', 'Control de constitucionalidad superado; publicada en el Diario Oficial');
        onClose(s, b, 'publicada');
        break;
      }
      default: break;
    }
    if (b.closedWeek === undefined && s.week - b.submittedWeek > PARLIAMENT.archiveAfter && b.urgency === 'ninguna') {
      advance(s, b, 'archivada', 'Archivado por inactividad');
    }
  }
  // depurar proyectos cerrados antiguos
  if (s.bills.length > 220) s.bills = s.bills.filter((b) => b.closedWeek === undefined || s.week - b.closedWeek < 260);
}

function needsTC(b: Bill): boolean { return b.quorum === 'loc' || b.quorum === 'reforma_constitucional'; }

/** Reemplazo de vacantes parlamentarias: el partido del titular designa reemplazo (art. 51 CPR). */
export function fillVacancies(s: GameState, rng: Rng): void {
  for (const st of s.seats) {
    if (st.holderId && s.characters[st.holderId]?.status === 'activo') continue;
    const prev = st.holderId ? s.characters[st.holderId] : null;
    const partyId = prev?.partyId ?? Object.entries(s.regions[st.regionId].partySupport).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (!partyId || !s.parties[partyId]?.active) { st.holderId = null; continue; }
    // Designación por la directiva (art. 51 CPR): puede recaer en una figura existente o en el jugador
    const pick = vacancyHook?.(s, rng, st, partyId);
    if (pick === 'pending') { st.holderId = null; continue; }
    if (pick && s.characters[pick]) {
      const w = s.characters[pick];
      st.holderId = w.id;
      w.offices.push({ type: st.chamber === 'camara' ? 'diputado' : 'senador', regionId: st.regionId, districtId: st.chamber === 'camara' ? st.unitId : undefined, since: s.week, termEndWeek: st.termEndWeek });
      w.pastOffices.push({ type: st.chamber === 'camara' ? 'diputado' : 'senador', from: s.week, to: s.week, detail: 'reemplazo' });
      continue;
    }
    const c = createCharacter(s, rng, { partyId, regionId: st.regionId, ideology: s.parties[partyId].ideology, quality: 50 });
    st.holderId = c.id;
    c.offices.push({ type: st.chamber === 'camara' ? 'diputado' : 'senador', regionId: st.regionId, districtId: st.chamber === 'camara' ? st.unitId : undefined, since: s.week, termEndWeek: st.termEndWeek });
    c.pastOffices.push({ type: st.chamber === 'camara' ? 'diputado' : 'senador', from: s.week, to: s.week, detail: 'reemplazo' });
  }
}

/** Mociones parlamentarias espontáneas (IA). */
export function spawnMotions(s: GameState, rng: Rng, templates: { title: string; area: Bill['area']; position: Partial<Ideology>; quorum: Quorum }[]): void {
  if (!rng.chance(0.22)) return;
  const chamber: Chamber = rng.chance(0.65) ? 'camara' : 'senado';
  const mem = members(s, chamber).filter((c) => !c.isPlayer);
  if (!mem.length) return;
  const t = rng.pick(templates);
  const pos = { ...zeroIdeology(), ...t.position };
  // el autor es alguien cercano al contenido
  const author = mem.map((c) => ({ c, d: ideoDistance(c.ideology, pos) + rng.next() * 0.3 })).sort((a, b) => a.d - b.d)[0].c;
  if (s.bills.some((b) => b.title === t.title && b.closedWeek === undefined)) return;
  createBill(s, { title: t.title, area: t.area, origin: 'mocion', authorId: author.id, authorPartyId: author.partyId, chamberOfOrigin: chamber, urgency: 'ninguna', quorum: t.quorum, position: pos, intensity: 0.6, popularity: Math.round(rng.normal(10, 25)), fiscalCost: 0 });
}

/** Aplicación de efectos al publicarse una moción (no ligada a política). */
export function motionPublished(s: GameState, b: Bill): void {
  const author = s.characters[b.authorId];
  if (author) {
    author.rep.prestigioTecnico = clamp(author.rep.prestigioTecnico + 4, 0, 100);
    author.rep.reconocimiento = clamp(author.rep.reconocimiento + 3, 0, 100);
  }
  const sat = s.opinion.areaSatisfaction;
  sat[b.area] = clamp((sat[b.area] ?? 0) + 2 * Math.sign(b.popularity || 1), -100, 100);
  if (b.title.startsWith('Proyecto que limita la reelección')) addHistory(s, 'reforma', 'Se aprueba límite adicional a la reelección', 'Reforma constitucional publicada.', 3);
  else addHistory(s, 'reforma', `Nueva ley: ${b.title.replace(/^Proyecto (de ley )?/, '')}`, `Iniciativa de ${fullName(author)} (${b.authorPartyId ?? 'IND'}).`, 2);
}

export function policyOfBill(b: Bill) { return b.policyId ? POLICY_BY_ID[b.policyId] : undefined; }

export function seatLabel(s: GameState, charId: string): string {
  const st = s.seats.find((x) => x.holderId === charId);
  if (!st) return '';
  return st.chamber === 'camara' ? `Distrito ${st.unitId}` : `Circ. ${REGION_BY_ID[st.regionId].shortName}`;
}
