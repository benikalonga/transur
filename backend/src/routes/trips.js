const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../config/database');
const { authenticate, requireRole, requireActiveWallet } = require('../middleware/auth');
const { findNearbyDrivers, estimateFare, haversineDistance, estimateETA, getMinPrice } = require('../services/matchingService');
const { debitCommission, creditEarnings } = require('../services/walletService');

// ─── POST /api/trips/estimate ─────────────────────────────────────────────────
router.post('/estimate', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    const { pickup_lat, pickup_lng, dropoff_lat, dropoff_lng } = req.body;
    const distanceKm = haversineDistance(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);
    const pricing    = await estimateFare(distanceKm, 'taxi');
    const minPrice   = await getMinPrice('taxi');
    const nearby     = await findNearbyDrivers(pickup_lat, pickup_lng, 'taxi');
    res.json({
      distance_km:        Math.round(distanceKm * 10) / 10,
      estimated_fare:     pricing.fare,
      min_price:          minPrice,
      estimated_duration: estimateETA(distanceKm),
      drivers_available:  nearby.length,
    });
  } catch (err) { next(err); }
});

// ─── POST /api/trips ──────────────────────────────────────────────────────────
router.post('/', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    const {
      pickup_address, pickup_lat, pickup_lng,
      dropoff_address, dropoff_lat, dropoff_lng,
      payment_method = 'cash',
      offered_price,          // client's negotiated price (USD) — optional
    } = req.body;

    const distanceKm    = haversineDistance(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);
    const pricing       = await estimateFare(distanceKm, 'taxi');
    const minPrice      = await getMinPrice('taxi');
    const eta           = estimateETA(distanceKm);

    // Validate offered price if provided
    const clientPrice = offered_price != null ? parseFloat(offered_price) : null;
    if (clientPrice !== null && clientPrice < minPrice) {
      return res.status(400).json({
        error: `Prix minimum non atteint`,
        min_price: minPrice,
        offered: clientPrice,
      });
    }

    const id = uuidv4();
    await query(
      `INSERT INTO trips
         (id, client_id, pickup_address, pickup_lat, pickup_lng,
          dropoff_address, dropoff_lat, dropoff_lng,
          estimated_distance, estimated_duration, estimated_fare,
          client_offered_price, recommended_price, min_price,
          commission_amount, driver_earnings, payment_method, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'broadcast')`,
      [
        id, req.user.id,
        pickup_address, pickup_lat, pickup_lng,
        dropoff_address, dropoff_lat, dropoff_lng,
        distanceKm, eta, pricing.fare,
        clientPrice ?? pricing.fare,    // client_offered_price
        pricing.fare,                   // recommended_price
        minPrice,                       // min_price
        pricing.commission, pricing.earnings, payment_method,
      ]
    );

    const { rows } = await query('SELECT * FROM trips WHERE id = ?', [id]);
    const trip = rows[0];

    // Broadcast to nearby drivers
    const io     = req.app.get('io');
    const nearby = await findNearbyDrivers(pickup_lat, pickup_lng, 'taxi');

    nearby.forEach((driver) => {
      io.to(`user:${driver.id}`).emit('new_trip_request', {
        tripId:           id,
        clientId:         req.user.id,
        pickup:           { address: pickup_address,  lat: pickup_lat,  lng: pickup_lng  },
        dropoff:          { address: dropoff_address, lat: dropoff_lat, lng: dropoff_lng },
        clientPrice:      clientPrice ?? pricing.fare,
        recommendedPrice: pricing.fare,
        minPrice,
        estimatedFare:    pricing.fare,           // kept for backwards compat
        distanceKm:       Math.round(distanceKm * 10) / 10,
        paymentMethod:    payment_method,
        driverDistance:   driver.distance_km,
      });
      query('INSERT INTO broadcast_logs (id, request_id, request_type, driver_id) VALUES (?,?,?,?)',
        [uuidv4(), id, 'trip', driver.id]).catch(() => {});
    });

    // Auto-cancel after 3 min if no driver accepts
    setTimeout(async () => {
      const { rows: cur } = await query("SELECT status FROM trips WHERE id=?", [id]);
      if (cur[0]?.status === 'broadcast') {
        await query(
          "UPDATE trips SET status='cancelled', cancel_reason='Aucun chauffeur disponible', cancelled_at=NOW() WHERE id=?",
          [id]
        );
        // Expire all pending offers
        await query("UPDATE trip_offers SET status='expired' WHERE trip_id=?", [id]);
        io.to(`user:${req.user.id}`).emit('trip_cancelled', {
          tripId: id, reason: 'Aucun chauffeur disponible dans votre zone.',
        });
      }
    }, 3 * 60 * 1000);

    res.status(201).json({ trip, drivers_notified: nearby.length });
  } catch (err) { next(err); }
});

