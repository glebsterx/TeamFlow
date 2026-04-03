import React from 'react';
import { API_URL } from '../constants/taskDisplay';
import { useTheme } from '../hooks/useTheme';

export const Welcome: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [botUsername, setBotUsername] = React.useState('');

  React.useEffect(() => {
    fetch(`${API_URL}/api/bot-info`)
      .then(r => r.json())
      .then(data => setBotUsername(data.username || ''))
      .catch(() => {});
  }, []);

  const ThemeIcon = () => {
    if (theme === 'light') return <span>☀️</span>;
    if (theme === 'dark') return <span>🌙</span>;
    return <span>🔄</span>;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 transition text-sm"
        title={theme === 'light' ? 'Светлая' : theme === 'dark' ? 'Тёмная' : 'Авто'}
      >
        <ThemeIcon />
      </button>

      {/* Hero */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-2xl w-full text-center space-y-8">
          <div>
            <h1 className="text-5xl font-bold text-gray-900 mb-4">TeamFlow</h1>
            <p className="text-xl text-gray-600">
              Система управления задачами для небольших команд
            </p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-8">
            <div className="bg-white rounded-xl p-6 border shadow-sm">
              <div className="text-3xl mb-3">📋</div>
              <h3 className="font-semibold text-gray-900 mb-2">Задачи</h3>
              <p className="text-sm text-gray-500">Создавайте, назначайте и отслеживайте задачи команды</p>
            </div>
            <div className="bg-white rounded-xl p-6 border shadow-sm">
              <div className="text-3xl mb-3">💬</div>
              <h3 className="font-semibold text-gray-900 mb-2">Telegram-бот</h3>
              <p className="text-sm text-gray-500">Управляйте задачами прямо из Telegram</p>
            </div>
            <div className="bg-white rounded-xl p-6 border shadow-sm">
              <div className="text-3xl mb-3">🔔</div>
              <h3 className="font-semibold text-gray-900 mb-2">Уведомления</h3>
              <p className="text-sm text-gray-500">Push-уведомления и напоминания о дедлайнах</p>
            </div>
          </div>

          {/* CTA */}
          <div className="space-y-4">
            <a
              href="/login"
              className="inline-block px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition text-lg"
            >
              Войти в систему
            </a>
            {botUsername && (
              <p className="text-sm text-gray-500">
                или напишите боту{' '}
                <a
                  href={`https://t.me/${botUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  @{botUsername}
                </a>
              </p>
            )}
          </div>

          {/* Credits */}
          <div className="pt-12 border-t border-gray-200 mt-12">
            <p className="text-xs text-gray-400">
              TeamFlow © 2026 | v0.8.19
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
