import { useState } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useGame } from '../stores/gameStore';
import type { HistoryEntry } from '../game/models/types';
import { Empty, Panel, Tabs } from '../components/ui';
import { formatShort, weekToISO, yearOf } from '../game/engine/dates';

const CATS: { id: HistoryEntry['category'] | 'todas'; label: string }[] = [
  { id: 'todas', label: 'Todo' }, { id: 'eleccion', label: 'Elecciones' }, { id: 'gobierno', label: 'Gobiernos' }, { id: 'reforma', label: 'Reformas' }, { id: 'crisis', label: 'Crisis' },
  { id: 'coalicion', label: 'Coaliciones' }, { id: 'partido', label: 'Partidos' }, { id: 'congreso', label: 'Congreso' }, { id: 'economia', label: 'Economía' }, { id: 'jugador', label: 'Tu carrera' },
];

export function HistoryScreen() {
  const { game: g } = useGame();
  const [cat, setCat] = useState<(typeof CATS)[number]['id']>('todas');
  const [minImp, setMinImp] = useState(1);
  if (!g) return null;
  const items = g.history.filter((h) => (cat === 'todas' || h.category === cat) && h.importance >= minImp).slice().reverse();
  const byYear: Record<number, HistoryEntry[]> = {};
  for (const h of items) (byYear[yearOf(g.startDate, h.week)] ??= []).push(h);
  const approval = g.opinionHistory.map((h) => ({ fecha: formatShort(weekToISO(g.startDate, h.week)).slice(3), aprobacion: Math.round(h.approval) }));
  return (
    <div className="space-y-4">
      <div><div className="eyebrow">Cronología</div><h1 className="font-display text-2xl font-bold">Historia de tu Chile</h1></div>
      <Panel title="Aprobación presidencial a lo largo de la partida">
        {approval.length < 2 ? <Empty>Aún no hay suficiente historia.</Empty> : (
          <div className="h-48"><ResponsiveContainer><LineChart data={approval} margin={{ left: -20, right: 8 }}><CartesianGrid stroke="#26324a" strokeDasharray="3 3" /><XAxis dataKey="fecha" tick={{ fill: '#8a94ab', fontSize: 10 }} minTickGap={40} /><YAxis domain={[0, 80]} tick={{ fill: '#8a94ab', fontSize: 10 }} /><Tooltip contentStyle={{ background: '#121a28', border: '1px solid #37445f' }} /><Line dataKey="aprobacion" stroke="#c9a24a" dot={false} strokeWidth={2} /></LineChart></ResponsiveContainer></div>
        )}
      </Panel>
      <div className="flex flex-wrap items-center gap-3"><Tabs value={cat} onChange={setCat} options={CATS} />
        <label className="flex items-center gap-2 text-sm text-ink-300">Importancia mínima<select className="input w-20" value={minImp} onChange={(e) => setMinImp(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label></div>
      {items.length === 0 ? <Empty>No hay hitos en esta categoría.</Empty> : Object.entries(byYear).sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, list]) => (
        <Panel key={year} title={year}>
          <ol className="relative space-y-3 border-l border-ink-700 pl-4">{list.map((h) => (
            <li key={h.id} className="relative"><span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${h.category === 'jugador' ? 'bg-gold-400' : h.importance >= 4 ? 'bg-ink-100' : 'bg-ink-500'}`} />
              <div className="text-[11px] text-ink-400">{formatShort(h.date)} · {CATS.find((c) => c.id === h.category)?.label}</div>
              <div className={`${h.importance >= 4 ? 'font-semibold' : ''}`}>{h.title}</div>{h.detail && <div className="text-sm text-ink-400">{h.detail}</div>}</li>
          ))}</ol>
        </Panel>
      ))}
    </div>
  );
}
