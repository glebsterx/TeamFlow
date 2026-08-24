import React from 'react';
import axios from 'axios';
import { API_URL } from '../../constants/taskDisplay';

// Зависимости задачи: «блокирует» / «зависит от»
function DependencyPicker({ taskId, tasks, onOpenTask }: {
  taskId: number;
  tasks: any[];
  onOpenTask?: (t: any) => void;
}) {
  const [deps, setDeps] = React.useState<any[]>([]);
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const ref = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(() => {
    axios.get(`${API_URL}/api/tasks/${taskId}/dependencies`)
      .then(r => setDeps(r.data))
      .catch(() => {});
  }, [taskId]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const addDep = async (dependsOnId: number) => {
    await axios.post(`${API_URL}/api/tasks/${taskId}/dependencies`, { depends_on_id: dependsOnId });
    load();
    setOpen(false);
    setSearch('');
  };

  const removeDep = async (depId: number) => {
    await axios.delete(`${API_URL}/api/tasks/${taskId}/dependencies/${depId}`);
    load();
  };

  const depIds = new Set(deps.map((d: any) => d.depends_on_id));
  const filtered = (tasks || []).filter((t: any) =>
    t.id !== taskId &&
    !depIds.has(t.id) &&
    (search === '' || t.title.toLowerCase().includes(search.toLowerCase()) || String(t.id).includes(search))
  ).slice(0, 20);

  if (deps.length === 0 && !open) {
    return (
      <div className="mb-3">
        <button onClick={() => setOpen(true)}
          className="text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 rounded px-2 py-1 hover:border-gray-400 transition">
          + зависит от…
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="mb-3">
      <div className="flex items-center gap-1 mb-1">
        <span className="text-xs text-gray-500">🔗 Зависит от</span>
      </div>
      <div className="space-y-1">
        {deps.map((d: any) => {
          const fullTask = (tasks || []).find((t: any) => t.id === d.depends_on_id);
          const isDone = d.depends_on_status === 'DONE';
          return (
            <div key={d.id} className="flex items-center gap-2 text-xs px-2 py-1 bg-gray-50 rounded border">
              <span className={`shrink-0 ${isDone ? 'text-green-500' : 'text-amber-500'}`}>{isDone ? '✅' : '⏳'}</span>
              <button
                onClick={() => fullTask && onOpenTask?.(fullTask)}
                className="flex-1 text-left truncate hover:text-blue-600 hover:underline"
                title={d.depends_on_title}
              >#{d.depends_on_id} {d.depends_on_title}</button>
              <button onClick={() => removeDep(d.id)} className="shrink-0 text-gray-400 hover:text-red-500">✕</button>
            </div>
          );
        })}
        <div className="relative">
          <button onClick={() => setOpen(v => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 rounded px-2 py-1 hover:border-gray-400 transition">
            + добавить зависимость
          </button>
          {open && (
            <div className="absolute z-50 top-full left-0 mt-1 bg-white border rounded-lg shadow-lg w-64 p-2">
              <input
                autoFocus
                className="w-full px-2 py-1.5 border rounded text-xs mb-2"
                placeholder="Поиск задачи…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Нет задач</p>}
                {filtered.map((t: any) => (
                  <button key={t.id} onClick={() => addDep(t.id)}
                    className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-50 flex items-center gap-2">
                    <span className="text-gray-400 shrink-0">#{t.id}</span>
                    <span className="flex-1 truncate">{t.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DependencyPicker;
