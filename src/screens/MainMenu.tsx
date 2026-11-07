import { useRef } from 'react';
import { Download, FolderOpen, Play, Plus, Trash2, Upload } from 'lucide-react';
import { useGame } from '../stores/gameStore';
import { DISCLAIMER } from '../game/scenarios/chile2026';
import { SCENARIOS } from '../game/scenarios';
import { formatShort } from '../game/engine/dates';

export function MainMenu() {
  const { saves, load, remove, exportSave, importSave, setScreen } = useGame();
  const file = useRef<HTMLInputElement>(null);
  const latest = saves[0];
  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center px-4 py-10">
      <div className="rise text-center">
        <div className="eyebrow">Simulador político · Estrategia · Instituciones</div>
        <h1 className="mt-3 font-display text-5xl font-bold tracking-tight text-ink-100 sm:text-6xl">REPÚBLICA<span className="text-gold-400">:</span> CHILE</h1>
        <p className="mx-auto mt-4 max-w-2xl text-ink-300">Construye una carrera política, dirige un partido, negocia en el Congreso y gobierna. Un ecosistema político vivo donde cada partida escribe una historia distinta.</p>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-[1fr_1.2fr]">
        <div className="panel p-5">
          <div className="grid gap-2">
            <button className="btn btn-primary py-3 text-base" onClick={() => setScreen('nuevo')} data-testid="nueva-partida"><Plus size={18} /> Nueva partida</button>
            <button className="btn py-3 text-base" disabled={!latest} onClick={() => latest && load(latest.slot)}><Play size={18} /> Continuar {latest ? `(${latest.playerName})` : ''}</button>
            <button className="btn py-3 text-base" onClick={() => file.current?.click()}><Upload size={18} /> Importar partida (.json)</button>
            <input ref={file} type="file" accept="application/json,.json" className="hidden" aria-label="Archivo de partida" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importSave(f); e.target.value = ''; }} />
          </div>
          <div className="mt-5 border-t border-ink-700 pt-4">
            <div className="eyebrow mb-2">Escenarios</div>
            <ul className="space-y-1.5 text-sm">
              {SCENARIOS.map((s) => (
                <li key={s.id} className="flex items-start gap-2"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${s.available ? 'bg-emerald-400' : 'bg-ink-600'}`} /><span><b>{s.name}</b> <span className="text-ink-400">— {s.available ? s.description : 'próximamente: requiere datos verificados'}</span></span></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="panel">
          <div className="panel-h"><h2 className="panel-t">Partidas guardadas</h2><FolderOpen size={16} className="text-ink-400" /></div>
          <div className="max-h-[360px] overflow-y-auto p-2 scroll-thin">
            {saves.length === 0 && <p className="p-4 text-sm text-ink-400">Aún no hay partidas guardadas en este navegador.</p>}
            {saves.map((s) => (
              <div key={s.slot} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-ink-800">
                <button className="min-w-0 flex-1 text-left" onClick={() => load(s.slot)}>
                  <div className="truncate font-medium">{s.playerName} <span className="text-ink-400">· {s.office} · {s.party}</span></div>
                  <div className="text-xs text-ink-400">{s.kind === 'auto' ? 'Autoguardado' : 'Manual'} · en juego {formatShort(s.date)} · guardado {new Date(s.savedAt).toLocaleString('es-CL')}</div>
                </button>
                <button className="btn btn-ghost px-2" onClick={() => exportSave(s.slot)} aria-label="Exportar"><Download size={15} /></button>
                <button className="btn btn-ghost px-2 text-red-300" onClick={() => { if (confirm('¿Eliminar este guardado?')) void remove(s.slot); }} aria-label="Eliminar"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-ink-500">{DISCLAIMER} Los partidos e instituciones se representan con fines lúdicos y educativos; sus atributos en el juego son estimaciones de balance.</p>
    </div>
  );
}
