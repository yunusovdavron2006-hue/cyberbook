import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '../common/exceptions';
import { AuthUser } from '../common/decorators/current-user.decorator';

/**
 * Central tenant-access checks. Every club-scoped operation must go through
 * these helpers so ownership boundaries cannot be bypassed by client input.
 */
@Injectable()
export class ClubAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getClubOr404(clubId: number) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Club not found');
    return club;
  }

  /** Owner (or platform admin). Used for pricing, stations, hours, settings. */
  async assertOwnerOrAdmin(clubId: number, user: AuthUser) {
    const club = await this.getClubOr404(clubId);
    if (user.role === Role.ADMIN) return club;
    if (club.ownerId === user.id) return club;
    throw new ForbiddenException('You do not have permission to manage this club');
  }

  /**
   * Owner, manager/staff member (active membership), or platform admin.
   * Used for operational reads such as booking lists.
   */
  async assertOperatorOrAdmin(clubId: number, user: AuthUser) {
    const club = await this.getClubOr404(clubId);
    if (user.role === Role.ADMIN) return club;
    if (club.ownerId === user.id) return club;
    const membership = await this.prisma.clubMembership.findUnique({
      where: { clubId_userId: { clubId, userId: user.id } },
    });
    if (membership) return club;
    throw new ForbiddenException('You do not have permission to manage this club');
  }

  /** Owners and ADMIN may invite/remove staff; staff cannot. */
  async assertOwner(clubId: number, user: AuthUser) {
    const club = await this.getClubOr404(clubId);
    if (user.role === Role.ADMIN || club.ownerId === user.id) return club;
    throw new ForbiddenException('Only the club owner can perform this action');
  }
}
