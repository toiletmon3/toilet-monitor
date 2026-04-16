import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
    });
  }
  return socket;
}

export function joinOrg(orgId: string) {
  getSocket().emit('join:org', { orgId });
}

export function joinRestroom(restroomId: string) {
  getSocket().emit('join:restroom', { restroomId });
}

export function sendHeartbeat(deviceId: string, restroomId: string) {
  getSocket().emit('device:heartbeat', { deviceId, restroomId });
}
