import { apiClient } from './client';
import { Task, TaskCreate, TaskUpdate, TaskStatus, TaskPriority } from '../types/task';

export interface GetTasksParams {
  skip?: number;
  limit?: number;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_id?: string;
  creator_id?: string;
}

export const taskApi = {
  getTasks: (params?: GetTasksParams) => 
    apiClient.get<Task[]>('/tasks', { params }),

  getMyTasks: (status?: TaskStatus) =>
    apiClient.get<Task[]>('/tasks/my', { params: { status } }),

  getTask: (taskId: string) =>
    apiClient.get<Task>(`/tasks/${taskId}`),

  createTask: (task: TaskCreate) =>
    apiClient.post<Task>('/tasks', task),

  updateTask: (taskId: string, task: TaskUpdate) =>
    apiClient.put<Task>(`/tasks/${taskId}`, task),

  patchTask: (taskId: string, task: Partial<TaskUpdate>) =>
    apiClient.patch<Task>(`/tasks/${taskId}`, task),

  deleteTask: (taskId: string) =>
    apiClient.delete(`/tasks/${taskId}`),
};
