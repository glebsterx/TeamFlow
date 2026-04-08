import React, { useState, useEffect } from 'react';
import { API_URL } from '../constants/taskDisplay';
import { useTheme } from '../hooks/useTheme';

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

interface StartupCheck {
  has_users: boolean;
  bot_configured: boolean;
  ready: boolean;
}

interface SystemSettings {
  deadline_notify_hours: string;
  webapp_url: string;
  frontend_url: string;
  telegram_chat_id: string;
  cors_origins: string;
  bot_username: string;
  default_timezone: string;
}

export const SetupWizard: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Step 1: Bot token
  const [botToken, setBotToken] = useState('');
  const [showProxy, setShowProxy] = useState(false);
  const [proxyUrl, setProxyUrl] = useState('');
  const [botCheckStatus, setBotCheckStatus] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');

  // Step 2: Create admin
  const [adminLogin, setAdminLogin] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirm, setAdminConfirm] = useState('');

  // Step 3: System settings
  const [settings, setSettings] = useState<SystemSettings>({
    deadline_notify_hours: '24,3',
    webapp_url: '',
    frontend_url: '',
    telegram_chat_id: '',
    cors_origins: '',
    bot_username: '',
    default_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });

  useEffect(() => {
    fetch(`${API_URL}/api/settings/startup-check`)
      .then(r => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data: StartupCheck | null) => {
        if (!data || data.ready) {
          // Система готова или не можем проверить — уходим на главную
          window.location.href = '/';
          return;
        }
        // Определяем первый незавершённый шаг
        if (data.bot_configured && data.has_users) {
          setStep(2);
        } else if (data.bot_configured) {
          setStep(1);
        } else {
          setStep(0);
        }
        setLoading(false);
      })
      .catch(() => {
        // Не можем проверить — считаем что система готова
        window.location.href = '/';
      });
  }, []);

  const handleSaveBotToken = async () => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_URL}/api/settings/bot-token`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: botToken }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || 'Ошибка сохранения');
      }
      // Проверяем подключение бота
      setBotCheckStatus('checking');
      await new Promise(r => setTimeout(r, 2000)); // даём боту время на подключение
      try {
        const checkRes = await fetch(`${API_URL}/api/bot-status`);
        if (checkRes.ok) {
          const data = await checkRes.json();
          if (data.username || data.status === 'ok') {
            setBotCheckStatus('ok');
            setSuccess('Бот подключён! Теперь создайте администратора.');
            setTimeout(() => setStep(1), 500);
            return;
          }
        }
      } catch { /* ignore */ }
      // Бот не подключился — предлагаем прокси
      setBotCheckStatus('fail');
      setShowProxy(true);
      setError('Бот не подключился к Telegram. Если Telegram заблокирован в вашей сети — настройте прокси ниже.');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSaveProxy = async () => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_URL}/api/settings/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy_url: proxyUrl }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || 'Ошибка сохранения прокси');
      }
      setSuccess('Прокси сохранён! Перезапускаю бэкенд...');
      // Restart backend
      await fetch(`${API_URL}/api/settings/restart/backend`, { method: 'POST' }).catch(() => {});
      // Wait for restart and check again
      await new Promise(r => setTimeout(r, 5000));
      setBotCheckStatus('checking');
      await new Promise(r => setTimeout(r, 3000));
      try {
        const checkRes = await fetch(`${API_URL}/api/bot-status`);
        if (checkRes.ok) {
          const data = await checkRes.json();
          if (data.username || data.status === 'ok') {
            setBotCheckStatus('ok');
            setSuccess('Бот подключён через прокси! Создаю администратора...');
            setTimeout(() => setStep(1), 1000);
            return;
          }
        }
      } catch { /* ignore */ }
      setBotCheckStatus('fail');
      setError('Бот всё ещё не подключается. Проверьте прокси и токен.');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleCreateAdmin = async () => {
    setError('');
    setSuccess('');
    if (adminPassword !== adminConfirm) {
      setError('Пароли не совпадают');
      return;
    }
    if (adminPassword.length < 6) {
      setError('Пароль минимум 6 символов');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/auth/local/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: adminLogin,
          password: adminPassword,
          email: '',
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || 'Ошибка создания');
      }
      const data = await res.json();
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      localStorage.setItem('teamflow_account_id', String(data.user.id));
      localStorage.setItem('teamflow_my_user_id', String(data.user.id));
      setSuccess('Администратор создан!');
      setStep(2);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSaveSettings = async () => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_URL}/api/settings/system`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error('Ошибка сохранения');
      setSuccess('Настройки сохранены!');
      setTimeout(() => {
        window.location.href = '/';
      }, 1000);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const ThemeIcon = () => {
    if (theme === 'light') return <span>☀️</span>;
    if (theme === 'dark') return <span>🌙</span>;
    return <span>🔄</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Загрузка...</div>
      </div>
    );
  }

  const steps = ['Токен бота', 'Администратор', 'Настройки'];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-sm"
      >
        <ThemeIcon />
      </button>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-lg w-full">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">TeamFlow</h1>
            <p className="text-gray-600 dark:text-gray-400">Первоначальная настройка</p>
          </div>

          {/* Steps indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {steps.map((s, i) => (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition ${
                  i <= step
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                    i < step ? 'bg-white text-blue-600' : i === step ? 'bg-blue-500 text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                  }`}>
                    {i < step ? '✓' : i + 1}
                  </span>
                  <span className="hidden sm:inline">{s}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-8 h-0.5 ${i < step ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Content */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            {/* Step 0: Bot Token */}
            {step === 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Шаг 1: Telegram Bot Token</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Получите токен у <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">@BotFather</a>: создайте бота через /newbot и скопируйте токен.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bot Token</label>
                  <input
                    type="text"
                    value={botToken}
                    onChange={e => setBotToken(e.target.value)}
                    placeholder="123456:ABC-DEF..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                {botCheckStatus === 'checking' && (
                  <div className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    Проверяю подключение бота...
                  </div>
                )}
                {botCheckStatus === 'ok' && (
                  <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                    ✅ Бот подключён!
                  </div>
                )}
                {/* Proxy section (always visible for manual config, or shown when bot fails to connect) */}
                {(showProxy || botCheckStatus === 'fail') && (
                  <div className="border border-orange-200 dark:border-orange-800 rounded-lg p-4 bg-orange-50 dark:bg-orange-900/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-300">🔧 Прокси (если Telegram заблокирован)</h3>
                      <button onClick={() => setShowProxy(false)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      SOCKS5: <code className="bg-white dark:bg-gray-800 px-1 rounded">socks5://user:pass@host:port</code>
                    </p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proxy URL</label>
                      <input
                        type="text"
                        value={proxyUrl}
                        onChange={e => setProxyUrl(e.target.value)}
                        placeholder="socks5://user:pass@proxy.example.com:1080"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                      />
                    </div>
                    <button
                      onClick={handleSaveProxy}
                      disabled={!proxyUrl}
                      className="w-full py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white font-medium rounded-lg transition"
                    >
                      Сохранить прокси и проверить
                    </button>
                  </div>
                )}
                {!showProxy && botCheckStatus !== 'fail' && (
                  <button
                    onClick={() => setShowProxy(true)}
                    className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    🔧 Настроить прокси (опционально)
                  </button>
                )}
                <button
                  onClick={handleSaveBotToken}
                  disabled={!botToken}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium rounded-lg transition"
                >
                  Сохранить и проверить
                </button>
                <button
                  onClick={() => setStep(1)}
                  className="w-full py-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
                >
                  Пропустить →
                </button>
              </div>
            )}

            {/* Step 1: Create Admin */}
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Шаг 2: Создание администратора</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Создайте первую учётную запись. Она получит права администратора.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Логин</label>
                  <input
                    type="text"
                    value={adminLogin}
                    onChange={e => setAdminLogin(e.target.value)}
                    placeholder="admin"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Пароль</label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    placeholder="Минимум 6 символов"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Подтверждение пароля</label>
                  <input
                    type="password"
                    value={adminConfirm}
                    onChange={e => setAdminConfirm(e.target.value)}
                    placeholder="Повторите пароль"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <button
                  onClick={handleCreateAdmin}
                  disabled={!adminLogin || !adminPassword}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium rounded-lg transition"
                >
                  Создать администратора
                </button>
              </div>
            )}

            {/* Step 2: System Settings */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Шаг 3: Системные настройки</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Настройте уведомления и URL. Можно оставить по умолчанию и изменить позже в настройках.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Уведомления о дедлайнах (часы)</label>
                  <input
                    type="text"
                    value={settings.deadline_notify_hours}
                    onChange={e => setSettings(s => ({ ...s, deadline_notify_hours: e.target.value }))}
                    placeholder="24,3"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">Через сколько часов до дедлайна уведомлять (через запятую)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">🕐 Часовой пояс по умолчанию</label>
                  <select
                    value={settings.default_timezone}
                    onChange={e => setSettings(s => ({ ...s, default_timezone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {SYSTEM_TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Определён из браузера. Будет назначен новым пользователям.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL приложения (BASE_URL)</label>
                  <input
                    type="text"
                    value={settings.frontend_url}
                    onChange={e => setSettings(s => ({ ...s, frontend_url: e.target.value }))}
                    placeholder="http://localhost:5180"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Telegram Chat ID (опционально)</label>
                  <input
                    type="text"
                    value={settings.telegram_chat_id}
                    onChange={e => setSettings(s => ({ ...s, telegram_chat_id: e.target.value }))}
                    placeholder="-1001234567890"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CORS Origins (через запятую)</label>
                  <input
                    type="text"
                    value={settings.cors_origins}
                    onChange={e => setSettings(s => ({ ...s, cors_origins: e.target.value }))}
                    placeholder="http://localhost:5180,http://example.com:5180"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <button
                  onClick={handleSaveSettings}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition"
                >
                  Завершить настройку → TeamFlow
                </button>
              </div>
            )}

            {/* Messages */}
            {error && (
              <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded text-sm">{error}</div>
            )}
            {success && (
              <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 px-4 py-3 rounded text-sm">{success}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
