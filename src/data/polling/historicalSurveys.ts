/**
 * ENCUESTAS HISTÓRICAS REALES (solo lectura).
 *
 * Aquí solo deben agregarse resultados publicados y verificables, con su fuente (URL de la ficha o
 * informe), fecha de campo, n y formulación de la pregunta. Se almacenan separados de las
 * publicaciones simuladas de la partida (GameState.polling.surveys) y el motor nunca los modifica.
 * Por ahora la colección está vacía: no se incorpora ningún dato que no haya sido verificado.
 */
export interface HistoricalSurvey {
  readonly pollsterId: string;
  readonly fieldStart: string;
  readonly fieldEnd: string;
  readonly published: string;
  readonly n: number;
  readonly question: string;
  readonly results: Readonly<Record<string, number>>;
  readonly source: string;
}

export const HISTORICAL_SURVEYS: readonly HistoricalSurvey[] = Object.freeze([]);
