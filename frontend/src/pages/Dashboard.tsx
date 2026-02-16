import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8180';

interface Task {
  id: number;
  title: string;
  description?: string;
  assignee_name?: string;
  status: string;
  due_date?: string;
  created_at: string;
}

interface Stats {
  total: number;
  todo: number;
  doing: number;
  done: number;
  blocked: number;
}

const Dashboard: React.FC = () => {
  const [filter, setFilter] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoading(true);

    try {
      const res = await axios.post(`${API_URL}/api/auth/login`, { password });
      localStorage.setItem('token', res.data.access_token);
      setToken(res.data.access_token);
    } catch (err: any) {
      setLoginError(err.response?.data?.detail || 'Неверный пароль');
    } finally {
      setIsLoading(false);
    }
  };

  const { data: tasks, isLoading: tasksLoading, refetch: refetchTasks } = useQuery<Task[]>({
    queryKey: ['tasks', filter],
    queryFn: async () => {
      if (!token) return [];
      const params = filter ? { status: filter } : {};
      const res = await axios.get(`${API_URL}/api/tasks`, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data;
    },
    enabled: !!token,
    refetchInterval: 5000,
  });

  const { data: stats, refetch: refetchStats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: async () => {
      if (!token) return null;
      const res = await axios.get(`${API_URL}/api/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data;
    },
    enabled: !!token,
    refetchInterval: 5000,
  });

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">📋</div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">TeamFlow</h1>
            <p className="text-gray-600">Управление задачами команды</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Введите пароль"
                required
                autoFocus
              />
              {loginError && (
                <p className="mt-2 text-sm text-red-600">{loginError}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Вход...' : 'Войти'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 font-medium mb-2">
                💡 По умолчанию пароль: <code className="bg-blue-100 px-2 py-1 rounded">teamflow</code>
              </p>
              <p className="text-xs text-blue-600">
                Измените его в настройках после первого входа
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    TODO: 'bg-gray-100 text-gray-800 border-gray-300',
    DOING: 'bg-blue-100 text-blue-800 border-blue-300',
    DONE: 'bg-green-100 text-green-800 border-green-300',
    BLOCKED: 'bg-red-100 text-red-800 border-red-300',
  };

  const statusEmoji: Record<string, string> = {
    TODO: '📝',
    DOING: '🔄',
    DONE: '✅',
    BLOCKED: '🚫',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">TeamFlow</h1>
            <p className="text-gray-600">Доска задач команды</p>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('token');
              setToken(null);
            }}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition"
          >
            Выйти
          </button>
        </header>

        {stats && (
          <div className="grid grid-cols-5 gap-4 mb-8">
            {[
              { label: 'Всего', value: stats.total, bg: 'bg-white', border: 'border-gray-200' },
              { label: 'TODO', value: stats.todo, bg: 'bg-gray-50', border: 'border-gray-300' },
              { label: 'В работе', value: stats.doing, bg: 'bg-blue-50', border: 'border-blue-200' },
              { label: 'Выполнено', value: stats.done, bg: 'bg-green-50', border: 'border-green-200' },
              { label: 'Заблокировано', value: stats.blocked, bg: 'bg-red-50', border: 'border-red-200' },
            ].map((stat, i) => (
              <div key={i} className={`${stat.bg} p-6 rounded-xl shadow-sm border ${stat.border}`}>
                <div className="text-3xl font-bold text-gray-900">{stat.value}</div>
                <div className="text-gray-600 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setFilter(null)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              !filter ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-gray-50 border'
            }`}
          >
            Все
          </button>
          {['TODO', 'DOING', 'DONE', 'BLOCKED'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                filter === status ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-gray-50 border'
              }`}
            >
              {statusEmoji[status]} {status}
            </button>
          ))}
        </div>

        {tasksLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-500">Загрузка задач...</p>
          </div>
        ) : tasks && tasks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.map((task) => (
              <div key={task.id} className="bg-white p-6 rounded-xl shadow-sm border-2 hover:shadow-md transition">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-semibold text-lg text-gray-900">
                    #{task.id} {task.title}
                  </h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border-2 ${statusColors[task.status]}`}>
                    {statusEmoji[task.status]} {task.status}
                  </span>
                </div>
                {task.description && (
                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">{task.description}</p>
                )}
                <div className="flex items-center justify-between text-sm">
                  {task.assignee_name && (
                    <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">
                      👤 {task.assignee_name}
                    </span>
                  )}
                  <span className="text-gray-500">
                    {new Date(task.created_at).toLocaleDateString('ru')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-xl shadow-sm">
            <div className="text-6xl mb-4">📋</div>
            <p className="text-gray-500 text-lg mb-2">Задач пока нет</p>
            <p className="text-gray-400 text-sm mb-4">
              Создайте первую задачу через Telegram бот командой <code className="bg-gray-100 px-2 py-1 rounded">/task</code>
            </p>
            <button
              onClick={() => { refetchTasks(); refetchStats(); }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              🔄 Обновить
            </button>
          </div>
        )}

        <div className="fixed bottom-4 right-4 bg-white px-4 py-2 rounded-lg shadow-lg border">
          <p className="text-xs text-gray-500 flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Автообновление каждые 5 сек
          </p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
