/**
 * Metadatos de las fotografías (ver docs/PHOTO_SOURCES.md y docs/ASSET_LICENSES.md).
 * Todas las licencias se verificaron con la API de Wikimedia Commons (extmetadata) en la fecha
 * indicada. No se incluye ninguna imagen cuya licencia no se haya podido verificar.
 */
export interface PhotoCredit {
  id: string;
  file: string;              // ruta relativa a public/ (WebP optimizado)
  fileSmall: string;         // versión liviana para tarjetas y móviles
  width: number; height: number;
  place: string;             // lugar representado (texto visible)
  comunaCut: number | null;  // código territorial (CUT) si la foto es de una comuna concreta
  regionId: string;
  category: 'principal' | 'urbana' | 'territorial' | 'institucional';
  author: string;
  source: string;            // título del archivo en Commons
  sourceUrl: string;         // página del archivo
  license: string;           // nombre corto (p. ej. CC BY-SA 4.0)
  licenseUrl: string;
  attributionRequired: boolean;
  downloaded: string;        // AAAA-MM-DD
  description: string;
  alt: string;
  verification: 'verificada' | 'pendiente';
  notes?: string;
  /** encuadre para recortes: posición CSS del punto de interés */
  focus?: string;
}
