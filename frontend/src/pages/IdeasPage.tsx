import { useState } from 'react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type { Task, Project } from '../types/dashboard';
import { API_URL } from '../constants/taskDisplay';
import { timeAgo } from '../utils/dateUtils';
import { showToast } from '../utils/toast';
import Modal from '../components/Modal';

interface KnowledgeItem {
  id: number;
  title: string;
  description: string | null;
  project_id: number | null;
  is_idea: boolean;
  created_at: string | null;
  updated_at: string | null;
}

interface IdeasPageProps {
  tasks: Task[];
  projects: Project[];
}

export default function IdeasPage({ tasks, projects }: IdeasPageProps) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['knowledge'] });

  const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [showNewIdea, setShowNewIdea] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const { data: ideas = [], isLoading } = useQuery<KnowledgeItem[]>({
    queryKey: ['knowledge'],
    queryFn: async () => (await axios.get(`${API_URL}/api/knowledge`)).data,
  });

  const createMutation = useMutation({
    mutationFn: async ({ title, description }: { title: string; description?: string }) => {
      await axios.post(`${API_URL}/api/tasks`, { title, description, is_idea: true });
    },
    onSuccess: () => {
      invalidate();
      setShowNewIdea(false);
      setNewTitle('');
      setNewDescription('');
      showToast('Идея добавлена', 'success');
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, title, description }: { id: number; title: string; description?: string }) => {
      await axios.patch(`${API_URL}/api/tasks/${id}`, { title, description });
    },
    onSuccess: () => {
      invalidate();
      setEditingItem(null);
      showToast('Сохранено', 'success');
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await axios.delete(`${API_URL}/api/tasks/${id}`);
    },
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
      showToast('Удалено', 'success');
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка', 'error'),
  });

  const convertToTaskMutation = useMutation({
    mutationFn: async (id: number) => {
      await axios.post(`${API_URL}/api/tasks/${id}/convert-to-task`);
    },
    onSuccess: () => {
      invalidate();
      showToast('Конвертировано в задачу', 'success');
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка', 'error'),
  });

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    createMutation.mutate({ title: newTitle.trim(), description: newDescription.trim() || undefined });
  };

  const handleUpdate = () => {
    if (!editingItem || !editingItem.title.trim()) return;
    updateMutation.mutate({ id: editingItem.id, title: editingItem.title.trim(), description: editingItem.description || undefined });
  };

  const getProject = (projectId: number | null) => projects.find(p => p.id === projectId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">💡 Идеи</h2>
        <button
          onClick={() => setShowNewIdea(true)}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium"
        >
          + Новая идея
        </button>
      </div>

      {isLoading && <p className="text-sm text-gray-400">Загрузка...</p>}

      {!isLoading && ideas.length === 0 && (
        <div className="bg-white border rounded-xl p-8 text-center">
          <p className="text-gray-400 mb-4">Пока нет идей</p>
          <p className="text-sm text-gray-500">Добавьте первую идею для команды</p>
        </div>
      )}

      <div className="space-y-2">
        {ideas.map((idea) => {
          const proj = getProject(idea.project_id);
          return (
            <div key={idea.id} className="bg-white border rounded-lg p-4 hover:border-gray-300 transition">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium">{idea.title}</h3>
                  {idea.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{idea.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    {proj && <span>{proj.emoji} {proj.name}</span>}
                    {idea.updated_at && <span>· {timeAgo(idea.updated_at)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => convertToTaskMutation.mutate(idea.id)}
                    className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100"
                    title="Конвертировать в задачу"
                  >
                    → Задача
                  </button>
                  <button
                    onClick={() => setEditingItem(idea)}
                    className="text-xs px-2 py-1 bg-gray-50 text-gray-600 border border-gray-200 rounded hover:bg-gray-100"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setConfirmDelete(idea.id)}
                    className="text-xs px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showNewIdea && (
        <Modal onClose={() => setShowNewIdea(false)}>
          <h2 className="text-lg font-bold mb-4">Новая идея</h2>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Название идеи"
            className="w-full border rounded-lg px-3 py-2 mb-3"
            autoFocus
          />
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Описание (необязательно)"
            className="w-full border rounded-lg px-3 py-2 mb-4 h-24"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowNewIdea(false)} className="px-3 py-2 text-gray-500">Отмена</button>
            <button
              onClick={handleCreate}
              disabled={!newTitle.trim() || createMutation.isPending}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              {createMutation.isPending ? '...' : 'Добавить'}
            </button>
          </div>
        </Modal>
      )}

      {editingItem && (
        <Modal onClose={() => setEditingItem(null)}>
          <h2 className="text-lg font-bold mb-4">Редактировать идею</h2>
          <input
            type="text"
            value={editingItem.title}
            onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 mb-3"
          />
          <textarea
            value={editingItem.description || ''}
            onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 mb-4 h-24"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditingItem(null)} className="px-3 py-2 text-gray-500">Отмена</button>
            <button
              onClick={handleUpdate}
              disabled={!editingItem.title.trim() || updateMutation.isPending}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              {updateMutation.isPending ? '...' : 'Сохранить'}
            </button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <h2 className="text-lg font-bold mb-4">Удалить идею?</h2>
          <p className="text-gray-500 mb-4">Это действие необратимо.</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmDelete(null)} className="px-3 py-2 text-gray-500">Отмена</button>
            <button
              onClick={() => deleteMutation.mutate(confirmDelete)}
              disabled={deleteMutation.isPending}
              className="px-3 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50"
            >
              {deleteMutation.isPending ? '...' : 'Удалить'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}