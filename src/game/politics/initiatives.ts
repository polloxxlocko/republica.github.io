/**
 * INICIATIVAS POLÍTICAS: proyectos propios de semanas o meses (disputar una directiva comunal, conseguir
 * una candidatura, impulsar una reforma, construir base territorial, armar un movimiento...).
 *
 * No son barras de progreso: cada paso produce hechos concretos (apoyos de personas con nombre,
 * oposiciones, compromisos, obstáculos) y el desenlace se decide con incertidumbre frente a rivales y
 * circunstancias. Repetir el mismo paso rinde menos. Una iniciativa puede fracasar, quedar suspendida
 * o abandonarse, y su resultado deja consecuencias persistentes.
 */
import type { Character } from '../models/types';
import type { Initiative, InitiativeDef, W } from './types';
import { clamp } from '../rules/params';
import { AREA_LABELS } from '../rules/params';
import {
  P, me, party, home, comuna, region, name, ch, has, isLeg, exec, terr, infl, disp, chance, skill, rel, mem, rep, regRep, land, org, funds, commit,
  feed, news, life, newPid, fictional, pickW, localFigure, weeksTo, nextElection, relOf, partyTerr, discontent,
} from './ops';
import { openContest, contestOf, resolveContest } from './rivals';
import { aspire, aspireBlocked, electionWindow, NOMINATED, unitLabel } from '../career/nominations';
import { minorRoleBlocked, progress } from '../career/capital';
import { COMUNA_BY_CUT } from '../territory/data';
import { createBill } from '../systems/parliament';
import { zeroIdeology } from '../systems/util';

const log = (w: W, i: Initiative, text: string, tone: -1 | 0 | 1 = 0) => { i.log.push({ week: w.s.week, text, tone }); if (i.log.length > 40) i.log.shift(); return text; };
const done = (i: Initiative, id: string) => i.stepsDone[id] ?? 0;
/** rendimiento decreciente por repetición del mismo paso */
const dim = (i: Initiative, id: string) => 1 / (1 + done(i, id) * 0.8);
const gain = (i: Initiative, x: number) => { i.strength = clamp(i.strength + x, -40, 80); };
const addSup = (i: Initiative, id: string) => { if (!i.supporters.includes(id)) i.supporters.push(id); i.opponents = i.opponents.filter((x) => x !== id); };
const addOpp = (i: Initiative, id: string) => { if (!i.opponents.includes(id)) i.opponents.push(id); i.supporters = i.supporters.filter((x) => x !== id); };
const obstacle = (i: Initiative, id: string, text: string) => { if (!i.obstacles.some((o) => o.id === id)) i.obstacles.push({ id, text, active: true }); };
const clear = (i: Initiative, id: string) => { const o = i.obstacles.find((x) => x.id === id); if (o) o.active = false; };

/** Persona del entorno partidario que podría respaldar (ficticia o real en roles institucionales neutros). */
function backerPool(w: W, i: Initiative): Character[] {
  const c = me(w);
  return Object.values(w.s.characters).filter((x) => x.status === 'activo' && !x.isPlayer && !x.realId && x.partyId === c.partyId && x.regionId === c.regionId && !i.supporters.includes(x.id) && !i.opponents.includes(x.id) && !i.participants.includes(x.id));
}
/** Intenta sumar un apoyo concreto: depende de la relación, sus objetivos y la credibilidad del jugador. */
function seekSupport(w: W, i: Initiative, stepId: string, label: string): string {
  const cand = pickW(w, backerPool(w, i), (x) => 1 + infl(w, x) + Math.max(0, disp(w, x.id)));
  if (!cand) return log(w, i, 'No encuentras a nadie más con peso que no se haya definido.', 0);
  const comp = cand.ambitionTarget === me(w).ambitionTarget && cand.offices.length === 0;
  const score = disp(w, cand.id) * 0.8 + skill(w, 'negociacion', 'redes') * 40 + (w.s.dialogue?.reputation.cumplimiento ?? 50) * 0.2 - (comp ? 15 : 0) - 20;
  if (score > 8) {
    addSup(i, cand.id); gain(i, (4 + infl(w, cand) / 12) * dim(i, stepId)); rel(w, cand.id, { cooperation: 5, familiarity: 6 }, 'menor');
    if (chance(w, 0.35)) { commit(w, cand.id, 'reunion_seguimiento', `Mantener informado/a a ${name(w, cand.id)} sobre ${i.title.toLowerCase()}`, 10, {}, 'menor'); i.commitments.push(cand.id); }
    return log(w, i, `${name(w, cand.id)} se suma: ${label}.`, 1);
  }
  if (score > -10) { rel(w, cand.id, { familiarity: 5 }, 'menor'); return log(w, i, `${name(w, cand.id)} te escucha pero no se compromete todavía${comp ? ': tiene sus propios planes' : ''}.`); }
  addOpp(i, cand.id); rel(w, cand.id, { trust: -3 }, 'menor');
  return log(w, i, `${name(w, cand.id)} se niega${comp ? ' y empieza a mover su propio nombre' : ''}.`, -1);
}

