# Transur API reference

Base URL: `/api`. All bodies are JSON unless noted. Authenticated routes need
`Authorization: Bearer <token>`. Errors always look like `{ "error": "message" }`.
Amounts are in the platform base currency (USD by default).

## Auth (phone + one-time code)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/code` | `{ phone }` | Sends a 6-digit SMS code (printed to the console in development). |
| POST | `/auth/verify` | `{ phone, code }` | Existing user → `{ isNew:false, token, user }`. New number → `{ isNew:true, phoneProof }`. |
| POST | `/auth/signup` | multipart: `phoneProof, role, full_name, email?, referral_code?, vehicle_class?, vehicle_make?, vehicle_color?, plate_number?, licence_number?, avatar?` | `role` is `rider`, `driver` or `courier`. Drivers pick `moto/economy/comfort/xl`; couriers pick `bicycle/moto/car/on_foot`. |

## Account — `/me`

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/me` | all | Profile, plus vehicle, rating and wallet fields for fleet. |
| PATCH | `/me` | all | `full_name`, `email`, `push_token`, or multipart `avatar`. |
| PATCH | `/me/vehicle` | fleet | Update vehicle details (plate change removes verification). |
| PATCH | `/me/availability` | fleet | `{ availability: online|offline, position? }` |
| POST | `/me/position` | fleet | `{ lat, lng, heading?, speed? }` — HTTP fallback when the socket is down. |
| GET | `/me/requests` | fleet | Open requests near the provider (used after reconnecting). |
| GET | `/me/earnings` | fleet | Today / 7-day / lifetime totals, daily series, response rate. |
| GET | `/me/referrals` | all | Own referral code and invited friends. |
| GET/POST/DELETE | `/me/places[/:id]` | all | Saved places (`home`, `work`, `other`; max 20). |
| GET/POST/DELETE | `/me/contacts[/:id]` | all | Trusted contacts texted on SOS (max 5). |

## Bookings (rides and parcels)

One engine handles both services. `service` is `ride` or `parcel`.

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/bookings/quote` | rider | `{ service, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, parcel_size?, promo_code? }` → every vehicle class with price, floor, nearby supply and pickup ETA. |
| POST | `/bookings` | rider | Create. Adds `vehicle_class`, `rider_offer`, `payment_method`, `promo_code?`, `scheduled_for?`, `note?`; parcels also need `recipient_name`, `recipient_phone`, and accept `parcel_size`, `parcel_details`. |
| GET | `/bookings` | all | History. `?service=&scope=open|past&page=&limit=` |
| GET | `/bookings/current` | all | The live booking, if any (restores state after a reload). |
| GET | `/bookings/:id` | participant | Full details. The parcel handover PIN is only returned to the sender. |
| POST | `/bookings/:id/bids` | fleet | `{ amount }` — accept the rider's price (same amount) or counter-offer. |
| DELETE | `/bookings/:id/bids/mine` | fleet | Withdraw an offer. |
| GET | `/bookings/:id/bids` | rider | Open offers, cheapest first. |
| POST | `/bookings/:id/bids/:bidId/accept` | rider | Assign the provider. |
| POST | `/bookings/:id/arrive` · `/start` · `/complete` | provider | Progress the trip. Parcels need `{ pin }` on complete. |
| POST | `/bookings/:id/cancel` | participant | `{ reason? }` |
| POST | `/bookings/:id/rating` | participant | `{ stars, feedback? }` — each side rates once. |
| POST | `/bookings/:id/tip` | rider | `{ amount, method }` — cash is recorded, mobile money is credited to the provider. |
| GET | `/bookings/:id/receipt` | participant | Fare, discount, tip and total. |
| POST | `/bookings/:id/share` | participant | Returns a public tracking URL. |
| POST | `/bookings/:id/sos` | participant | `{ lat?, lng?, message? }` — alerts staff and trusted contacts. |
| GET | `/bookings/:id/messages` | participant | In-trip chat history. |

Booking states: `scheduled → searching → assigned → arrived → in_progress → completed`, or `cancelled`.

## Wallet (fleet)

| Method | Path | Purpose |
|---|---|---|
| GET | `/wallet` | Balance, lock state, last 20 entries. |
| GET | `/wallet/entries?page=` | Full ledger. |
| POST | `/wallet/top-up` | `{ amount, provider, phone? }`. Settles instantly outside production; otherwise waits for the webhook. |
| GET | `/wallet/top-up/:reference` | Poll a pending top-up. |
| POST | `/wallet/webhooks/:provider` | Operator callback. Requires `X-Webhook-Secret`. Body `{ reference, amount, status: "SUCCESS" }`. Idempotent. |

## Engagement

| Method | Path | Purpose |
|---|---|---|
| GET | `/promos` | Codes the user can use now (personal + public). |
| POST | `/promos/check` | `{ code, service?, fare? }` |
| GET | `/notifications` | Inbox + unread count. |
| POST | `/notifications/read` | `{ ids? }` — omit to mark everything read. |
| GET | `/help/thread` | Open (or create) the user's help-desk conversation. |
| POST | `/safety/sos` | SOS without an active booking. |
| GET | `/public/catalog` | Vehicle classes, sizes, payment methods (no auth). |
| GET | `/public/track/:token` | Live view of a shared trip (no auth). |

## Console — `/console` (staff tokens)

`POST /console/auth/login`, `POST /console/auth/request-access`, `GET /console/auth/me`, then:
`GET /overview`, `GET /live`, `GET /people`, `GET /people/:id`, `PATCH /people/:id/status`,
`PATCH /people/:id/verify`, `POST /people/:id/wallet` (owner), `GET /bookings`, `GET /bookings/:id`,
`POST /bookings/:id/cancel`, `GET /wallets`, `PATCH /wallets/:userId/lock`, `GET /ledger`, `GET /finance`,
`GET /fares`, `PATCH /fares/:id` (owner), `GET|POST /promos`, `PATCH /promos/:id` (owner), `GET /sos`,
`PATCH /sos/:id`, `GET|POST /help/threads`, `GET /help/threads/:id`, `POST /help/threads/:id/reply`,
`PATCH /help/threads/:id`, `GET /team`, `PATCH|DELETE /team/:id` (owner).

## Real-time events (Socket.IO)

Connect to the API origin with `auth: { token }` (staff connect to the `/console` namespace).

**Client → server:** `fleet:position {lat,lng,heading,speed}`, `fleet:availability {availability}`,
`chat:send {bookingId, body}`, `help:send {threadId, body}`; staff: `help:reply {threadId, body}`.

**Server → riders:** `booking:bid`, `booking:bid_withdrawn`, `booking:assigned`, `booking:arrived`,
`booking:started`, `booking:completed`, `booking:cancelled`, `booking:released`, `provider:position`.

**Server → fleet:** `booking:new`, `booking:closed`, `booking:won`, `booking:lost`, `booking:cancelled`,
`wallet:locked`, `wallet:updated`, `tip:received`.

**Everyone:** `notification`, `chat:message`, `help:message`, `account:suspended`.

**Staff:** `booking:created`, `fleet:position`, `fleet:availability`, `sos:new`, `sos:updated`,
`help:message`, `team:request`.
