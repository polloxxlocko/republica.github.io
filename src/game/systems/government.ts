/**
 * GOBIERNO Y ADMINISTRACIÓN DEL ESTADO.
 *
 * Ciclo de una política: anuncio → formulación → tramitación (si requiere ley) → aprobación →
 * financiamiento → implementación → evaluación → completada / fracasada.
 * El Presidente no cambia variables directamente: las políticas requieren capacidad estatal,
 * ministros competentes, financiamiento y, a menudo, aprobación del Congreso.
 */
import type { ActivePolicy, Bill, Budget, Character, GameState, MinisterPost, PolicyDef } from '../models/types';
import { Rng } from '../engine/rng';
import { MINISTRIES, MINISTRY_BY_ID } from '../data/institutions';
import { POLICIES, POLICY_BY_ID } from '../data/policies';
import { clamp, ECON } from '../rules/params';
import { createBill, ideologicalBenefit, members } from './parliament';
import { createCharacter, fullName, removeOffice, remember } from './characters';
import { addHistory, addRelation, ideoDistance, newId } from './util';
import { addNews } from './news';
import { addShock } from './economy';
import { monthOf, yearOf, weekToDate } from '../engine/dates';
import { listIdOf } from './elections';

export function emptyBudget(year: number, revenue: number, spending: number): Budget {
  return { year, revenue, spending, byArea: {}, investment: 4.5, approved: true, status: 'vigente', execution: 0.92 };
}

export function ministerCompetence(c: Character | undefined): number {
  if (!c) return 0.35;
  return clamp((c.attrs.gestion * 0.4 + c.attrs.tecnico * 0.35 + c.attrs.experiencia * 0.25) / 100, 0.1, 1);
}

export function policyStatusLabel(p: ActivePolicy['phase']): string {
  return ({ anunciada: 'Anunciada', formulacion: 'En formulación', tramitacion: 'En tramitación', aprobada: 'Aprobada', financiamiento: 'Esperando financiamiento', implementacion: 'En implementación', evaluacion: 'En evaluación', completada: 'Completada', fracasada: 'Fracasada', abandonada: 'Abandonada' } as const)[p];
}

// ---------------------------------------------------------------------------
// Gabinete
// ---------------------------------------------------------------------------
export function coalitionMembers(s: GameState): string[] {
  const g = s.government;
  const coal = g.coalitionId ? s.coalitions[g.coalitionId] : null;
  const pp = s.characters[g.presidentId]?.partyId;
  return [...new Set([...(coal?.members ?? []), ...(pp ? [pp] : [])])];
}

/** Candidatos elegibles para una cartera (sin crear personajes; función pura). */
export function ministerCandidates(s: GameState, ministryId: string, limit = 8): Character[] {
  const area = MINISTRY_BY_ID[ministryId].area;
  const allowed = new Set(coalitionMembers(s));
  const occupied = new Set(s.government.cabinet.map((p) => p.ministerId).filter(Boolean) as string[]);
  const list = Object.values(s.characters).filter((c) => c.status === 'activo' && !c.isPlayer && c.id !== s.government.presidentId && !occupied.has(c.id)
    && (c.partyId === null || allowed.has(c.partyId)) && !c.offices.some((o) => o.type === 'presidente' || o.type === 'gobernador' || o.type === 'alcalde'));
  return list.map((c) => ({ c, score: ministerCompetence(c) * 60 + (c.specialty === area ? 20 : 0) + c.rep.prestigioTecnico * 0.2 - c.scandal * 0.5 - (c.offices.some((o) => o.type === 'diputado' || o.type === 'senador') ? 18 : 0) - (c.offices.some((o) => o.type === 'presidente_partido') ? 25 : 0) }))
    .sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.c);
}

