import React from 'react';
import type { Task, Project } from '../types/dashboard';
import { STATUS_COLOR, STATUS_BORDER, STATUS_EMOJI, PRIORITY_COLOR, PRIORITY_EMOJI } from '../constants/taskDisplay';

interface TaskTreeViewProps {
  sortedTasks: Task[];
  projects: Project[];
  treeExpanded: Set<number>;
  setTreeExpanded: (s: Set<number>) => void;
  toggleTreeExpand: (id: number, e: React.MouseEvent) => void;
  setSelectedTask: (t: Task) => void;
}

export default function TaskTreeView({ sortedTasks, projects, treeExpanded, setTreeExpanded, toggleTreeExpand, setSelectedTask }: TaskTreeViewProps) {
  return (
              <div className="space-y-1">
                <div className="flex gap-2 mb-2">
                  <button onClick={() => setTreeExpanded(new Set(
                    sortedTasks.filter(t => (t.subtasks?.length ?? 0) > 0).map(t => t.id)
                  ))} className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">Развернуть все</button>
                  <button onClick={() => setTreeExpanded(new Set())} className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">Свернуть все</button>
                </div>
                {(() => {
                  const projectMap = new Map<number, Project & { children: Project[], tasks: Task[] }>();
                  projects.forEach(p => projectMap.set(p.id, { ...p, children: [], tasks: [] }));
                  projects.forEach(p => {
                    if (p.parent_project_id && projectMap.has(p.parent_project_id)) {
                      projectMap.get(p.parent_project_id)!.children.push(p);
                    }
                  });
                  sortedTasks.forEach(t => {
                    if (t.project_id && projectMap.has(t.project_id)) {
                      projectMap.get(t.project_id)!.tasks.push(t);
                    }
                  });
                  const taskMap = new Map<number, Task & { subtasks: Task[] }>();
                  sortedTasks.forEach(t => taskMap.set(t.id, { ...t, subtasks: [] }));
                  sortedTasks.forEach(t => {
                    if (t.parent_task_id && taskMap.has(t.parent_task_id)) {
                      taskMap.get(t.parent_task_id)!.subtasks.push(t);
                    }
                  });
                  const renderProject = (proj: Project & { children: Project[], tasks: Task[] }, level = 0) => {
                    const ml = level * 16;
                    return (
                      <div key={`proj-${proj.id}`}>
                        <div className={`flex items-center gap-2 px-2 py-1.5 font-medium bg-gray-100 rounded`} style={{ marginLeft: ml + 'px' }}>
                          <span className="text-lg">{proj.emoji || '📁'}</span>
                          <span className="text-sm truncate">{proj.name}</span>
                        </div>
                        {(proj.tasks || []).map(task => renderTask(task, level + 1))}
                        {(proj.children || []).map(child => renderProject(projectMap.get(child.id) || { ...child, children: [], tasks: [] }, level + 1))}
                      </div>
                    );
                  };
                  const renderTask = (task: Task, level: number, path: number[] = []) => {
                    const currentPath = [...path, task.id];
                    const subtasks = task.subtasks || [];
                    const hasSubtasks = subtasks.length > 0;
                    const isExpanded = treeExpanded.has(task.id);
                    const expandBtn = hasSubtasks ? (
                      <button onClick={(e) => toggleTreeExpand(task.id, e)} className="text-gray-400 text-xs hover:text-gray-600 w-4">
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    ) : <span className="w-4" />;
                    return (
                      <div key={task.id}>
                        <div
                          onClick={() => setSelectedTask(task)}
                          className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50 rounded border-l-2 ${STATUS_BORDER[task.status]}`}
                          style={{ paddingLeft: `${level * 16 + 8}px` }}
                        >
                          {expandBtn}
                          <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${STATUS_COLOR[task.status]}`}>{STATUS_EMOJI[task.status]}</span>
                          {task.priority !== 'NORMAL' && <span className={`text-xs px-1 rounded border shrink-0 ${PRIORITY_COLOR[task.priority]}`}>{PRIORITY_EMOJI[task.priority]}</span>}
                          <span className="text-xs text-gray-400 shrink-0">#{task.id}</span>
                          <span className="text-sm flex-1 truncate">{task.title}</span>
                        </div>
                        {hasSubtasks && isExpanded && subtasks.map(sub => {
                          const subTask = taskMap.get(sub.id);
                          return subTask ? renderTask(subTask, level + 1, currentPath) : null;
                        })}
                      </div>
                    );
                  };
                  const rootProjects = projects.filter(p => !p.parent_project_id);
                  return rootProjects.length === 0 ? (
                    <p className="text-sm text-gray-400 py-8 text-center">Нет проектов</p>
                  ) : (
                    rootProjects.map(p => renderProject(projectMap.get(p.id)!))
                  );
                })()}
              </div>
  );
}
