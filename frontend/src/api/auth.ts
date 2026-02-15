import { apiClient } from './client';
import { User, LoginRequest, RegisterRequest, TokenResponse } from '../types/user';

export const authApi = {
  login: async (credentials: LoginRequest): Promise<TokenResponse> => {
    // FastAPI OAuth2 expects form data
    const formData = new FormData();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);

    const response = await apiClient.post<TokenResponse>('/auth/login', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  register: (data: RegisterRequest) =>
    apiClient.post<User>('/auth/register', data),

  getCurrentUser: () =>
    apiClient.get<User>('/auth/me'),

  refreshToken: (refreshToken: string) =>
    apiClient.post<TokenResponse>('/auth/refresh', { refresh_token: refreshToken }),
};
