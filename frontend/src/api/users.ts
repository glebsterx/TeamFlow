import { apiClient } from './client';
import { User } from '../types/user';

export const userApi = {
  getUsers: (skip = 0, limit = 100) =>
    apiClient.get<User[]>('/users', { params: { skip, limit } }),

  getUser: (userId: string) =>
    apiClient.get<User>(`/users/${userId}`),
};
