import { useState } from 'react';
import { MEETING_TYPE_LABELS, MEETING_TYPE_COLORS } from '../constants/meetingTypes';
import { parseUTC } from '../utils/dateUtils';

export default function MeetingsPage({ meetings, projects, onNew, onOpen, onDelete }: {
  meetings: any[]; projects: any[];
  onNew: () => void; onOpen: (m: any) => void; onDelete: (id: number) => void;
}) {
  const [typeFilter, setTypeFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState(0);

  const filtered = meetings.filter(m => {
    if (typeFilter && m.meeting_type !== typeFilter) return false;
    if (projectFilter && !(m.project_ids || []).includes(projectFilter)) return false;
    return true;
  });

  // Group by month
  const grouped: Record<string, any[]> = {};
  filtered.forEach(m => {
    const key = parseUTC(m.meeting_date).toLocaleDateString('ru', { month: 'long', year: 'numeric' });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-bold">🤝 Встречи ({filtered.length})</h2>
        <div className="flex gap-2 flex-wrap">
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="px-2 py-1.5 border rounded-lg text-xs">
            <option value="">Все типы</option>
            {Object.entries(MEETING_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {projects.length > 0 && (
            <select value={projectFilter} onChange={e => setProjectFilter(Number(e.target.value))}
              className="px-2 py-1.5 border rounded-lg text-xs">
              <option value={0}>Все проекты</option>
              {projects.map((p: any) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
            </select>
          )}
          <button onClick={onNew} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium">+ Встреча</button>
        </div>
      </div>

      {Object.keys(grouped).length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">🤝</div>
          <div className="text-sm">Встреч нет</div>
          <button onClick={onNew} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">+ Первая встреча</button>
        </div>
      )}

      {Object.entries(grouped).map(([month, monthMeetings]) => (
        <div key={month} className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">{month}</h3>
          <div className="space-y-2">
            {monthMeetings.map(m => {
              const projNames = (m.project_ids || []).map((pid: number) => {
                const p = projects.find((pr: any) => pr.id === pid);
                return p ? `${p.emoji} ${p.name}` : null;
              }).filter(Boolean);

              return (
                <div key={m.id} onClick={() => onOpen(m)}
                  className="bg-white rounded-lg border p-3 cursor-pointer hover:shadow-sm hover:border-blue-200 transition group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs text-gray-400">
                          {parseUTC(m.meeting_date).toLocaleDateString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {m.meeting_type && (
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${MEETING_TYPE_COLORS[m.meeting_type] || MEETING_TYPE_COLORS.other}`}>
                            {MEETING_TYPE_LABELS[m.meeting_type] || m.meeting_type}
                          </span>
                        )}
                        {m.duration_min && <span className="text-xs text-gray-400">⏱ {m.duration_min} мин</span>}
                        {projNames.map((n: string) => (
                          <span key={n} className="text-xs text-gray-400">{n}</span>
                        ))}
                      </div>
                      {m.title && <div className="text-sm font-medium mb-0.5">{m.title}</div>}
                      <p className="text-xs text-gray-600 line-clamp-2">{m.summary}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        {m.participants?.length > 0 && (
                          <span className="text-xs text-gray-400">👥 {m.participants.map((p: any) => p.display_name).join(', ')}</span>
                        )}
                        {m.tasks?.length > 0 && (
                          <span className="text-xs text-gray-400">✅ {m.tasks.length} задач</span>
                        )}
                      </div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); onDelete(m.id); }}
                      className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition shrink-0">🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
