import axios from 'axios';

// Relative by default: nginx proxies /api/* to the backend container on the
// same origin, so this works over LAN, a tunnel, or any public hostname
// without a hardcoded IP baked into the build.
const API_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('csms_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('csms_token');
      localStorage.removeItem('csms_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);
