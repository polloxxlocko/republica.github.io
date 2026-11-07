/**
 * Persistencia en IndexedDB (múltiples partidas, guardado manual y automático).
 * Se usa una tabla de metadatos liviana y otra con el estado completo serializado.
 */
import type { GameState } from '../game/models/types';
import { deserialize, serialize } from './saveFormat';
import { officeLabel } from '../game/systems/characters';
import { weekToISO } from '../game/engine/dates';

const DB_NAME = 'republica-chile';
const DB_VERSION = 1;

export interface SaveMeta {
  slot: string;           // id del guardado
  gameId: string;
  name: string;
  kind: 'manual' | 'auto';
  savedAt: string;
  week: number;
  date: string;
  playerName: string;
  office: string;
  party: string;
  schemaVersion: number;
  size: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB no disponible en este navegador')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'slot' });
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result: T | undefined;
    const r = fn(t);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Transacción abortada'));
  });
}

export function metaOf(g: GameState, slot: string, kind: 'manual' | 'auto', size: number): SaveMeta {
  const c = g.characters[g.player.characterId];
  const top = c?.offices.find((o) => o.type !== 'presidente_partido') ?? c?.offices[0];
  return {
    slot, gameId: g.id, name: g.name, kind, savedAt: new Date().toISOString(), week: g.week, date: weekToISO(g.startDate, g.week),
    playerName: c ? `${c.firstName} ${c.lastName}` : '—', office: top ? officeLabel(top.type, c.gender) : 'Militante', party: c?.partyId ? g.parties[c.partyId]?.short ?? '' : 'Independiente',
    schemaVersion: g.schemaVersion, size,
  };
}

export async function saveGame(g: GameState, kind: 'manual' | 'auto', slot?: string): Promise<SaveMeta> {
  const db = await open();
  const data = serialize(g);
  const id = slot ?? (kind === 'auto' ? `auto-${g.id}` : `${g.id}-${Date.now()}`);
  const meta = metaOf(g, id, kind, data.length);
  await tx(db, ['meta', 'data'], 'readwrite', (t) => { t.objectStore('meta').put(meta); t.objectStore('data').put(data, id); });
  db.close();
  return meta;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const db = await open();
  const all = await tx<SaveMeta[]>(db, ['meta'], 'readonly', (t) => t.objectStore('meta').getAll() as IDBRequest<SaveMeta[]>);
  db.close();
  return (all ?? []).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function loadGame(slot: string): Promise<GameState> {
  const db = await open();
  const data = await tx<string>(db, ['data'], 'readonly', (t) => t.objectStore('data').get(slot) as IDBRequest<string>);
  db.close();
  if (!data) throw new Error('No se encontró el guardado');
  return deserialize(data);
}

export async function rawSave(slot: string): Promise<string | undefined> {
  const db = await open();
  const data = await tx<string>(db, ['data'], 'readonly', (t) => t.objectStore('data').get(slot) as IDBRequest<string>);
  db.close();
  return data;
}

export async function deleteSave(slot: string): Promise<void> {
  const db = await open();
  await tx(db, ['meta', 'data'], 'readwrite', (t) => { t.objectStore('meta').delete(slot); t.objectStore('data').delete(slot); });
  db.close();
}
