/**
 * TRAMAS POLÍTICAS EMERGENTES. Una trama es un proceso de varias etapas (no un evento): tiene conflicto,
 * protagonistas con objetivos, intensidad que sube o baja, etapas que pueden saltarse y una resolución
 * que deja consecuencias y puede abrir otra trama. Las etapas emiten acontecimientos (arcOnly) solo si
 * el estado de la simulación lo justifica; la trama también avanza sin el jugador.
 */
import type { Arc, ArcDef, Ctx, EventDef, W } from './types';
import { clamp } from '../rules/params';
import { ideoDistance } from '../systems/util';
import { P, me, party, name, firstN, ch, infl, disp, rel, mem, rep, feed, news, life, heat, stage, side, newPid, relOf, chance, skill, cohesion, region, commit } from './ops';
import { def, o, leaderOf } from './library/common';

const emit = (w: W, a: Arc, defId: string, extra: Ctx = {}, inWeeks = 0) => P(w).followups.push({ week: w.s.week + inWeeks, defId, ctx: { ...a.ctx, ...extra, arcId: a.id } });
const emitted = (a: Arc, key: string) => a.history.some((h) => h.text.startsWith(`[${key}]`));
const mark = (w: W, a: Arc, key: string, text: string) => a.history.push({ week: w.s.week, text: `[${key}] ${text}` });

export function startArc(w: W, defId: string, ctx: Ctx, spawnedFrom?: string): Arc | null {
  const d = ARC_BY_ID[defId]; if (!d) return null;
  const ex = P(w).arcs.find((a) => a.defId === defId && a.status !== 'resuelta');
  if (ex) { if (ctx.side) side(ex, String(ctx.side)); Object.assign(ex.ctx, ctx); return ex; }
  const base = d.start(w);
  const arc: Arc = {
    id: newPid(w.s, 'arc'), defId, title: base?.title ?? d.title, conflict: base?.conflict ?? d.title, participants: base?.participants ?? [], partyId: base?.partyId ?? me(w).partyId ?? undefined, regionId: base?.regionId ?? me(w).regionId,
    startWeek: w.s.week, lastWeek: w.s.week, stage: d.stages[0].id, heat: base?.heat ?? 35, status: 'activa', goals: base?.goals ?? {}, playerSide: ctx.side ? String(ctx.side) : undefined, ctx: { ...(base?.ctx ?? {}), ...ctx }, history: [{ week: w.s.week, text: base?.conflict ?? d.title }], spawnedFrom,
  };
  P(w).arcs.push(arc);
  P(w).cooldowns[`arc|${defId}`] = w.s.week + d.cooldown;
  return arc;
}

/** Revisión semanal: inicio autónomo, evolución, emisión de etapas y resolución. */
export function weeklyArcs(w: W): void {
  for (const d of ARCS) {
    if ((P(w).cooldowns[`arc|${d.id}`] ?? -1) > w.s.week) continue;
    if (P(w).arcs.some((a) => a.defId === d.id && a.status !== 'resuelta')) continue;
    if (d.p > 0 && chance(w, d.p) && d.start(w)) startArc(w, d.id, {});
  }
  for (const a of P(w).arcs) {
    if (a.status === 'resuelta') continue;
    const d = ARC_BY_ID[a.defId];
    // una trama sin movimiento pierde importancia y puede quedar suspendida
    if (w.s.week - a.lastWeek > 16 && a.status !== 'suspendida') { a.status = 'suspendida'; a.history.push({ week: w.s.week, text: 'La disputa queda en pausa: nadie la empuja.' }); }
    const t = d.tick(w, a);
    if (t) { feed(w, a.participants[0] ?? me(w).id, 'conflicto', t, a.id); if (a.status === 'suspendida') a.status = 'activa'; }
    const r = d.resolve(w, a);
    if (r) { a.status = 'resuelta'; a.resolution = r; a.history.push({ week: w.s.week, text: r }); d.onResolve(w, a); feed(w, a.participants[0] ?? me(w).id, 'conflicto', `${a.title}: ${r}`, a.id); }
  }
  const resolved = P(w).arcs.filter((a) => a.status === 'resuelta');
  if (resolved.length > 30) P(w).arcs = P(w).arcs.filter((a) => a.status !== 'resuelta' || resolved.slice(-30).includes(a));
}

