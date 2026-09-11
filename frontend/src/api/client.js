import axios from 'axios';

const formatBaseUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return 'http://localhost:5000/api';
  const match = raw.match(/https?:\/\/[^\s\r\n]+/);
  if (match) return match[0].replace(/\/+$/, '');
  return 'http://localhost:5000/api';
};

const rawApiUrl = 
  import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD 
    ? 'https://primebid-backend-e971.onrender.com/api' 
    : 'http://localhost:5000/api');

const API_BASE_URL = formatBaseUrl(rawApiUrl);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request Interceptor: Attach JWT token if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Friendly error message handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // If token expired or invalid, clear localStorage
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath !== '/register') {
        // Only clear if on protected pages
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    return Promise.reject(error);
  }
);

// API Endpoints
export const authApi = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  getMe: () => api.get('/auth/me'),
};

export const auctionApi = {
  getAll: () => api.get('/auctions'),
  getById: (id) => api.get(`/auctions/${id}`),
  create: (auctionData) => api.post('/auctions', auctionData),
};

export const bidApi = {
  getBidsForAuction: (auctionId) => api.get(`/bids/${auctionId}`),
  placeBid: (bidData) => api.post('/bids', bidData),
};

export const aiApi = {
  generate: (data) => api.post('/ai/generate', data, { timeout: 35000 }),
};

export const uploadApi = {
  uploadImage: (file) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};

export const getBackendHost = () => {
  return API_BASE_URL.replace(/\/api\/?$/, '');
};

export const resolveImageUrl = (url) => {
  if (!url) {
    return 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80'; // Sleek luxury watch
  }
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  if (url.startsWith('/uploads/')) {
    return `${getBackendHost()}${url}`;
  }
  return url;
};

export default api;
