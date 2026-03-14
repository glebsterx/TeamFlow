import { Task } from '../types/dashboard';

export function getAncestorBlockedIds(tasks: Task[]): Set<number> {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const result = new Set<number>();
  for (const task of tasks) {
    if (task.status === 'BLOCKED') continue;
    let cur = task.parent_task_id ? taskMap.get(task.parent_task_id) : undefined;
    while (cur) {
      if (cur.status === 'BLOCKED') { result.add(task.id); break; }
      cur = cur.parent_task_id ? taskMap.get(cur.parent_task_id) : undefined;
    }
  }
  return result;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
