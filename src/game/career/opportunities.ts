/**
 * MOTOR DE OPORTUNIDADES POLÍTICAS EMERGENTES.
 *
 * Cada oportunidad nace del estado de la simulación (condiciones), involucra actores reales de
 * la partida, declara requisitos, beneficios y riesgos, y ofrece decisiones (aceptar, rechazar,
 * negociar). Las consecuencias pueden ser inmediatas o diferidas (compromisos, memoria de los
 * actores). Rechazar también tiene efectos. Nada garantiza un resultado.
 *
 * El estancamiento aumenta la frecuencia de oportunidades "de reinvención", pero no las fuerza.
 */
import type { Character, GameState, Opportunity, OpportunityOption, OfficeType } from '../models/types';
import { Rng } from '../engine/rng';
import { AREA_LABELS, clamp } from '../rules/params';
import { MINISTRIES, MINISTRY_BY_ID } from '../data/institutions';
import { REGION_BY_ID } from '../data/geography';
import { COMUNA_BY_CUT } from '../territory/data';
import { ageOf, candidateQuality, fullName, remember, removeOffice } from '../systems/characters';
import { addRelation, ideoDistance, newId } from '../systems/util';
import { addNews } from '../systems/news';
import { appointMinister, coalitionMembers } from '../systems/government';
import { leaveParty } from '../systems/parties';
import { listIdOf } from '../systems/elections';
import { PUBLIC_OFFICES, addTerritory, bio, capitalOf, first, homeCut, me, minorRoleBlocked, officeRank, partyInfluenceOf, progress, stagnationWeeks } from './capital';
import { aspire, aspireBlocked, electionWindow, grantNomination, NOMINATED, unitLabel } from './nominations';
import { unitComunas } from './capital';
import { LATENT_OFFER_KINDS, resolveLatentOffer } from './latent';

type Ctx = Record<string, string | number>;
interface Built { title: string; description: string; actors: string[]; requirements: string[]; benefits: string[]; risks: string[]; options: OpportunityOption[]; ctx: Ctx; expires?: number; office?: OfficeType }
export interface OpportunityDef {
  kind: string;
  cooldown: number;
  /** Probabilidad semanal (0 si no se cumplen las condiciones) y opportunity construida */
  generate: (s: GameState, rng: Rng) => { p: number; build: () => Built | null } | null;
  resolve: (s: GameState, rng: Rng, o: Opportunity, choice: string) => string;
  /** Opción aplicada si vence sin respuesta */
  onExpire?: string;
}

const P = (s: GameState) => me(s);
const partyOf = (s: GameState) => { const c = P(s); return c.partyId ? s.parties[c.partyId] : null; };
const hasOffice = (c: Character, t: OfficeType) => c.offices.some((o) => o.type === t);
const isFree = (c: Character) => !c.offices.some((o) => ['presidente', 'ministro', 'subsecretario', 'seremi'].includes(o.type));
const relNote = (s: GameState, id: string, w: number, kind: 'apoyo' | 'conflicto' | 'colaboracion' | 'promesa_incumplida' | 'acuerdo_cumplido' | 'traicion', note: string) => {
  const t = s.characters[id]; if (!t) return;
  remember(t, { week: s.week, aboutId: s.player.characterId, kind, weight: w, note });
  const c = P(s); c.relations[id] = clamp((c.relations[id] ?? 0) + w * 0.6, -100, 100);
};
const opt = (id: string, label: string, hint: string): OpportunityOption => ({ id, label, hint });

/** Figura notable del partido del jugador (dirigente, parlamentario, autoridad), excluyéndolo. */
function notable(s: GameState, rng: Rng, filter: (c: Character) => boolean): Character | null {
  const c = P(s);
  const pool = Object.values(s.characters).filter((x) => x.status === 'activo' && !x.isPlayer && x.id !== c.id && filter(x));
  if (!pool.length) return null;
  return rng.weighted(pool, pool.map((x) => 1 + x.rep.reconocimiento));
}

