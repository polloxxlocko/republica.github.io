import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useGame } from '../stores/gameStore';
import type { Bill, Chamber, Urgency } from '../game/models/types';
import { Hemicycle } from '../components/Hemicycle';
import { Badge, Bar, Empty, IdeologyBars, Panel, PartyChip, Stat, Tabs } from '../components/ui';
import { charName, partyColor, partyShort, playerChar, seatsByParty } from '../app/selectors';
import { QUORUM_LABELS, STAGE_LABELS, URGENCY_LABELS, effectivePosition, members, partyStance, voteProbabilities, whipCount } from '../game/systems/parliament';
import { actionBlocked, isLegislator, isPresident } from '../game/systems/player';
import { AREA_LABELS } from '../game/rules/params';
import { PERSONALITY_LABELS, ageOf, officeLabel } from '../game/systems/characters';
import { PersonName } from '../components/CharacterSheet';
import { leftRight } from '../game/systems/util';
import { coalitionMembers } from '../game/systems/government';
import { REGION_BY_ID } from '../game/data/geography';

function LegislatorCard({ id }: { id: string }) {
  const { game: g } = useGame();
  if (!g) return null;
  const c = g.characters[id];
  if (!c) return null;
  const seat = g.seats.find((s) => s.holderId === id);
  const terms = c.pastOffices.filter((o) => o.type === 'diputado' || o.type === 'senador').length;
  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold"><PersonName id={c.id} /> <PartyChip g={g} id={c.partyId} /></div>
      <div className="text-ink-400">{seat?.chamber === 'camara' ? `${officeLabel('diputado', c.gender)} · Distrito ${seat.unitId}` : `${officeLabel('senador', c.gender)} · ${seat ? REGION_BY_ID[seat.regionId].shortName : ''}`}{c.realId ? (c.birthKnown ? ` · ${ageOf(g, c)} años` : '') : ` · ${ageOf(g, c)} años · ${PERSONALITY_LABELS[c.personality]}`}</div>
      {c.realId ? <div className="text-xs text-ink-400">Persona real: abre su ficha para ver sus datos verificados y lo ocurrido en la partida. Su ideología en el juego es la de su partido (convención de simulación).</div>
        : <div className="grid grid-cols-2 gap-2 text-xs"><span>Antigüedad: {terms} período(s) previos</span><span>Especialidad: {AREA_LABELS[c.specialty]}</span><span>Ambición: {c.ambitionTarget}</span></div>}
      <IdeologyBars ideology={c.ideology} compare={c.partyId ? g.parties[c.partyId]?.ideology : undefined} compareLabel="su partido" compact />
    </div>
  );
}

