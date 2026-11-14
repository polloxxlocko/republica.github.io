/**
 * POLLSTER REGISTRY — perfiles documentados de los estudios de opinión.
 *
 * Los antecedentes (organización, modalidad, periodicidad, universo y cambios metodológicos) provienen
 * de fichas técnicas y documentos públicos citados en `sources`/`source` (consultados en noviembre de
 * 2026). Los RESULTADOS que el juego publica con estos nombres son ficticios.
 *
 * Nada aquí atribuye sesgos ideológicos a las organizaciones reales: los efectos específicos de cada
 * estudio dentro de una partida son parámetros ficticios del modelo (ver methodology.ts) y se
 * sortean con la semilla de la partida.
 */
import type { GameState } from '../models/types';
import type { MethodPeriod, PollsterProfile } from './types';

export const SIMULATION_NOTICE = 'Encuesta ficticia generada por REPÚBLICA: CHILE. No constituye una publicación real de la organización mencionada.';
export const PRIVATE_NOTICE = 'Estudio privado ficticio encargado por tu equipo dentro de REPÚBLICA: CHILE. Costos y plazos son parámetros de juego, no precios de empresas reales.';

const CEP_EXCLUDED = [5201, 10404, 12202]; // Isla de Pascua, Palena, Antártica (manual Encuesta CEP 93)

