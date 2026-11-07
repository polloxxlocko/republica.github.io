/**
 * DATOS TERRITORIALES Y ELECTORALES.
 * - 16 regiones, capitales y número de comunas por región (346 en total): documentado.
 * - Distritos de diputados (28) y su magnitud (155 escaños), circunscripciones senatoriales (16) y
 *   escaños por circunscripción (50): según Ley 20.840 (sistema proporcional, 2015). Documentado.
 * - Población: aproximación al Censo 2024 (INE), redondeada. Confianza media.
 * - Indicadores económicos regionales, urbanización y prioridades: ESTIMADOS para balance.
 * - Grupos de renovación del Senado: aproximación configurable (confianza baja, verificar).
 */
import type { PolicyArea, Provenance, RegionId } from '../models/types';

export interface RegionSeed {
  id: RegionId;
  name: string;
  shortName: string;
  roman: string;
  capital: string;
  population: number;
  comunas: number;
  urbanization: number;   // 0..1 (estimado)
  economy: string;
  incomeIndex: number;    // estimado (100 = promedio)
  unemployment: number;   // estimado %
  infrastructure: number; // estimado 0..100
  priorities: Partial<Record<PolicyArea, number>>;
  problems: string[];
  senateSeats: number;
  senateGroup: 'A' | 'B';
  order: number;          // norte (1) a sur (16)
}

export const GEO_PROVENANCE: Provenance = {
  source: 'Ley 20.840 (distritos y circunscripciones); INE Censo 2024 (población, aproximada); división político-administrativa vigente',
  cutoff: '2026-09-30',
  confidence: 'media',
  nature: 'documentado',
  version: '1.0.0',
  notes: 'Indicadores económicos regionales y prioridades son estimados. Grupos de renovación senatorial: aproximación a verificar.',
};

