import React from 'react';
import axios from 'axios';
import type { Task } from '../types/dashboard';
import { API_URL, STATUS_COLOR, STATUS_BORDER, STATUS_EMOJI, STATUS_LABELS, PRIORITY_COLOR, PRIORITY_LABELS } from '../constants/taskDisplay';
import { showToast } from '../utils/toast';
import { BacklogTaskRow } from './BacklogPage';

export default function ProjectNavPage({ projects, tasks, navProject, navTaskPath, onSelectProject, onPushTask, onEditProject, onOpenTask, onNewProject, onNewTask, changeStatusMutation, takeTaskMutation, myUserId, invalidate, ancestorBlockedIds }: any) {
  const [statusFilter, setStatusFilter] = React.useState<string | null>(null);

  // Current node: last task in path, or project root (берём актуальные данные из tasks)
  const currentTaskStale: Task | null = navTaskPath.length > 0 ? navTaskPath[navTaskPath.length - 1] : null;
  const currentTask: Task | null = currentTaskStale ? (tasks.find((t: any) => t.id === currentTaskStale.id) ?? currentTaskStale) : null;

  // Reset filter when navigating to a different level
  React.useEffect(() => { setStatusFilter(null); }, [navProject?.id, currentTask?.id]);

  // Get direct children of a node from the flat tasks array
  const getChildren = (parentId: number) => tasks.filter((t: any) => t.parent_task_id === parentId);

  // Get subprojects
  const getSubprojects = (parentProjectId: number | null) => {
    return projects.filter((p: any) => p.parent_project_id === parentProjectId);
  };

  // Recursive function to render project tree
  const renderProjectTree = (parentProjectId: number | null, depth: number = 0) => {
    const subprojects = getSubprojects(parentProjectId);
    if (subprojects.length === 0) return null;

    return (
      <div className={depth > 0 ? 'ml-6 mt-2 space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'}>
        {subprojects.map((proj: any) => {
          const projAllTasks = tasks.filter((t: any) => {
            if (t.project_id === proj.id) return true;
            return tasks.find((p: any) => p.id === t.parent_task_id)?.project_id === proj.id;
          });
          const doneCount = projAllTasks.filter((t: any) => t.status === 'DONE').length;
          const pct = projAllTasks.length ? Math.round(doneCount / projAllTasks.length * 100) : 0;

          if (depth > 0) {
            // List view for subprojects
            return (
              <div
                key={proj.id}
                onClick={() => onSelectProject(proj)}
                className="bg-white rounded-lg border px-3 py-2 [@media(hover:hover)]:hover:shadow-md transition cursor-pointer group flex items-center gap-2"
              >
                <span className="text-xl">{proj.emoji || '📁'}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm truncate">{proj.name}</h3>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1 overflow-hidden">
                      <div className="h-full bg-green-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{doneCount}/{projAllTasks.length}</span>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const url = `${window.location.origin}${window.location.pathname}?project=${proj.id}`;
                      try { await navigator.clipboard.writeText(url); } catch {}
                    }}
                    className="text-xs hover:bg-gray-50 p-1 rounded"
                    title="Скопировать ссылку"
                  >🔗</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditProject(proj); }}
                    className="text-xs text-gray-400 hover:text-gray-600 transition p-1"
                  >✏️</button>
                </div>
              </div>
            );
          }

          // Grid view for top-level projects
          return (
            <div
              key={proj.id}
              onClick={() => onSelectProject(proj)}
              className="bg-white rounded-lg border p-4 [@media(hover:hover)]:hover:shadow-md transition cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-3xl">{proj.emoji || '📁'}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const url = `${window.location.origin}${window.location.pathname}?project=${proj.id}`;
                      try { await navigator.clipboard.writeText(url); } catch {}
                    }}
                    className="text-xs hover:bg-gray-50 p-1 rounded"
                    title="Скопировать ссылку"
                  >🔗</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditProject(proj); }}
                    className="text-xs text-gray-400 hover:text-gray-600 transition p-1"
                  >✏️</button>
                </div>
              </div>
              <h3 className="font-bold text-base mb-1">{proj.name}</h3>
              {proj.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{proj.description}</p>}
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-gray-400 shrink-0">{doneCount}/{projAllTasks.length}</span>
              </div>
              {/* Render subprojects inline */}
              {renderProjectTree(proj.id, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  // Level 0: all projects (top-level only, subprojects rendered inline)
  if (!navProject) {
    const topLevelProjects = projects.filter((p: any) => !p.parent_project_id);
    return (
      <>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg sm:text-xl font-bold">Проекты ({topLevelProjects.length})</h2>
          <button onClick={onNewProject} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium">+ Проект</button>
        </div>
        {renderProjectTree(null, 0)}
      </>
    );
  }

  // Level 1+: show children of current node (project root or any task)
  const allChildren: Task[] = currentTask
    ? getChildren(currentTask.id)
    : tasks.filter((t: any) => t.project_id === navProject.id && !t.parent_task_id);

  const children = statusFilter ? allChildren.filter((t: any) => t.status === statusFilter) : allChildren;

  const headerTitle = currentTask ? `#${currentTask.id} ${currentTask.title}` : `${navProject.emoji} ${navProject.name}`;

  // Status counts for filter buttons
  const statusCounts = ['TODO', 'DOING', 'DONE', 'BLOCKED'].map(s => ({
    status: s,
    count: allChildren.filter((t: any) => t.status === s).length,
  })).filter(s => s.count > 0);

  return (
    <>
      {currentTask && ancestorBlockedIds?.has(currentTask.id) && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
          🔒 Родительская задача заблокирована — эти задачи временно недоступны
        </div>
      )}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg sm:text-xl font-bold">{headerTitle}</h2>
          {currentTask && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[currentTask.status]}`}>
              {STATUS_EMOJI[currentTask.status]} {STATUS_LABELS[currentTask.status]}
            </span>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => onNewTask({ projectId: navProject.id, parentTaskId: currentTask?.id })}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium"
          >+ Задача</button>
          {!currentTask && (
            <button
              onClick={async () => {
                const url = `${window.location.origin}${window.location.pathname}?project=${navProject.id}`;
                try { await navigator.clipboard.writeText(url); } catch {}
              }}
              className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              title="Скопировать ссылку на проект"
            >🔗</button>
          )}
          {currentTask
            ? <button onClick={() => onOpenTask(currentTask)} className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">↗ Открыть</button>
            : <button onClick={() => onEditProject(navProject)} className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">✏️</button>
          }
        </div>
      </div>

      {statusCounts.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          {statusCounts.map(({ status, count }) => (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? null : status)}
              className={`px-2 py-1 rounded-lg border text-xs font-medium transition ${STATUS_COLOR[status]} ${statusFilter === status ? 'ring-2 ring-blue-500' : 'opacity-70 hover:opacity-100'}`}
            >
              {STATUS_EMOJI[status]} {STATUS_LABELS[status]} {count}
            </button>
          ))}
        </div>
      )}

      {children.length === 0 && <p className="text-gray-400 text-sm py-4 text-center">{statusFilter ? 'Нет задач с таким статусом' : 'Нет дочерних задач'}</p>}

      {/* Backlog section — shown only at project root level */}
      {!currentTask && (() => {
        const projBacklog = tasks.filter((t: any) => t.backlog && !t.archived && !t.deleted && t.project_id === navProject.id);
        if (projBacklog.length === 0) return null;
        return (
          <details className="mt-4 mb-2 border rounded-lg overflow-hidden">
            <summary className="px-3 py-2 bg-amber-50 text-sm font-medium cursor-pointer flex items-center gap-2 select-none list-none">
              <span>📦 Бэклог проекта</span>
              <span className="text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full">{projBacklog.length}</span>
            </summary>
            <div className="divide-y">
              {projBacklog.map((t: any) => (
                <BacklogTaskRow key={t.id} task={t} invalidate={invalidate} onOpenTask={onOpenTask} />
              ))}
            </div>
          </details>
        );
      })()}

      <div className="space-y-2">
        {children.map((task: any) => {
          const taskChildren = getChildren(task.id);
          const doneCount = taskChildren.filter((c: any) => c.status === 'DONE').length;
          const pct = taskChildren.length ? Math.round(doneCount / taskChildren.length * 100) : 0;
          const isAncBlocked = ancestorBlockedIds?.has(task.id);
          return (
            <div
              key={task.id}
              onClick={() => taskChildren.length > 0 ? onPushTask(task) : onOpenTask(task)}
              className={`rounded-lg border border-l-4 ${STATUS_BORDER[task.status]} p-3 [@media(hover:hover)]:hover:shadow-md transition cursor-pointer group ${isAncBlocked ? 'bg-gray-50 opacity-70' : 'bg-white'}`}
            >
              <div className="flex items-center gap-2">
                <div className="relative shrink-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded border flex items-center transition-opacity duration-150 ${
                    (task.status === 'TODO' || task.status === 'DOING' || task.status === 'DONE') ? 'md:group-hover:opacity-0' : ''
                  } ${STATUS_COLOR[task.status]}`}>{STATUS_EMOJI[task.status]}</span>
                  {task.status === 'TODO' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (myUserId && !task.assignee) {
                          takeTaskMutation.mutate({ taskId: task.id, userId: myUserId });
                        } else {
                          changeStatusMutation.mutate({ taskId: task.id, status: 'DOING' });
                        }
                      }}
                      className="absolute inset-0 hidden md:flex items-center justify-center px-1.5 py-0.5 rounded text-xs border border-blue-300 bg-blue-50 text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap hover:bg-blue-100"
                    >{myUserId && !task.assignee ? '🙋' : '▶'}</button>
                  )}
                  {task.status === 'DOING' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const taskChildren = tasks.filter((t: any) => t.parent_task_id === task.id);
                        const incomplete = taskChildren.filter((t: any) => t.status !== 'DONE');
                        if (incomplete.length > 0) {
                          const forms = ['подзадача не завершена', 'подзадачи не завершены', 'подзадач не завершено'];
                          const n = incomplete.length;
                          let formIdx: number;
                          if (n % 10 === 1 && n % 100 !== 11) formIdx = 0;
                          else if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) formIdx = 1;
                          else formIdx = 2;
                          showToast(`Нельзя завершить задачу: ${n} ${forms[formIdx]}. Завершите: ${incomplete.map((s: any) => `#${s.id}`).join(', ')}`, 'warning');
                        } else {
                          changeStatusMutation.mutate({ taskId: task.id, status: 'DONE' });
                        }
                      }}
                      className="absolute inset-0 hidden md:flex items-center justify-center px-1.5 py-0.5 rounded text-xs border border-green-300 bg-green-50 text-green-700 opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap hover:bg-green-100"
                    >✓</button>
                  )}
                  {task.status === 'DONE' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        axios.post(`${API_URL}/api/tasks/${task.id}/archive`).then(() => invalidate());
                      }}
                      className="absolute inset-0 hidden md:flex items-center justify-center px-1.5 py-0.5 rounded text-xs border border-gray-300 bg-gray-50 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap hover:bg-gray-100"
                    >🗄️</button>
                  )}
                </div>
                <span className="text-gray-400 text-xs shrink-0">#{task.id}</span>
                <span className="font-medium text-sm flex-1 truncate" title={task.title}>{task.title}</span>
                {isAncBlocked && <span className="text-xs shrink-0" title="Предок заблокирован">🔒</span>}
                {task.priority && task.priority !== 'NORMAL' && (
                  <span className={`text-xs px-1 py-0.5 rounded border shrink-0 ${PRIORITY_COLOR[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
                )}
                {task.assignee && <span className="text-xs text-gray-400 shrink-0 hidden sm:inline">{task.assignee.display_name}</span>}
                {taskChildren.length > 0
                  ? <span className="text-xs text-gray-400 shrink-0">{doneCount}/{taskChildren.length} ›</span>
                  : <button onClick={(e) => { e.stopPropagation(); onOpenTask(task); }} className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 hover:text-blue-600 shrink-0 transition">↗</button>
                }
              </div>
              {taskChildren.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-1 overflow-hidden">
                    <div className="h-full bg-green-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{pct}%</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
