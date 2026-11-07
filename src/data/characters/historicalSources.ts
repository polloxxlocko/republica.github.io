/**
 * FUENTES DE LOS DATOS BIOGRÁFICOS REALES.
 * Todas las afirmaciones sobre personas reales (nombre, fecha de nacimiento, militancia, cargos)
 * remiten a una de estas fuentes. Se generan con scripts/data/build_politicians.py.
 */
import data from './generated.json';

export interface HistoricalSource {
  id: string;
  title: string;
  url: string;
  institution: string;
  kind: string;            // 'oficial'
  consulted: string;       // fecha de consulta (AAAA-MM-DD)
  published: string | null; // fecha de publicación del documento, si se conoce (AAAA-MM)
}

export const HISTORICAL_SOURCES: HistoricalSource[] = data.sources as HistoricalSource[];
export const SOURCE_BY_ID: Record<string, HistoricalSource> = Object.fromEntries(HISTORICAL_SOURCES.map((s) => [s.id, s]));
/** Fecha de corte de los datos reales y fecha de inicio del escenario. */
export const REAL_DATA_CONSULTED = data.consulted;
export const SCENARIO_START = data.scenarioDate;
