/**
 * CATÁLOGO DE PARTIDOS POLÍTICOS.
 *
 * - Nombres oficiales y siglas de los 15 partidos vigentes: lista aportada por el usuario
 *   como extracto del registro de partidos constituidos del SERVEL con corte al 30-09-2026.
 *   En la sesión de desarrollo NO fue posible consultar servel.cl (bloqueo de red), por lo que
 *   la vigencia se marca como "aportado_por_usuario" y debe verificarse (ver POLITICAL_DATA.md).
 * - Fechas de fundación: conocimiento general documentado; las marcadas "s/i" no se verificaron.
 * - Posiciones ideológicas, militancia, recursos, popularidad, organización y facciones son
 *   PARÁMETROS ESTIMADOS DE BALANCE, no mediciones oficiales.
 */
import type { Ideology, LegalStatus, PartyGoals, PolicyArea, Provenance } from '../models/types';

export interface PartySeed {
  id: string;
  name: string;
  short: string;
  color: string;
  founded: string;
  legalStatus: LegalStatus;
  family: string;
  description: string;
  ideology: Ideology;
  members: number;
  baseShare: number;          // % de apoyo base estimado (balance)
  regionalBias?: Partial<Record<string, number>>; // multiplicador regional estimado
  priorities: PolicyArea[];
  goals: PartyGoals;
  mergedInto?: string;
  statusNote?: string;
  constitutedOn?: string;     // fecha de constitución legal según SERVEL
}

const I = (eco: number, val: number, seg: number, inst: number, amb: number, soc: number, ord: number, lab: number): Ideology =>
  ({ eco, val, seg, inst, amb, soc, ord, lab });

export const PARTY_PROVENANCE: Provenance = {
  source: 'SERVEL — Partidos constituidos (https://www.servel.cl/partidos-politicos/partidos-constituidos/)',
  cutoff: '2026-09-30',
  consulted: '2026-11-06',
  confidence: 'alta',
  nature: 'documentado',
  version: '1.1.0',
  notes: 'Nombres y fechas de constitución verificados en SERVEL. Siglas de uso común (SERVEL no las lista). Atributos políticos son estimaciones de balance.',
};

export const HISTORICAL_PROVENANCE: Provenance = {
  source: 'Conocimiento general (BCN / prensa histórica); situación jurídica 2026 no verificada',
  cutoff: '2026-09-30',
  confidence: 'baja',
  nature: 'estimado',
  version: '1.0.0',
  notes: 'Partidos históricos o en otra situación jurídica. No participan al inicio de la partida.',
};