// ───────────────────────────── definiciones ─────────────────────────────
export const INITIATIVES: InitiativeDef[] = [
  {
    id: 'directiva_comunal', title: 'Disputar la directiva comunal', ambition: ['cargo_partidario', 'presidir_partido'],
    available: (w) => {
      const c = me(w); const p = party(w);
      if (!p) return { ok: false, why: 'Requiere militancia en un partido' };
      if (has(c, 'dirigente_territorial', 'presidente_partido')) return { ok: false, why: 'Ya tienes una responsabilidad directiva' };
      if (w.s.week < 6) return { ok: false, why: 'Aún no conoces lo suficiente la orgánica local' };
      const cut = home(w);
      return { ok: true, build: () => ({ title: `Presidencia comunal de ${p.short} en ${comuna(cut)}`, objective: `Ganar la elección de la directiva comunal de ${p.short} en ${comuna(cut)}`,
        participants: [], deadline: w.s.week + 14, requirements: ['Militancia vigente', 'Respaldo de militantes de la comuna', 'Una lista inscrita'], cut, regionId: c.regionId, ctx: {},
        obstacles: [], risks: ['Perder deja en evidencia tu peso real', 'La directiva vigente puede tomarlo como un desafío'] }) };
    },
    steps: [
      { id: 'respaldo', label: 'Conseguir respaldos', detail: 'Visitar a militantes con peso en la comuna para pedir su firma y su voto.', cost: 1, max: 4, run: (w, i) => seekSupport(w, i, 'respaldo', 'respaldará tu lista') },
      { id: 'lista', label: 'Construir la lista', detail: 'Convencer a una tesorería y una secretaría que completen tu lista.', cost: 1, max: 1,
        when: (_w, i) => i.supporters.length < 1 ? 'Necesitas al menos un respaldo para armar lista' : null,
        run: (w, i) => { const s1 = i.supporters[0]; gain(i, 6); clear(i, 'sin_lista'); i.participants.push(s1); return log(w, i, `Inscribes la lista con ${name(w, s1)}. Ya es oficial: compites.`, 1); } },
      { id: 'negociar', label: 'Negociar con el sector rival', detail: 'Ofrecer un cargo en la directiva a cambio de que no presenten lista.', cost: 1, max: 1,
        when: (w, i) => contestOf(w, String(i.ctx.contest))?.contenders.some((x) => x.id !== me(w).id && (x.strategy === 'compite' || x.strategy === 'negocia' || x.strategy === 'busca_apoyos')) ? null : 'No hay rivales con quienes negociar',
        run: (w, i) => {
          const k = contestOf(w, String(i.ctx.contest))!; const r = k.contenders.find((x) => x.id !== me(w).id && x.strategy !== 'se_retira' && x.strategy !== 'respalda')!;
          const ok = disp(w, r.id) + (r.strategy === 'negocia' ? 25 : 0) + w.rng.normal(0, 12) > 10;
          if (ok) { r.strategy = 'respalda'; r.backs = me(w).id; addSup(i, r.id); commit(w, r.id, 'equipo', `Darle a ${name(w, r.id)} la vicepresidencia comunal si ganas`, 30); rel(w, r.id, { cooperation: 8, rivalry: -8 }); return log(w, i, `${name(w, r.id)} acepta: baja su lista a cambio de la vicepresidencia. Quedaste comprometido/a.`, 1); }
          rel(w, r.id, { rivalry: 6 }, 'menor'); return log(w, i, `${name(w, r.id)} rechaza el acuerdo y lo comenta en la militancia: «quiere repartirse los cargos antes de ganar».`, -1);
        } },
      { id: 'propuesta', label: 'Presentar propuestas a la militancia', detail: 'Un documento con prioridades para la comuna, discutido en una asamblea.', cost: 1, max: 2,
        run: (w, i) => { const q = skill(w, 'tecnico', 'oratoria'); gain(i, (q > 0.55 ? 7 : 2) * dim(i, 'propuesta')); if (q < 0.3) { rep(w, 'credibilidad', -1); return log(w, i, 'La asamblea es tensa: te preguntan por cifras que no manejas.', -1); } return log(w, i, q > 0.55 ? 'Tu propuesta circula entre militantes y se discute en serio.' : 'La propuesta se escucha, sin entusiasmo.', q > 0.55 ? 1 : 0); } },
      { id: 'bases', label: 'Recorrer las bases', detail: 'Reunirse casa por casa con militantes inactivos.', cost: 2, max: 3,
        run: (w, i) => { const g = (3 + terr(w) / 15) * dim(i, 'bases'); gain(i, g); org(w, 0.8); return log(w, i, `Recorres ${comuna(i.cut)} y reactivas militantes que no participaban hace años.`, 1); } },
    ],
    conclude: (w, i) => {
      const k = contestOf(w, String(i.ctx.contest)); const winner = k ? resolveContest(w, k) : me(w).id;
      if (!i.participants.length) return { success: false, text: 'No alcanzaste a inscribir una lista: la elección se hizo sin ti.' };
      if (winner === me(w).id) {
        me(w).offices.push({ type: 'dirigente_territorial', regionId: me(w).regionId, comuna: comuna(i.cut), since: w.s.week, label: `Presidencia comunal de ${party(w)!.short} en ${comuna(i.cut)}` });
        rep(w, 'confianzaPartido', 5); org(w, 3); progress(w.s); life(w, 'cargo', `Presides ${party(w)!.short} en ${comuna(i.cut)}`, `Ganaste la directiva comunal con ${i.supporters.length} respaldos clave.`, 1);
        return { success: true, text: `Ganas la presidencia comunal. ${i.supporters.length ? `Te acompañan ${i.supporters.map((x) => name(w, x)).join(', ')}.` : ''}` };
      }
      rep(w, 'confianzaPartido', -2); life(w, 'partido', `Pierdes la directiva comunal frente a ${name(w, winner)}`, '', -1);
      return { success: false, text: `Gana ${name(w, winner)}. Tu sector queda en minoría, pero mostraste capacidad de organizar.` };
    },
  },
  {
    id: 'responsabilidad', title: 'Asumir una responsabilidad partidaria', ambition: ['cargo_partidario'],
    available: (w) => {
      const c = me(w); const p = party(w);
      if (!p) return { ok: false, why: 'Requiere militancia' };
      if (minorRoleBlocked(c, 'dirigente_territorial')) return { ok: false, why: minorRoleBlocked(c, 'dirigente_territorial')! };
      if (has(c, 'dirigente_territorial')) return { ok: false, why: 'Ya tienes una responsabilidad' };
      const head = localFigure(w); if (!head) return null;
      const area = (['formación', 'organización', 'comunicaciones', 'juventud', 'territorio'] as const)[w.rng.int(0, 4)];
      return { ok: true, build: () => ({ title: `Secretaría de ${area} de ${p.short} ${region(c.regionId)}`, objective: `Que la directiva regional te confíe la secretaría de ${area}`,
        participants: [head.id], deadline: w.s.week + 10, requirements: ['Trabajo verificable para el partido', `La confianza de ${name(w, head.id)}`], regionId: c.regionId, ctx: { head: head.id, area },
        obstacles: [{ id: 'desconocido', text: `${name(w, head.id)} apenas conoce tu trabajo`, active: relOf(w, head.id).familiarity < 20 }], risks: ['Otros militantes aspiran al mismo espacio'] }) };
    },
    steps: [
      { id: 'reunion', label: 'Pedir una reunión con quien preside', detail: 'Plantear tu interés directamente.', cost: 1, max: 2,
        run: (w, i) => { const h = String(i.ctx.head); const d = disp(w, h) + w.rng.normal(0, 10); rel(w, h, { familiarity: 8 }, 'menor'); clear(i, 'desconocido');
          if (d > 10) { gain(i, 8 * dim(i, 'reunion')); addSup(i, h); return log(w, i, `${name(w, h)} valora que lo plantees de frente: «demuéstralo en terreno y conversamos».`, 1); }
          if (d > -10) { gain(i, 2); return log(w, i, `${name(w, h)} te escucha, pero dice que hay «varios nombres» para esa secretaría.`); }
          return log(w, i, `${name(w, h)} no te da mucho espacio: no olvida diferencias anteriores.`, -1); } },
      { id: 'tarea', label: 'Hacerse cargo de una tarea concreta', detail: 'Organizar la escuela de formación o el padrón comunal.', cost: 2, max: 2,
        run: (w, i) => { const q = skill(w, 'gestion', 'disciplina'); gain(i, (q > 0.45 ? 9 : 3) * dim(i, 'tarea')); org(w, 1.5); if (q > 0.45) rel(w, String(i.ctx.head), { respect: 6, cooperation: 5 }); return log(w, i, q > 0.45 ? 'La tarea sale bien y se nota: la directiva lo comenta.' : 'Cumples, con problemas de coordinación.', q > 0.45 ? 1 : 0); } },
      { id: 'respaldo', label: 'Sumar respaldos en la directiva', detail: 'Que otros dirigentes hablen bien de ti.', cost: 1, max: 3, run: (w, i) => seekSupport(w, i, 'respaldo', 'hablará bien de ti en la directiva') },
    ],
    conclude: (w, i) => {
      const h = String(i.ctx.head); const sc = i.strength + i.supporters.length * 4 + disp(w, h) * 0.4 + w.rng.normal(0, 8) - 18;
      if (sc > 0 && !minorRoleBlocked(me(w), 'dirigente_territorial')) {
        me(w).offices.push({ type: 'dirigente_territorial', regionId: me(w).regionId, since: w.s.week, label: i.title });
        mem(w, h, 'apoyo_recibido', `Le confió ${i.title.toLowerCase()}`); progress(w.s); life(w, 'cargo', `Asumes: ${i.title}`, '', 1); rep(w, 'confianzaPartido', 4);
        return { success: true, text: `${name(w, h)} te confía ${i.title.toLowerCase()}.` };
      }
      const other = fictional(w, (x) => x.partyId === me(w).partyId && x.regionId === me(w).regionId && x.id !== h)[0];
      return { success: false, text: `La secretaría queda para ${other ? name(w, other.id) : 'otra persona'}. ${name(w, h)} te dice que «habrá otras oportunidades».` };
    },
  },
  {
    id: 'candidatura', title: 'Conseguir una candidatura', ambition: ['candidatura', 'congreso', 'alcaldia'],
    available: (w) => {
      const c = me(w); if (!c.partyId) return { ok: false, why: 'Sin partido, la vía es reunir firmas como independiente' };
      const e = nextElection(w, ['alcaldes', 'concejales', 'diputados', 'senadores', 'gobernadores']);
      if (!e) return { ok: false, why: 'No hay elecciones próximas' };
      const office = NOMINATED[e.type]; if (!office) return null;
      const win = electionWindow(w.s, e.id); if (!win) return null;
      if (w.s.week < win.open - 26) return { ok: false, why: `Aún es temprano: el proceso de ${unitLabel(office, '').split(' ')[0].toLowerCase() || 'candidaturas'} abre en ${win.open - w.s.week} semanas` };
      const unit = office === 'diputado' ? String(COMUNA_BY_CUT[home(w)]?.district ?? '') : office === 'senador' || office === 'gobernador' ? c.regionId : String(home(w));
      const office2 = office === 'concejal' && terr(w) > 30 ? 'alcalde' : office;
      return { ok: true, build: () => ({ title: `Candidatura a ${office2} (${unitLabel(office2, unit)})`, objective: `Ser nominado/a por ${party(w)!.short} para ${unitLabel(office2, unit)}`,
        participants: [], deadline: Math.max(w.s.week + 8, win.decision + 1), requirements: ['Comunicar la aspiración a tiempo', 'Respaldo territorial', 'Respaldo de dirigentes', 'Requisitos legales (edad, residencia, inscripción)'],
        regionId: c.regionId, ctx: { electionId: e.id, office: office2, unit },
        obstacles: [{ id: 'temprano', text: `El proceso interno abre en ${Math.max(0, win.open - w.s.week)} semanas`, active: w.s.week < win.open }], risks: ['El cupo puede cederse a un socio de pacto', 'Otros aspirantes del partido'] }) };
    },
    steps: [
      { id: 'comunicar', label: 'Comunicar la aspiración', detail: 'Inscribirte en el proceso interno del partido.', cost: 1, max: 1,
        when: (w, i) => aspireBlocked(w.s, String(i.ctx.electionId), i.ctx.office as never, String(i.ctx.unit)),
        run: (w, i) => { const r = aspire(w.s, w.rng, String(i.ctx.electionId), i.ctx.office as never, String(i.ctx.unit)); clear(i, 'temprano'); gain(i, 3); const p = w.s.career.processes.find((x) => x.electionId === i.ctx.electionId && x.aspirants.some((a) => a.charId === me(w).id)); if (p) i.ctx.process = p.id;
          for (const a of p?.aspirants ?? []) if (a.charId !== me(w).id && !i.opponents.includes(a.charId)) i.opponents.push(a.charId);
          return log(w, i, `${r}${i.opponents.length ? ` Compites con ${i.opponents.map((x) => name(w, x)).join(', ')}.` : ''}`, 1); } },
      { id: 'territorio', label: 'Construir apoyo territorial', detail: 'Operativos y reuniones con dirigentes vecinales del territorio.', cost: 2, max: 4,
        run: (w, i) => { land(w, home(w), 3 * dim(i, 'territorio') + 1); org(w, 1); gain(i, 3 * dim(i, 'territorio')); return log(w, i, `Sumas presencia en ${comuna(home(w))}: dirigentes vecinales te reconocen.`, 1); } },
      { id: 'dirigentes', label: 'Negociar con dirigentes', detail: 'Pedir respaldo explícito a quienes deciden.', cost: 1, max: 4,
        run: (w, i) => { const t = seekSupport(w, i, 'dirigentes', 'respaldará tu nombre ante la directiva'); const p = w.s.career.processes.find((x) => x.id === i.ctx.process); const mine = p?.aspirants.find((a) => a.charId === me(w).id); for (const s of i.supporters) if (mine && !mine.backers.includes(s)) mine.backers.push(s); return t; } },
      { id: 'requisitos', label: 'Ordenar los requisitos legales', detail: 'Antecedentes, declaración de patrimonio e intereses, domicilio electoral.', cost: 1, max: 1,
        run: (w, i) => { clear(i, 'requisitos'); gain(i, 2); return log(w, i, 'Tus antecedentes están en regla para inscribir la candidatura si te nominan.', 1); } },
    ],
    obstacleEvents: ['b_disputa_candidatura', 'e_primaria'],
    conclude: (w, i) => {
      const nominated = w.s.player.candidacies.some((x) => x.electionId === i.ctx.electionId);
      const p = w.s.career.processes.find((x) => x.id === i.ctx.process);
      if (nominated) { progress(w.s); return { success: true, text: `${party(w)!.short} te nomina. Ahora empieza la campaña.` }; }
      if (!p) return { success: false, text: 'No llegaste a inscribirte en el proceso interno a tiempo.' };
      if (p.status !== 'resuelto') { i.deadline = w.s.week + 4; return { success: false, text: '__pendiente' }; }
      return { success: false, text: `El partido optó por otra opción${p.outcome ? `: ${p.outcome}` : ''}.` };
    },
  },
  {
    id: 'reforma', title: 'Impulsar una reforma', ambition: ['congreso', 'gabinete', 'territorio', 'movimiento_propio'],
    available: (w) => {
      const c = me(w);
      const competent = isLeg(c) || exec(c) || c.rep.prestigioTecnico >= 35 || has(c, 'alcalde', 'concejal');
      if (!competent) return { ok: false, why: 'Necesitas un cargo legislativo o ejecutivo, o prestigio técnico reconocido, para que una propuesta llegue al Congreso' };
      const area = c.specialty;
      return { ok: true, build: () => ({ title: `Reforma en ${AREA_LABELS[area].toLowerCase()}`, objective: `Que una propuesta tuya sobre ${AREA_LABELS[area].toLowerCase()} se convierta en proyecto de ley y avance`,
        participants: [], deadline: w.s.week + 30, requirements: ['Un texto técnico sólido', isLeg(c) ? 'Firmas de patrocinio' : 'Un/a parlamentario/a que la patrocine', 'Votos en comisión'], ctx: { area },
        obstacles: [{ id: 'sin_patrocinio', text: 'Nadie la patrocina todavía', active: !isLeg(c) }], risks: ['El Ejecutivo puede no darle urgencia', 'Puede quedar archivada en comisión'] }) };
    },
    steps: [
      { id: 'preparar', label: 'Preparar la propuesta', detail: 'Redactar con especialistas un texto y su informe financiero.', cost: 2, max: 2,
        run: (w, i) => { const q = skill(w, 'tecnico', 'gestion'); i.ctx.quality = Math.max(Number(i.ctx.quality ?? 0), q); gain(i, q * 10 * dim(i, 'preparar')); rep(w, 'prestigioTecnico', 1.5); return log(w, i, q > 0.55 ? 'El texto es sólido: especialistas lo consideran viable.' : 'El texto tiene vacíos que te van a reprochar.', q > 0.55 ? 1 : -1); } },
      { id: 'colaboradores', label: 'Conseguir colaboradores', detail: 'Sumar a especialistas y dirigentes de organizaciones del área.', cost: 1, max: 3, run: (w, i) => seekSupport(w, i, 'colaboradores', 'aportará a la propuesta') },
      { id: 'patrocinio', label: 'Buscar patrocinio', detail: 'Presentarla como moción (o que un/a parlamentario/a la presente).', cost: 1, max: 1,
        when: (_w, i) => Number(i.ctx.quality ?? 0) <= 0 ? 'Primero prepara la propuesta' : null,
        run: (w, i) => {
          const c = me(w); let author = isLeg(c) ? c : null;
          if (!author) { const legs = Object.values(w.s.characters).filter((x) => x.status === 'activo' && !x.realId && isLeg(x) && x.partyId === c.partyId); author = pickW(w, legs, (x) => 1 + Math.max(0, disp(w, x.id))); if (!author || disp(w, author.id) + Number(i.ctx.quality) * 30 + w.rng.normal(0, 10) < 5) return log(w, i, `${author ? name(w, author.id) : 'Ningún parlamentario de tu partido'} no se compromete a patrocinarla por ahora.`, -1); addSup(i, author.id); }
          const area = i.ctx.area as keyof typeof AREA_LABELS; const st = w.s.seats.find((x) => x.holderId === author!.id);
          const created = createBill(w.s, { title: `Moción: ${i.title.replace('Reforma en ', 'reforma de ')}`, area, origin: 'mocion', authorId: author.id, authorPartyId: author.partyId, chamberOfOrigin: st?.chamber ?? 'camara', urgency: 'ninguna', quorum: 'simple', position: { ...zeroIdeology(), ...me(w).ideology }, intensity: 0.5, popularity: 50, fiscalCost: 0 });
          i.ctx.billId = created.id; clear(i, 'sin_patrocinio'); gain(i, 6);
          news(w, 'congreso', `Ingresa moción sobre ${AREA_LABELS[area].toLowerCase()}`, `Patrocinada por ${name(w, author.id)}${author.id !== c.id ? ` a partir de una propuesta de ${name(w, c.id)}` : ''}.`, 2, [author.id, c.id]);
          return log(w, i, `La propuesta ingresa al Congreso${author.id !== c.id ? ` con el patrocinio de ${name(w, author.id)}` : ''}.`, 1);
        } },
      { id: 'negociar', label: 'Negociar modificaciones', detail: 'Ceder en parte del texto para sumar votos de otros sectores.', cost: 1, max: 2,
        when: (_w, i) => i.ctx.billId ? null : 'La propuesta aún no ingresa',
        run: (w, i) => { const b = w.s.bills.find((x) => x.id === i.ctx.billId); if (!b || b.closedWeek !== undefined) return log(w, i, 'El proyecto ya no está en trámite.'); b.moderation = clamp(b.moderation + 0.12, 0, 1); gain(i, 5 * dim(i, 'negociar')); rep(w, 'relacionesParlamentarias', 2); return log(w, i, 'Aceptas indicaciones de otros sectores: el texto pierde ambición, pero gana votos.', 0); } },
    ],
    conclude: (w, i) => {
      const b = w.s.bills.find((x) => x.id === i.ctx.billId);
      if (!b) return { success: false, text: 'La propuesta nunca llegó a ingresar como proyecto.' };
      if (b.closedWeek === undefined) { if (w.s.week - i.startWeek < 90) { i.deadline = w.s.week + 10; return { success: false, text: '__pendiente' }; } return { success: false, text: 'El proyecto sigue en comisión sin urgencia: queda de hecho archivado.' }; }
      const passed = b.stage === 'publicada';
      if (passed) { rep(w, 'prestigioTecnico', 5); life(w, 'ley', `Tu reforma se convierte en ley: ${b.title}`, '', 1); progress(w.s); }
      return { success: passed, text: passed ? 'La reforma se convierte en ley.' : 'El proyecto no prosperó en el Congreso.' };
    },
  },
  {
    id: 'base_territorial', title: 'Construir base territorial', ambition: ['territorio', 'alcaldia', 'congreso'],
    available: (w) => {
      const cut = home(w); const cs = w.s.comunas[String(cut)];
      const problem = (cs?.discontent ?? 40) > 55 ? 'el malestar con la gestión municipal' : 'la falta de organización vecinal';
      return { ok: true, build: () => ({ title: `Red territorial en ${comuna(cut)}`, objective: `Convertirte en una referencia reconocida en ${comuna(cut)} frente a ${problem}`,
        participants: [], deadline: w.s.week + 20, requirements: ['Presencia sostenida', 'Dirigentes vecinales aliados'], cut, ctx: { problem },
        obstacles: [], risks: ['La autoridad local puede verte como competencia', 'Prometer más de lo que puedes cumplir'] }) };
    },
    steps: [
      { id: 'diagnostico', label: 'Diagnóstico con vecinos', detail: 'Recorrer juntas de vecinos y anotar problemas concretos.', cost: 1, max: 1,
        run: (w, i) => { i.ctx.diag = 1; gain(i, 4); land(w, i.cut, 2); return log(w, i, `Levantas una lista de problemas reales en ${comuna(i.cut)}: veredas, luminarias, buses nocturnos.`, 1); } },
      { id: 'dirigentes', label: 'Sumar dirigentes vecinales', detail: 'Convencer a presidentes de juntas de vecinos.', cost: 1, max: 3,
        run: (w, i) => { const q = skill(w, 'carisma', 'redes') + (i.ctx.diag ? 0.1 : 0); const n = q > 0.5 ? 2 : 1; gain(i, n * 3 * dim(i, 'dirigentes')); land(w, i.cut, n * 1.5); org(w, n * 0.6); return log(w, i, `${n === 2 ? 'Dos dirigentes vecinales' : 'Una dirigenta vecinal'} se suma${n === 2 ? 'n' : ''} a tu red.`, 1); } },
      { id: 'mesa', label: 'Llevar las demandas al municipio', detail: 'Pedir una mesa de trabajo con la municipalidad.', cost: 1, max: 2,
        run: (w, i) => { const ok = chance(w, 0.3 + terr(w) / 150 + (has(me(w), 'concejal') ? 0.3 : 0)); if (ok) { discontent(w, i.cut!, -2); gain(i, 6 * dim(i, 'mesa')); land(w, i.cut, 3); return log(w, i, 'El municipio acepta una mesa: se compromete a reparar luminarias. Los vecinos lo asocian a tu gestión.', 1); } obstacle(i, 'municipio', 'El municipio no responde'); return log(w, i, 'El municipio no te recibe: «no trabajamos con operadores políticos».', -1); } },
      { id: 'operativo', label: 'Operativo solidario', detail: 'Un operativo de salud o trámites un sábado.', cost: 2, funds: 3, max: 3,
        run: (w, i) => { funds(w, -3); land(w, i.cut, 3 * dim(i, 'operativo')); gain(i, 3 * dim(i, 'operativo')); return log(w, i, 'El operativo convoca a cientos de vecinos.', 1); } },
    ],
    conclude: (w, i) => {
      const t = w.s.career.capital.territory[i.cut!] ?? 0; const ok = t + i.strength * 0.5 + w.rng.normal(0, 6) > 30;
      if (ok && !has(me(w), 'dirigente_social') && !minorRoleBlocked(me(w), 'dirigente_social')) me(w).offices.push({ type: 'dirigente_social', regionId: me(w).regionId, comuna: comuna(i.cut), since: w.s.week, label: `Coordinación vecinal de ${comuna(i.cut)}` });
      if (ok) { progress(w.s); life(w, 'decision', `Eres una referencia en ${comuna(i.cut)}`, '', 1); }
      return { success: ok, text: ok ? `En ${comuna(i.cut)} ya te reconocen como referente vecinal.` : `Tu red en ${comuna(i.cut)} existe, pero todavía no te distingue de otros dirigentes.` };
    },
  },
  {
    id: 'sector_interno', title: 'Organizar un sector para disputar el partido', ambition: ['presidir_partido'],
    available: (w) => {
      const p = party(w); if (!p) return { ok: false, why: 'Requiere militancia' };
      if (p.leaderId === me(w).id) return { ok: false, why: 'Ya presides el partido' };
      if (me(w).rep.reconocimiento < 15 && infl(w) < 20) return { ok: false, why: 'Necesitas más peso interno o reconocimiento para que otros te sigan' };
      return { ok: true, build: () => ({ title: `Disputar la presidencia de ${p.short}`, objective: `Ganar la elección de la directiva nacional de ${p.short}`, participants: [], deadline: Math.max(w.s.week + 10, p.nextLeadershipWeek + 1),
        requirements: ['Un sector organizado', 'Apoyo en varias regiones', 'Inscripción de la candidatura'], ctx: {}, obstacles: [{ id: 'directiva', text: 'La directiva vigente defenderá su continuidad', active: true }], risks: ['Fracturar el partido', 'Quedar marginado/a si pierdes'] }) };
    },
    steps: [
      { id: 'regiones', label: 'Recorrer regiones', detail: 'Reunirte con dirigentes regionales fuera de tu zona.', cost: 2, max: 4, run: (w, i) => { const r = w.rng.pick(Object.keys(w.s.regions)); regRep(w, r, 4); gain(i, 3 * dim(i, 'regiones')); return log(w, i, `Visitas ${region(r)}: algunos dirigentes se comprometen a escucharte.`, 1); } },
      { id: 'facciones', label: 'Negociar con otros sectores', detail: 'Ofrecer espacios en la directiva a cambio de apoyo.', cost: 1, max: 3, run: (w, i) => seekSupport(w, i, 'facciones', 'apoyará tu candidatura a la directiva') },
      { id: 'inscribir', label: 'Inscribir la candidatura', detail: 'Formalizar la postulación ante el tribunal supremo del partido.', cost: 1, max: 1,
        when: (w) => w.s.player.candidacies.some((x) => x.electionId === `interna-${me(w).partyId}`) ? 'Ya está inscrita' : null,
        run: (w, i) => { w.s.player.candidacies.push({ electionId: `interna-${me(w).partyId}`, office: 'presidente_partido', partyId: me(w).partyId!, approved: true }); gain(i, 4); return log(w, i, 'Tu candidatura a la presidencia del partido queda inscrita.', 1); } },
    ],
    conclude: (w) => {
      const won = party(w)?.leaderId === me(w).id;
      return { success: won, text: won ? 'Ganas la presidencia del partido.' : 'La directiva vigente se impone. Tu sector queda con peso para negociar.' };
    },
  },
  {
    id: 'movimiento', title: 'Construir un movimiento político', ambition: ['movimiento_propio'],
    available: (w) => me(w).rep.reconocimiento < 10 && terr(w) < 20 ? { ok: false, why: 'Aún no tienes el reconocimiento ni la base para convocar a otros' }
      : { ok: true, build: () => ({ title: 'Un movimiento propio', objective: 'Reunir figuras, una base organizada y un programa que permita competir fuera de los partidos tradicionales', participants: [], deadline: w.s.week + 40,
        requirements: ['Figuras que se sumen', 'Base territorial', 'Programa', 'Financiamiento legal'], ctx: {}, obstacles: [{ id: 'partido', text: me(w).partyId ? 'Tu partido lo verá como una amenaza' : 'Sin estructura previa', active: true }], risks: ['Aislarte', 'Que nadie se sume'] }) },
    steps: [
      { id: 'convocar', label: 'Convocar a figuras independientes', detail: 'Dirigentes sociales y profesionales sin militancia.', cost: 1, max: 4,
        run: (w, i) => { const pool = fictional(w, (x) => !x.partyId && x.regionId === me(w).regionId && !i.supporters.includes(x.id)); const c = pickW(w, pool, (x) => 1 + x.rep.reconocimiento); if (!c) { gain(i, 1); return log(w, i, 'No hay figuras independientes disponibles en tu región por ahora.'); } if (disp(w, c.id) + skill(w, 'carisma', 'liderazgo') * 40 + w.rng.normal(0, 10) > 15) { addSup(i, c.id); gain(i, 5); return log(w, i, `${name(w, c.id)} se suma al movimiento.`, 1); } return log(w, i, `${name(w, c.id)} prefiere esperar a ver si el movimiento prende.`); } },
      { id: 'programa', label: 'Escribir el programa', detail: 'Cabildos abiertos y un documento de principios.', cost: 2, max: 1, run: (w, i) => { gain(i, 6); rep(w, 'credibilidad', 1); return log(w, i, 'El programa se discute en cabildos: hay entusiasmo y también diferencias.', 1); } },
      { id: 'finanzas', label: 'Ordenar el financiamiento', detail: 'Aportes pequeños declarados.', cost: 1, max: 2, run: (w, i) => { funds(w, 3 + me(w).rep.reconocimiento / 10); gain(i, 2); return log(w, i, 'Reúnes aportes declarados para sostener la estructura.', 0); } },
    ],
    conclude: (w, i) => {
      const ok = i.supporters.length >= 2 && i.strength + w.rng.normal(0, 8) > 18;
      if (ok) { rep(w, 'reconocimiento', 4); org(w, 6); news(w, 'partidos', `Nace un movimiento encabezado por ${name(w, me(w).id)}`, `${i.supporters.length} figuras se suman.`, 3, [me(w).id]); life(w, 'partido', 'Fundas un movimiento político', 'Podrás transformarlo en partido si reúnes las firmas.', 1); if (me(w).partyId) rep(w, 'confianzaPartido', -10); }
      return { success: ok, text: ok ? 'El movimiento existe: tiene figuras, base y programa. Puede convertirse en partido.' : 'El movimiento no logra masa crítica.' };
    },
  },
  {
    id: 'gabinete', title: 'Integrar un equipo de gobierno', ambition: ['gabinete'],
    available: (w) => {
      const c = me(w); const coal = w.s.government.coalitionId ? w.s.coalitions[w.s.government.coalitionId] : null;
      if (!c.partyId || !coal?.members.includes(c.partyId)) return { ok: false, why: 'Tu partido no forma parte del gobierno' };
      if (c.rep.prestigioTecnico < 25) return { ok: false, why: 'Necesitas un perfil técnico reconocido' };
      return { ok: true, build: () => ({ title: `Un cargo en ${AREA_LABELS[c.specialty].toLowerCase()}`, objective: 'Ser considerado/a para una seremía, subsecretaría o asesoría ministerial', participants: [], deadline: w.s.week + 26,
        requirements: ['Perfil técnico', 'Respaldo partidario', 'Contactos en el Ejecutivo'], ctx: {}, obstacles: [{ id: 'cuoteo', text: 'Los cupos se reparten entre partidos de la coalición', active: true }], risks: ['Que el cupo vaya a otro partido'] }) };
    },
    steps: [
      { id: 'minuta', label: 'Enviar una minuta técnica al ministerio', detail: 'Un documento útil para la cartera.', cost: 1, max: 2, run: (w, i) => { const q = skill(w, 'tecnico'); gain(i, q * 9 * dim(i, 'minuta')); rep(w, 'prestigioTecnico', 1); return log(w, i, q > 0.5 ? 'La minuta llega al gabinete del ministro: piden conversar.' : 'La minuta se archiva sin respuesta.', q > 0.5 ? 1 : 0); } },
      { id: 'partido', label: 'Pedir el respaldo del partido', detail: 'Que la directiva te proponga en la cuota partidaria.', cost: 1, max: 1, run: (w, i) => { const p = party(w)!; const lid = p.leaderId; if (!lid) return log(w, i, 'El partido no tiene una conducción clara.'); if (disp(w, lid) + me(w).rep.confianzaPartido * 0.3 + w.rng.normal(0, 10) > 15) { const real = !!ch(w, lid)?.realId; if (!real) addSup(i, lid); gain(i, 10); return log(w, i, real ? 'La directiva del partido incluye tu nombre en la lista que entrega al gobierno.' : `${name(w, lid)} incluye tu nombre en la lista que el partido entrega al gobierno.`, 1); } return log(w, i, 'La directiva tiene otros nombres para la cuota partidaria.', -1); } },
    ],
    conclude: (w, i) => {
      const ok = i.strength + w.rng.normal(0, 8) > 20 && !minorRoleBlocked(me(w), 'asesor');
      if (ok) { me(w).offices.push({ type: 'asesor', regionId: me(w).regionId, since: w.s.week, label: `Asesoría en el área de ${AREA_LABELS[me(w).specialty].toLowerCase()} del Ejecutivo` }); progress(w.s); life(w, 'cargo', 'Te incorporas a un equipo de gobierno', i.title, 1); }
      return { success: ok, text: ok ? 'Te incorporas a un equipo del Ejecutivo.' : 'El cupo se asigna a otro partido de la coalición.' };
    },
  },
];
export const INITIATIVE_BY_ID = Object.fromEntries(INITIATIVES.map((d) => [d.id, d])) as Record<string, InitiativeDef>;

