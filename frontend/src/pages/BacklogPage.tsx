import React from 'react';
import axios from 'axios';

import type { Task, Project } from '../types/dashboard';
import { API_URL, STATUS_COLOR, STATUS_EMOJI, PRIORITY_COLOR, PRIORITY_LABELS } from '../constants/taskDisplay';
import { timeAgo } from '../utils/dateUtils';

interface BacklogTaskRowProps {
  task: Task;
  invalidate: () => void;
  onOpenTask: (t: Task) => void;
}

function BacklogTaskRow({ task, invalidate, onOpenTask }: BacklogTaskRowProps) {
  const handlePromote = async () => {
    await axios.patch(`${API_URL}/api/tasks/${task.id}`, { backlog: false });
    invalidate();
  };
  return (
    <div className="bg-white border rounded-lg px-3 py-2 flex items-center gap-2 hover:border-gray-300 transition">
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpenTask(task)}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_COLOR[task.status]}`}>{STATUS_EMOJI[task.status]}</span>
          <span className={`text-xs px-1 rounded ${PRIORITY_COLOR[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
          <span className="text-sm truncate">{task.title}</span>
          {task.assignee && <span className="text-xs text-gray-400">· {task.assignee.display_name}</span>}
        </div>
        {task.backlog_added_at && (
          <div className="text-xs text-gray-400 mt-0.5">добавлен {timeAgo(task.backlog_added_at)}</div>
        )}
      </div>
      <button
        onClick={handlePromote}
        className="shrink-0 text-xs px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition whitespace-nowrap"
        title="В работу"
      >→ В работу</button>
    </div>
  );
}

interface BacklogPageProps {
  tasks: Task[];
  projects: Project[];
  onOpenTask: (t: Task) => void;
  onNewTask: (ctx: { projectId?: number; backlog?: boolean }) => void;
  invalidate: () => void;
}

export default function BacklogPage({ tasks, projects, onOpenTask, onNewTask, invalidate }: BacklogPageProps) {
  const backlogTasks = tasks.filter(t => t.backlog && !t.archived && !t.deleted);

  // Group by project_id (null = no project)
  const groups: { id: number | null; name: string; emoji: string; tasks: Task[] }[] = [];
  const byProject = new Map<number | null, Task[]>();
  for (const t of backlogTasks) {
    const key = t.project_id ?? null;
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key)!.push(t);
  }
  // Projects first, then "no project"
  for (const p of projects) {
    const ptasks = byProject.get(p.id);
    if (ptasks && ptasks.length > 0) groups.push({ id: p.id, name: p.name, emoji: p.emoji || '📁', tasks: ptasks });
  }
  const noProj = byProject.get(null);
  if (noProj && noProj.length > 0) groups.push({ id: null, name: 'Без проекта', emoji: '📋', tasks: noProj });

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg sm:text-xl font-bold">📦 Бэклог ({backlogTasks.length})</h2>
        <button
          onClick={() => onNewTask({ backlog: true })}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium"
        >+ В бэклог</button>
      </div>
      {backlogTasks.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">📦</div>
          <p>Бэклог пуст</p>
          <p className="text-sm mt-1">Добавьте задачи, которые пока не в работе</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(group => (
            <div key={String(group.id)}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">{group.emoji} {group.name} <span className="text-gray-400 font-normal">({group.tasks.length})</span></h3>
                {group.id !== null && (
                  <button
                    onClick={() => onNewTask({ projectId: group.id!, backlog: true })}
                    className="text-xs text-blue-600 hover:text-blue-800 transition"
                  >+ задача</button>
                )}
              </div>
              <div className="space-y-1.5">
                {group.tasks.map(t => (
                  <BacklogTaskRow key={t.id} task={t} invalidate={invalidate} onOpenTask={onOpenTask} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