export const CONSTITUTED_PARTIES: PartySeed[] = [
  {
    id: 'PDC', constitutedOn: '1988-05-02', name: 'Partido Demócrata Cristiano', short: 'PDC', color: '#4fa3e0', founded: '1957', legalStatus: 'constituido',
    family: 'Centro / humanismo cristiano', description: 'Partido de centro de tradición socialcristiana, con larga trayectoria de gobierno.',
    ideology: I(-10, 12, 5, -25, -15, -25, 30, -25), members: 25000, baseShare: 4,
    regionalBias: { ML: 2.0, NB: 2.2, BI: 1.5, OH: 1.7, AR: 1.4, RM: 0.7 }, priorities: ['salud', 'educacion', 'pensiones'],
    goals: { votes: 0.35, office: 0.3, policy: 0.2, identity: 0.15 },
  },
  {
    id: 'PPD', constitutedOn: '1988-05-09', name: 'Partido Por la Democracia', short: 'PPD', color: '#f5a800', founded: '1987', legalStatus: 'constituido',
    family: 'Centroizquierda / socialdemocracia', description: 'Partido instrumental fundado para el plebiscito de 1988, hoy de orientación socialdemócrata liberal.',
    ideology: I(-25, -50, -10, -20, -30, -40, 0, -35), members: 22000, baseShare: 4.5,
    regionalBias: { VA: 1.15, LL: 1.1 }, priorities: ['educacion', 'salud', 'trabajo'],
    goals: { votes: 0.35, office: 0.35, policy: 0.2, identity: 0.1 },
  },
  {
    id: 'PR', constitutedOn: '1994-08-18', name: 'Partido Radical de Chile', short: 'PR', color: '#e85d75', founded: '1863', legalStatus: 'constituido',
    family: 'Centroizquierda / radicalismo laico', description: 'Heredero del radicalismo histórico chileno; laico y socialdemócrata.',
    ideology: I(-25, -45, -10, -15, -20, -40, 5, -35), members: 15000, baseShare: 2,
    regionalBias: { AT: 3.2, CO: 2.4, AN: 1.8, AR: 1.8, LR: 1.6, RM: 0.6 }, priorities: ['educacion', 'descentralizacion', 'probidad'],
    goals: { votes: 0.3, office: 0.45, policy: 0.15, identity: 0.1 },
  },
  {
    id: 'PS', constitutedOn: '1990-12-19', name: 'Partido Socialista de Chile', short: 'PS', color: '#ef4135', founded: '1933', legalStatus: 'constituido',
    family: 'Izquierda / socialismo democrático', description: 'Partido histórico de la izquierda chilena, eje del socialismo democrático.',
    ideology: I(-45, -50, -20, -20, -30, -55, -15, -55), members: 33000, baseShare: 9,
    regionalBias: { BI: 1.15, AN: 1.1, MA: 1.15, LR: 1.1 }, priorities: ['pensiones', 'salud', 'trabajo'],
    goals: { votes: 0.35, office: 0.3, policy: 0.25, identity: 0.1 },
  },
  {
    id: 'FRVS', constitutedOn: '2017-04-13', name: 'Federación Regionalista Verde Social', short: 'FRVS', color: '#2e9d47', founded: '2017', legalStatus: 'constituido',
    family: 'Regionalismo / ecologismo social', description: 'Federación de raíz regionalista y ambientalista.',
    ideology: I(-35, -30, -15, -80, -70, -45, -30, -40), members: 8000, baseShare: 1.5,
    regionalBias: { AN: 3.2, AI: 4.5, MA: 3.5, LL: 2.2, AT: 2.0, RM: 0.4 }, priorities: ['descentralizacion', 'medioambiente', 'salud'],
    goals: { votes: 0.3, office: 0.25, policy: 0.25, identity: 0.2 },
  },
  {
    id: 'PL', constitutedOn: '2018-11-13', name: 'Partido Liberal de Chile', short: 'PL', color: '#00b5e2', founded: '2013', legalStatus: 'constituido',
    family: 'Centro / liberalismo progresista', description: 'Partido liberal en lo valórico, de centroizquierda moderada.',
    ideology: I(-5, -65, -15, -25, -35, -25, 0, -10), members: 10000, baseShare: 2,
    regionalBias: { VA: 2.6, OH: 1.6, CO: 1.6, RM: 1.0, AI: 0.6 }, priorities: ['probidad', 'educacion', 'medioambiente'],
    goals: { votes: 0.4, office: 0.3, policy: 0.2, identity: 0.1 },
  },
  {
    id: 'PDG', constitutedOn: '2021-07-26', name: 'Partido de la Gente', short: 'PDG', color: '#f07c1f', founded: '2019', legalStatus: 'constituido',
    family: 'Populismo antiestablishment / centro heterodoxo', description: 'Fuerza crítica de los partidos tradicionales, con fuerte presencia digital.',
    ideology: I(15, 5, 35, -20, 15, 0, -30, 0), members: 30000, baseShare: 11,
    regionalBias: { AN: 1.5, TA: 1.4, AP: 1.3, AT: 1.3, CO: 1.15 }, priorities: ['economia', 'seguridad', 'probidad'],
    goals: { votes: 0.6, office: 0.2, policy: 0.1, identity: 0.1 },
  },
  {
    id: 'EVO', constitutedOn: '2016-04-13', name: 'Evolución Política', short: 'Evópoli', color: '#18b28a', founded: '2012', legalStatus: 'constituido',
    family: 'Centroderecha liberal', description: 'Centroderecha liberal en lo económico y moderada en lo valórico.',
    ideology: I(55, -10, 30, -30, 25, 45, 45, 50), members: 7000, baseShare: 2.5,
    regionalBias: { RM: 1.5, MA: 2.6, AI: 2.2, LL: 1.8, AR: 1.4 }, priorities: ['economia', 'educacion', 'descentralizacion'],
    goals: { votes: 0.35, office: 0.35, policy: 0.2, identity: 0.1 },
  },
  {
    id: 'PC', constitutedOn: '2010-05-28', name: 'Partido Comunista de Chile', short: 'PC', color: '#b3001b', founded: '1912', legalStatus: 'constituido',
    family: 'Izquierda / comunismo', description: 'Partido de izquierda con fuerte arraigo sindical y territorial.',
    ideology: I(-80, -55, -55, -20, -40, -75, -70, -85), members: 45000, baseShare: 7.5,
    regionalBias: { RM: 1.15, VA: 1.05, AR: 0.8, AI: 0.8 }, priorities: ['trabajo', 'pensiones', 'salud'],
    goals: { votes: 0.25, office: 0.2, policy: 0.3, identity: 0.25 },
  },
  {
    id: 'UDI', constitutedOn: '1989-05-03', name: 'Unión Demócrata Independiente', short: 'UDI', color: '#29348f', founded: '1983', legalStatus: 'constituido',
    family: 'Derecha / conservadurismo popular', description: 'Partido de derecha con trabajo territorial en sectores populares.',
    ideology: I(70, 55, 65, 0, 45, 55, 60, 60), members: 18000, baseShare: 8,
    regionalBias: { ML: 1.2, NB: 1.15, OH: 1.1, AR: 1.1 }, priorities: ['seguridad', 'economia', 'vivienda'],
    goals: { votes: 0.35, office: 0.35, policy: 0.2, identity: 0.1 },
  },
  {
    id: 'RN', constitutedOn: '1988-02-08', name: 'Renovación Nacional', short: 'RN', color: '#2f6fd1', founded: '1987', legalStatus: 'constituido',
    family: 'Centroderecha / liberal-conservadora', description: 'Principal partido histórico de la centroderecha, de tradición liberal-conservadora.',
    ideology: I(55, 25, 50, -20, 35, 45, 50, 50), members: 30000, baseShare: 9,
    regionalBias: { LR: 1.2, LL: 1.2, AR: 1.15, AI: 1.2 }, priorities: ['seguridad', 'economia', 'descentralizacion'],
    goals: { votes: 0.35, office: 0.35, policy: 0.2, identity: 0.1 },
  },
  {
    id: 'FA', constitutedOn: '2024-07-02', name: 'Frente Amplio', short: 'FA', color: '#8e4fc1', founded: '2024', legalStatus: 'constituido',
    family: 'Izquierda / nueva izquierda', description: 'Partido unificado (2024) a partir de organizaciones de la coalición homónima; no confundir con la coalición previa.',
    ideology: I(-60, -80, -55, -45, -70, -65, -55, -65), members: 40000, baseShare: 9,
    regionalBias: { RM: 1.2, VA: 1.25, MA: 1.2, AR: 0.75 }, priorities: ['medioambiente', 'educacion', 'pensiones'],
    goals: { votes: 0.3, office: 0.25, policy: 0.3, identity: 0.15 },
  },
  {
    id: 'PNL', constitutedOn: '2025-03-06', name: 'Partido Nacional Libertario', short: 'PNL', color: '#c9a400', founded: '2024', legalStatus: 'constituido',
    family: 'Derecha libertaria', description: 'Derecha libertaria en lo económico y de línea dura en seguridad.',
    ideology: I(90, 60, 85, 10, 70, 75, 25, 85), members: 20000, baseShare: 8,
    regionalBias: { RM: 1.1, AN: 1.1, VA: 1.05 }, priorities: ['seguridad', 'impuestos', 'migracion'],
    goals: { votes: 0.45, office: 0.15, policy: 0.2, identity: 0.2 },
  },
  {
    id: 'REP', constitutedOn: '2020-01-23', name: 'Partido Republicano', short: 'Republicanos', color: '#1b3f8a', founded: '2019', legalStatus: 'constituido',
    family: 'Derecha conservadora', description: 'Derecha conservadora con énfasis en seguridad, orden y migración.',
    ideology: I(70, 80, 85, 15, 55, 60, 55, 65), members: 40000, baseShare: 18,
    regionalBias: { AR: 1.3, LR: 1.1, ML: 1.15, NB: 1.15, MA: 0.85 }, priorities: ['seguridad', 'migracion', 'economia'],
    goals: { votes: 0.4, office: 0.3, policy: 0.15, identity: 0.15 },
  },
  {
    id: 'PCC', constitutedOn: '2026-07-23', name: 'Partido Cristiano de Chile', short: 'PCCh', color: '#9c6b3c', founded: 's/i', legalStatus: 'constituido',
    family: 'Derecha confesional (estimado)', description: 'Partido de inspiración cristiana. Atributos estimados; verificar ficha oficial en SERVEL.',
    ideology: I(40, 85, 60, 0, 30, 30, 40, 30), members: 5000, baseShare: 1.5,
    regionalBias: { BI: 2.8, AR: 3.0, ML: 2.2, NB: 2.0, RM: 0.6 }, priorities: ['seguridad', 'educacion', 'salud'],
    goals: { votes: 0.35, office: 0.2, policy: 0.2, identity: 0.25 },
    statusNote: 'Constituido el 23-07-2026 según SERVEL; orientación y atributos estimados.',
  },
];

