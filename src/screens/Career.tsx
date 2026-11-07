/**
 * PANTALLA "CARRERA": capital político, oportunidades, procesos de nominación, compromisos,
 * relaciones, biografía y legado. Solo muestra lo que el personaje puede saber: las fuerzas de
 * los demás aspirantes se presentan como percepciones cualitativas, no como puntajes internos.
 */
import { useMemo, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { AlertTriangle, CheckCircle2, Clock, Ear, Handshake, Target, TrendingDown, UserMinus, XCircle } from 'lucide-react';
import { useGame } from '../stores/gameStore';
import { PersonName } from '../components/CharacterSheet';
import type { GameState, NominationProcess, Opportunity } from '../game/models/types';
import { Badge, Empty, Panel, Portrait, Stat, Tabs } from '../components/ui';
import { me, partyInfluenceOf, stagnationWeeks } from '../game/career/capital';
import { SOURCE_LABEL, knowledgeLabel, knowledgeLevel, perceivedStrength, qualitative, situationReport, sourceRecord, stanceToward } from '../game/career/knowledge';
import { STATUS_LABEL, aspirantBase } from '../game/career/nominations';
import { careerSummary } from '../game/career/summary';
import { actionBlocked, aspirationTargets, campaignTargets } from '../game/systems/player';
import { ELECTION_LABELS } from '../game/systems/elections';
import { ageOf, fullName, officeLabel } from '../game/systems/characters';
import { formatShort, weekToISO } from '../game/engine/dates';
import { partyColor, partyShort } from '../app/selectors';
import type { ElectionType } from '../game/models/types';


/** Percepción cualitativa (con error según tu conocimiento político) de la fuerza de cada aspirante. */
function perceived(g: GameState, p: NominationProcess): { id: string; band: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }[] {
  const vals = p.aspirants.filter((a) => a.status !== 'retirado').map((a) => {
    const c = g.characters[a.charId];
    return { id: a.charId, v: c ? aspirantBase(g, c, p) + a.backers.length * 4 : -99 };
  });
  const top = Math.max(...vals.map((x) => x.v));
  return vals.map(({ id, v }) => { const r = perceivedStrength(g, `${p.id}:${id}`, v, top); return { id, band: r.text, tone: r.tone }; });
}

function OpportunityCard({ o }: { o: Opportunity }) {
  const { game: g, act } = useGame();
  if (!g) return null;
  const left = o.expiresWeek - g.week;
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4" data-testid="oportunidad">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="eyebrow">{o.office ? `Agenda de ${officeLabel(o.office)}` : 'Oportunidad'}</div>
          <h3 className="font-display text-lg font-semibold">{o.title}</h3>
        </div>
        <Badge tone={left <= 1 ? 'bad' : 'warn'}><Clock size={12} className="mr-1 inline" />{left <= 0 ? 'vence hoy' : `${left} sem.`}</Badge>
      </div>
      <p className="mt-1 text-sm text-ink-200">{o.description}</p>
      {o.actors.length > 0 && <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-300">{o.actors.filter((id) => g.characters[id]).map((id) => <span key={id} className="chip"><PersonName id={id} /> · {partyShort(g, g.characters[id].partyId)}</span>)}</div>}
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        {o.requirements.length > 0 && <div><div className="font-semibold text-ink-300">Requisitos</div><ul className="list-disc pl-4 text-ink-400">{o.requirements.map((r) => <li key={r}>{r}</li>)}</ul></div>}
        {o.benefits.length > 0 && <div><div className="font-semibold text-emerald-300">Posibles beneficios</div><ul className="list-disc pl-4 text-ink-400">{o.benefits.map((r) => <li key={r}>{r}</li>)}</ul></div>}
        {o.risks.length > 0 && <div><div className="font-semibold text-red-300">Riesgos</div><ul className="list-disc pl-4 text-ink-400">{o.risks.map((r) => <li key={r}>{r}</li>)}</ul></div>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {o.options.map((op) => (
          <button key={op.id} className="btn text-left" title={op.hint} onClick={() => act({ type: 'responder_oportunidad', id: o.id, option: op.id })} data-testid={`op-${op.id}`}>
            <span className="block text-sm">{op.label}</span><span className="block text-[11px] text-ink-400">{op.hint}</span>
          </button>
        ))}
      </div>
      {o.actors.some((id) => g.characters[id]?.realId) && <p className="mt-2 text-[11px] text-amber-300/80">Situación simulada: no representa hechos, intenciones ni declaraciones reales de las personas mencionadas.</p>}
      <p className="mt-2 text-[11px] text-ink-500">Si no respondes antes del plazo, se aplicará la opción por omisión y la contraparte lo recordará.</p>
    </div>
  );
}

function ProcessCard({ p }: { p: NominationProcess }) {
  const { game: g, act } = useGame();
  const [backer, setBacker] = useState('');
  if (!g) return null;
  const pl = me(g);
  const mine = p.aspirants.find((a) => a.charId === pl.id);
  const view = perceived(g, p);
  const stages: [NominationProcess['status'] | 'eleccion', string, number][] = [['abierto', 'Inscripción de aspirantes', p.openWeek], ['preseleccion', 'Preselección', p.shortlistWeek], ['resuelto', 'Decisión', p.decisionWeek]];
  const order = ['abierto', 'preseleccion', 'resuelto', 'cancelado'];
  const party = g.parties[p.partyId];
  const candidates = party ? Object.values(g.characters).filter((x) => x.status === 'activo' && x.partyId === p.partyId && x.id !== pl.id && !p.aspirants.some((a) => a.charId === x.id) && (x.id === party.leaderId || party.factions.some((f) => f.leaderId === x.id) || (x.offices.length > 0 && x.regionId === pl.regionId)))
    .sort((a, b) => partyInfluenceOf(g, b) - partyInfluenceOf(g, a)).slice(0, 10) : [];
  const active = p.status === 'abierto' || p.status === 'preseleccion';
  return (
    <div className="rounded-xl border border-ink-700 p-4" data-testid="proceso">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="eyebrow">{ELECTION_LABELS[p.electionType as ElectionType]} · {party?.short ?? p.partyId} · {p.method === 'directiva' ? 'decide la directiva' : p.method === 'consulta_interna' ? 'consulta interna' : 'acuerdo de coalición'}</div>
          <h3 className="font-display text-lg font-semibold">{officeLabel(p.office, pl.gender)} · {p.unitLabel}</h3>
        </div>
        {mine && <Badge tone={mine.status === 'nominado' ? 'good' : mine.status === 'descartado' || mine.status === 'retirado' ? 'bad' : 'warn'}>Tú: {STATUS_LABEL[mine.status]}</Badge>}
        {p.status === 'cancelado' && <Badge tone="bad">Cupo cedido al pacto</Badge>}
      </div>
      <ol className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {stages.map(([st, label, w]) => {
          const done = order.indexOf(p.status) > order.indexOf(st) || p.status === 'resuelto';
          const now = p.status === st;
          return <li key={st} className={`rounded-full border px-2 py-0.5 ${now ? 'border-gold-500 text-gold-300' : done ? 'border-emerald-700 text-emerald-300' : 'border-ink-700 text-ink-400'}`}>{label} · {formatShort(weekToISO(g.startDate, w))}</li>;
        })}
        <li className="rounded-full border border-ink-700 px-2 py-0.5 text-ink-400">Elección</li>
      </ol>
      <div className="mt-3 divide-y divide-ink-800 text-sm">
        {p.aspirants.map((a) => {
          const c = g.characters[a.charId]; if (!c) return null;
          const v = view.find((x) => x.id === a.charId);
          return (
            <div key={a.charId} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className={`flex-1 ${c.isPlayer ? 'font-semibold text-gold-300' : ''}`}>{fullName(c)}{c.offices[0] ? <span className="text-ink-400"> · {officeLabel(c.offices[0].type, c.gender)}</span> : null}</span>
              <span className="text-xs text-ink-400">{a.backers.length} respaldo{a.backers.length === 1 ? '' : 's'}</span>
              {a.status === 'aspirante' || a.status === 'propuesto' ? (v && <Badge tone={v.tone}>{v.band}</Badge>) : <Badge tone={a.status === 'nominado' ? 'good' : 'bad'}>{STATUS_LABEL[a.status]}</Badge>}
              {!c.isPlayer && <span className="text-xs text-ink-500" title="Tu lectura de su actitud hacia ti">{stanceToward(g, c.id).text.toLowerCase()}</span>}
            </div>
          );
        })}
      </div>
      {mine && active && (mine.status === 'aspirante' || mine.status === 'propuesto') && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-ink-800 pt-3">
          <label className="text-sm">Pedir respaldo a
            <select className="input mt-1" value={backer} onChange={(e) => setBacker(e.target.value)}>
              <option value="">Elige dirigente…</option>
              {candidates.map((x) => <option key={x.id} value={x.id}>{fullName(x)} · {x.id === party?.leaderId ? 'presidencia del partido' : x.offices[0] ? officeLabel(x.offices[0].type, x.gender) : 'dirigente'}{mine.backers.includes(x.id) ? ' (ya te respalda)' : ''}</option>)}
            </select>
          </label>
          <button className="btn" disabled={!backer || !!actionBlocked(g, { type: 'buscar_respaldo', processId: p.id, charId: backer })} onClick={() => act({ type: 'buscar_respaldo', processId: p.id, charId: backer })}><Handshake size={14} /> Pedir respaldo (1 PA)</button>
          <button className="btn btn-ghost text-red-300" onClick={() => act({ type: 'retirar_aspiracion', processId: p.id })}><UserMinus size={14} /> Retirarme</button>
        </div>
      )}
      {p.log.length > 0 && <details className="mt-2 text-xs text-ink-400"><summary className="cursor-pointer">Bitácora del proceso</summary><ul className="mt-1 space-y-0.5">{p.log.slice(-12).map((l, i) => <li key={i}>{l}</li>)}</ul></details>}
    </div>
  );
}

export function AspirationPanel() {
  const { game: g, act } = useGame();
  const [units, setUnits] = useState<Record<string, string>>({});
  if (!g) return null;
  const pl = me(g);
  const targets = aspirationTargets(g);
  const indep = !pl.partyId;
  return (
    <Panel title="Aspirar a una candidatura" right={<Target size={16} className="text-gold-400" aria-hidden />}>
      <p className="mb-3 text-xs text-ink-400">Manifestar interés <b>no</b> te convierte en candidato/a. Tu partido decide entre aspirantes según arraigo, influencia interna, respaldos, facciones e imagen. Los procesos abren unas 56 semanas antes de cada elección y la preselección cierra 30 semanas antes.</p>
      {targets.length === 0 ? <Empty>No hay elecciones con procesos abiertos en los próximos meses.</Empty> : (
        <div className="space-y-2">
          {targets.map((t) => {
            const key = `${t.electionId}:${t.office}`;
            const unit = units[key] ?? t.units[0].id;
            const a = { type: 'aspirar' as const, electionId: t.electionId, office: t.office, unitId: unit };
            const b = actionBlocked(g, a);
            const fa = { type: 'firmas_independiente' as const, electionId: t.electionId, office: t.office };
            const fb = actionBlocked(g, fa);
            return (
              <div key={key} className="rounded-lg border border-ink-700 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{officeLabel(t.office, pl.gender)}</b> · {ELECTION_LABELS[t.label as ElectionType]} <span className="text-ink-400">({t.week - g.week} sem.)</span></span>
                  {t.units.length > 1 && <select className="input w-auto" value={unit} onChange={(e) => setUnits({ ...units, [key]: e.target.value })}>{t.units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select>}
                  {t.units.length === 1 && <span className="text-xs text-ink-400">{t.units[0].label}</span>}
                </div>
                {!indep ? (
                  <>
                    <div className="mt-2"><button className="btn btn-primary" disabled={!!b} onClick={() => act(a)} data-testid="aspirar">Manifestar aspiración (1 PA)</button></div>
                    {b && <p className="mt-1 text-xs text-amber-300">{b}</p>}
                  </>
                ) : t.office === 'alcalde' || t.office === 'gobernador' ? (
                  <>
                    <div className="mt-2"><button className="btn btn-primary" disabled={!!fb} onClick={() => act(fa)}>Reunir firmas como independiente (2 PA, 15 MM$)</button></div>
                    <p className="mt-1 text-xs text-ink-400">{fb ?? 'La probabilidad de reunir las firmas depende de tu arraigo, tu capacidad organizativa y tus redes.'}</p>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-ink-400">Sin militancia, solo puedes competir con el cupo de una lista (llega como oportunidad) o afiliándote a un partido.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function Legacy() {
  const { game: g } = useGame();
  if (!g) return null;
  const sum = careerSummary(g);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <Panel title={g.player.careerOver ? 'Legado' : 'Legado (lectura provisional)'}>
        <div className="font-display text-2xl font-bold text-gold-300" data-testid="legado-puntaje">{sum.archetype}</div>
        <p className="mt-2 text-sm text-ink-200">{sum.verdict}</p>
        <ul className="mt-3 space-y-1 text-sm">{sum.dimensions.map((d) => <li key={d.label} className="flex justify-between gap-2"><span className="text-ink-300">{d.label}</span><b>{qualitative(d.value)}</b></li>)}</ul>
        <p className="mt-3 text-[11px] text-ink-500">El legado no exige llegar a la Presidencia: considera cargos, desempeño electoral, arraigo, influencia, reconocimiento, credibilidad y obra legislativa o de gestión.</p>
        {sum.milestones.length > 0 && (
          <div className="mt-4 border-t border-ink-800 pt-3"><div className="eyebrow mb-1">Hitos</div>
            <ul className="space-y-1 text-sm">{sum.milestones.map((m) => <li key={m.label}><span className="text-ink-400">{m.label}:</span> {m.text} <span className="font-mono text-[11px] text-ink-500">{formatShort(weekToISO(g.startDate, m.week))}</span></li>)}</ul>
          </div>
        )}
      </Panel>
      <Panel title="Trayectoria">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Años de carrera" value={sum.years.toFixed(1)} />
          <Stat label="Elecciones" value={`${sum.elections.won}–${sum.elections.lost}`} sub="ganadas–perdidas" />
          <Stat label="Nominaciones" value={`${sum.nominations.won}–${sum.nominations.lost}`} sub="obtenidas–perdidas" />
          <Stat label="Leyes" value={sum.laws} />
        </div>
        <div className="mt-3 text-sm"><span className="text-ink-400">Cargo más alto:</span> <b>{sum.peak ?? 'ninguno aún'}</b> · <span className="text-ink-400">Partidos:</span> {sum.parties.join(' → ') || 'independiente'}</div>
        <div className="mt-3 text-sm"><div className="eyebrow mb-1">Cargos</div>{sum.offices.length === 0 ? <Empty>Sin cargos todavía.</Empty> : <ul className="space-y-0.5">{sum.offices.map((o, i) => <li key={i}>{o.type} <span className="text-ink-400">· {formatShort(weekToISO(g.startDate, Math.max(0, o.from)))}{o.to !== null ? ` – ${formatShort(weekToISO(g.startDate, o.to))}` : ' – hoy'}{o.detail && o.detail !== 'en ejercicio' ? ` · ${o.detail}` : ''}</span></li>)}</ul>}</div>
        {sum.reforms.length > 0 && <div className="mt-3 text-sm"><div className="eyebrow mb-1">Leyes de tu autoría</div><ul className="list-disc pl-5">{sum.reforms.map((r) => <li key={r}>{r}</li>)}</ul></div>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm">
          <div><div className="eyebrow mb-1">Principales alianzas</div>{sum.allies.length ? sum.allies.map((a) => <div key={a.id}>{a.name}</div>) : <span className="text-ink-400">—</span>}</div>
          <div><div className="eyebrow mb-1">Conflictos</div>{sum.rivals.length ? sum.rivals.map((a) => <div key={a.id}>{a.name}</div>) : <span className="text-ink-400">—</span>}</div>
        </div>
      </Panel>
    </div>
  );
}

function IntelFeed() {
  const { game: g } = useGame();
  const [topic, setTopic] = useState<string>('');
  if (!g) return null;
  const k = knowledgeLevel(g);
  const list = [...g.career.intel].reverse().filter((r) => !topic || r.topic === topic).slice(0, 60);
  return (
    <Panel title="Informes, rumores y noticias de tu red" right={<Ear size={16} className="text-gold-400" aria-hidden />}>
      <p className="mb-2 text-xs text-ink-400">{knowledgeLabel(k)}. Las fuentes pueden equivocarse o tener intereses propios: evalúa quién te cuenta qué. Lo verificado se marca cuando los hechos lo confirman o desmienten.</p>
      <div className="mb-3 flex flex-wrap gap-1">{[['', 'Todo'], ['directiva', 'Directiva'], ['candidaturas', 'Candidaturas'], ['oportunidad', 'Movimientos'], ['coalicion', 'Pacto'], ['gobierno', 'Gobierno'], ['reputacion', 'Reputación'], ['red', 'Tu red']].map(([id, l]) => <button key={id} className={`chip ${topic === id ? 'border-gold-500 text-gold-300' : ''}`} onClick={() => setTopic(id)}>{l}</button>)}</div>
      {list.length === 0 ? <Empty>Aún nadie te cuenta nada. Las personas que te conocen y confían en ti son tu fuente de información.</Empty> : (
        <ul className="divide-y divide-ink-800" data-testid="informes">
          {list.map((r) => {
            const src = r.sourceId ? g.characters[r.sourceId] : null; const rec = sourceRecord(g, r.sourceId);
            return (
              <li key={r.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="font-mono text-ink-500">{formatShort(weekToISO(g.startDate, r.week))}</span>
                  <Badge tone={r.source === 'publica' ? 'good' : r.source === 'rumor' ? 'warn' : 'neutral'}>{SOURCE_LABEL[r.source]}</Badge>
                  {r.source !== 'publica' && <span className="text-ink-400">confiabilidad {r.reliability}</span>}
                  {src && <span className="text-ink-400">· {fullName(src)}{rec ? ` (${rec})` : ''}</span>}
                  {r.verified && <Badge tone={r.verified === 'confirmado' ? 'good' : 'bad'}>{r.verified === 'confirmado' ? 'Se confirmó' : 'Resultó falso'}</Badge>}
                </div>
                <div className="mt-0.5">{r.text}</div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Reviews() {
  const { game: g } = useGame();
  if (!g) return null;
  const list = [...g.career.reviews].reverse();
  if (!list.length) return <Panel title="Balances electorales"><Empty>Después de cada elección en la que compitas verás aquí qué pasó: territorios, imagen, decisiones, contexto y aliados.</Empty></Panel>;
  return (
    <div className="space-y-3">{list.map((r) => (
      <Panel key={r.week + r.electionId} title={`${r.office} · ${formatShort(weekToISO(g.startDate, r.week))}`} right={<Badge tone={r.won ? 'good' : 'bad'}>{r.won ? 'Victoria' : 'Derrota'}</Badge>}>
        <div className="text-sm">{r.pct !== undefined && <>Obtuviste <b>{r.pct.toFixed(1)}%</b>. </>}Resultado <b>{r.closeness}</b>, <b>{r.expectation === 'por_sobre' ? 'por sobre lo esperado' : r.expectation === 'por_debajo' ? 'por debajo de lo esperado' : 'en línea con lo esperado'}</b> para tu sector.</div>
        <div className="mt-2 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div><div className="font-semibold text-ink-300">Territorios</div>{r.strong.length ? <><div className="text-emerald-300">Mejor: {r.strong.join(', ')}</div>{r.weak.length > 0 && <div className="text-red-300">Peor: {r.weak.join(', ')}</div>}</> : <span className="text-ink-400">Sin detalle comunal.</span>}</div>
          <div><div className="font-semibold text-ink-300">Tu imagen</div><div className="text-ink-400">Antes: {r.popularity.before} → después: {r.popularity.after}</div></div>
          <div><div className="font-semibold text-ink-300">Decisiones del período</div>{r.decisions.length ? <ul className="text-ink-400">{r.decisions.map((d) => <li key={d}>{d}</li>)}</ul> : <span className="text-ink-400">—</span>}</div>
          <div><div className="font-semibold text-ink-300">Contexto</div>{r.events.length ? <ul className="text-ink-400">{r.events.map((d) => <li key={d}>{d}</li>)}</ul> : <span className="text-ink-400">Sin acontecimientos mayores.</span>}</div>
          <div><div className="font-semibold text-ink-300">Aliados</div>{r.allies.length ? <ul className="text-ink-400">{r.allies.map((a) => <li key={a.name}>{a.name}: {a.behavior.toLowerCase()}</li>)}</ul> : <span className="text-ink-400">Nadie te respaldó públicamente.</span>}</div>
          <div><div className="font-semibold text-ink-300">Consecuencias</div><ul className="text-ink-400">{r.effects.map((d) => <li key={d}>{d}</li>)}</ul></div>
        </div>
      </Panel>
    ))}</div>
  );
}

export function Career() {
  const { game: g, act } = useGame();
  const [tab, setTab] = useState<'hoy' | 'informacion' | 'procesos' | 'relaciones' | 'biografia' | 'balances' | 'legado'>('hoy');
  const series = useMemo(() => g?.career.repHistory.map((r) => ({ ...r, fecha: weekToISO(g.startDate, r.week).slice(0, 7) })) ?? [], [g]);
  if (!g) return null;
  const pl = me(g);
  const situation = situationReport(g);
  const stag = stagnationWeeks(g);
  const mine = g.career.processes.filter((p) => p.aspirants.some((a) => a.charId === pl.id)).sort((a, b) => b.decisionWeek - a.decisionWeek);
  const camps = campaignTargets(g);
  const rels = Object.entries(pl.relations).filter(([id]) => g.characters[id]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 24);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Portrait name={`${pl.firstName} ${pl.lastName}`} color={partyColor(g, pl.partyId)} size={52} />
        <div className="flex-1">
          <div className="eyebrow">Tu carrera política</div>
          <h1 className="font-display text-2xl font-bold">{pl.firstName} {pl.lastName}</h1>
          <div className="text-sm text-ink-300">{ageOf(g, pl)} años · {pl.comuna} · {pl.partyId ? `militante de ${partyShort(g, pl.partyId)}` : 'independiente'} · {pl.offices.length ? pl.offices.map((o) => o.label ?? officeLabel(o.type, pl.gender)).join(', ') : 'sin cargos'}</div>
          <div className="text-xs text-ink-400">{g.career.origin.occupation} · {g.career.origin.education}</div>
        </div>
        {stag > 104 && <Badge tone="warn"><TrendingDown size={12} className="mr-1 inline" />Carrera estancada: {Math.floor(stag / 52)} años sin avances</Badge>}
      </div>
      <Tabs value={tab} onChange={setTab} options={[{ id: 'hoy', label: `Oportunidades${g.career.opportunities.length ? ` (${g.career.opportunities.length})` : ''}` }, { id: 'informacion', label: 'Información' }, { id: 'procesos', label: 'Candidaturas' }, { id: 'relaciones', label: 'Relaciones y compromisos' }, { id: 'biografia', label: 'Biografía' }, { id: 'balances', label: 'Balances electorales' }, { id: 'legado', label: 'Legado' }]} />
      {tab === 'hoy' && (
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div className="space-y-3">
            {g.career.opportunities.length === 0 ? (
              <Panel title="Oportunidades"><Empty>No hay oportunidades abiertas esta semana. Surgen según tu posición, tus relaciones, el calendario y el contexto político; trabaja tu capital y aparecerán.</Empty></Panel>
            ) : g.career.opportunities.map((o) => <OpportunityCard key={o.id} o={o} />)}
            {stag > 104 && (
              <Panel title="Cómo salir del estancamiento">
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink-300">
                  <li>Fortalece el arraigo en tu comuna (organización social, mediación, atención a vecinos).</li>
                  <li>Trabaja en la campaña de figuras de tu sector: crea deudas de gratitud.</li>
                  <li>Busca otro partido o un cupo independiente si tu directiva te bloquea.</li>
                  <li>Apunta a cargos de entrada (concejo) antes que a los de mayor exposición.</li>
                </ul>
              </Panel>
            )}
          </div>
          <Panel title="Tu situación">
            <ul className="space-y-2 text-sm" data-testid="situacion">
              {situation.map((l, i) => (
                <li key={i} className="flex gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${l.tone === 'good' ? 'bg-emerald-400' : l.tone === 'bad' ? 'bg-red-400' : 'bg-ink-500'}`} />
                  <span><span className="text-ink-400">{l.area}: </span>{l.text}{l.basis === 'percepcion' && <span className="text-[11px] text-ink-500"> · tu lectura</span>}</span></li>
              ))}
            </ul>
            <div className="mt-3 text-sm"><span className="text-ink-400">Recursos legales disponibles:</span> <b className="font-mono">{Math.round(g.player.personalFunds)} MM$</b></div>
            <p className="mt-2 text-[11px] text-ink-500">Esta es la lectura que puedes hacer de tu posición: con más experiencia y contactos, tu lectura del ambiente es más precisa. Nadie te dirá cuánto te falta para un cargo.</p>
            {camps.length > 0 && (
              <div className="mt-4 border-t border-ink-800 pt-3">
                <div className="eyebrow mb-1">Campañas en curso de tu sector</div>
                {camps.slice(0, 5).map((x) => <div key={x.id} className="flex items-center justify-between gap-2 py-0.5 text-sm"><span>{x.name} <span className="text-ink-400">· {x.label}</span></span><button className="btn text-xs" disabled={!!actionBlocked(g, { type: 'trabajar_campana', charId: x.id })} onClick={() => act({ type: 'trabajar_campana', charId: x.id })}>Colaborar (1 PA)</button></div>)}
              </div>
            )}
          </Panel>
        </div>
      )}
      {tab === 'procesos' && (
        <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
          <AspirationPanel />
          <div className="space-y-3">
            <Panel title="Tus procesos de nominación">
              <p className="mb-2 text-xs text-ink-400">Estados: <b>aspirante</b> → <b>propuesto/a</b> (preselección) → <b>nominado/a</b> (candidatura inscrita) → la elección decide si resultas <b>electo/a</b>. Las fuerzas de los demás son tu percepción, con error.</p>
              {mine.length === 0 ? <Empty>No participas en procesos de nominación.</Empty> : <div className="space-y-3">{mine.slice(0, 8).map((p) => <ProcessCard key={p.id} p={p} />)}</div>}
            </Panel>
            {g.player.candidacies.length > 0 && <Panel title="Candidaturas inscritas">{g.player.candidacies.map((k) => { const e = g.calendar.find((x) => x.id === k.electionId); return <div key={k.electionId} className="flex items-center gap-2 text-sm"><CheckCircle2 size={14} className="text-emerald-400" />{e ? ELECTION_LABELS[e.type] : k.electionId} · {officeLabel(k.office, pl.gender)} · {k.partyId === 'IND' ? 'independiente' : partyShort(g, k.partyId)}{e ? <span className="text-ink-400"> · {formatShort(e.date)}</span> : null}</div>; })}</Panel>}
          </div>
        </div>
      )}
      {tab === 'relaciones' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Compromisos">
            {g.career.commitments.length === 0 ? <Empty>No tienes compromisos. Los respaldos y favores suelen tener un precio que se cobra después.</Empty> : (
              <div className="space-y-2">{[...g.career.commitments].reverse().slice(0, 20).map((cm) => (
                <div key={cm.id} className="flex items-start gap-2 text-sm">
                  {cm.status === 'vigente' ? <AlertTriangle size={14} className="mt-0.5 text-amber-300" /> : cm.status === 'cumplido' ? <CheckCircle2 size={14} className="mt-0.5 text-emerald-400" /> : <XCircle size={14} className="mt-0.5 text-red-400" />}
                  <div><div>{cm.description}</div><div className="text-xs text-ink-400">{g.characters[cm.toCharId] ? fullName(g.characters[cm.toCharId]) : 'Persona fuera de la política'} · {cm.status} · vence {formatShort(weekToISO(g.startDate, cm.dueWeek))}</div></div>
                </div>
              ))}</div>
            )}
          </Panel>
          <Panel title="Relaciones (tu lectura)">
            {rels.length === 0 ? <Empty>Aún no conoces a figuras relevantes. Asiste a asambleas, colabora en campañas y reúnete con dirigentes.</Empty> : (
              <div className="divide-y divide-ink-800">{rels.map(([id]) => {
                const c = g.characters[id]; const st = stanceToward(g, id);
                const last = c.memory.filter((m) => m.aboutId === pl.id).slice(-2);
                return (
                  <div key={id} className="py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium"><PersonName id={c.id} /> <span className="text-ink-400">· {partyShort(g, c.partyId)}{c.offices[0] ? ` · ${officeLabel(c.offices[0].type, c.gender)}` : ''}</span></span>
                      <span className={`text-xs ${st.tone === 'good' ? 'text-emerald-300' : st.tone === 'bad' ? 'text-red-300' : 'text-ink-300'}`}>{st.text} <span className="text-ink-500">(lectura {st.certainty})</span></span></div>
                    {last.length > 0 && <div className="text-xs text-ink-400">Historia compartida: {last.map((m) => `${m.note} (${formatShort(weekToISO(g.startDate, m.week))})`).join(' · ')}</div>}
                  </div>
                );
              })}</div>
            )}
          </Panel>
          <Panel title="Tu red: dónde están hoy" className="lg:col-span-2">
            {Object.keys(g.career.contacts).length === 0 ? <Empty>Las personas que conozcas seguirán sus propias carreras; aquí verás qué fue de ellas.</Empty> : (
              <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{Object.entries(g.career.contacts).filter(([id]) => g.characters[id]).sort((a, b) => a[1].metWeek - b[1].metWeek).slice(0, 40).map(([id, k]) => {
                const c = g.characters[id];
                const now = c.status !== 'activo' ? (c.status === 'retirado' ? 'retirado/a' : 'fallecido/a') : c.offices.length ? c.offices.map((o) => o.label ?? officeLabel(o.type, c.gender)).join(', ') : 'sin cargo';
                return <div key={id}><b><PersonName id={c.id} /></b> <span className="text-ink-400">· {partyShort(g, c.partyId)} · {now}</span><div className="text-[11px] text-ink-500">Se conocieron en {2026 + Math.floor((k.metWeek + 45) / 52)}: {k.context.toLowerCase()}</div></div>;
              })}</div>
            )}
          </Panel>
        </div>
      )}
      {tab === 'biografia' && (
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Panel title="Biografía política">
            <ol className="relative space-y-3 border-l border-ink-700 pl-4" data-testid="biografia">
              {[...g.career.bio].reverse().slice(0, 120).map((b, i) => (
                <li key={i} className="text-sm">
                  <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${b.tone > 0 ? 'bg-emerald-400' : b.tone < 0 ? 'bg-red-400' : 'bg-ink-500'}`} />
                  <div className="font-mono text-[11px] text-ink-400">{formatShort(b.date)}</div>
                  <div className="font-medium">{b.title}</div>
                  {b.detail && <div className="text-xs text-ink-400">{b.detail}</div>}
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Evolución de tu reputación (tendencias)">
            {series.length < 2 ? <Empty>Se registra cada trimestre.</Empty> : (
              <div className="h-72"><ResponsiveContainer><LineChart data={series} margin={{ left: -20, right: 8 }}>
                <CartesianGrid stroke="#26324a" strokeDasharray="3 3" /><XAxis dataKey="fecha" tick={{ fill: '#8a94ab', fontSize: 10 }} /><YAxis domain={[0, 100]} tick={false} width={8} />
                <Tooltip contentStyle={{ background: '#121a28', border: '1px solid #37445f', fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="terr" name="Arraigo" stroke="#4e8fd6" dot={false} strokeWidth={2} />
                {pl.partyId && <Line dataKey="party" name="Confianza partidaria" stroke="#c9a24a" dot={false} strokeWidth={2} />}
                <Line dataKey="rec" name="Reconocimiento" stroke="#8fb8e8" dot={false} strokeWidth={2} />
                <Line dataKey="pop" name="Popularidad" stroke="#5fb38a" dot={false} strokeWidth={2} />
                <Line dataKey="cred" name="Credibilidad" stroke="#b088d0" dot={false} strokeWidth={2} />
              </LineChart></ResponsiveContainer></div>
            )}
          </Panel>
        </div>
      )}
      {tab === 'informacion' && <IntelFeed />}
      {tab === 'balances' && <Reviews />}
      {tab === 'legado' && <Legacy />}
    </div>
  );
}
