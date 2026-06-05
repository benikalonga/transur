const axios = require('axios');

// Generate 6-digit OTP
const generateOTP = () => String(Math.floor(100000 + Math.random() * 900000));

// AfricasTalking SMS (primary for DRC)
const sendViaSafaricom = async (phone, message) => {
  const response = await axios.post(
    'https://api.africastalking.com/version1/messaging',
    new URLSearchParams({ username: process.env.AFRICASTALKING_USERNAME, to: phone, message }),
    {
      headers: {
        apiKey: process.env.AFRICASTALKING_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );
  return response.data;
};

// Fallback: console log in dev
const sendViaDev = (phone, message) => {
  console.log(`\n📱 SMS to ${phone}: ${message}\n`);
  return { success: true };
};

const sendOTP = async (phone, code) => {
  const message = `Votre code Transur : ${code}. Valable 10 minutes. Ne partagez jamais ce code.`;
  if (process.env.NODE_ENV === 'development') return sendViaDev(phone, message);
  return sendViaSafaricom(phone, message);
};

const sendTripNotification = async (phone, driverName, eta) => {
  const message = `Transur: ${driverName} est en route. Arrivée estimée: ${eta} min.`;
  if (process.env.NODE_ENV === 'development') return sendViaDev(phone, message);
  return sendViaSafaricom(phone, message);
};

module.exports = { generateOTP, sendOTP, sendTripNotification };
