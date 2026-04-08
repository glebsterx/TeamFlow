import React, { useState, useMemo } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';

import { API_URL } from '../constants/taskDisplay';
import { parseUTC } from '../utils/dateUtils';
import type { Task, Project } from '../types/dashboard';

interface CalendarViewProps {
  projects: Project[];
  onOpenTask: (task: Task) => void;
}

type CalendarViewMode = 'month' | 'week';

export default function CalendarView({ projects, onOpenTask }: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedProject, setSelectedProject] = useState<number | null>(null);

  // Загрузка задач
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks-calendar', selectedProject],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/api/tasks`);
      let allTasks = res.data as Task[];
      if (selectedProject) {
        allTasks = allTasks.filter(t => t.project_id === selectedProject);
      }
      // Фильтруем только задачи с due_date
      return allTasks.filter(t => t.due_date);
    },
  });

  // Навигация по календарю
  const goToPrevious = () => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (viewMode === 'month') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setDate(newDate.getDate() - 7);
      }
      return newDate;
    });
  };

  const goToNext = () => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (viewMode === 'month') {
        newDate.setMonth(newDate.getMonth() + 1);
      } else {
        newDate.setDate(newDate.getDate() + 7);
      }
      return newDate;
    });
  };

  const goToToday = () => setCurrentDate(new Date());

  // Генерация дней календаря
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (viewMode === 'month') {
      // Первый день месяца
      const firstDay = new Date(year, month, 1);
      // Последний день месяца
      const lastDay = new Date(year, month + 1, 0);
      // День недели первого дня (0 = воскресенье)
      const startDayOfWeek = firstDay.getDay();
      // Коррекция для понедельника как первого дня недели
      const adjustedStartDay = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

      const days = [];
      // Предыдущий месяц (серые дни)
      for (let i = adjustedStartDay - 1; i >= 0; i--) {
        const date = new Date(year, month, -i);
        days.push({ date, isCurrentMonth: false });
      }
      // Текущий месяц
      for (let i = 1; i <= lastDay.getDate(); i++) {
        const date = new Date(year, month, i);
        days.push({ date, isCurrentMonth: true });
      }
      // Следующий месяц (серые дни) - добиваем до 42 дней (6 недель)
      const remaining = 42 - days.length;
      for (let i = 1; i <= remaining; i++) {
        const date = new Date(year, month + 1, i);
        days.push({ date, isCurrentMonth: false });
      }

      return days;
    } else {
      // Недельный вид - начало недели (понедельник)
      const currentDayOfWeek = currentDate.getDay();
      const diff = currentDate.getDate() - currentDayOfWeek + (currentDayOfWeek === 0 ? -6 : 1);
      const weekStart = new Date(currentDate);
      weekStart.setDate(diff);

      const days = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        days.push({ date, isCurrentMonth: true });
      }
      return days;
    }
  }, [currentDate, viewMode]);

  // Задачи для каждого дня — группируем по ЛОКАЛЬНОЙ дате (не UTC)
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach(task => {
      if (!task.due_date) return;
      const d = parseUTC(task.due_date);
      // Ключ на основе локальной даты — чтобы совпадало с ячейками календаря
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(task);
    });
    return map;
  }, [tasks]);

  // Статусы для цветов
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DONE': return 'bg-green-500';
      case 'DOING': return 'bg-blue-500';
      case 'BLOCKED': return 'bg-red-500';
      case 'ON_HOLD': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getPriorityBorder = (priority: string) => {
    switch (priority) {
      case 'URGENT': return 'border-red-500 border-l-2';
      case 'HIGH': return 'border-orange-500 border-l-2';
      case 'NORMAL': return 'border-blue-500 border-l-2';
      case 'LOW': return 'border-gray-500 border-l-2';
      default: return '';
    }
  };

  const formatMonthYear = () => {
    return currentDate.toLocaleDateString('ru', { month: 'long', year: 'numeric' });
  };

  const formatWeekRange = () => {
    const start = calendarDays[0]?.date;
    const end = calendarDays[6]?.date;
    if (!start || !end) return '';
    const sameMonth = start.getMonth() === end.getMonth();
    const sameYear = start.getFullYear() === end.getFullYear();
    const startStr = start.toLocaleDateString('ru', { 
      day: 'numeric', 
      month: sameMonth ? undefined : 'short',
      year: sameYear && sameMonth ? undefined : 'numeric'
    });
    const endStr = end.toLocaleDateString('ru', { 
      day: 'numeric', 
      month: 'long', 
      year: sameYear ? undefined : 'numeric' 
    });
    return `${startStr} — ${endStr}`;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  return (
    <div className="bg-white border rounded-xl p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={goToPrevious}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            title="Назад"
          >
            ←
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition font-medium"
          >
            Сегодня
          </button>
          <button
            onClick={goToNext}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            title="Вперёд"
          >
            →
          </button>
          <h3 className="text-lg font-semibold text-gray-800 min-w-[180px]">
            {viewMode === 'month' ? formatMonthYear() : formatWeekRange()}
          </h3>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter by project */}
          <select
            value={selectedProject || ''}
            onChange={(e) => setSelectedProject(e.target.value ? Number(e.target.value) : null)}
            className="px-3 py-1.5 border rounded-lg text-sm bg-white"
          >
            <option value="">Все проекты</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
            ))}
          </select>

          {/* View mode */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                viewMode === 'month' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Месяц
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                viewMode === 'week' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Неделя
            </button>
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-gray-200 border rounded-lg overflow-hidden">
        {/* Days of week header */}
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
          <div key={day} className="bg-gray-50 py-2 text-center text-xs font-medium text-gray-600">
            {day}
          </div>
        ))}

        {/* Calendar days */}
        {calendarDays.map((day, index) => {
          // Ключ ячейки — локальная дата (не toISOString, который сдвигает через UTC)
          const pad = (n: number) => String(n).padStart(2, '0');
          const dateKey = `${day.date.getFullYear()}-${pad(day.date.getMonth() + 1)}-${pad(day.date.getDate())}`;
          const dayTasks = tasksByDate[dateKey] || [];
          const isTodayDate = isToday(day.date);

          return (
            <div
              key={index}
              className={`bg-white min-h-[100px] p-2 ${
                !day.isCurrentMonth ? 'bg-gray-50' : ''
              } ${isTodayDate ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
            >
              <div className={`text-sm font-medium mb-1 ${
                isTodayDate ? 'text-blue-600' : day.isCurrentMonth ? 'text-gray-800' : 'text-gray-400'
              }`}>
                {day.date.getDate()}
              </div>

              <div className="space-y-1">
                {dayTasks.slice(0, 4).map(task => (
                  <button
                    key={task.id}
                    onClick={() => onOpenTask(task)}
                    className={`w-full text-left px-2 py-1 rounded text-xs truncate ${getStatusColor(task.status)} bg-opacity-20 hover:bg-opacity-30 transition ${getPriorityBorder(task.priority)}`}
                    title={task.title}
                  >
                    <span className={`font-medium ${
                      task.status === 'DONE' ? 'text-green-700' :
                      task.status === 'DOING' ? 'text-blue-700' :
                      task.status === 'BLOCKED' ? 'text-red-700' :
                      task.status === 'ON_HOLD' ? 'text-yellow-700' :
                      'text-gray-700'
                    }`}>
                      {task.title}
                    </span>
                  </button>
                ))}
                {dayTasks.length > 4 && (
                  <div className="text-xs text-gray-500 text-center">
                    +{dayTasks.length - 4} ещё
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-600">
        <span className="font-medium">Легенда:</span>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-500 bg-opacity-30"></div>
          <span>Выполнено</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue-500 bg-opacity-30"></div>
          <span>В работе</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-500 bg-opacity-30"></div>
          <span>Заблокировано</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-yellow-500 bg-opacity-30"></div>
          <span>На паузе</span>
        </div>
      </div>
    </div>
  );
}
