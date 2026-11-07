/**
 * Método D'Hondt (cifra repartidora). Usado en elecciones de diputados, senadores y concejales
 * (Ley 20.840 y legislación municipal). NO se usa en presidenciales, alcaldes ni gobernadores.
 *
 * Empates: se resuelven a favor de la mayor votación total y luego por orden alfabético de clave,
 * de forma determinista (simplificación documentada: la ley prevé sorteo).
 */
export function dhondt(votes: Record<string, number>, seats: number, caps?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  const keys = Object.keys(votes).filter((k) => votes[k] > 0).sort();
  for (const k of keys) out[k] = 0;
  if (seats <= 0 || keys.length === 0) return out;
  for (let i = 0; i < seats; i++) {
    let best: string | null = null; let bestQ = -1;
    for (const k of keys) {
      if (caps && caps[k] !== undefined && out[k] >= caps[k]) continue;
      const q = votes[k] / (out[k] + 1);
      if (q > bestQ + 1e-9 || (Math.abs(q - bestQ) <= 1e-9 && best !== null && votes[k] > votes[best])) { best = k; bestQ = q; }
    }
    if (best === null) break;
    out[best] += 1;
  }
  return out;
}

/** Lista de cocientes (para mostrar la cifra repartidora en la interfaz). */
export function dhondtQuotients(votes: Record<string, number>, seats: number): { key: string; divisor: number; quotient: number; elected: boolean }[] {
  const all: { key: string; divisor: number; quotient: number; elected: boolean }[] = [];
  for (const [k, v] of Object.entries(votes)) for (let d = 1; d <= seats; d++) all.push({ key: k, divisor: d, quotient: v / d, elected: false });
  all.sort((a, b) => b.quotient - a.quotient || a.key.localeCompare(b.key));
  for (let i = 0; i < Math.min(seats, all.length); i++) all[i].elected = true;
  return all;
}

/**
 * Asignación en dos niveles con pactos: primero D'Hondt entre listas; luego, dentro de cada
 * lista, D'Hondt entre partidos (o subpactos); finalmente, los candidatos más votados del partido.
 */
export function allocateWithPacts(
  listVotesByParty: Record<string, Record<string, number>>, // listId -> partyId -> votos
  seats: number,
  candidateCaps: Record<string, number>,                    // partyId -> nº candidatos
): { byList: Record<string, number>; byParty: Record<string, number> } {
  const listTotals: Record<string, number> = {};
  const listCaps: Record<string, number> = {};
  for (const [l, parties] of Object.entries(listVotesByParty)) {
    listTotals[l] = Object.values(parties).reduce((a, b) => a + b, 0);
    listCaps[l] = Object.keys(parties).reduce((a, p) => a + (candidateCaps[p] ?? 0), 0);
  }
  const byList = dhondt(listTotals, seats, listCaps);
  const byParty: Record<string, number> = {};
  for (const [l, n] of Object.entries(byList)) {
    if (n <= 0) continue;
    const inner = dhondt(listVotesByParty[l], n, candidateCaps);
    for (const [p, k] of Object.entries(inner)) byParty[p] = (byParty[p] ?? 0) + k;
  }
  return { byList, byParty };
}
