/**
 * INFORMACIÓN IMPERFECTA (18.2, 18.11).
 *
 * Tres capas estrictamente separadas:
 *   1. Estado real de la simulación (GameState: relaciones, memorias, puntajes, situaciones latentes).
 *   2. Lo que sabe el personaje: percepciones con error que depende de su conocimiento político
 *      (experiencia, contactos, posición) y de cuánto ha tratado a cada actor.
 *   3. Lo que muestra la interfaz: solo descripciones cualitativas e informes con fuente y
 *      confiabilidad. Las funciones de este módulo son la única vía para que la UI hable del
 *      estado oculto; nunca devuelven el valor real.
 *
 * El error de percepción es determinista (hash de la clave y de un "período de información" de
 * seis semanas): la misma consulta no cambia de respuesta al recargar, pero se actualiza con el
 * tiempo, como ocurre con la información política real.
 */
import type { Character, GameState, IntelReport, IntelSource, OfficeType } from '../models/types';
import { Rng } from '../engine/rng';
import { clamp } from '../rules/params';
import { fullName, memoryBalance, officeLabel } from '../systems/characters';
import { COMUNA_BY_CUT } from '../territory/data';
import { capitalOf, homeCut, me, officeRank } from './capital';
import { aspirantScore } from './nominations';
import { newId } from '../systems/util';

// ---------------------------------------------------------------------------
// Conocimiento político del personaje
// ---------------------------------------------------------------------------
/** Conocimiento político (0..100): experiencia, redes, contactos, cargos y años en política. */
export function knowledgeLevel(s: GameState): number {
  const c = me(s);
  const contacts = Object.values(c.relations).filter((v) => Math.abs(v) > 15).length;
  const rank = Math.max(0, ...c.offices.map((o) => officeRank(o.type)));
  const years = Math.min(12, s.week / 52);
  return clamp(8 + c.attrs.experiencia * 0.3 + c.attrs.redes * 0.2 + Math.min(22, contacts * 1.4) + rank * 3 + years, 0, 100);
}

export function knowledgeLabel(k: number): string {
  return k < 30 ? 'Conoces poco cómo funcionan las cosas por dentro' : k < 50 ? 'Empiezas a entender los códigos internos' : k < 70 ? 'Lees bien el ambiente político' : 'Pocos movimientos se te escapan';
}

/** Ruido determinista en [-1, 1]. */
export function hashNoise(key: string, bucket: number): number {
  let h = (bucket + 1) * 2654435761;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 2246822519);
  h ^= h >>> 15;
  return ((h >>> 0) % 2001) / 1000 - 1;
}

/** Valor percibido por el personaje: valor real + error que disminuye con el conocimiento. */
export function perceive(s: GameState, key: string, value: number, spread: number): number {
  const k = knowledgeLevel(s);
  return value + hashNoise(`${s.player.characterId}:${key}`, Math.floor(s.week / 6)) * spread * (1 - k / 130);
}

const pick = (v: number, bands: [number, string][], last: string) => { for (const [t, l] of bands) if (v < t) return l; return last; };

// ---------------------------------------------------------------------------
// Percepción de otros actores (nunca el saldo exacto de su memoria)
// ---------------------------------------------------------------------------
export interface Stance { text: string; tone: 'good' | 'neutral' | 'bad'; certainty: 'clara' | 'incierta' | 'muy incierta' }

export function stanceToward(s: GameState, charId: string): Stance {
  const t = s.characters[charId];
  if (!t) return { text: 'Fuera de la política', tone: 'neutral', certainty: 'clara' };
  const pid = s.player.characterId;
  const n = t.memory.filter((m) => m.aboutId === pid).length + (t.relations[pid] !== undefined ? 1 : 0);
  const spread = 45 / (1 + n * 0.6);
  const v = perceive(s, `stance:${charId}`, memoryBalance(t, pid), spread);
  const k = knowledgeLevel(s);
  const certainty: Stance['certainty'] = spread * (1 - k / 130) < 9 ? 'clara' : spread * (1 - k / 130) < 20 ? 'incierta' : 'muy incierta';
  const text = pick(v, [[-35, 'Te considera un adversario'], [-12, 'Parece desconfiar de ti'], [-4, 'Se muestra distante'], [8, 'No parece tener una opinión formada sobre ti'], [25, 'Parece bien dispuesto/a hacia ti']], 'Te tiene en alta estima');
  return { text: t.gender === 'f' ? text.replace('dispuesto/a', 'dispuesta') : text.replace('dispuesto/a', 'dispuesto'), tone: v > 8 ? 'good' : v < -4 ? 'bad' : 'neutral', certainty };
}

