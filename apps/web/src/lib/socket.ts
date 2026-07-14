import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

// Rooms this client belongs to. A socket that drops and reconnects (very common
// on mobile / network changes) silently LEAVES all its rooms, which otherwise
// kills every live update until a full page reload. We remember the rooms and
// re-join them on each (re)connect so live updates keep flowing.
let joinedOrgId: string | null = null;
const joinedRestroomIds = new Set<string>();

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
    });
    socket.on('connect', () => {
      if (joinedOrgId) socket!.emit('join:org', { orgId: joinedOrgId });
      for (const restroomId of joinedRestroomIds) socket!.emit('join:restroom', { restroomId });
    });
  }
  return socket;
}

export function joinOrg(orgId: string) {
  joinedOrgId = orgId;
  getSocket().emit('join:org', { orgId });
}

export function joinRestroom(restroomId: string) {
  joinedRestroomIds.add(restroomId);
  getSocket().emit('join:restroom', { restroomId });
}

export function sendHeartbeat(deviceId: string, restroomId: string) {
  getSocket().emit('device:heartbeat', { deviceId, restroomId });
}
