/**
 * Registro de definiciones de conversación, organizadas por áreas. Agregar una conversación nueva no
 * requiere modificar el motor: basta con exportarla aquí (y, si la IA debe iniciarla, un disparador).
 */
import type { DialogueDefinition } from '../types';
import { LISTA_REGIONAL } from './internas';
import { COLABORACION_ASCENSO, PEDIR_RESPALDO, MENTORIA, MENTOR_COMPETENCIA, RECONCILIACION, COBRO } from './carrera';
import { ASAMBLEA, BANCADA } from './colectivas';
import { NEGOCIACION_PROYECTO, COORDINACION_MINISTERIAL, SOCIO_COALICION } from './institucional';
import { ADVERTENCIA } from './vida';

export const DEFINITIONS: DialogueDefinition[] = [
  LISTA_REGIONAL, COLABORACION_ASCENSO, PEDIR_RESPALDO, MENTORIA, MENTOR_COMPETENCIA, RECONCILIACION, COBRO,
  ASAMBLEA, BANCADA, NEGOCIACION_PROYECTO, COORDINACION_MINISTERIAL, SOCIO_COALICION, ADVERTENCIA,
];
export const DEF_BY_ID: Record<string, DialogueDefinition> = Object.fromEntries(DEFINITIONS.map((d) => [d.id, d]));
