import { describe, expect, it } from 'vitest';
import { newGame } from './helpers';
import { advanceWeek, dispatch } from '../src/game/engine/game';
import { Rng } from '../src/game/engine/rng';
import { actionBlocked } from '../src/game/systems/player';
import { fillVacancies } from '../src/game/systems/parliament';
import { remember, setLongMemory } from '../src/game/systems/characters';
import { me, homeCut } from '../src/game/career/capital';
import { knowledgeLevel, perceive, pushIntel, situationReport, stanceToward, trackContacts, verifyIntel } from '../src/game/career/knowledge';
import { weeklyLatent } from '../src/game/career/latent';
import { reviewElection } from '../src/game/career/review';
import { ensureProcess, electionWindow, OPEN_WEEKS, aspireBlocked } from '../src/game/career/nominations';
import { weeklyCareer } from '../src/game/career/weekly';
import { careerSummary } from '../src/game/career/summary';
import { resolveOpportunity } from '../src/game/career/opportunities';
import { EXTRA_DEFS } from '../src/game/career/agenda';
import { COMUNA_BY_CUT } from '../src/game/territory/data';
import type { ElectionResult, GameState, LatentSituation } from '../src/game/models/types';
import { weeklyPlayer } from '../src/game/systems/player';
import '../src/game/career/weekly'; // registra los ganchos (vacantes, voto)

const young = (o: Record<string, unknown> = {}, seed = 7) => structuredClone(newGame({ age: 23, profession: 'estudiante', education: 'universitaria_curso', experience: 'ninguna', traits: [], interests: ['salud'], organization: null, ...o } as never, seed));
const latent = (s: GameState, l: Partial<LatentSituation> & Pick<LatentSituation, 'kind' | 'actorId'>, roll: number, p: number): LatentSituation => {
  const x = { id: `lt-test-${s.career.latent.length}`, week: s.week, decideWeek: s.week, status: 'latente', knownToPlayer: false, ...l, ctx: { ...(l.ctx ?? {}), roll, p } } as LatentSituation;
  s.career.latent.push(x); return x;
};
const strongMemory = (s: GameState, id: string, w = 60) => { setLongMemory(s.player.characterId); remember(s.characters[id], { week: s.week, aboutId: s.player.characterId, kind: 'apoyo', weight: w, note: 'Trabajó en su campaña' }); };

describe('Información imperfecta (estado real ≠ conocimiento ≠ interfaz)', () => {
  it('la interfaz recibe solo descripciones cualitativas, sin cifras ni probabilidades', () => {
    const s = young();
    for (const l of situationReport(s)) expect(l.text).not.toMatch(/\d|%|probabilidad|nivel|puntos/i);
    const leader = s.parties.PS.leaderId!;
    const st = stanceToward(s, leader);
    expect(st.text).not.toMatch(/\d/);
    expect(['clara', 'incierta', 'muy incierta']).toContain(st.certainty);
  });
  it('el error de percepción disminuye con el conocimiento político', () => {
    const novice = young({}, 3);
    const expert = structuredClone(novice);
    const ex = me(expert); ex.attrs.experiencia = 90; ex.attrs.redes = 90;
    for (const x of Object.values(expert.characters).slice(0, 25)) if (!x.isPlayer) ex.relations[x.id] = 30;
    expect(knowledgeLevel(expert)).toBeGreaterThan(knowledgeLevel(novice) + 30);
    let eN = 0; let eE = 0;
    for (let i = 0; i < 200; i++) { eN += Math.abs(perceive(novice, `k${i}`, 50, 30) - 50); eE += Math.abs(perceive(expert, `k${i}`, 50, 30) - 50); }
    expect(eE).toBeLessThan(eN * 0.6);
  });
  it('los informes se verifican con los hechos y construyen el historial de cada fuente', () => {
    const s = young();
    const src = Object.values(s.characters).find((x) => !x.isPlayer && x.partyId === 'PS')!;
    pushIntel(s, { topic: 'oportunidad', source: 'contacto', sourceId: src.id, reliability: 'media', truth: false, latentId: 'L1', text: 'Se rumorea que X no repostularía.' });
    pushIntel(s, { topic: 'oportunidad', source: 'contacto', sourceId: src.id, reliability: 'media', truth: true, latentId: 'L2', text: 'Se rumorea que Y no repostularía.' });
    verifyIntel(s, 'L1', false); verifyIntel(s, 'L2', false);
    expect(s.career.intel.map((r) => r.verified)).toEqual(['desmentido', 'desmentido']);
    expect(s.career.sources[src.id]).toEqual({ hits: 0, misses: 2 });
  });
  it('los mensajes de las acciones no revelan valores internos', () => {
    let s = young();
    const t = Object.values(s.characters).find((x) => !x.isPlayer && x.partyId === 'PS')!;
    const r = dispatch(s, { type: 'reunion', charId: t.id }); s = r.state;
    expect(r.message).not.toMatch(/[+-]\d|relación \d/);
    const r2 = dispatch(s, { type: 'organizacion_social' });
    expect(r2.message).not.toMatch(/\d/);
  });
});

