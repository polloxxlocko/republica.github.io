/**
 * ENCUESTAS. Las encuestadoras (ficticias) miden la intención "real" con error muestral,
 * sesgos de casa, indecisos y ruido. Intención de voto estimada ≠ resultado electoral.
 */
import type { GameState, Poll } from '../models/types';
import { Rng } from '../engine/rng';
import { POLLSTERS } from '../data/institutions';
import { DIFFICULTY, clamp } from '../rules/params';
import { newId } from './util';
import { buildUtilityContext, computeShares, type VoteOption } from './electorate';
import { candidateQuality, ageOf } from './characters';
import { listIdOf, nextElection } from './elections';

export function marginOfError(n: number): number { return 1.96 * Math.sqrt(0.25 / n) * 100; }

function noisy(rng: Rng, p: number, n: number, house: number, k: number): number {
  const se = Math.sqrt(Math.max(p, 0.5) / 100 * (1 - p / 100) / n) * 100;
  return clamp(p + house + rng.normal(0, se * k), 0, 100);
}

/** Candidatos presidenciales probables (sin crear personajes). */
export function previewPresidentialField(s: GameState): { id: string; partyId: string; listId: string }[] {
  const lists = new Set(Object.values(s.parties).filter((p) => p.active && p.legalStatus !== 'en_formacion').map((p) => listIdOf(s, p.id)));
  const out: { id: string; partyId: string; listId: string }[] = [];
  for (const l of lists) {
    const membersOf = s.coalitions[l]?.members ?? [l];
    const support = membersOf.reduce((a, p) => a + (s.nationalIntention[p] ?? 0), 0);
    if (!s.coalitions[l] && support < 4) continue;
    let id = s.presidentialCandidates[l];
    if (!id || s.characters[id]?.status !== 'activo') {
      let best = ''; let bestQ = -1;
      for (const c of Object.values(s.characters)) {
        if (c.status !== 'activo' || !c.partyId || !membersOf.includes(c.partyId) || c.offices.some((o) => o.type === 'presidente') || ageOf(s, c) < 35) continue;
        if (c.isPlayer && !s.player.candidacies.some((x) => x.office === 'presidente' && x.approved)) continue;
        const q = candidateQuality(c) + (s.nationalIntention[c.partyId] ?? 0) * 0.6;
        if (q > bestQ) { bestQ = q; best = c.id; }
      }
      id = best;
    }
    if (id) out.push({ id, partyId: s.characters[id].partyId ?? l, listId: l });
  }
  return out;
}

export function presidentialIntention(s: GameState): Record<string, number> {
  const field = previewPresidentialField(s);
  if (field.length === 0) return {};
  const ctx = buildUtilityContext(s, true);
  const opts: VoteOption[] = field.map((f) => ({ key: f.id, partyId: f.partyId, ideology: s.characters[f.id].ideology, quality: candidateQuality(s.characters[f.id]) }));
  const res = computeShares(s, opts, ctx);
  const out: Record<string, number> = {};
  for (const f of field) out[f.id] = ((res.national[f.id] ?? 0) / Math.max(res.totalValid, 1)) * 100;
  return out;
}

export function weeklyPolls(s: GameState, rng: Rng): void {
  const k = DIFFICULTY[s.settings.difficulty].pollNoise;
  const nextPres = nextElection(s, ['presidencial']);
  for (const pl of POLLSTERS) {
    if (s.week % pl.frequency !== 0) continue;
    const n = Math.round(pl.sample * (0.85 + rng.next() * 0.3));
    const undecided = clamp(rng.normal(18, 4), 6, 35);
    const values: Record<string, number> = {};
    for (const [p, v] of Object.entries(s.nationalIntention)) values[p] = noisy(rng, v, n, pl.houseEffect[p] ?? 0, k) * (1 - undecided / 100);
    s.polls.push({ id: newId(s, 'p'), week: s.week, pollster: pl.id, sample: n, moe: marginOfError(n), kind: 'partidos', values, undecided });
    s.polls.push({ id: newId(s, 'p'), week: s.week, pollster: pl.id, sample: n, moe: marginOfError(n), kind: 'aprobacion', values: { aprueba: noisy(rng, s.opinion.presidentialApproval, n, (pl.houseEffect.REP ?? 0) * 0.5, k), desaprueba: 0 }, undecided: 0 });
    const last = s.polls[s.polls.length - 1];
    last.values.desaprueba = clamp(100 - last.values.aprueba - clamp(rng.normal(8, 2), 3, 15), 0, 100);
    if (nextPres && nextPres.week - s.week <= 60 && pl.frequency <= 3) {
      const pi = presidentialIntention(s);
      const pv: Record<string, number> = {};
      for (const [c, v] of Object.entries(pi)) pv[c] = noisy(rng, v, n, 0, k) * (1 - undecided / 100);
      s.polls.push({ id: newId(s, 'p'), week: s.week, pollster: pl.id, sample: n, moe: marginOfError(n), kind: 'presidencial', values: pv, undecided });
    }
  }
  if (s.polls.length > 600) s.polls.splice(0, s.polls.length - 600);
}

/** Promedio de encuestas recientes (lo que ven el jugador y la IA). */
export function pollAverage(s: GameState, kind: Poll['kind'], weeks = 8): Record<string, number> {
  const recent = s.polls.filter((p) => p.kind === kind && s.week - p.week <= weeks);
  const out: Record<string, number> = {}; const cnt: Record<string, number> = {};
  for (const p of recent) for (const [k, v] of Object.entries(p.values)) { out[k] = (out[k] ?? 0) + v; cnt[k] = (cnt[k] ?? 0) + 1; }
  for (const k of Object.keys(out)) out[k] /= cnt[k];
  return out;
}

/**
 * Apoyo regional PERCIBIDO por los actores (información imperfecta): último resultado regional
 * ajustado por la variación del promedio de encuestas nacional. La IA nunca lee la intención real.
 */
export function perceivedSupport(s: GameState, regionId: import('../models/types').RegionId): Record<string, number> {
  const reg = s.regions[regionId];
  const polls = pollAverage(s, 'partidos', 8);
  const lastNat: Record<string, number> = {};
  for (const r of Object.values(s.regions)) for (const [p, v] of Object.entries(r.lastResults)) lastNat[p] = (lastNat[p] ?? 0) + v / 16;
  const out: Record<string, number> = {};
  for (const p of Object.values(s.parties)) {
    if (!p.active || p.legalStatus === 'en_formacion') continue;
    const base = reg.lastResults[p.id];
    const poll = polls[p.id];
    if (base !== undefined && poll !== undefined && lastNat[p.id]) out[p.id] = base * Math.min(3, Math.max(0.3, (poll / 100) / lastNat[p.id] / 0.82));
    else out[p.id] = poll !== undefined ? poll / 100 : 0.01;
  }
  const tot = Object.values(out).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(out)) out[k] /= tot;
  return out;
}
