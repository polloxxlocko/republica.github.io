/**
 * EVOLUCIÓN DEL ECOSISTEMA (historia alternativa del juego). Cada año: variaciones simuladas de
 * audiencia, tendencia del consumo por redes, aparición y cierre de medios FICTICIOS. Los medios
 * reales no cierran ni cambian de dueño en la simulación; las variaciones de audiencia se rotulan
 * como historia alternativa y nunca como hechos históricos.
 */
import type { GameState } from '../models/types';
import type { Rng } from '../engine/rng';
import { clamp } from '../rules/params';
import { REGIONS } from '../data/geography';
import type { FictionalOutlet } from './types';
import { OUTLETS } from './registry';

const NAME_A = ['Pauta', 'Eco', 'Brújula', 'Mirador', 'Señal', 'Archivo', 'Cuaderno', 'Faro'];
const NAME_B = ['Pública', 'Ciudadana', 'del Sur', 'Austral', 'Nacional', 'Regional', 'Abierta', 'Digital'];

export function yearlyEvolution(s: GameState, rng: Rng): void {
  const st = s.media!;
  if (s.week === 0 || s.week % 52 !== 0) return;
  const year = Math.round(s.week / 52);
  st.socialShare = clamp(st.socialShare + rng.normal(0.01, 0.01), 0.3, 0.9);
  for (const o of OUTLETS) {
    const before = st.audience[o.id] ?? 1;
    const after = clamp(before * Math.exp(rng.normal(o.type === 'diario' ? -0.03 : 0, 0.05)), 0.4, 1.8);
    st.audience[o.id] = after;
    if (Math.abs(after / before - 1) > 0.07) st.altHistory.push({ week: s.week, text: `Historia alternativa del juego (año ${year}): la audiencia simulada de ${o.name} ${after > before ? 'crece' : 'cae'} ${Math.abs((after / before - 1) * 100).toFixed(0)}%. No es un dato real.` });
  }
  for (const f of st.fictional) if (f.closedWeek === undefined && rng.chance(0.15)) { f.closedWeek = s.week; st.altHistory.push({ week: s.week, text: `Cierra el medio ficticio ${f.name}.` }); }
  if (rng.chance(0.3)) {
    const name = `${rng.pick(NAME_A)} ${rng.pick(NAME_B)}`;
    if (!st.fictional.some((f) => f.name === name)) {
      const regional = rng.chance(0.5); const r = rng.pick(REGIONS);
      const f: FictionalOutlet = {
        id: `fic${s.week}`, name: `${name} (ficticio)`, type: 'digital', scope: regional ? 'regional' : 'nacional', regionId: regional ? r.id : undefined, coverageTopics: 'Medio digital ficticio surgido en la partida',
        activeEvidence: { asOf: `semana ${s.week}`, source: 'ficción de la partida' }, editorialPositions: [], perception: [], credibility: [], consumption: [],
        priorities: { economia: rng.next(), social: rng.next(), seguridad: rng.next(), institucional: rng.next(), investigacion: rng.next() * 0.7, regional: regional ? 1 : rng.next() * 0.5, inmediatez: 0.8, analisis: rng.next() },
        capacity: 3, formats: ['web', 'redes', 'streaming'], fictional: true, createdWeek: s.week,
      };
      st.fictional.push(f); st.audience[f.id] = 0.5;
      st.altHistory.push({ week: s.week, text: `Surge ${f.name}, un medio digital ficticio de la partida.` });
    }
  }
}
