# Transur — Architecture Technique

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENTS (Mobile Web)                  │
│  Passager │ Chauffeur │ Livreur │ Admin                  │
│                Next.js (PWA mobile-first)                │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS + WSS
┌────────────────────▼────────────────────────────────────┐
│                  BACKEND API                             │
│              Node.js + Express                           │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐             │
│  │  REST API │  │Socket.io │  │  Cron Jobs│             │
│  │ (JWT Auth)│  │(Realtime)│  │(Auto-block│             │
│  └──────────┘  └──────────┘  └───────────┘             │
└───────┬──────────────┬────────────────────────────────-─┘
        │              │
┌───────▼──────┐  ┌────▼──────────────────────────────┐
│  PostgreSQL  │  │      External Services             │
│  (PostGIS)   │  │  SMS: AfricasTalking               │
│  - users     │  │  Maps: OpenStreetMap/Google Maps   │
│  - trips     │  │  Mobile Money: M-Pesa, Airtel...   │
│  - deliveries│  └───────────────────────────────────┘
│  - wallets   │
└──────────────┘
```

## Stack technique

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| Frontend | Next.js 14 (App Router) | SSR, PWA, mobile-first |
| Styles | Tailwind CSS | Rapide, mobile-first |
| State | Zustand + React Context | Léger |
| Real-time | Socket.io | WebSocket + polling fallback |
| Backend | Node.js + Express | Rapide à développer |
| Base de données | PostgreSQL + PostGIS | Requêtes géospatiales |
| Auth | OTP + JWT | Pas de mot de passe (RDC mobile) |
| SMS | AfricasTalking | Couverture Afrique subsaharienne |

## Modules principaux

### 1. Authentification (OTP)
```
Client → POST /auth/send-otp → SMS via AfricasTalking
Client → POST /auth/verify-otp → JWT ou tempToken
tempToken → Inscription → JWT permanent
```

### 2. Matching Engine (temps réel)
```
Client crée course → findNearbyDrivers (Haversine)
→ Broadcast Socket.io aux N chauffeurs proches
→ Premier qui accepte → course attribuée
→ Timeout 3min → annulation auto
```

### 3. Wallet System
```
Paiement Cash:
  Course terminée → commission (15%) = dette wallet
  wallet.balance -= commission
  Si balance <= debt_limit → wallet.is_blocked = true

Paiement Mobile Money:
  Client paie → Webhook reçu → commission déduite
  Gains (85%) → crédités wallet chauffeur
```

### 4. GPS Tracking
```
Driver → Socket.io 'location_update' (toutes les 3s)
→ UPDATE driver_locations ON CONFLICT
→ Broadcast vers client si course active
Client → reçoit 'driver_location_update'
→ Affichage temps réel sur carte
```

## Optimisations pour RDC

### Faible connexion
- Compression gzip sur toutes les réponses
- Timeout 15s sur les requêtes API
- Socket.io avec fallback polling
- Images compressées (max 5MB)
- Pas de vidéo, pas de lib lourde

### Offline / Reconnexion
- Socket.io reconnection automatique (5 tentatives)
- LocalStorage pour token et profil utilisateur
- Les courses actives sont sauvegardées en base

### Consommation data
- Pagination sur toutes les listes
- GPS update toutes les 3s (pas plus)
- Pas de polling HTTP (tout via WebSocket)

## Déploiement recommandé

### Phase 1 — Pilote Lubumbashi (< 500 utilisateurs)
```
1 VPS: 4 vCPU, 8GB RAM, 50GB SSD
Ubuntu 22.04 + Docker Compose
Nginx reverse proxy + SSL (Let's Encrypt)
Coût estimé: ~$30-50/mois
```

### Phase 2 — Expansion Kinshasa
```
Load balancer + 2-3 API servers
PostgreSQL managed (PgBouncer)
Redis pour sessions Socket.io
Coût estimé: ~$150-200/mois
```

## Sécurité

- Rate limiting: 100 req/15min, 10 OTP/heure
- Helmet.js (headers sécurisés)
- JWT expirant en 7 jours
- OTP valable 10 minutes, 3 tentatives max
- Wallet debt_limit comme protection anti-fraude
- Webhook validation (à implémenter par provider)
