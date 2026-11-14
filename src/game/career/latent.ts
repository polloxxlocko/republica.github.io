/**
 * SITUACIONES LATENTES (18.3–18.5).
 *
 * El mundo genera situaciones que existen aunque el jugador no las conozca: una figura que necesita
 * armar equipo, un parlamentario que evalúa no repostular, un escaño vacante que el partido debe
 * llenar (art. 51 CPR), un gobierno que busca perfiles nuevos, una crisis de liderazgo.
 *
 * Cada situación tiene un actor que decide, una ventana temporal y una probabilidad de concretarse
 * (fijada en secreto al nacer). Al vencer la ventana, el actor evalúa a TODOS los candidatos
 * plausibles —personajes de IA y, si cumple los requisitos legales, el jugador— según su memoria,
 * su afinidad y la idoneidad de cada uno. Nada está predeterminado: la relación puede cambiar
 * mientras tanto, el actor puede perder su cargo o retirarse, y la situación puede disiparse.
 *
 * El jugador solo se entera:
 *   - por rumores, si tiene contactos cercanos al actor (con error y posibles fuentes interesadas);
 *   - por una oferta concreta, si resulta elegido/a;
 *   - por información pública, cuando el desenlace es visible (nombramientos, designaciones).
 */
import type { Character, GameState, LatentSituation, Opportunity, OfficeType, Seat } from '../models/types';
import { Rng } from '../engine/rng';
import { clamp } from '../rules/params';
import { MINISTRY_BY_ID } from '../data/institutions';
import { ageOf, candidateQuality, fullName, memoryBalance, officeLabel, remember, removeOffice, retire } from '../systems/characters';
import { appointMinister, coalitionMembers } from '../systems/government';
import { listIdOf } from '../systems/elections';
import { newId } from '../systems/util';
import { addNews } from '../systems/news';
import { bio, first, me, minorRoleBlocked, officeRank, partyInfluenceOf, progress } from './capital';
import { OPEN_WEEKS } from './nominations';
import { informants, knowledgeLevel, pushIntel, reliabilityOf, sourceQuality, verifyIntel } from './knowledge';

const ELECTED: OfficeType[] = ['diputado', 'senador', 'alcalde', 'concejal', 'gobernador'];
const DESIGNATED: OfficeType[] = ['ministro', 'subsecretario', 'seremi'];

function active(s: GameState): LatentSituation[] { return s.career.latent.filter((l) => l.status === 'latente'); }

function create(s: GameState, rng: Rng, l: Omit<LatentSituation, 'id' | 'week' | 'status' | 'knownToPlayer' | 'ctx'> & { ctx?: LatentSituation['ctx'] }, pMaterialize: number): LatentSituation {
  const x: LatentSituation = { ...l, id: newId(s, 'lt'), week: s.week, status: 'latente', knownToPlayer: false, ctx: { ...(l.ctx ?? {}), roll: rng.next(), p: pMaterialize } } as LatentSituation;
  s.career.latent.push(x);
  return x;
}

/** ¿El jugador está legalmente habilitado para un cargo de designación o un escaño? */
function playerEligible(s: GameState, office: OfficeType): boolean {
  const c = me(s);
  const age = ageOf(s, c);
  if (office === 'senador') return age >= 35;
  if (office === 'diputado' || office === 'ministro' || office === 'subsecretario') return age >= 21; // CPR arts. 48 y 34
  return age >= 18;
}

/** Puntaje con que un actor evalúa a un candidato: memoria + idoneidad + ruido (privado). */
function appraise(s: GameState, actor: Character, c: Character, rng: Rng, weights: { mem: number; tec: number; rec: number; terr?: number; infl?: number; exp?: number }): number {
  const terr = c.isPlayer ? (weights.terr ?? 0) * Math.max(...Object.values(s.career.capital.territory), 0) : (weights.terr ?? 0) * (c.rep.reconocimientoRegional[c.regionId] ?? 0);
  return memoryBalance(actor, c.id) * weights.mem + (c.rep.prestigioTecnico * 0.6 + c.attrs.tecnico * 0.4) * weights.tec + c.rep.reconocimiento * weights.rec
    + terr + (weights.infl ?? 0) * partyInfluenceOf(s, c) + c.attrs.experiencia * (weights.exp ?? 0.1) + rng.normal(0, 8);
}

