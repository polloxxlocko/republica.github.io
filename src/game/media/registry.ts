/**
 * MEDIA REGISTRY — perfiles documentados de medios reales chilenos.
 *
 * Fuentes principales (consultadas en noviembre de 2026):
 *  - Mellado, C. & Cruz, A. (2026). Informe 2026: Consumo de Noticias y Evaluación del Periodismo
 *    en Chile. PUCV / Feedback. https://doi.org/10.17605/OSF.IO/2XW8P
 *  - Informe Nacional 2025 sobre Consumo de Noticias y Evaluación del Periodismo en Chile (PUCV).
 *  - Fernández, F. J. & Núñez-Mussa, E. (2026). Digital News Report 2026: Chile. Reuters Institute.
 *
 * Tres dimensiones distintas y nunca equivalentes:
 *  1. Orientación editorial documentada (`editorialPositions`): vacía salvo fuente expresa.
 *  2. Orientación PERCIBIDA por las audiencias (`perception`): datos de los informes PUCV.
 *  3. Composición de la audiencia (`consumption.alignedGap`): consumo de alineados vs. no alineados.
 *
 * Las PRIORIDADES editoriales y la CAPACIDAD son parámetros del modelo (estimaciones del autor a
 * partir del formato y la descripción pública del medio), no mediciones; se rotulan así en la interfaz.
 */
import type { RegionId } from '../models/types';
import { COMUNAS } from '../territory/data';
import type { EditorialPriorities, OutletProfile, PerceptionRecord, Study } from './types';

export const STUDIES: Record<string, Study> = {
  pucv2025: {
    id: 'pucv2025', title: 'Informe Nacional 2025: Consumo de Noticias y Evaluación del Periodismo en Chile', authors: 'Escuela de Periodismo PUCV (dir. Claudia Mellado)',
    fieldwork: '2025-04-30', published: '2025-05', method: 'Encuesta online a audiencias de todas las regiones (cuatro macrozonas)', sample: 9262,
    url: 'https://periodismopucv.cl/app/uploads/2025/05/Informe-Nacional-2025.pdf',
    limitations: 'Encuesta online; percepciones declaradas, no análisis de contenido. Escala 1–7 recodificada en izquierda (1–3), centro (4) y derecha (5–7).',
  },
  pucv2026: {
    id: 'pucv2026', title: 'Informe 2026: Consumo de Noticias y Evaluación del Periodismo en Chile', authors: 'Claudia Mellado y Alexis Cruz (PUCV), con Feedback',
    fieldwork: '2026-04-24', published: '2026-05-26', method: 'Encuesta online (5 de marzo a 24 de abril de 2026) más 300 encuestas presenciales a menores de 29 años en Valparaíso, Biobío y RM', sample: 9797,
    url: 'https://storage.googleapis.com/pucvedp/web/wp-content/uploads/2026/05/Informe-Nacional-2026.pdf',
    limitations: 'Percepciones de las audiencias, no del contenido. Quienes se identifican con un sector perciben con más intensidad la orientación contraria. En el Gráfico 21 algunos promedios (p. ej., El Desconcierto, El Mostrador, Ciper) no coinciden con la distribución del Gráfico 20; se conserva el dato publicado y el modelo usa la distribución (Gráfico 20).',
  },
  dnr2026: {
    id: 'dnr2026', title: 'Digital News Report 2026: Chile', authors: 'Francisco Javier Fernández y Enrique Núñez-Mussa (Reuters Institute)',
    fieldwork: '2026-02-15', published: '2026-06-16', method: 'Encuesta online del Reuters Institute (YouGov)', sample: 0,
    url: 'https://reutersinstitute.politics.ox.ac.uk/es/digital-news-report/2026/chile',
    limitations: 'Alcance y confianza autodeclarados; muestra online. Confianza general en las noticias: 34%.',
  },
};

const P = (studyId: string, l: number, c: number, r: number, m?: [number, number, number, number]): PerceptionRecord =>
  ({ studyId, left: l, center: c, right: r, meanByAudience: m ? { left: m[0], center: m[1], right: m[2], all: m[3] } : undefined });
