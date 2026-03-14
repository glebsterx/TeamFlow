export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr.includes('Z') ? dateStr : dateStr + 'Z');
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

export function formatDatetime(dateStr: string): string {
  const date = new Date(dateStr.includes('Z') ? dateStr : dateStr + 'Z');
  return date.toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function getDueStatus(dueDate?: string, status?: string): 'overdue' | 'today' | 'soon' | 'upcoming' | null {
  if (!dueDate || status === 'DONE' || status === 'CANCELLED') return null;
  const due = new Date(dueDate.includes('Z') ? dueDate : dueDate + 'Z');
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
  const date = new Date(dateStr.includes('Z') ? dateStr : dateStr + 'Z');
  return date.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

export function toDateInputValue(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr.includes('Z') ? dateStr : dateStr + 'Z');
  return date.toISOString().split('T')[0];
}
