require('dotenv').config();

const num = (value, fallback) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Template placeholders such as "YOUR_JWT_SECRET" count as not set. */
const secret = (value) => (!value || /^YOUR_[A-Z0-9_]+$/.test(value) ? '' : value);

const env = {
  port: num(process.env.PORT, 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3000',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: num(process.env.DB_PORT, 3306),
    name: process.env.DB_NAME || 'transur',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    // Optional Unix socket (e.g. /run/mysqld/mysqld.sock). Used instead of host/port when set,
    // which lets a local MariaDB/MySQL root account sign in without a password.
    socket: process.env.DB_SOCKET || '',
  },

  jwtSecret: secret(process.env.JWT_SECRET),
  jwtTtl: process.env.JWT_TTL || '7d',
  staffJwtTtl: process.env.STAFF_JWT_TTL || '12h',
  otpTtlMinutes: num(process.env.OTP_TTL_MINUTES, 10),
  otpMaxAttempts: num(process.env.OTP_MAX_ATTEMPTS, 5),
  devLoginCode: /^\d{6}$/.test(process.env.DEV_LOGIN_CODE || '') ? process.env.DEV_LOGIN_CODE : '',

  sms: {
    apiKey: secret(process.env.SMS_API_KEY),
    username: process.env.SMS_USERNAME || 'sandbox',
    senderId: process.env.SMS_SENDER_ID || 'TRANSUR',
  },

  defaultCity: process.env.DEFAULT_CITY || 'default',
  dispatchRadiusKm: num(process.env.DISPATCH_RADIUS_KM, 15),
  requestTtlMinutes: num(process.env.REQUEST_TTL_MINUTES, 3),
  scheduleLeadMinutes: num(process.env.SCHEDULE_LEAD_MINUTES, 10),
  walletDebtLimit: num(process.env.WALLET_DEBT_LIMIT, -5),

  referralWelcome: num(process.env.REFERRAL_WELCOME_DISCOUNT, 1),
  referralReward: num(process.env.REFERRAL_REWARD_DISCOUNT, 1.5),

  paymentWebhookSecret: secret(process.env.PAYMENT_WEBHOOK_SECRET),
};

/** Connection settings shared by the pool and the migration script (MySQL 8 or MariaDB 10.6+). */
env.db.connection = () => ({
  ...(env.db.socket ? { socketPath: env.db.socket } : { host: env.db.host, port: env.db.port }),
  user: env.db.user,
  password: env.db.password,
});

env.isProd = env.nodeEnv === 'production';
env.isDev = env.nodeEnv === 'development';

/** Fail fast on configuration that would make the API insecure or unusable. */
env.assertValid = () => {
  const problems = [];
  if (env.jwtSecret.length < 32) {
    problems.push('JWT_SECRET is missing, still a YOUR_ placeholder, or shorter than 32 characters (openssl rand -hex 64).');
  }
  if (env.isProd) {
    const placeholders = Object.entries(process.env)
      .filter(([, value]) => /YOUR_[A-Z0-9_]+/.test(value || ''))
      .map(([key]) => key);
    if (placeholders.length) problems.push(`Replace the YOUR_ placeholder values in: ${placeholders.join(', ')}.`);
  }
  if (env.isProd && !process.env.APP_URL) {
    problems.push('APP_URL is required in production (allowed CORS origin).');
  }
  if (problems.length) {
    problems.forEach((p) => console.error(`✖ ${p}`));
    process.exit(1);
  }
};

module.exports = env;
