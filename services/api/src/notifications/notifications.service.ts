import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface NotifyInput {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * In-app notification service.
 * External providers (FCM/APNs, email, Telegram) are optional adapters that
 * must be configured; when absent, notifications stay in-app only and are
 * never reported as delivered to an external channel.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notify(input: NotifyInput) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    // Future: fan out to push/email/telegram adapters here.
    return notification;
  }

  async notifyClubOwner(
    clubId: number,
    input: Omit<NotifyInput, 'userId'>,
  ): Promise<void> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { ownerId: true },
    });
    if (!club) return;
    await this.notify({ ...input, userId: club.ownerId });
  }

  async list(userId: number, unreadOnly: boolean) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(userId: number, ids?: number[]) {
    await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
      },
      data: { readAt: new Date() },
    });
    return { updated: true };
  }

  async markAllRead(userId: number) {
    return this.markRead(userId);
  }
}
