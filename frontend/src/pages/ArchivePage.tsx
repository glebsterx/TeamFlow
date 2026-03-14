import React from 'react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type { Task, Project } from '../types/dashboard';
import { API_URL, STATUS_COLOR, STATUS_EMOJI, STATUS_LABELS } from '../constants/taskDisplay';
import { timeAgo } from '../utils/dateUtils';

interface ArchivePageProps {
  projects: Project[];
}

export default function ArchivePage({ projects }: ArchivePageProps) {
  const queryClient = useQueryClient();

  const { data: archivedTasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['archive'],
    queryFn: async () => (await axios.get(`${API_URL}/api/archive`)).data,
    staleTime: 30000,
  });

  const { data: deletedTasks = [] } = useQuery<Task[]>({
    queryKey: ['deleted'],
    queryFn: async () => (await axios.get(`${API_URL}/api/deleted`)).data,
    staleTime: 30000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['archive'] });
    queryClient.invalidateQueries({ queryKey: ['deleted'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  const unarchiveMutation = useMutation({
    mutationFn: async (taskId: number) => axios.post(`${API_URL}/api/tasks/${taskId}/unarchive`),
    onSuccess: invalidateAll,
  });

  const restoreMutation = useMutation({
    mutationFn: async (taskId: number) => axios.post(`${API_URL}/api/tasks/${taskId}/restore`),
    onSuccess: invalidateAll,
  });

  if (isLoading) return <div className="text-center py-12 text-gray-400">Загрузка...</div>;

  const TaskCard = ({ task, actions }: { task: Task; actions: React.ReactNode }) => {
    const proj = projects.find(p => p.id === task.project_id);
    return (
      <div className="bg-white rounded-lg border border-l-4 border-l-gray-200 p-3 sm:p-4 opacity-80">
        <div className="flex justify-between items-start mb-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400">#{task.id}</span>
            {proj && (
              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                {proj.emoji} {proj.name}
              </span>
            )}
          </div>
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${STATUS_COLOR[task.status]}`}>
            {STATUS_EMOJI[task.status]} <span className="hidden sm:inline">{STATUS_LABELS[task.status]}</span>
          </span>
        </div>
        <h3 className="font-semibold text-sm leading-tight mb-1 text-gray-600">{task.title}</h3>
        <div className="flex justify-between items-center mt-2">
          <div className="text-xs text-gray-400">{timeAgo(task.updated_at)}</div>
          <div className="flex gap-1">{actions}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Архив */}
      <div>
        <h2 className="text-lg sm:text-xl font-bold mb-3">🗄️ Архив ({archivedTasks.length})</h2>
        {archivedTasks.length === 0 ? (
          <div className="text-center py-10 text-gray-400 bg-white rounded-lg border">
            <div className="text-3xl mb-2">🗄️</div>
            <p className="text-sm">Архив пуст</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {archivedTasks.map(task => (
              <TaskCard key={task.id} task={task} actions={
                <button
                  onClick={() => unarchiveMutation.mutate(task.id)}
                  disabled={unarchiveMutation.isPending}
                  className="text-xs px-2 py-1 border rounded text-gray-600 hover:bg-gray-50 transition"
                >↩ Вернуть</button>
              } />
            ))}
          </div>
        )}
      </div>

      {/* Удалённые */}
      <div>
        <h2 className="text-base font-semibold mb-2 text-gray-500">🗑️ Удалённые ({deletedTasks.length})</h2>
        {deletedTasks.length === 0 ? (
          <div className="text-center py-6 text-gray-300 text-sm bg-white rounded-lg border">
            Нет удалённых задач
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {deletedTasks.map(task => (
              <TaskCard key={task.id} task={task} actions={
                <>
                  <button
                    onClick={() => restoreMutation.mutate(task.id)}
                    disabled={restoreMutation.isPending}
                    className="text-xs px-2 py-1 border rounded text-blue-600 hover:bg-blue-50 transition"
                  >↩ Вернуть</button>
                </>
              } />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
