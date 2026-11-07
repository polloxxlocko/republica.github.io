/**
 * Mapa comunal interactivo con geometría oficial (MOP, División Político-Administrativa,
 * simplificada). Isla de Pascua y Juan Fernández se dibujan como insertos desplazados.
 * Antártica no tiene polígono en la capa oficial y no se dibuja (aparece en las tablas).
 */
import { useEffect, useMemo, useState } from 'react';
import type { RegionId } from '../game/models/types';
import { COMUNA_BY_CUT } from '../game/territory/data';
import { NO_DATA } from './colorScales';

type Geo = Record<string, number[][][]>;
let geoPromise: Promise<Geo> | null = null;
export function loadGeometry(): Promise<Geo> {
  geoPromise ??= import('../game/data/territory/geometry.json').then((m) => (m.default ?? m) as unknown as Geo);
  return geoPromise;
}

const INSETS: Record<number, [number, number]> = { 5201: [32.5, 8], 5104: [3.2, 0] }; // [Δlon, Δlat]: Isla de Pascua, Juan Fernández
const K = Math.cos((33 * Math.PI) / 180);

export interface MapCell { color: string; label: string }

export function ComunaMap({ cells, selected, onSelect, region, height = 640 }: { cells: Record<number, MapCell>; selected: number | null; onSelect: (cut: number) => void; region: RegionId | null; height?: number }) {
  const [geo, setGeo] = useState<Geo | null>(null);
  useEffect(() => { let alive = true; loadGeometry().then((g) => { if (alive) setGeo(g); }); return () => { alive = false; }; }, []);
  const paths = useMemo(() => {
    if (!geo) return [];
    return Object.entries(geo).map(([cutS, rings]) => {
      const cut = Number(cutS); const [dx, dy] = INSETS[cut] ?? [0, 0];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const d = rings.map((r) => r.map(([x, y], i) => {
        const px = (x + dx) * K; const py = -(y + dy);
        minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        return `${i ? 'L' : 'M'}${px.toFixed(3)},${py.toFixed(3)}`;
      }).join('') + 'Z').join('');
      return { cut, d, box: [minX, minY, maxX, maxY] as const, region: COMUNA_BY_CUT[cut]?.region };
    });
  }, [geo]);
  const view = useMemo(() => {
    const ps = region ? paths.filter((p) => p.region === region && !INSETS[p.cut]) : paths;
    if (!ps.length) return '0 0 1 1';
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const p of ps) { a = Math.min(a, p.box[0]); b = Math.min(b, p.box[1]); c = Math.max(c, p.box[2]); d = Math.max(d, p.box[3]); }
    const pad = Math.max(c - a, d - b) * 0.03;
    return `${a - pad} ${b - pad} ${c - a + 2 * pad} ${d - b + 2 * pad}`;
  }, [paths, region]);
  if (!geo) return <div className="flex items-center justify-center text-sm text-ink-400" style={{ height }}>Cargando geometría oficial…</div>;
  const visible = region ? paths.filter((p) => p.region === region) : paths;
  const stroke = region ? 0.5 : 0.25;
  return (
    <svg viewBox={view} style={{ height, width: '100%' }} preserveAspectRatio="xMidYMid meet" role="group" aria-label={region ? `Mapa comunal de la región ${region}` : 'Mapa comunal de Chile'}>
      {visible.map((p) => {
        const cell = cells[p.cut];
        const sel = p.cut === selected;
        return (
          <path key={p.cut} d={p.d} fill={cell?.color ?? NO_DATA} stroke={sel ? '#e9d39c' : '#0b0f17'} strokeWidth={sel ? 2 : stroke} vectorEffect="non-scaling-stroke"
            className="cursor-pointer outline-none hover:opacity-80 focus:opacity-80" tabIndex={0} role="button" aria-label={`${COMUNA_BY_CUT[p.cut]?.name}: ${cell?.label ?? 'sin datos'}`}
            onClick={() => onSelect(p.cut)} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(p.cut); }}>
            <title>{`${COMUNA_BY_CUT[p.cut]?.name ?? p.cut}: ${cell?.label ?? 'sin datos'}`}</title>
          </path>
        );
      })}
    </svg>
  );
}
