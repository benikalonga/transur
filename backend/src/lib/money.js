/** Round to cents. All amounts are stored in the platform base currency. */
const cents = (n) => Math.round((Number(n) || 0) * 100) / 100;

const toAmount = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? cents(n) : null;
};

module.exports = { cents, toAmount };
