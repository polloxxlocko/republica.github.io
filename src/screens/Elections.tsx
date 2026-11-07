import { useMemo, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { useGame } from '../stores/gameStore';
import type { Dim, RegionId } from '../game/models/types';
import { Badge, Bar, Empty, Panel, PartyChip, Stat, Tabs } from '../components/ui';
import { ELECTION_LABELS, REGISTRATION_WEEKS } from '../game/systems/elections';
import { actionBlocked, me } from '../game/systems/player';
import { AspirationPanel } from './Career';
import { formatShort, weekToISO } from '../game/engine/dates';
import { POLLSTERS } from '../game/data/institutions';
import { DIMS, DIM_LABELS } from '../game/rules/params';
import { REGIONS } from '../game/data/geography';
import { charName, partyColor, partyShort, pct, num, mm } from '../app/selectors';
import { officeLabel } from '../game/systems/characters';
import { pollAverage } from '../game/systems/polls';

export function Elections() {
  const { game: g, act, openNight } = useGame();
  const [tab, setTab] = useState<'candidatura' | 'encuestas' | 'resultados'>('candidatura');
  const [budget, setBudget] = useState(10);
  const [msg, setMsg] = useState<Dim | ''>('');
  const [side, setSide] = useState<-1 | 1>(1);
  const [focus, setFocus] = useState<RegionId | ''>('');
  const partySeries = useMemo(() => {
    if (!g) return { data: [] as Record<string, number>[], keys: [] as string[] };
    const weeks = [...new Set(g.polls.filter((p) => p.kind === 'partidos').map((p) => p.week))].sort((a, b) => a - b);
    const avg = pollAverage(g, 'partidos', 6);
    const keys = Object.entries(avg).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k]) => k);
    const data = weeks.filter((_, i) => i % 2 === 0 || i === weeks.length - 1).map((w) => {
      const row: Record<string, number> = { semana: w };
      const ps = g.polls.filter((p) => p.kind === 'partidos' && p.week <= w && w - p.week < 6);
      for (const k of keys) { const v = ps.map((p) => p.values[k]).filter((x) => x !== undefined); if (v.length) row[k] = Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)); }
      return row;
    });
    return { data, keys };
  }, [g]);
  if (!g) return null;
  const c = me(g);
  const camp = g.player.campaign;
  const presPolls = g.polls.filter((p) => p.kind === 'presidencial').slice(-8).reverse();
  const latest = g.polls.filter((p) => p.kind === 'partidos').slice(-8).reverse();
  return (
    <div className="space-y-4">
      <div><div className="eyebrow">Competencia electoral</div><h1 className="font-display text-2xl font-bold">Elecciones</h1></div>
      <Panel title="Calendario">
        <div className="flex flex-wrap gap-2">{g.calendar.filter((e) => !e.done && e.week >= g.week).slice(0, 10).map((e) => (
          <div key={e.id} className="rounded-lg border border-ink-700 px-3 py-2 text-sm"><div className="font-medium">{ELECTION_LABELS[e.type]}</div><div className="font-mono text-xs text-ink-400">{formatShort(e.date)} · {e.week - g.week} sem.{e.week - g.week >= REGISTRATION_WEEKS ? ` · inscripción ${e.week - g.week - REGISTRATION_WEEKS} sem.` : ' · inscripción cerrada'}</div></div>
        ))}</div>
      </Panel>
      <Tabs value={tab} onChange={setTab} options={[{ id: 'candidatura', label: 'Aspiración y campaña' }, { id: 'encuestas', label: 'Encuestas' }, { id: 'resultados', label: 'Resultados' }]} />
      {tab === 'candidatura' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <AspirationPanel />
            {g.player.candidacies.length > 0 && (
              <Panel title="Tus candidaturas inscritas">
                {g.player.candidacies.map((k) => { const ev = g.calendar.find((x) => x.id === k.electionId); return (
                  <div key={k.electionId} className="flex items-center justify-between text-sm"><span>{ev ? ELECTION_LABELS[ev.type] : k.electionId} · {officeLabel(k.office, c.gender)} · {k.partyId === 'IND' ? 'independiente' : partyShort(g, k.partyId)}</span>{ev && <button className="btn btn-ghost text-xs text-red-300" onClick={() => act({ type: 'retirar_candidatura', electionId: k.electionId })}>Retirar</button>}</div>
                ); })}
              </Panel>
            )}
          </div>
          <Panel title="Campaña">
            {!camp ? <Empty>Cuando tu partido te nomine (o reúnas las firmas), aquí podrás dirigir la campaña: presupuesto, mensaje, territorio, equipos y actividades.</Empty> : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3"><Stat label="Intensidad" value={Math.round(camp.intensity)} /><Stat label="Presupuesto" value={mm(camp.budget - camp.spent)} sub={`gastado ${mm(camp.spent)}`} /><Stat label="Equipos" value={`${camp.team}/3`} /></div>
                <Bar label="Intensidad de campaña" value={camp.intensity} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-sm">Aportar recursos (MM$)<input type="number" min={0} className="input mt-1" value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></label>
                  <label className="text-sm">Territorio prioritario<select className="input mt-1" value={focus} onChange={(e) => setFocus(e.target.value as RegionId | '')}><option value="">Mi región</option>{REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
                  <label className="text-sm">Eje del mensaje<select className="input mt-1" value={msg} onChange={(e) => setMsg(e.target.value as Dim | '')}><option value="">Mensaje transversal</option>{DIMS.map((d) => <option key={d} value={d}>{DIM_LABELS[d].name}</option>)}</select></label>
                  {msg && <label className="text-sm">Énfasis<select className="input mt-1" value={side} onChange={(e) => setSide(Number(e.target.value) as -1 | 1)}><option value={-1}>{DIM_LABELS[msg].neg}</option><option value={1}>{DIM_LABELS[msg].pos}</option></select></label>}
                </div>
                <p className="text-xs text-ink-400">El mensaje rinde distinto según las prioridades del electorado y desplaza tu perfil ideológico. Gastar más no garantiza ganar: los efectos tienen rendimientos decrecientes.</p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn" onClick={() => act({ type: 'configurar_campana', budget, region: focus || null, message: msg || null, side })}>Guardar estrategia</button>
                  <button className="btn btn-primary" disabled={!!actionBlocked(g, { type: 'actividad_campana' })} onClick={() => act({ type: 'actividad_campana' })}>Actividad de campaña (1 PA)</button>
                  <button className="btn" disabled={!!actionBlocked(g, { type: 'contratar_equipo' })} onClick={() => act({ type: 'contratar_equipo' })}>Contratar equipo (15 MM$)</button>
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}
      {tab === 'encuestas' && (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Panel title="Evolución del promedio de encuestas (partidos)" right={<span className="text-[11px] text-ink-400">encuestadoras ficticias</span>}>
            {partySeries.data.length < 2 ? <Empty>Se requieren más semanas de encuestas.</Empty> : (
              <div className="h-72"><ResponsiveContainer><LineChart data={partySeries.data} margin={{ left: -20, right: 8 }}><CartesianGrid stroke="#26324a" strokeDasharray="3 3" /><XAxis dataKey="semana" tick={{ fill: '#8a94ab', fontSize: 10 }} /><YAxis tick={{ fill: '#8a94ab', fontSize: 10 }} /><Tooltip contentStyle={{ background: '#121a28', border: '1px solid #37445f', fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} />
                {partySeries.keys.map((k) => <Line key={k} dataKey={k} name={partyShort(g, k)} stroke={partyColor(g, k)} dot={false} strokeWidth={2} />)}</LineChart></ResponsiveContainer></div>
            )}
            <p className="mt-2 text-xs text-ink-400">Las encuestas incluyen error muestral, indecisos y sesgos de casa. La intención estimada no equivale al resultado electoral.</p>
          </Panel>
          <Panel title="Últimos sondeos">
            <div className="space-y-2">{latest.map((p) => {
              const top = Object.entries(p.values).sort((a, b) => b[1] - a[1]).slice(0, 4);
              return (<div key={p.id} className="rounded-lg border border-ink-700 p-2 text-xs"><div className="flex justify-between"><b>{POLLSTERS.find((x) => x.id === p.pollster)?.name}</b><span className="text-ink-400">S{p.week} · n={num(p.sample)} · ±{p.moe.toFixed(1)} pp</span></div><div className="mt-1 flex flex-wrap gap-1">{top.map(([k, v]) => <PartyChip key={k} g={g} id={k} label={`${partyShort(g, k)} ${v.toFixed(1)}`} />)}<span className="chip">NS/NR {p.undecided.toFixed(0)}</span></div></div>);
            })}</div>
            {presPolls.length > 0 && (<div className="mt-4"><div className="eyebrow mb-1">Presidencial</div>{presPolls.slice(0, 4).map((p) => (
              <div key={p.id} className="mb-1 text-xs"><b>{POLLSTERS.find((x) => x.id === p.pollster)?.name}</b> · {Object.entries(p.values).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${charName(g, k)} ${v.toFixed(1)}`).join(' · ')}</div>
            ))}</div>)}
          </Panel>
        </div>
      )}
      {tab === 'resultados' && (
        <Panel title="Resultados de la partida">
          {g.results.length === 0 ? <Empty>Aún no hay elecciones en esta partida. La primera está programada en el calendario.</Empty> : (
            <div className="overflow-x-auto"><table className="table"><thead><tr><th>Fecha</th><th>Elección</th><th>Ganador / primera fuerza</th><th>Participación</th><th>Tú</th><th></th></tr></thead><tbody>
              {[...g.results].reverse().map((r) => {
                const top = r.winnerId ? `${r.names[r.winnerId] ?? charName(g, r.winnerId)}${r.runoffNeeded ? ' (pasa a 2ª vuelta)' : ''}` : (() => { const t = Object.entries(r.seatsByParty).sort((a, b) => b[1] - a[1])[0]; return t ? `${partyShort(g, t[0])} (${t[1]})` : '—'; })();
                return (<tr key={r.id}><td className="font-mono text-xs">{formatShort(r.date)}</td><td>{ELECTION_LABELS[r.type]}</td><td>{top}</td><td className="font-mono">{pct(r.turnoutPct)}</td><td>{r.playerOutcome?.ran ? (r.playerOutcome.won ? <Badge tone="good">Electo/a</Badge> : <Badge tone="bad">Derrota</Badge>) : '—'}</td><td><button className="btn btn-ghost text-xs" onClick={() => openNight(r.id)}>Ver escrutinio</button></td></tr>);
              })}
            </tbody></table></div>
          )}
          <p className="mt-2 text-xs text-ink-500">Fecha actual: {formatShort(weekToISO(g.startDate, g.week))}</p>
        </Panel>
      )}
    </div>
  );
}
