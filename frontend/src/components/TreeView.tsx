import React from 'react';
import { Task, Project } from '../types';
import { getDueStatus } from '../utils/dateUtils';
import { STATUS_BORDER, STATUS_COLOR, STATUS_EMOJI, PRIORITY_COLOR, PRIORITY_EMOJI, DUE_BADGE } from '../constants/taskDisplay';

interface TreeViewProps {
  tasks: Task[];
  projects: Project[];
  expandedTasks: number[];
  onToggle: (id: number) => void;
  onTaskClick: (task: Task) => void;
}

export const TreeView: React.FC<TreeViewProps> = ({ tasks, projects, expandedTasks, onToggle, onTaskClick }) => {
  const expandedSet = new Set(expandedTasks);
  
  if (tasks.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">Нет задач</p>;
  }

  const taskMap = new Map<number, Task & { children: Task[] }>();
  tasks.forEach(t => taskMap.set(t.id, { ...t, children: [] }));
  tasks.forEach(t => {
    if (t.parent_task_id && taskMap.has(t.parent_task_id)) {
      taskMap.get(t.parent_task_id)!.children.push(t);
    }
  });

  const rootTasks = tasks.filter(t => !t.parent_task_id);

  if (rootTasks.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">Нет задач</p>;
  }

  const renderTree = (taskList: (Task & { children: Task[] })[], level = 0) => {
    return taskList.map(task => {
      const proj = projects.find(p => p.id === task.project_id);
      const dueStatus = getDueStatus(task.due_date, task.status);
      const hasChildren = task.children.length > 0;
      const isExpanded = expandedSet.has(task.id);

      return (
        <div key={task.id}>
          <div
            onClick={() => onTaskClick(task)}
            className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50 rounded border-l-2 ${STATUS_BORDER[task.status]}`}
            style={{ paddingLeft: `${level * 20 + 8}px` }}
          >
            {hasChildren ? (
              <button
                onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
                className="w-4 h-4 flex items-center justify-center text-xs text-gray-400 hover:text-gray-600"
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            ) : <span className="w-4" />}
            <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${STATUS_COLOR[task.status]}`}>
              {STATUS_EMOJI[task.status]}
            </span>
            {task.priority !== 'NORMAL' && (
              <span className={`text-xs px-1 rounded border shrink-0 ${PRIORITY_COLOR[task.priority]}`}>
                {PRIORITY_EMOJI[task.priority]}
              </span>
            )}
            <span className="text-xs text-gray-400 shrink-0">#{task.id}</span>
            <span className="text-sm flex-1 truncate" title={task.title}>{task.title}</span>
            {proj && <span className="text-xs text-gray-400 shrink-0 hidden sm:inline">{proj.emoji}</span>}
            {task.status === 'DONE' && task.completed_at && (
              <span className="text-xs text-green-600 shrink-0 hidden sm:inline">✓</span>
            )}
            {task.due_date && dueStatus && (
              <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 hidden sm:inline ${DUE_BADGE[dueStatus]}`}>
                📅
              </span>
            )}
          </div>
          {hasChildren && isExpanded && renderTree(task.children, level + 1)}
        </div>
      );
    });
  };

  return <div className="space-y-1">{renderTree(rootTasks.map(t => taskMap.get(t.id)!))}</div>;
};
