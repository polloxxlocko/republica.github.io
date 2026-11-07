import { HISTORICAL_SOURCES, REAL_DATA_CONSULTED } from '../data/characters/historicalSources';
import { COVERAGE } from '../data/characters/politicalCareers';
import { SIMULATION_CONVENTIONS } from '../data/characters/realPoliticians';
import { TERRITORIAL_COVERAGE_NOTE } from '../data/characters/territorialAuthorities';
import { useEffect, useRef } from 'react';
import { Download, LogOut, Save, Trash2, Upload } from 'lucide-react';
import { useGame } from '../stores/gameStore';
import { Panel } from '../components/ui';
import { DIFFICULTY } from '../game/rules/params';
import { formatShort } from '../game/engine/dates';

export function GameMenu() {
  const { game: g, save, saves, refreshSaves, load, remove, exportSave, importSave, quit, lastSaved } = useGame();
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { void refreshSaves(); }, [refreshSaves]);
  if (!g) return null;
  return (
    <div className="space-y-4">
      <div><div className="eyebrow">Partida</div><h1 className="font-display text-2xl font-bold">{g.name}</h1></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Guardar y compartir">
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => save('manual')} data-testid="guardar"><Save size={15} /> Guardar ahora</button>
            <button className="btn" onClick={() => exportSave()}><Download size={15} /> Exportar JSON</button>
            <button className="btn" onClick={() => file.current?.click()}><Upload size={15} /> Importar JSON</button>
            <input ref={file} type="file" accept=".json,application/json" className="hidden" aria-label="Archivo de partida" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importSave(f); e.target.value = ''; }} />
            <button className="btn btn-danger" onClick={() => { if (confirm('¿Volver al menú? Se recomienda guardar antes.')) quit(); }}><LogOut size={15} /> Salir al menú</button>
          </div>
          <p className="mt-3 text-sm text-ink-400">Guardado automático cada {g.settings.autosaveEvery} semanas en IndexedDB (este navegador). {lastSaved && `Último guardado: ${lastSaved}.`}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><dt className="text-ink-400">Dificultad</dt><dd>{DIFFICULTY[g.settings.difficulty].label}</dd><dt className="text-ink-400">Semilla</dt><dd className="font-mono">{g.settings.seed}</dd><dt className="text-ink-400">Escenario</dt><dd>{g.scenarioMeta.name}</dd><dt className="text-ink-400">Versión de esquema</dt><dd>{g.schemaVersion}</dd><dt className="text-ink-400">Personajes en memoria</dt><dd>{Object.keys(g.characters).length}</dd></dl>
        </Panel>
        <Panel title="Guardados en este navegador">
          <div className="max-h-80 space-y-1 overflow-y-auto scroll-thin">{saves.map((s) => (
            <div key={s.slot} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-800">
              <button className="min-w-0 flex-1 text-left text-sm" onClick={() => { if (confirm('¿Cargar este guardado? Perderás el progreso no guardado.')) void load(s.slot); }}><div className="truncate">{s.playerName} · {s.office}</div><div className="text-xs text-ink-400">{s.kind === 'auto' ? 'Auto' : 'Manual'} · {formatShort(s.date)} · {(s.size / 1024).toFixed(0)} KB</div></button>
              <button className="btn btn-ghost px-2" onClick={() => exportSave(s.slot)} aria-label="Exportar"><Download size={14} /></button>
              <button className="btn btn-ghost px-2 text-red-300" onClick={() => { if (confirm('¿Eliminar?')) void remove(s.slot); }} aria-label="Eliminar"><Trash2 size={14} /></button>
            </div>
          ))}</div>
        </Panel>
      </div>
      <Panel title="Personas reales: cobertura, fuentes y convenciones">
        <p className="text-sm text-ink-300">El punto de partida incorpora a {Object.values(g.characters).filter((c) => c.realId).length} personas reales con datos de fuentes oficiales consultadas el {REAL_DATA_CONSULTED.split('-').reverse().join('-')}. Lo que ocurre desde el 9-11-2026 es ficción. Las personas que aparecen no respaldan este juego.</p>
        <div className="mt-2 grid gap-3 text-xs sm:grid-cols-2">
          <div><div className="font-semibold text-ink-200">Cobertura verificada</div><ul className="list-disc pl-5 text-ink-400">
            <li>Presidente de la República (SERVEL, segunda votación 2025)</li>
            <li>Diputadas y diputados: {COVERAGE.deputies} de 155 (Cámara, datos abiertos; distrito según SERVEL)</li>
            <li>Senado: {COVERAGE.senators} de 50 (SERVEL 2025; 2021 calculado con votos TRICEL). Sin verificar: {COVERAGE.senateAmbiguousRegions2021.join(', ') || '—'} (ficticios). La militancia de los electos en 2021 es la de esa elección.</li>
            <li>Directivas centrales de los 16 partidos constituidos (SERVEL)</li>
            <li>Ministros confirmados en sitios oficiales: {g.government.cabinet.filter((p) => p.ministerId && g.characters[p.ministerId]?.realId && g.characters[p.ministerId]?.offices.some((o) => o.type === 'ministro' && o.since < 0)).length} de 25 al inicio; el resto, ficticios</li>
            <li>{TERRITORIAL_COVERAGE_NOTE}</li>
          </ul></div>
          <div><div className="font-semibold text-ink-200">Convenciones de simulación</div><ul className="list-disc pl-5 text-ink-400">{SIMULATION_CONVENTIONS.map((x) => <li key={x}>{x}</li>)}</ul></div>
        </div>
        <details className="mt-2 text-xs"><summary className="cursor-pointer text-ink-300">Fuentes ({HISTORICAL_SOURCES.length})</summary><ul className="mt-1 space-y-0.5">{HISTORICAL_SOURCES.map((x) => <li key={x.id}><a className="text-sky-300 hover:underline" href={x.url} target="_blank" rel="noreferrer">{x.institution}: {x.title}</a>{x.published ? <span className="text-ink-500"> · publicado {x.published}</span> : null}</li>)}</ul></details>
      </Panel>
      <Panel title="Aviso y procedencia de los datos">
        <p className="text-sm text-ink-300">{g.scenarioMeta.disclaimer}</p>
        <ul className="mt-3 space-y-2 text-xs text-ink-400">{g.scenarioMeta.provenance.map((p, i) => <li key={i}><b className="text-ink-200">{p.nature}</b> · {p.source} · corte {p.cutoff} · confianza {p.confidence}{p.notes ? ` — ${p.notes}` : ''}</li>)}</ul>
        <p className="mt-3 text-xs text-ink-500">Reglas vigentes en la partida: {g.rules.era}; umbral de diputados {g.rules.deputyThresholdPct}%; voto {g.rules.compulsoryVoting ? 'obligatorio' : 'voluntario'}; segunda vuelta si nadie supera {g.rules.runoffThreshold}%; gobernadores {g.rules.governorThreshold}%.</p>
      </Panel>
    </div>
  );
}