describe('Oportunidades invisibles y consecuencias diferidas', () => {
  it('una situación latente puede no materializarse nunca (y el jugador no la ve)', () => {
    const s = young();
    const actor = Object.values(s.characters).find((x) => !x.isPlayer && x.offices.some((o) => o.type === 'diputado'))!;
    const l = latent(s, { kind: 'equipo_figura', actorId: actor.id, ctx: { office: 'diputado' } }, 0.9, 0.5);
    weeklyLatent(s, new Rng(s.rng));
    expect(l.status).toBe('disipada');
    expect(s.career.opportunities.some((o) => o.kind === 'oferta_equipo')).toBe(false);
  });
  it('una relación construida años antes hace que una figura que ascendió piense en ti', () => {
    const s = young({ regionId: 'RM', comuna: 'Santiago' });
    const actor = Object.values(s.characters).find((x) => !x.isPlayer && x.partyId === 'PS' && x.regionId === 'RM' && x.offices.some((o) => o.type === 'diputado' || o.type === 'senador'))!;
    strongMemory(s, actor.id, 80);
    // pasan años: otros recuerdan muchas cosas, pero la memoria sobre el jugador persiste
    for (let i = 0; i < 60; i++) remember(actor, { week: s.week + i, aboutId: `otro${i}`, kind: 'colaboracion', weight: 2, note: 'x' });
    expect(actor.memory.some((m) => m.aboutId === s.player.characterId)).toBe(true);
    latent(s, { kind: 'equipo_figura', actorId: actor.id, ctx: { office: actor.offices[0].type } }, 0, 1);
    weeklyLatent(s, new Rng(s.rng));
    const o = s.career.opportunities.find((x) => x.kind === 'oferta_equipo');
    expect(o?.actors).toContain(actor.id);
    resolveOpportunity(s, new Rng(s.rng), o!.id, 'aceptar', false, EXTRA_DEFS);
    expect(me(s).offices.some((x) => x.type === 'asesor')).toBe(true);
    expect(s.career.firsts.mentor).toBeTruthy();
  });
  it('sin relación previa, la misma figura elige a otra persona', () => {
    const s = young({ regionId: 'RM', comuna: 'Santiago' });
    const actor = Object.values(s.characters).find((x) => !x.isPlayer && x.partyId === 'PS' && x.regionId === 'RM' && x.offices.some((o) => o.type === 'diputado' || o.type === 'senador'))!;
    remember(actor, { week: s.week, aboutId: s.player.characterId, kind: 'conflicto', weight: -40, note: 'Conflicto' });
    const l = latent(s, { kind: 'equipo_figura', actorId: actor.id, ctx: { office: actor.offices[0].type } }, 0, 1);
    weeklyLatent(s, new Rng(s.rng));
    expect(l.status).toBe('materializada');
    expect(s.career.opportunities.some((o) => o.kind === 'oferta_equipo')).toBe(false);
  });
});

