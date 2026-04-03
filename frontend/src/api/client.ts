import axios from 'axios';
import { showToast } from '../utils/toast';

const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Track connection state
let isOffline = false;
let offlineToastShown = false;

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => {
    // Connection restored
    if (isOffline) {
      isOffline = false;
      offlineToastShown = false;
      showToast('Соединение восстановлено', 'success');
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Network error or 502 (server restarting)
    if (!error.response || error.response?.status === 502) {
      if (!offlineToastShown) {
        isOffline = true;
        offlineToastShown = true;
        showToast('Нет соединения с сервером', 'error');
        
        // Auto-retry after 3 seconds
        setTimeout(() => {
          isOffline = false;
          offlineToastShown = false;
        }, 3000);
      }
      return Promise.reject(error);
    }

    // If error is 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_URL}/api/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const { access_token, refresh_token } = response.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
