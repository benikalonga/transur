const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../config/database');
const { authenticate, requireRole, requireActiveWallet } = require('../middleware/auth');
const { findNearbyDrivers, estimateFare, haversineDistance, estimateETA, getMinPrice } = require('../services/matchingService');
const { debitCommission, creditEarnings } = require('../services/walletService');

// ─── POST /api/deliveries/estimate ───────────────────────────────────────────
router.post('/estimate', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    const { pickup_lat, pickup_lng, dropoff_lat, dropoff_lng } = req.body;
    const distanceKm = haversineDistance(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);
    const pricing    = await estimateFare(distanceKm, 'delivery');
    const minPrice   = await getMinPrice('delivery');
    const nearby     = await findNearbyDrivers(pickup_lat, pickup_lng, 'delivery');
    res.json({
      distance_km:        Math.round(distanceKm * 10) / 10,
      estimated_fare:     pricing.fare,
      min_price:          minPrice,
      recommended_price:  pricing.fare,
      estimated_duration: estimateETA(distanceKm, 25),
      agents_available:   nearby.length,
    });
  } catch (err) { next(err); }
});

// ─── POST /api/deliveries ─────────────────────────────────────────────────────
router.post('/', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    const {
      pickup_address, pickup_lat, pickup_lng,
      pickup_contact_name, pickup_contact_phone,
      dropoff_address, dropoff_lat, dropoff_lng,
      recipient_name, recipient_phone,
      package_description, package_size = 'small', special_instructions,
      payment_method = 'cash',
      client_offered_price,
    } = req.body;

    const distanceKm = haversineDistance(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);
    const pricing    = await estimateFare(distanceKm, 'delivery');
    const minPrice   = await getMinPrice('delivery');

    // Validate offered price if provided
    const clientPrice = client_offered_price != null ? parseFloat(client_offered_price) : null;
    if (clientPrice !== null && clientPrice < minPrice) {
      return res.status(400).json({
        error: `Prix minimum non atteint`,
        min_price: minPrice,
        offered: clientPrice,
      });
    }

    const id = uuidv4();
    await query(
      `INSERT INTO deliveries
         (id, client_id,
          pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
          dropoff_address, dropoff_lat, dropoff_lng, recipient_name, recipient_phone,
          package_description, package_size, special_instructions,
          estimated_distance, estimated_fare, client_offered_price, recommended_price, min_price,
          commission_amount, agent_earnings,
          payment_method, status)
       VALUES (?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?, ?,?,?,?,?, ?,?, ?,'broadcast')`,
      [id, req.user.id,
       pickup_address, pickup_lat, pickup_lng, pickup_contact_name || null, pickup_contact_phone || null,
       dropoff_address, dropoff_lat, dropoff_lng, recipient_name || null, recipient_phone || null,
       package_description || null, package_size, special_instructions || null,
       distanceKm, pricing.fare,
       clientPrice ?? pricing.fare,   // client_offered_price
       pricing.fare,                  // recommended_price
       minPrice,                      // min_price
       pricing.commission, pricing.earnings,
       payment_method]
    );
    const { rows } = await query('SELECT * FROM deliveries WHERE id=?', [id]);
    const delivery  = rows[0];

    const io     = req.app.get('io');
    const nearby = await findNearbyDrivers(pickup_lat, pickup_lng, 'delivery');
    nearby.forEach((agent) => {
      io.to(`user:${agent.id}`).emit('new_delivery_request', {
        deliveryId:       id,
        clientId:         req.user.id,
        pickup:  { address: pickup_address,  lat: pickup_lat,  lng: pickup_lng  },
        dropoff: { address: dropoff_address, lat: dropoff_lat, lng: dropoff_lng },
        clientPrice:      clientPrice ?? pricing.fare,
        recommendedPrice: pricing.fare,
        minPrice,
        estimatedFare:    pricing.fare,
        distanceKm:       Math.round(distanceKm * 10) / 10,
        packageSize:      package_size,
        paymentMethod:    payment_method,
        agentDistance:    agent.distance_km,
      });
      query('INSERT INTO broadcast_logs (id, request_id, request_type, driver_id) VALUES (?,?,?,?)',
        [uuidv4(), id, 'delivery', agent.id]).catch(() => {});
    });

    setTimeout(async () => {
      const { rows: cur } = await query('SELECT status FROM deliveries WHERE id=?', [id]);
      if (cur[0]?.status === 'broadcast') {
        await query("UPDATE deliveries SET status='cancelled', cancel_reason='Aucun livreur disponible', cancelled_at=NOW() WHERE id=?", [id]);
        io.to(`user:${req.user.id}`).emit('delivery_cancelled', { deliveryId: id, reason: 'Aucun livreur disponible.' });
      }
    }, 3 * 60 * 1000);

    res.status(201).json({ delivery, agents_notified: nearby.length });
  } catch (err) { next(err); }
});

