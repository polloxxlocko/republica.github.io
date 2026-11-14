/** Contabilidad semanal de la carrera: cargos, elecciones, reputación, arraigo, estancamiento. */
import type { GameState, NominationProcess } from '../models/types';
import { Rng } from '../engine/rng';
import { clamp } from '../rules/params';
import { officeLabel, removeOffice } from '../systems/characters';
import { ELECTION_LABELS } from '../systems/elections';
import { fillVacancies, setPlayerVoteHook, setVacancyHook } from '../systems/parliament';
import { MINOR_ROLES, PUBLIC_OFFICES, bio, capitalOf, homeCut, me, minorRoleBlocked, officeRank, progress } from './capital';
import { weeklyNominations } from './nominations';
import { processOpportunities } from './opportunities';
import { playerVoteConsequence } from './offices';
import { EXTRA_DEFS } from './agenda';
import { designateReplacement, weeklyLatent } from './latent';
import { trackContacts, verifyIntel, weeklyIntel } from './knowledge';
import { reviewElection } from './review';
import { generateAgenda, weeklyTeamAndDigital } from './agendaWeek';
import { weeklyLeg } from './legislature';
import { first } from './capital';
import { newId } from '../systems/util';

setPlayerVoteHook((s, b, v) => playerVoteConsequence(s, b, v));
setVacancyHook((s, rng, seat, partyId) => designateReplacement(s, rng, seat, partyId));

function onPlayerLost(s: GameState, p: NominationProcess, reason: string): void {
  if (reason !== 'cupo_cedido') { s.player.lastActionResults.push(`No obtienes la nominación en ${p.unitLabel}.`); return; }
  s.career.opportunities.push({
    id: newId(s, 'op'), kind: 'cupo_cedido', week: s.week, expiresWeek: s.week + 3, title: `Tu territorio (${p.unitLabel}) fue cedido a un socio del pacto`,
    description: 'La negociación de la coalición dejó a tu partido sin candidatura en tu territorio. Debes decidir cómo reaccionar.', actors: s.parties[p.partyId]?.leaderId ? [s.parties[p.partyId].leaderId!] : [],
    requirements: [], benefits: ['Disciplina: la directiva lo recordará', 'Protesta: respaldo de bases locales'], risks: ['Protestar tensiona tu relación con la directiva'],
    options: [{ id: 'disciplina', label: 'Acatar y apoyar al candidato del pacto', hint: 'Confianza partidaria +' }, { id: 'protesta', label: 'Protestar públicamente', hint: 'Arraigo local +, confianza partidaria −' }, { id: 'compensacion', label: 'Pedir compensación a la directiva', hint: 'Puede generar un compromiso a tu favor' }],
    ctx: { party: p.partyId, unit: p.unitId, office: p.office },
  });
}

