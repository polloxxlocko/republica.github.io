import { describe, expect, it } from 'vitest';
import { newGame } from './helpers';
import { dispatch } from '../src/game/engine/game';
import { Rng } from '../src/game/engine/rng';
import { actionBlocked } from '../src/game/systems/player';
import { processOpportunities } from '../src/game/career/opportunities';
import { EXTRA_DEFS } from '../src/game/career/agenda';
import { weeklyCareer } from '../src/game/career/weekly';
import { weeklyLatent } from '../src/game/career/latent';
import { aspireBlocked, OPEN_WEEKS } from '../src/game/career/nominations';
import { me, minorRoleBlocked } from '../src/game/career/capital';
import { ensureLeg, isDistrictWeek, legOf, legislativeRecordBonus, weeklyLeg } from '../src/game/career/legislature';
import { dateToWeek } from '../src/game/engine/dates';
import type { GameState, LatentSituation } from '../src/game/models/types';

const deputy = (seed = 3) => { const s = structuredClone(newGame({ startRole: 'diputado', age: 40, partyId: 'PS' } as never, seed)); ensureLeg(s, new Rng(s.rng)); return s; };
const legWeek = (s: GameState) => { while (isDistrictWeek(s)) s.week++; return s; };
const distWeek = (s: GameState) => { while (!isDistrictWeek(s)) s.week++; return s; };

describe('Sin solapamientos de cargos', () => {
  it('un/a diputado/a no recibe ofertas de asesoría, dirigencia social, directiva local ni concejo', () => {
    const s = deputy(); const rng = new Rng(s.rng);
    const kinds = new Set<string>();
    for (let w = 0; w < 400; w++) { s.week++; processOpportunities(s, rng, EXTRA_DEFS); for (const o of s.career.opportunities) kinds.add(o.kind); s.career.opportunities = []; }
    for (const k of ['mentor', 'organizacion_social', 'directiva_local', 'cupo_concejal']) expect(kinds.has(k)).toBe(false);
  });
  it('una figura que arma equipo no le ofrece asesoría a un/a parlamentario/a', () => {
    const s = deputy(); const pl = me(s);
    const actor = Object.values(s.characters).find((c) => !c.isPlayer && c.status === 'activo' && c.offices.some((o) => o.type === 'senador' || o.type === 'diputado'))!;
    s.career.latent.push({ id: 'l1', kind: 'equipo_figura', actorId: actor.id, week: s.week, decideWeek: s.week, status: 'latente', knownToPlayer: false, ctx: { roll: 0, p: 1, office: 'diputado' } } as LatentSituation);
    actor.relations[pl.id] = 100;
    weeklyLatent(s, new Rng(s.rng));
    expect(s.career.opportunities.some((o) => o.kind === 'oferta_equipo')).toBe(false);
  });
  it('al asumir un cargo público se dejan los roles menores incompatibles', () => {
    const s = structuredClone(newGame({ age: 30, organization: 'junta_vecinos' } as never, 4)); const pl = me(s);
    pl.offices.push({ type: 'asesor', regionId: pl.regionId, since: s.week });
    expect(pl.offices.some((o) => o.type === 'dirigente_social')).toBe(true);
    s.career.lastOffices = pl.offices.map((o) => o.type);
    pl.offices.push({ type: 'diputado', regionId: pl.regionId, districtId: 20, since: s.week });
    weeklyCareer(s, new Rng(s.rng));
    expect(pl.offices.map((o) => o.type)).not.toContain('asesor');
    expect(pl.offices.map((o) => o.type)).not.toContain('dirigente_social');
    expect(minorRoleBlocked(pl, 'dirigente_social')).toMatch(/Incompatible/);
  });
  it('un/a diputado/a no aspira al concejo municipal', () => {
    const s = deputy(); const e = s.calendar.find((x) => x.type === 'concejales')!;
    s.week = e.week - OPEN_WEEKS + 1;
    expect(aspireBlocked(s, e.id, 'concejal', '8101')).toMatch(/cargo superior/);
  });
});

