/** Componentes visuales básicos reutilizables. */
import type { ReactNode } from 'react';
import type { GameState, Ideology } from '../game/models/types';
import { DIMS, DIM_LABELS } from '../game/rules/params';
import { partyColor, partyShort } from '../app/selectors';

export function Panel({ title, right, children, className = '', bodyClass = 'p-4' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`panel ${className}`}>
      {title !== undefined && (
        <header className="panel-h"><h2 className="panel-t">{title}</h2>{right}</header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-red-300' : 'text-ink-100';
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className={`font-mono text-lg font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-ink-400">{sub}</div>}
    </div>
  );
}

export function Bar({ value, max = 100, color = '#782F3D', label, showValue = true, height = 'h-2' }: { value: number; max?: number; color?: string; label?: string; showValue?: boolean; height?: string }) {
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="w-full" role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      {label && (
        <div className="mb-0.5 flex justify-between text-xs text-ink-300"><span>{label}</span>{showValue && <span className="font-mono">{Math.round(value)}</span>}</div>
      )}
      <div className={`${height} w-full overflow-hidden rounded-full bg-ink-700/70`}>
        <div className={`${height} rounded-full transition-all`} style={{ width: `${w}%`, background: color }} />
      </div>
    </div>
  );
}

export function PartyChip({ g, id, label }: { g: GameState; id: string | null | undefined; label?: string }) {
  return (
    <span className="chip" title={id ? g.parties[id]?.name ?? 'Independiente' : 'Independiente'}>
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: partyColor(g, id) }} aria-hidden />
      {label ?? partyShort(g, id)}
    </span>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'gold' }) {
  const cls = { neutral: 'border-ink-600 text-ink-200', good: 'border-emerald-500/50 text-emerald-300', bad: 'border-red-500/50 text-red-300', warn: 'border-amber-500/50 text-amber-300', gold: 'border-gold-500/60 text-gold-300' }[tone];
  return <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

/** Barras ideológicas multidimensionales (-100..100), con marcador opcional de comparación. */
export function IdeologyBars({ ideology, compare, compareLabel, compact = false }: { ideology: Ideology; compare?: Ideology; compareLabel?: string; compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2.5'}>
      {DIMS.map((d) => {
        const v = ideology[d];
        const pos = (v + 100) / 2;
        return (
          <div key={d}>
            <div className="flex justify-between text-[11px] text-ink-400">
              <span>{DIM_LABELS[d].neg}</span>
              {!compact && <span className="font-semibold text-ink-300">{DIM_LABELS[d].name}</span>}
              <span>{DIM_LABELS[d].pos}</span>
            </div>
            <div className="relative h-2 rounded-full bg-gradient-to-r from-sky-900/60 via-ink-700 to-amber-900/60" aria-label={`${DIM_LABELS[d].name}: ${Math.round(v)}`}>
              <div className="absolute top-1/2 h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-gold-400 shadow" style={{ left: `${pos}%` }} />
              {compare && <div className="absolute top-1/2 h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-ink-100 bg-transparent" style={{ left: `${(compare[d] + 100) / 2}%` }} title={compareLabel} />}
            </div>
          </div>
        );
      })}
      {compare && <div className="text-[11px] text-ink-400"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-gold-400" />propio · <span className="mx-1 inline-block h-2 w-2 rounded-sm border border-ink-100" />{compareLabel}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-ink-700 p-4 text-center text-sm text-ink-400">{children}</div>;
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={`tab ${value === o.id ? 'tab-on' : ''}`} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

/**
 * Retrato «Archivo de Poder» — SISTEMA TEMPORAL DE SILUETAS EDITORIALES.
 * Mientras no exista la biblioteca de retratos ilustrados (docs/CHARACTER_ART_STYLE.md), todos los
 * personajes —reales y ficticios— usan la misma silueta de busto con sus iniciales y una franja del
 * color de su partido. No se dibujan rostros improvisados. La variación (hombros, cuello, peinado
 * en silueta) es determinista según el identificador, de modo que cada personaje es reconocible
 * y consistente entre sesiones.
 */
export function Portrait({ name, color, size = 44, seed, shape = 'square' }: { name: string; color: string; size?: number; seed?: string; shape?: 'square' | 'round' }) {
  let h = 2166136261;
  for (const ch of seed ?? name) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const r = (n: number) => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000 * n; };
  const initials = name.split(/\s+/).filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w)).map((w) => w[0]).slice(0, 2).join('');
  const head = 10.5 + r(1.5); const shoulder = 21 + r(4); const neck = 4 + r(1.2);
  const hair = Math.floor(r(4));
  const hairD = [
    `M${32 - head} ${25} Q32 ${10 - r(2)} ${32 + head} 25 Q${32 + head} 17 32 15.5 Q${32 - head} 17 ${32 - head} 25Z`,
    `M${32 - head - 1.5} 31 Q${31 - head} 11 32 11 Q${33 + head} 11 ${32 + head + 1.5} 31 Q${32 + head} 19 32 17 Q${32 - head} 19 ${32 - head - 1.5} 31Z`,
    '',
    `M${32 - head} 23 Q32 ${12 + r(2)} ${32 + head} 23 L${32 + head} 21 Q32 13 ${32 - head} 21Z`,
  ][hair];
  const uid = `ps${(h >>> 0).toString(36)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={`shrink-0 ${shape === 'round' ? 'rounded-full' : 'rounded-[4px]'}`} role="img" aria-label={`Retrato (silueta editorial): ${name}`}>
      <defs><clipPath id={uid}><rect width="64" height="64" rx={shape === 'round' ? 32 : 5} /></clipPath></defs>
      <g clipPath={`url(#${uid})`}>
        <rect width="64" height="64" fill="rgb(var(--c-surface-2))" />
        <path d={`M${32 - shoulder} 66 Q${32 - shoulder} ${46 + r(2)} 32 ${45 + r(1)} Q${32 + shoulder} ${46 + r(2)} ${32 + shoulder} 66Z`} fill="rgb(var(--c-ink-3))" />
        <rect x={32 - neck} y="34" width={neck * 2} height="12" fill="rgb(var(--c-ink-3))" />
        <ellipse cx="32" cy="28" rx={head} ry={head + 2.5} fill="rgb(var(--c-ink-3))" />
        {hairD && <path d={hairD} fill="rgb(var(--c-ink-2))" />}
        <rect y="61" width="64" height="3" fill={color} />
        {size >= 40 && <text x="5" y="11" fontSize="8" fontFamily="IBM Plex Mono, monospace" fill="rgb(var(--c-muted))">{initials}</text>}
      </g>
      <rect x="0.5" y="0.5" width="63" height="63" rx={shape === 'round' ? 31.5 : 4.5} fill="none" stroke="rgb(var(--c-border))" />
    </svg>
  );
}
