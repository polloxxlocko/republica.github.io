/** Agenda semanal dinámica y equipo propio (pantalla Acciones). */
import { CalendarRange, Users, X } from 'lucide-react';
import { useGame } from '../stores/gameStore';
import { Badge, Empty, Panel } from './ui';
import { actionBlocked } from '../game/systems/player';
import { CATEGORY_LABEL, TEAM_ROLES } from '../game/career/agendaWeek';

const RISK: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' }> = { bajo: { label: 'riesgo bajo', tone: 'good' }, medio: { label: 'riesgo medio', tone: 'warn' }, alto: { label: 'riesgo alto', tone: 'bad' } };

export function WeeklyAgenda() {
  const { game: g, act } = useGame();
  if (!g) return null;
  const ag = g.career.agenda;
  const offers = ag && ag.week === g.week ? ag.offers : [];
  return (
    <Panel title="Agenda de esta semana" right={<span className="flex items-center gap-1 text-[11px] text-ink-400"><CalendarRange size={14} aria-hidden /> cambia cada semana</span>}>
      <p className="mb-3 text-xs text-ink-400">Oportunidades del momento según tu cargo, tu región, tu partido, el calendario y la contingencia. Las que no hagas esta semana desaparecen y quizá no vuelvan pronto.</p>
      {offers.length === 0 ? <Empty>No hay actividades especiales esta semana.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="agenda">
          {offers.map((o) => {
            const done = ag!.used.includes(o.id);
            const b = done ? null : actionBlocked(g, { type: 'agenda', offerId: o.id });
            const r = RISK[o.risk];
            return (
              <div key={o.id} className={`flex flex-col rounded-lg border p-3 ${done ? 'border-emerald-700/60 bg-emerald-950/20' : 'border-ink-700 bg-ink-900/50'}`} data-testid="agenda-item">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="chip">{CATEGORY_LABEL[o.category as keyof typeof CATEGORY_LABEL] ?? o.category}</span>
                  <Badge tone={r.tone}>{r.label}</Badge>
                  <span className="chip font-mono">{o.cost} PA{o.funds ? ` · ${o.funds} MM$` : ''}</span>
                </div>
                <h3 className="mt-1.5 text-sm font-semibold">{o.title}</h3>
                <p className="mt-1 text-xs text-ink-400">{o.desc}</p>
                <div className="mt-auto pt-2">
                  <button className="btn w-full" disabled={done || !!b} onClick={() => act({ type: 'agenda', offerId: o.id })} title={b ?? undefined}>{done ? 'Realizada' : 'Hacerlo'}</button>
                  {b && <p className="mt-1 text-[11px] text-amber-300/90">{b}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

export function TeamPanel() {
  const { game: g, act } = useGame();
  if (!g) return null;
  const team = g.career.team ?? [];
  const cost = team.reduce((a, m) => a + m.salary, 0);
  return (
    <Panel title="Tu equipo" right={<Users size={16} className="text-gold-400" aria-hidden />}>
      {team.length === 0 ? <Empty>No tienes equipo propio. A veces aparecen en tu agenda personas disponibles para sumarse: prensa, territorio, asesoría técnica, redes o finanzas.</Empty> : (
        <ul className="divide-y divide-ink-800 text-sm">{team.map((m) => (
          <li key={m.id} className="flex items-center gap-2 py-1.5">
            <span className="flex-1"><b>{m.name}</b> <span className="text-ink-400">· {TEAM_ROLES[m.role].label} · {m.skill > 70 ? 'muy competente' : m.skill > 55 ? 'competente' : 'en formación'}</span><span className="block text-[11px] text-ink-500">{TEAM_ROLES[m.role].desc}</span></span>
            <span className="font-mono text-xs text-ink-300">{m.salary.toFixed(1)} MM$/sem</span>
            <button className="btn btn-ghost px-2 text-red-300" aria-label={`Prescindir de ${m.name}`} onClick={() => { if (confirm(`¿Prescindir de ${m.name}?`)) act({ type: 'despedir', memberId: m.id }); }}><X size={14} /></button>
          </li>
        ))}</ul>
      )}
      {team.length > 0 && <p className="mt-2 text-xs text-ink-400">Costo semanal del equipo: <b className="font-mono">{cost.toFixed(1)} MM$</b>. Si no puedes pagar, la persona se va.</p>}
    </Panel>
  );
}
