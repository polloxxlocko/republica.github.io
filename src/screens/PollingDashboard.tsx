/**
 * POLLING DASHBOARD — «Archivo de Poder». Informes con plantilla editorial propia (no imita los
 * informes de ninguna encuestadora), comparador, promedio ponderado, estudios privados,
 * evaluación posterior a las elecciones y fichas documentadas de cada estudio.
 * Todo resultado mostrado es FICTICIO y lo indica de forma visible.
 */
import { useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, ExternalLink, FileText } from 'lucide-react';
import { useGame } from '../stores/gameStore';
import type { GameState, PolicyArea, RegionId } from '../game/models/types';
import type { PrivateStudy, Survey, SurveyQuestion } from '../game/polling/types';
import { MODE_LABEL, POLLSTER_PROFILES, PRIVATE_NOTICE, PROFILE_BY_ID, SIMULATION_NOTICE, WEIGHT_LABEL, pollsterName, pollsterOrg } from '../game/polling/registry';
import { measurementsFor, publicSurveys } from '../game/polling/queries';
import { aggregate } from '../game/polling/aggregator';
import { previousOf } from '../game/polling/publisher';
import { PRIVATE_SPECS, privateBlocked } from '../game/polling/private';
import { vedaFor, VEDA_DAYS } from '../game/polling/scheduler';
import { CATEGORICAL } from '../components/colorScales';
import { Empty, Tabs } from '../components/ui';
import { formatShort, weekToISO } from '../game/engine/dates';
import { REGIONS } from '../game/data/geography';
import { COMUNAS, COMUNA_BY_CUT } from '../game/territory/data';
import { AREA_LABELS } from '../game/rules/params';
import { homeCut } from '../game/career/capital';
import { ELECTION_LABELS } from '../game/systems/elections';

type Tab = 'informes' | 'comparador' | 'promedio' | 'privados' | 'precision' | 'estudios';
const HOUSE_COLOR: Record<string, string> = Object.fromEntries(POLLSTER_PROFILES.map((p, i) => [p.id, CATEGORICAL[i % CATEGORICAL.length]]));
const wkDate = (g: GameState, w: number) => formatShort(weekToISO(g.startDate, w));

function Notice({ privateReport = false }: { privateReport?: boolean }) {
  return <p role="note" className="border-l-2 border-burgundy bg-ink-800 px-3 py-2 text-xs font-medium text-ink-100">{privateReport ? PRIVATE_NOTICE : SIMULATION_NOTICE}</p>;
}

function optLabel(g: GameState, key: string, label: string) {
  const c = g.characters[key]; if (c) return `${c.firstName} ${c.lastName.split(' ')[0]}`;
  return label;
}

