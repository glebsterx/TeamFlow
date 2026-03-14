import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../constants/taskDisplay';

export default function DigestPage() {
  const { data, isLoading, dataUpdatedAt } = useQuery<any>({
    queryKey: ['digest'],
    queryFn: async () => (await axios.get(`${API_URL}/api/digest`)).data,
    refetchInterval: 30000,
    staleTime: 20000,
  });

  if (isLoading) return <div className="text-center py-12 text-gray-400">Загрузка...</div>;
  if (!data) return null;

  const { stats, projects, top_performers } = data;
  const total = stats.total || 1;
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

      {/* Дедлайны */}
      {(stats.overdue > 0 || stats.due_soon > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {stats.overdue > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
              <div className="text-xs font-medium text-red-500">🔥 Просрочено</div>
            </div>
          )}
          {stats.due_soon > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="text-2xl font-bold text-orange-600">{stats.due_soon}</div>
              <div className="text-xs font-medium text-orange-500">⏰ Скоро дедлайн</div>
            </div>
          )}
        </div>
      )}
      {stats.avg_completion_days != null && (
        <div className="text-sm text-gray-500">⏱ Среднее время выполнения: <span className="font-medium text-gray-700">{fmtDays(stats.avg_completion_days)}</span></div>
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
    </div>
  );
}
