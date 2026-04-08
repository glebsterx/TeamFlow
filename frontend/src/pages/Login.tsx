import React, { useState, useEffect } from 'react';
import { authApi } from '../api/auth';
import { useAuthStore } from '../stores/authStore';
import { API_URL } from '../constants/taskDisplay';
import { useTheme } from '../hooks/useTheme';
import { ToastContainer } from '../components/Toast';

export const Login: React.FC = () => {
  const setUser = useAuthStore((state) => state.setUser);
  const { theme, toggleTheme } = useTheme();
  const [myUserId, setMyUserId] = React.useState<number | null>(() => {
    const saved = localStorage.getItem('teamflow_my_user_id');
    return saved ? Number(saved) : null;
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(true);
  const [botUsername, setBotUsername] = useState('');
  const [oauthProviders, setOauthProviders] = useState<{google: boolean, yandex: boolean}>({ google: false, yandex: false });
  const [telegramWaiting, setTelegramWaiting] = useState(false);
  const [inviteOnly, setInviteOnly] = useState(false);

  // Регистрация
  const [showRegister, setShowRegister] = useState(false);
  const [regLogin, setRegLogin] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regInviteCode, setRegInviteCode] = useState('');
  const [regRateLimit, setRegRateLimit] = useState({ count: 0, lastAttempt: 0 });

  // Polling для Telegram авторизации
  const startTelegramLogin = () => {
    const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('tg_login_token', sessionToken);

    window.open(`https://t.me/${botUsername}?start=weblogin_${sessionToken}`, '_blank');
    setTelegramWaiting(true);

    const poll = setInterval(async () => {
      try {
        const resp = await fetch(`${API_URL}/api/auth/pending-login/${sessionToken}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.access_token) {
            clearInterval(poll);
            setTelegramWaiting(false);
            localStorage.removeItem('tg_login_token');
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('refresh_token', data.refresh_token);
            localStorage.setItem('teamflow_account_id', String(data.account_id));
            localStorage.setItem('teamflow_my_user_id', String(data.account_id));
            window.location.href = '/';
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

  useEffect(() => {
    // Обработка токена из URL hash (после авторизации через бота или OAuth)
    const hash = window.location.hash;
    if (hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      const access = params.get('access_token');
      const refresh = params.get('refresh_token');
      const tgId = params.get('account_id');

      if (access && refresh) {
        localStorage.setItem('access_token', access);
        localStorage.setItem('refresh_token', refresh);
        const accId = params.get('account_id');
        if (accId) localStorage.setItem('teamflow_account_id', accId);
        const tgId = params.get('account_id');
        if (tgId && !accId) localStorage.setItem('teamflow_my_user_id', tgId);
        window.location.replace('/');
        return;
      }
    }
    setIsProcessing(false);

    fetch(`${API_URL}/api/bot-info`)
      .then(r => r.json())
      .then(data => setBotUsername(data.username || ''))
      .catch(() => {});

    fetch(`${API_URL}/api/auth/oauth-providers`)
      .then(r => r.json())
      .then(data => setOauthProviders(data))
      .catch(() => {});

    fetch(`${API_URL}/api/auth/registration-settings`)
      .then(r => r.json())
      .then(data => setInviteOnly(data.invite_only))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (event.data?.event === 'auth_user' && event.data?.data) {
        const user = event.data.data;
        setIsLoading(true);
        setError('');
        try {
          const resp = await fetch(`${API_URL}/api/auth/telegram`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user),
          });
          if (!resp.ok) throw new Error('Auth failed');
          const data = await resp.json();
          localStorage.setItem('access_token', data.access_token);
          localStorage.setItem('refresh_token', data.refresh_token);
          localStorage.setItem('teamflow_account_id', String(data.user.id));
          if (data.user.id) {
            localStorage.setItem('teamflow_my_user_id', String(data.user.id));
          }
          window.location.href = '/';
        } catch {
          setError('Ошибка авторизации через Telegram');
          setIsLoading(false);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const normalizedLogin = username.trim().toLowerCase();
      const tokenResponse = await authApi.login({ login: normalizedLogin, password });
      localStorage.setItem('access_token', tokenResponse.access_token);
      localStorage.setItem('refresh_token', tokenResponse.refresh_token);
      localStorage.setItem('teamflow_account_id', String(tokenResponse.user.id));
      if (tokenResponse.user.id) {
        localStorage.setItem('teamflow_my_user_id', String(tokenResponse.user.id));
      }
      window.location.href = '/';
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Ошибка входа');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Rate limit: 3 attempts per 5 minutes
    const now = Date.now();
    if (regRateLimit.count >= 3 && now - regRateLimit.lastAttempt < 300000) {
      setError('Слишком много попыток. Подождите 5 минут');
      return;
    }
    
    if (regPassword !== regConfirm) {
      setError('Пароли не совпадают');
      return;
    }
    if (regPassword.length < 6) {
      setError('Пароль должен быть не менее 6 символов');
      return;
    }

    setIsLoading(true);
    setError('');
    setRegRateLimit({ count: regRateLimit.count + 1, lastAttempt: now });

    try {
      const res = await fetch(`${API_URL}/api/auth/local/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: regLogin,
          password: regPassword,
          email: regEmail || null,
          invite_code: regInviteCode || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.detail || 'Ошибка регистрации');

      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      localStorage.setItem('teamflow_account_id', String(data.user.id));
      if (data.user.id) {
        localStorage.setItem('teamflow_my_user_id', String(data.user.id));
      }
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Ошибка регистрации');
    } finally {
      setIsLoading(false);
    }
  };

  const ThemeIcon = () => {
    if (theme === 'light') return <span>☀️</span>;
    if (theme === 'dark') return <span>🌙</span>;
    return <span>🔄</span>;
  };

  if (isProcessing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Авторизация...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 relative">
      <ToastContainer />
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-sm"
        title={theme === 'light' ? 'Светлая' : theme === 'dark' ? 'Тёмная' : 'Авто'}
      >
        <ThemeIcon />
      </button>

      <div className="max-w-sm w-full space-y-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">TeamFlow</h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Войдите в аккаунт</p>
        </div>

        {/* Social login buttons */}
        <div className="space-y-3">
          {/* Telegram */}
          {botUsername && (
            <button
              onClick={startTelegramLogin}
              disabled={telegramWaiting}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-[#0088cc] hover:bg-[#006da3] text-white font-medium rounded-lg transition disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.484-.429-.008-1.252-.242-1.865-.442-.751-.245-1.349-.374-1.297-.789.027-.216.324-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472z"/>
              </svg>
              {telegramWaiting ? 'Ожидание авторизации в боте...' : 'Войти через Telegram'}
            </button>
          )}

          {/* Google */}
          {oauthProviders.google && (
            <a
              href={`${API_URL}/api/auth/google/link?state=login`}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium rounded-lg transition"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Войти через Google
            </a>
          )}

          {/* Яндекс */}
          {oauthProviders.yandex && (
            <a
              href={`${API_URL}/api/auth/yandex/link?state=login`}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-[#FC3F1D] hover:bg-[#E0351A] text-white font-medium rounded-lg transition"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.04 12c0-5.523 4.476-10 10-10 5.522 0 10 4.477 10 10s-4.478 10-10 10c-5.524 0-10-4.477-10-10z" fill="#FC3F1D"/>
                <path d="M13.32 7.666h-.924c-1.694 0-2.585.858-2.585 2.123 0 1.43.616 2.1 1.881 2.959l1.045.704-3.003 4.487H7.49l2.695-4.014c-1.55-1.111-2.42-2.19-2.42-4.015 0-2.288 1.595-3.85 4.62-3.85h3.003v11.868H13.32V7.666z" fill="#fff"/>
              </svg>
              Войти через Яндекс
            </a>
          )}
        </div>

        <div className="flex items-center my-4">
          <div className="flex-1 border-t border-gray-300 dark:border-gray-600" />
          <span className="px-3 text-sm text-gray-400 dark:text-gray-500">или через логин/пароль</span>
          <div className="flex-1 border-t border-gray-300 dark:border-gray-600" />
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Логин</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition"
          >
            {isLoading ? 'Вход...' : 'Войти'}
          </button>
        </form>
        {!inviteOnly && (
          <div className="mt-6 text-center">
            <button
              onClick={() => setShowRegister(true)}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Нет аккаунта? Зарегистрироваться
            </button>
          </div>
        )}
      </div>

      {/* Register Modal */}
      {showRegister && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 relative">
            <button
              onClick={() => { setShowRegister(false); setRegLogin(''); setRegEmail(''); setRegPassword(''); setRegConfirm(''); setRegInviteCode(''); setError(''); }}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl"
            >
              ×
            </button>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Регистрация</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Создайте аккаунт для входа в TeamFlow</p>
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Логин</label>
                <input
                  type="text"
                  value={regLogin}
                  onChange={(e) => setRegLogin(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="neo_matrix"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Пароль</label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Минимум 6 символов"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Подтверждение пароля</label>
                <input
                  type="password"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Повторите пароль"
                />
              </div>
              {inviteOnly && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Код приглашения</label>
                  <input
                    type="text"
                    value={regInviteCode}
                    onChange={(e) => setRegInviteCode(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Введите код из приглашения"
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
              >
                {isLoading ? '⏳ Регистрация...' : 'Зарегистрироваться'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
