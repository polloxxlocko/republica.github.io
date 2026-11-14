/**
 * CIRCULACIÓN DIGITAL. Distingue cobertura periodística, comentarios políticos, opinión de usuarios
 * SINTÉTICOS y contenido compartido. La difusión aumenta el conocimiento público, pero NO equivale a
 * respaldo electoral: el efecto sobre la evaluación depende del contenido y de la credibilidad.
 */
import type { GameState } from '../models/types';
import type { Rng } from '../engine/rng';
import { clamp } from '../rules/params';
import type { MediaEvent } from './types';

const COMMENTS: Record<string, { pos: string[]; neg: string[]; neu: string[] }> = {
  fiscal: { pos: ['Bien que se discuta con números sobre la mesa.'], neg: ['¿Y quién paga todo esto al final?'], neu: ['¿Alguien tiene el informe financiero completo?'] },
  social: { pos: ['Por fin algo que se nota en la vida diaria.'], neg: ['Otra promesa que no llega a la gente.'], neu: ['Habrá que ver cómo se aplica.'] },
  territorial: { pos: ['Que se acuerden de las regiones es una buena señal.'], neg: ['Siempre deciden desde Santiago.'], neu: ['¿Esto incluye a las comunas rurales?'] },
  partidario: { pos: ['Al menos hubo acuerdo.'], neg: ['Puro cálculo político.'], neu: ['Interesante la jugada, veremos quién gana.'] },
  transparencia: { pos: ['Que se investigue todo, caiga quien caiga.'], neg: ['Siempre lo mismo con la política.'], neu: ['Hay que esperar lo que digan los tribunales.'] },
  seguridad: { pos: ['Algo es algo.'], neg: ['Mientras tanto, en mi barrio nada cambia.'], neu: ['¿Hay datos de resultados?'] },
  default: { pos: ['Buena noticia.'], neg: ['No me convence.'], neu: ['Habrá que seguirlo.'] },
};

export function socialCirculation(s: GameState, rng: Rng, e: MediaEvent): void {
  const share = s.media?.socialShare ?? 0.55;
  const shares = Math.round(e.virality ** 1.6 * 40000 * share * (0.6 + rng.next() * 0.8));
  // Polarización: si el hecho favorece a un sector, las reacciones se dividen más
  const pol = Math.abs(e.subjectLean);
  let pos = 0.3 + 0.22 * e.tone + rng.normal(0, 0.05);
  let neg = 0.3 - 0.22 * e.tone + 0.12 * pol + rng.normal(0, 0.05);
  pos = clamp(pos, 0.05, 0.85); neg = clamp(neg, 0.05, 0.85);
  const neu = Math.max(0.05, 1 - pos - neg); const tot = pos + neg + neu;
  const f = e.frames.find((x) => COMMENTS[x]) ?? 'default';
  const c = COMMENTS[f];
  e.social = { shares, positive: pos / tot, negative: neg / tot, neutral: neu / tot, comments: [rng.pick(c.pos), rng.pick(c.neg), rng.pick(c.neu)] };
}

export function viralityLabel(v: number): string { return v > 0.65 ? 'viral' : v > 0.4 ? 'alta' : v > 0.2 ? 'moderada' : 'baja'; }
