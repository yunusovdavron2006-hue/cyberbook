import { Injectable } from '@nestjs/common';
import { ClubStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '../common/exceptions';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Toggles a favorite. Returns the resulting state. */
  async toggle(userId: number, clubId: number) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Club not found');

    const existing = await this.prisma.favorite.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (existing) {
      await this.prisma.favorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }
    await this.prisma.favorite.create({ data: { userId, clubId } });
    return { favorited: true };
  }

  async list(userId: number) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            slug: true,
            city: true,
            district: true,
            coverImageUrl: true,
            rating: true,
            reviewCount: true,
            status: true,
          },
        },
      },
    });
    return favorites.map((f) => f.club).filter((c) => c.status === ClubStatus.APPROVED);
  }
}