export function appointMinister(s: GameState, rng: Rng, ministryId: string, charId: string): string {
  const g = s.government;
  const post = g.cabinet.find((p) => p.ministryId === ministryId);
  if (!post) return 'Cartera inexistente';
  const c = s.characters[charId];
  if (!c) return 'Personaje inexistente';
  if (post.ministerId) {
    const old = s.characters[post.ministerId];
    if (old) { removeOffice(s, old, 'ministro', MINISTRY_BY_ID[ministryId].name); }
  }
  // Un parlamentario nombrado ministro cesa en su cargo (incompatibilidad, art. 58 CPR)
  for (const type of ['diputado', 'senador'] as const) {
    if (c.offices.some((o) => o.type === type)) {
      const seat = s.seats.find((st) => st.holderId === c.id);
      if (seat) seat.holderId = null;
      removeOffice(s, c, type, 'asume como ministro');
    }
  }
  c.offices.push({ type: 'ministro', ministryId, since: s.week });
  c.rep.reconocimiento = clamp(c.rep.reconocimiento + 12, 0, 100);
  post.ministerId = charId; post.since = s.week; post.performance = 50;
  const pres = s.characters[g.presidentId];
  if (pres && c.partyId && pres.partyId && c.partyId !== pres.partyId) addRelation(s, c.partyId, pres.partyId, 4);
  if (s.week > g.startWeek + 1) addNews(s, rng, 'gobierno', `${fullName(c)} asume en ${MINISTRY_BY_ID[ministryId].name}`, `${c.partyId ? s.parties[c.partyId]?.short : 'Independiente'}.`, 2);
  return `${fullName(c)} nombrad${c.gender === 'f' ? 'a' : 'o'} en ${MINISTRY_BY_ID[ministryId].name}.`;
}

/** Gabinete de la IA: reparto proporcional a escaños entre partidos de la coalición + técnicos. */
export function appointCabinetAI(s: GameState, rng: Rng): void {
  const g = s.government;
  g.cabinet = MINISTRIES.map((m) => ({ ministryId: m.id, ministerId: null, since: s.week, performance: 50 }));
  const allowed = coalitionMembers(s);
  const seats: Record<string, number> = {};
  for (const st of s.seats) if (st.holderId) { const p = s.characters[st.holderId]?.partyId; if (p && allowed.includes(p)) seats[p] = (seats[p] ?? 0) + 1; }
  const presParty = s.characters[g.presidentId]?.partyId;
  if (presParty) seats[presParty] = (seats[presParty] ?? 0) + 8;
  const total = Object.values(seats).reduce((a, b) => a + b, 0) || 1;
  const quota: Record<string, number> = {};
  for (const [p, n] of Object.entries(seats)) quota[p] = Math.round((n / total) * MINISTRIES.length * 0.8);
  // técnicos independientes
  for (let i = 0; i < 6; i++) createCharacter(s, rng, { partyId: null, regionId: 'RM', ideology: s.characters[g.presidentId]?.ideology ?? s.parties[allowed[0]]?.ideology, quality: 64, minAge: 40, maxAge: 66, personality: 'tecnocrata' });
  const order = [...MINISTRIES].sort((a, b) => b.weight - a.weight);
  for (const m of order) {
    const cands = ministerCandidates(s, m.id, 12);
    let chosen: Character | undefined;
    for (const c of cands) {
      if (c.partyId === null) { if (Object.values(quota).every((q) => q <= 0) || rng.chance(0.3)) { chosen = c; break; } continue; }
      if ((quota[c.partyId] ?? 0) > 0) { chosen = c; quota[c.partyId]--; break; }
    }
    chosen ??= cands[0];
    if (!chosen) {
      const p = rng.pick(allowed.length ? allowed : Object.keys(s.parties));
      chosen = createCharacter(s, rng, { partyId: p, regionId: 'RM', ideology: s.parties[p].ideology, quality: 58, minAge: 40 });
    }
    appointMinister(s, rng, m.id, chosen.id);
  }
}

/** Satisfacción de cada partido de la coalición con el reparto de carteras ("cuoteo"). */
export function cabinetBalance(s: GameState): Record<string, number> {
  const allowed = coalitionMembers(s);
  const seats: Record<string, number> = {};
  const posts: Record<string, number> = {};
  for (const st of s.seats) if (st.holderId) { const p = s.characters[st.holderId]?.partyId; if (p && allowed.includes(p)) seats[p] = (seats[p] ?? 0) + 1; }
  for (const post of s.government.cabinet) {
    const p = post.ministerId ? s.characters[post.ministerId]?.partyId : null;
    if (p) posts[p] = (posts[p] ?? 0) + MINISTRY_BY_ID[post.ministryId].weight;
  }
  const ts = Object.values(seats).reduce((a, b) => a + b, 0) || 1;
  const tp = Object.values(posts).reduce((a, b) => a + b, 0) || 1;
  const out: Record<string, number> = {};
  for (const p of allowed) out[p] = ((posts[p] ?? 0) / tp - (seats[p] ?? 0) / ts) * 100;
  return out;
}

