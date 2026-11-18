const crypto = require('crypto');
const { randomUUID: uuid } = require('crypto');
const env = require('../config/env');
const { sql, one, withTransaction } = require('../db/pool');
const { readPoint, distanceKm, travelMinutes } = require('../lib/geo');
const { cents, toAmount } = require('../lib/money');
const { badRequest, forbidden, notFound, conflict } = require('../lib/http');
const {
  DRIVER_CLASSES, PAYMENT_METHODS, PARCEL_SIZES, SERVICE_ROLE, LIVE_STATES,
} = require('../config/catalog');
const pricing = require('./pricing');
const promos = require('./promos');
const wallet = require('./wallet');
const dispatch = require('./dispatch');
const { notify } = require('./notify');
const sms = require('./sms');
const hub = require('../realtime/hub');

const NOUN = { ride: 'ride', parcel: 'delivery' };

// ─── Reading ──────────────────────────────────────────────────────────────────

const DETAIL_SELECT = `
  SELECT b.*,
         r.full_name AS rider_name, r.phone AS rider_phone, r.avatar_url AS rider_avatar,
         p.full_name AS provider_name, p.phone AS provider_phone, p.avatar_url AS provider_avatar,
         fp.vehicle_class AS provider_vehicle_class, fp.vehicle_make, fp.vehicle_color, fp.plate_number,
         fp.rating_avg AS provider_rating_avg, fp.jobs_completed AS provider_jobs,
         pc.code AS promo_code,
         pos.lat AS provider_lat, pos.lng AS provider_lng
  FROM bookings b
  JOIN users r ON r.id = b.rider_id
  LEFT JOIN users p ON p.id = b.provider_id
  LEFT JOIN fleet_profiles fp ON fp.user_id = b.provider_id
  LEFT JOIN fleet_positions pos ON pos.user_id = b.provider_id
  LEFT JOIN promo_codes pc ON pc.id = b.promo_code_id`;

const getDetailed = (id) => one(`${DETAIL_SELECT} WHERE b.id = ?`, [id]);

/** Load a booking and make sure the user takes part in it. */
const getForParticipant = async (id, user) => {
  const b = await getDetailed(id);
  if (!b) throw notFound('Booking not found');
  if (b.rider_id !== user.id && b.provider_id !== user.id) throw notFound('Booking not found');
  // The handover PIN is only for the sender; the courier must get it from the recipient.
  if (b.provider_id === user.id) delete b.handover_pin;
  return b;
};

const providerCard = async (providerId) => {
  const row = await one(
    `SELECT u.id, u.full_name AS name, u.avatar_url, fp.vehicle_class, fp.vehicle_make, fp.vehicle_color,
            fp.plate_number, fp.rating_avg AS rating, fp.jobs_completed, fp.is_verified
     FROM users u JOIN fleet_profiles fp ON fp.user_id = u.id WHERE u.id = ?`,
    [providerId]
  );
  return row;
};

// ─── Creating ─────────────────────────────────────────────────────────────────

const parseSchedule = (value) => {
  if (!value) return null;
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) throw badRequest('Invalid schedule time.');
  const minutesAhead = (when.getTime() - Date.now()) / 60000;
  if (minutesAhead < 15) throw badRequest('Scheduled bookings must be at least 15 minutes ahead.');
  if (minutesAhead > 7 * 24 * 60) throw badRequest('You can schedule up to 7 days ahead.');
  return when;
};