// ─────────────────────────── Informe individual ───────────────────────────
function QuestionBlock({ g, q, prev }: { g: GameState; q: SurveyQuestion; prev?: SurveyQuestion }) {
  const subj = q.subject && g.characters[q.subject] ? `${g.characters[q.subject].firstName} ${g.characters[q.subject].lastName}` : q.subject;
  return (
    <section className="border-t border-ink-700 pt-3" aria-label={q.text}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-serif text-[16px] leading-snug text-ink-50">{q.text}</h4>
        {q.hypothetical && <span className="chip border-amber-500/60 text-amber-300">Escenario hipotético, no un resultado</span>}
      </div>
      {subj && q.topic !== 'figuras' && q.topic !== 'politica_publica' && <div className="text-xs text-ink-400">{subj}</div>}
      <table className="mt-2 w-full text-sm">
        <thead className="sr-only"><tr><th>Respuesta</th><th>Porcentaje</th><th>Cambio</th></tr></thead>
        <tbody>
          {q.options.map((o) => {
            const before = prev?.options.find((x) => x.key === o.key)?.pct;
            const d = before !== undefined ? o.pct - before : null;
            return (
              <tr key={o.key}>
                <td className="w-[40%] py-0.5 pr-2 text-ink-200">{optLabel(g, o.key, o.label)}</td>
                <td className="py-0.5"><div className="h-2 rounded-sm bg-ink-700"><div className="h-2 rounded-sm" style={{ width: `${Math.min(100, o.pct)}%`, background: o.key === 'ns' || o.key === 'ninguno' || o.key === 'nc' ? 'rgb(var(--c-faint))' : g.parties[o.key]?.color ?? 'rgb(var(--c-blue))' }} /></div></td>
                <td className="w-16 py-0.5 text-right font-mono text-ink-50">{o.pct.toFixed(0)}%</td>
                <td className="w-14 py-0.5 text-right font-mono text-[11px] text-ink-400">{d === null ? '' : `${d >= 0 ? '+' : ''}${d.toFixed(0)}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-ink-400">
        <span>Base: {q.base} casos</span>
        {q.mean !== undefined && <span>Nota promedio {q.mean.toFixed(1)}</span>}
        {q.topic === 'problemas' && <span>Respuesta múltiple</span>}
        {prev && <span>Cambio respecto de la medición anterior del mismo estudio (puntos)</span>}
      </div>
      {q.territorial && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-ink-300">Submuestras por macrozona (≥ 200 casos; mayor incertidumbre)</summary>
          <table className="table mt-1"><thead><tr><th>Macrozona</th><th>n</th>{q.options.slice(0, 4).map((o) => <th key={o.key}>{optLabel(g, o.key, o.label)}</th>)}</tr></thead>
            <tbody>{q.territorial.map((t) => <tr key={t.label}><td>{t.label}</td><td className="font-mono">{t.n}</td>{q.options.slice(0, 4).map((o) => <td key={o.key} className="font-mono">{(t.options.find((x) => x.key === o.key)?.pct ?? 0).toFixed(0)}%</td>)}</tr>)}</tbody></table>
          <p className="mt-1 text-ink-400">Las submuestras regionales de una encuesta nacional no permiten estimaciones comunales.</p>
        </details>
      )}
    </section>
  );
}

function csvOf(g: GameState, sv: Survey): string {
  const rows = [[sv.privateFor ? PRIVATE_NOTICE : SIMULATION_NOTICE], ['Estudio', pollsterName(g, sv.pollsterId)], ['Organización', pollsterOrg(g, sv.pollsterId)], ['Publicación', wkDate(g, sv.publishedWeek)], ['Campo', `${wkDate(g, sv.fieldStartWeek)} – ${wkDate(g, sv.fieldEndWeek)}`], ['n', String(sv.n)], ['Modalidad', MODE_LABEL[sv.mode]], ['Incertidumbre', sv.uncertainty.text], [], ['Pregunta', 'Respuesta', 'Porcentaje']];
  for (const q of sv.questions) for (const o of q.options) rows.push([q.text, optLabel(g, o.key, o.label), o.pct.toFixed(1)]);
  return rows.map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

function Report({ g, sv, onClose }: { g: GameState; sv: Survey; onClose: () => void }) {
  const prev = sv.privateFor ? undefined : previousOf(g, sv);
  const prof = PROFILE_BY_ID[sv.pollsterId];
  return (
    <article className="panel overflow-hidden" aria-labelledby="informe-titulo">
      <header className="border-b border-ink-600 bg-ink-800 px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="kicker">{sv.privateFor ? 'Informe privado' : `Edición ${sv.edition}`} · publicada {wkDate(g, sv.publishedWeek)}{sv.flash ? ' · edición extraordinaria' : ''}</div>
          <div className="flex gap-1">
            <button className="btn btn-ghost text-xs" onClick={() => download(`encuesta-ficticia-${sv.pollsterId}-${sv.publishedWeek}.csv`, csvOf(g, sv))}><Download size={14} aria-hidden /> Exportar CSV</button>
            <button className="btn btn-ghost text-xs" onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <h2 id="informe-titulo" className="mt-1 font-display text-3xl font-semibold text-ink-50">{pollsterName(g, sv.pollsterId)}</h2>
        <p className="font-serif text-lg text-ink-200">{sv.headline}</p>
        <div className="mt-2"><Notice privateReport={!!sv.privateFor} /></div>
      </header>
      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <div className="space-y-4">
          {sv.veda && <p className="text-sm text-amber-300">Edición en período de veda: la Ley 18.700 (art. 37) impide divulgar encuestas de preferencias electorales en los {VEDA_DAYS} días previos a la elección.</p>}
          {sv.questions.map((q) => <QuestionBlock key={q.id} g={g} q={q} prev={prev?.questions.find((x) => x.id === q.id)} />)}
          {sv.reactions.length > 0 && (
            <section className="border-t border-ink-700 pt-3"><h4 className="eyebrow">Repercusiones</h4><ul className="mt-1 space-y-1 text-sm text-ink-200">{sv.reactions.map((r, i) => <li key={i}>— {r}</li>)}</ul></section>
          )}
        </div>
        <aside className="space-y-3 text-sm">
          <h3 className="eyebrow">Ficha técnica (simulada)</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            <dt className="text-ink-400">Organización</dt><dd className="text-ink-100">{pollsterOrg(g, sv.pollsterId)}</dd>
            <dt className="text-ink-400">Trabajo de campo</dt><dd className="font-mono text-ink-100">{wkDate(g, sv.fieldStartWeek)} – {wkDate(g, sv.fieldEndWeek)} ({sv.fieldDays} días)</dd>
            <dt className="text-ink-400">Universo</dt><dd className="text-ink-100">{sv.universe}</dd>
            <dt className="text-ink-400">Cobertura</dt><dd className="text-ink-100">{sv.coverage}{sv.territory?.label ? ` · ${sv.territory.label}` : ''}</dd>
            <dt className="text-ink-400">Muestra</dt><dd className="font-mono text-ink-100">{sv.n} casos</dd>
            <dt className="text-ink-400">Modalidad</dt><dd className="text-ink-100">{MODE_LABEL[sv.mode]}</dd>
            <dt className="text-ink-400">Diseño</dt><dd className="text-ink-100">{sv.design === 'probabilistico' ? 'Probabilístico' : 'No probabilístico'}</dd>
            <dt className="text-ink-400">Ponderación</dt><dd className="text-ink-100">{sv.weighting.map((w) => WEIGHT_LABEL[w]).join(', ')}</dd>
          </dl>
          <p className="border-l-2 border-ink-500 pl-2 text-[13px] text-ink-200">{sv.uncertainty.text}</p>
          <p className="text-xs text-ink-400">Método del período: {sv.methodNote}</p>
          {prof?.real && <p className="text-xs text-ink-400">La organización real no participa en este juego ni avala estos resultados. Ficha documentada en la pestaña «Estudios».</p>}
          <p className="text-xs text-ink-400">Una diferencia pequeña entre mediciones puede deberse al error de muestreo, la cobertura, la ponderación o la fecha de campo: no es necesariamente una tendencia.</p>
        </aside>
      </div>
      <footer className="border-t border-ink-700 px-5 py-3"><Notice privateReport={!!sv.privateFor} /></footer>
    </article>
  );
}

function ReportCard({ g, sv, onOpen }: { g: GameState; sv: Survey; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="panel group flex w-full flex-col p-4 text-left transition hover:border-burgundy" data-testid="informe">
      <div className="flex items-center gap-2 text-[11px] text-ink-400">
        <span className="h-2 w-2 rounded-full" style={{ background: HOUSE_COLOR[sv.pollsterId] ?? '#6B7076' }} aria-hidden />
        <span className="font-semibold uppercase tracking-wide text-ink-200">{pollsterName(g, sv.pollsterId)}</span>
        <span className="font-mono">{wkDate(g, sv.publishedWeek)}</span>
        {sv.coverage !== 'nacional' && <span className="chip">{sv.territory?.label}</span>}
      </div>
      <div className="mt-1.5 font-serif text-[17px] leading-snug text-ink-50 group-hover:text-burgundy">{sv.headline}</div>
      <div className="mt-auto pt-2 text-[11px] text-ink-400">{sv.n} casos · {MODE_LABEL[sv.mode]} · {sv.questions.length} preguntas · <span className="font-medium">ficticia</span></div>
    </button>
  );
}

// ─────────────────────────── Comparador ───────────────────────────
type Indicator = { id: string; label: string; qid: string; key: string; basis: 'valid' | 'all' };
function indicators(g: GameState): Indicator[] {
  const out: Indicator[] = [
    { id: 'aprob', label: 'Aprobación presidencial', qid: 'aprobacion', key: 'aprueba', basis: 'all' },
    { id: 'desaprob', label: 'Desaprobación presidencial', qid: 'aprobacion', key: 'desaprueba', basis: 'all' },
    { id: 'eco', label: 'Situación económica: mala', qid: 'economia', key: 'mala', basis: 'all' },
    { id: 'seg', label: 'Inseguridad en el barrio', qid: 'seguridad', key: 'inseguro', basis: 'all' },
    { id: 'rumbo', label: 'El país va por mal camino', qid: 'expectativas', key: 'malo', basis: 'all' },
  ];
  const parties = Object.values(g.parties).filter((p) => p.active).sort((a, b) => (g.nationalIntention[b.id] ?? 0) - (g.nationalIntention[a.id] ?? 0)).slice(0, 12);
  for (const p of parties) out.push({ id: `par_${p.id}`, label: `Intención por partido: ${p.short}`, qid: 'partidos', key: p.id, basis: 'valid' });
  const cands = new Set<string>();
  for (const sv of publicSurveys(g)) for (const q of sv.questions) if (q.id === 'presidencial_lista') q.options.forEach((o) => g.characters[o.key] && cands.add(o.key));
  for (const c of cands) out.push({ id: `pre_${c}`, label: `Presidencial (lista): ${optLabel(g, c, c)}`, qid: 'presidencial_lista', key: c, basis: 'valid' });
  return out;
}

function Comparator({ g }: { g: GameState }) {
  const inds = useMemo(() => indicators(g), [g]);
  const [ind, setInd] = useState(inds[0].id);
  const [houses, setHouses] = useState<string[]>(POLLSTER_PROFILES.filter((p) => p.coverage === 'nacional').map((p) => p.id));
  const [range, setRange] = useState(26);
  const I = inds.find((x) => x.id === ind) ?? inds[0];
  const from = range ? g.week - range : -1;
  const ms = measurementsFor(g, I.qid, { basis: I.basis }).filter((m) => m.week >= from);
  const sel = ms.filter((m) => houses.includes(m.house) && m.values[I.key] !== undefined);
  const weeks = [...new Set(ms.map((m) => m.week))].sort((a, b) => a - b);
  const data = weeks.map((w) => {
    const row: Record<string, number | [number, number] | null> = { week: w };
    for (const h of houses) { const m = sel.find((x) => x.house === h && x.week === w); row[h] = m ? m.values[I.key] : null; }
    const agg = aggregate(ms.filter((m) => houses.includes(m.house)), { asOf: w });
    const v = agg?.values[I.key];
    row.prom = v ? v.mean : null; row.banda = v ? [v.low, v.high] : null;
    return row;
  });
  const changes = POLLSTER_PROFILES.flatMap((p) => p.methods.slice(1).map((m) => ({ p, m }))).map(({ p, m }) => ({ p, m, week: Math.round((Date.parse(m.from) - Date.parse(g.startDate)) / 604_800_000) })).filter((x) => x.week >= (weeks[0] ?? 0) && x.week <= g.week && houses.includes(x.p.id));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label className="text-xs text-ink-400">Indicador
          <select className="input mt-1" value={ind} onChange={(e) => setInd(e.target.value)} aria-label="Indicador">{inds.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        </label>
        <label className="text-xs text-ink-400">Período
          <select className="input mt-1" value={range} onChange={(e) => setRange(Number(e.target.value))} aria-label="Período"><option value={13}>Últimas 13 semanas</option><option value={26}>Últimas 26 semanas</option><option value={52}>Último año</option><option value={0}>Toda la partida</option></select>
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-2 text-sm"><legend className="sr-only">Encuestadoras</legend>
        {POLLSTER_PROFILES.filter((p) => p.coverage === 'nacional').map((p) => (
          <label key={p.id} className="chip cursor-pointer gap-1.5 py-1 text-xs">
            <input type="checkbox" checked={houses.includes(p.id)} onChange={(e) => setHouses(e.target.checked ? [...houses, p.id] : houses.filter((x) => x !== p.id))} />
            <span className="h-2 w-2 rounded-full" style={{ background: HOUSE_COLOR[p.id] }} aria-hidden />{pollsterName(g, p.id)}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-ink-400">{I.basis === 'valid' ? 'Base: votos válidamente emitidos (se excluyen indecisos, blancos y nulos) para comparar estudios con distinto tratamiento de indecisos.' : 'Base: total de entrevistados.'} No se mezclan indicadores distintos en un mismo gráfico.</p>
      {sel.length === 0 ? <Empty>No hay mediciones de este indicador en el período y estudios elegidos.</Empty> : (
        <figure>
          <figcaption className="mb-1 text-sm font-medium text-ink-100">{I.label} (%) — encuestas ficticias de la partida</figcaption>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#DDD6CA" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(w) => wkDate(g, w)} tick={{ fill: '#5C6369', fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: '#5C6369', fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: '#FCFAF6', color: '#27313B', border: '1px solid #CEC6B9', borderRadius: 6, fontSize: 12 }} labelFormatter={(w) => wkDate(g, Number(w))}
                  formatter={(v: unknown, name: string) => [Array.isArray(v) ? `${(v as number[])[0].toFixed(1)}–${(v as number[])[1].toFixed(1)}%` : `${Number(v).toFixed(1)}%`, name === 'banda' ? 'Intervalo del promedio' : name === 'prom' ? 'Promedio ponderado' : pollsterName(g, name)]} />
                <Area dataKey="banda" stroke="none" fill="#782F3D" fillOpacity={0.1} isAnimationActive={false} connectNulls />
                <Line dataKey="prom" stroke="#782F3D" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                {houses.map((h) => <Line key={h} dataKey={h} stroke={HOUSE_COLOR[h]} strokeWidth={1.5} dot={{ r: 3 }} isAnimationActive={false} connectNulls />)}
                {changes.map((c) => <ReferenceLine key={c.p.id + c.m.from} x={c.week} stroke="#5C6369" strokeDasharray="4 3" label={{ value: `Cambio metodológico ${pollsterName(g, c.p.id)}`, fontSize: 10, fill: '#5C6369' }} />)}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-300">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-burgundy" aria-hidden />Promedio ponderado (banda: intervalo)</span>
            {houses.map((h) => <span key={h} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: HOUSE_COLOR[h] }} aria-hidden />{pollsterName(g, h)}</span>)}
          </div>
        </figure>
      )}
      {sel.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Fin del campo</th><th>Estudio</th><th>n</th><th>Valor</th><th>± orientativo</th></tr></thead>
            <tbody>{[...sel].reverse().slice(0, 30).map((m, i) => <tr key={i}><td className="font-mono text-xs">{wkDate(g, m.week)}</td><td>{pollsterName(g, m.house)}</td><td className="font-mono text-xs">{m.n}</td><td className="font-mono">{m.values[I.key].toFixed(1)}%</td><td className="font-mono text-xs">±{(1.96 * Math.sqrt((m.values[I.key] / 100) * (1 - m.values[I.key] / 100) / Math.max(30, m.effN)) * 100).toFixed(1)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <Notice />
    </div>
  );
}

// ─────────────────────────── Promedio ───────────────────────────
function Average({ g }: { g: GameState }) {
  const [qid, setQid] = useState<'partidos' | 'presidencial_lista' | 'aprobacion'>('aprobacion');
  const ms = measurementsFor(g, qid);
  const agg = ms.length ? aggregate(ms, { asOf: g.week }) : null;
  const rows = agg ? Object.entries(agg.values).filter(([k]) => !['ns', 'ninguno', 'nc'].includes(k)).sort((a, b) => b[1].mean - a[1].mean) : [];
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section>
        <Tabs value={qid} onChange={setQid} options={[{ id: 'aprobacion', label: 'Aprobación' }, { id: 'partidos', label: 'Partidos' }, { id: 'presidencial_lista', label: 'Presidencial' }]} />
        {!agg ? <div className="mt-3"><Empty>Aún no hay mediciones suficientes para esta estimación.</Empty></div> : (
          <table className="table mt-3">
            <thead><tr><th>Opción</th><th>Estimación</th><th>Intervalo</th><th className="w-1/3"><span className="sr-only">Rango</span></th></tr></thead>
            <tbody>{rows.map(([k, v]) => (
              <tr key={k}><td>{optLabel(g, k, g.parties[k]?.short ?? (k === 'aprueba' ? 'Aprueba' : k === 'desaprueba' ? 'Desaprueba' : k))}</td><td className="font-mono">{v.mean.toFixed(1)}%</td><td className="font-mono text-xs text-ink-300">{v.low.toFixed(1)} – {v.high.toFixed(1)}</td>
                <td><div className="relative h-2 rounded-sm bg-ink-700"><div className="absolute h-2 rounded-sm bg-burgundy/30" style={{ left: `${v.low}%`, width: `${Math.max(0.5, v.high - v.low)}%` }} /><div className="absolute h-2 w-0.5 bg-burgundy" style={{ left: `${v.mean}%` }} /></div></td></tr>
            ))}</tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-ink-400">{qid === 'aprobacion' ? 'Base: total de entrevistados.' : 'Base: votos válidamente emitidos.'} Es una estimación imperfecta de lo que publican los estudios, no el estado real del electorado.</p>
      </section>
      <section className="space-y-3">
        <h3 className="eyebrow">Cómo se pondera</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-200">
          <li>Antigüedad: el peso se reduce a la mitad cada 3 semanas (6 para estudios semestrales).</li>
          <li>Tamaño efectivo: casos divididos por el efecto de diseño (más alto en muestras no probabilísticas).</li>
          <li>Tope por encuestadora: publicar más seguido no da más peso más allá de un límite.</li>
          <li>Mediciones superpuestas de un mismo estudio cuentan menos.</li>
          <li>Efectos de casa estimados con el historial de la partida: se corrige la mitad, con contracción.</li>
          <li>Incertidumbre: muestral combinada + dispersión entre estudios + un piso de modelo.</li>
        </ul>
        {agg && (
          <table className="table">
            <thead><tr><th>Estudio</th><th>Mediciones</th><th>Última</th><th>Peso</th></tr></thead>
            <tbody>{agg.houses.map((h) => <tr key={h.house}><td>{pollsterName(g, h.house)}</td><td className="font-mono">{h.measurements}</td><td className="font-mono text-xs">{wkDate(g, h.lastWeek)}</td><td className="font-mono">{(h.share * 100).toFixed(0)}%</td></tr>)}</tbody>
          </table>
        )}
        <Notice />
      </section>
    </div>
  );
}

// ─────────────────────────── Estudios privados ───────────────────────────
function PrivatePolls({ g, open }: { g: GameState; open: (sv: Survey) => void }) {
  const { act } = useGame();
  const me = g.characters[g.player.characterId];
  const [region, setRegion] = useState<RegionId>(me.regionId);
  const [cut, setCut] = useState<number>(homeCut(g));
  const [area, setArea] = useState<PolicyArea>(me.specialty);
  const delivered = (g.polling?.surveys ?? []).filter((x) => x.privateFor === me.id).reverse();
  return (
    <div className="space-y-6">
      <Notice privateReport />
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs text-ink-400">Región (estudio regional)<select className="input mt-1" value={region} onChange={(e) => setRegion(e.target.value as RegionId)}>{REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label className="text-xs text-ink-400">Comuna (sondeo comunal)<select className="input mt-1" value={cut} onChange={(e) => setCut(Number(e.target.value))}>{COMUNAS.filter((c) => c.region === region).map((c) => <option key={c.cut} value={c.cut}>{c.name}</option>)}{!COMUNAS.some((c) => c.region === region && c.cut === cut) && <option value={cut}>{COMUNA_BY_CUT[cut]?.name}</option>}</select></label>
        <label className="text-xs text-ink-400">Área (opinión sobre un programa)<select className="input mt-1" value={area} onChange={(e) => setArea(e.target.value as PolicyArea)}>{(Object.keys(AREA_LABELS) as PolicyArea[]).map((a) => <option key={a} value={a}>{AREA_LABELS[a]}</option>)}</select></label>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(PRIVATE_SPECS) as PrivateStudy[]).map((st) => {
          const spec = PRIVATE_SPECS[st];
          const blocked = privateBlocked(g, st) ?? (g.player.actionPoints < 1 ? 'Requiere 1 PA' : null);
          return (
            <div key={st} className="panel flex flex-col p-4">
              <div className="font-serif text-lg text-ink-50">{spec.label}</div>
              <p className="mt-1 text-sm text-ink-300">{spec.description}</p>
              <div className="mt-2 font-mono text-xs text-ink-400">{spec.cost} MM$ · {spec.weeks} semanas · ~{spec.n} casos</div>
              <button className="btn btn-primary mt-3 self-start" disabled={!!blocked} title={blocked ?? undefined} onClick={() => act({ type: 'encargar_encuesta', study: st, region, cut, area })} data-testid={`encargar-${st}`}>Encargar (1 PA)</button>
              {blocked && <p className="mt-1 text-[11px] text-amber-300">{blocked}</p>}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-ink-400">Costos, plazos y tamaños son parámetros del juego. Un estudio privado tiene error y efectos de método como cualquier encuesta: no revela el apoyo real.</p>
      {(g.polling?.orders.length ?? 0) > 0 && <p className="text-sm text-ink-200">En curso: {g.polling!.orders.map((o) => `${PRIVATE_SPECS[o.study].label} (listo ${wkDate(g, o.readyWeek)})`).join(' · ')}</p>}
      <section>
        <h3 className="eyebrow mb-2">Informes entregados</h3>
        {delivered.length === 0 ? <Empty>Aún no has encargado estudios.</Empty> : <div className="grid gap-3 md:grid-cols-2">{delivered.map((sv) => <ReportCard key={sv.id} g={g} sv={sv} onOpen={() => open(sv)} />)}</div>}
      </section>
    </div>
  );
}

// ─────────────────────────── Precisión ───────────────────────────
function Accuracy({ g }: { g: GameState }) {
  const ev = [...(g.polling?.evaluations ?? [])].reverse();
  return (
    <div className="space-y-5">
      <p className="max-w-[70ch] text-sm text-ink-200">Después de cada elección nacional se comparan las últimas encuestas publicadas (base votos válidos) y el promedio ponderado con los resultados oficiales <b>ficticios</b> de esta partida. Son métricas descriptivas de esta partida, no juicios sobre la calidad real de ninguna organización.</p>
      {ev.length === 0 ? <Empty>Todavía no hay elecciones con encuestas que evaluar.</Empty> : ev.map((e) => (
        <section key={e.resultId} className="panel p-4">
          <h3 className="font-serif text-lg text-ink-50">{ELECTION_LABELS[e.electionType as keyof typeof ELECTION_LABELS] ?? e.electionType} · {wkDate(g, e.week)}</h3>
          {e.rows.length === 0 ? <p className="text-sm text-ink-400">Ningún estudio publicó esta pregunta antes de la veda.</p> : (
            <table className="table mt-2">
              <thead><tr><th>Estudio</th><th>Fin del campo</th><th>Error absoluto medio</th><th>Error máximo</th><th>Error en el margen 1.º–2.º</th></tr></thead>
              <tbody>
                {e.rows.map((r) => <tr key={r.pollsterId}><td>{pollsterName(g, r.pollsterId)}</td><td className="font-mono text-xs">{wkDate(g, r.fieldEndWeek)}</td><td className="font-mono">{r.mae.toFixed(1)} pp</td><td className="font-mono">{r.maxErr.toFixed(1)} pp</td><td className="font-mono">{r.marginErr.toFixed(1)} pp</td></tr>)}
                {e.aggregate && <tr className="font-semibold"><td>Promedio ponderado</td><td>—</td><td className="font-mono">{e.aggregate.mae.toFixed(1)} pp</td><td className="font-mono">{e.aggregate.maxErr.toFixed(1)} pp</td><td className="font-mono">{e.aggregate.marginErr.toFixed(1)} pp</td></tr>}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
}

// ─────────────────────────── Estudios (fichas) ───────────────────────────
function Profiles({ g }: { g: GameState }) {
  return (
    <div className="space-y-4">
      <p className="max-w-[70ch] text-sm text-ink-200">Fichas de los estudios de opinión usados como referencia. Los antecedentes provienen de fichas técnicas públicas (fuentes enlazadas); pueden cambiar con el tiempo y se configuran por período. Dentro de cada partida, cada estudio tiene <b>parámetros ficticios del modelo</b> (desviaciones persistentes que se sortean con la semilla): no representan evaluaciones de las instituciones reales y no se muestran para preservar la incertidumbre.</p>
      <div className="grid gap-4 xl:grid-cols-2">
        {POLLSTER_PROFILES.map((p) => (
          <article key={p.id} className="panel p-4">
            <div className="flex items-baseline justify-between gap-2"><h3 className="font-display text-xl font-semibold text-ink-50">{pollsterName(g, p.id)}</h3>{!p.real && <span className="chip">ficticio</span>}</div>
            <div className="text-sm text-ink-300">{pollsterOrg(g, p.id)} · {p.coverage} · {p.activeSince}</div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-ink-400">Periodicidad</dt><dd className="text-ink-100">{p.periodicity}</dd>
              <dt className="text-ink-400">Temáticas</dt><dd className="text-ink-100">{p.topics.join(', ').replace(/_/g, ' ')}</dd>
              <dt className="text-ink-400">Advertencias</dt><dd className="text-ink-100">{p.caveats}</dd>
            </dl>
            <h4 className="eyebrow mt-3">Períodos metodológicos</h4>
            <ol className="mt-1 space-y-2 text-[13px]">
              {p.methods.map((m) => (
                <li key={m.from} className="border-l-2 border-ink-500 pl-2">
                  <div className="font-mono text-xs text-ink-400">{m.from}{m.to ? ` → ${m.to}` : ' → vigente'} · {MODE_LABEL[m.mode]} · {m.design === 'probabilistico' ? 'probabilístico' : 'no probabilístico'} · n {m.sample[0]}–{m.sample[1]}</div>
                  <div className="text-ink-200">{m.note}</div>
                  {m.source !== '—' && <a className="inline-flex items-center gap-1 text-xs text-burgundy underline underline-offset-2" href={m.source} target="_blank" rel="noreferrer">Fuente <ExternalLink size={11} aria-hidden /></a>}
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── Pantalla ───────────────────────────
export function PollingDashboard() {
  const { game: g } = useGame();
  const [tab, setTab] = useState<Tab>('informes');
  const [house, setHouse] = useState('todas');
  const [openId, setOpenId] = useState<string | null>(null);
  if (!g) return null;
  const surveys = publicSurveys(g, (x) => house === 'todas' || x.pollsterId === house).slice().reverse();
  const opened = openId ? g.polling?.surveys.find((x) => x.id === openId) : null;
  const veda = vedaFor(g);
  const setNames = (v: 'reales' | 'ficticios') => useGame.setState({ game: { ...g, settings: { ...g.settings, pollNames: v } } });
  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-600 pb-3">
        <div>
          <div className="kicker">Opinión pública · información imperfecta</div>
          <h1 className="font-display text-3xl font-semibold text-ink-50">Encuestas</h1>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-300">Nombres de estudios
          <select className="input w-auto" value={g.settings.pollNames ?? 'reales'} onChange={(e) => setNames(e.target.value as 'reales' | 'ficticios')} aria-label="Nombres de estudios"><option value="reales">Referencias reales</option><option value="ficticios">Alternativas ficticias</option></select>
        </label>
      </header>
      <Notice />
      {veda && <p className="border-l-2 border-amber-400 pl-3 text-sm text-amber-200">Veda electoral: no se divulgan encuestas de preferencias electorales en los {VEDA_DAYS} días previos a la elección del {formatShort(veda.date)} (Ley 18.700, art. 37).</p>}
      <Tabs value={tab} onChange={(t) => { setTab(t); setOpenId(null); }} options={[{ id: 'informes', label: 'Publicaciones' }, { id: 'comparador', label: 'Comparador' }, { id: 'promedio', label: 'Promedio' }, { id: 'privados', label: 'Estudios privados' }, { id: 'precision', label: 'Historial y precisión' }, { id: 'estudios', label: 'Estudios' }]} />
      {opened ? <Report g={g} sv={opened} onClose={() => setOpenId(null)} /> : (
        <>
          {tab === 'informes' && (
            <div className="space-y-3">
              <label className="text-xs text-ink-400">Estudio <select className="input ml-2 w-auto" value={house} onChange={(e) => setHouse(e.target.value)} aria-label="Filtrar por estudio"><option value="todas">Todos</option>{POLLSTER_PROFILES.map((p) => <option key={p.id} value={p.id}>{pollsterName(g, p.id)}</option>)}</select></label>
              {surveys.length === 0 ? <Empty>Sin publicaciones.</Empty> : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{surveys.slice(0, 24).map((sv) => <ReportCard key={sv.id} g={g} sv={sv} onOpen={() => setOpenId(sv.id)} />)}</div>
              )}
              <p className="flex items-center gap-1.5 text-xs text-ink-400"><FileText size={13} aria-hidden /> Cada estudio publica según su propio calendario simulado. No todas las ediciones incluyen todas las preguntas.</p>
            </div>
          )}
          {tab === 'comparador' && <Comparator g={g} />}
          {tab === 'promedio' && <Average g={g} />}
          {tab === 'privados' && <PrivatePolls g={g} open={(sv) => setOpenId(sv.id)} />}
          {tab === 'precision' && <Accuracy g={g} />}
          {tab === 'estudios' && <Profiles g={g} />}
        </>
      )}
      <p className="text-[11px] text-ink-400">Las encuestas nacionales no permiten estimaciones comunales; las proyecciones territoriales del mapa son modelos, no datos encuestados.</p>
    </div>
  );
}
