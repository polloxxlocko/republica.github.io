import type { NewGameConfig } from '../src/game/scenarios/chile2026';
import { createScenario } from '../src/game/scenarios';

export function cfg(over: Partial<NewGameConfig['player']> = {}, seed = 42, difficulty: NewGameConfig['difficulty'] = 'normal'): NewGameConfig {
  return {
    name: 'Prueba', seed, difficulty, scenarioId: 'chile2026',
    player: { firstName: 'Ana', lastName: 'Pérez Soto', gender: 'f', age: 38, regionId: 'BI', comuna: 'Concepción', profession: 'abogacia', experience: 'local', partyId: 'PS', ideologyOffset: {}, goal: 'Llegar a la Presidencia', startRole: 'militante', attrPoints: { carisma: 10, negociacion: 10 }, ...over },
  };
}
export const newGame = (o: Partial<NewGameConfig['player']> = {}, seed = 42) => createScenario(cfg(o, seed));
