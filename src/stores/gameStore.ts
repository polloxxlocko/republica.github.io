/**
 * Estado de la aplicación (Zustand). El motor es puro: la tienda solo guarda el GameState
 * vigente, despacha acciones y avanza turnos en trozos para no bloquear la interfaz.
 */
import { create } from 'zustand';
import type { GameState } from '../game/models/types';
import { advanceWeek, dispatch, type PlayerAction } from '../game/engine/game';
import { createScenario } from '../game/scenarios';
import type { NewGameConfig } from '../game/scenarios/chile2026';
import { deleteSave, listSaves, loadGame, saveGame, rawSave, type SaveMeta } from '../persistence/db';
import { deserialize, serialize } from '../persistence/saveFormat';

export type Screen = 'menu' | 'nuevo' | 'panel' | 'carrera' | 'acciones' | 'mapa' | 'partidos' | 'congreso' | 'elecciones' | 'gobierno' | 'economia' | 'noticias' | 'historial' | 'partida' | 'noche' | 'creditos' | 'encuestas';

export interface Toast { id: number; text: string; tone: 'info' | 'ok' | 'warn' | 'error' }

interface Store {
  game: GameState | null;
  screen: Screen;
  busy: boolean;
  progress: number;
  toasts: Toast[];
  saves: SaveMeta[];
  lastSaved: string | null;
  nightResultId: string | null;
  selectedParty: string | null;
  selectedRegion: string | null;
  selectedBill: string | null;
  setScreen: (s: Screen) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  newGame: (cfg: NewGameConfig) => void;
  act: (a: PlayerAction) => string;
  advance: (weeks: number, stopOnEvent?: boolean) => Promise<void>;
  refreshSaves: () => Promise<void>;
  save: (kind?: 'manual' | 'auto') => Promise<void>;
  load: (slot: string) => Promise<void>;
  remove: (slot: string) => Promise<void>;
  exportSave: (slot?: string) => Promise<void>;
  importSave: (file: File) => Promise<void>;
  quit: () => void;
  openNight: (resultId: string) => void;
  select: (k: 'party' | 'region' | 'bill', id: string | null) => void;
  sheetId: string | null;
  openSheet: (id: string | null) => void;
  setTutorial: (step: number) => void;
}

let toastId = 0;
const yieldUI = () => new Promise<void>((r) => setTimeout(r, 0));

function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const useGame = create<Store>((set, get) => ({
  game: null, screen: 'menu', busy: false, progress: 0, toasts: [], saves: [], lastSaved: null, nightResultId: null,
  selectedParty: null, selectedRegion: null, selectedBill: null,
  setScreen: (screen) => { set({ screen }); if (typeof window !== 'undefined') window.location.hash = `/${screen}`; },
  toast: (text, tone = 'info') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
    setTimeout(() => get().dismissToast(id), tone === 'error' ? 7000 : 4500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  newGame: (cfg) => {
    const game = createScenario(cfg);
    set({ game, screen: 'panel' });
    get().setScreen('panel');
    void get().save('auto');
  },
  act: (a) => {
    const g = get().game;
    if (!g) return '';
    const { state, message } = dispatch(g, a);
    set({ game: state });
    if (message) get().toast(message, message.startsWith('No es posible') ? 'warn' : 'ok');
    return message;
  },
  advance: async (weeks, stopOnEvent = true) => {
    const start = get().game;
    if (!start || get().busy) return;
    set({ busy: true, progress: 0 });
    let g = start;
    let newResult: string | null = null;
    try {
      for (let i = 0; i < weeks; i++) {
        const r = advanceWeek(g);
        g = r.state;
        set({ progress: (i + 1) / weeks });
        if (r.newResults.length) newResult = r.newResults[r.newResults.length - 1];
        if (r.newOpportunities.length) get().toast(`Nueva oportunidad: ${g.career.opportunities.find((o) => o.id === r.newOpportunities[0])?.title ?? ''}`, 'warn');
        if (stopOnEvent && (r.newDecisions.length || r.newResults.length || r.newOpportunities.length) && i < weeks - 1) break;
        if (i % 2 === 1) { set({ game: g }); await yieldUI(); }
      }
      set({ game: g });
      for (const m of g.player.lastActionResults) get().toast(m, 'info');
      if (g.week % g.settings.autosaveEvery === 0) await get().save('auto');
      if (newResult) {
        const res = g.results.find((x) => x.id === newResult);
        const playerRan = g.results.some((x) => x.week === g.week && x.playerOutcome?.ran);
        if (res && (playerRan || ['presidencial', 'presidencial_2v', 'diputados'].includes(res.type))) get().openNight(playerRan ? g.results.filter((x) => x.week === g.week && x.playerOutcome?.ran).slice(-1)[0].id : newResult);
        else get().toast('Hay nuevos resultados electorales en la pantalla Elecciones.', 'info');
      }
    } catch (e) {
      console.error(e);
      get().toast(`Error en la simulación: ${(e as Error).message}`, 'error');
    } finally {
      set({ busy: false, progress: 0 });
    }
  },
  refreshSaves: async () => { try { set({ saves: await listSaves() }); } catch (e) { get().toast(`No se pudo leer el almacenamiento: ${(e as Error).message}`, 'error'); } },
  save: async (kind = 'manual') => {
    const g = get().game; if (!g) return;
    try { await saveGame(g, kind); set({ lastSaved: new Date().toLocaleTimeString('es-CL') }); if (kind === 'manual') get().toast('Partida guardada.', 'ok'); await get().refreshSaves(); }
    catch (e) { get().toast(`No se pudo guardar: ${(e as Error).message}`, 'error'); }
  },
  load: async (slot) => {
    try { const game = await loadGame(slot); set({ game }); get().setScreen('panel'); get().toast('Partida cargada.', 'ok'); }
    catch (e) { get().toast(`No se pudo cargar: ${(e as Error).message}`, 'error'); }
  },
  remove: async (slot) => { await deleteSave(slot); await get().refreshSaves(); get().toast('Guardado eliminado.', 'info'); },
  exportSave: async (slot) => {
    let text: string | undefined;
    let name = 'partida';
    if (slot) { text = await rawSave(slot); name = slot; }
    else { const g = get().game; if (g) { text = serialize(g); name = `${g.name}-semana${g.week}`; } }
    if (!text) { get().toast('Nada que exportar.', 'warn'); return; }
    // Asegura el formato con envoltorio aunque provenga de IndexedDB
    download(`republica-chile-${name.replace(/[^a-z0-9-]+/gi, '_')}.json`, text);
  },
  importSave: async (file) => {
    try {
      const text = await file.text();
      const game = deserialize(text);
      set({ game });
      await get().save('manual');
      get().setScreen('panel');
      get().toast('Partida importada correctamente.', 'ok');
    } catch (e) { get().toast(`Importación rechazada: ${(e as Error).message}`, 'error'); }
  },
  quit: () => { set({ game: null }); get().setScreen('menu'); void get().refreshSaves(); },
  sheetId: null,
  openSheet: (id) => set({ sheetId: id }),
  openNight: (resultId) => { set({ nightResultId: resultId }); get().setScreen('noche'); },
  select: (k, id) => set(k === 'party' ? { selectedParty: id } : k === 'region' ? { selectedRegion: id } : { selectedBill: id }),
  setTutorial: (step) => { const g = get().game; if (!g) return; set({ game: { ...g, player: { ...g.player, tutorialStep: step } } }); },
}));
