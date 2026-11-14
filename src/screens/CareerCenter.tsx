/**
 * CENTRO DE CARRERA — pantalla maestra de «Archivo de Poder».
 *
 * Estructura editorial: encabezado de identidad → asunto central de la semana (lo que exige
 * atención) → columna de apoyo (territorio con fotografía real, red e información) → módulos que
 * la etapa de carrera justifica (densidad adaptativa: quien empieza no ve el tablero nacional).
 */
import { ArrowRight, CalendarDays, Trophy } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useGame } from '../stores/gameStore';
import { Badge, Bar, Empty, IdeologyBars, PartyChip, Portrait } from '../components/ui';
import { dateLabel, officeText, partyColor, partyShort, playerChar, pollAvg, pct, mm, seatsByParty, nextElectionInfo } from '../app/selectors';
import { ageOf } from '../game/systems/characters';
import { ELECTION_LABELS } from '../game/systems/elections';
import { outletName } from '../game/systems/news';
import { formatShort, weekToISO } from '../game/engine/dates';
import { governmentSupportSeats } from '../game/systems/government';
import { homeCut, stagnationWeeks } from '../game/career/capital';
import { PersonName } from '../components/CharacterSheet';
import { careerSummary } from '../game/career/summary';
import { situationReport } from '../game/career/knowledge';
import { hasPaidOffice } from '../game/systems/player';
import { careerContext, type CareerStage } from '../game/career/stage';
import { photoFor, photoForComuna } from '../data/media/territorialPhotos';
import { TerritorialPhoto } from '../components/TerritorialPhoto';
import { REGION_BY_ID } from '../game/data/geography';
import { COMUNA_BY_CUT } from '../game/territory/data';
import type { GameState, RegionId } from '../game/models/types';

const STAGES: CareerStage[] = ['comienzo', 'consolidacion', 'institucional', 'nacional', 'presidencia'];
const STAGE_SHORT: Record<CareerStage, string> = { comienzo: 'Comienzo', consolidacion: 'Consolidación', institucional: 'Institucional', nacional: 'Nacional', presidencia: 'Presidencia' };
const SOURCE_LABEL = { publica: 'Pública', contacto: 'Contacto', reservada: 'Reservada', rumor: 'Rumor', estimacion: 'Estimación' } as const;

function Section({ title, kicker, right, children, className = '' }: { title: string; kicker?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={className} aria-label={title}>
      <div className="flex items-end justify-between gap-3 border-b border-ink-600 pb-1.5">
        <div>
          {kicker && <div className="kicker">{kicker}</div>}
          <h2 className="font-display text-xl font-semibold text-ink-50">{title}</h2>
        </div>
        {right}
      </div>
      <div className="pt-3">{children}</div>
    </section>
  );
}

