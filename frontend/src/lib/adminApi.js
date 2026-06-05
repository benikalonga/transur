import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

const adminApi = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach admin JWT token automatically
adminApi.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('admin_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally — redirect to admin login
adminApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      window.location.href = '/admin/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const adminLogin = (data) => adminApi.post('/admin/auth/login', data);
export const adminRegister = (data) => adminApi.post('/admin/auth/register', data);

// ── Stats ─────────────────────────────────────────────────────────────────────
export const getAdminStats = () => adminApi.get('/admin/stats');
export const getFinanceSummary = () => adminApi.get('/admin/finance/summary');
export const getFinanceDaily = () => adminApi.get('/admin/finance/daily');
export const getTopDrivers = () => adminApi.get('/admin/finance/top-drivers');

// ── Users ─────────────────────────────────────────────────────────────────────
export const getAdminUsers = (params) => adminApi.get('/admin/users', { params });
export const getAdminUser = (id) => adminApi.get(`/admin/users/${id}`);
export const updateUserStatus = (id, status) => adminApi.patch(`/admin/users/${id}/status`, { status });
export const creditUserWallet = (id, data) => adminApi.post(`/admin/users/${id}/wallet/credit`, data);
export const debitUserWallet = (id, data) => adminApi.post(`/admin/users/${id}/wallet/debit`, data);

// ── Chauffeurs & Livreurs ─────────────────────────────────────────────────────
export const getAdminDrivers = (params) => adminApi.get('/admin/chauffeurs', { params });
export const verifyDriver = (id) => adminApi.patch(`/admin/chauffeurs/${id}/verify`, { is_verified: true });
export const getAdminAgents = (params) => adminApi.get('/admin/livreurs', { params });
export const verifyAgent = (id) => adminApi.patch(`/admin/livreurs/${id}/verify`, { is_verified: true });

// ── Trips & Deliveries ────────────────────────────────────────────────────────
export const getAdminTrips = (params) => adminApi.get('/admin/trips', { params });
export const getAdminTrip = (id) => adminApi.get(`/admin/trips/${id}`);
export const getAdminDeliveries = (params) => adminApi.get('/admin/deliveries', { params });
export const getAdminDelivery = (id) => adminApi.get(`/admin/deliveries/${id}`);

// ── Wallets & Transactions ────────────────────────────────────────────────────
export const getAdminWallets = (params) => adminApi.get('/admin/wallets', { params });
export const blockWallet = (userId, blocked) => adminApi.patch(`/admin/wallets/${userId}/block`, { blocked });
export const getAdminTransactions = (params) => adminApi.get('/admin/transactions', { params });

// ── Pricing ───────────────────────────────────────────────────────────────────
export const getAdminPricing = () => adminApi.get('/admin/pricing');
export const updatePricing = (id, data) => adminApi.patch(`/admin/pricing/${id}`, data);

// ── Online / Live ─────────────────────────────────────────────────────────────
export const getOnlineDrivers = () => adminApi.get('/admin/online');
export const getLiveActivity = () => adminApi.get('/admin/activity/live');

// ── Support ───────────────────────────────────────────────────────────────────
export const getSupportConversations = (params) => adminApi.get('/admin/support/conversations', { params });
export const getSupportMessages = (convId) => adminApi.get(`/admin/support/conversations/${convId}/messages`);
export const replySupportConversation = (convId, message) =>
  adminApi.post(`/admin/support/conversations/${convId}/reply`, { message });
export const updateConvStatus = (convId, status) =>
  adminApi.patch(`/admin/support/conversations/${convId}/status`, { status });
export const createSupportConversation = (userId) =>
  adminApi.post('/admin/support/conversations', { userId });

// ── Admins management ─────────────────────────────────────────────────────────
export const getAdmins = () => adminApi.get('/admin/admins');
export const approveAdmin = (id) => adminApi.patch(`/admin/admins/${id}/approve`);
export const rejectAdmin = (id) => adminApi.patch(`/admin/admins/${id}/reject`);
export const deleteAdmin = (id) => adminApi.delete(`/admin/admins/${id}`);

// ── Socket ────────────────────────────────────────────────────────────────────
let adminSocket = null;

export const getAdminSocket = () => {
  if (!adminSocket || !adminSocket.connected) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null;
    if (!token) return null;
    adminSocket = io(
      (process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5001') + '/admin',
      { auth: { token }, transports: ['websocket', 'polling'] }
    );
  }
  return adminSocket;
};

export const disconnectAdminSocket = () => {
  if (adminSocket) {
    adminSocket.disconnect();
    adminSocket = null;
  }
};

export default adminApi;
