/** Selectores y formateadores de solo lectura para la interfaz (no mutan el estado). */
import type { Character, GameState, OfficeType, Party } from '../game/models/types';
import { formatDate, weekToISO } from '../game/engine/dates';
import { fullName, officeLabel } from '../game/systems/characters';
import { pollAverage } from '../game/systems/polls';
import { ELECTION_LABELS, nextElection } from '../game/systems/elections';
import { leftRight } from '../game/systems/util';
import { REGION_BY_ID } from '../game/data/geography';
import { MINISTRY_BY_ID } from '../game/data/institutions';

export const IND = { id: 'IND', short: 'IND', name: 'Independientes', color: '#8a94ab' };

export function partyColor(g: GameState, id: string | null | undefined): string {
  if (!id || id === 'IND') return IND.color;
  if (id === 'VAC') return '#3a4560';
  return g.parties[id]?.color ?? '#6b7280';
}
export function partyShort(g: GameState, id: string | null | undefined): string {
  if (!id || id === 'IND') return 'IND';
  return g.parties[id]?.short ?? id;
}
export function partyName(g: GameState, id: string | null | undefined): string {
  if (!id || id === 'IND') return 'Independiente';
  return g.parties[id]?.name ?? id;
}

export function playerChar(g: GameState): Character { return g.characters[g.player.characterId]; }

export function mainOffice(c: Character): OfficeType {
  const order: OfficeType[] = ['presidente', 'ministro', 'senador', 'diputado', 'gobernador', 'alcalde', 'presidente_partido', 'concejal', 'dirigente_territorial'];
  for (const o of order) if (c.offices.some((x) => x.type === o)) return o;
  return 'militante';
}

export function officeText(g: GameState, c: Character): string {
  if (c.offices.length === 0) return c.partyId ? `Militante de ${partyShort(g, c.partyId)}` : 'Independiente sin cargo';
  return c.offices.map((o) => {
    const base = officeLabel(o.type, c.gender);
    if (o.type === 'diputado' && o.districtId) return `${base} · D${o.districtId}`;
    if (o.type === 'senador' && o.regionId) return `${base} · ${REGION_BY_ID[o.regionId].shortName}`;
    if (o.type === 'ministro' && o.ministryId) return `${base} de ${MINISTRY_BY_ID[o.ministryId].name}`;
    if (o.type === 'presidente_partido' && o.partyId) return `${base} ${partyShort(g, o.partyId)}`;
    if ((o.type === 'alcalde' || o.type === 'concejal') && o.comuna) return `${base} de ${o.comuna}`;
    if (o.type === 'gobernador' && o.regionId) return `${base} de ${REGION_BY_ID[o.regionId].shortName}`;
    return base;
  }).join(' · ');
}

export function dateLabel(g: GameState): string { return formatDate(weekToISO(g.startDate, g.week)); }

export function nextElectionInfo(g: GameState) {
  const e = nextElection(g);
  if (!e) return null;
  return { e, label: ELECTION_LABELS[e.type], weeks: e.week - g.week };
}

export function sortedParties(g: GameState, onlyActive = true): Party[] {
  return Object.values(g.parties).filter((p) => !onlyActive || p.active).sort((a, b) => leftRight(a.ideology) - leftRight(b.ideology));
}

export function pollAvg(g: GameState, weeks = 8) { return pollAverage(g, 'partidos', weeks); }

export function seatsByParty(g: GameState, chamber: 'camara' | 'senado'): Record<string, number> {
  const out: Record<string, number> = {};
  for (const st of g.seats) if (st.chamber === chamber) {
    const p = st.holderId ? g.characters[st.holderId]?.partyId ?? 'IND' : 'VAC';
    out[p] = (out[p] ?? 0) + 1;
  }
  return out;
}

export const charName = (g: GameState, id: string | null | undefined) => (id ? fullName(g.characters[id]) : '—');

export const pct = (v: number, d = 1) => `${(Number.isFinite(v) ? v : 0).toFixed(d).replace('.', ',')}%`;
export const num = (v: number, d = 0) => (Number.isFinite(v) ? v : 0).toLocaleString('es-CL', { maximumFractionDigits: d, minimumFractionDigits: d });
export const mm = (v: number) => `${num(v)} MM$`;
