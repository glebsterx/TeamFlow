import React, { useState, useEffect } from 'react';
import Modal from '../components/Modal';
import { showToast } from '../utils/toast';
import { API_URL } from '../constants/taskDisplay';

interface ProjectMember {
  id: number;
  project_id: number;
  telegram_user_id: number;
  role: 'admin' | 'editor' | 'viewer';
  user: {
    id: number;
    display_name: string;
    username: string | null;
  } | null;
}

interface UserOption {
  id: number;
  display_name: string;
  username: string | null;
}

interface ProjectMembersModalProps {
  projectId: number;
  projectName: string;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  admin: '🔹 Админ',
  editor: '✏️ Редактор',
  viewer: '👁 Наблюдатель',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  editor: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-100 text-gray-600',
};

export default function ProjectMembersModal({ projectId, projectName, onClose }: ProjectMembersModalProps) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [selectedRole, setSelectedRole] = useState('viewer');

  useEffect(() => {
    loadMembers();
    loadUsers();
  }, [projectId]);

  const loadMembers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
      }
    } catch {
      showToast('Ошибка загрузки участников', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch {
      // ignore
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId) {
      showToast('Выберите пользователя', 'warning');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_user_id: Number(selectedUserId),
          role: selectedRole,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || 'Ошибка');
      }
      showToast('Участник добавлен', 'success');
      setSelectedUserId('');
      setSelectedRole('viewer');
      await loadMembers();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleUpdateRole = async (userId: number, newRole: string) => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error('Ошибка');
      showToast('Роль обновлена', 'success');
      await loadMembers();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleRemoveMember = async (userId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/members/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Ошибка');
      showToast('Участник удалён', 'success');
      await loadMembers();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const availableUsers = users.filter(
    (u) => !members.some((m) => m.telegram_user_id === u.id)
  );

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">👥 Участники: {projectName}</h2>
      </div>

      {/* Add member */}
      <div className="flex gap-2 mb-4">
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(Number(e.target.value))}
          className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white"
        >
          <option value="">Выберите пользователя...</option>
          {availableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.display_name || u.username || `#${u.id}`}
            </option>
          ))}
        </select>
        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm bg-white"
        >
          <option value="viewer">👁 Наблюдатель</option>
          <option value="editor">✏️ Редактор</option>
          <option value="admin">🔹 Админ</option>
        </select>
        <button
          onClick={handleAddMember}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          + Добавить
        </button>
      </div>

      {/* Members list */}
      {loading ? (
        <p className="text-center text-gray-400 py-4">Загрузка...</p>
      ) : members.length === 0 ? (
        <p className="text-center text-gray-400 py-4 text-sm">Нет участников. Добавьте первого.</p>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.telegram_user_id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {m.user?.display_name || m.user?.username || `#${m.telegram_user_id}`}
                </p>
                {m.user?.username && (
                  <p className="text-xs text-gray-400">@{m.user.username}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={m.role}
                  onChange={(e) => handleUpdateRole(m.telegram_user_id, e.target.value)}
                  className={`px-2 py-1 rounded text-xs font-medium border-0 ${ROLE_COLORS[m.role]}`}
                >
                  <option value="viewer">👁 Наблюдатель</option>
                  <option value="editor">✏️ Редактор</option>
                  <option value="admin">🔹 Админ</option>
                </select>
                <button
                  onClick={() => handleRemoveMember(m.telegram_user_id)}
                  className="text-gray-400 hover:text-red-500 transition p-1"
                  title="Удалить"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