/** Partidos históricos o en otras situaciones jurídicas (inactivos al inicio). */
export const HISTORICAL_PARTIES: PartySeed[] = [
  { id: 'EVA', name: 'Ecologista Verde Animalista', short: 'Verde Animalista', color: '#7cb342', founded: 's/i', legalStatus: 'en_formacion', family: 'Ecologismo / animalismo (estimado)', description: 'Partido en formación según SERVEL (consulta 06-11-2026). SERVEL no publica sigla; la etiqueta corta no es oficial.', ideology: I(-35, -55, -30, -40, -85, -40, -40, -35), members: 0, baseShare: 0, priorities: ['medioambiente'], goals: { votes: 0.3, office: 0.2, policy: 0.3, identity: 0.2 }, statusNote: 'En formación (SERVEL, consulta 06-11-2026).' },
  { id: 'PSC', name: 'Partido Social Cristiano', short: 'PSC', color: '#7a5230', founded: '2022', legalStatus: 'historico', family: 'Derecha confesional', description: 'Partido evangélico-conservador.', ideology: I(45, 85, 65, 5, 35, 40, 45, 40), members: 0, baseShare: 0, priorities: ['seguridad'], goals: { votes: 0.4, office: 0.2, policy: 0.2, identity: 0.2 }, statusNote: 'Situación jurídica 2026 no verificada.' },
  { id: 'PH', name: 'Partido Humanista', short: 'PH', color: '#ff8a1e', founded: '1984', legalStatus: 'historico', family: 'Humanismo / izquierda', description: 'Partido humanista de larga trayectoria.', ideology: I(-55, -70, -45, -40, -55, -60, -60, -60), members: 0, baseShare: 0, priorities: ['salud'], goals: { votes: 0.3, office: 0.2, policy: 0.3, identity: 0.2 }, statusNote: 'Situación jurídica 2026 no verificada.' },
  { id: 'AH', name: 'Partido Acción Humanista', short: 'AH', color: '#ffa94d', founded: 's/i', legalStatus: 'historico', family: 'Humanismo', description: 'Escisión humanista.', ideology: I(-50, -65, -40, -35, -50, -55, -50, -55), members: 0, baseShare: 0, priorities: ['salud'], goals: { votes: 0.3, office: 0.2, policy: 0.3, identity: 0.2 }, statusNote: 'Fecha de fundación y situación jurídica no verificadas.' },
  { id: 'DEM', name: 'Partido Demócratas Chile', short: 'Demócratas', color: '#5b8bd6', founded: 's/i', legalStatus: 'historico', family: 'Centro', description: 'Partido de centro surgido de ex militantes DC.', ideology: I(20, 20, 35, -15, 15, 15, 45, 15), members: 0, baseShare: 0, priorities: ['seguridad'], goals: { votes: 0.4, office: 0.3, policy: 0.2, identity: 0.1 }, statusNote: 'Situación jurídica 2026 no verificada.' },
  { id: 'AMA', name: 'Movimiento Amarillos por Chile', short: 'Amarillos', color: '#ffd23f', founded: 's/i', legalStatus: 'historico', family: 'Centro', description: 'Movimiento de centro reformista.', ideology: I(15, -5, 25, -10, 10, 10, 50, 10), members: 0, baseShare: 0, priorities: ['economia'], goals: { votes: 0.4, office: 0.3, policy: 0.2, identity: 0.1 }, statusNote: 'Situación jurídica 2026 no verificada.' },
  { id: 'PEV', name: 'Partido Ecologista Verde', short: 'PEV', color: '#65b844', founded: 's/i', legalStatus: 'historico', family: 'Ecologismo', description: 'Partido ecologista.', ideology: I(-45, -60, -40, -55, -90, -50, -50, -45), members: 0, baseShare: 0, priorities: ['medioambiente'], goals: { votes: 0.3, office: 0.2, policy: 0.3, identity: 0.2 }, statusNote: 'Situación jurídica 2026 no verificada.' },
  { id: 'AVP', name: 'Partido Alianza Verde Popular', short: 'AVP', color: '#4c9a2a', founded: 's/i', legalStatus: 'historico', family: 'Ecologismo popular', description: 'Partido verde de orientación popular.', ideology: I(-40, -45, -20, -50, -80, -45, -40, -40), members: 0, baseShare: 0, priorities: ['medioambiente'], goals: { votes: 0.3, office: 0.2, policy: 0.3, identity: 0.2 }, statusNote: 'Situación jurídica 2026 no verificada.' },
  { id: 'IGU', name: 'Partido Igualdad', short: 'Igualdad', color: '#d94848', founded: 's/i', legalStatus: 'historico', family: 'Izquierda poblacional', description: 'Partido de izquierda de base poblacional.', ideology: I(-75, -50, -50, -40, -50, -70, -75, -75), members: 0, baseShare: 0, priorities: ['vivienda'], goals: { votes: 0.25, office: 0.15, policy: 0.3, identity: 0.3 }, statusNote: 'Situación jurídica 2026 no verificada.' },
  { id: 'PPOP', name: 'Partido Popular', short: 'PP', color: '#a0522d', founded: 's/i', legalStatus: 'historico', family: 'Sin clasificación verificada', description: 'Ficha no verificada.', ideology: I(30, 20, 50, -10, 20, 10, -10, 20), members: 0, baseShare: 0, priorities: ['seguridad'], goals: { votes: 0.5, office: 0.2, policy: 0.15, identity: 0.15 }, statusNote: 'Orientación y situación jurídica no verificadas.' },
  { id: 'PTR', name: 'Partido de Trabajadores Revolucionarios', short: 'PTR', color: '#9d0a0a', founded: 's/i', legalStatus: 'historico', family: 'Izquierda trotskista', description: 'Partido de izquierda revolucionaria.', ideology: I(-95, -70, -70, -30, -55, -85, -95, -95), members: 0, baseShare: 0, priorities: ['trabajo'], goals: { votes: 0.2, office: 0.05, policy: 0.3, identity: 0.45 }, statusNote: 'Situación jurídica 2026 no verificada.' },
  { id: 'PATP', name: 'Patria Progresista', short: 'PatriaP', color: '#e0457b', founded: 's/i', legalStatus: 'historico', family: 'Sin clasificación verificada', description: 'Ficha no verificada.', ideology: I(-40, -30, -10, -30, -30, -45, -40, -45), members: 0, baseShare: 0, priorities: ['salud'], goals: { votes: 0.4, office: 0.2, policy: 0.2, identity: 0.2 }, statusNote: 'Orientación y situación jurídica no verificadas.' },
  { id: 'SCOM', name: 'Sentido Común', short: 'SC', color: '#6d6d9e', founded: 's/i', legalStatus: 'historico', family: 'Sin clasificación verificada', description: 'Ficha no verificada.', ideology: I(30, 10, 40, -10, 20, 20, 20, 30), members: 0, baseShare: 0, priorities: ['economia'], goals: { votes: 0.4, office: 0.2, policy: 0.2, identity: 0.2 }, statusNote: 'Orientación y situación jurídica no verificadas.' },
  { id: 'RD', name: 'Revolución Democrática', short: 'RD', color: '#3fb0a0', founded: '2012', legalStatus: 'fusionado', mergedInto: 'FA', family: 'Nueva izquierda', description: 'Organización constituyente del Frente Amplio unificado (2024).', ideology: I(-55, -80, -50, -45, -70, -60, -50, -60), members: 0, baseShare: 0, priorities: ['educacion'], goals: { votes: 0.3, office: 0.3, policy: 0.3, identity: 0.1 } },
  { id: 'CS', name: 'Convergencia Social', short: 'CS', color: '#c94f7c', founded: '2018', legalStatus: 'fusionado', mergedInto: 'FA', family: 'Nueva izquierda', description: 'Organización constituyente del Frente Amplio unificado (2024).', ideology: I(-70, -80, -60, -45, -70, -70, -65, -70), members: 0, baseShare: 0, priorities: ['trabajo'], goals: { votes: 0.3, office: 0.3, policy: 0.3, identity: 0.1 } },
  { id: 'COM', name: 'Comunes', short: 'Comunes', color: '#a46fd0', founded: '2019', legalStatus: 'fusionado', mergedInto: 'FA', family: 'Nueva izquierda', description: 'Organización constituyente del Frente Amplio unificado (2024).', ideology: I(-60, -75, -55, -45, -70, -65, -60, -65), members: 0, baseShare: 0, priorities: ['vivienda'], goals: { votes: 0.3, office: 0.3, policy: 0.3, identity: 0.1 } },
  { id: 'PRO', name: 'Partido Progresista', short: 'PRO', color: '#ff6f61', founded: '2010', legalStatus: 'historico', family: 'Progresismo', description: 'Partido progresista fundado en 2010.', ideology: I(-40, -50, -25, -40, -40, -45, -40, -45), members: 0, baseShare: 0, priorities: ['salud'], goals: { votes: 0.4, office: 0.2, policy: 0.2, identity: 0.2 }, statusNote: 'Situación jurídica 2026 no verificada.' },
  { id: 'PN66', name: 'Partido Nacional (1966)', short: 'PN', color: '#3b4a6b', founded: '1966', legalStatus: 'historico', family: 'Derecha histórica', description: 'Partido de derecha histórico (1966-1973).', ideology: I(65, 60, 60, 20, 40, 50, 70, 60), members: 0, baseShare: 0, priorities: ['economia'], goals: { votes: 0.4, office: 0.3, policy: 0.2, identity: 0.1 } },
];