function offer(s: GameState, o: Omit<Opportunity, 'id' | 'week'>): Opportunity {
  const op: Opportunity = { id: newId(s, 'op'), week: s.week, ...o };
  s.career.opportunities.push(op);
  return op;
}

const opt = (id: string, label: string, hint: string) => ({ id, label, hint });

// ---------------------------------------------------------------------------
// Generación
// ---------------------------------------------------------------------------
function generate(s: GameState, rng: Rng): void {
  const lat = active(s);
  if (lat.length >= 10) return;
  const c = me(s);
  const chars = Object.values(s.characters).filter((x) => x.status === 'activo' && !x.isPlayer);
  // 1) Una figura con cargo necesita sumar a alguien a su equipo (cualquier figura; más probable si te conoce)
  if (rng.chance(0.05)) {
    const pool = chars.filter((x) => x.offices.some((o) => ['ministro', 'senador', 'diputado', 'alcalde', 'gobernador', 'presidente_partido', 'subsecretario'].includes(o.type)) && !lat.some((l) => l.actorId === x.id));
    if (pool.length) {
      const actor = rng.weighted(pool, pool.map((x) => 1 + Math.max(0, memoryBalance(x, c.id)) * 0.6 + (x.regionId === c.regionId ? 2 : 0)));
      create(s, rng, { kind: 'equipo_figura', actorId: actor.id, decideWeek: s.week + rng.int(4, 12), partyId: actor.partyId ?? undefined, ctx: { office: actor.offices[0].type } }, 0.7);
    }
  }
  // 2) Un parlamentario evalúa no repostular (edad, escándalos, límite de períodos)
  const parl = s.calendar.find((e) => !e.done && e.type === 'diputados' && e.week - s.week > OPEN_WEEKS + 4 && e.week - s.week < OPEN_WEEKS + 60);
  if (parl && rng.chance(0.06)) {
    const pool = chars.filter((x) => x.offices.some((o) => o.type === 'diputado' || o.type === 'senador') && !x.plansRetire && (ageOf(s, x) >= 62 || x.scandal > 35 || x.pastOffices.filter((p) => p.type === 'diputado').length >= 2) && !lat.some((l) => l.actorId === x.id));
    if (pool.length) {
      const actor = rng.weighted(pool, pool.map((x) => 1 + (x.regionId === c.regionId ? 3 : 0)));
      create(s, rng, { kind: 'retiro_parlamentario', actorId: actor.id, decideWeek: parl.week - OPEN_WEEKS - 2, partyId: actor.partyId ?? undefined, ctx: { election: parl.week } }, 0.6);
    }
  }
  // 3) El gobierno, con aprobación baja, evalúa renovar perfiles (designaciones)
  const pres = s.characters[s.government.presidentId];
  if (pres && !pres.isPlayer && s.opinion.presidentialApproval < 42 && !lat.some((l) => l.kind === 'reorganizacion_gabinete') && rng.chance(0.012)) {
    create(s, rng, { kind: 'reorganizacion_gabinete', actorId: pres.id, decideWeek: s.week + rng.int(3, 9) }, 0.65);
  }
  // 4) Crisis de liderazgo en un partido (más frecuente en partidos pequeños o divididos)
  for (const p of Object.values(s.parties)) {
    if (!p.active || !p.leaderId || p.leaderId === c.id || lat.some((l) => l.kind === 'crisis_liderazgo' && l.partyId === p.id)) continue;
    const small = p.members < 8000 ? 1.8 : 1;
    const pr = (p.cohesion < 45 ? 0.006 : 0.0012) * small;
    if (rng.chance(pr)) create(s, rng, { kind: 'crisis_liderazgo', actorId: p.leaderId, partyId: p.id, decideWeek: s.week + rng.int(4, 10) }, 0.55);
  }
  // 5) Un sector interno busca renovar su representación con una figura joven
  if (c.partyId && rng.chance(0.015)) {
    const party = s.parties[c.partyId];
    const f = party.factions.length ? rng.pick(party.factions) : null;
    if (f && s.characters[f.leaderId] && f.leaderId !== c.id && !lat.some((l) => l.kind === 'faccion_renovacion' && l.ctx.faction === f.id)) create(s, rng, { kind: 'faccion_renovacion', actorId: f.leaderId, partyId: party.id, decideWeek: s.week + rng.int(5, 14), ctx: { faction: f.id } }, 0.6);
  }
}

