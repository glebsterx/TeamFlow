import React from 'react';
import axios from 'axios';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { Project } from '../types/dashboard';
import { API_URL } from '../constants/taskDisplay';
import { showToast } from '../utils/toast';
import { parseUTC } from '../utils/dateUtils';

interface ApiKey {
  id: number;
  key: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  last_used_at?: string;
}

interface SettingsPageProps {
  projects: Project[];
}

export default function SettingsPage({ projects }: SettingsPageProps) {
  const queryClient = useQueryClient();
  const [exportProjectId, setExportProjectId] = React.useState('');
  const [exportInclude, setExportInclude] = React.useState({
    tasks: true, projects: true, meetings: true, comments: true, sprints: true,
    tags: true, dependencies: true, templates: true,
  });
  const [importing, setImporting] = React.useState(false);
  const [importMode, setImportMode] = React.useState<'merge' | 'full'>('merge');
  const [importResult, setImportResult] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Bot status
  const [botStatus, setBotStatus] = React.useState<{ok: boolean, username: string|null, last_seen: string|null, uptime_sec: number|null, error: string|null} | null>(null);

  // Webhooks state
  const [webhooks, setWebhooks] = React.useState<{id: number, url: string, events: string, secret: string|null, is_active: boolean, created_at: string, last_triggered_at: string|null}[]>([]);
  const [newWebhookUrl, setNewWebhookUrl] = React.useState('');
  const [newWebhookEvents, setNewWebhookEvents] = React.useState<string[]>([]);
  const [newWebhookSecret, setNewWebhookSecret] = React.useState('');

  React.useEffect(() => {
    const fetchBotStatus = () => {
      axios.get(`${API_URL}/api/bot-status`).then(r => setBotStatus(r.data)).catch(() => {
        setBotStatus({ ok: false, username: null, last_seen: null, uptime_sec: null, error: 'API недоступен' });
      });
    };
    fetchBotStatus();
    const interval = setInterval(fetchBotStatus, 30000);
    return () => clearInterval(interval);
  }, []);


  // Proxy state
  const [proxyUrl, setProxyUrl] = React.useState('');
  const [proxyStatus, setProxyStatus] = React.useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [proxyCheck, setProxyCheck] = React.useState<{
    checking: boolean; reachable?: boolean; latency_ms?: number;
    http_status?: number; proxy_type?: string; error?: string;
  }>({ checking: false });

  React.useEffect(() => {
    axios.get(`${API_URL}/api/settings/proxy`).then(r => setProxyUrl(r.data.proxy_url || '')).catch(() => {});
  }, []);

  const handleSaveProxy = async () => {
    setProxyStatus('saving');
    try {
      await axios.post(`${API_URL}/api/settings/proxy`, { proxy_url: proxyUrl || null });
      setProxyStatus('saved');
      setTimeout(() => setProxyStatus('idle'), 2500);
    } catch { setProxyStatus('error'); setTimeout(() => setProxyStatus('idle'), 2500); }
  };

  const handleCheckProxy = async () => {
    setProxyCheck({ checking: true });
    try {
      const r = await axios.get(`${API_URL}/api/settings/proxy/check`, { timeout: 20000 });
      setProxyCheck({ checking: false, ...r.data });
    } catch (e: any) {
      const msg = e?.code === 'ECONNABORTED' ? 'timeout — прокси не ответил за 20с' : (e?.message || 'Ошибка');
      setProxyCheck({ checking: false, reachable: false, error: msg });
    }
  };

  // Webhooks handlers
  React.useEffect(() => {
    axios.get(`${API_URL}/api/webhooks`).then(r => setWebhooks(r.data)).catch(() => {});
  }, []);

  const handleCreateWebhook = async () => {
    try {
      const r = await axios.post(`${API_URL}/api/webhooks`, {
        url: newWebhookUrl,
        events: newWebhookEvents,
        secret: newWebhookSecret || undefined,
        is_active: true,
      });
      setWebhooks([r.data, ...webhooks]);
      setNewWebhookUrl('');
      setNewWebhookEvents([]);
      setNewWebhookSecret('');
    } catch (e) {
      showToast('Ошибка создания вебхука', 'error');
    }
  };

  const deleteWebhook = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/api/webhooks/${id}`);
      setWebhooks(webhooks.filter(w => w.id !== id));
    } catch (e) {
      showToast('Ошибка удаления вебхука', 'error');
    }
  };

  const toggleWebhook = async (id: number, isActive: boolean) => {
    try {
      const r = await axios.patch(`${API_URL}/api/webhooks/${id}`, { is_active: isActive });
      setWebhooks(webhooks.map(w => w.id === id ? r.data : w));
    } catch (e) {
      showToast('Ошибка обновления вебхука', 'error');
    }
  };

  const testWebhook = async (id: number) => {
    try {
      await axios.post(`${API_URL}/api/webhooks/${id}/test`, { event: 'test' });
      showToast('Тестовый запрос отправлен', 'success');
    } catch (e) {
      showToast('Ошибка тестового запроса', 'error');
    }
  };

  // Version state
  const [appVersion, setAppVersion] = React.useState<string>('');

  React.useEffect(() => {
    axios.get(`${API_URL}/api/settings/version`).then(res => {
      setAppVersion(res.data.version || '');
    }).catch(() => {});
  }, []);

  // Restart state
  const [restartStatus, setRestartStatus] = React.useState<Record<string, 'idle'|'restarting'|'done'|'error'>>({});

  const handleRestart = async (service: 'backend' | 'frontend') => {
    setRestartStatus(s => ({ ...s, [service]: 'restarting' }));
    try {
      await axios.post(`${API_URL}/api/settings/restart/${service}`, {}, { timeout: 8000 });
      setRestartStatus(s => ({ ...s, [service]: 'done' }));
      setTimeout(() => setRestartStatus(s => ({ ...s, [service]: 'idle' })), 4000);
    } catch (e: any) {
      // Backend перезапускает сам себя — соединение обрывается, это нормально
      // Network error / timeout = скорее всего успешный перезапуск
      const isNetworkError = !e.response || e.code === 'ECONNABORTED' || e.code === 'ERR_NETWORK';
      if (isNetworkError) {
        setRestartStatus(s => ({ ...s, [service]: 'done' }));
        setTimeout(() => setRestartStatus(s => ({ ...s, [service]: 'idle' })), 4000);
      } else {
        setRestartStatus(s => ({ ...s, [service]: 'error' }));
        setTimeout(() => setRestartStatus(s => ({ ...s, [service]: 'idle' })), 3000);
      }
    }
  };
  const [editingProjectId, setEditingProjectId] = React.useState<number | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editEmoji, setEditEmoji] = React.useState('');
  
  // API Keys state
  const [apiKeys, setApiKeys] = React.useState<ApiKey[]>([]);
  const [showNewKey, setShowNewKey] = React.useState(false);
  const [newKeyName, setNewKeyName] = React.useState('');
  const [newKeyDesc, setNewKeyDesc] = React.useState('');
  const [generatedKey, setGeneratedKey] = React.useState<string | null>(null);

  // Load API keys
  React.useEffect(() => {
    axios.get(`${API_URL}/api/api-keys`).then(res => setApiKeys(res.data)).catch(() => {});
  }, []);

  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await axios.patch(`${API_URL}/api/projects/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      showToast('Проект обновлён', 'success');
      setEditingProjectId(null);
    },
    onError: () => {
      showToast('Ошибка при обновлении', 'error');
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: number) => {
      await axios.delete(`${API_URL}/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      showToast('Проект удалён', 'success');
      setEditingProjectId(null);
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      if (detail?.code === 'PROJECT_HAS_DEPENDENCIES') {
        showToast(`Нельзя удалить: ${detail.subprojects_count} подпроектов, ${detail.tasks_count} задач`, 'error');
      } else {
        showToast('Ошибка при удалении', 'error');
      }
    },
  });

  const handleStartEdit = (project: Project) => {
    setEditingProjectId(project.id);
    setEditName(project.name);
    setEditEmoji(project.emoji || '📁');
  };

  const handleSaveEdit = (projectId: number) => {
    if (!editName.trim()) {
      showToast('Введите название проекта', 'warning');
      return;
    }
    updateProjectMutation.mutate({
      id: projectId,
      data: { name: editName.trim(), emoji: editEmoji },
    });
  };

  const handleCancelEdit = () => {
    setEditingProjectId(null);
    setEditName('');
    setEditEmoji('');
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      showToast('Введите название ключа', 'warning');
      return;
    }
    try {
      const res = await axios.post(`${API_URL}/api/api-keys`, {
        name: newKeyName.trim(),
        description: newKeyDesc.trim() || undefined,
      });
      setGeneratedKey(res.data.key);
      setApiKeys(prev => [...prev, res.data]);
      setNewKeyName('');
      setNewKeyDesc('');
      setShowNewKey(false);
      showToast('API-ключ создан', 'success');
    } catch {
      showToast('Ошибка при создании', 'error');
    }
  };

  const handleDeleteKey = async (keyId: number) => {
    if (!confirm('Удалить API-ключ?')) return;
    try {
      await axios.delete(`${API_URL}/api/api-keys/${keyId}`);
      setApiKeys(prev => prev.filter(k => k.id !== keyId));
      showToast('Ключ удалён', 'success');
    } catch {
      showToast('Ошибка при удалении', 'error');
    }
  };

  const handleToggleKey = async (key: ApiKey) => {
    try {
      const res = await axios.patch(`${API_URL}/api/api-keys/${key.id}`, {
        is_active: !key.is_active,
      });
      setApiKeys(prev => prev.map(k => k.id === key.id ? res.data : k));
      showToast(key.is_active ? 'Ключ деактивирован' : 'Ключ активирован', 'success');
    } catch {
      showToast('Ошибка', 'error');
    }
  };

  const handleRegenerateKey = async (keyId: number) => {
    if (!confirm('Перегенерировать ключ? Старый перестанет работать.')) return;
    try {
      const res = await axios.get(`${API_URL}/api/api-keys/${keyId}/regenerate`);
      setGeneratedKey(res.data.key);
      setApiKeys(prev => prev.map(k => k.id === keyId ? res.data : k));
      setShowNewKey(true);
      showToast('Ключ перегенерирован', 'success');
    } catch {
      showToast('Ошибка', 'error');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Скопировано', 'success');
    } catch {
      showToast('Не удалось скопировать', 'error');
    }
  };

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Projects Management */}
        <section className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold text-base mb-3">📁 Управление проектами</h3>
          <div className="space-y-2">
            {projects.map(project => (
              <div
                key={project.id}
                className="flex items-center gap-2 p-2 border rounded-lg hover:bg-gray-50"
              >
                {editingProjectId === project.id ? (
                  <>
                    <input
                      type="text"
                      value={editEmoji}
                      onChange={(e) => setEditEmoji(e.target.value)}
                      className="w-10 px-2 py-1 border rounded text-center text-lg"
                      maxLength={2}
                    />
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 px-2 py-1 border rounded text-sm"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveEdit(project.id)}
                      className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                    >✓</button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >✕</button>
                  </>
                ) : (
                  <>
                    <span className="text-xl">{project.emoji || '📁'}</span>
                    <span className="flex-1 text-sm font-medium">{project.name}</span>
                    <button
                      onClick={() => handleStartEdit(project)}
                      className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                      title="Редактировать"
                    >✏️</button>
                    <button
                      onClick={() => deleteProjectMutation.mutate(project.id)}
                      className="px-2 py-1 text-xs text-red-500 hover:text-red-700"
                      title="Удалить"
                    >🗑️</button>
                  </>
                )}
              </div>
            ))}
            {projects.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">Проектов нет</p>
            )}
          </div>
        </section>

        {/* API Keys */}
        <section className="bg-white border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-base">🔑 API-ключи</h3>
            <button
              onClick={() => { setShowNewKey(true); setGeneratedKey(null); }}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >+ Ключ</button>
          </div>
          
          {showNewKey && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="space-y-2">
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Название (например: AI Assistant)"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  autoFocus
                />
                <input
                  type="text"
                  value={newKeyDesc}
                  onChange={(e) => setNewKeyDesc(e.target.value)}
                  placeholder="Описание (необязательно)"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateKey}
                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                  >Создать</button>
                  <button
                    onClick={() => { setShowNewKey(false); setNewKeyName(''); setNewKeyDesc(''); }}
                    className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                  >Отмена</button>
                </div>
              </div>
            </div>
          )}
          
          {generatedKey && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="text-sm text-green-800 font-medium mb-2">
                🔑 Сохраните ключ! Он показывается только один раз.
              </div>
              <div className="flex gap-2">
                <code className="flex-1 px-3 py-2 bg-white border rounded text-xs font-mono break-all">
                  {generatedKey}
                </code>
                <button
                  onClick={() => copyToClipboard(generatedKey)}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 whitespace-nowrap"
                >📋 Копия</button>
              </div>
              <button
                onClick={() => setGeneratedKey(null)}
                className="mt-2 text-xs text-green-600 hover:underline"
              >Я сохранил(а)</button>
            </div>
          )}
          
          <div className="space-y-2">
            {apiKeys.map(key => (
              <div
                key={key.id}
                className={`flex items-center gap-3 p-3 border rounded-lg ${key.is_active ? 'bg-white' : 'bg-gray-50 opacity-75'}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{key.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${key.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                      {key.is_active ? 'Активен' : 'Деактивирован'}
                    </span>
                  </div>
                  {key.description && (
                    <div className="text-xs text-gray-500 truncate mt-1">{key.description}</div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    Создан: {parseUTC(key.created_at).toLocaleDateString('ru')}
                    {key.last_used_at && (
                      <span className="ml-2">· Использован: {parseUTC(key.last_used_at).toLocaleDateString('ru')}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleToggleKey(key)}
                    className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                    title={key.is_active ? 'Деактивировать' : 'Активировать'}
                  >{key.is_active ? '🚫' : '✅'}</button>
                  <button
                    onClick={() => handleRegenerateKey(key.id)}
                    className="px-2 py-1 text-xs text-blue-500 hover:text-blue-700"
                    title="Перегенерировать"
                  >🔄</button>
                  <button
                    onClick={() => handleDeleteKey(key.id)}
                    className="px-2 py-1 text-xs text-red-500 hover:text-red-700"
                    title="Удалить"
                  >🗑️</button>
                </div>
              </div>
            ))}
            {apiKeys.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">API-ключей нет</p>
            )}
          </div>
        </section>

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

        {/* Bot status */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-3">🤖 Telegram-бот</h2>
          {botStatus === null ? (
            <p className="text-xs text-gray-400">Загрузка...</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${
                  botStatus.ok ? 'bg-green-100 text-green-700' :
                  botStatus.error === 'Bot not started yet' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-600'
                }`}>
                  <span>{botStatus.ok ? '●' : botStatus.error === 'Bot not started yet' ? '◌' : '●'}</span>
                  <span>{botStatus.ok ? 'Работает' : botStatus.error === 'Bot not started yet' ? 'Запускается' : 'Нет связи'}</span>
                </span>
                {botStatus.username && botStatus.username !== 'unknown' && (
                  <span className="text-sm text-gray-600">@{botStatus.username}</span>
                )}
              </div>
              {botStatus.ok && botStatus.uptime_sec !== null && (
                <p className="text-xs text-gray-400">
                  Uptime: {botStatus.uptime_sec < 3600
                    ? `${Math.floor(botStatus.uptime_sec / 60)} мин`
                    : `${Math.floor(botStatus.uptime_sec / 3600)} ч ${Math.floor((botStatus.uptime_sec % 3600) / 60)} мин`}
                </p>
              )}
              {!botStatus.ok && botStatus.error && botStatus.error !== 'Bot not started yet' && (
                <p className="text-xs text-red-500">{botStatus.error}</p>
              )}
            </div>
          )}
        </section>

        {/* Proxy */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-3">🔌 Прокси для Telegram-бота</h2>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Если Telegram заблокирован — укажите SOCKS5 прокси.</p>
            <div className="flex gap-2">
              <input type="text" value={proxyUrl} onChange={e => setProxyUrl(e.target.value)}
                placeholder="socks5://user:pass@host:1080"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-400" />
              <button onClick={handleSaveProxy} disabled={proxyStatus === 'saving'}
                className="px-4 py-2 rounded-lg text-sm font-medium border transition bg-white hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap">
                {proxyStatus === 'saving' ? '...' : proxyStatus === 'saved' ? '✓ Сохранено' : proxyStatus === 'error' ? '✗ Ошибка' : 'Сохранить'}
              </button>
              <button onClick={handleCheckProxy} disabled={proxyCheck.checking}
                title="Проверяет сохранённый прокси из .env (сначала сохраните)"
                className="px-4 py-2 rounded-lg text-sm font-medium border transition bg-blue-50 hover:bg-blue-100 text-blue-700 disabled:opacity-50 whitespace-nowrap">
                {proxyCheck.checking ? '⏳ ~15с...' : '🔍 Проверить'}
              </button>
            </div>
            {!proxyCheck.checking && proxyCheck.reachable !== undefined && (
              <div className={`rounded-lg px-3 py-2 text-xs flex items-start gap-2 ${proxyCheck.reachable ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                <span className="text-base leading-none mt-0.5">{proxyCheck.reachable ? '✅' : '❌'}</span>
                <div className="space-y-0.5">
                  <p className="font-medium">{proxyCheck.reachable ? 'Telegram доступен' : 'Telegram недоступен'}</p>
                  {proxyCheck.proxy_type && <p className="opacity-75">Через: {proxyCheck.proxy_type}</p>}
                  {proxyCheck.latency_ms !== undefined && <p className="opacity-75">Задержка: {proxyCheck.latency_ms} мс</p>}
                  {proxyCheck.error && <p className="opacity-75 font-mono break-all">{proxyCheck.error}</p>}
                </div>
              </div>
            )}
            <div className="text-xs text-gray-400 space-y-0.5">
              <p><span className="font-mono text-gray-500">socks5://user:pass@host:1080</span> — SOCKS5 прокси</p>
              <p className="pt-0.5 text-gray-400">После сохранения нужно перезапустить Backend.</p>
            </div>
          </div>
        </section>

        {/* Webhooks */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-3">🌐 Webhooks</h2>
          <p className="text-xs text-gray-400 mb-4">HTTP callbacks при событиях в TaskFlow</p>
          
          {/* Create webhook form */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg space-y-3">
            <input
              type="url"
              placeholder="https://example.com/webhook"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
              value={newWebhookUrl}
              onChange={e => setNewWebhookUrl(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {['task.created', 'task.status_changed', 'task.updated', 'task.deleted'].map(evt => (
                <label key={evt} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={newWebhookEvents.includes(evt)}
                    onChange={e => setNewWebhookEvents(
                      e.target.checked 
                        ? [...newWebhookEvents, evt]
                        : newWebhookEvents.filter(x => x !== evt)
                    )}
                    className="rounded"
                  />
                  <span className="text-gray-600">{evt}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Secret (опционально)"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg"
                value={newWebhookSecret}
                onChange={e => setNewWebhookSecret(e.target.value)}
              />
              <button
                onClick={handleCreateWebhook}
                disabled={!newWebhookUrl || newWebhookEvents.length === 0}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                Добавить
              </button>
            </div>
          </div>

          {/* Webhooks list */}
          {webhooks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Нет вебхуков</p>
          ) : (
            <div className="space-y-2">
              {webhooks.map(wh => (
                <div key={wh.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{wh.url}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${wh.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                        {wh.is_active ? 'active' : 'inactive'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {JSON.parse(wh.events).join(', ')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => testWebhook(wh.id)}
                      className="p-2 text-gray-500 hover:text-indigo-600"
                      title="Test"
                    >
                      ▶
                    </button>
                    <button
                      onClick={() => toggleWebhook(wh.id, !wh.is_active)}
                      className="p-2 text-gray-500 hover:text-gray-700"
                      title={wh.is_active ? 'Disable' : 'Enable'}
                    >
                      {wh.is_active ? '⏸' : '▶'}
                    </button>
                    <button
                      onClick={() => deleteWebhook(wh.id)}
                      className="p-2 text-gray-500 hover:text-red-600"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Restart services */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">🔄 Перезапуск сервисов</h2>
          <p className="text-xs text-gray-400 mb-4">Применить изменения конфига без SSH</p>
          <div className="grid grid-cols-2 gap-3">
            {(['backend', 'frontend'] as const).map(svc => {
              const st = restartStatus[svc] || 'idle';
              return (
                <button
                  key={svc}
                  onClick={() => handleRestart(svc)}
                  disabled={st === 'restarting'}
                  className={`py-2.5 px-3 rounded-lg text-sm font-medium border transition flex items-center justify-center gap-2 ${
                    st === 'done' ? 'bg-green-50 border-green-300 text-green-700' :
                    st === 'error' ? 'bg-red-50 border-red-300 text-red-600' :
                    st === 'restarting' ? 'opacity-60 cursor-wait bg-gray-50' :
                    'bg-white hover:bg-gray-50'
                  }`}
                >
                  <span>{st === 'restarting' ? '⏳' : st === 'done' ? '✓' : st === 'error' ? '✗' : '🔄'}</span>
                  <span>{svc === 'backend' ? 'Backend' : 'Frontend'}</span>
                  {st === 'restarting' && <span className="text-xs text-gray-400">~15с</span>}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-2">Backend недоступен ~15с после перезапуска</p>
        </section>

        {/* Version */}
        {appVersion && (
          <p className="text-xs text-gray-400 text-right pt-1">
            TeamFlow v{appVersion}
          </p>
        )}

      </div>
    </>
  );
}
