/**
 * Shared CyberBook API types. These mirror the backend DTOs.
 * Money is always an integer number of so'm (UZS).
 */

export type Role = 'USER' | 'CLUB_OWNER' | 'STAFF' | 'ADMIN';
export type ClubStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type StationStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW' | 'EXPIRED';
export type PaymentStatus = 'NOT_REQUIRED' | 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';
export type PaymentMethod = 'PAY_AT_CLUB' | 'ONLINE';
export type ReviewStatus = 'PUBLISHED' | 'HIDDEN';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type StationCategoryKey = 'PC' | 'VIP_PC' | 'BOOTCAMP' | 'CONSOLE';
export type PromotionType = 'PERCENT' | 'FLAT';
export type LoyaltyEntryType = 'EARN' | 'REDEEM' | 'ADJUST' | 'EXPIRE';
export type ReferralStatus = 'PENDING' | 'QUALIFIED' | 'REWARDED' | 'CANCELLED';
export type LoyaltyTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  code?: string;
  path?: string;
  timestamp?: string;
}

export interface AuthedUser {
  id: number;
  email: string;
  phone: string | null;
  role: Role;
  status: string;
  locale: string;
  displayName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthedUser;
}

export interface OperatingHours {
  id: number;
  clubId: number;
  dayOfWeek: number; // 0 = Monday … 6 = Sunday
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export interface StationCategory {
  id: number;
  key: StationCategoryKey;
  labelUz: string;
  labelRu: string;
  labelEn: string;
}

export interface Station {
  id: number;
  clubId: number;
  categoryId: number;
  label: string;
  status: StationStatus;
  specs?: unknown;
  pricePerHour: number;
  sortOrder: number;
  category?: StationCategory;
}

/** Optional 2D floor-plan coordinates, stored inside `Station.specs`. */
export interface StationLayout {
  zone: string | null;
  mapX: number | null;
  mapY: number | null;
}

/** Safely reads floor-plan coordinates out of a station's free-form specs. */
export function readStationLayout(station: Pick<Station, 'specs'>): StationLayout {
  const specs =
    station.specs && typeof station.specs === 'object'
      ? (station.specs as Record<string, unknown>)
      : {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const zone = typeof specs.zone === 'string' && specs.zone.trim() ? specs.zone : null;
  return { zone, mapX: num(specs.mapX), mapY: num(specs.mapY) };
}

export interface ClubSummary {
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
  stationCount: number;
  minPricePerHour: number;
  categories: StationCategoryKey[];
  distanceKm: number | null;
  hours?: OperatingHours[];
  createdAt: string;
}

export interface ClubDetail extends ClubSummary {
  stations?: Station[];
}

export interface Paged<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

export interface TimeWindow {
  startsAt: string;
  endsAt: string;
}

export interface AvailabilityStation {
  stationId: number;
  label: string;
  category: StationCategoryKey;
  pricePerHour: number;
  status: StationStatus;
  busy: TimeWindow[];
  free: TimeWindow[];
}

export interface AvailabilityDay {
  clubId: number;
  timezone: string;
  date: string;
  closedAllDay: boolean;
  windows: TimeWindow[];
  stations: AvailabilityStation[];
}

export type LiveStationState = 'FREE' | 'BUSY' | 'MAINTENANCE' | 'CLOSED' | 'OFFLINE';

export interface LiveStation {
  stationId: number;
  label: string;
  category: StationCategoryKey;
  pricePerHour: number;
  status: StationStatus;
  state: LiveStationState;
  busyUntil: string | null;
  bookableNow: boolean;
}

export interface LiveAvailability {
  clubId: number;
  timezone: string;
  now: string;
  isOpenNow: boolean;
  counts: { total: number; free: number; busy: number; maintenance: number; offline: number };
  stations: LiveStation[];
}

export interface PriceQuote {
  total: number;
  currency: string;
  snapshot: {
    basePricePerHour: number;
    resolvedRate: number;
    unit: 'PER_HOUR' | 'FLAT';
    source: 'STATION_RULE' | 'CATEGORY_RULE' | 'BASE_PRICE';
    ruleId: number | null;
    ruleName: string | null;
    minutes: number;
    total: number;
    currency: string;
    computedAt: string;
  };
}

export interface Booking {
  id: number;
  reference: string;
  userId: number;
  customerName?: string | null;
  clubId: number;
  clubName?: string | null;
  clubSlug?: string | null;
  timezone?: string;
  stationId: number;
  stationLabel?: string | null;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  priceAmount: number;
  currency: string;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  expiresAt: string | null;
  cancelReason?: string | null;
  createdAt: string;
  idempotentReplay?: boolean;
  events?: unknown[];
}

export interface CreateBookingInput {
  clubId: number;
  stationId: number;
  startsAt: string;
  endsAt: string;
  idempotencyKey?: string;
  paymentMethod?: PaymentMethod;
  promoCode?: string;
}

export type GroupBookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PARTIALLY_CANCELLED'
  | 'CANCELLED'
  | 'COMPLETED';

export type GroupInviteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'MEMBER';

export interface GroupBookingSeat {
  id: number;
  reference: string;
  stationId: number;
  stationLabel: string | null;
  status: BookingStatus;
}

export interface GroupBookingParticipant {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
  status: GroupInviteStatus;
  invitedAt: string | null;
  inviteExpiresAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
}

export interface GroupBooking {
  id: number;
  reference: string;
  userId: number;
  clubId: number;
  clubName: string | null;
  clubSlug: string | null;
  startsAt: string;
  endsAt: string;
  status: GroupBookingStatus;
  seatsRequested: number;
  seatsConfirmed: number;
  totalAmount: number;
  currency: string;
  notes: string | null;
  createdAt: string;
  bookings: GroupBookingSeat[];
  participants: GroupBookingParticipant[];
  idempotentReplay?: boolean;
}

export interface CreateGroupBookingInput {
  clubId: number;
  startsAt: string;
  endsAt: string;
  stationIds: number[];
  notes?: string;
  promoCode?: string;
  idempotencyKey?: string;
  participants?: { name?: string; email?: string }[];
}

export interface CreateGroupInvitesInput {
  invitees: { name?: string; email?: string }[];
}

export interface GroupInviteIssued {
  participantId: number;
  email: string | null;
  name: string | null;
  inviteToken: string;
  inviteExpiresAt: string;
}

export interface GroupInvitesIssued {
  groupId: number;
  inviteExpiresAt: string;
  invites: GroupInviteIssued[];
}

export interface MyGroupInvite {
  participantId: number;
  name: string | null;
  email: string | null;
  group: GroupBooking;
}

export interface Review {
  id: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  authorName?: string;
}

export interface ReviewStatusUpdate {
  status: ReviewStatus;
}

export interface OwnerClubSummary {
  id: number;
  name: string;
  slug: string;
  status: ClubStatus;
  city: string;
  rating: number;
  reviewCount: number;
  stationCount: number;
  bookingCount: number;
  myRole: string;
}

export interface ClubDashboard {
  club: { id: number; name: string; status: ClubStatus };
  todayBookings: number;
  upcomingBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  activeStations: number;
  totalStations: number;
  occupancyPercent: number;
  grossBookingValueToday: number;
  grossBookingValue7d: number;
  note: string;
}

export interface PricingRule {
  id: number;
  clubId: number;
  stationId: number | null;
  categoryId: number | null;
  name: string;
  priority: number;
  dayOfWeeks: number[];
  startsAtTime: string | null;
  endsAtTime: string | null;
  unit: 'PER_HOUR' | 'FLAT';
  amount: number;
  active: boolean;
}

export interface AdminStats {
  users: number;
  clubOwners: number;
  clubsByStatus: Record<string, number>;
  pendingClubApprovals: number;
  bookingsToday: number;
  bookingsTotal: number;
  grossBookingVolume: number;
  openSupportTickets: number;
  note: string;
}

export interface AdminClub extends ClubSummary {
  status: ClubStatus;
  owner?: { id: number; email: string };
  _count?: { stations: number; bookings: number };
}

export interface AdminUserSummary {
  id: number;
  email: string;
  phone: string | null;
  role: Role;
  status: string;
  createdAt: string;
  profile: { displayName: string | null } | null;
}

export interface SupportTicket {
  id: number;
  subject: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  messages?: { id: number; body: string; fromStaff: boolean; createdAt: string }[];
  user?: { id: number; email: string };
}

export interface Promotion {
  id: number;
  clubId: number;
  createdById: number | null;
  code: string | null;
  name: string;
  description: string | null;
  type: PromotionType;
  value: number;
  stationId: number | null;
  categoryId: number | null;
  dayOfWeeks: number[];
  startsAtTime: string | null;
  endsAtTime: string | null;
  validFrom: string | null;
  validUntil: string | null;
  minDurationMinutes: number | null;
  maxUsesTotal: number | null;
  maxUsesPerUser: number | null;
  stackable: boolean;
  priority: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  redemptionCount?: number;
}

export interface PromotionPreview {
  subtotal: number;
  discount: number;
  promotion: Promotion | null;
}

export interface CreatePromotionInput {
  code?: string;
  name: string;
  description?: string;
  type: PromotionType;
  value: number;
  stationId?: number;
  categoryId?: number;
  dayOfWeeks?: number[];
  startsAtTime?: string;
  endsAtTime?: string;
  validFrom?: string;
  validUntil?: string;
  minDurationMinutes?: number;
  maxUsesTotal?: number;
  maxUsesPerUser?: number;
  stackable?: boolean;
  priority?: number;
  active?: boolean;
}

export interface LoyaltyLedgerEntry {
  id: number;
  userId: number;
  type: LoyaltyEntryType;
  points: number;
  reason: string;
  bookingId: number | null;
  referralId: number | null;
  actorUserId: number | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface LoyaltyAccount {
  balance: number;
  tier: LoyaltyTier;
  valueUzs: number;
  recent: LoyaltyLedgerEntry[];
  earnRate: string;
}

export interface LoyaltyLedgerPage {
  items: LoyaltyLedgerEntry[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

export interface RedeemResult {
  pointsSpent: number;
  valueUzs: number;
  balance: number;
  replay?: boolean;
}

export interface ReferralSummary {
  code: string;
  active: boolean;
  invited: number;
  rewarded: number;
  rewardPoints: number;
  refereeBonusPoints: number;
  shareUrl: string;
}

export interface ReferralListItem {
  id: number;
  status: ReferralStatus;
  rewardPoints: number;
  createdAt: string;
  rewardedAt: string | null;
  referredName: string;
}

export interface ApplyReferralResult {
  id: number;
  status: ReferralStatus;
  refereeBonusPoints: number;
}
