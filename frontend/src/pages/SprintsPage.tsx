import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sprintsApi, Sprint } from '../api/sprints';
import { showToast } from '../utils/toast';
import SprintModal from '../modals/SprintModal';

export default function SprintsPage() {
  const [showModal, setShowModal] = useState(false);
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);
  const queryClient = useQueryClient();

  const { data: sprints = [], isLoading } = useQuery<Sprint[]>({
    queryKey: ['sprints'],
    queryFn: sprintsApi.getAll,
  });

  const archiveMutation = useMutation({
    mutationFn: async (sprintId: number) => {
      await sprintsApi.archive(sprintId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
      showToast('Спринт заархивирован', 'success');
    },
    onError: () => {
      showToast('Ошибка при архивации', 'error');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (sprintId: number) => {
      await sprintsApi.restore(sprintId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
      showToast('Спринт восстановлен', 'success');
    },
    onError: () => {
      showToast('Ошибка при восстановлении', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (sprintId: number) => {
      await sprintsApi.delete(sprintId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
      showToast('Спринт удалён', 'success');
    },
    onError: () => {
      showToast('Ошибка при удалении', 'error');
    },
  });

  const activeSprints = sprints.filter(s => s.is_active);
  const archivedSprints = sprints.filter(s => !s.is_active);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
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

  const allSprintTasksDone = (sprint: Sprint) => {
    return sprint.tasks && sprint.tasks.length > 0 && 
      sprint.tasks.every(t => t.task_status === 'DONE');
  };

  if (isLoading) {
    return (
      <div className="p-4 max-w-6xl mx-auto">
        <div className="text-center py-12 text-gray-400">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🏃 Спринты</h1>
        <button
          onClick={() => {
            setEditingSprint(null);
            setShowModal(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Спринт
        </button>
      </div>

      {/* Active Sprints */}
      {activeSprints.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-gray-700">Активные спринты</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {activeSprints.map(sprint => (
              <div
                key={sprint.id}
                className="bg-white border border-blue-200 rounded-lg p-4 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">{sprint.name}</h3>
                    {sprint.project_name && (
                      <div className="text-xs text-gray-500 mt-1">
                        📁 {sprint.project_name}
                      </div>
                    )}
                  </div>
                  {allSprintTasksDone(sprint) ? (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                      ✅ Все задачи завершены
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                      Активен
                    </span>
                  )}
                </div>
                {sprint.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{sprint.description}</p>
                )}
                <div className="text-xs text-gray-500 mb-3">
                  <div>📅 {formatDate(sprint.start_date)} — {formatDate(sprint.end_date)}</div>
                  <div>📋 Задач: {sprint.tasks?.length || 0}</div>
                </div>
                
                {/* Tasks in sprint */}
                {sprint.tasks && sprint.tasks.length > 0 && (
                  <div className="mb-3 border-t pt-2">
                    <div className="text-xs text-gray-500 mb-1">Задачи:</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {sprint.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between text-xs bg-gray-50 px-2 py-1 rounded"
                        >
                          <span className="flex-1 truncate">{task.task_title}</span>
                          <span className={`px-1.5 py-0.5 rounded ${getStatusBadge(task.task_status)}`}>
                            {getStatusLabel(task.task_status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingSprint(sprint);
                      setShowModal(true);
                    }}
                    className="flex-1 px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100"
                  >
                    ✏️ Редактировать
                  </button>
                  <button
                    onClick={() => archiveMutation.mutate(sprint.id)}
                    className="flex-1 px-3 py-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100"
                  >
                    🗄️ Архив
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Archived Sprints */}
      {archivedSprints.length > 0 && (
        <details className="mb-8">
          <summary className="text-lg font-semibold text-gray-500 cursor-pointer hover:text-gray-700 mb-3">
            📦 Архив спринтов ({archivedSprints.length})
          </summary>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
            {archivedSprints.map(sprint => (
              <div
                key={sprint.id}
                className="bg-gray-50 border border-gray-200 rounded-lg p-4 opacity-75"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-lg text-gray-600">{sprint.name}</h3>
                  <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full">
                    Архив
                  </span>
                </div>
                <div className="text-xs text-gray-500 mb-3">
                  <div>📅 {formatDate(sprint.start_date)} — {formatDate(sprint.end_date)}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => restoreMutation.mutate(sprint.id)}
                    className="flex-1 px-3 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100"
                  >
                    ↩️ Восстановить
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(sprint.id)}
                    className="flex-1 px-3 py-1.5 text-xs bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100"
                  >
                    🗑️ Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {activeSprints.length === 0 && archivedSprints.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">🏃</div>
          <p>Спринтов ещё нет</p>
          <p className="text-sm">Создайте первый спринт для планирования задач</p>
        </div>
      )}

      {showModal && (
        <SprintModal
          sprint={editingSprint}
          onClose={() => {
            setShowModal(false);
            setEditingSprint(null);
            queryClient.invalidateQueries({ queryKey: ['sprints'] });
          }}
        />
      )}
    </div>
  );
}
