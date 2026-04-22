import React, { useEffect, useState } from 'react';

interface HelpPageProps {
  onClose?: () => void;
  isAdmin?: boolean;
}

function getIsDark(): boolean {
  const theme = localStorage.getItem('theme');
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export const HelpPage: React.FC<HelpPageProps> = ({ onClose, isAdmin = false }) => {
  const [isDark, setIsDark] = useState(getIsDark);

  // Sync theme
  useEffect(() => {
    const handleStorage = () => setIsDark(getIsDark());
    const handleThemeChange = () => setIsDark(getIsDark());
    
    window.addEventListener('storage', handleStorage);
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', handleThemeChange);
    
    return () => {
      window.removeEventListener('storage', handleStorage);
      mediaQuery.removeEventListener('change', handleThemeChange);
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onClose) onClose();
        else window.history.back();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const bgClass = isDark ? 'bg-gray-900' : 'bg-gray-50';
  const textClass = isDark ? 'text-gray-100' : 'text-gray-800';
  const cardClass = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const mutedClass = isDark ? 'text-gray-400' : 'text-gray-600';
  const headerClass = isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200';
  const userSections = [
    {
      title: 'Быстрый старт',
      items: [
        'Добавьте задачу кнопкой "+" или через @GTF_TeamFlow_bot в Telegram',
        'Назначьте исполнителя и срок',
        'Создавайте проекты для группировки задач',
        'Используйте спринты для планирования',
      ],
    },
    {
      title: 'Статусы задач',
      items: [
        '📋 TODO — новая задача',
        '🔄 DOING — в работе',
        '🚫 BLOCKED — заблокирована',
        '⏸ ON_HOLD — на паузе',
        '✅ DONE — завершена',
      ],
    },
    {
      title: 'Проекты',
      items: [
        'Создавайте проекты для разных команд или направлений',
        'В проекте можно назначить участников с ролями (viewer/editor/admin)',
        'Задачи можно перемещать между проектами',
        'Подпроекты: вложенная структура задач',
      ],
    },
    {
      title: 'Спринты',
      items: [
        'Спринт — это временной период для планирования',
        'Задачи в спринте — текущий фокус команды',
        ' backlog — задачи на будущее',
        'Можно создавать повторяющиеся задачи',
      ],
    },
    {
      title: 'Фильтры и поиск',
      items: [
        'Фильтр по статусу, проекту, исполнителю',
        'Поиск по названию и описанию',
        'Теги для категоризации',
        'Приоритеты: LOW, NORMAL, HIGH, URGENT',
      ],
    },
    {
      title: 'Клавиатурные шорткаты',
      items: [
        'Ctrl+K — командная строка',
        'Ctrl+N — новая задача',
        'Ctrl+F — поиск',
        'Ctrl+S — сохранить',
        'Esc — закрыть',
        'Ctrl+Enter — сохранить и закрыть',
      ],
    },
    {
      title: 'Telegram бот',
      items: [
        '/tasks — ваши задачи',
        '/new [текст] — создать задачу',
        '/my — задачи исполнителя',
        '/blocked — заблокированные',
        '/sprints — список спринтов',
        'Перешлите сообщение боту — создаст задачу',
      ],
    },
    {
      title: 'Таймер',
      items: [
        'Запустите таймер на задаче для учёта времени',
        'Таймер работает пока открыта страница',
        'Время добавляется к задаче автоматически',
        'Статистика в разделе "Сводка"',
      ],
    },
  ];

  const adminSections = [
    {
      title: 'Управление системой',
      items: [
        'Настройки → вкладка "Система" — перезапуск сервисов',
        'Настройки → вкладка "Команда" — управление участниками',
        'Настройки → вкладка "Проекты" — создание проектов',
        'Настройки → вкладка "Бот" — токен и прокси',
      ],
    },
    {
      title: 'Права доступа',
      items: [
        ' owner — полный доступ ко всему',
        ' admin — настройки системы и участники',
        ' member — создание и редактирование задач',
        ' viewer — только просмотр',
      ],
    },
    {
      title: 'Проектные роли',
      items: [
        ' admin — управление проектом и участниками',
        ' editor — создание и редактирование задач',
        ' viewer — только просмотр задач проекта',
      ],
    },
    {
      title: 'Интеграции',
      items: [
        'Telegram бот — @GTF_TeamFlow_bot',
        'Google OAuth — авторизация',
        'Yandex OAuth — авторизация',
        'Web Push — уведомления в браузере',
        'AI — интеграция с OpenAI, Anthropic, Ollama',
      ],
    },
    {
      title: 'Настройки в БД',
      items: [
        'BASE_URL — адрес приложения',
        'CORS Origins — разрешённые источники',
        'TELEGRAM_BOT_TOKEN — токен бота',
        'Event Store — журнал событий задач',
      ],
    },
    {
      title: 'API',
      items: [
        'X-API-Key — доступ к API',
        '/api/export — экспорт данных (stream=true для больших объёмов)',
        '/api/events — журнал событий (если включён в настройках)',
      ],
    },
    {
      title: 'Безопасность',
      items: [
        'JWT токены для авторизации',
        'API ключи с хешированием',
        'OAuth 2.0 для Google/Yandex',
        'Webhook подпись HMAC',
      ],
    },
  ];

  const sections = isAdmin ? adminSections : userSections;

  const backUrl = isAdmin ? '/?page=settings&tab=system' : '/';
  
  return (
    <div className={`fixed inset-0 z-50 ${bgClass} overflow-auto`}>
      {/* Header - full width */}
      <div className={`flex items-center justify-between px-4 py-3 ${headerClass} shadow-sm sticky top-0`}>
        <h1 className={`text-lg font-semibold ${textClass}`}>📖 {isAdmin ? 'Справка администратора' : 'Справка'}</h1>
        <a href={backUrl} className="text-sm text-blue-600 hover:underline">
          ← Вернуться {isAdmin ? 'в настройки' : 'на главную'}
        </a>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {sections.map((section) => (
            <div key={section.title} className={`${cardClass} rounded-lg shadow-sm border p-4`}>
              <h2 className={`font-semibold ${textClass} mb-3`}>{section.title}</h2>
              <ul className="space-y-1.5">
                {section.items.map((item, i) => (
                  <li key={i} className={`text-sm ${mutedClass} flex items-start gap-2`}>
                    <span className={mutedClass}>•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Links */}
          <div className={`${cardClass} rounded-lg shadow-sm border p-4`}>
            <h2 className={`font-semibold ${textClass} mb-3`}>Ссылки</h2>
            <div className="space-y-2">
              {isAdmin && (
                <a
                  href="/docs"
                  className="block text-sm text-blue-600 hover:underline"
                >
                  📚 API документация
                </a>
              )}
              <a
                href="https://t.me/GTF_TeamFlow_bot"
                className="block text-sm text-blue-600 hover:underline"
              >
                💬 Telegram бот
              </a>
            </div>
          </div>

          {/* Version */}
          <div className={`text-center text-xs ${mutedClass} py-4`}>
            TeamFlow v0.8.24 • Made with ❤️
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpPage;