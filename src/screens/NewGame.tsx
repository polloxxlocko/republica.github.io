import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Dices } from 'lucide-react';
import { useGame } from '../stores/gameStore';
import type { Attributes, Difficulty, Dim, PolicyArea, RegionId } from '../game/models/types';
import { CONSTITUTED_PARTIES } from '../game/data/parties';
import { REGIONS } from '../game/data/geography';
import { COMUNAS } from '../game/territory/data';
import { AREA_LABELS, DIFFICULTY, DIMS, DIM_LABELS } from '../game/rules/params';
import { EDUCATION, ORGANIZATIONS, PROFESSIONS, TRAITS, type Education, type PlayerConfig, type Profession } from '../game/scenarios/chile2026';
import { IdeologyBars, Panel } from '../components/ui';
import { leftRight } from '../game/systems/util';

const ATTR_LABELS: Record<keyof Attributes, string> = {
  carisma: 'Carisma', oratoria: 'Oratoria', negociacion: 'Negociación', tecnico: 'Conocimiento técnico', liderazgo: 'Liderazgo', disciplina: 'Disciplina',
  ambicion: 'Ambición', integridad: 'Integridad', comunicacion: 'Comunicación', redes: 'Redes políticas', gestion: 'Gestión', experiencia: 'Experiencia',
};
const POOL = 12;
const GOALS = ['Servir a mi comuna', 'Llegar al Congreso', 'Gobernar mi región', 'Liderar mi partido', 'Construir una nueva fuerza política', 'Dejar un legado de reformas', 'Llegar algún día a La Moneda'];

