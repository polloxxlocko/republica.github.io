import { describe, expect, it } from 'vitest';
import { newGame } from './helpers';
import { dispatch, advanceWeek } from '../src/game/engine/game';
import { actionBlocked } from '../src/game/systems/player';
import { aspireBlocked, electionWindow } from '../src/game/career/nominations';
import { resolveDecision, processEvents } from '../src/game/systems/events';
import { Rng } from '../src/game/engine/rng';

describe('Acciones del jugador', () => {
  it('quien preside el partido compite con ventaja en el proceso de nominación (sin nominación asegurada)', () => {
    let shortlisted = 0;
    for (const seed of [42, 7, 13]) {
      let s = structuredClone(newGame({ startRole: 'presidente_partido', age: 45 }, seed));
      s.parties.PS.nextLeadershipWeek = 400; // aísla la ventaja de presidir (sin elección interna en medio)
      const e = s.calendar.find((x) => x.type === 'diputados')!;
      const w = electionWindow(s, e.id)!;
      while (s.week < w.open) s = advanceWeek(s).state;
      const unit = String(s.characters[s.player.characterId].regionId === 'BI' ? 20 : 1);
      expect(aspireBlocked(s, e.id, 'diputado', unit)).toBeNull();
      s = dispatch(s, { type: 'aspirar', electionId: e.id, office: 'diputado', unitId: unit }).state;
      while (s.week <= w.decision) s = advanceWeek(s).state;
      const p = s.career.processes.find((x) => x.electionId === e.id && x.aspirants.some((a) => a.charId === s.player.characterId))!;
      const mine = p.aspirants.find((a) => a.charId === s.player.characterId)!;
      expect(['resuelto', 'cancelado']).toContain(p.status);
      if (p.log.some((l) => l.includes('Preselección') && l.includes(s.characters[s.player.characterId].firstName))) shortlisted++;
      if (mine.status === 'nominado') expect(s.player.campaign).not.toBeNull();
    }
    // Llega a la preselección en la mayoría de los casos, pero nada está garantizado
    expect(shortlisted).toBeGreaterThanOrEqual(2);
  }, 240000);
  it('reglas: no se puede presentar mociones sin ser parlamentario ni candidatear a senador con menos de 35', () => {
    const s = newGame({ age: 25 });
    expect(actionBlocked(s, { type: 'mocion', template: 0 })).toMatch(/parlamentarios/);
    const e = s.calendar.find((x) => x.type === 'senadores' && x.regions?.includes('BI')) ?? s.calendar.find((x) => x.type === 'senadores')!;
    expect(actionBlocked(s, { type: 'aspirar', electionId: e.id, office: 'senador', unitId: 'BI' })).toMatch(/Edad mínima/);
  });
  it('fundar un partido lo deja en formación y luego constituido', () => {
    let s = newGame({ experience: 'nacional' });
    s.characters[s.player.characterId].rep.reconocimiento = 40; s.player.personalFunds = 100;
    const r = dispatch(s, { type: 'fundar_partido', name: 'Movimiento Austral Prueba', short: 'MAP', color: '#ff00aa' });
    s = r.state;
    const p = Object.values(s.parties).find((x) => x.short === 'MAP')!;
    expect(p.legalStatus).toBe('en_formacion');
    expect(s.characters[s.player.characterId].partyId).toBe(p.id);
    for (let i = 0; i < 80 && s.parties[p.id].legalStatus === 'en_formacion'; i++) s = advanceWeek(s).state;
    expect(s.parties[p.id].legalStatus).toBe('ficticio');
  });
  it('las decisiones pendientes se resuelven y quedan en el historial', () => {
    const s = structuredClone(newGame());
    s.characters[s.player.characterId].rep.reconocimiento = 60;
    s.pending.push({ id: 'e1', eventId: 'entrevista_polemica', week: s.week, title: 'Prueba', description: '', options: [{ id: 'linea', label: 'Línea', hint: '' }], context: { dim: 'eco' }, expiresWeek: s.week + 3 });
    const before = s.characters[s.player.characterId].rep.confianzaPartido;
    resolveDecision(s, new Rng(s.rng), 'e1', 'linea');
    expect(s.pending.length).toBe(0);
    expect(s.characters[s.player.characterId].rep.confianzaPartido).toBeGreaterThan(before);
    expect(s.history.some((h) => h.title === 'Prueba')).toBe(true);
  });
  it('los eventos respetan su período de enfriamiento', () => {
    const s = structuredClone(newGame());
    const rng = new Rng(s.rng);
    const counts: Record<string, number[]> = {};
    for (let w = 0; w < 300; w++) {
      s.week++;
      processEvents(s, rng);
      s.pending = [];
      for (const [id, n] of Object.entries(s.eventCounts)) (counts[id] ??= []).push(n);
    }
    // ningún evento ocurre más veces que lo que permite su enfriamiento
    expect(s.eventCounts.terremoto ?? 0).toBeLessThanOrEqual(2);
    expect(s.eventCounts.crisis_sanitaria ?? 0).toBeLessThanOrEqual(1);
    expect(s.eventCounts.incendio_forestal ?? 0).toBeLessThanOrEqual(Math.ceil(300 / 30));
  });
});