// ---------------------------------------------------------------------------
// Rumores: el jugador se entera si tiene acceso (con error)
// ---------------------------------------------------------------------------
const RUMOR: Record<LatentSituation['kind'], (s: GameState, l: LatentSituation) => string> = {
  equipo_figura: (s, l) => `Se comenta que ${fullName(s.characters[l.actorId])} busca sumar gente a su equipo.`,
  retiro_parlamentario: (s, l) => `Se rumorea que ${fullName(s.characters[l.actorId])} no repostularía al Congreso.`,
  vacante: () => 'Hay conversaciones reservadas sobre quién ocupará un escaño vacante.',
  reorganizacion_gabinete: () => 'Circulan versiones de cambios en el equipo de gobierno.',
  crisis_liderazgo: (s, l) => `Hay malestar con la conducción de ${s.parties[l.partyId ?? '']?.short ?? 'un partido'}; algunos hablan de renuncia.`,
  reorganizacion_coalicion: () => 'Existen rumores sobre una posible reorganización de candidaturas.',
  faccion_renovacion: (s, l) => `En el sector de ${fullName(s.characters[l.actorId])} hablan de renovar rostros.`,
};

function rumors(s: GameState, rng: Rng): void {
  const c = me(s); const k = knowledgeLevel(s);
  const srcs = informants(s);
  for (const l of active(s)) {
    if (l.knownToPlayer) continue;
    const actor = s.characters[l.actorId]; if (!actor) continue;
    const close = Math.max(0, memoryBalance(actor, c.id)) / 60 + (actor.partyId && actor.partyId === c.partyId ? 0.3 : 0) + (actor.regionId === c.regionId ? 0.15 : 0);
    if (!rng.chance(clamp(0.01 + close * 0.06 + k / 2500, 0, 0.12))) continue;
    // ¿quién lo cuenta? una persona cercana al actor, si la hay
    const src = srcs.filter((x) => x.partyId === actor.partyId).sort((a, b) => sourceQuality(s, b) - sourceQuality(s, a))[0];
    const q = src ? sourceQuality(s, src) : 15;
    const willHappen = Number(l.ctx.roll) < Number(l.ctx.p);
    // las fuentes de baja calidad a veces cuentan una versión distorsionada (que no se concretará)
    const distorted = !rng.chance(0.5 + q / 200);
    pushIntel(s, { topic: l.kind === 'reorganizacion_gabinete' ? 'gobierno' : l.kind === 'crisis_liderazgo' ? 'directiva' : 'oportunidad', source: src ? 'contacto' : 'rumor', sourceId: src?.id, reliability: reliabilityOf(q), truth: distorted ? !willHappen : willHappen, latentId: l.id,
      text: distorted && !willHappen ? RUMOR[l.kind](s, l) : distorted ? `Se descarta, según ${src ? fullName(src) : 'algunos'}, lo que se decía: ${RUMOR[l.kind](s, l).toLowerCase()}` : RUMOR[l.kind](s, l) });
    l.knownToPlayer = true;
  }
  // Rumores falsos: no todo lo que se dice existe
  if (rng.chance(0.01 + (srcs.length ? 0.01 : 0))) {
    const fake = rng.pick(['reorganizacion_gabinete', 'reorganizacion_coalicion'] as const);
    if (!active(s).some((l) => l.kind === fake)) {
      const ghost = create(s, rng, { kind: fake, actorId: s.government.presidentId, decideWeek: s.week + rng.int(4, 8), ctx: { ghost: 1 } }, 0);
      pushIntel(s, { topic: 'gobierno', source: 'rumor', reliability: 'baja', truth: false, latentId: ghost.id, text: RUMOR[fake](s, ghost) });
      ghost.knownToPlayer = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Decisión de los actores
// ---------------------------------------------------------------------------
function resolve(s: GameState, rng: Rng, l: LatentSituation): void {
  const actor = s.characters[l.actorId];
  const happens = !l.ctx.ghost && !!actor && actor.status === 'activo' && Number(l.ctx.roll) < Number(l.ctx.p);
  if (!happens) { l.status = 'disipada'; verifyIntel(s, l.id, false); return; }
  l.status = 'materializada';
  verifyIntel(s, l.id, true);
  const c = me(s);
  const chars = Object.values(s.characters).filter((x) => x.status === 'activo' && !x.isPlayer && x.id !== actor.id);
  const consider = (pool: Character[], playerOk: boolean, w: Parameters<typeof appraise>[4]) => {
    const list = [...pool]; if (playerOk && !s.player.careerOver) list.push(c);
    return list.map((x) => ({ x, v: appraise(s, actor, x, rng, w) })).sort((a, b) => b.v - a.v);
  };
  switch (l.kind) {
    case 'equipo_figura': {
      const pool = chars.filter((x) => (x.partyId === actor.partyId || !x.partyId) && x.regionId === actor.regionId && !x.offices.some((o) => ELECTED.includes(o.type) || DESIGNATED.includes(o.type))).slice(0, 6);
      const free = !c.offices.some((o) => o.type === 'asesor') && !minorRoleBlocked(c, 'asesor');
      const ranked = consider(pool, free && (!c.partyId || !actor.partyId || c.partyId === actor.partyId || memoryBalance(actor, c.id) > 25), { mem: 1, tec: 0.25, rec: 0.1 });
      const win = ranked[0]?.x; if (!win) return;
      l.chosenId = win.id;
      if (win.isPlayer) {
        offer(s, { kind: 'oferta_equipo', expiresWeek: s.week + 3, title: `${fullName(actor)} te ofrece integrar su equipo`, description: `Como ${officeLabel(actor.offices[0]?.type ?? 'militante', actor.gender).toLowerCase()}, necesita a alguien de confianza. Te eligió entre varias personas que conoce.`, actors: [actor.id],
          requirements: ['Disponibilidad (es un cargo de confianza)'], benefits: ['Acceso a información reservada', 'Experiencia y contactos', 'Un/a padrino o madrina política'], risks: ['Quedarás asociado/a a su suerte', 'Espera lealtad'],
          options: [opt('aceptar', 'Aceptar', 'Asesor/a de confianza'), opt('negociar', 'Aceptar a tiempo parcial', 'Menos compromiso, menos acceso'), opt('rechazar', 'Rechazar', 'Lo recordará')], ctx: { latent: l.id, actor: actor.id } });
      }
      return;
    }
    case 'retiro_parlamentario': {
      actor.plansRetire = Number(l.ctx.election);
      if (actor.regionId === c.regionId) pushIntel(s, { topic: 'oportunidad', source: 'publica', reliability: 'alta', truth: true, text: `${fullName(actor)} anuncia que no repostulará al Congreso.` });
      addNews(s, rng, 'congreso', `${fullName(actor)} no buscará la reelección`, 'Abre la competencia por su cupo.', 2);
      // A quién apadrina: el sucesor se elige con su memoria y la calidad de cada uno
      const pool = chars.filter((x) => x.partyId === actor.partyId && x.regionId === actor.regionId && !x.offices.some((o) => o.type === 'diputado' || o.type === 'senador'));
      const eligible = c.partyId === actor.partyId && c.regionId === actor.regionId && playerEligible(s, 'diputado');
      const ranked = consider(pool.sort((a, b) => candidateQuality(b, b.regionId) - candidateQuality(a, a.regionId)).slice(0, 5), eligible, { mem: 1.1, tec: 0.1, rec: 0.25, terr: 0.2 });
      const heir = ranked[0]?.x; if (!heir) return;
      l.chosenId = heir.id;
      if (heir.isPlayer) offer(s, { kind: 'sucesion', expiresWeek: s.week + 4, title: `${fullName(actor)} piensa en ti como sucesor/a`, description: 'Te respaldaría en el proceso de nominación de su distrito si te comprometes a dar continuidad a su trabajo.', actors: [actor.id],
        requirements: ['Militar en su partido', 'Edad mínima 21 años', 'Residir en la región'], benefits: ['Su respaldo pesa en la directiva', 'Herencia de su red territorial'], risks: ['Cargarás con sus enemistades', 'Compromiso de lealtad'],
        options: [opt('aceptar', 'Aceptar su apadrinamiento', 'Compromiso de lealtad'), opt('rechazar', 'Agradecer y seguir por tu cuenta', '')], ctx: { latent: l.id, actor: actor.id } });
      return;
    }
    case 'reorganizacion_gabinete': {
      const coal = coalitionMembers(s);
      const pool = chars.filter((x) => x.partyId && coal.includes(x.partyId) && !x.offices.some((o) => o.type === 'ministro' || o.type === 'presidente') && ageOf(s, x) >= 21).sort((a, b) => b.rep.prestigioTecnico + b.rep.reconocimiento - a.rep.prestigioTecnico - a.rep.reconocimiento).slice(0, 12);
      const eligible = !!c.partyId && coal.includes(c.partyId) && playerEligible(s, 'ministro') && !c.offices.some((o) => o.type === 'ministro');
      // Un gabinete se arma por idoneidad y peso político; la cercanía personal pesa, pero no decide sola
      const ranked = consider(pool, eligible, { mem: 0.25, tec: 0.7, rec: 0.3, infl: 0.05, exp: 0.35 });
      const posts = s.government.cabinet.filter((p) => p.ministerId).sort((a, b) => a.performance - b.performance).slice(0, 2);
      const mine = ranked.findIndex((r) => r.x.isPlayer);
      posts.forEach((post, i) => {
        const pick = ranked[i]; if (!pick) return;
        if (pick.x.isPlayer) {
          offer(s, { kind: 'oferta_ministerio', expiresWeek: s.week + 2, title: `La Presidencia te ofrece el Ministerio de ${MINISTRY_BY_ID[post.ministryId].name}`, description: 'En medio de un ajuste de gabinete, tu nombre se impuso entre varias alternativas.', actors: [actor.id],
            requirements: ['Ciudadanía y 21 años (art. 34 CPR)', 'Dejar cargos incompatibles'], benefits: ['Cargo de primer nivel', 'Agenda sectorial propia'], risks: ['Exposición total y acusaciones constitucionales', 'Inhabilidad electoral mientras ejerzas', 'Expectativas muy altas'],
            options: [opt('aceptar', 'Aceptar', ''), opt('rechazar', 'Declinar', 'La Presidencia lo recordará')], ctx: { latent: l.id, ministry: post.ministryId } });
        } else appointMinister(s, rng, post.ministryId, pick.x.id);
      });
      // Quien no llega al gabinete puede recibir una designación de segunda línea
      if (mine >= posts.length && mine < posts.length + 4) {
        const area = s.career.origin.interests[0];
        const m = Object.values(MINISTRY_BY_ID).find((x) => x.area === area) ?? Object.values(MINISTRY_BY_ID)[0];
        const level: OfficeType = c.rep.prestigioTecnico + c.attrs.experiencia > 110 ? 'subsecretario' : 'seremi';
        offer(s, { kind: 'oferta_designacion', expiresWeek: s.week + 3, title: `El gobierno te propone como ${level === 'seremi' ? 'Seremi' : 'Subsecretario/a'} de ${m.name}`, description: 'El ajuste de gobierno busca perfiles nuevos y tu nombre apareció en la lista.', actors: [actor.id],
          requirements: ['Partido de la coalición de gobierno'], benefits: ['Experiencia de gestión', 'Visibilidad sectorial'], risks: ['Inhabilidad para competir mientras ejerzas', 'Desgaste si el gobierno es impopular'],
          options: [opt('aceptar', 'Aceptar', ''), opt('rechazar', 'Rechazar', '')], ctx: { latent: l.id, ministry: m.id, level } });
      }
      return;
    }
    case 'crisis_liderazgo': {
      const p = s.parties[l.partyId ?? '']; if (!p || p.leaderId !== actor.id) return;
      removeOffice(s, actor, 'presidente_partido', 'renuncia por crisis interna');
      p.leaderId = null; p.nextLeadershipWeek = s.week + 10;
      addNews(s, rng, 'partidos', `Renuncia la presidencia de ${p.short}`, 'El partido elegirá nueva directiva en las próximas semanas.', 3);
      if (c.partyId === p.id) {
        pushIntel(s, { topic: 'directiva', source: 'publica', reliability: 'alta', truth: true, text: `${fullName(actor)} renuncia a la presidencia de ${p.short}: habrá elección interna en ~10 semanas.` });
        offer(s, { kind: 'vacio_liderazgo', expiresWeek: s.week + 4, title: `La crisis en ${p.short} abre la directiva`, description: 'La renuncia de la presidencia deja un vacío. Distintos sectores buscan figuras; algunos te miran.', actors: [actor.id],
          requirements: ['Militancia'], benefits: ['Una elección interna abierta', 'Espacios en la nueva directiva'], risks: ['Competir y perder te expone', 'Apoyar a otra figura te compromete'],
          options: [opt('postular', 'Postular a la presidencia del partido', 'Te inscribes en la interna'), opt('apoyar', 'Apoyar a la figura con más opciones', 'A cambio de un espacio'), opt('esperar', 'Mantenerte al margen', '')], ctx: { latent: l.id, party: p.id } });
      }
      return;
    }
    case 'faccion_renovacion': {
      const p = s.parties[l.partyId ?? '']; const f = p?.factions.find((x) => x.id === l.ctx.faction); if (!p || !f) return;
      const pool = chars.filter((x) => x.partyId === p.id && ageOf(s, x) < 40);
      const ranked = consider(pool.slice(0, 8), c.partyId === p.id && ageOf(s, c) < 40, { mem: 1, tec: 0.1, rec: 0.2, infl: 0.3 });
      const pick = ranked[0]?.x; if (!pick) return;
      l.chosenId = pick.id;
      if (pick.isPlayer) offer(s, { kind: 'oferta_faccion', expiresWeek: s.week + 3, title: `${f.name} te propone como uno de sus rostros`, description: `${fullName(actor)} quiere renovar la cara del sector y piensa en ti.`, actors: [actor.id],
        requirements: ['Militancia'], benefits: ['Respaldo de un sector interno', 'Visibilidad en el partido'], risks: ['Los otros sectores te verán como adversario', 'Tendrás que defender la línea del sector'],
        options: [opt('aceptar', 'Aceptar', ''), opt('rechazar', 'Mantener independencia interna', '')], ctx: { latent: l.id, faction: f.id, actor: actor.id } });
      else pick.factionId = f.id;
      return;
    }
    default: return;
  }
}

/** Resolución de las ofertas surgidas de situaciones latentes. */
export function resolveLatentOffer(s: GameState, rng: Rng, o: Opportunity, ch: string): string {
  const c = me(s); const actor = s.characters[String(o.ctx.actor ?? '')];
  const note = (w: number, kind: 'apoyo' | 'conflicto' | 'acuerdo_cumplido', t: string) => { if (actor) { remember(actor, { week: s.week, aboutId: c.id, kind, weight: w, note: t }); c.relations[actor.id] = clamp((c.relations[actor.id] ?? 0) + w * 0.6, -100, 100); } };
  switch (o.kind) {
    case 'oferta_equipo': {
      if (ch === 'rechazar') { note(-8, 'conflicto', 'Rechazó integrar su equipo'); return 'Declinas. No es seguro que vuelva a llamarte.'; }
      if (!c.offices.some((x) => x.type === 'asesor')) c.offices.push({ type: 'asesor', regionId: actor?.regionId ?? c.regionId, since: s.week, label: actor ? `Equipo de ${fullName(actor)}` : 'Asesoría' });
      note(ch === 'aceptar' ? 10 : 4, 'apoyo', 'Se sumó a su equipo');
      if (actor && ch === 'aceptar') s.career.commitments.push({ id: newId(s, 'cm'), toCharId: actor.id, kind: 'lealtad', createdWeek: s.week, dueWeek: s.week + 156, description: `Lealtad política a ${fullName(actor)}`, status: 'vigente' });
      if (actor) first(s, 'mentor', `${fullName(actor)} (${officeLabel(actor.offices[0]?.type ?? 'militante', actor.gender).toLowerCase()})`);
      progress(s);
      return 'Te sumas a su equipo: ganarás acceso y contactos, y quedas ligado/a a su suerte.';
    }
    case 'sucesion': {
      if (ch !== 'aceptar') { note(-6, 'conflicto', 'Rechazó su apadrinamiento'); return 'Declinas su apadrinamiento.'; }
      note(12, 'apoyo', 'Aceptó ser su sucesor/a');
      if (actor) s.career.commitments.push({ id: newId(s, 'cm'), toCharId: actor.id, kind: 'lealtad', createdWeek: s.week, dueWeek: s.week + 208, description: `Dar continuidad al trabajo de ${fullName(actor)}`, status: 'vigente' });
      bio(s, 'relacion', actor ? `${fullName(actor)} te apadrina como sucesor/a` : 'Apadrinamiento', '', 1); progress(s);
      return 'Cuentas con su respaldo para el proceso de nominación (si decides aspirar).';
    }
    case 'oferta_ministerio': {
      if (ch !== 'aceptar') { const p = s.characters[s.government.presidentId]; if (p) remember(p, { week: s.week, aboutId: c.id, kind: 'conflicto', weight: -6, note: 'Declinó un ministerio' }); return 'Declinas el ministerio.'; }
      for (const t of ['asesor', 'seremi', 'subsecretario'] as OfficeType[]) removeOffice(s, c, t, 'asume ministerio');
      const msg = appointMinister(s, rng, String(o.ctx.ministry), c.id);
      progress(s);
      return msg;
    }
    case 'oferta_designacion': {
      if (ch !== 'aceptar') return 'Rechazas la designación.';
      const level = o.ctx.level as OfficeType;
      removeOffice(s, c, 'asesor', 'designación');
      c.offices.push({ type: level, ministryId: String(o.ctx.ministry), regionId: c.regionId, since: s.week });
      c.rep.prestigioTecnico = clamp(c.rep.prestigioTecnico + 4, 0, 100);
      progress(s);
      return 'Asumes el cargo de designación.';
    }
    case 'vacio_liderazgo': {
      const p = s.parties[String(o.ctx.party)];
      if (ch === 'postular' && p) { s.player.candidacies = s.player.candidacies.filter((k) => k.electionId !== `interna-${p.id}`); s.player.candidacies.push({ electionId: `interna-${p.id}`, office: 'presidente_partido', partyId: p.id, approved: true }); return `Te inscribes para la elección interna de ${p.short}.`; }
      if (ch === 'apoyar' && p) {
        const f = [...p.factions].sort((a, b) => b.influence - a.influence)[0]; const fl = f ? s.characters[f.leaderId] : null;
        if (fl) { remember(fl, { week: s.week, aboutId: c.id, kind: 'apoyo', weight: 10, note: 'Lo/la apoyó en la crisis' }); s.career.commitments.push({ id: newId(s, 'cm'), toCharId: fl.id, kind: 'cargo', createdWeek: s.week, dueWeek: s.week + 104, description: `${fullName(fl)} te debe un espacio en la directiva`, status: 'vigente' }); }
        return 'Apoyas a la figura con más opciones; queda en deuda contigo.';
      }
      return 'Te mantienes al margen de la disputa.';
    }
    case 'oferta_faccion': {
      if (ch !== 'aceptar') { note(-4, 'conflicto', 'Declinó representar al sector'); return 'Prefieres no alinearte.'; }
      c.factionId = String(o.ctx.faction); note(10, 'apoyo', 'Aceptó representar al sector');
      c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + 3, 0, 100);
      return 'Pasas a ser uno de los rostros del sector.';
    }
    case 'escano_vacante': {
      const seat = s.seats.find((x) => x.id === o.ctx.seat);
      const l = s.career.latent.find((x) => x.id === o.ctx.latent);
      if (ch !== 'aceptar' || !seat || seat.holderId) { if (l) l.ctx.declined = 1; return 'Declinas el escaño; el partido designará a otra persona.'; }
      const type: OfficeType = seat.chamber === 'camara' ? 'diputado' : 'senador';
      seat.holderId = c.id;
      c.offices.push({ type, regionId: seat.regionId, districtId: seat.chamber === 'camara' ? seat.unitId : undefined, since: s.week, termEndWeek: seat.termEndWeek });
      c.pastOffices.push({ type, from: s.week, to: s.week, detail: 'designación por vacancia (art. 51 CPR)' });
      c.rep.reconocimiento = clamp(c.rep.reconocimiento + 10, 0, 100);
      progress(s);
      addNews(s, rng, 'congreso', `${fullName(c)} asume el escaño vacante`, 'Designación del partido (art. 51 CPR).', 3);
      return `Asumes como ${officeLabel(type, c.gender).toLowerCase()} por designación del partido.`;
    }
    default: return '';
  }
}

export const LATENT_OFFER_KINDS = new Set(['oferta_equipo', 'sucesion', 'oferta_ministerio', 'oferta_designacion', 'vacio_liderazgo', 'oferta_faccion', 'escano_vacante']);

/**
 * Vacancia parlamentaria (art. 51 CPR): la directiva del partido del titular designa reemplazo
 * entre su militancia habilitada. Si elige al jugador, el escaño queda en reserva hasta su respuesta.
 * Devuelve el id del designado, 'pending' o null (sin decisión: se crea un reemplazo genérico).
 */
export function designateReplacement(s: GameState, rng: Rng, seat: Seat, partyId: string): string | 'pending' | null {
  if (!s.career) return null;
  const pending = s.career.latent.find((l) => l.kind === 'vacante' && l.ctx.seat === seat.id && l.status === 'materializada' && !l.ctx.declined && s.career.opportunities.some((o) => o.ctx.latent === l.id));
  if (pending) return 'pending';
  const p = s.parties[partyId]; const leader = p?.leaderId ? s.characters[p.leaderId] : null;
  if (!p || !leader) return null;
  const c = me(s);
  const office: OfficeType = seat.chamber === 'camara' ? 'diputado' : 'senador';
  const declined = s.career.latent.some((l) => l.kind === 'vacante' && l.ctx.seat === seat.id && l.ctx.declined);
  const pool = Object.values(s.characters).filter((x) => x.status === 'activo' && !x.isPlayer && x.partyId === partyId && x.regionId === seat.regionId && ageOf(s, x) >= (office === 'senador' ? 35 : 21) && !x.offices.some((o) => ['diputado', 'senador', 'ministro', 'presidente'].includes(o.type))).slice(0, 8);
  const eligible = !declined && c && c.partyId === partyId && c.regionId === seat.regionId && playerEligible(s, office) && !c.offices.some((o) => ['diputado', 'senador', 'ministro', 'presidente'].includes(o.type)) && !s.player.careerOver;
  const list = [...pool]; if (eligible) list.push(c);
  if (!list.length) return null;
  const ranked = list.map((x) => ({ x, v: appraise(s, leader, x, rng, { mem: 0.9, tec: 0.1, rec: 0.3, infl: 0.4 }) })).sort((a, b) => b.v - a.v);
  const win = ranked[0].x;
  const l: LatentSituation = { id: newId(s, 'lt'), kind: 'vacante', actorId: leader.id, week: s.week, decideWeek: s.week, status: 'materializada', partyId, ctx: { seat: seat.id }, chosenId: win.id, knownToPlayer: win.isPlayer ?? false };
  s.career.latent.push(l);
  if (win.isPlayer) {
    offer(s, { kind: 'escano_vacante', expiresWeek: s.week + 2, title: `La directiva te propone para el escaño vacante (${office === 'diputado' ? `Distrito ${seat.unitId}` : 'Senado'})`, description: `Un escaño de ${p.short} quedó vacante. La Constitución (art. 51) entrega al partido la designación del reemplazo, y ${fullName(leader)} pensó en ti.`, actors: [leader.id],
      requirements: [`Edad mínima ${office === 'senador' ? 35 : 21} años`, 'Militancia en el partido del titular', 'Dejar cargos incompatibles'], benefits: ['Un escaño parlamentario sin pasar por una elección', 'Visibilidad nacional inmediata'], risks: ['Llegarás con poca experiencia y muchas expectativas', 'Deberás ganar la reelección por tu cuenta', 'La directiva esperará disciplina'],
      options: [opt('aceptar', 'Aceptar el escaño', ''), opt('rechazar', 'Declinar', 'El partido designará a otra persona')], ctx: { latent: l.id, seat: seat.id } });
    return 'pending';
  }
  // Designa a una figura existente de la IA: deja sus cargos incompatibles
  for (const t of ['alcalde', 'concejal', 'gobernador', 'seremi', 'subsecretario'] as OfficeType[]) if (win.offices.some((o) => o.type === t)) removeOffice(s, win, t, 'asume escaño por vacancia');
  if (win.memory.some((m) => m.aboutId === c.id)) pushIntel(s, { topic: 'red', source: 'publica', reliability: 'alta', truth: true, text: `${fullName(win)} es designado/a en el escaño vacante de ${p.short}.` });
  return win.id;
}

/** Semana: generar, filtrar rumores y resolver situaciones latentes. */
export function weeklyLatent(s: GameState, rng: Rng): void {
  generate(s, rng);
  rumors(s, rng);
  for (const l of active(s)) if (s.week >= l.decideWeek) resolve(s, rng, l);
  // Los parlamentarios que decidieron retirarse dejan la política tras la elección
  for (const x of Object.values(s.characters)) if (x.plansRetire && s.week > x.plansRetire + 2 && x.status === 'activo' && !x.offices.some((o) => o.type === 'diputado' || o.type === 'senador')) { x.plansRetire = undefined; retire(s, x, 'retirado'); }
  if (s.career.latent.length > 120) s.career.latent = s.career.latent.filter((l) => l.status === 'latente' || s.week - l.decideWeek < 104);
  void listIdOf; void officeRank;
}