// ---------------------------------------------------------------------------
// Instalación de un nuevo gobierno
// ---------------------------------------------------------------------------
export function inaugurate(s: GameState, rng: Rng): void {
  const g = s.government;
  const electId = g.electId;
  if (!electId) return;
  const old = s.characters[g.presidentId];
  const finalApproval = s.opinion.presidentialApproval;
  if (old) removeOffice(s, old, 'presidente', `aprobación final ${finalApproval.toFixed(0)}%`);
  for (const post of g.cabinet) if (post.ministerId) { const m = s.characters[post.ministerId]; if (m) removeOffice(s, m, 'ministro', 'cambio de gobierno'); }
  for (const c of Object.values(s.coalitions)) c.isGovernment = false;
  const pres = s.characters[electId];
  // Si era parlamentario, deja su escaño
  for (const type of ['diputado', 'senador', 'gobernador', 'alcalde', 'concejal'] as const) {
    if (pres.offices.some((o) => o.type === type)) {
      const seat = s.seats.find((st) => st.holderId === pres.id); if (seat) seat.holderId = null;
      if (type === 'gobernador' && s.regions[pres.regionId].governorId === pres.id) s.regions[pres.regionId].governorId = null;
      removeOffice(s, pres, type, 'asume la Presidencia');
    }
  }
  pres.offices.push({ type: 'presidente', since: s.week, termEndWeek: s.week + s.rules.presidentialTermYears * 52 });
  const prevCoal = g.coalitionId; const prevParty = old?.partyId;
  const continuity = (prevCoal && prevCoal === g.electCoalitionId) || (prevParty && prevParty === pres.partyId);
  g.coalitionTerms = continuity ? (g.coalitionTerms ?? 0) + 1 : 0;
  g.presidentId = electId;
  g.coalitionId = g.electCoalitionId && s.coalitions[g.electCoalitionId]?.active ? g.electCoalitionId : null;
  if (g.coalitionId) s.coalitions[g.coalitionId].isGovernment = true;
  g.startWeek = s.week; g.endWeek = s.week + s.rules.presidentialTermYears * 52;
  g.electId = null; g.electCoalitionId = null;
  g.policies = g.policies.filter((p) => p.phase === 'completada');
  for (const b of s.bills) if (b.closedWeek === undefined && b.origin === 'mensaje' && b.urgency !== 'ninguna') b.urgency = 'ninguna';
  g.honeymoon = 16; g.coordination = 60; g.promises = [];
  s.opinion.presidentialApproval = clamp(50 + (pres.rep.popularidad - 45) * 0.3, 35, 65);
  s.opinion.governmentApproval = s.opinion.presidentialApproval - 3;
  appointCabinetAI(s, rng);
  addHistory(s, 'gobierno', `Asume ${fullName(pres)} como ${pres.gender === 'f' ? 'Presidenta' : 'Presidente'} de la República`, `Partido: ${pres.partyId ? s.parties[pres.partyId]?.name : 'independiente'}. Coalición: ${g.coalitionId ? s.coalitions[g.coalitionId].name : 'sin coalición formal'}.`, 5);
  addNews(s, rng, 'gobierno', `${fullName(pres)} asume la Presidencia`, 'Ceremonia de transmisión del mando en el Congreso Nacional, Valparaíso.', 5);
  if (pres.isPlayer) s.player.lastActionResults.push('¡Asumes la Presidencia de la República! Revisa tu gabinete en la pantalla de Gobierno.');
}

// ---------------------------------------------------------------------------
// Políticas públicas
// ---------------------------------------------------------------------------
export function canAnnounce(s: GameState, defId: string): string | null {
  const g = s.government;
  if (g.policies.some((p) => p.defId === defId && !['completada', 'fracasada', 'abandonada'].includes(p.phase))) return 'Ya está en curso';
  if (g.policies.some((p) => p.defId === defId && p.phase === 'completada' && s.week - p.phaseWeek < 52 * 4)) return 'Ya fue implementada recientemente';
  const open = g.policies.filter((p) => !['completada', 'fracasada', 'abandonada'].includes(p.phase)).length;
  if (open >= 6) return 'La agenda de gobierno está saturada (máx. 6 políticas simultáneas)';
  return null;
}

function responsibleMinistry(def: PolicyDef): string {
  const m = MINISTRIES.find((x) => x.area === def.area);
  if (def.area === 'impuestos') return 'hacienda';
  if (def.area === 'migracion') return 'interior';
  return m?.id ?? 'segpres';
}