/** Validate the request body and compute the price for one vehicle class. */
const prepare = async (user, body) => {
  const service = body.service === 'parcel' ? 'parcel' : 'ride';
  const pickup = readPoint(body, 'pickup');
  const dropoff = readPoint(body, 'dropoff');
  if (!pickup || !dropoff) throw badRequest('Pickup and drop-off locations are required.');
  if (distanceKm(pickup, dropoff) < 0.1) throw badRequest('Pickup and drop-off are too close together.');

  const vehicleClass = service === 'ride' ? body.vehicle_class || 'economy' : 'standard';
  if (service === 'ride' && !DRIVER_CLASSES.includes(vehicleClass)) throw badRequest('Unknown vehicle class.');

  const parcelSize = service === 'parcel' ? body.parcel_size || 'small' : null;
  if (parcelSize && !PARCEL_SIZES[parcelSize]) throw badRequest('Unknown parcel size.');

  const rule = await pricing.findRule(service, vehicleClass);
  const trip = pricing.measure(pickup, dropoff, service === 'parcel' ? 22 : 28);
  const price = pricing.priceTrip(rule, { ...trip, parcelSize });

  return { service, pickup, dropoff, vehicleClass, parcelSize, rule, trip, price };
};

const create = async (user, body) => {
  const { service, pickup, dropoff, vehicleClass, parcelSize, trip, price } = await prepare(user, body);

  const paymentMethod = body.payment_method || 'cash';
  if (!PAYMENT_METHODS.includes(paymentMethod)) throw badRequest('Unsupported payment method.');

  const riderOffer = body.rider_offer != null ? toAmount(body.rider_offer) : price.quoted_fare;
  if (riderOffer == null || riderOffer < price.floor_fare) {
    throw badRequest(`Your offer must be at least ${price.floor_fare}.`, { floor_fare: price.floor_fare });
  }

  if (service === 'parcel' && (!body.recipient_name || !body.recipient_phone)) {
    throw badRequest('Recipient name and phone are required for a delivery.');
  }

  const scheduledFor = parseSchedule(body.scheduled_for);

  const open = await one(
    `SELECT COUNT(*) AS n FROM bookings WHERE rider_id = ? AND status IN ('searching', ${LIVE_STATES.map(() => '?').join(',')})`,
    [user.id, ...LIVE_STATES]
  );
  if (!scheduledFor && open.n >= 2) throw conflict('You already have active bookings. Finish or cancel one first.');

  let promoId = null;
  let discount = 0;
  if (body.promo_code) {
    const result = await promos.evaluate({ code: body.promo_code, userId: user.id, service, fare: riderOffer });
    promoId = result.promo.id;
    discount = result.discount;
  }

  const id = uuid();
  await sql(
    `INSERT INTO bookings
       (id, service, vehicle_class, rider_id,
        pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, rider_note,
        sender_name, sender_phone, recipient_name, recipient_phone, parcel_details, parcel_size, handover_pin,
        distance_km, duration_min, quoted_fare, floor_fare, rider_offer, commission_pct,
        promo_code_id, discount_amount, payment_method, status, scheduled_for)
     VALUES (?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?)`,
    [
      id, service, vehicleClass, user.id,
      String(body.pickup_address || 'Pinned location').slice(0, 255), pickup.lat, pickup.lng,
      String(body.dropoff_address || 'Pinned location').slice(0, 255), dropoff.lat, dropoff.lng,
      body.note ? String(body.note).slice(0, 255) : null,
      service === 'parcel' ? body.sender_name || user.full_name : null,
      service === 'parcel' ? body.sender_phone || user.phone : null,
      service === 'parcel' ? body.recipient_name : null,
      service === 'parcel' ? body.recipient_phone : null,
      service === 'parcel' ? (body.parcel_details || '').slice(0, 255) || null : null,
      parcelSize,
      service === 'parcel' ? String(crypto.randomInt(1000, 10000)) : null,
      trip.distanceKm, trip.durationMin, price.quoted_fare, price.floor_fare, riderOffer, price.commission_pct,
      promoId, discount, paymentMethod, scheduledFor ? 'scheduled' : 'searching', scheduledFor,
    ]
  );

  if (scheduledFor) {
    await notify(user.id, {
      title: `${service === 'ride' ? 'Ride' : 'Delivery'} scheduled`,
      body: `We will start finding a ${SERVICE_ROLE[service]} ${env.scheduleLeadMinutes} minutes before ${scheduledFor.toUTCString()}.`,
      category: 'booking',
      bookingId: id,
    });
    return { booking: await getDetailed(id), providersReached: 0 };
  }

  const providersReached = await release(id);
  return { booking: await getDetailed(id), providersReached };
};

