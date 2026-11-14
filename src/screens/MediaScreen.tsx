/**
 * PRENSA Y MEDIOS — «Archivo de Poder». Quiosco, archivo, comparador de coberturas, bandeja de
 * entrevistas, perfiles documentados de medios e historial de apariciones. Toda cobertura atribuida a
 * medios reales es FICTICIA y se rotula; los perfiles muestran sus fuentes y fechas de referencia.
 */
import { useMemo, useState } from 'react';
import { ExternalLink, MessageSquare, Mic, Radio as RadioIcon, Tv, Newspaper, Globe2 } from 'lucide-react';
import { useGame } from '../stores/gameStore';
import type { GameState, NewsItem } from '../game/models/types';
import type { CoverageItem, MediaEvent, OutletProfile } from '../game/media/types';
import { MEDIA_NOTICE, OUTLETS, OUTLET_BY_ID, STUDIES, credibilityAt, consumptionAt, perceptionAt } from '../game/media/registry';
import { DEPTH_LABEL, FRAME_LABEL, covDek, covHeadline } from '../game/media/coverage';
import { styleLabel } from '../game/media/journalists';
import { viralityLabel } from '../game/media/social';
import { outletName } from '../game/systems/news';
import { Empty, Tabs } from '../components/ui';
import { formatShort, weekToISO } from '../game/engine/dates';
import { REGION_BY_ID } from '../game/data/geography';
import { currentISO } from '../game/systems/util';

type Tab = 'quiosco' | 'archivo' | 'comparador' | 'entrevistas' | 'medios' | 'apariciones';
const CATS: { id: NewsItem['category'] | 'todas'; label: string }[] = [
  { id: 'todas', label: 'Todas' }, { id: 'elecciones', label: 'Elecciones' }, { id: 'congreso', label: 'Congreso' }, { id: 'gobierno', label: 'Gobierno' },
  { id: 'economia', label: 'Economía' }, { id: 'partidos', label: 'Partidos' }, { id: 'crisis', label: 'Crisis' }, { id: 'encuestas', label: 'Encuestas' }, { id: 'regiones', label: 'Regiones' }, { id: 'jugador', label: 'Tu carrera' },
];
const TYPE_ICON = { diario: Newspaper, digital: Globe2, radio: RadioIcon, tv: Tv, investigacion: Newspaper } as const;
const wk = (g: GameState, w: number) => formatShort(weekToISO(g.startDate, w));

function Notice() { return <p role="note" className="border-l-2 border-burgundy bg-ink-800 px-3 py-2 text-xs font-medium text-ink-100">{MEDIA_NOTICE}</p>; }

function ToneMark({ t }: { t: number }) {
  const label = t < -0.35 ? 'crítico' : t > 0.35 ? 'favorable' : 'descriptivo';
  const cls = t < -0.35 ? 'text-red-300' : t > 0.35 ? 'text-emerald-300' : 'text-ink-300';
  return <span className={`text-[11px] font-medium ${cls}`}>tono {label}</span>;
}

function scopeLabel(e: MediaEvent) {
  const base = e.scope === 'nacional' ? 'nacional' : e.scope === 'regional' ? `regional · ${e.regionId ? REGION_BY_ID[e.regionId].shortName : ''}` : 'comunal';
  return e.stage !== e.scope ? `${base} → difundido a nivel ${e.stage}` : base;
}