describe('Ascensos meteóricos sin requisitos artificiales', () => {
  it('vacancia (art. 51 CPR): la directiva puede designar a una militante sin cargos previos', () => {
    const s = young({ age: 26, regionId: 'BI', comuna: 'Concepción' });
    const pl = me(s);
    const seat = s.seats.find((x) => x.chamber === 'camara' && x.regionId === 'BI' && x.holderId && s.characters[x.holderId]?.partyId === 'PS')!;
    const leader = s.parties.PS.leaderId!;
    strongMemory(s, leader, 100); pl.rep.confianzaPartido = 95; pl.rep.reconocimiento = 60;
    s.characters[seat.holderId!].status = 'retirado';
    fillVacancies(s, new Rng(s.rng));
    const o = s.career.opportunities.find((x) => x.kind === 'escano_vacante');
    expect(o).toBeTruthy();
    expect(seat.holderId).toBeNull(); // en reserva hasta que respondas
    resolveOpportunity(s, new Rng(s.rng), o!.id, 'aceptar', false, EXTRA_DEFS);
    expect(seat.holderId).toBe(pl.id);
    expect(pl.offices.some((x) => x.type === 'diputado')).toBe(true);
  });
  it('si declina, el partido designa a otra persona', () => {
    const s = young({ age: 26, regionId: 'BI', comuna: 'Concepción' });
    const seat = s.seats.find((x) => x.chamber === 'camara' && x.regionId === 'BI' && x.holderId && s.characters[x.holderId]?.partyId === 'PS')!;
    strongMemory(s, s.parties.PS.leaderId!, 100); me(s).rep.confianzaPartido = 95; me(s).rep.reconocimiento = 60;
    s.characters[seat.holderId!].status = 'retirado';
    fillVacancies(s, new Rng(s.rng));
    const o = s.career.opportunities.find((x) => x.kind === 'escano_vacante')!;
    resolveOpportunity(s, new Rng(s.rng), o.id, 'rechazar', false, EXTRA_DEFS);
    fillVacancies(s, new Rng(s.rng));
    expect(seat.holderId).not.toBeNull();
    expect(seat.holderId).not.toBe(me(s).id);
  });
  it('un perfil técnico excepcional puede llegar al gabinete sin cargos de elección previos', () => {
    const s = young({ age: 30, partyId: 'REP', profession: 'economia', education: 'postgrado' });
    const pl = me(s); pl.rep.prestigioTecnico = 99; pl.attrs.tecnico = 95; pl.rep.reconocimiento = 70; pl.attrs.experiencia = 70;
    strongMemory(s, s.government.presidentId, 60);
    latent(s, { kind: 'reorganizacion_gabinete', actorId: s.government.presidentId }, 0, 1);
    weeklyLatent(s, new Rng(s.rng));
    expect(s.career.opportunities.some((o) => o.kind === 'oferta_ministerio' || o.kind === 'oferta_designacion')).toBe(true);
  });
  it('solo se exigen requisitos legales: nadie pide haber sido concejal para aspirar al Congreso', () => {
    let s = young({ age: 24 });
    const e = s.calendar.find((x) => x.type === 'diputados')!;
    while (s.week < e.week - OPEN_WEEKS) s = advanceWeek(s).state;
    expect(me(s).offices.some((o) => ['concejal', 'alcalde'].includes(o.type))).toBe(false);
    expect(aspireBlocked(s, e.id, 'diputado', String(COMUNA_BY_CUT[homeCut(s)].district))).toBeNull();
  }, 120000);
});