export const POLLSTER_PROFILES: PollsterProfile[] = [
  {
    id: 'cadem', name: 'Plaza Pública Cadem', organization: 'Cadem', real: true,
    fictionalName: 'Monitor Semanal', fictionalOrganization: 'Consultora ficticia A',
    coverage: 'nacional',
    periodicity: 'Semanal (resultados los domingos), sin interrupciones desde 2014 según la propia encuestadora.',
    topics: ['aprobacion', 'evaluacion_gobierno', 'presidencial_espontanea', 'presidencial_lista', 'segunda_vuelta', 'figuras', 'economia', 'politica_publica', 'expectativas', 'partidos'],
    topicRate: { aprobacion: 1, figuras: 0.6, economia: 0.35, politica_publica: 0.55, expectativas: 0.35, evaluacion_gobierno: 0.25, partidos: 0.3 },
    activeSince: '2014 – presente', activeFrom: '2014-01-01',
    methods: [
      { from: '2014-01-01', to: '2026-03-01', mode: 'cati_celulares', design: 'probabilistico', sample: [700, 720], weighting: ['sexo', 'edad', 'nse', 'macrozona'], universe: 'Personas de 18 años o más, cobertura nacional (marco telefónico de celulares)',
        note: 'Entrevistas telefónicas a celulares (CATI) con marco generado por discado aleatorio (RDD); ~700 casos; ponderación por sexo, edad, NSE y región/ciudad.', source: 'https://cadem.cl/wp-content/uploads/2022/05/Metodologia-Plaza-2022.pdf' },
      { from: '2026-03-01', mode: 'online_panel', design: 'no_probabilistico', sample: [980, 1020], weighting: ['sexo', 'edad', 'nse', 'macrozona'], universe: 'Personas de 18 años o más, cobertura nacional (Panel Cadem Online)',
        note: 'Desde marzo de 2026: encuesta autoadministrada vía web en panel online propio, con muestra teórica de 1.000 casos por cuotas de NSE (ABC1, C2, C3, D/E) y ponderación a parámetros poblacionales.', source: 'https://cadem.cl/wp-content/uploads/2026/03/Diseno-Metodologico-2026-VF.pdf' },
    ],
    schedule: { everyWeeks: 1, campaignEveryWeeks: 1, flashInCrisis: 0, offset: 0 },
    sources: ['https://cadem.cl/wp-content/uploads/2026/03/Diseno-Metodologico-2026-VF.pdf', 'https://cadem.cl/wp-content/uploads/2022/05/Metodologia-Plaza-2022.pdf', 'https://www.ciperchile.cl/2026/03/30/nueva-metodologia-cadem-y-el-arte-de-parecer-riguroso/'],
    caveats: 'El cambio de modalidad de 2026 implica un diseño no probabilístico: no corresponde informar un margen de error clásico.',
  },
  {
    id: 'criteria', name: 'Agenda Criteria', organization: 'Criteria', real: true,
    fictionalName: 'Agenda de Opinión', fictionalOrganization: 'Consultora ficticia B',
    coverage: 'nacional',
    periodicity: 'Mensual en 2021; en 2026 se registran ediciones dominicales con intervalos de una a tres semanas.',
    topics: ['aprobacion', 'presidencial_espontanea', 'presidencial_lista', 'segunda_vuelta', 'figuras', 'problemas', 'politica_publica', 'expectativas'],
    topicRate: { aprobacion: 1, figuras: 0.5, problemas: 0.5, politica_publica: 0.6, expectativas: 0.3 },
    activeSince: 'al menos desde 2021 – presente', activeFrom: '2021-01-01',
    methods: [
      { from: '2021-01-01', mode: 'online_panel', design: 'no_probabilistico', sample: [800, 1000], weighting: ['macrozona', 'sexo', 'edad', 'nse'], universe: 'Mujeres y hombres de 18 años o más, NSE ABCD, residentes en todo el país', excludeLowSes: 0.35,
        note: 'Cuantitativo, no probabilístico: encuestas autoadministradas en panel online certificado; muestreo aleatorio dentro del panel y estratificado por cuotas; ~800–1.000 casos por edición.', source: 'https://media-front.elmostrador.cl/2026/09/agenda-criteria-06-de-septiembre-2026-.pdf' },
    ],
    schedule: { everyWeeks: 2, campaignEveryWeeks: 1, flashInCrisis: 0.15, offset: 1 },
    sources: ['https://media-front.elmostrador.cl/2021/12/Agenda-Criteria-Noviembre_2021.pdf', 'https://media-front.elmostrador.cl/2026/09/agenda-criteria-06-de-septiembre-2026-.pdf'],
    caveats: 'Universo declarado sin el NSE E. Panel de acceso online: la distribución del panel presenta desviaciones respecto de la población (según la propia ficha).',
  },
  {
    id: 'pulso', name: 'Pulso Ciudadano', organization: 'Activa Research', real: true,
    fictionalName: 'Termómetro Quincenal', fictionalOrganization: 'Consultora ficticia C',
    coverage: 'nacional',
    periodicity: 'Tracking quincenal (2020); ediciones semanales en períodos electorales (p. ej., plebiscito de 2022).',
    topics: ['aprobacion', 'presidencial_lista', 'segunda_vuelta', 'figuras', 'confianza', 'economia', 'seguridad', 'participacion'],
    topicRate: { aprobacion: 1, figuras: 0.45, confianza: 0.3, economia: 0.4, seguridad: 0.45 },
    activeSince: 'al menos desde 2019 – presente', activeFrom: '2019-10-01',
    methods: [
      { from: '2019-10-01', mode: 'online_panel', design: 'no_probabilistico', sample: [1000, 1100], weighting: ['sexo', 'edad', 'zona', 'nse'], universe: 'Personas de 18 años o más, cobertura nacional (panel online)',
        note: 'Entrevistas online a un panel nacional (OpinandoOnline); diseño no probabilístico; ponderación por género, edad, zona y NSE; ~1.000 casos (más en ediciones electorales).', source: 'https://chile.activasite.com/wp-content/uploads/2024/10/241111_Estudio-Especial-PULSO_CIUDADANO_5-años-Estallido-Social_1012_V2-1.pdf' },
    ],
    schedule: { everyWeeks: 2, campaignEveryWeeks: 1, flashInCrisis: 0.2, offset: 0 },
    sources: ['https://chile.activasite.com/wp-content/uploads/2024/10/241111_Estudio-Especial-PULSO_CIUDADANO_5-años-Estallido-Social_1012_V2-1.pdf', 'https://chile.activasite.com/wp-content/uploads/2022/08/221722_PULSO_CIUDADANO_ELECTORAL_PLEBISCITO-DE-SALIDA_AGOSTO_S3_0819_V1-2.pdf'],
    caveats: 'Diseño no probabilístico: el margen informado por la ficha se presenta aquí solo como orientativo.',
  },
  {
    id: 'datainfluye', name: 'Data Influye', organization: 'TúInfluyes', real: true,
    fictionalName: 'Panel Mensual', fictionalOrganization: 'Consultora ficticia D',
    coverage: 'nacional',
    periodicity: 'Mensual (registros desde al menos julio de 2020).',
    topics: ['aprobacion', 'presidencial_lista', 'segunda_vuelta', 'figuras', 'problemas', 'identificacion', 'seguridad'],
    topicRate: { aprobacion: 1, figuras: 0.6, problemas: 0.6, identificacion: 0.35, seguridad: 0.4 },
    activeSince: 'al menos desde 2020 – presente', activeFrom: '2020-07-01',
    methods: [
      { from: '2020-07-01', mode: 'online_panel', design: 'no_probabilistico', sample: [950, 1380], weighting: ['sexo', 'edad', 'macrozona', 'nse'], universe: 'Personas de 18 años o más residentes en ~170–175 comunas (≈82% de la población)', comunaCoverage: 0.82,
        note: 'Cuantitativo no probabilístico: encuesta cerrada, autoadministrada y online a un panel propio; estratificación por sexo, edad, zona y NSE; cobertura de ~170–175 comunas.', source: 'https://media-front.elmostrador.cl/2026/07/DATA-INFLUYE-JULIO-2026.pdf' },
    ],
    schedule: { everyWeeks: 4, campaignEveryWeeks: 4, flashInCrisis: 0, offset: 2 },
    sources: ['https://media-front.elmostrador.cl/2026/07/DATA-INFLUYE-JULIO-2026.pdf', 'https://media-front.elmostrador.cl/2026/05/DATA-INFLUYE-MAYO-2026.pdf'],
    caveats: 'Cobertura comunal parcial: en el modelo se aproxima con las comunas más pobladas hasta ~82% de la población (supuesto del juego).',
  },
  {
    id: 'cep', name: 'Encuesta CEP', organization: 'Centro de Estudios Públicos', real: true,
    fictionalName: 'Estudio Nacional Semestral', fictionalOrganization: 'Centro de estudios ficticio',
    coverage: 'nacional',
    periodicity: 'Al menos dos olas por año (serie nacional desde diciembre de 1986).',
    topics: ['aprobacion', 'identificacion', 'confianza', 'problemas', 'economia', 'figuras', 'presidencial_espontanea', 'presidencial_lista', 'expectativas', 'seguridad'],
    topicRate: { aprobacion: 1, identificacion: 1, confianza: 0.9, problemas: 1, economia: 0.9, figuras: 1, expectativas: 0.7, seguridad: 0.5 },
    activeSince: '1986 – presente', activeFrom: '1986-12-01',
    methods: [
      { from: '1986-12-01', mode: 'presencial', design: 'probabilistico', sample: [1400, 1500], weighting: ['sexo', 'edad', 'macrozona', 'zona'], universe: 'Población de 18 años o más residente en todo el país (excepto zonas de difícil acceso)', excludeCuts: CEP_EXCLUDED,
        note: 'Muestra probabilística, por conglomerados y trietápica (manzanas, viviendas, persona); entrevista presencial cara a cara; ~1.400–1.500 casos.', source: 'https://static.cepchile.cl/uploads/cepchile/2025/05/14-192222_s6zk_Manual-de-usuario-CEP-93.pdf' },
    ],
    schedule: { everyWeeks: 26, campaignEveryWeeks: 26, flashInCrisis: 0, offset: 9 },
    sources: ['https://static.cepchile.cl/uploads/cepchile/2025/05/14-192222_s6zk_Manual-de-usuario-CEP-93.pdf', 'https://static.cepchile.cl/uploads/cepchile/2024/10/09-155401_tsn9_Manual-del-Usuario-CEP-92.pdf'],
    caveats: 'Trabajo de campo extenso (varias semanas): sus mediciones describen un período, no una semana.',
  },
  {
    id: 'regional_ficticia', name: 'Observatorio Regional (ficticio)', organization: 'Organización ficticia del juego', real: false,
    fictionalName: 'Observatorio Regional (ficticio)', fictionalOrganization: 'Organización ficticia del juego',
    coverage: 'regional',
    periodicity: 'Solo en campañas parlamentarias y regionales, en regiones con elecciones competitivas (regla del juego).',
    topics: ['partidos', 'aprobacion', 'figuras', 'problemas'],
    topicRate: { partidos: 1, aprobacion: 1, figuras: 0.8, problemas: 0.6 },
    activeSince: 'ficticio', activeFrom: '2000-01-01',
    methods: [
      { from: '2000-01-01', mode: 'mixto', design: 'no_probabilistico', sample: [500, 650], weighting: ['sexo', 'edad', 'zona'], universe: 'Personas de 18 años o más de la región estudiada',
        note: 'Organización ficticia creada por el juego para estudios regionales.', source: '—' },
    ],
    schedule: { everyWeeks: 999, campaignEveryWeeks: 5, flashInCrisis: 0, offset: 3 },
    sources: [],
    caveats: 'Organización inexistente: sirve para representar estudios territoriales sin atribuirlos a una entidad real.',
  },
];

