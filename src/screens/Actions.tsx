import { useState, type ReactNode } from 'react';
import { useGame } from '../stores/gameStore';
import type { Dim, OfficeType, PolicyArea, RegionId, SocialGroup } from '../game/models/types';
import { COMMISSION_BY_ID, MINISTRY_OPTIONS, billsInMyCommissionStage, isDistrictWeek, legOf } from '../game/career/legislature';

const GROUP_LABELS: Record<SocialGroup, string> = { empresarios: 'Gremios empresariales', sindicatos: 'Sindicatos', regiones: 'Organizaciones regionales', jovenes: 'Organizaciones juveniles', adultosMayores: 'Organizaciones de adultos mayores', clasesMedias: 'Organizaciones vecinales y de clase media' };
import { ACTION_COST, ACTION_LABELS, actionBlocked, isLegislator, leadsParty, isPresident, type PlayerAction } from '../game/systems/player';
import { REGIONS } from '../game/data/geography';
import { MOTION_TEMPLATES } from '../game/data/policies';
import { AREA_LABELS, DIMS, DIM_LABELS } from '../game/rules/params';
import { Panel } from '../components/ui';
import { charName, partyShort, playerChar, sortedParties } from '../app/selectors';
import { fullName, officeLabel } from '../game/systems/characters';
import { situationReport } from '../game/career/knowledge';
import { accessBlocked } from '../game/career/access';
import { hasPaidOffice } from '../game/systems/player';
import { actionFatigue } from '../game/systems/player';
import { TeamPanel, WeeklyAgenda } from '../components/WeeklyAgenda';

function ActionCard({ a, title, desc, children }: { a: PlayerAction; title?: string; desc: string; children?: ReactNode }) {
  const { game: g, act } = useGame();
  if (!g) return null;
  const blocked = actionBlocked(g, a);
  return (
    <div className="flex flex-col rounded-lg border border-ink-700 bg-ink-900/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{title ?? ACTION_LABELS[a.type]}</h3>
        <span className="flex shrink-0 gap-1">{actionFatigue(g, a.type) < 0.75 && <span className="chip text-amber-300" title="Repetir la misma acción rinde menos; se recupera con las semanas">{actionFatigue(g, a.type) < 0.45 ? 'muy repetida' : 'rinde menos'}</span>}<span className="chip font-mono">{ACTION_COST[a.type]} PA</span></span>
      </div>
      <p className="mt-1 text-xs text-ink-400">{desc}</p>
      {children && <div className="mt-2 space-y-2">{children}</div>}
      <div className="mt-auto pt-2">
        <button className="btn w-full" disabled={!!blocked} onClick={() => act(a)} title={blocked ?? undefined} data-testid={`accion-${a.type}`}>Ejecutar</button>
        {blocked && <p className="mt-1 text-[11px] text-amber-300/90">{blocked}</p>}
      </div>
    </div>
  );
}

