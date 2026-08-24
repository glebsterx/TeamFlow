import React from 'react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '../../constants/taskDisplay';
import { showToast } from '../../utils/toast';

// ========== USER MANAGEMENT COMPONENT ==========
interface ManagedUser {
  id: number;
  display_name: string;
  username: string | null;
  email: string | null;
  
  is_active: boolean;
  system_role: string;
  created_at: string | null;
}

function UsersSection() {
  const queryClient = useQueryClient();
  const [myAccountId] = React.useState<number | null>(() => {
    const saved = localStorage.getItem('teamflow_account_id');
    return saved ? Number(saved) : null;
  });
  const [mySystemRole, setMySystemRole] = React.useState<string | null>(null);

  // Load my role
  React.useEffect(() => {
    if (!myAccountId) return;
    axios.get(`${API_URL}/api/auth/account/me`, { params: { account_id: myAccountId } })
      .then(res => setMySystemRole(res.data.system_role || 'user'))
      .catch(() => {});
  }, [myAccountId]);

  const { data: users = [], isLoading } = useQuery<ManagedUser[]>({
    queryKey: ['managed-users', myAccountId],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/api/auth/users/manage`, {
        params: { account_id: myAccountId },
      });
      return res.data;
    },
    enabled: !!myAccountId && mySystemRole === 'admin',
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      await axios.patch(`${API_URL}/api/auth/users/${userId}/role`, { system_role: role }, {
        params: { account_id: myAccountId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-users'] });
      showToast('Роль обновлена', 'success');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Ошибка', 'error');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (userId: number) => {
      await axios.delete(`${API_URL}/api/auth/users/${userId}`, {
        params: { account_id: myAccountId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-users'] });
      showToast('Пользователь деактивирован', 'success');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Ошибка', 'error');
    },
  });

  if (mySystemRole !== 'admin') {
    return (
      <section className="bg-white border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">👥 Пользователи</h3>
        <div className="text-center py-8 text-gray-400">
          <p>Только администратор системы может управлять пользователями</p>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="bg-white border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">👥 Пользователи</h3>
        <div className="text-center py-8 text-gray-400">Загрузка...</div>
      </section>
    );
  }

  return (
    <section className="bg-white border rounded-xl p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">👥 Пользователи ({users.length})</h3>
      <div className="space-y-3">
        {users.map(user => (
          <div key={user.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-gray-50 border rounded-lg">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold shrink-0">
                {user.display_name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <span className="font-medium text-gray-800 truncate block">{user.display_name}</span>
                <div className="text-xs text-gray-500">
                  {user.username && `@${user.username}`}
                  {user.email && ` · ${user.email}`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:ml-auto">
              <select
                value={user.system_role}
                onChange={(e) => updateRoleMutation.mutate({ userId: user.id, role: e.target.value })}
                disabled={user.id === myAccountId}
                className="text-xs px-2 py-1.5 border rounded-lg bg-white"
              >
                <option value="admin">🔹 Администратор</option>
                <option value="user">👤 Пользователь</option>
              </select>
              {user.id !== myAccountId ? (
                <button
                  onClick={() => {
                    if (confirm(`Деактивировать ${user.display_name}?`)) {
                      deactivateMutation.mutate(user.id);
                    }
                  }}
                  className="text-xs px-2 py-1.5 text-red-500 hover:text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
                  title="Деактивировать"
                >🚫</button>
              ) : (
                <button
                  disabled
                  className="text-xs px-2 py-1.5 text-gray-300 border border-gray-200 rounded-lg cursor-not-allowed"
                  title="Нельзя деактивировать себя"
                >🚫</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default UsersSection;
