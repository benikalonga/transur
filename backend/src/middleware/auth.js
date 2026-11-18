const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { one } = require('../db/pool');
const { unauthorized, forbidden } = require('../lib/http');

const bearer = (req) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
};

const verify = (token) => {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch {
    return null;
  }
};

/** Signed-in app user (rider, driver or courier). Sets `req.user`. */
const requireUser = async (req, res, next) => {
  try {
    const claims = verify(bearer(req));
    if (!claims?.sub || claims.typ !== 'user') throw unauthorized('Your session has expired. Please sign in again.');

    const user = await one(
      'SELECT id, phone, full_name, role, account_status FROM users WHERE id = ?',
      [claims.sub]
    );
    if (!user) throw unauthorized('Account not found');
    if (user.account_status !== 'active') {
      throw forbidden('This account is suspended. Please contact support.');
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/** Restrict a route to some user roles. Use after `requireUser`. */
const onlyRoles = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : next(forbidden());

/** Console staff member. Sets `req.staff`. */
const requireStaff = async (req, res, next) => {
  try {
    const claims = verify(bearer(req));
    if (!claims?.sub || claims.typ !== 'staff') throw unauthorized();

    const staff = await one(
      'SELECT id, email, full_name, role, access_status FROM staff WHERE id = ?',
      [claims.sub]
    );
    if (!staff || staff.access_status !== 'active') throw unauthorized('Console access revoked');
    req.staff = staff;
    next();
  } catch (err) {
    next(err);
  }
};

const ownerOnly = (req, res, next) =>
  req.staff?.role === 'owner' ? next() : next(forbidden('Owner access required'));

const signUserToken = (userId) =>
  jwt.sign({ sub: userId, typ: 'user' }, env.jwtSecret, { expiresIn: env.jwtTtl });

const signStaffToken = (staffId) =>
  jwt.sign({ sub: staffId, typ: 'staff' }, env.jwtSecret, { expiresIn: env.staffJwtTtl });

/** Short-lived token proving a phone number was verified, used to finish sign-up. */
const signPhoneProof = (phone) =>
  jwt.sign({ phone, typ: 'phone_proof' }, env.jwtSecret, { expiresIn: '30m' });

const readPhoneProof = (token) => {
  const claims = verify(token);
  return claims?.typ === 'phone_proof' ? claims.phone : null;
};

module.exports = {
  requireUser,
  onlyRoles,
  requireStaff,
  ownerOnly,
  signUserToken,
  signStaffToken,
  signPhoneProof,
  readPhoneProof,
  verifyToken: verify,
};
