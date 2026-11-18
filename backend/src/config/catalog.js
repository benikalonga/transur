/** Static lists shared across the API. */

const ROLES = ['rider', 'driver', 'courier'];
const FLEET_ROLES = ['driver', 'courier'];

/** Which fleet role serves which service. */
const SERVICE_ROLE = { ride: 'driver', parcel: 'courier' };

/** Vehicle classes a driver can register with (one per fare rule). */
const DRIVER_CLASSES = ['moto', 'economy', 'comfort', 'xl'];

/** Ways a courier can travel. All couriers serve the "standard" parcel class. */
const COURIER_MODES = ['bicycle', 'moto', 'car', 'on_foot'];

const PAYMENT_METHODS = ['cash', 'mpesa', 'airtel_money', 'orange_money', 'mtn_momo'];
const MOBILE_MONEY = PAYMENT_METHODS.filter((m) => m !== 'cash');

const PARCEL_SIZES = { small: 1, medium: 1.25, large: 1.6 };

/** Booking states considered "live" (a provider is attached and working). */
const LIVE_STATES = ['assigned', 'arrived', 'in_progress'];
const OPEN_STATES = ['scheduled', 'searching', ...LIVE_STATES];

module.exports = {
  ROLES,
  FLEET_ROLES,
  SERVICE_ROLE,
  DRIVER_CLASSES,
  COURIER_MODES,
  PAYMENT_METHODS,
  MOBILE_MONEY,
  PARCEL_SIZES,
  LIVE_STATES,
  OPEN_STATES,
};