export function announcePolicy(s: GameState, rng: Rng, defId: string): string {
  const def = POLICY_BY_ID[defId];
  const reason = canAnnounce(s, defId);
  if (reason) return reason;
  const g = s.government;
  const ministryId = responsibleMinistry(def);
  const minister = s.characters[g.cabinet.find((p) => p.ministryId === ministryId)?.ministerId ?? ''];
  const p: ActivePolicy = { id: newId(s, 'pol'), defId, phase: 'anunciada', phaseWeek: s.week, progress: 0, ministryId, quality: clamp(0.4 + ministerCompetence(minister) * 0.5 + rng.normal(0, 0.08), 0.1, 1), funded: def.fiscalCost <= 0, log: [`S${s.week}: Anuncio presidencial`] };
  g.policies.push(p);
  const pres = s.characters[g.presidentId];
  // costo político: partidos ideológicamente distantes reaccionan
  for (const party of Object.values(s.parties)) {
    if (!party.active || !pres?.partyId) continue;
    const ben = ideologicalBenefit(party.ideology, { position: def.position, intensity: 0.8, moderation: 0, area: def.area } as Bill);
    if (ben < -0.3) addRelation(s, party.id, pres.partyId, -def.politicalCost / 20);
  }
  s.opinion.presidentialApproval = clamp(s.opinion.presidentialApproval + (s.opinion.priorities[def.area] ?? 0) * 6 - def.politicalCost / 40, 5, 90);
  addNews(s, rng, 'gobierno', `Gobierno anuncia: ${def.name}`, def.objective, 3);
  addHistory(s, 'gobierno', `Anuncio: ${def.name}`, def.objective, 2);
  return `Anunciaste "${def.name}". Comienza la etapa de formulación.`;
}

function closePolicy(s: GameState, rng: Rng, p: ActivePolicy, ok: boolean, note: string): void {
  p.phase = ok ? 'completada' : 'fracasada'; p.phaseWeek = s.week; p.log.push(`S${s.week}: ${note}`);
  const def = POLICY_BY_ID[p.defId];
  if (ok) {
    const scale = 0.5 + 0.5 * clamp(p.outcome ?? 0.5, 0, 1);
    applyPolicyEffects(s, def, scale);
    addHistory(s, 'reforma', `Política implementada: ${def.name}`, note, 3);
    addNews(s, rng, 'gobierno', `Balance positivo: ${def.name}`, note, 3, 0, 1);
  } else {
    s.opinion.presidentialApproval = clamp(s.opinion.presidentialApproval - 2.5, 5, 90);
    addHistory(s, 'gobierno', `Fracasa la implementación de ${def.name}`, note, 3);
    addNews(s, rng, 'gobierno', `Tropiezo del gobierno: ${def.name} no logra sus metas`, note, 3, 0, -1);
  }
}

export function applyPolicyEffects(s: GameState, def: PolicyDef, scale: number): void {
  const e = s.economy; const ef = def.effects; const o = s.opinion;
  if (ef.growth) e.potentialGrowth = clamp(e.potentialGrowth + ef.growth * scale, 0, 5);
  if (ef.shortGrowth) addShock(s, `política: ${def.name}`, ef.shortGrowth * scale * 4, 0, 52);
  if (ef.inflation) addShock(s, `política: ${def.name}`, 0, ef.inflation * scale, 52);
  if (ef.unemployment) e.unemployment = clamp(e.unemployment + ef.unemployment * scale, 2, 25);
  if (ef.poverty) e.poverty = clamp(e.poverty + ef.poverty * scale, 0.5, 40);
  if (ef.inequality) e.gini = clamp(e.gini + ef.inequality * scale, 25, 65);
  if (ef.security) o.securityPerception = clamp(o.securityPerception + ef.security * scale, 0, 100);
  if (ef.approval) o.presidentialApproval = clamp(o.presidentialApproval + ef.approval * scale, 5, 90);
  if (ef.investmentConfidence) e.businessConfidence = clamp(e.businessConfidence + ef.investmentConfidence * scale, 0, 100);
  if (ef.regional) for (const r of Object.values(s.regions)) { r.investment += ef.regional * scale; r.infrastructure = clamp(r.infrastructure + ef.regional * scale * 0.3, 0, 100); }
  if (ef.satisfaction) for (const [a, v] of Object.entries(ef.satisfaction)) o.areaSatisfaction[a as keyof typeof o.areaSatisfaction] = clamp((o.areaSatisfaction[a as keyof typeof o.areaSatisfaction] ?? 0) + (v ?? 0) * scale, -100, 100);
  if (def.id === 'reforma_politica') s.rules.deputyThresholdPct = 5;
}

