/**
 * AMBICIONES PERSONALES. El jugador declara una aspiración concreta. No garantiza oportunidades: orienta
 * qué acontecimientos son más probables (condiciones favorecedoras) y qué iniciativas tiene sentido
 * organizar. Se informan obstáculos conocidos y caminos posibles, nunca requisitos ocultos ni
 * probabilidades. Puede cambiarse, pero cambiar seguido tiene un costo de credibilidad interna.
 */
import type { AmbitionKind, W } from './types';
import { P, me, party, terr, infl, has, isLeg, weeksTo } from './ops';
import { INITIATIVES } from './initiatives';

export const AMBITIONS: { kind: AmbitionKind; label: string; desc: string }[] = [
  { kind: 'cargo_partidario', label: 'Obtener una responsabilidad partidaria', desc: 'Una secretaría, una directiva comunal o regional.' },
  { kind: 'candidatura', label: 'Ser candidato/a', desc: 'Conseguir la nominación de tu partido para una elección.' },
  { kind: 'alcaldia', label: 'Convertirte en alcalde/sa', desc: 'Gobernar tu comuna.' },
  { kind: 'congreso', label: 'Llegar al Congreso', desc: 'Una diputación o senaduría.' },
  { kind: 'territorio', label: 'Desarrollar influencia territorial', desc: 'Ser referente en tu comuna y en la región.' },
  { kind: 'gabinete', label: 'Integrar un gabinete', desc: 'Un cargo técnico o político en el Ejecutivo.' },
  { kind: 'presidir_partido', label: 'Presidir un partido', desc: 'Conducir tu partido a nivel nacional.' },
  { kind: 'movimiento_propio', label: 'Construir un movimiento propio', desc: 'Una fuerza política nueva.' },
  { kind: 'presidencia', label: 'La Presidencia de la República', desc: 'Una posibilidad, nunca una meta asegurada.' },
];

/** Obstáculos que el personaje podría conocer hoy (cualitativos, sin probabilidades). */
export function knownObstacles(w: W, kind: AmbitionKind): string[] {
  const c = me(w); const p = party(w); const out: string[] = [];
  const t = terr(w);
  if (t < 15 && ['candidatura', 'alcaldia', 'congreso', 'territorio'].includes(kind)) out.push('Aún te conocen poco en tu territorio');
  if (!p && ['cargo_partidario', 'presidir_partido', 'candidatura'].includes(kind)) out.push('Sin militancia, el camino partidario está cerrado');
  if (p && c.rep.confianzaPartido < 40 && kind !== 'movimiento_propio') out.push(`La directiva de ${p.short} no confía del todo en ti`);
  if (kind === 'congreso' && weeksTo(w, ['diputados', 'senadores']) > 120) out.push('La próxima elección parlamentaria está lejos');
  if (kind === 'alcaldia' && weeksTo(w, ['alcaldes']) > 120) out.push('La próxima municipal está lejos');
  if (kind === 'gabinete' && c.rep.prestigioTecnico < 30) out.push('Tu perfil técnico todavía no es reconocido');
  if (kind === 'gabinete' && (!c.partyId || !w.s.government.coalitionId || !w.s.coalitions[w.s.government.coalitionId]?.members.includes(c.partyId))) out.push('Tu partido no está en el gobierno');
  if (kind === 'presidir_partido' && infl(w) < 30) out.push('Tu peso interno es menor que el de los sectores establecidos');
  if (kind === 'presidencia') { if (!isLeg(c) && !has(c, 'ministro', 'gobernador', 'alcalde', 'senador')) out.push('Casi nadie llega a la Presidencia sin una trayectoria de cargos relevantes'); if (c.rep.reconocimiento < 40) out.push('Necesitarías ser una figura conocida a nivel nacional'); }
  if (kind === 'movimiento_propio' && c.rep.reconocimiento < 15) out.push('Pocos te seguirían hoy');
  if (!out.length) out.push('No ves obstáculos evidentes; eso no significa que no existan');
  return out;
}

/** Caminos posibles: iniciativas relacionadas y señales del entorno. */
export function paths(_w: W, kind: AmbitionKind): string[] {
  const inis = INITIATIVES.filter((d) => d.ambition.includes(kind)).map((d) => d.title);
  const extra: Record<AmbitionKind, string> = {
    cargo_partidario: 'Las responsabilidades se liberan con renuncias, reorganizaciones y elecciones internas.',
    candidatura: 'Los procesos internos se abren meses antes de cada elección.',
    alcaldia: 'La base territorial y la organización local pesan más que la notoriedad.',
    congreso: 'Un cargo local, base en el distrito y respaldo de dirigentes suelen anteceder a una diputación.',
    territorio: 'Las demandas vecinales cumplidas construyen arraigo; las promesas incumplidas lo destruyen.',
    gabinete: 'Los cupos del Ejecutivo se reparten entre partidos de la coalición y perfiles técnicos.',
    presidir_partido: 'Las internas se ganan con un sector organizado y apoyos en varias regiones.',
    movimiento_propio: 'Un movimiento necesita figuras, base y programa antes de convertirse en partido.',
    presidencia: 'Cada etapa abre (o cierra) la siguiente. No hay un camino único.',
  };
  return [...inis.map((t) => `Iniciativa posible: ${t}`), extra[kind]];
}

export function setAmbition(w: W, kind: AmbitionKind): string {
  const st = P(w);
  if (st.ambition?.kind === kind) return 'Ya es tu ambición declarada.';
  const recent = st.ambitionHistory.filter((a) => w.s.week - a.week < 26).length;
  if (st.ambition) st.ambitionHistory.push(st.ambition);
  st.ambition = { kind, week: w.s.week };
  if (recent >= 2) { const c = me(w); c.rep.confianzaPartido = Math.max(0, c.rep.confianzaPartido - 2); return `Nueva ambición: ${AMBITIONS.find((a) => a.kind === kind)!.label}. Cambiar tan seguido de meta resta credibilidad interna.`; }
  return `Nueva ambición: ${AMBITIONS.find((a) => a.kind === kind)!.label}.`;
}