/** El asunto que la semana pone en primer plano (uno solo, jerarquía clara). */
function Featured({ g }: { g: GameState }) {
  const { setScreen } = useGame();
  if (g.player.careerOver) {
    const sum = careerSummary(g);
    return (
      <article className="panel border-l-4 border-l-burgundy p-5 sm:p-6">
        <div className="kicker">Fin de la carrera</div>
        <h2 className="mt-1 font-display text-3xl font-semibold text-ink-50">{sum.archetype}</h2>
        <p className="mt-2 max-w-[62ch] font-serif text-lg text-ink-200">{sum.verdict} Cargo más alto: {sum.peak ?? 'ninguno'}. Elecciones ganadas y perdidas: {sum.elections.won}–{sum.elections.lost}.</p>
        <button className="btn btn-primary mt-4" onClick={() => setScreen('carrera')}>Ver biografía y legado <ArrowRight size={15} aria-hidden /></button>
      </article>
    );
  }
  const op = g.career.opportunities[0];
  if (op) {
    return (
      <article className="panel border-l-4 border-l-burgundy p-5 sm:p-6" data-testid="aviso-oportunidades">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="kicker">Oportunidad abierta{g.career.opportunities.length > 1 ? ` · 1 de ${g.career.opportunities.length}` : ''}</div>
          <span className="font-mono text-xs text-ink-400">vence en {Math.max(0, op.expiresWeek - g.week)} sem.</span>
        </div>
        <h2 className="mt-1 font-display text-[clamp(1.5rem,2.4vw,2rem)] font-semibold leading-tight text-ink-50">{op.title}</h2>
        <p className="mt-2 max-w-[66ch] font-serif text-[17px] leading-relaxed text-ink-200">{op.description}</p>
        {(op.benefits.length > 0 || op.risks.length > 0) && (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {op.benefits.length > 0 && <div><dt className="eyebrow text-emerald-300">A favor</dt><dd className="mt-1 text-ink-200">{op.benefits.slice(0, 2).join(' · ')}</dd></div>}
            {op.risks.length > 0 && <div><dt className="eyebrow text-red-300">Riesgos</dt><dd className="mt-1 text-ink-200">{op.risks.slice(0, 2).join(' · ')}</dd></div>}
          </dl>
        )}
        <button className="btn btn-primary mt-5" onClick={() => setScreen('carrera')}>Decidir en Carrera <ArrowRight size={15} aria-hidden /></button>
      </article>
    );
  }
  const k = g.player.candidacies[0];
  if (k) {
    const ev = g.calendar.find((x) => x.id === k.electionId);
    return (
      <article className="panel border-l-4 border-l-brass p-5 sm:p-6">
        <div className="kicker">Candidatura en curso</div>
        <h2 className="mt-1 font-display text-3xl font-semibold text-ink-50">{ev ? ELECTION_LABELS[ev.type] : k.electionId.startsWith('interna') ? `Elección interna de ${partyShort(g, k.partyId)}` : 'Elección presidencial'}</h2>
        {ev && <p className="mt-2 font-mono text-sm text-ink-300">{formatShort(ev.date)} · faltan {ev.week - g.week} semanas</p>}
        {g.player.campaign?.electionId === k.electionId && <div className="mt-3 max-w-sm"><Bar label="Intensidad de campaña" value={g.player.campaign.intensity} /></div>}
        <button className="btn btn-primary mt-5" onClick={() => setScreen('acciones')}>Planificar la semana <ArrowRight size={15} aria-hidden /></button>
      </article>
    );
  }
  const crisis = [...g.crises].sort((a, b) => b.severity - a.severity)[0];
  if (crisis) {
    return (
      <article className="panel border-l-4 border-l-red-400 p-5 sm:p-6">
        <div className="kicker">Crisis en curso</div>
        <h2 className="mt-1 font-display text-3xl font-semibold text-ink-50">{crisis.name}</h2>
        <p className="mt-2 font-serif text-[17px] text-ink-200">{crisis.cause} · {crisis.weeksLeft} semanas restantes estimadas.</p>
        <div className="mt-3 max-w-sm"><Bar label="Gravedad" value={crisis.severity} color="#A44343" /></div>
        <button className="btn btn-primary mt-5" onClick={() => setScreen('acciones')}>Definir una postura <ArrowRight size={15} aria-hidden /></button>
      </article>
    );
  }
  const n = g.news[0];
  return (
    <article className="panel border-l-4 border-l-ink-500 p-5 sm:p-6">
      <div className="kicker">{n ? `${outletName(n.outletId)} · ${formatShort(weekToISO(g.startDate, n.week))}` : 'Semana tranquila'}</div>
      <h2 className="mt-1 font-display text-[clamp(1.5rem,2.4vw,2rem)] font-semibold leading-tight text-ink-50">{n ? n.headline : 'Nada urgente en tu agenda'}</h2>
      <p className="mt-2 max-w-[62ch] font-serif text-[17px] text-ink-200">Una semana sin urgencias es una semana para construir: territorio, red y reputación no se improvisan en campaña.</p>
      <button className="btn btn-primary mt-5" onClick={() => setScreen('acciones')}>Organizar la semana <ArrowRight size={15} aria-hidden /></button>
    </article>
  );
}