// ───────────────────────────── ciclo ─────────────────────────────
export function launchInitiative(w: W, defId: string): string | Initiative {
  const d = INITIATIVE_BY_ID[defId]; if (!d) return 'Iniciativa desconocida';
  if (P(w).initiatives.some((i) => i.defId === defId && i.status === 'en_curso')) return 'Ya tienes esa iniciativa en curso';
  if (P(w).initiatives.filter((i) => i.status === 'en_curso').length >= 3) return 'No puedes sostener más de tres proyectos a la vez';
  const av = d.available(w); if (!av) return 'No es posible en las circunstancias actuales'; if (!av.ok) return av.why;
  const b = av.build();
  const i: Initiative = { ...b, id: newPid(w.s, 'ini'), defId, ownerId: me(w).id, startWeek: w.s.week, status: 'en_curso', supporters: [], opponents: [], strength: 0, resources: { pa: 0, funds: 0 }, commitments: [], stepsDone: {}, log: [] };
  P(w).initiatives.push(i);
  log(w, i, `Inicias: ${i.objective}.`);
  if (defId === 'directiva_comunal') {
    const rivals = fictional(w, (x) => x.partyId === me(w).partyId && x.regionId === me(w).regionId && x.offices.length === 0).slice(0, 2);
    const k = openContest(w, { label: i.title, kind: 'presidencia_comunal', closeWeek: i.deadline, initiativeId: i.id, regionId: me(w).regionId, cut: i.cut, partyId: me(w).partyId ?? undefined }, rivals);
    i.ctx.contest = k.id; i.opponents.push(...rivals.map((r) => r.id)); obstacle(i, 'sin_lista', 'Aún no inscribes una lista');
  }
  if (defId === 'candidatura') obstacle(i, 'requisitos', 'Requisitos legales pendientes');
  life(w, 'decision', `Inicias un proyecto: ${i.title}`, i.objective, 0);
  return i;
}

