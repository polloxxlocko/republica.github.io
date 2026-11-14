/**
 * BALANCE RETROSPECTIVO DE ELECCIONES (18.8, 18.16) Y PRESIÓN POR ÉXITO PREMATURO (18.9).
 *
 * Tras cada elección en que compite el jugador se construye un balance con información que el
 * personaje sí puede conocer: votación y margen, territorios fuertes y débiles (resultados
 * públicos), evolución de su imagen, decisiones propias del período, acontecimientos que
 * condicionaron la campaña y comportamiento de aliados. Las consecuencias de una derrota dependen
 * del contexto: no es lo mismo perder por poco tras superar las expectativas que perder por paliza.
 */
import type { ElectionResult, ElectionReview, GameState, OfficeType } from '../models/types';
import { Rng } from '../engine/rng';
import { clamp } from '../rules/params';
import { COMUNA_BY_CUT } from '../territory/data';
import { ELECTION_LABELS } from '../systems/elections';
import { fullName, remember } from '../systems/characters';
import { newId } from '../systems/util';
import { addTerritory, bio, first, me, minorRoleBlocked, officeRank, progress, unitComunas } from './capital';
import { qualitative } from './knowledge';
import type { OpportunityDef } from './opportunities';

const OFFICE_OF: Partial<Record<string, OfficeType>> = { diputados: 'diputado', senadores: 'senador', alcaldes: 'alcalde', concejales: 'concejal', gobernadores: 'gobernador', gobernadores_2v: 'gobernador', presidencial: 'presidente', presidencial_2v: 'presidente', primarias: 'presidente' };

/** Apoyo esperado (antes de votar) del sector del jugador en su territorio: base de comparación. */
function expectedPct(s: GameState, r: ElectionResult): number | null {
  const c = me(s); const k = s.player.candidacies.find((x) => x.electionId === r.electionId) ?? s.career.processes.find((p) => p.electionId === r.electionId && p.aspirants.some((a) => a.charId === c.id && a.status === 'nominado'));
  const office = OFFICE_OF[r.type]; if (!office) return null;
  const unitId = (k as { unitId?: string } | undefined)?.unitId ?? (office === 'diputado' ? String(COMUNA_BY_CUT[Object.keys(s.career.capital.territory).map(Number)[0]]?.district ?? 1) : office === 'senador' || office === 'gobernador' ? c.regionId : String(Object.keys(s.career.capital.territory)[0]));
  const cuts = office === 'presidente' ? [] : unitComunas(office, unitId);
  const partyId = c.partyId;
  if (!partyId || !cuts.length) return null;
  let a = 0; let w = 0;
  for (const cut of cuts) { const e = COMUNA_BY_CUT[cut]?.electors ?? 0; a += (s.comunas[cut]?.lastShares[partyId] ?? 0) * e; w += e; }
  const share = w ? (a / w) * 100 : 0;
  if (office === 'diputado' || office === 'senador' || office === 'concejal') {
    const unit = r.units.find((u) => u.candidateVotes[c.id] !== undefined);
    const mates = unit ? Object.keys(unit.candidateVotes).filter((id) => r.candidates?.find((x) => x.id === id)?.partyId === partyId || id === c.id).length : 2;
    return share / Math.max(1, mates);
  }
  return share;
}

