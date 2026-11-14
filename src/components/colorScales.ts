/**
 * Escalas de color para mapas (superficie clara «Archivo de Poder»). Secuencial: un solo tono (azul),
 * de claro (cerca de cero, se funde con la superficie) a oscuro. Divergente: azul ↔ gris neutro ↔ rojo.
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
export const SEQ_STOPS = ['#ece7dd', '#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#104281'];
export const DIV_MID = '#e9e5de';
export const DIV_NEG = ['#9ec5f4', '#3987e5', '#184f95'];
export const DIV_POS = ['#f3b0b0', '#e34948', '#9e2a2a'];
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const NO_DATA = '#d6cfc3';

export function sequential(t: number): string { return ramp(SEQ_STOPS, t); }
/** t en [−1, 1]: negativo → azul, 0 → gris, positivo → rojo. */
export function diverging(t: number): string {
  if (!Number.isFinite(t)) return NO_DATA;
  return t < 0 ? ramp([DIV_MID, ...DIV_NEG], Math.min(1, -t)) : ramp([DIV_MID, ...DIV_POS], Math.min(1, t));
}
