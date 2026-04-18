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

    // Handle all HTTP errors with detail
    if (error.response?.status >= 400) {
      const data = error.response?.data;
      let toastMsg = null;
      
      // Try to get message
      if (data?.detail) {
        toastMsg = data.detail;
      } else if (data?.error) {
        toastMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
      } else if (typeof data === 'string') {
        toastMsg = data;
      }
      
      // Show toast
      if (toastMsg) {
        console.log('Showing toast:', toastMsg);
        showToast(toastMsg.slice(0, 200), 'error');
      }
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