export function reviewElection(s: GameState, rng: Rng, r: ElectionResult): ElectionReview {
  const c = me(s); const o = r.playerOutcome!;
  const pct = o.pct; const margin = o.marginPct;
  const exp = expectedPct(s, r);
  const expectation: ElectionReview['expectation'] = pct === undefined || exp === null ? 'en_linea' : pct > exp * 1.15 + 1 ? 'por_sobre' : pct < exp * 0.85 - 1 ? 'por_debajo' : 'en_linea';
  const closeness: ElectionReview['closeness'] = margin === undefined ? 'clara' : Math.abs(margin) < 3 ? 'estrecha' : Math.abs(margin) < 10 ? 'clara' : 'amplia';
  // Territorios: resultados públicos por comuna (candidatura propia o lista)
  const key = r.comunas && Object.values(r.comunas).some((x) => x.v[c.id] !== undefined) ? c.id : c.partyId ?? '';
  const shares = Object.entries(r.comunas ?? {}).map(([cut, x]) => ({ cut: Number(cut), sh: (x.v[key] ?? 0) / Math.max(1, Object.values(x.v).reduce((a, b) => a + b, 0)) })).filter((x) => x.sh > 0);
  shares.sort((a, b) => b.sh - a.sh);
  const name = (cut: number) => COMUNA_BY_CUT[cut]?.name ?? String(cut);
  const strong = shares.slice(0, 3).map((x) => `${name(x.cut)} (${(x.sh * 100).toFixed(0)}%)`);
  const weak = shares.length > 3 ? shares.slice(-3).reverse().map((x) => `${name(x.cut)} (${(x.sh * 100).toFixed(0)}%)`) : [];
  const h = s.career.repHistory; const before = h.find((x) => x.week >= s.week - 30) ?? h[0];
  const popWord = (v: number) => `imagen ${qualitative(v)}`;
  const decisions = s.career.bio.filter((b) => b.week >= s.week - 30 && b.tone !== 0 && b.kind !== 'eleccion').slice(-6).map((b) => `${b.tone > 0 ? '+' : '−'} ${b.title}`);
  const events = s.history.filter((x) => x.week >= s.week - 26 && x.importance >= 4 && (x.category === 'crisis' || x.category === 'gobierno' || x.category === 'economia')).slice(-4).map((x) => x.title);
  const proc = s.career.processes.find((p) => p.electionId === r.electionId && p.aspirants.some((a) => a.charId === c.id));
  const backers = proc?.aspirants.find((a) => a.charId === c.id)?.backers ?? [];
  const allies = backers.filter((id) => s.characters[id]).map((id) => ({ name: fullName(s.characters[id]), behavior: 'Te respaldó en la nominación' }));
  for (const cm of s.career.commitments.filter((x) => x.createdWeek >= s.week - 60)) if (s.characters[cm.toCharId] && !allies.some((a) => a.name === fullName(s.characters[cm.toCharId]))) allies.push({ name: fullName(s.characters[cm.toCharId]), behavior: cm.status === 'incumplido' ? 'Rompiste un compromiso con esta persona' : 'Tienes un compromiso vigente con esta persona' });

  // Consecuencias según el contexto (no automáticas: dependen de expectativa y margen)
  const effects: string[] = [];
  c.attrs.experiencia = clamp(c.attrs.experiencia + 2 + (o.won ? 1 : 0), 0, 95); effects.push('Ganas experiencia de campaña');
  if (proc) addTerritory(s, unitComunas(proc.office, proc.unitId).slice(0, 30), 2);
  const party = c.partyId ? s.parties[c.partyId] : null; const leader = party?.leaderId ? s.characters[party.leaderId] : null;
  if (!o.won) {
    if (closeness === 'estrecha' || expectation === 'por_sobre') {
      c.rep.reconocimientoRegional[c.regionId] = clamp((c.rep.reconocimientoRegional[c.regionId] ?? 0) + 6, 0, 100);
      c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + (expectation === 'por_sobre' ? 5 : 2), 0, 100);
      effects.push('Tu campaña es valorada pese a la derrota');
      if (leader && leader.id !== c.id) remember(leader, { week: s.week, aboutId: c.id, kind: 'colaboracion', weight: 5, note: 'Buena campaña pese a la derrota' });
      s.career.opportunities.push({ id: newId(s, 'op'), kind: 'tras_derrota', week: s.week, expiresWeek: s.week + 4, title: 'Después de una derrota estrecha', description: 'Tu desempeño fue mejor de lo que muchos esperaban. Se abren conversaciones sobre tu futuro.', actors: leader ? [leader.id] : [],
        requirements: [], benefits: ['Capitalizar la votación obtenida'], risks: ['Elegir un camino cierra otros'],
        options: [{ id: 'partido', label: 'Asumir un rol en la directiva', hint: 'Influencia interna, menos territorio' }, { id: 'territorio', label: 'Quedarte trabajando el territorio', hint: 'Preparar la próxima elección' }, { id: 'pausa', label: 'Tomar distancia un tiempo', hint: 'Recuperar recursos y vida personal' }], ctx: { party: c.partyId ?? '' } });
    } else if (closeness === 'amplia' && expectation === 'por_debajo') {
      c.rep.confianzaPartido = clamp(c.rep.confianzaPartido - 5, 0, 100);
      s.career.capital.rejection = clamp(s.career.capital.rejection + 3, 0, 100);
      effects.push('El mal resultado erosiona tu posición en el partido');
      if (leader && leader.id !== c.id) remember(leader, { week: s.week, aboutId: c.id, kind: 'conflicto', weight: -4, note: 'Mal resultado electoral' });
    } else effects.push('Una derrota sin sorpresas: tu posición se mantiene');
  } else if (closeness === 'estrecha') effects.push('Ganas por muy poco: tu posición queda bajo observación');
  const review: ElectionReview = {
    week: s.week, electionId: r.electionId, office: ELECTION_LABELS[r.type], won: o.won, pct, marginPct: margin, expectation, closeness, strong, weak,
    popularity: { before: before ? popWord(before.pop) : '—', after: popWord(c.rep.popularidad) }, decisions, events, allies, effects,
  };
  s.career.reviews.push(review);
  if (s.career.reviews.length > 40) s.career.reviews.shift();
  first(s, o.won ? 'victoria' : 'derrota', `${ELECTION_LABELS[r.type]}${pct !== undefined ? ` (${pct.toFixed(1)}%)` : ''}`);
  void rng;
  return review;
}

