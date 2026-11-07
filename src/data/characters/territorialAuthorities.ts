/**
 * AUTORIDADES TERRITORIALES REALES.
 *
 * Estado de la cobertura (consulta 2026-11-07):
 *  - Parlamentarios por región/distrito: incluidos (ver politicalCareers.INITIAL_SEATS).
 *  - Gobernadores regionales (período 2025-2029) y alcaldes (2024-2028): SERVEL no publica los
 *    resultados de 2024 en un formato descargable verificable y los sitios institucionales que los
 *    listan bloquean el acceso automatizado. No se incorporan nombres sin fuente: estos cargos
 *    siguen siendo SIMULADOS y la interfaz los marca como tales.
 */
import { INITIAL_SEATS, type RealSeat } from './politicalCareers';

export interface TerritorialAuthority { personId: string; role: 'gobernador' | 'alcalde'; regionId: string; comunaCut?: number; from: string; to: string; source: string }

export const GOVERNORS: TerritorialAuthority[] = [];
export const MAYORS: TerritorialAuthority[] = [];

export const TERRITORIAL_COVERAGE_NOTE = 'Gobernadores y alcaldes: pendientes de verificación (sin fuente oficial accesible); en la partida son personajes ficticios.';

/** Parlamentarios reales con base en una región (para priorizar encuentros plausibles del jugador). */
export function legislatorsOfRegion(regionId: string): RealSeat[] { return INITIAL_SEATS.filter((s) => s.regionId === regionId); }