/** Notificación desde el Congreso cuando se resuelve el proyecto de una política. */
export function onPolicyBillClosed(s: GameState, rng: Rng, b: Bill, outcome: 'publicada' | 'rechazada'): void {
  const p = s.government.policies.find((x) => x.billId === b.id);
  if (!p) return;
  if (outcome === 'publicada') {
    p.phase = 'aprobada'; p.phaseWeek = s.week; p.quality = clamp(p.quality * (1 - b.moderation * 0.4), 0.1, 1); p.log.push(`S${s.week}: Ley publicada${b.moderation > 0.2 ? ' (con modificaciones relevantes)' : ''}`);
    addHistory(s, 'reforma', `Se aprueba ${POLICY_BY_ID[p.defId].name}`, `Moderación del texto original: ${(b.moderation * 100).toFixed(0)}%.`, 4);
  } else {
    p.phase = 'fracasada'; p.phaseWeek = s.week; p.log.push(`S${s.week}: Rechazada en el Congreso`);
    s.opinion.presidentialApproval = clamp(s.opinion.presidentialApproval - 2, 5, 90);
    addHistory(s, 'congreso', `El Congreso rechaza ${POLICY_BY_ID[p.defId].name}`, 'Derrota legislativa del gobierno.', 4);
  }
  void rng;
}

function fiscalRoom(s: GameState): number {
  const e = s.economy;
  const structural = e.revenue - ECON.copperRevenueElasticity * (e.copper - ECON.copperRef) - e.spending;
  return structural - ECON.structuralBalanceTarget + 1.0; // tolerancia
}

function weeklyPolicies(s: GameState, rng: Rng): void {
  const g = s.government;
  for (const p of g.policies) {
    const def = POLICY_BY_ID[p.defId];
    const minister = s.characters[g.cabinet.find((x) => x.ministryId === p.ministryId)?.ministerId ?? ''];
    const comp = ministerCompetence(minister);
    const waited = s.week - p.phaseWeek;
    switch (p.phase) {
      case 'anunciada':
        p.phase = 'formulacion'; p.phaseWeek = s.week; p.log.push(`S${s.week}: Equipo técnico inicia el diseño`);
        break;
      case 'formulacion':
        if (waited >= Math.round(4 + 8 * (1 - comp))) {
          if (def.requiresLaw) {
            const chamber = def.area === 'impuestos' || def.area === 'pensiones' ? 'camara' : rng.chance(0.6) ? 'camara' : 'senado';
            const pres = s.characters[g.presidentId];
            const b = createBill(s, { title: `Mensaje: ${def.name}`, area: def.area, origin: 'mensaje', authorId: g.presidentId, authorPartyId: pres?.partyId ?? null, policyId: def.id, chamberOfOrigin: chamber, urgency: 'suma', quorum: def.quorum, position: def.position, intensity: 0.85, popularity: Math.round(((s.opinion.priorities[def.area] ?? 0) * 200) - def.politicalCost / 2), fiscalCost: def.fiscalCost });
            p.billId = b.id; p.phase = 'tramitacion'; p.phaseWeek = s.week; p.log.push(`S${s.week}: Ingresa al Congreso como mensaje (${b.id})`);
          } else { p.phase = 'aprobada'; p.phaseWeek = s.week; p.log.push(`S${s.week}: Aprobada por decreto/programa administrativo`); }
        }
        break;
      case 'tramitacion': {
        const b = s.bills.find((x) => x.id === p.billId);
        if (!b) { p.phase = 'abandonada'; p.phaseWeek = s.week; }
        else if (b.stage === 'archivada' || b.stage === 'retirada') { p.phase = 'abandonada'; p.phaseWeek = s.week; p.log.push(`S${s.week}: Proyecto ${b.stage}`); }
        break;
      }
      case 'aprobada':
        p.phase = p.funded ? 'implementacion' : 'financiamiento'; p.phaseWeek = s.week;
        break;
      case 'financiamiento':
        if (fiscalRoom(s) > def.fiscalCost || waited > 40 || s.characters[g.presidentId]?.isPlayer === false && waited > 12) {
          p.funded = true; p.phase = 'implementacion'; p.phaseWeek = s.week; p.log.push(`S${s.week}: Recursos asignados (${def.fiscalCost.toFixed(2)}% del PIB)`);
          if (fiscalRoom(s) < def.fiscalCost) s.economy.fiscalImpulse += 0.1;
        }
        break;
      case 'implementacion': {
        const capacity = Math.max(0.2, g.stateCapacity / 60) * Math.sqrt(Math.max(0.2, g.coordination / 60));
        const need = def.capacityRequired / 50;
        p.progress = clamp(p.progress + (100 / def.implWeeks) * (0.5 + comp) * capacity / Math.max(0.6, need) * g.budget.execution, 0, 100);
        // Contraloría: observaciones si la capacidad es insuficiente
        if (rng.chance(0.004 * need / capacity)) { g.contraloriaFlags += 1; p.progress = Math.max(0, p.progress - 8); p.log.push(`S${s.week}: Contraloría formula reparos; se retrasa la implementación`); addNews(s, rng, 'gobierno', `Contraloría objeta aspectos de ${def.name}`, 'El órgano de control pide ajustes administrativos.', 2, 0, -1); }
        if (p.progress >= 100) { p.phase = 'evaluacion'; p.phaseWeek = s.week; }
        break;
      }
      case 'evaluacion':
        if (waited >= 4) {
          p.outcome = clamp(p.quality * 0.7 + comp * 0.5 - 0.45 + rng.normal(0, 0.18) - (def.capacityRequired - g.stateCapacity) / 200, -1, 1);
          closePolicy(s, rng, p, p.outcome > -0.15, p.outcome > 0.3 ? 'Evaluación destaca resultados superiores a lo esperado' : p.outcome > -0.15 ? 'Evaluación con resultados parciales' : 'Evaluación concluye que no se lograron las metas');
        }
        break;
      default: break;
    }
  }
  if (g.policies.length > 60) g.policies = g.policies.filter((p) => !['completada', 'fracasada', 'abandonada'].includes(p.phase) || s.week - p.phaseWeek < 260);
}

