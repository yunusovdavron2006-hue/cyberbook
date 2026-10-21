import { Injectable } from '@nestjs/common';
import { Prisma, Promotion, PromotionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ApiException, NotFoundException } from '../common/exceptions';
import { isValidHhMm, utcToZonedParts, weekdayOfLocalDate } from '../common/utils/time.util';
import { billableMinutes } from '../common/utils/money.util';
import { chooseBestPromotion, PromotionLike } from '../common/utils/promotion.util';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotions.dto';

type Db = Prisma.TransactionClient;

interface ResolveParams {
  club: { id: number; timezone: string };
  station: { id: number; categoryId: number };
  startsAt: Date;
  endsAt: Date;
  subtotal: number;
  userId: number;
  code?: string | null;
}

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
    private readonly audit: AuditService,
  ) {}

  // --------------------------------------------------------------- mapping

  private serialize(p: Promotion) {
    return { ...p, value: Number(p.value) };
  }

  private toLike(p: Promotion): PromotionLike {
    return {
      id: p.id,
      type: p.type,
      value: p.value,
      stationId: p.stationId,
      categoryId: p.categoryId,
      dayOfWeeks: p.dayOfWeeks,
      startsAtTime: p.startsAtTime,
      endsAtTime: p.endsAtTime,
      validFrom: p.validFrom,
      validUntil: p.validUntil,
      minDurationMinutes: p.minDurationMinutes,
      priority: p.priority,
      stackable: p.stackable,
    };
  }

  // ---------------------------------------------------------------- public

  /** Active, code-less offers shown on the public club page. */
  async listPublicOffers(clubId: number) {
    const now = new Date();
    const promos = await this.prisma.promotion.findMany({
      where: {
        clubId,
        active: true,
        code: null,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        ],
      },
      orderBy: [{ priority: 'desc' }, { id: 'desc' }],
    });
    return promos.map((p) => this.serialize(p));
  }

  // ---------------------------------------------------------------- manage

  async listForClub(user: AuthUser, clubId: number) {
    await this.access.assertOperatorOrAdmin(clubId, user);
    const promos = await this.prisma.promotion.findMany({
      where: { clubId },
      orderBy: [{ priority: 'desc' }, { id: 'desc' }],
      include: { _count: { select: { redemptions: true } } },
    });
    return promos.map((p) => ({
      ...this.serialize(p),
      redemptionCount: p._count.redemptions,
    }));
  }

  async create(user: AuthUser, clubId: number, dto: CreatePromotionDto) {
    await this.access.assertOwnerOrAdmin(clubId, user);
    await this.validateDto(clubId, dto);

    const promo = await this.prisma.promotion.create({
      data: {
        clubId,
        createdById: user.id,
        code: dto.code ? dto.code.trim().toUpperCase() : null,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        type: dto.type,
        value: BigInt(dto.value),
        stationId: dto.stationId ?? null,
        categoryId: dto.categoryId ?? null,
        dayOfWeeks: dto.dayOfWeeks ?? [],
        startsAtTime: dto.startsAtTime ?? null,
        endsAtTime: dto.endsAtTime ?? null,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        minDurationMinutes: dto.minDurationMinutes ?? null,
        maxUsesTotal: dto.maxUsesTotal ?? null,
        maxUsesPerUser: dto.maxUsesPerUser ?? null,
        stackable: dto.stackable ?? false,
        priority: dto.priority ?? 0,
        active: dto.active ?? true,
      },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'promotion.created',
      entityType: 'Promotion',
      entityId: promo.id,
      metadata: { clubId, type: dto.type, value: dto.value },
    });
    return this.serialize(promo);
  }

  async update(user: AuthUser, clubId: number, promotionId: number, dto: UpdatePromotionDto) {
    await this.access.assertOwnerOrAdmin(clubId, user);
    const existing = await this.prisma.promotion.findUnique({ where: { id: promotionId } });
    if (!existing || existing.clubId !== clubId) throw new NotFoundException('Promotion not found');
    await this.validateDto(clubId, dto);

    const updated = await this.prisma.promotion.update({
      where: { id: promotionId },
      data: {
        code: dto.code ? dto.code.trim().toUpperCase() : null,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        type: dto.type,
        value: BigInt(dto.value),
        stationId: dto.stationId ?? null,
        categoryId: dto.categoryId ?? null,
        dayOfWeeks: dto.dayOfWeeks ?? [],
        startsAtTime: dto.startsAtTime ?? null,
        endsAtTime: dto.endsAtTime ?? null,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        minDurationMinutes: dto.minDurationMinutes ?? null,
        maxUsesTotal: dto.maxUsesTotal ?? null,
        maxUsesPerUser: dto.maxUsesPerUser ?? null,
        stackable: dto.stackable ?? false,
        priority: dto.priority ?? 0,
        active: dto.active ?? true,
      },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'promotion.updated',
      entityType: 'Promotion',
      entityId: promotionId,
      metadata: { clubId },
    });
    return this.serialize(updated);
  }

  async setActive(user: AuthUser, clubId: number, promotionId: number, active: boolean) {
    await this.access.assertOwnerOrAdmin(clubId, user);
    const existing = await this.prisma.promotion.findUnique({ where: { id: promotionId } });
    if (!existing || existing.clubId !== clubId) throw new NotFoundException('Promotion not found');
    const updated = await this.prisma.promotion.update({ where: { id: promotionId }, data: { active } });
    this.audit.log({
      actorUserId: user.id,
      action: 'promotion.toggled',
      entityType: 'Promotion',
      entityId: promotionId,
      metadata: { active },
    });
    return this.serialize(updated);
  }

  async remove(user: AuthUser, clubId: number, promotionId: number) {
    await this.access.assertOwnerOrAdmin(clubId, user);
    const existing = await this.prisma.promotion.findUnique({ where: { id: promotionId } });
    if (!existing || existing.clubId !== clubId) throw new NotFoundException('Promotion not found');
    await this.prisma.promotion.delete({ where: { id: promotionId } });
    this.audit.log({
      actorUserId: user.id,
      action: 'promotion.deleted',
      entityType: 'Promotion',
      entityId: promotionId,
      metadata: { clubId },
    });
    return { deleted: true };
  }

  /** Public preview of the discount a code (or best automatic offer) would give. */
  async preview(dto: {
    clubId: number;
    stationId: number;
    startsAt: string;
    endsAt: string;
    code?: string;
  }) {
    const club = await this.prisma.club.findUnique({ where: { id: dto.clubId } });
    if (!club) throw new NotFoundException('Club not found');
    const station = await this.prisma.station.findUnique({ where: { id: dto.stationId } });
    if (!station || station.clubId !== club.id) throw new NotFoundException('Station not found');

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new ApiException('Invalid booking window');
    }
    // Use base price as subtotal for a code preview (full price is computed at booking time).
    const subtotal = Number(station.pricePerHour) * (billableMinutes(startsAt, endsAt) / 60);
    const resolved = await this.resolveForBooking(this.prisma, {
      club,
      station,
      startsAt,
      endsAt,
      subtotal: Math.round(subtotal),
      userId: 0,
      code: dto.code ?? null,
    });
    return {
      subtotal: Math.round(subtotal),
      discount: resolved?.discount ?? 0,
      promotion: resolved ? this.serialize(resolved.promotion) : null,
    };
  }

  // -------------------------------------------------------------- internal

  /**
   * Resolve the best discount for a booking. When `code` is supplied only that
   * promotion is considered and an invalid code is a hard error. Otherwise the
   * best automatic (code-less) offer wins. Usage caps are enforced here.
   */
  async resolveForBooking(
    client: Db,
    params: ResolveParams,
  ): Promise<{ promotion: Promotion; discount: number } | null> {
    const parts = utcToZonedParts(params.club.timezone, params.startsAt);
    const durationMinutes = billableMinutes(params.startsAt, params.endsAt);
    const ctx = {
      weekday: weekdayOfLocalDate(parts),
      startMinutes: parts.hours * 60 + parts.minutes,
      durationMinutes,
      instant: params.startsAt,
      stationId: params.station.id,
      categoryId: params.station.categoryId,
    };

    const code = params.code?.trim().toUpperCase() || null;
    const candidates = await client.promotion.findMany({
      where: {
        clubId: params.club.id,
        active: true,
        ...(code ? { code } : { code: null }),
      },
      orderBy: [{ priority: 'desc' }, { id: 'desc' }],
    });

    if (code && candidates.length === 0) {
      throw new ApiException('Promotion code is not available for this club', 400, 'PROMO_NOT_FOUND');
    }

    // Enforce usage caps before computing the best discount.
    const usable: Promotion[] = [];
    for (const promo of candidates) {
      if (promo.maxUsesTotal != null) {
        const used = await client.promotionRedemption.count({ where: { promotionId: promo.id } });
        if (used >= promo.maxUsesTotal) continue;
      }
      if (promo.maxUsesPerUser != null && params.userId > 0) {
        const mine = await client.promotionRedemption.count({
          where: { promotionId: promo.id, userId: params.userId },
        });
        if (mine >= promo.maxUsesPerUser) continue;
      }
      usable.push(promo);
    }

    const best = chooseBestPromotion(usable.map((p) => this.toLike(p)), params.subtotal, ctx);
    if (!best) {
      if (code) {
        throw new ApiException(
          'Promotion code does not apply to this booking',
          400,
          'PROMO_NOT_APPLICABLE',
        );
      }
      return null;
    }
    const promotion = usable.find((p) => p.id === best.promotion.id)!;
    return { promotion, discount: best.discount };
  }

  async recordRedemption(
    client: Db,
    input: {
      promotionId: number;
      userId: number;
      bookingId: number;
      clubId: number;
      code: string | null;
      discountAmount: number;
    },
  ) {
    await client.promotionRedemption.create({
      data: {
        promotionId: input.promotionId,
        userId: input.userId,
        bookingId: input.bookingId,
        clubId: input.clubId,
        code: input.code,
        discountAmount: BigInt(input.discountAmount),
      },
    });
  }

  // -------------------------------------------------------------- validate

  private async validateDto(clubId: number, dto: CreatePromotionDto) {
    if (dto.stationId && dto.categoryId) {
      throw new ApiException('A promotion targets either a station or a category, not both');
    }
    if (dto.type === PromotionType.PERCENT && (dto.value < 1 || dto.value > 100)) {
      throw new ApiException('Percent promotions must be between 1 and 100');
    }
    if ((dto.startsAtTime && !dto.endsAtTime) || (!dto.startsAtTime && dto.endsAtTime)) {
      throw new ApiException('Provide both startsAtTime and endsAtTime, or neither');
    }
    if (dto.startsAtTime && !isValidHhMm(dto.startsAtTime)) {
      throw new ApiException('startsAtTime must be HH:mm');
    }
    if (dto.endsAtTime && !isValidHhMm(dto.endsAtTime)) {
      throw new ApiException('endsAtTime must be HH:mm');
    }
    if (dto.validFrom && dto.validUntil && new Date(dto.validFrom) >= new Date(dto.validUntil)) {
      throw new ApiException('validFrom must be before validUntil');
    }
    if (dto.stationId) {
      const station = await this.prisma.station.findUnique({ where: { id: dto.stationId } });
      if (!station || station.clubId !== clubId) throw new NotFoundException('Station not found in this club');
    }
    if (dto.categoryId) {
      const category = await this.prisma.stationCategory.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Station category not found');
    }
  }
}