export function weeklyCareer(s: GameState, rng: Rng): void {
  const c = me(s);
  if (!c) return;
  const before0 = new Set(s.career.processes.filter((p) => p.status === 'resuelto' || p.status === 'cancelado').map((p) => p.id));
  weeklyNominations(s, rng, (p, r) => onPlayerLost(s, p, r));
  // Verificación de informes sobre procesos que se resolvieron esta semana
  for (const p of s.career.processes) {
    if (before0.has(p.id) || (p.status !== 'resuelto' && p.status !== 'cancelado')) continue;
    const mine = p.aspirants.find((a) => a.charId === c.id);
    if (mine) verifyIntel(s, `${p.id}:me`, p.status === 'resuelto' && mine.status === 'nominado');
    verifyIntel(s, `${p.id}:cede`, p.status === 'cancelado');
  }
  weeklyLatent(s, rng);
  weeklyIntel(s, rng);
  if (s.week % 4 === 0) trackContacts(s);
  processOpportunities(s, rng, EXTRA_DEFS);
  weeklyTeamAndDigital(s);
  weeklyLeg(s, rng);
  generateAgenda(s, rng);
  // Cargos: detectar inicios y términos
  const now = c.offices.map((o) => o.type);
  const before = s.career.lastOffices ?? [];
  for (const t of now) if (!before.includes(t) && t !== 'militante') {
    bio(s, 'cargo', `Asumes como ${officeLabel(t, c.gender)}`, '', 1); progress(s);
    if (officeRank(t) > officeRank(s.career.stats.peakOffice)) s.career.stats.peakOffice = t;
    if (['dirigente_territorial', 'presidente_partido'].includes(t)) first(s, 'cargo_interno', officeLabel(t, c.gender));
    if (['concejal', 'alcalde', 'gobernador', 'diputado', 'senador', 'ministro', 'subsecretario', 'seremi', 'presidente'].includes(t)) first(s, 'cargo_publico', officeLabel(t, c.gender));
    // Éxito prematuro: un cargo grande con poca experiencia genera expectativas y presión (no depende de la edad)
    s.career.pressure = clamp(s.career.pressure + Math.max(0, officeRank(t) * 9 - c.attrs.experiencia * 0.5 - s.career.capital.organization * 0.15), 0, 100);
  }
  // Incompatibilidades (art. 59 CPR y LOC Municipalidades): al asumir un cargo nuevo se cesa en el anterior incompatible
  const INCOMPAT = ['diputado', 'senador', 'alcalde', 'concejal', 'gobernador', 'ministro', 'subsecretario', 'seremi'];
  const fresh = now.filter((t) => !before.includes(t) && INCOMPAT.includes(t));
  if (fresh.length) {
    for (const o of [...c.offices]) {
      if (!INCOMPAT.includes(o.type) || fresh.includes(o.type)) continue;
      const seat = s.seats.find((x) => x.holderId === c.id);
      if (seat && (o.type === 'diputado' || o.type === 'senador')) seat.holderId = null;
      removeOffice(s, c, o.type, `Cesa al asumir como ${officeLabel(fresh[0] as never, c.gender)}`);
      bio(s, 'fin_cargo', `Cesas como ${officeLabel(o.type, c.gender)} por incompatibilidad`, `Asumes como ${officeLabel(fresh[0] as never, c.gender)}.`, 0);
    }
    fillVacancies(s, rng);
  }
  for (const o of [...c.offices]) {
    if (!MINOR_ROLES.includes(o.type)) continue;
    const why = minorRoleBlocked(c, o.type);
    if (!why) continue;
    const top = c.offices.find((x) => PUBLIC_OFFICES.includes(x.type))!;
    removeOffice(s, c, o.type, `deja el rol al asumir como ${officeLabel(top.type, c.gender)}`);
    bio(s, 'fin_cargo', `Dejas tu rol de ${officeLabel(o.type, c.gender)}`, `${o.label ? `${o.label}. ` : ''}Incompatible con tu cargo de ${officeLabel(top.type, c.gender)}.`, 0);
  }
  const nowAfter = c.offices.map((o) => o.type);
  for (const t of before) if (!nowAfter.includes(t as never) && !s.career.bio.some((b) => b.week === s.week && b.kind === 'fin_cargo' && b.title.includes(officeLabel(t as never, c.gender)))) bio(s, 'fin_cargo', `Dejas el cargo de ${officeLabel(t as never, c.gender)}`, '', 0);
  s.career.lastOffices = c.offices.map((o) => o.type);
  // Resultados electorales del jugador
  for (const r of s.results.filter((x) => x.week === s.week && x.playerOutcome?.ran)) {
    const won = !!r.playerOutcome!.won;
    if (r.type === 'presidencial' && r.runoffNeeded && (r.winnerId === c.id || r.runnerUpId === c.id)) { bio(s, 'eleccion', 'Pasas a segunda vuelta presidencial', `${r.playerOutcome!.pct?.toFixed(1)}%`, 1); continue; }
    if (won) s.career.stats.won += 1; else s.career.stats.lost += 1;
    const rv = reviewElection(s, rng, r);
    bio(s, 'eleccion', `${won ? 'Ganas' : 'Pierdes'}: ${ELECTION_LABELS[r.type]}`, [r.playerOutcome!.pct !== undefined ? `${r.playerOutcome!.pct.toFixed(1)}% de los votos` : '', rv.closeness === 'estrecha' ? 'resultado estrecho' : rv.closeness === 'amplia' ? 'resultado amplio' : '', rv.expectation === 'por_sobre' ? 'por sobre lo esperado' : rv.expectation === 'por_debajo' ? 'por debajo de lo esperado' : ''].filter(Boolean).join(' · '), won ? 1 : -1);
    if (won) progress(s);
  }
  // Leyes publicadas de su autoría
  for (const b of s.bills) if (b.authorId === c.id && b.stage === 'publicada' && b.closedWeek === s.week) { s.career.stats.laws += 0; bio(s, 'ley', `Se publica tu ley: ${b.title}`, '', 1); progress(s); }
  // Arraigo: decae lentamente fuera de la comuna de residencia; el rechazo vuelve a su base
  if (s.week % 4 === 0) {
    const home = homeCut(s);
    for (const [cut, v] of Object.entries(s.career.capital.territory)) s.career.capital.territory[cut] = Number(cut) === home ? v * 0.995 : v * 0.985;
    s.career.capital.organization = clamp(s.career.capital.organization * 0.97, 0, 100);
    // El reconocimiento sin cargo ni exposición se erosiona hacia un piso según la trayectoria
    const floor = Math.max(...c.offices.map((o) => officeRank(o.type)), 0) * 7;
    if (c.rep.reconocimiento > floor) c.rep.reconocimiento = Math.max(floor, c.rep.reconocimiento - 0.012 * (c.rep.reconocimiento - floor) * 4);
    // La confianza de la directiva se enfría si no se renueva (vuelve lentamente a 50)
    c.rep.confianzaPartido = clamp(c.rep.confianzaPartido - 0.04 * (c.rep.confianzaPartido - 50), 0, 100);
    s.career.capital.rejection = clamp(s.career.capital.rejection + 0.03 * (10 - s.career.capital.rejection), 0, 100);
  }
  // Presión: se disipa con el tiempo y la experiencia; ejercer un cargo da experiencia
  const rank = Math.max(0, ...c.offices.map((o) => officeRank(o.type)));
  s.career.pressure = Math.max(0, s.career.pressure * 0.985 - 0.05 - c.attrs.experiencia / 4000);
  if (rank >= 2) c.attrs.experiencia = clamp(c.attrs.experiencia + 0.012 * rank, 0, 95);
  if (s.week % 13 === 0) {
    const cap = capitalOf(s);
    s.career.repHistory.push({ week: s.week, pop: cap.popularity, rec: cap.recognition, infl: Math.round(s.player.influence), party: Math.round(c.rep.confianzaPartido), cred: cap.credibility, terr: cap.territorial });
    if (s.career.repHistory.length > 400) s.career.repHistory.splice(0, s.career.repHistory.length - 400);
  }
  if (s.player.careerOver && !s.career.bio.some((b) => b.kind === 'retiro')) bio(s, 'retiro', 'Fin de la carrera política', '', 0);
}
