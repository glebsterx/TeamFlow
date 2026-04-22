import React from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Project } from '../types/dashboard';
import { API_URL } from '../constants/taskDisplay';
import { showToast } from '../utils/toast';
import { parseUTC } from '../utils/dateUtils';
import ProjectNavPage from './ProjectNavPage';

interface TeamMember {
  id: number;
  telegram_user_id: number;
  role: string;
  joined_at: string;
  invited_by_id: number | null;
  user?: {
    id: number;
    id: number;
    username: string | null;
    first_name: string;
    last_name: string | null;
    display_name: string;
  } | null;
}

interface TeamInvite {
  id: number;
  invite_token: string;
  telegram_username: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  invite_url: string;
}

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
  ancestorBlockedIds?: number[];
  onDeleteTask?: (id: number) => void;
  onShowMembers?: (p: any) => void;
  navProjectPath?: any[];
  onPopTask?: () => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

type SettingsTab = 'general' | 'projects' | 'team' | 'users' | 'integrations' | 'bot' | 'system';

const ROLE_COLORS: { [key: string]: string } = {
  owner: 'bg-purple-100 text-purple-700 border-purple-200',
  admin: 'bg-red-100 text-red-700 border-red-200',
  member: 'bg-blue-100 text-blue-700 border-blue-200',
  viewer: 'bg-gray-100 text-gray-700 border-gray-200',
};

const ROLE_LABELS: { [key: string]: string } = {
  owner: '👑 Владелец',
  admin: '🔹 Админ',
  member: '👤 Участник',
  viewer: '👁 Наблюдатель',
};

