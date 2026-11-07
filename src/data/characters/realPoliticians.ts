/**
 * PERSONAS REALES DEL ESCENARIO 2026 (identidad histórica verificable).
 *
 * Este módulo contiene SOLO hechos documentados: nombres, fecha de nacimiento (si consta en una
 * fuente oficial), militancias con fechas y cargos públicos. Nada de lo que ocurre en la partida
 * se escribe aquí: la historia alternativa vive en el estado de juego (Character), separado.
 *
 * El identificador no depende del partido: un cambio de militancia no crea duplicados.
 * Los atributos numéricos que el motor asigna a estas personas son convenciones de simulación,
 * no evaluaciones de las personas reales (ver SIMULATION_CONVENTIONS).
 */
import data from './generated.json';

export interface Membership { party: string | null; realParty: string; from: string | null; to: string | null; source: string; note?: string }
export interface RealPosition { role: string; label: string; from: string | null; to: string | null; source: string; party?: string; asOf?: string | null; note?: string }

export interface RealPolitician {
  id: string;
  givenNames: string;
  surnames: string;
  fullName: string;
  publicName: string;
  gender: 'f' | 'm' | null;
  birthDate: string | null;      // null = no documentada en las fuentes consultadas
  birthSource: string | null;
  memberships: Membership[];
  positions: RealPosition[];
  regionId: string | null;
  sources: string[];
  updated: string;
}

export const REAL_POLITICIANS: RealPolitician[] = data.people as RealPolitician[];
export const REAL_BY_ID: Record<string, RealPolitician> = Object.fromEntries(REAL_POLITICIANS.map((p) => [p.id, p]));

/** Militancia vigente en una fecha (según las fuentes); null = independiente o sin dato. */
export function partyAt(p: RealPolitician, date: string): Membership | null {
  const cur = p.memberships.filter((m) => (!m.from || m.from <= date) && (!m.to || m.to >= date));
  return cur.length ? cur[cur.length - 1] : null;
}

/**
 * Convenciones de simulación para personas reales. No son juicios sobre ellas:
 *  - atributos uniformes según el cargo (no hay variación individual);
 *  - ideología igual a la del partido (no se atribuyen posiciones personales);
 *  - sin rasgos de personalidad, sin escándalos ni fallecimientos simulados;
 *  - las relaciones entre personas reales parten neutras.
 */
export const SIMULATION_CONVENTIONS = [
  'Los atributos numéricos de las personas reales son convenciones uniformes según su cargo, no evaluaciones de su desempeño ni de su carácter.',
  'Su posición ideológica en el juego es la de su partido: el juego no atribuye posiciones personales.',
  'El juego no les asigna rasgos de personalidad, escándalos, delitos, problemas de salud ni fallecimientos.',
  'Las relaciones entre personas reales comienzan neutras: no se programan enemistades ni lealtades históricas.',
  'Todo lo que les ocurre desde el inicio de la partida (9 de noviembre de 2026) es ficción.',
];