export function Actions() {
  const { game: g } = useGame();
  const [region, setRegion] = useState<RegionId>('RM');
  const [dim, setDim] = useState<Dim | ''>('');
  const [side, setSide] = useState<-1 | 1>(1);
  const [target, setTarget] = useState('');
  const [motion, setMotion] = useState(0);
  const [joinParty, setJoinParty] = useState('');
  const [newName, setNewName] = useState('');
  const [newShort, setNewShort] = useState('');
  const [color, setColor] = useState('#7c5cff');
  const [allyTarget, setAllyTarget] = useState('');
  const [area, setArea] = useState<PolicyArea>('educacion');
  const [legBill, setLegBill] = useState('');
  const [legMin, setLegMin] = useState('');
  const [legInt, setLegInt] = useState('');
  const [legGroup, setLegGroup] = useState<SocialGroup>('sindicatos');
  if (!g) return null;
  const c = playerChar(g);
  // Solo aparecen las personas a las que el personaje puede razonablemente acceder (punto 7)
  const people = Object.values(g.characters).filter((x) => x.status === 'activo' && !x.isPlayer && (x.offices.length > 0 || x.rep.reconocimiento > 45) && !accessBlocked(g, x))
    .sort((a, b) => (a.partyId === c.partyId ? -1 : 0) - (b.partyId === c.partyId ? -1 : 0) || b.rep.reconocimiento - a.rep.reconocimiento).slice(0, 80);
  const allyOptions = [...Object.values(g.coalitions).filter((k) => k.active && !k.members.includes(c.partyId ?? '')).map((k) => ({ id: k.id, label: `Coalición: ${k.name}` })), ...sortedParties(g).filter((p) => p.id !== c.partyId && p.legalStatus !== 'en_formacion').map((p) => ({ id: p.id, label: `${p.name}` }))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><div className="eyebrow">Acciones de la semana</div><h1 className="font-display text-2xl font-bold">¿En qué inviertes tu tiempo?</h1></div>
        <div className="text-sm text-ink-300">Puntos de acción: <b className="font-mono text-gold-300">{g.player.actionPoints}/{g.player.maxActionPoints}</b> · Acciones ya realizadas: {g.player.actionsThisWeek.length}</div>
      </div>

      <WeeklyAgenda />

      {!hasPaidOffice(c) && (
        <Panel title="Tu semana: trabajo y política">
          <p className="mb-2 text-sm text-ink-300">Sin un cargo remunerado necesitas sustento. Más tiempo para la política significa menos ingresos.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {([['completa', 'Trabajo a tiempo completo', 'Menos tiempo (−1 PA), ingresos estables, algo de prestigio profesional'], ['parcial', 'Media jornada', 'Equilibrio entre ingresos y tiempo'], ['dedicacion', 'Dedicación exclusiva', 'Más tiempo (+1 PA); vives de tus ahorros']] as const).map(([m, l, d]) => {
              const on = g.career.workMode === m; const b = actionBlocked(g, { type: 'cambiar_jornada', mode: m });
              return <button key={m} className={`rounded-lg border p-2 text-left text-xs ${on ? 'border-gold-500 bg-ink-800' : 'border-ink-700'}`} disabled={!on && !!b} title={!on ? b ?? undefined : undefined} aria-pressed={on} onClick={() => !on && useGame.getState().act({ type: 'cambiar_jornada', mode: m })}><b className="text-sm">{l}</b><span className="block text-ink-400">{d}</span>{!on && b && <span className="block text-amber-300/90">{b}</span>}</button>;
            })}
          </div>
        </Panel>
      )}

      <Panel title={`Base y comunidad · ${c.comuna}`}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ActionCard a={{ type: 'organizacion_social' }} desc={`Trabajo en ${g.career.origin.organization ? 'tu organización' : 'organizaciones'} de ${c.comuna}: arraigo territorial y capacidad organizativa. Puede llevarte a su directiva.`} />
          {c.partyId && <ActionCard a={{ type: 'asamblea' }} desc="Asambleas y reuniones de base: confianza partidaria, contactos y presencia interna." />}
          <ActionCard a={{ type: 'propuesta_politica', area }} desc="Columna o documento de propuestas: prestigio técnico; el eco depende de la prioridad ciudadana del tema.">
            <select className="input" value={area} onChange={(e) => setArea(e.target.value as PolicyArea)} aria-label="Tema">{(Object.keys(AREA_LABELS) as PolicyArea[]).map((a) => <option key={a} value={a}>{AREA_LABELS[a]}</option>)}</select>
          </ActionCard>
          <ActionCard a={{ type: 'debate_publico' }} desc="Foros, radios y debates locales. Visibilidad con riesgo: un error se paga en credibilidad." />
          <ActionCard a={{ type: 'mediar_conflicto' }} desc={`Mediar en un conflicto vecinal o ambiental en ${c.comuna}. Si sale bien, gran arraigo; si sale mal, rechazo.`} />
        </div>
        <p className="mt-2 text-xs text-ink-400">{situationReport(g)[0].text}. Las candidaturas, cupos y nominaciones se gestionan en la pantalla <b>Carrera</b>.</p>
      </Panel>

      <Panel title="Territorio y medios">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ActionCard a={{ type: 'entrevista', dim: dim || undefined, side }} desc="Visibilidad nacional. El resultado depende de comunicación y oratoria; puedes fijar una postura.">
            <select className="input" value={dim} onChange={(e) => setDim(e.target.value as Dim | '')} aria-label="Tema de la entrevista"><option value="">Tema general</option>{DIMS.map((d) => <option key={d} value={d}>{DIM_LABELS[d].name}</option>)}</select>
            {dim && <select className="input" value={side} onChange={(e) => setSide(Number(e.target.value) as -1 | 1)} aria-label="Postura"><option value={-1}>{DIM_LABELS[dim].neg}</option><option value={1}>{DIM_LABELS[dim].pos}</option></select>}
          </ActionCard>
          <ActionCard a={{ type: 'visita_region', region }} desc="Reconocimiento regional, redes y organización de tu partido en la región. Cuesta 2 MM$.">
            <select className="input" value={region} onChange={(e) => setRegion(e.target.value as RegionId)} aria-label="Región">{REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          </ActionCard>
          <ActionCard a={{ type: 'acto_politico' }} desc="Movilización y popularidad en tu región. Cuesta 8 MM$; el éxito depende de carisma y organización local." />
          <ActionCard a={{ type: 'reunion', charId: target }} desc="Mejora relaciones (memoria de los actores). Solo aparecen las personas a las que tienes acceso: tu red, tu territorio, tu partido y tu cargo determinan con quién puedes reunirte. Con personas reales, la conversación es simulada.">
            <select className="input" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Con quién"><option value="">Elige a alguien…</option>{people.map((p) => <option key={p.id} value={p.id}>{fullName(p)} · {partyShort(g, p.partyId)}{p.offices[0] ? ` · ${p.offices[0].type.replace('_', ' ')}` : ''}</option>)}</select>
          </ActionCard>
        </div>
      </Panel>

      <Panel title="Recursos y preparación">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ActionCard a={{ type: 'recaudar', mode: 'legal' }} title="Recaudar (aportes legales)" desc="Fondos declarados. Depende de tus redes y la confianza empresarial." />
          <ActionCard a={{ type: 'recaudar', mode: 'agresivo' }} title="Recaudar (métodos agresivos)" desc="El doble de recursos, con riesgo de cuestionamientos si tu integridad es baja." />
          <ActionCard a={{ type: 'redes' }} desc="Fortalece redes, organización local de tu partido y confianza partidaria." />
          <ActionCard a={{ type: 'formacion' }} desc="Mejora conocimiento técnico y prestigio. Útil para ministerios y debates." />
        </div>
      </Panel>

      {c.partyId && (
        <Panel title={`Vida partidaria · ${partyShort(g, c.partyId)}`}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ActionCard a={{ type: 'organizar_faccion' }} desc="Crea o fortalece tu sector interno. Base para disputar la directiva." />
            <ActionCard a={{ type: 'postular_interna' }} desc={`Inscríbete para la próxima elección interna (en ${Math.max(0, g.parties[c.partyId].nextLeadershipWeek - g.week)} semanas). Pesan tu sector, confianza y redes.`} />
            {leadsParty(g) && <>
              <ActionCard a={{ type: 'proponer_alianza', target: allyTarget }} desc="Negocia un pacto. Los demás partidos evalúan escaños esperados, ideología y confianza.">
                <select className="input" value={allyTarget} onChange={(e) => setAllyTarget(e.target.value)} aria-label="Con quién aliarse"><option value="">Elige…</option>{allyOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
              </ActionCard>
              <ActionCard a={{ type: 'disciplinar_bancada' }} desc="Sube la disciplina de voto; tensiona a las facciones." />
              <ActionCard a={{ type: 'salir_coalicion' }} desc="Rompe con tu coalición actual. Los socios lo recordarán." />
            </>}
            <ActionCard a={{ type: 'renunciar_partido' }} desc="Pasas a ser independiente. La directiva lo vivirá como una traición." />
          </div>
        </Panel>
      )}

      {!c.partyId && (
        <Panel title="Sin militancia">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ActionCard a={{ type: 'unirse_partido', partyId: joinParty }} desc="Solicita afiliarte. Se evalúa tu cercanía ideológica y relación con la directiva.">
              <select className="input" value={joinParty} onChange={(e) => setJoinParty(e.target.value)} aria-label="Partido"><option value="">Elige partido…</option>{sortedParties(g).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </ActionCard>
          </div>
        </Panel>
      )}

      <Panel title="Fundar un partido">
        <div className="grid gap-3 md:grid-cols-2">
          <ActionCard a={{ type: 'fundar_partido', name: newName, short: newShort, color }} desc="Requiere reconocimiento ≥ 25 y 50 MM$. Deberá completar la recolección de firmas (estado «en formación») antes de competir.">
            <input className="input" placeholder="Nombre del partido" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Nombre del nuevo partido" />
            <div className="flex gap-2"><input className="input" placeholder="Sigla" value={newShort} maxLength={10} onChange={(e) => setNewShort(e.target.value)} aria-label="Sigla" /><input type="color" className="h-9 w-12 rounded border border-ink-600 bg-ink-900" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Color" /></div>
          </ActionCard>
        </div>
      </Panel>

      {isLegislator(c) && (() => {
        const lg = legOf(g);
        const dw = isDistrictWeek(g);
        const billsCom = billsInMyCommissionStage(g);
        const bSel = billsCom.find((b) => b.id === legBill)?.id ?? billsCom[0]?.id ?? '';
        const myMin = MINISTRY_OPTIONS.filter((m) => lg?.commissions.some((x) => COMMISSION_BY_ID[x].areas.includes(m.area)));
        return (
          <Panel title={`Labor parlamentaria · ${officeLabel(c.offices.find((o) => o.type === 'diputado' || o.type === 'senador')!.type, c.gender)}`} right={<span className={`chip ${dw ? 'border-sky-500 text-sky-300' : 'border-gold-500 text-gold-300'}`}>{dw ? 'Semana distrital' : 'Semana legislativa'}</span>}>
            {lg && (
              <div className="mb-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4" data-testid="labor-parlamentaria">
                <div><div className="eyebrow">Comisiones</div>{lg.commissions.map((x) => <div key={x}>{COMMISSION_BY_ID[x].name}{lg.chair === x ? <b className="text-gold-300"> · presidencia</b> : ''}</div>)}</div>
                <div><div className="eyebrow">Bancada</div>{lg.caucusLead ? 'Jefe/a de bancada' : c.partyId ? 'Integrante' : 'Independiente'}{lg.districtOffice ? <div className="text-ink-400">Oficina distrital abierta</div> : null}</div>
                <div><div className="eyebrow">Asistencia (pública)</div><b className={lg.attendance < 80 ? 'text-red-300' : 'text-emerald-300'}>{Math.round(lg.attendance)}%</b><div className="text-[11px] text-ink-400">Hacer terreno en semana legislativa sin pareo cuenta como inasistencia.</div></div>
                <div><div className="eyebrow">Tu registro</div><div className="text-xs text-ink-300">{lg.record.speeches} intervenciones · {lg.record.indicaciones} indicaciones · {lg.record.motions} mociones · {lg.record.oficios} oficios y citaciones · {lg.record.sessions} sesiones especiales · {lg.record.interpelaciones} interpelaciones · {lg.record.lobby} audiencias</div></div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ActionCard a={{ type: 'intervencion_sala', area }} desc="Hora de incidentes o debate de un proyecto: reconocimiento y prestigio según tu oratoria.">
                <select className="input" value={area} onChange={(e) => setArea(e.target.value as PolicyArea)} aria-label="Tema">{(Object.keys(AREA_LABELS) as PolicyArea[]).map((x) => <option key={x} value={x}>{AREA_LABELS[x]}</option>)}</select>
              </ActionCard>
              <ActionCard a={{ type: 'mocion', template: motion }} desc="Presenta una moción parlamentaria. Sin urgencia del Ejecutivo, avanzar requiere negociar (ver Congreso).">
                <select className="input" value={motion} onChange={(e) => setMotion(Number(e.target.value))} aria-label="Proyecto">{MOTION_TEMPLATES.map((t, i) => <option key={t.title} value={i}>{t.title}</option>)}</select>
              </ActionCard>
              <ActionCard a={{ type: 'indicaciones', billId: bSel }} desc="Modifica un proyecto en comisión. Pesa más si es de tu comisión.">
                <select className="input" value={bSel} onChange={(e) => setLegBill(e.target.value)} aria-label="Proyecto en comisión">{billsCom.length ? billsCom.map((b) => <option key={b.id} value={b.id}>{b.title}</option>) : <option value="">Sin proyectos en comisión</option>}</select>
              </ActionCard>
              {lg?.chair && <ActionCard a={{ type: 'poner_en_tabla', billId: bSel }} desc="Como presidente/a de comisión, aceleras un proyecto de tu área." />}
              <ActionCard a={{ type: 'citar_comision', ministryId: legMin || myMin[0]?.id || '' }} desc="Citas a la autoridad del área a tu comisión.">
                <select className="input" value={legMin || myMin[0]?.id || ''} onChange={(e) => setLegMin(e.target.value)} aria-label="Ministerio">{myMin.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              </ActionCard>
              <ActionCard a={{ type: 'interpelacion', ministryId: legInt || 'interior' }} desc="Desde la oposición, con 52 firmas: alto impacto y alto riesgo. (No se interpela a ministros que son personas reales.)">
                <select className="input" value={legInt || 'interior'} onChange={(e) => setLegInt(e.target.value)} aria-label="Cartera">{MINISTRY_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              </ActionCard>
              <ActionCard a={{ type: 'sesion_especial', area }} desc="Con un tercio de la cámara, instalas un tema en la agenda pública." />
              <ActionCard a={{ type: 'fiscalizacion' }} desc="Oficios de fiscalización al Ejecutivo: prestigio y reconocimiento; en el oficialismo incomoda." />
              <ActionCard a={{ type: 'bancada_transversal', area }} desc="Con parlamentarios de otros partidos: nuevas alianzas, algo de recelo en tu sector." />
              <ActionCard a={{ type: 'audiencia_lobby', group: legGroup }} desc="Audiencia registrada (Ley del Lobby): confianza del grupo e información sobre proyectos.">
                <select className="input" value={legGroup} onChange={(e) => setLegGroup(e.target.value as SocialGroup)} aria-label="Grupo">{(['empresarios', 'sindicatos', 'regiones', 'jovenes', 'adultosMayores', 'clasesMedias'] as SocialGroup[]).map((x) => <option key={x} value={x}>{GROUP_LABELS[x]}</option>)}</select>
              </ActionCard>
              <ActionCard a={{ type: 'pareo' }} desc="Acuerdo con un parlamentario de otro sector: puedes hacer terreno esta semana sin contar como inasistencia." />
              <ActionCard a={{ type: 'semana_distrital' }} desc="Recorres tu distrito o circunscripción (solo en semana distrital): arraigo para la reelección." />
              <ActionCard a={{ type: 'oficina_distrital' }} desc="Una sede permanente en tu comuna: arraigo cada semana y atención de vecinos." />
              {lg?.districtOffice ? <ActionCard a={{ type: 'atender_vecinos' }} desc="Atención en tu oficina distrital." /> : null}
              <ActionCard a={{ type: 'presidir_comision', commissionId: lg?.commissions[0] ?? '' }} title="Postular a presidir una comisión" desc="Se elige en marzo; depende del peso de tu sector y de tu capacidad de negociación." />
              <ActionCard a={{ type: 'jefatura_bancada' }} desc="Se elige en marzo: coordinas votos y vocerías y ganas peso en el partido." />
              <ActionCard a={{ type: 'declaracion_intereses' }} desc="Obligatoria cada año (marzo-abril). No presentarla a tiempo tiene costo público." />
            </div>
            <p className="mt-2 text-xs text-ink-400">Tu voto en sala se fija en la pantalla Congreso (por omisión votas con tu bancada). Tu registro parlamentario y tu asistencia influyen en tu reelección.</p>
          </Panel>
        );
      })()}

      {c.offices.some((o) => ['alcalde', 'gobernador', 'concejal'].includes(o.type)) && (
        <Panel title="Gestión local">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ActionCard a={{ type: 'gestion_local' }} desc="Mejora infraestructura y reduce el malestar en tu territorio; suma prestigio y popularidad." />
            <ActionCard a={{ type: 'atender_vecinos' }} desc="Audiencias y terreno: arraigo lento pero sólido." />
          </div>
        </Panel>
      )}

      {c.offices.some((o) => o.type === 'ministro') && (
        <Panel title="Ministerio">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ActionCard a={{ type: 'gestion_ministerial' }} desc="Impulsa el desempeño de tu cartera. Las políticas las anuncia el Presidente; tú respondes por su ejecución." />
          </div>
        </Panel>
      )}

      {c.offices.some((o) => (['ministro', 'subsecretario', 'seremi', 'asesor', 'dirigente_social', 'dirigente_territorial', 'presidente_partido', 'concejal'] as OfficeType[]).includes(o.type)) && (
        <Panel title="Renunciar a un cargo">
          <div className="flex flex-wrap gap-2">
            {c.offices.filter((o) => (['ministro', 'subsecretario', 'seremi', 'asesor', 'dirigente_social', 'dirigente_territorial', 'presidente_partido', 'concejal'] as OfficeType[]).includes(o.type)).map((o) => (
              <button key={o.type} className="btn btn-ghost text-red-300" onClick={() => { if (confirm(`¿Renunciar a ${officeLabel(o.type, c.gender)}?`)) useGame.getState().act({ type: 'renunciar_cargo', office: o.type }); }}>Renunciar: {o.label ?? officeLabel(o.type, c.gender)}</button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-400">Renunciar a un cargo de designación levanta la inhabilidad para competir, pero el gobierno o tu mentor lo recordarán.</p>
        </Panel>
      )}

      {isPresident(g) && (
        <Panel title="Presidencia">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ActionCard a={{ type: 'cadena_nacional' }} desc="Mensaje al país. Puede mejorar (o no) la aprobación según tu comunicación." />
          </div>
          <p className="mt-2 text-xs text-ink-400">Gabinete, políticas públicas, urgencias y vetos se gestionan en las pantallas Gobierno y Congreso.</p>
        </Panel>
      )}

      <TeamPanel />

      <Panel title="Retiro">
        <p className="text-sm text-ink-400">Puedes poner fin a tu carrera. {charName(g, c.id)} quedará en la historia de la partida.</p>
        <button className="btn btn-danger mt-2" onClick={() => { if (confirm('¿Retirarte definitivamente de la política?')) useGame.getState().act({ type: 'retirarse' }); }}>Retirarse de la política</button>
      </Panel>
    </div>
  );
}