export function NewGame() {
  const { newGame, setScreen } = useGame();
  const [step, setStep] = useState(0);
  const [cfg, setCfg] = useState<PlayerConfig>({
    firstName: '', lastName: '', gender: 'f', age: 23, regionId: 'RM', comuna: 'Santiago', profession: 'estudiante', education: 'universitaria_curso', experience: 'ninguna',
    partyId: 'PS', ideologyOffset: {}, goal: GOALS[0], startRole: 'militante', attrPoints: {}, traits: [], interests: [], organization: null,
  });
  const [affil, setAffil] = useState<'partido' | 'independiente' | 'organizacion'>('partido');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [partyFilter, setPartyFilter] = useState('');
  const set = <K extends keyof PlayerConfig>(k: K, v: PlayerConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const used = Object.values(cfg.attrPoints).reduce((a, b) => a + (b ?? 0), 0);
  const party = affil === 'partido' ? CONSTITUTED_PARTIES.find((p) => p.id === cfg.partyId) : undefined;
  const ideology = useMemo(() => {
    const base = party ? { ...party.ideology } : { eco: 0, val: 0, seg: 0, inst: 0, amb: 0, soc: 0, ord: 0, lab: 0 };
    for (const d of DIMS) base[d] = Math.max(-100, Math.min(100, base[d] + (cfg.ideologyOffset[d] ?? 0)));
    return base;
  }, [party, cfg.ideologyOffset]);
  const comunas = COMUNAS.filter((c) => c.region === cfg.regionId).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const valid = [!!(cfg.firstName.trim() && cfg.lastName.trim() && cfg.age >= 18 && cfg.age <= 70 && comunas.some((c) => c.name === cfg.comuna)), true, affil !== 'organizacion' || !!cfg.organization, true];
  const steps = ['Identidad', 'Origen', 'Ideas y afiliación', 'Partida'];
  const toggle = (k: 'traits' | 'interests', v: string, max: number) => { const cur = cfg[k] ?? []; set(k, cur.includes(v) ? cur.filter((x) => x !== v) : cur.length >= max ? cur : [...cur, v]); };

  const start = () => newGame({ name: `${cfg.firstName} ${cfg.lastName}`.trim(), seed, difficulty, scenarioId: 'chile2026', player: { ...cfg, startRole: 'militante', partyId: affil === 'partido' ? cfg.partyId : null, organization: affil === 'independiente' ? cfg.organization ?? null : cfg.organization } });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <button className="btn btn-ghost mb-4" onClick={() => setScreen('menu')}><ArrowLeft size={16} /> Menú</button>
      <div className="eyebrow">Nueva partida · Chile 2026</div>
      <h1 className="font-display text-3xl font-bold">Crea tu personaje político</h1>
      <ol className="mt-5 flex flex-wrap gap-2" aria-label="Pasos">
        {steps.map((s, i) => (
          <li key={s}><button className={`chip ${i === step ? 'border-gold-500 text-gold-300' : ''}`} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>{i + 1}. {s}</button></li>
        ))}
      </ol>

      <div className="mt-5">
        {step === 0 && (
          <Panel title="Identidad">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">Nombre<input className="input mt-1" value={cfg.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="Ej.: Valentina" data-testid="nombre" /></label>
              <label className="text-sm">Apellidos<input className="input mt-1" value={cfg.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Ej.: Rojas Medina" data-testid="apellido" /></label>
              <label className="text-sm">Género (para tratamientos)<select className="input mt-1" value={cfg.gender} onChange={(e) => set('gender', e.target.value as 'f' | 'm')}><option value="f">Femenino</option><option value="m">Masculino</option></select></label>
              <label className="text-sm">Edad<input type="number" min={18} max={70} className="input mt-1" value={cfg.age} onChange={(e) => set('age', Number(e.target.value))} data-testid="edad" /></label>
              <label className="text-sm">Región de origen y residencia
                <select className="input mt-1" value={cfg.regionId} onChange={(e) => { const r = e.target.value as RegionId; set('regionId', r); set('comuna', COMUNAS.filter((c) => c.region === r).sort((a, b) => b.electors - a.electors)[0]?.name ?? ''); }}>
                  {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <label className="text-sm">Comuna de residencia
                <select className="input mt-1" value={cfg.comuna} onChange={(e) => set('comuna', e.target.value)} data-testid="comuna">{comunas.map((c) => <option key={c.cut} value={c.name}>{c.name}</option>)}</select>
              </label>
            </div>
            <p className="mt-3 text-xs text-ink-400">Empiezas como ciudadano/a sin cargo. Tu comuna y región definen dónde puedes postular (requisito de residencia) y dónde tienes arraigo inicial. Edad mínima legal: 18 años para cargos locales, 21 para diputado/a y 35 para senador/a y Presidente/a.</p>
          </Panel>
        )}

        {step === 1 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Formación y ocupación">
              <label className="text-sm">Educación
                <select className="input mt-1" value={cfg.education} onChange={(e) => set('education', e.target.value as Education)}>
                  {Object.entries(EDUCATION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
              <label className="mt-3 block text-sm">Ocupación inicial
                <select className="input mt-1" value={cfg.profession} onChange={(e) => set('profession', e.target.value as Profession)} data-testid="ocupacion">
                  {Object.entries(PROFESSIONS).map(([k, v]) => <option key={k} value={k}>{v.label} ({Object.entries(v.bonus).map(([a, b]) => `${ATTR_LABELS[a as keyof Attributes]} +${b}`).join(', ')})</option>)}
                </select>
              </label>
              <fieldset className="mt-4">
                <legend className="text-sm">Experiencia previa (limitada)</legend>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(['ninguna', 'local'] as const).map((x) => (
                    <button key={x} className={`btn ${cfg.experience === x ? 'border-gold-500 text-gold-300' : ''}`} onClick={() => set('experience', x)} aria-pressed={cfg.experience === x}>{x === 'ninguna' ? 'Ninguna' : 'Dirigencia estudiantil o vecinal'}</button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="mt-4">
                <legend className="text-sm">Rasgos personales (hasta 2)</legend>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {Object.entries(TRAITS).map(([k, t]) => (
                    <button key={k} className={`rounded-lg border p-2 text-left text-xs ${cfg.traits?.includes(k) ? 'border-gold-500 bg-ink-800' : 'border-ink-700'}`} onClick={() => toggle('traits', k, 2)} aria-pressed={cfg.traits?.includes(k)}>
                      <b className="text-sm">{t.label}</b><span className="block text-ink-400">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            </Panel>
            <div className="space-y-4">
              <Panel title={`Atributos · puntos libres ${POOL - used}/${POOL}`}>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {(Object.keys(ATTR_LABELS) as (keyof Attributes)[]).filter((k) => k !== 'experiencia').map((k) => {
                    const v = cfg.attrPoints[k] ?? 0;
                    return (
                      <div key={k} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{ATTR_LABELS[k]}</span>
                        <span className="flex items-center gap-1">
                          <button className="btn px-2 py-0.5" disabled={v <= 0} onClick={() => set('attrPoints', { ...cfg.attrPoints, [k]: v - 2 })} aria-label={`Restar ${ATTR_LABELS[k]}`}>−</button>
                          <span className="w-6 text-center font-mono">{v}</span>
                          <button className="btn px-2 py-0.5" disabled={used >= POOL || v >= 6} onClick={() => set('attrPoints', { ...cfg.attrPoints, [k]: v + 2 })} aria-label={`Sumar ${ATTR_LABELS[k]}`}>+</button>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-ink-400">La experiencia no se compra: se gana ejerciendo. Los atributos influyen en resultados concretos, pero nunca garantizan el éxito.</p>
              </Panel>
              <Panel title="Intereses políticos (hasta 3)">
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(AREA_LABELS) as PolicyArea[]).map((a) => (
                    <button key={a} className={`chip ${cfg.interests?.includes(a) ? 'border-gold-500 text-gold-300' : ''}`} onClick={() => toggle('interests', a, 3)} aria-pressed={cfg.interests?.includes(a)}>{AREA_LABELS[a]}</button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-400">Orientan las oportunidades que te llegan (cargos sectoriales, causas, organizaciones).</p>
              </Panel>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <Panel title="Afiliación inicial" right={affil === 'partido' ? <input className="input w-40" placeholder="Filtrar…" value={partyFilter} onChange={(e) => setPartyFilter(e.target.value)} aria-label="Filtrar partidos" /> : undefined}>
              <div className="mb-3 grid grid-cols-3 gap-2">
                {([['partido', 'Militante de un partido', 'Base orgánica, pero debes ganarte un lugar'], ['independiente', 'Independiente', 'Libertad; menos apoyo para competir'], ['organizacion', 'Organización comunitaria', 'Arraigo local desde la sociedad civil']] as const).map(([k, l, d]) => (
                  <button key={k} className={`rounded-lg border p-2 text-left text-xs ${affil === k ? 'border-gold-500 bg-ink-800' : 'border-ink-700'}`} onClick={() => { setAffil(k); if (k === 'organizacion' && !cfg.organization) set('organization', 'junta_vecinos'); if (k === 'partido' && !cfg.partyId) set('partyId', 'PS'); }} aria-pressed={affil === k} data-testid={`afiliacion-${k}`}>
                    <b className="text-sm">{l}</b><span className="block text-ink-400">{d}</span>
                  </button>
                ))}
              </div>
              {affil !== 'partido' && (
                <label className="mb-3 block text-sm">Organización comunitaria {affil === 'independiente' ? '(opcional)' : ''}
                  <select className="input mt-1" value={cfg.organization ?? ''} onChange={(e) => set('organization', e.target.value || null)}>
                    {affil === 'independiente' && <option value="">Ninguna</option>}
                    {Object.entries(ORGANIZATIONS).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
                  </select>
                </label>
              )}
              {affil === 'partido' && <p className="mb-2 text-xs text-ink-400">Entras como militante de base: no presides nada ni tienes cupo asegurado.</p>}
              {affil === 'partido' && <div className="grid gap-2 sm:grid-cols-2">
                {[...CONSTITUTED_PARTIES].sort((a, b) => leftRight(a.ideology) - leftRight(b.ideology)).filter((p) => !partyFilter || `${p.name} ${p.short} ${p.family}`.toLowerCase().includes(partyFilter.toLowerCase())).map((p) => (
                  <button key={p.id} onClick={() => set('partyId', p.id)} aria-pressed={cfg.partyId === p.id} data-testid={`partido-${p.id}`}
                    className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition ${cfg.partyId === p.id ? 'border-gold-500 bg-ink-800' : 'border-ink-700 hover:border-ink-500'}`}>
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: p.color }} />
                    <span><span className="block text-sm font-semibold">{p.name} <span className="text-ink-400">({p.short})</span></span><span className="block text-xs text-ink-400">{p.family}</span></span>
                  </button>
                ))}
              </div>}
            </Panel>
            <Panel title="Tus posiciones">
              <p className="mb-3 text-xs text-ink-400">{affil === 'partido' ? 'Ajusta tus matices respecto de tu partido (±30). Alejarte de su línea genera tensiones internas.' : 'Tus posiciones en cada eje (desde el centro, ±30 en la creación; cambian con tu trayectoria).'}</p>
              <div className="space-y-2">
                {DIMS.map((d: Dim) => (
                  <label key={d} className="block text-xs">
                    <span className="flex justify-between text-ink-300"><span>{DIM_LABELS[d].name}</span><span className="font-mono">{(cfg.ideologyOffset[d] ?? 0) > 0 ? '+' : ''}{cfg.ideologyOffset[d] ?? 0}</span></span>
                    <input type="range" min={-30} max={30} step={5} value={cfg.ideologyOffset[d] ?? 0} onChange={(e) => set('ideologyOffset', { ...cfg.ideologyOffset, [d]: Number(e.target.value) })} className="w-full accent-[#c9a24a]" aria-label={DIM_LABELS[d].name} />
                  </label>
                ))}
              </div>
              <div className="mt-4"><IdeologyBars ideology={ideology} compare={party?.ideology} compareLabel={party ? party.short : undefined} compact /></div>
            </Panel>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Resumen del personaje">
              <div className="space-y-1 text-sm">
                <div><b>{cfg.firstName || '—'} {cfg.lastName}</b>, {cfg.age} años · {cfg.comuna}</div>
                <div className="text-ink-300">{PROFESSIONS[cfg.profession].label} · {EDUCATION[cfg.education ?? 'universitaria'].label}</div>
                <div className="text-ink-300">{affil === 'partido' ? `Militante de ${party?.short ?? '—'}` : affil === 'organizacion' ? `Dirigente de ${ORGANIZATIONS[cfg.organization ?? '']?.label ?? '—'}` : 'Independiente'}</div>
                <div className="text-ink-400">{(cfg.traits ?? []).map((t) => TRAITS[t].label).join(' · ') || 'Sin rasgos destacados'}</div>
              </div>
              <p className="mt-3 rounded border border-gold-500/40 p-2 text-xs text-ink-300" data-testid="aviso-reales">El Chile de partida incluye autoridades y dirigentes <b>reales</b> (Presidente, Congreso, directivas de partidos, algunos ministros) según registros oficiales al 7-11-2026. Desde el inicio de la partida, todo lo que hagan o digan es <b>ficción</b>: no son declaraciones ni conductas reales, y no implican respaldo al juego.</p>
              <p className="mt-3 text-xs text-ink-400">No hay árbol de progreso ni ascensos automáticos. Las oportunidades surgen de tus relaciones, tu territorio, tu partido y el contexto. Puedes estancarte, retroceder o subir rápido; la Presidencia es una posibilidad excepcional, no una meta garantizada.</p>
            </Panel>
            <div className="space-y-4">
              <Panel title="Aspiración personal">
                <select className="input" value={cfg.goal} onChange={(e) => set('goal', e.target.value)}>{GOALS.map((g) => <option key={g}>{g}</option>)}</select>
                <p className="mt-2 text-xs text-ink-400">Orienta tu historia y la evaluación de tu legado; no es una condición de victoria.</p>
              </Panel>
              <Panel title="Dificultad y semilla">
                <div className="grid grid-cols-4 gap-2">
                  {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => <button key={d} className={`btn ${difficulty === d ? 'border-gold-500 text-gold-300' : ''}`} onClick={() => setDifficulty(d)} aria-pressed={difficulty === d}>{DIFFICULTY[d].label}</button>)}
                </div>
                <p className="mt-2 text-xs text-ink-400">La dificultad cambia la habilidad estratégica de los rivales, la incertidumbre de las encuestas, los recursos iniciales, la negociación y la presión de los eventos; no reduce artificialmente tus votos.</p>
                <label className="mt-3 flex items-center gap-2 text-sm">Semilla <input className="input font-mono" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} /><button className="btn" onClick={() => setSeed(Math.floor(Math.random() * 1e9))} aria-label="Semilla aleatoria"><Dices size={16} /></button></label>
                <p className="mt-1 text-xs text-ink-500">Misma semilla + mismas decisiones = misma partida.</p>
              </Panel>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-between">
        <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={16} /> Anterior</button>
        {step < 3 ? (
          <button className="btn btn-primary" disabled={!valid[step]} onClick={() => setStep(step + 1)} data-testid="siguiente">Siguiente <ArrowRight size={16} /></button>
        ) : (
          <button className="btn btn-primary" disabled={!valid.every(Boolean)} onClick={start} data-testid="comenzar"><Check size={16} /> Comenzar partida</button>
        )}
      </div>
      {!valid[0] && step === 0 && <p className="mt-2 text-right text-xs text-ink-400">Ingresa nombre, apellidos, una comuna válida y una edad entre 18 y 70.</p>}
    </div>
  );
}