// ───────────────────────────── definiciones ─────────────────────────────
export const ARCS: ArcDef[] = [
  {
    id: 'interna_partido', title: 'La elección interna del partido', p: 0, cooldown: 60,
    start: (w) => { const p = party(w); const l = leaderOf(w); const ch2 = p?.factions.find((f) => f.leaderId !== p.leaderId && w.s.characters[f.leaderId]?.status === 'activo'); if (!p || !l || !ch2) return null;
      return { title: `Interna de ${p.short}`, conflict: `${name(w, l.id)} busca seguir al frente de ${p.short}; ${name(w, ch2.leaderId)} lo desafía.`, participants: [l.id, ch2.leaderId], partyId: p.id, goals: { [l.id]: 'Mantener la conducción', [ch2.leaderId]: 'Ganar la directiva' }, ctx: { lead: l.id, chal: ch2.leaderId, week: p.nextLeadershipWeek } }; },
    stages: [{ id: 'campana', label: 'Campaña interna', events: ['arc_interna_presion'] }, { id: 'votacion', label: 'Votación', events: [] }, { id: 'reacomodo', label: 'Reacomodo', events: ['b_reorganizacion_directiva'] }],
    tick: (w, a) => {
      const p = party(w); if (!p) return null;
      if (a.stage === 'campana' && !emitted(a, 'presion') && a.playerSide && a.playerSide !== 'neutral' && p.nextLeadershipWeek - w.s.week < 8) { mark(w, a, 'presion', 'El sector contrario te busca'); emit(w, a, 'arc_interna_presion'); }
      if (a.stage === 'campana' && w.s.week >= p.nextLeadershipWeek - 1) { stage(w, a, 'votacion', 'Se vota la interna.'); return `Se vota la interna de ${p.short}.`; }
      if (chance(w, 0.15)) { heat(w, a, 6); return `${name(w, String(a.ctx.chal))} recorre regiones buscando consejeros.`; }
      return null;
    },
    resolve: (w, a) => { const p = party(w); if (!p || w.s.week < Number(a.ctx.week)) return null; const winner = p.leaderId; a.ctx.winner = winner ?? ''; return winner === a.ctx.lead ? `${name(w, String(a.ctx.lead))} retiene la conducción.` : winner === me(w).id ? 'Ganas la presidencia del partido.' : `${name(w, winner ?? '')} gana la interna.`; },
    onResolve: (w, a) => {
      const win = String(a.ctx.winner); const sideOf = a.playerSide;
      if (sideOf && sideOf !== 'neutral') {
        if (sideOf === win) { rel(w, win, { trust: 8, cooperation: 6 }); rep(w, 'confianzaPartido', 3); life(w, 'partido', 'Tu sector gana la interna', '', 1); }
        else if (win) { rel(w, win, { rivalry: 6, trust: -4 }); rep(w, 'confianzaPartido', -2); life(w, 'partido', 'Tu sector pierde la interna', 'La conducción ganadora reorganizará espacios.', -1); startArc(w, 'reorganizacion_interna', { winner: win, loserSide: sideOf }, a.id); }
      }
    },
  },
  {
    id: 'reorganizacion_interna', title: 'La conducción ganadora reorganiza', p: 0, cooldown: 30,
    start: () => ({ title: 'Reacomodo tras la interna', conflict: 'La conducción ganadora redistribuye responsabilidades; el sector derrotado decide si coopera.', participants: [], heat: 40 }),
    stages: [{ id: 'oferta', label: 'Oferta o exclusión', events: ['arc_reorg_oferta'] }, { id: 'cuestionamiento', label: 'Cuestionamiento de aliados', events: ['b_aliado_cuestiona'] }],
    tick: (w, a) => {
      if (a.stage === 'oferta' && !emitted(a, 'oferta')) { mark(w, a, 'oferta', 'La nueva conducción define espacios'); emit(w, a, 'arc_reorg_oferta', { winner: a.ctx.winner }); return null; }
      if (a.stage === 'cooperacion' && !emitted(a, 'cuestiona') && chance(w, 0.4)) { mark(w, a, 'cuestiona', 'Un antiguo aliado cuestiona'); emit(w, a, 'b_aliado_cuestiona', { pres: a.ctx.winner }); }
      return null;
    },
    resolve: (w, a) => (w.s.week - a.startWeek > 14 ? (a.stage === 'cooperacion' ? 'Te integras a la nueva conducción.' : 'Quedas en la minoría interna.') : null),
    onResolve: () => {},
  },
  {
    id: 'competencia_candidatura', title: 'La pelea por un cupo', p: 0, cooldown: 30,
    start: () => ({ title: 'Competencia por una candidatura', conflict: 'Dos figuras del partido quieren el mismo cupo.', participants: [], heat: 45 }),
    stages: [{ id: 'apoyos', label: 'Búsqueda de apoyos', events: ['arc_cupo_presion'] }, { id: 'definicion', label: 'Definición', events: [] }],
    tick: (w, a) => {
      const p = w.s.career.processes.find((x) => x.id === a.ctx.proc); if (!p) return null;
      if (!a.participants.length) a.participants = [String(a.ctx.a), String(a.ctx.b)];
      if (!emitted(a, 'presion') && a.playerSide && a.playerSide !== 'neutral' && chance(w, 0.25)) { mark(w, a, 'presion', 'El otro sector presiona'); emit(w, a, 'arc_cupo_presion', { other: a.playerSide === a.ctx.a ? a.ctx.b : a.ctx.a }); }
      if (p.status === 'preseleccion' && a.stage === 'apoyos') { stage(w, a, 'definicion', 'La directiva entra a definir.'); heat(w, a, 15); return `La directiva define la candidatura en ${p.unitLabel}.`; }
      return null;
    },
    resolve: (w, a) => { const p = w.s.career.processes.find((x) => x.id === a.ctx.proc); if (!p) return 'El proceso se canceló.'; if (p.status !== 'resuelto' && p.status !== 'cancelado') return null; const nom = p.aspirants.find((x) => x.status === 'nominado'); a.ctx.winner = nom?.charId ?? ''; return nom ? `${name(w, nom.charId)} gana el cupo.` : 'El cupo se cede al pacto.'; },
    onResolve: (w, a) => {
      const win = String(a.ctx.winner); if (!a.playerSide || a.playerSide === 'neutral') return;
      if (a.playerSide === win) { rel(w, win, { trust: 6, cooperation: 6 }); mem(w, win, 'apoyo_recibido', 'Le apoyó en la pelea por el cupo', 'compromiso'); }
      else { const loser = a.playerSide; rel(w, loser, { trust: 3 }, 'menor'); if (win) rel(w, win, { rivalry: 4 }, 'menor'); if (chance(w, 0.5)) startArc(w, 'crisis_faccion', { leader: loser }, a.id); }
    },
  },
  {
    id: 'crisis_faccion', title: 'Crisis de confianza en un sector', p: 0.02, cooldown: 80,
    start: (w) => { const p = party(w); const f = p?.factions.filter((x) => x.discontent > 55 && w.s.characters[x.leaderId]?.status === 'activo').sort((a, b) => b.discontent - a.discontent)[0]; if (!p || !f) return null;
      return { title: `Malestar en «${f.name}»`, conflict: `«${f.name}» acusa a la directiva de marginarlo.`, participants: [f.leaderId], partyId: p.id, heat: f.discontent * 0.8, goals: { [f.leaderId]: 'Recuperar espacios o irse' }, ctx: { fac: f.id, leader: f.leaderId } }; },
    stages: [{ id: 'malestar', label: 'Malestar', events: [] }, { id: 'reclamo', label: 'Reclamo público', events: ['arc_faccion_reclamo'] }, { id: 'desenlace', label: 'Acuerdo o ruptura', events: [] }],
    tick: (w, a) => {
      const p = party(w); const f = p?.factions.find((x) => x.id === a.ctx.fac); if (!f) return null;
      a.heat = clamp(a.heat * 0.8 + f.discontent * 0.2 + (p!.cohesion < 45 ? 3 : -2), 0, 100); a.lastWeek = w.s.week;
      if (a.heat > 60 && a.stage === 'malestar') { stage(w, a, 'reclamo', 'El sector hace público su reclamo.'); emit(w, a, 'arc_faccion_reclamo', { leader: f.leaderId, fname: f.name }); return `«${f.name}» hace público su malestar.`; }
      if (a.heat > 85 && a.stage === 'reclamo') { stage(w, a, 'desenlace', 'El sector amenaza con irse.'); return `«${f.name}» amenaza con dejar el partido.`; }
      return null;
    },
    resolve: (w, a) => { const p = party(w); const f = p?.factions.find((x) => x.id === a.ctx.fac); if (!f) return 'El sector se disolvió.'; if (a.heat < 25) return 'El malestar se apaga: hay un acuerdo de espacios.'; if (a.stage === 'desenlace' && a.heat > 92) { const l = ch(w, f.leaderId); if (l && !l.realId) { l.partyId = null; l.factionId = null; p!.factions = p!.factions.filter((x) => x.id !== f.id); cohesion(w, -6); } return `«${f.name}» rompe con el partido.`; } return null; },
    onResolve: (w, a) => { if (a.resolution?.includes('rompe')) { news(w, 'partidos', `Quiebre en ${party(w)?.short}`, a.resolution, 3); startArc(w, 'reorganizacion_derrota', { side: 'neutral' }, a.id); } },
  },
  {
    id: 'negociacion_alianza', title: 'Negociación de una alianza', p: 0, cooldown: 80,
    start: (w) => ({ title: 'Negociación de un pacto electoral', conflict: 'Dos partidos negocian un pacto; las bases desconfían.', participants: [], heat: 40, partyId: party(w)?.id }),
    stages: [{ id: 'sondeo', label: 'Sondeos', events: [] }, { id: 'mesa', label: 'Mesa de negociación', events: ['arc_alianza_mesa'] }, { id: 'cierre', label: 'Acuerdo o quiebre', events: [] }],
    tick: (w, a) => {
      const p = party(w); if (!p) return null; const k = [String(a.ctx.other), p.id].sort().join('|'); const r = w.s.partyRelations[k] ?? 0;
      if (a.stage === 'sondeo' && w.s.week - a.startWeek > 3) { stage(w, a, 'mesa', 'Se instala una mesa formal.'); if (a.playerSide) emit(w, a, 'arc_alianza_mesa', { other: a.ctx.other }); return `${p.short} y ${w.s.parties[String(a.ctx.other)]?.short} instalan una mesa de negociación.`; }
      w.s.partyRelations[k] = clamp(r + w.rng.normal(a.playerSide === 'contra' ? -0.5 : 0.3, 1.5), -100, 100);
      return null;
    },
    resolve: (w, a) => { const p = party(w); if (!p) return 'Se disuelve.'; const r = w.s.partyRelations[[String(a.ctx.other), p.id].sort().join('|')] ?? 0; if (w.s.week - a.startWeek < 10) return null; return r > 30 ? 'Se firma el pacto.' : r < 5 ? 'La negociación fracasa.' : w.s.week - a.startWeek > 24 ? 'La negociación queda sin acuerdo.' : null; },
    onResolve: (w, a) => { const ok = a.resolution === 'Se firma el pacto.'; if (a.playerSide === 'favor') rep(w, 'confianzaPartido', ok ? 2 : -1); if (a.playerSide === 'contra') rep(w, 'confianzaPartido', ok ? -2 : 1); if (a.playerSide === 'condicion' && ok) rep(w, 'confianzaPartido', 2); },
  },
  {
    id: 'conflicto_alcalde', title: 'Un alcalde contra su partido', p: 0.02, cooldown: 120,
    start: (w) => { const p = party(w); if (!p) return null; const m = Object.values(w.s.characters).find((c) => c.status === 'activo' && !c.realId && !c.isPlayer && c.partyId === p.id && c.regionId === me(w).regionId && c.offices.some((x) => x.type === 'alcalde') && (p.leaderId ? (c.relations[p.leaderId] ?? 0) < -5 : true)); if (!m) return null;
      return { title: `${name(w, m.id)} contra la directiva`, conflict: `El/la alcalde/sa ${name(w, m.id)} critica a la directiva de ${p.short} por abandonar a los municipios.`, participants: [m.id], heat: 40, goals: { [m.id]: 'Más autonomía y recursos' }, ctx: { mayor: m.id } }; },
    stages: [{ id: 'diferencias', label: 'Diferencias', events: ['arc_alcalde_pide'] }, { id: 'ultimatum', label: 'Ultimátum', events: [] }],
    tick: (w, a) => { if (!emitted(a, 'pide') && chance(w, 0.3)) { mark(w, a, 'pide', 'Busca apoyos'); emit(w, a, 'arc_alcalde_pide', { mayor: a.ctx.mayor }); } heat(w, a, w.rng.normal(1, 4)); if (a.heat > 70 && a.stage === 'diferencias') { stage(w, a, 'ultimatum', 'Exige cambios o se va.'); return `${name(w, String(a.ctx.mayor))} da un ultimátum a la directiva.`; } return null; },
    resolve: (w, a) => (a.heat < 15 ? 'Se acuerda una agenda municipal con la directiva.' : a.heat > 95 ? `${name(w, String(a.ctx.mayor))} renuncia al partido.` : w.s.week - a.startWeek > 30 ? 'El conflicto se apaga sin resolverse.' : null),
    onResolve: (w, a) => { if (a.resolution?.includes('renuncia')) { const m = ch(w, a.ctx.mayor); if (m) { m.partyId = null; m.factionId = null; } cohesion(w, -3); if (a.playerSide === 'alcalde') rep(w, 'confianzaPartido', -2); } },
  },
  {
    id: 'division_bancada', title: 'La bancada dividida', p: 0, cooldown: 50,
    start: () => ({ title: 'Bancada dividida', conflict: 'Un proyecto divide a los parlamentarios del partido.', participants: [], heat: 50 }),
    stages: [{ id: 'discrepancia', label: 'Discrepancia', events: [] }, { id: 'votacion', label: 'Votación', events: [] }],
    tick: (w, a) => { const b = w.s.bills.find((x) => x.id === a.ctx.bill); if (!b) return null; if ((b.stage === 'sala_origen' || b.stage === 'sala_revisora') && a.stage === 'discrepancia') { stage(w, a, 'votacion', 'El proyecto llega a sala.'); return `«${b.title.replace(/^Mensaje: /, '')}» llega a sala con la bancada dividida.`; } return null; },
    resolve: (w, a) => { const b = w.s.bills.find((x) => x.id === a.ctx.bill); if (!b) return 'El proyecto se retiró.'; return b.closedWeek !== undefined ? (b.stage === 'publicada' ? 'El proyecto se aprueba.' : 'El proyecto se rechaza o archiva.') : null; },
    onResolve: (w, a) => { const passed = a.resolution === 'El proyecto se aprueba.'; if (a.playerSide === 'favor' || a.playerSide === 'contra') { const right = (a.playerSide === 'favor') === passed; rep(w, 'credibilidad', right ? 1 : 0); } if (a.playerSide === 'unidad') cohesion(w, 1); },
  },
  {
    id: 'liderazgo_emergente', title: 'Un liderazgo emergente', p: 0.015, cooldown: 120,
    start: (w) => { const y = Object.values(w.s.characters).find((c) => c.status === 'activo' && !c.realId && !c.isPlayer && c.partyId === me(w).partyId && c.regionId === me(w).regionId && w.s.week / 52 + 2026 - c.birthYear < 38 && c.rep.reconocimiento > me(w).rep.reconocimiento - 5); if (!y) return null;
      return { title: `El ascenso de ${name(w, y.id)}`, conflict: `${name(w, y.id)} crece rápido en la región y disputa los mismos espacios que tú.`, participants: [y.id], heat: 30, goals: { [y.id]: 'Ser la nueva cara del partido en la región' }, ctx: { npc: y.id } }; },
    stages: [{ id: 'aparicion', label: 'Aparición', events: [] }, { id: 'disputa', label: 'Disputa de espacios', events: ['arc_emergente_choque'] }],
    tick: (w, a) => { const y = ch(w, a.ctx.npc); if (!y || y.status !== 'activo') return null; y.rep.reconocimiento = clamp(y.rep.reconocimiento + 0.3, 0, 100); y.rep.confianzaPartido = clamp(y.rep.confianzaPartido + 0.2, 0, 100); a.lastWeek = w.s.week;
      if (a.stage === 'aparicion' && y.rep.reconocimiento > me(w).rep.reconocimiento + 3 && w.s.week - a.startWeek > 6) { stage(w, a, 'disputa', 'Ya compiten por los mismos espacios.'); if (a.playerSide !== 'aliado') emit(w, a, 'arc_emergente_choque', { npc: y.id }); return `${name(w, y.id)} aparece en la prensa regional como «la nueva generación».`; }
      return chance(w, 0.08) ? `${name(w, y.id)} suma apoyos entre militantes jóvenes.` : null; },
    resolve: (w, a) => (w.s.week - a.startWeek > 52 ? (relOf(w, String(a.ctx.npc)).rivalry > 30 ? 'La rivalidad se consolida.' : relOf(w, String(a.ctx.npc)).cooperation > 15 ? 'Se consolida una alianza generacional.' : 'Ambos encuentran su espacio.') : null),
    onResolve: () => {},
  },
  {
    id: 'debate_reforma', title: 'Debate interno sobre una reforma', p: 0, cooldown: 60,
    start: (w) => ({ title: 'Debate interno sobre una reforma', conflict: 'Una reforma divide al partido entre reformistas y críticos.', participants: [], heat: 45, partyId: party(w)?.id }),
    stages: [{ id: 'debate', label: 'Debate', events: [] }, { id: 'postura', label: 'Postura oficial', events: [] }],
    tick: (w, a) => { if (a.stage === 'debate' && w.s.week - a.startWeek > 4) { stage(w, a, 'postura', 'El consejo fija una postura oficial.'); const b = w.s.bills.find((x) => x.id === a.ctx.bill); const pp = party(w); const dist = b && pp ? ideoDistance(pp.ideology, b.position) - b.moderation * 0.15 : 0.35; const fav = dist + w.rng.normal(0, 0.06) < 0.34; a.ctx.official = fav ? 'favor' : 'contra'; return `El consejo de ${party(w)?.short} fija postura: ${fav ? 'a favor' : 'en contra'}.`; } return null; },
    resolve: (w, a) => (a.stage === 'postura' && w.s.week - a.lastWeek > 1 ? `Postura oficial: ${a.ctx.official === 'favor' ? 'a favor' : 'en contra'}.` : null),
    onResolve: (w, a) => { if (a.playerSide === 'mediar') { rep(w, 'confianzaPartido', 1); return; } if (a.playerSide) rep(w, 'confianzaPartido', a.playerSide === a.ctx.official ? 2 : -2); },
  },
  {
    id: 'crisis_coalicion', title: 'La coalición en crisis', p: 0.03, cooldown: 100,
    start: (w) => { const co = Object.values(w.s.coalitions).find((c) => c.active && c.members.includes(me(w).partyId ?? '') && c.cohesion < 40); return co ? { title: `Crisis en ${co.name}`, conflict: `La cohesión de ${co.name} cae: los socios se acusan mutuamente.`, participants: [], heat: 60 - co.cohesion / 2, ctx: { co: co.id } } : null; },
    stages: [{ id: 'tension', label: 'Tensión', events: [] }, { id: 'ruptura', label: 'Amenaza de ruptura', events: [] }],
    tick: (w, a) => { const co = w.s.coalitions[String(a.ctx.co)]; if (!co) return null; a.heat = clamp(100 - co.cohesion, 0, 100); a.lastWeek = w.s.week; if (a.heat > 70 && a.stage === 'tension') { stage(w, a, 'ruptura', 'Un socio amenaza con salir.'); return `Un socio de ${co.name} amenaza con salir.`; } return null; },
    resolve: (w, a) => { const co = w.s.coalitions[String(a.ctx.co)]; if (!co || !co.active) return 'La coalición se disuelve.'; return co.cohesion > 55 ? 'La coalición se recompone.' : null; },
    onResolve: () => {},
  },
  {
    id: 'reorganizacion_derrota', title: 'Reorganización tras la derrota', p: 0, cooldown: 100,
    start: (w) => ({ title: `${party(w)?.short ?? 'El partido'} después de la derrota`, conflict: 'Tras perder terreno, se discute quién paga y quién conduce la renovación.', participants: [], heat: 55 }),
    stages: [{ id: 'balance', label: 'Balance', events: [] }, { id: 'renovacion', label: 'Renovación', events: ['arc_renovacion'] }],
    tick: (w, a) => { if (a.stage === 'balance' && w.s.week - a.startWeek > 4) { stage(w, a, 'renovacion', 'Se abre un proceso de renovación.'); if (a.playerSide === 'renovacion') emit(w, a, 'arc_renovacion'); return 'Se abre un proceso de renovación en el partido.'; } return null; },
    resolve: (w, a) => (w.s.week - a.startWeek > 20 ? 'El partido cierra su balance.' : null),
    onResolve: () => {},
  },
];
export const ARC_BY_ID = Object.fromEntries(ARCS.map((a) => [a.id, a])) as Record<string, ArcDef>;

