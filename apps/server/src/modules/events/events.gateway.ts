import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger(EventsGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:org')
  handleJoinOrg(
    @MessageBody() data: { orgId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`org:${data.orgId}`);
    return { status: 'joined', room: `org:${data.orgId}` };
  }

  @SubscribeMessage('join:restroom')
  handleJoinRestroom(
    @MessageBody() data: { restroomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`restroom:${data.restroomId}`);
    return { status: 'joined', room: `restroom:${data.restroomId}` };
  }

  @SubscribeMessage('device:heartbeat')
  handleHeartbeat(
    @MessageBody() data: { deviceId: string; restroomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    // Heartbeat received - device is alive
    client.data.deviceId = data.deviceId;
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  broadcastToOrg(orgId: string, event: string, data: any) {
    this.server.to(`org:${orgId}`).emit(event, data);
  }

  broadcastToRestroom(restroomId: string, event: string, data: any) {
    this.server.to(`restroom:${restroomId}`).emit(event, data);
  }

  broadcastToAll(event: string, data: any) {
    this.server.emit(event, data);
  }
}
