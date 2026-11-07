import { useState } from 'react';
import { useGame } from '../stores/gameStore';
import { Badge, Bar, Empty, Panel, PartyChip, Stat, Tabs } from '../components/ui';
import { MINISTRY_BY_ID } from '../game/data/institutions';
import { POLICIES, POLICY_BY_ID } from '../game/data/policies';
import { cabinetBalance, canAnnounce, governmentSupportSeats, ministerCandidates, ministerCompetence, policyStatusLabel } from '../game/systems/government';
import { isPresident } from '../game/systems/player';
import { charName, partyShort, pct } from '../app/selectors';
import { fullName } from '../game/systems/characters';
import { AREA_LABELS } from '../game/rules/params';
import { STAGE_LABELS } from '../game/systems/parliament';

export function Government() {
  const { game: g, act, select, setScreen } = useGame();
  const [tab, setTab] = useState<'gabinete' | 'politicas' | 'agenda' | 'presupuesto'>('gabinete');
  const [edit, setEdit] = useState<string | null>(null);
  if (!g) return null;
  const gov = g.government;
  const pres = g.characters[gov.presidentId];
  const mine = isPresident(g);
  const bal = cabinetBalance(g);
  const cam = governmentSupportSeats(g, 'camara'); const sen = governmentSupportSeats(g, 'senado');
  const active = gov.policies.filter((p) => !['completada', 'fracasada', 'abandonada'].includes(p.phase));
  const closed = gov.policies.filter((p) => ['completada', 'fracasada', 'abandonada'].includes(p.phase));
  return (
    <div className="space-y-4">
      <div><div className="eyebrow">Poder Ejecutivo</div><h1 className="font-display text-2xl font-bold">Gobierno de {fullName(pres)}</h1></div>
      <Panel>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Aprobación presidencial" value={pct(g.opinion.presidentialApproval, 0)} />
          <Stat label="Coalición" value={gov.coalitionId ? g.coalitions[gov.coalitionId]?.name ?? '—' : 'Sin coalición'} />
          <Stat label="Apoyo en Cámara" value={`${cam.gov}/${cam.total}`} />
          <Stat label="Apoyo en Senado" value={`${sen.gov}/${sen.total}`} />
          <Stat label="Capacidad estatal" value={Math.round(gov.stateCapacity)} />
          <Stat label="Coordinación" value={Math.round(gov.coordination)} />
        </div>
        {gov.electId && <p className="mt-3 text-sm text-gold-300">Presidente/a electo/a: {charName(g, gov.electId)} — asume el 11 de marzo.</p>}
        {!mine && <p className="mt-3 text-xs text-ink-400">No encabezas el Ejecutivo: esta pantalla es informativa. El gobierno actúa según su propia IA (agenda, gabinete, vetos).</p>}
      </Panel>
      <Tabs value={tab} onChange={setTab} options={[{ id: 'gabinete', label: 'Gabinete' }, { id: 'politicas', label: 'Políticas en curso' }, { id: 'agenda', label: 'Anunciar políticas' }, { id: 'presupuesto', label: 'Presupuesto y promesas' }]} />
      {tab === 'gabinete' && (
        <Panel title="Gabinete ministerial">
          <div className="overflow-x-auto"><table className="table"><thead><tr><th>Ministerio</th><th>Titular</th><th>Partido</th><th>Competencia</th><th>Desempeño</th><th>Riesgo</th>{mine && <th></th>}</tr></thead><tbody>
            {gov.cabinet.map((post) => {
              const m = post.ministerId ? g.characters[post.ministerId] : null;
              return (
                <tr key={post.ministryId}>
                  <td className="font-medium">{MINISTRY_BY_ID[post.ministryId].name}</td>
                  <td>{m ? fullName(m) : <span className="text-red-300">Vacante</span>}</td>
                  <td>{m && <PartyChip g={g} id={m.partyId} />}</td>
                  <td className="w-28"><Bar value={ministerCompetence(m ?? undefined) * 100} showValue={false} /></td>
                  <td className="font-mono">{Math.round(post.performance)}</td>
                  <td>{m && m.scandal > 30 ? <Badge tone="bad">Cuestionado/a</Badge> : <Badge>Normal</Badge>}</td>
                  {mine && <td>{edit === post.ministryId ? (
                    <select className="input w-56" autoFocus onChange={(e) => { if (e.target.value) { act({ type: 'nombrar_ministro', ministryId: post.ministryId, charId: e.target.value }); setEdit(null); } }} onBlur={() => setEdit(null)} aria-label="Nuevo titular">
                      <option value="">Elegir reemplazo…</option>
                      {ministerCandidates(g, post.ministryId, 10).map((c) => <option key={c.id} value={c.id}>{fullName(c)} · {partyShort(g, c.partyId)} · comp. {Math.round(ministerCompetence(c) * 100)}</option>)}
                    </select>
                  ) : <button className="btn btn-ghost text-xs" onClick={() => setEdit(post.ministryId)}>Cambiar</button>}</td>}
                </tr>
              );
            })}
          </tbody></table></div>
          {Object.keys(bal).length > 0 && <div className="mt-3 text-xs text-ink-400">Reparto vs. peso parlamentario (puntos): {Object.entries(bal).map(([p, d]) => `${partyShort(g, p)} ${d >= 0 ? '+' : ''}${d.toFixed(0)}`).join(' · ')}. Los partidos subrepresentados reducen su apoyo y la cohesión de la coalición.</div>}
        </Panel>
      )}
      {tab === 'politicas' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="En curso">
            {active.length === 0 ? <Empty>No hay políticas en curso.</Empty> : (
              <div className="space-y-3">{active.map((p) => {
                const def = POLICY_BY_ID[p.defId]; const bill = p.billId ? g.bills.find((b) => b.id === p.billId) : null;
                const phases = ['anunciada', 'formulacion', 'tramitacion', 'aprobada', 'financiamiento', 'implementacion', 'evaluacion'];
                return (
                  <div key={p.id} className="rounded-lg border border-ink-700 p-3">
                    <div className="flex items-start justify-between gap-2"><b className="text-sm">{def.name}</b><Badge tone="warn">{policyStatusLabel(p.phase)}</Badge></div>
                    <div className="mt-2 flex gap-1" aria-label="Fases">{phases.map((ph, i) => <div key={ph} title={policyStatusLabel(ph as typeof p.phase)} className={`h-1.5 flex-1 rounded ${phases.indexOf(p.phase) >= i ? 'bg-gold-500' : 'bg-ink-700'}`} />)}</div>
                    {p.phase === 'implementacion' && <div className="mt-2"><Bar label="Implementación" value={p.progress} /></div>}
                    {bill && <button className="mt-2 text-xs text-gold-300 underline" onClick={() => { select('bill', bill.id); setScreen('congreso'); }}>Proyecto en el Congreso: {STAGE_LABELS[bill.stage]}</button>}
                    <div className="mt-1 text-xs text-ink-400">{p.log[p.log.length - 1]}</div>
                  </div>
                );
              })}</div>
            )}
          </Panel>
          <Panel title="Concluidas">
            {closed.length === 0 ? <Empty>Aún no hay políticas concluidas.</Empty> : (
              <ul className="space-y-1.5 text-sm">{closed.slice().reverse().map((p) => <li key={p.id} className="flex items-center justify-between gap-2"><span>{POLICY_BY_ID[p.defId].name}</span><Badge tone={p.phase === 'completada' ? 'good' : 'bad'}>{policyStatusLabel(p.phase)}{p.outcome !== undefined ? ` (${p.outcome > 0 ? '+' : ''}${p.outcome.toFixed(2)})` : ''}</Badge></li>)}</ul>
            )}
            <p className="mt-2 text-xs text-ink-400">Una política anunciada no equivale a una ejecutada: puede fracasar en el Congreso, quedar sin financiamiento o fallar en su implementación.</p>
          </Panel>
        </div>
      )}
      {tab === 'agenda' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {POLICIES.map((d) => {
            const reason = mine ? canAnnounce(g, d.id) : 'Solo el Presidente de la República';
            return (
              <div key={d.id} className="panel flex flex-col p-3">
                <div className="flex items-start justify-between gap-2"><b className="text-sm">{d.name}</b><span className="chip">{AREA_LABELS[d.area]}</span></div>
                <p className="mt-1 text-xs text-ink-300">{d.objective}</p>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-ink-400">
                  <span>Costo fiscal: <b className="text-ink-200">{d.fiscalCost >= 0 ? `${d.fiscalCost.toFixed(2)}% PIB/año` : `ahorro ${(-d.fiscalCost).toFixed(2)}%`}</b></span>
                  <span>Costo político: <b className="text-ink-200">{d.politicalCost}</b></span>
                  <span>Implementación: <b className="text-ink-200">{d.implWeeks} sem.</b></span>
                  <span>Capacidad requerida: <b className="text-ink-200">{d.capacityRequired}</b></span>
                  <span>Requiere ley: <b className="text-ink-200">{d.requiresLaw ? `sí (${d.quorum})` : 'no'}</b></span>
                  <span>Iniciativa exclusiva: <b className="text-ink-200">{d.exclusivePresidential ? 'sí' : 'no'}</b></span>
                </div>
                <p className="mt-2 text-[11px] text-ink-400"><b>Beneficiarios:</b> {d.beneficiaries}. <b>Opositores:</b> {d.opponents}. <b>Riesgos:</b> {d.risks}. <b>Efectos secundarios:</b> {d.sideEffects}.</p>
                <div className="mt-auto pt-2"><button className="btn w-full" disabled={!!reason} title={reason ?? undefined} onClick={() => act({ type: 'anunciar_politica', policyId: d.id })}>Anunciar (1 PA)</button>{reason && mine && <p className="mt-1 text-[11px] text-amber-300">{reason}</p>}</div>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'presupuesto' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={`Presupuesto ${gov.budget.year} (vigente)`}>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Ingresos base" value={pct(gov.budget.revenue)} sub="del PIB" />
              <Stat label="Gasto aprobado" value={pct(gov.budget.spending)} sub="del PIB" />
              <Stat label="Ejecución" value={pct(gov.budget.execution * 100, 0)} />
              <Stat label="Estado" value={gov.budget.approved ? 'Aprobado' : 'Rige proyecto Ejecutivo'} />
            </div>
            {gov.nextBudget && <p className="mt-3 text-sm text-ink-300">Proyecto {gov.nextBudget.year} en discusión: gasto {pct(gov.nextBudget.spending)} del PIB. Si el Congreso no lo despacha en 60 días, rige el proyecto del Ejecutivo (art. 67 CPR).</p>}
            <p className="mt-2 text-xs text-ink-400">La Ley de Presupuestos ingresa a fines de septiembre y se vota antes del 1 de diciembre. La regla fiscal orienta el gasto hacia una meta de balance estructural.</p>
          </Panel>
          <Panel title="Compromisos del gobierno">
            {gov.promises.length === 0 ? <Empty>Sin compromisos registrados.</Empty> : (
              <ul className="space-y-1.5 text-sm">{gov.promises.map((p, i) => <li key={i} className="flex justify-between gap-2"><span>{p.description}</span>{p.fulfilled === true ? <Badge tone="good">Cumplido</Badge> : p.fulfilled === false ? <Badge tone="bad">Incumplido</Badge> : <Badge tone="warn">Vence S{p.dueWeek}</Badge>}</li>)}</ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
