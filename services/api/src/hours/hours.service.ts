import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ApiException, ConflictException, NotFoundException } from '../common/exceptions';
import { parseIsoDate, isValidHhMm } from '../common/utils/time.util';
import { CreateClosureDto, SetOperatingHoursDto } from './dto/hours.dto';

@Injectable()
export class HoursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
    private readonly audit: AuditService,
  ) {}

  async get(user: AuthUser, clubId: number) {
    await this.access.assertOperatorOrAdmin(clubId, user);
    return this.prisma.operatingHours.findMany({ where: { clubId }, orderBy: { dayOfWeek: 'asc' } });
  }

  /** Replaces the weekly schedule atomically. */
  async set(user: AuthUser, clubId: number, dto: SetOperatingHoursDto) {
    await this.access.assertOwnerOrAdmin(clubId, user);
    const seen = new Set<number>();
    for (const day of dto.days) {
      if (seen.has(day.dayOfWeek)) throw new ApiException(`Duplicate day ${day.dayOfWeek}`);
      seen.add(day.dayOfWeek);
      if (!day.closed) {
        if (!isValidHhMm(day.opensAt) || !isValidHhMm(day.closesAt)) {
          throw new ApiException(`Day ${day.dayOfWeek} requires valid opensAt and closesAt (HH:mm)`);
        }
      }
    }

    await this.prisma.$transaction([
      this.prisma.operatingHours.deleteMany({ where: { clubId } }),
      this.prisma.operatingHours.createMany({
        data: dto.days.map((d) => ({
          clubId,
          dayOfWeek: d.dayOfWeek,
          closed: d.closed,
          opensAt: d.closed ? null : (d.opensAt ?? null),
          closesAt: d.closed ? null : (d.closesAt ?? null),
        })),
      }),
    ]);
    this.audit.log({
      actorUserId: user.id,
      action: 'club.hours_updated',
      entityType: 'Club',
      entityId: clubId,
      metadata: { days: dto.days.length },
    });
    return this.prisma.operatingHours.findMany({ where: { clubId }, orderBy: { dayOfWeek: 'asc' } });
  }

  async listClosures(clubId: number) {
    return this.prisma.specialClosure.findMany({ where: { clubId }, orderBy: { date: 'asc' } });
  }

  async addClosure(user: AuthUser, clubId: number, dto: CreateClosureDto) {
    await this.access.assertOwnerOrAdmin(clubId, user);
    const date = parseIsoDate(dto.date);
    const isoTimestamp = new Date(Date.UTC(date.year, date.month - 1, date.day));
    const existing = await this.prisma.specialClosure.findUnique({
      where: { clubId_date: { clubId, date: isoTimestamp } },
    });
    if (existing) throw new ConflictException('This date is already registered as a closure');
    const closure = await this.prisma.specialClosure.create({
      data: { clubId, date: isoTimestamp, reason: dto.reason },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'club.closure_added',
      entityType: 'SpecialClosure',
      entityId: closure.id,
      metadata: { clubId, date: dto.date },
    });
    return closure;
  }

  async removeClosure(user: AuthUser, clubId: number, closureId: number) {
    await this.access.assertOwnerOrAdmin(clubId, user);
    const closure = await this.prisma.specialClosure.findUnique({ where: { id: closureId } });
    if (!closure || closure.clubId !== clubId) throw new NotFoundException('Closure not found');
    await this.prisma.specialClosure.delete({ where: { id: closureId } });
    return { deleted: true };
  }
}
