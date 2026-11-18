const env = require('../config/env');
const { sql, one } = require('../db/pool');
const { cents } = require('../lib/money');
const { roadDistanceKm, travelMinutes } = require('../lib/geo');
const { PARCEL_SIZES } = require('../config/catalog');
const { badRequest } = require('../lib/http');

/** Riders may offer down to this share of the quoted fare (never below the minimum). */
const FLOOR_SHARE = 0.8;

const activeRules = (service, city = env.defaultCity) =>
  sql(
    'SELECT * FROM fare_rules WHERE service = ? AND city = ? AND is_active = 1 ORDER BY minimum_fare',
    [service, city]
  );

const findRule = async (service, vehicleClass, city = env.defaultCity) => {
  const rule = await one(
    'SELECT * FROM fare_rules WHERE service = ? AND vehicle_class = ? AND city = ? AND is_active = 1',
    [service, vehicleClass, city]
  );
  if (!rule) throw badRequest(`"${vehicleClass}" is not available for ${service}s right now.`);
  return rule;
};

/** Apply a fare rule to a trip. */
const priceTrip = (rule, { distanceKm, durationMin, parcelSize }) => {
  const sizeFactor = parcelSize ? PARCEL_SIZES[parcelSize] || 1 : 1;
  const metered = rule.base_fare + distanceKm * rule.per_km + durationMin * rule.per_minute;
  const quoted = Math.max(metered * rule.surge_multiplier * sizeFactor, rule.minimum_fare);
  const floor = Math.max(rule.minimum_fare, quoted * FLOOR_SHARE);
  return {
    vehicle_class: rule.vehicle_class,
    label: rule.label,
    seats: rule.seats,
    surge: rule.surge_multiplier,
    commission_pct: rule.commission_pct,
    quoted_fare: cents(quoted),
    floor_fare: cents(floor),
  };
};

/** Distance/duration estimate between two points. */
const measure = (pickup, dropoff, speedKmh) => {
  const distanceKm = cents(roadDistanceKm(pickup, dropoff));
  return { distanceKm, durationMin: travelMinutes(distanceKm, speedKmh) };
};

/** Quote every active option for a service (used by the booking screen). */
const quoteAll = async (service, pickup, dropoff, parcelSize) => {
  const trip = measure(pickup, dropoff, service === 'parcel' ? 22 : 28);
  const rules = await activeRules(service);
  return {
    distance_km: trip.distanceKm,
    duration_min: trip.durationMin,
    options: rules.map((r) => priceTrip(r, { ...trip, parcelSize })),
  };
};

/** Split an agreed fare into platform fee and provider payout. */
const settle = (fare, commissionPct) => {
  const platformFee = cents((fare * commissionPct) / 100);
  return { platformFee, providerPayout: cents(fare - platformFee) };
};

module.exports = { activeRules, findRule, priceTrip, measure, quoteAll, settle };