// ─── POST /api/deliveries/:id/offer  (agent submits a price offer) ────────────
router.post('/:id/offer', authenticate, requireRole('delivery'), requireActiveWallet, async (req, res, next) => {
  try {
    const { offered_price } = req.body;
    if (offered_price == null || isNaN(parseFloat(offered_price))) {
      return res.status(400).json({ error: 'Prix invalide' });
    }
    const price = Math.round(parseFloat(offered_price) * 100) / 100;

    // Load delivery
    const { rows: deliveryRows } = await query(
      "SELECT * FROM deliveries WHERE id=? AND status='broadcast'",
      [req.params.id]
    );
    if (!deliveryRows[0]) {
      return res.status(409).json({ error: 'Livraison non disponible ou déjà acceptée' });
    }
    const delivery = deliveryRows[0];

    // Enforce minimum price
    if (price < parseFloat(delivery.min_price || 0)) {
      return res.status(400).json({
        error: 'Offre inférieure au tarif minimum',
        min_price: delivery.min_price,
      });
    }

    // Upsert offer (agent can revise before client accepts)
    const offerId = uuidv4();
    await query(
      `INSERT INTO delivery_offers (id, delivery_id, agent_id, offered_price, status)
       VALUES (?, ?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE offered_price=VALUES(offered_price), status='pending'`,
      [offerId, req.params.id, req.user.id, price]
    );

    // Get actual offer id (may be the existing one if upserted)
    const { rows: offerRows } = await query(
      'SELECT * FROM delivery_offers WHERE delivery_id=? AND agent_id=?',
      [req.params.id, req.user.id]
    );
    const offer = offerRows[0];

    // Fetch agent info to send to client
    const { rows: aInfo } = await query(
      `SELECT u.name, u.photo_url,
              dp.transport_type, dp.rating
       FROM users u JOIN delivery_profiles dp ON u.id=dp.user_id WHERE u.id=?`,
      [req.user.id]
    );

    // Notify client in real time
    req.app.get('io').to(`user:${delivery.client_id}`).emit('delivery_offer', {
      offerId:          offer.id,
      deliveryId:       req.params.id,
      offeredPrice:     price,
      recommendedPrice: parseFloat(delivery.recommended_price),
      agent: {
        id:             req.user.id,
        name:           aInfo[0]?.name,
        photo_url:      aInfo[0]?.photo_url,
        transport_type: aInfo[0]?.transport_type,
        rating:         aInfo[0]?.rating ?? 5.0,
      },
    });

    res.json({ message: 'Offre envoyée', offerId: offer.id });
  } catch (err) { next(err); }
});

// ─── GET /api/deliveries/:id/offers  (client polls current offers) ─────────────
router.get('/:id/offers', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    const { rows: deliveryRows } = await query(
      'SELECT * FROM deliveries WHERE id=? AND client_id=?',
      [req.params.id, req.user.id]
    );
    if (!deliveryRows[0]) return res.status(404).json({ error: 'Livraison introuvable' });

    const { rows } = await query(
      `SELECT o.*, u.name AS agent_name, u.photo_url,
              dp.transport_type, dp.rating
       FROM delivery_offers o
       JOIN users u ON o.agent_id=u.id
       JOIN delivery_profiles dp ON u.id=dp.user_id
       WHERE o.delivery_id=? AND o.status='pending'
       ORDER BY o.offered_price ASC`,
      [req.params.id]
    );

    res.json({
      offers:            rows,
      recommended_price: parseFloat(deliveryRows[0].recommended_price),
      min_price:         parseFloat(deliveryRows[0].min_price),
    });
  } catch (err) { next(err); }
});