// ---------------------------------------------------------------------------
// Presupuesto (Ley de Presupuestos: ingreso a fines de septiembre; si no se despacha en 60 días, rige el proyecto del Ejecutivo — art. 67 CPR)
// ---------------------------------------------------------------------------
function budgetCycle(s: GameState, rng: Rng): void {
  const g = s.government; const e = s.economy;
  const d = weekToDate(s.startDate, s.week);
  const month = d.getUTCMonth() + 1; const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  if (month === 9 && day >= 24 && !g.nextBudget) {
    const structuralRevenue = e.revenue - ECON.copperRevenueElasticity * (e.copper - ECON.copperRef);
    const pending = g.policies.filter((p) => !p.funded && ['aprobada', 'financiamiento', 'tramitacion'].includes(p.phase)).reduce((a, p) => a + Math.max(0, POLICY_BY_ID[p.defId].fiscalCost), 0);
    // Regla fiscal: gasto compatible con la meta de balance estructural (más una holgura de transición)
    const targetSpending = structuralRevenue - ECON.structuralBalanceTarget + 0.6;
    const spending = clamp(0.6 * g.budget.spending + 0.4 * targetSpending + pending * 0.5, 18, 35);
    g.nextBudget = { year: year + 1, revenue: g.budget.revenue, spending, byArea: { ...g.budget.byArea }, investment: g.budget.investment, approved: false, status: 'proyecto', execution: 0.92 };
    const pres = s.characters[g.presidentId];
    createBill(s, { title: `Ley de Presupuestos del Sector Público ${year + 1}`, area: 'economia', origin: 'mensaje', authorId: g.presidentId, authorPartyId: pres?.partyId ?? null, chamberOfOrigin: 'camara', urgency: 'discusion_inmediata', quorum: 'simple', position: { eco: spending > g.budget.spending ? -20 : 20, val: 0, seg: 0, inst: 0, amb: 0, soc: spending > g.budget.spending ? -15 : 15, ord: 10, lab: 0 }, intensity: 0.5, popularity: 0, fiscalCost: spending - g.budget.spending, budgetYear: year + 1 });
    addNews(s, rng, 'economia', `Hacienda ingresa el Presupuesto ${year + 1}`, `Gasto total proyectado: ${spending.toFixed(1)}% del PIB.`, 3);
  }
  // 1 de diciembre: plazo constitucional
  if (month === 12 && day <= 7 && g.nextBudget && g.nextBudget.status === 'proyecto') {
    const b = s.bills.find((x) => x.budgetYear === g.nextBudget!.year);
    if (b && b.closedWeek === undefined) { b.stage = 'publicada'; b.closedWeek = s.week; b.log.push(`S${s.week}: Vence el plazo de 60 días; rige el proyecto del Ejecutivo (art. 67 CPR)`); }
    g.nextBudget.status = 'en_discusion';
    g.nextBudget.approved = b?.votes.some((v) => v.passed && v.stage === 'sala_revisora') ?? false;
  }
  if (month === 1 && day <= 7 && g.nextBudget) {
    g.budget = { ...g.nextBudget, status: 'vigente', execution: g.nextBudget.approved ? 0.94 : 0.88 };
    g.nextBudget = null;
    addHistory(s, 'economia', `Entra en vigencia el Presupuesto ${g.budget.year}`, `${g.budget.approved ? 'Aprobado por el Congreso' : 'Rige el proyecto del Ejecutivo'}; gasto ${g.budget.spending.toFixed(1)}% del PIB.`, 2);
  }
}

