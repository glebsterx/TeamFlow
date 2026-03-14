import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../constants/taskDisplay';
import { sprintsApi, Sprint, SprintCreateRequest, SprintUpdateRequest } from '../api/sprints';
import { showToast } from '../utils/toast';

interface SprintModalProps {
  sprint: Sprint | null;
  onClose: () => void;
}

interface Project {
  id: number;
  name: string;
  emoji?: string;
}

interface Task {
  id: number;
  title: string;
  status: string;
  project_id?: number;
}

export default function SprintModal({ sprint, onClose }: SprintModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<number | undefined>(undefined);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<number | undefined>(undefined);

  // Load projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/api/projects`);
      return response.data;
    },
  });

  // Load available tasks (not in sprint yet)
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/api/tasks`);
      return response.data;
    },
    enabled: !!sprint,
  });

  useEffect(() => {
    if (sprint) {
      setName(sprint.name);
      setDescription(sprint.description || '');
      setProjectId(sprint.project_id);
      setStartDate(sprint.start_date.split('T')[0]);
      setEndDate(sprint.end_date.split('T')[0]);
    }
  }, [sprint]);

  const createMutation = useMutation({
    mutationFn: async (data: SprintCreateRequest) => {
      return await sprintsApi.create(data);
    },
    onSuccess: () => {
      showToast('Спринт создан', 'success');
      onClose();
    },
    onError: () => {
      showToast('Ошибка при создании', 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: SprintUpdateRequest }) => {
      return await sprintsApi.update(id, data);
    },
    onSuccess: () => {
      showToast('Спринт обновлён', 'success');
      onClose();
    },
    onError: () => {
      showToast('Ошибка при обновлении', 'error');
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: async ({ sprintId, taskId }: { sprintId: number; taskId: number }) => {
      return await sprintsApi.addTask(sprintId, { task_id: taskId });
    },
    onSuccess: () => {
      showToast('Задача добавлена в спринт', 'success');
      setSelectedTaskId(undefined);
      onClose(); // Refresh parent
    },
    onError: () => {
      showToast('Ошибка при добавлении задачи', 'error');
    },
  });

  const removeTaskMutation = useMutation({
    mutationFn: async ({ sprintId, taskId }: { sprintId: number; taskId: number }) => {
      return await sprintsApi.removeTask(sprintId, taskId);
    },
    onSuccess: () => {
      showToast('Задача удалена из спринта', 'success');
      onClose(); // Refresh parent
    },
    onError: () => {
      showToast('Ошибка при удалении задачи', 'error');
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      showToast('Введите название спринта', 'warning');
      return;
    }

    if (!startDate || !endDate) {
      showToast('Укажите даты начала и окончания', 'warning');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      showToast('Дата начала должна быть раньше даты окончания', 'warning');
      return;
    }

    const data: SprintCreateRequest | SprintUpdateRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      project_id: projectId,
      start_date: new Date(startDate).toISOString(),
      end_date: new Date(endDate).toISOString(),
    };

    if (sprint) {
      updateMutation.mutate({ id: sprint.id, data: data as SprintUpdateRequest });
    } else {
      createMutation.mutate(data as SprintCreateRequest);
    }
  };

  const handleAddTask = () => {
    if (!sprint || !selectedTaskId) return;
    addTaskMutation.mutate({ sprintId: sprint.id, taskId: selectedTaskId });
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      TODO: 'bg-gray-100 text-gray-700',
      DOING: 'bg-blue-100 text-blue-700',
      DONE: 'bg-green-100 text-green-700',
      BLOCKED: 'bg-red-100 text-red-700',
      ON_HOLD: 'bg-yellow-100 text-yellow-700',
    };
    return badges[status] || badges.TODO;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      TODO: 'Нужно',
      DOING: 'В работе',
      DONE: 'Готово',
      BLOCKED: 'Заблокировано',
      ON_HOLD: 'Отложено',
    };
    return labels[status] || status;
  };

  // Check if all tasks are done
  const allTasksDone = sprint && sprint.tasks && sprint.tasks.length > 0 && 
    sprint.tasks.every(t => t.task_status === 'DONE');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 my-8">
        <h2 className="text-xl font-bold mb-4">
          {sprint ? 'Редактировать спринт' : 'Новый спринт'}
        </h2>

        <div className="space-y-4 mb-6">
          <div>
            <label className="text-sm text-gray-600 block mb-1">Название *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Спринт 1"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm text-gray-600 block mb-1">Проект</label>
            <select
              value={projectId || ''}
              onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Без проекта —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji || '📁'} {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-600 block mb-1">Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Цели спринта..."
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-600 block mb-1">Начало *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Окончание *</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Tasks in sprint */}
          {sprint && sprint.tasks && sprint.tasks.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-600">Задачи в спринте</label>
                {allTasksDone && (
                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                    ✅ Все задачи завершены
                  </span>
                )}
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                {sprint.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium">{task.task_title}</div>
                      <div className="text-xs text-gray-500">
                        <span className={`px-1.5 py-0.5 rounded ${getStatusBadge(task.task_status)}`}>
                          {getStatusLabel(task.task_status)}
                        </span>
                        <span className="ml-2">{task.task_priority}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeTaskMutation.mutate({ sprintId: sprint.id, taskId: task.task_id })}
                      className="text-red-500 hover:text-red-700 p-1"
                      title="Удалить из спринта"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              {allTasksDone && sprint.is_active && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-sm text-green-800 font-medium mb-2">
                    🎉 Все задачи в спринте завершены!
                  </div>
                  <button
                    onClick={() => {
                      updateMutation.mutate({ id: sprint.id, data: { is_active: false } });
                    }}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                  >
                    Завершить спринт
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Add task to sprint */}
          {sprint && (
            <div>
              <label className="text-sm text-gray-600 block mb-2">Добавить задачу в спринт</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={selectedTaskId || ''}
                  onChange={(e) => setSelectedTaskId(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full sm:flex-1 px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Выберите задачу —</option>
                  {tasks
                    .filter((t) => !sprint.tasks?.some((st) => st.task_id === t.id))
                    .map((task) => (
                      <option key={task.id} value={task.id}>
                        #{task.id} {task.title}
                      </option>
                    ))}
                </select>
                <button
                  onClick={handleAddTask}
                  disabled={!selectedTaskId || addTaskMutation.isPending}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                >
                  + Добавить
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending || updateMutation.isPending}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {sprint ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}