/** Move a booking into the "searching" state and notify nearby providers. */
const release = async (bookingId) => {
  await sql(
    "UPDATE bookings SET status = 'searching', broadcast_at = UTC_TIMESTAMP() WHERE id = ? AND status IN ('scheduled','searching')",
    [bookingId]
  );
  const booking = await one('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (!booking || booking.status !== 'searching') return 0;
  const reached = await dispatch.broadcast(booking);
  hub.toStaff('booking:created', { id: booking.id, service: booking.service, reached });
  return reached;
};

// ─── Bidding ──────────────────────────────────────────────────────────────────

const placeBid = async (provider, bookingId, rawAmount) => {
  const amount = toAmount(rawAmount);
  if (amount == null || amount <= 0) throw badRequest('Enter a valid amount.');
  if (await wallet.isLocked(provider.id)) {
    throw forbidden('Your wallet is locked. Top up to keep receiving requests.');
  }

  const booking = await one("SELECT * FROM bookings WHERE id = ? AND status = 'searching'", [bookingId]);
  if (!booking) throw conflict('This request is no longer available.');
  if (SERVICE_ROLE[booking.service] !== provider.role) throw forbidden();
  if (amount < booking.floor_fare) throw badRequest(`Bid must be at least ${booking.floor_fare}.`);

  const profile = await one('SELECT * FROM fleet_profiles WHERE user_id = ?', [provider.id]);
  if (!profile || profile.availability !== 'online') throw conflict('Go online to send offers.');
  if (booking.service === 'ride' && profile.vehicle_class !== booking.vehicle_class) throw forbidden();

  const pos = await one('SELECT lat, lng FROM fleet_positions WHERE user_id = ?', [provider.id]);
  const etaMin = pos
    ? travelMinutes(distanceKm(pos, { lat: booking.pickup_lat, lng: booking.pickup_lng }) * 1.3)
    : null;

  await sql(
    `INSERT INTO booking_bids (id, booking_id, provider_id, amount, eta_min, status)
     VALUES (?, ?, ?, ?, ?, 'open')
     ON DUPLICATE KEY UPDATE amount = VALUES(amount), eta_min = VALUES(eta_min), status = 'open'`,
    [uuid(), bookingId, provider.id, amount, etaMin]
  );
  const bid = await one('SELECT * FROM booking_bids WHERE booking_id = ? AND provider_id = ?', [bookingId, provider.id]);

  hub.toUser(booking.rider_id, 'booking:bid', {
    bookingId,
    bidId: bid.id,
    amount,
    etaMin,
    quotedFare: booking.quoted_fare,
    provider: await providerCard(provider.id),
  });
  return bid;
};

const withdrawBid = async (provider, bookingId) => {
  const result = await sql(
    "UPDATE booking_bids SET status = 'withdrawn' WHERE booking_id = ? AND provider_id = ? AND status = 'open'",
    [bookingId, provider.id]
  );
  if (result.affectedRows) {
    const booking = await one('SELECT rider_id FROM bookings WHERE id = ?', [bookingId]);
    if (booking) hub.toUser(booking.rider_id, 'booking:bid_withdrawn', { bookingId, providerId: provider.id });
  }
};

const openBids = async (rider, bookingId) => {
  const booking = await one('SELECT * FROM bookings WHERE id = ? AND rider_id = ?', [bookingId, rider.id]);
  if (!booking) throw notFound('Booking not found');
  const bids = await sql(
    `SELECT bb.id AS bidId, bb.amount, bb.eta_min AS etaMin, bb.provider_id,
            u.full_name AS name, u.avatar_url, fp.vehicle_class, fp.vehicle_make, fp.vehicle_color,
            fp.plate_number, fp.rating_avg AS rating, fp.jobs_completed, fp.is_verified
     FROM booking_bids bb
     JOIN users u ON u.id = bb.provider_id
     JOIN fleet_profiles fp ON fp.user_id = bb.provider_id
     WHERE bb.booking_id = ? AND bb.status = 'open'
     ORDER BY bb.amount ASC`,
    [bookingId]
  );
  return {
    quotedFare: booking.quoted_fare,
    floorFare: booking.floor_fare,
    bids: bids.map(({ provider_id, name, avatar_url, vehicle_class, vehicle_make, vehicle_color,
      plate_number, rating, jobs_completed, is_verified, ...bid }) => ({
      ...bid,
      bookingId,
      provider: {
        id: provider_id, name, avatar_url, vehicle_class, vehicle_make, vehicle_color,
        plate_number, rating, jobs_completed, is_verified,
      },
    })),
  };
};

const acceptBid = async (rider, bookingId, bidId) => {
  const { booking, bid } = await withTransaction(async (db) => {
    const b = await db.one(
      "SELECT * FROM bookings WHERE id = ? AND rider_id = ? AND status = 'searching' FOR UPDATE",
      [bookingId, rider.id]
    );
    if (!b) throw conflict('This booking can no longer be assigned.');

    const chosen = await db.one(
      "SELECT * FROM booking_bids WHERE id = ? AND booking_id = ? AND status = 'open' FOR UPDATE",
      [bidId, bookingId]
    );
    if (!chosen) throw conflict('That offer is no longer available.');

    const profile = await db.one('SELECT availability FROM fleet_profiles WHERE user_id = ? FOR UPDATE', [chosen.provider_id]);
    if (profile?.availability !== 'online') {
      await db.sql("UPDATE booking_bids SET status = 'expired' WHERE id = ?", [chosen.id]);
      throw conflict('That driver just took another job. Pick a different offer.');
    }

    await db.sql("UPDATE booking_bids SET status = 'won' WHERE id = ?", [chosen.id]);
    await db.sql("UPDATE booking_bids SET status = 'lost' WHERE booking_id = ? AND id <> ? AND status = 'open'", [bookingId, chosen.id]);
    await db.sql(
      "UPDATE bookings SET provider_id = ?, agreed_fare = ?, status = 'assigned', assigned_at = UTC_TIMESTAMP() WHERE id = ?",
      [chosen.provider_id, chosen.amount, bookingId]
    );
    await db.sql("UPDATE fleet_profiles SET availability = 'busy' WHERE user_id = ?", [chosen.provider_id]);
    return { booking: b, bid: chosen };
  });

  const detailed = await getDetailed(bookingId);
  delete detailed.handover_pin;

  hub.toUser(bid.provider_id, 'booking:won', { booking: detailed });
  const losers = await sql("SELECT provider_id FROM booking_bids WHERE booking_id = ? AND status = 'lost'", [bookingId]);
  hub.toUsers(losers.map((l) => l.provider_id), 'booking:lost', { bookingId });
  hub.toEveryone('booking:closed', { bookingId });
  hub.toUser(rider.id, 'booking:assigned', { bookingId, provider: await providerCard(bid.provider_id), agreedFare: bid.amount });

  await notify(bid.provider_id, {
    title: 'You got the job',
    body: `Head to ${booking.pickup_address}.`,
    category: 'booking',
    bookingId,
  });
  return getDetailed(bookingId);
};

// ─── Progress ─────────────────────────────────────────────────────────────────

const STEP = {
  arrive: { from: 'assigned', to: 'arrived', stamp: 'arrived_at', event: 'booking:arrived' },
  start: { from: 'arrived', to: 'in_progress', stamp: 'started_at', event: 'booking:started' },
};

const advance = async (provider, bookingId, stepName) => {
  const step = STEP[stepName];
  const result = await sql(
    `UPDATE bookings SET status = ?, ${step.stamp} = UTC_TIMESTAMP()
     WHERE id = ? AND provider_id = ? AND status = ?`,
    [step.to, bookingId, provider.id, step.from]
  );
  if (!result.affectedRows) throw conflict(`This booking is not waiting for "${stepName}".`);

  const b = await one('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  hub.toUser(b.rider_id, step.event, { bookingId });

  if (stepName === 'arrive') {
    const msg = b.service === 'ride'
      ? 'Your driver has arrived at the pickup point.'
      : 'Your courier has arrived to collect the parcel.';
    await notify(b.rider_id, { title: 'Arrived', body: msg, category: 'booking', bookingId });
  }
  return b;
};

const complete = async (provider, bookingId, { pin } = {}) => {
  const outcome = await withTransaction(async (db) => {
    const b = await db.one(
      "SELECT * FROM bookings WHERE id = ? AND provider_id = ? AND status = 'in_progress' FOR UPDATE",
      [bookingId, provider.id]
    );
    if (!b) throw conflict('This booking is not in progress.');
    if (b.service === 'parcel' && b.handover_pin && String(pin || '') !== b.handover_pin) {
      throw badRequest('The handover PIN is incorrect. Ask the recipient for the 4-digit code.');
    }

    const fare = b.agreed_fare ?? b.rider_offer;
    let discount = 0;
    if (b.promo_code_id) {
      const promo = await db.one('SELECT * FROM promo_codes WHERE id = ?', [b.promo_code_id]);
      discount = promo ? promos.discountFor(promo, fare) : 0;
    }
    const { platformFee, providerPayout } = pricing.settle(fare, b.commission_pct);
    const riderPays = cents(fare - discount);

    await db.sql(
      `UPDATE bookings SET status = 'completed', completed_at = UTC_TIMESTAMP(),
         final_fare = ?, discount_amount = ?, platform_fee = ?, provider_payout = ?, payment_status = 'paid'
       WHERE id = ?`,
      [fare, discount, platformFee, providerPayout, b.id]
    );
    await db.sql(
      "UPDATE fleet_profiles SET availability = 'online', jobs_completed = jobs_completed + 1 WHERE user_id = ?",
      [provider.id]
    );

    const ref = `#${b.id.slice(0, 8)}`;
    if (b.payment_method === 'cash') {
      // Provider collected the cash: they owe the platform its fee.
      await wallet.postEntry(db, { userId: provider.id, kind: 'commission', amount: -platformFee, memo: `Service fee ${ref}`, bookingId: b.id });
      if (discount > 0) {
        // The rider paid less because of a promo; the platform covers the difference.
        await wallet.postEntry(db, { userId: provider.id, kind: 'promo_credit', amount: discount, memo: `Promo cover ${ref}`, bookingId: b.id });
      }
    } else {
      // Paid in-app: the platform holds the money and credits the provider's share.
      await wallet.postEntry(db, { userId: provider.id, kind: 'payout', amount: providerPayout, memo: `Earnings ${ref}`, bookingId: b.id });
    }

    if (b.promo_code_id) {
      await promos.redeem(db, { promoId: b.promo_code_id, userId: b.rider_id, bookingId: b.id, amount: discount });
    }
    return { booking: b, fare, discount, riderPays, platformFee, providerPayout };
  });

  const { booking, riderPays } = outcome;
  hub.toUser(booking.rider_id, 'booking:completed', {
    bookingId,
    fare: outcome.fare,
    discount: outcome.discount,
    total: riderPays,
    paymentMethod: booking.payment_method,
  });
  await notify(booking.rider_id, {
    title: `${booking.service === 'ride' ? 'Ride' : 'Delivery'} complete`,
    body: `${booking.payment_method === 'cash' ? 'Please pay in cash.' : 'Paid in the app.'} Your receipt is ready — rate your ${SERVICE_ROLE[booking.service]}!`,
    category: 'receipt',
    bookingId,
  });
  if (booking.service === 'parcel' && booking.recipient_phone) {
    sms.sendText(booking.recipient_phone, `your parcel from ${booking.sender_name || 'a sender'} has been delivered.`);
  }
  rewardReferrer(booking.rider_id).catch((err) => console.warn('[referral]', err.message));
  return outcome;
};

/** After a referred rider's first completed booking, the referrer gets a reward code. */
const rewardReferrer = async (riderId) => {
  const rider = await one('SELECT id, full_name, referred_by FROM users WHERE id = ?', [riderId]);
  if (!rider?.referred_by) return;
  const done = await one("SELECT COUNT(*) AS n FROM bookings WHERE rider_id = ? AND status = 'completed'", [riderId]);
  if (done.n !== 1) return;
  const code = await promos.grantPersonalCode({
    userId: rider.referred_by,
    amount: env.referralReward,
    description: `Thanks for inviting ${rider.full_name}`,
    prefix: 'THANKS',
  });
  await notify(rider.referred_by, {
    title: 'You earned a reward 🎉',
    body: `${rider.full_name} completed their first trip. Use code ${code} on your next booking.`,
    category: 'promo',
  });
};

// ─── Cancelling ───────────────────────────────────────────────────────────────

const cancel = async (actor, bookingId, reason, by) => {
  const b = await one('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (!b) throw notFound('Booking not found');

  if (by === 'rider' && b.rider_id !== actor.id) throw notFound('Booking not found');
  if (by === 'provider' && b.provider_id !== actor.id) throw notFound('Booking not found');

  const allowed = {
    rider: ['scheduled', 'searching', 'assigned', 'arrived'],
    provider: ['assigned', 'arrived'],
    system: ['scheduled', 'searching'],
    staff: ['scheduled', 'searching', 'assigned', 'arrived', 'in_progress'],
  }[by];
  if (!allowed.includes(b.status)) throw conflict(`A booking that is ${b.status.replace('_', ' ')} cannot be cancelled.`);

  const result = await sql(
    `UPDATE bookings SET status = 'cancelled', cancelled_at = UTC_TIMESTAMP(), cancelled_by = ?, cancel_reason = ?
     WHERE id = ? AND status = ?`,
    [by, reason ? String(reason).slice(0, 255) : null, bookingId, b.status]
  );
  if (!result.affectedRows) throw conflict('The booking changed. Refresh and try again.');

  if (b.provider_id) {
    await sql("UPDATE fleet_profiles SET availability = 'online' WHERE user_id = ? AND availability = 'busy'", [b.provider_id]);
  }
  const bidders = await sql("SELECT provider_id FROM booking_bids WHERE booking_id = ? AND status = 'open'", [bookingId]);
  await sql("UPDATE booking_bids SET status = 'expired' WHERE booking_id = ? AND status = 'open'", [bookingId]);

  const payload = { bookingId, reason: reason || null, by };
  hub.toUsers(bidders.map((x) => x.provider_id), 'booking:closed', { bookingId });
  if (by !== 'rider') hub.toUser(b.rider_id, 'booking:cancelled', payload);
  if (b.provider_id && by !== 'provider') hub.toUser(b.provider_id, 'booking:cancelled', payload);

  const noun = NOUN[b.service];
  if (by === 'system') {
    await notify(b.rider_id, {
      title: `No ${SERVICE_ROLE[b.service]} available`,
      body: `Nobody accepted your ${noun} in time. Try again, or raise your offer to attract more ${SERVICE_ROLE[b.service]}s.`,
      category: 'booking',
      bookingId,
    });
  } else if (by === 'provider') {
    await notify(b.rider_id, { title: `Your ${noun} was cancelled`, body: reason || 'The provider had to cancel.', category: 'booking', bookingId });
  } else if (by === 'rider' && b.provider_id) {
    await notify(b.provider_id, { title: `The ${noun} was cancelled`, body: reason || 'The rider cancelled.', category: 'booking', bookingId });
  }
  return { ...b, status: 'cancelled' };
};

// ─── After the trip ───────────────────────────────────────────────────────────

const rate = async (user, bookingId, stars, feedback) => {
  const score = parseInt(stars, 10);
  if (!(score >= 1 && score <= 5)) throw badRequest('Rating must be between 1 and 5.');
  const b = await one("SELECT * FROM bookings WHERE id = ? AND status = 'completed'", [bookingId]);
  if (!b) throw notFound('Completed booking not found');

  if (b.rider_id === user.id) {
    if (b.rider_rating) throw conflict('You already rated this trip.');
    await sql('UPDATE bookings SET rider_rating = ?, rider_feedback = ? WHERE id = ?', [score, feedback ? String(feedback).slice(0, 500) : null, bookingId]);
    await sql(
      `UPDATE fleet_profiles
       SET rating_avg = ROUND((rating_avg * rating_count + ?) / (rating_count + 1), 2), rating_count = rating_count + 1
       WHERE user_id = ?`,
      [score, b.provider_id]
    );
  } else if (b.provider_id === user.id) {
    if (b.provider_rating) throw conflict('You already rated this rider.');
    await sql('UPDATE bookings SET provider_rating = ? WHERE id = ?', [score, bookingId]);
  } else {
    throw notFound('Completed booking not found');
  }
};

const settleTip = async (db, booking, amount, externalRef) => {
  await wallet.postEntry(db, {
    userId: booking.provider_id,
    kind: 'tip',
    amount,
    memo: `Tip for #${booking.id.slice(0, 8)}`,
    bookingId: booking.id,
    externalRef,
  });
};

const tip = async (rider, bookingId, { amount: raw, method = 'cash', phone }) => {
  const amount = toAmount(raw);
  if (!(amount > 0 && amount <= 100)) throw badRequest('Tip must be between 0.01 and 100.');
  if (!PAYMENT_METHODS.includes(method)) throw badRequest('Unsupported payment method.');

  const b = await one("SELECT * FROM bookings WHERE id = ? AND rider_id = ? AND status = 'completed'", [bookingId, rider.id]);
  if (!b) throw notFound('Completed booking not found');
  if (b.tip_amount > 0) throw conflict('You already tipped for this trip.');

  await sql('UPDATE bookings SET tip_amount = ? WHERE id = ?', [amount, bookingId]);

  if (method === 'cash') {
    // Handed over in person: nothing to move, we only record it.
    hub.toUser(b.provider_id, 'tip:received', { bookingId, amount, method });
    await notify(b.provider_id, { title: 'You received a tip', body: `${rider.full_name} gave you a cash tip.`, category: 'earnings', bookingId });
    return { status: 'recorded' };
  }

  const intentId = uuid();
  const ref = `TIP-${intentId.slice(0, 13)}`;
  await sql(
    `INSERT INTO payment_intents (id, user_id, purpose, provider, payer_phone, amount, provider_ref, booking_id)
     VALUES (?, ?, 'tip', ?, ?, ?, ?, ?)`,
    [intentId, rider.id, method, phone || rider.phone, amount, ref, bookingId]
  );
  if (!env.isProd) {
    await settleIntent(ref, amount);
    return { status: 'paid', reference: ref };
  }
  return { status: 'pending', reference: ref };
};

/**
 * Mark a mobile money intent as paid and apply its effect. Idempotent: a second
 * call for the same reference does nothing.
 */
const settleIntent = async (providerRef, paidAmount) =>
  withTransaction(async (db) => {
    const intent = await db.one("SELECT * FROM payment_intents WHERE provider_ref = ? FOR UPDATE", [providerRef]);
    if (!intent || intent.status !== 'pending') return { applied: false };
    if (Math.abs(paidAmount - intent.amount) > 0.001) {
      await db.sql("UPDATE payment_intents SET status = 'failed', settled_at = UTC_TIMESTAMP() WHERE id = ?", [intent.id]);
      return { applied: false, reason: 'amount_mismatch' };
    }
    await db.sql("UPDATE payment_intents SET status = 'succeeded', settled_at = UTC_TIMESTAMP() WHERE id = ?", [intent.id]);

    if (intent.purpose === 'wallet_top_up') {
      await wallet.postEntry(db, {
        userId: intent.user_id, kind: 'top_up', amount: intent.amount,
        memo: `Top-up via ${intent.provider}`, externalRef: providerRef,
      });
      hub.toUser(intent.user_id, 'wallet:updated', {});
    } else if (intent.purpose === 'tip') {
      const booking = await db.one('SELECT * FROM bookings WHERE id = ?', [intent.booking_id]);
      if (booking?.provider_id) {
        await settleTip(db, booking, intent.amount, providerRef);
        hub.toUser(booking.provider_id, 'tip:received', { bookingId: booking.id, amount: intent.amount, method: intent.provider });
      }
    }
    return { applied: true };
  });

// ─── Safety ───────────────────────────────────────────────────────────────────

const shareLink = async (user, bookingId) => {
  const b = await getForParticipant(bookingId, user);
  let token = b.share_token;
  if (!token) {
    token = crypto.randomBytes(16).toString('hex');
    await sql('UPDATE bookings SET share_token = ? WHERE id = ?', [token, bookingId]);
  }
  return { token, url: `${env.appUrl}/track/${token}` };
};

const raiseSos = async (user, { bookingId, lat, lng, message }) => {
  let link = null;
  if (bookingId) {
    await getForParticipant(bookingId, user);
    link = (await shareLink(user, bookingId)).url;
  }
  const id = uuid();
  const latN = parseFloat(lat);
  const lngN = parseFloat(lng);
  await sql(
    'INSERT INTO sos_alerts (id, user_id, booking_id, lat, lng, message) VALUES (?, ?, ?, ?, ?, ?)',
    [id, user.id, bookingId || null, Number.isFinite(latN) ? latN : null, Number.isFinite(lngN) ? lngN : null, message ? String(message).slice(0, 255) : null]
  );

  hub.toStaff('sos:new', { id, userId: user.id, name: user.full_name, phone: user.phone, bookingId, lat: latN, lng: lngN, message });

  const contacts = await sql('SELECT name, phone FROM trusted_contacts WHERE user_id = ?', [user.id]);
  const where = link ? ` Live trip: ${link}` : Number.isFinite(latN) ? ` Location: https://maps.google.com/?q=${latN},${lngN}` : '';
  contacts.forEach((c) => sms.sendText(c.phone, `${user.full_name} triggered an emergency alert.${where}`));

  return { id, contactsAlerted: contacts.length };
};

// ─── Background jobs ──────────────────────────────────────────────────────────

const expireStale = async () => {
  const stale = await sql(
    `SELECT id FROM bookings
     WHERE status = 'searching' AND broadcast_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)`,
    [env.requestTtlMinutes]
  );
  for (const { id } of stale) {
    await cancel(null, id, 'No provider accepted in time', 'system').catch(() => {});
  }
  return stale.length;
};

const releaseScheduled = async () => {
  const due = await sql(
    `SELECT id, rider_id, service FROM bookings
     WHERE status = 'scheduled' AND scheduled_for <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)`,
    [env.scheduleLeadMinutes]
  );
  for (const b of due) {
    const reached = await release(b.id);
    hub.toUser(b.rider_id, 'booking:released', { bookingId: b.id, reached });
    await notify(b.rider_id, {
      title: 'Finding your provider',
      body: `Your scheduled ${NOUN[b.service]} is now open for offers.`,
      category: 'booking',
      bookingId: b.id,
    });
  }
  return due.length;
};

module.exports = {
  getDetailed,
  getForParticipant,
  providerCard,
  create,
  release,
  placeBid,
  withdrawBid,
  openBids,
  acceptBid,
  advance,
  complete,
  cancel,
  rate,
  tip,
  settleIntent,
  shareLink,
  raiseSos,
  expireStale,
  releaseScheduled,
};