export const OPPORTUNITIES: OpportunityDef[] = [
  {
    kind: 'cupo_cedido', cooldown: 0, generate: () => null,
    resolve: (s, rng, o, ch) => {
      const c = P(s); const party = s.parties[String(o.ctx.party)]; const leader = party?.leaderId;
      if (ch === 'disciplina') { c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + 6, 0, 100); if (leader) relNote(s, leader, 6, 'acuerdo_cumplido', 'Acató la decisión del pacto'); return 'Acatas la decisión; la directiva lo valora.'; }
      if (ch === 'protesta') { c.rep.confianzaPartido = clamp(c.rep.confianzaPartido - 8, 0, 100); addTerritory(s, [homeCut(s)], 5); if (leader) relNote(s, leader, -8, 'conflicto', 'Protestó públicamente'); return 'Tu protesta conecta con las bases locales, pero la directiva se molesta.'; }
      if (leader && rng.chance(0.5)) { s.career.commitments.push({ id: newId(s, 'cm'), toCharId: leader, kind: 'cargo', createdWeek: s.week, dueWeek: s.week + 104, description: `${fullName(s.characters[leader])} prometió compensarte`, status: 'vigente' }); return 'La directiva promete compensarte más adelante.'; }
      return 'La directiva no se compromete a nada.';
    },
    onExpire: 'disciplina',
  },
  // ------------------------------------------------------------------ primeros pasos
  {
    kind: 'campana_ajena', cooldown: 30,
    generate: (s, _rng) => {
      const c = P(s);
      const proc = s.career.processes.find((p) => p.status === 'resuelto' && p.partyId === c.partyId && s.calendar.find((e) => e.id === p.electionId && !e.done && e.week - s.week < 14));
      const cand = proc ? proc.aspirants.find((a) => a.status === 'nominado' && a.charId !== c.id)?.charId : null;
      if (!cand || !s.characters[cand]) return null;
      return { p: 0.25, build: () => {
        const k = s.characters[cand];
        return { title: `${fullName(k)} te invita a su comando de campaña`, description: `Es candidato/a de ${s.parties[proc!.partyId].short} en ${proc!.unitLabel}. Necesita gente que conozca el territorio.`, actors: [cand],
          requirements: ['Tiempo: 1 PA por semana durante la campaña (implícito)'], benefits: ['Relación cercana con la candidatura', 'Capital territorial y experiencia', 'Si gana, puede abrirte puertas'], risks: ['Si pierde, quedas asociado/a a la derrota', 'Tiempo que no dedicas a tu propio proyecto'],
          options: [opt('aceptar', 'Sumarme al comando', 'Compromiso de lealtad con la candidatura'), opt('apoyo_parcial', 'Apoyar de forma acotada', 'Beneficios menores, sin compromiso'), opt('rechazar', 'Declinar', 'La candidatura lo recordará')], ctx: { cand, unit: proc!.unitId, office: proc!.office, election: proc!.electionId } };
      } };
    },
    resolve: (s, _rng, o, ch) => {
      const cand = String(o.ctx.cand);
      const cuts = unitComunas(o.ctx.office as OfficeType, String(o.ctx.unit));
      if (ch === 'aceptar') {
        relNote(s, cand, 15, 'colaboracion', 'Trabajó en su campaña'); addTerritory(s, cuts, 6); P(s).attrs.experiencia = clamp(P(s).attrs.experiencia + 2, 0, 100);
        s.career.commitments.push({ id: newId(s, 'cm'), toCharId: cand, kind: 'lealtad', createdWeek: s.week, dueWeek: s.week + 104, description: `Lealtad a ${fullName(s.characters[cand])} tras su campaña`, status: 'vigente', ctx: { election: String(o.ctx.election) } });
        s.career.cooldowns[`asesor:${cand}`] = 0;
        return 'Te sumas al comando. Ganas terreno y una relación cercana; quedas asociado/a a su resultado.';
      }
      if (ch === 'apoyo_parcial') { relNote(s, cand, 5, 'apoyo', 'Apoyo acotado en campaña'); addTerritory(s, cuts, 2); return 'Apoyas de forma acotada.'; }
      relNote(s, cand, -6, 'conflicto', 'No quiso sumarse a su campaña'); return 'Declinas. La candidatura toma nota.';
    },
    onExpire: 'rechazar',
  },
  {
    kind: 'mentor', cooldown: 60,
    generate: (s, rng) => {
      const c = P(s);
      if (!c.partyId || hasOffice(c, 'asesor') || minorRoleBlocked(c, 'asesor')) return null;
      const cap = capitalOf(s);
      const p = 0.01 + cap.prestige / 4000 + cap.relations / 5000 + (stagnationWeeks(s) > 52 ? 0.01 : 0);
      return { p, build: () => {
        const m = notable(s, rng, (x) => x.partyId === c.partyId && x.offices.some((o) => ['diputado', 'senador', 'ministro', 'gobernador', 'alcalde'].includes(o.type)));
        if (!m) return null;
        const off = m.offices[0];
        return { title: `${fullName(m)} busca un/a colaborador/a`, description: `${fullName(m)} (${off.type}${off.regionId ? `, ${REGION_BY_ID[off.regionId].shortName}` : ''}) necesita a alguien de confianza en su equipo político.`, actors: [m.id],
          requirements: ['Disponibilidad (reduce tu agenda propia)'], benefits: ['Cargo de asesor/a: experiencia, redes y prestigio', 'Acceso a la trastienda política', 'Un/a padrino/madrina política'], risks: ['Quedas vinculado/a a su suerte y a sus conflictos', 'Te exigirá lealtad en disputas internas'],
          options: [opt('aceptar', 'Aceptar el cargo', 'Asesor/a con compromiso de lealtad'), opt('negociar', 'Aceptar con autonomía política', 'Menos cercanía, conservas libertad (puede no aceptarlo)'), opt('rechazar', 'Rechazar', 'Puede resentirlo')], ctx: { mentor: m.id } };
      } };
    },
    resolve: (s, rng, o, ch) => {
      const m = s.characters[String(o.ctx.mentor)]; const c = P(s);
      if (!m) return 'La oportunidad ya no existe.';
      if (ch === 'rechazar') { relNote(s, m.id, -5, 'conflicto', 'Rechazó trabajar con él/ella'); return 'Rechazas la oferta.'; }
      if (ch === 'negociar' && rng.chance(0.5 - (m.personality === 'confrontacional' ? 0.2 : 0))) { relNote(s, m.id, -2, 'conflicto', 'Exigió autonomía'); return `${fullName(m)} prefiere a alguien más leal. Pierdes la oportunidad.`; }
      c.offices.push({ type: 'asesor', regionId: m.regionId, since: s.week });
      c.relations[m.id] = clamp((c.relations[m.id] ?? 0) + 20, -100, 100);
      relNote(s, m.id, ch === 'aceptar' ? 15 : 8, 'colaboracion', 'Asesor/a de su equipo');
      first(s, 'mentor', fullName(m));
      if (ch === 'aceptar') s.career.commitments.push({ id: newId(s, 'cm'), toCharId: m.id, kind: 'lealtad', createdWeek: s.week, dueWeek: s.week + 156, description: `Lealtad política a ${fullName(m)}`, status: 'vigente' });
      bio(s, 'cargo', `Asesor/a de ${fullName(m)}`, '', 1); progress(s);
      return `Te incorporas al equipo de ${fullName(m)}.`;
    },
    onExpire: 'rechazar',
  },
  {
    kind: 'organizacion_social', cooldown: 80,
    generate: (s) => {
      const c = P(s);
      if (hasOffice(c, 'dirigente_social') || minorRoleBlocked(c, 'dirigente_social') || c.offices.length > 1) return null;
      return { p: 0.015 + capitalOf(s).territorial / 4000, build: () => ({
        title: 'Te ofrecen encabezar una organización local', description: `Vecinos y vecinas de ${COMUNA_BY_CUT[homeCut(s)].name} te proponen presidir su organización (${s.career.origin.organization ?? 'junta de vecinos'}).`, actors: [],
        requirements: ['Tiempo y presencia territorial'], benefits: ['Cargo de dirigente social', 'Capital territorial sostenido', 'Credibilidad lejos de la política partidaria'], risks: ['Conflictos locales difíciles', 'Si te ven usar la organización para tu carrera, pierdes credibilidad'],
        options: [opt('aceptar', 'Aceptar', 'Dirigente social'), opt('rechazar', 'Declinar', '')], ctx: {},
      }) };
    },
    resolve: (s, _rng, _o, ch) => {
      if (ch !== 'aceptar') return 'Declinas.';
      const c = P(s); c.offices.push({ type: 'dirigente_social', regionId: c.regionId, comuna: c.comuna, since: s.week });
      addTerritory(s, [homeCut(s)], 10); c.rep.credibilidad = clamp(c.rep.credibilidad + 3, 0, 100);
      bio(s, 'cargo', 'Dirigente social', COMUNA_BY_CUT[homeCut(s)].name, 1); progress(s);
      return 'Asumes como dirigente de la organización.';
    },
    onExpire: 'rechazar',
  },
  // ------------------------------------------------------------------ vida partidaria
  {
    kind: 'disputa_interna', cooldown: 40,
    generate: (s, _rng) => {
      const p = partyOf(s); if (!p || p.factions.length < 2) return null;
      const hot = p.factions.filter((f) => f.discontent > 45).sort((a, b) => b.discontent - a.discontent)[0];
      if (!hot) return null;
      const other = p.factions.find((f) => f.id !== hot.id && f.leaderId === p.leaderId) ?? p.factions.find((f) => f.id !== hot.id)!;
      return { p: 0.04, build: () => ({
        title: `Disputa interna en ${p.short}`, description: `"${hot.name}" (${fullName(s.characters[hot.leaderId])}) cuestiona el rumbo de la conducción (${fullName(s.characters[other.leaderId])}). Te piden tomar posición.`, actors: [hot.leaderId, other.leaderId],
        requirements: ['Militancia'], benefits: ['Respaldo de la facción que apoyes'], risks: ['Enemistad con la otra facción', 'Si te mantienes al margen, nadie te debe nada'],
        options: [opt('rebeldes', `Apoyar a ${hot.name}`, 'Prestigio ante críticos; choque con la directiva'), opt('directiva', 'Apoyar a la conducción', 'Influencia interna; desconfianza de los críticos'), opt('mediar', 'Proponer una mediación', 'Requiere negociación; puede fracasar'), opt('neutral', 'Mantenerse al margen', 'Sin costos ni ganancias')],
        ctx: { a: hot.id, b: other.id, la: hot.leaderId, lb: other.leaderId },
      }) };
    },
    resolve: (s, rng, o, ch) => {
      const c = P(s); const p = partyOf(s); if (!p) return 'Ya no militas en ese partido.';
      const la = String(o.ctx.la); const lb = String(o.ctx.lb);
      if (ch === 'rebeldes') { relNote(s, la, 14, 'apoyo', 'Apoyó a su facción'); relNote(s, lb, -12, 'traicion', 'Se alineó con los críticos'); c.factionId = String(o.ctx.a); c.rep.confianzaPartido = clamp(c.rep.confianzaPartido - 6, 0, 100); c.rep.credibilidad = clamp(c.rep.credibilidad + 2, 0, 100); return 'Te alineas con los críticos.'; }
      if (ch === 'directiva') { relNote(s, lb, 12, 'apoyo', 'Respaldó a la conducción'); relNote(s, la, -10, 'conflicto', 'Respaldó a la directiva'); c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + 6, 0, 100); return 'Respaldas a la conducción.'; }
      if (ch === 'mediar') {
        if (rng.chance(0.25 + c.attrs.negociacion / 200)) { relNote(s, la, 6, 'colaboracion', 'Mediación'); relNote(s, lb, 6, 'colaboracion', 'Mediación'); const f = p.factions.find((x) => x.id === o.ctx.a); if (f) f.discontent = clamp(f.discontent - 15, 0, 100); c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + 4, 0, 100); progress(s); bio(s, 'decision', `Medias en la disputa de ${p.short}`, 'La mediación prospera.', 1); return 'Tu mediación baja la tensión: ambos sectores lo valoran.'; }
        relNote(s, la, -3, 'conflicto', 'Mediación fallida'); relNote(s, lb, -3, 'conflicto', 'Mediación fallida'); return 'La mediación fracasa y ambos sectores desconfían.';
      }
      return 'Te mantienes al margen.';
    },
    onExpire: 'neutral',
  },
  {
    kind: 'directiva_local', cooldown: 104,
    generate: (s) => {
      const c = P(s); if (!c.partyId || hasOffice(c, 'dirigente_territorial') || hasOffice(c, 'presidente_partido') || minorRoleBlocked(c, 'dirigente_territorial')) return null;
      return { p: 0.012 + c.rep.confianzaPartido / 8000, build: () => ({
        title: `Elección de la directiva de ${s.parties[c.partyId!].short} en ${COMUNA_BY_CUT[homeCut(s)].name}`, description: 'Se renueva la directiva local del partido. Puedes competir por la presidencia comunal.', actors: [],
        requirements: ['Militancia activa'], benefits: ['Cargo interno: influencia partidaria y organización'], risks: ['Una derrota interna te debilita frente a la militancia'],
        options: [opt('competir', 'Competir', 'Resultado según tu arraigo, confianza partidaria y facciones'), opt('apoyar', 'Apoyar a otra persona', 'Gana una aliada/o'), opt('ignorar', 'No participar', '')], ctx: {},
      }) };
    },
    resolve: (s, rng, _o, ch) => {
      const c = P(s);
      if (ch === 'competir') {
        const cap = capitalOf(s);
        const pWin = clamp(0.15 + cap.territorial / 200 + cap.partyInfluence / 250 + cap.factionSupport / 300, 0.05, 0.9);
        if (rng.chance(pWin)) { c.offices.push({ type: 'dirigente_territorial', regionId: c.regionId, comuna: c.comuna, partyId: c.partyId!, since: s.week }); c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + 8, 0, 100); bio(s, 'cargo', 'Presidente/a comunal del partido', COMUNA_BY_CUT[homeCut(s)].name, 1); progress(s); return '¡Ganas la directiva comunal!'; }
        c.rep.confianzaPartido = clamp(c.rep.confianzaPartido - 3, 0, 100); bio(s, 'decision', 'Pierdes la elección de directiva comunal', '', -1); return 'Pierdes la elección interna local.';
      }
      if (ch === 'apoyar') { c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + 2, 0, 100); return 'Apoyas a otra candidatura; suma una aliada/o.'; }
      return 'No participas.';
    },
    onExpire: 'ignorar',
  },
  {
    kind: 'faccion_busca_figura', cooldown: 104,
    generate: (s, rng) => {
      const c = P(s); const p = partyOf(s); if (!p) return null;
      const f = p.factions.find((x) => x.leaderId !== c.id && ideoDistance(x.ideology, c.ideology) < 0.25 && x.discontent > 35);
      if (!f) return null;
      const cap = capitalOf(s);
      return { p: 0.004 + cap.recognition / 6000 + cap.popularity / 10000, build: () => ({
        title: `"${f.name}" busca una nueva figura`, description: `El sector de ${fullName(s.characters[f.leaderId])} quiere renovar su liderazgo y te ofrece encabezarlo de cara a la próxima interna.`, actors: [f.leaderId],
        requirements: ['Afinidad ideológica con el sector'], benefits: ['Liderazgo de una facción: respaldo interno organizado', 'Plataforma para competir por la presidencia del partido'], risks: ['Choque con la conducción actual', 'Te exigirá defender las posiciones del sector'],
        options: [opt('aceptar', 'Encabezar el sector', 'Liderazgo faccional'), opt('alianza', 'Aliarme sin encabezarlo', 'Respaldo moderado'), opt('rechazar', 'Rechazar', '')], ctx: { faction: f.id, leader: f.leaderId },
      }) };
      void rng;
    },
    resolve: (s, _rng, o, ch) => {
      const c = P(s); const p = partyOf(s); const f = p?.factions.find((x) => x.id === o.ctx.faction);
      if (!p || !f) return 'La oportunidad ya no existe.';
      if (ch === 'aceptar') { const old = f.leaderId; f.leaderId = c.id; c.factionId = f.id; relNote(s, old, 5, 'acuerdo_cumplido', 'Le cedió el liderazgo'); const lead = p.leaderId ? s.characters[p.leaderId] : null; if (lead) relNote(s, lead.id, -8, 'conflicto', 'Encabeza un sector crítico'); bio(s, 'cargo', `Líder del sector "${f.name}" en ${p.short}`, '', 1); progress(s); return `Encabezas "${f.name}".`; }
      if (ch === 'alianza') { c.factionId = f.id; relNote(s, f.leaderId, 8, 'apoyo', 'Alianza con su sector'); return 'Te alías con el sector.'; }
      return 'Rechazas la propuesta.';
    },
    onExpire: 'rechazar',
  },
  {
    kind: 'respaldo_figura', cooldown: 70,
    generate: (s, rng) => {
      const c = P(s);
      const open = s.career.processes.find((p) => (p.status === 'abierto' || p.status === 'preseleccion') && p.aspirants.some((a) => a.charId === c.id && (a.status === 'aspirante' || a.status === 'propuesto')));
      if (!open) return null;
      return { p: 0.06, build: () => {
        const f = notable(s, rng, (x) => x.partyId === c.partyId && x.rep.reconocimiento > 50 && !open.aspirants.some((a) => a.charId === x.id));
        if (!f) return null;
        return { title: `${fullName(f)} ofrece respaldarte`, description: `Una figura nacional de tu partido ofrece su apoyo en la selección de ${open.unitLabel}, a cambio de tu voto y trabajo en su propia apuesta interna.`, actors: [f.id],
          requirements: ['Estar compitiendo en un proceso'], benefits: ['Respaldo de peso en la nominación'], risks: ['Compromiso futuro exigible', 'Te asocia a su sector'],
          options: [opt('aceptar', 'Aceptar el respaldo y el compromiso', ''), opt('negociar', 'Aceptar sin compromisos explícitos', 'Puede retirarse'), opt('rechazar', 'Rechazar', 'Mantienes independencia')], ctx: { fig: f.id, proc: open.id } };
      } };
    },
    resolve: (s, rng, o, ch) => {
      const p = s.career.processes.find((x) => x.id === o.ctx.proc); const f = s.characters[String(o.ctx.fig)];
      const mine = p?.aspirants.find((a) => a.charId === s.player.characterId);
      if (!p || !f || !mine) return 'La oportunidad ya no existe.';
      if (ch === 'rechazar') { relNote(s, f.id, -4, 'conflicto', 'Rechazó su respaldo'); return 'Prefieres competir sin padrinos.'; }
      if (ch === 'negociar' && !rng.chance(0.45)) { relNote(s, f.id, -3, 'conflicto', 'No quiso comprometerse'); return `${fullName(f)} retira la oferta.`; }
      mine.backers.push(f.id);
      if (ch === 'aceptar') s.career.commitments.push({ id: newId(s, 'cm'), toCharId: f.id, kind: 'apoyo_interno', createdWeek: s.week, dueWeek: s.week + 104, description: `Apoyar a ${fullName(f)} en su próxima disputa interna`, status: 'vigente' });
      relNote(s, f.id, 10, 'apoyo', `Lo/la respalda en ${p.unitLabel}`);
      return `${fullName(f)} te respalda en el proceso.`;
    },
    onExpire: 'rechazar',
  },
  {
    kind: 'candidatura_vacante', cooldown: 52,
    generate: (s, _rng) => {
      const c = P(s); if (!c.partyId) return null;
      const p = s.career.processes.find((x) => x.status === 'resuelto' && x.partyId === c.partyId && x.aspirants.some((a) => a.charId === c.id) && !x.aspirants.some((a) => a.charId === c.id && a.status === 'nominado') && s.calendar.some((e) => e.id === x.electionId && !e.done && e.week - s.week > 13));
      if (!p) return null;
      return { p: 0.025, build: () => {
        const nom = p.aspirants.find((a) => a.status === 'nominado' && a.charId !== c.id);
        if (!nom) return null;
        return { title: `Se abre la candidatura en ${p.unitLabel}`, description: `${fullName(s.characters[nom.charId])} renunció a su candidatura (motivos personales). La directiva busca reemplazo con urgencia y tu nombre está en la lista.`, actors: [nom.charId],
          requirements: ['Haber competido en el proceso', 'Disponibilidad inmediata'], benefits: ['Candidatura sin nueva competencia interna'], risks: ['Campaña corta y con menos recursos', 'Algunos sectores te verán como segunda opción'],
          options: [opt('aceptar', 'Aceptar la candidatura', ''), opt('negociar', 'Aceptar si el partido aporta recursos', 'Puede aceptar o elegir a otra persona'), opt('rechazar', 'Rechazar', '')], ctx: { proc: p.id, out: nom.charId } };
      } };
    },
    resolve: (s, rng, o, ch) => {
      const p = s.career.processes.find((x) => x.id === o.ctx.proc); if (!p) return 'Ya no está disponible.';
      if (ch === 'rechazar') return 'Rechazas la candidatura.';
      if (ch === 'negociar' && rng.chance(0.4)) return 'La directiva prefiere a otra persona que no ponga condiciones.';
      const out = p.aspirants.find((a) => a.charId === o.ctx.out); if (out) out.status = 'retirado';
      const mine = p.aspirants.find((a) => a.charId === s.player.characterId); if (mine) mine.status = 'nominado';
      grantNomination(s, p.electionId, p.office, p.unitId, p.partyId);
      if (ch === 'negociar') s.player.personalFunds += 20;
      return `Eres candidato/a en ${p.unitLabel}.`;
    },
    onExpire: 'rechazar',
  },
  {
    kind: 'cupo_independiente', cooldown: 80,
    generate: (s, _rng) => {
      const c = P(s); if (c.partyId) return null;
      const e = s.calendar.find((x) => !x.done && x.type === 'diputados' && x.week - s.week > 16 && x.week - s.week < 40);
      if (!e || ageOf(s, c) < 21) return null;
      const cap = capitalOf(s);
      return { p: 0.01 + cap.territorial / 3000 + cap.recognition / 4000, build: () => {
        const parties = Object.values(s.parties).filter((p) => p.active && p.legalStatus !== 'en_formacion').sort((a, b) => ideoDistance(a.ideology, c.ideology) - ideoDistance(b.ideology, c.ideology));
        const party = parties[0]; if (!party) return null;
        const dist = COMUNA_BY_CUT[homeCut(s)].district;
        return { title: `${party.short} te ofrece un cupo como independiente`, description: `La lista de ${party.short} necesita una figura independiente con arraigo en el Distrito ${dist}.`, actors: party.leaderId ? [party.leaderId] : [],
          requirements: ['Ser independiente', 'Edad mínima 21 años', 'Residencia en la región'], benefits: ['Candidatura a diputado/a sin militar'], risks: ['Te identificarán con el partido', 'Expectativa de votar con su bancada'],
          options: [opt('aceptar', 'Aceptar el cupo', ''), opt('rechazar', 'Rechazar', 'Conservas tu independencia')], ctx: { party: party.id, election: e.id, dist } };
      } };
    },
    resolve: (s, _rng, o, ch) => {
      if (ch !== 'aceptar') return 'Rechazas el cupo.';
      grantNomination(s, String(o.ctx.election), 'diputado', String(o.ctx.dist), String(o.ctx.party));
      const l = s.parties[String(o.ctx.party)]?.leaderId; if (l) relNote(s, l, 8, 'acuerdo_cumplido', 'Aceptó cupo independiente');
      return 'Serás candidato/a independiente en cupo del partido.';
    },
    onExpire: 'rechazar',
  },
  {
    kind: 'cortejo_partido', cooldown: 104,
    generate: (s, _rng) => {
      const c = P(s); const p = partyOf(s); if (!p) return null;
      const unhappy = c.rep.confianzaPartido < 35 || ideoDistance(c.ideology, p.ideology) > 0.3;
      if (!unhappy || c.rep.reconocimiento < 15) return null;
      return { p: 0.02, build: () => {
        const other = Object.values(s.parties).filter((x) => x.active && x.id !== p.id && x.legalStatus !== 'en_formacion').sort((a, b) => ideoDistance(a.ideology, c.ideology) - ideoDistance(b.ideology, c.ideology))[0];
        if (!other) return null;
        return { title: `${other.short} te invita a sumarte`, description: `La dirigencia de ${other.name} te ofrece un espacio de relevancia si dejas ${p.short}.`, actors: other.leaderId ? [other.leaderId] : [],
          requirements: ['Renunciar a tu partido actual'], benefits: ['Espacio inmediato y respaldo de la nueva directiva', 'Posiciones más afines'], risks: ['Antiguos aliados lo verán como traición', 'Electores leales a tu partido pueden castigarte'],
          options: [opt('aceptar', `Cambiarme a ${other.short}`, ''), opt('rechazar', `Quedarme en ${p.short}`, 'Algo de lealtad recuperada')], ctx: { to: other.id } };
      } };
    },
    resolve: (s, rng, o, ch) => {
      const c = P(s);
      if (ch !== 'aceptar') { c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + 4, 0, 100); return 'Te quedas en tu partido.'; }
      const from = c.partyId; leaveParty(s, rng, c);
      const to = s.parties[String(o.ctx.to)]; c.partyId = to.id; c.factionId = to.factions[0]?.id ?? null; c.rep.confianzaPartido = 55;
      if (!s.career.stats.parties.includes(to.id)) s.career.stats.parties.push(to.id);
      for (const [id, v] of Object.entries(c.relations)) if (v > 20 && s.characters[id]?.partyId === from) relNote(s, id, -15, 'traicion', 'Se cambió de partido');
      s.career.capital.rejection = clamp(s.career.capital.rejection + 4, 0, 100);
      bio(s, 'partido', `Te cambias de ${from ? s.parties[from]?.short : '—'} a ${to.short}`, '', 0); progress(s);
      first(s, 'cambio_partido', `De ${from ? s.parties[from]?.short : '—'} a ${to.short}`);
      return `Ahora militas en ${to.name}.`;
    },
    onExpire: 'rechazar',
  },
  // ------------------------------------------------------------------ fase inicial (base social)
  {
    kind: 'invitacion_partido', cooldown: 60,
    generate: (s) => {
      const c = P(s); if (c.partyId) return null;
      const cap = capitalOf(s); if (cap.territorial < 12) return null;
      return { p: 0.012 + cap.territorial / 2500, build: () => {
        const party = Object.values(s.parties).filter((p) => p.active && p.legalStatus !== 'en_formacion').sort((a, b) => ideoDistance(a.ideology, c.ideology) - ideoDistance(b.ideology, c.ideology))[0];
        if (!party) return null;
        const local = Object.values(s.characters).find((x) => x.status === 'activo' && x.partyId === party.id && x.regionId === c.regionId && x.offices.some((o) => ['alcalde', 'concejal', 'diputado', 'dirigente_territorial'].includes(o.type)));
        return { title: `${party.short} quiere sumarte a sus filas`, description: `${local ? fullName(local) : 'La dirigencia local'} (${party.short}) valora tu trabajo en ${COMUNA_BY_CUT[homeCut(s)].name} y te invita a militar.`, actors: local ? [local.id] : [],
          requirements: ['Afinidad ideológica'], benefits: ['Base orgánica para aspirar a candidaturas', 'Aliados en el partido'], risks: ['Perder la imagen de independencia', 'Te identificarán con las decisiones del partido'],
          options: [opt('afiliarse', `Afiliarme a ${party.short}`, 'Militancia de base'), opt('colaborar', 'Colaborar sin militar', 'Relación, sin compromiso orgánico'), opt('rechazar', 'Agradecer y declinar', '')], ctx: { party: party.id, local: local?.id ?? '' } };
      } };
    },
    resolve: (s, _rng, o, ch) => {
      const c = P(s); const party = s.parties[String(o.ctx.party)]; const local = String(o.ctx.local);
      if (ch === 'afiliarse' && party?.active) {
        c.partyId = party.id; c.factionId = party.factions.find((f) => ideoDistance(f.ideology, c.ideology) < 0.25)?.id ?? party.factions[0]?.id ?? null; c.rep.confianzaPartido = 45;
        if (!s.career.stats.parties.includes(party.id)) s.career.stats.parties.push(party.id);
        if (local) relNote(s, local, 10, 'apoyo', 'Lo/la reclutó para el partido');
        c.rep.credibilidad = clamp(c.rep.credibilidad - 2, 0, 100);
        bio(s, 'partido', `Te afilias a ${party.short}`, 'Desde tu trabajo comunitario.', 1); progress(s);
        first(s, 'partido', party.name);
        return `Ahora militas en ${party.name}.`;
      }
      if (ch === 'colaborar') { if (local) relNote(s, local, 5, 'colaboracion', 'Colabora sin militar'); return 'Colaborarás desde fuera.'; }
      if (local) relNote(s, local, -2, 'conflicto', 'Declinó militar');
      return 'Mantienes tu independencia.';
    },
    onExpire: 'rechazar',
  },
  {
    kind: 'causa_ciudadana', cooldown: 26,
    generate: (s) => {
      const c = P(s); if (c.offices.some((o) => ['ministro', 'subsecretario', 'seremi', 'presidente'].includes(o.type))) return null;
      return { p: 0.03, build: () => {
        const areas = s.career.origin.interests.length ? s.career.origin.interests : (['vivienda', 'seguridad', 'salud', 'educacion'] as const);
        const area = areas[Math.floor((s.week / 7) % areas.length)];
        return { title: `Movilización ciudadana por ${AREA_LABELS[area].toLowerCase()} en ${COMUNA_BY_CUT[homeCut(s)].name}`, description: 'Un grupo de vecinos y organizaciones convoca a una campaña local. Buscan voces que la lideren y la lleven a las autoridades.', actors: [],
          requirements: [], benefits: ['Arraigo y capacidad organizativa', 'Reconocimiento local'], risks: ['Liderar expone: el rechazo puede subir', 'Si tu partido gobierna, puede incomodar'],
          options: [opt('liderar', 'Ponerme al frente', 'Más arraigo y visibilidad, más exposición'), opt('sumarse', 'Sumarme como uno/a más', 'Algo de arraigo, sin riesgo'), opt('rechazar', 'No participar', '')], ctx: { area } };
      } };
    },
    resolve: (s, rng, _o, ch) => {
      const c = P(s); const home = homeCut(s);
      if (ch === 'liderar') {
        const ok = rng.chance(0.35 + c.attrs.liderazgo / 200 + c.attrs.oratoria / 300);
        addTerritory(s, [home], ok ? 7 : 3); s.career.capital.organization = clamp(s.career.capital.organization + 4, 0, 100);
        c.rep.reconocimientoRegional[c.regionId] = clamp((c.rep.reconocimientoRegional[c.regionId] ?? 0) + 3, 0, 100);
        s.career.capital.rejection = clamp(s.career.capital.rejection + (ok ? 1 : 3), 0, 100);
        const gov = c.partyId && coalitionMembers(s).includes(c.partyId); if (gov) c.rep.confianzaPartido = clamp(c.rep.confianzaPartido - 3, 0, 100);
        if (ok) progress(s);
        return ok ? 'La movilización logra un compromiso de las autoridades: tu figura crece en la comuna.' : 'La campaña no logra su objetivo, pero te conocen más.';
      }
      if (ch === 'sumarse') { addTerritory(s, [home], 2); return 'Participas y amplías tus contactos locales.'; }
      return 'Te mantienes al margen.';
    },
    onExpire: 'rechazar',
  },
  {
    kind: 'medio_local', cooldown: 70,
    generate: (s) => {
      const c = P(s); if (c.rep.reconocimiento > 40) return null;
      return { p: 0.01 + c.attrs.comunicacion / 6000 + capitalOf(s).territorial / 6000, build: () => ({
        title: 'Una radio comunitaria te ofrece un espacio semanal', description: `Un medio local de ${COMUNA_BY_CUT[homeCut(s)].name} (ficticio) te propone un segmento de opinión.`, actors: [],
        requirements: ['Capacidad de comunicación'], benefits: ['Reconocimiento regional', 'Práctica de oratoria'], risks: ['Cada opinión queda grabada'],
        options: [opt('aceptar', 'Aceptar', 'Visibilidad sostenida'), opt('rechazar', 'Rechazar', '')], ctx: {},
      }) };
    },
    resolve: (s, rng, _o, ch) => {
      const c = P(s); if (ch !== 'aceptar') return 'Declinas.';
      c.rep.reconocimientoRegional[c.regionId] = clamp((c.rep.reconocimientoRegional[c.regionId] ?? 0) + 6, 0, 100);
      c.rep.reconocimiento = clamp(c.rep.reconocimiento + 2, 0, 100); c.attrs.oratoria = clamp(c.attrs.oratoria + 1, 0, 100); addTerritory(s, [homeCut(s)], 2);
      if (rng.chance(0.15)) { c.rep.credibilidad = clamp(c.rep.credibilidad - 3, 0, 100); return 'Un comentario tuyo genera polémica en la comuna.'; }
      return 'Tu espacio radial gana auditores.';
    },
    onExpire: 'rechazar',
  },
  {
    kind: 'cupo_concejal', cooldown: 80,
    generate: (s) => {
      const c = P(s); if (c.partyId || c.offices.some((o) => PUBLIC_OFFICES.includes(o.type))) return null;
      const e = s.calendar.find((x) => !x.done && x.type === 'concejales' && x.week - s.week > 16 && x.week - s.week < 45);
      const cap = capitalOf(s); if (!e || cap.territorial < 15) return null;
      if (s.player.candidacies.some((k) => s.calendar.find((x) => x.id === k.electionId)?.week === e.week)) return null;
      return { p: 0.02 + cap.territorial / 2000, build: () => {
        const party = Object.values(s.parties).filter((p) => p.active && p.legalStatus !== 'en_formacion').sort((a, b) => ideoDistance(a.ideology, c.ideology) - ideoDistance(b.ideology, c.ideology))[0];
        if (!party) return null;
        return { title: `${party.short} te ofrece ir como independiente a concejal/a`, description: `Su lista de concejales en ${COMUNA_BY_CUT[homeCut(s)].name} busca figuras con arraigo vecinal.`, actors: party.leaderId ? [party.leaderId] : [],
          requirements: ['Ser independiente', 'Residir en la comuna'], benefits: ['Candidatura sin militar', 'Primer cargo de elección posible'], risks: ['Te asociarán al partido', 'Competencia dentro de la lista (D\'Hondt)'],
          options: [opt('aceptar', 'Aceptar el cupo', ''), opt('rechazar', 'Rechazar', '')], ctx: { party: party.id, election: e.id } };
      } };
    },
    resolve: (s, _rng, o, ch) => {
      if (ch !== 'aceptar') return 'Rechazas el cupo.';
      grantNomination(s, String(o.ctx.election), 'concejal', String(homeCut(s)), String(o.ctx.party));
      const l = s.parties[String(o.ctx.party)]?.leaderId; if (l) relNote(s, l, 5, 'acuerdo_cumplido', 'Aceptó cupo independiente');
      return 'Serás candidato/a a concejal/a como independiente en cupo del partido.';
    },
    onExpire: 'rechazar',
  },
  // ------------------------------------------------------------------ designaciones
  {
    kind: 'designacion', cooldown: 78,
    // Las designaciones surgen ahora de situaciones latentes con competencia real (latent.ts)
    generate: (s, rng) => { if (s.week >= 0) return null;
      const c = P(s); if (!c.partyId || !coalitionMembers(s).includes(c.partyId) || !isFree(c) || s.government.presidentId === c.id) return null;
      if (c.offices.some((o) => ['diputado', 'senador', 'gobernador', 'alcalde'].includes(o.type))) return null;
      const cap = capitalOf(s);
      if (ageOf(s, c) < 25 || cap.experience < 35 || cap.prestige < 35) return null;
      return { p: 0.003 + cap.prestige / 6000 + cap.partyInfluence / 9000, build: () => {
        const level: OfficeType = cap.prestige > 65 && cap.recognition > 35 && cap.experience > 45 && ageOf(s, c) >= 28 ? 'subsecretario' : 'seremi';
        const m = MINISTRIES.find((x) => s.career.origin.interests.includes(x.area)) ?? rng.pick(MINISTRIES);
        return { title: `El gobierno te considera para ${level === 'seremi' ? 'Seremi' : 'Subsecretario/a'} de ${m.name}`, description: `${level === 'seremi' ? `Secretaría regional en ${REGION_BY_ID[c.regionId].name}` : 'Cargo de confianza en el nivel central'}. Es una designación: no requiere elección, pero te ata al desempeño del gobierno.`,
          actors: [s.government.presidentId], requirements: ['Partido en la coalición de gobierno', 'Prestigio técnico'], benefits: ['Experiencia de gestión y prestigio', 'Visibilidad sectorial'], risks: ['Inhabilidad para competir mientras ejerzas', 'Desgaste si el gobierno es impopular'],
          options: [opt('aceptar', 'Aceptar', ''), opt('rechazar', 'Rechazar', 'El gobierno puede no volver a llamarte pronto')], ctx: { level, ministry: m.id } };
      } };
    },
    resolve: (s, _rng, o, ch) => {
      const c = P(s);
      if (ch !== 'aceptar') { relNote(s, s.government.presidentId, -3, 'conflicto', 'Rechazó una designación'); return 'Rechazas la designación.'; }
      const level = o.ctx.level as OfficeType;
      removeOffice(s, c, 'asesor', 'designación');
      c.offices.push({ type: level, ministryId: String(o.ctx.ministry), regionId: c.regionId, since: s.week });
      c.rep.prestigioTecnico = clamp(c.rep.prestigioTecnico + 5, 0, 100); c.rep.reconocimiento = clamp(c.rep.reconocimiento + (level === 'seremi' ? 4 : 8), 0, 100);
      bio(s, 'cargo', `${level === 'seremi' ? 'Seremi' : 'Subsecretario/a'} de ${MINISTRY_BY_ID[String(o.ctx.ministry)].name}`, '', 1); progress(s);
      return 'Asumes el cargo de designación.';
    },
    onExpire: 'rechazar',
  },
  {
    kind: 'ministerio', cooldown: 104,
    generate: (s) => { if (s.week >= 0) return null;
      const c = P(s); if (!c.partyId || !coalitionMembers(s).includes(c.partyId) || hasOffice(c, 'ministro') || s.government.presidentId === c.id) return null;
      const cap = capitalOf(s);
      // Un ministerio exige trayectoria: edad, experiencia y un cargo previo relevante o gran prestigio técnico
      if (ageOf(s, c) < 30 || cap.experience < 50 || (cap.prestige < 50 && cap.recognition < 55)) return null;
      const peak = Math.max(...[...c.offices.map((o) => o.type), ...c.pastOffices.map((o) => o.type)].map((t) => officeRank(t)), 0);
      if (peak < 4 && cap.prestige < 70) return null;
      return { p: 0.004 + (hasOffice(c, 'subsecretario') ? 0.01 : 0) + cap.prestige / 8000, build: () => {
        const m = MINISTRIES.find((x) => x.area === c.specialty) ?? MINISTRIES.find((x) => s.career.origin.interests.includes(x.area)) ?? MINISTRIES[7];
        return { title: `El Presidente te ofrece el Ministerio de ${m.name}`, description: `Asumir implica dejar cualquier cargo de elección (incompatibilidad) y quedar ligado/a al gobierno.`, actors: [s.government.presidentId],
          requirements: ['Partido oficialista', 'Prestigio o reconocimiento'], benefits: ['Cargo de primer nivel', 'Agenda sectorial propia'], risks: ['Crisis sectoriales y acusaciones constitucionales', 'Inhabilidad electoral mientras ejerzas'],
          options: [opt('aceptar', 'Aceptar', ''), opt('rechazar', 'Rechazar con cortesía', '')], ctx: { ministry: m.id } };
      } };
    },
    resolve: (s, rng, o, ch) => {
      if (ch !== 'aceptar') { relNote(s, s.government.presidentId, -5, 'conflicto', 'Rechazó un ministerio'); return 'Declinas.'; }
      const c = P(s); for (const t of ['asesor', 'seremi', 'subsecretario'] as OfficeType[]) removeOffice(s, c, t, 'asume ministerio');
      const msg = appointMinister(s, rng, String(o.ctx.ministry), c.id);
      bio(s, 'cargo', `Ministro/a de ${MINISTRY_BY_ID[String(o.ctx.ministry)].name}`, '', 1); progress(s);
      return msg;
    },
    onExpire: 'rechazar',
  },
  // ------------------------------------------------------------------ visibilidad y reinvención
  {
    kind: 'foco_mediatico', cooldown: 40,
    generate: (s) => {
      const c = P(s); const st = stagnationWeeks(s);
      return { p: 0.006 + c.attrs.comunicacion / 15000 + (st > 70 ? 0.008 : 0), build: () => ({
        title: 'Un programa político de alta audiencia te invita', description: 'Un panel de debate nacional busca voces nuevas. Es una vitrina, pero también una trampa: un tema divide a tu sector.', actors: [],
        requirements: ['Capacidad de comunicación'], benefits: ['Reconocimiento nacional'], risks: ['Un error puede viralizarse', 'Tomar posición genera rechazo en algunos'],
        options: [opt('confrontar', 'Ir con un discurso confrontacional', 'Más visibilidad y más rechazo'), opt('moderado', 'Ir con un tono moderado', 'Menos impacto, menos riesgo'), opt('rechazar', 'No ir', '')], ctx: {},
      }) };
    },
    resolve: (s, rng, _o, ch) => {
      const c = P(s);
      if (ch === 'rechazar') return 'No asistes.';
      const skill = (c.attrs.comunicacion + c.attrs.oratoria) / 200 + rng.normal(0, 0.15);
      const big = ch === 'confrontar';
      if (skill > 0.45) { c.rep.reconocimiento = clamp(c.rep.reconocimiento + (big ? 7 : 4), 0, 100); c.rep.popularidad = clamp(c.rep.popularidad + (big ? 1 : 3), 0, 100); if (big) s.career.capital.rejection = clamp(s.career.capital.rejection + 5, 0, 100); progress(s); bio(s, 'decision', 'Destacas en un debate televisado', '', 1); return 'Tu participación es comentada positivamente.'; }
      c.rep.popularidad = clamp(c.rep.popularidad - (big ? 5 : 2), 0, 100); s.career.capital.rejection = clamp(s.career.capital.rejection + (big ? 4 : 1), 0, 100); return 'Una frase tuya se vuelve tendencia… por las razones equivocadas.';
    },
    onExpire: 'rechazar',
  },
  {
    kind: 'conflicto_local', cooldown: 30,
    generate: (s) => {
      const st = s.comunas[homeCut(s)]; if (!st || st.discontent < 35) return null;
      return { p: 0.035, build: () => ({
        title: `Conflicto vecinal en ${COMUNA_BY_CUT[homeCut(s)].name}`, description: 'Un conflicto por un proyecto (antena, relleno, vivienda) moviliza a vecinos. Te piden ponerte al frente o mediar con las autoridades.', actors: [],
        requirements: [], benefits: ['Capital territorial y credibilidad local'], risks: ['Enfrentamiento con autoridades o con tu propio partido si gobierna'],
        options: [opt('liderar', 'Liderar la movilización', 'Más arraigo; posible costo con autoridades'), opt('mediar', 'Mediar', 'Depende de tu negociación'), opt('ignorar', 'No involucrarte', '')], ctx: {},
      }) };
    },
    resolve: (s, rng, _o, ch) => {
      const c = P(s); const cut = homeCut(s);
      if (ch === 'liderar') { addTerritory(s, [cut], 9); s.career.capital.organization = clamp(s.career.capital.organization + 4, 0, 100); if (c.partyId && coalitionMembers(s).includes(c.partyId)) c.rep.confianzaPartido = clamp(c.rep.confianzaPartido - 3, 0, 100); progress(s); return 'Encabezas la movilización: los vecinos te reconocen.'; }
      if (ch === 'mediar') { if (rng.chance(0.3 + c.attrs.negociacion / 160)) { addTerritory(s, [cut], 6); c.rep.credibilidad = clamp(c.rep.credibilidad + 3, 0, 100); s.comunas[cut].discontent -= 5; return 'Logras un acuerdo razonable.'; } return 'La mediación no prospera.'; }
      return 'Te mantienes al margen.';
    },
    onExpire: 'ignorar',
  },
  {
    kind: 'think_tank', cooldown: 90,
    generate: (s) => {
      const c = P(s); if (c.rep.prestigioTecnico < 30 && c.attrs.tecnico < 55) return null;
      return { p: 0.008 + (stagnationWeeks(s) > 52 ? 0.01 : 0), build: () => ({
        title: 'Un centro de estudios te propone coordinar una propuesta', description: 'Te invitan a liderar un documento de políticas públicas que será presentado a partidos y candidaturas.', actors: [],
        requirements: ['Conocimiento técnico'], benefits: ['Prestigio técnico', 'Contactos transversales'], risks: ['Tiempo lejos del territorio'],
        options: [opt('aceptar', 'Aceptar', ''), opt('rechazar', 'Rechazar', '')], ctx: {},
      }) };
    },
    resolve: (s, _rng, _o, ch) => {
      if (ch !== 'aceptar') return 'Declinas.';
      const c = P(s); c.rep.prestigioTecnico = clamp(c.rep.prestigioTecnico + 8, 0, 100); c.attrs.tecnico = clamp(c.attrs.tecnico + 2, 0, 100); c.attrs.redes = clamp(c.attrs.redes + 1, 0, 100);
      bio(s, 'decision', 'Coordinas una propuesta de políticas públicas', '', 1); progress(s);
      return 'Publicas una propuesta bien recibida en círculos técnicos.';
    },
    onExpire: 'rechazar',
  },
  {
    kind: 'aspirar_sugerido', cooldown: 26,
    generate: (s, rng) => {
      const c = P(s); if (!c.partyId) return null;
      const options = s.calendar.filter((e) => NOMINATED[e.type] && !e.done && NOMINATED[e.type] !== 'presidente').map((e) => ({ e, w: electionWindow(s, e.id)! })).filter((x) => s.week >= x.w.open && s.week < x.w.shortlist - 2);
      if (!options.length) return null;
      const cap = capitalOf(s);
      return { p: 0.03 + cap.territorial / 2000, build: () => {
        const x = rng.pick(options); const office = NOMINATED[x.e.type]!;
        const unit = office === 'diputado' ? String(COMUNA_BY_CUT[homeCut(s)].district) : office === 'senador' || office === 'gobernador' ? c.regionId : String(homeCut(s));
        if (aspireBlocked(s, x.e.id, office, unit)) return null;
        return { title: `Dirigentes te animan a competir por ${office} en ${unitLabel(office, unit)}`, description: 'Algunos dirigentes locales creen que tu figura podría ser competitiva. No es una nominación: tendrás que ganarla.', actors: [],
          requirements: [`Edad mínima ${office === 'senador' ? 35 : office === 'diputado' ? 21 : 18}`, 'Residencia', 'Militancia'], benefits: ['Oportunidad de dar un salto'], risks: ['Una derrota interna te deja expuesto/a', 'Rivalidad con otros aspirantes'],
          options: [opt('aspirar', 'Inscribirme como aspirante', ''), opt('esperar', 'Esperar una mejor oportunidad', '')], ctx: { election: x.e.id, office, unit } };
      } };
    },
    resolve: (s, rng, o, ch) => {
      if (ch !== 'aspirar') return 'Decides esperar.';
      const b = aspireBlocked(s, String(o.ctx.election), o.ctx.office as OfficeType, String(o.ctx.unit));
      if (b) return `No es posible: ${b}`;
      return aspire(s, rng, String(o.ctx.election), o.ctx.office as OfficeType, String(o.ctx.unit));
    },
    onExpire: 'esperar',
  },
];