/** Fuerza percibida de un rival en un proceso interno, relativa a la propia. */
export function perceivedStrength(s: GameState, key: string, value: number, top: number): { text: string; tone: 'good' | 'warn' | 'bad' } {
  const v = perceive(s, `str:${key}`, value, 18); const t = perceive(s, `str:top:${key}`, top, 6);
  const d = t - v;
  return d < 3 ? { text: 'Se percibe con ventaja', tone: 'good' } : d < 10 ? { text: 'Competitivo/a', tone: 'warn' } : { text: 'Parece rezagado/a', tone: 'bad' };
}

// ---------------------------------------------------------------------------
// Situación propia (18.15): sin niveles ni barras, solo lectura política plausible
// ---------------------------------------------------------------------------
export interface SituationLine { area: string; text: string; tone: 'good' | 'neutral' | 'bad'; basis: 'propia' | 'percepcion' | 'publica' }

export function situationReport(s: GameState): SituationLine[] {
  const c = me(s); const cap = capitalOf(s);
  const comuna = COMUNA_BY_CUT[homeCut(s)]?.name ?? c.comuna ?? 'tu comuna';
  const out: SituationLine[] = [];
  const terr = perceive(s, 'terr', cap.territorial, 8);
  out.push({ area: 'Territorio', basis: 'propia', tone: terr > 40 ? 'good' : terr < 12 ? 'bad' : 'neutral',
    text: pick(terr, [[10, `Casi nadie te conoce en ${comuna}`], [25, `Comienzas a ser una cara conocida en ${comuna}`], [45, `Tienes una base vecinal reconocible en ${comuna}`], [65, 'Has construido una red territorial considerable']], `Eres un referente indiscutido en ${comuna}`) });
  if (c.partyId) {
    const infl = perceive(s, 'infl', cap.partyInfluence, 18);
    out.push({ area: 'Partido', basis: 'percepcion', tone: infl > 45 ? 'good' : infl < 18 ? 'bad' : 'neutral',
      text: pick(infl, [[18, 'La directiva aún no te considera en sus decisiones'], [32, 'Tu nombre comienza a circular entre dirigentes'], [50, 'Eres una voz escuchada en el partido'], [70, 'Tienes peso propio en las decisiones internas']], 'Pocos deciden en el partido sin consultarte') });
    const leader = s.parties[c.partyId]?.leaderId;
    if (leader && leader !== c.id) {
      const st = stanceToward(s, leader);
      out.push({ area: 'Directiva', basis: 'percepcion', tone: st.tone, text: `Tu relación con la presidencia del partido: ${st.text.toLowerCase()} (lectura ${st.certainty})` });
    }
    const fac = perceive(s, 'fac', cap.factionSupport, 20);
    if (s.parties[c.partyId]?.factions.length) out.push({ area: 'Sectores internos', basis: 'percepcion', tone: fac > 60 ? 'good' : fac < 40 ? 'bad' : 'neutral',
      text: pick(fac, [[40, 'Varios sectores internos te miran con recelo'], [55, 'Los sectores internos no tienen una postura clara sobre ti'], [70, 'Cuentas con simpatías en más de un sector']], 'Eres una figura de consenso entre los sectores') });
    // Celos internos: protagonismo creciente con una directiva que se enfría (señal, no certeza)
    const h = s.career.repHistory; const prev = h.length >= 3 ? h[h.length - 3] : null;
    if (prev && c.rep.reconocimiento - prev.rec > 8 && leader && memoryBalance(s.characters[leader] ?? c, c.id) < 10) out.push({ area: 'Partido', basis: 'percepcion', tone: 'bad', text: 'Algunos dirigentes cuestionan tu creciente protagonismo' });
  } else {
    out.push({ area: 'Estructura', basis: 'propia', tone: 'neutral', text: s.career.origin.organization ? 'Sin partido: tu fuerza depende de tu organización y de tu red propia' : 'Sin partido ni organización: todo lo que logres dependerá de tu red propia' });
  }
  const rec = perceive(s, 'rec', cap.recognition, 6);
  out.push({ area: 'Notoriedad', basis: 'publica', tone: rec > 40 ? 'good' : 'neutral', text: pick(rec, [[8, 'Fuera de tu entorno eres una persona desconocida'], [20, 'Algunos medios regionales conocen tu nombre'], [40, 'Apareces con cierta frecuencia en medios'], [65, 'Eres una figura conocida a nivel nacional']], 'Tu nombre es parte de la conversación nacional') });
  const img = perceive(s, 'img', cap.popularity - cap.rejection * 0.6, 8);
  out.push({ area: 'Imagen', basis: 'percepcion', tone: img > 35 ? 'good' : img < 20 ? 'bad' : 'neutral', text: pick(img, [[15, 'Tu imagen pública genera más rechazo que adhesión'], [28, 'Tu imagen pública está dividida'], [42, 'Tu imagen pública es mayormente positiva']], 'Despiertas simpatía transversal') });
  out.push({ area: 'Credibilidad', basis: 'percepcion', tone: cap.credibility > 58 ? 'good' : cap.credibility < 42 ? 'bad' : 'neutral', text: pick(perceive(s, 'cred', cap.credibility, 8), [[38, 'Se duda de tu palabra'], [52, 'Tu palabra pesa como la de cualquiera'], [66, 'Tienes fama de cumplir lo que dices']], 'Tu palabra es un activo reconocido') });
  out.push({ area: 'Preparación', basis: 'propia', tone: cap.prestige > 55 ? 'good' : 'neutral', text: pick(cap.prestige, [[30, 'Aún no tienes un perfil técnico reconocido'], [50, 'Manejas tus temas con solvencia'], [70, 'Eres consultado/a por tu preparación técnica']], 'Tu prestigio técnico trasciende a tu sector') });
  out.push({ area: 'Organización', basis: 'propia', tone: cap.organization > 40 ? 'good' : 'neutral', text: pick(cap.organization, [[15, 'No tienes equipo propio'], [35, 'Cuentas con un pequeño grupo de colaboradores'], [60, 'Tienes un equipo y voluntariado estables']], 'Tu organización propia es capaz de sostener una campaña') });
  const dg = s.career.capital.digital ?? 0;
  out.push({ area: 'Redes sociales', basis: 'publica', tone: dg > 35 ? 'good' : 'neutral', text: pick(dg, [[5, 'Casi no tienes presencia en redes'], [15, 'Tienes una comunidad pequeña en redes'], [35, 'Tus publicaciones circulan con regularidad'], [60, 'Tienes una presencia digital influyente']], 'Eres una de las voces más seguidas en redes') });
  if (s.career.pressure > 25) out.push({ area: 'Expectativas', basis: 'percepcion', tone: 'bad', text: s.career.pressure > 55 ? 'Las expectativas sobre ti son muy altas y cada error se amplifica' : 'Tu rápido ascenso genera expectativas y miradas atentas' });
  return out;
}

