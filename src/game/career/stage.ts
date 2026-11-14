/**
 * CONTEXTO VISUAL DE CARRERA («Archivo de Poder», etapas A–E).
 *
 * No es un sistema de niveles: se deriva de responsabilidades, alcance territorial e influencia
 * reales en la simulación. Las trayectorias no son lineales: quien preside un partido tiene
 * alcance nacional sin cargo público; un/a alcalde/sa tiene responsabilidades institucionales sin
 * pasar por el Congreso. La interfaz usa este contexto para decidir qué mostrar primero y cuánta
 * información y herramientas ofrecer.
 */
import type { GameState } from '../models/types';
import { capitalOf, me, officeRank } from './capital';

export type CareerStage = 'comienzo' | 'consolidacion' | 'institucional' | 'nacional' | 'presidencia';
export type Scope = 'comunal' | 'regional' | 'nacional';

export interface CareerContext {
  stage: CareerStage;
  scope: Scope;
  label: string;          // cómo se nombra la etapa en la interfaz
  responsibilities: string[];
  /** módulos que la etapa justifica mostrar (densidad adaptativa) */
  shows: { partyNews: boolean; electoral: boolean; institutional: boolean; national: boolean; government: boolean };
}

export function careerContext(s: GameState): CareerContext {
  const c = me(s);
  const types = c.offices.map((o) => o.type);
  const cap = capitalOf(s);
  const leadsParty = !!c.partyId && s.parties[c.partyId]?.leaderId === c.id;
  const nominated = s.player.candidacies.length > 0;
  let stage: CareerStage;
  if (types.includes('presidente')) stage = 'presidencia';
  else if (types.some((t) => ['ministro', 'senador', 'diputado'].includes(t)) || leadsParty || cap.recognition >= 60) stage = 'nacional';
  else if (types.some((t) => ['alcalde', 'gobernador', 'concejal', 'subsecretario', 'seremi'].includes(t))) stage = 'institucional';
  else if (types.some((t) => ['dirigente_territorial', 'asesor', 'dirigente_social'].includes(t)) && (cap.partyInfluence >= 30 || cap.territorial >= 30) || nominated || cap.partyInfluence >= 40 || cap.territorial >= 40) stage = 'consolidacion';
  else stage = 'comienzo';
  const scope: Scope = stage === 'presidencia' || stage === 'nacional' ? 'nacional' : types.some((t) => ['gobernador', 'seremi', 'senador'].includes(t)) || cap.territorial >= 45 ? 'regional' : 'comunal';
  const responsibilities = c.offices.filter((o) => officeRank(o.type) >= 2).map((o) => o.type);
  const LABEL: Record<CareerStage, string> = { comienzo: 'El comienzo', consolidacion: 'Consolidación', institucional: 'Poder institucional', nacional: 'Poder nacional', presidencia: 'Presidencia de la República' };
  return {
    stage, scope, label: LABEL[stage], responsibilities,
    shows: {
      partyNews: stage !== 'comienzo' || !!c.partyId,
      electoral: stage !== 'comienzo' || nominated,
      institutional: stage === 'institucional' || stage === 'nacional' || stage === 'presidencia',
      national: stage === 'nacional' || stage === 'presidencia',
      government: stage === 'presidencia' || types.some((t) => ['ministro', 'subsecretario', 'seremi'].includes(t)),
    },
  };
}