// ─── POST /api/trips/:id/offer  (driver submits a price offer) ────────────────
router.post('/:id/offer', authenticate, requireRole('driver'), requireActiveWallet, async (req, res, next) => {
  try {
    const { offered_price } = req.body;
    if (offered_price == null || isNaN(parseFloat(offered_price))) {
      return res.status(400).json({ error: 'Prix invalide' });
    }
    const price = Math.round(parseFloat(offered_price) * 100) / 100;

    // Load trip
    const { rows: tripRows } = await query(
      "SELECT * FROM trips WHERE id=? AND status='broadcast'",
      [req.params.id]
    );
    if (!tripRows[0]) {
      return res.status(409).json({ error: 'Course non disponible ou déjà acceptée' });
    }
    const trip = tripRows[0];

    // Enforce minimum price
    if (price < parseFloat(trip.min_price || 0)) {
      return res.status(400).json({
        error: 'Offre inférieure au tarif minimum',
        min_price: trip.min_price,
      });
    }

    // Upsert offer (driver can revise before client accepts)
    const offerId = uuidv4();
    await query(
      `INSERT INTO trip_offers (id, trip_id, driver_id, offered_price, status)
       VALUES (?, ?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE offered_price=VALUES(offered_price), status='pending', id=id`,
      [offerId, req.params.id, req.user.id, price]
    );

    // Get actual offer id (may be the existing one if upserted)
    const { rows: offerRows } = await query(
      'SELECT * FROM trip_offers WHERE trip_id=? AND driver_id=?',
      [req.params.id, req.user.id]
    );
    const offer = offerRows[0];

    // Fetch driver info to send to client
    const { rows: dInfo } = await query(
      `SELECT u.name, u.photo_url,
              dp.vehicle_type, dp.vehicle_plate, dp.vehicle_color, dp.vehicle_brand, dp.rating
       FROM users u JOIN driver_profiles dp ON u.id=dp.user_id WHERE u.id=?`,
      [req.user.id]
    );

    // Notify client in real time
    req.app.get('io').to(`user:${trip.client_id}`).emit('driver_offer', {
      offerId:          offer.id,
      tripId:           req.params.id,
      offeredPrice:     price,
      recommendedPrice: parseFloat(trip.recommended_price),
      driver: {
        id:            req.user.id,
        name:          dInfo[0]?.name,
        photo_url:     dInfo[0]?.photo_url,
        vehicle_type:  dInfo[0]?.vehicle_type,
        vehicle_plate: dInfo[0]?.vehicle_plate,
        vehicle_color: dInfo[0]?.vehicle_color,
        vehicle_brand: dInfo[0]?.vehicle_brand,
        rating:        dInfo[0]?.rating ?? 5.0,
      },
    });

    res.json({ message: 'Offre envoyée', offerId: offer.id });
  } catch (err) { next(err); }
});