// ───────────────────────────── Comparador ─────────────────────────────
function EventComparison({ g, e }: { g: GameState; e: MediaEvent }) {
  const items = g.media!.coverage.filter((c) => c.eventId === e.id);
  return (
    <article className="panel overflow-hidden">
      <header className="border-b border-ink-600 bg-ink-800 px-5 py-4">
        <div className="kicker">Hecho de la simulación · {wk(g, e.week)} · {scopeLabel(e)}</div>
        <h2 className="mt-1 font-display text-2xl font-semibold text-ink-50">{e.headline}</h2>
        {e.body && <p className="mt-1 font-serif text-[16px] text-ink-200">{e.body}</p>}
        <p className="mt-2 text-xs text-ink-400">Dimensiones disponibles del hecho: {e.frames.map((f) => FRAME_LABEL[f]).join(' · ')}</p>
      </header>
      <div className="p-5">
        {items.length === 0 ? <Empty>Ningún medio ha cubierto este hecho todavía.</Empty> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Medio</th><th>Titular publicado (simulado)</th><th>Formato</th><th>Enfoque</th><th>Tono</th></tr></thead>
              <tbody>{items.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap font-medium">{outletName(c.outletId, g)}{c.pickedUp && <div className="text-[10px] text-ink-400">recogido</div>}</td>
                  <td><div className="font-serif text-[15px] text-ink-50">{covHeadline(e, c)}</div><div className="text-xs text-ink-400">{covDek(c)}</div></td>
                  <td className="text-xs">{DEPTH_LABEL[c.depth]}</td>
                  <td className="text-xs">{FRAME_LABEL[c.frame]}</td>
                  <td><ToneMark t={c.tone} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {e.social && (
          <section className="mt-5 grid gap-3 border-t border-ink-700 pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div>
              <h3 className="eyebrow">Circulación digital (usuarios sintéticos)</h3>
              <p className="mt-1 text-sm text-ink-200">Difusión <b>{viralityLabel(e.virality)}</b> · {e.social.shares.toLocaleString('es-CL')} contenidos compartidos</p>
              <div className="mt-2 flex h-2 overflow-hidden rounded-sm" aria-hidden>
                <span style={{ width: `${e.social.positive * 100}%` }} className="bg-emerald-400" /><span style={{ width: `${e.social.neutral * 100}%` }} className="bg-ink-500" /><span style={{ width: `${e.social.negative * 100}%` }} className="bg-red-400" />
              </div>
              <p className="mt-1 text-[11px] text-ink-400">Positivos {(e.social.positive * 100).toFixed(0)}% · neutros {(e.social.neutral * 100).toFixed(0)}% · críticos {(e.social.negative * 100).toFixed(0)}%. La difusión digital no equivale a respaldo electoral.</p>
            </div>
            <ul className="space-y-1.5 text-sm">{e.social.comments.map((c, i) => <li key={i} className="flex gap-2 text-ink-200"><MessageSquare size={14} className="mt-0.5 shrink-0 text-ink-400" aria-hidden />«{c}» <span className="text-[11px] text-ink-400">— usuario sintético</span></li>)}</ul>
          </section>
        )}
      </div>
    </article>
  );
}

// ───────────────────────────── Entrevistas ─────────────────────────────
function Interviews({ g }: { g: GameState }) {
  const { act } = useGame();
  const st = g.media!;
  const active = st.invites.find((i) => i.status === 'aceptada');
  const pending = st.invites.filter((i) => i.status === 'pendiente');
  const past = st.invites.filter((i) => i.status === 'realizada' || i.status === 'rechazada' || i.status === 'expirada').slice().reverse();
  const known = st.journalists.filter((j) => j.history.length > 0).sort((a, b) => b.history[b.history.length - 1].week - a.history[a.history.length - 1].week);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-5">
        {active && (() => {
          const j = st.journalists.find((x) => x.id === active.journalistId)!;
          const next = active.questions!.findIndex((q) => !q.answer);
          return (
            <section className="panel p-5" aria-label="Entrevista en curso">
              <div className="kicker">Entrevista en curso · {outletName(active.outletId, g)}</div>
              <h2 className="mt-1 font-display text-2xl font-semibold text-ink-50">{j.name}</h2>
              <p className="text-sm text-ink-300">Periodista ficticio/a · estilo {styleLabel(j.style)} · {j.experience} años de experiencia</p>
              <ol className="mt-4 space-y-4">
                {active.questions!.map((q, i) => (
                  <li key={q.id} className={`border-l-2 pl-3 ${q.answer ? 'border-ink-500' : i === next ? 'border-burgundy' : 'border-ink-700 opacity-50'}`}>
                    <div className="text-[11px] uppercase tracking-wide text-ink-400">{q.followUp ? 'Repregunta' : q.topic}</div>
                    <p className="font-serif text-[17px] text-ink-50">«{q.text}»</p>
                    {q.answer ? <p className="text-xs text-ink-300">Tu respuesta: {q.options.find((o) => o.id === q.answer)?.label} — <b>{q.result}</b></p> : i === next && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {q.options.map((o) => <button key={o.id} className="btn justify-start text-left" onClick={() => act({ type: 'responder_entrevista', inviteId: active.id, index: i, answer: o.id })} data-testid={`responder-${o.id}`}>{o.label}</button>)}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          );
        })()}
        <section>
          <h2 className="eyebrow mb-2">Invitaciones</h2>
          {pending.length === 0 ? <Empty>No tienes invitaciones pendientes. Llegan más con notoriedad, cargos y hechos que te involucren.</Empty> : pending.map((inv) => {
            const j = st.journalists.find((x) => x.id === inv.journalistId)!;
            return (
              <div key={inv.id} className="panel mb-2 flex flex-wrap items-center gap-3 p-4" data-testid="invitacion">
                <Mic size={18} className="text-burgundy" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink-50">{j.name} · {outletName(inv.outletId, g)}</div>
                  <div className="text-sm text-ink-300">{inv.reason} <span className="text-ink-400">Vence {wk(g, inv.expiresWeek)}.</span></div>
                </div>
                <button className="btn btn-primary" disabled={!!active || g.player.actionPoints < 1} onClick={() => act({ type: 'aceptar_entrevista', inviteId: inv.id })}>Aceptar (1 PA)</button>
                <button className="btn btn-ghost" onClick={() => act({ type: 'rechazar_entrevista', inviteId: inv.id })}>Rechazar</button>
              </div>
            );
          })}
        </section>
        <section>
          <h2 className="eyebrow mb-2">Entrevistas anteriores</h2>
          {past.length === 0 ? <Empty>Sin registros.</Empty> : (
            <ul className="divide-y divide-ink-700">{past.map((inv) => <li key={inv.id} className="py-2 text-sm"><b>{outletName(inv.outletId, g)}</b> · {wk(g, inv.week)} · {inv.status}{inv.outcome && <span className="text-ink-300"> — {inv.outcome.summary}: {inv.outcome.effects.join(' · ')}</span>}</li>)}</ul>
          )}
        </section>
      </div>
      <aside>
        <h2 className="eyebrow mb-2">Periodistas con quienes has tratado (ficticios)</h2>
        {known.length === 0 ? <Empty>Aún no tienes relación con periodistas.</Empty> : (
          <ul className="space-y-3">{known.map((j) => (
            <li key={j.id} className="panel p-3">
              <div className="flex items-baseline justify-between gap-2"><span className="font-medium text-ink-50">{j.name}</span><span className={`font-mono text-xs ${j.relation > 10 ? 'text-emerald-300' : j.relation < -10 ? 'text-red-300' : 'text-ink-300'}`}>relación {j.relation > 0 ? '+' : ''}{j.relation}</span></div>
              <div className="text-xs text-ink-400">{outletName(j.outletId, g)} · {j.specialty} · estilo {styleLabel(j.style)}</div>
              <ul className="mt-1 space-y-0.5 text-xs text-ink-300">{j.history.slice(-3).reverse().map((h, i) => <li key={i}>{wk(g, h.week)} — {h.note}</li>)}</ul>
            </li>
          ))}</ul>
        )}
        <p className="mt-3 text-xs text-ink-400">Los nombres de periodistas se generan al azar y no corresponden a personas reales.</p>
      </aside>
    </div>
  );
}

// ───────────────────────────── Perfiles ─────────────────────────────
function PerceptionBar({ p }: { p: { left: number; center: number; right: number } }) {
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-sm" role="img" aria-label={`Izquierda ${p.left}%, centro ${p.center}%, derecha ${p.right}%`}>
        <span style={{ width: `${p.left}%`, background: '#e34948' }} /><span style={{ width: `${p.center}%`, background: '#b8b0a3' }} /><span style={{ width: `${p.right}%`, background: '#2a78d6' }} />
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-[10px] text-ink-400"><span>izq. {p.left}%</span><span>centro {p.center}%</span><span>der. {p.right}%</span></div>
    </div>
  );
}

function Profiles({ g }: { g: GameState }) {
  const [id, setId] = useState(OUTLETS[0].id);
  const iso = currentISO(g);
  const o: OutletProfile = OUTLET_BY_ID[id] ?? OUTLETS[0];
  const p = perceptionAt(o, iso); const cr = credibilityAt(o, iso); const cons = consumptionAt(o, iso);
  const nat = OUTLETS.filter((x) => x.scope === 'nacional'); const reg = OUTLETS.filter((x) => x.scope !== 'nacional');
  const Icon = TYPE_ICON[o.type];
  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Medios" className="space-y-3 text-sm">
        {[['Nacionales', nat], ['Regionales y provinciales', reg]].map(([t, list]) => (
          <div key={t as string}><div className="eyebrow mb-1">{t as string}</div>
            <ul>{(list as OutletProfile[]).map((x) => <li key={x.id}><button onClick={() => setId(x.id)} className={`w-full rounded px-2 py-1 text-left ${x.id === id ? 'bg-ink-800 font-semibold text-burgundy' : 'text-ink-200 hover:bg-ink-800'}`}>{x.name}</button></li>)}</ul></div>
        ))}
        {g.media!.fictional.length > 0 && <div><div className="eyebrow mb-1">Ficticios (surgidos en la partida)</div><ul>{g.media!.fictional.map((f) => <li key={f.id} className="px-2 py-1 text-ink-300">{f.name}{f.closedWeek !== undefined ? ' — cerrado' : ''}</li>)}</ul></div>}
      </nav>
      <article className="panel p-5" aria-labelledby="perfil-medio">
        <div className="kicker flex items-center gap-1.5"><Icon size={13} aria-hidden /> {o.type} · alcance {o.scope}{o.regionId ? ` · ${REGION_BY_ID[o.regionId].name}` : ''}</div>
        <h2 id="perfil-medio" className="mt-1 font-display text-3xl font-semibold text-ink-50">{o.name}</h2>
        <p className="text-sm text-ink-300">{o.coverageTopics} · formatos: {o.formats.join(', ')}</p>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="eyebrow">Funcionamiento</dt><dd className="text-ink-100">{o.founded ? `Desde ${o.founded.year}${o.founded.note ? ` — ${o.founded.note}` : ''}` : 'Fecha de fundación no verificada'} · activo: {o.activeEvidence.asOf}</dd></div>
          <div><dt className="eyebrow">Propiedad</dt><dd className="text-ink-100">{o.owner ? o.owner.name : 'No documentada en este registro'}</dd></div>
          {o.relations && <div className="sm:col-span-2"><dt className="eyebrow">Relaciones organizacionales</dt><dd className="text-ink-100">{o.relations.map((r) => r.text).join(' · ')}</dd></div>}
          <div className="sm:col-span-2"><dt className="eyebrow">Posiciones editoriales expresas</dt><dd className="text-ink-100">{o.editorialPositions.length ? o.editorialPositions.map((x) => x.text).join(' · ') : 'No se registran posiciones expresas verificadas. No se infieren de su audiencia ni de su propiedad.'}</dd></div>
        </dl>
        <section className="mt-5 grid gap-5 border-t border-ink-700 pt-4 md:grid-cols-2">
          <div>
            <h3 className="eyebrow">Orientación percibida por las audiencias</h3>
            {p ? (<><div className="mt-2"><PerceptionBar p={p} /></div>
              <p className="mt-1 text-[11px] text-ink-400">{STUDIES[p.studyId].title} (campo hasta {STUDIES[p.studyId].fieldwork}, n = {STUDIES[p.studyId].sample.toLocaleString('es-CL')}). Es una percepción declarada, no un análisis de contenido.</p>
              {p.meanByAudience && <p className="mt-1 text-[11px] text-ink-400">Promedio 1–7 según quien responde: izquierda {p.meanByAudience.left} · centro {p.meanByAudience.center} · derecha {p.meanByAudience.right}.</p>}
              {o.perception.length > 1 && <p className="mt-1 text-[11px] text-ink-400">Serie: {o.perception.map((x) => `${STUDIES[x.studyId].fieldwork.slice(0, 4)}: der. ${x.right}% / izq. ${x.left}%`).join(' · ')}</p>}</>)
              : <p className="mt-1 text-sm text-ink-300">Sin estudio verificado: no se le asigna orientación.</p>}
          </div>
          <div>
            <h3 className="eyebrow">Audiencia y credibilidad</h3>
            {cr ? <p className="mt-1 text-sm text-ink-200">Credibilidad (1–7): NSE alto {cr.nseAlto} · medio {cr.nseMedio} · bajo {cr.nseBajo}</p> : <p className="mt-1 text-sm text-ink-300">Sin datos de credibilidad por medio.</p>}
            {cons ? <p className="mt-1 text-sm text-ink-200">Consumo declarado (1–7): activo {cons.activo} · mixto {cons.mixto} · pasivo {cons.pasivo}{cons.capital ? ` · capital ${cons.capital} / regiones ${cons.regiones}` : ''}</p> : <p className="mt-1 text-sm text-ink-300">Sin datos de consumo: el modelo usa un supuesto por tipo y ámbito.</p>}
            {cons?.alignedGap !== undefined && <p className="mt-1 text-[11px] text-ink-400">Diferencia de consumo entre audiencias alineadas y no alineadas con su orientación percibida: {cons.alignedGap}. Indica composición de la audiencia, no la línea del medio.</p>}
            {g.media!.audience[o.id] && Math.abs(g.media!.audience[o.id] - 1) > 0.01 && <p className="mt-1 text-[11px] text-amber-300">Historia alternativa del juego: audiencia simulada ×{g.media!.audience[o.id].toFixed(2)} (no es un dato real).</p>}
          </div>
        </section>
        <section className="mt-5 border-t border-ink-700 pt-4">
          <h3 className="eyebrow">Prioridades editoriales (parámetros del modelo)</h3>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
            {Object.entries(o.priorities).map(([k, v]) => <div key={k}><div className="flex justify-between text-[11px] text-ink-300"><span>{k}</span><span className="font-mono">{Math.round(v * 100)}</span></div><div className="h-1.5 rounded-sm bg-ink-700"><div className="h-1.5 rounded-sm bg-[rgb(var(--c-blue))]" style={{ width: `${v * 100}%` }} /></div></div>)}
          </div>
          <p className="mt-2 text-[11px] text-ink-400">Estimaciones del autor a partir del formato y la descripción pública del medio; no son mediciones. Capacidad de cobertura semanal: {o.capacity}.</p>
        </section>
        {o.notes && <p className="mt-4 text-sm text-ink-300">{o.notes}</p>}
        <p className="mt-4 flex flex-wrap gap-3 text-xs">
          {[o.founded?.source, o.owner?.source, o.activeEvidence.source, ...o.perception.map((x) => STUDIES[x.studyId].url)].filter((x, i, a): x is string => !!x && a.indexOf(x) === i).map((u) => <a key={u} className="inline-flex items-center gap-1 text-burgundy underline underline-offset-2" href={u} target="_blank" rel="noreferrer">Fuente <ExternalLink size={11} aria-hidden /></a>)}
        </p>
      </article>
    </div>
  );
}

// ───────────────────────────── Pantalla ─────────────────────────────
export function MediaScreen() {
  const { game: g } = useGame();
  const [tab, setTab] = useState<Tab>('quiosco');
  const [cat, setCat] = useState<(typeof CATS)[number]['id']>('todas');
  const [outlet, setOutlet] = useState('');
  const [eventId, setEventId] = useState<string | null>(null);
  const covByEvent = useMemo(() => {
    const m = new Map<string, CoverageItem[]>(); for (const c of g?.media?.coverage ?? []) { const l = m.get(c.eventId) ?? []; l.push(c); m.set(c.eventId, l); } return m;
  }, [g]);
  if (!g) return null;
  const st = g.media;
  const events = [...(st?.events ?? [])].reverse();
  const pendingInv = st?.invites.filter((i) => i.status === 'pendiente').length ?? 0;
  const open = (id: string) => { setEventId(id); setTab('comparador'); };
  const items = g.news.filter((n) => (cat === 'todas' || n.category === cat) && (!outlet || n.outletId === outlet || (n.eventId && covByEvent.get(n.eventId)?.some((c) => c.outletId === outlet))));
  const sel = eventId ? st?.events.find((e) => e.id === eventId) : events[0];
  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-600 pb-3">
        <div><div className="kicker">Ecosistema de medios · cobertura simulada</div><h1 className="font-display text-3xl font-semibold text-ink-50">Prensa y medios</h1></div>
        {pendingInv > 0 && <button className="chip border-burgundy py-1 text-burgundy" onClick={() => setTab('entrevistas')}>{pendingInv} invitación(es) a entrevista</button>}
      </header>
      <Notice />
      <Tabs value={tab} onChange={setTab} options={[{ id: 'quiosco', label: 'Quiosco' }, { id: 'archivo', label: 'Archivo de noticias' }, { id: 'comparador', label: 'Comparador de coberturas' }, { id: 'entrevistas', label: 'Entrevistas' }, { id: 'medios', label: 'Perfiles de medios' }, { id: 'apariciones', label: 'Tus apariciones' }]} />
      {!st ? <Empty>El ecosistema de medios no está disponible en esta partida.</Empty> : (
        <>
          {tab === 'quiosco' && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {events.slice(0, 12).map((e, i) => {
                const cov = covByEvent.get(e.id) ?? [];
                return (
                  <button key={e.id} onClick={() => open(e.id)} className={`panel group flex flex-col p-4 text-left hover:border-burgundy ${i === 0 ? 'md:col-span-2 xl:col-span-2' : ''}`} data-testid="hecho">
                    <div className="kicker">{wk(g, e.week)} · {scopeLabel(e)}</div>
                    <div className={`mt-1 font-display font-semibold leading-snug text-ink-50 group-hover:text-burgundy ${i === 0 ? 'text-2xl' : 'text-lg'}`}>{e.headline}</div>
                    {i === 0 && e.body && <p className="mt-1 font-serif text-ink-200">{e.body}</p>}
                    <div className="mt-auto flex flex-wrap gap-1 pt-3">{cov.slice(0, 6).map((c) => <span key={c.id} className="chip">{outletName(c.outletId, g)}</span>)}{cov.length > 6 && <span className="chip">+{cov.length - 6}</span>}</div>
                    <div className="mt-1 text-[11px] text-ink-400">{cov.length} medio(s) · difusión digital {viralityLabel(e.virality)}</div>
                  </button>
                );
              })}
              {events.length === 0 && <Empty>Aún no hay hechos noticiosos.</Empty>}
            </div>
          )}
          {tab === 'archivo' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3"><Tabs value={cat} onChange={setCat} options={CATS} />
                <select className="input w-60" value={outlet} onChange={(ev) => setOutlet(ev.target.value)} aria-label="Medio"><option value="">Todos los medios</option>{OUTLETS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
              {items.length === 0 ? <Empty>No hay noticias con estos filtros.</Empty> : (
                <ul className="divide-y divide-ink-700">{items.map((n) => {
                  const cov = n.eventId ? covByEvent.get(n.eventId) ?? [] : [];
                  const mine = outlet ? cov.find((c) => c.outletId === outlet) : null;
                  const ev = mine ? st.events.find((x) => x.id === mine.eventId) : undefined;
                  return (
                    <li key={n.id} className="py-3">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-400"><span className="font-semibold uppercase tracking-wide text-burgundy">{outletName(mine?.outletId ?? n.outletId, g)}</span><span className="font-mono">{wk(g, n.week)}</span><span>· {n.category}</span>{cov.length > 1 && <span>· cubierto por {cov.length} medios</span>}</div>
                      <div className={`font-serif leading-snug text-ink-50 ${n.importance >= 4 ? 'text-xl' : 'text-[17px]'}`}>{mine && ev ? covHeadline(ev, mine) : n.headline}</div>
                      {(mine || n.body) && <div className="text-sm text-ink-300">{mine ? covDek(mine) : n.body}</div>}
                      {n.eventId && <button className="btn-link mt-1 text-xs" onClick={() => open(n.eventId!)}>Comparar coberturas</button>}
                    </li>
                  );
                })}</ul>
              )}
            </div>
          )}
          {tab === 'comparador' && (
            <div className="space-y-3">
              <label className="text-xs text-ink-400">Hecho <select className="input mt-1" value={sel?.id ?? ''} onChange={(ev) => setEventId(ev.target.value)} aria-label="Hecho a comparar">{events.slice(0, 80).map((e) => <option key={e.id} value={e.id}>{wk(g, e.week)} — {e.headline.slice(0, 90)}</option>)}</select></label>
              {sel ? <EventComparison g={g} e={sel} /> : <Empty>Sin hechos.</Empty>}
            </div>
          )}
          {tab === 'entrevistas' && <Interviews g={g} />}
          {tab === 'medios' && <Profiles g={g} />}
          {tab === 'apariciones' && (
            <div className="space-y-3">
              {st.appearances.length === 0 ? <Empty>Todavía no apareces en los medios. Al comienzo de tu carrera, la cobertura suele ser local.</Empty> : (
                <table className="table">
                  <thead><tr><th>Semana</th><th>Medio</th><th>Tipo</th><th>Tono</th><th>Efectos</th></tr></thead>
                  <tbody>{[...st.appearances].reverse().slice(0, 60).map((a, i) => <tr key={i}><td className="font-mono text-xs">{wk(g, a.week)}</td><td>{outletName(a.outletId, g)}</td><td className="text-xs">{a.kind}</td><td><ToneMark t={a.tone} /></td><td className="text-xs text-ink-300">{a.effects.join(' · ')}</td></tr>)}</tbody>
                </table>
              )}
              <p className="text-xs text-ink-400">Aparecer en un medio aumenta el conocimiento, pero la evaluación depende del tono, la credibilidad del medio y su audiencia: una cobertura crítica puede hacerte más conocido/a y peor evaluado/a.</p>
              {st.altHistory.length > 0 && (<section><h3 className="eyebrow mt-4">Historia alternativa del ecosistema (ficción)</h3><ul className="mt-1 space-y-1 text-xs text-ink-300">{st.altHistory.slice(-10).reverse().map((h, i) => <li key={i}>{wk(g, h.week)} — {h.text}</li>)}</ul></section>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
