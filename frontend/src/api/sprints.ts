import axios from 'axios';
import { API_URL } from '../constants/taskDisplay';

export interface SprintTask {
  id: number;
  sprint_id: number;
  task_id: number;
  position: number;
  created_at: string;
  task_title: string;
  task_status: string;
  task_priority: string;
}

export interface Sprint {
  id: number;
  name: string;
  description?: string;
  project_id?: number;
  project_name?: string;
  status: 'planned' | 'active' | 'completed' | 'archived';
  position: number;
  start_date: string;
  end_date: string;
  created_at: string;
  tasks: SprintTask[];
}

export interface SprintCreateRequest {
  name: string;
  description?: string;
  project_id?: number;
  start_date: string;
  end_date: string;
}

export interface SprintUpdateRequest {
  name?: string;
  description?: string;
  project_id?: number;
  start_date?: string;
  end_date?: string;
  status?: string;
  position?: number;
}

export interface SprintTaskAddRequest {
  task_id: number;
  position?: number;
}

export const sprintsApi = {
  // Get all sprints
  getAll: async (): Promise<Sprint[]> => {
    const response = await axios.get(`${API_URL}/api/sprints`);
    return response.data;
  },

  // Get single sprint
  getById: async (sprintId: number): Promise<Sprint> => {
    const response = await axios.get(`${API_URL}/api/sprints/${sprintId}`);
    return response.data;
  },

  // Create sprint
  create: async (data: SprintCreateRequest): Promise<Sprint> => {
    const response = await axios.post(`${API_URL}/api/sprints`, data);
    return response.data;
  },

  // Update sprint
  update: async (sprintId: number, data: SprintUpdateRequest): Promise<Sprint> => {
    const response = await axios.patch(`${API_URL}/api/sprints/${sprintId}`, data);
    return response.data;
  },

  // Delete sprint
  delete: async (sprintId: number): Promise<void> => {
    await axios.delete(`${API_URL}/api/sprints/${sprintId}`);
  },

  // Archive sprint (set status=archived)
  archive: async (sprintId: number): Promise<Sprint> => {
    return sprintsApi.updateStatus(sprintId, 'archived');
  },

  // Update sprint status
  updateStatus: async (sprintId: number, status: string): Promise<Sprint> => {
    const response = await axios.patch(`${API_URL}/api/sprints/${sprintId}/status`, { status });
    return response.data;
  },

  // Reorder sprints
  reorder: async (sprintIds: number[]): Promise<void> => {
    await axios.patch(`${API_URL}/api/sprints/reorder`, { sprint_ids: sprintIds });
  },

  // Reorder tasks in sprint
  reorderTasks: async (sprintId: number, taskIds: number[]): Promise<void> => {
    await axios.patch(`${API_URL}/api/sprints/${sprintId}/tasks/reorder`, { task_ids: taskIds });
  },

  // Restore deleted sprint
  restore: async (sprintId: number): Promise<void> => {
    await axios.post(`${API_URL}/api/sprints/${sprintId}/restore`);
  },

  // Add task to sprint
  addTask: async (sprintId: number, data: SprintTaskAddRequest): Promise<SprintTask> => {
    const response = await axios.post(`${API_URL}/api/sprints/${sprintId}/tasks`, data);
    return response.data;
  },

  // Remove task from sprint
  removeTask: async (sprintId: number, taskId: number): Promise<void> => {
    await axios.delete(`${API_URL}/api/sprints/${sprintId}/tasks/${taskId}`);
  },

  // Get sprint tasks
  getTasks: async (sprintId: number): Promise<SprintTask[]> => {
    const response = await axios.get(`${API_URL}/api/sprints/${sprintId}/tasks`);
    return response.data;
  },
};
