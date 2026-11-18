/**
 * End-to-end smoke test against a running API (development only).
 *
 *   1. Set DEV_LOGIN_CODE=123456 in backend/.env and start the API (npm run dev)
 *   2. npm run smoke
 *
 * Plays a full ride: rider and driver sign up, quote, booking, offer, accept,
 * arrive → start → complete, rating, receipt and the driver's wallet fee.
 * Optional: SMOKE_STAFF_EMAIL and SMOKE_STAFF_PASSWORD also check the console.
 */
require('dotenv').config();

const API = process.env.SMOKE_API_URL || `http://localhost:${process.env.PORT || 5000}/api`;
const CODE = process.env.DEV_LOGIN_CODE;
const center = (process.env.SMOKE_CENTER || '-11.6609,27.4794').split(',').map(Number);

let step = 0;
const ok = (msg) => console.log(`✓ ${String(++step).padStart(2)}. ${msg}`);
const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

async function call(method, path, body, token, multipart = false) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (multipart) {
    payload = new FormData();
    Object.entries(body).forEach(([k, v]) => payload.append(k, v));
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(API + path, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status} ${data.error || ''}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function signIn(phone, role, extra = {}) {
  await call('POST', '/auth/code', { phone });
  const verified = await call('POST', '/auth/verify', { phone, code: CODE });
  if (!verified.isNew) return verified.token;
  const created = await call(
    'POST', '/auth/signup',
    { phoneProof: verified.phoneProof, role, full_name: `Smoke ${role}`, ...extra },
    null, true
  );
  return created.token;
}

async function main() {
  if (!/^\d{6}$/.test(CODE || '')) fail('Set DEV_LOGIN_CODE=123456 in backend/.env and restart the API.');

  const health = await call('GET', '/health').catch(() => fail(`API not reachable at ${API}. Start it with npm run dev.`));
  ok(`API is up (${health.service})`);

  const tag = String(Date.now()).slice(-7);
  const pickup = { lat: center[0], lng: center[1] };
  const dropoff = { lat: center[0] - 0.014, lng: center[1] + 0.011 };

  const rider = await signIn(`+24381${tag}`, 'rider');
  ok('rider signed in with a login code');
  const driver = await signIn(`+24382${tag}`, 'driver', {
    vehicle_class: 'economy', vehicle_make: 'Toyota Vitz', vehicle_color: 'White',
    plate_number: `SMK${tag}`, licence_number: `L${tag}`,
  });
  ok('driver signed in');

  await call('PATCH', '/me/availability', { availability: 'online', position: pickup }, driver);
  await call('POST', '/me/position', pickup, driver);
  ok('driver is online at the pickup point');

  const quote = await call('POST', '/bookings/quote', {
    service: 'ride', pickup_lat: pickup.lat, pickup_lng: pickup.lng, dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
  }, rider);
  const economy = quote.options.find((o) => o.vehicle_class === 'economy');
  if (!economy) fail('quote has no economy class');
  const fare = economy.quoted_fare;
  ok(`quote: economy ${fare}`);

  const { booking } = await call('POST', '/bookings', {
    service: 'ride', vehicle_class: 'economy', rider_offer: fare, payment_method: 'cash',
    pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: 'Smoke pickup',
    dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, dropoff_address: 'Smoke drop-off',
  }, rider);
  ok(`booking created (${booking.status})`);

  const { requests } = await call('GET', '/me/requests', null, driver);
  if (!requests.some((r) => r.bookingId === booking.id)) fail('driver did not receive the request');
  ok('driver received the request');

  await call('POST', `/bookings/${booking.id}/bids`, { amount: fare }, driver);
  const { bids } = await call('GET', `/bookings/${booking.id}/bids`, null, rider);
  if (!bids.length) fail('rider sees no offers');
  ok(`rider sees ${bids.length} offer(s)`);

  await call('POST', `/bookings/${booking.id}/bids/${bids[0].bidId}/accept`, null, rider);
  ok('rider accepted the offer');
  const second = await call('POST', `/bookings/${booking.id}/bids/${bids[0].bidId}/accept`, null, rider).catch((e) => e);
  if (!(second instanceof Error)) fail('the same booking was accepted twice');
  ok('a second accept is refused');

  for (const action of ['arrive', 'start', 'complete']) {
    await call('POST', `/bookings/${booking.id}/${action}`, {}, driver);
  }
  const done = await call('GET', `/bookings/${booking.id}`, null, rider);
  if ((done.booking || done).status !== 'completed') fail('trip did not complete');
  ok('driver: arrived → started → completed');

  await call('POST', `/bookings/${booking.id}/rating`, { stars: 5 }, rider);
  const receipt = await call('GET', `/bookings/${booking.id}/receipt`, null, rider);
  ok(`rider rated the trip; receipt total ${receipt.total ?? receipt.receipt?.total}`);

  const wallet = await call('GET', '/wallet', null, driver);
  const balance = wallet.balance ?? wallet.wallet?.balance;
  if (!(balance < 0)) fail(`expected the platform fee to be debited, wallet is ${balance}`);
  ok(`platform fee debited from the driver wallet (${balance})`);

  if (process.env.SMOKE_STAFF_EMAIL && process.env.SMOKE_STAFF_PASSWORD) {
    const staff = await call('POST', '/console/auth/login', {
      email: process.env.SMOKE_STAFF_EMAIL, password: process.env.SMOKE_STAFF_PASSWORD,
    });
    await call('GET', '/console/overview', null, staff.token);
    ok('console sign-in and overview');
  }

  console.log('\nAll smoke checks passed.');
}

main().catch((err) => fail(err.message));
