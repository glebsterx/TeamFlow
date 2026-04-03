import { apiClient } from './client';

export interface TelegramLoginData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface AccountProfile {
  id: number;
  email?: string | null;
  display_name?: string | null;
  first_name: string;
  last_name?: string | null;
  login?: string | null;
  has_password: boolean;
  is_active: boolean;
  id?: number | null;
  telegram_username?: string | null;
  linked_providers: { provider: string; email?: string | null; linked_at?: string | null }[];
  created_at?: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AccountProfile;
}

export interface TelegramAuthResponse {
  access_token: string;
  refresh_token: string;
  user: AccountProfile;
}

export const authApi = {
  // Вход по логину/email и паролю
  login: async (credentials: { login: string; password: string }): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>('/auth/local/login', {
      login: credentials.login,
      password: credentials.password,
    });
    return response.data;
  },

  register: async (data: { login: string; password: string; email?: string }): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>('/auth/local/register', data);
    return response.data;
  },

  refreshToken: (refreshToken: string) =>
    apiClient.post<TokenResponse>('/auth/refresh', { refresh_token: refreshToken }),

  telegramLogin: async (data: TelegramLoginData): Promise<TelegramAuthResponse> => {
    const response = await apiClient.post<TelegramAuthResponse>('/auth/telegram', data);
    return response.data;
  },

  // OAuth провайдеры
  googleLink: (accountId?: number) => `/api/auth/google/link${accountId ? `?account_id=${accountId}` : ''}`,
  yandexLink: (accountId?: number) => `/api/auth/yandex/link${accountId ? `?account_id=${accountId}` : ''}`,
};