export function CareerCenter() {
  const { game: g, setScreen } = useGame();
  if (!g) return null;
  const c = playerChar(g);
  const ctx = careerContext(g);
  const pres = g.characters[g.government.presidentId];
  const region = c.regionId as RegionId;
  const cut = homeCut(g);
  const photo = photoForComuna(cut) ?? photoFor(region);
  const ne = nextElectionInfo(g);
  const report = situationReport(g);
  const intel = g.career.intel.slice(-4).reverse();
  const polls = pollAvg(g);
  const topPolls = Object.entries(polls).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const upcoming = g.calendar.filter((e) => !e.done && e.week >= g.week).slice(0, 5);
  const e = g.economy;
  const gov = governmentSupportSeats(g, 'camara');
  const approvalSeries = g.opinionHistory.slice(-52).map((h) => ({ semana: h.week, aprobacion: Math.round(h.approval) }));
  const mySeats = c.partyId ? (seatsByParty(g, 'camara')[c.partyId] ?? 0) + (seatsByParty(g, 'senado')[c.partyId] ?? 0) : 0;
  const stageIdx = STAGES.indexOf(ctx.stage);

  return (
    <div className="mx-auto max-w-[1440px] space-y-8">
      {/* 1 · Identidad */}
      <header className="grid gap-5 border-b border-ink-600 pb-6 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-end">
        <Portrait name={`${c.firstName} ${c.lastName}`} color={partyColor(g, c.partyId)} size={88} seed={c.id} />
        <div className="min-w-0">
          <div className="kicker">Expediente · {dateLabel(g)}</div>
          <h1 className="mt-1 font-display text-[clamp(1.875rem,3.2vw,2.75rem)] font-semibold leading-tight text-ink-50">{c.firstName} {c.lastName}</h1>
          <p className="mt-1 font-serif text-lg text-ink-200">{officeText(g, c)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-300">
            <PartyChip g={g} id={c.partyId} label={c.partyId ? g.parties[c.partyId]?.name : 'Independiente'} />
            <span className="chip">{ageOf(g, c)} años</span>
            <span className="chip">{COMUNA_BY_CUT[cut]?.name ?? c.comuna} · {REGION_BY_ID[region]?.name}</span>
            <span className="chip">Aspiración: {g.player.goal}</span>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-right md:min-w-[300px]">
          <div><dt className="eyebrow">Recursos</dt><dd className="font-mono text-lg text-ink-50">{mm(g.player.personalFunds)}</dd></div>
          <div><dt className="eyebrow">Acción</dt><dd className="font-mono text-lg text-ink-50">{g.player.actionPoints}/{g.player.maxActionPoints}</dd></div>
          <div><dt className="eyebrow">{ne ? ne.label : 'Elección'}</dt><dd className="font-mono text-lg text-ink-50">{ne ? `${ne.weeks} sem.` : '—'}</dd></div>
        </dl>
      </header>

      {/* Etapa de carrera: dónde estás, sin barra de niveles */}
      <nav aria-label="Etapa de la carrera" className="-mt-4">
        <ol className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {STAGES.map((st, i) => (
            <li key={st} aria-current={i === stageIdx ? 'step' : undefined} className={`flex items-center gap-1.5 ${i === stageIdx ? 'font-semibold text-burgundy' : i < stageIdx ? 'text-ink-300' : 'text-ink-400'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${i === stageIdx ? 'bg-burgundy' : i < stageIdx ? 'bg-ink-300' : 'border border-ink-400'}`} aria-hidden />{STAGE_SHORT[st]}
            </li>
          ))}
          <li className="text-ink-400">· alcance {ctx.scope}</li>
        </ol>
      </nav>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,8fr)_minmax(320px,4fr)]">
        {/* 2 · Columna principal */}
        <div className="min-w-0 space-y-8">
          <Featured g={g} />
          {!g.player.careerOver && stagnationWeeks(g) > 104 && <p className="border-l-2 border-amber-400 pl-3 text-sm text-amber-200">Tu carrera lleva {Math.floor(stagnationWeeks(g) / 52)} años sin avances. En Carrera hay caminos para reactivarla.</p>}

          <Section title="Informe de situación" kicker="Lo que sabes (y cómo lo sabes)" right={<button className="btn-link" onClick={() => setScreen('carrera')}>Carrera</button>}>
            <ul className="grid gap-x-8 gap-y-2 text-[15px] sm:grid-cols-2" data-testid="situacion-panel">
              {report.slice(0, 8).map((l, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${l.tone === 'good' ? 'bg-emerald-400' : l.tone === 'bad' ? 'bg-red-400' : 'bg-ink-400'}`} aria-hidden />
                  <span><span className="sr-only">{l.tone === 'good' ? 'Favorable: ' : l.tone === 'bad' ? 'Desfavorable: ' : ''}</span>{l.text}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-400">
              {!hasPaidOffice(c) && <>Jornada: <b className="font-medium text-ink-200">{g.career.workMode === 'completa' ? 'trabajo a tiempo completo' : g.career.workMode === 'parcial' ? 'media jornada' : 'dedicación exclusiva a la política'}</b> · </>}
              Gobierno de <PersonName id={pres?.id} /> ({partyShort(g, pres?.partyId)}), aprobación {pct(g.opinion.presidentialApproval, 0)}
            </p>
          </Section>

          {ctx.shows.national && (
            <Section title="Pulso del país" kicker="Política nacional">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                {[
                  ['Aprobación presidencial', pct(g.opinion.presidentialApproval, 0)], ['Crecimiento', pct(e.growth)], ['Inflación', pct(e.inflation)],
                  ['Desempleo', pct(e.unemployment)], ['Seguridad percibida', String(Math.round(g.opinion.securityPerception))], ['Oficialismo en la Cámara', `${gov.gov}/${gov.total}`],
                ].map(([k, v]) => <div key={k} className="border-l border-ink-600 pl-3"><dt className="text-xs text-ink-400">{k}</dt><dd className="font-mono text-xl text-ink-50">{v}</dd></div>)}
              </dl>
              {approvalSeries.length >= 4 ? (
                <figure className="mt-4">
                  <figcaption className="text-xs text-ink-400">Aprobación presidencial, últimas {approvalSeries.length} semanas (%)</figcaption>
                  <div className="mt-1 h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={approvalSeries} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                        <CartesianGrid stroke="#DDD6CA" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="semana" tick={{ fill: '#5C6369', fontSize: 10 }} tickLine={false} />
                        <YAxis domain={[0, 80]} tick={{ fill: '#5C6369', fontSize: 10 }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ background: '#FCFAF6', color: '#27313B', border: '1px solid #CEC6B9', borderRadius: 6, fontSize: 12 }} />
                        <Line type="monotone" dataKey="aprobacion" stroke="#782F3D" dot={false} strokeWidth={2} name="Aprobación presidencial" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </figure>
              ) : <p className="mt-3 text-xs text-ink-400">La serie de aprobación se construye semana a semana.</p>}
            </Section>
          )}

          <Section title="Titulares" kicker="Prensa" right={<button className="btn-link" onClick={() => setScreen('noticias')}>Todas</button>}>
            {g.news.length === 0 ? <Empty>Aún no hay noticias.</Empty> : (
              <ul className="divide-y divide-ink-700">
                {g.news.slice(0, ctx.stage === 'comienzo' ? 4 : 6).map((n) => (
                  <li key={n.id} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-400"><span className="font-semibold uppercase tracking-wide text-burgundy">{outletName(n.outletId)}</span><span className="font-mono">{formatShort(weekToISO(g.startDate, n.week))}</span><span>· {n.category}</span></div>
                    <div className="font-serif text-[17px] leading-snug text-ink-50">{n.headline}</div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* 3 · Columna de apoyo */}
        <aside className="min-w-0 space-y-8" aria-label="Contexto">
          <section aria-label="Tu territorio">
            <TerritorialPhoto photo={photo} regionId={region} cut={cut} ratio="3/2" />
            <div className="mt-3 flex items-baseline justify-between gap-2">
              <div><div className="kicker">Tu base</div><div className="font-display text-xl font-semibold text-ink-50">{COMUNA_BY_CUT[cut]?.name ?? c.comuna}</div></div>
              <button className="btn-link" onClick={() => setScreen('mapa')}>Dossier territorial</button>
            </div>
          </section>

          <Section title="Lo que se comenta" kicker="Tu red">
            {intel.length === 0 ? <Empty>Tu red todavía no te cuenta nada.</Empty> : (
              <ul className="space-y-3">
                {intel.map((m) => (
                  <li key={m.id} className="border-l-2 border-ink-500 pl-3">
                    <div className="flex gap-2 text-[11px] text-ink-400"><span className="font-semibold uppercase tracking-wide">{SOURCE_LABEL[m.source]}</span><span>· fiabilidad {m.reliability}</span><span className="font-mono">· sem. {m.week}</span></div>
                    <p className="font-serif text-[15px] leading-snug text-ink-100">«{m.text}»</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {ctx.shows.electoral && (
            <Section title="Calendario electoral" right={<CalendarDays size={16} className="text-ink-400" aria-hidden />}>
              {upcoming.length === 0 ? <Empty>Sin elecciones programadas.</Empty> : (
                <ul className="divide-y divide-ink-700 text-sm">
                  {upcoming.map((u) => <li key={u.id} className="flex items-baseline justify-between gap-2 py-1.5"><span className="text-ink-100">{ELECTION_LABELS[u.type]}</span><span className="font-mono text-xs text-ink-400">{formatShort(u.date)} · {u.week - g.week} sem.</span></li>)}
                </ul>
              )}
            </Section>
          )}

          {ctx.shows.partyNews && (
            <Section title="Encuestas" kicker="Promedio de 8 semanas · estimación, no resultado">
              <div className="space-y-1.5">
                {topPolls.map(([p, v]) => (
                  <div key={p} className="flex items-center gap-2 text-sm">
                    <span className="w-20 shrink-0 truncate text-ink-200">{partyShort(g, p)}</span>
                    <div className="flex-1"><Bar value={v} max={35} color={partyColor(g, p)} showValue={false} /></div>
                    <span className="w-12 text-right font-mono text-xs text-ink-200">{pct(v)}</span>
                  </div>
                ))}
                {c.partyId && <div className="pt-1 text-xs text-ink-400">Tu partido: {pct(polls[c.partyId] ?? 0)} · {mySeats} parlamentarios</div>}
              </div>
            </Section>
          )}

          <Section title="Perfil" kicker="Atributos e ideología">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {(['carisma', 'oratoria', 'negociacion', 'tecnico', 'liderazgo', 'comunicacion', 'redes', 'gestion', 'integridad'] as const).map((k) => (
                <Bar key={k} label={{ carisma: 'Carisma', oratoria: 'Oratoria', negociacion: 'Negociación', tecnico: 'Técnico', liderazgo: 'Liderazgo', comunicacion: 'Comunicación', redes: 'Redes', gestion: 'Gestión', integridad: 'Integridad' }[k]} value={c.attrs[k]} color="#465B70" />
              ))}
            </div>
            <div className="mt-4"><IdeologyBars compact ideology={c.ideology} compare={c.partyId ? g.parties[c.partyId]?.ideology : undefined} compareLabel={c.partyId ? `línea de ${partyShort(g, c.partyId)}` : undefined} /></div>
            {g.player.achievements.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{g.player.achievements.map((a) => <Badge key={a} tone="gold"><Trophy size={11} className="mr-1" aria-hidden />{a}</Badge>)}</div>}
          </Section>
        </aside>
      </div>
    </div>
  );
}
