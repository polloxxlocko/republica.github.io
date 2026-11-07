/**
 * TRAYECTORIAS Y CARGOS REALES AL INICIO DEL ESCENARIO.
 * - careerOf: cargos documentados de una persona (períodos como diputado/a, Senado, Ejecutivo, directivas).
 * - INITIAL_SEATS: escaños del Congreso con titular real verificado (Cámara: los 155; Senado: ver cobertura).
 * - INITIAL_EXECUTIVE: Presidente de la República y ministros confirmados en sitios oficiales.
 */
import data from './generated.json';
import { REAL_BY_ID, type RealPosition } from './realPoliticians';

export interface RealSeat { personId: string; chamber: 'camara' | 'senado'; unit: number | null; regionId: string; party: string | null; realParty: string | null; from: string; to: string; sources: string[]; note?: string }
export interface RealExecutive { personId: string; role: 'presidente' | 'ministro'; ministry?: string; from: string | null; source: string }

export const INITIAL_SEATS: RealSeat[] = data.seats as RealSeat[];
export const INITIAL_EXECUTIVE: RealExecutive[] = data.executive as RealExecutive[];
export const COVERAGE = data.coverage as { deputies: number; senators: number; senateAmbiguousRegions2021: string[]; unmatchedDeputies: string[]; droppedDuplicateSeats: string[] };

export function careerOf(personId: string): RealPosition[] {
  return [...(REAL_BY_ID[personId]?.positions ?? [])].sort((a, b) => (a.from ?? '9999').localeCompare(b.from ?? '9999'));
}
