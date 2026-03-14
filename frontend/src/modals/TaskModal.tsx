import React, { useState } from 'react';
import axios from 'axios';
import type { Task } from '../types/dashboard';
import { API_URL, STATUS_EMOJI, STATUS_LABELS, STATUS_COLOR, DUE_BADGE, PRIORITY_LABELS, PRIORITY_COLOR, PRIORITY_EMOJI } from '../constants/taskDisplay';
import { getDueStatus, toDateInputValue, formatDueDate, formatDatetime, plural } from '../utils/dateUtils';
import Modal from '../components/Modal';
import MarkdownContent from '../components/MarkdownContent';
import { CommentsSection } from '../components/CommentsSection';
import { showToast } from '../utils/toast';

export default function TaskModal({ task, onClose, onOpenTask, canGoBack, tasks, users, projects, changeStatusMutation, assignMutation, assignProjectMutation, updateTaskMutation, setConfirmDelete, invalidate, createSubtaskMutation, isAncestorBlocked, myUserId }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [dueDate, setDueDate] = useState(toDateInputValue(task.due_date));
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
  }, [task]);

  // Auto-suggest DONE when last subtask is completed
  const [showDoneSuggestion, setShowDoneSuggestion] = React.useState(false);
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
    // Send expected_updated_at for optimistic locking
    data.expected_updated_at = task.updated_at;
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
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="px-3 py-1.5 border rounded-lg text-sm w-full"
              />
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
            <div className="flex items-center gap-2 mt-2">
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
            </div>
          </>
        )}
      </div>

      <div className="space-y-2 mb-4">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Проект</label>
            <select
              key={`project-${task.project_id || 'none'}`}
              value={task.project_id || ''}
              onChange={(e) => {
                const projectId = e.target.value ? Number(e.target.value) : null;
                assignProjectMutation.mutate({ taskId: task.id, projectId });
              }}
              className="w-full px-2 py-1.5 border rounded-lg text-xs"
            >
              <option value="">Без проекта</option>
              {projects.map((p: any) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Исполнитель</label>
            <select
              value={task.assignee?.telegram_id || ''}
              onChange={(e) => {
                const userId = e.target.value ? Number(e.target.value) : null;
                assignMutation.mutate({ taskId: task.id, userId });
              }}
              className="w-full px-2 py-1.5 border rounded-lg text-xs"
            >
              <option value="">Не назначено</option>
              {users.map((u: any) => <option key={u.telegram_id} value={u.telegram_id}>{u.display_name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Родительская задача</label>
          <select
            key={`parent-${task.parent_task_id || 'none'}`}
            value={task.parent_task_id || ''}
            onChange={(e) => {
              const parentId = e.target.value ? Number(e.target.value) : null;
              updateTaskMutation.mutate({ id: task.id, data: { parent_task_id: parentId } });
            }}
            className="w-full px-2 py-1.5 border rounded-lg text-xs"
          >
            <option value="">Без родителя</option>
            {(tasks || []).filter((t: any) => !excludedIds.has(t.id)).map((t: any) => (
              <option key={t.id} value={t.id}>#{t.id} {t.title}</option>
            ))}
          </select>
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
                {PRIORITY_EMOJI[p]}
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
                      {new Date(b.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {b.resolved_at && (
                        <span className="text-green-600 ml-2">
                          → разблокировано: {new Date(b.resolved_at).toLocaleDateString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
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
                    className={`text-sm flex-1 truncate text-left hover:underline hover:text-blue-600 transition ${sub.status === 'DONE' ? 'line-through text-gray-400' : ''}`}
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
    </Modal>
  );
}

