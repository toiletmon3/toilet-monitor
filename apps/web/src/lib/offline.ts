import { openDB, type IDBPDatabase } from 'idb';
import { v4 as uuidv4 } from 'uuid';

interface OfflineIncident {
  clientId: string;
  restroomId: string;
  issueTypeId: string;
  deviceId: string;
  reportedAt: string;
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

let db: IDBPDatabase | null = null;

async function getDB() {
  if (!db) {
    db = await openDB('toilet-offline', 1, {
      upgrade(database) {
        database.createObjectStore('incidents', { keyPath: 'clientId' });
        database.createObjectStore('actions', { keyPath: 'clientId' });
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
  const [incidents, actions] = await Promise.all([
    database.getAll('incidents'),
    database.getAll('actions'),
  ]);
  const pending =
    incidents.filter((i: OfflineIncident) => !i.synced).length +
    actions.filter((a: OfflineAction) => !a.synced).length;
  return pending;
}

export async function syncPending(deviceId: string): Promise<boolean> {
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
