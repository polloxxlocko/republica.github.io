/**
 * Fotografía territorial documental con crédito visible. Si no existe una fotografía verificada
 * para el territorio, se muestra una composición cartográfica (mapa real + tipografía): nunca se
 * sustituye silenciosamente un lugar por otro.
 */
import { useEffect, useMemo, useState } from 'react';
import type { PhotoCredit } from '../data/media/photoCredits';
import type { RegionId } from '../game/models/types';
import { REGION_BY_ID } from '../game/data/geography';
import { COMUNA_BY_CUT } from '../game/territory/data';
import { loadGeometry } from './ComunaMap';

const base = import.meta.env.BASE_URL;
export const assetUrl = (p: string) => `${base}${p.replace(/^\//, '')}`;

export function PhotoCaption({ photo, className = '' }: { photo: PhotoCredit; className?: string }) {
  return (
    <p className={`font-sans text-[11px] leading-snug text-ink-400 ${className}`}>
      <span className="text-ink-200">{photo.place}</span> · Foto: {photo.author} · <a className="underline decoration-ink-500 underline-offset-2 hover:text-gold-400" href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a> · <a className="underline decoration-ink-500 underline-offset-2 hover:text-gold-400" href={photo.sourceUrl} target="_blank" rel="noreferrer">Wikimedia Commons</a>
    </p>
  );
}

export function TerritorialPhoto({ photo, regionId, cut, className = '', priority = false, caption = true, ratio = '16/9' }: { photo: PhotoCredit | null; regionId: RegionId; cut?: number | null; className?: string; priority?: boolean; caption?: boolean; ratio?: string }) {
  if (!photo) return <CartographicFallback regionId={regionId} cut={cut ?? null} className={className} ratio={ratio} />;
  return (
    <figure className={className}>
      <div className="overflow-hidden rounded-md bg-ink-800" style={{ aspectRatio: ratio }}>
        <img src={assetUrl(photo.file)} srcSet={`${assetUrl(photo.fileSmall)} 800w, ${assetUrl(photo.file)} 1600w`} sizes="(max-width: 768px) 100vw, 60vw"
          alt={photo.alt} loading={priority ? 'eager' : 'lazy'} {...({ fetchpriority: priority ? 'high' : 'auto' } as Record<string, string>)} decoding="async"
          className="h-full w-full object-cover" style={{ objectPosition: photo.focus ?? 'center' }} width={photo.width} height={photo.height} />
      </div>
      {caption && <figcaption className="mt-1.5"><PhotoCaption photo={photo} /></figcaption>}
    </figure>
  );
}

/** Composición de reemplazo: silueta real de la región y su nombre. */
export function CartographicFallback({ regionId, cut, className = '', ratio = '16/9' }: { regionId: RegionId; cut: number | null; className?: string; ratio?: string }) {
  return (
    <figure className={className}>
      <div className="relative flex overflow-hidden rounded-md border border-ink-700 bg-ink-800" style={{ aspectRatio: ratio }}>
        <div className="flex flex-1 flex-col justify-end p-5">
          <div className="kicker">Sin fotografía verificada</div>
          <div className="font-serif text-2xl text-ink-50">{cut ? COMUNA_BY_CUT[cut]?.name : REGION_BY_ID[regionId]?.name}</div>
          <div className="text-xs text-ink-400">{cut ? REGION_BY_ID[regionId]?.name : 'Región'}</div>
        </div>
        <LocatorMap regionId={regionId} cut={cut} className="h-full w-1/2 p-3" />
      </div>
    </figure>
  );
}

/** Mapa de ubicación: la región (y la comuna) dentro de su contexto real. */
export function LocatorMap({ regionId, cut = null, className = '', mode = 'region' }: { regionId: RegionId; cut?: number | null; className?: string; mode?: 'region' | 'pais' }) {
  const [geo, setGeo] = useState<Record<string, number[][][]> | null>(null);
  useEffect(() => { let alive = true; loadGeometry().then((g) => { if (alive) setGeo(g); }); return () => { alive = false; }; }, []);
  const K = Math.cos((33 * Math.PI) / 180);
  const paths = useMemo(() => {
    if (!geo) return null;
    const out: { cut: number; d: string; inRegion: boolean; box: number[] }[] = [];
    for (const [cs, rings] of Object.entries(geo)) {
      const c = Number(cs); if (c === 5201 || c === 5104) continue; // insulares: fuera del mapa de ubicación
      const r = COMUNA_BY_CUT[c]?.region; const inRegion = r === regionId;
      if (mode === 'region' && !inRegion) continue;
      let a = Infinity, b = Infinity, x2 = -Infinity, y2 = -Infinity;
      const d = rings.map((ring) => ring.map(([x, y], i) => { const px = x * K; const py = -y; a = Math.min(a, px); x2 = Math.max(x2, px); b = Math.min(b, py); y2 = Math.max(y2, py); return `${i ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)}`; }).join('') + 'Z').join('');
      out.push({ cut: c, d, inRegion, box: [a, b, x2, y2] });
    }
    return out;
  }, [geo, regionId, mode, K]);
  if (!paths) return <div className={className} aria-hidden />;
  const ps = paths.filter((p) => mode === 'pais' || p.inRegion);
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of ps) { a = Math.min(a, p.box[0]); b = Math.min(b, p.box[1]); c = Math.max(c, p.box[2]); d = Math.max(d, p.box[3]); }
  const pad = Math.max(c - a, d - b) * 0.04;
  return (
    <svg className={className} viewBox={`${a - pad} ${b - pad} ${c - a + 2 * pad} ${d - b + 2 * pad}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Ubicación: ${cut ? `${COMUNA_BY_CUT[cut]?.name}, ` : ''}${REGION_BY_ID[regionId]?.name}`}>
      {paths.map((p) => (
        <path key={p.cut} d={p.d} vectorEffect="non-scaling-stroke" strokeWidth={0.6}
          fill={p.cut === cut ? 'rgb(var(--c-burgundy))' : p.inRegion ? (mode === 'pais' ? 'rgb(var(--c-burgundy) / 0.75)' : 'rgb(var(--c-surface-3))') : 'rgb(var(--c-surface-3))'}
          stroke="rgb(var(--c-surface))" />
      ))}
    </svg>
  );
}