export function stepBlocked(w: W, i: Initiative, stepId: string): string | null {
  const d = INITIATIVE_BY_ID[i.defId]; const st = d?.steps.find((x) => x.id === stepId);
  if (!st || i.status !== 'en_curso') return 'Acción no disponible';
  if (st.max && done(i, stepId) >= st.max) return 'Ya hiciste todo lo posible por esta vía';
  if (w.s.player.actionPoints < st.cost) return `Requiere ${st.cost} PA`;
  if (st.funds && w.s.player.personalFunds < st.funds) return `Requiere ${st.funds} MM$`;
  if (P(w).cooldowns[`step|${i.id}|${stepId}`] > w.s.week) return 'Ya lo intentaste esta semana';
  return st.when?.(w, i) ?? null;
}

export function runStep(w: W, id: string, stepId: string): string {
  const i = P(w).initiatives.find((x) => x.id === id); if (!i) return 'Iniciativa no encontrada';
  const b = stepBlocked(w, i, stepId); if (b) return b;
  const st = INITIATIVE_BY_ID[i.defId].steps.find((x) => x.id === stepId)!;
  w.s.player.actionPoints -= st.cost; i.resources.pa += st.cost; if (st.funds) i.resources.funds += st.funds;
  const out = st.run(w, i);
  i.stepsDone[stepId] = done(i, stepId) + 1;
  P(w).cooldowns[`step|${i.id}|${stepId}`] = w.s.week + 1;
  return out;
}

