import { Injectable } from '@nestjs/common';
import { ClubStatus, Prisma, Role, StationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAccessService } from './club-access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ApiException, ConflictException, NotFoundException } from '../common/exceptions';
import { slugify } from '../common/utils/text.util';
import {
  CreateBranchDto,
  CreateClubDto,
  InviteStaffDto,
  SearchClubsDto,
  UpdateClubDto,
} from './dto/clubs.dto';

const PUBLIC_CLUB_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  city: true,
  district: true,
  address: true,
  latitude: true,
  longitude: true,
  phone: true,
  status: true,
  coverImageUrl: true,
  timezone: true,
  rating: true,
  reviewCount: true,
  createdAt: true,
} satisfies Prisma.ClubSelect;

@Injectable()
export class ClubsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- public

  async search(dto: SearchClubsDto) {
    const page = dto.page ?? 1;
    const size = dto.size ?? 12;
    // `q` is the legacy alias of `search` (see SearchClubsDto).
    const term = dto.search ?? dto.q;

    const where: Prisma.ClubWhereInput = {
      status: ClubStatus.APPROVED, // only published & approved clubs are public
      ...(dto.city ? { city: { equals: dto.city, mode: 'insensitive' } } : {}),
      ...(dto.district ? { district: { equals: dto.district, mode: 'insensitive' } } : {}),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { description: { contains: term, mode: 'insensitive' } },
              { address: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(dto.minRating ? { rating: { gte: dto.minRating } } : {}),
      ...(dto.minPrice !== undefined || dto.maxPrice !== undefined || dto.category
        ? {
            stations: {
              some: {
                status: StationStatus.ACTIVE,
                ...(dto.category ? { category: { key: dto.category as never } } : {}),
                ...(dto.minPrice !== undefined ? { pricePerHour: { gte: BigInt(dto.minPrice) } } : {}),
                ...(dto.maxPrice !== undefined ? { pricePerHour: { lte: BigInt(dto.maxPrice) } } : {}),
              },
            },
          }
        : {}),
    };

    const orderBy: Prisma.ClubOrderByWithRelationInput =
      dto.sort === 'cheapest'
        ? { id: 'asc' }
        : dto.sort === 'rating'
          ? { rating: 'desc' }
          : dto.sort === 'newest'
            ? { createdAt: 'desc' }
            : { reviewCount: 'desc' };

    const [total, clubs] = await this.prisma.$transaction([
      this.prisma.club.count({ where }),
      this.prisma.club.findMany({
        where,
        orderBy,
        skip: (page - 1) * size,
        take: size,
        select: {
          ...PUBLIC_CLUB_SELECT,
          stations: {
            where: { status: StationStatus.ACTIVE },
            select: { id: true, pricePerHour: true, category: { select: { key: true } } },
          },
          hours: true,
        },
      }),
    ]);

    // Cheapest-first ordering requires min active station price; compute in memory.
    let items = clubs.map((club) => this.decoratePublicClub(club, dto.lat, dto.lng));
    if (dto.sort === 'cheapest') {
      items = items.sort((a, b) => a.minPricePerHour - b.minPricePerHour);
    }
    if (dto.availableNow) {
      const now = new Date();
      items = items.filter((club) => this.isOpenNow(club, now));
    }

    return {
      items,
      page,
      size,
      total,
      totalPages: Math.ceil(total / size),
    };
  }

  async getPublic(idOrSlug: string, lat?: number, lng?: number) {
    const numeric = Number(idOrSlug);
    const club = await this.prisma.club.findFirst({
      where: {
        status: ClubStatus.APPROVED,
        ...(Number.isInteger(numeric) && numeric > 0 ? { id: numeric } : { slug: idOrSlug }),
      },
      include: {
        stations: {
          where: { status: StationStatus.ACTIVE },
          select: {
            id: true,
            label: true,
            status: true,
            specs: true,
            pricePerHour: true,
            category: { select: { key: true, labelUz: true, labelRu: true, labelEn: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        hours: { orderBy: { dayOfWeek: 'asc' } },
        branches: true,
        reviews: {
          where: { status: 'PUBLISHED' },
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { profile: { select: { displayName: true } } } } },
        },
      },
    });
    if (!club) throw new NotFoundException('Club not found');
    return {
      ...this.decoratePublicClub(club, lat, lng),
      stations: club.stations.map((s) => ({
        id: s.id,
        label: s.label,
        status: s.status,
        specs: s.specs,
        pricePerHour: Number(s.pricePerHour),
        category: s.category,
      })),
      hours: club.hours,
      branches: club.branches,
      reviews: club.reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        author: r.user.profile?.displayName ?? 'CyberBook user',
      })),
    };
  }

  private decoratePublicClub(
    club: {
      id: number;
      name: string;
      slug: string;
      description: string | null;
      city: string;
      district: string | null;
      address: string;
      latitude: number;
      longitude: number;
      phone: string | null;
      coverImageUrl: string | null;
      timezone: string;
      rating: number;
      reviewCount: number;
      createdAt: Date;
      stations: { id: number; pricePerHour: bigint; category: { key: string } }[];
      hours?: { dayOfWeek: number; closed: boolean; opensAt: string | null; closesAt: string | null }[];
    },
    lat?: number,
    lng?: number,
  ) {
    const prices = club.stations.map((s) => Number(s.pricePerHour));
    const categories = Array.from(new Set(club.stations.map((s) => s.category.key)));
    return {
      id: club.id,
      name: club.name,
      slug: club.slug,
      description: club.description,
      city: club.city,
      district: club.district,
      address: club.address,
      latitude: club.latitude,
      longitude: club.longitude,
      phone: club.phone,
      coverImageUrl: club.coverImageUrl,
      timezone: club.timezone,
      rating: club.rating,
      reviewCount: club.reviewCount,
      stationCount: club.stations.length,
      minPricePerHour: prices.length ? Math.min(...prices) : 0,
      categories,
      distanceKm:
        lat !== undefined && lng !== undefined
          ? Math.round(this.haversineKm(lat, lng, club.latitude, club.longitude) * 10) / 10
          : null,
      hours: club.hours ?? [],
      createdAt: club.createdAt,
    };
  }

  private isOpenNow(
    club: { hours?: { dayOfWeek: number; closed: boolean; opensAt: string | null; closesAt: string | null }[] },
    now: Date,
  ): boolean {
    const hours = club.hours ?? [];
    if (hours.length === 0) return false;
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tashkent',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    }).formatToParts(now);
    const hhmm = `${parts.find((p) => p.type === 'hour')?.value}:${parts.find((p) => p.type === 'minute')?.value}`;
    const weekdayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const day = weekdayMap[parts.find((p) => p.type === 'weekday')?.value ?? 'Mon'] ?? 0;
    const today = hours.find((h) => h.dayOfWeek === day);
    if (!today || today.closed || !today.opensAt || !today.closesAt) return false;
    if (today.opensAt <= today.closesAt) {
      return hhmm >= today.opensAt && hhmm < today.closesAt;
    }
    // overnight
    return hhmm >= today.opensAt || hhmm < today.closesAt;
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ---------------------------------------------------------------- owner

  async myClubs(user: AuthUser) {
    const clubs = await this.prisma.club.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { memberships: { some: { userId: user.id } } },
        ],
      },
      include: {
        _count: { select: { stations: true, bookings: true } },
        memberships: { where: { userId: user.id }, select: { role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const owned = clubs.some((c) => c.ownerId === user.id);
    return {
      clubs: clubs.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        status: c.status,
        city: c.city,
        rating: c.rating,
        reviewCount: c.reviewCount,
        stationCount: c._count.stations,
        bookingCount: c._count.bookings,
        myRole: c.ownerId === user.id ? 'OWNER' : (c.memberships[0]?.role ?? 'STAFF'),
      })),
      isOwner: owned,
    };
  }

  async create(user: AuthUser, dto: CreateClubDto) {
    const slug = await this.uniqueSlug(dto.name);
    const club = await this.prisma.club.create({
      data: {
        ownerId: user.id,
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim(),
        city: dto.city.trim(),
        district: dto.district?.trim(),
        address: dto.address.trim(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        phone: dto.phone?.trim(),
        timezone: dto.timezone || 'Asia/Tashkent',
        coverImageUrl: dto.coverImageUrl,
        status: ClubStatus.DRAFT,
      },
    });
    this.audit.log({ actorUserId: user.id, action: 'club.created', entityType: 'Club', entityId: club.id });
    return club;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    let slug = base;
    let i = 2;
    // bounded retries; also guarded by the unique index
    while (await this.prisma.club.findUnique({ where: { slug } })) {
      slug = `${base}-${i++}`;
      if (i > 50) {
        slug = `${base}-${Date.now()}`;
        break;
      }
    }
    return slug;
  }

  async update(user: AuthUser, clubId: number, dto: UpdateClubDto) {
    await this.access.assertOwnerOrAdmin(clubId, user);
    const club = await this.prisma.club.update({
      where: { id: clubId },
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim(),
        city: dto.city.trim(),
        district: dto.district?.trim(),
        address: dto.address.trim(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        phone: dto.phone?.trim(),
        timezone: dto.timezone || undefined,
        coverImageUrl: dto.coverImageUrl,
      },
    });
    this.audit.log({ actorUserId: user.id, action: 'club.updated', entityType: 'Club', entityId: clubId });
    return club;
  }

  async remove(user: AuthUser, clubId: number) {
    const club = await this.access.assertOwnerOrAdmin(clubId, user);
    if (club.status === ClubStatus.APPROVED) {
      throw new ApiException('Published clubs cannot be deleted. Contact platform support to suspend the club.');
    }
    const bookings = await this.prisma.booking.count({ where: { clubId } });
    if (bookings > 0) {
      throw new ConflictException('This club has booking history and cannot be deleted');
    }
    await this.prisma.club.delete({ where: { id: clubId } });
    this.audit.log({ actorUserId: user.id, action: 'club.deleted', entityType: 'Club', entityId: clubId });
    return { deleted: true };
  }

  async submitForApproval(user: AuthUser, clubId: number) {
    const club = await this.access.assertOwner(clubId, user);
    if (club.status === ClubStatus.APPROVED) {
      throw new ApiException('Club is already approved');
    }
    if (club.status === ClubStatus.SUSPENDED) {
      throw new ApiException('Suspended clubs cannot be resubmitted');
    }
    const activeStations = await this.prisma.station.count({
      where: { clubId, status: StationStatus.ACTIVE },
    });
    if (activeStations === 0) {
      throw new ApiException('Add at least one active station before submitting for approval');
    }
    const updated = await this.prisma.club.update({
      where: { id: clubId },
      data: { status: ClubStatus.PENDING, rejectionReason: null },
    });
    this.audit.log({ actorUserId: user.id, action: 'club.submitted', entityType: 'Club', entityId: clubId });
    return updated;
  }

  async ownerClubDetail(user: AuthUser, clubId: number) {
    const club = await this.access.assertOperatorOrAdmin(clubId, user);
    const [stations, hours, closures, rules, branches, memberships, counts] = await this.prisma.$transaction([
      this.prisma.station.findMany({
        where: { clubId },
        include: { category: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.operatingHours.findMany({ where: { clubId }, orderBy: { dayOfWeek: 'asc' } }),
      this.prisma.specialClosure.findMany({ where: { clubId }, orderBy: { date: 'asc' } }),
      this.prisma.pricingRule.findMany({ where: { clubId }, orderBy: [{ priority: 'desc' }, { id: 'desc' }] }),
      this.prisma.clubBranch.findMany({ where: { clubId } }),
      this.prisma.clubMembership.findMany({
        where: { clubId },
        include: { user: { select: { id: true, email: true, profile: { select: { displayName: true } } } } },
      }),
      this.prisma.booking.groupBy({ by: ['status'], where: { clubId }, _count: true, orderBy: { status: 'asc' } }),
    ]);

    return {
      club,
      myRole: club.ownerId === user.id ? 'OWNER' : (user.role === Role.ADMIN ? 'ADMIN' : 'STAFF'),
      stations: stations.map((s) => ({ ...s, pricePerHour: Number(s.pricePerHour) })),
      hours,
      closures,
      pricingRules: rules.map((r) => ({ ...r, amount: Number(r.amount) })),
      branches,
      memberships,
      bookingCounts: counts.reduce<Record<string, number>>((acc, c) => {
        acc[c.status] = c._count as number;
        return acc;
      }, {}),
    };
  }

  async addBranch(user: AuthUser, clubId: number, dto: CreateBranchDto) {
    await this.access.assertOwner(clubId, user);
    if (dto.isMain) {
      await this.prisma.clubBranch.updateMany({ where: { clubId }, data: { isMain: false } });
    }
    return this.prisma.clubBranch.create({
      data: { clubId, name: dto.name, address: dto.address, latitude: dto.latitude, longitude: dto.longitude, isMain: dto.isMain ?? false },
    });
  }

  async inviteStaff(user: AuthUser, clubId: number, dto: InviteStaffDto) {
    await this.access.assertOwner(clubId, user);
    const target = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (!target) throw new NotFoundException('No CyberBook account with this email');
    if (target.id === user.id) throw new ApiException('You are already the owner of this club');
    const existing = await this.prisma.clubMembership.findUnique({
      where: { clubId_userId: { clubId, userId: target.id } },
    });
    if (existing) throw new ConflictException('This user is already a member of the club');
    const membership = await this.prisma.clubMembership.create({
      data: {
        clubId,
        userId: target.id,
        role: dto.role === 'MANAGER' ? 'MANAGER' : 'STAFF',
      },
    });
    if (target.role === Role.USER) {
      await this.prisma.user.update({ where: { id: target.id }, data: { role: Role.STAFF } });
    }
    this.audit.log({
      actorUserId: user.id,
      action: 'club.staff_invited',
      entityType: 'ClubMembership',
      entityId: membership.id,
      metadata: { clubId, invitedUserId: target.id, role: membership.role },
    });
    return membership;
  }

  async removeStaff(user: AuthUser, clubId: number, membershipId: number) {
    await this.access.assertOwner(clubId, user);
    const membership = await this.prisma.clubMembership.findUnique({ where: { id: membershipId } });
    if (!membership || membership.clubId !== clubId) throw new NotFoundException('Membership not found');
    await this.prisma.clubMembership.delete({ where: { id: membershipId } });
    this.audit.log({
      actorUserId: user.id,
      action: 'club.staff_removed',
      entityType: 'ClubMembership',
      entityId: membershipId,
      metadata: { clubId, removedUserId: membership.userId },
    });
    return { removed: true };
  }
}
