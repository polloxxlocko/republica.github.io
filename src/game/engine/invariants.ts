/**
 * INVARIANTES DEL MOTOR. Se verifican en pruebas automáticas y (en desarrollo) tras cada turno.
 */
import type { GameState } from '../models/types';
import { PARLIAMENT } from '../rules/params';

export function checkInvariants(s: GameState): string[] {
  const v: string[] = [];
  const deputies = s.seats.filter((x) => x.chamber === 'camara');
  const senators = s.seats.filter((x) => x.chamber === 'senado');
  if (deputies.length !== PARLIAMENT.deputies) v.push(`Cámara con ${deputies.length} escaños (esperado ${PARLIAMENT.deputies})`);
  if (senators.length !== PARLIAMENT.senators) v.push(`Senado con ${senators.length} escaños (esperado ${PARLIAMENT.senators})`);
  const holders = new Map<string, number>();
  for (const st of s.seats) if (st.holderId) holders.set(st.holderId, (holders.get(st.holderId) ?? 0) + 1);
  for (const [id, n] of holders) if (n > 1) v.push(`Personaje ${id} ocupa ${n} escaños`);
  for (const st of s.seats) {
    if (!st.holderId) continue;
    const c = s.characters[st.holderId];
    if (!c) { v.push(`Escaño ${st.id} con titular inexistente`); continue; }
    if (c.status !== 'activo') v.push(`Escaño ${st.id} ocupado por personaje ${c.status}`);
    const type = st.chamber === 'camara' ? 'diputado' : 'senador';
    if (!c.offices.some((o) => o.type === type)) v.push(`Titular de ${st.id} sin cargo ${type}`);
  }
  for (const c of Object.values(s.characters)) {
    if (c.status !== 'activo' && c.offices.length > 0) v.push(`Personaje ${c.status} ${c.id} con cargos activos`);
    const leg = c.offices.filter((o) => o.type === 'diputado' || o.type === 'senador').length;
    if (leg > 1) v.push(`Personaje ${c.id} en ambas cámaras`);
    if (c.partyId && !s.parties[c.partyId]) v.push(`Personaje ${c.id} con partido inexistente ${c.partyId}`);
  }
  for (const k of Object.values(s.coalitions)) {
    if (!k.active) continue;
    for (const m of k.members) if (!s.parties[m]) v.push(`Coalición ${k.name} con miembro inexistente ${m}`);
    if (new Set(k.members).size !== k.members.length) v.push(`Coalición ${k.name} con miembros duplicados`);
  }
  const memberships = new Map<string, number>();
  for (const k of Object.values(s.coalitions)) if (k.active) for (const m of k.members) memberships.set(m, (memberships.get(m) ?? 0) + 1);
  for (const [p, n] of memberships) if (n > 1) v.push(`Partido ${p} en ${n} coaliciones activas`);
  const presidents = Object.values(s.characters).filter((c) => c.offices.some((o) => o.type === 'presidente'));
  if (presidents.length !== 1) v.push(`Hay ${presidents.length} Presidentes en ejercicio`);
  for (let i = 1; i < s.calendar.length; i++) if (s.calendar[i].week < s.calendar[i - 1].week) v.push('Calendario electoral desordenado');
  for (const r of s.results) {
    const tot = Object.values(r.nationalPartyPct).reduce((a, b) => a + b, 0);
    if (r.type !== 'primarias' && Object.keys(r.nationalPartyPct).length && Math.abs(tot - 100) > 0.5) v.push(`Resultado ${r.id} suma ${tot.toFixed(2)}%`);
    for (const u of r.units) if (['diputados', 'senadores'].includes(r.type) && u.elected.length > u.seats) v.push(`Unidad ${u.unitId} con más electos que escaños`);
  }
  for (const b of s.bills) for (const vote of b.votes) if (vote.yes + vote.no + vote.abst > PARLIAMENT.deputies) v.push(`Votación con más votos que miembros (${b.id})`);
  if (s.player.personalFunds < 0) v.push('Recursos del jugador negativos');
  for (const p of Object.values(s.parties)) if (p.funds < 0) v.push(`Fondos negativos en ${p.id}`);
  const e = s.economy;
  for (const [k, val] of Object.entries(e)) if (typeof val === 'number' && !Number.isFinite(val)) v.push(`Economía: ${k} no finito`);
  if (!Number.isFinite(s.opinion.presidentialApproval)) v.push('Aprobación no finita');
  for (const p of Object.values(s.parties)) if (p.legalStatus === 'disuelto' && p.active) v.push(`Partido disuelto activo: ${p.id}`);
  // Territorio
  if (s.comunas && Object.keys(s.comunas).length !== 346) v.push(`Hay ${Object.keys(s.comunas).length} comunas (esperado 346)`);
  for (const seg of s.segments) if (!s.comunas?.[seg.cut]) { v.push(`Segmento ${seg.id} sin comuna`); break; }
  for (const c of Object.values(s.comunas ?? {})) {
    if (Object.values(c.campaign).some((x) => !Number.isFinite(x) || x < 0)) { v.push(`Inversión inválida en comuna ${c.cut}`); break; }
    if (Object.values(c.org).some((x) => !Number.isFinite(x) || x < 0 || x > 1)) { v.push(`Organización fuera de rango en comuna ${c.cut}`); break; }
  }
  return v;
}
