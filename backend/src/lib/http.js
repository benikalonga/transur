/** An error that maps directly to an HTTP response. */
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const badRequest = (msg, extra) => new HttpError(400, msg, extra);
const unauthorized = (msg = 'Authentication required') => new HttpError(401, msg);
const forbidden = (msg = 'You are not allowed to do this') => new HttpError(403, msg);
const notFound = (msg = 'Not found') => new HttpError(404, msg);
const conflict = (msg, extra) => new HttpError(409, msg, extra);

/** Wrap an async route handler so rejected promises reach the error middleware. */
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Read page/limit query params with sane bounds. */
const paging = (query, defaultLimit = 20) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
};

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict, handle, paging };
