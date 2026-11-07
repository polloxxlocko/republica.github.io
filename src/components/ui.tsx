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

export function Bar({ value, max = 100, color = '#c9a24a', label, showValue = true, height = 'h-2' }: { value: number; max?: number; color?: string; label?: string; showValue?: boolean; height?: string }) {
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
 * Retrato ilustrado «Archivo de Poder»: grabado editorial a dos tintas (tinta y papel de archivo),
 * con trama de líneas y una franja del color del partido. El mismo lenguaje para personas reales y
 * ficticias: el juego no intenta reproducir rasgos de personas reales ni usa fotografías.
 * Los rasgos se derivan de forma determinista del identificador (consistentes entre sesiones).
 */
export function Portrait({ name, color, size = 44, seed }: { name: string; color: string; size?: number; seed?: string }) {
  let h = 2166136261;
  for (const ch of seed ?? name) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const r = (n: number) => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000 * n; };
  const uid = `pt${(h >>> 0).toString(36)}${size}`;
  const face = 13 + r(3); const jaw = 15 + r(4);
  const hair = Math.floor(r(6)); const glasses = r(1) < 0.3; const collar = Math.floor(r(3));
  const ink = '#1d2433'; const paper = '#e9dfc8';
  const hairPath = [
    `M${32 - face} 26 Q32 ${8 + r(3)} ${32 + face} 26 Q${32 + face - 2} 15 32 14 Q${32 - face + 2} 15 ${32 - face} 26Z`,
    `M${32 - face - 1} 30 Q${30 - face} 12 32 11 Q${34 + face} 12 ${33 + face} 30 L${31 + face} 22 Q32 17 ${33 - face} 22Z`,
    `M${32 - face} 24 Q32 ${12 + r(2)} ${32 + face} 24 L${32 + face} 21 Q32 11 ${32 - face} 21Z`,
    `M${31 - face} 38 Q${28 - face} 12 32 10 Q${36 + face} 12 ${33 + face} 38 L${30 + face} 24 Q32 18 ${34 - face} 24Z`,
    `M${32 - face + 1} 22 Q32 ${15 + r(2)} ${32 + face - 1} 22 L${32 + face - 1} 20 Q32 14 ${32 - face + 1} 20Z`,
    `M${32 - face - 2} 34 Q${29 - face} 9 32 9 Q${35 + face} 9 ${32 + face + 2} 34 Q${32 + face} 20 32 18 Q${32 - face} 20 ${32 - face - 2} 34Z`,
  ][hair];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0 rounded-full" role="img" aria-label={`Retrato ilustrado: ${name}`}>
      <defs>
        <pattern id={`${uid}h`} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="3" stroke={ink} strokeWidth="0.9" opacity="0.55" /></pattern>
        <clipPath id={`${uid}c`}><circle cx="32" cy="32" r="32" /></clipPath>
      </defs>
      <g clipPath={`url(#${uid}c)`}>
        <rect width="64" height="64" fill={paper} />
        <rect width="64" height="64" fill={`url(#${uid}h)`} opacity="0.35" />
        <rect y="56" width="64" height="8" fill={color} opacity="0.9" />
        <path d={`M8 64 Q10 ${46 + r(3)} 32 ${45 + r(2)} Q54 ${46 + r(3)} 56 64Z`} fill={ink} />
        {collar === 0 && <path d="M27 46 L32 56 L37 46Z" fill={paper} />}
        {collar === 1 && <path d="M26 46 L32 52 L38 46 L36 46 L32 50 L28 46Z" fill={paper} />}
        {collar === 2 && <path d="M29 46 L32 58 L35 46Z" fill={color} opacity="0.85" />}
        <rect x="28" y="38" width="8" height="9" fill={paper} stroke={ink} strokeWidth="0.8" />
        <ellipse cx="32" cy="29" rx={face} ry={jaw} fill={paper} stroke={ink} strokeWidth="1.1" />
        <ellipse cx={32 + face * 0.25} cy="31" rx={face * 0.75} ry={jaw * 0.85} fill={`url(#${uid}h)`} opacity="0.5" />
        <path d={hairPath} fill={ink} />
        <circle cx={32 - face * 0.38} cy="29" r="1" fill={ink} /><circle cx={32 + face * 0.38} cy="29" r="1" fill={ink} />
        <path d={`M${30.5} ${31} Q32 ${34 + r(1)} 33 ${33}`} stroke={ink} strokeWidth="0.7" fill="none" />
        <path d={`M${29} ${37 + r(1)} Q32 ${38.5 + r(1)} 35 ${37 + r(1)}`} stroke={ink} strokeWidth="0.8" fill="none" />
        {glasses && <g stroke={ink} strokeWidth="0.9" fill="none"><circle cx={32 - face * 0.38} cy="29" r="2.8" /><circle cx={32 + face * 0.38} cy="29" r="2.8" /><line x1={32 - face * 0.38 + 2.8} y1="29" x2={32 + face * 0.38 - 2.8} y2="29" /></g>}
      </g>
      <circle cx="32" cy="32" r="31.4" fill="none" stroke={ink} strokeWidth="1.2" opacity="0.7" />
    </svg>
  );
}
