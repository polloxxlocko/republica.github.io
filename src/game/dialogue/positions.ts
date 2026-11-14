/**
 * POSICIONES PÚBLICAS Y CONTRADICCIONES. Lo dicho en conversaciones, asambleas y entrevistas queda
 * registrado como posición; los votos efectivos también cuentan. La prensa puede preguntar por las
 * contradicciones entre lo dicho y lo hecho (sin inventar nada: solo compara registros del juego).
 */
import type { GameState } from '../models/types';

export interface Contradiction { topic: string; label: string; before: { week: number; stance: number; source: string }; after: { week: number; stance: number; source: string } }

export function topicLabel(s: GameState, topic: string): string {
  if (topic.startsWith('proyecto:')) { const b = s.bills.find((x) => x.id === topic.slice(9)); return b ? `el proyecto «${b.title}»` : 'un proyecto de ley'; }
  const T: Record<string, string> = { linea_partido: 'la línea de tu partido', conduccion_regional: 'la conducción regional de tu partido', descentralizacion_partido: 'la descentralización interna del partido' };
  return T[topic] ?? topic.replace(/_/g, ' ');
}

function sourceLabel(s: GameState, src: string): string {
  if (src.startsWith('voto')) return 'en la votación en sala';
  if (src.startsWith('entrevista')) return 'en una entrevista';
  const sess = s.dialogue?.sessions.find((x) => x.id === src);
  if (!sess) return 'en una reunión';
  return sess.defId === 'asamblea_partidaria' ? 'en la asamblea del partido' : sess.defId === 'reunion_bancada' ? 'en la reunión de bancada' : 'en una reunión política';
}

/** Todas las posiciones del jugador, incluidas las que se infieren de sus votos. */
export function playerPositions(s: GameState): { week: number; topic: string; stance: number; source: string }[] {
  const st = s.dialogue; if (!st) return [];
  const votes = st.actionLog.filter((a) => a.type === 'voto_parlamentario' && a.ref && a.value !== 'abst').map((a) => ({ week: a.week, topic: `proyecto:${a.ref}`, stance: a.value === 'yes' ? 1 : -1, source: `voto:${a.ref}` }));
  return [...st.positions, ...votes].sort((a, b) => a.week - b.week);
}

/** Cambios de postura sobre el mismo tema (signos opuestos) en las últimas `window` semanas. */
export function contradictions(s: GameState, window = 78): Contradiction[] {
  const ps = playerPositions(s).filter((p) => s.week - p.week <= window && p.stance !== 0);
  const out: Contradiction[] = [];
  const byTopic = new Map<string, typeof ps>();
  for (const p of ps) byTopic.set(p.topic, [...(byTopic.get(p.topic) ?? []), p]);
  for (const [topic, list] of byTopic) {
    for (let i = 1; i < list.length; i++) if (Math.sign(list[i].stance) !== Math.sign(list[i - 1].stance)) {
      out.push({ topic, label: topicLabel(s, topic), before: { ...list[i - 1], source: sourceLabel(s, list[i - 1].source) }, after: { ...list[i], source: sourceLabel(s, list[i].source) } });
    }
  }
  return out;
}
