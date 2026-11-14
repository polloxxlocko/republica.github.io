import { useEffect, useState } from 'react';
import { PieChart, BarChart3, Building2, CalendarClock, FastForward, Flag, Landmark, LayoutDashboard, Map, Newspaper, Play, Save, SkipForward, Route, Vote, X, Zap, History as HistoryIcon } from 'lucide-react';
import { useGame, type Screen } from '../stores/gameStore';
import { MainMenu } from '../screens/MainMenu';
import { NewGame } from '../screens/NewGame';
import { CareerCenter } from '../screens/CareerCenter';
import { Actions } from '../screens/Actions';
import { MapScreen } from '../screens/MapScreen';
import { Parties } from '../screens/Parties';
import { Congress } from '../screens/Congress';
import { Elections } from '../screens/Elections';
import { Career } from '../screens/Career';
import { Government } from '../screens/Government';
import { EconomyScreen } from '../screens/EconomyScreen';
import { MediaScreen } from '../screens/MediaScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { GameMenu } from '../screens/GameMenu';
import { ElectionNight } from '../screens/ElectionNight';
import { Credits } from '../screens/Credits';
import { PollingDashboard } from '../screens/PollingDashboard';
import { dateLabel, mainOffice, nextElectionInfo, partyColor, partyShort, playerChar, mm } from './selectors';
import { officeLabel } from '../game/systems/characters';
import { Portrait } from '../components/ui';
import { DecisionModal } from '../components/DecisionModal';
import { CharacterSheet } from '../components/CharacterSheet';
import { Tutorial } from '../components/Tutorial';
import { careerContext } from '../game/career/stage';

const NAV: { id: Screen; label: string; icon: typeof Map }[] = [
  { id: 'panel', label: 'Inicio', icon: LayoutDashboard },
  { id: 'carrera', label: 'Carrera', icon: Route },
  { id: 'acciones', label: 'Acciones', icon: Zap },
  { id: 'mapa', label: 'Territorio', icon: Map },
  { id: 'partidos', label: 'Partidos', icon: Flag },
  { id: 'congreso', label: 'Congreso', icon: Landmark },
  { id: 'elecciones', label: 'Elecciones', icon: Vote },
  { id: 'gobierno', label: 'Gobierno', icon: Building2 },
  { id: 'economia', label: 'Economía', icon: BarChart3 },
  { id: 'encuestas', label: 'Encuestas', icon: PieChart },
  { id: 'noticias', label: 'Noticias', icon: Newspaper },
  { id: 'historial', label: 'Historial', icon: HistoryIcon },
  { id: 'partida', label: 'Partida', icon: Save },
];

