import { Injectable } from '@nestjs/common';
import { PricingRule, PricingUnit, Station } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ApiException, NotFoundException } from '../common/exceptions';
import { billableMinutes, multiplyHourlyRate } from '../common/utils/money.util';
import {
  isValidHhMm,
  utcToZonedParts,
  weekdayOfLocalDate,
} from '../common/utils/time.util';
import { CreatePricingRuleDto } from '../stations/dto/stations.dto';

export interface PriceSnapshot {
  basePricePerHour: number;
  resolvedRate: number;
  unit: PricingUnit;
  source: 'STATION_RULE' | 'CATEGORY_RULE' | 'BASE_PRICE';
  ruleId: number | null;
  ruleName: string | null;
  minutes: number;
  total: number;
  currency: 'UZS';
  computedAt: string;
}

/**
 * Pricing precedence (highest first):
 *   1) rules targeting the exact station
 *   2) rules targeting the station's category
 *   3) the station's base hourly price
 * Within a level: higher `priority` wins, ties broken by the newest rule.
 * The rate is resolved from the booking start time's day/time window and
 * applied to the entire booking (documented MVP simplification).
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
    private readonly audit: AuditService,
  ) {}

  private matchesWindow(
    rule: PricingRule,
    weekday: number,
    startMinutes: number,
  ): boolean {
    if (rule.dayOfWeeks.length > 0 && !rule.dayOfWeeks.includes(weekday)) return false;
    if (!rule.startsAtTime || !rule.endsAtTime) return true;

    const toMinutes = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    };
    const start = toMinutes(rule.startsAtTime);
    const end = toMinutes(rule.endsAtTime);
    if (start <= end) {
      return startMinutes >= start && startMinutes < end;
    }
    // overnight window
    return startMinutes >= start || startMinutes < end;
  }

  async resolveRate(
    club: { id: number; timezone: string },
    station: Pick<Station, 'id' | 'categoryId' | 'pricePerHour'>,
    startsAt: Date,
  ): Promise<{ rule: PricingRule | null; amount: bigint; unit: PricingUnit; source: PriceSnapshot['source'] }> {
    const parts = utcToZonedParts(club.timezone, startsAt);
    const weekday = weekdayOfLocalDate(parts);
    const startMinutes = parts.hours * 60 + parts.minutes;

    const rules = await this.prisma.pricingRule.findMany({
      where: {
        clubId: club.id,
        active: true,
        OR: [{ stationId: station.id }, { categoryId: station.categoryId }],
      },
      orderBy: [{ priority: 'desc' }, { id: 'desc' }],
    });

    const stationRules = rules.filter((r) => r.stationId === station.id);
    const categoryRules = rules.filter((r) => !r.stationId && r.categoryId === station.categoryId);

    for (const level of [
      { rules: stationRules, source: 'STATION_RULE' as const },
      { rules: categoryRules, source: 'CATEGORY_RULE' as const },
    ]) {
      const match = level.rules.find((rule) => this.matchesWindow(rule, weekday, startMinutes));
      if (match) {
        return { rule: match, amount: match.amount, unit: match.unit, source: level.source };
      }
    }

    return { rule: null, amount: station.pricePerHour, unit: PricingUnit.PER_HOUR, source: 'BASE_PRICE' };
  }

  async computePrice(
    club: { id: number; timezone: string },
    station: Pick<Station, 'id' | 'categoryId' | 'pricePerHour'>,
    startsAt: Date,
    endsAt: Date,
  ): Promise<{ total: bigint; snapshot: PriceSnapshot }> {
    const minutes = billableMinutes(startsAt, endsAt);
    if (minutes <= 0) throw new ApiException('Booking must have a positive duration');

    const rate = await this.resolveRate(club, station, startsAt);
    const total =
      rate.unit === PricingUnit.FLAT ? rate.amount : multiplyHourlyRate(rate.amount, minutes);

    const snapshot: PriceSnapshot = {
      basePricePerHour: Number(station.pricePerHour),
      resolvedRate: Number(rate.amount),
      unit: rate.unit,
      source: rate.source,
      ruleId: rate.rule?.id ?? null,
      ruleName: rate.rule?.name ?? null,
      minutes,
      total: Number(total),
      currency: 'UZS',
      computedAt: new Date().toISOString(),
    };
    if (total < 0n) throw new ApiException('Computed price cannot be negative');
    return { total, snapshot };
  }

  // ------------------------------------------------------------- rule CRUD

  async listRules(user: AuthUser, clubId: number) {
    await this.access.assertOperatorOrAdmin(clubId, user);
    const rules = await this.prisma.pricingRule.findMany({
      where: { clubId },
      orderBy: [{ priority: 'desc' }, { id: 'desc' }],
    });
    return rules.map((r) => ({ ...r, amount: Number(r.amount) }));
  }

  async createRule(user: AuthUser, clubId: number, dto: CreatePricingRuleDto) {
    await this.access.assertOwnerOrAdmin(clubId, user);
    if (dto.startsAtTime && !isValidHhMm(dto.startsAtTime)) {
      throw new ApiException('startsAtTime must be HH:mm');
    }
    if (dto.endsAtTime && !isValidHhMm(dto.endsAtTime)) {
      throw new ApiException('endsAtTime must be HH:mm');
    }
    if ((dto.startsAtTime && !dto.endsAtTime) || (!dto.startsAtTime && dto.endsAtTime)) {
      throw new ApiException('Provide both startsAtTime and endsAtTime, or neither');
    }

    let categoryId: number | null = null;
    if (dto.categoryKey) {
      const category = await this.prisma.stationCategory.findUnique({
        where: { key: dto.categoryKey as never },
      });
      if (!category) throw new ApiException(`Unknown station category "${dto.categoryKey}"`);
      categoryId = category.id;
    }
    if (dto.categoryKey && dto.stationId) {
      throw new ApiException('A pricing rule targets either a station or a category, not both');
    }
    if (dto.stationId) {
      const station = await this.prisma.station.findUnique({ where: { id: dto.stationId } });
      if (!station || station.clubId !== clubId) {
        throw new NotFoundException('Station not found in this club');
      }
    }

    const rule = await this.prisma.pricingRule.create({
      data: {
        clubId,
        stationId: dto.stationId ?? null,
        categoryId,
        name: dto.name.trim(),
        unit: dto.unit === 'FLAT' ? PricingUnit.FLAT : PricingUnit.PER_HOUR,
        amount: BigInt(dto.amount),
        dayOfWeeks: dto.dayOfWeeks ?? [],
        startsAtTime: dto.startsAtTime ?? null,
        endsAtTime: dto.endsAtTime ?? null,
        priority: dto.priority ?? 0,
        active: dto.active ?? true,
      },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'pricing_rule.created',
      entityType: 'PricingRule',
      entityId: rule.id,
      metadata: { clubId, amount: dto.amount, unit: rule.unit },
    });
    return { ...rule, amount: Number(rule.amount) };
  }

  async setRuleActive(user: AuthUser, clubId: number, ruleId: number, active: boolean) {
    await this.access.assertOwnerOrAdmin(clubId, user);
    const rule = await this.prisma.pricingRule.findUnique({ where: { id: ruleId } });
    if (!rule || rule.clubId !== clubId) throw new NotFoundException('Pricing rule not found');
    const updated = await this.prisma.pricingRule.update({ where: { id: ruleId }, data: { active } });
    this.audit.log({
      actorUserId: user.id,
      action: 'pricing_rule.toggled',
      entityType: 'PricingRule',
      entityId: ruleId,
      metadata: { active },
    });
    return { ...updated, amount: Number(updated.amount) };
  }

  async removeRule(user: AuthUser, clubId: number, ruleId: number) {
    await this.access.assertOwnerOrAdmin(clubId, user);
    const rule = await this.prisma.pricingRule.findUnique({ where: { id: ruleId } });
    if (!rule || rule.clubId !== clubId) throw new NotFoundException('Pricing rule not found');
    await this.prisma.pricingRule.delete({ where: { id: ruleId } });
    this.audit.log({
      actorUserId: user.id,
      action: 'pricing_rule.deleted',
      entityType: 'PricingRule',
      entityId: ruleId,
    });
    return { deleted: true };
  }

  /** Estimate endpoint used by the booking UI (server-authoritative). */
  async quote(
    clubId: number,
    stationId: number,
    startsAt: Date,
    endsAt: Date,
  ): Promise<{ total: number; currency: string; snapshot: PriceSnapshot }> {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Club not found');
    const station = await this.prisma.station.findUnique({ where: { id: stationId } });
    if (!station || station.clubId !== clubId) throw new NotFoundException('Station not found');
    const { total, snapshot } = await this.computePrice(club, station, startsAt, endsAt);
    return { total: Number(total), currency: 'UZS', snapshot };
  }
}