const C = (studyId: string, a: number, m: number, b: number) => ({ studyId, nseAlto: a, nseMedio: m, nseBajo: b });
const U = (studyId: string, act: number, mix: number, pas: number, cap?: number, reg?: number, gap?: number) => ({ studyId, activo: act, mixto: mix, pasivo: pas, capital: cap, regiones: reg, alignedGap: gap });
const pr = (economia: number, social: number, seguridad: number, institucional: number, investigacion: number, regional: number, inmediatez: number, analisis: number): EditorialPriorities =>
  ({ economia, social, seguridad, institucional, investigacion, regional, inmediatez, analisis });
const active2026 = (source: string) => ({ asOf: '2026-11', source });
const PUCV26 = STUDIES.pucv2026.url;
const DNR = STUDIES.dnr2026.url;

export const OUTLETS: OutletProfile[] = [
  // ───────────────────────── Nacionales ─────────────────────────
  { id: 'elmercurio', name: 'El Mercurio', type: 'diario', scope: 'nacional', coverageTopics: 'Información general, economía, política y opinión', activeEvidence: active2026(PUCV26),
    relations: [{ text: 'Emol es su sitio informativo en línea', source: 'https://www.emol.com' }], editorialPositions: [],
    perception: [P('pucv2025', 8, 15, 77), P('pucv2026', 9.9, 16.4, 73.7, [6.32, 5.63, 5.43, 5.79])], credibility: [C('pucv2025', 4.09, 3.8, 3.7), C('pucv2026', 3.82, 3.81, 3.83)],
    consumption: [U('pucv2026', 2.65, 2.48, 1.95, 2.49, 2.31, 0.24)], priorities: pr(0.7, 0.5, 0.6, 0.8, 0.5, 0.3, 0.4, 0.8), capacity: 6, formats: ['impreso', 'web'] },
  { id: 'latercera', name: 'La Tercera', type: 'diario', scope: 'nacional', coverageTopics: 'Información general, política, reportajes', activeEvidence: active2026(PUCV26),
    owner: { name: 'Copesa', source: DNR }, editorialPositions: [],
    perception: [P('pucv2025', 14, 29, 57), P('pucv2026', 15.3, 27.3, 57.4, [5.83, 5.13, 4.67, 5.20])], credibility: [C('pucv2025', 4.1, 3.74, 3.8), C('pucv2026', 3.92, 3.79, 3.76)],
    consumption: [U('pucv2026', 2.75, 2.64, 2.11, 2.62, 2.46, 0.37)], priorities: pr(0.65, 0.55, 0.6, 0.85, 0.6, 0.3, 0.5, 0.75), capacity: 6, formats: ['impreso', 'web'],
    notes: 'El Reuters Institute (2026) informa demandas de proveedores y extrabajadores contra Copesa.' },
  { id: 'emol', name: 'Emol', type: 'digital', scope: 'nacional', coverageTopics: 'Actualidad en línea', activeEvidence: active2026(PUCV26),
    relations: [{ text: 'Sitio informativo vinculado a El Mercurio', source: 'https://www.emol.com' }], editorialPositions: [],
    perception: [P('pucv2025', 11, 28, 61), P('pucv2026', 13, 25.8, 61.2, [6.03, 5.57, 5.29, 5.63])], credibility: [C('pucv2025', 4.19, 3.86, 3.63), C('pucv2026', 3.96, 3.94, 3.77)],
    consumption: [U('pucv2026', 3.08, 2.72, 2.11, 2.73, 2.62, 0.12)], priorities: pr(0.6, 0.5, 0.65, 0.7, 0.3, 0.3, 0.9, 0.4), capacity: 7, formats: ['web', 'redes'] },
  { id: 'df', name: 'Diario Financiero', type: 'diario', scope: 'nacional', coverageTopics: 'Economía, negocios y finanzas', activeEvidence: active2026(PUCV26), editorialPositions: [],
    perception: [P('pucv2025', 9, 28, 63), P('pucv2026', 11.4, 28.1, 60.5, [5.93, 5.59, 5.39, 5.63])], credibility: [C('pucv2025', 5.02, 4.42, 4.13), C('pucv2026', 4.8, 4.33, 3.93)],
    consumption: [U('pucv2026', 2.62, 2.35, 1.94, 2.46, 2.22, 0.25)], priorities: pr(0.95, 0.3, 0.3, 0.6, 0.5, 0.2, 0.5, 0.85), capacity: 5, formats: ['impreso', 'web'] },
  { id: 'elmostrador', name: 'El Mostrador', type: 'digital', scope: 'nacional', coverageTopics: 'Política, opinión y actualidad', activeEvidence: active2026(PUCV26), editorialPositions: [],
    perception: [P('pucv2025', 39, 42, 19), P('pucv2026', 39.2, 36.1, 24.7, [4.51, 5.02, 4.6, 4.7])], credibility: [C('pucv2025', 4.48, 4.15, 3.93), C('pucv2026', 4.32, 4.11, 3.89)],
    consumption: [U('pucv2026', 2.97, 2.62, 2.1, 2.65, 2.54, 0.26)], priorities: pr(0.5, 0.65, 0.5, 0.85, 0.6, 0.3, 0.6, 0.75), capacity: 5, formats: ['web'] },
  { id: 'ciper', name: 'CIPER', type: 'investigacion', scope: 'nacional', coverageTopics: 'Periodismo de investigación y transparencia',
    founded: { year: 2007, note: 'Inicia actividades en 2007, dirigido por Mónica González', source: 'https://revista.drclas.harvard.edu/book/investigative-journalism' },
    owner: { name: 'Fundación sin fines de lucro (Centro de Investigación Periodística)', source: 'https://gijn.org/es/member/chilean-center-for-investigative-journalism-and-information-ciper' },
    activeEvidence: active2026(PUCV26), editorialPositions: [],
    perception: [P('pucv2025', 47, 40, 13), P('pucv2026', 47.7, 34.3, 18.1, [4.16, 4.97, 4.55, 4.55])], credibility: [C('pucv2025', 5.27, 4.66, 4.33), C('pucv2026', 5.01, 4.54, 4.13)],
    consumption: [U('pucv2026', 3.06, 2.6, 2.04, 2.66, 2.53, 0.45)], priorities: pr(0.5, 0.7, 0.6, 0.7, 1, 0.4, 0.15, 0.9), capacity: 2, formats: ['web'] },
  { id: 'theclinic', name: 'The Clinic', type: 'digital', scope: 'nacional', coverageTopics: 'Actualidad, entrevistas, crónica y sátira', activeEvidence: active2026(DNR), editorialPositions: [],
    perception: [P('pucv2025', 57, 23, 20), P('pucv2026', 51.5, 23.9, 24.6, [4.1, 4.22, 3.34, 3.87])], credibility: [C('pucv2025', 4.1, 3.98, 3.9), C('pucv2026', 3.96, 3.95, 3.86)],
    consumption: [U('pucv2026', 2.7, 2.59, 2.15, 2.56, 2.48, 0.44)], priorities: pr(0.4, 0.75, 0.5, 0.7, 0.6, 0.3, 0.5, 0.7), capacity: 4, formats: ['web', 'boletines', 'pódcast'],
    notes: 'Pasó del papel a ser totalmente digital (Reuters Institute, 2026).' },
  { id: 'eldesconcierto', name: 'El Desconcierto', type: 'digital', scope: 'nacional', coverageTopics: 'Actualidad, política y asuntos sociales', activeEvidence: active2026(PUCV26), editorialPositions: [],
    perception: [P('pucv2025', 46, 38, 16), P('pucv2026', 46.9, 31.5, 21.6, [4.65, 5.29, 4.91, 4.94])], credibility: [C('pucv2025', 3.88, 3.79, 3.58), C('pucv2026', 3.87, 3.83, 3.61)],
    consumption: [U('pucv2026', 2.39, 2.17, 1.86, 2.29, 2.04, 0.09)], priorities: pr(0.4, 0.85, 0.5, 0.7, 0.55, 0.4, 0.5, 0.65), capacity: 4, formats: ['web'] },
  { id: 'ellibero', name: 'El Líbero', type: 'digital', scope: 'nacional', coverageTopics: 'Política, opinión y actualidad', activeEvidence: active2026(PUCV26), editorialPositions: [],
    perception: [P('pucv2026', 26.7, 31, 42.3, [6.1, 5.75, 5.39, 5.74])], credibility: [C('pucv2026', 3.48, 3.53, 3.53)],
    consumption: [U('pucv2026', 2.04, 1.91, 1.64, 1.95, 1.82, 0.25)], priorities: pr(0.6, 0.45, 0.65, 0.85, 0.4, 0.2, 0.5, 0.75), capacity: 4, formats: ['web'] },
  { id: 'exante', name: 'Ex-Ante', type: 'digital', scope: 'nacional', coverageTopics: 'Política, economía e información de contexto',
    founded: { year: 2020, note: 'Anunciado en octubre de 2020 como nuevo medio de Cristián Bofill', source: 'https://www.df.cl/df-mas/por-dentro/cristian-bofill-por-primera-vez-la-linea-editorial-dependera' },
    owner: { name: 'CBR Servicios Periodísticos SpA', source: 'https://en.wikipedia.org/wiki/Ex-Ante_(online_newspaper)' },
    activeEvidence: active2026('https://www.ex-ante.cl'), editorialPositions: [], perception: [], credibility: [], consumption: [],
    priorities: pr(0.65, 0.4, 0.5, 0.9, 0.6, 0.2, 0.6, 0.8), capacity: 4, formats: ['web', 'boletín'],
    notes: 'No fue evaluado en los informes PUCV 2025–2026: sin datos de percepción ni de audiencia en este registro.' },
  { id: 'biobio', name: 'Radio Bío Bío', type: 'radio', scope: 'nacional', coverageTopics: 'Información general, regional y de última hora', activeEvidence: active2026(PUCV26), editorialPositions: [],
    perception: [P('pucv2025', 13, 37, 50), P('pucv2026', 14.6, 35.2, 50.2, [5.15, 4.9, 4.81, 4.95])], credibility: [C('pucv2025', 4.81, 4.77, 4.59), C('pucv2026', 4.82, 4.77, 4.64)],
    consumption: [U('pucv2026', 4.19, 3.8, 3.07, 3.57, 3.89, 0.08)], priorities: pr(0.55, 0.65, 0.8, 0.7, 0.7, 0.8, 0.9, 0.5), capacity: 8, formats: ['radio', 'web', 'TV en línea'],
    notes: 'PUCV 2026: única marca nacional con mayor credibilidad en regiones que en la capital; encabeza el ranking de credibilidad (4,73).' },
  { id: 'cooperativa', name: 'Radio Cooperativa', type: 'radio', scope: 'nacional', coverageTopics: 'Información general y análisis', activeEvidence: active2026(DNR), editorialPositions: [],
    perception: [P('pucv2025', 30, 41, 29), P('pucv2026', 29, 38.7, 32.2, [4.56, 4.66, 4.19, 4.47])], credibility: [C('pucv2025', 4.81, 4.58, 4.38), C('pucv2026', 4.57, 4.47, 4.34)],
    consumption: [U('pucv2026', 3.04, 2.9, 2.22, 2.84, 2.71, 0.17)], priorities: pr(0.5, 0.65, 0.65, 0.8, 0.5, 0.5, 0.85, 0.55), capacity: 7, formats: ['radio', 'web'],
    notes: 'Reuters Institute 2026: puso a la venta su edificio y estudios para saldar deudas; confianza alta desde 2017.' },
  { id: 'adn', name: 'Radio ADN', type: 'radio', scope: 'nacional', coverageTopics: 'Información general y deportes', activeEvidence: active2026(PUCV26), editorialPositions: [],
    perception: [P('pucv2025', 20, 47, 33), P('pucv2026', 20.6, 42.9, 36.5, [4.96, 4.94, 4.61, 4.83])], credibility: [C('pucv2025', 4.47, 4.43, 4.27), C('pucv2026', 4.36, 4.27, 4.15)],
    consumption: [U('pucv2026', 2.74, 2.79, 2.17, 2.62, 2.62, 0.34)], priorities: pr(0.5, 0.55, 0.7, 0.65, 0.35, 0.4, 0.9, 0.4), capacity: 7, formats: ['radio', 'web'] },
  { id: 'agricultura', name: 'Radio Agricultura', type: 'radio', scope: 'nacional', coverageTopics: 'Información general, mundo rural y opinión', activeEvidence: active2026(PUCV26), editorialPositions: [],
    perception: [P('pucv2025', 14, 30, 56), P('pucv2026', 15.6, 26.3, 58.1, [5.97, 5.38, 5.19, 5.51])], credibility: [C('pucv2025', 3.94, 3.99, 3.88), C('pucv2026', 3.62, 3.89, 3.86)],
    consumption: [U('pucv2026', 2.21, 2.13, 1.8, 2.14, 2.01, 0.13)], priorities: pr(0.65, 0.4, 0.7, 0.75, 0.35, 0.55, 0.7, 0.55), capacity: 6, formats: ['radio', 'web'] },
  { id: 'cnnchile', name: 'CNN Chile', type: 'tv', scope: 'nacional', coverageTopics: 'Noticias 24 horas, política y entrevistas', activeEvidence: active2026(DNR), editorialPositions: [],
    perception: [P('pucv2025', 26, 42, 32), P('pucv2026', 29.6, 36.3, 34.1, [4.72, 4.67, 3.8, 4.38])], credibility: [C('pucv2025', 4.67, 4.52, 4.36), C('pucv2026', 4.66, 4.46, 4.34)],
    consumption: [U('pucv2026', 3.5, 3.29, 2.6, 3.19, 3.17, 0.55)], priorities: pr(0.6, 0.55, 0.6, 0.85, 0.5, 0.4, 0.85, 0.7), capacity: 7, formats: ['TV de pago', 'web', 'streaming'],
    notes: 'Reuters Institute 2026: proceso de reestructuración de deuda bajo supervisión judicial.' },
  { id: 'tvn', name: 'TVN / 24 Horas', type: 'tv', scope: 'nacional', coverageTopics: 'Información general (señal abierta y 24 Horas)', activeEvidence: active2026(DNR),
    owner: { name: 'Estado de Chile (única cadena estatal)', source: DNR }, relations: [{ text: '24 Horas es su área de noticias', source: 'https://www.24horas.cl' }], editorialPositions: [],
    perception: [P('pucv2025', 40, 35, 25), P('pucv2026', 32.5, 33.1, 34.4, [4.88, 4.48, 3.5, 4.27])], credibility: [C('pucv2025', 3.91, 3.83, 3.8), C('pucv2026', 3.95, 3.92, 3.88)],
    consumption: [U('pucv2026', 3.43, 3.58, 3.1, 3.42, 3.42, 0.5)], priorities: pr(0.5, 0.65, 0.75, 0.7, 0.45, 0.6, 0.8, 0.45), capacity: 7, formats: ['TV abierta', 'web', 'canal 24 horas'],
    notes: 'Reuters Institute 2026: crisis financiera y debate sobre su gestión e independencia editorial.' },
  { id: 'canal13', name: 'Canal 13 / T13', type: 'tv', scope: 'nacional', coverageTopics: 'Información general (T13) y radio informativa', activeEvidence: active2026(DNR),
    relations: [{ text: 'T13 es su área de noticias; gestiona T13 Radio y Radio 13C', source: DNR }], editorialPositions: [],
    perception: [P('pucv2025', 11, 24, 65), P('pucv2026', 13.6, 21.8, 64.7, [6.05, 5.22, 4.7, 5.31])], credibility: [C('pucv2025', 4.27, 3.96, 3.89), C('pucv2026', 3.96, 4.02, 4)],
    consumption: [U('pucv2026', 3.77, 3.91, 3.36, 3.79, 3.68, 0.56)], priorities: pr(0.5, 0.6, 0.8, 0.7, 0.45, 0.45, 0.85, 0.45), capacity: 7, formats: ['TV abierta', 'web', 'radio'] },
  { id: 'mega', name: 'Mega / Meganoticias', type: 'tv', scope: 'nacional', coverageTopics: 'Información general (Meganoticias)', activeEvidence: active2026(DNR),
    relations: [{ text: 'Meganoticias es su área de noticias', source: DNR }], editorialPositions: [],
    perception: [P('pucv2025', 14, 27, 59), P('pucv2026', 16.5, 25.5, 58, [5.8, 4.96, 4.44, 5.06])], credibility: [C('pucv2025', 3.97, 3.91, 3.89), C('pucv2026', 3.83, 4.05, 4.01)],
    consumption: [U('pucv2026', 3.95, 4.19, 3.58, 3.96, 3.98, 0.73)], priorities: pr(0.45, 0.65, 0.85, 0.6, 0.4, 0.45, 0.85, 0.4), capacity: 7, formats: ['TV abierta', 'web'],
    notes: 'Reuters Institute 2026: Meganoticias tiene el mayor alcance online y offline.' },
  { id: 'chv', name: 'Chilevisión / CHV Noticias', type: 'tv', scope: 'nacional', coverageTopics: 'Información general (CHV Noticias)', activeEvidence: active2026(DNR),
    owner: { name: 'Grupo Vytal (adquirido a Paramount)', source: DNR }, relations: [{ text: 'CHV Noticias es su área de noticias', source: DNR }], editorialPositions: [],
    perception: [P('pucv2025', 34, 29, 37), P('pucv2026', 33.4, 27, 39.6, [4.99, 4.48, 3.22, 4.21])], credibility: [C('pucv2025', 4.03, 3.96, 3.94), C('pucv2026', 3.91, 4.05, 4.01)],
    consumption: [U('pucv2026', 3.93, 4.1, 3.49, 3.96, 3.84, 0.58)], priorities: pr(0.45, 0.65, 0.85, 0.6, 0.45, 0.45, 0.85, 0.4), capacity: 7, formats: ['TV abierta', 'web'] },
  // ───────────────────────── Regionales y provinciales ─────────────────────────
  { id: 'mercuriovalpo', name: 'El Mercurio de Valparaíso', type: 'diario', scope: 'regional', regionId: 'VA', coverageTopics: 'Información regional de Valparaíso',
    founded: { year: 1827, note: 'Diario regional en circulación más antiguo del país', source: 'https://www.memoriachilena.gob.cl/602/w3-article-95710.html' }, activeEvidence: active2026('https://www.memoriachilena.gob.cl/602/w3-article-95710.html'),
    editorialPositions: [], perception: [], credibility: [], consumption: [], priorities: pr(0.5, 0.6, 0.65, 0.6, 0.35, 1, 0.6, 0.45), capacity: 4, formats: ['impreso', 'web'] },
  { id: 'mercurioantofagasta', name: 'El Mercurio de Antofagasta', type: 'diario', scope: 'regional', regionId: 'AN', coverageTopics: 'Información regional de Antofagasta',
    founded: { year: 1906, source: 'https://archivoldco.udec.cl/index.php/El-Mercurio-Diario-:-Antofagasta,-Chile' }, activeEvidence: active2026('https://archivoldco.udec.cl/index.php/El-Mercurio-Diario-:-Antofagasta,-Chile'),
    editorialPositions: [], perception: [], credibility: [], consumption: [], priorities: pr(0.6, 0.55, 0.65, 0.55, 0.35, 1, 0.6, 0.4), capacity: 4, formats: ['impreso', 'web'] },
  { id: 'elsur', name: 'Diario El Sur', type: 'diario', scope: 'regional', regionId: 'BI', coverageTopics: 'Información regional del Biobío',
    founded: { year: 1882, note: 'Fecha con una sola fuente: por confirmar', source: 'https://www.vle.lt/straipsnis/ciles-ziniasklaida/' }, activeEvidence: { asOf: 'por confirmar', source: 'https://www.vle.lt/straipsnis/ciles-ziniasklaida/' },
    editorialPositions: [], perception: [], credibility: [], consumption: [], priorities: pr(0.55, 0.6, 0.6, 0.6, 0.35, 1, 0.55, 0.45), capacity: 4, formats: ['impreso', 'web'] },
  { id: 'australtemuco', name: 'El Austral de Temuco', type: 'diario', scope: 'regional', regionId: 'AR', coverageTopics: 'Información regional de La Araucanía',
    founded: { year: 1916, note: 'Creado el 5 de marzo de 1916', source: 'https://es.hispanopedia.com/wiki/El_Austral_de_Temuco' }, activeEvidence: active2026('https://es.hispanopedia.com/wiki/El_Austral_de_Temuco'),
    editorialPositions: [], perception: [], credibility: [], consumption: [], priorities: pr(0.5, 0.65, 0.65, 0.55, 0.35, 1, 0.55, 0.4), capacity: 4, formats: ['impreso', 'web'] },
  { id: 'llanquihue', name: 'El Llanquihue', type: 'diario', scope: 'regional', regionId: 'LL', coverageTopics: 'Información regional de Los Lagos (Puerto Montt)',
    founded: { year: 1885, note: 'Fundado el 12 de febrero de 1885', source: 'https://en.wikipedia-on-ipfs.org/wiki/El_Llanquihue' }, activeEvidence: active2026('https://ellanquihue.cl/impresa/2024/02/11/full/cuerpo-principal/3'),
    editorialPositions: [], perception: [], credibility: [], consumption: [], priorities: pr(0.5, 0.6, 0.6, 0.55, 0.35, 1, 0.55, 0.4), capacity: 4, formats: ['impreso', 'web'] },
  { id: 'ladiscusion', name: 'La Discusión', type: 'diario', scope: 'regional', regionId: 'NB', coverageTopics: 'Información regional de Ñuble (Chillán)',
    founded: { year: 1870, note: 'Fundado el 5 de febrero de 1870', source: 'https://papel.ladiscusion.cl/papeldigital/2025/febrero/155ld/155ld.pdf' }, activeEvidence: active2026('https://diariopapel.ladiscusion.cl/papeldigital/2026/junio/26062026/26062026.pdf'),
    editorialPositions: [], perception: [], credibility: [], consumption: [], priorities: pr(0.5, 0.6, 0.6, 0.55, 0.35, 1, 0.55, 0.45), capacity: 4, formats: ['impreso', 'web'] },
  { id: 'rancaguino', name: 'El Rancagüino', type: 'diario', scope: 'regional', regionId: 'OH', coverageTopics: "Información regional de O'Higgins",
    founded: { year: 1915, note: 'Fundado en agosto de 1915 bajo el nombre La Semana', source: 'https://en.wikipedia.org/wiki/El_Rancag%C3%BCino' }, activeEvidence: { asOf: 'por confirmar', source: 'https://en.wikipedia.org/wiki/El_Rancag%C3%BCino' },
    editorialPositions: [], perception: [], credibility: [], consumption: [], priorities: pr(0.5, 0.6, 0.6, 0.55, 0.35, 1, 0.55, 0.4), capacity: 4, formats: ['impreso', 'web'] },
  { id: 'eldia', name: 'Diario El Día', type: 'diario', scope: 'regional', regionId: 'CO', coverageTopics: 'Información regional de Coquimbo (La Serena)',
    founded: { year: 1944, note: 'Fundado el 1 de abril de 1944', source: 'https://es.hispanopedia.com/wiki/El_D%C3%ADa_(Chile)' }, activeEvidence: { asOf: 'por confirmar', source: 'https://es.hispanopedia.com/wiki/El_D%C3%ADa_(Chile)' },
    editorialPositions: [], perception: [], credibility: [], consumption: [], priorities: pr(0.5, 0.6, 0.6, 0.55, 0.35, 1, 0.55, 0.4), capacity: 4, formats: ['impreso', 'web'] },
  { id: 'prensaaustral', name: 'La Prensa Austral', type: 'diario', scope: 'regional', regionId: 'MA', coverageTopics: 'Información regional de Magallanes',
    founded: { year: 1941, note: 'Nombre desde 1941; su linaje se remonta a El Magallanes (1894)', source: 'https://es.hispanopedia.com/wiki/La_Prensa_Austral' }, activeEvidence: { asOf: 'por confirmar', source: 'https://es.hispanopedia.com/wiki/La_Prensa_Austral' },
    editorialPositions: [], perception: [], credibility: [], consumption: [], priorities: pr(0.5, 0.6, 0.55, 0.55, 0.35, 1, 0.55, 0.4), capacity: 4, formats: ['impreso', 'web'] },
  { id: 'divisadero', name: 'El Divisadero', type: 'diario', scope: 'regional', regionId: 'AI', coverageTopics: 'Información regional de Aysén (Coyhaique)',
    activeEvidence: active2026('https://www.eldivisadero.cl/media/Papel_digital/arch_refid2208.pdf'), editorialPositions: [], perception: [], credibility: [], consumption: [],
    priorities: pr(0.45, 0.6, 0.55, 0.55, 0.3, 1, 0.5, 0.35), capacity: 3, formats: ['impreso', 'web'], notes: 'Fecha de fundación no verificada en este registro.' },
  { id: 'estrellaiquique', name: 'La Estrella de Iquique', type: 'diario', scope: 'regional', regionId: 'TA', coverageTopics: 'Información regional de Tarapacá',
    owner: { name: 'Empresa Periodística El Norte S.A.', source: 'https://www.fundacionfuturo.cl/wp-content/themes/fund_futuro_theme/img/pdf/iquique.pdf' },
    activeEvidence: active2026('https://fen.uchile.cl/wp-content/uploads/2026/08/La-Estrella-de-Iquique-Jose-de-Gregorio.pdf'), editorialPositions: [], perception: [], credibility: [], consumption: [],
    priorities: pr(0.5, 0.6, 0.65, 0.5, 0.3, 1, 0.6, 0.35), capacity: 3, formats: ['impreso', 'web'], notes: 'Fecha de fundación no verificada en este registro.' },
  { id: 'prensacurico', name: 'La Prensa de Curicó', type: 'diario', scope: 'provincial', regionId: 'ML', coverageTopics: 'Información de la provincia de Curicó',
    founded: { year: 1898, note: 'Primera circulación el 13 de noviembre de 1898 (hubo un período anterior 1886–1890)', source: 'https://en.wikipedia.org/wiki/La_Prensa_(Curic%C3%B3)' }, activeEvidence: { asOf: 'por confirmar', source: 'https://www.teatroregional.cl/wp-content/uploads/2021/06/CATÁLOGO-MEDIOS_2021.pdf' },
    editorialPositions: [], perception: [], credibility: [], consumption: [], priorities: pr(0.45, 0.6, 0.55, 0.5, 0.3, 1, 0.55, 0.35), capacity: 3, formats: ['impreso', 'web'] },
];

