import { Injectable } from '@nestjs/common';
import { StationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ApiException, ConflictException, NotFoundException } from '../common/exceptions';
import {
  BulkCreateStationsDto,
  CreateStationDto,
  UpdateStationDto,
  UpdateStationLayoutDto,
} from './dto/stations.dto';

@Injectable()
export class StationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
    private readonly audit: AuditService,
  ) {}

  async listCategories() {
    return this.prisma.stationCategory.findMany({ orderBy: { id: 'asc' } });
  }

  private async categoryByKey(key: string) {
    const category = await this.prisma.stationCategory.findUnique({
      where: { key: key as never },
    });
    if (!category) throw new ApiException(`Unknown station category "${key}"`);
    return category;
  }

  private serialize<T extends { pricePerHour: bigint }>(station: T) {
    return { ...station, pricePerHour: Number(station.pricePerHour) };
  }

  /**
   * Layout coordinates live inside the free-form `specs` JSON so no schema
   * migration is required. This merges provided layout keys while preserving
   * any existing hardware spec fields.
   */
  private mergeLayoutSpecs(
    existing: unknown,
    layout: { zone?: string; mapX?: number; mapY?: number },
  ): Record<string, unknown> | undefined {
    const base =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    let changed = false;
    if (layout.zone !== undefined) {
      base.zone = layout.zone;
      changed = true;
    }
    if (layout.mapX !== undefined) {
      base.mapX = layout.mapX;
      changed = true;
    }
    if (layout.mapY !== undefined) {
      base.mapY = layout.mapY;
      changed = true;
    }
    return changed ? base : undefined;
  }

  /** Public listing: only ACTIVE stations of an approved club. */
  async listPublic(clubId: number) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club || club.status !== 'APPROVED') throw new NotFoundException('Club not found');
    const stations = await this.prisma.station.findMany({
      where: { clubId, status: StationStatus.ACTIVE },
      include: { category: true },
      orderBy: { sortOrder: 'asc' },
    });
    return stations.map((s) => this.serialize(s));
  }

  /** Owner listing: all stations regardless of status. */
  async listManage(user: AuthUser, clubId: number) {
    await this.access.assertOperatorOrAdmin(clubId, user);
    const stations = await this.prisma.station.findMany({
      where: { clubId },
      include: { category: true },
      orderBy: { sortOrder: 'asc' },
    });
    return stations.map((s) => this.serialize(s));
  }

  async create(user: AuthUser, clubId: number, dto: CreateStationDto) {
    await this.access.assertOwnerOrAdmin(clubId, user);
    const category = await this.categoryByKey(dto.categoryKey);
    const specs = this.mergeLayoutSpecs(dto.specs, {
      zone: dto.zone,
      mapX: dto.mapX,
      mapY: dto.mapY,
    });
    const station = await this.prisma.station.create({
      data: {
        clubId,
        branchId: dto.branchId ?? null,
        categoryId: category.id,
        label: dto.label.trim(),
        pricePerHour: BigInt(dto.pricePerHour),
        specs: specs as never,
        sortOrder: dto.sortOrder ?? 0,
        status: StationStatus.ACTIVE,
      },
      include: { category: true },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'station.created',
      entityType: 'Station',
      entityId: station.id,
      metadata: { clubId, pricePerHour: dto.pricePerHour },
    });
    return this.serialize(station);
  }

  async bulkCreate(user: AuthUser, clubId: number, dto: BulkCreateStationsDto) {
    await this.access.assertOwnerOrAdmin(clubId, user);
    const category = await this.categoryByKey(dto.categoryKey);
    const prefix = dto.labelPrefix ?? 'Station';
    const existing = await this.prisma.station.count({ where: { clubId } });
    const data = Array.from({ length: dto.count }, (_, i) => ({
      clubId,
      categoryId: category.id,
      label: `${prefix} ${existing + i + 1}`,
      pricePerHour: BigInt(dto.pricePerHour),
      specs: (dto.specs ?? undefined) as never,
      sortOrder: existing + i,
      status: StationStatus.ACTIVE,
    }));
    await this.prisma.station.createMany({ data });
    this.audit.log({
      actorUserId: user.id,
      action: 'station.bulk_created',
      entityType: 'Club',
      entityId: clubId,
      metadata: { count: dto.count, categoryKey: dto.categoryKey },
    });
    return { created: dto.count };
  }

  async update(user: AuthUser, stationId: number, dto: UpdateStationDto) {
    const station = await this.prisma.station.findUnique({ where: { id: stationId } });
    if (!station) throw new NotFoundException('Station not found');
    await this.access.assertOwnerOrAdmin(station.clubId, user);
    const category = await this.categoryByKey(dto.categoryKey);
    const specs = this.mergeLayoutSpecs(dto.specs, {
      zone: dto.zone,
      mapX: dto.mapX,
      mapY: dto.mapY,
    });
    const updated = await this.prisma.station.update({
      where: { id: stationId },
      data: {
        label: dto.label.trim(),
        categoryId: category.id,
        pricePerHour: BigInt(dto.pricePerHour),
        specs: specs as never,
        branchId: dto.branchId ?? null,
        sortOrder: dto.sortOrder ?? station.sortOrder,
      },
      include: { category: true },
    });
    if (station.pricePerHour !== BigInt(dto.pricePerHour)) {
      this.audit.log({
        actorUserId: user.id,
        action: 'station.price_changed',
        entityType: 'Station',
        entityId: stationId,
        metadata: { from: station.pricePerHour.toString(), to: dto.pricePerHour },
      });
    }
    return this.serialize(updated);
  }

  async setStatus(user: AuthUser, stationId: number, status: string) {
    const station = await this.prisma.station.findUnique({ where: { id: stationId } });
    if (!station) throw new NotFoundException('Station not found');
    await this.access.assertOwnerOrAdmin(station.clubId, user);
    if (!['ACTIVE', 'INACTIVE', 'MAINTENANCE'].includes(status)) {
      throw new ApiException('Invalid station status');
    }
    const updated = await this.prisma.station.update({
      where: { id: stationId },
      data: { status: status as StationStatus },
      include: { category: true },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'station.status_changed',
      entityType: 'Station',
      entityId: stationId,
      metadata: { status },
    });
    return this.serialize(updated);
  }

  /**
   * Persists floor-plan coordinates for many stations at once. Only stations
   * that actually belong to the club are updated; unknown ids are ignored to
   * keep the operation safe against stale clients.
   */
  async updateLayout(user: AuthUser, clubId: number, dto: UpdateStationLayoutDto) {
    await this.access.assertOwnerOrAdmin(clubId, user);
    const stations = await this.prisma.station.findMany({ where: { clubId } });
    const byId = new Map(stations.map((s) => [s.id, s]));
    const skipped: number[] = [];
    let updated = 0;
    for (const item of dto.items) {
      const station = byId.get(item.stationId);
      if (!station) {
        skipped.push(item.stationId);
        continue;
      }
      const specs = this.mergeLayoutSpecs(station.specs, {
        zone: item.zone,
        mapX: item.mapX,
        mapY: item.mapY,
      });
      await this.prisma.station.update({
        where: { id: station.id },
        data: { specs: (specs ?? station.specs) as never },
      });
      updated += 1;
    }
    this.audit.log({
      actorUserId: user.id,
      action: 'station.layout_updated',
      entityType: 'Club',
      entityId: clubId,
      metadata: { updated, skipped },
    });
    return { updated, skipped };
  }

  /**
   * Deletion is only permitted when the station has no booking history.
   * Otherwise it must be deactivated so historical records stay intact.
   */
  async remove(user: AuthUser, stationId: number) {
    const station = await this.prisma.station.findUnique({ where: { id: stationId } });
    if (!station) throw new NotFoundException('Station not found');
    await this.access.assertOwnerOrAdmin(station.clubId, user);
    const bookingCount = await this.prisma.booking.count({ where: { stationId } });
    if (bookingCount > 0) {
      throw new ConflictException(
        'This station has booking history and cannot be deleted. Deactivate it instead.',
        'STATION_HAS_BOOKINGS',
      );
    }
    await this.prisma.station.delete({ where: { id: stationId } });
    this.audit.log({ actorUserId: user.id, action: 'station.deleted', entityType: 'Station', entityId: stationId });
    return { deleted: true };
  }
}
