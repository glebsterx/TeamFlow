import React from 'react';
import axios from 'axios';

import type { Project } from '../types/dashboard';
import { API_URL } from '../constants/taskDisplay';

interface SettingsPageProps {
  projects: Project[];
}

export default function SettingsPage({ projects }: SettingsPageProps) {
  const [exportProjectId, setExportProjectId] = React.useState('');
  const [exportInclude, setExportInclude] = React.useState({
    tasks: true, projects: true, meetings: true, comments: true,
  });
  const [importing, setImporting] = React.useState(false);
  const [importMode, setImportMode] = React.useState<'merge' | 'full'>('merge');
  const [importResult, setImportResult] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const parts = (Object.keys(exportInclude) as (keyof typeof exportInclude)[])
      .filter(k => exportInclude[k]);
    if (parts.length === 0) return;
    const params = new URLSearchParams();
    if (exportProjectId) params.set('project_id', exportProjectId);
    params.set('include', parts.join(','));
    window.location.href = `${API_URL}/api/export?${params}`;
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImporting(true);
      setImportResult(null);
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await axios.post(`${API_URL}/api/import`, { mode: importMode, data });
      const c = res.data.imported;
      setImportResult(`Импортировано: ${c.projects} проектов, ${c.tasks} задач, ${c.meetings} встреч, ${c.comments} комментариев`);
    } catch (err: any) {
      setImportResult(`Ошибка: ${err?.response?.data?.detail ?? err.message}`);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <h2 className="text-lg sm:text-xl font-bold mb-5">⚙️ Настройки</h2>

      <div className="max-w-lg space-y-6">
        {/* Export */}
        <section className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold text-base mb-3">📤 Экспорт</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Проект</label>
              <select
                value={exportProjectId}
                onChange={e => setExportProjectId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">Все проекты</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Включить</label>
              <div className="flex flex-wrap gap-3">
                {(Object.keys(exportInclude) as (keyof typeof exportInclude)[]).map(k => (
                  <label key={k} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={exportInclude[k]}
                      onChange={e => setExportInclude(prev => ({ ...prev, [k]: e.target.checked }))}
                      className="w-4 h-4 rounded"
                    />
                    {k}
                  </label>
                ))}
              </div>
            </div>
            <button
              onClick={handleExport}
              className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
            >Скачать JSON</button>
          </div>
        </section>

        {/* Import */}
        <section className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold text-base mb-3">📥 Импорт</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Режим</label>
              <div className="flex gap-2">
                {(['merge', 'full'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setImportMode(m)}
                    className={`flex-1 py-2 rounded-lg text-sm border transition ${importMode === m ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    {m === 'merge' ? '🔀 Merge — добавить новые' : '♻️ Full — заменить всё'}
                  </button>
                ))}
              </div>
              {importMode === 'full' && (
                <p className="text-xs text-red-500 mt-1.5">⚠️ Удалит все текущие задачи, встречи и комментарии</p>
              )}
            </div>
            <label className={`flex items-center justify-center gap-2 w-full py-2 border-2 border-dashed rounded-lg text-sm cursor-pointer transition ${importing ? 'opacity-50 pointer-events-none' : 'hover:border-blue-400 hover:bg-blue-50 text-gray-500'}`}>
              <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} disabled={importing} />
              {importing ? '⏳ Импортирую...' : '📂 Выбрать JSON файл'}
            </label>
            {importResult && (
              <div className={`text-sm px-3 py-2 rounded-lg ${importResult.startsWith('Ошибка') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                {importResult}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
