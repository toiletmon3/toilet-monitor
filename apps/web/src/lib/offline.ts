import { openDB, type IDBPDatabase } from 'idb';
import { v4 as uuidv4 } from 'uuid';
import api from './api';

interface OfflineIncident {
  clientId: string;
  restroomId: string;
  issueTypeId: string;
  deviceId: string;
  reportedAt: string;
  // Self-describing snapshot so the team screen can render a queued incident
  // (icon + name) while offline, before it has ever reached the server. Ignored
  // by the server on sync.
  issueType?: { icon?: string; nameI18n?: Record<string, string> } | null;
  synced: boolean;
}

interface OfflineAction {
  clientId: string;
  incidentClientId: string;
  actionType: string;
  cleanerIdNumber?: string;
  notes?: string;
  performedAt: string;
  synced: boolean;
}

/** A queued HTTP request replayed verbatim once the tablet is back online.
 *  Used for team actions that can't go through the incident-clientId sync path:
 *  check-in, check-out, and resolving an incident that already exists on the
 *  server (referenced by its real id, not a client id). */
interface OfflineReplay {
  clientId: string;
  method: string;
  url: string;
  data?: any;
  createdAt: string;
}

let db: IDBPDatabase | null = null;

async function getDB() {
  if (!db) {
    db = await openDB('toilet-offline', 2, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          database.createObjectStore('incidents', { keyPath: 'clientId' });
          database.createObjectStore('actions', { keyPath: 'clientId' });
        }
        if (oldVersion < 2) {
          database.createObjectStore('replays', { keyPath: 'clientId' });
        }
      },
    });
  }
  return db;
}

export async function queueIncident(data: Omit<OfflineIncident, 'clientId' | 'synced'>): Promise<string> {
  const database = await getDB();
  const clientId = uuidv4();
  await database.put('incidents', { ...data, clientId, synced: false });
  return clientId;
}

export async function queueAction(data: Omit<OfflineAction, 'clientId' | 'synced'>): Promise<string> {
  const database = await getDB();
  const clientId = uuidv4();
  await database.put('actions', { ...data, clientId, synced: false });
  return clientId;
}

export async function getPendingCount(): Promise<number> {
  const database = await getDB();
  const [incidents, actions, replays] = await Promise.all([
    database.getAll('incidents'),
    database.getAll('actions'),
    database.getAll('replays'),
  ]);
  const pending =
    incidents.filter((i: OfflineIncident) => !i.synced).length +
    actions.filter((a: OfflineAction) => !a.synced).length +
    replays.length;
  return pending;
}

/** Offline-reported incidents for a restroom that haven't reached the server yet.
 *  These are the "requests that came in while offline" shown on the team screen. */
export async function getQueuedIncidents(restroomId: string): Promise<OfflineIncident[]> {
  const database = await getDB();
  const all = await database.getAll('incidents');
  return all.filter((i: OfflineIncident) => i.restroomId === restroomId && !i.synced);
}

// Several `online` listeners (global bootstrap, kiosk page, team screen) can
// fire at once in the same tab. These guards collapse concurrent calls into a
// single in-flight run so a check-in / resolve is never replayed twice.
let syncInFlight: Promise<boolean> | null = null;
let replayInFlight: Promise<boolean> | null = null;

export function syncPending(deviceId?: string): Promise<boolean> {
  if (!syncInFlight) {
    syncInFlight = syncPendingInner(deviceId).finally(() => { syncInFlight = null; });
  }
  return syncInFlight;
}