// ========== BOT SETTINGS COMPONENT ==========
function BotSettingsSection() {
  const [botToken, setBotToken] = React.useState('');
  const [maskedToken, setMaskedToken] = React.useState<string | null>(null);
  const [proxyUrl, setProxyUrl] = React.useState('');
  const [chatId, setChatId] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [savingToken, setSavingToken] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savingProxy, setSavingProxy] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [botStatus, setBotStatus] = React.useState<any>(null);

  React.useEffect(() => {
    axios.get(`${API_URL}/api/settings/proxy`).then(r => {
      const url = r.data.proxy_url || '';
      setProxyUrl('');
    }).catch(() => {});
    const fetchBotStatus = () => { axios.get(`${API_URL}/api/bot-status`).then(r => setBotStatus(r.data)).catch(() => {}); };
    fetchBotStatus();
    const interval = setInterval(fetchBotStatus, 30000);
    axios.get(`${API_URL}/api/settings/bot-token`).then(r => { setMaskedToken(r.data.token); }).catch(() => {});
    axios.get(`${API_URL}/api/settings/system`).then(r => { setChatId(r.data.telegram_chat_id || ''); }).catch(() => {});
    return () => clearInterval(interval);
  }, []);

  const handleSaveBotToken = async () => {
    if (!botToken.trim()) return;
    setSavingToken('saving');
    try {
      await axios.put(`${API_URL}/api/settings/bot-token`, { token: botToken.trim() });
      setSavingToken('saved');
      setMaskedToken(botToken.substring(0, 4) + '••••');
      setBotToken('');
      setTimeout(() => setSavingToken('idle'), 2500);
    } catch { setSavingToken('error'); setTimeout(() => setSavingToken('idle'), 2500); }
  };

  const handleSaveProxy = async () => {
    if (!proxyUrl.trim()) return;
    setSavingProxy('saving');
    try {
      await axios.post(`${API_URL}/api/settings/proxy`, { proxy_url: proxyUrl.trim() || null });
      setSavingProxy('saved');
      setProxyUrl('');
      setTimeout(() => setSavingProxy('idle'), 2500);
    } catch { setSavingProxy('error'); setTimeout(() => setSavingProxy('idle'), 2500); }
  };

  if (loading) return <div className="text-center py-8 text-gray-400">Загрузка...</div>;

  return (
    <form autoComplete="off" onSubmit={e => e.preventDefault()}>
    <section className="bg-white border rounded-xl p-4">
      <h3 className="font-semibold text-sm mb-4">🤖 Telegram-бот</h3>
      <div className="space-y-4">
        {/* Status */}
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${botStatus?.ok ? 'bg-green-100 text-green-700' : botStatus?.error === 'Bot not started yet' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
            {botStatus?.ok ? '● Работает' : botStatus?.error === 'Bot not started yet' ? '◌ Запускается' : '● Нет связи'}
          </span>
          {botStatus?.username && <span className="text-sm text-gray-500">@{botStatus.username}</span>}
          {botStatus?.ok && botStatus.uptime_sec !== null && <span className="text-xs text-gray-400">Uptime: {botStatus.uptime_sec < 3600 ? `${Math.floor(botStatus.uptime_sec / 60)} мин` : `${(botStatus.uptime_sec / 3600).toFixed(1)} ч`}</span>}
        </div>

        {/* Token */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Bot Token</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
              onFocus={e => e.target.removeAttribute('readonly')}
              placeholder={maskedToken || 'Новый токен'}
              autoComplete="new-password"
              name="tf_bt"
              readOnly
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
            />
            <button onClick={handleSaveBotToken} disabled={savingToken === 'saving' || !botToken.trim()} className={`px-3 py-2 rounded-lg text-sm font-medium transition ${savingToken === 'saved' ? 'bg-green-600 text-white' : savingToken === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
              {savingToken === 'saving' ? '⏳' : savingToken === 'saved' ? '✓' : savingToken === 'error' ? '✗' : '💾'}
            </button>
          </div>
        </div>

        {/* Chat ID */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Chat ID</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatId}
              onChange={e => setChatId(e.target.value)}
              onFocus={e => e.target.removeAttribute('readonly')}
              placeholder="-1001234567890"
              autoComplete="off"
              name="tf_cid"
              readOnly
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
            />
            <button
              onClick={async () => {
                try {
                  await axios.put(`${API_URL}/api/settings/system`, {
                    deadline_notify_hours: '',
                    frontend_url: '',
                    telegram_chat_id: chatId,
                    cors_origins: '',
                    bot_username: '',
                  });
                  showToast('Chat ID сохранён', 'success');
                } catch {}
              }}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition"
            >💾</button>
          </div>
        </div>

        {/* Proxy */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Прокси</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={proxyUrl}
              onChange={e => setProxyUrl(e.target.value)}
              onFocus={e => e.target.removeAttribute('readonly')}
              placeholder="Новый прокси"
              autoComplete="new-password"
              name="tf_px"
              readOnly
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
            />
            <button onClick={handleSaveProxy} disabled={savingProxy === 'saving' || !proxyUrl.trim()} className={`px-3 py-2 rounded-lg text-sm font-medium transition ${savingProxy === 'saved' ? 'bg-green-600 text-white' : savingProxy === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
              {savingProxy === 'saving' ? '⏳' : savingProxy === 'saved' ? '✓' : savingProxy === 'error' ? '✗' : '💾'}
            </button>
          </div>
        </div>
      </div>
    </section>
    </form>
  );
}

// ========== BOT INFO SECTION ==========
function BotInfoSection() {
  const [maskedToken, setMaskedToken] = React.useState<string | null>(null);
  const [botStatus, setBotStatus] = React.useState<any>(null);
  const [proxyUrl, setProxyUrl] = React.useState('');
  const [proxyCheck, setProxyCheck] = React.useState<{ checking: boolean; reachable?: boolean; error?: string; latency_ms?: number }>({ checking: false });

  React.useEffect(() => {
    axios.get(`${API_URL}/api/settings/bot-token`).then(r => setMaskedToken(r.data.token)).catch(() => {});
    axios.get(`${API_URL}/api/bot-status`).then(r => setBotStatus(r.data)).catch(() => {});
    axios.get(`${API_URL}/api/settings/proxy`).then(r => setProxyUrl(r.data.proxy_url || '')).catch(() => {});
  }, []);

  const handleCheckProxy = async () => {
    setProxyCheck({ checking: true });
    try {
      const r = await axios.get(`${API_URL}/api/settings/proxy/check`, { timeout: 20000 });
      setProxyCheck({ checking: false, ...r.data });
    } catch (e: any) { setProxyCheck({ checking: false, reachable: false, error: e?.message || 'Ошибка' }); }
  };

  const handleDeleteProxy = async () => {
    try {
      await axios.post(`${API_URL}/api/settings/proxy`, { proxy_url: null });
      setProxyUrl('');
      setProxyCheck({ checking: false });
    } catch {}
  };

  const handleDeleteBotToken = async () => {
    try {
      await axios.put(`${API_URL}/api/settings/bot-token`, { token: '' });
      setMaskedToken(null);
    } catch {}
  };

  return (
    <section className="bg-white border rounded-xl p-4">
      <h3 className="font-semibold text-sm mb-3">📋 Информация</h3>
      <div className="space-y-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">Username</p>
          <p className="text-sm text-gray-700">{botStatus?.username || 'Не настроен'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Токен</p>
          <div className="flex items-center gap-2">
            <p className="text-sm text-gray-500 font-mono truncate">{maskedToken || 'Из .env'}</p>
            <div className="flex gap-1 shrink-0">
              <div className="w-6" />
              {maskedToken && (
                <button onClick={handleDeleteBotToken} className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded" title="Удалить из БД, использовать .env">✕</button>
              )}
              {!maskedToken && <div className="w-6" />}
            </div>
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Прокси</p>
          {proxyUrl ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700 font-mono text-xs">{proxyUrl.split('@').pop() || proxyUrl}</p>
              <div className="flex gap-1">
                <button onClick={handleCheckProxy} disabled={proxyCheck.checking} className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50" title="Проверить">🔍</button>
                <button onClick={handleDeleteProxy} className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded" title="Удалить">✕</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">Не используется</p>
              <div className="flex gap-1">
                <div className="w-6" />
              </div>
            </div>
          )}
          {proxyCheck.reachable !== undefined && !proxyCheck.checking && (
            <div className={`text-xs mt-1 px-2 py-1 rounded ${proxyCheck.reachable ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {proxyCheck.reachable ? `✅ Доступен (${proxyCheck.latency_ms}мс)` : `❌ ${proxyCheck.error || 'Недоступен'}`}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const SYSTEM_TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/Kaliningrad', label: 'Калининград (UTC+2)' },
  { value: 'Europe/Moscow', label: 'Москва (UTC+3)' },
  { value: 'Europe/Samara', label: 'Самара (UTC+4)' },
  { value: 'Asia/Yekaterinburg', label: 'Екатеринбург (UTC+5)' },
  { value: 'Asia/Omsk', label: 'Омск (UTC+6)' },
  { value: 'Asia/Krasnoyarsk', label: 'Красноярск (UTC+7)' },
  { value: 'Asia/Irkutsk', label: 'Иркутск (UTC+8)' },
  { value: 'Asia/Yakutsk', label: 'Якутск (UTC+9)' },
  { value: 'Asia/Vladivostok', label: 'Владивосток (UTC+10)' },
  { value: 'Asia/Magadan', label: 'Магадан (UTC+11)' },
  { value: 'Asia/Kamchatka', label: 'Камчатка (UTC+12)' },
];

// ========== SYSTEM SETTINGS COMPONENT ==========
function SystemSettingsSection() {
  const [settings, setSettings] = React.useState({
    deadline_notify_hours: '24,3',
    frontend_url: '',
    cors_origins: '',
    default_timezone: 'UTC',
    enabled_sections: 'tasks,meetings,sprints,backlog,digest,archive,ideas,knowledge',
  });
  const [vapidEmail, setVapidEmail] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [configStatus, setConfigStatus] = React.useState<{issues: string[], warnings: string[], is_configured: boolean} | null>(null);
  const [eventStoreEnabled, setEventStoreEnabled] = React.useState(false);

  const allSections = [
    { id: 'tasks', label: 'Задачи', icon: '📋' },
    { id: 'meetings', label: 'Встречи', icon: '🤝' },
    { id: 'sprints', label: 'Спринты', icon: '🏃' },
    { id: 'backlog', label: 'Бэклог', icon: '📦' },
    { id: 'digest', label: 'Дайджест', icon: '📊' },
    { id: 'archive', label: 'Архив', icon: '🗄️' },
    { id: 'ideas', label: 'Идеи', icon: '💡' },
    { id: 'knowledge', label: 'База знаний', icon: '📚' },
  ];

  const toggleSection = (id: string) => {
    const current = settings.enabled_sections?.split(',') || [];
    if (current.includes(id)) {
      const updated = current.filter(s => s !== id);
      setSettings(s => ({ ...s, enabled_sections: updated.join(',') }));
    } else {
      const updated = [...current, id];
      setSettings(s => ({ ...s, enabled_sections: updated.join(',') }));
    }
  };

  React.useEffect(() => {
    axios.get(`${API_URL}/api/settings/system`)
      .then(r => setSettings({
        deadline_notify_hours: r.data.deadline_notify_hours || '24,3',
        frontend_url: r.data.frontend_url || '',
        cors_origins: r.data.cors_origins || '',
        enabled_sections: r.data.enabled_sections || 'tasks,meetings,sprints,backlog,digest,archive,ideas,knowledge',
        default_timezone: r.data.default_timezone || 'UTC',
      }))
      .catch(() => {})
      .finally(() => setLoading(false));
    axios.get(`${API_URL}/api/settings/config-status`)
      .then(r => setConfigStatus(r.data))
      .catch(() => {});
    // Load VAPID email
    axios.get(`${API_URL}/api/push/config`)
      .then(r => {
        if (r.data.claims_email) {
          setVapidEmail(r.data.claims_email);
        }
      })
      .catch(() => {});
    // Load event store status
    axios.get(`${API_URL}/api/events/enabled`)
      .then(r => setEventStoreEnabled(r.data.enabled))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving('saving');
    try {
      // Save system settings
      await axios.put(`${API_URL}/api/settings/system`, {
        ...settings,
        telegram_chat_id: '',
        bot_username: '',
      });
      // Save VAPID email
      if (vapidEmail && vapidEmail.includes('@')) {
        await axios.put(`${API_URL}/api/push/config`, { claims_email: vapidEmail });
      }
      setSaving('saved');
      setTimeout(() => setSaving('idle'), 2500);
    } catch {
      setSaving('error');
      setTimeout(() => setSaving('idle'), 2500);
    }
  };

  const toggleHour = (hour: number) => {
    const current = settings.deadline_notify_hours.split(',').map(Number).filter(Boolean);
    if (current.includes(hour)) {
      const updated = current.filter(h => h !== hour);
      setSettings(prev => ({ ...prev, deadline_notify_hours: updated.sort((a, b) => b - a).join(',') }));
    } else {
      const updated = [...current, hour];
      setSettings(prev => ({ ...prev, deadline_notify_hours: updated.sort((a, b) => b - a).join(',') }));
    }
  };

  const presetHours = [
    { value: 72, label: '3 дня' },
    { value: 48, label: '2 дня' },
    { value: 24, label: '1 день' },
    { value: 12, label: '12 часов' },
    { value: 6, label: '6 часов' },
    { value: 3, label: '3 часа' },
    { value: 1, label: '1 час' },
  ];
  const selectedHours = settings.deadline_notify_hours.split(',').map(Number).filter(Boolean);

  if (loading) return <div className="text-center py-8 text-gray-400">Загрузка...</div>;

  return (
    <section className="bg-white border rounded-xl p-4">
      <h3 className="font-semibold text-sm mb-3">⚙️ Системные</h3>
      <div className="space-y-4">
        {/* Deadline notifications */}
        <div>
          <label className="text-xs text-gray-500 block mb-2">Уведомления о дедлайнах</label>
          <div className="flex flex-wrap gap-2">
            {presetHours.map(h => (
              <button
                key={h.value}
                onClick={() => toggleHour(h.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  selectedHours.includes(h.value)
                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
          {selectedHours.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">Уведомления отключены</p>
          )}
        </div>

        {/* Enabled Sections */}
        <div>
          <label className="text-xs text-gray-500 block mb-2">Разделы в навигации</label>
          <div className="flex flex-wrap gap-2">
            {allSections.map(section => {
              const current = settings.enabled_sections?.split(',') || [];
              const isEnabled = current.includes(section.id);
              return (
                <button
                  key={section.id}
                  onClick={() => toggleSection(section.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    isEnabled
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'bg-gray-100 border-gray-200 text-gray-400 hover:border-blue-300'
                  }`}
                >
                  {section.icon} {section.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Default timezone */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">🕐 Часовой пояс по умолчанию</label>
          <select
            value={settings.default_timezone}
            onChange={e => setSettings(prev => ({ ...prev, default_timezone: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
          >
            {SYSTEM_TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">Будет назначен новым пользователям при регистрации</p>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">URL приложения</label>
          <div className="flex gap-2">
            <input type="text" value={settings.frontend_url} onChange={e => setSettings(prev => ({ ...prev, frontend_url: e.target.value }))} placeholder={window.location.origin} className="flex-1 px-3 py-2 border rounded-lg text-sm font-mono" />
            <button
              onClick={() => setSettings(prev => ({ ...prev, frontend_url: window.location.origin }))}
              className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 whitespace-nowrap"
              title="Вставить текущий URL"
            >← Текущий</button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Полный URL с портом: <code className="text-gray-500">{window.location.origin}</code>.
            Используется в ссылках из бота и push-уведомлений.
            Смена вступит в силу после перезапуска бэкенда.
          </p>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">CORS Origins (по одному на строку)</label>
          <textarea 
            value={settings.cors_origins} 
            onChange={e => setSettings(prev => ({ ...prev, cors_origins: e.target.value }))} 
            placeholder={`${window.location.origin}\nhttp://localhost:5180`}
            rows={4}
            className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">
            По одному origin на строку. Текущий: <code className="text-gray-500">{window.location.origin}</code>
          </p>
        </div>
        {/* VAPID email for Web Push */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">📧 Email для Push-уведомлений (VAPID)</label>
          <input
            type="email"
            value={vapidEmail}
            onChange={e => setVapidEmail(e.target.value)}
            placeholder={`mail@${window.location.hostname}`}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">
            Требуется Apple для Web Push на iOS. По умолчанию: <code className="text-gray-500">mail@{window.location.hostname}</code>
          </p>
        </div>
        {/* Event Store toggle */}
        <div className="flex items-center justify-between py-2 border-t mt-3">
          <div>
            <p className="text-sm font-medium">📋 Журнал событий</p>
            <p className="text-xs text-gray-500">Записывать изменения задач в БД</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              const newVal = !eventStoreEnabled;
              setEventStoreEnabled(newVal);
              try {
                await axios.put(`${API_URL}/api/settings/system`, {
                  event_store_enabled: newVal ? 'true' : 'false',
                });
              } catch { setEventStoreEnabled(!newVal); }
            }}
            className={`w-12 h-6 rounded-full transition ${eventStoreEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow transform transition ${eventStoreEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>
        {configStatus && !configStatus.is_configured && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-medium text-red-700 mb-1">⚠️ Требуется настройка:</p>
            <ul className="text-xs text-red-600 space-y-1">
              {configStatus.issues.map((issue: string, i: number) => <li key={i}>• {issue}</li>)}
            </ul>
          </div>
        )}
        {configStatus && configStatus.warnings.length > 0 && (
          <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <ul className="text-xs text-yellow-700 space-y-1">
              {configStatus.warnings.map((w: string, i: number) => <li key={i}>⚠️ {w}</li>)}
            </ul>
          </div>
        )}
        <button onClick={handleSave} disabled={saving === 'saving'} className={`w-full py-2 rounded-lg text-sm font-medium transition ${saving === 'saved' ? 'bg-green-600 text-white' : saving === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
          {saving === 'saving' ? '⏳ Сохранение...' : saving === 'saved' ? '✓ Сохранено' : saving === 'error' ? '✗ Ошибка' : '💾 Сохранить'}
        </button>
      </div>
    </section>
  );
}

// ========== OAUTH SETTINGS COMPONENT ==========
function OAuthSettingsSection() {
  const [oauth, setOauth] = React.useState({
    google_client_id: '', google_client_secret: '', google_redirect_uri: '',
    yandex_client_id: '', yandex_client_secret: '', yandex_redirect_uri: '',
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  React.useEffect(() => {
    axios.get(`${API_URL}/api/auth/oauth-settings`)
      .then(r => setOauth(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving('saving');
    try {
      await axios.put(`${API_URL}/api/auth/oauth-settings`, oauth);
      setSaving('saved');
      setTimeout(() => setSaving('idle'), 2500);
    } catch {
      setSaving('error');
      setTimeout(() => setSaving('idle'), 2500);
    }
  };

  if (loading) return <div className="text-center py-8 text-gray-400">Загрузка...</div>;

  return (
    <section className="bg-white border rounded-xl p-5">
      <h3 className="font-semibold text-base mb-4">🔐 OAuth (Google / Yandex)</h3>
      <div className="space-y-6">
        {/* Google */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Google</h4>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Client ID</label>
              <input type="text" value={oauth.google_client_id} onChange={e => setOauth(prev => ({ ...prev, google_client_id: e.target.value }))} placeholder="xxxx.apps.googleusercontent.com" className="w-full px-3 py-2 border rounded-lg text-sm" autoComplete="off" name="google_client_id_field" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Client Secret</label>
              <input type="password" value={oauth.google_client_secret} onChange={e => setOauth(prev => ({ ...prev, google_client_secret: e.target.value }))} placeholder="GOCSPX-..." className="w-full px-3 py-2 border rounded-lg text-sm" autoComplete="new-password" name="google_client_secret_field" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Redirect URI <span className="text-gray-400">(скопируй в Google Console)</span></label>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border rounded-lg text-sm font-mono text-gray-700 select-all">
                <span className="flex-1 truncate">{oauth.google_redirect_uri || 'https://your-domain/api/auth/google/callback'}</span>
                <button onClick={() => navigator.clipboard.writeText(oauth.google_redirect_uri || 'https://your-domain/api/auth/google/callback')} className="px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 text-xs" title="Копировать">📋</button>
              </div>
            </div>
            <button onClick={() => setOauth(prev => ({ ...prev, google_client_id: '', google_client_secret: '', google_redirect_uri: '' }))} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition">
              🗑 Очистить Google
            </button>
          </div>
        </div>

        {/* Yandex */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Яндекс</h4>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Client ID</label>
              <input type="text" value={oauth.yandex_client_id} onChange={e => setOauth(prev => ({ ...prev, yandex_client_id: e.target.value }))} placeholder="xxxxxxxxxxxxxxxx" className="w-full px-3 py-2 border rounded-lg text-sm" autoComplete="off" name="yandex_client_id_field" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Client Secret</label>
              <input type="password" value={oauth.yandex_client_secret} onChange={e => setOauth(prev => ({ ...prev, yandex_client_secret: e.target.value }))} placeholder="xxxxxxxxxxxxxxxx" className="w-full px-3 py-2 border rounded-lg text-sm" autoComplete="new-password" name="yandex_client_secret_field" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Redirect URI <span className="text-gray-400">(скопируй в Yandex OAuth)</span></label>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border rounded-lg text-sm font-mono text-gray-700 select-all">
                <span className="flex-1 truncate">{oauth.yandex_redirect_uri || 'https://your-domain/api/auth/yandex/callback'}</span>
                <button onClick={() => navigator.clipboard.writeText(oauth.yandex_redirect_uri || 'https://your-domain/api/auth/yandex/callback')} className="px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 text-xs" title="Копировать">📋</button>
              </div>
            </div>
            <button onClick={() => setOauth(prev => ({ ...prev, yandex_client_id: '', yandex_client_secret: '', yandex_redirect_uri: '' }))} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition">
              🗑 Очистить Яндекс
            </button>
          </div>
        </div>

<button onClick={handleSave} disabled={saving === 'saving'} className={`w-full py-2.5 rounded-lg text-sm font-medium transition ${saving === 'saved' ? 'bg-green-600 text-white' : saving === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
          {saving === 'saving' ? '⏳ Сохранение...' : saving === 'saved' ? '✓ Сохранено' : saving === 'error' ? '✗ Ошибка' : '💾 Сохранить'}
        </button>
      </div>
    </section>
  );
}

// ========== AI SETTINGS COMPONENT ==========
function AISettingsSection() {
  const [ai, setAi] = React.useState({
    ai_api_key: '',
    ai_provider: 'openrouter',
    ai_model: 'qwen/qwen3-coder:free',
    ai_custom_endpoint: '',
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [freeModels, setFreeModels] = React.useState<string[]>([]);
  const [paidModels, setPaidModels] = React.useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [showCustom, setShowCustom] = React.useState(false);
  const [showFree, setShowFree] = React.useState(true);
  const [showPaid, setShowPaid] = React.useState(true);

  React.useEffect(() => {
    axios.get(`${API_URL}/api/settings/ai`)
      .then(r => {
        const data = r.data;
        setAi({
          ai_api_key: data.ai_api_key || '',
          ai_provider: data.ai_provider || 'openrouter',
          ai_model: data.ai_model || 'qwen/qwen3-coder:free',
          ai_custom_endpoint: data.ai_custom_endpoint || '',
        });
        setShowCustom(data.ai_provider === 'custom');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadModels = async () => {
    if (!ai.ai_api_key && ai.ai_provider !== 'custom') {
      showToast('Сначала введите API ключ', 'warning');
      return;
    }
    if (ai.ai_provider === 'custom' && !ai.ai_custom_endpoint) {
      showToast('Введите кастомный endpoint', 'warning');
      return;
    }
    setModelsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/ai/models`, {
        params: {
          provider: ai.ai_provider,
          custom_endpoint: ai.ai_custom_endpoint,
        },
        headers: { 'X-API-Key': ai.ai_api_key },
      });
      if (ai.ai_provider === 'custom') {
        setFreeModels(res.data.models || []);
        setPaidModels([]);
      } else {
        setFreeModels(res.data.free_models || []);
        setPaidModels(res.data.paid_models || []);
      }
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка загрузки моделей', 'error');
    } finally {
      setModelsLoading(false);
    }
  };

  React.useEffect(() => {
    if ((ai.ai_api_key || ai.ai_provider === 'custom') && (ai.ai_provider !== 'custom' || ai.ai_custom_endpoint)) {
      loadModels();
    }
  }, [ai.ai_provider, ai.ai_custom_endpoint]);

  const handleSave = async () => {
    setSaving('saving');
    try {
      await axios.post(`${API_URL}/api/settings/ai`, ai);
      setSaving('saved');
      setTimeout(() => setSaving('idle'), 2500);
    } catch {
      setSaving('error');
      setTimeout(() => setSaving('idle'), 2500);
    }
  };

  if (loading) return <div className="text-center py-8 text-gray-400">Загрузка...</div>;

  const providers = [
    { value: 'openrouter', label: 'OpenRouter (рекомендуется, много бесплатных моделей)' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'custom', label: 'Свой (OpenAI-совместимый)' },
  ];

  const defaultModels: Record<string, string[]> = {
    openrouter: ['qwen/qwen3-coder:free', 'google/gemma-3n-e4b-it:free', 'meta-llama/llama-3.1-8b-instruct:free', 'mistralai/mistral-nemo-minitron-8b:free'],
    openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    anthropic: ['claude-3-haiku', 'claude-3-sonnet', 'claude-3-opus'],
  };

  const availableModels = (freeModels.length > 0 || paidModels.length > 0) 
    ? [...(showFree ? freeModels : []), ...(showPaid ? paidModels : [])]
    : (defaultModels[ai.ai_provider] || []);

  const totalFree = freeModels.length || defaultModels[ai.ai_provider]?.filter(m => m.includes(':free')).length || 0;
  const totalPaid = paidModels.length || 0;

  return (
    <section className="bg-white border rounded-xl p-5">
      <h3 className="font-semibold text-base mb-4">🤖 AI Настройки</h3>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Провайдер</label>
          <select
            value={ai.ai_provider}
            onChange={e => {
              const prov = e.target.value;
              setAi(prev => ({ ...prev, ai_provider: prov, ai_model: '' }));
              setShowCustom(prov === 'custom');
            }}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            {providers.map(p => (<option key={p.value} value={p.value}>{p.label}</option>))}
          </select>
        </div>

        {showCustom && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">Custom Endpoint (OpenAI-совместимый)</label>
            <input
              type="text"
              value={ai.ai_custom_endpoint}
              onChange={e => setAi(prev => ({ ...prev, ai_custom_endpoint: e.target.value }))}
              placeholder="https://api.example.com/v1"
              className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
            />
          </div>
        )}

        {!showCustom && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">API Key</label>
            <input
              type="password"
              value={ai.ai_api_key}
              onChange={e => setAi(prev => ({ ...prev, ai_api_key: e.target.value }))}
              placeholder={ai.ai_provider === 'openrouter' ? 'sk-or-v1-...' : 'sk-...'}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              autoComplete="new-password"
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-500">Модель</label>
            <button
              onClick={loadModels}
              disabled={modelsLoading}
              className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
            >
              {modelsLoading ? 'Загрузка...' : '🔄 Обновить'}
            </button>
          </div>
          
          {(freeModels.length > 0 || paidModels.length > 0) && ai.ai_provider === 'openrouter' && (
            <div className="flex gap-4 mb-2 text-xs">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showFree} onChange={e => setShowFree(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                <span className="text-green-600">Бесплатные ({totalFree})</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showPaid} onChange={e => setShowPaid(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                <span className="text-blue-600">Платные ({totalPaid})</span>
              </label>
            </div>
          )}
          
          <select
            value={ai.ai_model}
            onChange={e => setAi(prev => ({ ...prev, ai_model: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">-- Выберите модель --</option>
            {availableModels.map(m => (
              <option key={m} value={m}>{m}{m.includes(':free') ? ' (бесплатно)' : ''}</option>
            ))}
          </select>
          
          {(freeModels.length > 0 || paidModels.length > 0) && (
            <p className="text-xs text-green-600 mt-1">
              ✓ Загружено: {totalFree} бесплатных, {totalPaid} платных
            </p>
          )}
        </div>

        <button onClick={handleSave} disabled={saving === 'saving'} className={`w-full py-2.5 rounded-lg text-sm font-medium transition ${saving === 'saved' ? 'bg-green-600 text-white' : saving === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
          {saving === 'saving' ? '⏳ Сохранение...' : saving === 'saved' ? '✓ Сохранено' : saving === 'error' ? '✗ Ошибка' : '💾 Сохранить'}
        </button>
      </div>
    </section>
  );
}

// ========== API KEYS COMPONENT ==========
function ApiKeysSection() {
  const queryClient = useQueryClient();
  const [showNewKey, setShowNewKey] = React.useState(false);
  const [newKeyName, setNewKeyName] = React.useState('');
  const [newKeyDesc, setNewKeyDesc] = React.useState('');
  const [generatedKey, setGeneratedKey] = React.useState<string | null>(null);

  const { data: apiKeys = [] } = useQuery<ApiKey[]>({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/api/api-keys`);
      return res.data;
    },
  });

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
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
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
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      showToast('Ключ удалён', 'success');
    } catch {
      showToast('Ошибка при удалении', 'error');
    }
  };

  const handleToggleKey = async (key: ApiKey) => {
    try {
      await axios.patch(`${API_URL}/api/api-keys/${key.id}`, {
        is_active: !key.is_active,
      });
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
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
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
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

  return (
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
        {apiKeys.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Нет API-ключей</p>
        ) : (
          apiKeys.map(key => (
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
                <div className="text-xs text-gray-400 mt-1 font-mono">
                  {key.key}...
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
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
          ))
        )}
      </div>
    </section>
  );
}

// ========== REGISTRATION SETTINGS COMPONENT ==========
function RegistrationSettingsSection() {
  const [inviteOnly, setInviteOnly] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<'idle' | 'saving' | 'saved'>('idle');

  React.useEffect(() => {
    axios.get(`${API_URL}/api/auth/registration-settings`)
      .then(r => setInviteOnly(r.data.invite_only))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async () => {
    const newValue = !inviteOnly;
    setInviteOnly(newValue);
    setSaving('saving');
    try {
      await axios.put(`${API_URL}/api/auth/registration-settings`, { invite_only: newValue });
      setSaving('saved');
      setTimeout(() => setSaving('idle'), 2000);
    } catch {
      setInviteOnly(!newValue);
      setSaving('idle');
    }
  };

  if (loading) return <div className="text-center py-4 text-gray-400">Загрузка...</div>;

  return (
    <section className="bg-white border rounded-xl p-5">
      <h3 className="font-semibold text-base mb-4">🔒 Регистрация</h3>
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <p className="font-medium text-gray-800">Только по приглашениям</p>
          <p className="text-xs text-gray-500">Новые пользователи смогут зарегистрироваться только по приглашению</p>
        </div>
        <button
          onClick={handleToggle}
          className={`relative w-12 h-6 rounded-full transition ${inviteOnly ? 'bg-blue-600' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition ${inviteOnly ? 'left-7' : 'left-1'}`} />
        </button>
      </div>
      {saving === 'saved' && <p className="text-xs text-green-600 mt-2">Сохранено</p>}
    </section>
  );
}

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

  const ROLE_LABELS: Record<string, string> = {
    owner: '👑 Владелец',
    admin: '🔹 Админ',
    member: '👤 Участник',
    viewer: '👁 Наблюдатель',
  };

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

// ========== TEAM MANAGEMENT COMPONENT ==========
function TeamManagementSection() {
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = React.useState(false);
  const [inviteUsername, setInviteUsername] = React.useState('');
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState('member');
  const [generatedInvite, setGeneratedInvite] = React.useState<TeamInvite | null>(null);
  const [myUserId, setMyUserId] = React.useState<number | null>(() => {
    const saved = localStorage.getItem('teamflow_my_user_id');
    return saved ? Number(saved) : null;
  });
  const [myRole, setMyRole] = React.useState<string | null>(null);
  const [isLoadingRole, setIsLoadingRole] = React.useState(true);

  // Загрузка участников команды
  const { data: teamMembers = [], isLoading: teamMembersLoading } = useQuery<TeamMember[]>({
    queryKey: ['team-members'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/api/auth/team`);
      return res.data as TeamMember[];
    },
  });

  // Загрузка моей роли
  React.useEffect(() => {
    if (teamMembers && myUserId) {
                  const me = teamMembers.find(m => m.user?.id === myUserId);
      setMyRole(me?.role || null);
      setIsLoadingRole(false);
    } else if (teamMembers && !myUserId) {
      setIsLoadingRole(false);
    }
  }, [teamMembers, myUserId]);

  const canManage = !isLoadingRole && (myRole === 'owner' || myRole === 'admin');

  const { data: invites = [], isLoading: invitesLoading } = useQuery({
    queryKey: ['team-invites'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/api/auth/team/invites`);
      return res.data as TeamInvite[];
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: number) => {
      await axios.delete(`${API_URL}/api/auth/team/members/${memberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      showToast('Участник удалён из команды', 'success');
    },
    onError: () => showToast('Ошибка при удалении участника', 'error'),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: number; role: string }) => {
      await axios.patch(`${API_URL}/api/auth/team/members/${memberId}/role?new_role=${role}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      showToast('Роль участника обновлена', 'success');
    },
    onError: () => showToast('Ошибка при обновлении роли', 'error'),
  });

  const cancelInviteMutation = useMutation({
    mutationFn: async (inviteId: number) => {
      await axios.delete(`${API_URL}/api/auth/team/invites/${inviteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invites'] });
      showToast('Приглашение отменено', 'success');
    },
    onError: () => showToast('Ошибка при отмене приглашения', 'error'),
  });

  const createInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await axios.post(`${API_URL}/api/auth/team/invite`, {
        telegram_username: inviteUsername || null,
        email: inviteEmail || null,
        role: inviteRole,
      });
      return res.data as TeamInvite;
    },
    onSuccess: (data) => {
      setGeneratedInvite(data);
      queryClient.invalidateQueries({ queryKey: ['team-invites'] });
      showToast('Приглашение создано', 'success');
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка при создании приглашения', 'error'),
  });

  const handleCreateInvite = () => {
    if (!inviteUsername.trim() && !inviteEmail.trim()) {
      showToast('Укажите username или email', 'warning');
      return;
    }
    createInviteMutation.mutate();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Скопировано в буфер', 'success');
    } catch {
      showToast('Не удалось скопировать', 'error');
    }
  };

  const getDisplayName = (member: TeamMember) => {
    if (member.user?.display_name) return member.user.display_name;
    if (member.user?.username) return `@${member.user.username}`;
    return `User #${member.telegram_user_id}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-800">Участники команды</h3>
        {canManage && (
          <button
            onClick={() => {
              setShowInviteModal(true);
              setGeneratedInvite(null);
              setInviteUsername('');
              setInviteEmail('');
              setInviteRole('member');
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            + Пригласить
          </button>
        )}
      </div>

      {!canManage && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          🔒 Только владелец и администраторы могут управлять командой
        </div>
      )}

      {/* Участники */}
      <section className="bg-white border rounded-xl p-5 mb-6">
        {teamMembersLoading ? (
          <div className="text-center py-8 text-gray-400">Загрузка...</div>
        ) : teamMembers.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="mb-2">В команде пока нет участников</p>
            <p className="text-sm">Пригласите первого участника</p>
          </div>
        ) : (
          <div className="space-y-3">
            {teamMembers.map((member) => (
              <div key={member.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                    {getDisplayName(member).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800 truncate">{getDisplayName(member)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${ROLE_COLORS[member.role]}`}>
                        {ROLE_LABELS[member.role]}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      В команде с {parseUTC(member.joined_at).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {member.user?.username && <span className="ml-2">· @{member.user.username}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:ml-auto">
                  {canManage ? (
                    <>
                      <select
                        value={member.role}
                        onChange={(e) => updateRoleMutation.mutate({ memberId: member.id, role: e.target.value })}
                        className="px-3 py-1.5 border rounded-lg text-sm bg-white hover:border-blue-400 transition"
                      >
                        {Object.entries(ROLE_LABELS).map(([role, label]) => (
                          <option key={role} value={role}>{label.replace(/👑|🔹|👤|👁 /, '')}</option>
                        ))}
                      </select>
                      {member.role !== 'owner' && (
                        <button
                          onClick={() => { if (confirm(`Удалить ${getDisplayName(member)} из команды?`)) removeMemberMutation.mutate(member.id); }}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                          title="Удалить из команды"
                        >🗑️</button>
                      )}
                    </>
                  ) : (
                    <span className={`text-xs px-2 py-1 rounded-full border ${ROLE_COLORS[member.role]}`}>
                      {ROLE_LABELS[member.role]}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Приглашения */}
      <section className="bg-white border rounded-xl p-5">
        <h4 className="text-md font-semibold text-gray-800 mb-4">Активные приглашения</h4>
        {invitesLoading ? (
          <div className="text-center py-8 text-gray-400">Загрузка...</div>
        ) : invites.length === 0 ? (
          <div className="text-center py-8 text-gray-400"><p>Нет активных приглашений</p></div>
        ) : (
          <div className="space-y-3">
            {invites.map((invite) => (
              <div key={invite.id} className="flex items-center gap-4 p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${ROLE_COLORS[invite.role]}`}>
                      {ROLE_LABELS[invite.role]}
                    </span>
                    {invite.telegram_username && <span className="text-sm text-gray-600">@{invite.telegram_username}</span>}
                    {invite.email && <span className="text-sm text-gray-600">{invite.email}</span>}
                  </div>
                  <div className="text-xs text-gray-400">
                    Создано: {parseUTC(invite.created_at).toLocaleDateString('ru')}
                    {invite.expires_at && <span className="ml-2">· Действует до {parseUTC(invite.expires_at).toLocaleDateString('ru')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canManage ? (
                    <>
                      <button onClick={() => copyToClipboard(invite.invite_url)} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm hover:bg-blue-100 transition" title="Скопировать ссылку">📋 Копия</button>
                      <button onClick={() => { if (confirm('Отменить это приглашение?')) cancelInviteMutation.mutate(invite.id); }} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 transition" title="Отменить приглашение">✕ Отмена</button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">📨 Пригласить участника</h3>
            {generatedInvite ? (
              <div>
                <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800 font-medium mb-2">✅ Приглашение создано!</p>
                  <p className="text-xs text-green-700 mb-2">Отправьте эту ссылку участнику:</p>
                  <div className="flex gap-2">
                    <code className="flex-1 px-3 py-2 bg-white border rounded text-xs font-mono break-all">{generatedInvite.invite_url}</code>
                    <button onClick={() => copyToClipboard(generatedInvite.invite_url)} className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 whitespace-nowrap">📋</button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowInviteModal(false); setGeneratedInvite(null); }} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">Готово</button>
                  <button onClick={() => { setGeneratedInvite(null); setInviteUsername(''); setInviteEmail(''); }} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Ещё одно</button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Telegram username (необязательно)</label>
                    <input type="text" value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} placeholder="@username" className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Email (необязательно)</label>
                    <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Роль</label>
                    <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                      {Object.entries(ROLE_LABELS).map(([role, label]) => (<option key={role} value={role}>{label}</option>))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCreateInvite} disabled={createInviteMutation.isPending} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{createInviteMutation.isPending ? 'Создание...' : 'Создать приглашение'}</button>
                  <button onClick={() => { setShowInviteModal(false); setGeneratedInvite(null); }} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">Отмена</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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

  const queryClient = useQueryClient();
  
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

  // Bot status
  const [botStatus, setBotStatus] = React.useState<{ok: boolean, username: string|null, last_seen: string|null, uptime_sec: number|null, error: string|null} | null>(null);
  React.useEffect(() => {
    const fetchBotStatus = () => { axios.get(`${API_URL}/api/bot-status`).then(r => setBotStatus(r.data)).catch(() => setBotStatus({ ok: false, username: null, last_seen: null, uptime_sec: null, error: 'API недоступен' })); };
    fetchBotStatus();
    const interval = setInterval(fetchBotStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Proxy
  const [proxyUrl, setProxyUrl] = React.useState('');
  const [proxyStatus, setProxyStatus] = React.useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [proxyCheck, setProxyCheck] = React.useState<{ checking: boolean; reachable?: boolean; latency_ms?: number; error?: string }>({ checking: false });
  React.useEffect(() => { axios.get(`${API_URL}/api/settings/proxy`).then(r => setProxyUrl(r.data.proxy_url || '')).catch(() => {}); }, []);
  const handleSaveProxy = async () => { setProxyStatus('saving'); try { await axios.post(`${API_URL}/api/settings/proxy`, { proxy_url: proxyUrl || null }); setProxyStatus('saved'); setTimeout(() => setProxyStatus('idle'), 2500); } catch { setProxyStatus('error'); setTimeout(() => setProxyStatus('idle'), 2500); } };
  const handleCheckProxy = async () => { setProxyCheck({ checking: true }); try { const r = await axios.get(`${API_URL}/api/settings/proxy/check`, { timeout: 20000 }); setProxyCheck({ checking: false, ...r.data }); } catch (e: any) { setProxyCheck({ checking: false, reachable: false, error: e?.message || 'Ошибка' }); } };

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
