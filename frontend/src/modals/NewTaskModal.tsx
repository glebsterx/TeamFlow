import { useState, useRef } from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '../components/Modal';
import MarkdownContent from '../components/MarkdownContent';
import { Task, Project } from '../types/dashboard';
import {
  STATUS_COLOR, STATUS_EMOJI, STATUS_LABELS,
  PRIORITY_LABELS, PRIORITY_COLOR,
} from '../constants/taskDisplay';
import { API_URL } from '../constants/taskDisplay';
import { toISOString } from '../utils/dateUtils';

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
  const [recurrence, setRecurrence] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [backlog, setBacklog] = useState(!!initialBacklog);
  const [dupCandidates, setDupCandidates] = useState<Task[]>([]);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);
  const [descTab, setDescTab] = useState<'write' | 'preview'>('write');

  const [titleError, setTitleError] = useState(false);

  // Markdown insertion helper with toggle support
  const insertMarkdown = (prefix: string, suffix: string) => {
    const textarea = descRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const selectedText = description.substring(start, end);
    
    // Check if already formatted (toggle off)
    const textBefore = description.substring(0, start);
    const textAfter = description.substring(end);
    const hasPrefix = textBefore.endsWith(prefix);
    const hasSuffix = textAfter.startsWith(suffix);
    
    let newDescription: string;
    let newCursorStart: number;
    let newCursorEnd: number;
    
    if (hasPrefix && hasSuffix) {
      // Remove formatting
      const prefixStart = start - prefix.length;
      const suffixEnd = end + suffix.length;
      newDescription = description.substring(0, prefixStart) +
                       selectedText +
                       description.substring(suffixEnd);
      newCursorStart = prefixStart;
      newCursorEnd = prefixStart + selectedText.length;
    } else {
      // Add formatting
      newDescription = textBefore + prefix + selectedText + suffix + textAfter;
      newCursorStart = start + prefix.length;
      newCursorEnd = end + prefix.length;
    }
    
    setDescription(newDescription);
    
    // Restore focus and cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorStart, newCursorEnd);
    }, 0);
  };

  // Keyboard shortcuts for markdown - uses e.code for layout-independent shortcuts
  const handleMarkdownShortcuts = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Check for Ctrl/Cmd key
    if (!e.ctrlKey && !e.metaKey) return;
    
    // Use e.code which is layout-independent (KeyB, KeyI, etc.)
    const code = e.code;
    
    // Handle markdown shortcuts (works with any keyboard layout)
    if (code === 'KeyB') {
      e.preventDefault();
      e.stopPropagation();
      insertMarkdown('**', '**');
    } else if (code === 'KeyI') {
      e.preventDefault();
      e.stopPropagation();
      insertMarkdown('*', '*');
    } else if (code === 'KeyE') {
      e.preventDefault();
      e.stopPropagation();
      insertMarkdown('`', '`');
    } else if (code === 'KeyK') {
      e.preventDefault();
      e.stopPropagation();
      insertMarkdown('[', '](url)');
    }
  };

  const doCreate = () => {
    if (title.trim() && !submittingRef.current) {
      submittingRef.current = true;
      createTaskMutation.mutate({
        title, description,
        project_id: projectId ? Number(projectId) : undefined,
        due_date: toISOString(dueDate) || undefined,
        priority,
        parent_task_id: parentTaskId ? Number(parentTaskId) : undefined,
        backlog,
        recurrence: recurrence || undefined,
      });
    }
  };

  const handleSubmit = () => {
    if (!title.trim()) { setTitleError(true); return; }
    setTitleError(false);
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
        <div>
          <input
            value={title}
            onChange={e => { setTitle(e.target.value); if (e.target.value.trim()) setTitleError(false); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); descRef.current?.focus(); } }}
            placeholder="Название задачи"
            className={`w-full px-3 py-2 border rounded-lg text-sm ${titleError ? 'border-red-400 bg-red-50' : ''}`}
            autoFocus
          />
          {titleError && <p className="text-xs text-red-500 mt-1">Введите название задачи</p>}
        </div>
        <div>
          <div className="border rounded-lg overflow-hidden">
            <div className="flex border-b bg-gray-50 flex-wrap gap-1 p-1">
              <button type="button" onClick={() => setDescTab('write')}
                className={`px-2 py-1 text-xs font-medium transition rounded ${descTab === 'write' ? 'bg-white text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
              >✏️</button>
              <button type="button" onClick={() => setDescTab('preview')}
                className={`px-2 py-1 text-xs font-medium transition rounded ${descTab === 'preview' ? 'bg-white text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
              >👁</button>
              <span className="border-l mx-1"></span>
              <button type="button" onClick={() => insertMarkdown('**', '**')}
                className="px-2 py-1 text-xs hover:bg-gray-200 rounded" title="Жирный (Ctrl+B)"
              >**B**</button>
              <button type="button" onClick={() => insertMarkdown('*', '*')}
                className="px-2 py-1 text-xs hover:bg-gray-200 rounded" title="Курсив (Ctrl+I)"
              >*I*</button>
              <button type="button" onClick={() => insertMarkdown('`', '`')}
                className="px-2 py-1 text-xs hover:bg-gray-200 rounded" title="Код (Ctrl+E)"
              >`code`</button>
              <button type="button" onClick={() => insertMarkdown('- ', '')}
                className="px-2 py-1 text-xs hover:bg-gray-200 rounded" title="Список"
              >• Список</button>
              <button type="button" onClick={() => insertMarkdown('[', '](url)')}
                className="px-2 py-1 text-xs hover:bg-gray-200 rounded" title="Ссылка (Ctrl+K)"
              >🔗</button>
            </div>
            {descTab === 'write' ? (
              <textarea
                ref={descRef}
                value={description}
                onChange={e => setDescription(e.target.value)}
                onKeyDown={handleMarkdownShortcuts}
                placeholder="Описание (поддерживается Markdown)"
                className="w-full px-3 py-2 border-0 text-sm focus:outline-none font-mono text-xs"
                rows={3}
              />
            ) : (
              <div className="px-3 py-2 min-h-[80px]">
                {description ? <MarkdownContent content={description} /> : <span className="text-gray-400 text-xs">Нет описания</span>}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">Шорткаты: Ctrl+B жирный, Ctrl+I курсив, Ctrl+E код, Ctrl+K ссылка</p>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">📁 Проект <span className="text-gray-400">(необязательно)</span></label>
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">Без проекта</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">↳ Родительская задача <span className="text-gray-400">(необязательно)</span></label>
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
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">📅 Дедлайн <span className="text-gray-400">(необязательно)</span></label>
          <input
            type="datetime-local"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">🔁 Повторение <span className="text-gray-400">(необязательно)</span></label>
          <select
            value={recurrence}
            onChange={e => setRecurrence(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">Без повторения</option>
            <option value="daily">Ежедневно</option>
            <option value="weekly">Еженедельно</option>
            <option value="monthly">Ежемесячно</option>
          </select>
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
      <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
        <input type="checkbox" checked={backlog} onChange={e => setBacklog(e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
        <span className="text-sm text-gray-600">📦 В бэклог</span>
      </label>

      {/* Шаблоны */}
      <TemplatePanel
        title={title} description={description} priority={priority}
        projectId={projectId ? Number(projectId) : undefined} recurrence={recurrence}
        onApply={(tpl) => {
          if (tpl.title) setTitle(tpl.title);
          if (tpl.description) setDescription(tpl.description);
          if (tpl.priority) setPriority(tpl.priority);
          if (tpl.project_id) setProjectId(String(tpl.project_id));
          if (tpl.recurrence) setRecurrence(tpl.recurrence);
        }}
      />

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

type TplType = { id: number; name: string; title: string; description?: string; priority: string; project_id?: number; recurrence?: string };

function TemplatePanel({ title, description, priority, projectId, recurrence, onApply }: {
  title: string; description: string; priority: string;
  projectId?: number; recurrence?: string;
  onApply: (tpl: TplType) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tplName, setTplName] = useState('');
  const qc = useQueryClient();

  const { data: templates = [] } = useQuery<TplType[]>({
    queryKey: ['task-templates'],
    queryFn: () => axios.get(`${API_URL}/api/task-templates`).then(r => r.data),
  });

  const saveTemplate = async () => {
    if (!tplName.trim() || !title.trim()) return;
    await axios.post(`${API_URL}/api/task-templates`, {
      name: tplName.trim(), title, description, priority, project_id: projectId, recurrence,
    });
    qc.invalidateQueries({ queryKey: ['task-templates'] });
    setTplName('');
    setSaving(false);
  };

  const deleteTemplate = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await axios.delete(`${API_URL}/api/task-templates/${id}`);
    qc.invalidateQueries({ queryKey: ['task-templates'] });
  };

  return (
    <div className="mb-3 border-t pt-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-500">📋 Шаблоны</span>
        <div className="flex gap-1.5">
          {templates.length > 0 && (
            <button onClick={() => setOpen(v => !v)}
              className="text-xs px-2 py-0.5 border rounded text-gray-600 hover:bg-gray-50 transition">
              {open ? 'Скрыть' : `Применить (${templates.length})`}
            </button>
          )}
          <button onClick={() => setSaving(v => !v)}
            className="text-xs px-2 py-0.5 border rounded text-gray-600 hover:bg-gray-50 transition">
            Сохранить как шаблон
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-1 mb-2 max-h-36 overflow-y-auto">
          {templates.map(tpl => (
            <div key={tpl.id}
              onClick={() => { onApply(tpl); setOpen(false); }}
              className="flex items-center gap-2 px-2 py-1.5 rounded border hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition group">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{tpl.name}</div>
                <div className="text-xs text-gray-400 truncate">{tpl.title}</div>
              </div>
              <button onClick={(e) => deleteTemplate(tpl.id, e)}
                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition text-xs shrink-0">✕</button>
            </div>
          ))}
        </div>
      )}

      {saving && (
        <div className="flex gap-1.5 mb-2">
          <input autoFocus className="flex-1 px-2 py-1.5 border rounded text-xs"
            placeholder="Название шаблона…" value={tplName}
            onChange={e => setTplName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveTemplate(); if (e.key === 'Escape') setSaving(false); }} />
          <button onClick={saveTemplate} disabled={!tplName.trim() || !title.trim()}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-40">
            Сохранить
          </button>
          <button onClick={() => setSaving(false)} className="px-2 py-1.5 bg-gray-100 rounded text-xs">✕</button>
        </div>
      )}
    </div>
  );
}
