/**
 * Instituciones: ministerios reales (nombres documentados), medios y encuestadoras FICTICIOS.
 * Los medios y encuestadoras son inventados a propósito para no atribuir noticias a medios reales.
 */
import type { MediaOutlet, Ministry } from '../models/types';

export const MINISTRIES: Ministry[] = [
  { id: 'interior', name: 'Interior', area: 'probidad', weight: 1.0 },
  { id: 'seguridad', name: 'Seguridad Pública', area: 'seguridad', weight: 1.0 },
  { id: 'hacienda', name: 'Hacienda', area: 'economia', weight: 1.0 },
  { id: 'segpres', name: 'Secretaría General de la Presidencia', area: 'probidad', weight: 0.9 },
  { id: 'segegob', name: 'Secretaría General de Gobierno', area: 'probidad', weight: 0.8 },
  { id: 'rree', name: 'Relaciones Exteriores', area: 'exterior', weight: 0.8 },
  { id: 'defensa', name: 'Defensa Nacional', area: 'exterior', weight: 0.6 },
  { id: 'economia', name: 'Economía, Fomento y Turismo', area: 'economia', weight: 0.7 },
  { id: 'desarrollo', name: 'Desarrollo Social y Familia', area: 'pensiones', weight: 0.7 },
  { id: 'educacion', name: 'Educación', area: 'educacion', weight: 0.9 },
  { id: 'justicia', name: 'Justicia y Derechos Humanos', area: 'seguridad', weight: 0.6 },
  { id: 'trabajo', name: 'Trabajo y Previsión Social', area: 'trabajo', weight: 0.8 },
  { id: 'mop', name: 'Obras Públicas', area: 'infraestructura', weight: 0.7 },
  { id: 'salud', name: 'Salud', area: 'salud', weight: 0.9 },
  { id: 'vivienda', name: 'Vivienda y Urbanismo', area: 'vivienda', weight: 0.7 },
  { id: 'agricultura', name: 'Agricultura', area: 'economia', weight: 0.4 },
  { id: 'mineria', name: 'Minería', area: 'economia', weight: 0.5 },
  { id: 'transportes', name: 'Transportes y Telecomunicaciones', area: 'transporte', weight: 0.6 },
  { id: 'bienes', name: 'Bienes Nacionales', area: 'descentralizacion', weight: 0.3 },
  { id: 'energia', name: 'Energía', area: 'energia', weight: 0.5 },
  { id: 'medioambiente', name: 'Medio Ambiente', area: 'medioambiente', weight: 0.5 },
  { id: 'deporte', name: 'Deporte', area: 'educacion', weight: 0.2 },
  { id: 'mujer', name: 'Mujer y la Equidad de Género', area: 'trabajo', weight: 0.3 },
  { id: 'culturas', name: 'Culturas, las Artes y el Patrimonio', area: 'educacion', weight: 0.2 },
  { id: 'ciencia', name: 'Ciencia, Tecnología, Conocimiento e Innovación', area: 'ciencia', weight: 0.3 },
];
export const MINISTRY_BY_ID = Object.fromEntries(MINISTRIES.map((m) => [m.id, m])) as Record<string, Ministry>;

/** Medios ficticios. lean: -1 izquierda .. +1 derecha (línea editorial simulada). */
export const MEDIA: MediaOutlet[] = [
  { id: 'brujula', name: 'Diario La Brújula', kind: 'diario', lean: 0.5, reach: 0.8 },
  { id: 'observador', name: 'El Observador Austral', kind: 'diario', lean: 0, reach: 0.7 },
  { id: 'portal', name: 'Portal Ciudadano', kind: 'digital', lean: -0.55, reach: 0.6 },
  { id: 'andina', name: 'Radio Andina', kind: 'radio', lean: -0.1, reach: 0.75 },
  { id: 'hemiciclo', name: 'Revista Hemiciclo', kind: 'revista', lean: 0.1, reach: 0.3 },
  { id: 'canalsur', name: 'Señal Sur TV', kind: 'tv', lean: 0.2, reach: 0.9 },
];

