import React from 'react';
import axios from 'axios';
import { API_URL } from '../../constants/taskDisplay';

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
  const [configStatus] = React.useState<{issues: string[], warnings: string[], is_configured: boolean} | null>(null);
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

export default SystemSettingsSection;