// ámbito provincial: comunas de la provincia de Curicó
for (const o of OUTLETS) if (o.id === 'prensacurico') o.cuts = COMUNAS.filter((c) => c.region === 'ML' && c.province === 'Curicó').map((c) => c.cut);

export const OUTLET_BY_ID: Record<string, OutletProfile> = Object.fromEntries(OUTLETS.map((o) => [o.id, o]));

export const MEDIA_NOTICE = 'Cobertura simulada por REPÚBLICA: CHILE. Los titulares y entrevistas son ficticios y no corresponden a publicaciones reales de los medios mencionados.';

/** Registro de percepción vigente a una fecha: el estudio más reciente con campo cerrado a esa fecha. */
export function perceptionAt(o: OutletProfile, iso: string): PerceptionRecord | null {
  const ok = o.perception.filter((p) => STUDIES[p.studyId].fieldwork <= iso).sort((a, b) => STUDIES[b.studyId].fieldwork.localeCompare(STUDIES[a.studyId].fieldwork));
  return ok[0] ?? null;
}
export function credibilityAt(o: OutletProfile, iso: string) {
  return o.credibility.filter((p) => STUDIES[p.studyId].fieldwork <= iso).sort((a, b) => STUDIES[b.studyId].fieldwork.localeCompare(STUDIES[a.studyId].fieldwork))[0] ?? null;
}
export function consumptionAt(o: OutletProfile, iso: string) {
  return o.consumption.filter((p) => STUDIES[p.studyId].fieldwork <= iso).sort((a, b) => STUDIES[b.studyId].fieldwork.localeCompare(STUDIES[a.studyId].fieldwork))[0] ?? null;
}

