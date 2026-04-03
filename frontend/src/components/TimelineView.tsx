import React, { useMemo } from 'react';
import type { Task, Project, Assignee } from '../types/dashboard';
import { STATUS_COLOR, PRIORITY_COLOR } from '../constants/taskDisplay';
import { formatDatetime } from '../utils/dateUtils';

interface TimelineViewProps {
  tasks: Task[];
  projects: Project[];
  onTaskClick: (task: Task) => void;
}

type GroupMode = 'none' | 'project' | 'assignee';
type ZoomLevel = 'week' | 'month' | 'quarter';

export default function TimelineView({ tasks, projects, onTaskClick }: TimelineViewProps) {
  const [groupMode, setGroupMode] = React.useState<GroupMode>('project');
  const [zoomLevel, setZoomLevel] = React.useState<ZoomLevel>('month');
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());

  const tasksWithDueDate = useMemo(() => 
    tasks.filter(t => t.due_date && !t.deleted && !t.archived),
    [tasks]
  );

  const { startDate, endDate, dayWidth } = useMemo(() => {
    const now = new Date(currentDate);
    let start: Date, end: Date, width: number;

    if (zoomLevel === 'week') {
      start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      end = new Date(start);
      end.setDate(start.getDate() + 7);
      width = 80;
    } else if (zoomLevel === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      width = 30;
    } else {
      start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      end = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);
      width = 10;
    }

    return { startDate: start, endDate: end, dayWidth: width };
  }, [currentDate, zoomLevel]);

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const timelineWidth = totalDays * dayWidth;

  const getTaskPosition = (dueDate: string) => {
    const date = new Date(dueDate);
    const daysDiff = Math.floor((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, Math.min(daysDiff * dayWidth, timelineWidth - 100));
  };

  const groupedTasks = useMemo(() => {
    const groups: Map<string, { label: string; tasks: Task[] }> = new Map();

    if (groupMode === 'none') {
      groups.set('all', { label: 'Все задачи', tasks: tasksWithDueDate });
    } else if (groupMode === 'project') {
      tasksWithDueDate.forEach(task => {
        const projectId = task.project_id?.toString() || 'no-project';
        const project = projects.find(p => p.id === task.project_id);
        const label = project ? `${project.emoji || '📁'} ${project.name}` : '📋 Без проекта';
        
        if (!groups.has(projectId)) {
          groups.set(projectId, { label, tasks: [] });
        }
        groups.get(projectId)!.tasks.push(task);
      });
    } else {
      tasksWithDueDate.forEach(task => {
        const assigneeId = task.assignee?.id?.toString() || 'unassigned';
        const label = task.assignee?.display_name || '👤 Не назначено';
        
        if (!groups.has(assigneeId)) {
          groups.set(assigneeId, { label, tasks: [] });
        }
        groups.get(assigneeId)!.tasks.push(task);
      });
    }

    return Array.from(groups.entries()).map(([id, data]) => ({ id, ...data }));
  }, [tasksWithDueDate, groupMode, projects]);

  const goToday = () => setCurrentDate(new Date());
  const goNext = () => {
    const next = new Date(currentDate);
    if (zoomLevel === 'week') next.setDate(next.getDate() + 7);
    else if (zoomLevel === 'month') next.setMonth(next.getMonth() + 1);
    else next.setMonth(next.getMonth() + 3);
    setCurrentDate(next);
  };
  const goPrev = () => {
    const prev = new Date(currentDate);
    if (zoomLevel === 'week') prev.setDate(prev.getDate() - 7);
    else if (zoomLevel === 'month') prev.setMonth(prev.getMonth() - 1);
    else prev.setMonth(prev.getMonth() - 3);
    setCurrentDate(prev);
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const renderDateAxis = () => {
    const dates: JSX.Element[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const left = Math.floor((current.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) * dayWidth;
      
      if (zoomLevel === 'week') {
        dates.push(
          <div key={current.toISOString()} style={{ left: `${left}px` }} className="absolute text-xs text-gray-600">
            {current.toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
          </div>
        );
        current.setDate(current.getDate() + 1);
      } else if (zoomLevel === 'month') {
        if (current.getDate() === 1 || current.getDate() % 5 === 0) {
          dates.push(
            <div key={current.toISOString()} style={{ left: `${left}px` }} className="absolute text-xs text-gray-600">
              {current.getDate()}
            </div>
          );
        }
        current.setDate(current.getDate() + 1);
      } else {
        if (current.getDate() === 1) {
          dates.push(
            <div key={current.toISOString()} style={{ left: `${left}px` }} className="absolute text-xs text-gray-600">
              {current.toLocaleDateString('ru', { month: 'short' })}
            </div>
          );
        }
        current.setDate(current.getDate() + 7);
      }
    }

    return dates;
  };

  if (tasksWithDueDate.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Нет задач с дедлайнами для отображения на таймлайне
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 mb-4">
        <div className="flex gap-2">
          <button onClick={goPrev} className="px-2 sm:px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm">←</button>
          <button onClick={goToday} className="px-2 sm:px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">Сегодня</button>
          <button onClick={goNext} className="px-2 sm:px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm">→</button>
        </div>

        <div className="flex gap-1 sm:gap-2 flex-wrap">
          {(['week', 'month', 'quarter'] as const).map(zoom => (
            <button
              key={zoom}
              onClick={() => setZoomLevel(zoom)}
              className={`px-2 sm:px-3 py-1 rounded text-xs sm:text-sm ${zoomLevel === zoom ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
            >
              <span className="hidden sm:inline">{zoom === 'week' ? 'Неделя' : zoom === 'month' ? 'Месяц' : 'Квартал'}</span>
              <span className="sm:hidden">{zoom === 'week' ? 'Нед' : zoom === 'month' ? 'Мес' : 'Квар'}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-1 sm:gap-2 flex-wrap">
          {(['none', 'project', 'assignee'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setGroupMode(mode)}
              className={`px-2 sm:px-3 py-1 rounded text-xs sm:text-sm ${groupMode === mode ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
            >
              <span className="hidden sm:inline">{mode === 'none' ? 'Без группировки' : mode === 'project' ? 'По проектам' : 'По исполнителям'}</span>
              <span className="sm:hidden">{mode === 'none' ? 'Все' : mode === 'project' ? 'Проекты' : 'Люди'}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto border rounded">
        <div className="relative" style={{ minWidth: `${timelineWidth + 200}px` }}>
          <div className="sticky top-0 bg-white z-10 border-b h-12 flex items-end pb-2" style={{ paddingLeft: '200px' }}>
            <div className="relative" style={{ width: `${timelineWidth}px`, height: '24px' }}>
              {renderDateAxis()}
            </div>
          </div>

          {groupedTasks.map(group => {
            const isCollapsed = collapsedGroups.has(group.id);
            return (
              <div key={group.id} className="border-b">
                <div className="flex items-center h-10 bg-gray-50 sticky left-0 z-5">
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="w-48 px-3 text-left font-medium text-sm truncate hover:bg-gray-100 flex items-center gap-2"
                  >
                    <span>{isCollapsed ? '▶' : '▼'}</span>
                    <span className="truncate">{group.label}</span>
                    <span className="text-gray-500 text-xs">({group.tasks.length})</span>
                  </button>
                </div>

                {!isCollapsed && (
                  <div className="relative" style={{ height: `${group.tasks.length * 40 + 10}px`, paddingLeft: '200px' }}>
                    <div className="absolute inset-0" style={{ left: '200px', width: `${timelineWidth}px` }}>
                      {group.tasks.map((task, idx) => {
                        const left = getTaskPosition(task.due_date!);
                        const bgColor = STATUS_COLOR[task.status as keyof typeof STATUS_COLOR] || 'bg-gray-200';
                        
                        return (
                          <div
                            key={task.id}
                            onClick={() => onTaskClick(task)}
                            className={`absolute ${bgColor} rounded px-2 py-1 text-xs cursor-pointer hover:opacity-80 truncate shadow`}
                            style={{
                              left: `${left}px`,
                              top: `${idx * 40 + 5}px`,
                              width: '120px',
                              height: '30px',
                            }}
                            title={`${task.title} — ${formatDatetime(task.due_date!)}`}
                          >
                            <div className="truncate font-medium">{task.title}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
