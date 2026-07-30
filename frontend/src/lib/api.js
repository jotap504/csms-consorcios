import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://192.168.1.38:3001';

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