// ---------------------------------------------------------------------------
// Oportunidades posteriores a una derrota y presión por éxito temprano
// ---------------------------------------------------------------------------
export const REVIEW_DEFS: OpportunityDef[] = [
  {
    kind: 'tras_derrota', cooldown: 0, generate: () => null,
    resolve: (s, _rng, _o, ch) => {
      const c = me(s);
      if (ch === 'partido' && c.partyId && !minorRoleBlocked(c, 'dirigente_territorial')) { if (!c.offices.some((x) => x.type === 'dirigente_territorial')) c.offices.push({ type: 'dirigente_territorial', regionId: c.regionId, since: s.week, label: 'Directiva regional' }); c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + 4, 0, 100); progress(s); return 'Asumes un rol en la directiva regional.'; }
      if (ch === 'territorio') { addTerritory(s, Object.keys(s.career.capital.territory).map(Number).slice(0, 1), 5); s.career.capital.organization = clamp(s.career.capital.organization + 5, 0, 100); return 'Sigues trabajando el territorio con el equipo de campaña.'; }
      s.player.personalFunds += 8; c.rep.popularidad = clamp(c.rep.popularidad + 1, 0, 100); return 'Tomas distancia; recuperas energía y recursos.';
    },
    onExpire: 'territorio',
  },
  {
    kind: 'exigencias_aliados', cooldown: 20,
    generate: (s, rng) => {
      const c = me(s); if (s.career.pressure < 18 || Math.max(0, ...c.offices.map((o) => officeRank(o.type))) < 3) return null;
      const allies = Object.entries(c.relations).filter(([id, v]) => v > 15 && s.characters[id]?.status === 'activo').map(([id]) => id);
      if (!allies.length) return null;
      const a = s.characters[rng.pick(allies)];
      return { p: s.career.pressure / 1400, build: () => ({ title: `${fullName(a)} espera algo a cambio de su apoyo`, description: 'Quienes te acompañaron en tu ascenso esperan espacios, recursos o gestos. No todos pueden quedar conformes.', actors: [a.id],
        requirements: [], benefits: ['Conservar aliados'], risks: ['Conceder te expone a críticas', 'Negarte crea resentimiento'],
        options: [{ id: 'conceder', label: 'Conceder', hint: 'Lealtad, a costa de credibilidad' }, { id: 'negociar', label: 'Ofrecer algo menor', hint: 'Satisfacción parcial' }, { id: 'negarse', label: 'Negarte', hint: 'Independencia, pero un aliado molesto' }], ctx: { ally: a.id } }) };
    },
    resolve: (s, _rng, o, ch) => {
      const c = me(s); const a = s.characters[String(o.ctx.ally)]; if (!a) return '';
      if (ch === 'conceder') { remember(a, { week: s.week, aboutId: c.id, kind: 'acuerdo_cumplido', weight: 8, note: 'Cumplió con sus aliados' }); c.rep.credibilidad = clamp(c.rep.credibilidad - 2, 0, 100); s.career.pressure = Math.max(0, s.career.pressure - 6); return 'Concedes: tus aliados quedan conformes; la prensa habla de "pago de favores".'; }
      if (ch === 'negociar') { remember(a, { week: s.week, aboutId: c.id, kind: 'colaboracion', weight: 2, note: 'Ofreció poco' }); return 'Ofreces algo menor; la relación se enfría un poco.'; }
      remember(a, { week: s.week, aboutId: c.id, kind: 'conflicto', weight: -10, note: 'Se negó tras haber sido apoyado/a' }); c.rep.credibilidad = clamp(c.rep.credibilidad + 1, 0, 100);
      bio(s, 'relacion', `Rompes expectativas de ${fullName(a)}`, '', -1);
      return 'Te niegas: ganas autonomía, pero un aliado se resiente.';
    },
    onExpire: 'negociar',
  },
  {
    kind: 'escrutinio_mediatico', cooldown: 26,
    generate: (s) => {
      const c = me(s); if (s.career.pressure < 15 || Math.max(0, ...c.offices.map((o) => officeRank(o.type))) < 3) return null;
      return { p: s.career.pressure / 1800 + c.rep.reconocimiento / 6000, build: () => ({ title: 'Un medio investiga tu trayectoria', description: 'Tu ascenso despierta curiosidad: un equipo periodístico (ficticio) revisa tus declaraciones, tu patrimonio y tus vínculos.', actors: [],
        requirements: [], benefits: ['Responder bien puede reforzar tu credibilidad'], risks: ['Cualquier inconsistencia se amplifica'],
        options: [{ id: 'transparencia', label: 'Abrir toda la información', hint: 'Depende de tu integridad' }, { id: 'ignorar', label: 'No responder', hint: 'Puede pasar… o no' }, { id: 'contraatacar', label: 'Cuestionar al medio', hint: 'Moviliza a los tuyos, irrita a otros' }], ctx: {} }) };
    },
    resolve: (s, rng, _o, ch) => {
      const c = me(s);
      if (ch === 'transparencia') { if (rng.chance(0.25 + c.attrs.integridad / 140)) { c.rep.credibilidad = clamp(c.rep.credibilidad + 4, 0, 100); s.career.pressure = Math.max(0, s.career.pressure - 8); return 'La revisión no encuentra nada relevante y tu transparencia es destacada.'; } c.scandal = clamp(c.scandal + 10, 0, 100); c.rep.credibilidad = clamp(c.rep.credibilidad - 4, 0, 100); return 'Aparecen inconsistencias menores que te obligan a dar explicaciones.'; }
      if (ch === 'ignorar') { if (rng.chance(0.5)) return 'El tema no prende.'; c.rep.credibilidad = clamp(c.rep.credibilidad - 3, 0, 100); return 'Tu silencio se interpreta como evasión.'; }
      const ok = rng.chance(0.3 + c.attrs.comunicacion / 200); s.career.capital.rejection = clamp(s.career.capital.rejection + 3, 0, 100);
      if (ok) { c.rep.popularidad = clamp(c.rep.popularidad + 2, 0, 100); return 'Tu respuesta conecta con tu base, aunque polariza.'; }
      c.rep.credibilidad = clamp(c.rep.credibilidad - 3, 0, 100); return 'El enfrentamiento con la prensa te pasa la cuenta.';
    },
    onExpire: 'ignorar',
  },
  {
    kind: 'decision_dificil', cooldown: 24,
    generate: (s) => {
      const c = me(s); const exec = c.offices.find((o) => ['alcalde', 'gobernador', 'ministro', 'seremi', 'subsecretario'].includes(o.type));
      if (!exec || s.career.pressure < 10) return null;
      return { p: 0.01 + s.career.pressure / 2200, build: () => ({ title: 'Una decisión de gestión sin salida fácil', description: 'Un problema administrativo heredado exige decidir entre una solución técnica impopular y una salida rápida que posterga el problema.', actors: [],
        requirements: [], benefits: ['Demostrar capacidad de gestión'], risks: ['Un error de gestión es noticia'],
        options: [{ id: 'tecnica', label: 'Solución técnica', hint: 'Prestigio, costo de popularidad' }, { id: 'rapida', label: 'Salida rápida', hint: 'Alivio hoy, riesgo mañana' }, { id: 'equipo', label: 'Apoyarte en tu equipo', hint: 'Depende de tu organización y tu experiencia' }], ctx: {} }) };
    },
    resolve: (s, rng, _o, ch) => {
      const c = me(s);
      if (ch === 'tecnica') { c.rep.prestigioTecnico = clamp(c.rep.prestigioTecnico + 3, 0, 100); c.rep.popularidad = clamp(c.rep.popularidad - 2, 0, 100); return 'Decides con criterio técnico: los especialistas lo valoran, los vecinos no tanto.'; }
      if (ch === 'rapida') { c.rep.popularidad = clamp(c.rep.popularidad + 1, 0, 100); if (rng.chance(0.4)) { s.career.pressure += 6; c.rep.prestigioTecnico = clamp(c.rep.prestigioTecnico - 3, 0, 100); return 'La solución rápida se cae a las pocas semanas y el problema vuelve, más grande.'; } return 'La salida rápida funciona, por ahora.'; }
      const ok = rng.chance(clamp(0.2 + s.career.capital.organization / 120 + c.attrs.gestion / 200 + c.attrs.experiencia / 250, 0.1, 0.9));
      if (ok) { c.rep.prestigioTecnico = clamp(c.rep.prestigioTecnico + 2, 0, 100); s.career.pressure = Math.max(0, s.career.pressure - 5); return 'Tu equipo encuentra una buena solución: se nota que sabes delegar.'; }
      c.rep.credibilidad = clamp(c.rep.credibilidad - 2, 0, 100); return 'Tu equipo no da el ancho: la falta de experiencia se nota.';
    },
    onExpire: 'rapida',
  },
];
