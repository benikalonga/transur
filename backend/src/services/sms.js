const crypto = require('crypto');
const axios = require('axios');
const env = require('../config/env');

const newCode = () => String(crypto.randomInt(100000, 1000000));
const hashCode = (phone, code) =>
  crypto.createHash('sha256').update(`${phone}:${code}:${env.jwtSecret}`).digest('hex');

const deliver = async (to, message) => {
  if (!env.isProd && !env.sms.apiKey) {
    console.log(`\n✉  SMS → ${to}\n   ${message}\n`);
    return { simulated: true };
  }
  const { data } = await axios.post(
    'https://api.africastalking.com/version1/messaging',
    new URLSearchParams({ username: env.sms.username, to, message, from: env.sms.senderId }),
    {
      headers: { apiKey: env.sms.apiKey, Accept: 'application/json' },
      timeout: 10000,
    }
  );
  return data;
};

const sendLoginCode = (phone, code) =>
  deliver(phone, `${code} is your Transur code. It expires in ${env.otpTtlMinutes} minutes. Never share it.`);

/** SMS fallback for people whose data connection is down. Failures are logged, not thrown. */
const sendText = (phone, message) =>
  deliver(phone, `Transur: ${message}`).catch((err) => console.warn('[sms] failed:', err.message));

module.exports = { newCode, hashCode, sendLoginCode, sendText };
