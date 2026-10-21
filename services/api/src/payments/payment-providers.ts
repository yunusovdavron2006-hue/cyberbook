import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

export interface PaymentIntentResult {
  providerRef: string;
  status: 'PENDING' | 'PAID' | 'FAILED';
  redirectUrl?: string;
}

export interface PaymentWebhookResult {
  providerRef: string;
  status: 'PAID' | 'FAILED' | 'REFUNDED';
  amount: number;
  currency: string;
}

/**
 * Payment provider adapter interface.
 *
 * IMPORTANT: The MVP ships only the development-safe `pay-at-club` flow.
 * Real providers (e.g. Payme, Click) each require an official merchant
 * agreement, credentials and webhook verification. Adapters below throw a
 * clear "not configured" error until real credentials are supplied, so the
 * system never reports payments as working when they are not.
 */
export interface PaymentProviderAdapter {
  readonly key: string;
  isConfigured(): boolean;
  createIntent(input: { bookingReference: string; amount: number; currency: string }): Promise<PaymentIntentResult>;
  parseWebhook(rawBody: string, signature: string | undefined): PaymentWebhookResult;
}

@Injectable()
export class PayAtClubAdapter implements PaymentProviderAdapter {
  readonly key = 'pay-at-club';

  isConfigured(): boolean {
    return true;
  }

  async createIntent(input: {
    bookingReference: string;
    amount: number;
    currency: string;
  }): Promise<PaymentIntentResult> {
    // No external gateway is involved: the customer pays at the club.
    return { providerRef: `pay-at-club:${input.bookingReference}`, status: 'PENDING' };
  }

  parseWebhook(): PaymentWebhookResult {
    throw new NotImplementedException('pay-at-club does not accept webhooks');
  }
}

@Injectable()
export class HmacProviderAdapter implements PaymentProviderAdapter {
  readonly logger = new Logger(HmacProviderAdapter.name);

  constructor(
    private readonly config: ConfigService,
    readonly key: string,
  ) {}

  private get secret(): string | undefined {
    return this.config.get<string>('PAYMENTS_SECRET_KEY') || process.env.PAYMENTS_SECRET_KEY;
  }

  isConfigured(): boolean {
    return Boolean(this.secret && process.env.PAYMENTS_MERCHANT_ID);
  }

  async createIntent(): Promise<PaymentIntentResult> {
    if (!this.isConfigured()) {
      throw new NotImplementedException(
        `${this.key} payments are not configured. Provide PAYMENTS_MERCHANT_ID and PAYMENTS_SECRET_KEY.`,
      );
    }
    // A real implementation would call the provider API here.
    throw new NotImplementedException(`${this.key} provider adapter is a documented placeholder`);
  }

  /** Generic HMAC-SHA256 webhook verification; replace with the provider's spec. */
  parseWebhook(rawBody: string, signature: string | undefined): PaymentWebhookResult {
    if (!this.isConfigured() || !this.secret) {
      throw new NotImplementedException(`${this.key} is not configured`);
    }
    if (!signature) {
      throw new NotImplementedException('Missing webhook signature');
    }
    const expected = createHmac('sha256', this.secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new NotImplementedException('Invalid webhook signature');
    }
    const payload = JSON.parse(rawBody) as {
      providerRef: string;
      status: PaymentWebhookResult['status'];
      amount: number;
      currency: string;
    };
    return payload;
  }
}

@Injectable()
export class PaymentProviderRegistry {
  private readonly adapters: Map<string, PaymentProviderAdapter>;

  constructor(private readonly config: ConfigService) {
    const payAtClub = new PayAtClubAdapter();
    const payme = new HmacProviderAdapter(config, 'payme');
    const click = new HmacProviderAdapter(config, 'click');
    this.adapters = new Map(
      [payAtClub, payme, click].map((adapter) => [adapter.key, adapter]),
    );
  }

  get(key: string): PaymentProviderAdapter | undefined {
    return this.adapters.get(key);
  }

  listConfigured(): string[] {
    return [...this.adapters.values()].filter((a) => a.isConfigured()).map((a) => a.key);
  }
}