async function syncPendingInner(deviceId?: string): Promise<boolean> {
  const database = await getDB();
  const [incidents, actions] = await Promise.all([
    database.getAll('incidents'),
    database.getAll('actions'),
  ]);

  const pendingIncidents = incidents.filter((i: OfflineIncident) => !i.synced);
  const pendingActions = actions.filter((a: OfflineAction) => !a.synced);

  if (pendingIncidents.length === 0 && pendingActions.length === 0) return true;

  try {
    const response = await fetch('/api/incidents/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, incidents: pendingIncidents, actions: pendingActions }),
    });

    if (!response.ok) return false;

    // Mark as synced
    const tx1 = database.transaction('incidents', 'readwrite');
    for (const inc of pendingIncidents) {
      await tx1.store.put({ ...inc, synced: true });
    }
    await tx1.done;

    const tx2 = database.transaction('actions', 'readwrite');
    for (const action of pendingActions) {
      await tx2.store.put({ ...action, synced: true });
    }
    await tx2.done;

    return true;
  } catch {
    return false;
  }
}

/** Queue an HTTP request to be replayed when the tablet regains connectivity. */
export async function queueReplay(req: { method: string; url: string; data?: any }): Promise<string> {
  const database = await getDB();
  const clientId = uuidv4();
  await database.put('replays', { ...req, clientId, createdAt: new Date().toISOString() });
  return clientId;
}

/** Replay all queued team requests. Permanent client errors (4xx that aren't
 *  transient) are dropped so one bad request can't wedge the queue forever;
 *  network/5xx failures are kept for the next attempt. */
export function syncReplays(): Promise<boolean> {
  if (!replayInFlight) {
    replayInFlight = syncReplaysInner().finally(() => { replayInFlight = null; });
  }
  return replayInFlight;
}

async function syncReplaysInner(): Promise<boolean> {
  const database = await getDB();
  const all: OfflineReplay[] = await database.getAll('replays');
  if (all.length === 0) return true;

  let ok = true;
  for (const r of all) {
    try {
      await api.request({ method: r.method, url: r.url, data: r.data });
      await database.delete('replays', r.clientId);
    } catch (e: any) {
      const status = e?.response?.status;
      const transient = status === 408 || status === 429;
      if (status && status >= 400 && status < 500 && !transient) {
        await database.delete('replays', r.clientId); // permanent — give up on it
      } else {
        ok = false; // network error / 5xx — retry next time
      }
    }
  }
  return ok;
}

/** Flush every offline queue. Safe to call repeatedly (all paths are idempotent). */
export async function flushOffline(deviceId?: string): Promise<void> {
  await syncPending(deviceId);
  await syncReplays();
}

// ───────────────────────── Team-screen offline cache ─────────────────────────
// Small, synchronously-readable state kept in localStorage so the team screen
// can render instantly while offline.

/** Roster of staff who have logged in on this tablet while online, so they can
 *  still identify themselves against "what was known until there was internet". */
export interface CachedStaff { name: string; isAdmin: boolean; checkedIn: boolean; cachedAt: string }
const ROSTER_KEY = 'kioskRoster';

export function cacheStaff(idNumber: string, info: { name: string; isAdmin?: boolean; checkedIn?: boolean }): void {
  try {
    const roster: Record<string, CachedStaff> = JSON.parse(localStorage.getItem(ROSTER_KEY) || '{}');
    const prev = roster[idNumber];
    roster[idNumber] = {
      name: info.name,
      isAdmin: info.isAdmin ?? prev?.isAdmin ?? false,
      checkedIn: info.checkedIn ?? prev?.checkedIn ?? false,
      cachedAt: new Date().toISOString(),
    };
    localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
  } catch { /* storage full / disabled — offline login just won't be available */ }
}

export function getCachedStaff(idNumber: string): CachedStaff | null {
  try {
    const roster: Record<string, CachedStaff> = JSON.parse(localStorage.getItem(ROSTER_KEY) || '{}');
    return roster[idNumber] ?? null;
  } catch { return null; }
}

export function setCachedCheckedIn(idNumber: string, checkedIn: boolean): void {
  const s = getCachedStaff(idNumber);
  if (s) cacheStaff(idNumber, { name: s.name, isAdmin: s.isAdmin, checkedIn });
}

/** Cache a whole roster from the server. `replace` overwrites the stored roster
 *  entirely (pruning stale entries — e.g. a worker no longer allowed on this
 *  kiosk); the default merges, used by per-login caching. */
