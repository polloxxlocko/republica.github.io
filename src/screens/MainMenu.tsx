/**
 * PORTADA — «Archivo de Poder». Composición editorial asimétrica: a la izquierda el título y las
 * acciones; a la derecha una fotografía territorial real y verificada, con su crédito visible.
 */
import { useMemo, useRef } from 'react';
import { ArrowRight, Download, Play, Plus, Trash2, Upload } from 'lucide-react';
import { useGame } from '../stores/gameStore';
import { DISCLAIMER } from '../game/scenarios/chile2026';
import { SCENARIOS } from '../game/scenarios';
import { formatShort } from '../game/engine/dates';
import { TERRITORIAL_PHOTOS } from '../data/media/territorialPhotos';
import { TerritorialPhoto } from '../components/TerritorialPhoto';
import type { RegionId } from '../game/models/types';

export function MainMenu() {
  const { saves, load, remove, exportSave, importSave, setScreen } = useGame();
  const file = useRef<HTMLInputElement>(null);
  const latest = saves[0];
  // Portada: una fotografía principal distinta cada día (determinista, sin parpadeo entre renders)
  const cover = useMemo(() => {
    const principal = TERRITORIAL_PHOTOS.filter((p) => p.category === 'principal');
    return principal.length ? principal[Math.floor(Date.now() / 86_400_000) % principal.length] : null;
  }, []);
  return (
    <div className="mx-auto grid min-h-full max-w-[1440px] gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12 lg:py-14">
      <section className="rise flex flex-col">
        <div className="kicker">Archivo de poder · Escenario Chile 2026</div>
        <h1 className="mt-4 font-display text-[clamp(2.75rem,6vw,4.5rem)] font-semibold leading-[0.95] tracking-tight text-ink-50">
          República<span className="text-burgundy">:</span><br />Chile
        </h1>
        <p className="mt-5 max-w-md font-serif text-lg leading-relaxed text-ink-200">
          Una carrera política en la República real: desde una comuna hasta La Moneda, con instituciones, partidos y territorios que no esperan por ti.
        </p>

        <div className="mt-8 grid max-w-md gap-2">
          {latest && (
            <button className="btn btn-primary justify-between py-3 text-base" onClick={() => load(latest.slot)}>
              <span className="flex items-center gap-2"><Play size={18} aria-hidden /> Continuar</span>
              <span className="truncate text-sm font-normal opacity-90">{latest.playerName} · {formatShort(latest.date)}</span>
            </button>
          )}
          <button className={`btn ${latest ? '' : 'btn-primary'} justify-between py-3 text-base`} onClick={() => setScreen('nuevo')} data-testid="nueva-partida">
            <span className="flex items-center gap-2"><Plus size={18} aria-hidden /> Nueva carrera</span><ArrowRight size={16} aria-hidden />
          </button>
          <button className="btn justify-start py-3 text-base" onClick={() => file.current?.click()}><Upload size={18} aria-hidden /> Importar partida (.json)</button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" aria-label="Archivo de partida" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importSave(f); e.target.value = ''; }} />
          <button className="btn-link mt-1 min-h-[36px] self-start" onClick={() => setScreen('creditos')}>Créditos, fuentes y licencias</button>
        </div>

        {saves.length > 0 && (
          <div className="mt-8 max-w-md">
            <div className="eyebrow mb-2 flex items-center justify-between"><span>Expedientes guardados</span><span className="font-mono normal-case tracking-normal text-ink-400">{saves.length}</span></div>
            <ul className="divide-y divide-ink-700 border-y border-ink-700">
              {saves.slice(0, 6).map((s) => (
                <li key={s.slot} className="flex items-center gap-2 py-2">
                  <button className="min-w-0 flex-1 text-left" onClick={() => load(s.slot)}>
                    <div className="truncate text-sm font-medium text-ink-100">{s.playerName} <span className="font-normal text-ink-400">· {s.office} · {s.party}</span></div>
                    <div className="font-mono text-[11px] text-ink-400">{s.kind === 'auto' ? 'auto' : 'manual'} · {formatShort(s.date)} · {new Date(s.savedAt).toLocaleDateString('es-CL')}</div>
                  </button>
                  <button className="btn btn-ghost min-h-[36px] px-2" onClick={() => exportSave(s.slot)} aria-label={`Exportar ${s.playerName}`}><Download size={15} /></button>
                  <button className="btn btn-ghost min-h-[36px] px-2 text-red-300" onClick={() => { if (confirm('¿Eliminar este guardado?')) void remove(s.slot); }} aria-label={`Eliminar ${s.playerName}`}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-12">
          <div className="eyebrow mb-2">Escenarios</div>
          <ul className="space-y-1 text-sm">
            {SCENARIOS.map((s) => (
              <li key={s.id} className="flex items-baseline gap-2"><span className={`h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full ${s.available ? 'bg-emerald-400' : 'bg-ink-500'}`} aria-hidden /><span><b className="font-medium text-ink-100">{s.name}</b> <span className="text-ink-400">— {s.available ? s.description : 'próximamente: requiere datos verificados'}</span></span></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rise flex flex-col gap-4" aria-label="Fotografía de portada">
        {cover ? (
          <TerritorialPhoto photo={cover} regionId={cover.regionId as RegionId} cut={cover.comunaCut} priority ratio="4/3" className="lg:sticky lg:top-8" />
        ) : null}
        <p className="max-w-2xl text-xs leading-relaxed text-ink-400">{DISCLAIMER} Los partidos e instituciones se representan con fines lúdicos y educativos; sus atributos en el juego son estimaciones de balance.</p>
      </section>
    </div>
  );
}
