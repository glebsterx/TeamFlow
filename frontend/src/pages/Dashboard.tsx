import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8180';

interface Assignee {
  telegram_id: number;
  username: string | null;
  first_name: string;
  display_name: string;
}

interface Task {
  id: number;
  title: string;
  description?: string;
  status: string;
  assignee?: Assignee;
  assignee_name?: string;
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

interface TelegramUser {
  id: number;
  telegram_id: number;
  display_name: string;
  username: string | null;
  first_name: string;
}

const STATUS_COLOR: Record<string, string> = {
  TODO:    'bg-gray-100 text-gray-700 border-gray-300',
  DOING:   'bg-blue-100 text-blue-700 border-blue-300',
  DONE:    'bg-green-100 text-green-700 border-green-300',
  BLOCKED: 'bg-red-100 text-red-700 border-red-300',
};

const STATUS_EMOJI: Record<string, string> = {
  TODO: '📝', DOING: '🔄', DONE: '✅', BLOCKED: '🚫',
};

export default function Dashboard() {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<number | null>(null);

  const { data: tasks = [], isLoading, refetch: refetchTasks } = useQuery<Task[]>({
    queryKey: ['tasks', statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const res = await axios.get(`${API_URL}/api/tasks`, { params });
      return res.data;
    },
    refetchInterval: 5000,
  });

  const { data: stats, refetch: refetchStats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: async () => (await axios.get(`${API_URL}/api/stats`)).data,
    refetchInterval: 5000,
  });

  const { data: users = [] } = useQuery<TelegramUser[]>({
    queryKey: ['users'],
    queryFn: async () => (await axios.get(`${API_URL}/api/users`)).data,
    refetchInterval: 30000,
  });

  // Фильтр по исполнителю на фронтенде
  const filteredTasks = assigneeFilter
    ? tasks.filter(t => t.assignee?.telegram_id === assigneeFilter)
    : tasks;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header */}
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">TeamFlow</h1>
            <p className="text-gray-500 text-sm mt-1">Доска задач команды</p>
          </div>
          <button
            onClick={() => { refetchTasks(); refetchStats(); }}
            className="px-4 py-2 bg-white border rounded-lg text-gray-600 hover:bg-gray-50 transition text-sm"
          >
            🔄 Обновить
          </button>
        </header>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-5 gap-3 mb-6">
            {[
              { label: 'Всего',        value: stats.total,   color: 'bg-white border-gray-200' },
              { label: 'TODO',         value: stats.todo,    color: 'bg-gray-50 border-gray-300' },
              { label: 'В работе',     value: stats.doing,   color: 'bg-blue-50 border-blue-200' },
              { label: 'Выполнено',    value: stats.done,    color: 'bg-green-50 border-green-200' },
              { label: 'Заблокировано',value: stats.blocked, color: 'bg-red-50 border-red-200' },
            ].map((s, i) => (
              <div key={i} className={`${s.color} p-4 rounded-xl border shadow-sm`}>
                <div className="text-2xl font-bold text-gray-900">{s.value}</div>
                <div className="text-gray-500 text-sm mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filters row */}
        <div className="flex flex-wrap gap-2 mb-6">
          {/* Status filters */}
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter(null)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                !statusFilter ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
              }`}
            >Все</button>
            {['TODO', 'DOING', 'DONE', 'BLOCKED'].map(s => (
              <button key={s}
                onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
                }`}
              >{STATUS_EMOJI[s]} {s}</button>
            ))}
          </div>

          {/* Assignee filter */}
          {users.length > 0 && (
            <div className="flex gap-2 ml-4 pl-4 border-l">
              <span className="text-sm text-gray-400 self-center">Исполнитель:</span>
              <button
                onClick={() => setAssigneeFilter(null)}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  !assigneeFilter ? 'bg-gray-700 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
                }`}
              >Все</button>
              {users.map(u => (
                <button key={u.telegram_id}
                  onClick={() => setAssigneeFilter(assigneeFilter === u.telegram_id ? null : u.telegram_id)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition ${
                    assigneeFilter === u.telegram_id ? 'bg-gray-700 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
                  }`}
                >👤 {u.display_name}</button>
              ))}
            </div>
          )}
        </div>

        {/* Tasks grid */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-gray-400">Загрузка...</p>
          </div>
        ) : filteredTasks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTasks.map(task => (
              <div key={task.id} className="bg-white rounded-xl border-2 border-gray-100 p-5 hover:shadow-md transition">
                {/* Task header */}
                <div className="flex justify-between items-start gap-2 mb-3">
                  <span className="text-gray-400 text-xs font-mono">#{task.id}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[task.status]}`}>
                    {STATUS_EMOJI[task.status]} {task.status}
                  </span>
                </div>

                {/* Title */}
                <h3 className="font-semibold text-gray-900 mb-2 leading-snug">{task.title}</h3>

                {/* Description */}
                {task.description && (
                  <p className="text-gray-500 text-sm mb-3 line-clamp-2">{task.description}</p>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-50">
                  {/* Assignee */}
                  {(task.assignee || task.assignee_name) ? (
                    <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full font-medium">
                      👤 {task.assignee?.display_name || task.assignee_name}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300 italic">не назначено</span>
                  )}
                  <span className="text-xs text-gray-400">
                    {new Date(task.created_at).toLocaleDateString('ru')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-xl border">
            <div className="text-5xl mb-3">📋</div>
            <p className="text-gray-400">Задач нет</p>
            <p className="text-gray-300 text-sm mt-1">
              Создайте задачу командой <code className="bg-gray-100 px-1 rounded">/task</code> в Telegram
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="fixed bottom-4 right-4 bg-white px-3 py-1.5 rounded-full shadow border text-xs text-gray-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
          авто-обновление 5 сек
        </div>
      </div>
    </div>
  );
}
