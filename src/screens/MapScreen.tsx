import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../stores/gameStore';
import type { RegionId } from '../game/models/types';
import { ComunaMap, type MapCell } from '../components/ComunaMap';
import { Bar, Empty, Panel, PartyChip, Stat, Tabs } from '../components/ui';
import { CATEGORICAL, NO_DATA, diverging, sequential, DIV_MID } from '../components/colorScales';
import { COMUNAS, COMUNA_BY_CUT, type Bloc } from '../game/territory/data';
import { HIST_LABELS, loadHistory, summarize, type HistElection, type HistoryData } from '../game/territory/history';
import { estimateComuna, estimateTerritory, explainComuna, type TerritoryTarget } from '../game/territory/dynamics';
import { REGIONS, REGION_BY_ID, DISTRICTS } from '../game/data/geography';
import { AREA_LABELS } from '../game/rules/params';
import { ELECTION_LABELS } from '../game/systems/elections';
import { leftRight } from '../game/systems/util';
import { actionBlocked } from '../game/systems/player';
import { partyColor, partyShort, pct, num, playerChar } from '../app/selectors';
import { formatShort } from '../game/engine/dates';

type Layer = 'ganador' | 'distribucion' | 'participacion' | 'competitividad' | 'evolucion' | 'ideologia' | 'prioridades';
const BLOC_COLOR: Record<Bloc, string> = { izq: '#e66767', centro: '#c98500', der: '#3987e5', pop: '#d95926', otro: '#8a94ab' };
const BLOC_LABEL: Record<Bloc, string> = { izq: 'Izquierda y centroizquierda', centro: 'Centro', der: 'Derecha', pop: 'Populista / antiestablishment', otro: 'Otros' };
const PRIORITY_ORDER = ['seguridad', 'salud', 'economia', 'pensiones', 'vivienda', 'medioambiente', 'descentralizacion', 'infraestructura'];

interface Src { id: string; label: string; kind: 'hist' | 'game'; e?: HistElection; gameId?: string }

/** Convierte un resultado de la partida al formato histórico (opciones + filas por comuna). */
function gameAsHist(g: NonNullable<ReturnType<typeof useGame.getState>['game']>, id: string): HistElection | null {
  const r = g.results.find((x) => x.id === id);
  if (!r?.comunas) return null;
  const keys = new Set<string>();
  for (const c of Object.values(r.comunas)) for (const k of Object.keys(c.v)) keys.add(k);
  const options = [...keys].map((k) => {
    const party = g.parties[k] ? k : g.characters[k]?.partyId ?? null;
    const lr = party && g.parties[party] ? leftRight(g.parties[party].ideology) : 0;
    const bloc: Bloc = party === 'PDG' ? 'pop' : lr < -15 ? 'izq' : lr > 15 ? 'der' : 'centro';
    return { k, label: g.parties[k]?.short ?? r.names[k] ?? k, party, bloc };
  });
  const c: Record<string, number[]> = {};
  for (const [cut, d] of Object.entries(r.comunas)) {
    const valid = Object.values(d.v).reduce((a, b) => a + b, 0);
    c[cut] = [d.e, d.t, Math.max(0, d.t - valid), ...options.map((o) => d.v[o.k] ?? 0)];
  }
  return { id: r.id, type: r.type, date: r.date, status: 'simulado (partida)', source: 'Partida', split: 'calibracion', options, c, seats: {} };
}