// ---------------------------------------------------------------------------
// Compromisos: los actores cobran sus favores
// ---------------------------------------------------------------------------
function commitmentDemands(s: GameState, rng: Rng): void {
  for (const cm of s.career.commitments) {
    if (cm.status !== 'vigente') continue;
    const t = s.characters[cm.toCharId];
    if (!t || t.status !== 'activo') { cm.status = 'cumplido'; continue; }
    if (s.week > cm.dueWeek) { cm.status = 'cumplido'; continue; }
    if (s.career.opportunities.some((o) => o.ctx.commitment === cm.id)) continue;
    if (!rng.chance(cm.kind === 'apoyo_interno' ? 0.02 : 0.012)) continue;
    const demand = cm.kind === 'lealtad' ? 'te pide respaldo público en una controversia que lo/la afecta' : 'te pide tu apoyo en una disputa interna';
    s.career.opportunities.push({
      id: newId(s, 'op'), kind: 'cobro_compromiso', week: s.week, expiresWeek: s.week + 4, title: `${fullName(t)} cobra tu compromiso`, description: `${fullName(t)} ${demand}. "${cm.description}".`,
      actors: [t.id], requirements: [], benefits: ['Cumplir fortalece la confianza y tu reputación de palabra'], risks: ['Cumplir puede costarte con otros sectores', 'Incumplir es recordado como traición'],
      options: [opt('cumplir', 'Cumplir', 'Costos con otros actores'), opt('negociar', 'Cumplir a medias', 'Satisface parcialmente'), opt('incumplir', 'No cumplir', 'Ruptura')], ctx: { commitment: cm.id },
    });
  }
}

