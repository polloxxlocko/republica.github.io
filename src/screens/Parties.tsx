import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useGame } from '../stores/gameStore';
import type { LegalStatus, Party } from '../game/models/types';
import { Badge, Bar, Empty, IdeologyBars, Panel, PartyChip, Stat, Tabs } from '../components/ui';
import { partyShort, pollAvg, pct, num, mm, seatsByParty } from '../app/selectors';
import { getRelation, leftRight } from '../game/systems/util';
import { AREA_LABELS, DIMS, DIM_LABELS } from '../game/rules/params';
import { ELECTION_LABELS, listIdOf, listName } from '../game/systems/elections';
import { REGIONS } from '../game/data/geography';
import { PERSONALITY_LABELS } from '../game/systems/characters';
import { PersonName } from '../components/CharacterSheet';
import { boardOf } from '../data/characters/partyLeadership';
import { SOURCE_BY_ID } from '../data/characters/historicalSources';

const STATUS_LABEL: Record<LegalStatus, string> = { constituido: 'Constituido', en_formacion: 'En formación', disuelto: 'Disuelto', historico: 'Histórico / otra situación', fusionado: 'Fusionado', ficticio: 'Ficticio (de la partida)' };
const STATUS_TONE: Record<LegalStatus, 'good' | 'warn' | 'bad' | 'neutral' | 'gold'> = { constituido: 'good', en_formacion: 'warn', disuelto: 'bad', historico: 'neutral', fusionado: 'neutral', ficticio: 'gold' };

