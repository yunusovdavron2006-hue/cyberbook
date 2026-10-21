import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ApiException, NotFoundException } from '../common/exceptions';
import { CreateMaintenanceDto } from './dto/maintenance.dto';

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, clubId: number) {
    await this.access.assertOperatorOrAdmin(clubId, user);
    const blocks = await this.prisma.maintenanceBlock.findMany({
      where: { station: { clubId } },
      include: { station: { select: { id: true, label: true } } },
      orderBy: { startsAt: 'asc' },
    });
    return blocks;
  }

  async create(user: AuthUser, stationId: number, dto: CreateMaintenanceDto) {
    const station = await this.prisma.station.findUnique({ where: { id: stationId } });
    if (!station) throw new NotFoundException('Station not found');
    await this.access.assertOperatorOrAdmin(station.clubId, user);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (!(endsAt > startsAt)) throw new ApiException('endsAt must be after startsAt');

    const block = await this.prisma.$transaction(async (tx) => {
      // Serialize with booking creation for this station.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${stationId})`;
      return tx.maintenanceBlock.create({
        data: {
          stationId,
          startsAt,
          endsAt,
          reason: dto.reason,
          createdById: user.id,
        },
      });
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'maintenance.created',
      entityType: 'MaintenanceBlock',
      entityId: block.id,
      metadata: { stationId, startsAt: dto.startsAt, endsAt: dto.endsAt },
    });
    return block;
  }

  async remove(user: AuthUser, blockId: number) {
    const block = await this.prisma.maintenanceBlock.findUnique({
      where: { id: blockId },
      include: { station: true },
    });
    if (!block) throw new NotFoundException('Maintenance block not found');
    await this.access.assertOperatorOrAdmin(block.station.clubId, user);
    await this.prisma.maintenanceBlock.delete({ where: { id: blockId } });
    this.audit.log({
      actorUserId: user.id,
      action: 'maintenance.deleted',
      entityType: 'MaintenanceBlock',
      entityId: blockId,
    });
    return { deleted: true };
  }
}
