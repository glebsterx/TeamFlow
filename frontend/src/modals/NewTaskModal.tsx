import { useState, useRef } from 'react';
import Modal from '../components/Modal';
import { Task, Project } from '../types/dashboard';
import {
  STATUS_COLOR, STATUS_EMOJI, STATUS_LABELS,
  PRIORITY_LABELS, PRIORITY_COLOR,
} from '../constants/taskDisplay';

function tokenize(s: string): string[] {
  return s.toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3)
    .map(w => w.slice(0, Math.max(4, w.length - 1)));
}

function overlapScore(a: string[], bSet: Set<string>): number {
  if (a.length === 0 || bSet.size === 0) return 0;
  const matches = a.filter(w => bSet.has(w)).length;
  return matches / Math.min(a.length, bSet.size);
}

function findSimilarTasks(title: string, description: string, tasks: Task[]): Task[] {
  const newTitleTokens = tokenize(title);
  const newFullTokens = tokenize(title + ' ' + description);
  if (newTitleTokens.length === 0) return [];
  const activeTasks = tasks.filter(t => !t.deleted);
  return activeTasks.filter(t => {
    const titleScore = overlapScore(newTitleTokens, new Set(tokenize(t.title)));
    if (titleScore >= 0.4) return true;
    const fullScore = overlapScore(newFullTokens, new Set(tokenize(t.title + ' ' + (t.description || ''))));
    return fullScore >= 0.55;
  });
}

interface NewTaskModalProps {
  onClose: () => void;
  onOpenTask: (t: Task) => void;
  projects: Project[];
  tasks: Task[];
  createTaskMutation: any;
  initialProjectId?: number;
  initialParentTaskId?: number;
  initialBacklog?: boolean;
}

export default function NewTaskModal({
  onClose, onOpenTask, projects, tasks, createTaskMutation,
  initialProjectId, initialParentTaskId, initialBacklog,
}: NewTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(initialProjectId ? String(initialProjectId) : '');
  const [parentTaskId, setParentTaskId] = useState(initialParentTaskId ? String(initialParentTaskId) : '');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [backlog, setBacklog] = useState(!!initialBacklog);
  const [dupCandidates, setDupCandidates] = useState<Task[]>([]);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);

  const doCreate = () => {
    if (title.trim() && !submittingRef.current) {
      submittingRef.current = true;
      createTaskMutation.mutate({
        title, description,
        project_id: projectId ? Number(projectId) : undefined,
        due_date: dueDate || undefined,
        priority,
        parent_task_id: parentTaskId ? Number(parentTaskId) : undefined,
        backlog,
      });
    }
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    const similar = findSimilarTasks(title, description, tasks || []);
    if (similar.length > 0) setDupCandidates(similar);
    else doCreate();
  };

  if (dupCandidates.length > 0) {
    const projMap = new Map((projects || []).map(p => [p.id, p]));
    return (
      <Modal onClose={onClose}>
        <h2 className="text-lg font-bold mb-1">Похожие задачи найдены</h2>
        <p className="text-sm text-gray-500 mb-4">Возможно, такая задача уже существует. Дополните одну из них или создайте отдельную.</p>
        <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
          {dupCandidates.map(t => {
            const proj = t.project_id ? projMap.get(t.project_id) : null;
            return (
              <div key={t.id} className="border rounded-lg p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-xs text-gray-400">#{t.id}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_COLOR[t.status]}`}>{STATUS_EMOJI[t.status]} {STATUS_LABELS[t.status]}</span>
                    {proj && <span className="text-xs text-gray-500">{proj.emoji} {proj.name}</span>}
                  </div>
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  {t.description && <div className="text-xs text-gray-400 truncate mt-0.5">{t.description}</div>}
                </div>
                <button
                  onClick={() => onOpenTask(t)}
                  className="shrink-0 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-100 transition"
                >Дополнить →</button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setDupCandidates([])} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">← Назад</button>
          <button
            onClick={doCreate}
            disabled={createTaskMutation.isPending}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
          >{createTaskMutation.isPending ? '...' : 'Создать отдельно'}</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg sm:text-xl font-bold mb-4">Новая задача</h2>
      <div className="space-y-3 mb-4">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); descRef.current?.focus(); } }}
          placeholder="Название"
          className="w-full px-3 py-2 border rounded-lg text-sm"
          autoFocus
        />
        <div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Описание (поддерживается Markdown)"
            className="w-full px-3 py-2 border rounded-lg text-sm"
            rows={3}
            ref={descRef}
          />
          <p className="text-xs text-gray-400 mt-0.5">**жирный**, *курсив*, `код`, - список</p>
        </div>
        <select
          value={projectId}
          onChange={e => setProjectId(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">Без проекта</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
        </select>
        <select
          value={parentTaskId}
          onChange={e => setParentTaskId(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">Без родительской задачи</option>
          {(tasks || []).map(t => (
            <option key={t.id} value={t.id}>#{t.id} {t.title}</option>
          ))}
        </select>
        <div>
          <label className="text-xs text-gray-500 block mb-1">📅 Дедлайн <span className="text-gray-400">(необязательно)</span></label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-2">Приоритет</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(PRIORITY_LABELS).map(([p, label]) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`px-2 py-2 rounded-lg text-xs font-medium border transition ${
                  priority === p ? `${PRIORITY_COLOR[p]} font-bold` : 'bg-white hover:bg-gray-50'
                }`}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>
      <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={backlog}
          onChange={e => setBacklog(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300"
        />
        <span className="text-sm text-gray-600">📦 В бэклог</span>
      </label>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button
          onClick={handleSubmit}
          disabled={createTaskMutation.isPending}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
        >{createTaskMutation.isPending ? '...' : 'Создать'}</button>
      </div>
    </Modal>
  );
}
