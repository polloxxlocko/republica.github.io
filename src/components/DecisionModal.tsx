import { AlertTriangle } from 'lucide-react';
import { useGame } from '../stores/gameStore';

/** Decisiones pendientes: se muestran como diálogo modal accesible. */
export function DecisionModal() {
  const { game, act, screen } = useGame();
  if (!game || game.pending.length === 0 || screen === 'noche') return null;
  const d = game.pending[0];
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="decision-title">
      <div className="panel rise w-full max-w-xl">
        <div className="panel-h">
          <div className="flex items-center gap-2"><AlertTriangle size={18} className="text-amber-400" aria-hidden /><span className="eyebrow">Decisión · vence en {d.expiresWeek - game.week + 1} sem.</span></div>
          {game.pending.length > 1 && <span className="text-xs text-ink-400">+{game.pending.length - 1} pendiente(s)</span>}
        </div>
        <div className="p-5">
          <h2 id="decision-title" className="font-display text-xl font-semibold">{d.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-300">{d.description}</p>
          <div className="mt-4 grid gap-2">
            {d.options.map((o, i) => (
              <button key={o.id} autoFocus={i === 0} className="rounded-lg border border-ink-600 bg-ink-800 p-3 text-left transition hover:border-gold-500 hover:bg-ink-700" onClick={() => act({ type: 'resolver_decision', decisionId: d.id, optionId: o.id })}>
                <div className="font-semibold">{o.label}</div>
                <div className="text-xs text-ink-400">{o.hint}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
