import React, { useState } from 'react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { API_URL } from '../constants/taskDisplay';
import { showToast } from '../utils/toast';
import { parseUTC } from '../utils/dateUtils';

const TIMEZONES = [
  { value: 'Europe/Moscow', label: 'Москва (UTC+3)' },
  { value: 'Europe/Kaliningrad', label: 'Калининград (UTC+2)' },
  { value: 'Europe/Samara', label: 'Самара (UTC+4)' },
  { value: 'Asia/Yekaterinburg', label: 'Екатеринбург (UTC+5)' },
  { value: 'Asia/Omsk', label: 'Омск (UTC+6)' },
  { value: 'Asia/Krasnoyarsk', label: 'Красноярск (UTC+7)' },
  { value: 'Asia/Irkutsk', label: 'Иркутск (UTC+8)' },
  { value: 'Asia/Yakutsk', label: 'Якутск (UTC+9)' },
  { value: 'Asia/Vladivostok', label: 'Владивосток (UTC+10)' },
  { value: 'Asia/Magadan', label: 'Магадан (UTC+11)' },
  { value: 'Asia/Kamchatka', label: 'Камчатка (UTC+12)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (UTC+0/UTC+1)' },
  { value: 'Europe/Berlin', label: 'Berlin (UTC+1/UTC+2)' },
  { value: 'Europe/Paris', label: 'Paris (UTC+1/UTC+2)' },
  { value: 'America/New_York', label: 'New York (UTC-5/UTC-4)' },
  { value: 'America/Chicago', label: 'Chicago (UTC-6/UTC-5)' },
  { value: 'America/Denver', label: 'Denver (UTC-7/UTC-6)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (UTC-8/UTC-7)' },
  { value: 'Asia/Dubai', label: 'Dubai (UTC+4)' },
  { value: 'Asia/Tashkent', label: 'Tashkent (UTC+5)' },
  { value: 'Asia/Almaty', label: 'Almaty (UTC+6)' },
];

