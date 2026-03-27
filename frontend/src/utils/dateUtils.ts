/**
 * Safely parse a date string from backend (SQLite stores without timezone).
 * Treats naive datetime strings as UTC by appending 'Z' if missing.
 */
export function parseUTC(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  return new Date(dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z');
}

export function timeAgo(dateStr: string): string {
  const date = parseUTC(dateStr);
  const diffMs = Date.now() - date.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин. назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч. назад`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'вчера';
  if (d < 7) return `${d} дн. назад`;
  return date.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

/**
 * Russian pluralization helper.
 * @param n - Number
 * @param forms - Array of 3 forms: [singular, few, many]
 * @example plural(5, ['подзадача', 'подзадачи', 'подзадач']) => 'подзадач'
 */
export function plural(n: number, forms: [string, string, string]): string {
  if (n % 10 === 1 && n % 100 !== 11) {
    return forms[0]; // 1 подзадача
  } else if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) {
    return forms[1]; // 2-4 подзадачи
  } else {
    return forms[2]; // 5+ подзадач
  }
}

export function formatDatetime(dateStr: string): string {
  const date = parseUTC(dateStr);
  return date.toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function getDueStatus(dueDate?: string, status?: string): 'overdue' | 'today' | 'soon' | 'upcoming' | null {
  if (!dueDate || status === 'DONE' || status === 'CANCELLED') return null;
  const due = parseUTC(dueDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.floor((dueDay.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays <= 3) return 'soon';
  return 'upcoming';
}

export function formatDueDate(dateStr: string): string {
  const date = parseUTC(dateStr);
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
  if (hasTime) {
    return date.toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

/**
 * Format duration between two dates as human-readable string.
 * Uses started_at if available, otherwise created_at as start point.
 */
export function formatDuration(startStr?: string, endStr?: string): string | null {
  if (!endStr || !startStr) return null;
  const start = parseUTC(startStr);
  const end = parseUTC(endStr);
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes} мин`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} дн`;
  const months = Math.floor(days / 30);
  return `${months} мес`;
}

export function toDateInputValue(dateStr?: string): string {
  if (!dateStr) return '';
  const date = parseUTC(dateStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toISOString(dateTimeLocalStr?: string): string | undefined {
  if (!dateTimeLocalStr) return undefined;
  const date = new Date(dateTimeLocalStr);
  if (isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function formatTime(minutes: number): string {
  if (!minutes || minutes === 0) return '0 мин';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} мин`;
  if (mins === 0) return `${hours} ч`;
  return `${hours} ч ${mins} мин`;
}
