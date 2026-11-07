import { useState } from 'react';
import { useGame } from '../stores/gameStore';
import { Empty, Panel, Tabs } from '../components/ui';
import { MEDIA } from '../game/data/institutions';
import { formatShort, weekToISO } from '../game/engine/dates';
import type { NewsItem } from '../game/models/types';

const CATS: { id: NewsItem['category'] | 'todas'; label: string }[] = [
  { id: 'todas', label: 'Todas' }, { id: 'elecciones', label: 'Elecciones' }, { id: 'congreso', label: 'Congreso' }, { id: 'gobierno', label: 'Gobierno' },
  { id: 'economia', label: 'Economía' }, { id: 'partidos', label: 'Partidos' }, { id: 'coaliciones', label: 'Coaliciones' }, { id: 'crisis', label: 'Crisis' }, { id: 'encuestas', label: 'Encuestas' }, { id: 'regiones', label: 'Regiones' },
];

export function NewsScreen() {
  const { game: g } = useGame();
  const [cat, setCat] = useState<(typeof CATS)[number]['id']>('todas');
  const [outlet, setOutlet] = useState('');
  if (!g) return null;
  const items = g.news.filter((n) => (cat === 'todas' || n.category === cat) && (!outlet || n.outletId === outlet));
  return (
    <div className="space-y-4">
      <div><div className="eyebrow">Medios de comunicación (ficticios)</div><h1 className="font-display text-2xl font-bold">Noticias</h1></div>
      <div className="flex flex-wrap items-center gap-3"><Tabs value={cat} onChange={setCat} options={CATS} />
        <select className="input w-52" value={outlet} onChange={(e) => setOutlet(e.target.value)} aria-label="Medio"><option value="">Todos los medios</option>{MEDIA.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
      <Panel>
        {items.length === 0 ? <Empty>No hay noticias en esta categoría.</Empty> : (
          <ul className="divide-y divide-ink-800">{items.map((n) => {
            const m = MEDIA.find((x) => x.id === n.outletId);
            return (
              <li key={n.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-400"><span className="font-semibold text-gold-400">{m?.name}</span><span>{formatShort(weekToISO(g.startDate, n.week))}</span><span className="chip py-0">{n.category}</span>{n.importance >= 4 && <span className="chip border-gold-500/50 py-0 text-gold-300">destacado</span>}</div>
                <div className={`mt-0.5 font-medium ${n.importance >= 4 ? 'font-display text-lg' : ''}`}>{n.headline}</div>
                {n.body && <div className="text-sm text-ink-400">{n.body}</div>}
              </li>
            );
          })}</ul>
        )}
      </Panel>
      <p className="text-xs text-ink-500">Todas las noticias se generan a partir de hechos de la simulación. Los medios son ficticios y su línea editorial influye en la cobertura.</p>
    </div>
  );
}
