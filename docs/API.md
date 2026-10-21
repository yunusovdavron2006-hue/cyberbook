# API Reference

Base URL: `http://localhost:4000/api/v1` (prefix configured via `API_GLOBAL_PREFIX`).
Interactive Swagger UI: `http://localhost:4000/docs`.

## Response envelope

Success:

```json
{ "success": true, "message": "OK", "data": { ... } }
```

Error:

```json
{ "success": false, "message": "Human readable", "code": "OPTIONAL_CODE", "path": "/api/v1/...", "timestamp": "..." }
```

Prisma unique violations and booking-overlap exclusion violations are returned as
**HTTP 409**.

## Authentication

- `Authorization: Bearer <accessToken>` for protected routes.
- Access tokens are short-lived JWTs (`JWT_ACCESS_TTL_MINUTES`, default 15).
- Refresh tokens are opaque, stored hashed in `sessions`, and rotated on use.
- Guards: a route is protected unless marked `@Public()`. `@Roles(...)` restricts
  by role. Admin routes require `ADMIN`; club-management routes check ownership,
  staff membership, or admin via `ClubAccessService`.

### auth

| Method | Path | Notes |
| ------ | ---- | ----- |
| POST | `/auth/register` | Public. Returns tokens + user. |
| POST | `/auth/login` | Public. |
| POST | `/auth/refresh` | Public. Rotates the refresh token. |
| POST | `/auth/logout` | Revokes one refresh token. |
| POST | `/auth/logout-all` | Revokes all sessions for the user. |
| POST | `/auth/forgot-password` | Public. |
| POST | `/auth/reset-password` | Public. |
| POST | `/auth/verify` | Public. Verify email/phone code. |
| GET | `/auth/me` | Current user. |

### users

`GET /users/me`, `PATCH /users/me`, `POST /users/me/change-password`,
`DELETE /users/me`.

### clubs (discovery + management)

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/clubs` | Public search. Query: `city`, `district`, `q`, `category`, `sort`, `page`, `size`. |
| GET | `/clubs/:idOrSlug` | Public detail. Query: `lat`, `lng` for distance. |
| GET | `/clubs/owner/mine` | Clubs the caller owns/manages. |
| POST | `/clubs` | Create (owner). |
| GET | `/clubs/:id/manage` | Owner management payload. |
| PUT | `/clubs/:id` | Update. |
| DELETE | `/clubs/:id` | Delete. |
| POST | `/clubs/:id/submit` | Submit `DRAFT`/`REJECTED` for approval. |
| POST | `/clubs/:id/branches` | Add branch. |
| POST | `/clubs/:id/staff` | Add staff membership. |
| DELETE | `/clubs/:id/staff/:membershipId` | Remove staff. |

### stations & categories

`GET /station-categories`, `GET /clubs/:clubId/stations`,
`GET /clubs/:clubId/stations/manage`, `POST /clubs/:clubId/stations`,
`POST /clubs/:clubId/stations/bulk`, `PUT /stations/:id`,
`PATCH /stations/:id/status`, `DELETE /stations/:id`.

### hours & closures

`GET /clubs/:clubId/hours`, `PUT /clubs/:clubId/hours` (replace all seven days),
`GET /clubs/:clubId/closures`, `POST /clubs/:clubId/closures`,
`DELETE /clubs/:clubId/closures/:closureId`.

### pricing

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/clubs/:clubId/pricing-rules` | List rules. |
| POST | `/clubs/:clubId/pricing-rules` | Create rule. |
| PATCH | `/clubs/:clubId/pricing-rules/:ruleId` | Toggle active. |
| DELETE | `/clubs/:clubId/pricing-rules/:ruleId` | Delete. |
| GET | `/clubs/:clubId/price-quote` | **Public.** Query: `stationId`, `startsAt`, `endsAt`. |

### availability & maintenance

`GET /clubs/:clubId/availability` (query `date` = `YYYY-MM-DD`),
`GET /stations/:stationId/busy`, `GET /clubs/:clubId/maintenance`,
`POST /stations/:stationId/maintenance`, `DELETE /maintenance/:id`.

### bookings

| Method | Path | Notes |
| ------ | ---- | ----- |
| POST | `/bookings` | Create. Body: `clubId`, `stationId`, `startsAt`, `endsAt`, optional `idempotencyKey`, optional `paymentMethod`. |
| GET | `/bookings/mine` | Caller's bookings. Query: `status`, `page`, `size`. |
| GET | `/bookings/:id` | Single booking (owner or club staff/admin). |
| POST | `/bookings/:id/cancel` | Body: `reason`. |
| PATCH | `/bookings/:id/status` | Staff/admin status transition. Body: `status`, `reason`. |
| POST | `/bookings/:id/check-in` | Staff check-in. |
| GET | `/clubs/:clubId/bookings` | Club bookings (staff/admin). Query: `status`, `date`, paging. |
| GET | `/clubs/:clubId/dashboard` | Club dashboard metrics. |

### payments

`GET /payments/providers` (public), `POST /bookings/:id/pay-at-club`,
`GET /bookings/:id/payment`, `POST /bookings/:id/payment/mark-paid`.

### reviews & favorites

`GET /clubs/:clubId/reviews`, `POST /clubs/:clubId/reviews`,
`GET /clubs/:clubId/reviews/manage`, `PATCH /admin/reviews/:id/status`,
`GET /favorites/mine`, `POST /clubs/:clubId/favorite` (toggle).

### notifications & support

`GET /notifications`, `PATCH /notifications/read-all`,
`PATCH /notifications/:id/read`, `POST /support/tickets`,
`GET /support/tickets/mine`, `GET /support/tickets/:id`,
`POST /support/tickets/:id/messages`.

### admin

`GET /admin/stats`, `GET /admin/users`, `GET /admin/users/:id`,
`PATCH /admin/users/:id/role`, `PATCH /admin/users/:id/status`,
`GET /admin/clubs`, `GET /admin/clubs/:id`, `POST /admin/clubs/:id/approve`,
`POST /admin/clubs/:id/reject`, `POST /admin/clubs/:id/suspend`,
`POST /admin/clubs/:id/reactivate`, `GET /admin/settings`,
`PUT /admin/settings/:key`, `GET /admin/support/tickets`,
`PATCH /admin/support/tickets/:id/status`.

### audit & health

`GET /audit` (admin), `GET /health` (public).

## Pagination

List endpoints that return many rows use:

```json
{ "items": [ ... ], "page": 1, "size": 20, "total": 42, "totalPages": 3 }
```