// ---------------------------------------------------------------------------
// IA presidencial (cuando el Presidente no es el jugador)
// ---------------------------------------------------------------------------
export function policyScore(s: GameState, president: Character, def: PolicyDef): number {
  const party = president.partyId ? s.parties[president.partyId] : null;
  const align = -ideoDistance(president.ideology, def.position, Object.fromEntries(Object.entries(def.position).map(([k, v]) => [k, Math.abs(v) > 5 ? 1 : 0.05]))) * 4;
  const salience = (s.opinion.priorities[def.area] ?? 0) * 10;
  const prio = party?.priorities.includes(def.area) ? 1 : 0;
  const cost = def.politicalCost / 50 * (1 - s.opinion.presidentialApproval / 100) + def.fiscalCost * (s.economy.debt > 45 ? 2 : 0.7) * (s.economy.fiscalBalance < -3 ? 2 : 1);
  return align + salience + prio - cost;
}

function aiPresident(s: GameState, rng: Rng): void {
  const g = s.government;
  const pres = s.characters[g.presidentId];
  if (!pres || pres.isPlayer) return;
  const skill = 0.5 + 0.5 * (pres.attrs.gestion / 100);
  // nuevas políticas
  const open = g.policies.filter((p) => !['completada', 'fracasada', 'abandonada'].includes(p.phase)).length;
  if (open < 4 && s.week - g.startWeek > 2 && s.week < g.endWeek - 20 && rng.chance(0.12)) {
    const options = POLICIES.filter((d) => !canAnnounce(s, d.id)).map((d) => ({ d, sc: policyScore(s, pres, d) + rng.normal(0, 1.2 - skill) }));
    options.sort((a, b) => b.sc - a.sc);
    if (options[0] && options[0].sc > -1.5) announcePolicy(s, rng, options[0].d.id);
  }
  // cambios de gabinete: escándalos o desempeño
  for (const post of g.cabinet) {
    const m = post.ministerId ? s.characters[post.ministerId] : null;
    if (!m) { const c = ministerCandidates(s, post.ministryId, 3)[0]; if (c) appointMinister(s, rng, post.ministryId, c.id); continue; }
    if (m.scandal > 55 || (post.performance < 25 && s.opinion.presidentialApproval < 35 && rng.chance(0.05))) {
      addNews(s, rng, 'gobierno', `Renuncia ${fullName(m)} a ${MINISTRY_BY_ID[post.ministryId].name}`, m.scandal > 55 ? 'Tras semanas de cuestionamientos.' : 'En medio de críticas por su gestión.', 3, 0, -1);
      addHistory(s, 'gobierno', `Renuncia ministerial: ${fullName(m)}`, MINISTRY_BY_ID[post.ministryId].name, 2);
      const c = ministerCandidates(s, post.ministryId, 3).find((x) => x.id !== m.id);
      removeOffice(s, m, 'ministro', 'renuncia');
      post.ministerId = null;
      if (c) appointMinister(s, rng, post.ministryId, c.id);
    }
  }
}