export function MapScreen() {
  const { game: g, act } = useGame();
  const [hist, setHist] = useState<HistoryData | null>(null);
  const [tab, setTab] = useState<'mapa' | 'estrategia'>('mapa');
  const [srcId, setSrcId] = useState('D2025');
  const [cmpId, setCmpId] = useState('D2021');
  const [layer, setLayer] = useState<Layer>('ganador');
  const [focus, setFocus] = useState<string>('bloc:der');
  const [region, setRegion] = useState<RegionId | ''>('');
  const [sel, setSel] = useState<number | null>(null);
  const [amount, setAmount] = useState(10);
  const [scope, setScope] = useState<'comuna' | 'distrito' | 'region'>('comuna');
  const [stratRegion, setStratRegion] = useState<RegionId | ''>('');
  useEffect(() => { loadHistory().then(setHist); }, []);
  const sources: Src[] = useMemo(() => {
    const out: Src[] = [];
    if (hist) for (const e of hist.elections) out.push({ id: e.id, label: `${HIST_LABELS[e.id] ?? e.id} — oficial`, kind: 'hist', e });
    if (g) for (const r of [...g.results].reverse()) if (r.comunas) out.push({ id: r.id, label: `${ELECTION_LABELS[r.type]} ${r.date.slice(0, 4)} — partida`, kind: 'game', gameId: r.id });
    return out;
  }, [hist, g]);
  const getE = (id: string): HistElection | null => {
    const s = sources.find((x) => x.id === id);
    if (!s || !g) return null;
    return s.kind === 'hist' ? s.e ?? null : gameAsHist(g, s.gameId!);
  };
  const E = getE(srcId); const B = getE(cmpId);
  const myParty = g ? playerChar(g).partyId : null;

  const focusOptions = useMemo(() => {
    const o: { id: string; label: string }[] = (['izq', 'centro', 'der', 'pop'] as Bloc[]).map((b) => ({ id: `bloc:${b}`, label: `Bloque: ${BLOC_LABEL[b]}` }));
    if (E) for (const op of E.options.slice(0, 40)) o.push({ id: `opt:${op.k}`, label: op.party && g?.parties[op.party] && !op.label.includes(' ') ? `${op.label}` : op.label });
    return o;
  }, [E, g]);

  const share = (e: HistElection, row: number[] | undefined, f: string): number | null => {
    const s = summarize(e, row); if (!s) return null;
    if (f.startsWith('bloc:')) return s.blocs[f.slice(5) as Bloc] ?? 0;
    const k = f.slice(4);
    if (s.shares[k] !== undefined) return s.shares[k];
    // misma fuerza en otra elección: busca por partido
    const party = E?.options.find((o) => o.k === k)?.party;
    const alt = party ? e.options.find((o) => o.party === party) : null;
    return alt ? s.shares[alt.k] ?? 0 : null;
  };

  const cells: Record<number, MapCell> = useMemo(() => {
    const out: Record<number, MapCell> = {};
    if (!g) return out;
    for (const c of COMUNAS) {
      const row = E?.c[c.cut];
      const s = E ? summarize(E, row) : null;
      let color = NO_DATA; let label = 'sin datos';
      if (layer === 'ganador' && s?.winner) {
        const w = s.winner; color = w.party && g.parties[w.party] ? partyColor(g, w.party) : BLOC_COLOR[w.bloc];
        label = `${w.label} (${pct((s.shares[w.k] ?? 0) * 100)})`;
      } else if (layer === 'distribucion' && E) {
        const v = share(E, row, focus); if (v !== null) { color = sequential(v / 0.6); label = pct(v * 100); }
      } else if (layer === 'participacion' && s) { color = sequential((s.turnout - 0.3) / 0.65); label = `participación ${pct(s.turnout * 100)}`; }
      else if (layer === 'competitividad' && s) { color = sequential(1 - Math.min(1, s.margin / 0.4)); label = `margen ${pct(s.margin * 100)}`; }
      else if (layer === 'evolucion' && E && B) {
        const a = focus === 'turnout' ? summarize(B, B.c[c.cut])?.turnout ?? null : share(B, B.c[c.cut], focus);
        const b = focus === 'turnout' ? s?.turnout ?? null : share(E, row, focus);
        if (a !== null && b !== null) { const d = b - a; color = diverging(d / 0.15); label = `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)} pp`; }
      } else if (layer === 'ideologia') {
        let acc = 0; let w = 0;
        for (const seg of g.segments) if (seg.cut === c.cut) { acc += leftRight(seg.ideology) * seg.voters; w += seg.voters; }
        const lr = w ? acc / w : 0; color = diverging(lr / 45); label = `índice izq.-der. estimado ${lr.toFixed(0)}`;
      } else if (layer === 'prioridades') {
        const pr = Object.entries(g.comunas[c.cut]?.priorities ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
        if (pr) { const i = PRIORITY_ORDER.indexOf(pr[0]); color = i >= 0 ? CATEGORICAL[i] : '#8a94ab'; label = `prioridad: ${AREA_LABELS[pr[0] as keyof typeof AREA_LABELS]}`; }
      }
      out[c.cut] = { color, label };
    }
    return out;
  }, [g, E, B, layer, focus]);

  if (!g) return null;
  const selC = sel !== null ? COMUNA_BY_CUT[sel] : null;
  const est = sel !== null ? estimateComuna(g, sel, myParty) : null;
  const expl = sel !== null ? explainComuna(g, sel) : null;
  const target: TerritoryTarget | null = selC ? (scope === 'comuna' ? { kind: 'comuna', id: selC.cut } : scope === 'distrito' ? { kind: 'distrito', id: selC.district } : { kind: 'region', id: selC.region }) : null;
  const investBlocked = target ? actionBlocked(g, { type: 'campana_territorial', target, amount }) : 'Selecciona una comuna';
  const workBlocked = target ? actionBlocked(g, { type: 'trabajo_territorial', target }) : 'Selecciona una comuna';

  const legend = layer === 'evolucion' || layer === 'ideologia'
    ? <div className="flex items-center gap-2 text-[11px] text-ink-400"><span className="h-2 w-16 rounded" style={{ background: `linear-gradient(90deg, ${diverging(-1)}, ${DIV_MID}, ${diverging(1)})` }} />{layer === 'ideologia' ? 'izquierda · centro · derecha' : `${B ? HIST_LABELS[B.id] ?? 'A' : 'A'} → ${E ? HIST_LABELS[E.id] ?? 'B' : 'B'}: baja · sin cambio · sube (±15 pp)`}</div>
    : layer === 'ganador' ? <div className="flex flex-wrap gap-1.5 text-[11px]">{(['izq', 'centro', 'der', 'pop'] as Bloc[]).map((b) => <span key={b} className="chip"><span className="h-2 w-2 rounded-sm" style={{ background: BLOC_COLOR[b] }} />{BLOC_LABEL[b]}</span>)}<span className="text-ink-500">partidos: su color</span></div>
    : layer === 'prioridades' ? <div className="flex flex-wrap gap-1.5 text-[11px]">{PRIORITY_ORDER.map((p, i) => <span key={p} className="chip"><span className="h-2 w-2 rounded-sm" style={{ background: CATEGORICAL[i] }} />{AREA_LABELS[p as keyof typeof AREA_LABELS]}</span>)}</div>
    : <div className="flex items-center gap-2 text-[11px] text-ink-400"><span className="h-2 w-16 rounded" style={{ background: `linear-gradient(90deg, ${sequential(0)}, ${sequential(0.5)}, ${sequential(1)})` }} />{layer === 'competitividad' ? 'menos → más competitiva' : layer === 'participacion' ? '30% → 95%' : '0% → 60%'}</div>;

  const strategyRows = DISTRICTS.filter((d) => !stratRegion || d.regionId === stratRegion).map((d) => ({ d, e: estimateTerritory(g, { kind: 'distrito', id: d.id }, myParty) }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><div className="eyebrow">Territorio electoral · 346 comunas</div><h1 className="font-display text-2xl font-bold">Mapa electoral de Chile</h1></div>
        <Tabs value={tab} onChange={setTab} options={[{ id: 'mapa', label: 'Mapa y comunas' }, { id: 'estrategia', label: 'Estrategia territorial' }]} />
      </div>
      {tab === 'mapa' && (
        <>
          <Panel>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              <label className="text-xs text-ink-400">Elección<select className="input mt-1" value={srcId} onChange={(e) => setSrcId(e.target.value)} aria-label="Elección">{sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
              <label className="text-xs text-ink-400">Capa<select className="input mt-1" value={layer} onChange={(e) => setLayer(e.target.value as Layer)} aria-label="Capa">
                <option value="ganador">Fuerza más votada</option><option value="distribucion">Distribución de votos</option><option value="participacion">Participación</option>
                <option value="competitividad">Competitividad</option><option value="evolucion">Evolución / comparar elecciones</option><option value="ideologia">Preferencias ideológicas estimadas (partida)</option><option value="prioridades">Prioridades ciudadanas (partida)</option>
              </select></label>
              {(layer === 'distribucion' || layer === 'evolucion') && <label className="text-xs text-ink-400">Fuerza o indicador<select className="input mt-1" value={focus} onChange={(e) => setFocus(e.target.value)} aria-label="Fuerza">{layer === 'evolucion' && <option value="turnout">Participación</option>}{focusOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>}
              {layer === 'evolucion' && <label className="text-xs text-ink-400">Comparar con<select className="input mt-1" value={cmpId} onChange={(e) => setCmpId(e.target.value)} aria-label="Elección de comparación">{sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>}
              <label className="text-xs text-ink-400">Región<select className="input mt-1" value={region} onChange={(e) => setRegion(e.target.value as RegionId | '')} aria-label="Región"><option value="">Todo Chile</option>{REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            </div>
            <div className="mt-2">{legend}</div>
            {E && <p className="mt-1 text-[11px] text-ink-500">Fuente: {E.source} · {E.status}{E.split === 'validacion' ? ' · en la partida se usa para calibrar; en la prueba de validación se reserva' : ''}</p>}
          </Panel>
          <div className="grid gap-4 xl:grid-cols-[minmax(320px,1fr)_minmax(360px,1.1fr)]">
            <Panel bodyClass="p-2">{!hist ? <Empty>Cargando resultados oficiales…</Empty> : <ComunaMap cells={cells} selected={sel} onSelect={(c) => { setSel(c); }} region={region || null} height={region ? 560 : 760} />}</Panel>
            <div className="space-y-4">
              {!selC ? <Panel title="Selecciona una comuna"><Empty>Haz clic en una comuna del mapa (o usa el teclado) para ver su perfil, resultados históricos, estimaciones para tu partido y opciones de campaña.</Empty></Panel> : (
                <>
                  <Panel title={selC.name} right={<span className="text-xs text-ink-400">{REGION_BY_ID[selC.region].shortName} · Prov. {selC.province} · Distrito {selC.district}</span>}>
                    <div className="grid grid-cols-3 gap-3">
                      <Stat label="Electores (2023)" value={num(selC.electors)} /><Stat label="Población (2024)" value={num(selC.pop)} /><Stat label="Densidad" value={selC.density !== null ? `${num(selC.density)}/km²` : '—'} />
                      <Stat label="Escolaridad 18+" value={`${selC.school} años`} /><Stat label="Educación superior" value={pct(selC.eduSup * 100, 0)} /><Stat label="Inmigrantes" value={pct(selC.imm * 100, 1)} />
                      <Stat label="Pueblos indígenas" value={pct(selC.indig * 100, 0)} /><Stat label="Evangélicos" value={pct(selC.evang * 100, 0)} /><Stat label="Sin religión" value={pct(selC.norel * 100, 0)} />
                    </div>
                    <p className="mt-2 text-[11px] text-ink-500">INE Censo 2024 y SERVEL padrón 2023. Los atributos demográficos se usan con efectos moderados; no determinan el voto.</p>
                  </Panel>
                  {E && (() => { const s = summarize(E, E.c[selC.cut]); return s ? (
                    <Panel title={HIST_LABELS[E.id] ?? sources.find((x) => x.id === E.id)?.label ?? E.id} right={<span className="text-xs text-ink-400">participación {pct(s.turnout * 100)} · nulos/blancos {pct(s.voters ? s.nullBlank / s.voters * 100 : 0)}</span>}>
                      <div className="space-y-1">{E.options.map((o) => ({ o, v: s.shares[o.k] ?? 0 })).sort((a, b) => b.v - a.v).slice(0, 7).map(({ o, v }) => (
                        <div key={o.k} className="flex items-center gap-2 text-xs"><span className="w-40 truncate">{o.label}</span><div className="flex-1"><Bar value={v * 100} max={60} color={o.party && g.parties[o.party] ? partyColor(g, o.party) : BLOC_COLOR[o.bloc]} showValue={false} /></div><span className="w-12 text-right font-mono">{pct(v * 100)}</span></div>
                      ))}</div>
                    </Panel>) : null; })()}
                  {hist && (
                    <Panel title="Trayectoria histórica (oficial)">
                      <table className="table"><thead><tr><th>Elección</th><th>Part.</th><th>Izq.</th><th>Der.</th><th>Pop.</th></tr></thead><tbody>
                        {hist.elections.filter((e) => e.type !== 'alcaldes').map((e) => { const s = summarize(e, e.c[selC.cut]); return s ? (
                          <tr key={e.id}><td className="text-xs">{HIST_LABELS[e.id]}</td><td className="font-mono text-xs">{pct(s.turnout * 100, 0)}</td><td className="font-mono text-xs">{pct((s.blocs.izq ?? 0) * 100, 0)}</td><td className="font-mono text-xs">{pct((s.blocs.der ?? 0) * 100, 0)}</td><td className="font-mono text-xs">{pct((s.blocs.pop ?? 0) * 100, 0)}</td></tr>) : null; })}
                      </tbody></table>
                      <p className="mt-1 text-[11px] text-ink-500">Bloques según clasificación del autor (TERRITORY.md). El plebiscito 2022 se muestra como Apruebo (izq.) / Rechazo (der.) solo para comparación, no es una elección partidaria.</p>
                    </Panel>
                  )}
                  {est && (
                    <Panel title={myParty ? `Estimación para ${partyShort(g, myParty)}` : 'Estimación territorial'} right={<span className="text-[11px] text-ink-400">análisis de tu equipo · ±{est.uncertainty.toFixed(1)} pp</span>}>
                      <div className="grid grid-cols-3 gap-3">
                        <Stat label="Apoyo estimado" value={`${pct(est.support * 100)}`} sub={`${pct(est.low * 100)} – ${pct(est.high * 100)}`} />
                        <Stat label="Fuerza líder" value={est.leader ? partyShort(g, est.leader) : '—'} sub={`margen ${pct(est.margin * 100)}`} />
                        <Stat label="Participación esperada" value={pct(est.turnout * 100, 0)} />
                        <Stat label="Organización local" value={Math.round(est.organization * 100)} />
                        <Stat label="Inversión vigente" value={`${est.ownInvestment.toFixed(1)} MM$`} />
                        <Stat label="Costo de +1 pp" value={`≈ ${est.costPerPoint} MM$`} sub="crece con la inversión" />
                      </div>
                      <div className="mt-2 text-xs text-ink-400">Prioridades: {est.priorities.map(([k]) => AREA_LABELS[k as keyof typeof AREA_LABELS]).join(', ')}</div>
                      {expl && (
                        <div className="mt-3 rounded-lg bg-ink-900/70 p-3 text-sm">
                          <div className="eyebrow mb-1">¿Por qué cambia tu apoyo aquí?</div>
                          {expl.items.length === 0 ? <p className="text-xs text-ink-400">{expl.since === null ? expl.note : 'Sin cambios relevantes desde la última elección.'}</p> : (
                            <ul className="space-y-1">{expl.items.map((x) => <li key={x.factor} className="flex gap-2"><span className={x.effect === 'sube' ? 'text-emerald-300' : 'text-red-300'}>{x.effect === 'sube' ? '▲' : '▼'}</span><span><b>{x.factor}</b> ({x.magnitude}): {x.detail}.</span></li>)}</ul>
                          )}
                          {expl.since !== null && <p className="mt-1 text-[11px] text-ink-500">Desde la elección de la semana {expl.since}. {expl.note}</p>}
                        </div>
                      )}
                      <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_auto]">
                        <select className="input" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} aria-label="Alcance"><option value="comuna">Esta comuna</option><option value="distrito">Su distrito ({selC.district})</option><option value="region">Su región</option></select>
                        <label className="flex items-center gap-2 text-sm">MM$<input type="number" min={1} className="input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Monto" /></label>
                        <button className="btn btn-primary" disabled={!!investBlocked} title={investBlocked ?? undefined} onClick={() => target && act({ type: 'campana_territorial', target, amount })}>Invertir (1 PA)</button>
                      </div>
                      <button className="btn mt-2 w-full" disabled={!!workBlocked} title={workBlocked ?? undefined} onClick={() => target && act({ type: 'trabajo_territorial', target })}>Trabajo territorial: fortalecer organización (1 PA)</button>
                      {(investBlocked || workBlocked) && <p className="mt-1 text-[11px] text-amber-300">{investBlocked ?? workBlocked}</p>}
                      <p className="mt-2 text-[11px] text-ink-500">La inversión se reparte por electores, tiene rendimientos decrecientes (raíz cuadrada) y se diluye cada mes. Su efecto real depende de la volatilidad local y de la competencia.</p>
                    </Panel>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
      {tab === 'estrategia' && (
        <Panel title={`Estrategia por distrito${myParty ? ` · ${partyShort(g, myParty)}` : ''}`} right={<select className="input w-56" value={stratRegion} onChange={(e) => setStratRegion(e.target.value as RegionId | '')} aria-label="Filtrar región"><option value="">Todas las regiones</option>{REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}>
          <div className="overflow-x-auto"><table className="table"><thead><tr><th>Distrito</th><th>Región</th><th>Escaños</th><th>Electorado</th><th>Apoyo estimado</th><th>Incert.</th><th>Líder</th><th>Margen</th><th>Part. esp.</th><th>Organiz.</th><th>Inversión</th><th>Costo +1 pp</th></tr></thead><tbody>
            {strategyRows.sort((a, b) => a.e.margin - b.e.margin).map(({ d, e }) => (
              <tr key={d.id}><td className="font-medium">D{d.id}</td><td className="text-xs">{REGION_BY_ID[d.regionId].shortName}</td><td className="font-mono">{d.seats}</td><td className="font-mono text-xs">{num(e.electors)}</td><td className="font-mono">{pct(e.support * 100)}</td><td className="font-mono text-xs">±{e.uncertainty.toFixed(1)}</td><td>{e.leader && <PartyChip g={g} id={e.leader} />}</td><td className="font-mono text-xs">{pct(e.margin * 100)}</td><td className="font-mono text-xs">{pct(e.turnout * 100, 0)}</td><td className="font-mono text-xs">{Math.round(e.organization * 100)}</td><td className="font-mono text-xs">{e.ownInvestment.toFixed(1)}</td><td className="font-mono text-xs">≈{e.costPerPoint}</td></tr>
            ))}
          </tbody></table></div>
          <p className="mt-2 text-xs text-ink-400">Ordenado por competitividad (margen entre las dos primeras fuerzas estimadas). Las estimaciones usan resultados y encuestas públicas, no la intención real. Selecciona una comuna en el mapa para invertir o hacer trabajo territorial. Última elección de referencia: {(() => { const r = [...g.results].reverse().find((x) => x.type === 'diputados'); return r ? formatShort(r.date) : 'Diputados 2025 (oficial, preliminar)'; })()}.</p>
        </Panel>
      )}
    </div>
  );
}
