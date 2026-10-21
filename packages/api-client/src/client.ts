import type {
  AdminClub,
  AdminStats,
  AdminUserSummary,
  ApiEnvelope,
  ApiErrorBody,
  ApplyReferralResult,
  AuthedUser,
  AvailabilityDay,
  Booking,
  LiveAvailability,
  ClubDashboard,
  ClubDetail,
  ClubSummary,
  CreateBookingInput,
  CreatePromotionInput,
  LoyaltyAccount,
  LoyaltyLedgerPage,
  OperatingHours,
  OwnerClubSummary,
  Paged,
  PriceQuote,
  PricingRule,
  Promotion,
  PromotionPreview,
  RedeemResult,
  ReferralListItem,
  ReferralSummary,
  Review,
  ReviewStatus,
  Role,
  Station,
  StationCategory,
  SupportTicket,
  TicketStatus,
  TokenPair,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly body?: ApiErrorBody,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null | undefined;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
}

type QueryValue = string | number | boolean | undefined | null;

function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Thin, typed fetch wrapper around the CyberBook REST API.
 * It unwraps the `{ success, message, data }` envelope and throws ApiError on failure.
 */
export class CyberBookClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    // Wrap fetch in an arrow function so it is never invoked with the client as
    // its receiver. Calling `window.fetch` as an object method throws
    // "TypeError: Illegal invocation" in browsers, which would break every
    // client-side request.
    const impl = options.fetchImpl ?? fetch;
    this.fetchImpl = (input, init) => impl(input, init);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const token = this.options.getAccessToken?.();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    const text = await response.text();
    const json = text ? (JSON.parse(text) as ApiEnvelope<T> | ApiErrorBody) : undefined;

    if (!response.ok) {
      const errorBody = json as ApiErrorBody | undefined;
      if (response.status === 401) this.options.onUnauthorized?.();
      throw new ApiError(errorBody?.message ?? response.statusText, response.status, errorBody?.code, errorBody);
    }
    return (json as ApiEnvelope<T>).data;
  }

  private get<T>(path: string) {
    return this.request<T>(path, { method: 'GET' });
  }

  private post<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  }

  private put<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) });
  }

  private patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) });
  }

  private del<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }

  // ------------------------------------------------------------- discovery
  health() {
    return this.get<{ status: string; uptimeSeconds: number }>('/health');
  }

  stationCategories() {
    return this.get<StationCategory[]>('/station-categories');
  }

  searchClubs(params: {
    city?: string;
    district?: string;
    q?: string;
    category?: string;
    sort?: string;
    lat?: number;
    lng?: number;
    availableNow?: boolean;
    minRating?: number;
    minPrice?: number;
    maxPrice?: number;
    page?: number;
    size?: number;
  } = {}) {
    // The public API documents the free-text filter as `search`; callers use the
    // shorter `q`, so translate it to the canonical wire parameter here.
    const { q, ...rest } = params;
    return this.get<Paged<ClubSummary>>(`/clubs${buildQuery({ ...rest, search: q })}`);
  }

  getClub(idOrSlug: string | number, params: { lat?: number; lng?: number } = {}) {
    return this.get<ClubDetail>(`/clubs/${idOrSlug}${buildQuery(params)}`);
  }

  getAvailability(clubId: number, date?: string) {
    return this.get<AvailabilityDay>(`/clubs/${clubId}/availability${buildQuery({ date })}`);
  }

  /** Live "is each station free right now" snapshot (poll for real-time availability). */
  getAvailabilityNow(clubId: number) {
    return this.get<LiveAvailability>(`/clubs/${clubId}/availability/now`);
  }

  quotePrice(clubId: number, params: { stationId: number; startsAt: string; endsAt: string }) {
    return this.get<PriceQuote>(`/clubs/${clubId}/price-quote${buildQuery(params)}`);
  }

  clubReviews(clubId: number, params: { page?: number; size?: number } = {}) {
    return this.get<Paged<Review>>(`/clubs/${clubId}/reviews${buildQuery(params)}`);
  }

  // ------------------------------------------------------------------ auth
  register(input: { email: string; password: string; fullName: string; phone?: string; role?: Role }) {
    return this.post<TokenPair>('/auth/register', input);
  }

  login(input: { email: string; password: string }) {
    return this.post<TokenPair>('/auth/login', input);
  }

  refresh(refreshToken: string) {
    return this.post<TokenPair>('/auth/refresh', { refreshToken });
  }

  logout(refreshToken: string) {
    return this.post<{ loggedOut: boolean }>('/auth/logout', { refreshToken });
  }

  me() {
    return this.get<AuthedUser>('/auth/me');
  }

  updateProfile(input: { displayName?: string; avatarUrl?: string; locale?: string }) {
    return this.patch<AuthedUser>('/users/me', input);
  }

  changePassword(input: { currentPassword: string; newPassword: string }) {
    return this.post<{ changed: boolean }>('/users/me/change-password', input);
  }

  // -------------------------------------------------------------- bookings
  createBooking(input: CreateBookingInput) {
    return this.post<Booking>('/bookings', input);
  }

  myBookings(params: { status?: string; page?: number; size?: number } = {}) {
    return this.get<Paged<Booking>>(`/bookings/mine${buildQuery(params)}`);
  }

  getBooking(id: number) {
    return this.get<Booking>(`/bookings/${id}`);
  }

  cancelBooking(id: number, reason?: string) {
    return this.post<Booking>(`/bookings/${id}/cancel`, { reason });
  }

  // ------------------------------------------------------------- favorites
  myFavorites() {
    return this.get<ClubSummary[]>('/favorites/mine');
  }

  toggleFavorite(clubId: number) {
    return this.post<{ favorited: boolean }>(`/clubs/${clubId}/favorite`);
  }

  // ---------------------------------------------------------------- owners
  myClubs() {
    return this.get<{ clubs: OwnerClubSummary[]; isOwner: boolean }>('/clubs/owner/mine');
  }

  ownerClubDetail(clubId: number) {
    return this.get<{
      club: ClubSummary & { status: string; rejectionReason?: string | null };
      myRole: string;
      stations: Station[];
      hours: OperatingHours[];
      closures: { id: number; date: string; reason: string | null }[];
      pricingRules: PricingRule[];
      branches: unknown[];
      memberships: unknown[];
      bookingCounts: Record<string, number>;
    }>(`/clubs/${clubId}/manage`);
  }

  createClub(input: {
    name: string;
    address: string;
    city: string;
    district?: string;
    latitude: number;
    longitude: number;
    description?: string;
    phone?: string;
  }) {
    return this.post<ClubSummary>('/clubs', input);
  }

  submitClubForApproval(clubId: number) {
    return this.post<ClubSummary>(`/clubs/${clubId}/submit`);
  }

  createStation(
    clubId: number,
    input: { label: string; categoryKey: string; pricePerHour: number; status?: string },
  ) {
    return this.post<Station>(`/clubs/${clubId}/stations`, input);
  }

  updateStation(
    stationId: number,
    input: {
      label?: string;
      pricePerHour?: number;
      status?: string;
      categoryKey?: string;
      specs?: Record<string, unknown>;
      zone?: string;
      mapX?: number;
      mapY?: number;
      sortOrder?: number;
    },
  ) {
    return this.put<Station>(`/stations/${stationId}`, input);
  }

  /** Persist 2D floor-plan coordinates for many stations in one call. */
  updateStationLayout(
    clubId: number,
    items: { stationId: number; zone?: string; mapX?: number; mapY?: number }[],
  ) {
    return this.put<{ updated: number; skipped: number[] }>(`/clubs/${clubId}/stations/layout`, {
      items,
    });
  }

  replaceHours(clubId: number, hours: { dayOfWeek: number; closed: boolean; opensAt?: string; closesAt?: string }[]) {
    return this.put<OperatingHours[]>(`/clubs/${clubId}/hours`, { hours });
  }

  listPricingRules(clubId: number) {
    return this.get<PricingRule[]>(`/clubs/${clubId}/pricing-rules`);
  }

  createPricingRule(
    clubId: number,
    input: {
      name: string;
      amount: number;
      unit?: 'PER_HOUR' | 'FLAT';
      priority?: number;
      dayOfWeeks?: number[];
      startsAtTime?: string;
      endsAtTime?: string;
      categoryKey?: string;
      stationId?: number;
    },
  ) {
    return this.post<PricingRule>(`/clubs/${clubId}/pricing-rules`, input);
  }

  clubBookings(clubId: number, params: { status?: string; date?: string; page?: number; size?: number } = {}) {
    return this.get<Paged<Booking>>(`/clubs/${clubId}/bookings${buildQuery(params)}`);
  }

  clubDashboard(clubId: number) {
    return this.get<ClubDashboard>(`/clubs/${clubId}/dashboard`);
  }

  setBookingStatus(bookingId: number, status: string, reason?: string) {
    return this.patch<Booking>(`/bookings/${bookingId}/status`, { status, reason });
  }

  checkInBooking(bookingId: number) {
    return this.post<Booking>(`/bookings/${bookingId}/check-in`);
  }

  markPaymentPaid(bookingId: number) {
    return this.post<unknown>(`/bookings/${bookingId}/payment/mark-paid`);
  }

  // ----------------------------------------------------------------- admin
  adminStats() {
    return this.get<AdminStats>('/admin/stats');
  }

  adminClubs(params: { status?: string; page?: number; size?: number } = {}) {
    return this.get<Paged<AdminClub>>(`/admin/clubs${buildQuery(params)}`);
  }

  adminApproveClub(clubId: number) {
    return this.post<AdminClub>(`/admin/clubs/${clubId}/approve`);
  }

  adminRejectClub(clubId: number, reason?: string) {
    return this.post<AdminClub>(`/admin/clubs/${clubId}/reject`, { reason });
  }

  adminSuspendClub(clubId: number, reason?: string) {
    return this.post<AdminClub>(`/admin/clubs/${clubId}/suspend`, { reason });
  }

  adminUsers(params: { role?: string; status?: string; q?: string; page?: number; size?: number } = {}) {
    return this.get<Paged<AdminUserSummary>>(`/admin/users${buildQuery(params)}`);
  }

  adminSetUserRole(userId: number, role: Role) {
    return this.patch<{ id: number; role: Role }>(`/admin/users/${userId}/role`, { role });
  }

  adminSetUserStatus(userId: number, status: string) {
    return this.patch<{ id: number; status: string }>(`/admin/users/${userId}/status`, { status });
  }

  adminTickets(params: { status?: string; page?: number; size?: number } = {}) {
    return this.get<Paged<SupportTicket>>(`/admin/support/tickets${buildQuery(params)}`);
  }

  adminSetTicketStatus(ticketId: number, status: TicketStatus) {
    return this.patch<SupportTicket>(`/admin/support/tickets/${ticketId}/status`, { status });
  }

  setReviewStatus(reviewId: number, status: ReviewStatus) {
    return this.patch<Review>(`/admin/reviews/${reviewId}/status`, { status });
  }

  // ------------------------------------------------------------ promotions
  clubPromotions(clubId: number) {
    return this.get<Promotion[]>(`/clubs/${clubId}/promotions`);
  }

  previewPromotion(
    clubId: number,
    params: { stationId: number; startsAt: string; endsAt: string; code?: string },
  ) {
    return this.post<PromotionPreview>(`/clubs/${clubId}/promotions/preview`, params);
  }

  managePromotions(clubId: number) {
    return this.get<Promotion[]>(`/clubs/${clubId}/promotions/manage`);
  }

  createPromotion(clubId: number, input: CreatePromotionInput) {
    return this.post<Promotion>(`/clubs/${clubId}/promotions`, input);
  }

  updatePromotion(clubId: number, promotionId: number, input: CreatePromotionInput) {
    return this.put<Promotion>(`/clubs/${clubId}/promotions/${promotionId}`, input);
  }

  setPromotionActive(clubId: number, promotionId: number, active: boolean) {
    return this.patch<Promotion>(`/clubs/${clubId}/promotions/${promotionId}/active`, { active });
  }

  deletePromotion(clubId: number, promotionId: number) {
    return this.del<{ deleted: boolean }>(`/clubs/${clubId}/promotions/${promotionId}`);
  }

  // --------------------------------------------------------------- loyalty
  loyaltyAccount() {
    return this.get<LoyaltyAccount>('/loyalty/me');
  }

  loyaltyLedger(params: { page?: number; size?: number } = {}) {
    return this.get<LoyaltyLedgerPage>(`/loyalty/me/ledger${buildQuery(params)}`);
  }

  redeemPoints(input: { points: number; idempotencyKey?: string }) {
    return this.post<RedeemResult>('/loyalty/redeem', input);
  }

  myReferral() {
    return this.get<ReferralSummary>('/loyalty/referral');
  }

  listReferrals() {
    return this.get<ReferralListItem[]>('/loyalty/referral/list');
  }

  applyReferral(code: string) {
    return this.post<ApplyReferralResult>('/loyalty/referral/apply', { code });
  }
}
