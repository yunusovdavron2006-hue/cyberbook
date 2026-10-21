import { Injectable } from '@nestjs/common';
import { Prisma, Role, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ForbiddenException, NotFoundException } from '../common/exceptions';
import { AddMessageDto, AssignTicketDto, CreateTicketDto, ListTicketsQueryDto } from './dto/support.dto';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // --------------------------------------------------------- access helper

  /** True when the user is the ticket author, platform admin, or club staff/owner. */
  private async canAccessTicket(user: AuthUser, ticket: { userId: number | null; clubId: number | null }) {
    if (user.role === Role.ADMIN) return true;
    if (ticket.userId === user.id) return true;
    if (ticket.clubId != null) {
      const club = await this.prisma.club.findUnique({ where: { id: ticket.clubId } });
      if (club?.ownerId === user.id) return true;
      const membership = await this.prisma.clubMembership.findUnique({
        where: { clubId_userId: { clubId: ticket.clubId, userId: user.id } },
      });
      if (membership) return true;
    }
    return false;
  }

  private async isClubOperator(user: AuthUser, clubId: number | null) {
    if (user.role === Role.ADMIN) return true;
    if (clubId == null) return false;
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (club?.ownerId === user.id) return true;
    const membership = await this.prisma.clubMembership.findUnique({
      where: { clubId_userId: { clubId, userId: user.id } },
    });
    return Boolean(membership);
  }

  // -------------------------------------------------------------- create

  async create(user: AuthUser, dto: CreateTicketDto) {
    if (dto.bookingId) {
      const booking = await this.prisma.booking.findUnique({ where: { id: dto.bookingId } });
      if (!booking || booking.userId !== user.id) {
        throw new NotFoundException('Booking not found');
      }
    }
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId: user.id,
        subject: dto.subject.trim(),
        category: dto.category ?? undefined,
        priority: dto.priority ?? undefined,
        clubId: dto.clubId ?? null,
        bookingId: dto.bookingId ?? null,
        messages: { create: { authorUserId: user.id, body: dto.message, fromStaff: false } },
        events: { create: { actorUserId: user.id, type: 'CREATED', metadata: { category: dto.category ?? 'GENERAL' } } },
      },
      include: { messages: true },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'support_ticket.created',
      entityType: 'SupportTicket',
      entityId: ticket.id,
      metadata: { category: ticket.category, priority: ticket.priority },
    });
    return ticket;
  }

  // -------------------------------------------------------------- reads

  async listMine(userId: number) {
    return this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async getOne(user: AuthUser, id: number) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (!(await this.canAccessTicket(user, ticket))) {
      throw new ForbiddenException('You do not have access to this ticket');
    }
    return ticket;
  }

  /** Owner/staff view of the tickets raised against their club. */
  async listForClub(user: AuthUser, clubId: number, query: ListTicketsQueryDto) {
    if (!(await this.isClubOperator(user, clubId))) {
      throw new ForbiddenException('You do not have access to this club');
    }
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const where: Prisma.SupportTicketWhereInput = {
      clubId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
    };
    return this.paginate(where, page, size);
  }

  // -------------------------------------------------------------- writes

  async addMessage(user: AuthUser, ticketId: number, dto: AddMessageDto) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const authorIsCustomer = ticket.userId === user.id;
    const isStaff = !authorIsCustomer && (await this.canAccessTicket(user, ticket));
    if (!authorIsCustomer && !isStaff) {
      throw new ForbiddenException('You do not have access to this ticket');
    }

    await this.prisma.$transaction([
      this.prisma.supportTicketMessage.create({
        data: { ticketId, authorUserId: user.id, body: dto.body, fromStaff: isStaff },
      }),
      this.prisma.supportTicketEvent.create({
        data: { ticketId, actorUserId: user.id, type: isStaff ? 'STAFF_REPLY' : 'CUSTOMER_REPLY' },
      }),
      this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: {
          ...(isStaff && ticket.status === TicketStatus.OPEN ? { status: TicketStatus.IN_PROGRESS } : {}),
        },
      }),
    ]);

    if (isStaff && ticket.userId) {
      await this.notifications.notify({
        userId: ticket.userId,
        type: 'SUPPORT_UPDATE',
        title: 'Support replied to your ticket',
        body: dto.body.slice(0, 200),
        data: { ticketId },
      });
    }
    return this.getOne(user, ticketId);
  }

  async listAll(user: AuthUser, query: ListTicketsQueryDto) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Admin only');
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const where: Prisma.SupportTicketWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.clubId ? { clubId: query.clubId } : {}),
      ...(query.assignedToMe === 'true' ? { assignedToId: user.id } : {}),
    };
    return this.paginate(where, page, size, true);
  }

  async assign(user: AuthUser, ticketId: number, dto: AssignTicketDto) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Admin only');
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { assignedToId: dto.assignedToId ?? null },
    });
    await this.prisma.supportTicketEvent.create({
      data: {
        ticketId,
        actorUserId: user.id,
        type: 'ASSIGNED',
        metadata: { assignedToId: dto.assignedToId ?? null },
      },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'support_ticket.assigned',
      entityType: 'SupportTicket',
      entityId: ticketId,
      metadata: { assignedToId: dto.assignedToId ?? null },
    });
    return updated;
  }

  async updateStatus(user: AuthUser, ticketId: number, status: TicketStatus, note?: string) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Admin only');
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const resolvedAt =
      status === TicketStatus.RESOLVED || status === TicketStatus.CLOSED ? new Date() : null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.supportTicket.update({
        where: { id: ticketId },
        data: { status, resolvedAt },
      });
      await tx.supportTicketEvent.create({
        data: { ticketId, actorUserId: user.id, type: 'STATUS_CHANGED', metadata: { status, note: note ?? null } },
      });
      return result;
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'support_ticket.status_changed',
      entityType: 'SupportTicket',
      entityId: ticketId,
      metadata: { status },
    });
    if (ticket.userId) {
      await this.notifications.notify({
        userId: ticket.userId,
        type: 'SUPPORT_UPDATE',
        title: `Ticket ${status.toLowerCase().replace('_', ' ')}`,
        body: ticket.subject,
        data: { ticketId },
      });
    }
    return updated;
  }

  // -------------------------------------------------------------- helpers

  private async paginate(where: Prisma.SupportTicketWhereInput, page: number, size: number, admin = false) {
    const [total, items] = await this.prisma.$transaction([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * size,
        take: size,
        include: admin
          ? {
              user: { select: { id: true, email: true } },
              assignedTo: { select: { id: true, email: true } },
            }
          : { messages: { orderBy: { createdAt: 'asc' } } },
      }),
    ]);
    return { items, page, size, total, totalPages: Math.ceil(total / size) };
  }
}
