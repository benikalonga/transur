# Transur API Documentation

Base URL: `http://localhost:5000/api`

## Authentication

All protected routes require: `Authorization: Bearer <JWT_TOKEN>`

---

## Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/send-otp` | Envoyer code OTP par SMS |
| POST | `/auth/verify-otp` | Vérifier OTP → retourne token ou tempToken |
| POST | `/auth/register/client` | Inscription client |
| POST | `/auth/register/driver` | Inscription chauffeur (multipart) |
| POST | `/auth/register/delivery` | Inscription livreur (multipart) |

### Send OTP
```json
POST /auth/send-otp
{ "phone": "+243812345678", "purpose": "login" }
```

### Verify OTP
```json
POST /auth/verify-otp
{ "phone": "+243812345678", "code": "123456" }
// Returns: { token, user } OR { tempToken, isNewUser: true }
```

---

## Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/me` | Profil complet de l'utilisateur |
| PATCH | `/users/me` | Modifier nom / fcm_token |
| PATCH | `/users/driver/status` | Passer en ligne/hors ligne |
| POST | `/users/location` | Mettre à jour la position GPS |

---

## Trips (Taxi)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/trips/estimate` | Estimer tarif et durée |
| POST | `/trips` | Créer une demande de course |
| POST | `/trips/:id/accept` | Accepter une course (driver) |
| POST | `/trips/:id/pickup` | Confirmer arrivée (driver) |
| POST | `/trips/:id/start` | Démarrer la course (driver) |
| POST | `/trips/:id/complete` | Terminer la course (driver) |
| POST | `/trips/:id/cancel` | Annuler (client ou driver) |
| POST | `/trips/:id/rate` | Noter la course |
| GET | `/trips/history` | Historique des courses |

### Create Trip
```json
POST /trips
{
  "pickup_address": "Avenue Lumumba, Lubumbashi",
  "pickup_lat": -11.6609,
  "pickup_lng": 27.4794,
  "dropoff_address": "Marché central",
  "dropoff_lat": -11.6700,
  "dropoff_lng": 27.4900,
  "payment_method": "cash"  // cash | mpesa | airtel_money | orange_money
}
```

---

## Deliveries

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/deliveries/estimate` | Estimer tarif livraison |
| POST | `/deliveries` | Créer demande de livraison |
| POST | `/deliveries/:id/accept` | Accepter (delivery agent) |
| POST | `/deliveries/:id/pickup` | Colis récupéré |
| POST | `/deliveries/:id/complete` | Livraison effectuée |
| POST | `/deliveries/:id/cancel` | Annuler |
| GET | `/deliveries/history` | Historique livraisons |

---

## Wallet

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/wallet` | Solde et infos wallet |
| GET | `/wallet/transactions` | Historique transactions |
| POST | `/wallet/recharge` | Recharger via Mobile Money |
| POST | `/wallet/webhook/:provider` | Webhook confirmation paiement |

### Recharge
```json
POST /wallet/recharge
{
  "amount": 5.00,
  "provider": "mpesa",
  "phone": "+243812345678",
  "transaction_ref": "MPE123456"
}
```

---

## WebSocket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `location_update` | `{latitude, longitude, heading, speed}` | Mise à jour GPS |
| `set_status` | `{status: 'online'/'offline'}` | Changer statut |
| `track_driver` | `{driverId}` | Suivre un chauffeur |
| `message` | `{to, text, tripId}` | Message (futur) |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `new_trip_request` | Trip details | Nouvelle course broadcast |
| `trip_accepted` | `{tripId, driver}` | Course acceptée |
| `driver_arrived` | `{tripId}` | Chauffeur arrivé |
| `trip_started` | `{tripId}` | Course démarrée |
| `trip_completed` | `{tripId, fare}` | Course terminée |
| `trip_cancelled` | `{tripId, reason}` | Course annulée |
| `driver_location_update` | `{driverId, lat, lng}` | Position GPS temps réel |
| `new_delivery_request` | Delivery details | Nouvelle livraison |
| `delivery_accepted` | `{deliveryId, agent}` | Livraison acceptée |
| `delivery_completed` | `{deliveryId, fare}` | Livraison terminée |

---

## Payment Flow

### Cash payment
1. Client commande → `payment_method: "cash"`
2. Course terminée → commission auto-débitée du wallet driver
3. Si wallet < debt_limit (-5$) → compte bloqué
4. Driver recharge via `/wallet/recharge`

### Mobile Money payment
1. Client commande → `payment_method: "mpesa"` (ou autre)
2. Client paie via son app Mobile Money vers numéro Transur
3. Webhook `/wallet/webhook/mpesa` confirme le paiement
4. Gains crédités au wallet du driver (après déduction commission)

---

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Données invalides |
| 401 | Token manquant ou invalide |
| 403 | Accès refusé / wallet bloqué |
| 409 | Conflit (course déjà prise) |
| 500 | Erreur serveur |

### Wallet blocked
```json
{ "error": "Wallet bloqué. Rechargez votre compte.", "code": "WALLET_BLOCKED" }
```
