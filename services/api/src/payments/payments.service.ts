import { Injectable } from '@nestjs/common';
import { BookingStatus, PaymentStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentProviderRegistry } from './payment-providers';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ApiException, ForbiddenException, NotFoundException } from '../common/exceptions';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: PaymentProviderRegistry,
    private readonly audit: AuditService,
  ) {}

  /** Pay-at-club: record that the customer will pay on arrival. */
  async payAtClub(user: AuthUser, bookingId: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payment: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== user.id) throw new ForbiddenException('Not your booking');
    if (!([BookingStatus.PENDING, BookingStatus.CONFIRMED] as BookingStatus[]).includes(booking.status)) {
      throw new ApiException('Only active bookings can be marked for pay-at-club');
    }
    if (booking.payment) return this.serialize(booking.payment);

    const payment = await this.prisma.payment.create({
      data: {
        bookingId,
        provider: 'pay-at-club',
        providerRef: `pay-at-club:${booking.reference}`,
        amount: booking.priceAmount,
        currency: booking.currency,
        status: PaymentStatus.NOT_REQUIRED,
        idempotencyKey: `pay-at-club:${booking.id}`,
      },
    });
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { paymentMethod: 'PAY_AT_CLUB', paymentStatus: PaymentStatus.NOT_REQUIRED },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'payment.pay_at_club',
      entityType: 'Booking',
      entityId: bookingId,
    });
    return this.serialize(payment);
  }

  async forBooking(user: AuthUser, bookingId: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payment: true, club: { select: { ownerId: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    const allowed =
      booking.userId === user.id ||
      booking.club.ownerId === user.id ||
      user.role === Role.ADMIN;
    if (!allowed) throw new ForbiddenException('Not allowed');
    return booking.payment ? this.serialize(booking.payment) : null;
  }

  /** Owner marks a pay-at-club booking as paid (cash received at the club). */
  async markPaid(user: AuthUser, bookingId: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payment: true, club: { select: { ownerId: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.club.ownerId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only the club owner can record settled payments');
    }
    const payment = booking.payment
      ? await this.prisma.payment.update({
          where: { id: booking.payment.id },
          data: { status: PaymentStatus.PAID },
        })
      : await this.prisma.payment.create({
          data: {
            bookingId,
            provider: 'pay-at-club',
            providerRef: `pay-at-club:${booking.reference}`,
            amount: booking.priceAmount,
            currency: booking.currency,
            status: PaymentStatus.PAID,
            idempotencyKey: `pay-at-club:${booking.id}`,
          },
        });
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { paymentStatus: PaymentStatus.PAID },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'payment.marked_paid',
      entityType: 'Booking',
      entityId: bookingId,
    });
    return this.serialize(payment);
  }

  listProviders() {
    return { configured: this.providers.listConfigured() };
  }

  private serialize(payment: {
    id: number;
    bookingId: number;
    provider: string;
    providerRef: string | null;
    amount: bigint;
    currency: string;
    status: PaymentStatus;
    createdAt: Date;
  }) {
    return { ...payment, amount: Number(payment.amount) };
  }
}