describe('Derrotas, presión y punto de partida', () => {
  const fakeResult = (s: GameState, pct: number, margin: number): ElectionResult => ({ id: 'r', electionId: 'e-x', type: 'alcaldes', week: s.week, date: '2028-10-01', nationalPartyPct: {}, seatsByParty: {}, units: [], turnoutPct: 80, countOrder: [], names: {}, playerOutcome: { ran: true, won: false, pct, marginPct: margin } });
  it('una derrota estrecha abre caminos; una derrota sin sorpresas no', () => {
    const a = young(); const b = structuredClone(a);
    const ra = reviewElection(a, new Rng(a.rng), fakeResult(a, 47, -1.5));
    const rb = reviewElection(b, new Rng(b.rng), fakeResult(b, 3, -40));
    expect(ra.closeness).toBe('estrecha'); expect(rb.closeness).toBe('amplia');
    expect(a.career.opportunities.some((o) => o.kind === 'tras_derrota')).toBe(true);
    expect(b.career.opportunities.some((o) => o.kind === 'tras_derrota')).toBe(false);
    expect(me(a).rep.confianzaPartido).toBeGreaterThan(me(b).rep.confianzaPartido);
    expect(a.career.firsts.derrota).toBeTruthy();
    expect(ra.effects.length).toBeGreaterThan(0);
  });
  it('el éxito prematuro genera presión según la experiencia (no según la edad)', () => {
    const novice = young(); const vet = structuredClone(novice);
    me(vet).attrs.experiencia = 85; vet.career.capital.organization = 70;
    for (const s of [novice, vet]) { s.career.lastOffices = me(s).offices.map((o) => o.type); me(s).offices.push({ type: 'alcalde', regionId: me(s).regionId, comuna: me(s).comuna, since: s.week }); weeklyCareer(s, new Rng(s.rng)); }
    expect(novice.career.pressure).toBeGreaterThan(vet.career.pressure + 15);
    expect(situationReport(novice).some((l) => l.area === 'Expectativas')).toBe(true);
  });
  it('partidos grandes tienen más competencia interna que los pequeños', () => {
    const s = young();
    const e = s.calendar.find((x) => x.type === 'diputados')!;
    while (s.week < e.week - OPEN_WEEKS) s.week++;
    const parties = Object.values(s.parties).filter((p) => p.active && p.legalStatus !== 'en_formacion').sort((a, b) => b.members - a.members);
    const big = parties[0]; const small = parties[parties.length - 1];
    let nb = 0; let ns = 0;
    for (let d = 1; d <= 28; d++) { nb += ensureProcess(s, new Rng(s.rng), e.id, 'diputado', String(d), big.id)!.aspirants.length; ns += ensureProcess(s, new Rng(s.rng), e.id, 'diputado', String(d), small.id)!.aspirants.length; }
    expect(nb).toBeGreaterThan(ns);
  });
  it('la agenda personal: más tiempo para la política cuesta ingresos', () => {
    const s = young();
    const funds = s.player.personalFunds;
    s.career.workMode = 'completa'; weeklyPlayer(s); const apC = s.player.maxActionPoints; const fC = s.player.personalFunds - funds;
    s.career.workMode = 'dedicacion'; const f1 = s.player.personalFunds; weeklyPlayer(s); const apD = s.player.maxActionPoints; const fD = s.player.personalFunds - f1;
    expect(apD).toBe(apC + 2); expect(fC).toBeGreaterThan(0); expect(fD).toBeLessThan(0);
    s.player.personalFunds = 0.5; weeklyPlayer(s);
    expect(s.career.workMode).toBe('parcial');
    expect(actionBlocked(s, { type: 'cambiar_jornada', mode: 'dedicacion' })).toMatch(/ahorros|poco/);
  });
});

describe('Destinos independientes y biografía', () => {
  it('las personas que conociste siguen su carrera y te enteras por información pública', () => {
    const s = young();
    const t = Object.values(s.characters).find((x) => !x.isPlayer && x.offices.length === 0 && x.partyId === 'PS')!;
    strongMemory(s, t.id, 20); me(s).relations[t.id] = 20;
    trackContacts(s);
    expect(s.career.contacts[t.id]).toBeTruthy();
    t.offices.push({ type: 'alcalde', regionId: t.regionId, comuna: t.comuna, since: s.week });
    trackContacts(s);
    expect(s.career.intel.some((r) => r.topic === 'red' && r.source === 'publica' && r.text.includes(t.firstName))).toBe(true);
  });
  it('la biografía registra hitos reales (primer partido, primera candidatura…) y nada inventado', () => {
    let s = young();
    for (let i = 0; i < 6; i++) s = advanceWeek(s).state;
    const sum = careerSummary(s);
    expect(sum.milestones.map((m) => m.label)).toContain('Primer partido');
    expect(sum.milestones.map((m) => m.label)).not.toContain('Primera victoria');
    void electionWindow;
  });
});