// ─── GET /api/trips/:id/offers  (client polls current offers) ─────────────────
router.get('/:id/offers', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    const { rows: tripRows } = await query(
      'SELECT * FROM trips WHERE id=? AND client_id=?',
      [req.params.id, req.user.id]
    );
    if (!tripRows[0]) return res.status(404).json({ error: 'Course introuvable' });

    const { rows } = await query(
      `SELECT o.*, u.name AS driver_name, u.photo_url,
              dp.vehicle_type, dp.vehicle_plate, dp.vehicle_color, dp.rating
       FROM trip_offers o
       JOIN users u ON o.driver_id=u.id
       JOIN driver_profiles dp ON u.id=dp.user_id
       WHERE o.trip_id=? AND o.status='pending'
       ORDER BY o.offered_price ASC`,
      [req.params.id]
    );

    res.json({
      offers:           rows,
      recommended_price: parseFloat(tripRows[0].recommended_price),
      min_price:         parseFloat(tripRows[0].min_price),
    });
  } catch (err) { next(err); }
});

// ─── POST /api/trips/:id/offers/:offerId/accept  (client picks a driver) ──────
router.post('/:id/offers/:offerId/accept', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    const trip = await transaction(async (client) => {
      // Lock the trip
      const { rows: tripRows } = await client.query(
        "SELECT * FROM trips WHERE id=? AND client_id=? AND status='broadcast' FOR UPDATE",
        [req.params.id, req.user.id]
      );
      if (!tripRows[0]) throw Object.assign(new Error('Course non disponible'), { status: 409 });

      // Lock the chosen offer
      const { rows: offerRows } = await client.query(
        "SELECT * FROM trip_offers WHERE id=? AND trip_id=? AND status='pending' FOR UPDATE",
        [req.params.offerId, req.params.id]
      );
      if (!offerRows[0]) throw Object.assign(new Error('Offre non disponible'), { status: 409 });

      const offer = offerRows[0];

      // Accept this offer, decline all others
      await client.query(
        "UPDATE trip_offers SET status='accepted' WHERE id=?",
        [offer.id]
      );
      await client.query(
        "UPDATE trip_offers SET status='declined' WHERE trip_id=? AND id!=?",
        [req.params.id, offer.id]
      );

      // Update trip
      await client.query(
        `UPDATE trips SET
           driver_id=?, status='accepted', accepted_at=NOW(),
           final_agreed_price=?
         WHERE id=?`,
        [offer.driver_id, offer.offered_price, req.params.id]
      );
      await client.query(
        "UPDATE driver_profiles SET status='busy' WHERE user_id=?",
        [offer.driver_id]
      );

      const { rows: updated } = await client.query('SELECT * FROM trips WHERE id=?', [req.params.id]);
      return { trip: updated[0], offer };
    });

    const { rows: dInfo } = await query(
      `SELECT u.name, u.photo_url,
              dp.vehicle_type, dp.vehicle_plate, dp.vehicle_color, dp.vehicle_brand, dp.rating
       FROM users u JOIN driver_profiles dp ON u.id=dp.user_id WHERE u.id=?`,
      [trip.offer.driver_id]
    );

    const io = req.app.get('io');

    // Notify winning driver
    io.to(`user:${trip.offer.driver_id}`).emit('offer_accepted', {
      tripId:     req.params.id,
      finalPrice: parseFloat(trip.offer.offered_price),
      clientId:   req.user.id,
      pickup:  {
        address: trip.trip.pickup_address,
        lat:     parseFloat(trip.trip.pickup_lat),
        lng:     parseFloat(trip.trip.pickup_lng),
      },
      dropoff: {
        address: trip.trip.dropoff_address,
        lat:     parseFloat(trip.trip.dropoff_lat),
        lng:     parseFloat(trip.trip.dropoff_lng),
      },
      paymentMethod: trip.trip.payment_method,
      distanceKm:    parseFloat(trip.trip.estimated_distance),
    });

    // Notify declined drivers
    const { rows: declined } = await query(
      "SELECT driver_id FROM trip_offers WHERE trip_id=? AND status='declined'",
      [req.params.id]
    );
    declined.forEach(({ driver_id }) => {
      io.to(`user:${driver_id}`).emit('offer_declined', {
        tripId: req.params.id,
        reason: 'Le client a choisi un autre chauffeur',
      });
    });

    // Tell client the trip is now accepted (with driver info)
    io.to(`user:${req.user.id}`).emit('trip_accepted', {
      tripId: req.params.id,
      driver: { ...dInfo[0], id: trip.offer.driver_id },
    });

    // Broadcast trip is taken
    io.emit('trip_taken', { tripId: req.params.id });

    res.json({ message: 'Offre acceptée', trip: trip.trip });
  } catch (err) { next(err); }
});

