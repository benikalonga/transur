# Transur

**On-demand rides and parcel delivery where riders name their price.**

Transur is a full e-hailing platform: a mobile-first web app for riders, drivers and couriers, plus an
operations console for the team running the network. Riders propose a fare, nearby drivers accept it or
counter-offer, and the rider picks the offer they like. The same engine powers parcel delivery, with a
handover PIN so packages only go to the right person.

It is built to work well on low-end Android phones and patchy 2G/3G networks: it installs as a PWA,
signs people in by SMS code, keeps working through dropped connections, and supports cash alongside
mobile money.

Transur started as a taxi and delivery pilot for **Lubumbashi (DR Congo)**. This version is a full rewrite
of the first prototype, and the defaults (Congolese franc display, Lubumbashi map, `.cd` address search) are set
for that market. Every one of them is a setting, so the platform works in any city.

---

## Features

### For riders
- **Rides in four classes** — Moto, Economy, Comfort and XL, each with its own fare rule and seat count.
- **Name your price** — the app suggests a fare; riders can offer down to 80% of it or bid higher for a faster pickup.
- **Live offers** — driver counter-offers arrive in real time with photo, vehicle, plate, rating, verification badge and ETA.
- **Parcel delivery** — small/medium/large sizes, recipient details, an SMS to the recipient on delivery, and a
  4-digit **handover PIN** the courier must enter to complete the job.
- **Scheduled bookings** — book up to 7 days ahead; the request is released to the fleet 10 minutes before pickup.
- **Promo codes** — percent or flat discounts with caps, minimum fares, usage limits and expiry dates.
- **Referrals** — every rider has an invite code. New riders get a welcome discount; the referrer gets a
  reward code after the friend's first completed trip.
- **Saved places** — home, work and favourites for one-tap booking, plus "book again" from any past trip.
- **Live tracking** — vehicle on the map, route preview, in-trip chat with quick replies, and one-tap call.
- **Safety toolkit** — share a public live-tracking link, trusted contacts, and an **SOS** button that alerts the
  safety team and texts trusted contacts with your location.
- **Ratings, tips and receipts** — rate after every trip, tip in cash or mobile money, view an itemised receipt.
- **Inbox and help centre** — trip updates, receipts and offers in one place, and live chat with support.

### For drivers and couriers
- **One-tap online/offline** with background GPS streaming (throttled to save data and battery).
- **Request cards** with fare, distance to pickup, trip length, payment method, parcel details and an expiry timer.
- **Accept or counter-offer**, withdraw an offer, or dismiss a request.
- **Guided trip flow** — Arrived → Start → Complete, with turn-by-turn hand-off to Google Maps.
- **Earnings dashboard** — today / 7 days / all time, tips, distance, a 7-day chart and response rate.
- **Wallet** — commission ledger, mobile money top-ups, automatic lock when debt passes the limit.
- **Vehicle profile** with document verification by the operations team.

### For the operations team (console at `/console`)
- **Overview** — gross bookings, platform fees, promo spend, today's bookings, sign-ups, live supply.
- **Live map** — every online/busy driver and courier plus open requests, streamed in real time.
- **Bookings** — search and filter everything; see offers, chat history and the money split; cancel when needed.
- **People** — riders, drivers and couriers; verify documents, suspend or ban, adjust wallets, start a support chat.
- **Wallets & ledger** — balances owed in each direction, locks, and every ledger entry.
- **Finance** — revenue, fees and promotion cost for any period, split by service and payment method, top earners, CSV export.
- **Fares** — edit base fare, per-km, per-minute, minimum, commission and **surge** for each vehicle class.
- **Promotions** — create and pause campaign codes; see referral and gift codes and their cost.
- **Safety** — SOS alerts with location and trip context; acknowledge (the user is notified) and resolve.
- **Help desk** — real-time conversations with canned replies.
- **Team** — staff request access; owners approve, promote or remove them.

---

## How the marketplace works

```
 Rider                          API                              Nearby providers
   │  POST /bookings/quote  ───►  prices for every class
   │  POST /bookings        ───►  status = searching ──► booking:new ─────────►│
   │                              (or scheduled → released by the job runner)  │
   │◄── booking:bid ────────────  POST /bookings/:id/bids  ◄───────────────────│ accept / counter
   │  POST …/bids/:id/accept ──►  status = assigned ──────► booking:won / lost ►│
   │◄── provider:position ──────  fleet:position (socket, every ≥5 s / 25 m) ◄──│
   │◄── booking:arrived / started / completed ◄── POST …/arrive /start /complete│
```

Requests nobody accepts within 3 minutes are cancelled by a background job, and the rider is told to try a
higher offer. Because these jobs run from cron rather than in-memory timers, nothing is lost if the API restarts.

### Money