function BillDetail({ b, onBack }: { b: Bill; onBack: () => void }) {
  const { game: g, act } = useGame();
  const [chamber, setChamber] = useState<Chamber>(b.stage.includes('revisora') ? (b.chamberOfOrigin === 'camara' ? 'senado' : 'camara') : b.chamberOfOrigin);
  const [offerParty, setOfferParty] = useState('');
  const [offer, setOffer] = useState<'moderar' | 'compromiso' | 'inversion' | 'cargo'>('compromiso');
  if (!g) return null;
  const whip = whipCount(g, b, chamber);
  const open = b.closedWeek === undefined;
  const pres = isPresident(g);
  const undecided = members(g, chamber).map((c) => ({ c, p: voteProbabilities(g, c, b) })).filter((x) => x.p.yes > 0.25 && x.p.yes < 0.75).sort((a, b2) => Math.abs(a.p.yes - 0.5) - Math.abs(b2.p.yes - 0.5)).slice(0, 12);
  const parties = Object.entries(whip.byParty).sort((a, b2) => b2[1].n - a[1].n);
  const lobbyBlocked = (id: string) => actionBlocked(g, { type: 'lobby', billId: b.id, charId: id });
  return (
    <div className="space-y-4">
      <button className="btn btn-ghost" onClick={onBack}><ArrowLeft size={16} /> Proyectos</button>
      <div className="panel p-5">
        <div className="flex flex-wrap items-center gap-2"><Badge tone={b.origin === 'mensaje' ? 'gold' : 'neutral'}>{b.origin === 'mensaje' ? 'Mensaje (Ejecutivo)' : 'Moción parlamentaria'}</Badge><Badge tone={b.stage === 'publicada' ? 'good' : b.stage === 'rechazada' ? 'bad' : 'warn'}>{STAGE_LABELS[b.stage]}</Badge><Badge>{URGENCY_LABELS[b.urgency]}</Badge><Badge>{QUORUM_LABELS[b.quorum]}</Badge></div>
        <h1 className="mt-2 font-display text-2xl font-bold">{b.title}</h1>
        <div className="mt-1 text-sm text-ink-400">Autor/a: {charName(g, b.authorId)} ({partyShort(g, b.authorPartyId)}) · Área: {AREA_LABELS[b.area]} · Cámara de origen: {b.chamberOfOrigin === 'camara' ? 'Cámara de Diputadas y Diputados' : 'Senado'} · Moderación por indicaciones: {Math.round(b.moderation * 100)}%</div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="Proyección de votación" right={<Tabs value={chamber} onChange={setChamber} options={[{ id: 'camara', label: 'Cámara' }, { id: 'senado', label: 'Senado' }]} />}>
          <div className="grid grid-cols-4 gap-3">
            <Stat label="A favor (esp.)" value={Math.round(whip.yes)} tone={whip.yes >= whip.required ? 'good' : 'bad'} />
            <Stat label="En contra" value={Math.round(whip.no)} />
            <Stat label="Abstención" value={Math.round(whip.abst)} />
            <Stat label="Requeridos" value={b.quorum === 'simple' ? 'más sí que no' : whip.required} />
          </div>
          <p className="mt-2 text-xs text-ink-400">Valores esperados según la posición, la disciplina partidaria y las negociaciones; el resultado real tiene incertidumbre.</p>
          <div className="mt-3 overflow-x-auto"><table className="table"><thead><tr><th>Bancada</th><th>Miembros</th><th>Postura oficial</th><th>Sí esp.</th><th>No esp.</th></tr></thead><tbody>
            {parties.map(([p, v]) => { const st = p === 'IND' ? 0 : partyStance(g, p, b); return (
              <tr key={p}><td><PartyChip g={g} id={p} /></td><td className="font-mono">{v.n}</td><td>{st > 0.3 ? <Badge tone="good">A favor</Badge> : st < -0.3 ? <Badge tone="bad">En contra</Badge> : <Badge tone="warn">Dividida</Badge>}</td><td className="font-mono">{v.yes.toFixed(1)}</td><td className="font-mono">{v.no.toFixed(1)}</td></tr>
            ); })}
          </tbody></table></div>
        </Panel>
        <div className="space-y-4">
          {open && isLegislator(playerChar(g)) && (() => {
            const pc = playerChar(g); const line = pc.partyId ? partyStance(g, pc.partyId, b) : 0;
            const def = line > 0.3 ? 'yes' : line < -0.3 ? 'no' : 'abst';
            const cur = b.playerVote ?? null;
            return (
              <Panel title="Tu voto en sala">
                <p className="mb-2 text-xs text-ink-400">Línea de tu bancada: <b>{def === 'yes' ? 'a favor' : def === 'no' ? 'en contra' : 'libertad de acción / dividida'}</b>. Si no fijas tu voto, votarás con tu bancada. Votar contra la línea mejora tu credibilidad, pero tu directiva lo recordará.</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['yes', 'no', 'abst'] as const).map((v) => <button key={v} className={`btn ${cur === v ? 'border-gold-500 text-gold-300' : ''}`} aria-pressed={cur === v} onClick={() => act({ type: 'voto_parlamentario', billId: b.id, vote: v })} data-testid={`voto-${v}`}>{v === 'yes' ? 'A favor' : v === 'no' ? 'En contra' : 'Abstención'}{v === def ? ' · línea' : ''}</button>)}
                </div>
              </Panel>
            );
          })()}
          {open && (
            <Panel title="Negociar">
              <label className="text-sm">Partido<select className="input mt-1" value={offerParty} onChange={(e) => setOfferParty(e.target.value)}><option value="">Elige bancada…</option>{parties.filter(([p]) => p !== 'IND' && p !== 'VAC').map(([p]) => <option key={p} value={p}>{g.parties[p]?.name}</option>)}</select></label>
              <label className="mt-2 block text-sm">Oferta<select className="input mt-1" value={offer} onChange={(e) => setOffer(e.target.value as typeof offer)}>
                <option value="moderar">Aceptar indicaciones que moderan el proyecto</option>
                <option value="compromiso">Compromiso programático (se recordará si no se cumple)</option>
                <option value="inversion">Inversión en sus territorios</option>
                {pres && <option value="cargo">Ofrecer un cargo de gobierno</option>}
              </select></label>
              <button className="btn btn-primary mt-3 w-full" disabled={!offerParty || !!actionBlocked(g, { type: 'negociar_partido', billId: b.id, partyId: offerParty, offer })} onClick={() => act({ type: 'negociar_partido', billId: b.id, partyId: offerParty, offer })}>Negociar (1 PA)</button>
              {offerParty && actionBlocked(g, { type: 'negociar_partido', billId: b.id, partyId: offerParty, offer }) && <p className="mt-1 text-xs text-amber-300">{actionBlocked(g, { type: 'negociar_partido', billId: b.id, partyId: offerParty, offer })}</p>}
              {pres && (
                <div className="mt-4 border-t border-ink-700 pt-3">
                  <div className="eyebrow mb-1">Atribuciones del Ejecutivo</div>
                  <div className="flex flex-wrap gap-1.5">{(['ninguna', 'simple', 'suma', 'discusion_inmediata'] as Urgency[]).map((u) => <button key={u} className={`btn text-xs ${b.urgency === u ? 'border-gold-500 text-gold-300' : ''}`} onClick={() => act({ type: 'urgencia', billId: b.id, urgency: u })}>{URGENCY_LABELS[u]}</button>)}</div>
                  {b.origin === 'mensaje' && <button className="btn btn-danger mt-2" onClick={() => act({ type: 'retirar_proyecto', billId: b.id })}>Retirar proyecto</button>}
                  {b.stage === 'ejecutivo' && <div className="mt-2 flex gap-2"><button className="btn btn-primary" onClick={() => act({ type: 'decision_ejecutivo', billId: b.id, decision: 'promulgar' })}>Promulgar</button><button className="btn btn-danger" onClick={() => act({ type: 'decision_ejecutivo', billId: b.id, decision: 'vetar' })}>Vetar</button></div>}
                </div>
              )}
            </Panel>
          )}
          <Panel title="Contenido del proyecto"><IdeologyBars ideology={effectivePosition(b)} compact /></Panel>
        </div>
      </div>
      {open && (
        <Panel title="Parlamentarios indecisos (conversar: 1 PA)">
          {undecided.length === 0 ? <Empty>No hay votos claramente en disputa en esta cámara.</Empty> : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{undecided.map(({ c, p }) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border border-ink-700 p-2 text-sm">
                <span className="h-3 w-3 rounded-sm" style={{ background: partyColor(g, c.partyId) }} />
                <span className="min-w-0 flex-1 truncate"><PersonName id={c.id} /> <span className="text-ink-500">· {partyShort(g, c.partyId)}{c.realId ? '' : ` · ${PERSONALITY_LABELS[c.personality]}`}</span></span>
                <span className="font-mono text-xs">{Math.round(p.yes * 100)}%</span>
                <button className="btn px-2 py-0.5 text-xs" disabled={!!lobbyBlocked(c.id)} title={lobbyBlocked(c.id) ?? undefined} onClick={() => act({ type: 'lobby', billId: b.id, charId: c.id })}>Conversar</button>
              </div>
            ))}</div>
          )}
        </Panel>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Votaciones registradas">
          {b.votes.length === 0 ? <Empty>Aún no hay votaciones.</Empty> : (
            <table className="table"><thead><tr><th>Sem.</th><th>Cámara</th><th>Etapa</th><th>Sí</th><th>No</th><th>Abs.</th><th>Req.</th><th></th></tr></thead><tbody>
              {b.votes.map((v, i) => <tr key={i}><td className="font-mono">{v.week}</td><td>{v.chamber === 'camara' ? 'Cámara' : 'Senado'}</td><td className="text-xs">{STAGE_LABELS[v.stage]}</td><td className="font-mono">{v.yes}</td><td className="font-mono">{v.no}</td><td className="font-mono">{v.abst}</td><td className="font-mono">{v.required}</td><td>{v.passed ? <Badge tone="good">Aprobado</Badge> : <Badge tone="bad">Rechazado</Badge>}</td></tr>)}
            </tbody></table>
          )}
        </Panel>
        <Panel title="Tramitación y acuerdos">
          <ol className="space-y-1 text-sm">{b.log.map((l, i) => <li key={i} className="border-l-2 border-gold-500/50 pl-2">{l}</li>)}</ol>
          {b.concessions.length > 0 && <div className="mt-3"><div className="eyebrow mb-1">Concesiones</div><ul className="space-y-1 text-xs text-ink-300">{b.concessions.map((c, i) => <li key={i}>S{c.week} · {c.partyId ? partyShort(g, c.partyId) : ''}: {c.description}</li>)}</ul></div>}
        </Panel>
      </div>
    </div>
  );
}