export function cacheRoster(
  entries: Array<{ idNumber: string; name: string; isAdmin?: boolean; checkedIn?: boolean }>,
  replace = false,
): void {
  try {
    const roster: Record<string, CachedStaff> = replace
      ? {}
      : JSON.parse(localStorage.getItem(ROSTER_KEY) || '{}');
    const now = new Date().toISOString();
    for (const e of entries) {
      if (!e?.idNumber) continue;
      const prev = roster[e.idNumber];
      roster[e.idNumber] = {
        name: e.name,
        isAdmin: e.isAdmin ?? prev?.isAdmin ?? false,
        checkedIn: e.checkedIn ?? prev?.checkedIn ?? false,
        cachedAt: now,
      };
    }
    localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
  } catch { /* storage full / disabled — offline login just won't be available */ }
}

/** Fetch the building's staff roster for this kiosk and cache it, so any
 *  assigned worker can log in offline later. Best-effort; a no-op when offline. */
export async function refreshRoster(deviceCode?: string): Promise<void> {
  if (!deviceCode) return;
  // Runs online (live) or offline (served from the api-layer cache if the
  // roster was fetched at least once before).
  try {
    const { data } = await api.get(`/users/kiosk-roster/${deviceCode}`);
    const cleaners = (data?.cleaners ?? []).map((c: any) => ({ idNumber: c.idNumber, name: c.name, isAdmin: false, checkedIn: c.checkedIn }));
    const admins = (data?.admins ?? []).map((a: any) => ({ idNumber: a.idNumber, name: a.name, isAdmin: true }));
    // Replace, don't merge: a worker who is no longer on this kiosk's roster
    // (e.g. reassigned to another property) must drop out of the offline cache.
    cacheRoster([...cleaners, ...admins], true);
  } catch { /* offline / unknown device — keep whatever roster we already have */ }
}

/** Last set of open incidents seen for a restroom while online. */
const incidentsKey = (restroomId: string) => `kioskIncidents:${restroomId}`;

export function cacheRestroomIncidents(restroomId: string, incidents: any[]): void {
  try { localStorage.setItem(incidentsKey(restroomId), JSON.stringify(incidents ?? [])); } catch { /* ignore */ }
}

export function getCachedRestroomIncidents(restroomId: string): any[] {
  try { return JSON.parse(localStorage.getItem(incidentsKey(restroomId)) || '[]'); } catch { return []; }
}

/** issueTypeId → display info, so queued incidents render with the right icon. */
const ISSUE_TYPES_KEY = 'kioskIssueTypes';

export function cacheIssueTypes(list: any[]): void {
  try {
    const map: Record<string, { icon?: string; nameI18n?: Record<string, string> }> =
      JSON.parse(localStorage.getItem(ISSUE_TYPES_KEY) || '{}');
    for (const it of list ?? []) {
      if (it?.id) map[it.id] = { icon: it.icon, nameI18n: it.nameI18n };
    }
    localStorage.setItem(ISSUE_TYPES_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function getCachedIssueType(id: string): { icon?: string; nameI18n?: Record<string, string> } | null {
  try {
    const map = JSON.parse(localStorage.getItem(ISSUE_TYPES_KEY) || '{}');
    return map[id] ?? null;
  } catch { return null; }
}

/** Incidents resolved on the tablet while offline, hidden from the team screen
 *  until the resolution has synced and the server stops returning them. */
const RESOLVED_KEY = 'kioskResolvedLocal';

export function markResolvedLocal(key: string): void {
  try {
    const s: string[] = JSON.parse(localStorage.getItem(RESOLVED_KEY) || '[]');
    if (!s.includes(key)) { s.push(key); localStorage.setItem(RESOLVED_KEY, JSON.stringify(s)); }
  } catch { /* ignore */ }
}

export function getResolvedLocal(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(RESOLVED_KEY) || '[]')); } catch { return new Set(); }
}

export function clearResolvedLocal(): void {
  try { localStorage.removeItem(RESOLVED_KEY); } catch { /* ignore */ }
}