function resolveCommitment(s: GameState, rng: Rng, o: Opportunity, ch: string): string {
  const cm = s.career.commitments.find((x) => x.id === o.ctx.commitment); if (!cm) return '';
  const t = s.characters[cm.toCharId]; const c = P(s);
  if (ch === 'cumplir') {
    cm.status = 'cumplido'; relNote(s, cm.toCharId, 15, 'acuerdo_cumplido', cm.description); c.rep.credibilidad = clamp(c.rep.credibilidad + 2, 0, 100);
    // costo: los rivales de esa figura lo resienten
    for (const [id, v] of Object.entries(t?.relations ?? {})) if (v < -20 && s.characters[id] && !s.characters[id].isPlayer && rng.chance(0.5)) relNote(s, id, -5, 'conflicto', `Apoyó a ${fullName(t)}`);
    bio(s, 'compromiso', `Cumples tu compromiso con ${fullName(t)}`, '', 1);
    return 'Cumples tu palabra.';
  }
  if (ch === 'negociar') { relNote(s, cm.toCharId, 3, 'colaboracion', 'Cumplimiento parcial'); if (rng.chance(0.5)) cm.status = 'cumplido'; return 'Cumples a medias; la relación se mantiene, con reservas.'; }
  cm.status = 'incumplido'; relNote(s, cm.toCharId, -35, 'promesa_incumplida', cm.description); c.rep.credibilidad = clamp(c.rep.credibilidad - 4, 0, 100);
  bio(s, 'compromiso', `Incumples tu compromiso con ${fullName(t)}`, '', -1);
  return 'No cumples: se abre una enemistad.';
}

