/**
 * Resultados electorales históricos OFICIALES por comuna (carga diferida para la interfaz).
 * Cada fila: [electores, votantes, nulos+blancos, votos por opción...] en el orden de `options`.
 */
import type { Bloc } from './data';

export interface HistOption { k: string; label: string; party: string | null; bloc: Bloc }
export interface HistElection {
  id: string; type: string; date: string; status: string; source: string; split: 'calibracion' | 'validacion';
  options: HistOption[];
  c: Record<string, number[]>;
  seats: Record<string, Record<string, number>>;
}
export interface HistoryData { meta: unknown; elections: HistElection[] }

let p: Promise<HistoryData> | null = null;
export function loadHistory(): Promise<HistoryData> {
  p ??= import('../data/territory/history.json').then((m) => (m.default ?? m) as unknown as HistoryData);
  return p;
}

export const HIST_LABELS: Record<string, string> = {
  P2021_1: 'Presidencial 2021 · 1ª vuelta', P2021_2: 'Presidencial 2021 · 2ª vuelta', D2021: 'Diputados 2021', PLEB2022: 'Plebiscito 2022',
  A2021: 'Alcaldes 2021', P2025_1: 'Presidencial 2025 · 1ª vuelta (prelim.)', P2025_2: 'Presidencial 2025 · 2ª vuelta (prelim.)', D2025: 'Diputados 2025 (prelim.)',
};

/** Resumen de una fila: participación, válidos y proporciones por opción y bloque. */
export function summarize(e: HistElection, row: number[] | undefined) {
  if (!row) return null;
  const [el, voters, nb] = row;
  const votes = row.slice(3);
  const valid = votes.reduce((a, b) => a + b, 0);
  const shares: Record<string, number> = {}; const blocs: Partial<Record<Bloc, number>> = {};
  e.options.forEach((o, i) => { const v = valid ? votes[i] / valid : 0; shares[o.k] = v; blocs[o.bloc] = (blocs[o.bloc] ?? 0) + v; });
  const ranked = e.options.map((o, i) => ({ o, v: votes[i] })).sort((a, b) => b.v - a.v);
  return { electors: el, voters, nullBlank: nb, valid, turnout: el ? voters / el : 0, shares, blocs, winner: ranked[0]?.o ?? null, margin: valid ? ((ranked[0]?.v ?? 0) - (ranked[1]?.v ?? 0)) / valid : 0 };
}