export const REGIONS: RegionSeed[] = [
  { id: 'AP', name: 'Arica y Parinacota', shortName: 'Arica', roman: 'XV', capital: 'Arica', population: 245000, comunas: 4, urbanization: 0.92, economy: 'Comercio, servicios y agricultura de valles', incomeIndex: 86, unemployment: 8.4, infrastructure: 52, priorities: { seguridad: 1.5, migracion: 1.4, salud: 1, economia: 1 }, problems: ['Migración irregular en zona fronteriza', 'Crimen organizado'], senateSeats: 2, senateGroup: 'B', order: 1 },
  { id: 'TA', name: 'Tarapacá', shortName: 'Tarapacá', roman: 'I', capital: 'Iquique', population: 370000, comunas: 7, urbanization: 0.94, economy: 'Minería, zona franca y puerto', incomeIndex: 104, unemployment: 8.0, infrastructure: 55, priorities: { seguridad: 1.5, migracion: 1.5, vivienda: 1.1, economia: 1 }, problems: ['Campamentos', 'Presión migratoria'], senateSeats: 2, senateGroup: 'B', order: 2 },
  { id: 'AN', name: 'Antofagasta', shortName: 'Antofagasta', roman: 'II', capital: 'Antofagasta', population: 640000, comunas: 9, urbanization: 0.94, economy: 'Gran minería del cobre y del litio', incomeIndex: 128, unemployment: 7.6, infrastructure: 60, priorities: { seguridad: 1.4, vivienda: 1.2, descentralizacion: 1.2, salud: 1, medioambiente: 0.9 }, problems: ['Campamentos', 'Retorno regional de la renta minera'], senateSeats: 3, senateGroup: 'A', order: 3 },
  { id: 'AT', name: 'Atacama', shortName: 'Atacama', roman: 'III', capital: 'Copiapó', population: 300000, comunas: 9, urbanization: 0.91, economy: 'Minería y agricultura', incomeIndex: 100, unemployment: 8.6, infrastructure: 50, priorities: { economia: 1.2, medioambiente: 1.1, salud: 1.1, trabajo: 1 }, problems: ['Escasez hídrica', 'Dependencia minera'], senateSeats: 2, senateGroup: 'B', order: 4 },
  { id: 'CO', name: 'Coquimbo', shortName: 'Coquimbo', roman: 'IV', capital: 'La Serena', population: 830000, comunas: 15, urbanization: 0.81, economy: 'Minería, agricultura y turismo', incomeIndex: 88, unemployment: 8.8, infrastructure: 54, priorities: { salud: 1.2, economia: 1.1, medioambiente: 1.1, seguridad: 1 }, problems: ['Sequía prolongada', 'Desempleo estacional'], senateSeats: 3, senateGroup: 'A', order: 5 },
  { id: 'VA', name: 'Valparaíso', shortName: 'Valparaíso', roman: 'V', capital: 'Valparaíso', population: 1900000, comunas: 38, urbanization: 0.91, economy: 'Puertos, servicios, industria y turismo', incomeIndex: 94, unemployment: 9.3, infrastructure: 58, priorities: { seguridad: 1.2, vivienda: 1.2, salud: 1.1, trabajo: 1.1 }, problems: ['Incendios forestales', 'Déficit habitacional'], senateSeats: 5, senateGroup: 'A', order: 6 },
  { id: 'RM', name: 'Metropolitana de Santiago', shortName: 'Metropolitana', roman: 'RM', capital: 'Santiago', population: 7400000, comunas: 52, urbanization: 0.96, economy: 'Servicios, finanzas, comercio e industria', incomeIndex: 112, unemployment: 8.7, infrastructure: 72, priorities: { seguridad: 1.5, salud: 1.1, pensiones: 1, transporte: 1, economia: 1 }, problems: ['Crimen organizado', 'Congestión y transporte', 'Segregación urbana'], senateSeats: 5, senateGroup: 'B', order: 7 },
  { id: 'OH', name: "Libertador General Bernardo O'Higgins", shortName: "O'Higgins", roman: 'VI', capital: 'Rancagua', population: 990000, comunas: 33, urbanization: 0.74, economy: 'Agricultura, agroindustria y minería', incomeIndex: 90, unemployment: 8.3, infrastructure: 55, priorities: { salud: 1.2, seguridad: 1.2, economia: 1, trabajo: 1 }, problems: ['Precariedad laboral agrícola', 'Escasez hídrica'], senateSeats: 3, senateGroup: 'B', order: 8 },
  { id: 'ML', name: 'Maule', shortName: 'Maule', roman: 'VII', capital: 'Talca', population: 1120000, comunas: 30, urbanization: 0.68, economy: 'Agricultura, vitivinicultura y forestal', incomeIndex: 80, unemployment: 8.0, infrastructure: 48, priorities: { salud: 1.3, economia: 1.1, seguridad: 1, pensiones: 1.1 }, problems: ['Listas de espera en salud', 'Conectividad rural'], senateSeats: 5, senateGroup: 'B', order: 9 },
  { id: 'NB', name: 'Ñuble', shortName: 'Ñuble', roman: 'XVI', capital: 'Chillán', population: 510000, comunas: 21, urbanization: 0.69, economy: 'Agricultura y forestal', incomeIndex: 76, unemployment: 8.4, infrastructure: 44, priorities: { salud: 1.3, economia: 1.1, descentralizacion: 1.1, pensiones: 1 }, problems: ['Institucionalidad regional reciente', 'Pobreza rural'], senateSeats: 2, senateGroup: 'B', order: 10 },
  { id: 'BI', name: 'Biobío', shortName: 'Biobío', roman: 'VIII', capital: 'Concepción', population: 1610000, comunas: 33, urbanization: 0.88, economy: 'Industria, forestal, pesca y energía', incomeIndex: 88, unemployment: 9.0, infrastructure: 57, priorities: { trabajo: 1.2, seguridad: 1.2, salud: 1.1, economia: 1.1 }, problems: ['Violencia rural en provincia de Arauco', 'Desindustrialización'], senateSeats: 3, senateGroup: 'A', order: 11 },
  { id: 'AR', name: 'La Araucanía', shortName: 'Araucanía', roman: 'IX', capital: 'Temuco', population: 1010000, comunas: 32, urbanization: 0.71, economy: 'Agricultura, forestal y turismo', incomeIndex: 74, unemployment: 8.1, infrastructure: 45, priorities: { seguridad: 1.6, salud: 1.1, economia: 1, descentralizacion: 1 }, problems: ['Conflicto territorial y violencia rural', 'Pobreza'], senateSeats: 5, senateGroup: 'A', order: 12 },
  { id: 'LR', name: 'Los Ríos', shortName: 'Los Ríos', roman: 'XIV', capital: 'Valdivia', population: 400000, comunas: 12, urbanization: 0.72, economy: 'Forestal, agropecuaria y turismo', incomeIndex: 82, unemployment: 7.2, infrastructure: 50, priorities: { salud: 1.2, medioambiente: 1.1, economia: 1, educacion: 1 }, problems: ['Conectividad', 'Calidad del aire'], senateSeats: 3, senateGroup: 'A', order: 13 },
  { id: 'LL', name: 'Los Lagos', shortName: 'Los Lagos', roman: 'X', capital: 'Puerto Montt', population: 890000, comunas: 30, urbanization: 0.73, economy: 'Salmonicultura, ganadería y turismo', incomeIndex: 86, unemployment: 6.8, infrastructure: 48, priorities: { salud: 1.2, infraestructura: 1.2, medioambiente: 1.1, economia: 1 }, problems: ['Conectividad insular', 'Impacto ambiental acuícola'], senateSeats: 3, senateGroup: 'B', order: 14 },
  { id: 'AI', name: 'Aysén del General Carlos Ibáñez del Campo', shortName: 'Aysén', roman: 'XI', capital: 'Coyhaique', population: 101000, comunas: 10, urbanization: 0.80, economy: 'Pesca, ganadería y turismo', incomeIndex: 98, unemployment: 5.5, infrastructure: 38, priorities: { infraestructura: 1.4, descentralizacion: 1.3, salud: 1.2, energia: 1.1 }, problems: ['Aislamiento y costo de vida', 'Conectividad terrestre'], senateSeats: 2, senateGroup: 'A', order: 15 },
  { id: 'MA', name: 'Magallanes y de la Antártica Chilena', shortName: 'Magallanes', roman: 'XII', capital: 'Punta Arenas', population: 170000, comunas: 11, urbanization: 0.92, economy: 'Energía, ganadería, turismo e hidrógeno verde', incomeIndex: 110, unemployment: 4.5, infrastructure: 50, priorities: { descentralizacion: 1.4, energia: 1.2, infraestructura: 1.2, medioambiente: 1.1 }, problems: ['Aislamiento', 'Desarrollo del hidrógeno verde'], senateSeats: 2, senateGroup: 'B', order: 16 },
];