export const PROFILE_BY_ID: Record<string, PollsterProfile> = Object.fromEntries(POLLSTER_PROFILES.map((p) => [p.id, p]));

/** Nombres de estudio y organización según la preferencia de la partida (reales o ficticios). */
export function pollsterName(s: GameState | null, id: string): string {
  if (id === 'privado') return 'Estudio encargado por tu equipo';
  const p = PROFILE_BY_ID[id]; if (!p) return id;
  return s?.settings.pollNames === 'ficticios' ? p.fictionalName : p.name;
}
export function pollsterOrg(s: GameState | null, id: string): string {
  if (id === 'privado') return 'Consultora contratada (ficticia)';
  const p = PROFILE_BY_ID[id]; if (!p) return id;
  return s?.settings.pollNames === 'ficticios' ? p.fictionalOrganization : p.organization;
}

/** Período metodológico vigente en una fecha ISO. */
export function methodAt(p: PollsterProfile, iso: string): MethodPeriod {
  return p.methods.find((m) => m.from <= iso && (!m.to || iso < m.to)) ?? p.methods[p.methods.length - 1];
}

export const MODE_LABEL: Record<string, string> = {
  cati_celulares: 'Telefónica a celulares (CATI)', online_panel: 'Autoadministrada online (panel)', presencial: 'Presencial cara a cara', mixto: 'Mixta',
};
export const WEIGHT_LABEL: Record<string, string> = { edad: 'edad', nse: 'nivel socioeconómico', zona: 'zona urbana/rural', macrozona: 'macrozona', sexo: 'sexo' };
