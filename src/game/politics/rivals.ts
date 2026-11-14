/**
 * RIVALES Y COMPETIDORES. Las oportunidades escasas (un cupo, una presidencia comunal, un puesto en un
 * equipo, el respaldo de una facción) se disputan. Cada competidor evalúa sus posibilidades y elige una
 * estrategia: competir, negociar, buscar apoyos, retirarse o respaldar a otra figura. No todos los
 * competidores se vuelven enemigos: quien se retira o pacta puede terminar como aliado.
 */
import type { Character } from '../models/types';
import type { Contest, W } from './types';
import { clamp } from '../rules/params';
import { P, me, ch, name, infl, disp, feed, rel, mem, newPid, relOf, terr } from './ops';
import { capitalOf } from '../career/capital';

/** Fuerza estimada de un competidor en una disputa (nunca se muestra como número al jugador). */
export function strengthOf(w: W, c: Character, k: Contest): number {
  const base = infl(w, c) * 0.6 + c.rep.reconocimiento * 0.25 + c.rep.confianzaPartido * 0.2 + c.attrs.redes * 0.15 + c.attrs.liderazgo * 0.1;
  const local = k.regionId && c.regionId === k.regionId ? 6 : 0;
  const player = c.isPlayer ? capitalOf(w.s).territorial * 0.35 + capitalOf(w.s).organization * 0.15 : 0;
  return base + local + player;
}

export function openContest(w: W, k: Omit<Contest, 'id' | 'status' | 'contenders'>, rivals: Character[]): Contest {
  const c: Contest = { ...k, id: newPid(w.s, 'ct'), status: 'abierta', contenders: [{ id: me(w).id, strategy: 'compite', score: 0 }, ...rivals.map((r) => ({ id: r.id, strategy: 'compite' as const, score: 0 }))] };
  P(w).contests.push(c);
  for (const r of rivals) feed(w, r.id, 'candidatura', `${name(w, r.id)} anuncia que también disputará: ${k.label.toLowerCase()}.`);
  return c;
}

/** Revisión semanal de estrategias: cada rival evalúa sus posibilidades frente al jugador. */
export function weeklyContests(w: W): void {
  const pid = me(w).id;
  for (const k of P(w).contests) {
    if (k.status !== 'abierta') continue;
    const mine = strengthOf(w, me(w), k) + (k.initiativeId ? P(w).initiatives.find((i) => i.id === k.initiativeId)?.strength ?? 0 : 0);
    for (const ct of k.contenders) {
      if (ct.id === pid || ct.strategy === 'se_retira' || ct.strategy === 'respalda') continue;
      const c = ch(w, ct.id); if (!c || c.status !== 'activo') { ct.strategy = 'se_retira'; continue; }
      const own = strengthOf(w, c, k) + w.rng.normal(0, 6);
      ct.score = own;
      const gap = own - mine;
      const d = disp(w, c.id);
      const weeksLeft = k.closeWeek - w.s.week;
      if (weeksLeft <= 0) continue;
      // estrategia según posibilidades, relación y temperamento
      if (gap < -25 && weeksLeft < 8 && w.rng.chance(0.25)) {
        if (d > 5) { ct.strategy = 'respalda'; ct.backs = pid; feed(w, c.id, 'respaldo', `${name(w, c.id)} se baja y respalda tu opción: ${k.label.toLowerCase()}.`); rel(w, c.id, { cooperation: 8, rivalry: -10 }, 'relevante'); mem(w, c.id, 'acuerdo', `Se retiró y respaldó al jugador en: ${k.label}`); }
        else { ct.strategy = 'se_retira'; feed(w, c.id, 'retiro', `${name(w, c.id)} retira su nombre: ${k.label.toLowerCase()}.`); }
      } else if (gap < -8 && ct.strategy === 'compite' && w.rng.chance(0.3)) {
        ct.strategy = 'negocia'; feed(w, c.id, 'reunion', `${name(w, c.id)} busca negociar antes de medirse contigo: ${k.label.toLowerCase()}.`);
      } else if (gap > -8 && gap < 10 && ct.strategy === 'compite' && w.rng.chance(0.25)) {
        ct.strategy = 'busca_apoyos'; feed(w, c.id, 'reunion', `${name(w, c.id)} recorre la base buscando apoyos para ${k.label.toLowerCase()}.`);
        c.rep.confianzaPartido = clamp(c.rep.confianzaPartido + 2, 0, 100);
      }
      if (c.personality === 'confrontacional' && gap > 0 && w.rng.chance(0.1)) { rel(w, c.id, { rivalry: 6 }, 'menor'); feed(w, c.id, 'conflicto', `${name(w, c.id)} cuestiona tu trabajo frente a la militancia.`); }
    }
    if (w.s.week >= k.closeWeek) resolveContest(w, k);
  }
  if (P(w).contests.length > 40) P(w).contests.splice(0, P(w).contests.length - 40);
}

export function resolveContest(w: W, k: Contest): string {
  if (k.status === 'resuelta') return k.winner ?? '';
  const pid = me(w).id;
  const ini = k.initiativeId ? P(w).initiatives.find((i) => i.id === k.initiativeId) : undefined;
  const scored = k.contenders.filter((c) => c.strategy !== 'se_retira' && c.strategy !== 'respalda').map((c) => {
    const x = ch(w, c.id)!;
    let sc = strengthOf(w, x, k) + w.rng.normal(0, 9);
    if (c.id === pid) sc += (ini?.strength ?? 0) + (ini?.supporters.length ?? 0) * 3;
    sc += k.contenders.filter((o) => o.backs === c.id).length * 10;
    return { id: c.id, sc };
  }).sort((a, b) => b.sc - a.sc);
  k.status = 'resuelta'; k.winner = scored[0]?.id ?? pid;
  // los perdedores no son enemigos permanentes: depende de cómo fue la disputa
  for (const c of k.contenders) {
    if (c.id === pid || c.id === k.winner) continue;
    if (k.winner === pid) { const r = relOf(w, c.id); if (r.rivalry > 30 || ch(w, c.id)?.personality === 'confrontacional') rel(w, c.id, { rivalry: 8 }, 'relevante'); else rel(w, c.id, { respect: 4 }, 'menor'); mem(w, c.id, 'disputa_electoral', `Perdió frente al jugador: ${k.label}`); }
  }
  if (k.winner !== pid) { const winner = ch(w, k.winner); if (winner) { rel(w, winner.id, { respect: 3 }, 'menor'); mem(w, winner.id, 'disputa_electoral', `Le ganó al jugador: ${k.label}`); } }
  return k.winner;
}

export const contestOf = (w: W, id?: string) => P(w).contests.find((c) => c.id === id);
export const terrScore = (w: W) => terr(w);