function Toasts() {
  const { toasts, dismissToast } = useGame();
  return (
    <div className="pointer-events-none fixed bottom-20 right-3 z-50 flex w-[min(380px,calc(100vw-24px))] flex-col gap-2 lg:bottom-4" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`rise pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg backdrop-blur ${t.tone === 'error' ? 'border-red-500/60 bg-red-950/90' : t.tone === 'warn' ? 'border-amber-500/60 bg-amber-950/90' : t.tone === 'ok' ? 'border-emerald-500/50 bg-emerald-950/90' : 'border-ink-600 bg-ink-800/95'}`}>
          <span className="flex-1">{t.text}</span>
          <button className="text-ink-400 hover:text-ink-100" onClick={() => dismissToast(t.id)} aria-label="Cerrar aviso"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function TopBar() {
  const { game: g, advance, busy, progress, setScreen } = useGame();
  if (!g) return null;
  const c = playerChar(g);
  const ne = nextElectionInfo(g);
  const pending = g.pending.length;
  return (
    <header className="sticky top-0 z-30 border-b border-ink-700/80 bg-ink-950">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 lg:px-5 2xl:flex-nowrap">
        <div className="flex items-center gap-2">
          <span className="font-display text-xl font-semibold tracking-tight text-ink-50">República<span className="text-burgundy">:</span></span>
          <span className="font-display text-xl font-semibold tracking-tight text-ink-50">Chile</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CalendarClock size={16} className="text-ink-400" aria-hidden />
          <span className="font-medium" data-testid="fecha">{dateLabel(g)}</span>
          <span className="text-ink-400">· semana {g.week}</span>
        </div>
        <button className="hidden items-center gap-2 2xl:flex" onClick={() => setScreen('panel')} title="Tu personaje">
          <Portrait name={`${c.firstName} ${c.lastName}`} color={partyColor(g, c.partyId)} size={26} />
          <span className="text-sm"><span className="font-semibold">{c.firstName} {c.lastName.split(' ')[0]}</span> <span className="text-ink-400">· {officeLabel(mainOffice(c), c.gender)} · {partyShort(g, c.partyId)}</span></span>
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
          <span title="Recursos políticos (millones de pesos)"><span className="text-ink-400">Rec.</span> <b className="font-mono">{mm(g.player.personalFunds)}</b></span>
          <span title="Puntos de acción de esta semana" data-testid="pa"><span className="text-ink-400">PA</span> <b className="font-mono text-ink-50">{g.player.actionPoints}/{g.player.maxActionPoints}</b></span>
          {ne && <span className="hidden xl:inline" title="Próxima elección"><span className="text-ink-400">{ne.label}:</span> <b className="font-mono">{ne.weeks} sem.</b></span>}
          {g.career.opportunities.length > 0 && <button className="chip border-gold-500/60 text-gold-300" onClick={() => setScreen('carrera')} data-testid="chip-oportunidades">{g.career.opportunities.length} oportunidad{g.career.opportunities.length > 1 ? 'es' : ''}</button>}
          {pending > 0 && <button className="chip border-amber-500/60 text-amber-300" onClick={() => setScreen('panel')}>{pending} decisión{pending > 1 ? 'es' : ''}</button>}
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn btn-primary" disabled={busy} onClick={() => advance(1)} data-testid="avanzar" aria-label="Avanzar una semana"><Play size={15} /> Semana</button>
          <button className="btn" disabled={busy} onClick={() => advance(4)} aria-label="Avanzar cuatro semanas"><FastForward size={15} /> 4</button>
          <button className="btn" disabled={busy} onClick={() => advance(26)} title="Avanza hasta 26 semanas; se detiene ante decisiones o elecciones" aria-label="Avanzar hasta un evento"><SkipForward size={15} /> Evento</button>
        </div>
      </div>
      {busy && <div className="h-0.5 bg-gold-500 transition-all" style={{ width: `${Math.max(5, progress * 100)}%` }} />}
    </header>
  );
}

function Nav() {
  const { game, screen, setScreen } = useGame();
  // Agrupación por prioridad de la etapa de carrera: lo personal primero; lo nacional crece con el alcance.
  const ctx = game ? careerContext(game) : null;
  const byId = Object.fromEntries(NAV.map((n) => [n.id, n]));
  const own: Screen[] = ['panel', 'carrera', 'acciones', 'mapa'];
  const national: Screen[] = ctx?.shows.government ? ['gobierno', 'encuestas', 'congreso', 'economia', 'partidos', 'elecciones', 'noticias']
    : ctx?.shows.institutional ? ['congreso', 'partidos', 'elecciones', 'encuestas', 'noticias', 'gobierno', 'economia']
    : ['partidos', 'elecciones', 'encuestas', 'noticias', 'congreso', 'gobierno', 'economia'];
  const groups: { label: string; ids: Screen[] }[] = [
    { label: 'Tu carrera', ids: own },
    { label: 'Política nacional', ids: national },
    { label: 'Archivo', ids: ['historial', 'partida'] },
  ];
  return (
    <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-ink-600 bg-ink-950 px-2 py-1.5 scroll-thin lg:sticky lg:top-[57px] lg:inset-auto lg:h-[calc(100vh-57px)] lg:w-52 lg:shrink-0 lg:flex-col lg:gap-0 lg:overflow-y-auto lg:border-r lg:border-t-0 lg:px-3 lg:py-5">
      {groups.map((gr) => (
        <div key={gr.label} className="flex shrink-0 gap-1 lg:mb-5 lg:flex-col lg:gap-0.5">
          <div className="eyebrow hidden px-3 pb-1 lg:block">{gr.label}</div>
          {gr.ids.map((id) => {
            const n = byId[id]; const Icon = n.icon; const on = screen === n.id;
            return (
              <button key={n.id} onClick={() => setScreen(n.id)} aria-current={on ? 'page' : undefined}
                className={`relative flex shrink-0 flex-col items-center gap-0.5 rounded px-2.5 py-1.5 text-[11px] lg:flex-row lg:gap-2.5 lg:px-3 lg:py-1.5 lg:text-sm ${on ? 'bg-ink-800 font-semibold text-burgundy before:absolute before:inset-y-1 before:left-0 before:hidden before:w-[3px] before:rounded-full before:bg-burgundy lg:before:block' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-50'}`}>
                <Icon size={16} aria-hidden /> {n.label}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

const VALID: Screen[] = ['panel', 'carrera', 'acciones', 'mapa', 'partidos', 'congreso', 'elecciones', 'gobierno', 'economia', 'noticias', 'historial', 'partida', 'noche', 'creditos', 'encuestas'];

export default function App() {
  const { game, screen, setScreen, refreshSaves } = useGame();
  const [, force] = useState(0);
  useEffect(() => { void refreshSaves(); }, [refreshSaves]);
  // Navegación por hash (compatible con GitHub Pages, sin rutas de servidor)
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace(/^#\/?/, '') as Screen;
      const st = useGame.getState();
      if (st.game && VALID.includes(h) && h !== st.screen) useGame.setState({ screen: h });
      if (!st.game && (h === 'menu' || h === 'nuevo' || h === 'creditos') && h !== st.screen) useGame.setState({ screen: h });
      force((x) => x + 1);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { if (!game && screen !== 'menu' && screen !== 'nuevo' && screen !== 'creditos') setScreen('menu'); }, [game, screen, setScreen]);

  if (!game) {
    return (
      <div className="min-h-full">
        {screen === 'nuevo' ? <NewGame /> : screen === 'creditos' ? <Credits /> : <MainMenu />}
        <Toasts />
      </div>
    );
  }
  let body;
  switch (screen) {
    case 'carrera': body = <Career />; break;
    case 'acciones': body = <Actions />; break;
    case 'mapa': body = <MapScreen />; break;
    case 'partidos': body = <Parties />; break;
    case 'congreso': body = <Congress />; break;
    case 'elecciones': body = <Elections />; break;
    case 'gobierno': body = <Government />; break;
    case 'economia': body = <EconomyScreen />; break;
    case 'noticias': body = <MediaScreen />; break;
    case 'historial': body = <HistoryScreen />; break;
    case 'partida': body = <GameMenu />; break;
    case 'noche': body = <ElectionNight />; break;
    case 'creditos': body = <Credits />; break;
    case 'encuestas': body = <PollingDashboard />; break;
    default: body = <CareerCenter />;
  }
  return (
    <div className="flex min-h-full flex-col">
      <TopBar />
      <div className="flex flex-1">
        <Nav />
        <main className="min-w-0 flex-1 px-3 pb-24 pt-4 lg:px-6 lg:pb-8" id="contenido">{body}</main>
      </div>
      <DecisionModal />
      <CharacterSheet />
      <Tutorial />
      <Toasts />
    </div>
  );
}
