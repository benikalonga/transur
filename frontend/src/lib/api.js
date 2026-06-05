import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000, // 15s timeout for slow connections
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token automatically
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('transur_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('transur_token');
      localStorage.removeItem('transur_user');
      window.location.href = '/auth/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const sendOTP = (phone, purpose = 'login') =>
  api.post('/auth/send-otp', { phone, purpose });

export const verifyOTP = (phone, code, purpose = 'login') =>
  api.post('/auth/verify-otp', { phone, code, purpose });

export const registerClient = (data) => api.post('/auth/register/client', data);

export const registerDriver = (formData) =>
  api.post('/auth/register/driver', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const registerDelivery = (formData) =>
  api.post('/auth/register/delivery', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

// ── Users ─────────────────────────────────────────────────────────────────────
export const getMe = () => api.get('/users/me');
export const updateProfile = (data) => api.patch('/users/me', data);
export const setDriverStatus = (status) => api.patch('/users/driver/status', { status });
export const updateLocation = (location) => api.post('/users/location', location);

// ── Trips ─────────────────────────────────────────────────────────────────────
export const estimateTrip = (data) => api.post('/trips/estimate', data);
export const requestTrip = (data) => api.post('/trips', data);
export const acceptTrip = (id) => api.post(`/trips/${id}/accept`);
export const confirmPickup = (id) => api.post(`/trips/${id}/pickup`);
export const startTrip = (id) => api.post(`/trips/${id}/start`);
export const completeTrip = (id, data) => api.post(`/trips/${id}/complete`, data);
export const cancelTrip = (id, reason) => api.post(`/trips/${id}/cancel`, { reason });
export const rateTrip = (id, data) => api.post(`/trips/${id}/rate`, data);
export const getTrip = (id) => api.get(`/trips/${id}`);
export const getTripHistory = (page = 1) => api.get(`/trips/history?page=${page}`);
// Negotiation (InDrive-style)
export const submitTripOffer  = (id, offered_price) => api.post(`/trips/${id}/offer`, { offered_price });
export const getTripOffers    = (id) => api.get(`/trips/${id}/offers`);
export const acceptTripOffer  = (tripId, offerId)   => api.post(`/trips/${tripId}/offers/${offerId}/accept`);

// ── Deliveries ────────────────────────────────────────────────────────────────
export const estimateDelivery = (data) => api.post('/deliveries/estimate', data);
export const requestDelivery = (data) => api.post('/deliveries', data);
export const acceptDelivery = (id) => api.post(`/deliveries/${id}/accept`);
export const pickupDelivery = (id) => api.post(`/deliveries/${id}/pickup`);
export const completeDelivery = (id) => api.post(`/deliveries/${id}/complete`);
export const cancelDelivery = (id, reason) => api.post(`/deliveries/${id}/cancel`, { reason });
export const getDeliveryHistory = (page = 1) => api.get(`/deliveries/history?page=${page}`);
// Negotiation (InDrive-style delivery)
export const submitDeliveryOffer  = (deliveryId, offeredPrice) => api.post(`/deliveries/${deliveryId}/offer`, { offered_price: offeredPrice });
export const getDeliveryOffers    = (deliveryId) => api.get(`/deliveries/${deliveryId}/offers`);
export const acceptDeliveryOffer  = (deliveryId, offerId) => api.post(`/deliveries/${deliveryId}/offers/${offerId}/accept`);

// ── Wallet ────────────────────────────────────────────────────────────────────
export const getWallet = () => api.get('/wallet');
export const getTransactions = (page = 1) => api.get(`/wallet/transactions?page=${page}`);
export const rechargeWallet = (data) => api.post('/wallet/recharge', data);

// ── Chat ──────────────────────────────────────────────────────────────────────
export const getChatHistory = (type, id) => api.get(`/chat/${type}/${id}`);

export default api;