/** Descripción cualitativa de una dimensión del legado (sin puntajes). */
export function qualitative(v: number): string {
  return pick(v, [[15, 'escaso'], [35, 'modesto'], [55, 'apreciable'], [75, 'destacado']], 'excepcional');
}

// ---------------------------------------------------------------------------
// Informes, rumores y fuentes (18.11)
// ---------------------------------------------------------------------------
export const SOURCE_LABEL: Record<IntelSource, string> = { publica: 'Información pública', contacto: 'Contacto', reservada: 'Información reservada', rumor: 'Rumor', estimacion: 'Estimación propia' };

/** Contactos que pueden contarte cosas: quienes te conocen y no te son hostiles. */
export function informants(s: GameState): Character[] {
  const pid = s.player.characterId;
  return Object.values(s.characters).filter((x) => x.status === 'activo' && !x.isPlayer && (x.memory.some((m) => m.aboutId === pid) || Math.abs(x.relations[pid] ?? 0) > 5) && memoryBalance(x, pid) > -10);
}

/** Confiabilidad de una fuente: cercanía, integridad y acceso (cargo/directiva). */
export function sourceQuality(s: GameState, src: Character): number {
  const access = Math.max(0, ...src.offices.map((o) => officeRank(o.type))) * 4 + (src.partyId && s.parties[src.partyId]?.leaderId === src.id ? 15 : 0);
  return clamp(memoryBalance(src, s.player.characterId) * 0.4 + src.attrs.integridad * 0.4 + access, 0, 100);
}

