import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EventsGateway } from '../gateway/events.gateway';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly gateway: EventsGateway,
  ) {}

  async getConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        OR: [{ patientUserId: userId }, { doctorUserId: userId }],
      },
      include: {
        patientUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            role: true,
          },
        },
        doctorUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            role: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    // Add unread count for each conversation
    const withUnreadCount = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conv.id,
            senderUserId: { not: userId },
            isRead: false,
          },
        });
        return { ...conv, unreadCount };
      }),
    );

    return withUnreadCount;
  }

  async getOrCreateConversation(userId: string, otherUserId: string) {
    // Check if conversation exists (in either direction)
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        OR: [
          { patientUserId: userId, doctorUserId: otherUserId },
          { patientUserId: otherUserId, doctorUserId: userId },
        ],
      },
    });

    if (!conversation) {
      // Determine who is patient and who is doctor
      const [user1, user2] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        }),
        this.prisma.user.findUnique({
          where: { id: otherUserId },
          select: { role: true },
        }),
      ]);

      if (!user1 || !user2) {
        throw new NotFoundException('Utilisateur non trouvé');
      }

      const patientUserId = user1.role === 'patient' ? userId : otherUserId;
      const doctorUserId = user1.role === 'doctor' ? userId : otherUserId;

      conversation = await this.prisma.conversation.create({
        data: { patientUserId, doctorUserId },
      });
    }

    return conversation;
  }

  async getMessages(
    conversationId: string,
    userId: string,
    page = 1,
    limit = 50,
  ) {
    // Verify user is part of conversation
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation)
      throw new NotFoundException('Conversation non trouvée');
    if (
      conversation.patientUserId !== userId &&
      conversation.doctorUserId !== userId
    ) {
      throw new ForbiddenException(
        'Accès non autorisé à cette conversation',
      );
    }

    const skip = (page - 1) * limit;
    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.message.count({ where: { conversationId } }),
    ]);

    return {
      messages: messages.reverse(),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async sendMessage(
    conversationId: string,
    senderUserId: string,
    content: string,
  ) {
    // Verify user is part of conversation
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation)
      throw new NotFoundException('Conversation non trouvée');
    if (
      conversation.patientUserId !== senderUserId &&
      conversation.doctorUserId !== senderUserId
    ) {
      throw new ForbiddenException('Accès non autorisé');
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderUserId,
        content,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Update conversation lastMessageAt
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    // Send real-time notification to recipient
    const recipientUserId =
      conversation.patientUserId === senderUserId
        ? conversation.doctorUserId
        : conversation.patientUserId;

    this.gateway.sendMessageToUser(recipientUserId, message);

    return message;
  }

  async markAsRead(conversationId: string, userId: string) {
    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderUserId: { not: userId },
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { message: 'Messages marqués comme lus' };
  }

  async getUnreadTotal(userId: string) {
    const count = await this.prisma.message.count({
      where: {
        conversation: {
          OR: [{ patientUserId: userId }, { doctorUserId: userId }],
        },
        senderUserId: { not: userId },
        isRead: false,
      },
    });

    return { unreadCount: count };
  }
}