/** Índice de orientación PERCIBIDA (-1 izquierda … +1 derecha) = (derecha − izquierda)/100. null si no hay estudio. */
export function perceivedLean(o: OutletProfile, iso: string): number | null {
  const p = perceptionAt(o, iso); return p ? (p.right - p.left) / 100 : null;
}

/** Alcance relativo 0..1 (consumo declarado 1–7 → 0..1). Sin dato: supuesto del modelo por tipo y ámbito. */
export function reachOf(o: OutletProfile, iso: string, regionId?: RegionId): { value: number; assumed: boolean } {
  const c = consumptionAt(o, iso);
  if (c) { const v = (regionId && regionId !== 'RM' ? c.regiones ?? c.mixto : c.capital ?? c.mixto); return { value: Math.max(0.05, (v - 1) / 6), assumed: false }; }
  return { value: o.scope === 'nacional' ? 0.25 : 0.35, assumed: true };
}

/** Credibilidad 0..1 (promedio de NSE, escala 1–7). Sin dato: supuesto neutro. */
export function credibilityOf(o: OutletProfile, iso: string): { value: number; assumed: boolean } {
  const c = credibilityAt(o, iso);
  if (c) return { value: ((c.nseAlto + c.nseMedio + c.nseBajo) / 3 - 1) / 6, assumed: false };
  return { value: 0.5, assumed: true }; // PUCV 2026: los medios regionales se evalúan mejor que el promedio, sin dato por medio
}