// ───────────────────────────── acontecimientos de etapa (solo surgen desde una trama) ─────────────────────────────
export const ARC_EVENTS: EventDef[] = [
  def({ id: 'arc_interna_presion', cat: 'interna', tier: 'relevante', priority: 8, cooldown: 10, p: 0, arcOnly: true,
    require: () => ({}),
    title: () => 'El otro sector te busca',
    text: (w, c) => { const other = c.side === c.lead ? c.chal : c.lead; return `A semanas de la interna, ${name(w, other)} te ofrece un espacio en su directiva si cambias de bando.`; },
    options: [
      o('mantener', 'Mantener tu palabra', (w, c) => { const mine = String(c.side); rel(w, mine, { trust: 6, reliability: 6 }); rep(w, 'credibilidad', 1); return 'Mantienes tu apoyo: tu sector lo valora.'; }),
      o('cambiar', 'Cambiarte de bando', (w, c) => { const other = String(c.side === c.lead ? c.chal : c.lead); const a = P(w).arcs.find((x) => x.id === c.arcId); side(a, other); w.s.dialogue!.actionLog.push({ week: w.s.week, type: 'apoyo_interna', ref: other }); rel(w, other, { trust: 6 }); rel(w, String(c.side), { trust: -15, rivalry: 15 }); mem(w, String(c.side), 'promesa_incumplida', 'Se cambió de bando antes de la interna', 'decisivo'); return 'Te cambias de bando. Lo que prometiste se verificará: habrá costos.'; }),
    ] }),
  def({ id: 'arc_reorg_oferta', cat: 'interna', tier: 'relevante', priority: 8, cooldown: 10, p: 0, arcOnly: true,
    require: () => ({}),
    title: (w, c) => `${name(w, c.winner)} define los nuevos equipos`,
    text: (w, c) => `Tu sector perdió. ${name(w, c.winner)} arma su equipo y ${disp(w, String(c.winner)) > 0 ? 'deja una puerta abierta para ti' : 'no parece tenerte en cuenta'}.`,
    options: [
      o('cooperar', 'Intentar cooperar con la nueva conducción', (w, c) => { const a = P(w).arcs.find((x) => x.id === c.arcId); const ok = disp(w, String(c.winner)) + skill(w, 'negociacion') * 20 + w.rng.normal(0, 10) > 0; if (ok) { stage(w, a, 'cooperacion', 'Cooperas con la conducción ganadora.'); rel(w, String(c.winner), { cooperation: 6, rivalry: -6 }); return 'Te integras a un equipo de trabajo. Algunos de tu sector no lo entenderán.'; } return 'La nueva conducción no te da espacio.'; }),
      o('oposicion', 'Ordenar la oposición interna', (w, c) => { rel(w, String(c.winner), { rivalry: 6 }); return 'Ordenas a tu sector como oposición interna.'; }),
      o('pausa', 'Tomar distancia por un tiempo', () => 'Te concentras en tu territorio.'),
    ] }),
  def({ id: 'arc_cupo_presion', cat: 'interna', tier: 'relevante', priority: 7, cooldown: 10, p: 0, arcOnly: true,
    require: () => ({}),
    title: (w, c) => `${name(w, c.other)} te pide que reconsideres`,
    text: (w, c) => `${name(w, c.other)} te pide que retires tu apoyo a su rival: «después necesitarás amigos en el distrito».`,
    options: [
      o('firme', 'Mantener tu apoyo', (w, c) => { rel(w, String(c.other), { rivalry: 6 }); return 'Te mantienes. Lo recordará.'; }),
      o('neutral', 'Pasar a una posición neutral', (w, c) => { rel(w, String(c.other), { trust: 4 }); const a = P(w).arcs.find((x) => x.id === c.arcId); const prev = a?.playerSide; side(a, 'neutral'); if (prev) rel(w, prev, { trust: -8 }); return 'Te declaras neutral: nadie queda completamente conforme.'; }),
    ] }),
  def({ id: 'arc_faccion_reclamo', cat: 'interna', tier: 'relevante', priority: 7, cooldown: 10, p: 0, arcOnly: true,
    require: () => ({}),
    title: (_w, c) => `«${c.fname}» pide tu firma`,
    text: (w, c) => `${name(w, c.leader)} reúne firmas para exigir a la directiva un cambio de rumbo. Si firmas, quedas del lado del reclamo.`,
    options: [
      o('firmar', 'Firmar', (w, c) => { rel(w, String(c.leader), { trust: 8 }); rep(w, 'confianzaPartido', -2); const a = P(w).arcs.find((x) => x.id === c.arcId); heat(w, a, 8); side(a, 'reclamo'); return 'Tu firma suma presión.'; }),
      o('puente', 'Ofrecerte como puente con la directiva', (w, c) => { const a = P(w).arcs.find((x) => x.id === c.arcId); const ok = skill(w, 'negociacion') + infl(w) / 200 > 0.5; if (ok) { heat(w, a, -25, 'Una mediación baja la tensión.'); rep(w, 'confianzaPartido', 3); rel(w, String(c.leader), { respect: 4 }); return 'Tu mediación abre una mesa: la tensión baja.'; } return 'Ninguna de las partes acepta tu mediación.'; }),
      o('no', 'No firmar', (w, c) => { rel(w, String(c.leader), { trust: -3 }, 'menor'); return 'No firmas.'; }),
    ] }),
  def({ id: 'arc_alianza_mesa', cat: 'interna', tier: 'relevante', priority: 6, cooldown: 10, p: 0, arcOnly: true,
    require: () => ({}),
    title: (w, c) => `La mesa con ${w.s.parties[String(c.other)]?.short} te consulta`,
    text: () => 'La comisión negociadora consulta a dirigentes territoriales: ¿qué estarías dispuesto/a a ceder en tu zona?',
    options: [
      o('ceder', 'Ceder algo en tu zona por el acuerdo', (w, c) => { const k = [String(c.other), me(w).partyId!].sort().join('|'); w.s.partyRelations[k] = clamp((w.s.partyRelations[k] ?? 0) + 6, -100, 100); rep(w, 'confianzaPartido', 1); return 'Tu flexibilidad acerca el acuerdo.'; }),
      o('nada', 'No ceder nada', (w, c) => { const k = [String(c.other), me(w).partyId!].sort().join('|'); w.s.partyRelations[k] = clamp((w.s.partyRelations[k] ?? 0) - 4, -100, 100); return 'Tu negativa complica la mesa.'; }),
    ] }),
  def({ id: 'arc_alcalde_pide', cat: 'territorial', tier: 'relevante', priority: 6, cooldown: 10, p: 0, arcOnly: true,
    require: () => ({}),
    title: (w, c) => `${name(w, c.mayor)} busca aliados`,
    text: (w, c) => `${name(w, c.mayor)} pide que firmes una carta de dirigentes que respalda su crítica a la directiva.`,
    options: [
      o('firmar', 'Firmar la carta', (w, c) => { rel(w, String(c.mayor), { trust: 8, cooperation: 5 }); rep(w, 'confianzaPartido', -3); const a = P(w).arcs.find((x) => x.id === c.arcId); side(a, 'alcalde'); heat(w, a, 10); return 'Tu firma fortalece al alcalde.'; }),
      o('mediar', 'Proponer una reunión con la directiva', (w, c) => { const a = P(w).arcs.find((x) => x.id === c.arcId); side(a, 'mediador'); heat(w, a, -15, 'Se abre un canal de diálogo.'); rep(w, 'confianzaPartido', 1); return 'Abres un canal de diálogo.'; }),
      o('directiva', 'Respaldar a la directiva', (w, c) => { rel(w, String(c.mayor), { trust: -6, rivalry: 6 }); rep(w, 'confianzaPartido', 2); const a = P(w).arcs.find((x) => x.id === c.arcId); side(a, 'directiva'); return 'Respaldas a la directiva.'; }),
    ] }),
  def({ id: 'arc_emergente_choque', cat: 'trayectoria', tier: 'relevante', priority: 6, cooldown: 10, p: 0, arcOnly: true,
    require: () => ({}),
    title: (w, c) => `${name(w, c.npc)} se instala en tu espacio`,
    text: (w, c) => `${name(w, c.npc)} empieza a ocupar los espacios que tú venías construyendo: invitado/a a las mismas reuniones, citado/a en la misma radio.`,
    options: [
      o('pacto', 'Proponerle repartirse los espacios', (w, c) => { const ok = disp(w, String(c.npc)) + w.rng.normal(0, 10) > 0; if (ok) { commit(w, String(c.npc), 'acuerdo_programatico', `Repartir espacios con ${name(w, String(c.npc))}`, 60); rel(w, String(c.npc), { rivalry: -10, cooperation: 6 }); return 'Acuerdan no pisarse.'; } rel(w, String(c.npc), { rivalry: 6 }); return 'No acepta: quiere todo.'; }),
      o('competir', 'Competir abiertamente', (w, c) => { rel(w, String(c.npc), { rivalry: 10 }); return 'La competencia queda abierta.'; }),
      o('aliar', 'Ofrecerle una alianza', (w, c) => { rel(w, String(c.npc), { cooperation: 8, trust: 4 }); const a = P(w).arcs.find((x) => x.id === c.arcId); side(a, 'aliado'); return 'Se alían: juntos pesan más.'; }),
    ] }),
  def({ id: 'arc_renovacion', cat: 'trayectoria', tier: 'relevante', priority: 7, cooldown: 10, p: 0, arcOnly: true,
    require: () => ({}),
    title: () => 'La renovación busca nombres',
    text: (w) => `El proceso de renovación de ${party(w)?.short} necesita figuras que encabecen comisiones y regionales. Tu nombre circula.`,
    options: [
      o('encabezar', 'Encabezar la renovación en tu región', (w) => { rep(w, 'confianzaPartido', 3); rep(w, 'reconocimiento', 1.5); life(w, 'partido', 'Encabezas la renovación del partido en tu región', '', 1); return 'Asumes la renovación en tu región.'; }),
      o('apoyar', 'Apoyar desde atrás', (w) => { rep(w, 'confianzaPartido', 1); return 'Apoyas sin exponerte.'; }),
    ] }),
];
export { region, firstN };
