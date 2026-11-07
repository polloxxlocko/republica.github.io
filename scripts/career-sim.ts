/** Simulación rápida de carreras (diagnóstico): un/a joven militante que juega con una política simple. */
import { createScenario } from '../src/game/scenarios';
import { advanceWeek, dispatch } from '../src/game/engine/game';
import { actionBlocked, aspirationTargets, campaignTargets, type PlayerAction } from '../src/game/systems/player';
import { careerSummary } from '../src/game/career/summary';
import { capitalOf, stagnationWeeks } from '../src/game/career/capital';
import type { GameState } from '../src/game/models/types';

const seeds = (process.env.SEEDS ?? '1,2,3').split(',').map(Number);
const years = Number(process.env.YEARS ?? 8);
for (const seed of seeds) {
  let s: GameState = createScenario({ name: 'sim', seed, difficulty: 'normal', scenarioId: 'chile2026', player: { firstName: 'Camila', lastName: 'Rojas', gender: 'f', age: 22, regionId: 'BI', comuna: 'Concepción', profession: 'estudiante', education: 'universitaria_curso', traits: ['orador', 'organizador'], interests: ['educacion'], organization: seed % 2 ? 'federacion_estudiantil' : null, experience: 'ninguna', partyId: seed % 3 === 0 ? null : seed % 3 === 1 ? 'PS' : 'RN', ideologyOffset: {}, goal: '', startRole: 'militante', attrPoints: { oratoria: 10, redes: 10 } } });
  const opps: Record<string, number> = {};
  const tryA = (a: PlayerAction) => { if (!actionBlocked(s, a)) s = dispatch(s, a).state; };
  for (let w = 0; w < years * 52; w++) {
    for (const o of [...s.career.opportunities]) { opps[o.kind] = (opps[o.kind] ?? 0) + 1; tryA({ type: 'responder_oportunidad', id: o.id, option: o.options[(seed + w) % o.options.length].id }); }
    for (const d of [...s.pending]) tryA({ type: 'resolver_decision', decisionId: d.id, optionId: d.options[0].id });
    for (const t of aspirationTargets(s)) if (!t.blocked) tryA({ type: 'aspirar', electionId: t.electionId, office: t.office, unitId: t.units[0].id });
    const ct = campaignTargets(s); if (ct.length) tryA({ type: 'trabajar_campana', charId: ct[0].id });
    if (s.player.campaign) tryA({ type: 'actividad_campana' });
    for (const a of [{ type: 'asamblea' }, { type: 'organizacion_social' }, { type: 'semana_distrital' }, { type: 'atender_vecinos' }, { type: 'debate_publico' }, { type: 'recaudar', mode: 'legal' }] as PlayerAction[]) tryA(a);
    s = advanceWeek(s).state;
  }
  const sum = careerSummary(s);
  console.log(`\n=== semilla ${seed} · ${s.characters[s.player.characterId].partyId ?? 'IND'} · ${years} años · estancado ${stagnationWeeks(s)} sem`);
  console.log('Cargos:', sum.offices.map((o) => `${o.type}@${o.from}${o.to ? '-' + o.to : ''}`).join(', '));
  console.log('Elecciones', sum.elections, 'Nominaciones', sum.nominations, 'peak', sum.peak, 'score', sum.score, sum.archetype);
  console.log('Capital', JSON.stringify(capitalOf(s)));
  console.log('Oportunidades vistas', JSON.stringify(opps));
  console.log('Procesos', s.career.processes.filter((p) => p.aspirants.some((a) => a.charId === s.player.characterId)).map((p) => `${p.office}/${p.unitLabel}:${p.status}:${p.aspirants.find((a) => a.charId === s.player.characterId)!.status}(${p.aspirants.length})`).join(' | '));
  const lat: Record<string, number> = {}; for (const l of s.career.latent) lat[`${l.kind}:${l.status}${l.chosenId === s.player.characterId ? ':YO' : ''}`] = (lat[`${l.kind}:${l.status}${l.chosenId === s.player.characterId ? ':YO' : ''}`] ?? 0) + 1;
  console.log('Latentes', JSON.stringify(lat));
  console.log('Informes', s.career.intel.length, 'verificados', s.career.intel.filter((r) => r.verified).map((r) => r.verified).join(','));
  console.log('Fuentes', JSON.stringify(s.career.sources));
  console.log('Hitos', JSON.stringify(s.career.firsts));
  console.log('Balances', JSON.stringify(s.career.reviews.map((r) => [r.office, r.won, r.closeness, r.expectation])));
  console.log('Intel muestra:', s.career.intel.slice(-6).map((r) => `[${r.source}/${r.reliability}${r.verified ? '/' + r.verified : ''}] ${r.text}`).join('\n  '));
  console.log('Bio:', s.career.bio.slice(-14).map((b) => `[${b.date.slice(0, 7)}] ${b.title}`).join('\n  '));
}