interface TelegramUser {
  id: number;
  id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  display_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface TeamMember {
  id: number;
  telegram_user_id: number;
  role: string;
  joined_at: string;
}

// ========== NOTIFICATION SETTINGS SECTION ==========
const PUSH_OPTIONS = [
  { key: 'assigned', label: '📌 Задачи назначены мне' },
  { key: 'status_changed', label: '🔄 Смена статуса задач' },
  { key: 'comments', label: '💬 Комментарии' },
  { key: 'deadlines', label: '⏰ Дедлайны' },
  { key: 'all_tasks', label: '📢 Все задачи (только для админа)' },
];

function NotificationSettingsSection({ accountId }: { accountId: number | null }) {
  const [settings, setSettings] = React.useState<Record<string, boolean>>({
    assigned: true,
    status_changed: true,
    comments: false,
    deadlines: true,
    all_tasks: false,
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!accountId) return;
    axios.get(`${API_URL}/api/auth/notification-settings`, {
      params: { account_id: accountId },
    }).then(r => {
      if (r.data) setSettings(r.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [accountId]);

  const toggle = async (key: string) => {
    if (!accountId) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/auth/notification-settings`, next, {
        params: { account_id: accountId },
      });
      showToast('Настройки уведомлений сохранены', 'success');
    } catch {
      showToast('Ошибка при сохранении', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-4 text-gray-400 text-sm">Загрузка...</div>;

  return (
    <section className="bg-white border rounded-xl p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">🔔 Настройки push-уведомлений</h3>
      <div className="space-y-3">
        {PUSH_OPTIONS.map(opt => (
          <label
            key={opt.key}
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
              settings[opt.key]
                ? 'bg-blue-50 border-blue-200'
                : 'bg-gray-50 border-gray-200'
            } ${saving ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <input
              type="checkbox"
              checked={settings[opt.key]}
              onChange={() => toggle(opt.key)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">{opt.label}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3">Уведомления приходят в браузер и Telegram (если подключён)</p>
    </section>
  );
}

export default function AccountPage() {
  const queryClient = useQueryClient();
  const [myAccountId, setMyAccountId] = React.useState<number | null>(() => {
    const saved = localStorage.getItem('teamflow_account_id');
    if (saved) return Number(saved);
    const tgSaved = localStorage.getItem('teamflow_my_user_id');
    return tgSaved ? Number(tgSaved) : null;
  });
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [editFirstName, setEditFirstName] = React.useState('');
  const [editLastName, setEditLastName] = React.useState('');
  const [editDisplayName, setEditDisplayName] = React.useState('');
  const [linkedAccounts, setLinkedAccounts] = React.useState<{provider: string, email?: string, linked_at?: string}[]>([]);

  const [hasLocalAccount, setHasLocalAccount] = React.useState(false);
  const [localLogin, setLocalLogin] = React.useState<string | null>(null);

  const [showSetPassword, setShowSetPassword] = React.useState(false);
  const [setLogin, setSetLogin] = React.useState('');
  const [setEmail, setSetEmail] = React.useState('');
  const [setPass, setSetPass] = React.useState('');
  const [setConfirmPass, setSetConfirmPass] = React.useState('');

  const [showChangePassword, setShowChangePassword] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [oauthProviders, setOauthProviders] = React.useState<{google: boolean, yandex: boolean}>({ google: false, yandex: false });
  const [botUsername, setBotUsername] = React.useState<string>('');
  const [telegramWaiting, setTelegramWaiting] = React.useState(false);
  const [timezone, setTimezone] = React.useState<string>(() => {
    const saved = localStorage.getItem('teamflow_timezone');
    return saved || Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  });
  const [savingTz, setSavingTz] = React.useState(false);

  const { data: user, isLoading } = useQuery<any | null>({
    queryKey: ['my-account', myAccountId],
    queryFn: async () => {
      if (!myAccountId) return null;
      try {
        const res = await axios.get(`${API_URL}/api/auth/account/me`, {
          params: { account_id: myAccountId },
        });
        return res.data;
      } catch {
        return null;
      }
    },
    enabled: !!myAccountId,
  });

  const { data: accounts } = useQuery<{provider: string, email?: string, linked_at?: string}[]>({
    queryKey: ['linked-accounts', myAccountId],
    queryFn: async () => {
      if (!myAccountId) return [];
      const res = await axios.get(`${API_URL}/api/auth/linked-accounts`, {
        params: { account_id: myAccountId },
      });
      return res.data;
    },
    enabled: !!myAccountId,
  });

  React.useEffect(() => {
    if (accounts) {
      setLinkedAccounts(accounts);
    }
  }, [accounts]);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const success = params.get('success');

    if (success === 'google_linked') {
      showToast('Google аккаунт привязан', 'success');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (success === 'yandex_linked') {
      showToast('Яндекс аккаунт привязан', 'success');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (error === 'already_linked_to_other') {
      showToast('Этот аккаунт уже привязан к другому пользователю', 'error');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (error) {
      showToast(`Ошибка: ${error}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  React.useEffect(() => {
    if (!myAccountId) return;
    axios.get(`${API_URL}/api/auth/local/account-status`, {
      params: { account_id: myAccountId },
    }).then(res => {
      setHasLocalAccount(res.data.has_local_account);
      setLocalLogin(res.data.login || null);
    }).catch(() => {});

    axios.get(`${API_URL}/api/auth/oauth-providers`)
      .then(res => setOauthProviders(res.data))
      .catch(() => {});

    axios.get(`${API_URL}/api/bot-info`)
      .then(res => setBotUsername(res.data.username || ''))
      .catch(() => {});
  }, [myAccountId]);

  const handleLinkGoogle = () => {
    const accountId = myAccountId || '';
    window.location.href = `${API_URL}/api/auth/google/link?account_id=${accountId}`;
  };

  const handleLinkYandex = () => {
    const accountId = myAccountId || '';
    window.location.href = `${API_URL}/api/auth/yandex/link?account_id=${accountId}`;
  };

  // Telegram привязка через бота
  const startTelegramLink = () => {
    const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('tg_bind_token', sessionToken);
    window.open(`https://t.me/${botUsername}?start=bind_${sessionToken}`, '_blank');
    setTelegramWaiting(true);

    const poll = setInterval(async () => {
      try {
        const resp = await fetch(`${API_URL}/api/auth/pending-login/${sessionToken}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.access_token) {
            clearInterval(poll);
            setTelegramWaiting(false);
            localStorage.removeItem('tg_bind_token');
            queryClient.invalidateQueries({ queryKey: ['linked-accounts', myAccountId] });
            queryClient.invalidateQueries({ queryKey: ['my-account', myAccountId] });
            showToast('Telegram привязан', 'success');
          }
        }
      } catch {}
    }, 2000);

    setTimeout(() => {
      clearInterval(poll);
      setTelegramWaiting(false);
      localStorage.removeItem('tg_login_token');
    }, 60000);
  };

  const [unlinkConfirm, setUnlinkConfirm] = React.useState<{provider: string, name: string} | null>(null);

  const handleUnlinkRequest = (provider: string, name: string) => {
    setUnlinkConfirm({ provider, name });
  };

  const handleUnlinkAccount = async (provider: string) => {
    const providerName = provider === 'google' ? 'Google' : provider === 'yandex' ? 'Яндекс' : provider === 'telegram' ? 'Telegram' : provider;

    try {
      await axios.delete(`${API_URL}/api/auth/unlink-account`, {
        params: { account_id: myAccountId, provider },
      });
      showToast(`${providerName} аккаунт отвязан`, 'success');
      queryClient.invalidateQueries({ queryKey: ['linked-accounts', myAccountId] });

      // Logout only if unlinking telegram AND no local password
      if (provider === 'telegram' && !hasLocalAccount) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('teamflow_account_id');
        localStorage.removeItem('teamflow_my_user_id');
        window.location.href = '/login';
      }
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Ошибка при отвязке', 'error');
    } finally {
      setUnlinkConfirm(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast('Пароль должен быть не менее 6 символов', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Пароли не совпадают', 'error');
      return;
    }
    try {
      await axios.post(`${API_URL}/api/auth/local/change-password`, {
        old_password: currentPassword,
        new_password: newPassword,
      }, {
        params: { account_id: myAccountId },
      });
      showToast('Пароль изменён', 'success');
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Ошибка при смене пароля', 'error');
    }
  };

  const handleResetPassword = () => {
    setShowChangePassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (setPass.length < 6) {
      showToast('Пароль должен быть не менее 6 символов', 'error');
      return;
    }
    if (setPass !== setConfirmPass) {
      showToast('Пароли не совпадают', 'error');
      return;
    }
    try {
      const res = await axios.post(`${API_URL}/api/auth/local/link`, {
        login: setLogin,
        password: setPass,
        email: setEmail || null,
      }, {
        params: { account_id: myAccountId },
      });
      showToast(res.data.message || 'Локальный аккаунт привязан', 'success');
      setShowSetPassword(false);
      setSetLogin('');
      setSetEmail('');
      setSetPass('');
      setSetConfirmPass('');
      setHasLocalAccount(true);
      setLocalLogin(setLogin);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Ошибка при привязке', 'error');
    }
  };

  const handleResetSetPassword = () => {
    setShowSetPassword(false);
    setSetLogin('');
    setSetEmail('');
    setSetPass('');
    setSetConfirmPass('');
  };

  React.useEffect(() => {
    if (user) {
      setEditFirstName(user.first_name);
      setEditLastName(user.last_name || '');
      setEditDisplayName(user.display_name || '');
      if (user.timezone) {
        setTimezone(user.timezone);
      }
    }
  }, [user]);

  const updateNameMutation = useMutation({
    mutationFn: async () => {
      await axios.patch(`${API_URL}/api/auth/account/profile`, {
        first_name: editFirstName.trim(),
        last_name: editLastName.trim() || null,
        display_name: editDisplayName.trim() || null,
      }, {
        params: { account_id: myAccountId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-account', myAccountId] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsEditingName(false);
      showToast('Имя обновлено', 'success');
    },
    onError: () => {
      showToast('Ошибка при обновлении имени', 'error');
    },
  });

  const handleLogout = () => {
    localStorage.removeItem('teamflow_account_id');
    localStorage.removeItem('teamflow_my_user_id');
    setMyAccountId(null);
    queryClient.clear();
    showToast('Вы вышли из аккаунта', 'success');
    window.location.pathname = '/';
  };

  const handleSaveTimezone = async (tz: string) => {
    setTimezone(tz);
    setSavingTz(true);
    try {
      await axios.patch(`${API_URL}/api/auth/account/profile`, { timezone: tz }, {
        params: { account_id: myAccountId },
      });
      localStorage.setItem('teamflow_timezone', tz);
      showToast('Часовой пояс сохранён', 'success');
    } catch {
      showToast('Ошибка при сохранении', 'error');
    } finally {
      setSavingTz(false);
    }
  };

  if (!myAccountId) {
    window.location.pathname = '/login';
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">👤 Мой аккаунт</h2>

      {isLoading ? (
        <div className="bg-white border rounded-xl p-8 text-center text-gray-400">Загрузка...</div>
      ) : user ? (
        <div className="space-y-6">
          {/* Профиль - компактный */}
          <section className="bg-white border rounded-xl p-6">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full bg-blue-500 flex items-center justify-center text-white text-xl font-bold shrink-0">
                {(user.display_name || user.first_name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-gray-800 truncate">{user.display_name}</h3>
                <p className="text-sm text-gray-500 truncate">
                  {user.telegram_username ? `@${user.telegram_username}` : user.login || ''}
                  {user.email && ` · ${user.email}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  <span>{user.is_active ? '●' : '◌'}</span>
                  <span>{user.is_active ? 'Активен' : 'Неактивен'}</span>
                </span>
                <button onClick={() => setIsEditingName(true)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Редактировать">
                  ✏️
                </button>
              </div>
            </div>

            {isEditingName ? (
              <div className="pt-4 border-t border-gray-100 space-y-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Отображаемое имя</label>
                  <input type="text" value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Как отображать ваше имя" autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Имя</label>
                    <input type="text" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Фамилия</label>
                    <input type="text" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateNameMutation.mutate()} disabled={updateNameMutation.isPending} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                    {updateNameMutation.isPending ? '⏳ Сохранение...' : '✓ Сохранить'}
                  </button>
                  <button onClick={() => { setIsEditingName(false); setEditFirstName(user.first_name); setEditLastName(user.last_name || ''); setEditDisplayName(user.display_name || ''); }} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300">
                    ✕ Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div className="pt-4 border-t border-gray-100 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400 text-xs block mb-0.5">Имя</span>
                  <span className="text-gray-700">{user.first_name}{user.last_name ? ` ${user.last_name}` : ''}</span>
                </div>
                {user.team_role && (
                  <div>
                    <span className="text-gray-400 text-xs block mb-0.5">Роль в команде</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      user.team_role === 'owner' ? 'bg-purple-100 text-purple-700' :
                      user.team_role === 'admin' ? 'bg-red-100 text-red-700' :
                      user.team_role === 'member' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {user.team_role === 'owner' ? '👑' : user.team_role === 'admin' ? '🔹' : user.team_role === 'member' ? '👤' : '👁'}
                      {user.team_role === 'owner' ? 'Владелец' : user.team_role === 'admin' ? 'Админ' : user.team_role === 'member' ? 'Участник' : 'Наблюдатель'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Привязанные аккаунты */}
          <section className="bg-white border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">🔗 Привязанные аккаунты</h3>
            </div>
            <div className="space-y-3">
              {linkedAccounts.find(a => a.provider === 'telegram') ? (
                <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">T</div>
                    <div>
                      <p className="font-medium text-gray-800">Telegram</p>
                      <p className="text-xs text-gray-500">{user.username || 'Привязан'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">✓ Привязан</span>
                    <button onClick={() => handleUnlinkRequest('telegram', 'Telegram')} className="text-xs px-3 py-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition font-medium">Отвязать</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-gray-50 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">T</div>
                    <div>
                      <p className="font-medium text-gray-800">Telegram</p>
                      <p className="text-xs text-gray-500">Войдите через бота для привязки</p>
                    </div>
                  </div>
                  {botUsername && (
                    <button onClick={startTelegramLink} disabled={telegramWaiting} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50">
                      {telegramWaiting ? 'Ожидание...' : 'Привязать'}
                    </button>
                  )}
                </div>
              )}

              {oauthProviders.google && (linkedAccounts.find(a => a.provider === 'google') ? (
                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white font-semibold">G</div>
                    <div>
                      <p className="font-medium text-gray-800">Google</p>
                      <p className="text-xs text-gray-500">{linkedAccounts.find(a => a.provider === 'google')?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">✓ Привязан</span>
                    <button onClick={() => handleUnlinkRequest('google', 'Google')} className="text-xs px-3 py-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition font-medium">Отвязать</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-gray-50 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white font-semibold">G</div>
                    <div>
                      <p className="font-medium text-gray-800">Google</p>
                      <p className="text-xs text-gray-500">Google OAuth</p>
                    </div>
                  </div>
                  <button onClick={handleLinkGoogle} className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">Привязать</button>
                </div>
              ))}

              {oauthProviders.yandex && (linkedAccounts.find(a => a.provider === 'yandex') ? (
                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center text-white font-semibold">Y</div>
                    <div>
                      <p className="font-medium text-gray-800">Яндекс</p>
                      <p className="text-xs text-gray-500">{linkedAccounts.find(a => a.provider === 'yandex')?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">✓ Привязан</span>
                    <button onClick={() => handleUnlinkRequest('yandex', 'Яндекс')} className="text-xs px-3 py-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition font-medium">Отвязать</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-gray-50 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center text-white font-semibold">Y</div>
                    <div>
                      <p className="font-medium text-gray-800">Яндекс</p>
                      <p className="text-xs text-gray-500">Yandex OAuth</p>
                    </div>
                  </div>
                  <button onClick={handleLinkYandex} className="text-xs px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition">Привязать</button>
                </div>
              ))}
            </div>
          </section>

          {/* Локальная аутентификация */}
          <section className="bg-white border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">🔐 Локальная аутентификация</h3>
            {hasLocalAccount ? (
              <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white font-semibold">✓</div>
                  <div>
                    <p className="font-medium text-gray-800">Логин и пароль настроены</p>
                    <p className="text-xs text-gray-500">Логин: {localLogin || '—'}</p>
                  </div>
                </div>
                <button onClick={() => setShowChangePassword(true)} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium">🔑 Сменить пароль</button>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 bg-gray-50 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-500 flex items-center justify-center text-white font-semibold">🔐</div>
                  <div>
                    <p className="font-medium text-gray-800">Логин и пароль не настроены</p>
                    <p className="text-xs text-gray-500">Можно добавить для входа без Telegram</p>
                  </div>
                </div>
                <button onClick={() => setShowSetPassword(true)} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">Настроить</button>
              </div>
            )}
          </section>

          {/* Активность */}
          <section className="bg-white border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">🕐 Активность</h3>
            <div className="space-y-3">
              {user.created_at && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Дата регистрации</label>
                  <div className="px-3 py-2 bg-gray-50 border rounded-lg text-sm text-gray-700">
                    {parseUTC(user.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )}
              {user.updated_at && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Последняя активность</label>
                  <div className="px-3 py-2 bg-gray-50 border rounded-lg text-sm text-gray-700">
                    {parseUTC(user.updated_at).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )}
              {!user.created_at && !user.updated_at && (
                <div className="text-sm text-gray-500 text-center py-4">
                  Информация о дате регистрации и последней активности будет доступна в будущих обновлениях
                </div>
              )}
            </div>
          </section>

          {/* Часовой пояс */}
          <section className="bg-white border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">🕐 Часовой пояс</h3>
            <div className="flex items-center gap-3">
              <select
                value={timezone}
                onChange={(e) => handleSaveTimezone(e.target.value)}
                disabled={savingTz}
                className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white disabled:opacity-50"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
              {savingTz && <span className="text-sm text-gray-400">⏳</span>}
            </div>
            <p className="text-xs text-gray-400 mt-2">Используется для отображения дат и уведомлений о дедлайнах</p>
          </section>

          {/* Настройки уведомлений */}
          <NotificationSettingsSection accountId={myAccountId} />

          {/* Выход */}
          <div className="pt-4 border-t">
            <button onClick={handleLogout} className="w-full py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition flex items-center justify-center gap-2">
              <span>🚪</span>
              <span>Выйти из аккаунта</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border rounded-xl p-8 text-center">
          <p className="text-gray-500 mb-4">Пользователь не найден</p>
          <button onClick={() => { localStorage.removeItem('teamflow_account_id'); localStorage.removeItem('teamflow_my_user_id'); setMyAccountId(null); }} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Очистить и выбрать заново
          </button>
        </div>
      )}

      {/* Confirm unlink modal */}
      {unlinkConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">
              {unlinkConfirm.provider === 'telegram' ? '🗑️ Удаление Telegram' : '✂️ Отвязка аккаунта'}
            </h3>
            <p className="text-gray-600 mb-6">
              {unlinkConfirm.provider === 'telegram'
                ? 'Удалить Telegram аккаунт? Вход будет возможен только через OAuth (Google/Яндекс).'
                : `Отвязать ${unlinkConfirm.name} аккаунт?`}
            </p>
            <div className="flex gap-3">
              <button onClick={() => handleUnlinkAccount(unlinkConfirm.provider)} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition">Да, отвязать</button>
              <button onClick={() => setUnlinkConfirm(null)} className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Set password modal */}
      {showSetPassword && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">🔐 Установка логина и пароля</h3>
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Логин</label>
                <input type="text" value={setLogin} onChange={(e) => setSetLogin(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="your_login" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (необязательно)</label>
                <input type="email" value={setEmail} onChange={(e) => setSetEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="you@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
                <input type="password" value={setPass} onChange={(e) => setSetPass(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Подтверждение пароля</label>
                <input type="password" value={setConfirmPass} onChange={(e) => setSetConfirmPass(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="••••••••" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">Создать</button>
                <button type="button" onClick={handleResetSetPassword} className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition">Отмена</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change password modal */}
      {showChangePassword && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">🔑 Смена пароля</h3>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Текущий пароль</label>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Новый пароль</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Подтверждение пароля</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="••••••••" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">Сохранить</button>
                <button type="button" onClick={handleResetPassword} className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition">Отмена</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
