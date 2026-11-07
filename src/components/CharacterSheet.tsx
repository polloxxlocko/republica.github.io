/**
 * Ficha de personaje. Para personas reales separa estrictamente:
 *  1) Datos verificados (con fuente y fecha de consulta), anteriores al inicio del escenario.
 *  2) Lo ocurrido en la partida (ficción).
 *  3) Parámetros de simulación (convenciones, no evaluaciones de la persona).
 */
import { X, ExternalLink } from 'lucide-react';
import { useGame } from '../stores/gameStore';
import { Badge, Portrait } from './ui';
import { partyColor, partyShort } from '../app/selectors';
import { ageOf, fullName, officeLabel, PERSONALITY_LABELS } from '../game/systems/characters';
import { REAL_BY_ID, SIMULATION_CONVENTIONS, partyAt } from '../data/characters/realPoliticians';
import { careerOf } from '../data/characters/politicalCareers';
import { SOURCE_BY_ID } from '../data/characters/historicalSources';
import { formatShort, weekToISO } from '../game/engine/dates';
import { stanceToward } from '../game/career/knowledge';

const fmt = (d: string | null | undefined) => (d ? d.split('-').reverse().join('-') : '—');

export function PersonName({ id, className = '' }: { id: string | null | undefined; className?: string }) {
  const { game: g, openSheet } = useGame();
  if (!g || !id || !g.characters[id]) return <span className={className}>—</span>;
  const c = g.characters[id];
  return (
    <button className={`text-left underline decoration-ink-600 decoration-dotted underline-offset-2 hover:text-gold-300 ${className}`} onClick={() => openSheet(id)} title={c.realId ? 'Persona real: ver datos verificados y ficción de la partida' : 'Personaje ficticio'}>
      {fullName(c)}{c.realId && <span className="ml-1 align-middle text-[10px] text-gold-400" aria-label="persona real">◆</span>}
    </button>
  );
}

export function CharacterSheet() {
  const { game: g, sheetId, openSheet } = useGame();
  if (!g || !sheetId || !g.characters[sheetId]) return null;
  const c = g.characters[sheetId];
  const real = c.realId ? REAL_BY_ID[c.realId] : null;
  const isPlayer = c.id === g.player.characterId;
  const st = !isPlayer ? stanceToward(g, c.id) : null;
  const atStart = real ? partyAt(real, '2026-11-09') : null;
  const sim = [...c.pastOffices.filter((o) => o.from >= 0 || o.to >= 0).map((o) => `${officeLabel(o.type, c.gender)} (hasta ${formatShort(weekToISO(g.startDate, o.to))}${o.detail ? `, ${o.detail}` : ''})`), ...c.offices.filter((o) => o.since >= 0).map((o) => `${o.label ?? officeLabel(o.type, c.gender)} (desde ${formatShort(weekToISO(g.startDate, o.since))})`)];
  const history = g.history.filter((h) => h.title.includes(fullName(c))).slice(-6);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={() => openSheet(null)}>
      <div className="panel w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()} data-testid="ficha-personaje">
        <div className="flex items-start gap-4">
          <Portrait name={fullName(c)} color={partyColor(g, c.partyId)} size={72} seed={c.realId ?? c.id} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 id="sheet-title" className="font-display text-xl font-bold">{fullName(c)}</h2>{real ? <Badge tone="gold">Persona real</Badge> : <Badge>Personaje ficticio</Badge>}</div>
            <div className="text-sm text-ink-300">{partyShort(g, c.partyId)} · {c.offices.length ? c.offices.map((o) => o.label ?? officeLabel(o.type, c.gender)).join(', ') : 'sin cargo'}{c.status !== 'activo' ? ` · ${c.status === 'retirado' ? 'retirado/a de la vida pública (simulación)' : c.status}` : ''}</div>
            {st && <div className="text-xs text-ink-400">Tu lectura de su actitud hacia ti: {st.text.toLowerCase()} ({st.certainty})</div>}
          </div>
          <button className="btn btn-ghost" onClick={() => openSheet(null)} aria-label="Cerrar ficha"><X size={16} /></button>
        </div>
        {real && (
          <section className="mt-4 rounded-lg border border-emerald-700/50 bg-emerald-950/20 p-3 text-sm">
            <div className="eyebrow mb-1 text-emerald-300">Datos biográficos verificados (antes del 9-11-2026)</div>
            <div>Nombre completo: <b>{real.fullName}</b></div>
            <div>Fecha de nacimiento: {real.birthDate ? <>{fmt(real.birthDate)} <span className="text-ink-400">({SOURCE_BY_ID[real.birthSource ?? '']?.institution})</span></> : <span className="text-ink-400">no documentada en las fuentes consultadas</span>}</div>
            <div>Militancia al inicio del escenario: {atStart ? <>{atStart.realParty}{atStart.from ? ` (desde ${fmt(atStart.from)})` : ''}</> : 'independiente o sin registro'}</div>
            <div className="mt-2 text-xs text-ink-300">Cargos documentados:</div>
            <ul className="list-disc pl-5 text-xs">{careerOf(real.id).map((p, i) => <li key={i}>{p.label}{p.from || p.to ? ` · ${fmt(p.from)} – ${fmt(p.to)}` : ''}{p.asOf ? ` · registro ${p.asOf}` : ''}{p.note ? ` · ${p.note}` : ''}</li>)}</ul>
            <div className="mt-2 text-xs text-ink-300">Fuentes (consultadas el {fmt(real.updated)}):</div>
            <ul className="text-xs">{real.sources.map((sid) => { const so = SOURCE_BY_ID[sid]; return so ? <li key={sid}><a className="inline-flex items-center gap-1 text-sky-300 hover:underline" href={so.url} target="_blank" rel="noreferrer">{so.institution}: {so.title}<ExternalLink size={11} /></a>{so.published ? <span className="text-ink-500"> · publicado {so.published}</span> : null}</li> : null; })}</ul>
          </section>
        )}
        <section className="mt-3 rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 text-sm">
          <div className="eyebrow mb-1 text-amber-300">{real ? 'En esta partida (historia alternativa, ficción)' : 'Trayectoria en la partida'}</div>
          {sim.length ? <ul className="list-disc pl-5 text-xs">{sim.map((x) => <li key={x}>{x}</li>)}</ul> : <div className="text-xs text-ink-400">{real ? 'Aún no hay cambios respecto del punto de partida.' : 'Sin cargos registrados en la partida.'}</div>}
          {history.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-ink-300">{history.map((h) => <li key={h.id}>{h.title} ({formatShort(h.date)})</li>)}</ul>}
          {!real && <div className="mt-1 text-xs text-ink-400">{ageOf(g, c)} años · perfil: {PERSONALITY_LABELS[c.personality]}</div>}
          {real && !c.birthKnown && <div className="mt-1 text-[11px] text-ink-500">La edad que usa el motor es una convención (fecha de nacimiento no documentada).</div>}
        </section>
        {real && (
          <section className="mt-3 text-[11px] text-ink-400">
            <div className="font-semibold text-ink-300">Parámetros de simulación (no son evaluaciones de la persona real)</div>
            <ul className="list-disc pl-5">{SIMULATION_CONVENTIONS.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
        )}
      </div>
    </div>
  );
}