// ─── POST /api/trips/:id/pickup ───────────────────────────────────────────────
router.post('/:id/pickup', authenticate, requireRole('driver'), async (req, res, next) => {
  try {
    await query(
      "UPDATE trips SET status='pickup', pickup_at=NOW() WHERE id=? AND driver_id=? AND status='accepted'",
      [req.params.id, req.user.id]
    );
    const { rows } = await query('SELECT * FROM trips WHERE id=?', [req.params.id]);
    if (!rows[0] || rows[0].status !== 'pickup') return res.status(404).json({ error: 'Course introuvable' });
    req.app.get('io').to(`user:${rows[0].client_id}`).emit('driver_arrived', { tripId: rows[0].id });
    res.json({ message: 'Arrivée confirmée' });
  } catch (err) { next(err); }
});

// ─── POST /api/trips/:id/start ────────────────────────────────────────────────
router.post('/:id/start', authenticate, requireRole('driver'), async (req, res, next) => {
  try {
    await query(
      "UPDATE trips SET status='ongoing', started_at=NOW() WHERE id=? AND driver_id=? AND status='pickup'",
      [req.params.id, req.user.id]
    );
    const { rows } = await query('SELECT * FROM trips WHERE id=?', [req.params.id]);
    if (!rows[0] || rows[0].status !== 'ongoing') return res.status(404).json({ error: 'Course introuvable' });
    req.app.get('io').to(`user:${rows[0].client_id}`).emit('trip_started', { tripId: rows[0].id });
    res.json({ message: 'Course démarrée' });
  } catch (err) { next(err); }
});

// ─── POST /api/trips/:id/complete ─────────────────────────────────────────────
router.post('/:id/complete', authenticate, requireRole('driver'), async (req, res, next) => {
  try {
    const { actual_distance } = req.body;
    const { rows: tr } = await query(
      "SELECT * FROM trips WHERE id=? AND driver_id=? AND status='ongoing'",
      [req.params.id, req.user.id]
    );
    if (!tr[0]) return res.status(404).json({ error: 'Course introuvable' });

    const trip    = tr[0];
    const distKm  = parseFloat(actual_distance) || parseFloat(trip.estimated_distance);
    const duration = Math.ceil((Date.now() - new Date(trip.started_at).getTime()) / 60000);

    // Use negotiated final price if set, else recalculate from distance
    let finalFare, commission, earnings;
    if (trip.final_agreed_price && parseFloat(trip.final_agreed_price) > 0) {
      const pricing = await estimateFare(distKm, 'taxi');
      finalFare  = parseFloat(trip.final_agreed_price);
      commission = Math.round(finalFare * pricing.commission_rate) / 100;
      earnings   = Math.round((finalFare - commission) * 100) / 100;
    } else {
      const pricing = await estimateFare(distKm, 'taxi');
      finalFare  = pricing.fare;
      commission = pricing.commission;
      earnings   = pricing.earnings;
    }

    await query(
      `UPDATE trips SET
         status='completed', completed_at=NOW(),
         actual_distance=?, actual_duration=?,
         final_fare=?, commission_amount=?, driver_earnings=?,
         payment_status=CASE WHEN payment_method='cash' THEN 'completed' ELSE payment_status END
       WHERE id=?`,
      [distKm, duration, finalFare, commission, earnings, trip.id]
    );
    await query(
      "UPDATE driver_profiles SET status='online', total_trips=total_trips+1 WHERE user_id=?",
      [req.user.id]
    );

    if (trip.payment_method === 'cash') {
      await debitCommission(req.user.id, commission, trip.id, 'trip',
        `Commission course #${trip.id.slice(0, 8)}`);
    } else {
      await creditEarnings(req.user.id, earnings, trip.id, 'trip',
        `Gains course #${trip.id.slice(0, 8)}`);
    }

    req.app.get('io').to(`user:${trip.client_id}`).emit('trip_completed', {
      tripId: trip.id, fare: finalFare, paymentMethod: trip.payment_method,
    });

    res.json({ message: 'Course terminée', fare: finalFare });
  } catch (err) { next(err); }
});

