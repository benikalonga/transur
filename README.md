# Transur — Taxi & Livraison (RDC)

Plateforme de taxi et livraison pour la République Démocratique du Congo.  
Pilote à **Lubumbashi** → expansion Kinshasa.

---

## Démarrage rapide — LOCAL

### 1. Prérequis
- Node.js 20+
- MySQL 8.0 (déjà en place avec vos accès)
- Git

### 2. Créer la base de données

```sql
-- Connectez-vous à MySQL avec vos accès :
-- Host: localhost | Port: 3306 | User: root | Password: minitmoney@sql

mysql -u root -pminitmoney@sql < database/schema.sql
```

Ou via phpMyAdmin / DBeaver : importez `database/schema.sql`.

### 3. Backend

```bash
cd backend
npm install
# Le fichier .env est déjà configuré avec vos accès MySQL
npm run dev
# → API sur http://localhost:5000
# → Tester: http://localhost:5000/api/health
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
# → App sur http://localhost:3000
```

### 5. Test OTP en développement

En mode `NODE_ENV=development`, les codes OTP sont affichés dans les **logs du terminal backend** — pas besoin de vrai SMS.

```
📱 SMS to +243812345678: Votre code Transur : 123456
```

---

## Architecture des fichiers

```
Transur/
├── backend/
│   ├── .env                    ← Accès MySQL configurés ✅
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js     ← Pool MySQL2
│   │   │   └── migrate.js      ← Script de migration
│   │   ├── middleware/         ← Auth JWT, erreurs
│   │   ├── routes/             ← auth, trips, deliveries, wallet, admin, users
│   │   ├── services/           ← SMS, matching (Haversine), wallet
│   │   └── socket/             ← WebSocket handler
├── frontend/
│   ├── .env.local              ← URLs API configurées ✅
│   └── src/app/
│       ├── auth/               ← login, register
│       ├── client/             ← dashboard, taxi, delivery, history, profile
│       ├── driver/             ← dashboard, wallet, history, profile
│       └── delivery/           ← dashboard, wallet, history, profile
├── database/
│   ├── schema.sql              ← MySQL 8.0 complet
│   └── mysql.cnf               ← Config MySQL optimisée
├── nginx/
│   └── nginx.conf              ← Reverse proxy production
├── docker-compose.yml          ← MySQL + API + Frontend
├── deploy.sh                   ← Script déploiement production
└── .env.production             ← Template variables production
```

---

## Flux utilisateur

```
CLIENT                    SERVEUR                    CHAUFFEUR
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

## Système de paiement

### Cash (par défaut)
```
Course 5$ → Chauffeur encaisse 5$ cash
Transur enregistre: wallet.balance -= 0.75$ (15% commission)
Si wallet < -5$ → BLOQUÉ jusqu'à recharge
```

### Mobile Money
```
Client paie via M-Pesa/Airtel → argent sur compte Transur
Transur verse au chauffeur: 5$ - 15% = 4.25$
wallet.balance += 4.25$
```

---

## API — Endpoints principaux

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/send-otp` | Envoyer code OTP |
| POST | `/api/auth/verify-otp` | Vérifier code → JWT |
| POST | `/api/auth/register/client` | Inscription client |
| POST | `/api/auth/register/driver` | Inscription chauffeur |
| POST | `/api/auth/register/delivery` | Inscription livreur |
| GET  | `/api/users/me` | Profil complet |
| POST | `/api/trips/estimate` | Estimer tarif taxi |
| POST | `/api/trips` | Créer course taxi |
| POST | `/api/trips/:id/accept` | Accepter (chauffeur) |
| POST | `/api/trips/:id/complete` | Terminer course |
| POST | `/api/deliveries/estimate` | Estimer livraison |
| POST | `/api/deliveries` | Créer livraison |
| GET  | `/api/wallet` | Solde wallet |
| POST | `/api/wallet/recharge` | Recharger wallet |

Voir [docs/API.md](docs/API.md) pour la doc complète.

---

## Déploiement production (VPS)

### Prérequis serveur
- Ubuntu 22.04
- Docker + Docker Compose V2
- Domaine pointant vers le serveur

### Étapes

```bash
# 1. Cloner le projet
git clone https://github.com/votre-repo/transur.git
cd transur

# 2. Configurer les variables
cp .env.production .env.production.local
nano .env.production.local  # Remplir toutes les valeurs

# 3. Rendre le script exécutable
chmod +x deploy.sh

# 4. Premier déploiement (génère SSL, démarre tout)
./deploy.sh setup
./deploy.sh start

# 5. Commandes utiles
./deploy.sh status          # État des services
./deploy.sh logs backend    # Logs API
./deploy.sh logs mysql      # Logs MySQL
./deploy.sh backup          # Sauvegarder MySQL
./deploy.sh update          # Mettre à jour depuis git
```

### Coûts estimés

| Phase | Infrastructure | Coût/mois |
|-------|---------------|-----------|
| Pilote Lubumbashi (< 500 users) | 1 VPS 4GB RAM | ~$25-40 |
| Expansion Kinshasa (< 5000 users) | 2 VPS + Load Balancer | ~$80-120 |
| National (> 10k users) | Cluster + CDN | ~$200-400 |

---

## SMS — AfricasTalking

1. Créer un compte sur [africastalking.com](https://africastalking.com)
2. Créer une application "Transur"
3. Pour les tests: utiliser le **sandbox** (gratuit)
4. Pour la prod: créditer le compte (env. $0.015/SMS en RDC)
5. Renseigner `AFRICASTALKING_API_KEY` dans `.env`

---

## Mobile Money — Intégration

| Opérateur | API | Documentation |
|-----------|-----|---------------|
| Vodacom M-Pesa | Daraja API | developer.safaricom.com |
| Airtel Money | Airtel Money API | developers.airtel.africa |
| Orange Money | Orange API | developer.orange.com |

Le webhook `/api/wallet/webhook/:provider` reçoit les confirmations de paiement.

---

## Tarification par défaut (modifiable via admin)

| Service | Base | Par km | Minimum | Commission |
|---------|------|--------|---------|------------|
| Taxi | $2.00 | $0.50/km | $2.00 | 15% |
| Livraison | $1.50 | $0.40/km | $1.50 | 15% |

Modifier via `POST /api/admin/pricing/:id` (token admin requis).
