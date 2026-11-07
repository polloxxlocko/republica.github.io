import { it, expect } from 'vitest';
import { newGame } from './helpers';
import { advanceWeek } from '../src/game/engine/game';
import { buildUtilityContext, partyOptions, segmentWeights, utility, utilityParts } from '../src/game/systems/electorate';
it('utility == suma de utilityParts (consistencia del camino rápido)', () => {
  const s = newGame({}, 4);
  for (const personal of [false, true]) {
    const ctx = buildUtilityContext(s, personal);
    for (const seg of s.segments.slice(0, 200)) for (const o of partyOptions(s)) {
      const parts = utilityParts(s, seg, o, ctx, segmentWeights(s, seg));
      expect(utility(s, seg, o, ctx, segmentWeights(s, seg))).toBeCloseTo(parts.reduce((a, b) => a + b, 0), 9);
    }
  }
});
it('rendimiento semanal', () => {
  let s = newGame({}, 4);
  const t = performance.now();
  for (let i = 0; i < 52; i++) s = advanceWeek(s).state;
  console.log('ms/semana', ((performance.now() - t) / 52).toFixed(1));
});
