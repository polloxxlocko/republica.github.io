/**
 * ASUNTOS — «Archivo de Poder». Bandeja priorizada de acontecimientos, acciones concretas de la semana,
 * «Mis iniciativas» (proyectos, pasos, obstáculos, apoyos con nombre), «Asuntos políticos» (tramas de
 * varios turnos) y movimientos autónomos de otros personajes. Sin barras de progreso artificiales: el
 * avance se narra con hechos (quién apoya, quién se opone, qué obstáculo sigue en pie).
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, Compass, Flag, Footprints, Inbox, Users } from 'lucide-react';
import { useGame } from '../stores/gameStore';
import type { GameState } from '../game/models/types';
import type { Arc, Initiative, PoliticalEvent } from '../game/politics/types';
import { inbox } from '../game/politics/engine';
import { INITIATIVE_BY_ID, initiativesAvailable, stepBlocked } from '../game/politics/initiatives';
import { AMBITIONS, knownObstacles, paths } from '../game/politics/ambitions';
import { ARC_BY_ID } from '../game/politics/arcs';
import { Rng } from '../game/engine/rng';
import { Badge, Empty, Tabs } from '../components/ui';
import { formatShort, weekToISO } from '../game/engine/dates';
import { CONTEXT_TEMPLATES } from '../game/politics/contextual';

type Tab = 'bandeja' | 'iniciativas' | 'asuntos' | 'movimientos';
const wk = (g: GameState, w: number) => formatShort(weekToISO(g.startDate, w));
const nm = (g: GameState, id: string) => { const c = g.characters[id]; return c ? `${c.firstName} ${c.lastName}` : id; };
const CAT: Record<string, string> = { inicial: 'Vida política', interna: 'Política interna', personal: 'Relaciones', territorial: 'Territorio', campana: 'Campaña', institucional: 'Congreso y Gobierno', prensa: 'Prensa', trayectoria: 'Trayectoria' };
const HEAT = (a: Arc) => a.status === 'resuelta' ? 'resuelta' : a.status === 'suspendida' ? 'en pausa' : a.status === 'latente' ? 'pierde fuerza' : a.heat >= 70 ? 'se agudiza' : a.heat >= 40 ? 'en disputa' : 'incipiente';

export function EventCard({ g, e, compact = false }: { g: GameState; e: PoliticalEvent; compact?: boolean }) {
  const { act } = useGame();
  const urgent = e.tier !== 'cotidiano' && e.expires - g.week <= 1;
  return (
    <article className={`panel p-4 ${e.tier !== 'cotidiano' ? 'border-l-4 border-l-burgundy' : ''}`} data-testid="asunto">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
        <span className="font-semibold uppercase tracking-wide text-burgundy">{CAT[e.cat]}</span>
        {e.tier !== 'cotidiano' ? <Badge tone="gold">relevante</Badge> : <span>cotidiano</span>}
        {urgent && <Badge tone="bad">vence pronto</Badge>}
        {e.arcId && <Badge>parte de un asunto en curso</Badge>}
        <span className="font-mono">vence {wk(g, e.expires)}</span>
      </div>
      <h3 className="mt-1 font-display text-lg font-semibold leading-snug text-ink-50">{e.title}</h3>
      {!compact && <p className="mt-1 font-serif text-[16px] leading-relaxed text-ink-200">{e.text}</p>}
      {e.fiction && <p className="mt-1 text-[11px] text-ink-400">Situación ficticia: involucra a personas reales sin atribuirles hechos ni dichos.</p>}
      <div className="mt-3 grid gap-2">
        {e.options.map((o) => <button key={o.id} className="btn justify-start text-left" onClick={() => act({ type: 'pol_resolver', eventId: e.id, optionId: o.id })}>{o.label}</button>)}
      </div>
    </article>
  );
}

export function ConcreteActions({ g }: { g: GameState }) {
  const { act } = useGame();
  const offers = g.politics?.offers ?? [];
  const tasks = (g.politics?.tasks ?? []).filter((t) => !t.result);
  return (
    <section aria-label="Acciones concretas de la semana" className="space-y-3">
        <h2 className="eyebrow flex items-center gap-2"><Footprints size={14} aria-hidden /> Esta semana podrías…</h2>
        {offers.length === 0 ? <Empty>No hay acciones concretas disponibles.</Empty> : offers.map((o) => {
          const blocked = g.player.actionPoints < o.cost ? `Requiere ${o.cost} PA` : o.funds && g.player.personalFunds < o.funds ? `Requiere ${o.funds} MM$` : null;
          return (
            <article key={o.id} className="panel p-3" data-testid="accion-concreta">
              <h3 className="font-medium text-ink-50">{o.title}</h3>
              <p className="mt-0.5 text-sm text-ink-200">Objetivo: {o.objective}.</p>
              <dl className="mt-1.5 grid gap-x-4 text-xs text-ink-300 sm:grid-cols-2">
                <div><dt className="inline text-ink-400">Duración: </dt><dd className="inline">{o.weeks} sem.</dd></div>
                <div><dt className="inline text-ink-400">Recursos: </dt><dd className="inline">{o.cost} PA{o.funds ? ` · ${o.funds} MM$` : ''}</dd></div>
                <div className="sm:col-span-2"><dt className="inline text-ink-400">Obstáculos: </dt><dd className="inline">{o.obstacles.join(' · ')}</dd></div>
                <div className="sm:col-span-2"><dt className="inline text-ink-400">Puede terminar en: </dt><dd className="inline">{o.outcomes.join(' / ')}</dd></div>
              </dl>
              <button className="btn mt-2" disabled={!!blocked} title={blocked ?? undefined} onClick={() => act({ type: 'pol_oferta', offerId: o.id })}>{blocked ?? 'Hacerlo'}</button>
            </article>);
        })}
        {tasks.length > 0 && <div className="panel p-3 text-sm"><div className="eyebrow mb-1">En marcha</div><ul className="space-y-1">{tasks.map((t) => <li key={t.id} className="text-ink-200">{t.title} <span className="text-xs text-ink-400">· resultado {wk(g, t.dueWeek)}</span></li>)}</ul></div>}
        <p className="text-[11px] text-ink-400">Estas acciones reemplazan a las acciones genéricas ({CONTEXT_TEMPLATES.map((t) => t.replaces.split(' / ')[0].toLowerCase()).join(', ')}): cambian cada semana según tu territorio, tus relaciones y lo que está en juego.</p>
      </section>
  );
}

function Bandeja({ g }: { g: GameState }) {
  const ev = inbox(g);
  const done = (g.politics?.events ?? []).filter((e) => e.status !== 'pendiente').slice(-6).reverse();
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(300px,5fr)]">
      <section aria-label="Decisiones pendientes" className="space-y-3">
        <h2 className="eyebrow flex items-center gap-2"><Inbox size={14} aria-hidden /> Decisiones pendientes</h2>
        {ev.length === 0 ? <Empty>No hay asuntos que exijan tu decisión. Puedes avanzar proyectos propios o avanzar el calendario.</Empty> : ev.map((e) => <EventCard key={e.id} g={g} e={e} />)}
        {done.length > 0 && <details className="panel p-3 text-sm"><summary className="cursor-pointer text-ink-300">Lo que decidiste recientemente</summary>
          <ul className="mt-2 space-y-1.5">{done.map((e) => <li key={e.id} className="text-ink-200"><span className="font-mono text-[11px] text-ink-400">{wk(g, e.week)}</span> <b className="font-medium">{e.title}</b>: {e.outcome}</li>)}</ul></details>}
      </section>
      <ConcreteActions g={g} />
    </div>
  );
}

function InitiativeCard({ g, i }: { g: GameState; i: Initiative }) {
  const { act } = useGame();
  const d = INITIATIVE_BY_ID[i.defId];
  const w = { s: g, rng: new Rng(g.rng) };
  const live = i.status === 'en_curso';
  return (
    <article className={`panel p-4 ${live ? 'border-l-4 border-l-brass' : ''}`} data-testid="iniciativa">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
        <Badge tone={i.status === 'exitosa' ? 'good' : i.status === 'fallida' ? 'bad' : i.status === 'en_curso' ? 'gold' : 'neutral'}>{i.status.replace('_', ' ')}</Badge>
        <span className="font-mono">desde {wk(g, i.startWeek)}{live ? ` · definición ${wk(g, i.deadline)}` : ''}</span>
      </div>
      <h3 className="mt-1 font-display text-xl font-semibold text-ink-50">{i.title}</h3>
      <p className="text-sm text-ink-200">{i.objective}.</p>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="eyebrow">Te apoyan</dt><dd className="text-ink-200">{i.supporters.length ? i.supporters.map((x) => nm(g, x)).join(', ') : 'Nadie se ha comprometido aún'}</dd></div>
        <div><dt className="eyebrow">Compiten o se oponen</dt><dd className="text-ink-200">{i.opponents.length ? i.opponents.map((x) => nm(g, x)).join(', ') : 'Nadie, por ahora'}</dd></div>
        <div><dt className="eyebrow">Requisitos</dt><dd className="text-ink-300">{i.requirements.join(' · ')}</dd></div>
        <div><dt className="eyebrow">Obstáculos y riesgos</dt><dd className="text-ink-300">{[...i.obstacles.filter((o) => o.active).map((o) => o.text), ...i.risks].join(' · ') || 'Ninguno visible'}</dd></div>
      </dl>
      {live && <div className="mt-3"><div className="eyebrow mb-1">Acciones posibles</div><div className="grid gap-2 sm:grid-cols-2">
        {d.steps.map((st) => { const b = stepBlocked(w, i, st.id); return (
          <button key={st.id} className="btn h-auto flex-col items-start py-2 text-left" disabled={!!b} onClick={() => act({ type: 'pol_paso', initiativeId: i.id, stepId: st.id })}>
            <span className="font-medium">{st.label} <span className="font-mono text-xs text-ink-400">{st.cost} PA{st.funds ? ` · ${st.funds} MM$` : ''}</span></span>
            <span className="text-xs text-ink-400">{b ?? st.detail}</span>
          </button>); })}
      </div></div>}
      <details className="mt-3 text-sm"><summary className="cursor-pointer text-ink-300">Historial ({i.log.length})</summary>
        <ul className="mt-1 space-y-1">{[...i.log].reverse().map((l, k) => <li key={k} className={l.tone > 0 ? 'text-emerald-300' : l.tone < 0 ? 'text-red-300' : 'text-ink-200'}><span className="font-mono text-[11px] text-ink-400">{wk(g, l.week)}</span> {l.text}</li>)}</ul></details>
      {live && <button className="btn-link mt-2 text-xs text-red-300" onClick={() => { if (confirm('¿Abandonar el proyecto? Quienes te apoyaron lo resentirán.')) act({ type: 'pol_abandonar', initiativeId: i.id }); }}>Abandonar el proyecto</button>}
    </article>
  );
}

function Iniciativas({ g }: { g: GameState }) {
  const { act } = useGame();
  const st = g.politics!;
  const w = useMemo(() => ({ s: g, rng: new Rng(g.rng) }), [g]);
  const avail = initiativesAvailable(w);
  const amb = st.ambition;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(300px,5fr)]">
      <section className="space-y-3" aria-label="Mis iniciativas">
        <h2 className="eyebrow flex items-center gap-2"><Flag size={14} aria-hidden /> Mis iniciativas</h2>
        {st.initiatives.length === 0 ? <Empty>No tienes proyectos en curso. Elige uno a la derecha o espera una oportunidad.</Empty> : [...st.initiatives].reverse().map((i) => <InitiativeCard key={i.id} g={g} i={i} />)}
      </section>
      <aside className="space-y-4">
        <section className="panel p-4" aria-label="Tu ambición">
          <h2 className="eyebrow flex items-center gap-2"><Compass size={14} aria-hidden /> Tu ambición</h2>
          <select className="input mt-2 w-full" value={amb?.kind ?? ''} onChange={(e) => e.target.value && act({ type: 'pol_ambicion', kind: e.target.value as never })} aria-label="Ambición declarada">
            <option value="">Sin ambición declarada</option>
            {AMBITIONS.map((a) => <option key={a.kind} value={a.kind}>{a.label}</option>)}
          </select>
          {amb && <>
            <div className="mt-3 eyebrow">Obstáculos que conoces</div>
            <ul className="mt-1 space-y-0.5 text-sm text-ink-200">{knownObstacles(w, amb.kind).map((x, k) => <li key={k} className="flex gap-2"><AlertTriangle size={13} className="mt-1 shrink-0 text-amber-400" aria-hidden />{x}</li>)}</ul>
            <div className="mt-3 eyebrow">Caminos posibles</div>
            <ul className="mt-1 space-y-0.5 text-sm text-ink-300">{paths(w, amb.kind).map((x, k) => <li key={k}>· {x}</li>)}</ul>
            <p className="mt-2 text-[11px] text-ink-400">Una ambición no garantiza oportunidades: orienta lo que buscas. No se muestran requisitos ocultos ni probabilidades.</p>
          </>}
        </section>
        <section className="panel p-4" aria-label="Proyectos posibles">
          <h2 className="eyebrow">Proyectos que podrías iniciar</h2>
          <ul className="mt-2 space-y-2">{avail.map(({ def, ok, why }) => (
            <li key={def.id} className="flex items-start justify-between gap-3 text-sm">
              <span><span className="text-ink-50">{def.title}</span>{!ok && <span className="block text-xs text-ink-400">{why}</span>}</span>
              <button className="btn shrink-0" disabled={!ok || st.initiatives.some((x) => x.defId === def.id && x.status === 'en_curso')} onClick={() => act({ type: 'pol_iniciar', defId: def.id })}>Iniciar</button>
            </li>))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

function Asuntos({ g }: { g: GameState }) {
  const arcs = [...(g.politics?.arcs ?? [])].sort((a, b) => (a.status === 'resuelta' ? 1 : 0) - (b.status === 'resuelta' ? 1 : 0) || b.lastWeek - a.lastWeek);
  if (!arcs.length) return <Empty>No hay conflictos ni negociaciones en curso que te involucren.</Empty>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">{arcs.map((a) => {
      const d = ARC_BY_ID[a.defId]; const st = d?.stages.find((x) => x.id === a.stage);
      return (
        <article key={a.id} className={`panel p-4 ${a.status === 'escalando' ? 'border-l-4 border-l-red-400' : a.status === 'resuelta' ? 'opacity-80' : 'border-l-4 border-l-ink-500'}`} data-testid="trama">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-400"><Badge tone={a.status === 'resuelta' ? 'neutral' : a.status === 'escalando' ? 'bad' : 'gold'}>{HEAT(a)}</Badge>{st && a.status !== 'resuelta' && <span>Etapa: {st.label}</span>}<span className="font-mono">desde {wk(g, a.startWeek)}</span></div>
          <h3 className="mt-1 font-display text-lg font-semibold text-ink-50">{a.title}</h3>
          <p className="font-serif text-[15px] text-ink-200">{a.conflict}</p>
          {Object.keys(a.goals).length > 0 && <ul className="mt-2 text-sm text-ink-300">{Object.entries(a.goals).map(([id, goal]) => <li key={id}><b className="font-medium text-ink-200">{nm(g, id)}</b>: {goal}</li>)}</ul>}
          {a.playerSide && <p className="mt-1 text-xs text-ink-400">Tu posición: {a.playerSide === 'neutral' ? 'neutral' : g.characters[a.playerSide] ? `con ${nm(g, a.playerSide)}` : a.playerSide}</p>}
          {a.resolution && <p className="mt-2 text-sm font-medium text-ink-50">Desenlace: {a.resolution}</p>}
          <details className="mt-2 text-sm"><summary className="cursor-pointer text-ink-300">Cronología</summary><ul className="mt-1 space-y-0.5">{a.history.map((h, k) => <li key={k} className="text-ink-200"><span className="font-mono text-[11px] text-ink-400">{wk(g, h.week)}</span> {h.text.replace(/^\[\w+\] /, '')}</li>)}</ul></details>
        </article>);
    })}</div>
  );
}

function Movimientos({ g }: { g: GameState }) {
  const [near, setNear] = useState(true);
  const feed = [...(g.politics?.feed ?? [])].filter((f) => !near || f.nearPlayer).reverse().slice(0, 60);
  return (
    <section className="panel p-4" aria-label="Movimientos de otros actores">
      <div className="flex items-center justify-between gap-2"><h2 className="eyebrow flex items-center gap-2"><Users size={14} aria-hidden /> Lo que hacen otros</h2>
        <label className="flex items-center gap-1.5 text-xs text-ink-300"><input type="checkbox" checked={near} onChange={(e) => setNear(e.target.checked)} /> Solo tu región y partido</label></div>
      {feed.length === 0 ? <Empty>Sin movimientos registrados.</Empty> : <ul className="mt-2 divide-y divide-ink-700">{feed.map((f, k) => <li key={k} className="py-1.5 text-sm text-ink-200"><span className="font-mono text-[11px] text-ink-400">{wk(g, f.week)}</span> {f.text}</li>)}</ul>}
      <p className="mt-2 text-[11px] text-ink-400">Movimientos de personajes de la simulación. Las personas reales solo aparecen en roles institucionales, sin atribuirles conductas inventadas.</p>
    </section>
  );
}

export function PoliticsScreen() {
  const { game: g } = useGame();
  const [tab, setTab] = useState<Tab>('bandeja');
  if (!g?.politics) return <Empty>Sistema no disponible en esta partida.</Empty>;
  const pend = inbox(g).length; const live = g.politics.initiatives.filter((i) => i.status === 'en_curso').length; const arcs = g.politics.arcs.filter((a) => a.status !== 'resuelta').length;
  return (
    <div className="mx-auto max-w-[1440px] space-y-4">
      <header>
        <div className="kicker">Archivo de Poder</div>
        <h1 className="font-display text-3xl font-semibold text-ink-50">Asuntos</h1>
        <p className="text-sm text-ink-300">Qué pasa a tu alrededor, qué te afecta, qué quieres lograr y cómo reaccionan los demás.</p>
      </header>
      <Tabs value={tab} onChange={setTab} options={[{ id: 'bandeja', label: `Bandeja${pend ? ` (${pend})` : ''}` }, { id: 'iniciativas', label: `Mis iniciativas${live ? ` (${live})` : ''}` }, { id: 'asuntos', label: `Asuntos políticos${arcs ? ` (${arcs})` : ''}` }, { id: 'movimientos', label: 'Movimientos' }]} />
      {tab === 'bandeja' && <Bandeja g={g} />}
      {tab === 'iniciativas' && <Iniciativas g={g} />}
      {tab === 'asuntos' && <Asuntos g={g} />}
      {tab === 'movimientos' && <Movimientos g={g} />}
    </div>
  );
}
