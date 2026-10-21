import { Injectable } from '@nestjs/common';
import { BookingStatus, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ApiException, ConflictException, ForbiddenException, NotFoundException } from '../common/exceptions';
import { CreateReviewDto, ListReviewsQueryDto } from './dto/reviews.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthUser, clubId: number, dto: CreateReviewDto) {
    const booking = await this.prisma.booking.findUnique({ where: { id: dto.bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== user.id) throw new ForbiddenException('You can only review your own bookings');
    if (booking.clubId !== clubId) throw new ApiException('Booking does not belong to this club');
    if (booking.status !== BookingStatus.COMPLETED) {
      throw new ConflictException(
        'You can only review a club after a completed visit',
        'BOOKING_NOT_COMPLETED',
      );
    }

    const existing = await this.prisma.review.findFirst({
      where: { OR: [{ bookingId: dto.bookingId }, { userId: user.id, clubId }] },
    });
    if (existing) {
      throw new ConflictException('You have already reviewed this club', 'ALREADY_REVIEWED');
    }

    const review = await this.prisma.review.create({
      data: {
        userId: user.id,
        clubId,
        bookingId: dto.bookingId,
        rating: dto.rating,
        comment: dto.comment ?? null,
        status: ReviewStatus.PUBLISHED,
      },
    });
    await this.recomputeClubRating(clubId);
    this.audit.log({
      actorUserId: user.id,
      action: 'review.created',
      entityType: 'Review',
      entityId: review.id,
      metadata: { clubId, rating: dto.rating },
    });
    return review;
  }

  async listPublic(clubId: number, query: ListReviewsQueryDto) {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const where = { clubId, status: ReviewStatus.PUBLISHED };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
        include: { user: { select: { profile: { select: { displayName: true } } } } },
      }),
    ]);
    return {
      items: items.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        authorName: r.user?.profile?.displayName ?? 'CyberBook user',
      })),
      page,
      size,
      total,
      totalPages: Math.ceil(total / size),
    };
  }

  async listForClub(user: AuthUser, clubId: number, query: ListReviewsQueryDto) {
    await this.access.assertOperatorOrAdmin(clubId, user);
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const where = { clubId };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
    ]);
    return { items, page, size, total, totalPages: Math.ceil(total / size) };
  }

  async setStatus(user: AuthUser, reviewId: number, status: ReviewStatus) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    const updated = await this.prisma.review.update({ where: { id: reviewId }, data: { status } });
    await this.recomputeClubRating(review.clubId);
    this.audit.log({
      actorUserId: user.id,
      action: 'review.status_changed',
      entityType: 'Review',
      entityId: reviewId,
      metadata: { status },
    });
    return updated;
  }

  private async recomputeClubRating(clubId: number) {
    const agg = await this.prisma.review.aggregate({
      where: { clubId, status: ReviewStatus.PUBLISHED },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const avg = agg._avg.rating ?? 0;
    await this.prisma.club.update({
      where: { id: clubId },
      data: {
        rating: Math.round(avg * 10) / 10,
        reviewCount: agg._count._all,
      },
    });
  }
}