function PartyDetail({ p, onBack }: { p: Party; onBack: () => void }) {
  const { game: g } = useGame();
  const [tab, setTab] = useState<'perfil' | 'facciones' | 'relaciones' | 'historia'>('perfil');
  if (!g) return null;
  const seats = { c: seatsByParty(g, 'camara')[p.id] ?? 0, s: seatsByParty(g, 'senado')[p.id] ?? 0 };
  const mayors = Object.values(g.regions).reduce((a, r) => a + (r.mayorsByParty[p.id] ?? 0), 0);
  const governors = Object.values(g.regions).filter((r) => r.governorId && g.characters[r.governorId]?.partyId === p.id).length;
  const series = g.opinionHistory.filter((h) => h.parties[p.id] !== undefined).map((h) => ({ semana: h.week, encuestas: Number(h.parties[p.id].toFixed(1)) }));
  const others = Object.values(g.parties).filter((q) => q.active && q.id !== p.id).map((q) => ({ q, rel: getRelation(g, p.id, q.id) })).sort((a, b) => b.rel - a.rel);
  const list = listIdOf(g, p.id);
  return (
    <div className="space-y-4">
      <button className="btn btn-ghost" onClick={onBack}><ArrowLeft size={16} /> Catálogo</button>
      <div className="panel overflow-hidden">
        <div className="h-2" style={{ background: p.color }} />
        <div className="flex flex-wrap items-start gap-4 p-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h1 className="font-display text-2xl font-bold">{p.name}</h1><Badge tone={STATUS_TONE[p.legalStatus]}>{STATUS_LABEL[p.legalStatus]}</Badge></div>
            <div className="text-sm text-ink-300">{p.short} · fundado {p.founded}{p.constitutedOn ? ` · constituido legalmente el ${p.constitutedOn.split('-').reverse().join('-')} (SERVEL)` : ''} · {p.family}</div>
            <p className="mt-2 max-w-3xl text-sm text-ink-300">{p.description}</p>
            {p.active && <div className="mt-2 text-sm">Pacto: <b>{list === p.id ? 'compite en lista propia' : listName(g, list)}</b> · Presidencia: <b>{p.leaderId ? <PersonName id={p.leaderId} /> : 'vacante'}</b></div>}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Encuestas" value={pct(pollAvg(g)[p.id] ?? 0)} />
            <Stat label="Diputados" value={seats.c} />
            <Stat label="Senadores" value={seats.s} />
            <Stat label="Alcaldías" value={mayors} />
            <Stat label="Gobernadores" value={governors} />
            <Stat label="Militantes*" value={num(p.members)} />
          </div>
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} options={[{ id: 'perfil', label: 'Perfil e ideología' }, { id: 'facciones', label: 'Directiva y facciones' }, { id: 'relaciones', label: 'Relaciones' }, { id: 'historia', label: 'Historial' }]} />
      {tab === 'perfil' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Posición multidimensional" right={<span className="text-[11px] text-ink-400">marco: posición fundacional</span>}><IdeologyBars ideology={p.ideology} compare={p.baseIdeology} compareLabel="posición de origen" /></Panel>
          <div className="space-y-4">
            <Panel title="Organización (estimaciones)">
              <div className="grid grid-cols-2 gap-3">
                <Bar label="Popularidad" value={p.popularity} color="#48665B" /><Bar label="Rechazo" value={p.rejection} color="#A44343" />
                <Bar label="Credibilidad" value={p.credibility} /><Bar label="Disciplina" value={p.discipline} />
                <Bar label="Cohesión" value={p.cohesion} /><Bar label="Organización" value={p.organization} />
                <Bar label="Movilización" value={p.mobilization} /><Stat label="Recursos" value={mm(p.funds)} />
              </div>
              <div className="mt-3 text-xs text-ink-400">Prioridades: {p.priorities.map((a) => AREA_LABELS[a]).join(', ')} · Objetivos: votos {Math.round(p.goals.votes * 100)}%, cargos {Math.round(p.goals.office * 100)}%, políticas {Math.round(p.goals.policy * 100)}%, identidad {Math.round(p.goals.identity * 100)}%</div>
            </Panel>
            <Panel title="Procedencia de los datos">
              <p className="text-xs text-ink-300"><b>Fuente:</b> {p.provenance.source}. <b>Corte:</b> {p.provenance.cutoff}. <b>Naturaleza:</b> {p.provenance.nature}. <b>Confianza:</b> {p.provenance.confidence}.</p>
              <p className="mt-1 text-xs text-ink-400">* Campos estimados para el balance de la simulación (no oficiales): {p.estimatedFields.join(', ')}.</p>
            </Panel>
            <Panel title="Organización territorial">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">{REGIONS.map((r) => <Bar key={r.id} label={r.shortName} value={p.territorial[r.id] * 100} color={p.color} />)}</div>
            </Panel>
          </div>
        </div>
      )}
      {tab === 'facciones' && (<div className="space-y-4">
        {boardOf(p.id).length > 0 && (
          <Panel title="Directiva inscrita en SERVEL (punto de partida verificado)" right={<a className="text-[11px] text-sky-300 hover:underline" href={SOURCE_BY_ID[boardOf(p.id)[0].source]?.url} target="_blank" rel="noreferrer">resolución publicada {SOURCE_BY_ID[boardOf(p.id)[0].source]?.published}</a>}>
            <p className="mb-2 text-xs text-ink-400">Integrantes de la directiva central según el registro de SERVEL consultado el 7-11-2026. En la partida, la directiva puede cambiar (elecciones internas simuladas); la presidencia actual en el juego se muestra arriba.</p>
            <ul className="grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">{boardOf(p.id).map((e, i) => {
              const ch = e.personId ? Object.values(g.characters).find((x) => x.realId === e.personId) : null;
              return <li key={i}><span className="text-ink-400">{e.role}:</span> {e.vacant ? <i className="text-ink-500">vacante</i> : ch ? <PersonName id={ch.id} /> : e.name}</li>;
            })}</ul>
          </Panel>
        )}
        <Panel title="Facciones internas">
          {p.factions.length === 0 ? <Empty>Sin facciones registradas.</Empty> : (
            <div className="overflow-x-auto"><table className="table">
              <thead><tr><th>Facción</th><th>Liderazgo</th><th>Militancia</th><th>Influencia</th><th>Descontento</th><th>Rebeldía</th><th>Ante el gobierno</th><th>Eje más distante</th></tr></thead>
              <tbody>{p.factions.map((f) => {
                const far = [...DIMS].sort((a, b) => Math.abs(f.ideology[b] - p.ideology[b]) - Math.abs(f.ideology[a] - p.ideology[a]))[0];
                const leader = g.characters[f.leaderId];
                return (
                  <tr key={f.id}><td className="font-medium">{f.name}</td><td><PersonName id={leader?.id} /> <span className="text-ink-500">{leader && !leader.realId ? PERSONALITY_LABELS[leader.personality] : ''}</span></td><td className="font-mono">{pct(f.share * 100, 0)}</td><td className="font-mono">{Math.round(f.influence)}</td><td><Bar value={f.discontent} color={f.discontent > 70 ? '#e06464' : '#e3b341'} showValue={false} /></td><td className="font-mono">{Math.round(f.rebellion)}</td><td className="font-mono">{f.govStance > 20 ? 'Apoyo' : f.govStance < -20 ? 'Oposición' : 'Independiente'}</td><td className="text-xs">{DIM_LABELS[far].name} ({f.ideology[far] > p.ideology[far] ? DIM_LABELS[far].pos : DIM_LABELS[far].neg})</td></tr>
                );
              })}</tbody>
            </table></div>
          )}
          <p className="mt-2 text-xs text-ink-400">Facciones con alto descontento y capacidad de rebelión pueden escindirse y fundar nuevas organizaciones.</p>
        </Panel>
      </div>)}
      {tab === 'relaciones' && (
        <Panel title="Relaciones con otros partidos (−100 a +100)">
          <div className="grid gap-1.5 md:grid-cols-2">{others.map(({ q, rel }) => (
            <div key={q.id} className="flex items-center gap-2 text-sm"><span className="w-28 truncate">{q.short}</span>
              <div className="relative h-2 flex-1 rounded-full bg-ink-700"><div className="absolute top-0 h-2 rounded-full" style={{ left: rel < 0 ? `${50 + rel / 2}%` : '50%', width: `${Math.abs(rel) / 2}%`, background: rel < 0 ? '#e06464' : '#4fbf8a' }} /><div className="absolute left-1/2 top-[-2px] h-3 w-px bg-ink-400" /></div>
              <span className="w-10 text-right font-mono text-xs">{Math.round(rel)}</span></div>
          ))}</div>
        </Panel>
      )}
      {tab === 'historia' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Promedio de encuestas en la partida">
            {series.length < 2 ? <Empty>Aún no hay suficiente historia.</Empty> : (
              <div className="h-56"><ResponsiveContainer><LineChart data={series} margin={{ left: -20, right: 8 }}><CartesianGrid stroke="#DDD6CA" strokeDasharray="3 3" /><XAxis dataKey="semana" tick={{ fill: '#5C6369', fontSize: 10 }} /><YAxis tick={{ fill: '#5C6369', fontSize: 10 }} /><Tooltip contentStyle={{ background: '#FCFAF6', color: '#27313B', border: '1px solid #CEC6B9', borderRadius: 6 }} /><Line dataKey="encuestas" stroke={p.color} dot={false} strokeWidth={2} /></LineChart></ResponsiveContainer></div>
            )}
          </Panel>
          <Panel title="Elecciones y coaliciones">
            {p.history.length === 0 ? <Empty>Sin elecciones disputadas en esta partida.</Empty> : (
              <table className="table"><thead><tr><th>Fecha</th><th>Elección</th><th>Votos</th><th>Escaños</th></tr></thead><tbody>{p.history.map((h, i) => <tr key={i}><td>{h.date}</td><td>{ELECTION_LABELS[h.election]}</td><td className="font-mono">{pct(h.votePct)}</td><td className="font-mono">{h.seats}</td></tr>)}</tbody></table>
            )}
            <ul className="mt-3 space-y-1 text-xs text-ink-400">{p.coalitionHistory.map((h, i) => <li key={i}>Semana {h.week}: {h.event === 'entra' ? 'ingresa a' : 'sale de'} {g.coalitions[h.coalitionId]?.name ?? h.coalitionId}</li>)}</ul>
          </Panel>
        </div>
      )}
    </div>
  );
}

