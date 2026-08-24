import type { Task, Project } from '../types/dashboard';
import { STATUS_COLOR, STATUS_BORDER, STATUS_EMOJI, STATUS_LABELS, PRIORITY_COLOR, PRIORITY_EMOJI } from '../constants/taskDisplay';

interface KanbanViewProps {
  kanbanTasks: Task[];
  tasks: Task[];
  projects: Project[];
  statusFilter: string | null;
  setSelectedTask: (t: Task) => void;
  PAGE_SIZE: number;
  isLoadingTasks: boolean;
  loadMoreTasks: () => void;
}

export default function KanbanView({ kanbanTasks, tasks, projects, statusFilter, setSelectedTask, PAGE_SIZE, isLoadingTasks, loadMoreTasks }: KanbanViewProps) {
  return (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {['TODO','DOING','BLOCKED','DONE'].map(col => {
                  const colTasks = kanbanTasks.filter(t => t.status === col);
                  const isHighlighted = statusFilter === col;
                  const isDimmed = statusFilter !== null && statusFilter !== col;
                  return (
                    <div key={col} className={`flex-shrink-0 w-64 sm:w-72 transition-opacity ${isDimmed ? 'opacity-40' : ''}`}>
                      <div className={`flex items-center gap-2 px-2 py-1.5 rounded-t-lg border border-b-0 text-xs font-semibold ${STATUS_COLOR[col]} ${isHighlighted ? 'ring-2 ring-blue-500' : ''}`}>
                        <span>{STATUS_EMOJI[col]} {STATUS_LABELS[col]}</span>
                        <span className="ml-auto opacity-60">{colTasks.length}</span>
                      </div>
                      <div className="border rounded-b-lg bg-gray-50 min-h-24 p-1.5 space-y-1.5 max-h-[70vh] overflow-y-auto">
                        {colTasks.map(task => {
                          const proj = projects.find(p => p.id === task.project_id);
                          return (
                            <div
                              key={task.id}
                              onClick={() => setSelectedTask(task)}
                              className={`bg-white border rounded-lg p-2.5 cursor-pointer hover:shadow-sm transition border-l-4 ${STATUS_BORDER[task.status]}`}
                            >
                              <div className="flex items-center gap-1 mb-1 flex-wrap">
                                <span className="text-xs text-gray-400">#{task.id}</span>
                                {task.priority !== 'NORMAL' && (
                                  <span className={`text-xs px-1 rounded border ${PRIORITY_COLOR[task.priority]}`}>{PRIORITY_EMOJI[task.priority]}</span>
                                )}
                                {proj && <span className="text-xs text-gray-400 truncate max-w-[100px]">{proj.emoji} {proj.name}</span>}
                              </div>
                              <p className="text-sm font-medium leading-tight line-clamp-2">{task.title}</p>
                              {task.assignee && <p className="text-xs text-gray-400 mt-1">👤 {task.assignee.display_name}</p>}
                            </div>
                          );
                        })}
                        {colTasks.length === 0 && <p className="text-xs text-gray-300 text-center py-4">пусто</p>}
                      </div>
                    </div>
                  );
})}
                {tasks.length > 0 && tasks.length % PAGE_SIZE === 0 && (
                  <button
                    onClick={loadMoreTasks}
                    disabled={isLoadingTasks}
                    className="w-full py-2 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition"
                  >
                    {isLoadingTasks ? 'Загрузка...' : `Загрузить ещё (${tasks.length} + ${PAGE_SIZE})`}
                  </button>
                )}
              </div>
  );
}
