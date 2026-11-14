/** Hemiciclo interactivo: un círculo por escaño, ordenado por posición ideológica de su bancada. */
import { useMemo } from 'react';
import type { GameState } from '../game/models/types';
import { leftRight } from '../game/systems/util';
import { charName, partyColor, partyShort } from '../app/selectors';

interface Props { g: GameState; chamber: 'camara' | 'senado'; selected?: string | null; onSelect?: (charId: string) => void; highlightParty?: string | null; votes?: Record<string, 'yes' | 'no' | 'abst'> }

export function Hemicycle({ g, chamber, selected, onSelect, highlightParty }: Props) {
  const { points, seats } = useMemo(() => {
    const seats = g.seats.filter((s) => s.chamber === chamber).map((s) => {
      const c = s.holderId ? g.characters[s.holderId] : null;
      const party = c ? c.partyId ?? 'IND' : 'VAC';
      const lr = c ? (c.partyId && g.parties[c.partyId] ? leftRight(g.parties[c.partyId].ideology) : leftRight(c.ideology)) : 999;
      return { seat: s, c, party, lr: lr + (c ? leftRight(c.ideology) * 0.05 : 0) };
    }).sort((a, b) => a.lr - b.lr || a.party.localeCompare(b.party));
    const n = seats.length;
    const rows = chamber === 'camara' ? 8 : 4;
    const r0 = 0.35; const r1 = 1;
    const radii = Array.from({ length: rows }, (_, i) => r0 + ((r1 - r0) * i) / (rows - 1));
    const totalR = radii.reduce((a, b) => a + b, 0);
    let counts = radii.map((r) => Math.round((n * r) / totalR));
    let diff = n - counts.reduce((a, b) => a + b, 0);
    counts = counts.map((c, i) => (i === rows - 1 ? c + diff : c));
    diff = 0;
    const pts: { x: number; y: number; a: number }[] = [];
    radii.forEach((r, i) => {
      const k = counts[i];
      for (let j = 0; j < k; j++) {
        const a = Math.PI - (Math.PI * (j + 0.5)) / k;
        pts.push({ x: r * Math.cos(a), y: r * Math.sin(a), a });
      }
    });
    pts.sort((p, q) => q.a - p.a);
    return { points: pts, seats };
  }, [g, chamber]);
  const rDot = chamber === 'camara' ? 0.028 : 0.05;
  return (
    <svg viewBox="-1.08 -0.06 2.16 1.16" className="w-full" role="group" aria-label={chamber === 'camara' ? 'Hemiciclo de la Cámara de Diputadas y Diputados' : 'Hemiciclo del Senado'}>
      <g transform="scale(1,-1) translate(0,-1.05)">
        {points.map((p, i) => {
          const s = seats[i];
          if (!s) return null;
          const dim = highlightParty && s.party !== highlightParty;
          const isSel = selected && s.c?.id === selected;
          return (
            <circle key={s.seat.id} cx={p.x} cy={p.y} r={rDot} fill={partyColor(g, s.party)} opacity={dim ? 0.18 : 1}
              stroke={isSel ? '#27313B' : s.c?.isPlayer ? '#782F3D' : 'rgba(252,250,246,0.9)'} strokeWidth={isSel || s.c?.isPlayer ? 0.012 : 0.004}
              className={onSelect && s.c ? 'cursor-pointer' : ''} tabIndex={onSelect && s.c ? 0 : -1}
              onClick={() => s.c && onSelect?.(s.c.id)} onKeyDown={(e) => { if (e.key === 'Enter' && s.c) onSelect?.(s.c.id); }}>
              <title>{s.c ? `${charName(g, s.c.id)} (${partyShort(g, s.party)})` : 'Vacante'}</title>
            </circle>
          );
        })}
      </g>
      <text x="0" y="1.02" textAnchor="middle" fontSize="0.09" fill="#27313B" fontFamily="IBM Plex Mono">{seats.length}</text>
    </svg>
  );
}