export function Parties() {
  const { game: g, selectedParty, select } = useGame();
  const [status, setStatus] = useState<'vigentes' | 'todos' | 'historicos'>('vigentes');
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState<'eje' | 'encuestas' | 'escanos'>('eje');
  const parties = useMemo(() => {
    if (!g) return [];
    const polls = pollAvg(g); const seats = seatsByParty(g, 'camara');
    let list = Object.values(g.parties);
    if (status === 'vigentes') list = list.filter((p) => p.active);
    if (status === 'historicos') list = list.filter((p) => !p.active);
    if (q) list = list.filter((p) => `${p.name} ${p.short} ${p.family}`.toLowerCase().includes(q.toLowerCase()));
    return list.sort((a, b) => sortBy === 'eje' ? leftRight(a.ideology) - leftRight(b.ideology) : sortBy === 'encuestas' ? (polls[b.id] ?? 0) - (polls[a.id] ?? 0) : (seats[b.id] ?? 0) - (seats[a.id] ?? 0));
  }, [g, status, q, sortBy]);
  if (!g) return null;
  if (selectedParty && g.parties[selectedParty]) return <PartyDetail p={g.parties[selectedParty]} onBack={() => select('party', null)} />;
  const polls = pollAvg(g); const seats = seatsByParty(g, 'camara'); const sen = seatsByParty(g, 'senado');
  return (
    <div className="space-y-4">
      <div><div className="eyebrow">Sistema de partidos</div><h1 className="font-display text-2xl font-bold">Catálogo de partidos</h1></div>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={status} onChange={setStatus} options={[{ id: 'vigentes', label: 'En competencia' }, { id: 'historicos', label: 'Históricos / disueltos / fusionados' }, { id: 'todos', label: 'Todos' }]} />
        <input className="input w-56" placeholder="Buscar partido o familia…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar partido" />
        <select className="input w-48" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} aria-label="Ordenar"><option value="eje">Orden izquierda → derecha</option><option value="encuestas">Por encuestas</option><option value="escanos">Por diputados</option></select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {parties.map((p) => (
          <button key={p.id} className="panel overflow-hidden text-left transition hover:border-gold-500/60" onClick={() => select('party', p.id)} data-testid={`ficha-${p.id}`}>
            <div className="h-1.5" style={{ background: p.color }} />
            <div className="p-3">
              <div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{p.name}</div><div className="text-xs text-ink-400">{p.short} · {p.family}</div></div><Badge tone={STATUS_TONE[p.legalStatus]}>{STATUS_LABEL[p.legalStatus]}</Badge></div>
              {p.active ? (
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs"><div><span className="text-ink-400">Encuestas</span><div className="font-mono">{pct(polls[p.id] ?? 0)}</div></div><div><span className="text-ink-400">Diputados</span><div className="font-mono">{seats[p.id] ?? 0}</div></div><div><span className="text-ink-400">Senadores</span><div className="font-mono">{sen[p.id] ?? 0}</div></div></div>
              ) : <div className="mt-2 text-xs text-ink-400">{p.mergedInto ? `Fusionado en ${partyShort(g, p.mergedInto)}` : 'No participa en la simulación actual.'}</div>}
              {p.active && <div className="mt-2 flex items-center gap-1 text-xs text-ink-400">Pacto: <PartyChip g={g} id={null} label={listIdOf(g, p.id) === p.id ? 'lista propia' : listName(g, listIdOf(g, p.id))} /></div>}
            </div>
          </button>
        ))}
      </div>
      <Panel title="Coaliciones vigentes">
        <div className="grid gap-3 md:grid-cols-2">{Object.values(g.coalitions).filter((k) => k.active).map((k) => (
          <div key={k.id} className="rounded-lg border border-ink-700 p-3"><div className="flex justify-between"><b>{k.name}</b>{k.isGovernment && <Badge tone="gold">Oficialismo</Badge>}</div>
            <div className="mt-1 flex flex-wrap gap-1">{k.members.map((m) => <PartyChip key={m} g={g} id={m} />)}</div>
            <div className="mt-2"><Bar label="Cohesión" value={k.cohesion} /></div>
            {k.conflicts.length > 0 && <div className="mt-1 text-xs text-ink-400">Último conflicto: {k.conflicts[k.conflicts.length - 1]}</div>}
          </div>
        ))}</div>
      </Panel>
    </div>
  );
}
