/**
 * DIRECTIVAS CENTRALES INSCRITAS EN SERVEL (resoluciones de partidos constituidos).
 * La fecha de publicación de cada resolución indica hasta cuándo el dato está verificado.
 * Los cargos vacantes se conservan como vacantes: no se rellenan con personas.
 */
import data from './generated.json';

export interface LeadershipEntry { party: string; role: string; name: string; vacant: boolean; personId: string | null; source: string }

export const PARTY_LEADERSHIP: LeadershipEntry[] = data.leadership as LeadershipEntry[];

const PRES = /^president[ae]( nacional)?$/i;
/** Presidente/a inscrito/a del partido (null si el cargo figura vacante o no hay registro). */
export function registeredPresident(partyId: string): LeadershipEntry | null {
  return PARTY_LEADERSHIP.find((e) => e.party === partyId && PRES.test(e.role)) ?? null;
}
export function boardOf(partyId: string): LeadershipEntry[] { return PARTY_LEADERSHIP.filter((e) => e.party === partyId); }
