export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8180';

export const STATUS_COLOR: Record<string, string> = {
  TODO: 'bg-gray-100 text-gray-700 border-gray-300',
  DOING: 'bg-blue-100 text-blue-700 border-blue-300',
  DONE: 'bg-green-100 text-green-700 border-green-300',
  BLOCKED: 'bg-red-100 text-red-700 border-red-300',
  ON_HOLD: 'bg-yellow-100 text-yellow-700 border-yellow-300',
};

export const STATUS_BORDER: Record<string, string> = {
  TODO: 'border-l-gray-300',
  DOING: 'border-l-blue-500',
  DONE: 'border-l-green-500',
  BLOCKED: 'border-l-red-500',
  ON_HOLD: 'border-l-yellow-400',
};

export const STATUS_EMOJI: Record<string, string> = {
  TODO: '📝', DOING: '🔄', DONE: '✅', BLOCKED: '⚠️', ON_HOLD: '⏸️',
};

export const STATUS_LABELS: Record<string, string> = {
  TODO: 'TODO',
  DOING: 'В работе',
  BLOCKED: 'Блок',
  ON_HOLD: 'На паузе',
  DONE: 'Готово',
};

export const DUE_BADGE: Record<string, string> = {
  overdue:  'bg-red-100 text-red-700 border-red-200',
  today:    'bg-orange-100 text-orange-700 border-orange-200',
  soon:     'bg-yellow-100 text-yellow-700 border-yellow-200',
  upcoming: 'bg-gray-100 text-gray-500 border-gray-200',
};

export const PRIORITY_LABELS: Record<string, string> = {
  URGENT: '🔥 Срочно',
  HIGH:   '⚠️ Высокий',
  NORMAL: '📌 Обычный',
  LOW:    '🧊 Низкий',
};

export const PRIORITY_COLOR: Record<string, string> = {
  URGENT: 'bg-red-100 text-red-700 border-red-300',
  HIGH:   'bg-orange-100 text-orange-700 border-orange-300',
  NORMAL: 'bg-gray-100 text-gray-500 border-gray-300',
  LOW:    'bg-blue-50 text-blue-500 border-blue-200',
};

export const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export const PRIORITY_EMOJI: Record<string, string> = { URGENT: '🔥', HIGH: '⚠️', NORMAL: '📌', LOW: '🧊' };

export const STATUS_BG: Record<string, string> = {
  TODO:      'bg-white',
  DOING:     'bg-blue-50',
  DONE:      'bg-green-50',
  BLOCKED:   'bg-red-50',
  ON_HOLD:   'bg-yellow-50',
};

export function cardBg(priority: string, status: string): string {
  if (status === 'DONE') return STATUS_BG['DONE'];
  if (status === 'ON_HOLD') return STATUS_BG['ON_HOLD'];
  if (priority === 'URGENT') return 'bg-red-50';
  if (priority === 'HIGH')   return 'bg-orange-50';
  if (priority === 'LOW')    return 'bg-sky-50';
  return STATUS_BG[status] ?? 'bg-white';
}