export function Congress() {
  const { game: g, selectedBill, select } = useGame();
  const [chamber, setChamber] = useState<Chamber>('camara');
  const [sel, setSel] = useState<string | null>(null);
  const [hl, setHl] = useState<string | null>(null);
  const [filter, setFilter] = useState<'activos' | 'cerrados' | 'mios'>('activos');
  const bills = useMemo(() => {
    if (!g) return [];
    const me = g.player.characterId;
    return g.bills.filter((b) => filter === 'activos' ? b.closedWeek === undefined : filter === 'cerrados' ? b.closedWeek !== undefined : b.authorId === me || (isPresident(g) && b.origin === 'mensaje')).sort((a, b) => (b.closedWeek ?? b.submittedWeek) - (a.closedWeek ?? a.submittedWeek));
  }, [g, filter]);
  if (!g) return null;
  if (selectedBill) { const b = g.bills.find((x) => x.id === selectedBill); if (b) return <BillDetail b={b} onBack={() => select('bill', null)} />; }
  const seats = seatsByParty(g, chamber);
  const allowed = new Set(coalitionMembers(g));
  const govSeats = Object.entries(seats).filter(([p]) => allowed.has(p)).reduce((a, [, n]) => a + n, 0);
  const total = Object.values(seats).reduce((a, b) => a + b, 0);
  const ordered = Object.entries(seats).sort((a, b) => (g.parties[a[0]] ? leftRight(g.parties[a[0]].ideology) : 0) - (g.parties[b[0]] ? leftRight(g.parties[b[0]].ideology) : 0));
  const c = playerChar(g);
  return (
    <div className="space-y-4">
      <div><div className="eyebrow">Congreso Nacional · Valparaíso</div><h1 className="font-display text-2xl font-bold">{chamber === 'camara' ? 'Cámara de Diputadas y Diputados' : 'Senado de la República'}</h1></div>
      <Tabs value={chamber} onChange={(v) => { setChamber(v); setSel(null); }} options={[{ id: 'camara', label: 'Cámara (155)' }, { id: 'senado', label: 'Senado (50)' }]} />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Hemiciclo" right={<span className="text-xs text-ink-400">Oficialismo {govSeats}/{total} · mayoría absoluta {Math.floor(total / 2) + 1} · 4/7 = {Math.ceil(total * 4 / 7)}</span>}>
          <Hemicycle g={g} chamber={chamber} selected={sel} onSelect={setSel} highlightParty={hl} />
          <div className="mt-2 flex flex-wrap gap-1.5">{ordered.map(([p, n]) => (
            <button key={p} onClick={() => setHl(hl === p ? null : p)} aria-pressed={hl === p} className={`chip ${hl === p ? 'border-gold-400' : ''}`}><span className="h-2.5 w-2.5 rounded-sm" style={{ background: partyColor(g, p) }} />{partyShort(g, p)} {n}</button>
          ))}</div>
          <div className="mt-3"><Bar label="Peso del oficialismo" value={govSeats} max={total} color="#c9a24a" /></div>
        </Panel>
        <Panel title={sel ? 'Parlamentario/a' : 'Selecciona un escaño'}>
          {sel ? <LegislatorCard id={sel} /> : <Empty>Haz clic en un escaño del hemiciclo para ver su perfil, o en una bancada para resaltarla. {c.offices.some((o) => o.type === 'diputado' || o.type === 'senador') ? 'Tu escaño tiene borde dorado.' : ''}</Empty>}
        </Panel>
      </div>
      <Panel title="Proyectos de ley" right={<Tabs value={filter} onChange={setFilter} options={[{ id: 'activos', label: 'En tramitación' }, { id: 'cerrados', label: 'Concluidos' }, { id: 'mios', label: 'Míos / del Ejecutivo' }]} />}>
        {bills.length === 0 ? <Empty>No hay proyectos en esta categoría.</Empty> : (
          <div className="overflow-x-auto"><table className="table"><thead><tr><th>Proyecto</th><th>Origen</th><th>Etapa</th><th>Urgencia</th><th>Quórum</th><th>Proyección</th></tr></thead><tbody>
            {bills.slice(0, 60).map((b) => {
              const ch = b.stage.includes('revisora') ? (b.chamberOfOrigin === 'camara' ? 'senado' : 'camara') : b.chamberOfOrigin;
              const w = b.closedWeek === undefined ? whipCount(g, b, ch) : null;
              return (
                <tr key={b.id} className="cursor-pointer hover:bg-ink-800/60" onClick={() => select('bill', b.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') select('bill', b.id); }}>
                  <td className="max-w-[340px]"><div className="truncate font-medium">{b.title}</div><div className="text-xs text-ink-500">{charName(g, b.authorId)} · {partyShort(g, b.authorPartyId)}</div></td>
                  <td className="text-xs">{b.origin === 'mensaje' ? 'Mensaje' : 'Moción'}</td>
                  <td className="text-xs">{STAGE_LABELS[b.stage]}</td>
                  <td className="text-xs">{URGENCY_LABELS[b.urgency]}</td>
                  <td className="text-xs">{b.quorum}</td>
                  <td className="font-mono text-xs">{w ? <span className={w.yes >= w.required || (b.quorum === 'simple' && w.yes > w.no) ? 'text-emerald-300' : 'text-red-300'}>{Math.round(w.yes)}–{Math.round(w.no)}</span> : '—'}</td>
                </tr>
              );
            })}
          </tbody></table></div>
        )}
      </Panel>
    </div>
  );
}
