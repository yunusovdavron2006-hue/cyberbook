import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  ClubStatus,
  Prisma,
  Role,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ApiException, NotFoundException } from '../common/exceptions';
import { ListClubsQueryDto, ListUsersQueryDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- stats

  async stats() {
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const [
      users,
      owners,
      clubsByStatus,
      pendingClubs,
      bookingsToday,
      bookingsTotal,
      grossAgg,
      openTickets,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: Role.CLUB_OWNER } }),
      this.prisma.club.groupBy({ by: ['status'], _count: true, orderBy: { status: 'asc' } }),
      this.prisma.club.count({ where: { status: ClubStatus.PENDING } }),
      this.prisma.booking.count({ where: { startsAt: { gte: dayStart } } }),
      this.prisma.booking.count(),
      this.prisma.booking.aggregate({
        where: { status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] } },
        _sum: { priceAmount: true },
      }),
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);

    return {
      users,
      clubOwners: owners,
      clubsByStatus: clubsByStatus.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = row._count as number;
        return acc;
      }, {}),
      pendingClubApprovals: pendingClubs,
      bookingsToday,
      bookingsTotal,
      grossBookingVolume: Number(grossAgg._sum.priceAmount ?? 0n),
      openSupportTickets: openTickets,
      note: 'Gross booking volume is the value of bookings, not settled revenue.',
    };
  }

  // ---------------------------------------------------------------- users

  async listUsers(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          createdAt: true,
          profile: { select: { displayName: true } },
        },
      }),
    ]);
    return { items, page, size, total, totalPages: Math.ceil(total / size) };
  }

  async getUser(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        profile: true,
        _count: { select: { bookings: true, reviews: true, ownedClubs: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async setUserRole(admin: AuthUser, id: number, role: Role) {
    if (admin.id === id) throw new ApiException('You cannot change your own role');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const updated = await this.prisma.user.update({ where: { id }, data: { role } });
    this.audit.log({
      actorUserId: admin.id,
      action: 'admin.user_role_changed',
      entityType: 'User',
      entityId: id,
      metadata: { from: user.role, to: role },
    });
    return { id: updated.id, role: updated.role };
  }

  async setUserStatus(admin: AuthUser, id: number, status: UserStatus) {
    if (admin.id === id) throw new ApiException('You cannot change your own status');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({ where: { id }, data: { status } });
      if (status !== UserStatus.ACTIVE) {
        // Revoke all active sessions so the change takes effect immediately.
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return result;
    });
    this.audit.log({
      actorUserId: admin.id,
      action: 'admin.user_status_changed',
      entityType: 'User',
      entityId: id,
      metadata: { from: user.status, to: status },
    });
    return { id: updated.id, status: updated.status };
  }

  // ---------------------------------------------------------------- clubs

  async listClubs(query: ListClubsQueryDto) {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const where = query.status ? { status: query.status } : {};
    const [total, items] = await this.prisma.$transaction([
      this.prisma.club.count({ where }),
      this.prisma.club.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
        include: {
          owner: { select: { id: true, email: true } },
          _count: { select: { stations: true, bookings: true } },
        },
      }),
    ]);
    return { items, page, size, total, totalPages: Math.ceil(total / size) };
  }

  async getClub(id: number) {
    const club = await this.prisma.club.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, email: true } },
        stations: { select: { id: true, label: true, status: true } },
        hours: true,
      },
    });
    if (!club) throw new NotFoundException('Club not found');
    return club;
  }

  async approveClub(admin: AuthUser, id: number) {
    const club = await this.getClub(id);
    if (club.status !== ClubStatus.PENDING) {
      throw new ApiException('Only clubs pending review can be approved');
    }
    const updated = await this.prisma.club.update({
      where: { id },
      data: { status: ClubStatus.APPROVED, rejectionReason: null },
    });
    await this.notifications.notify({
      userId: club.ownerId,
      type: 'CLUB_APPROVED',
      title: 'Your club was approved',
      body: `${club.name} is now visible to players.`,
      data: { clubId: id },
    });
    this.audit.log({
      actorUserId: admin.id,
      action: 'admin.club_approved',
      entityType: 'Club',
      entityId: id,
    });
    return updated;
  }

  async rejectClub(admin: AuthUser, id: number, reason?: string) {
    const club = await this.getClub(id);
    if (club.status !== ClubStatus.PENDING) {
      throw new ApiException('Only clubs pending review can be rejected');
    }
    const updated = await this.prisma.club.update({
      where: { id },
      data: { status: ClubStatus.REJECTED, rejectionReason: reason ?? 'Not specified' },
    });
    await this.notifications.notify({
      userId: club.ownerId,
      type: 'CLUB_REJECTED',
      title: 'Your club submission needs changes',
      body: reason ?? 'Please review your club details and resubmit.',
      data: { clubId: id },
    });
    this.audit.log({
      actorUserId: admin.id,
      action: 'admin.club_rejected',
      entityType: 'Club',
      entityId: id,
      metadata: { reason: reason ?? null },
    });
    return updated;
  }

  async suspendClub(admin: AuthUser, id: number, reason?: string) {
    const club = await this.prisma.club.findUnique({ where: { id } });
    if (!club) throw new NotFoundException('Club not found');
    const updated = await this.prisma.club.update({
      where: { id },
      data: { status: ClubStatus.SUSPENDED, rejectionReason: reason ?? null },
    });
    this.audit.log({
      actorUserId: admin.id,
      action: 'admin.club_suspended',
      entityType: 'Club',
      entityId: id,
      metadata: { reason: reason ?? null },
    });
    return updated;
  }

  async reactivateClub(admin: AuthUser, id: number) {
    const club = await this.prisma.club.findUnique({ where: { id } });
    if (!club) throw new NotFoundException('Club not found');
    const updated = await this.prisma.club.update({
      where: { id },
      data: { status: ClubStatus.APPROVED, rejectionReason: null },
    });
    this.audit.log({
      actorUserId: admin.id,
      action: 'admin.club_reactivated',
      entityType: 'Club',
      entityId: id,
    });
    return updated;
  }

  // ------------------------------------------------------------ settings

  async getSettings() {
    const settings = await this.prisma.platformSetting.findMany();
    return settings.reduce<Record<string, unknown>>((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {});
  }

  async getSetting<T = unknown>(key: string, fallback: T): Promise<T> {
    const setting = await this.prisma.platformSetting.findUnique({ where: { key } });
    return (setting?.value as T) ?? fallback;
  }

  async setSetting(admin: AuthUser, key: string, value: unknown) {
    const setting = await this.prisma.platformSetting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
    this.audit.log({
      actorUserId: admin.id,
      action: 'admin.setting_updated',
      entityType: 'PlatformSetting',
      entityId: key,
      metadata: { value },
    });
    return { key: setting.key, value: setting.value };
  }
}
