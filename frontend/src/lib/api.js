import axios from 'axios';
import { appSession, consoleSession } from './session';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
export const ASSET_URL = API_URL.replace(/\/api\/?$/, '');

const client = (session, loginPath) => {
  const http = axios.create({ baseURL: API_URL, timeout: 20000 }); // patient on slow networks
  http.interceptors.request.use((config) => {
    const token = session.token();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  http.interceptors.response.use(
    (res) => res.data,
    (err) => {
      if (err.response?.status === 401 && typeof window !== 'undefined' && session.token()) {
        session.clear();
        window.location.href = loginPath;
      }
      const message =
        err.response?.data?.error ||
        (err.code === 'ECONNABORTED' ? 'The network is slow. Please try again.' : null) ||
        (!err.response ? 'You appear to be offline.' : 'Something went wrong.');
      return Promise.reject(Object.assign(new Error(message), { status: err.response?.status, data: err.response?.data }));
    }
  );
  return http;
};

const http = client(appSession, '/login');
const staffHttp = client(consoleSession, '/console/login');

/** Turn a stored avatar path into a full URL. */
export const assetUrl = (path) => (!path ? null : path.startsWith('http') ? path : `${ASSET_URL}${path}`);

const form = (data) => {
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => v != null && v !== '' && fd.append(k, v));
  return fd;
};

// ─── App (rider / driver / courier) ───────────────────────────────────────────

export const api = {
  auth: {
    requestCode: (phone) => http.post('/auth/code', { phone }),
    verify: (phone, code) => http.post('/auth/verify', { phone, code }),
    signup: (data) => http.post('/auth/signup', form(data)),
  },
  catalog: () => http.get('/public/catalog'),
  track: (token) => http.get(`/public/track/${token}`),

  me: {
    get: () => http.get('/me'),
    update: (data) => http.patch('/me', data.avatar ? form(data) : data),
    updateVehicle: (data) => http.patch('/me/vehicle', data),
    setAvailability: (availability, position) => http.patch('/me/availability', { availability, position }),
    postPosition: (pos) => http.post('/me/position', pos),
    openRequests: () => http.get('/me/requests'),
    earnings: () => http.get('/me/earnings'),
    referrals: () => http.get('/me/referrals'),
    places: () => http.get('/me/places'),
    addPlace: (place) => http.post('/me/places', place),
    removePlace: (id) => http.delete(`/me/places/${id}`),
    contacts: () => http.get('/me/contacts'),
    addContact: (c) => http.post('/me/contacts', c),
    removeContact: (id) => http.delete(`/me/contacts/${id}`),
  },

  bookings: {
    quote: (data) => http.post('/bookings/quote', data),
    create: (data) => http.post('/bookings', data),
    list: (params) => http.get('/bookings', { params }),
    current: () => http.get('/bookings/current'),
    get: (id) => http.get(`/bookings/${id}`),
    bids: (id) => http.get(`/bookings/${id}/bids`),
    bid: (id, amount) => http.post(`/bookings/${id}/bids`, { amount }),
    withdrawBid: (id) => http.delete(`/bookings/${id}/bids/mine`),
    acceptBid: (id, bidId) => http.post(`/bookings/${id}/bids/${bidId}/accept`),
    arrive: (id) => http.post(`/bookings/${id}/arrive`),
    start: (id) => http.post(`/bookings/${id}/start`),
    complete: (id, pin) => http.post(`/bookings/${id}/complete`, { pin }),
    cancel: (id, reason) => http.post(`/bookings/${id}/cancel`, { reason }),
    rate: (id, stars, feedback) => http.post(`/bookings/${id}/rating`, { stars, feedback }),
    tip: (id, amount, method) => http.post(`/bookings/${id}/tip`, { amount, method }),
    receipt: (id) => http.get(`/bookings/${id}/receipt`),
    share: (id) => http.post(`/bookings/${id}/share`),
    sos: (id, data) => http.post(`/bookings/${id}/sos`, data),
    messages: (id) => http.get(`/bookings/${id}/messages`),
  },

  wallet: {
    get: () => http.get('/wallet'),
    entries: (page = 1) => http.get('/wallet/entries', { params: { page } }),
    topUp: (data) => http.post('/wallet/top-up', data),
  },

  promos: {
    mine: () => http.get('/promos'),
    check: (code, service, fare) => http.post('/promos/check', { code, service, fare }),
  },
  notifications: {
    list: () => http.get('/notifications'),
    markRead: (ids) => http.post('/notifications/read', { ids }),
  },
  help: { thread: () => http.get('/help/thread') },
  sos: (data) => http.post('/safety/sos', data),
};

// ─── Console (staff) ──────────────────────────────────────────────────────────

export const consoleApi = {
  login: (email, password) => staffHttp.post('/console/auth/login', { email, password }),
  requestAccess: (data) => staffHttp.post('/console/auth/request-access', data),
  me: () => staffHttp.get('/console/auth/me'),

  overview: () => staffHttp.get('/console/overview'),
  live: () => staffHttp.get('/console/live'),

  people: (params) => staffHttp.get('/console/people', { params }),
  person: (id) => staffHttp.get(`/console/people/${id}`),
  setPersonStatus: (id, status) => staffHttp.patch(`/console/people/${id}/status`, { status }),
  verify: (id, verified) => staffHttp.patch(`/console/people/${id}/verify`, { verified }),
  adjustWallet: (id, amount, memo) => staffHttp.post(`/console/people/${id}/wallet`, { amount, memo }),

  bookings: (params) => staffHttp.get('/console/bookings', { params }),
  booking: (id) => staffHttp.get(`/console/bookings/${id}`),
  cancelBooking: (id, reason) => staffHttp.post(`/console/bookings/${id}/cancel`, { reason }),

  wallets: (params) => staffHttp.get('/console/wallets', { params }),
  lockWallet: (userId, locked) => staffHttp.patch(`/console/wallets/${userId}/lock`, { locked }),
  ledger: (params) => staffHttp.get('/console/ledger', { params }),
  finance: (params) => staffHttp.get('/console/finance', { params }),

  fares: () => staffHttp.get('/console/fares'),
  updateFare: (id, data) => staffHttp.patch(`/console/fares/${id}`, data),

  promos: (params) => staffHttp.get('/console/promos', { params }),
  createPromo: (data) => staffHttp.post('/console/promos', data),
  updatePromo: (id, data) => staffHttp.patch(`/console/promos/${id}`, data),

  sos: (params) => staffHttp.get('/console/sos', { params }),
  updateSos: (id, status) => staffHttp.patch(`/console/sos/${id}`, { status }),

  threads: (params) => staffHttp.get('/console/help/threads', { params }),
  thread: (id) => staffHttp.get(`/console/help/threads/${id}`),
  startThread: (userId) => staffHttp.post('/console/help/threads', { userId }),
  reply: (id, body) => staffHttp.post(`/console/help/threads/${id}/reply`, { body }),
  setThreadState: (id, state) => staffHttp.patch(`/console/help/threads/${id}`, { state }),

  team: () => staffHttp.get('/console/team'),
  updateMember: (id, data) => staffHttp.patch(`/console/team/${id}`, data),
  removeMember: (id) => staffHttp.delete(`/console/team/${id}`),
};