/** Decisión de promulgación o veto (IA o jugador). */
export function presidentDecision(s: GameState, b: Bill): 'promulgar' | 'vetar' | 'pendiente' {
  const pres = s.characters[s.government.presidentId];
  if (!pres) return 'promulgar';
  if (b.origin === 'mensaje') return 'promulgar';
  if (pres.isPlayer) {
    if (b.execDecision) return b.execDecision;
    return s.week - b.stageWeek >= 4 ? 'promulgar' : 'pendiente'; // 30 días: se entiende aprobado
  }
  return ideologicalBenefit(pres.ideology, b) < -0.4 ? 'vetar' : 'promulgar';
}

// ---------------------------------------------------------------------------
// Semana de gobierno
// ---------------------------------------------------------------------------
export function weeklyGovernment(s: GameState, rng: Rng): void {
  const g = s.government;
  // Desempeño ministerial
  for (const post of g.cabinet) {
    const m = post.ministerId ? s.characters[post.ministerId] : null;
    const comp = ministerCompetence(m ?? undefined);
    post.performance = clamp(0.95 * post.performance + 0.05 * (comp * 90) + rng.normal(0, 1.2), 0, 100);
    if (m && !m.realId && rng.chance(0.002 * (1 + (60 - m.attrs.integridad) / 40))) {
      m.scandal = clamp(m.scandal + rng.range(20, 50), 0, 100);
      addNews(s, rng, 'gobierno', `Cuestionamientos a ${fullName(m)} (${MINISTRY_BY_ID[post.ministryId].name})`, 'Se revelan antecedentes que complican al gobierno.', 3, 0, -1);
    }
  }
  const avgPerf = g.cabinet.reduce((a, p) => a + p.performance, 0) / Math.max(1, g.cabinet.length);
  g.stateCapacity = clamp(0.995 * g.stateCapacity + 0.005 * (40 + avgPerf * 0.4), 10, 95);
  g.coordination = clamp(0.97 * g.coordination + 0.03 * (avgPerf * 0.8 + (s.characters[g.presidentId]?.attrs.liderazgo ?? 50) * 0.2), 10, 95);
  // Cuoteo: satisfacción de partidos de la coalición
  if (s.week % 4 === 0 && g.coalitionId) {
    const bal = cabinetBalance(s);
    const presParty = s.characters[g.presidentId]?.partyId;
    for (const [p, diff] of Object.entries(bal)) {
      if (p === presParty || !presParty) continue;
      addRelation(s, p, presParty, clamp(diff * 0.08, -1.5, 1));
      const coal = s.coalitions[g.coalitionId];
      if (coal && diff < -8) coal.cohesion = clamp(coal.cohesion - 0.4, 0, 100);
    }
  }
  weeklyPolicies(s, rng);
  budgetCycle(s, rng);
  aiPresident(s, rng);
  // Promesas del gobierno (concesiones) vencidas
  for (const pr of g.promises) {
    if (pr.fulfilled === undefined && pr.dueWeek !== undefined && s.week > pr.dueWeek) {
      pr.fulfilled = false;
      if (pr.partyId) {
        const pres = s.characters[g.presidentId];
        if (pres?.partyId) addRelation(s, pr.partyId, pres.partyId, -15);
        const leader = s.parties[pr.partyId]?.leaderId ? s.characters[s.parties[pr.partyId].leaderId!] : null;
        if (leader && pres) remember(leader, { week: s.week, aboutId: pres.id, kind: 'promesa_incumplida', weight: -25, note: pr.description });
        addNews(s, rng, 'gobierno', `${s.parties[pr.partyId]?.short} acusa incumplimiento del gobierno`, pr.description, 3, 0, -1);
      }
    }
  }
}

export function isInaugurationWeek(s: GameState): boolean {
  const d = weekToDate(s.startDate, s.week);
  const m = d.getUTCMonth() + 1; const day = d.getUTCDate();
  return m === 3 && day >= 5 && day <= 11;
}

export function governmentLabel(s: GameState): string {
  const g = s.government;
  const pres = s.characters[g.presidentId];
  return `${fullName(pres)} (${pres?.partyId ? s.parties[pres.partyId]?.short : 'IND'}) — ${yearOf(s.startDate, g.startWeek)}-${yearOf(s.startDate, g.endWeek)}`;
}

export function governmentSupportSeats(s: GameState, chamber: 'camara' | 'senado'): { gov: number; total: number } {
  const allowed = new Set(coalitionMembers(s));
  const m = members(s, chamber);
  return { gov: m.filter((c) => c.partyId && allowed.has(c.partyId)).length, total: m.length };
}

export { monthOf, listIdOf };
export type { MinisterPost };
