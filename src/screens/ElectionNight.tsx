import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, SkipForward } from 'lucide-react';
import { useGame } from '../stores/gameStore';
import { Badge, Bar, Panel, PartyChip, Stat } from '../components/ui';
import { ELECTION_LABELS } from '../game/systems/elections';
import { formatDate } from '../game/engine/dates';
import { charName, partyColor, partyShort, pct, num } from '../app/selectors';
import { REGION_BY_ID } from '../game/data/geography';

/**
 * Noche electoral. El escrutinio progresivo se DERIVA de los resultados territoriales ya
 * simulados: se revelan unidades en orden y los totales parciales convergen al resultado final
 * (que no cambia). Las proyecciones de escaños solo cuentan unidades ya escrutadas.
 */
export function ElectionNight() {
  const { game: g, nightResultId, setScreen } = useGame();
  const r = g?.results.find((x) => x.id === nightResultId) ?? g?.results[g.results.length - 1];
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(true);
  const total = r?.countOrder.length ?? 0;
  useEffect(() => { setShown(0); setPlaying(true); }, [r?.id]);
  useEffect(() => {
    if (!playing || shown >= total) return;
    const t = setTimeout(() => setShown((x) => Math.min(total, x + 1)), Math.max(120, 2400 / Math.max(1, total)));
    return () => clearTimeout(t);
  }, [playing, shown, total]);
  const partial = useMemo(() => {
    if (!r) return null;
    const ids = new Set(r.countOrder.slice(0, shown));
    const units = r.units.filter((u) => ids.has(u.unitId));
    const byKey: Record<string, number> = {}; let valid = 0; let voters = 0; let allVoters = 0;
    const personal = !!r.nationalCandidatePct;
    for (const u of r.units) allVoters += u.turnout;
    for (const u of units) {
      voters += u.turnout;
      const src = personal ? u.candidateVotes : u.partyVotes;
      for (const [k, v] of Object.entries(src)) { byKey[k] = (byKey[k] ?? 0) + v; valid += v; }
    }
    const seats: Record<string, number> = {};
    for (const u of units) for (const [p, n] of Object.entries(u.electedParty)) seats[p] = (seats[p] ?? 0) + n;
    return { units, byKey, valid, mesas: allVoters ? (voters / allVoters) * 100 : 0, seats, personal };
  }, [r, shown]);
  if (!g || !r || !partial) return <Panel title="Noche electoral">Sin resultados.</Panel>;
  const done = shown >= total;
  const ranking = Object.entries(partial.byKey).sort((a, b) => b[1] - a[1]);
  const isPres = r.type === 'presidencial' || r.type === 'presidencial_2v' || r.type === 'primarias';
  const label = (k: string) => isPres || partial.personal ? (r.names[k] ?? charName(g, k)) : partyShort(g, k);
  const color = (k: string) => isPres || partial.personal ? partyColor(g, g.characters[k]?.partyId ?? r.candidates?.find((c) => c.id === k)?.partyId) : partyColor(g, k);
  const prevSame = g.results.filter((x) => x.type === r.type && x.week < r.week).slice(-1)[0];
  const out = r.playerOutcome;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><div className="eyebrow">Noche electoral · {formatDate(r.date)}</div><h1 className="font-display text-3xl font-bold">{ELECTION_LABELS[r.type]}</h1></div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setPlaying(!playing)} disabled={done}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? 'Pausa' : 'Seguir'}</button>
          <button className="btn" onClick={() => setShown(total)} disabled={done}><SkipForward size={15} /> Resultado final</button>
          <button className="btn btn-primary" onClick={() => setScreen('panel')}>Volver al panel</button>
        </div>
      </div>
      <Panel>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Mesas escrutadas" value={pct(partial.mesas)} />
          <Stat label="Unidades informadas" value={`${shown}/${total}`} />
          <Stat label="Votos válidos contados" value={num(partial.valid)} />
          <Stat label="Participación final" value={done ? pct(r.turnoutPct) : '—'} />
        </div>
        <div className="mt-3"><Bar value={partial.mesas} color="#782F3D" showValue={false} label="Avance del escrutinio" /></div>
      </Panel>
      {done && out?.ran && (
        <div className={`panel rise p-5 ${out.won ? 'border-emerald-500/60' : 'border-red-500/60'}`}>
          <div className="eyebrow">{out.won ? 'Victoria' : 'Derrota'}</div>
          <div className="font-display text-2xl font-bold">{out.won ? '¡Has sido electo/a!' : 'No lograste el cargo'}</div>
          <p className="mt-1 text-sm text-ink-300">{out.pct !== undefined ? `Obtuviste ${pct(out.pct)} de los votos${out.votes ? ` (${num(out.votes)})` : ''}. ` : ''}{out.won ? '“Gracias a cada persona que confió en este proyecto. Hoy empieza el trabajo.”' : '“Reconozco el resultado y felicito a quienes ganaron. Seguiremos trabajando.”'}</p>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Panel title={isPres ? 'Votación por candidatura' : 'Votación por partido'}>
          <div className="space-y-2">
            {ranking.slice(0, 12).map(([k, v]) => {
              const share = partial.valid ? (v / partial.valid) * 100 : 0;
              const prev = !isPres && prevSame ? prevSame.nationalPartyPct[k] : undefined;
              return (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <span className="w-36 shrink-0 truncate font-medium">{label(k)}</span>
                  <div className="flex-1"><Bar value={share} max={isPres ? 70 : 35} color={color(k)} showValue={false} height="h-3" /></div>
                  <span className="w-16 text-right font-mono">{pct(share)}</span>
                  {prev !== undefined && <span className={`w-12 text-right font-mono text-xs ${share - prev >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{share - prev >= 0 ? '+' : ''}{(share - prev).toFixed(1)}</span>}
                </div>
              );
            })}
          </div>
          {done && r.runoffNeeded && <p className="mt-3 text-sm text-amber-300">Nadie supera la mayoría absoluta: {r.names[r.winnerId ?? '']} y {r.names[r.runnerUpId ?? '']} disputarán la segunda vuelta en cuatro semanas.</p>}
          {done && isPres && !r.runoffNeeded && r.winnerId && r.type !== 'primarias' && <p className="mt-3 text-sm text-emerald-300">{r.names[r.winnerId]} es {g.characters[r.winnerId]?.gender === 'f' ? 'la Presidenta electa' : 'el Presidente electo'}. Asumirá el 11 de marzo.</p>}
        </Panel>
        <Panel title={isPres ? 'Regiones informadas' : 'Proyección de escaños (unidades escrutadas)'}>
          {!isPres && Object.keys(partial.seats).length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">{Object.entries(partial.seats).sort((a, b) => b[1] - a[1]).map(([p, n]) => <PartyChip key={p} g={g} id={p} label={`${partyShort(g, p)} ${n}`} />)}</div>
          )}
          <div className="max-h-80 space-y-1 overflow-y-auto text-xs scroll-thin">{[...partial.units].reverse().map((u) => {
            const src = partial.personal ? u.candidateVotes : u.partyVotes;
            const t = Object.entries(src).sort((a, b) => b[1] - a[1])[0];
            return (<div key={u.unitId} className="flex items-center justify-between gap-2 rounded bg-ink-900/60 px-2 py-1"><span>{u.name}{u.regionId && u.name !== REGION_BY_ID[u.regionId].name ? ` · ${REGION_BY_ID[u.regionId].shortName}` : ''}</span><span className="flex items-center gap-1">{t && <span className="h-2 w-2 rounded-sm" style={{ background: color(t[0]) }} />}{t ? label(t[0]) : '—'}{u.elected.length > 0 && !isPres && <Badge>{u.elected.length} electos</Badge>}</span></div>);
          })}</div>
        </Panel>
      </div>
      {done && (
        <Panel title="Reacciones">
          <ul className="space-y-1 text-sm text-ink-300">{ranking.slice(0, 4).map(([k], i) => (
            <li key={k}><b>{label(k)}</b>: {i === 0 ? '“El país ha hablado con claridad. Asumimos la responsabilidad que nos encomiendan.”' : i === 1 ? '“Es un resultado competitivo; seguiremos dando la pelea.”' : '“Haremos una reflexión profunda sobre este resultado.”'}</li>
          ))}</ul>
        </Panel>
      )}
    </div>
  );
}
