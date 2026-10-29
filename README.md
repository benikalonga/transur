# Transur — Taxi & Delivery (DRC)

Taxi and delivery platform for the Democratic Republic of the Congo.  
Pilot in **Lubumbashi** → expansion to Kinshasa.

---

## Overview

Transur connects clients with taxi drivers and couriers in real time.

- **Clients** sign in with their phone number (SMS OTP), get a fare estimate, and book taxi rides or deliveries.
- **Drivers and couriers** receive nearby requests live, accept them, and update the job status (arrived → started → completed). Each has a wallet and job history.
- **Matching** finds the closest available drivers by GPS distance (Haversine), with live updates over WebSockets.
- **Payments** support cash and Mobile Money (M-Pesa, Airtel Money, Orange Money). Transur takes a 15% commission through the driver's wallet.
- **Admins** manage users and pricing.

**Tech stack:** Node.js API · MySQL 8 · JWT auth · WebSockets · AfricasTalking SMS · JavaScript web frontend · Docker Compose · Nginx (SSL)

---

## Quick Start — LOCAL

### 1. Prerequisites
- Node.js 20+
- MySQL 8.0 (already set up with your credentials)
- Git

### 2. Create the database

```sql
-- Connect to MySQL with your credentials:
-- Host: localhost | Port: 3306 | User: root | Password: motdepass

mysql -u root -pmotdepass < database/schema.sql
```

Or via phpMyAdmin / DBeaver: import `database/schema.sql`.

### 3. Backend

```bash
cd backend
npm install
# The .env file is already configured with your MySQL credentials
npm run dev
# → API at http://localhost:5000
# → Test: http://localhost:5000/api/health
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
# → App at http://localhost:3000
```

### 5. Testing OTP in development

In `NODE_ENV=development` mode, OTP codes are printed in the **backend terminal logs** — no real SMS needed.

```
📱 SMS to +243812345678: Votre code Transur : 123456
```

---

## File Structure

```
Transur/
├── backend/
│   ├── .env                    ← MySQL credentials configured ✅
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js     ← MySQL2 pool
│   │   │   └── migrate.js      ← Migration script
│   │   ├── middleware/         ← JWT auth, errors
│   │   ├── routes/             ← auth, trips, deliveries, wallet, admin, users
│   │   ├── services/           ← SMS, matching (Haversine), wallet
│   │   └── socket/             ← WebSocket handler
├── frontend/
│   ├── .env.local              ← API URLs configured ✅
│   └── src/app/
│       ├── auth/               ← login, register
│       ├── client/             ← dashboard, taxi, delivery, history, profile
│       ├── driver/             ← dashboard, wallet, history, profile
│       └── delivery/           ← dashboard, wallet, history, profile
├── database/
│   ├── schema.sql              ← Complete MySQL 8.0 schema
│   └── mysql.cnf               ← Optimized MySQL config
├── nginx/
│   └── nginx.conf              ← Production reverse proxy
├── docker-compose.yml          ← MySQL + API + Frontend
├── deploy.sh                   ← Production deployment script
└── .env.production             ← Production environment template
```

---

## User Flow

```
CLIENT                    SERVER                     DRIVER
  │                          │                           │
  │─── POST /auth/send-otp ──►│                           │
  │◄── { message: "OTP..." } ─│                           │
  │─── POST /auth/verify-otp ─►│                           │
  │◄── { token, user } ───────│                           │
  │                          │                           │
  │─── POST /trips ───────────►│                           │
  │  (pickup, dropoff, pmt)   │──emit: new_trip_request ──►│
  │                          │                           │
  │                          │◄─── POST /trips/:id/accept─│
  │◄── emit: trip_accepted ──│                           │
  │    (driver info)         │                           │
  │                          │                           │
  │◄── emit: driver_arrived ─│◄── POST /trips/:id/pickup ─│
  │◄── emit: trip_started ───│◄── POST /trips/:id/start ──│
  │◄── emit: trip_completed ─│◄── POST /trips/:id/complete│
  │                          │                           │
  │                          │  [Wallet: -commission] ───►│
```

---

## Payment System

### Cash (default)
```
$5 ride → Driver collects $5 in cash
Transur records: wallet.balance -= $0.75 (15% commission)
If wallet < -$5 → BLOCKED until top-up
```

### Mobile Money
```
Client pays via M-Pesa/Airtel → money goes to the Transur account
Transur pays the driver: $5 - 15% = $4.25
wallet.balance += $4.25
```

---

## API — Main Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/send-otp` | Send OTP code |
| POST | `/api/auth/verify-otp` | Verify code → JWT |
| POST | `/api/auth/register/client` | Client registration |
| POST | `/api/auth/register/driver` | Driver registration |
| POST | `/api/auth/register/delivery` | Courier registration |
| GET  | `/api/users/me` | Full profile |
| POST | `/api/trips/estimate` | Estimate taxi fare |
| POST | `/api/trips` | Create taxi ride |
| POST | `/api/trips/:id/accept` | Accept (driver) |
| POST | `/api/trips/:id/complete` | Complete ride |
| POST | `/api/deliveries/estimate` | Estimate delivery |
| POST | `/api/deliveries` | Create delivery |
| GET  | `/api/wallet` | Wallet balance |
| POST | `/api/wallet/recharge` | Top up wallet |

See [docs/API.md](docs/API.md) for the full documentation.

---

## Production Deployment (VPS)

### Server prerequisites
- Ubuntu 22.04
- Docker + Docker Compose V2
- A domain pointing to the server

### Steps

```bash
# 1. Clone the project
git clone https://github.com/your-repo/transur.git
cd transur

# 2. Configure the variables
cp .env.production .env.production.local
nano .env.production.local  # Fill in all values

# 3. Make the script executable
chmod +x deploy.sh

# 4. First deployment (generates SSL, starts everything)
./deploy.sh setup
./deploy.sh start

# 5. Useful commands
./deploy.sh status          # Service status
./deploy.sh logs backend    # API logs
./deploy.sh logs mysql      # MySQL logs
./deploy.sh backup          # Back up MySQL
./deploy.sh update          # Update from git
```

### Estimated costs

| Phase | Infrastructure | Cost/month |
|-------|---------------|-----------|
| Lubumbashi pilot (< 500 users) | 1 VPS 4GB RAM | ~$25-40 |
| Kinshasa expansion (< 5000 users) | 2 VPS + Load Balancer | ~$80-120 |
| National (> 10k users) | Cluster + CDN | ~$200-400 |

---

## SMS — AfricasTalking

1. Create an account at [africastalking.com](https://africastalking.com)
2. Create a "Transur" application
3. For testing: use the **sandbox** (free)
4. For production: add credit to the account (approx. $0.015/SMS in the DRC)
5. Set `AFRICASTALKING_API_KEY` in `.env`

---

## Mobile Money — Integration

| Provider | API | Documentation |
|----------|-----|---------------|
| Vodacom M-Pesa | Daraja API | developer.safaricom.com |
| Airtel Money | Airtel Money API | developers.airtel.africa |
| Orange Money | Orange API | developer.orange.com |

The `/api/wallet/webhook/:provider` webhook receives payment confirmations.

---

## Default Pricing (editable via admin)

| Service | Base | Per km | Minimum | Commission |
|---------|------|--------|---------|------------|
| Taxi | $2.00 | $0.50/km | $2.00 | 15% |
| Delivery | $1.50 | $0.40/km | $1.50 | 15% |

Update via `POST /api/admin/pricing/:id` (admin token required).
