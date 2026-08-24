import axios from 'axios';
import type { Task, Project } from '../types/dashboard';
import { API_URL, STATUS_COLOR, STATUS_BORDER, STATUS_EMOJI, STATUS_LABELS, PRIORITY_COLOR, PRIORITY_EMOJI, PRIORITY_LABELS, DUE_BADGE, cardBg } from '../constants/taskDisplay';
import { getDueStatus, formatDueDate, formatDatetime, timeAgo } from '../utils/dateUtils';
import { showToast } from '../utils/toast';

interface CardsViewProps {
  sortedTasks: Task[];
  tasks: Task[];
  projects: Project[];
  ancestorBlockedIds: Set<number>;
  bulkSelected: Set<number>;
  toggleBulk: (id: number) => void;
  setSelectedTask: (t: Task) => void;
  myAccountId: number | null;
  takeTaskMutation: any;
  changeStatusMutation: any;
  invalidate: () => void;
}

export default function CardsView({ sortedTasks, tasks, projects, ancestorBlockedIds, bulkSelected, toggleBulk, setSelectedTask, myAccountId, takeTaskMutation, changeStatusMutation, invalidate }: CardsViewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {sortedTasks.map(task => {
                const proj = projects.find(p => p.id === task.project_id);
                const parentTask = task.parent_task_id ? tasks.find(t => t.id === task.parent_task_id) : null;
                const parentProj = parentTask ? projects.find(p => p.id === parentTask.project_id) : null;
                const dueStatus = getDueStatus(task.due_date, task.status);
                const isAncestorBlocked = ancestorBlockedIds.has(task.id);
                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className={`group relative rounded-lg border border-l-4 ${STATUS_BORDER[task.status]} ${isAncestorBlocked ? 'bg-gray-50' : cardBg(task.priority, task.status)} p-3 sm:p-4 [@media(hover:hover)]:hover:shadow-md transition cursor-pointer ${isAncestorBlocked ? 'opacity-70' : ''} ${bulkSelected.has(task.id) ? 'ring-2 ring-blue-400' : ''}`}
                  >
                    {/* Checkbox — в верхнем левом углу, появляется при hover или когда уже выбраны задачи */}
                    <input type="checkbox" checked={bulkSelected.has(task.id)}
                      onChange={(e) => { e.stopPropagation(); toggleBulk(task.id); }}
                      onClick={(e) => e.stopPropagation()}
                      className={`absolute top-2 left-2 rounded accent-blue-600 transition-opacity ${bulkSelected.size > 0 || bulkSelected.has(task.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    />
                    <div className="flex justify-between items-start mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                        <span className="text-xs text-gray-400 shrink-0">#{task.id}</span>
                        {parentTask ? (<>
                          {parentProj && (
                            <span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded truncate shrink-0 max-w-[40%]">
                              {parentProj.emoji} {parentProj.name}
                            </span>
                          )}
                          <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded inline-flex items-center gap-1 min-w-0 overflow-hidden">
                            <span className="text-indigo-300 shrink-0">↳</span>
                            <span className="truncate">#{parentTask.id} {parentTask.title}</span>
                          </span>
                        </>) : proj && (
                          <span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded truncate max-w-[60%]">
                            {proj.emoji} {proj.name}
                          </span>
                        )}
                      </div>
                      {/* Приоритет + бейдж статуса / кнопка действия */}
                      <div className="flex items-center gap-1.5 ml-2 shrink-0">
                        {isAncestorBlocked && (
                          <span className="text-xs px-1.5 py-0.5 rounded border bg-red-50 text-red-400 border-red-200" title="Предок заблокирован">🔒</span>
                        )}
                        {task.priority && task.priority !== 'NORMAL' && (
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${PRIORITY_COLOR[task.priority]}`} title={PRIORITY_LABELS[task.priority]}>
                            {PRIORITY_EMOJI[task.priority]}
                          </span>
                        )}
                      <div className="relative shrink-0">
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-opacity duration-150 ${
                          (task.status === 'TODO' || task.status === 'DOING' || task.status === 'DONE') ? 'md:group-hover:opacity-0' : ''
                        } ${STATUS_COLOR[task.status]}`}>
                          {STATUS_EMOJI[task.status]} <span className="hidden sm:inline">{STATUS_LABELS[task.status]}</span>
                        </span>
                        {task.status === 'TODO' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (myAccountId && !task.assignee) {
                                const subtaskIds = (task.subtasks || []).filter((s: any) => !s.assignee).map((s: any) => s.id);
                                console.log('subtaskIds:', subtaskIds);
                                takeTaskMutation.mutate({ taskId: task.id, subtaskIds });
                              } else {
                                changeStatusMutation.mutate({ taskId: task.id, status: 'DOING' });
                              }
                            }}
                            className="absolute inset-0 flex items-center justify-center px-2 py-0.5 rounded-full text-xs border border-blue-300 bg-blue-50 text-blue-700 opacity-0 group-hover:opacity-100 [@media(not(hover:hover))]:opacity-100 transition-opacity duration-150 whitespace-nowrap"
                          >
                            {myAccountId && !task.assignee
                              ? <><span className="sm:hidden">🙋</span><span className="hidden sm:inline">🙋 Взять</span></>
                              : <><span className="sm:hidden">▶</span><span className="hidden sm:inline">▶ Начать</span></>}
                          </button>
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
                            className="absolute inset-0 flex items-center justify-center px-2 py-0.5 rounded-full text-xs border border-green-300 bg-green-50 text-green-700 opacity-0 group-hover:opacity-100 [@media(not(hover:hover))]:opacity-100 transition-opacity duration-150 whitespace-nowrap"
                          >
                            <span className="sm:hidden">✓</span><span className="hidden sm:inline">✓ Готово</span>
                          </button>
                        )}
                        {task.status === 'DONE' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              axios.post(`${API_URL}/api/tasks/${task.id}/archive`).then(() => invalidate());
                            }}
                            className="absolute inset-0 flex items-center justify-center px-2 py-0.5 rounded-full text-xs border border-gray-300 bg-gray-50 text-gray-600 opacity-0 group-hover:opacity-100 [@media(not(hover:hover))]:opacity-100 transition-opacity duration-150 whitespace-nowrap"
                          >
                            <span className="sm:hidden">🗄️</span><span className="hidden sm:inline">🗄️ Архив</span>
                          </button>
                        )}
                      </div>
                      </div>
                    </div>
                    <h3 className="font-semibold text-sm leading-tight mb-1 line-clamp-2" title={task.title}>{task.title}</h3>
                    {task.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 mb-1.5">{task.description}</p>
                    )}
                    {task.tags && task.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap mb-1.5">
                        {task.tags.map((tag: any) => (
                          <span key={tag.id} className="px-1.5 py-0.5 rounded-full text-xs font-medium border"
                            style={{ backgroundColor: tag.color + '22', borderColor: tag.color + '66', color: tag.color }}>
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {(() => {
                      const cardChildren = tasks.filter((t: any) => t.parent_task_id === task.id);
                      if (!cardChildren.length) return null;
                      const total = cardChildren.length;
                      const done = cardChildren.filter((s: any) => s.status === 'DONE').length;
                      const pct = Math.round(done / total * 100);
                      return (
                        <div className="mt-1 mb-1.5">
                          <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                            <span>Подзадачи {done}/{total}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-blue-400 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })()}
                    <div className="flex justify-between items-center mt-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {task.assignee && (
                          <div className="text-xs text-gray-500">👤 {task.assignee.display_name}</div>
                        )}
                        {task.due_date && dueStatus && (
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${DUE_BADGE[dueStatus]}`}>
                            📅 {dueStatus === 'overdue' ? 'Просрочено' : dueStatus === 'today' ? 'Сегодня' : formatDueDate(task.due_date)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
                        {task.status === 'DONE' && task.completed_at && (
                          <span className="text-green-600" title="Выполнено">✓ {formatDatetime(task.completed_at)}</span>
                        )}
                        {task.status !== 'DONE' && <span>{timeAgo(task.created_at)}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
    </div>
  );
}
