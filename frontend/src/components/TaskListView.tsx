import type { Task, Project } from '../types/dashboard';
import { STATUS_COLOR, STATUS_BORDER, STATUS_EMOJI, PRIORITY_COLOR, PRIORITY_EMOJI, DUE_BADGE } from '../constants/taskDisplay';
import { getDueStatus, formatDueDate, formatDatetime, timeAgo } from '../utils/dateUtils';

interface TaskListViewProps {
  sortedTasks: Task[];
  projects: Project[];
  ancestorBlockedIds: Set<number>;
  bulkSelected: Set<number>;
  toggleBulk: (id: number) => void;
  setSelectedTask: (t: Task) => void;
}

export default function TaskListView({ sortedTasks, projects, ancestorBlockedIds, bulkSelected, toggleBulk, setSelectedTask }: TaskListViewProps) {
  return (
              <div className="border rounded-lg overflow-hidden divide-y bg-white">
                {sortedTasks.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">Нет задач</p>}
                {sortedTasks.map(task => {
                  const proj = projects.find(p => p.id === task.project_id);
                  const dueStatus = getDueStatus(task.due_date, task.status);
                  const isAncestorBlocked = ancestorBlockedIds.has(task.id);
                  return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition border-l-4 ${STATUS_BORDER[task.status]} ${isAncestorBlocked ? 'opacity-60' : ''} ${bulkSelected.has(task.id) ? 'bg-blue-50' : ''}`}
                    >
                      <input type="checkbox" checked={bulkSelected.has(task.id)}
                        onChange={(e) => { e.stopPropagation(); toggleBulk(task.id); }}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded shrink-0 accent-blue-600" />
                      <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${STATUS_COLOR[task.status]}`}>{STATUS_EMOJI[task.status]}</span>
                      {task.priority !== 'NORMAL' && (
                        <span className={`text-xs px-1 rounded border shrink-0 ${PRIORITY_COLOR[task.priority]}`}>{PRIORITY_EMOJI[task.priority]}</span>
                      )}
                      <span className="text-xs text-gray-400 shrink-0">#{task.id}</span>
                      <span className="text-sm flex-1 truncate" title={task.title}>{task.title}</span>
                      {task.tags?.map((tag: any) => (
                        <span key={tag.id} className="px-1.5 py-0.5 rounded-full text-xs font-medium shrink-0 hidden sm:inline"
                          style={{ backgroundColor: tag.color + '22', color: tag.color }}>
                          {tag.name}
                        </span>
                      ))}
                      {proj && <span className="text-xs text-gray-400 shrink-0 hidden sm:inline">{proj.emoji} {proj.name}</span>}
                      {task.assignee && <span className="text-xs text-gray-400 shrink-0 hidden sm:inline">👤 {task.assignee.display_name}</span>}
                      {task.status === 'DONE' && task.completed_at
                        ? <span className="text-xs text-green-600 shrink-0 hidden sm:inline" title="Выполнено">✓ {formatDatetime(task.completed_at)}</span>
                        : <span className="text-xs text-gray-400 shrink-0 hidden sm:inline">{timeAgo(task.created_at)}</span>
                      }
                      {task.due_date && dueStatus && (
                        <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 hidden sm:inline ${DUE_BADGE[dueStatus]}`}>📅 {formatDueDate(task.due_date)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
  );
}
