import { useGame } from '../stores/gameStore';

const STEPS = [
  { title: 'Bienvenida a REPÚBLICA: CHILE', text: 'Esta es la historia de tu carrera política. Empiezas sin cargo. Cada turno es una semana y tus puntos de acción (PA) son limitados: elige en Acciones dónde invertir tu tiempo (comunidad, partido, medios, preparación). Repetir lo mismo rinde cada vez menos.' },
  { title: 'El país está vivo', text: 'Los partidos, parlamentarios y el gobierno actúan por su cuenta. Las encuestas son estimaciones con error: no muestran la intención de voto real.' },
  { title: 'Hacer carrera', text: 'En Carrera verás tu capital político, las oportunidades que surgen (aceptar, rechazar o negociar tiene consecuencias), y los procesos de nominación: aspirar no es ser candidato/a. Tu partido decide entre aspirantes según arraigo, influencia, respaldos e imagen.' },
  { title: 'Instituciones', text: 'En Congreso verás el hemiciclo y los proyectos. Puedes negociar votos con partidos y parlamentarios: nadie vota solo por disciplina.' },
  { title: 'Avanzar el tiempo', text: 'Usa “Semana”, “4” o “Evento” (avanza hasta una decisión o elección). La partida se guarda sola cada 4 semanas; puedes exportarla desde Partida.' },
];

export function Tutorial() {
  const { game, setTutorial } = useGame();
  if (!game) return null;
  const step = game.player.tutorialStep;
  if (step >= STEPS.length) return null;
  const s = STEPS[step];
  return (
    <div className="fixed bottom-24 left-3 z-40 w-[min(360px,calc(100vw-24px))] lg:bottom-4 lg:left-56" role="dialog" aria-label="Tutorial">
      <div className="panel rise border-gold-500/40 p-4">
        <div className="eyebrow">Tutorial · {step + 1}/{STEPS.length}</div>
        <h3 className="mt-1 font-display text-base font-semibold">{s.title}</h3>
        <p className="mt-1 text-sm text-ink-300">{s.text}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setTutorial(STEPS.length)}>Omitir</button>
          <button className="btn btn-primary" onClick={() => setTutorial(step + 1)}>{step + 1 === STEPS.length ? 'Comenzar' : 'Siguiente'}</button>
        </div>
      </div>
    </div>
  );
}