// ─── POST /api/trips/:id/cancel ───────────────────────────────────────────────
router.post('/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const { rows } = await query(
      "SELECT * FROM trips WHERE id=? AND status NOT IN ('completed','cancelled')",
      [req.params.id]
    );
    if (!rows[0] || (rows[0].client_id !== req.user.id && rows[0].driver_id !== req.user.id))
      return res.status(404).json({ error: 'Course introuvable' });

    await query(
      "UPDATE trips SET status='cancelled', cancelled_at=NOW(), cancel_reason=? WHERE id=?",
      [reason || 'Annulé', req.params.id]
    );
    // Expire all pending offers and notify drivers
    const { rows: offers } = await query(
      "SELECT driver_id FROM trip_offers WHERE trip_id=? AND status='pending'",
      [req.params.id]
    );
    await query("UPDATE trip_offers SET status='expired' WHERE trip_id=?", [req.params.id]);

    const io = req.app.get('io');
    offers.forEach(({ driver_id }) => {
      io.to(`user:${driver_id}`).emit('trip_cancelled', {
        tripId: req.params.id, reason: 'Course annulée par le client',
      });
    });

    if (rows[0].driver_id) {
      await query("UPDATE driver_profiles SET status='online' WHERE user_id=?", [rows[0].driver_id]);
    }
    const notifyId = req.user.id === rows[0].client_id ? rows[0].driver_id : rows[0].client_id;
    if (notifyId) io.to(`user:${notifyId}`).emit('trip_cancelled', { tripId: req.params.id, reason });
    res.json({ message: 'Course annulée' });
  } catch (err) { next(err); }
});

// ─── POST /api/trips/:id/rate ─────────────────────────────────────────────────
router.post('/:id/rate', authenticate, async (req, res, next) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Note entre 1 et 5' });
    const col        = req.user.role === 'client' ? 'client_rating' : 'driver_rating';
    const commentCol = req.user.role === 'client' ? ', client_comment=?' : '';
    const params     = req.user.role === 'client'
      ? [rating, comment || null, req.params.id]
      : [rating, req.params.id];
    await query(`UPDATE trips SET ${col}=? ${commentCol} WHERE id=?`, params);
    res.json({ message: 'Merci pour votre avis !' });
  } catch (err) { next(err); }
});

// ─── GET /api/trips/history ───────────────────────────────────────────────────
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const col    = req.user.role === 'driver' ? 'driver_id' : 'client_id';
    const { rows } = await query(
      `SELECT t.*,
         c.name AS client_name, c.phone AS client_phone,
         d.name AS driver_name, d.phone AS driver_phone, d.photo_url AS driver_photo
       FROM trips t
       LEFT JOIN users c ON t.client_id = c.id
       LEFT JOIN users d ON t.driver_id = d.id
       WHERE t.${col} = ?
       ORDER BY t.requested_at DESC
       LIMIT ${parseInt(limit)} OFFSET ${offset}`,
      [req.user.id]
    );
    res.json({ trips: rows, page: parseInt(page) });
  } catch (err) { next(err); }
});

// ─── GET /api/trips/:id ───────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT t.*,
         c.name AS client_name, c.phone AS client_phone,
         d.name AS driver_name, d.phone AS driver_phone, d.photo_url AS driver_photo,
         dp.vehicle_type, dp.vehicle_plate, dp.vehicle_color, dp.rating AS driver_rating
       FROM trips t
       LEFT JOIN users c  ON t.client_id = c.id
       LEFT JOIN users d  ON t.driver_id = d.id
       LEFT JOIN driver_profiles dp ON t.driver_id = dp.user_id
       WHERE t.id = ?`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Course introuvable' });
    res.json({ trip: rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
