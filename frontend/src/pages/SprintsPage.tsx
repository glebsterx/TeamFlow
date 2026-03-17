import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sprintsApi, Sprint } from '../api/sprints';
import { showToast } from '../utils/toast';
import SprintModal from '../modals/SprintModal';
import ConfirmDeleteModal from '../modals/ConfirmDeleteModal';
import {
  DndContext,
  DragEndEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Sprint Card Wrapper — drag handle only on grip icon, not the whole card
function SortableSprint({ sprint, children }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sprint.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 10 : 1 };
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'scale-105 shadow-lg' : ''}>
      {children({ dragHandleProps: { ...attributes, ...listeners } })}
    </div>
  );
}

// Sortable Task Row Wrapper
function SortableTask({ task, children }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.task_id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ dragHandleProps: { ...attributes, ...listeners } })}
    </div>
  );
}

export default function SprintsPage() {
  const [showModal, setShowModal] = useState(false);
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const toggleTasksExpand = (sprintId: number) => setExpandedTasks(prev => { const s = new Set(prev); s.has(sprintId) ? s.delete(sprintId) : s.add(sprintId); return s; });
  const [viewMode, setViewMode] = useState<'status' | 'project'>('status');
  const queryClient = useQueryClient();

  const handleModalClose = useCallback(() => {
    setShowModal(false);
    setEditingSprint(null);
    queryClient.invalidateQueries({ queryKey: ['sprints'] });
  }, [queryClient]);

  const { data: sprints = [], isLoading } = useQuery<Sprint[]>({
    queryKey: ['sprints'],
    queryFn: sprintsApi.getAll,
  });

  const reorderSprintsMutation = useMutation({
    mutationFn: async (sprintIds: number[]) => { await sprintsApi.reorder(sprintIds); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ['sprints'] }); },
  });

  const reorderTasksMutation = useMutation({
    mutationFn: async ({ sprintId, taskIds }: { sprintId: number; taskIds: number[] }) => { await sprintsApi.reorderTasks(sprintId, taskIds); },
    onMutate: async ({ sprintId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['sprints'] });
      const previous = queryClient.getQueryData<Sprint[]>(['sprints']);
      queryClient.setQueryData<Sprint[]>(['sprints'], (old = []) =>
        old.map(s => s.id !== sprintId ? s : {
          ...s,
          tasks: taskIds.map((tid, pos) => {
            const t = s.tasks.find(t => t.task_id === tid)!;
            return { ...t, position: pos };
          }),
        })
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => { if (ctx?.previous) queryClient.setQueryData(['sprints'], ctx.previous); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ['sprints'] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (sprintId: number) => { await sprintsApi.delete(sprintId); },
    onSuccess: () => { setConfirmDelete(null); queryClient.invalidateQueries({ queryKey: ['sprints'] }); showToast('Спринт удалён', 'success'); },
  });

  const handleStatusChange = (sprint: Sprint, newStatus: string) => {
    sprintsApi.updateStatus(sprint.id, newStatus).then(() => {
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
      showToast(`Статус спринта изменён на "${getStatusLabel(newStatus)}"`, 'success');
    }).catch(() => { showToast('Ошибка при изменении статуса', 'error'); });
  };

  const handleSprintDragEnd = (event: DragEndEvent, sprintList: Sprint[]) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sprintList.findIndex(s => s.id === Number(active.id));
    const newIndex = sprintList.findIndex(s => s.id === Number(over.id));
    const newOrder = arrayMove(sprintList, oldIndex, newIndex).map(s => s.id);
    reorderSprintsMutation.mutate(newOrder);
  };

  const handleTaskDragEnd = (event: DragEndEvent, sprint: Sprint, sortedTasks: any[]) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedTasks.findIndex(t => t.task_id === Number(active.id));
    const newIndex = sortedTasks.findIndex(t => t.task_id === Number(over.id));
    const newOrder = arrayMove(sortedTasks, oldIndex, newIndex).map(t => t.task_id);
    reorderTasksMutation.mutate({ sprintId: sprint.id, taskIds: newOrder });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activeSprints = sprints.filter(s => s.status === 'active' && !s.is_deleted).sort((a, b) => a.position - b.position);
  const plannedSprints = sprints.filter(s => s.status === 'planned' && !s.is_deleted).sort((a, b) => a.position - b.position);
  const completedSprints = sprints.filter(s => s.status === 'completed' && !s.is_deleted).sort((a, b) => a.position - b.position);
  const archivedSprints = sprints.filter(s => s.status === 'archived' && !s.is_deleted).sort((a, b) => a.position - b.position);
  const deletedSprints = sprints.filter(s => s.is_deleted).sort((a, b) => a.position - b.position);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' });

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = { planned: 'Запланирован', active: 'Активен', completed: 'Завершён', archived: 'Архив', TODO: 'Нужно', DOING: 'В работе', DONE: 'Готово', BLOCKED: 'Заблокировано', ON_HOLD: 'Отложено' };
    return labels[status] || status;
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = { planned: 'bg-gray-100 text-gray-700', active: 'bg-green-100 text-green-700', completed: 'bg-blue-100 text-blue-700', archived: 'bg-gray-200 text-gray-600', TODO: 'bg-gray-100 text-gray-700', DOING: 'bg-blue-100 text-blue-700', DONE: 'bg-green-100 text-green-700', BLOCKED: 'bg-red-100 text-red-700', ON_HOLD: 'bg-yellow-100 text-yellow-700' };
    return badges[status] || badges.planned;
  };

  if (isLoading) return <div className="p-4 max-w-6xl mx-auto"><div className="text-center py-12 text-gray-400">Загрузка...</div></div>;

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🏃 Спринты</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button onClick={() => setViewMode('status')} className={`px-3 py-1.5 ${viewMode === 'status' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>По статусу</button>
            <button onClick={() => setViewMode('project')} className={`px-3 py-1.5 ${viewMode === 'project' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>По проектам</button>
          </div>
          <button onClick={() => { setEditingSprint(null); setShowModal(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ Спринт</button>
        </div>
      </div>

      {viewMode === 'project' && (() => {
        const activeSprints2 = sprints.filter(s => !s.is_deleted);
        const byProject: Record<string, Sprint[]> = {};
        activeSprints2.forEach(s => {
          const key = s.project_name || 'Без проекта';
          if (!byProject[key]) byProject[key] = [];
          byProject[key].push(s);
        });
        return (
          <div className="space-y-8">
            {Object.entries(byProject).sort(([a], [b]) => a.localeCompare(b, 'ru')).map(([projectName, projectSprints]) => (
              <div key={projectName}>
                <h2 className="text-lg font-semibold text-gray-700 mb-3">📁 {projectName}</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {projectSprints.sort((a, b) => a.position - b.position).map(sprint => (
                    <div key={sprint.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-bold text-base flex-1">{sprint.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-2 shrink-0 ${getStatusBadge(sprint.status)}`}>{getStatusLabel(sprint.status)}</span>
                      </div>
                      {sprint.description && <p className="text-sm text-gray-600 mb-2 line-clamp-2">{sprint.description}</p>}
                      <div className="text-xs text-gray-500 mb-2">
                        <div>📅 {formatDate(sprint.start_date)} — {formatDate(sprint.end_date)}</div>
                        <div>📋 Задач: {sprint.tasks?.length || 0}</div>
                      </div>
                      {sprint.tasks && sprint.tasks.length > 0 && (() => {
                        const sorted = [...sprint.tasks].sort((a, b) => a.position - b.position);
                        const isExp = expandedTasks.has(sprint.id);
                        const visible = isExp ? sorted : sorted.slice(0, 3);
                        return (
                          <div className="border-t pt-2 mb-2">
                            <div className="space-y-1">
                              {visible.map(task => (
                                <div key={task.task_id} className="flex items-center justify-between text-xs bg-gray-50 px-2 py-1 rounded">
                                  <span className="flex-1 truncate text-gray-600">{task.task_title}</span>
                                  <span className={`px-1.5 py-0.5 rounded ml-2 shrink-0 ${getStatusBadge(task.task_status)}`}>{getStatusLabel(task.task_status)}</span>
                                </div>
                              ))}
                            </div>
                            {sorted.length > 3 && (
                              <button onClick={() => toggleTasksExpand(sprint.id)} className="mt-1 text-xs text-blue-500 hover:text-blue-700 w-full text-center py-0.5">
                                {isExp ? '▲ Свернуть' : `+${sorted.length - 3} ещё`}
                              </button>
                            )}
                          </div>
                        );
                      })()}
                      <div className="flex gap-1 mt-2">
                        <button onClick={() => { setEditingSprint(sprint); setShowModal(true); }} className="px-2 py-1.5 text-sm bg-gray-100 text-gray-700 border border-gray-200 rounded hover:bg-gray-200" title="Редактировать">✏️</button>
                        {sprint.status === 'planned' && <button onClick={() => handleStatusChange(sprint, 'active')} className="flex-1 px-2 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100">▶ Активировать</button>}
                        {sprint.status === 'active' && <button onClick={() => handleStatusChange(sprint, 'completed')} className="flex-1 px-2 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100">✓ Завершить</button>}
                        {(sprint.status === 'completed' || sprint.status === 'active') && <button onClick={() => handleStatusChange(sprint, 'archived')} className="flex-1 px-2 py-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100">🗄️ В архив</button>}
                        <button onClick={() => setConfirmDelete({ type: 'sprint', id: sprint.id, name: sprint.name })} className="px-2 py-1.5 text-sm bg-gray-100 text-gray-700 border border-gray-200 rounded hover:bg-gray-200" title="Удалить">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {viewMode === 'status' && (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleSprintDragEnd(e, activeSprints)}>
        {activeSprints.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-700">Активные спринты</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SortableContext items={activeSprints.map(s => s.id)} strategy={verticalListSortingStrategy}>
                {activeSprints.map((sprint) => (
                  <SortableSprint key={sprint.id} sprint={sprint}>
                    {({ dragHandleProps }: any) => (
                    <div className="bg-white border border-blue-200 rounded-lg p-4 hover:shadow-md transition">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 flex items-center gap-2">
                          <span {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none" title="Перетащить">⠿</span>
                          <div>
                            <h3 className="font-bold text-lg">{sprint.name}</h3>
                            {sprint.project_name && <div className="text-xs text-gray-500 mt-1">📁 {sprint.project_name}</div>}
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(sprint.status)}`}>{getStatusLabel(sprint.status)}</span>
                      </div>
                      {sprint.description && <p className="text-sm text-gray-600 mb-3 line-clamp-2">{sprint.description}</p>}
                      <div className="text-xs text-gray-500 mb-3">
                        <div>📅 {formatDate(sprint.start_date)} — {formatDate(sprint.end_date)}</div>
                        <div>📋 Задач: {sprint.tasks?.length || 0}</div>
                      </div>
                      {sprint.tasks && sprint.tasks.length > 0 && (
                        <div className="mb-3 border-t pt-2">
                          <div className="text-xs text-gray-500 mb-1">Задачи:</div>
                          {(() => {
                            const sortedTasks = [...sprint.tasks].sort((a, b) => a.position - b.position);
                            const isExpanded = expandedTasks.has(sprint.id);
                            const visibleTasks = isExpanded ? sortedTasks : sortedTasks.slice(0, 3);
                            return (
                            <>
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleTaskDragEnd(e, sprint, sortedTasks)}>
                              <SortableContext items={visibleTasks.map(t => t.task_id)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-1">
                                  {visibleTasks.map((task) => (
                                    <SortableTask key={task.task_id} task={task}>
                                      {({ dragHandleProps }: any) => (
                                        <div className="flex items-center justify-between text-xs bg-gray-50 px-2 py-1 rounded">
                                          <div className="flex items-center gap-1 flex-1 min-w-0">
                                            <span {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none shrink-0" title="Перетащить">⠿</span>
                                            <span className="flex-1 truncate">{task.task_title}</span>
                                          </div>
                                          <span className={`px-1.5 py-0.5 rounded ml-2 shrink-0 ${getStatusBadge(task.task_status)}`}>{getStatusLabel(task.task_status)}</span>
                                        </div>
                                      )}
                                    </SortableTask>
                                  ))}
                                </div>
                              </SortableContext>
                            </DndContext>
                            {sortedTasks.length > 3 && (
                              <button onClick={() => toggleTasksExpand(sprint.id)} className="mt-1 text-xs text-blue-500 hover:text-blue-700 w-full text-center py-0.5">
                                {isExpanded ? '▲ Свернуть' : `+${sortedTasks.length - 3} ещё`}
                              </button>
                            )}
                            </>
                          ); })()}
                        </div>
                      )}
                      <div className="flex gap-1 sm:gap-2 mt-3">
                        <button onClick={() => { setEditingSprint(sprint); setShowModal(true); }} className="px-2 py-1.5 text-sm bg-gray-100 text-gray-700 border border-gray-200 rounded hover:bg-gray-200" title="Редактировать">✏️</button>
                        <button onClick={() => handleStatusChange(sprint, 'planned')} className="flex-1 px-1 sm:px-3 py-1.5 text-xs bg-gray-50 text-gray-700 border border-gray-200 rounded hover:bg-gray-100 whitespace-nowrap" title="В план"><span className="hidden sm:inline">↩️ В план</span><span className="sm:hidden">↩️</span></button>
                        <button onClick={() => handleStatusChange(sprint, 'completed')} className="flex-1 px-1 sm:px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 whitespace-nowrap" title="Завершить"><span className="hidden sm:inline">✓ Завершить</span><span className="sm:hidden">✓</span></button>
                        <button onClick={() => handleStatusChange(sprint, 'archived')} className="flex-1 px-1 sm:px-3 py-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100 whitespace-nowrap" title="В архив"><span className="hidden sm:inline">🗄️ В архив</span><span className="sm:hidden">🗄️</span></button>
                      </div>
                    </div>
                    )}
                  </SortableSprint>
                ))}
              </SortableContext>
            </div>
          </div>
        )}
      </DndContext>
      )}

      {viewMode === 'status' && plannedSprints.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-700">📅 Запланированные спринты</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleSprintDragEnd(e, plannedSprints)}>
              <SortableContext items={plannedSprints.map(s => s.id)} strategy={verticalListSortingStrategy}>
                {plannedSprints.map((sprint) => (
                  <SortableSprint key={sprint.id} sprint={sprint}>
                    {({ dragHandleProps }: any) => (
                    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1">
                          <span {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none" title="Перетащить">⠿</span>
                          <div className="flex-1">
                            <h3 className="font-bold text-lg">{sprint.name}</h3>
                            {sprint.project_name && <div className="text-xs text-gray-500 mt-1">📁 {sprint.project_name}</div>}
                          </div>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">{getStatusLabel(sprint.status)}</span>
                      </div>
                      {sprint.description && <p className="text-sm text-gray-600 mb-3 line-clamp-2">{sprint.description}</p>}
                      <div className="text-xs text-gray-500 mb-3">
                        <div>📅 {formatDate(sprint.start_date)} — {formatDate(sprint.end_date)}</div>
                        <div>📋 Задач: {sprint.tasks?.length || 0}</div>
                      </div>
                      {sprint.tasks && sprint.tasks.length > 0 && (
                        <div className="mb-3 border-t pt-2">
                          {(() => {
                            const sortedTasks = [...sprint.tasks].sort((a, b) => a.position - b.position);
                            const isExpanded = expandedTasks.has(sprint.id);
                            const visibleTasks = isExpanded ? sortedTasks : sortedTasks.slice(0, 3);
                            return (
                            <>
                              <div className="space-y-1">
                                {visibleTasks.map((task) => (
                                  <div key={task.task_id} className="flex items-center justify-between text-xs bg-gray-50 px-2 py-1 rounded">
                                    <span className="flex-1 truncate text-gray-600">{task.task_title}</span>
                                    <span className={`px-1.5 py-0.5 rounded ml-2 shrink-0 ${getStatusBadge(task.task_status)}`}>{getStatusLabel(task.task_status)}</span>
                                  </div>
                                ))}
                              </div>
                              {sortedTasks.length > 3 && (
                                <button onClick={() => toggleTasksExpand(sprint.id)} className="mt-1 text-xs text-blue-500 hover:text-blue-700 w-full text-center py-0.5">
                                  {isExpanded ? '▲ Свернуть' : `+${sortedTasks.length - 3} ещё`}
                                </button>
                              )}
                            </>
                          ); })()}
                        </div>
                      )}
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => { setEditingSprint(sprint); setShowModal(true); }} className="px-2 py-1.5 text-sm bg-gray-100 text-gray-700 border border-gray-200 rounded hover:bg-gray-200" title="Редактировать">✏️</button>
                        <button onClick={() => handleStatusChange(sprint, 'archived')} className="px-2 py-1.5 text-sm bg-gray-100 text-gray-700 border border-gray-200 rounded hover:bg-gray-200" title="В архив">🗄️</button>
                        <button onClick={() => setConfirmDelete({ type: 'sprint', id: sprint.id, name: sprint.name })} className="px-2 py-1.5 text-sm bg-gray-100 text-gray-700 border border-gray-200 rounded hover:bg-gray-200" title="Удалить">🗑️</button>
                        <button onClick={() => handleStatusChange(sprint, 'active')} className="flex-1 px-3 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100">▶ Активировать</button>
                      </div>
                    </div>
                    )}
                  </SortableSprint>
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>
      )}

      {viewMode === 'status' && completedSprints.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-700">✅ Завершённые спринты</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {completedSprints.map((sprint, idx, arr) => (
              <div key={sprint.id} className="bg-white border border-blue-200 rounded-lg p-4 hover:shadow-md transition">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-1">
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => { if (idx > 0) { const newOrder = [...completedSprints]; [newOrder[idx], newOrder[idx-1]] = [newOrder[idx-1], newOrder[idx]]; reorderSprintsMutation.mutate(newOrder.map(s => s.id)); } }} className="text-gray-400 hover:text-gray-600 text-xs" disabled={idx === 0}>▲</button>
                      <button onClick={() => { if (idx < arr.length - 1) { const newOrder = [...completedSprints]; [newOrder[idx], newOrder[idx+1]] = [newOrder[idx+1], newOrder[idx]]; reorderSprintsMutation.mutate(newOrder.map(s => s.id)); } }} className="text-gray-400 hover:text-gray-600 text-xs" disabled={idx === arr.length - 1}>▼</button>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg">{sprint.name}</h3>
                      {sprint.project_name && <div className="text-xs text-gray-500 mt-1">📁 {sprint.project_name}</div>}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">{getStatusLabel(sprint.status)}</span>
                </div>
                <div className="text-xs text-gray-500 mb-3"><div>📅 {formatDate(sprint.start_date)} — {formatDate(sprint.end_date)}</div></div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => { setEditingSprint(sprint); setShowModal(true); }} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 border border-gray-200 rounded hover:bg-gray-200">✏️</button>
                  <button onClick={() => handleStatusChange(sprint, 'active')} className="flex-1 px-3 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100">↩️ Возобновить</button>
                  <button onClick={() => handleStatusChange(sprint, 'archived')} className="flex-1 px-3 py-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100">🗄️ В архив</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'status' && archivedSprints.length > 0 && (
        <details className="mb-8">
          <summary className="text-lg font-semibold text-gray-500 cursor-pointer hover:text-gray-700 mb-3">📦 Архив спринтов ({archivedSprints.length})</summary>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
            {archivedSprints.map(sprint => (
              <div key={sprint.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 opacity-75">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-lg text-gray-600">{sprint.name}</h3>
                  <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full">Архив</span>
                </div>
                <div className="text-xs text-gray-500 mb-3"><div>📅 {formatDate(sprint.start_date)} — {formatDate(sprint.end_date)}</div></div>
                <div className="flex gap-2">
                  <button onClick={() => handleStatusChange(sprint, 'active')} className="flex-1 px-3 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100">↩️ Восстановить</button>
                  <button onClick={() => setConfirmDelete({ type: 'sprint', id: sprint.id, name: sprint.name })} className="flex-1 px-3 py-1.5 text-xs bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100">🗑️ Удалить</button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {viewMode === 'status' && deletedSprints.length > 0 && (
        <details className="mb-8">
          <summary className="text-lg font-semibold text-gray-500 cursor-pointer hover:text-gray-700 mb-3">📦 Удалённые спринты ({deletedSprints.length})</summary>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
            {deletedSprints.map(sprint => (
              <div key={sprint.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 opacity-75">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-lg text-gray-600">{sprint.name}</h3>
                  <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full">Удалён</span>
                </div>
                <div className="text-xs text-gray-500 mb-3"><div>📅 {formatDate(sprint.start_date)} — {formatDate(sprint.end_date)}</div></div>
                <div className="flex gap-2">
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); sprintsApi.restore(sprint.id).then(() => { queryClient.invalidateQueries({ queryKey: ['sprints'] }); showToast('Спринт восстановлен', 'success'); }).catch(() => { showToast('Ошибка при восстановлении', 'error'); }); }} className="flex-1 px-3 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100">↩️ Восстановить</button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {showModal && <SprintModal sprint={editingSprint} onClose={handleModalClose} />}
      {confirmDelete && <ConfirmDeleteModal confirm={confirmDelete} onClose={() => setConfirmDelete(null)} deleteTaskMutation={null} deleteProjectMutation={null} deleteMeetingMutation={null} deleteSprintMutation={deleteMutation} />}
    </div>
  );
}
