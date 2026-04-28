import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private userSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Attach the Socket.IO Redis adapter when REDIS_HOST is configured so
   * events broadcast across all backend instances. Silently falls back to
   * the default in-memory adapter if Redis is unreachable.
   */
  async afterInit(server: Server): Promise<void> {
    const redisHost = process.env.REDIS_HOST;
    if (!redisHost) {
      this.logger.log('Socket.IO using in-memory adapter (REDIS_HOST not set)');
      return;
    }

    try {
      const { createAdapter } = await import('@socket.io/redis-adapter');
      const { createClient } = await import('redis');

      const pubClient = createClient({
        socket: {
          host: redisHost,
          port: Number(process.env.REDIS_PORT || 6379),
        },
        password: process.env.REDIS_PASSWORD || undefined,
      });
      const subClient = pubClient.duplicate();

      pubClient.on('error', (err) =>
        this.logger.warn(`Socket.IO Redis pub client error: ${err?.message || err}`),
      );
      subClient.on('error', (err) =>
        this.logger.warn(`Socket.IO Redis sub client error: ${err?.message || err}`),
      );

      await Promise.all([pubClient.connect(), subClient.connect()]);
      server.adapter(createAdapter(pubClient, subClient));
      this.logger.log(
        `Socket.IO Redis adapter attached (${redisHost}:${process.env.REDIS_PORT || 6379})`,
      );
    } catch (err: any) {
      this.logger.warn(
        `Socket.IO Redis adapter failed (${err?.message || err}) — using in-memory adapter`,
      );
    }
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });

      const userId = payload.sub;
      client.data.userId = userId;

      // Join user's personal room
      client.join(`user:${userId}`);

      // Track socket
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      this.logger.log(`Client connected: ${client.id} (user: ${userId})`);
    } catch (error) {
      this.logger.warn(`Connection rejected: invalid token`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      this.userSockets.get(userId)?.delete(client.id);
      if (this.userSockets.get(userId)?.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Send notification to a specific user
  sendNotificationToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }

  /**
   * Emit a custom event to a list of users.
   * Used for example by the lab-orders flow to push new orders to lab users
   * in real-time so they don't have to refetch.
   */
  emitToUsers(userIds: string[], event: string, payload: any) {
    if (!userIds.length) return;
    const rooms = userIds.map((id) => `user:${id}`);
    this.server.to(rooms).emit(event, payload);
  }

  // Send message to a specific user
  sendMessageToUser(userId: string, message: any) {
    this.server.to(`user:${userId}`).emit('new_message', message);
  }

  // Send typing indicator
  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { conversationId: string; recipientUserId: string },
  ) {
    this.server.to(`user:${data.recipientUserId}`).emit('typing', {
      conversationId: data.conversationId,
      userId: client.data.userId,
    });
  }

  // Join conversation room
  @SubscribeMessage('join_conversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.join(`conversation:${data.conversationId}`);
  }

  isUserOnline(userId: string): boolean {
    return (
      this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0
    );
  }
}
