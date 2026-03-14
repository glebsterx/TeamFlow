import { useEffect, useRef } from 'react';
import { Task } from '../types/dashboard';
import { showToast } from '../utils/toast';

export function useTaskChangeDetector(tasks: Task[]) {
  const snapshotRef = useRef<Map<number, Task>>(new Map());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!tasks.length) return;

    // First load — initialize snapshot silently, no toasts
    if (!initializedRef.current) {
      initializedRef.current = true;
      const map = new Map<number, Task>();
      tasks.forEach(t => map.set(t.id, t));
      snapshotRef.current = map;
      return;
    }

    const prev = snapshotRef.current;

    tasks.forEach(task => {
      const old = prev.get(task.id);

      if (!old) {
        // New task appeared
        showToast(`Новая задача: #${task.id} «${task.title}»`, 'info');
        return;
      }

      // Status change — only DONE and BLOCKED are shown (others are too noisy)
      if (old.status !== task.status) {
        if (task.status === 'DONE') {
          showToast(`✅ Выполнено: «${task.title}»`, 'success', 6000);
        } else if (task.status === 'BLOCKED') {
          showToast(`⛔ Заблокировано: «${task.title}»`, 'warning');
        }
      }

      // Assignee appeared (was unset, now set)
      if (!old.assignee && task.assignee) {
        showToast(`👤 Назначена: #${task.id} «${task.title}»`, 'info');
      }
    });

    // Update snapshot
    const next = new Map<number, Task>();
    tasks.forEach(t => next.set(t.id, t));
    snapshotRef.current = next;
  }, [tasks]);
}
