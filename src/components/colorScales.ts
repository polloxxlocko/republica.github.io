/**
 * Escalas de color para mapas (superficie oscura). Secuencial: un solo tono (azul), de oscuro
 * (cerca de cero, se funde con la superficie) a claro. Divergente: azul ↔ gris neutro ↔ rojo.
 * Categórica: orden fijo, nunca cíclico (paleta validada de referencia).
 */
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`;
function lerpColor(a: string, b: string, t: number): string { const A = hex(a); const B = hex(b); return toHex(A.map((x, i) => x + (B[i] - x) * t)); }
function ramp(stops: string[], t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return lerpColor(stops[i], stops[i + 1], x - i);
}
export const SEQ_STOPS = ['#1a2740', '#104281', '#1c5cab', '#3987e5', '#86b6ef', '#cde2fb'];
export const DIV_NEG = ['#cde2fb', '#3987e5', '#1c5cab'];
export const DIV_MID = '#383835';
export const DIV_POS = ['#e66767', '#c94545', '#8f2b2b'];
export const CATEGORICAL = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const NO_DATA = '#2a2f3a';

export function sequential(t: number): string { return ramp(SEQ_STOPS, t); }
/** t en [−1, 1]: negativo → azul, 0 → gris, positivo → rojo. */
export function diverging(t: number): string {
  if (!Number.isFinite(t)) return NO_DATA;
  if (t < 0) return lerpColor(DIV_MID, ramp([...DIV_NEG].reverse(), 1 - Math.min(1, -t)), Math.min(1, -t * 1.2));
  return lerpColor(DIV_MID, ramp(DIV_POS, Math.min(1, t)), Math.min(1, t * 1.2));
}
