import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';
export const ML_BASE_URL = import.meta.env.VITE_ML_BASE_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token from localStorage automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('smartev_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// An expired or invalid session: clear it and send the user to log in again.
api.interceptors.response.use((response) => response, (error) => {
  const status = error.response?.status;
  const hadToken = !!error.config?.headers?.Authorization;
  const isAuthCall = error.config?.url?.startsWith('/auth/');
  if (status === 401 && hadToken && !isAuthCall) {
    localStorage.removeItem('smartev_token');
    localStorage.removeItem('smartev_user');
    if (!window.location.pathname.startsWith('/login')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/login?expired=1&next=${next}`);
    }
  }
  return Promise.reject(error);
});

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
};

export const stationApi = {
  getAll: (params) => api.get('/stations', { params }),
  getById: (id, params) => api.get(`/stations/${id}`, { params }),
  getNearby: (lat, lng, radius) => api.get('/stations/nearby', { params: { lat, lng, radius } }),
  create: (data) => api.post('/stations', data),
  update: (id, data) => api.put(`/stations/${id}`, data),
  delete: (id) => api.delete(`/stations/${id}`),
};

export const navigationApi = {
  planRoute: (data) => api.post('/navigation/plan-route', data),
};

export const bookingApi = {
  createHold: (data) => api.post('/bookings/hold', data),
  verifyPayment: (data) => api.post('/bookings/verify-payment', data),
  getMyBookings: (params) => api.get('/bookings/my-bookings', { params }),
  getAllBookings: () => api.get('/bookings/all'),
  getByRef: (ref) => api.get(`/bookings/${ref}`),
  cancel: (id) => api.post(`/bookings/${id}/cancel`),
};

export const vehicleApi = {
  getAll: () => api.get('/vehicles'),
  add: (data) => api.post('/vehicles', data),
  update: (id, data) => api.put(`/vehicles/${id}`, data),
  delete: (id) => api.delete(`/vehicles/${id}`),
  // Personal battery health from logged charges
  getHealth: (id) => api.get(`/vehicles/${id}/health`),
  logSession: (id, data) => api.post(`/vehicles/${id}/sessions`, data),
  deleteSession: (id, sessionId) => api.delete(`/vehicles/${id}/sessions/${sessionId}`),
};

export const batteryApi = {
  getLatest: (vehicleId = 1) => api.get(`/battery/latest/${vehicleId}`),
  submitTelemetry: (vehicleId, data) => api.post(`/battery/telemetry/${vehicleId}`, data),
  getHistory: (vehicleId = 1) => api.get(`/battery/history/${vehicleId}`),
  getModelEvaluation: () => 
    api.get('/battery/model-evaluation').catch(() => axios.get(`${ML_BASE_URL}/models/evaluation`)),
  // What-if SOH from usage conditions (model trained on laboratory cycling data).
  simulate: (data) => api.post('/battery/simulate', data),
  getSimulatorInfo: () => api.get('/battery/simulator-info'),
  runDiagnostics: (data) => 
    api.post('/battery/diagnostics', data).catch(() => axios.post(`${ML_BASE_URL}/predict/battery-diagnostics`, data)),
  getChemistryInsights: () => 
    api.get('/battery/chemistry-insights').catch(() => axios.get(`${ML_BASE_URL}/battery/chemistry-insights`)),
  predictMasterCell: (data) => 
    axios.post(`${ML_BASE_URL}/predict/master-cell`, data),
  getResearchPaper: () => 
    axios.get(`${ML_BASE_URL}/research/paper-data`),
};

export const aiApi = {
  chat: (message, conversationHistory = [], userContext = {}) => 
    api.post('/ai/chat', { message, conversation_history: conversationHistory, user_context: userContext }),
  getDemand: (stationId, date, hour) => 
    api.get(`/ai/demand/${stationId}`, { params: { date, hour } }),
};

export const analyticsApi = {
  getAdminStats: () => api.get('/analytics/admin-dashboard'),
};

export const uploadApi = {
  getSignature: () => api.post('/admin/uploads/signature'),
  // multipart header overrides the JSON default so axios sends the file with a boundary
  uploadImage: (file) => { const fd = new FormData(); fd.append('file', file); return api.post('/admin/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); },
};

export const reviewApi = {
  getByStation: (stationId) => api.get(`/reviews/station/${stationId}`),
  addReview: (stationId, rating, comment) => api.post(`/reviews/station/${stationId}`, { rating, comment }),
  getAiSummary: (stationId) => api.get(`/reviews/station/${stationId}/summary`),
};

export const notificationApi = {
  getAll: () => api.get('/notifications'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAllRead: () => api.post('/notifications/mark-all-read'),
};

export default api;
