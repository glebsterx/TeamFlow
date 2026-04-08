import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../constants/taskDisplay';
import { parseUTC, formatTime, formatDueDate } from '../utils/dateUtils';

interface DigestPageProps {
  onOpenTask?: (task: any) => void;
}

export default function DigestPage({ onOpenTask }: DigestPageProps) {
  const [timePeriod, setTimePeriod] = useState<'week' | 'month' | 'quarter'>('month');
  const [showTimeTasks, setShowTimeTasks] = useState(false);
  
  const { data, isLoading, dataUpdatedAt } = useQuery<any>({
    queryKey: ['digest'],
    queryFn: async () => (await axios.get(`${API_URL}/api/digest`)).data,
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: () => axios.get(`${API_URL}/api/tasks?limit=1000`).then(r => r.data),
  });

  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => axios.get(`${API_URL}/api/projects`).then(r => r.data),
  });

  const getPeriodStart = () => {
    const now = new Date();
    if (timePeriod === 'week') return new Date(now.setDate(now.getDate() - 7));
    if (timePeriod === 'month') return new Date(now.setMonth(now.getMonth() - 1));
    return new Date(now.setMonth(now.getMonth() - 3));
  };

  const timeTasks = tasks.filter((t: any) => 
    t.time_spent > 0
  );

  const projectStats: Record<number, { name: string; emoji: string; total: number; count: number }> = {};
  timeTasks.forEach((t: any) => {
    const pid = t.project_id;
    if (!projectStats[pid]) {
      const proj = allProjects.find((p: any) => p.id === pid);
      projectStats[pid] = { name: proj?.name || `Проект ${pid}`, emoji: proj?.emoji || '📁', total: 0, count: 0 };
    }
    projectStats[pid].total += t.time_spent;
    projectStats[pid].count += 1;
  });

  const totalTime = Object.values(projectStats).reduce((s, ps) => s + ps.total, 0);
  const totalTimeCount = Object.values(projectStats).reduce((s, ps) => s + ps.count, 0);

  if (isLoading) return <div className="text-center py-12 text-gray-400">Загрузка...</div>;
  if (!data) return null;

  const { stats, projects, top_performers, overdue_tasks = [], due_soon_tasks = [], subtask_progress = [], comment_activity, sprint_progress = [] } = data;
  const total = stats.total || 1;
  const activeTotal = stats.active || 1;
  const maxCompleted = top_performers.length > 0
    ? Math.max(...top_performers.map((p: any) => p.completed), 1)
    : 1;

  const statusBars = [
    { label: 'TODO', value: stats.todo, color: 'bg-gray-400', text: 'text-gray-700' },
    { label: 'В работе', value: stats.doing, color: 'bg-blue-500', text: 'text-blue-700' },
    { label: 'Блок', value: stats.blocked, color: 'bg-red-500', text: 'text-red-700' },
    ...(stats.on_hold > 0 ? [{ label: 'На паузе', value: stats.on_hold, color: 'bg-yellow-400', text: 'text-yellow-700' }] : []),
    { label: 'Готово', value: stats.done, color: 'bg-green-500', text: 'text-green-700' },
  ];

  const priorityBars = stats.priority ? [
    { label: 'Срочно', value: stats.priority.urgent, color: 'bg-red-500', text: 'text-red-700', dot: '🔴' },
    { label: 'Высокий', value: stats.priority.high, color: 'bg-orange-400', text: 'text-orange-700', dot: '🟠' },
    { label: 'Обычный', value: stats.priority.normal, color: 'bg-yellow-400', text: 'text-yellow-700', dot: '🟡' },
    { label: 'Низкий', value: stats.priority.low, color: 'bg-gray-300', text: 'text-gray-500', dot: '⚪' },
  ] : [];

  function fmtDays(days: number | null | undefined): string {
    if (days == null) return '—';
    if (days < 1) return '< 1 дн.';
    return `${days} дн.`;
  }

  const updatedStr = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg sm:text-xl font-bold">📊 Дайджест</h2>
        {updatedStr && <span className="text-xs text-gray-400">Обновлено {updatedStr}</span>}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {statusBars.map(s => (
          <div key={s.label} className="bg-white rounded-lg border p-3">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className={`text-xs font-medium ${s.text}`}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Overdue task list */}
      {overdue_tasks.length > 0 && (
        <div className="w-full bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-2 text-red-700">🔥 Просроченные задачи ({overdue_tasks.length})</h3>
          <div className="space-y-1">
            {overdue_tasks.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between text-xs">
                <span className="flex-1 truncate text-gray-700">{t.title}</span>
                <span className="ml-2 text-red-500 shrink-0">{formatDueDate(t.due_date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Due soon task list */}
      {due_soon_tasks.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-2 text-orange-700">⏰ Дедлайн на этой неделе ({due_soon_tasks.length})</h3>
          <div className="space-y-1">
            {due_soon_tasks.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between text-xs">
                <span className="flex-1 truncate text-gray-700">{t.title}</span>
                <span className="ml-2 text-orange-500 shrink-0">{formatDueDate(t.due_date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status bar chart */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold mb-3 text-gray-700">Распределение по статусам</h3>
        <div className="space-y-2">
          {statusBars.map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <div className="w-16 text-xs text-gray-500 text-right shrink-0">{s.label}</div>
              <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${s.color}`}
                  style={{ width: `${Math.round(s.value / total * 100)}%` }}
                />
              </div>
              <div className="w-8 text-xs text-gray-500 shrink-0">{s.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-right text-xs text-gray-400">Всего задач: {stats.total}</div>
      </div>

      {/* Priority breakdown (#85) */}
      {priorityBars.length > 0 && stats.active > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-3 text-gray-700">Приоритеты активных задач <span className="text-gray-400 font-normal">({stats.active})</span></h3>
          <div className="space-y-2">
            {priorityBars.map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <div className="text-xs text-gray-500 text-right shrink-0 whitespace-nowrap w-20">{s.dot} {s.label}</div>
                <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${s.color}`}
                    style={{ width: `${Math.round(s.value / activeTotal * 100)}%` }}
                  />
                </div>
                <div className="w-8 text-xs text-gray-500 shrink-0">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subtask progress (#89) */}
      {subtask_progress.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-3 text-gray-700">Прогресс подзадач</h3>
          <div className="space-y-2">
            {subtask_progress.map((item: any) => (
              <div key={item.id}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm truncate flex-1">{item.title}</span>
                  <span className="text-xs text-gray-500 ml-2 shrink-0">{item.done}/{item.total}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${item.pct === 100 ? 'bg-green-500' : item.pct >= 50 ? 'bg-blue-400' : 'bg-gray-400'}`}
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects */}
      {projects.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-3 text-gray-700">Выполнение по проектам</h3>
          <div className="space-y-3">
            {projects.map((proj: any) => {
              const pct = proj.total > 0 ? Math.round(proj.done / proj.total * 100) : 0;
              return (
                <div key={proj.id ?? 'no-proj'}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm">{proj.emoji} {proj.name}</span>
                    <span className="text-xs text-gray-500">
                      {proj.done}/{proj.total} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-green-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-400">
                    {proj.doing > 0 && <span className="text-blue-500">🔄 {proj.doing}</span>}
                    {proj.todo > 0 && <span>📝 {proj.todo}</span>}
                    {proj.blocked > 0 && <span className="text-red-500">⚠️ {proj.blocked}</span>}
                    {proj.backlog > 0 && <span className="text-purple-500">📦 {proj.backlog} беклог</span>}
                    {proj.overdue > 0 && <span className="text-red-600 font-medium">🔥 {proj.overdue} просроч.</span>}
                    {proj.due_soon > 0 && <span className="text-orange-500">⏰ {proj.due_soon} скоро</span>}
                    {proj.avg_completion_days != null && <span className="text-gray-400">⏱ {fmtDays(proj.avg_completion_days)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top performers */}
      {top_performers.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-3 text-gray-700">👥 Топ исполнителей</h3>
          <div className="space-y-2">
            {top_performers.map((p: any, i: number) => {
              const barPct = Math.round(p.completed / maxCompleted * 100);
              const donePct = p.total > 0 ? Math.round(p.completed / p.total * 100) : 0;
              const onTimePct = p.with_deadline > 0 ? Math.round(p.on_time / p.with_deadline * 100) : null;
              const rateColor = donePct >= 80
                ? 'bg-green-100 text-green-700'
                : donePct >= 50
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-red-100 text-red-600';
              return (
                <div key={p.name} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-5 text-xs text-gray-400 shrink-0 text-center">{i + 1}</div>
                    <div className="w-24 sm:w-32 text-sm truncate shrink-0">{p.name}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-400 transition-all duration-500"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 shrink-0 w-8 text-right">{p.completed}/{p.total}</div>
                    <div className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 w-12 text-center ${rateColor}`}>
                      {donePct}%
                    </div>
                  </div>
                  {(onTimePct !== null || p.avg_days != null) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pl-7">
                      {onTimePct !== null && (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs text-gray-400 shrink-0">📅 вовремя:</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${onTimePct >= 80 ? 'bg-green-400' : onTimePct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                              style={{ width: `${onTimePct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 shrink-0">{p.on_time}/{p.with_deadline} ({onTimePct}%)</span>
                        </div>
                      )}
                      {p.avg_days != null && (
                        <span className="text-xs text-gray-400 shrink-0">⏱ среднее: {fmtDays(p.avg_days)}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sprint progress (#91) */}
      {sprint_progress.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-3 text-gray-700">🏃 Активные спринты</h3>
          <div className="space-y-3">
            {sprint_progress.map((sp: any) => (
              <div key={sp.id}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium truncate flex-1">{sp.name}</span>
                  <span className="text-xs text-gray-500 ml-2 shrink-0">{sp.done}/{sp.total} ({sp.pct}%)</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${sp.pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${sp.pct}%` }}
                  />
                </div>
                <div className="flex gap-3 text-xs text-gray-400">
                  {sp.doing > 0 && <span className="text-blue-500">🔄 {sp.doing}</span>}
                  {sp.todo > 0 && <span>📝 {sp.todo}</span>}
                  {sp.blocked > 0 && <span className="text-red-500">⚠️ {sp.blocked}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comment activity (#90) */}
      {comment_activity && comment_activity.total > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-3 text-gray-700">💬 Активность комментариев <span className="text-gray-400 font-normal">за 7 дней</span></h3>
          <div className="flex items-center gap-3 mb-2">
            <div className="text-2xl font-bold text-gray-700">{comment_activity.total}</div>
            <div className="text-xs text-gray-400">комментариев</div>
          </div>
          {comment_activity.by_author.length > 0 && (
            <div className="space-y-1">
              {comment_activity.by_author.map((a: any) => (
                <div key={a.name} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">{a.name}</span>
                  <span className="text-gray-400">{a.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Time tracking stats */}
      <div className={`bg-white rounded-lg border p-4 ${totalTime === 0 ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">⏱ Учёт времени</h3>
          <div className="flex gap-1 items-center">
            {totalTime > 0 && (
              <button
                onClick={() => {
                  const rows = [['ID', 'Название', 'Проект', 'Время (мин)', 'Время', 'Статус', 'Приоритет', 'Исполнитель']];
                  timeTasks.forEach((t: any) => {
                    const proj = allProjects.find((p: any) => p.id === t.project_id);
                    rows.push([
                      String(t.id),
                      `"${(t.title || '').replace(/"/g, '""')}"`,
                      proj?.name || '—',
                      String(t.time_spent || 0),
                      formatTime(t.time_spent || 0),
                      t.status || '',
                      t.priority || 'NORMAL',
                      t.assignee?.display_name || '—',
                    ]);
                  });
                  const csv = rows.map(r => r.join(',')).join('\n');
                  const bom = '\uFEFF';
                  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `time-report-${timePeriod}-${new Date().toISOString().slice(0,10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-2 py-0.5 text-xs rounded bg-green-600 text-white hover:bg-green-700 transition"
                title="Экспорт отчёта по времени в CSV"
              >
                📥 CSV
              </button>
            )}
            {(['week', 'month', 'quarter'] as const).map(p => (
              <button
                key={p}
                onClick={() => setTimePeriod(p)}
                className={`px-2 py-0.5 text-xs rounded ${timePeriod === p ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {p === 'week' ? 'Нед' : p === 'month' ? 'Месяц' : 'Кварт'}
              </button>
            ))}
          </div>
        </div>
        {totalTime === 0 ? (
          <div className="text-sm text-gray-400 text-center py-2">Нет данных за выбранный период</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-blue-50 p-2 rounded text-center">
                <div className="text-lg font-bold text-blue-700">{formatTime(totalTime)}</div>
                <div className="text-xs text-gray-500">Всего</div>
              </div>
              <div className="bg-green-50 p-2 rounded text-center">
                <div className="text-lg font-bold text-green-700">{totalTimeCount}</div>
                <div className="text-xs text-gray-500">Задач</div>
              </div>
              <div className="bg-purple-50 p-2 rounded text-center">
                <div className="text-lg font-bold text-purple-700">{formatTime(Math.round(totalTime / totalTimeCount) || 0)}</div>
                <div className="text-xs text-gray-500">Среднее</div>
              </div>
            </div>
            {Object.values(projectStats).length > 0 && (
              <>
                <div className="space-y-1">
                  {Object.values(projectStats).sort((a, b) => b.total - a.total).slice(0, 5).map(ps => (
                    <div key={ps.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1">
                        <span>{ps.emoji}</span>
                        <span className="truncate max-w-[150px]">{ps.name}</span>
                      </span>
                      <span className="font-mono text-gray-600">{formatTime(ps.total)} <span className="text-gray-400">({ps.count})</span></span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowTimeTasks(!showTimeTasks)}
                  className="mt-2 text-xs text-blue-500 hover:underline"
                >
                  {showTimeTasks ? 'Скрыть задачи' : `Показать задачи (${timeTasks.length})`}
                </button>
                {showTimeTasks && (
                  <div className="mt-2 max-h-40 overflow-y-auto border rounded text-xs">
                    {timeTasks.sort((a: any, b: any) => b.time_spent - a.time_spent).map((t: any) => {
                      const proj = allProjects.find((p: any) => p.id === t.project_id);
                      return (
                        <div 
                          key={t.id} 
                          className="flex items-center justify-between p-1.5 border-b hover:bg-gray-50 cursor-pointer"
                          onClick={() => onOpenTask?.(t)}
                        >
                          <span className="truncate">{t.title}</span>
                          <span className="text-gray-500 shrink-0 ml-2">{proj?.emoji} {formatTime(t.time_spent)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