// ─── POST /api/deliveries/:id/offers/:offerId/accept  (client picks an agent) ──
router.post('/:id/offers/:offerId/accept', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    const result = await transaction(async (client) => {
      // Lock the delivery
      const { rows: deliveryRows } = await client.query(
        "SELECT * FROM deliveries WHERE id=? AND client_id=? AND status='broadcast' FOR UPDATE",
        [req.params.id, req.user.id]
      );
      if (!deliveryRows[0]) throw Object.assign(new Error('Livraison non disponible'), { status: 409 });

      // Lock the chosen offer
      const { rows: offerRows } = await client.query(
        "SELECT * FROM delivery_offers WHERE id=? AND delivery_id=? AND status='pending' FOR UPDATE",
        [req.params.offerId, req.params.id]
      );
      if (!offerRows[0]) throw Object.assign(new Error('Offre non disponible'), { status: 409 });

      const offer = offerRows[0];

      // Accept this offer, decline all others
      await client.query(
        "UPDATE delivery_offers SET status='accepted' WHERE id=?",
        [offer.id]
      );
      await client.query(
        "UPDATE delivery_offers SET status='declined' WHERE delivery_id=? AND id!=?",
        [req.params.id, offer.id]
      );

      // Update delivery
      await client.query(
        `UPDATE deliveries SET
           agent_id=?, status='accepted', accepted_at=NOW(),
           final_agreed_price=?
         WHERE id=?`,
        [offer.agent_id, offer.offered_price, req.params.id]
      );
      await client.query(
        "UPDATE delivery_profiles SET status='busy' WHERE user_id=?",
        [offer.agent_id]
      );

      const { rows: updated } = await client.query('SELECT * FROM deliveries WHERE id=?', [req.params.id]);
      return { delivery: updated[0], offer };
    });

    const { rows: aInfo } = await query(
      `SELECT u.name, u.photo_url,
              dp.transport_type, dp.rating
       FROM users u JOIN delivery_profiles dp ON u.id=dp.user_id WHERE u.id=?`,
      [result.offer.agent_id]
    );

    const io = req.app.get('io');

    // Notify winning agent
    io.to(`user:${result.offer.agent_id}`).emit('delivery_offer_accepted', {
      deliveryId:    req.params.id,
      finalPrice:    parseFloat(result.offer.offered_price),
      clientId:      req.user.id,
      pickup:  {
        address: result.delivery.pickup_address,
        lat:     parseFloat(result.delivery.pickup_lat),
        lng:     parseFloat(result.delivery.pickup_lng),
      },
      dropoff: {
        address: result.delivery.dropoff_address,
        lat:     parseFloat(result.delivery.dropoff_lat),
        lng:     parseFloat(result.delivery.dropoff_lng),
      },
      paymentMethod: result.delivery.payment_method,
      distanceKm:    parseFloat(result.delivery.estimated_distance),
    });

    // Notify declined agents
    const { rows: declined } = await query(
      "SELECT agent_id FROM delivery_offers WHERE delivery_id=? AND status='declined'",
      [req.params.id]
    );
    declined.forEach(({ agent_id }) => {
      io.to(`user:${agent_id}`).emit('delivery_offer_declined', {
        deliveryId: req.params.id,
        reason: 'Le client a choisi un autre livreur',
      });
    });

    // Tell client the delivery is now accepted (with agent info)
    io.to(`user:${req.user.id}`).emit('delivery_accepted', {
      deliveryId: req.params.id,
      agent: { ...aInfo[0], id: result.offer.agent_id },
    });

    // Broadcast delivery is taken
    io.emit('delivery_taken', { deliveryId: req.params.id });

    res.json({ message: 'Offre acceptée', delivery: result.delivery });
  } catch (err) { next(err); }
});

// ─── POST /api/deliveries/:id/accept ─────────────────────────────────────────
// (Legacy direct-accept — kept for backward compat but delivery now uses offer flow)
router.post('/:id/accept', authenticate, requireRole('delivery'), requireActiveWallet, async (req, res, next) => {
  try {
    const delivery = await transaction(async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM deliveries WHERE id=? AND status='broadcast' FOR UPDATE", [req.params.id]
      );
      if (!rows[0]) throw Object.assign(new Error('Livraison non disponible'), { status: 409 });

      await client.query(
        "UPDATE deliveries SET agent_id=?, status='accepted', accepted_at=NOW() WHERE id=?",
        [req.user.id, req.params.id]
      );
      await client.query("UPDATE delivery_profiles SET status='busy' WHERE user_id=?", [req.user.id]);
      const { rows: updated } = await client.query('SELECT * FROM deliveries WHERE id=?', [req.params.id]);
      return updated[0];
    });

    const { rows: aInfo } = await query(
      `SELECT u.name, u.photo_url, dp.transport_type, dp.rating
       FROM users u JOIN delivery_profiles dp ON u.id = dp.user_id WHERE u.id=?`,
      [req.user.id]
    );
    req.app.get('io').to(`user:${delivery.client_id}`).emit('delivery_accepted',
      { deliveryId: delivery.id, agent: { ...aInfo[0], id: req.user.id } });
    req.app.get('io').emit('delivery_taken', { deliveryId: req.params.id });

    res.json({ message: 'Livraison acceptée', delivery });
  } catch (err) { next(err); }
});