export function reliabilityOf(q: number): IntelReport['reliability'] { return q > 55 ? 'alta' : q > 32 ? 'media' : 'baja'; }

export function pushIntel(s: GameState, r: Omit<IntelReport, 'id' | 'week'>): IntelReport | null {
  // Nadie repite lo mismo cada semana: se omite un informe idéntico reciente (salvo información verificable)
  if (!r.latentId && s.career.intel.some((x) => x.text === r.text && s.week - x.week < (r.topic === 'reputacion' ? 26 : 10))) return null;
  const rep: IntelReport = { id: newId(s, 'in'), week: s.week, ...r };
  s.career.intel.push(rep);
  if (s.career.intel.length > 150) s.career.intel.splice(0, s.career.intel.length - 150);
  return rep;
}

/** Verifica informes ligados a una situación o proceso y actualiza el historial de cada fuente. */
export function verifyIntel(s: GameState, refId: string, happened: boolean): void {
  for (const r of s.career.intel) {
    if (r.latentId !== refId || r.verified) continue;
    // Los informes verificables afirman que algo ocurrirá ("Se descarta…" afirma lo contrario)
    const claimsItHappens = !r.text.startsWith('Se descarta');
    const correct = claimsItHappens === happened;
    r.verified = correct ? 'confirmado' : 'desmentido';
    if (r.sourceId) { const t = (s.career.sources[r.sourceId] ??= { hits: 0, misses: 0 }); if (correct) t.hits += 1; else t.misses += 1; }
  }
}

export function sourceRecord(s: GameState, id: string | undefined): string | null {
  if (!id) return null; const t = s.career.sources[id]; if (!t || t.hits + t.misses === 0) return null;
  const n = t.hits + t.misses;
  return `acertó ${t.hits} de ${n} ${n === 1 ? 'vez' : 'veces'}`;
}

/**
 * Informes semanales del entorno del personaje: percepciones de la directiva, del proceso de
 * nominación y de su reputación. Una fuente puede equivocarse o mentir si compite contigo.
 */
export function weeklyIntel(s: GameState, rng: Rng): void {
  const c = me(s);
  const srcs = informants(s);
  const k = knowledgeLevel(s);
  if (!rng.chance(0.12 + Math.min(0.2, srcs.length * 0.012) + k / 1000)) return;
  const src = srcs.length ? rng.weighted(srcs, srcs.map((x) => 1 + Math.max(0, memoryBalance(x, c.id)))) : null;
  const q = src ? sourceQuality(s, src) : 20;
  const kind = rng.weighted(['directiva', 'candidaturas', 'reputacion'] as const, [c.partyId ? 3 : 0, 2, 2]);
  // ¿la fuente compite contigo en un proceso? entonces puede desinformar deliberadamente
  const rival = src && s.career.processes.some((p) => p.status !== 'resuelto' && p.status !== 'cancelado' && p.aspirants.some((a) => a.charId === src.id) && p.aspirants.some((a) => a.charId === c.id));
  const honest = !rival && rng.chance(0.55 + q / 250);
  if (kind === 'directiva' && c.partyId) {
    const leader = s.characters[s.parties[c.partyId]?.leaderId ?? ''];
    if (!leader || leader.id === c.id) return;
    const real = memoryBalance(leader, c.id) > 5;
    const says = honest ? real : !real;
    pushIntel(s, { topic: 'directiva', source: src ? 'contacto' : 'rumor', sourceId: src?.id, reliability: reliabilityOf(q), truth: says === real,
      text: says ? `${src ? fullName(src) : 'Alguien del partido'} comenta que tu relación con la directiva parece favorable.` : `${src ? fullName(src) : 'Alguien del partido'} sugiere que en la directiva hay reparos hacia ti.` });
    return;
  }
  if (kind === 'candidaturas') {
    const p = s.career.processes.find((x) => (x.status === 'abierto' || x.status === 'preseleccion') && x.aspirants.some((a) => a.charId === c.id && (a.status === 'aspirante' || a.status === 'propuesto')));
    if (p) {
      // La fuente lee la situación actual (que aún puede cambiar); la verdad se conocerá en la decisión
      const ranked = p.aspirants.filter((a) => a.status === 'aspirante' || a.status === 'propuesto').map((a) => ({ id: a.charId, v: aspirantScore(s, p, a) })).sort((x, y) => y.v - x.v);
      const inside = ranked.findIndex((r) => r.id === c.id) < p.slots;
      const says = honest ? inside : !inside;
      pushIntel(s, { topic: 'candidaturas', source: src ? (src.offices.length ? 'reservada' : 'contacto') : 'rumor', sourceId: src?.id, reliability: reliabilityOf(q), truth: says, latentId: `${p.id}:me`,
        text: says ? `Tu nombre comienza a ser considerado seriamente para ${p.unitLabel}.` : `Se descarta, por ahora, que la directiva priorice tu candidatura en ${p.unitLabel}.` });
      return;
    }
    const cede = s.career.processes.find((x) => x.status === 'preseleccion' && x.aspirants.some((a) => a.charId === c.id) && x.cedeRoll !== undefined);
    if (cede) {
      const real = (cede.cedeRoll ?? 1) < (cede.cedeP ?? 0);
      const says = honest ? real : !real;
      pushIntel(s, { topic: 'coalicion', source: src ? 'contacto' : 'rumor', sourceId: src?.id, reliability: reliabilityOf(q), truth: says === real, latentId: `${cede.id}:cede`,
        text: says ? `Existen rumores sobre una reorganización de candidaturas del pacto en ${cede.unitLabel}.` : `Se descarta que el pacto mueva la candidatura de ${cede.unitLabel}.` });
    }
    return;
  }
  // reputación
  const lead = c.partyId ? s.characters[s.parties[c.partyId]?.leaderId ?? ''] : null;
  const jealous = lead && lead.id !== c.id && memoryBalance(lead, c.id) < 0 && c.rep.reconocimiento > 20;
  pushIntel(s, { topic: 'reputacion', source: src ? 'contacto' : 'rumor', sourceId: src?.id, reliability: reliabilityOf(q), truth: honest ? true : false,
    text: (honest ? jealous : !jealous) ? 'Algunos dirigentes ven con preocupación tu creciente influencia.' : capitalOf(s).territorial > 30 ? 'En tu comuna se habla bien de tu trabajo.' : 'Todavía eres poco conocido/a fuera de tu círculo.' });
}