// ---------------------------------------------------------------------------
// Procesamiento semanal
// ---------------------------------------------------------------------------
export function processOpportunities(s: GameState, rng: Rng, extra: OpportunityDef[] = []): string[] {
  const created: string[] = [];
  if (s.player.careerOver) return created;
  const defs = [...OPPORTUNITIES, ...extra];
  const open = s.career.opportunities.length;
  if (open < 3) {
    for (const d of rng.shuffle([...defs])) {
      if ((s.career.cooldowns[d.kind] ?? 0) > s.week) continue;
      if (s.career.opportunities.some((o) => o.kind === d.kind)) continue;
      const g = d.generate(s, rng); if (!g) continue;
      if (!rng.chance(Math.min(0.9, g.p))) continue;
      const b = g.build(); if (!b) continue;
      const o: Opportunity = { id: newId(s, 'op'), kind: d.kind, week: s.week, expiresWeek: s.week + (b.expires ?? 4), title: b.title, description: b.description, actors: b.actors, requirements: b.requirements, benefits: b.benefits, risks: b.risks, options: b.options, ctx: b.ctx, office: b.office };
      s.career.opportunities.push(o); created.push(o.id);
      s.career.cooldowns[d.kind] = s.week + d.cooldown;
      if (created.length >= 1) break;
    }
  }
  commitmentDemands(s, rng);
  // vencimientos
  for (const o of [...s.career.opportunities]) if (s.week > o.expiresWeek) {
    const d = defs.find((x) => x.kind === o.kind);
    resolveOpportunity(s, rng, o.id, d?.onExpire ?? o.options[o.options.length - 1].id, true, extra);
  }
  return created;
}