export const REGION_BY_ID: Record<RegionId, RegionSeed> = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, RegionSeed>;

/** Distritos de diputados según Ley 20.840: [número, región, escaños] */
export interface DistrictSeed { id: number; regionId: RegionId; seats: number; name: string; }
const D: [number, RegionId, number][] = [
  [1, 'AP', 3], [2, 'TA', 3], [3, 'AN', 5], [4, 'AT', 5], [5, 'CO', 7], [6, 'VA', 8], [7, 'VA', 8],
  [8, 'RM', 8], [9, 'RM', 7], [10, 'RM', 8], [11, 'RM', 6], [12, 'RM', 7], [13, 'RM', 5], [14, 'RM', 6],
  [15, 'OH', 5], [16, 'OH', 4], [17, 'ML', 7], [18, 'ML', 4], [19, 'NB', 5], [20, 'BI', 8], [21, 'BI', 5],
  [22, 'AR', 4], [23, 'AR', 7], [24, 'LR', 5], [25, 'LL', 4], [26, 'LL', 5], [27, 'AI', 3], [28, 'MA', 3],
];
export const DISTRICTS: DistrictSeed[] = D.map(([id, regionId, seats]) => ({ id, regionId, seats, name: `Distrito ${id}` }));

/** Circunscripciones senatoriales: una por región, numeradas de norte a sur según orden. */
export interface CircSeed { id: number; regionId: RegionId; seats: number; group: 'A' | 'B'; name: string; }
export const CIRCUMSCRIPTIONS: CircSeed[] = REGIONS.map((r) => ({
  id: r.order, regionId: r.id, seats: r.senateSeats, group: r.senateGroup, name: `Circunscripción ${r.shortName}`,
}));

/**
 * Comunas: el modelo admite el catálogo completo (346). Se incluyen las capitales regionales
 * como datos documentados; el resto de comunas se modela de forma agregada por región.
 * Ver POLITICAL_DATA.md (pendiente: incorporar el listado completo comuna→provincia→distrito).
 */
export interface ComunaSeed { name: string; regionId: RegionId; districtId: number | null; capital: boolean; }
export const COMUNAS: ComunaSeed[] = [
  { name: 'Arica', regionId: 'AP', districtId: 1, capital: true },
  { name: 'Iquique', regionId: 'TA', districtId: 2, capital: true },
  { name: 'Antofagasta', regionId: 'AN', districtId: 3, capital: true },
  { name: 'Copiapó', regionId: 'AT', districtId: 4, capital: true },
  { name: 'La Serena', regionId: 'CO', districtId: 5, capital: true },
  { name: 'Valparaíso', regionId: 'VA', districtId: 7, capital: true },
  { name: 'Santiago', regionId: 'RM', districtId: 10, capital: true },
  { name: 'Rancagua', regionId: 'OH', districtId: 15, capital: true },
  { name: 'Talca', regionId: 'ML', districtId: 17, capital: true },
  { name: 'Chillán', regionId: 'NB', districtId: 19, capital: true },
  { name: 'Concepción', regionId: 'BI', districtId: 20, capital: true },
  { name: 'Temuco', regionId: 'AR', districtId: 23, capital: true },
  { name: 'Valdivia', regionId: 'LR', districtId: 24, capital: true },
  { name: 'Puerto Montt', regionId: 'LL', districtId: 26, capital: true },
  { name: 'Coyhaique', regionId: 'AI', districtId: 27, capital: true },
  { name: 'Punta Arenas', regionId: 'MA', districtId: 28, capital: true },
];

export const TOTAL_POPULATION = REGIONS.reduce((a, r) => a + r.population, 0);
/** Proporción del padrón electoral sobre la población (aprox.) */
export const ELECTORATE_RATIO = 0.85;
