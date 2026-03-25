import React, { useState } from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Task } from '../types/dashboard';
import { API_URL, STATUS_EMOJI, STATUS_LABELS, STATUS_COLOR, DUE_BADGE, PRIORITY_LABELS, PRIORITY_COLOR, PRIORITY_EMOJI } from '../constants/taskDisplay';
import { getDueStatus, toDateInputValue, formatDueDate, formatDatetime, plural, parseUTC, formatTime } from '../utils/dateUtils';
import Modal from '../components/Modal';
import MarkdownContent from '../components/MarkdownContent';
import { CommentsSection } from '../components/CommentsSection';
import { showToast } from '../utils/toast';
import { TaskTimer } from '../components/TaskTimer';

type TagType = { id: number; name: string; color: string };

function TagPicker({ taskId, taskTags, onTagsChange }: {
  taskId: number;
  taskTags: TagType[];
  onTagsChange: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newColor, setNewColor] = React.useState('#6366f1');
  const ref = React.useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: allTags = [] } = useQuery<TagType[]>({
    queryKey: ['tags'],
    queryFn: () => axios.get(`${API_URL}/api/tags`).then(r => r.data),
  });

  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const taskTagIds = new Set(taskTags.map(t => t.id));

  const toggle = async (tag: TagType) => {
    if (taskTagIds.has(tag.id)) {
      await axios.delete(`${API_URL}/api/tasks/${taskId}/tags/${tag.id}`);
    } else {
      await axios.post(`${API_URL}/api/tasks/${taskId}/tags/${tag.id}`);
    }
    qc.invalidateQueries({ queryKey: ['tasks'] });
    onTagsChange();
  };

  const createTag = async () => {
    if (!newName.trim()) return;
    try {
      const { data } = await axios.post(`${API_URL}/api/tags`, { name: newName.trim(), color: newColor });
      await axios.post(`${API_URL}/api/tasks/${taskId}/tags/${data.id}`);
      qc.invalidateQueries({ queryKey: ['tags'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      onTagsChange();
      setNewName('');
    } catch {
      showToast('Тег уже существует', 'error');
    }
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1.5 flex-wrap">
        {taskTags.map(tag => (
          <button key={tag.id}
            onClick={() => toggle(tag)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border hover:opacity-75 transition"
            style={{ backgroundColor: tag.color + '22', borderColor: tag.color + '66', color: tag.color }}
            title="Снять тег"
          >
            {tag.name} ✕
          </button>
        ))}
        <button onClick={() => setOpen(v => !v)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition">
          + тег
        </button>
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border rounded-lg shadow-lg w-56 p-2">
          <div className="space-y-1 max-h-40 overflow-y-auto mb-2">
            {allTags.length === 0 && <p className="text-xs text-gray-400 py-1 text-center">Нет тегов</p>}
            {allTags.map(tag => (
              <button key={tag.id} onClick={() => toggle(tag)}
                className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition ${taskTagIds.has(tag.id) ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                <span className="flex-1 text-left">{tag.name}</span>
                {taskTagIds.has(tag.id) && <span className="text-green-500">✓</span>}
              </button>
            ))}
          </div>
          <div className="border-t pt-2 flex gap-1">
            <input className="flex-1 px-2 py-1 border rounded text-xs" placeholder="Новый тег"
              value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createTag()} />
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
              className="w-7 h-7 rounded border cursor-pointer p-0.5" title="Цвет" />
            <button onClick={createTag}
              className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">+</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Зависимости задачи: «блокирует» / «зависит от»
function DependencyPicker({ taskId, tasks, onOpenTask }: {
  taskId: number;
  tasks: any[];
  onOpenTask?: (t: any) => void;
}) {
  const [deps, setDeps] = React.useState<any[]>([]);
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const ref = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(() => {
    axios.get(`${API_URL}/api/tasks/${taskId}/dependencies`)
      .then(r => setDeps(r.data))
      .catch(() => {});
  }, [taskId]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const addDep = async (dependsOnId: number) => {
    await axios.post(`${API_URL}/api/tasks/${taskId}/dependencies`, { depends_on_id: dependsOnId });
    load();
    setOpen(false);
    setSearch('');
  };

  const removeDep = async (depId: number) => {
    await axios.delete(`${API_URL}/api/tasks/${taskId}/dependencies/${depId}`);
    load();
  };

  const depIds = new Set(deps.map((d: any) => d.depends_on_id));
  const filtered = (tasks || []).filter((t: any) =>
    t.id !== taskId &&
    !depIds.has(t.id) &&
    (search === '' || t.title.toLowerCase().includes(search.toLowerCase()) || String(t.id).includes(search))
  ).slice(0, 20);

  if (deps.length === 0 && !open) {
    return (
      <div className="mb-3">
        <button onClick={() => setOpen(true)}
          className="text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 rounded px-2 py-1 hover:border-gray-400 transition">
          + зависит от…
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="mb-3">
      <div className="flex items-center gap-1 mb-1">
        <span className="text-xs text-gray-500">🔗 Зависит от</span>
      </div>
      <div className="space-y-1">
        {deps.map((d: any) => {
          const fullTask = (tasks || []).find((t: any) => t.id === d.depends_on_id);
          const isDone = d.depends_on_status === 'DONE';
          return (
            <div key={d.id} className="flex items-center gap-2 text-xs px-2 py-1 bg-gray-50 rounded border">
              <span className={`shrink-0 ${isDone ? 'text-green-500' : 'text-amber-500'}`}>{isDone ? '✅' : '⏳'}</span>
              <button
                onClick={() => fullTask && onOpenTask?.(fullTask)}
                className="flex-1 text-left truncate hover:text-blue-600 hover:underline"
                title={d.depends_on_title}
              >#{d.depends_on_id} {d.depends_on_title}</button>
              <button onClick={() => removeDep(d.id)} className="shrink-0 text-gray-400 hover:text-red-500">✕</button>
            </div>
          );
        })}
        <div className="relative">
          <button onClick={() => setOpen(v => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 rounded px-2 py-1 hover:border-gray-400 transition">
            + добавить зависимость
          </button>
          {open && (
            <div className="absolute z-50 top-full left-0 mt-1 bg-white border rounded-lg shadow-lg w-64 p-2">
              <input
                autoFocus
                className="w-full px-2 py-1.5 border rounded text-xs mb-2"
                placeholder="Поиск задачи…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Нет задач</p>}
                {filtered.map((t: any) => (
                  <button key={t.id} onClick={() => addDep(t.id)}
                    className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-50 flex items-center gap-2">
                    <span className="text-gray-400 shrink-0">#{t.id}</span>
                    <span className="flex-1 truncate">{t.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Компактное поле с dropdown — показывает текущее значение как кнопку, по клику открывает select
function DropdownField({ label, value, placeholder, options, current, onChange }: {
  label: string; value: string | null; placeholder: string;
  options: { value: string; label: string }[]; current: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {label && <div className="text-xs text-gray-500 mb-1">{label}</div>}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-2 py-1.5 border rounded-lg text-xs bg-white hover:bg-gray-50 transition text-left"
      >
        <span className={value ? 'text-gray-800 truncate' : 'text-gray-400'}>{value || placeholder}</span>
        <span className="text-gray-400 ml-1 shrink-0">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition ${opt.value === current ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
            >{opt.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TaskModal({ task, onClose, onOpenTask, canGoBack, tasks, users, projects, changeStatusMutation, assignMutation, assignProjectMutation, updateTaskMutation, setConfirmDelete, invalidate, createSubtaskMutation, isAncestorBlocked, myUserId }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [dueDate, setDueDate] = useState(toDateInputValue(task.due_date));
  const [recurrence, setRecurrence] = useState(task.recurrence || '');
  const [descTab, setDescTab] = useState<'write' | 'preview'>('write');
  const descTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskDesc, setNewSubtaskDesc] = useState('');
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const [subtaskMode, setSubtaskMode] = useState<'create' | 'attach'>('create');
  const [attachTaskId, setAttachTaskId] = useState('');
  const [pendingBlock, setPendingBlock] = useState(false);
  const [blockReasonText, setBlockReasonText] = useState('');
  // Concurrent edit conflict state
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictData, setConflictData] = useState<{current: any; local: any} | null>(null);
  const dueStatusView = getDueStatus(task.due_date, task.status);

  // Build children from flat tasks list (supports any depth)
  const directChildren = (tasks || []).filter((t: any) => t.parent_task_id === task.id);
  
  // Check for incomplete subtasks (for DONE button blocking)
  const incompleteSubtasks = directChildren.filter((t: any) => t.status !== 'DONE');
  const hasIncompleteSubtasks = incompleteSubtasks.length > 0;
  
  // Track if user attempted to click DONE
  const [showBlockedWarning, setShowBlockedWarning] = useState(false);
  
  // Hide warning when subtasks change or task status changes
  React.useEffect(() => {
    setShowBlockedWarning(false);
  }, [directChildren, task.status]);

  // All descendant IDs (to prevent cycles in parent selector)
  const getDescendantIds = (id: number): Set<number> => {
    const ids = new Set<number>();
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift()!;
      ids.add(cur);
      (tasks || []).filter((t: any) => t.parent_task_id === cur).forEach((t: any) => queue.push(t.id));
    }
    return ids;
  };
  const excludedIds = getDescendantIds(task.id);

  React.useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setDueDate(toDateInputValue(task.due_date));
    setRecurrence(task.recurrence || '');
  }, [task]);

  // Auto-suggest DONE when last subtask is completed
  const [showDoneSuggestion, setShowDoneSuggestion] = React.useState(false);
  const [showTimeResetConfirm, setShowTimeResetConfirm] = useState(false);
  React.useEffect(() => {
    if (task.status !== 'DONE' && directChildren.length > 0) {
      const allDone = directChildren.every((t: any) => t.status === 'DONE');
      setShowDoneSuggestion(allDone);
    } else {
      setShowDoneSuggestion(false);
    }
  }, [directChildren, task.status]);

  // Markdown insertion helper with toggle support
  const insertMarkdown = (prefix: string, suffix: string) => {
    const textarea = descTextareaRef.current;
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

  const handleSave = () => {
    const data: any = { title, description };
    data.due_date = dueDate || null;
    data.recurrence = recurrence || null;
    updateTaskMutation.mutate(
      { id: task.id, data },
      {
        onSuccess: () => setIsEditing(false),
        onError: (error: any) => {
          if (error?.response?.status === 409 && error?.response?.data?.detail?.code === 'CONCURRENT_EDIT') {
            // Show conflict resolution modal
            setConflictData({
              current: error.response.data.detail,
              local: { title, description, due_date: data.due_date }
            });
            setShowConflictModal(true);
          } else {
            showToast('Ошибка при сохранении', 'error');
          }
        }
      }
    );
  };

  return (
    <Modal onClose={onClose}>
      {canGoBack && (
        <button onClick={onClose} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 mb-3 transition">
          ← Назад
        </button>
      )}
      {isAncestorBlocked && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
          🔒 Родительская задача заблокирована — эта задача временно недоступна
        </div>
      )}
      <div className="mb-4">
        <span className={`inline-block px-2 py-1 rounded-full text-xs border mb-2 ${STATUS_COLOR[task.status]}`}>
          {STATUS_EMOJI[task.status]} {STATUS_LABELS[task.status]}
        </span>

        {isEditing ? (
          <div className="space-y-2 mb-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave(); } }}
              className="w-full px-3 py-2 border rounded-lg font-bold text-sm sm:text-base"
            />
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
                  ref={descTextareaRef}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={handleMarkdownShortcuts}
                  className="w-full px-3 py-2 border-0 text-sm focus:outline-none font-mono text-xs"
                  rows={4}
                  placeholder="Описание (поддерживается Markdown)"
                />
              ) : (
                <div className="px-3 py-2 min-h-[96px]">
                  {description ? <MarkdownContent content={description} /> : <span className="text-gray-400 text-xs">Нет описания</span>}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400">Шорткаты: Ctrl+B жирный, Ctrl+I курсив, Ctrl+E код, Ctrl+K ссылка</p>
            <div>
              <label className="text-xs text-gray-500 block mb-1">📅 Дедлайн</label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="px-3 py-1.5 border rounded-lg text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">🔁 Повторение</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className="w-full px-3 py-1.5 border rounded-lg text-sm"
              >
                <option value="">Без повторения</option>
                <option value="daily">Ежедневно</option>
                <option value="weekly">Еженедельно</option>
                <option value="monthly">Ежемесячно</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
              >Сохранить</button>
              <button
                onClick={() => {
                  setTitle(task.title);
                  setDescription(task.description || '');
                  setDueDate(toDateInputValue(task.due_date));
                  setIsEditing(false);
                }}
                className="px-3 py-1 bg-gray-200 rounded text-sm"
              >Отмена</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg sm:text-xl font-bold">#{task.id} {task.title}</h2>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={async () => {
                    const url = `${window.location.origin}${window.location.pathname}?task=${task.id}`;
                    try {
                      await navigator.clipboard.writeText(url);
                    } catch {
                      const el = document.createElement('textarea');
                      el.value = url;
                      el.style.position = 'fixed';
                      el.style.opacity = '0';
                      document.body.appendChild(el);
                      el.select();
                      document.execCommand('copy');
                      document.body.removeChild(el);
                    }
                    showToast('Ссылка скопирована', 'success');
                  }}
                  className="text-gray-400 hover:text-blue-600 transition p-1 rounded"
                  title="Скопировать ссылку на задачу"
                  aria-label="Скопировать ссылку на задачу"
                >🔗</button>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs text-blue-600 hover:underline"
              >Редактировать</button>
              <span className="text-xs text-gray-400">Создана {formatDatetime(task.created_at)}</span>
              {task.started_at && (
                <span className="text-xs text-blue-400">▶ {formatDatetime(task.started_at)}</span>
              )}
              {task.completed_at && (
                <span className="text-xs text-green-500">✓ {formatDatetime(task.completed_at)}</span>
              )}
              {task.due_date && (
                dueStatusView ? (
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${DUE_BADGE[dueStatusView]}`}>
                    📅 {dueStatusView === 'overdue' ? 'Просрочено · ' : dueStatusView === 'today' ? 'Сегодня · ' : ''}{formatDueDate(task.due_date)}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">📅 {formatDueDate(task.due_date)}</span>
                )
              )}
            </div>
            {task.description && <MarkdownContent content={task.description} className="mt-2" />}
            {/* Дедлайн в режиме просмотра */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs text-gray-400">📅 Дедлайн:</span>
              {task.due_date ? (
                dueStatusView ? (
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${DUE_BADGE[dueStatusView]}`}>
                    {dueStatusView === 'overdue' ? 'Просрочено · ' : dueStatusView === 'today' ? 'Сегодня · ' : ''}{formatDueDate(task.due_date)}
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">{formatDueDate(task.due_date)}</span>
                )
              ) : (
                <button onClick={() => setIsEditing(true)} className="text-xs text-gray-400 hover:text-blue-600 hover:underline">
                  не задан
                </button>
              )}
              {task.recurrence && (
                <span className="text-xs px-1.5 py-0.5 rounded border bg-purple-50 text-purple-600 border-purple-200">
                  🔁 {task.recurrence === 'daily' ? 'Ежедневно' : task.recurrence === 'weekly' ? 'Еженедельно' : 'Ежемесячно'}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="space-y-2 mb-4">

        {/* Проект + Исполнитель — компактные кликабельные поля */}
        <div className="grid grid-cols-2 gap-2">
          <DropdownField
            label="📁 Проект"
            value={task.project_id ? `${projects.find((p:any)=>p.id===task.project_id)?.emoji||''} ${projects.find((p:any)=>p.id===task.project_id)?.name||''}`.trim() : null}
            placeholder="Без проекта"
            options={[
              { value: '', label: '— Без проекта' },
              ...projects.map((p:any) => ({ value: String(p.id), label: `${p.emoji} ${p.name}` }))
            ]}
            current={String(task.project_id || '')}
            onChange={(v) => assignProjectMutation.mutate({ taskId: task.id, projectId: v ? Number(v) : null })}
          />
          <DropdownField
            label="👤 Исполнитель"
            value={task.assignee ? task.assignee.display_name : null}
            placeholder="Не назначен"
            options={[
              { value: '', label: '— Не назначен' },
              ...users.map((u:any) => ({ value: String(u.telegram_id), label: u.display_name }))
            ]}
            current={String(task.assignee?.telegram_id || '')}
            onChange={(v) => assignMutation.mutate({ taskId: task.id, userId: v ? Number(v) : null })}
          />
        </div>

        {/* Родительская задача */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">↳ Родительская задача</label>
            {task.parent_task_id && (() => {
              const parentTask = (tasks || []).find((t: any) => t.id === task.parent_task_id);
              return parentTask ? (
                <button
                  onClick={() => onOpenTask?.(parentTask)}
                  className="text-xs text-blue-600 hover:underline"
                  title={`Открыть: ${parentTask.title}`}
                >
                  → #{parentTask.id} {parentTask.title.length > 24 ? parentTask.title.slice(0, 24) + '…' : parentTask.title}
                </button>
              ) : null;
            })()}
          </div>
          {(() => {
            // Показываем только задачи того же проекта (или без проекта если задача без проекта)
            const sameProjectTasks = (tasks || []).filter((t: any) =>
              !excludedIds.has(t.id) &&
              (task.project_id ? t.project_id === task.project_id : true)
            );
            const parentTask = (tasks || []).find((t: any) => t.id === task.parent_task_id);
            return (
              <DropdownField
                label=""
                value={parentTask ? `#${parentTask.id} ${parentTask.title}` : null}
                placeholder="Без родителя"
                options={[
                  { value: '', label: '— Без родителя' },
                  ...sameProjectTasks.map((t: any) => ({ value: String(t.id), label: `#${t.id} ${t.title}` }))
                ]}
                current={String(task.parent_task_id || '')}
                onChange={(v) => updateTaskMutation.mutate({ id: task.id, data: { parent_task_id: v ? Number(v) : null } })}
              />
            );
          })()}
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Приоритет</label>
          <div className="flex gap-1.5">
            {Object.entries(PRIORITY_LABELS).map(([p, label]) => (
              <button
                key={p}
                onClick={() => updateTaskMutation.mutate({ id: task.id, data: { priority: p } })}
                className={`flex-1 py-1.5 rounded text-xs font-medium border transition ${
                  (task.priority || 'NORMAL') === p ? `${PRIORITY_COLOR[p]} font-bold` : 'bg-white hover:bg-gray-50'
                }`}
                title={label}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Статус</label>
          <div className="flex gap-1.5">
            {Object.entries(STATUS_LABELS).map(([status, label]) => {
              const isDone = status === 'DONE';
              const isDisabled = isDone && hasIncompleteSubtasks;
              
              return (
                <button
                  key={status}
                  onClick={() => {
                    if (isDisabled) {
                      setShowBlockedWarning(true);
                      return;
                    }
                    if (status === 'BLOCKED' && task.status !== 'BLOCKED') {
                      setPendingBlock(true);
                      setBlockReasonText('');
                    } else {
                      changeStatusMutation.mutate({ taskId: task.id, status });
                    }
                  }}
                  disabled={isDisabled}
                  className={`flex-1 py-1.5 rounded text-xs font-medium border transition ${
                    task.status === status ? 'bg-blue-600 text-white border-blue-600' : 
                    isDisabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white hover:bg-gray-50'
                  }`}
                  title={isDisabled ? `Сначала завершите подзадачи: ${incompleteSubtasks.map((s: any) => `#${s.id}`).join(', ')}` : label}
                >
                  {STATUS_EMOJI[status]} <span className="hidden sm:inline">{label}</span>
                </button>
              );
            })}
          </div>
          {showBlockedWarning && (
            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              ⚠️ Нельзя завершить задачу: {incompleteSubtasks.length} {plural(incompleteSubtasks.length, ['подзадача не завершена', 'подзадачи не завершены', 'подзадач не завершено'])}.
              Завершите: {incompleteSubtasks.map((s: any) => `#${s.id}`).join(', ')}
            </div>
          )}
          {showDoneSuggestion && (
            <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 flex items-center justify-between">
              <span>✅ Все подзадачи завершены! Отметить задачу выполненной?</span>
              <button
                onClick={() => changeStatusMutation.mutate({ taskId: task.id, status: 'DONE' })}
                className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 font-medium"
              >Да, завершить</button>
            </div>
          )}
          {pendingBlock && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-xs text-red-700 font-medium mb-1">Причина блокировки</div>
              <textarea
                autoFocus
                value={blockReasonText}
                onChange={e => setBlockReasonText(e.target.value)}
                placeholder="Что мешает выполнению задачи?"
                className="w-full px-2 py-1.5 border border-red-200 rounded text-xs resize-none"
                rows={2}
              />
              <div className="flex gap-2 mt-1.5 justify-end">
                <button
                  onClick={() => setPendingBlock(false)}
                  className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800"
                >Отмена</button>
                <button
                  onClick={() => {
                    if (!blockReasonText.trim()) return;
                    changeStatusMutation.mutate({ taskId: task.id, status: 'BLOCKED', blockReason: blockReasonText.trim() });
                    setPendingBlock(false);
                  }}
                  className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                >Заблокировать</button>
              </div>
            </div>
          )}
          {!pendingBlock && task.status === 'BLOCKED' && task.blockers && task.blockers.length > 0 && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              ⚠️ {task.blockers[task.blockers.length - 1].text}
            </div>
          )}
          {/* Blocker history */}
          {task.blockers && task.blockers.length > 0 && (
            <details className="mt-2 group">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 flex items-center gap-1">
                📜 История блокеров ({task.blockers.length})
              </summary>
              <div className="mt-1 space-y-1">
                {task.blockers.map((b: any) => (
                  <div key={b.id} className={`text-xs p-1.5 rounded border ${
                    b.resolved_at 
                      ? 'bg-gray-50 border-gray-200 text-gray-600 line-through' 
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}>
                    <div>⚠️ {b.text}</div>
                    <div className="text-gray-400 text-xs mt-0.5">
                      {parseUTC(b.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {b.resolved_at && (
                        <span className="text-green-600 ml-2">
                          → разблокировано: {parseUTC(b.resolved_at).toLocaleDateString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      {/* Time Tracking */}
      <div className="mb-4">
        <label className="text-xs text-gray-500 block mb-1">⏱ Время</label>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-700">
            {formatTime(task.time_spent || 0)}
          </span>
          {(task.time_spent || 0) > 0 && (
            <button
              onClick={() => setShowTimeResetConfirm(true)}
              className="text-xs text-gray-400 hover:text-gray-600"
              title="Сбросить"
            >
              ×
            </button>
          )}
          <div className="flex gap-1">
            {[
              { label: '15м', value: 15 },
              { label: '30м', value: 30 },
              { label: '1ч', value: 60 },
              { label: '2ч', value: 120 },
            ].map((preset) => (
              <button
                key={preset.value}
                onClick={() => {
                  axios.patch(`${API_URL}/api/tasks/${task.id}/time`, { minutes: preset.value })
                    .then(() => {
                      showToast(`Добавлено ${preset.label}`, 'success');
                      invalidate();
                    })
                    .catch(() => showToast('Ошибка', 'error'));
                }}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
              >
                +{preset.label}
              </button>
            ))}
            <input
              type="number"
              placeholder="мин"
              className="w-14 text-xs px-2 py-1 border rounded"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const value = Number(e.currentTarget.value);
                  if (value > 0) {
                    axios.patch(`${API_URL}/api/tasks/${task.id}/time`, { minutes: value })
                      .then(() => {
                        showToast(`Добавлено ${value} мин`, 'success');
                        invalidate();
                        e.currentTarget.value = '';
                      })
                      .catch(() => showToast('Ошибка', 'error'));
                  }
                }
              }}
            />
          </div>
          <TaskTimer
            taskId={task.id}
            onStop={(seconds) => {
              const minutes = Math.floor(seconds / 60);
              if (minutes > 0) {
                axios.patch(`${API_URL}/api/tasks/${task.id}/time`, { minutes })
                  .then(() => {
                    showToast(`Таймер: добавлено ${minutes} мин`, 'success');
                    invalidate();
                  })
                  .catch(() => showToast('Ошибка', 'error'));
              }
            }}
          />
        </div>
      </div>

      {/* Tags */}
      <div className="mb-4">
        <label className="text-xs text-gray-500 block mb-1.5">🏷 Теги</label>
        <TagPicker
          taskId={task.id}
          taskTags={task.tags || []}
          onTagsChange={invalidate}
        />
      </div>

      {/* Dependencies */}
      <DependencyPicker taskId={task.id} tasks={tasks} onOpenTask={onOpenTask} />

      {/* Subtasks section */}
      <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium">Подзадачи {directChildren.length ? `(${directChildren.length})` : ''}</span>
            <button
              onClick={() => setShowSubtaskInput(v => !v)}
              className="text-xs text-blue-600 hover:underline"
            >+ Добавить</button>
          </div>

          {showSubtaskInput && (
            <div className="mb-2 p-2 bg-gray-50 rounded-lg border">
              <div className="flex gap-1 mb-2">
                <button
                  onClick={() => setSubtaskMode('create')}
                  className={`flex-1 py-1 rounded text-xs font-medium border transition ${subtaskMode === 'create' ? 'bg-white border-blue-300 text-blue-700' : 'bg-transparent border-transparent text-gray-500 hover:text-gray-700'}`}
                >+ Новая</button>
                <button
                  onClick={() => setSubtaskMode('attach')}
                  className={`flex-1 py-1 rounded text-xs font-medium border transition ${subtaskMode === 'attach' ? 'bg-white border-blue-300 text-blue-700' : 'bg-transparent border-transparent text-gray-500 hover:text-gray-700'}`}
                >↗ Привязать</button>
              </div>

              {subtaskMode === 'create' ? (
                <div className="space-y-1.5">
                  <input
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setShowSubtaskInput(false); setNewSubtaskTitle(''); setNewSubtaskDesc(''); } }}
                    placeholder="Название подзадачи"
                    className="w-full px-2 py-1.5 border rounded text-sm bg-white"
                    autoFocus
                  />
                  <textarea
                    value={newSubtaskDesc}
                    onChange={(e) => setNewSubtaskDesc(e.target.value)}
                    placeholder="Описание (необязательно)"
                    className="w-full px-2 py-1.5 border rounded text-sm bg-white resize-none"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (newSubtaskTitle.trim()) {
                          createSubtaskMutation.mutate(
                            { parentId: task.id, title: newSubtaskTitle.trim(), description: newSubtaskDesc || undefined },
                            { onSuccess: () => { setNewSubtaskTitle(''); setNewSubtaskDesc(''); setShowSubtaskInput(false); } }
                          );
                        }
                      }}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
                    >Создать</button>
                    <button
                      onClick={() => { setShowSubtaskInput(false); setNewSubtaskTitle(''); setNewSubtaskDesc(''); }}
                      className="px-3 py-1 bg-gray-200 rounded text-sm"
                    >Отмена</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <select
                    value={attachTaskId}
                    onChange={(e) => setAttachTaskId(e.target.value)}
                    className="w-full px-2 py-1.5 border rounded text-sm bg-white"
                    autoFocus
                  >
                    <option value="">Выбрать задачу...</option>
                    {(tasks || []).filter((t: any) => !excludedIds.has(t.id) && t.parent_task_id !== task.id).map((t: any) => (
                      <option key={t.id} value={t.id}>#{t.id} {t.title}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (attachTaskId) {
                          updateTaskMutation.mutate(
                            { id: Number(attachTaskId), data: { parent_task_id: task.id } },
                            { onSuccess: () => { setAttachTaskId(''); setShowSubtaskInput(false); } }
                          );
                        }
                      }}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
                    >Привязать</button>
                    <button
                      onClick={() => { setShowSubtaskInput(false); setAttachTaskId(''); }}
                      className="px-3 py-1 bg-gray-200 rounded text-sm"
                    >Отмена</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {directChildren.length > 0 ? (
            <div className="space-y-1">
              {directChildren.map((sub: any) => {
                const subImplicitBlocked = task.status === 'BLOCKED' && sub.status !== 'BLOCKED' && sub.status !== 'DONE';
                return (
                <div key={sub.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 ${subImplicitBlocked ? 'opacity-60' : ''}`}>
                  <input
                    type="checkbox"
                    checked={sub.status === 'DONE'}
                    disabled={subImplicitBlocked}
                    onChange={() => {
                      const newStatus = sub.status === 'DONE' ? 'TODO' : 'DONE';
                      changeStatusMutation.mutate({ taskId: sub.id, status: newStatus });
                    }}
                    className="rounded shrink-0"
                  />
                  <button
                    title="Открыть подзадачу"
                    onClick={() => { const full = (tasks || []).find((t: Task) => t.id === sub.id) ?? sub; onOpenTask?.(full); }}
                    className={`text-sm flex-1 min-w-0 text-left hover:underline hover:text-blue-600 transition line-clamp-2 ${sub.status === 'DONE' ? 'line-through text-gray-400' : ''}`}
                  >
                    {sub.title}
                  </button>
                  {subImplicitBlocked && <span className="text-xs shrink-0" title="Заблокирована родителем">🔒</span>}
                  {sub.assignee && (
                    <span className="text-xs text-gray-400 shrink-0">{sub.assignee.display_name}</span>
                  )}
                  <span className={`text-xs px-1 py-0.5 rounded border shrink-0 ${STATUS_COLOR[sub.status]}`}>
                    {STATUS_EMOJI[sub.status]}
                  </span>
                </div>
                );
              })}
            </div>
          ) : (
            !showSubtaskInput && <p className="text-xs text-gray-400">Нет подзадач</p>
          )}
        </div>

      {/* Comments */}
      <CommentsSection taskId={task.id} myUserId={myUserId} users={users} />

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Закрыть</button>
        <button
          onClick={() => {
            const newBacklog = !task.backlog;
            updateTaskMutation.mutate({ id: task.id, data: { backlog: newBacklog } }, {
              onSuccess: () => {
                invalidate();
                showToast(newBacklog ? 'Задача добавлена в бэклог 📦' : 'Задача убрана из бэклога ✅', 'info');
              },
            });
          }}
          className={`px-3 py-2 border rounded-lg text-sm transition ${task.backlog ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'}`}
          title={task.backlog ? 'Убрать из бэклога' : 'В бэклог'}
        >📦</button>
        <button
          onClick={() => {
            axios.post(`${API_URL}/api/tasks/${task.id}/archive`).then(() => {
              invalidate();
              onClose();
            });
          }}
          className="px-3 py-2 bg-gray-100 text-gray-600 border border-gray-200 rounded-lg text-sm hover:bg-gray-200 transition"
          title="Архивировать"
        >🗄️</button>
        <button
          onClick={() => setConfirmDelete({ type: 'task', id: task.id })}
          className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition"
          title="Удалить"
        >🗑️</button>
      </div>

      {/* Concurrent Edit Conflict Modal */}
      {showConflictModal && conflictData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-bold mb-3 text-red-600">⚠️ Конфликт редактирования</h3>
            <p className="text-sm text-gray-600 mb-4">
              Другой пользователь изменил эту задачу пока вы её редактировали.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4 text-xs">
              <div className="font-medium text-amber-800 mb-2">Ваши изменения:</div>
              <div className="text-gray-600 truncate">Заголовок: {conflictData.local.title}</div>
              <div className="text-gray-600 truncate">Дедлайн: {conflictData.local.due_date || 'не указан'}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowConflictModal(false);
                  setConflictData(null);
                  // Reload task from server
                  invalidate();
                  onClose();
                }}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
              >
                Отменить и обновить
              </button>
              <button
                onClick={() => {
                  // Force save - overwrite server version
                  const data: any = { title: conflictData.local.title, description: conflictData.local.description };
                  data.due_date = conflictData.local.due_date || null;
                  // Don't send expected_updated_at to force overwrite
                  updateTaskMutation.mutate(
                    { id: task.id, data },
                    { onSuccess: () => { setShowConflictModal(false); setConflictData(null); setIsEditing(false); invalidate(); }}
                  );
                }}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600"
              >
                Перезаписать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Time Reset Confirmation Modal */}
      {showTimeResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowTimeResetConfirm(false)}>
          <div className="bg-white rounded-lg p-4 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Сбросить время?</h3>
            <p className="text-sm text-gray-600 mb-4">Текущее время ({formatTime(task.time_spent || 0)}) будет удалено.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTimeResetConfirm(false)}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  axios.patch(`${API_URL}/api/tasks/${task.id}`, { time_spent: 0 })
                    .then(() => {
                      showToast('Время сброшено', 'success');
                      invalidate();
                      setShowTimeResetConfirm(false);
                    })
                    .catch(() => showToast('Ошибка', 'error'));
                }}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600"
              >
                Сбросить
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

