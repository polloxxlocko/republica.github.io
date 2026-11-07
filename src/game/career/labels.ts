/** Catálogos de la creación de personaje (sin dependencias, para evitar ciclos de importación). */
export const ORGANIZATIONS: Record<string, { label: string; area: string }> = {
  junta_vecinos: { label: 'Junta de vecinos', area: 'vivienda' },
  federacion_estudiantil: { label: 'Federación estudiantil', area: 'educacion' },
  sindicato: { label: 'Sindicato', area: 'trabajo' },
  ambiental: { label: 'Agrupación ambiental', area: 'medioambiente' },
  gremio: { label: 'Asociación gremial de pymes', area: 'economia' },
  comite_vivienda: { label: 'Comité de vivienda', area: 'vivienda' },
  club_deportivo: { label: 'Club deportivo / cultural', area: 'seguridad' },
};

export const ORG_LABELS: Record<string, string> = Object.fromEntries(Object.entries(ORGANIZATIONS).map(([k, v]) => [k, v.label]));