All amounts are stored in one base currency (USD by default). The web app converts for display with
`NEXT_PUBLIC_CURRENCY` and `NEXT_PUBLIC_CURRENCY_RATE`, so a market that prices in local currency only changes config.

| Payment | What happens at completion |
|---|---|
| **Cash** | The provider collects `fare − promo discount`. The platform fee is **debited** from the provider's wallet, and any promo discount is **credited** back, so promos are always funded by the platform. |
| **Mobile money** | The platform holds the payment and **credits** `fare − platform fee` to the provider's wallet. |
| **Tips** | Cash tips are recorded; mobile money tips are credited to the provider's wallet. |

A wallet locks automatically when its balance reaches `WALLET_DEBT_LIMIT` (default −5.00). A locked provider
can't send offers until they top up. Staff can also lock or unlock wallets by hand.

---

## Built for low connectivity

| Concern | What Transur does |
|---|---|
| Data cost | Gzip on every API response and at Nginx; static assets cached for a year; simplified route geometry. |
| No app store | Installable PWA that runs full-screen on low-end Android phones. |
| Sign-in without data | Phone + SMS code; no passwords to forget. |
| Dropped connections | Socket.IO falls back to long-polling and **reconnects forever** with growing back-off. On reconnect, the app refetches the current booking and the server re-sends open requests to providers. |
| Lost GPS | High-accuracy fix first, coarse fallback second; positions also go over HTTP when the socket is down, with a heartbeat so supply never looks stale. Providers silent for 15 minutes are taken offline automatically. |
| Slow requests | 20 s client timeout with friendly "you appear to be offline" messages. |
| Reloads | Session, profile and "I was online" state live on the device; active trips restore after a refresh. |
| No data at all | SMS to the parcel recipient on delivery and to trusted contacts on SOS. |

---

## Tech stack

