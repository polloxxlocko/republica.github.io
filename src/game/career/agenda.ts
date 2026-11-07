/** Definiciones adicionales de oportunidades (agenda de cargos, balances electorales, presión). */
import { OFFICE_AGENDA } from './offices';
import { REVIEW_DEFS } from './review';
import type { OpportunityDef } from './opportunities';

export const EXTRA_DEFS: OpportunityDef[] = [...OFFICE_AGENDA, ...REVIEW_DEFS];