// ─── POST /api/deliveries/:id/pickup ─────────────────────────────────────────
router.post('/:id/pickup', authenticate, requireRole('delivery'), async (req, res, next) => {
  try {
    await query(
      "UPDATE deliveries SET status='pickup', pickup_at=NOW() WHERE id=? AND agent_id=? AND status='accepted'",
      [req.params.id, req.user.id]
    );
    const { rows } = await query('SELECT * FROM deliveries WHERE id=?', [req.params.id]);
    if (!rows[0] || rows[0].status !== 'pickup') return res.status(404).json({ error: 'Livraison introuvable' });
    req.app.get('io').to(`user:${rows[0].client_id}`).emit('delivery_picked_up', { deliveryId: rows[0].id });
    res.json({ message: 'Colis récupéré' });
  } catch (err) { next(err); }
});

// ─── POST /api/deliveries/:id/complete ───────────────────────────────────────
router.post('/:id/complete', authenticate, requireRole('delivery'), async (req, res, next) => {
  try {
    const { rows: dr } = await query(
      "SELECT * FROM deliveries WHERE id=? AND agent_id=? AND status='pickup'",
      [req.params.id, req.user.id]
    );
    if (!dr[0]) return res.status(404).json({ error: 'Livraison introuvable' });

    const d = dr[0];

    // Use negotiated final price if set, else use estimated fare
    let finalFare, commission, earnings;
    if (d.final_agreed_price && parseFloat(d.final_agreed_price) > 0) {
      const pricing = await estimateFare(parseFloat(d.estimated_distance), 'delivery');
      finalFare  = parseFloat(d.final_agreed_price);
      commission = Math.round(finalFare * pricing.commission_rate) / 100;
      earnings   = Math.round((finalFare - commission) * 100) / 100;
    } else {
      const pricing = await estimateFare(parseFloat(d.estimated_distance), 'delivery');
      finalFare  = pricing.fare;
      commission = pricing.commission;
      earnings   = pricing.earnings;
    }

    await query(
      `UPDATE deliveries SET
         status='delivered', delivered_at=NOW(),
         final_fare=?, commission_amount=?, agent_earnings=?,
         payment_status=CASE WHEN payment_method='cash' THEN 'completed' ELSE payment_status END
       WHERE id=?`,
      [finalFare, commission, earnings, d.id]
    );
    await query(
      "UPDATE delivery_profiles SET status='online', total_deliveries=total_deliveries+1 WHERE user_id=?",
      [req.user.id]
    );

    if (d.payment_method === 'cash') {
      await debitCommission(req.user.id, commission, d.id, 'delivery',
        `Commission livraison #${d.id.slice(0,8)}`);
    } else {
      await creditEarnings(req.user.id, earnings, d.id, 'delivery',
        `Gains livraison #${d.id.slice(0,8)}`);
    }

    req.app.get('io').to(`user:${d.client_id}`).emit('delivery_completed',
      { deliveryId: d.id, fare: finalFare });

    res.json({ message: 'Livraison terminée', fare: finalFare });
  } catch (err) { next(err); }
});

// ─── POST /api/deliveries/:id/cancel ─────────────────────────────────────────
router.post('/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const { rows } = await query(
      "SELECT * FROM deliveries WHERE id=? AND status NOT IN ('delivered','cancelled')",
      [req.params.id]
    );
    if (!rows[0] || (rows[0].client_id !== req.user.id && rows[0].agent_id !== req.user.id))
      return res.status(404).json({ error: 'Livraison introuvable' });

    await query(
      "UPDATE deliveries SET status='cancelled', cancelled_at=NOW(), cancel_reason=? WHERE id=?",
      [reason || 'Annulé', req.params.id]
    );
    if (rows[0].agent_id) {
      await query("UPDATE delivery_profiles SET status='online' WHERE user_id=?", [rows[0].agent_id]);
    }
    const notifyId = req.user.id === rows[0].client_id ? rows[0].agent_id : rows[0].client_id;
    if (notifyId) req.app.get('io').to(`user:${notifyId}`).emit('delivery_cancelled', { deliveryId: req.params.id, reason });
    res.json({ message: 'Livraison annulée' });
  } catch (err) { next(err); }
});

// ─── GET /api/deliveries/history ──────────────────────────────────────────────
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const col    = req.user.role === 'delivery' ? 'agent_id' : 'client_id';
    const { rows } = await query(
      `SELECT d.*,
         c.name AS client_name,
         a.name AS agent_name, a.photo_url AS agent_photo
       FROM deliveries d
       LEFT JOIN users c ON d.client_id = c.id
       LEFT JOIN users a ON d.agent_id  = a.id
       WHERE d.${col} = ?
       ORDER BY d.requested_at DESC
       LIMIT ${parseInt(limit)} OFFSET ${offset}`,
      [req.user.id]
    );
    res.json({ deliveries: rows, page: parseInt(page) });
  } catch (err) { next(err); }
});

module.exports = router;
