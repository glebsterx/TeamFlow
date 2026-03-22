// Типы встреч — единый источник истины для NewMeetingModal, MeetingModal, MeetingsPage

export const MEETING_TYPES = [
  { value: '',        label: 'Тип встречи...' },
  { value: 'standup', label: '☀️ Стендап' },
  { value: 'planning',label: '📋 Планирование' },
  { value: 'retro',   label: '🔄 Ретро' },
  { value: 'review',  label: '✅ Ревью' },
  { value: '1:1',     label: '👥 1:1' },
  { value: 'other',   label: '💬 Другое' },
];

export const MEETING_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  MEETING_TYPES.filter(t => t.value).map(t => [t.value, t.label])
);

export const MEETING_TYPE_COLORS: Record<string, string> = {
  standup:  'bg-yellow-50 text-yellow-700 border-yellow-200',
  planning: 'bg-blue-50 text-blue-700 border-blue-200',
  retro:    'bg-purple-50 text-purple-700 border-purple-200',
  review:   'bg-green-50 text-green-700 border-green-200',
  '1:1':    'bg-pink-50 text-pink-700 border-pink-200',
  other:    'bg-gray-100 text-gray-600 border-gray-200',
};
