import { CalendarDays, ChevronRight, Trophy } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useGame } from '../stores/gameStore';
import { Badge, Bar, Empty, IdeologyBars, Panel, PartyChip, Portrait, Stat } from '../components/ui';
import { dateLabel, officeText, partyColor, partyShort, playerChar, pollAvg, pct, mm, seatsByParty } from '../app/selectors';
import { ageOf } from '../game/systems/characters';
import { ELECTION_LABELS } from '../game/systems/elections';
import { outletName } from '../game/systems/news';
import { formatShort, weekToISO } from '../game/engine/dates';
import { governmentSupportSeats } from '../game/systems/government';
import { stagnationWeeks } from '../game/career/capital';
import { PersonName } from '../components/CharacterSheet';
import { careerSummary } from '../game/career/summary';
import { situationReport } from '../game/career/knowledge';
import { hasPaidOffice } from '../game/systems/player';

export function Dashboard() {
  const { game: g, setScreen } = useGame();
  if (!g) return null;
  const c = playerChar(g);
  const pres = g.characters[g.government.presidentId];
  const polls = pollAvg(g);
  const topPolls = Object.entries(polls).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const upcoming = g.calendar.filter((e) => !e.done && e.week >= g.week).slice(0, 5);
  const e = g.economy;
  const gov = governmentSupportSeats(g, 'camara');
  const approvalSeries = g.opinionHistory.slice(-52).map((h) => ({ semana: h.week, aprobacion: Math.round(h.approval) }));
  const mySeats = c.partyId ? (seatsByParty(g, 'camara')[c.partyId] ?? 0) + (seatsByParty(g, 'senado')[c.partyId] ?? 0) : 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="eyebrow">Panel principal</div>
          <h1 className="font-display text-2xl font-bold">{dateLabel(g)}</h1>
        </div>
        <div className="text-sm text-ink-400">Gobierno de <b className="text-ink-200"><PersonName id={pres?.id} /></b> ({partyShort(g, pres?.partyId)}) · aprobación {pct(g.opinion.presidentialApproval, 0)}</div>
      </div>

      {g.player.careerOver && (() => { const sum = careerSummary(g); return (
        <div className="panel border-amber-500/50 p-4 text-sm text-amber-200">
          <div className="font-display text-lg font-semibold text-amber-100">Fin de la carrera · {sum.archetype}</div>
          <p>{sum.verdict} Cargo más alto: {sum.peak ?? 'ninguno'}. Elecciones {sum.elections.won}–{sum.elections.lost}.</p>
          <button className="btn mt-2" onClick={() => setScreen('carrera')}>Ver biografía y legado</button>
        </div>
      ); })()}
      {!g.player.careerOver && g.career.opportunities.length > 0 && (
        <button className="panel flex w-full items-center justify-between gap-3 border-gold-500/50 p-3 text-left text-sm" onClick={() => setScreen('carrera')} data-testid="aviso-oportunidades">
          <span><b className="text-gold-300">{g.career.opportunities.length} oportunidad{g.career.opportunities.length > 1 ? 'es' : ''} abierta{g.career.opportunities.length > 1 ? 's' : ''}:</b> {g.career.opportunities[0].title}</span><ChevronRight size={16} />
        </button>
      )}
      {!g.player.careerOver && stagnationWeeks(g) > 104 && <div className="panel border-amber-500/40 p-3 text-sm text-amber-200">Tu carrera lleva {Math.floor(stagnationWeeks(g) / 52)} años sin avances. Revisa la pantalla Carrera: hay caminos para reactivarla.</div>}

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Panel title="Tu trayectoria" right={<span className="flex gap-1"><button className="btn btn-ghost text-xs" onClick={() => setScreen('carrera')}>Carrera <ChevronRight size={14} /></button><button className="btn btn-ghost text-xs" onClick={() => setScreen('acciones')}>Acciones <ChevronRight size={14} /></button></span>}>
          <div className="flex flex-wrap items-start gap-4">
            <Portrait name={`${c.firstName} ${c.lastName}`} color={partyColor(g, c.partyId)} size={64} />
            <div className="min-w-0 flex-1">
              <div className="font-display text-xl font-semibold">{c.firstName} {c.lastName}</div>
              <div className="text-sm text-ink-300">{officeText(g, c)}</div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-ink-400">
                <PartyChip g={g} id={c.partyId} label={c.partyId ? g.parties[c.partyId]?.name : 'Independiente'} />
                <span className="chip">{ageOf(g, c)} años</span>
                <span className="chip">{c.comuna}</span><span className="chip">Aspiración: {g.player.goal}</span>
              </div>
            </div>
          </div>
          <ul className="mt-4 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2" data-testid="situacion-panel">
            {situationReport(g).slice(0, 8).map((l, i) => <li key={i} className="flex gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${l.tone === 'good' ? 'bg-emerald-400' : l.tone === 'bad' ? 'bg-red-400' : 'bg-ink-500'}`} /><span>{l.text}</span></li>)}
          </ul>
          <div className="mt-2 text-xs text-ink-400">Recursos: <b className="font-mono text-ink-200">{mm(g.player.personalFunds)}</b>{!hasPaidOffice(c) && <> · Jornada: <b className="text-ink-200">{g.career.workMode === 'completa' ? 'trabajo a tiempo completo' : g.career.workMode === 'parcial' ? 'media jornada' : 'dedicación exclusiva a la política'}</b></>}</div>
          {g.career.intel.length > 0 && <button className="mt-2 block text-left text-xs text-ink-300 hover:text-gold-300" onClick={() => setScreen('carrera')}>Lo último que escuchaste: «{g.career.intel[g.career.intel.length - 1].text}»</button>}
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {(['carisma', 'oratoria', 'negociacion', 'tecnico', 'liderazgo', 'comunicacion', 'redes', 'gestion', 'integridad'] as const).map((k) => (
              <Bar key={k} label={{ carisma: 'Carisma', oratoria: 'Oratoria', negociacion: 'Negociación', tecnico: 'Técnico', liderazgo: 'Liderazgo', comunicacion: 'Comunicación', redes: 'Redes', gestion: 'Gestión', integridad: 'Integridad' }[k]} value={c.attrs[k]} color="#5b7bd6" />
            ))}
          </div>
          {g.player.achievements.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">{g.player.achievements.map((a) => <Badge key={a} tone="gold"><Trophy size={11} className="mr-1" />{a}</Badge>)}</div>
          )}
          {g.player.candidacies.length > 0 && (
            <div className="mt-4 rounded-lg border border-gold-500/40 bg-ink-900/60 p-3 text-sm">
              <div className="eyebrow mb-1">Candidaturas</div>
              {g.player.candidacies.map((k) => {
                const ev = g.calendar.find((x) => x.id === k.electionId);
                return <div key={k.electionId}>{ev ? `${ELECTION_LABELS[ev.type]} · ${formatShort(ev.date)} (${ev.week - g.week} sem.)` : k.electionId.startsWith('interna') ? `Elección interna de ${partyShort(g, k.partyId)}` : 'Presidencial'} {g.player.campaign?.electionId === k.electionId && <span className="text-ink-400">· intensidad de campaña {Math.round(g.player.campaign.intensity)}</span>}</div>;
              })}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Pulso del país">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Aprobación" value={pct(g.opinion.presidentialApproval, 0)} tone={g.opinion.presidentialApproval < 35 ? 'bad' : g.opinion.presidentialApproval > 50 ? 'good' : 'neutral'} />
              <Stat label="Crecimiento" value={pct(e.growth)} tone={e.growth < 0 ? 'bad' : e.growth > 3 ? 'good' : 'neutral'} />
              <Stat label="Inflación" value={pct(e.inflation)} tone={e.inflation > 5 ? 'bad' : 'neutral'} />
              <Stat label="Desempleo" value={pct(e.unemployment)} tone={e.unemployment > 9 ? 'bad' : 'neutral'} />
              <Stat label="Seguridad percibida" value={Math.round(g.opinion.securityPerception)} />
              <Stat label="Oficialismo Cámara" value={`${gov.gov}/${gov.total}`} />
            </div>
            <div className="mt-3 h-28">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={approvalSeries} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                  <CartesianGrid stroke="#26324a" strokeDasharray="3 3" />
                  <XAxis dataKey="semana" tick={{ fill: '#8a94ab', fontSize: 10 }} />
                  <YAxis domain={[0, 80]} tick={{ fill: '#8a94ab', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: '#121a28', border: '1px solid #37445f', fontSize: 12 }} />
                  <Line type="monotone" dataKey="aprobacion" stroke="#c9a24a" dot={false} strokeWidth={2} name="Aprobación presidencial" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Promedio de encuestas" right={<span className="text-[11px] text-ink-400">estimación ≠ resultado</span>}>
            <div className="space-y-1.5">
              {topPolls.map(([p, v]) => (
                <div key={p} className="flex items-center gap-2 text-sm">
                  <span className="w-24 shrink-0 truncate">{partyShort(g, p)}</span>
                  <div className="flex-1"><Bar value={v} max={35} color={partyColor(g, p)} showValue={false} /></div>
                  <span className="w-12 text-right font-mono text-xs">{pct(v)}</span>
                </div>
              ))}
              {c.partyId && <div className="pt-1 text-xs text-ink-400">Tu partido: {pct(polls[c.partyId] ?? 0)} · {mySeats} parlamentarios</div>}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Calendario electoral" right={<CalendarDays size={16} className="text-ink-400" />}>
          {upcoming.length === 0 ? <Empty>Sin elecciones programadas.</Empty> : (
            <ul className="space-y-2 text-sm">
              {upcoming.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2"><span>{ELECTION_LABELS[u.type]}</span><span className="font-mono text-xs text-ink-400">{formatShort(u.date)} · {u.week - g.week} sem.</span></li>
              ))}
            </ul>
          )}
          <button className="btn mt-3 w-full" onClick={() => setScreen('elecciones')}>Ir a Elecciones</button>
        </Panel>
        <Panel title="Titulares" right={<button className="btn btn-ghost text-xs" onClick={() => setScreen('noticias')}>Ver todo</button>} className="lg:col-span-2">
          {g.news.length === 0 ? <Empty>Aún no hay noticias.</Empty> : (
            <ul className="divide-y divide-ink-800">
              {g.news.slice(0, 7).map((n) => (
                <li key={n.id} className="py-2">
                  <div className="flex items-center gap-2 text-[11px] text-ink-400"><span className="font-semibold text-gold-400">{outletName(n.outletId)}</span><span>{formatShort(weekToISO(g.startDate, n.week))}</span><span className="chip py-0">{n.category}</span></div>
                  <div className="text-sm font-medium">{n.headline}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Tu posición ideológica">
          <IdeologyBars ideology={c.ideology} compare={c.partyId ? g.parties[c.partyId]?.ideology : undefined} compareLabel={c.partyId ? `línea de ${partyShort(g, c.partyId)}` : undefined} />
        </Panel>
        <Panel title="Crisis y alertas">
          {g.crises.length === 0 ? <Empty>No hay crisis en curso.</Empty> : (
            <ul className="space-y-2 text-sm">{g.crises.map((x) => <li key={x.id}><b>{x.name}</b> <span className="text-ink-400">· {x.cause} · {x.weeksLeft} sem. restantes</span><Bar value={x.severity} color="#e06464" showValue={false} /></li>)}</ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
