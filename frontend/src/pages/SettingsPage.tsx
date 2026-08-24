import React from 'react';
import axios from 'axios';
import type { Project } from '../types/dashboard';
import { API_URL } from '../constants/taskDisplay';
import { showToast } from '../utils/toast';
import ProjectNavPage from './ProjectNavPage';

import BotSettingsSection from './settings/BotSettingsSection';
import BotInfoSection from './settings/BotInfoSection';
import SystemSettingsSection from './settings/SystemSettingsSection';
import OAuthSettingsSection from './settings/OAuthSettingsSection';
import AISettingsSection from './settings/AISettingsSection';
import ApiKeysSection from './settings/ApiKeysSection';
import RegistrationSettingsSection from './settings/RegistrationSettingsSection';
import UsersSection from './settings/UsersSection';
import TeamManagementSection from './settings/TeamManagementSection';

interface SettingsPageProps {
  projects: Project[];
  tasks?: any[];
  navProject?: any;
  navTaskPath?: any[];
  onSelectProject?: (p: any) => void;
  onPushTask?: (t: any) => void;
  onEditProject?: (p: any) => void;
  onOpenTask?: (t: any) => void;
  onNewProject?: (parentId?: number) => void;
  onNewTask?: (ctx: any) => void;
  changeStatusMutation?: any;
  takeTaskMutation?: any;
  myUserId?: number | null;
  invalidate?: () => void;
  ancestorBlockedIds?: Set<number>;
  onDeleteTask?: (id: number) => void;
  onShowMembers?: (p: any) => void;
  navProjectPath?: any[];
  onPopTask?: () => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

type SettingsTab = 'general' | 'projects' | 'team' | 'users' | 'integrations' | 'bot' | 'system';

// ========== MAIN SETTINGS PAGE ==========
export default function SettingsPage(props: SettingsPageProps) {
  const { projects, tasks, navProject, navProjectPath, navTaskPath, onSelectProject, onPushTask, onPopTask, onEditProject, onOpenTask, onNewProject, onNewTask, changeStatusMutation, takeTaskMutation, myUserId, invalidate, ancestorBlockedIds, onDeleteTask, onShowMembers, activeTab: propActiveTab, onTabChange } = props;
  const [activeTab, setActiveTab] = React.useState<SettingsTab>(() => (propActiveTab as SettingsTab) || (sessionStorage.getItem('tf_settings_tab') as SettingsTab) || 'general');
  React.useEffect(() => {
    if (propActiveTab) {
      setActiveTab(propActiveTab as SettingsTab);
    }
  }, [propActiveTab]);
  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    sessionStorage.setItem('tf_settings_tab', tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  // Check permissions
  const [myAccountId] = React.useState<number | null>(() => {
    const saved = localStorage.getItem('teamflow_account_id');
    return saved ? Number(saved) : null;
  });
  const [mySystemRole, setMySystemRole] = React.useState<string | null>(null);
  const [isLoadingRole, setIsLoadingRole] = React.useState(true);

  React.useEffect(() => {
    if (!myAccountId) { setIsLoadingRole(false); return; }
    axios.get(`${API_URL}/api/auth/account/me`, { params: { account_id: myAccountId } })
      .then(res => {
        setMySystemRole(res.data.system_role || 'user');
      })
      .catch(() => setMySystemRole('user'))
      .finally(() => setIsLoadingRole(false));
  }, [myAccountId]);

  // All hooks must be declared before conditional returns
  const [exportProjectId, setExportProjectId] = React.useState('');
  const [exportInclude, setExportInclude] = React.useState({ tasks: true, projects: true, meetings: true, comments: true, sprints: true, tags: true, dependencies: true, templates: true });
  const [importing, setImporting] = React.useState(false);
  const [importMode, setImportMode] = React.useState<'merge' | 'full'>('merge');
  const [importResult, setImportResult] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Webhooks
  const [webhooks, setWebhooks] = React.useState<{id: number, url: string, events: string, secret: string|null, is_active: boolean, created_at: string, last_triggered_at: string|null}[]>([]);
  const [newWebhookUrl, setNewWebhookUrl] = React.useState('');
  const [newWebhookEvents, setNewWebhookEvents] = React.useState<string[]>([]);
  const [newWebhookSecret, setNewWebhookSecret] = React.useState('');
  React.useEffect(() => { axios.get(`${API_URL}/api/webhooks`).then(r => setWebhooks(r.data)).catch(() => {}); }, []);
  const handleCreateWebhook = async () => { try { const r = await axios.post(`${API_URL}/api/webhooks`, { url: newWebhookUrl, events: newWebhookEvents, secret: newWebhookSecret || undefined, is_active: true }); setWebhooks([r.data, ...webhooks]); setNewWebhookUrl(''); setNewWebhookEvents([]); setNewWebhookSecret(''); } catch { showToast('Ошибка создания вебхука', 'error'); } };
  const deleteWebhook = async (id: number) => { try { await axios.delete(`${API_URL}/api/webhooks/${id}`); setWebhooks(webhooks.filter(w => w.id !== id)); } catch { showToast('Ошибка удаления вебхука', 'error'); } };
  const toggleWebhook = async (id: number, isActive: boolean) => { try { const r = await axios.patch(`${API_URL}/api/webhooks/${id}`, { is_active: isActive }); setWebhooks(webhooks.map(w => w.id === id ? r.data : w)); } catch { showToast('Ошибка обновления вебхука', 'error'); } };
  const testWebhook = async (id: number) => { try { await axios.post(`${API_URL}/api/webhooks/${id}/test`, { event: 'test' }); showToast('Тестовый запрос отправлен', 'success'); } catch { showToast('Ошибка тестового запроса', 'error'); } };

  // Version & Restart
  const [appVersion, setAppVersion] = React.useState<string>('');
  const [restartStatus, setRestartStatus] = React.useState<{ [key: string]: 'idle'|'restarting'|'done'|'error' }>({});
  React.useEffect(() => { axios.get(`${API_URL}/api/settings/version`).then(res => setAppVersion(res.data.version || '')).catch(() => {}); }, []);
  const handleRestart = async (service: 'backend' | 'frontend') => {
    setRestartStatus(s => ({ ...s, [service]: 'restarting' }));
    try { await axios.post(`${API_URL}/api/settings/restart/${service}`, {}, { timeout: 8000 }); setRestartStatus(s => ({ ...s, [service]: 'done' })); setTimeout(() => setRestartStatus(s => ({ ...s, [service]: 'idle' })), 4000); } catch (e: any) {
      const isNetworkError = !e.response || e.code === 'ECONNABORTED' || e.code === 'ERR_NETWORK';
      if (isNetworkError) { setRestartStatus(s => ({ ...s, [service]: 'done' })); setTimeout(() => setRestartStatus(s => ({ ...s, [service]: 'idle' })), 4000); }
      else { setRestartStatus(s => ({ ...s, [service]: 'error' })); setTimeout(() => setRestartStatus(s => ({ ...s, [service]: 'idle' })), 3000); }
    }
  };

  // Export/Import
  const handleExport = () => { const parts = (Object.keys(exportInclude) as (keyof typeof exportInclude)[]).filter(k => exportInclude[k]); if (parts.length === 0) return; const params = new URLSearchParams(); if (exportProjectId) params.set('project_id', exportProjectId); params.set('include', parts.join(',')); window.location.href = `${API_URL}/api/export?${params}`; };
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; try { setImporting(true); setImportResult(null); const text = await file.text(); const data = JSON.parse(text); const res = await axios.post(`${API_URL}/api/import`, { mode: importMode, data }); const c = res.data.imported; setImportResult(`Импортировано: ${c.projects} проектов, ${c.tasks} задач, ${c.meetings} встреч, ${c.comments} комментариев`); } catch (err: any) { setImportResult(`Ошибка: ${err?.response?.data?.detail ?? err.message}`); } finally { setImporting(false); if (fileRef.current) fileRef.current.value = ''; } };

  // Conditional returns AFTER all hooks
  if (isLoadingRole) {
    return <div className="max-w-2xl mx-auto py-12 text-center text-gray-400">Проверка прав доступа...</div>;
  }

  if (mySystemRole !== 'admin') {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <div className="bg-white border rounded-xl p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">🔒 Доступ ограничен</h2>
          <p className="text-gray-500 mb-6">Только администратор системы может изменять настройки</p>
          <button
            onClick={() => window.location.pathname = '/'}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            На главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg sm:text-xl font-bold">⚙️ Настройки</h2>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {[
            { id: 'general', label: 'Основные', icon: '⚙️' },
            { id: 'projects', label: 'Проекты', icon: '📁' },
            { id: 'team', label: 'Команда', icon: '👥' },
            { id: 'users', label: 'Пользователи', icon: '👤' },
            { id: 'bot', label: 'Бот', icon: '🤖' },
            { id: 'integrations', label: 'Интеграции', icon: '🔗' },
            { id: 'system', label: 'Система', icon: '🖥️' },
          ].map(tab => (
            <button key={tab.id} onClick={() => handleTabChange(tab.id as SettingsTab)} className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}>
              {tab.icon} <span className="hidden sm:inline ml-1">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* GENERAL TAB */}
      {activeTab === 'general' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Export/Import */}
          <section className="bg-white border rounded-xl p-4">
            <h3 className="font-semibold text-sm mb-3">📤 Экспорт / Импорт</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Проект</label>
                <select value={exportProjectId} onChange={e => setExportProjectId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">Все проекты</option>
                  {projects.map(p => (<option key={p.id} value={p.id}>{p.emoji} {p.name}</option>))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Включить</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(exportInclude) as (keyof typeof exportInclude)[]).map(k => (
                    <label key={k} className="flex items-center gap-1 text-xs cursor-pointer select-none">
                      <input type="checkbox" checked={exportInclude[k]} onChange={e => setExportInclude(prev => ({ ...prev, [k]: e.target.checked }))} className="w-3.5 h-3.5 rounded" />{k}
                    </label>
                  ))}
                </div>
              </div>
              <button onClick={handleExport} className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">Скачать JSON</button>
              <div className="border-t pt-3">
                <div className="flex gap-2 mb-2">
                  {(['merge', 'full'] as const).map(m => (
                    <button key={m} onClick={() => setImportMode(m)} className={`flex-1 py-1.5 rounded text-xs border transition ${importMode === m ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      {m === 'merge' ? '🔀 Merge' : '♻️ Full'}
                    </button>
                  ))}
                </div>
                {importMode === 'full' && <p className="text-xs text-red-500 mb-2">⚠️ Удалит все текущие данные</p>}
                <label className={`flex items-center justify-center gap-2 w-full py-2 border-2 border-dashed rounded-lg text-xs cursor-pointer transition ${importing ? 'opacity-50 pointer-events-none' : 'hover:border-blue-400 hover:bg-blue-50 text-gray-500'}`}>
                  <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} disabled={importing} />
                  {importing ? '⏳ Импортирую...' : '📂 Выбрать JSON файл'}
                </label>
                {importResult && <div className={`text-xs mt-2 px-3 py-2 rounded-lg ${importResult.startsWith('Ошибка') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{importResult}</div>}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* PROJECTS TAB */}
      {activeTab === 'projects' && (
        <ProjectNavPage
          projects={projects}
          tasks={tasks}
          navProject={navProject}
          navProjectPath={navProjectPath || []}
          navTaskPath={navTaskPath || []}
          onSelectProject={onSelectProject}
          onPushTask={onPushTask}
          onEditProject={onEditProject}
          onOpenTask={onOpenTask}
          onNewProject={onNewProject}
          onNewTask={onNewTask}
          changeStatusMutation={changeStatusMutation}
          takeTaskMutation={takeTaskMutation}
          myUserId={myUserId}
          invalidate={invalidate}
          ancestorBlockedIds={ancestorBlockedIds}
          onDeleteTask={onDeleteTask}
          onShowMembers={onShowMembers}
          onGoBack={onPopTask}
        />
      )}

      {/* TEAM TAB */}
      {activeTab === 'team' && (
        <div className="space-y-4">
          <TeamManagementSection />
        </div>
      )}

      {/* USERS TAB */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <UsersSection />
        </div>
      )}

      {/* BOT TAB */}
      {activeTab === 'bot' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BotSettingsSection />
          <BotInfoSection />
        </div>
      )}

      {/* INTEGRATIONS TAB */}
      {activeTab === 'integrations' && (
        <div className="space-y-4">
          <ApiKeysSection />
          <AISettingsSection />
          <OAuthSettingsSection />
          <RegistrationSettingsSection />
          <section className="bg-white border rounded-xl p-4">
            <h3 className="font-semibold text-sm mb-3">🔗 Вебхуки</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input type="text" value={newWebhookUrl} onChange={(e) => setNewWebhookUrl(e.target.value)} placeholder="https://example.com/webhook" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">События</label>
                <div className="flex flex-wrap gap-2">
                  {['task.created', 'task.status_changed', 'task.deleted'].map(ev => (
                    <label key={ev} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="checkbox" checked={newWebhookEvents.includes(ev)} onChange={(e) => setNewWebhookEvents(e.target.checked ? [...newWebhookEvents, ev] : newWebhookEvents.filter(x => x !== ev))} className="w-4 h-4 rounded" />{ev}
                    </label>
                  ))}
                </div>
              </div>
              <input type="text" value={newWebhookSecret} onChange={(e) => setNewWebhookSecret(e.target.value)} placeholder="Secret для HMAC (необязательно)" className="w-full px-3 py-2 border rounded-lg text-sm" />
              <button onClick={handleCreateWebhook} disabled={!newWebhookUrl || newWebhookEvents.length === 0} className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">Добавить вебхук</button>
            </div>
            {webhooks.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Нет вебхуков</p>
            ) : (
              <div className="space-y-2 mt-4">
                {webhooks.map(wh => (
                  <div key={wh.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{wh.url}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${wh.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>{wh.is_active ? 'active' : 'inactive'}</span>
                        <span className="text-xs text-gray-400">{JSON.parse(wh.events).join(', ')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button onClick={() => testWebhook(wh.id)} className="p-2 text-gray-500 hover:text-indigo-600" title="Test">▶</button>
                      <button onClick={() => toggleWebhook(wh.id, !wh.is_active)} className="p-2 text-gray-500 hover:text-gray-700" title={wh.is_active ? 'Disable' : 'Enable'}>{wh.is_active ? '⏸' : '▶'}</button>
                      <button onClick={() => deleteWebhook(wh.id)} className="p-2 text-gray-500 hover:text-red-600" title="Delete">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* SYSTEM TAB */}
      {activeTab === 'system' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SystemSettingsSection />
          <div className="space-y-4">
            <section className="bg-white border rounded-xl p-4">
              <h3 className="font-semibold text-sm mb-3">🔄 Перезапуск</h3>
              <div className="grid grid-cols-2 gap-2">
                {(['backend', 'frontend'] as const).map(svc => {
                  const st = restartStatus[svc] || 'idle';
                  return (
                    <button key={svc} onClick={() => handleRestart(svc)} disabled={st === 'restarting'} className={`py-2 px-3 rounded-lg text-sm font-medium border transition flex items-center justify-center gap-2 ${st === 'done' ? 'bg-green-50 border-green-300 text-green-700' : st === 'error' ? 'bg-red-50 border-red-300 text-red-600' : st === 'restarting' ? 'opacity-60 cursor-wait bg-gray-50' : 'bg-white hover:bg-gray-50'}`}>
                      <span>{st === 'restarting' ? '⏳' : st === 'done' ? '✓' : st === 'error' ? '✗' : '🔄'}</span>
                      <span>{svc === 'backend' ? 'Backend' : 'Frontend'}</span>
                    </button>
                  );
                })}
              </div>
            </section>
            {appVersion && (
              <section className="bg-white border rounded-xl p-4">
                <h3 className="font-semibold text-sm mb-2">ℹ️ Версия</h3>
                <p className="text-sm text-gray-600">TeamFlow v{appVersion}</p>
              </section>
            )}
            <a href={mySystemRole === 'admin' ? '/help-admin' : '/help'} className="block bg-white border rounded-xl p-4 hover:bg-gray-50 transition">
              <h3 className="font-semibold text-sm mb-1">📖 {mySystemRole === 'admin' ? 'Справка администратора' : 'Справка'}</h3>
              <p className="text-sm text-gray-500">{mySystemRole === 'admin' ? 'Управление системой и интеграции' : 'Руководство и документация'}</p>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