/** Avisos públicos sobre la trayectoria de las personas que conociste (18.13). */
export function trackContacts(s: GameState): void {
  const c = me(s); const pid = c.id;
  for (const [id, v] of Object.entries(c.relations)) {
    const t = s.characters[id]; if (!t || t.isPlayer) continue;
    if (Math.abs(v) < 8 && !t.memory.some((m) => m.aboutId === pid)) continue;
    if (!s.career.contacts[id]) {
      const note = t.memory.filter((m) => m.aboutId === pid).slice(-1)[0]?.note ?? 'Contacto político';
      s.career.contacts[id] = { metWeek: s.week, context: note, lastOffice: topOffice(t) };
      continue;
    }
    const rec = s.career.contacts[id];
    const now = t.status !== 'activo' ? `__${t.status}` : topOffice(t);
    if (now === rec.lastOffice) continue;
    const year = 2026 + Math.floor((rec.metWeek + 45) / 52);
    if (now === '__retirado' || now === '__fallecido') pushIntel(s, { topic: 'red', source: 'publica', reliability: 'alta', truth: true, text: `${fullName(t)}, a quien conociste en ${year} (${rec.context.toLowerCase()}), ${now === '__retirado' ? 'se retira de la política' : 'ha fallecido'}.` });
    else if (now && officeRank(now) > officeRank(rec.lastOffice)) pushIntel(s, { topic: 'red', source: 'publica', reliability: 'alta', truth: true, text: `${fullName(t)}, a quien conociste en ${year} (${rec.context.toLowerCase()}), asume como ${officeLabel(now as OfficeType, t.gender).toLowerCase()}.` });
    else if (rec.lastOffice && officeRank(now) < officeRank(rec.lastOffice)) pushIntel(s, { topic: 'red', source: 'publica', reliability: 'alta', truth: true, text: `${fullName(t)} deja el cargo de ${officeLabel(rec.lastOffice as OfficeType, t.gender).toLowerCase()}.` });
    rec.lastOffice = now;
  }
}

export function topOffice(t: Character): string | null {
  return [...t.offices].sort((a, b) => officeRank(b.type) - officeRank(a.type))[0]?.type ?? null;
}
