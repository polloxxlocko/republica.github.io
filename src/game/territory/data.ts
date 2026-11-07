/**
 * DATOS TERRITORIALES OFICIALES (generados por scripts/data/*.py; ver DATA_PIPELINE.md).
 *
 *  - 346 comunas con región, provincia, distrito y circunscripción (SERVEL, archivos de resultados).
 *  - Demografía: INE Censo 2024 (tabulados comunales) y SERVEL padrón definitivo dic. 2023.
 *  - Resultados históricos por comuna: SERVEL (2021, 2022 definitivos; 2025 preliminares).
 *  - Clasificación de candidaturas en bloques: criterio del autor (estimación), ver `blocs`.
 */
import type { RegionId } from '../models/types';
import raw from '../data/territory/comunas.json';

export type Bloc = 'izq' | 'centro' | 'der' | 'pop' | 'otro';

export interface ElectionSummary {
  t: number;                        // participación (votantes / electores)
  bl: Partial<Record<Bloc, number>>; // proporción de votos válidos por bloque
  nb: number;                       // nulos + blancos / votantes
}

export interface ComunaStatic {
  cut: number;
  name: string;
  region: RegionId;
  province: string;
  district: number;
  circ: number;
  electors: number;          // padrón definitivo dic. 2023
  pop: number;               // Censo 2024
  age: [number, number, number, number]; // electores 18-29, 30-49, 50-69, 70+
  eduSup: number; eduLow: number; school: number;
  imm: number; indig: number; cath: number; evang: number; norel: number;
  wood: number; inet: number;
  density: number | null; area: number | null;
  hist: Record<string, ElectionSummary>;       // resumen por elección histórica
  parties: Record<string, Record<string, number>>; // elección -> partido (id del juego) -> proporción de válidos
  mayor2021: string | null;                    // partido (id del juego) del alcalde electo en 2021, si aplica
}

export interface TerritoryData {
  meta: { seats?: Record<string, Record<string, Record<string, number>>>; sources: { id: string; label: string; url: string; consulted: string; status: string }[]; generated: string; notes: string[] };
  comunas: ComunaStatic[];
}

export const TERRITORY = raw as unknown as TerritoryData;
export const COMUNAS: ComunaStatic[] = TERRITORY.comunas;
export const COMUNA_BY_CUT: Record<number, ComunaStatic> = Object.fromEntries(COMUNAS.map((c) => [c.cut, c]));

export const comunasOfDistrict = (d: number) => COMUNAS.filter((c) => c.district === d);
export const comunasOfRegion = (r: RegionId) => COMUNAS.filter((c) => c.region === r);

/** Número de concejales según electores (Ley 18.695, art. 72: 6, 8 o 10). */
export function councilSeats(electors: number): number { return electors > 150000 ? 10 : electors > 70000 ? 8 : 6; }
