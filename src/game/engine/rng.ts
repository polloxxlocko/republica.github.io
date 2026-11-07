/**
 * Generador pseudoaleatorio con semilla (sfc32). El estado (4 enteros de 32 bits) vive dentro
 * de GameState.rng, de modo que la misma semilla + la misma secuencia de acciones produce
 * exactamente la misma partida.
 */
export type RngState = [number, number, number, number];

export function seedRng(seed: number): RngState {
  // splitmix32 para expandir la semilla
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const st: RngState = [next(), next(), next(), next()];
  const r = new Rng(st);
  for (let i = 0; i < 12; i++) r.next();
  return r.state;
}

export class Rng {
  state: RngState;
  constructor(state: RngState) { this.state = [...state] as RngState; }
  /** Uniforme en [0,1) */
  next(): number {
    let [a, b, c, d] = this.state;
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    this.state = [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
    return t / 4294967296;
  }
  range(min: number, max: number): number { return min + (max - min) * this.next(); }
  int(min: number, maxInclusive: number): number { return Math.floor(this.range(min, maxInclusive + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  /** Normal estándar (Box-Muller) */
  normal(mean = 0, sd = 1): number {
    const u = Math.max(1e-12, this.next());
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
    if (total <= 0) return items[0];
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