export function abandonInitiative(w: W, id: string): string {
  const i = P(w).initiatives.find((x) => x.id === id); if (!i || i.status !== 'en_curso') return 'No hay nada que abandonar';
  i.status = 'abandonada'; i.result = 'Abandonada';
  for (const s of i.supporters) { rel(w, s, { trust: -4, reliability: -5 }, 'relevante'); mem(w, s, 'apoyo_rechazado', `Abandonó el proyecto al que se sumó: ${i.title}`); }
  const k = contestOf(w, String(i.ctx.contest)); if (k) { const mine = k.contenders.find((c) => c.id === me(w).id); if (mine) mine.strategy = 'se_retira'; }
  log(w, i, `Abandonas el proyecto. ${i.supporters.length ? 'Quienes te apoyaron lo resienten.' : ''}`, -1);
  return `Abandonas: ${i.title}.`;
}

/** Revisión semanal: obstáculos emergentes, plazos y desenlace incierto. */
export function weeklyInitiatives(w: W): void {
  for (const i of P(w).initiatives) {
    if (i.status !== 'en_curso') continue;
    // los apoyos no son eternos: si la relación se deteriora, alguien se baja
    for (const sId of [...i.supporters]) if (disp(w, sId) < -15 && chance(w, 0.3)) { addOpp(i, sId); log(w, i, `${name(w, sId)} retira su apoyo.`, -1); feed(w, sId, 'respaldo', `${name(w, sId)} se distancia de tu proyecto: ${i.title.toLowerCase()}.`); }
    // una iniciativa sin trabajo se enfría
    const lastWork = Math.max(i.startWeek, ...i.log.filter((l) => l.tone !== -1 || l.text).map((l) => l.week));
    if (w.s.week - lastWork > 6) { gain(i, -1.5); if (w.s.week - lastWork === 7) log(w, i, 'El proyecto se está enfriando: nadie ve movimiento.', -1); }
    if (w.s.week >= i.deadline) {
      const r = INITIATIVE_BY_ID[i.defId].conclude(w, i);
      if (r.text === '__pendiente') continue;
      i.status = r.success ? 'exitosa' : 'fallida'; i.result = r.text;
      log(w, i, r.text, r.success ? 1 : -1);
      w.s.player.lastActionResults.push(`${i.title}: ${r.text}`);
      // consecuencias persistentes sobre quienes se involucraron
      for (const sId of i.supporters) { if (r.success) { rel(w, sId, { cooperation: 6, trust: 3 }); mem(w, sId, 'colaboracion', `Acompañó el proyecto exitoso: ${i.title}`); } else rel(w, sId, { respect: -2 }, 'menor'); }
      if (!r.success) life(w, 'decision', `Fracasa: ${i.title}`, r.text, -1);
    }
  }
  if (P(w).initiatives.length > 25) P(w).initiatives.splice(0, P(w).initiatives.length - 25);
}

export function initiativesAvailable(w: W): { def: InitiativeDef; ok: boolean; why?: string }[] {
  return INITIATIVES.map((d) => { const a = d.available(w); return a === null ? null : { def: d, ok: a.ok, why: a.ok ? undefined : a.why }; }).filter((x): x is NonNullable<typeof x> => !!x);
}
export { weeksTo, partyTerr, ch };