| Layer | Technology |
|---|---|
| Web app | Next.js 14 (App Router), React 18, Tailwind CSS, Leaflet + OpenStreetMap, Socket.IO client |
| API | Node.js 20, Express 4, Socket.IO 4, node-cron |
| Database | MariaDB 10.6+ or MySQL 8 |
| Auth | SMS one-time codes (Africa's Talking) + JWT; bcrypt for staff passwords |
| Routing & search | OSRM for routes, Nominatim for address search and reverse geocoding |
| Ops | Docker Compose, Nginx (TLS, gzip, WebSockets), Let's Encrypt |

---

## Project structure

```
transur/
├── backend/
│   └── src/
│       ├── server.js            # boots HTTP + Socket.IO + job runner
│       ├── app.js               # Express app, middleware and route mounting
│       ├── config/              # env loading/validation, static catalog (classes, payments…)
│       ├── db/                  # pool helpers, schema (single source of truth), migrate
│       ├── middleware/          # user/staff auth, error responder
│       ├── services/            # bookings engine, dispatch, pricing, wallet ledger, promos, fleet, sms, notify
│       ├── realtime/            # socket handlers, event hub, help desk
│       ├── jobs/                # scheduled releases, request expiry, stale-provider cleanup
│       ├── routes/              # auth, me, bookings, wallet, engagement, console/*
│       └── scripts/createOwner.js
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── login/           # phone → code → sign-up
│       │   ├── rider/           # home, ride, send, trips, inbox, account, places, safety, promos, invite, help
│       │   ├── driver/          # dashboard, earnings, jobs, inbox, account, help
│       │   ├── courier/         # same screens as drivers, for parcels
│       │   ├── track/[token]/   # public live-trip page
│       │   └── console/         # operations console
│       ├── components/          # booking flow, fleet dashboard, maps, shared screens, console kit, UI
│       └── lib/                 # API client, sockets, session, geo, formatting
├── scripts/                     # setup.js and dev.js (run everything without Docker)
├── docs/API.md                  # endpoint and event reference
├── nginx/nginx.conf
├── docker-compose.yml
└── deploy.sh
```

---

## Running locally (no Docker needed)

**Requirements:** Node.js 20+ (22 recommended) and MariaDB 10.6+ or MySQL 8. Nothing else: no Docker,
no global packages, and no internet once packages are installed.

```bash
npm run setup -- --offline    # installs packages, creates backend/.env and frontend/.env.local
```

Leave out `--offline` on a machine with internet and GPS (see [Offline mode](#offline-mode)).

**Create the database user once** with [`backend/db-setup.sql`](backend/db-setup.sql), and put the same
password in `DB_PASSWORD` in `backend/.env`:

```bash
sudo mariadb < backend/db-setup.sql        # MariaDB (root signs in through the socket)
mysql -u root -p < backend/db-setup.sql    # MySQL
```

Then:

```bash
npm run db:migrate            # creates all tables and default fares
npm run staff:owner -- YOUR_EMAIL@example.com 'YOUR_PASSWORD' "YOUR_NAME"
npm run dev                   # API http://localhost:5000/api  ·  web app http://localhost:3000
```

- Riders, drivers and couriers sign up at `/login` (pick a role on the last step).
- Staff sign in at `/console/login` with the owner account created above.
- Open two browsers (or a private window) to play rider and driver at the same time.

In development, login codes are printed in the API output, and mobile money payments settle instantly, so every
flow works without SMS or payment accounts. Set `DEV_LOGIN_CODE=123456` in `backend/.env` to use one fixed code
(never used in production).

### Smoke test

With the API running and `DEV_LOGIN_CODE` set:

```bash
npm run smoke
```

It plays a full ride (sign-up, quote, booking, offer, accept, trip, rating, receipt) and checks that a booking
can't be accepted twice and that the platform fee reaches the driver's wallet. Set `SMOKE_STAFF_EMAIL` and
`SMOKE_STAFF_PASSWORD` to also check the console.

### Offline mode

`NEXT_PUBLIC_OFFLINE_MODE=1` in `frontend/.env.local` (set by `npm run setup -- --offline`) makes the web app
work on a machine with no internet and no GPS:

| Online service | Offline replacement |
|---|---|
| OpenStreetMap map tiles | A plain grid background; markers and routes still show |
| OSRM road routes | Straight lines with an estimated time |
| Nominatim address search | A built-in list of places ([`offlinePlaces.js`](frontend/src/lib/offlinePlaces.js)), or type coordinates like `-11.66, 27.48` |
| Device GPS | A demo location near `NEXT_PUBLIC_MAP_CENTER` |
| SMS (Africa's Talking) | Codes printed in the API output (any development setup) |

Fares are always computed on the server from straight-line distance, so prices are the same in both modes.
The font is bundled with the app, so `next build` also works with no internet.

### Configuration

| Variable (API) | Default | Meaning |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | Allowed CORS origin and base for share links |
| `DISPATCH_RADIUS_KM` | `15` | How far requests are broadcast |
| `REQUEST_TTL_MINUTES` | `3` | How long a request stays open for offers |
| `SCHEDULE_LEAD_MINUTES` | `10` | When scheduled bookings are released |
| `WALLET_DEBT_LIMIT` | `-5.00` | Balance at which a fleet wallet locks |
| `REFERRAL_WELCOME_DISCOUNT` / `REFERRAL_REWARD_DISCOUNT` | `1.00` / `1.50` | Referral code values |
| `PAYMENT_WEBHOOK_SECRET` | — | Shared secret for mobile money callbacks |
| `DB_SOCKET` | — | Connect through a Unix socket instead of `DB_HOST`/`DB_PORT` |
| `DEV_LOGIN_CODE` | — | Fixed 6-digit login code in development (tests) |

| Variable (web) | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_CURRENCY` / `NEXT_PUBLIC_CURRENCY_RATE` | `USD` / `1` | Display currency and conversion from the base currency |
| `NEXT_PUBLIC_PRICE_STEP` | `0.25` | Smallest offer increment (display currency) |
| `NEXT_PUBLIC_MAP_CENTER` | `0,0` | Where maps open before GPS is available |
| `NEXT_PUBLIC_SEARCH_COUNTRY` | — | Restrict address search to a country code |
| `NEXT_PUBLIC_OFFLINE_MODE` | `0` | `1` = no map tiles, online search, routing or GPS needed |

---

## Deploying

Docker is only used for production servers. Local development never needs it.

```bash
cp .env.example .env               # fill in every secret and your domain
./deploy.sh certs                  # Let's Encrypt certificate for $DOMAIN
./deploy.sh up                     # MySQL + API + web + Nginx
./deploy.sh owner YOUR_EMAIL@example.com 'YOUR_PASSWORD' "YOUR_NAME"
./deploy.sh status                 # health check
./deploy.sh backup                 # gzipped mysqldump into ./backups
./deploy.sh update                 # pull and rebuild
```

The API container runs migrations on start, so schema changes ship with the code.

### Mobile money

Top-ups and in-app tips create a *payment intent* with a unique reference. Point your operator's callback at
`POST /api/wallet/webhooks/<provider>` with the header `X-Webhook-Secret: $PAYMENT_WEBHOOK_SECRET` and a body of
`{ "reference", "amount", "status": "SUCCESS" }`. Settlement is idempotent and rejects amount mismatches.

---

## Roadmap

- Native push notifications (the `push_token` field is already stored).
- Offline app shell with a service worker and queued actions.
- Automated tests for the bidding, dispatch and wallet code.
- Offline map tiles for each service area, and a data-saver mode for 2G.
- French and Lingala/Swahili translations of the app.
- Multi-stop rides and round trips.
- Corporate accounts with monthly invoicing.
- Automated payouts of positive fleet balances.
- USSD booking for feature phones.

---

## License

MIT — see [LICENSE](LICENSE).
