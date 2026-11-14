/** Predicados y utilidades compartidas por la biblioteca de acontecimientos. */
import type { Character, PolicyArea } from '../../models/types';
import type { Ctx, EventDef, EventOptionDef, W } from '../types';
import { AREA_LABELS } from '../../rules/params';
import { me, party, fictional, pickW, contacts, relOf, infl, home, weeksTo, ch, P } from '../ops';
import { COMUNA_BY_CUT } from '../../territory/data';

export const def = (d: EventDef): EventDef => d;
export const o = (id: string, label: EventOptionDef['label'], run: EventOptionDef['run'], when?: EventOptionDef['when'], hint?: string): EventOptionDef => ({ id, label, run, when, hint });

export const militant = (w: W) => !!me(w).partyId;
/** Correligionarios ficticios de la región (para conflictos nunca se usan personas reales). */
export const mates = (w: W, f: (c: Character) => boolean = () => true) => fictional(w, (c) => c.partyId === me(w).partyId && c.regionId === me(w).regionId && f(c));
export const pickMate = (w: W, f: (c: Character) => boolean = () => true, exclude: string[] = []) => pickW(w, mates(w, (c) => f(c) && !exclude.includes(c.id)), (c) => 1 + infl(w, c) / 10);
export const allies = (w: W) => contacts(w, (c) => relOf(w, c.id).trust > 15 && !c.realId);
export const rivals = (w: W) => contacts(w, (c) => relOf(w, c.id).rivalry > 22 && !c.realId);
export const electionSoon = (w: W, maxWeeks: number, types = ['alcaldes', 'concejales', 'diputados', 'senadores', 'gobernadores']) => weeksTo(w, types) <= maxWeeks;
export const area = (a: string | number) => AREA_LABELS[a as PolicyArea]?.toLowerCase() ?? String(a);
export const homeArea = (w: W): PolicyArea => {
  const pr = w.s.comunas[String(home(w))]?.priorities ?? {};
  const top = (Object.entries(pr) as [PolicyArea, number][]).sort((a, b) => b[1] - a[1])[0];
  return top?.[0] ?? me(w).specialty;
};
export const PROBLEM: Partial<Record<PolicyArea, string[]>> = {
  seguridad: ['la inseguridad en las plazas del sector', 'los robos en el paradero del liceo'],
  salud: ['las listas de espera del Cesfam', 'la falta de médicos en la posta'],
  vivienda: ['los comités de vivienda que esperan hace años', 'la toma en el borde del estero'],
  transporte: ['la frecuencia de los buses en la noche', 'el cierre del recorrido rural'],
  educacion: ['la infraestructura del liceo municipal', 'el cierre de una escuela rural'],
  medioambiente: ['el microbasural junto al canal', 'el olor de la planta de tratamiento'],
  infraestructura: ['las calles sin pavimentar del sector alto', 'la caída del puente peatonal'],
  trabajo: ['el cierre de una planta que empleaba a vecinos', 'la falta de empleo juvenil'],
  pensiones: ['las pensiones bajas de los adultos mayores del sector'],
  energia: ['los cortes de luz en invierno'],
};
export const problemOf = (w: W, a: PolicyArea) => { const l = PROBLEM[a] ?? [`los problemas de ${AREA_LABELS[a].toLowerCase()}`]; return l[w.rng.int(0, l.length - 1)]; };
export const neighbor = (w: W) => {
  const h = COMUNA_BY_CUT[home(w)]; const pool = Object.values(COMUNA_BY_CUT).filter((c) => c.region === h?.region && c.cut !== h?.cut);
  return pool.length ? pool[w.rng.int(0, pool.length - 1)].cut : home(w);
};
export const recentlyMet = (w: W, id: string) => (w.s.dialogue?.sessions ?? []).some((x) => x.participants.includes(id) && w.s.week - x.week < 6);
export const leaderOf = (w: W) => { const p = party(w); return p?.leaderId ? ch(w, p.leaderId) : undefined; };
export const pendingArc = (w: W, defId: string) => P(w).arcs.find((a) => a.defId === defId && a.status !== 'resuelta');
export const chooseOne = <T>(w: W, xs: T[]) => xs[w.rng.int(0, xs.length - 1)];
export const ctx = (c: Ctx) => c;
