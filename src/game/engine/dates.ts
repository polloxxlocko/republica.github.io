/** Utilidades de calendario. La unidad de simulación es la semana (lunes a domingo). */
const DAY = 86400000;

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function toISO(d: Date): string { return d.toISOString().slice(0, 10); }

export function weekToDate(startISO: string, week: number): Date {
  return new Date(parseISO(startISO).getTime() + week * 7 * DAY);
}
export function weekToISO(startISO: string, week: number): string { return toISO(weekToDate(startISO, week)); }

/** Semana absoluta que contiene una fecha */
export function dateToWeek(startISO: string, iso: string): number {
  return Math.floor((parseISO(iso).getTime() - parseISO(startISO).getTime()) / (7 * DAY));
}

/** Domingo n-ésimo (1..5) o último (-1) del mes */
export function nthSunday(year: number, month1: number, n: number): string {
  if (n === -1) {
    const last = new Date(Date.UTC(year, month1, 0));
    const back = last.getUTCDay();
    return toISO(new Date(last.getTime() - back * DAY));
  }
  const first = new Date(Date.UTC(year, month1 - 1, 1));
  const offset = (7 - first.getUTCDay()) % 7;
  return toISO(new Date(first.getTime() + (offset + 7 * (n - 1)) * DAY));
}

export function addDaysISO(iso: string, days: number): string { return toISO(new Date(parseISO(iso).getTime() + days * DAY)); }

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function formatDate(iso: string): string {
  const d = parseISO(iso);
  return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}
export function formatShort(iso: string): string {
  const d = parseISO(iso);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}
export function yearOf(startISO: string, week: number): number { return weekToDate(startISO, week).getUTCFullYear(); }
export function monthOf(startISO: string, week: number): number { return weekToDate(startISO, week).getUTCMonth() + 1; }
