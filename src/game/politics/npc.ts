/**
 * INICIATIVA AUTÓNOMA DE LOS PERSONAJES. Los personajes desarrollan sus propias carreras según sus
 * objetivos (goalsOf) y posibilidades reales: buscan candidaturas, construyen alianzas, respaldan
 * dirigentes, cambian posiciones, compiten por responsabilidades, reorganizan equipos e invitan al
 * jugador a colaborar. Solo se generan acciones posibles para su cargo y situación. Algunas de estas
 * acciones crean situaciones que el jugador debe enfrentar (acontecimientos posteriores).
 */
import type { Character } from '../models/types';
import type { W } from './types';
import { clamp } from '../rules/params';
import { P, me, name, feed, infl, disp, follow, relOf, has } from './ops';
import { goalsOf } from '../dialogue/goals';
import { ideoDistance } from '../systems/util';
import { minorRoleBlocked } from '../career/capital';

/** Personajes en el radio político del jugador (ficticios, de su región o partido, con algún peso). */
function nearby(w: W): Character[] {
  const c = me(w);
  return Object.values(w.s.characters).filter((x) => x.status === 'activo' && !x.isPlayer && !x.realId && (x.regionId === c.regionId || (x.partyId && x.partyId === c.partyId && x.offices.length > 0)));
}

export function weeklyNpc(w: W): void {
  const pool = nearby(w); if (!pool.length) return;
  const c = me(w);
  let budget = 3; // como máximo tres movimientos proactivos visibles por semana: el mundo se mueve sin saturar
  // 1) Registro de movimientos que ya produjo la simulación (candidaturas, cargos, liderazgos)
  for (const p of w.s.career.processes) for (const a of p.aspirants) if (a.joinedWeek === w.s.week && a.charId !== c.id && pool.some((x) => x.id === a.charId)) feed(w, a.charId, 'candidatura', `${name(w, a.charId)} anuncia su aspiración en ${p.unitLabel}.`);
  for (const x of pool) for (const o of x.offices) if (o.since === w.s.week && o.type !== 'militante') feed(w, x.id, 'equipo', `${name(w, x.id)} asume: ${o.label ?? o.type}.`);
  // 2) Movimientos proactivos según objetivos
  const order = [...pool].sort(() => w.rng.next() - 0.5).slice(0, 18);
  for (const x of order) {
    if (budget <= 0) break;
    const goals = goalsOf(w.s, x); const g = goals[0];
    const amb = x.attrs.ambicion / 100;
    if (!w.rng.chance(0.04 + amb * 0.06)) continue;
    // construir alianzas con alguien afín del mismo partido
    if (g.kind === 'ampliar_red' || g.kind === 'ganar_interna' || g.kind === 'candidatura') {
      const ally = pool.find((y) => y.id !== x.id && y.partyId === x.partyId && ideoDistance(x.ideology, y.ideology) < 0.25 && (x.relations[y.id] ?? 0) < 40);
      if (ally && w.rng.chance(0.5)) {
        x.relations[ally.id] = clamp((x.relations[ally.id] ?? 0) + 12, -100, 100); ally.relations[x.id] = clamp((ally.relations[x.id] ?? 0) + 10, -100, 100);
        feed(w, x.id, 'alianza', `${name(w, x.id)} y ${name(w, ally.id)} acuerdan trabajar juntos${g.kind === 'ganar_interna' ? ' en la interna' : ''}.`);
        budget--; continue;
      }
    }
    // respaldar a un dirigente (fortalece su sector)
    if (x.partyId && w.rng.chance(0.3)) {
      const p = w.s.parties[x.partyId]; const f = p?.factions.filter((y) => y.leaderId !== x.id).sort((a, b) => ideoDistance(x.ideology, a.ideology) - ideoDistance(x.ideology, b.ideology))[0];
      if (f && w.s.characters[f.leaderId] && x.factionId !== f.id) { f.influence = clamp(f.influence + (f.influence < 60 ? 0.2 : 0.05), 0, 100); if (!x.factionId) x.factionId = f.id; feed(w, x.id, 'respaldo', `${name(w, x.id)} respalda a ${name(w, f.leaderId)} («${f.name}»).`); budget--; continue; }
    }
    // competir por una responsabilidad partidaria disponible
    // los espacios son escasos: una directiva regional no tiene más de cinco responsabilidades
    const seats = pool.filter((y) => y.partyId === x.partyId && y.regionId === x.regionId && has(y, 'dirigente_territorial')).length;
    if (x.partyId === c.partyId && seats < 3 && !has(x, 'dirigente_territorial') && infl(w, x) > 20 && !minorRoleBlocked(x, 'dirigente_territorial') && w.rng.chance(0.15)) {
      x.offices.push({ type: 'dirigente_territorial', regionId: x.regionId, since: w.s.week, label: 'Directiva regional' });
      feed(w, x.id, 'interna', `${name(w, x.id)} se queda con un espacio en la directiva regional.`);
      if (relOf(w, x.id).rivalry > 20) follow(w, 'c_rival_acuerdo', 3, { npc: x.id });
      budget--; continue;
    }
    // cambiar de posición (deriva ideológica visible cuando cruza un umbral)
    if (w.rng.chance(0.2)) {
      const dim = (['eco', 'val', 'seg', 'amb'] as const)[w.rng.int(0, 3)]; const before = x.ideology[dim];
      x.ideology[dim] = clamp(before + w.rng.normal(0, 8), -100, 100);
      if (Math.sign(before) !== Math.sign(x.ideology[dim]) && Math.abs(x.ideology[dim]) > 5) { feed(w, x.id, 'postura', `${name(w, x.id)} cambia de postura en un tema clave y lo dice en público.`); budget--; continue; }
    }
    // invitar al jugador a colaborar cuando le sirve y hay disposición
    if (disp(w, x.id) > 10 && x.partyId === c.partyId && w.rng.chance(0.25)) {
      const ev = g.kind === 'candidatura' ? 'b_solicitud_respaldo' : x.offices.some((o) => ['diputado', 'senador', 'alcalde'].includes(o.type)) ? 'h_busca_colaborador' : 'c_aliado_reunion';
      if (!P(w).followups.some((f) => f.defId === ev)) { follow(w, ev, 1, ev === 'b_solicitud_respaldo' ? { npc: x.id, proc: g.ref ?? '' } : { npc: x.id }); feed(w, x.id, 'reunion', `${name(w, x.id)} quiere conversar contigo.`); budget--; }
    }
  }
}
