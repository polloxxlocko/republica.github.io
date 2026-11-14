/**
 * Generación de noticias a partir de CAMBIOS REALES en el estado (nunca contradice la simulación).
 */
import type { GameState } from '../models/types';
import { Rng } from '../engine/rng';
import { addNews } from './news';
import { pollAverage } from './polls';
import { ELECTION_LABELS } from './elections';
import { fullName } from './characters';
import { leftRight } from './util';

interface Snapshot { intention: Record<string, number>; approval: number; inflation: number; unemployment: number; growth: number; rate: number }

export function generateWeeklyNews(s: GameState, rng: Rng, prev: Snapshot): void {
  const e = s.economy;
  // Banco Central
  if (e.policyRate !== prev.rate) {
    const up = e.policyRate > prev.rate;
    addNews(s, rng, 'economia', `Banco Central ${up ? 'sube' : 'recorta'} la tasa de política monetaria a ${e.policyRate.toFixed(2).replace('.', ',')}%`, up ? `El Consejo cita una inflación de ${e.inflation.toFixed(1)}%.` : 'El instituto emisor apunta a holguras en la economía.', 3);
  }
  if (s.week % 4 === 0) {
    if (e.inflation > 5 && prev.inflation <= 5) addNews(s, rng, 'economia', `Inflación anual supera el 5%: ${e.inflation.toFixed(1)}%`, 'Presión sobre el costo de la vida.', 4, 0, -1);
    if (e.unemployment > 9.5 && prev.unemployment <= 9.5) addNews(s, rng, 'economia', `Desempleo escala a ${e.unemployment.toFixed(1)}%`, 'Gremios y sindicatos piden medidas.', 4, 0, -1);
    if (e.growth < 0 && prev.growth >= 0) addNews(s, rng, 'economia', 'La actividad económica se contrae', `Crecimiento anualizado de ${e.growth.toFixed(1)}%.`, 4, 0, -1);
    if (e.growth > 3.5 && prev.growth <= 3.5) addNews(s, rng, 'economia', `La economía acelera: ${e.growth.toFixed(1)}%`, 'Inversión y exportaciones impulsan el dinamismo.', 3, 0, 1);
  }
  // Encuestas: mayor variación de partido en el promedio de 4 semanas
  if (s.week % 3 === 0) {
    const avgNow = pollAverage(s, 'partidos', 3);
    const avgPrev: Record<string, number> = {};
    const older = s.polls.filter((p) => p.kind === 'partidos' && s.week - p.week > 3 && s.week - p.week <= 9);
    const cnt: Record<string, number> = {};
    for (const p of older) for (const [k, v] of Object.entries(p.values)) { avgPrev[k] = (avgPrev[k] ?? 0) + v; cnt[k] = (cnt[k] ?? 0) + 1; }
    let best: string | null = null; let bd = 0;
    for (const k of Object.keys(avgNow)) { if (!cnt[k]) continue; const d = avgNow[k] - avgPrev[k] / cnt[k]; if (Math.abs(d) > Math.abs(bd)) { bd = d; best = k; } }
    if (best && Math.abs(bd) > 1.3 && s.parties[best]) {
      addNews(s, rng, 'encuestas', `${s.parties[best].short} ${bd > 0 ? 'sube' : 'cae'} ${Math.abs(bd).toFixed(1)} puntos en el promedio de encuestas simuladas`, `Promedio actual: ${avgNow[best].toFixed(1)}%.`, 2, Math.sign(leftRight(s.parties[best].ideology)), bd > 0 ? 1 : -1);
    }
  }
  if (Math.abs(s.opinion.presidentialApproval - prev.approval) > 2.5) {
    const pres = s.characters[s.government.presidentId];
    addNews(s, rng, 'gobierno', `Aprobación de ${fullName(pres)} ${s.opinion.presidentialApproval > prev.approval ? 'repunta' : 'se resiente'}`, `Se ubica en torno a ${s.opinion.presidentialApproval.toFixed(0)}% según el promedio de sondeos.`, 3);
  }
  // Resultados electorales recién publicados
  for (const r of s.results.filter((x) => x.week === s.week)) {
    if (r.type === 'presidencial' || r.type === 'presidencial_2v') {
      const w = r.winnerId ? s.characters[r.winnerId] : null;
      addNews(s, rng, 'elecciones', r.runoffNeeded ? `Habrá segunda vuelta: ${r.names[r.winnerId ?? ''] ?? ''} y ${r.names[r.runnerUpId ?? ''] ?? ''}` : `${fullName(w)} gana la elección presidencial`, `${ELECTION_LABELS[r.type]}. Participación: ${r.turnoutPct.toFixed(1)}%.`, 5);
    } else if (r.type === 'diputados') {
      const top = Object.entries(r.seatsByParty).sort((a, b) => b[1] - a[1])[0];
      if (top) addNews(s, rng, 'elecciones', `${s.parties[top[0]]?.short ?? top[0]} se queda con la mayor bancada: ${top[1]} diputados`, 'Los pactos negocian la conducción de la Cámara.', 5);
    }
  }
}
