import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({ baseURL: BASE_URL, withCredentials: true });

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem('refresh_token');
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { token: refresh });
        localStorage.setItem('access_token', data.access);
        localStorage.setItem('refresh_token', data.refresh);
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  refresh: (token) => api.post('/auth/refresh', { token }),
  me: () => api.get('/auth/me'),
};

// ── Listings ──────────────────────────────────────────────────────────────────
export const listingsApi = {
  getAll: (params) => api.get('/listings', { params }),
  getOne: (id) => api.get(`/listings/${id}`),
  create: (data) => api.post('/listings', data),
  update: (id, data) => api.patch(`/listings/${id}`, data),
  delete: (id) => api.delete(`/listings/${id}`),
  myListings: () => api.get('/listings/my'),
};

// ── Bids ──────────────────────────────────────────────────────────────────────
export const bidsApi = {
  place: (listingId, amount) => api.post('/bids', { listingId, amount }),
  history: (listingId) => api.get(`/bids/listing/${listingId}`),
  myBids: () => api.get('/bids/my'),
};

// ── Handover ──────────────────────────────────────────────────────────────────
export const handoverApi = {
  get: (listingId) => api.get(`/handover/${listingId}`),
  approve: (listingId) => api.post(`/handover/${listingId}/approve`),
  reject: (listingId, reason) => api.post(`/handover/${listingId}/reject`, { reason }),
  confirm: (listingId, code) => api.post(`/handover/${listingId}/confirm`, { code }),
};

export default api;