describe('Labor parlamentaria', () => {
  it('al asumir se integran dos comisiones', () => {
    const s = deputy(); expect(legOf(s)!.commissions.length).toBe(2); expect(legOf(s)!.attendance).toBe(100);
  });
  it('semana distrital: sin sesiones; semana legislativa: sin recorrido distrital', () => {
    const s = distWeek(deputy()); s.player.actionPoints = 9;
    expect(actionBlocked(s, { type: 'intervencion_sala', area: 'salud' })).toMatch(/Semana distrital/);
    expect(actionBlocked(s, { type: 'semana_distrital' })).toBeNull();
    legWeek(s);
    expect(actionBlocked(s, { type: 'intervencion_sala', area: 'salud' })).toBeNull();
    expect(actionBlocked(s, { type: 'semana_distrital' })).toMatch(/semana distrital/);
  });
  it('hacer terreno en semana legislativa baja la asistencia; con pareo, no', () => {
    let s = legWeek(deputy()); s.player.actionPoints = 9; s.player.personalFunds = 50;
    s = dispatch(s, { type: 'visita_region', region: me(s).regionId }).state;
    const a0 = legOf(s)!.attendance; weeklyLeg(s, new Rng(s.rng));
    expect(legOf(s)!.attendance).toBeLessThan(a0);
    let t = legWeek(deputy()); t.player.actionPoints = 9; t.player.personalFunds = 50;
    t = dispatch(t, { type: 'pareo' }).state;
    t = dispatch(t, { type: 'visita_region', region: me(t).regionId }).state;
    const b0 = legOf(t)!.attendance; weeklyLeg(t, new Rng(t.rng));
    expect(legOf(t)!.attendance).toBeGreaterThanOrEqual(b0);
  });
  it('las indicaciones moderan un proyecto en comisión; poner en tabla requiere presidir', () => {
    let s = legWeek(deputy()); s.player.actionPoints = 9;
    const b = s.bills.find((x) => x.closedWeek === undefined && x.stage === 'comision_origen' && x.chamberOfOrigin === 'camara');
    if (b) {
      const m0 = b.moderation;
      s = dispatch(s, { type: 'indicaciones', billId: b.id }).state;
      expect(s.bills.find((x) => x.id === b.id)!.moderation).toBeGreaterThan(m0);
      expect(actionBlocked(s, { type: 'poner_en_tabla', billId: b.id })).toMatch(/preside/);
    }
  });
  it('no se interpela a ministros que son personas reales; sí a titulares ficticios', () => {
    const s = legWeek(deputy()); s.player.actionPoints = 9;
    const real = s.government.cabinet.find((p) => p.ministerId && s.characters[p.ministerId].realId)!;
    const fict = s.government.cabinet.find((p) => p.ministerId && !s.characters[p.ministerId].realId)!;
    expect(actionBlocked(s, { type: 'interpelacion', ministryId: real.ministryId })).toMatch(/personas reales|firmas/);
    const r = actionBlocked(s, { type: 'interpelacion', ministryId: fict.ministryId });
    expect(r === null || /firmas/.test(r)).toBe(true);
  });
  it('no presentar la declaración de intereses a tiempo tiene costo', () => {
    const s = deputy(); const pl = me(s);
    s.week = dateToWeek(s.startDate, '2027-05-03');
    const cred = pl.rep.credibilidad; weeklyLeg(s, new Rng(s.rng));
    expect(pl.rep.credibilidad).toBeLessThan(cred);
  });
  it('el registro parlamentario pesa en la reelección', () => {
    const s = deputy(); const l = legOf(s)!;
    l.attendance = 100; l.record.speeches = 20; const good = legislativeRecordBonus(s);
    l.attendance = 60; l.record.speeches = 0; const bad = legislativeRecordBonus(s);
    expect(good).toBeGreaterThan(bad + 8);
  });
});