export function resolveOpportunity(s: GameState, rng: Rng, id: string, choice: string, expired = false, extra: OpportunityDef[] = []): string {
  const o = s.career.opportunities.find((x) => x.id === id);
  if (!o) return 'La oportunidad ya no está disponible.';
  s.career.opportunities = s.career.opportunities.filter((x) => x.id !== id);
  let msg: string;
  if (o.kind === 'cobro_compromiso') msg = resolveCommitment(s, rng, o, choice);
  else if (LATENT_OFFER_KINDS.has(o.kind)) msg = resolveLatentOffer(s, rng, o, choice);
  else {
    const d = [...OPPORTUNITIES, ...extra].find((x) => x.kind === o.kind);
    msg = d ? d.resolve(s, rng, o, choice) : '';
  }
  const label = o.options.find((x) => x.id === choice)?.label ?? choice;
  const accepted = !['rechazar', 'ignorar', 'esperar', 'neutral', 'incumplir'].includes(choice);
  if (o.kind !== 'cobro_compromiso' && !o.office) { if (accepted) s.career.stats.oppAccepted += 1; else s.career.stats.oppRejected += 1; }
  bio(s, o.office ? 'decision' : 'oportunidad', o.title, `${expired ? 'Sin respuesta a tiempo: ' : ''}${label}. ${msg}`, 0);
  s.player.lastActionResults.push(`${expired ? '⏱ ' : ''}${o.title}: ${msg}`);
  void addNews; void addRelation; void partyInfluenceOf; void candidateQuality; void listIdOf;
  return msg;
}
