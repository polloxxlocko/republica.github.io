/**
 * Registro de escenarios. Cada escenario define su propia configuración institucional,
 * electoral y partidaria (ElectoralRules). Los escenarios históricos están planificados
 * pero NO implementados: requieren datos verificados (ver POLITICAL_DATA.md).
 */
import type { GameState } from '../models/types';
import { createChile2026, type NewGameConfig } from './chile2026';

export interface ScenarioInfo {
  id: string;
  name: string;
  description: string;
  available: boolean;
  rulesNote: string;
  create?: (cfg: NewGameConfig) => GameState;
}

export const SCENARIOS: ScenarioInfo[] = [
  { id: 'chile2026', name: 'Chile 2026', description: 'Escenario contemporáneo. Partidos vigentes según lista SERVEL (corte 30-09-2026) aportada por el usuario; Congreso, gobierno y personajes simulados.', available: true, rulesNote: 'Sistema proporcional D\'Hondt (Ley 20.840), voto obligatorio, segunda vuelta presidencial, gobernadores regionales.', create: createChile2026 },
  { id: 'chile1990', name: 'Chile 1990', description: 'Transición democrática. Pendiente de datos verificados.', available: false, rulesNote: 'Sistema binominal (no aplica D\'Hondt), senadores designados, voto voluntario con inscripción.' },
  { id: 'chile2010', name: 'Chile 2010', description: 'Pendiente de datos verificados.', available: false, rulesNote: 'Sistema binominal; inscripción automática y voto voluntario desde 2012.' },
  { id: 'chile2021', name: 'Chile 2021', description: 'Pendiente de datos verificados.', available: false, rulesNote: 'Ley 20.840; voto voluntario (hasta 2022).' },
  { id: 'ficticio', name: 'República ficticia', description: 'Escenario completamente ficticio (planificado).', available: false, rulesNote: 'Reglas configurables.' },
];

export function createScenario(cfg: NewGameConfig): GameState {
  const sc = SCENARIOS.find((x) => x.id === cfg.scenarioId && x.available && x.create);
  if (!sc?.create) throw new Error(`Escenario no disponible: ${cfg.scenarioId}`);
  return sc.create(cfg);
}
