import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

import type { Task, Project, Meeting, Stats, TelegramUser } from '../types/dashboard';
import { API_URL, STATUS_COLOR, STATUS_BORDER, STATUS_EMOJI, STATUS_LABELS, DUE_BADGE, PRIORITY_LABELS, PRIORITY_COLOR, PRIORITY_ORDER, PRIORITY_EMOJI, cardBg } from '../constants/taskDisplay';
import { timeAgo, getDueStatus, formatDueDate, formatDuration, formatDatetime } from '../utils/dateUtils';
import { getAncestorBlockedIds } from '../utils/taskUtils';
import { showToast } from '../utils/toast';
import { useTaskChangeDetector } from '../hooks/useTaskChangeDetector';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { ToastContainer } from '../components/Toast';
import { SearchPanel } from '../components/SearchPanel';
import NewTaskModal from '../modals/NewTaskModal';
import ConfirmDeleteModal from '../modals/ConfirmDeleteModal';
import BacklogPage from './BacklogPage';
import SettingsPage from './SettingsPage';
import SprintsPage from './SprintsPage';
import MeetingsPage from './MeetingsPage';
import ArchivePage from './ArchivePage';
import DigestPage from './DigestPage';
import ProjectNavPage from './ProjectNavPage';
import TaskModal from '../modals/TaskModal';
import MeetingModal from '../modals/MeetingModal';
import NewMeetingModal from '../modals/NewMeetingModal';
import NewProjectModal from '../modals/NewProjectModal';
import ProjectModal from '../modals/ProjectModal';

export default function Dashboard() {
  const [currentPage, setCurrentPage] = useState<'tasks' | 'projects' | 'meetings' | 'sprints' | 'digest' | 'archive' | 'backlog' | 'settings'>(
    () => (sessionStorage.getItem('tf_page') as any) || 'tasks'
  );
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<number | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<number | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<number | null>(null);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
  const toggleBulk = (id: number) => setBulkSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const clearBulk = () => setBulkSelected(new Set());

  // Project directory navigation (stack-based, supports unlimited depth)
  const [projNavProject, setProjNavProject] = useState<Project | null>(null);
  const [projNavTaskPath, setProjNavTaskPath] = useState<Task[]>([]);

  // Читаем sessionStorage один раз при монтировании — до того как save-эффекты затрут значения
  const savedNav = React.useRef({
    proj: sessionStorage.getItem('tf_proj') || '',
    path: (() => { try { return JSON.parse(sessionStorage.getItem('tf_path') || '[]') as number[]; } catch { return [] as number[]; } })(),
    taskId: (() => { const v = sessionStorage.getItem('tf_modal_task'); return v ? Number(v) : null; })(),
    projModal: (() => { const v = sessionStorage.getItem('tf_modal_proj'); return v ? Number(v) : null; })(),
  });

  // Сохраняем только после завершения восстановления (navRestoredRef = true)
  const navRestoredRef = React.useRef(false);
  React.useEffect(() => { sessionStorage.setItem('tf_page', currentPage); }, [currentPage]);
  React.useEffect(() => { if (navRestoredRef.current) sessionStorage.setItem('tf_proj', projNavProject?.id?.toString() ?? ''); }, [projNavProject]);
  React.useEffect(() => { if (navRestoredRef.current) sessionStorage.setItem('tf_path', JSON.stringify(projNavTaskPath.map(t => t.id))); }, [projNavTaskPath]);
  React.useEffect(() => { if (navRestoredRef.current) sessionStorage.setItem('tf_modal_task', selectedTask?.id?.toString() ?? ''); }, [selectedTask]);
  React.useEffect(() => { if (navRestoredRef.current) sessionStorage.setItem('tf_modal_proj', selectedProject?.id?.toString() ?? ''); }, [selectedProject]);

  // Navigation history for back/forward (mouse buttons 3/4, Alt+←/→)
  type NavSnap = { page: typeof currentPage; proj: Project | null; path: Task[]; statusF: string | null; projectF: number | null; assigneeF: number | null; priorityF: string | null; };
  const navBack = React.useRef<NavSnap[]>([]);
  const navFwd  = React.useRef<NavSnap[]>([]);
  const snapRef = React.useRef<() => NavSnap>(() => ({ page: 'tasks', proj: null, path: [], statusF: null, projectF: null, assigneeF: null, priorityF: null }));
  const applyRef = React.useRef<(s: NavSnap) => void>(() => {});
  snapRef.current = () => ({ page: currentPage, proj: projNavProject, path: projNavTaskPath, statusF: statusFilter, projectF: projectFilter, assigneeF: assigneeFilter, priorityF: priorityFilter });
  applyRef.current = (s) => { setCurrentPage(s.page); setProjNavProject(s.proj); setProjNavTaskPath(s.path); setStatusFilter(s.statusF); setProjectFilter(s.projectF); setAssigneeFilter(s.assigneeF); setPriorityFilter(s.priorityF); };
  const browserNavIndex = React.useRef(0);
  const modalCloseRef = React.useRef<(() => void) | null>(null);
  const pushHist = () => {
    navBack.current = [...navBack.current, snapRef.current()];
    navFwd.current = [];
    browserNavIndex.current++;
    history.pushState({ tfIdx: browserNavIndex.current }, '');
  };
  const goBack    = React.useCallback(() => { if (modalCloseRef.current) { modalCloseRef.current(); return; } if (!navBack.current.length) return; const s = navBack.current[navBack.current.length - 1]; navFwd.current = [snapRef.current(), ...navFwd.current]; navBack.current = navBack.current.slice(0, -1); applyRef.current(s); }, []);
  const goForward = React.useCallback(() => { if (!navFwd.current.length) return; const s = navFwd.current[0]; navBack.current = [...navBack.current, snapRef.current()]; navFwd.current = navFwd.current.slice(1); applyRef.current(s); }, []);

  React.useEffect(() => {
    // Sentinel на индексе -1: не даём уйти из приложения при первом back
    history.replaceState({ tfIdx: -1 }, '');
    history.pushState({ tfIdx: 0 }, '');
    browserNavIndex.current = 0;

    const onPopState = (e: PopStateEvent) => {
      const next = e.state?.tfIdx ?? 0;
      const prev = browserNavIndex.current;
      if (next === -1) {
        // Дошли до sentinel — возвращаемся вперёд, не выходим из приложения
        history.pushState({ tfIdx: 0 }, '');
        browserNavIndex.current = 0;
        return;
      }
      // Если открыта модалка — закрываем её вместо навигации назад
      if (next < prev && modalCloseRef.current) {
        modalCloseRef.current();
        // Восстанавливаем потреблённую запись истории
        history.pushState({ tfIdx: prev }, '');
        browserNavIndex.current = prev;
        return;
      }
      browserNavIndex.current = next;
      if (next < prev) goBack(); else goForward();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowSearch(false); return; }
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); goBack(); }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); }
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('keydown', onKey);
    };
  }, [goBack, goForward]);

  const [taskView, setTaskView] = useState<'cards' | 'list' | 'kanban'>(
    () => (localStorage.getItem('tf_task_view') as any) || 'cards'
  );
  const handleSetTaskView = (v: 'cards' | 'list' | 'kanban') => {
    setTaskView(v);
    localStorage.setItem('tf_task_view', v);
  };
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskDefaults, setNewTaskDefaults] = useState<{ projectId?: number; parentTaskId?: number; backlog?: boolean }>({});
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectParentId, setNewProjectParentId] = useState<number | undefined>(undefined);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{type: string; id: number} | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [taskStack, setTaskStack] = useState<Task[]>([]);

  const openTask = (t: Task) => {
    if (selectedTask) setTaskStack(s => [...s, selectedTask]);
    setSelectedTask(t);
  };
  const closeTask = () => {
    if (taskStack.length > 0) {
      const prev = taskStack[taskStack.length - 1];
      setTaskStack(s => s.slice(0, -1));
      // refresh task from latest data
      const fresh = (tasks ?? []).find((x: Task) => x.id === prev.id) ?? prev;
      setSelectedTask(fresh);
    } else {
      setSelectedTask(null);
    }
  };

  modalCloseRef.current = selectedTask ? closeTask
    : selectedProject ? () => setSelectedProject(null)
    : selectedMeeting ? () => setSelectedMeeting(null)
    : showNewTask ? () => setShowNewTask(false)
    : showNewProject ? () => setShowNewProject(false)
    : showNewMeeting ? () => setShowNewMeeting(false)
    : confirmDelete ? () => setConfirmDelete(null)
    : null;
  const [myUserId, setMyUserId] = useState<number | null>(() => {
    const saved = localStorage.getItem('teamflow_my_user_id');
    return saved ? Number(saved) : null;
  });

  const { subscribed, pushError, requestAndSubscribe } = usePushNotifications();

  const queryClient = useQueryClient();

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: async () => (await axios.get(`${API_URL}/api/tasks`)).data,
    refetchInterval: 5000,
  });

  const { data: backlogTasks = [] } = useQuery<Task[]>({
    queryKey: ['backlog'],
    queryFn: async () => (await axios.get(`${API_URL}/api/backlog`)).data,
    refetchInterval: 5000,
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: async () => (await axios.get(`${API_URL}/api/stats`)).data,
    refetchInterval: 5000,
  });

  const { data: users = [] } = useQuery<TelegramUser[]>({
    queryKey: ['users'],
    queryFn: async () => (await axios.get(`${API_URL}/api/users`)).data,
  });

  const { data: allTags = [] } = useQuery<{id:number;name:string;color:string}[]>({
    queryKey: ['tags'],
    queryFn: async () => (await axios.get(`${API_URL}/api/tags`)).data,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => (await axios.get(`${API_URL}/api/projects`)).data,
  });

  const { data: meetings = [] } = useQuery<Meeting[]>({
    queryKey: ['meetings'],
    queryFn: async () => (await axios.get(`${API_URL}/api/meetings`)).data,
  });

  const ancestorBlockedIds = React.useMemo(() => getAncestorBlockedIds(tasks), [tasks]);

  // Detect task changes between polling intervals and notify via toasts
  useTaskChangeDetector(tasks);

  // Восстановление навигации и модалок после загрузки данных
  React.useEffect(() => {
    if (navRestoredRef.current || !projects.length || !tasks.length) return;
    navRestoredRef.current = true;
    if (savedNav.current.proj) {
      const proj = projects.find(p => p.id === Number(savedNav.current.proj));
      if (proj) setProjNavProject(proj);
    }
    if (savedNav.current.path.length) {
      const path = savedNav.current.path.map(id => tasks.find(t => t.id === id)).filter(Boolean) as Task[];
      if (path.length) setProjNavTaskPath(path);
    }
    if (savedNav.current.taskId) {
      const task = tasks.find(t => t.id === savedNav.current.taskId);
      if (task) setSelectedTask(task);
    }
    if (savedNav.current.projModal) {
      const proj = projects.find(p => p.id === savedNav.current.projModal);
      if (proj) setSelectedProject(proj);
    }
  }, [projects, tasks]);

  // Deep link: open modal from URL params (?task=N, ?project=N, ?meeting=N)
  const deepLinkHandledRef = React.useRef(false);
  React.useEffect(() => {
    if (deepLinkHandledRef.current) return;
    if (!tasks.length && !projects.length) return;
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('task');
    const projectId = params.get('project');
    const meetingId = params.get('meeting');
    if (!taskId && !projectId && !meetingId) return;
    deepLinkHandledRef.current = true;
    history.replaceState(history.state, '', window.location.pathname);
    if (taskId) {
      const t = tasks.find(t => t.id === Number(taskId));
      if (t) setSelectedTask(t);
    } else if (projectId) {
      const p = projects.find(p => p.id === Number(projectId));
      if (p) setSelectedProject(p);
    } else if (meetingId && meetings.length) {
      const m = meetings.find((m: Meeting) => m.id === Number(meetingId));
      if (m) setSelectedMeeting(m);
    }
  }, [tasks, projects, meetings]);

  const invalidate = () => {
    axios.post(`${API_URL}/api/tasks/auto-archive`).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['meetings'] });
    queryClient.invalidateQueries({ queryKey: ['archive'] });
    queryClient.invalidateQueries({ queryKey: ['deleted'] });
  };

  const changeStatusMutation = useMutation({
    mutationFn: async ({ taskId, status, blockReason }: { taskId: number; status: string; blockReason?: string }) => {
      await axios.post(`${API_URL}/api/tasks/${taskId}/status`, { status, block_reason: blockReason });
    },
    onSuccess: (_, vars) => {
      setSelectedTask(prev => prev?.id === vars.taskId ? { ...prev, status: vars.status } : prev);
      invalidate();
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail;
      if (detail) {
        showToast(detail, 'error');
      }
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ taskId, userId }: { taskId: number; userId: number | null }) => {
      await axios.post(`${API_URL}/api/tasks/${taskId}/assign`, { user_id: userId });
    },
    onSuccess: (_, vars) => {
      const assignedUser = vars.userId ? (users || []).find((u: any) => u.telegram_id === vars.userId) ?? null : null;
      setSelectedTask(prev => prev?.id === vars.taskId ? { ...prev, assignee: assignedUser || undefined } : prev);
      invalidate();
    },
  });

  const takeTaskMutation = useMutation({
    mutationFn: async ({ taskId, userId, subtaskIds }: { taskId: number; userId: number; subtaskIds?: number[] }) => {
      await axios.post(`${API_URL}/api/tasks/${taskId}/status`, { status: 'DOING' });
      await axios.post(`${API_URL}/api/tasks/${taskId}/assign`, { user_id: userId });
      if (subtaskIds?.length) {
        await Promise.all(subtaskIds.map(sid =>
          axios.post(`${API_URL}/api/tasks/${sid}/assign`, { user_id: userId })
        ));
      }
    },
    onSuccess: invalidate,
  });

  const assignProjectMutation = useMutation({
    mutationFn: async ({ taskId, projectId }: { taskId: number; projectId: number | null }) => {
      const response = await axios.post(`${API_URL}/api/tasks/${taskId}/project`, { project_id: projectId });
      console.log('API response:', response.data);
      return { ...response.data, taskId, projectId };
    },
    onSuccess: async (data) => {
      console.log('Project mutation onSuccess - refetching...');
      
      // Принудительно перезагружаем tasks
      const result: any = await queryClient.fetchQuery({ queryKey: ['tasks'] });
      console.log('Tasks after fetchQuery:', result);
      
      // Ищем конкретную задачу
      const updatedTask = result?.find((t: any) => t.id === data.taskId);
      console.log(`Task ${data.taskId} after update:`, updatedTask);
      console.log(`Expected project_id: ${data.projectId}, Got: ${updatedTask?.project_id}`);
      
      // Также инвалидируем для автообновления
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Task> }) => {
      await axios.patch(`${API_URL}/api/tasks/${id}`, data);
    },
    onSuccess: (_, vars) => {
      setSelectedTask(prev => prev?.id === vars.id ? { ...prev, ...vars.data } : prev);
      invalidate();
    },
  });

  const createSubtaskMutation = useMutation({
    mutationFn: async ({ parentId, title, description, priority }: { parentId: number; title: string; description?: string; priority?: string }) => {
      const res = await axios.post(`${API_URL}/api/tasks/${parentId}/subtasks`, { title, description, priority: priority || 'NORMAL' });
      return res.data;
    },
    onSuccess: invalidate,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: { title: string; description?: string; project_id?: number; due_date?: string }) => {
      await axios.post(`${API_URL}/api/tasks`, data);
    },
    onSuccess: () => {
      invalidate();
      setShowNewTask(false);
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      await axios.delete(`${API_URL}/api/tasks/${taskId}`);
    },
    onSuccess: () => {
      invalidate();
      setSelectedTask(null);
      setConfirmDelete(null);
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      await Promise.all(ids.map(id => axios.post(`${API_URL}/api/tasks/${id}/status`, { status })));
    },
    onSuccess: () => { invalidate(); clearBulk(); showToast(`Статус обновлён`, 'success'); },
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async ({ ids, userId }: { ids: number[]; userId: number | null }) => {
      await Promise.all(ids.map(id => axios.post(`${API_URL}/api/tasks/${id}/assign`, { user_id: userId })));
    },
    onSuccess: () => { invalidate(); clearBulk(); showToast(`Исполнитель обновлён`, 'success'); },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map(id => axios.delete(`${API_URL}/api/tasks/${id}`)));
    },
    onSuccess: () => { invalidate(); clearBulk(); showToast(`Задачи удалены`, 'success'); },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; emoji?: string }) => {
      await axios.post(`${API_URL}/api/projects`, data);
    },
    onSuccess: () => {
      invalidate();
      setShowNewProject(false);
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Project> }) => {
      await axios.patch(`${API_URL}/api/projects/${id}`, data);
    },
    onSuccess: () => {
      invalidate();
      setSelectedProject(null);
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      await axios.delete(`${API_URL}/api/projects/${projectId}`);
    },
    onSuccess: () => {
      invalidate();
      setSelectedProject(null);
      setConfirmDelete(null);
    },
  });

  const createMeetingMutation = useMutation({
    mutationFn: async (data: any) => {
      await axios.post(`${API_URL}/api/meetings`, data);
    },
    onSuccess: () => {
      invalidate();
      setShowNewMeeting(false);
    },
  });

  const updateMeetingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await axios.patch(`${API_URL}/api/meetings/${id}`, data);
    },
    onSuccess: () => {
      invalidate();
    },
  });

  const deleteMeetingMutation = useMutation({
    mutationFn: async (meetingId: number) => {
      await axios.delete(`${API_URL}/api/meetings/${meetingId}`);
    },
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
    },
  });

  let filteredTasks = tasks;
  if (statusFilter !== null) {
    filteredTasks = filteredTasks.filter(t => t.status === statusFilter);
  }
  if (projectFilter !== null) {
    filteredTasks = filteredTasks.filter(t => {
      const effectiveProjectId = t.project_id ?? tasks.find(p => p.id === t.parent_task_id)?.project_id ?? null;
      return projectFilter === 0 ? !effectiveProjectId : effectiveProjectId === projectFilter;
    });
  }
  if (assigneeFilter !== null) {
    filteredTasks = filteredTasks.filter(t =>
      assigneeFilter === 0 ? !t.assignee : t.assignee?.telegram_id === assigneeFilter
    );
  }
  if (priorityFilter !== null) {
    filteredTasks = filteredTasks.filter(t => t.priority === priorityFilter);
  }
  if (tagFilter !== null) {
    filteredTasks = filteredTasks.filter(t => t.tags?.some((tag: any) => tag.id === tagFilter));
  }

  // Канбан использует все фильтры КРОМЕ статуса — колонки сами разбивают по статусам.
  // Статус-фильтр в канбане подсвечивает активную колонку, но не скрывает остальные.
  let kanbanTasks = tasks;
  if (projectFilter !== null) {
    kanbanTasks = kanbanTasks.filter(t => {
      const effectiveProjectId = t.project_id ?? tasks.find(p => p.id === t.parent_task_id)?.project_id ?? null;
      return projectFilter === 0 ? !effectiveProjectId : effectiveProjectId === projectFilter;
    });
  }
  if (assigneeFilter !== null) {
    kanbanTasks = kanbanTasks.filter(t =>
      assigneeFilter === 0 ? !t.assignee : t.assignee?.telegram_id === assigneeFilter
    );
  }
  if (priorityFilter !== null) {
    kanbanTasks = kanbanTasks.filter(t => t.priority === priorityFilter);
  }
  if (tagFilter !== null) {
    kanbanTasks = kanbanTasks.filter(t => t.tags?.some((tag: any) => tag.id === tagFilter));
  }

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const aDone = a.status === 'DONE' ? 1 : 0;
    const bDone = b.status === 'DONE' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    // DONE задачи: от выполненных недавно к выполненным давно
    if (a.status === 'DONE' && b.status === 'DONE') {
      const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return bTime - aTime;
    }
    return (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-6">

        {/* Header + Navigation — sticky при скролле */}
        <header className="sticky top-0 z-30 bg-gray-50 border-b mb-3 flex items-center justify-between overflow-x-auto scrollbar-none"
          style={{ scrollbarWidth: 'none' }}
        >
          <div className="flex items-center gap-1 sm:gap-2 min-w-max">
            <span className="text-base sm:text-lg font-bold text-gray-900 px-1 sm:px-2 shrink-0">TeamFlow</span>
            <span className="text-gray-200 shrink-0">|</span>
            {[
              { id: 'tasks', label: 'Задачи', icon: '📋' },
              { id: 'projects', label: 'Проекты', icon: '📁' },
              { id: 'meetings', label: 'Встречи', icon: '🤝' },
              { id: 'sprints', label: 'Спринты', icon: '🏃' },
              { id: 'backlog', label: 'Бэклог', icon: '📦' },
              { id: 'digest', label: 'Дайджест', icon: '📊' },
              { id: 'archive', label: 'Архив', icon: '🗄️' },
              { id: 'settings', label: 'Настройки', icon: '⚙️' },
            ].map(page => (
              <button
                key={page.id}
                onClick={() => { pushHist(); setCurrentPage(page.id as any); setProjNavProject(null); setProjNavTaskPath([]); }}
                className={`px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition ${
                  currentPage === page.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {page.icon} <span className="hidden sm:inline">{page.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 px-2">
            <button
              onClick={() => setShowSearch(s => !s)}
              className={`text-xs px-2 py-1 rounded border transition ${showSearch ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
              title="Поиск (Esc — закрыть)"
            >
              🔍
            </button>
            {!subscribed && (
              <button
                onClick={requestAndSubscribe}
                className={`relative text-xs px-2 py-1 rounded border transition ${pushError ? 'border-orange-300 text-orange-400' : 'border-blue-300 text-blue-600 hover:bg-blue-50'}`}
                title={pushError ?? 'Включить уведомления'}
              >
                🔔
                {pushError && <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-400 rounded-full" />}
              </button>
            )}
            {subscribed && (
              <span className="text-xs text-gray-400" title="Уведомления включены">🔔✓</span>
            )}
            <span className="text-xs text-gray-400 hidden sm:inline">Вы:</span>
            <select
              value={myUserId ?? ''}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null;
                setMyUserId(val);
                if (val) localStorage.setItem('teamflow_my_user_id', String(val));
                else localStorage.removeItem('teamflow_my_user_id');
              }}
              className="text-xs border rounded px-1.5 py-0.5 text-gray-700 bg-white"
            >
              <option value="">—</option>
              {users.map(u => (
                <option key={u.telegram_id} value={u.telegram_id}>{u.display_name}</option>
              ))}
            </select>
          </div>
        </header>

        {showSearch && <SearchPanel onOpenTask={(t) => { setSelectedTask(t); setShowSearch(false); }} />}

        {/* Breadcrumbs — только в разделе Проекты */}
        {currentPage === 'projects' && (
          <nav className="sticky top-0 z-40 bg-gray-50 border-b py-1.5 mb-3 flex items-center gap-1 text-xs sm:text-sm text-gray-500 flex-wrap">
            <button
              onClick={() => { pushHist(); setProjNavProject(null); setProjNavTaskPath([]); }}
              className={`font-medium hover:text-blue-600 transition ${!projNavProject ? 'text-gray-800' : 'text-gray-500'}`}
            >📁 Проекты</button>
            {projNavProject && (<>
              <span className="text-gray-300">›</span>
              <button
                onClick={() => { pushHist(); setProjNavTaskPath([]); }}
                className={`hover:text-blue-600 transition ${projNavTaskPath.length === 0 ? 'text-gray-800 font-medium' : 'text-gray-500'}`}
              >{projNavProject.emoji} {projNavProject.name}</button>
            </>)}
            {projNavTaskPath.map((t, i) => {
              const isLast = i === projNavTaskPath.length - 1;
              return (
                <React.Fragment key={t.id}>
                  <span className="text-gray-300">›</span>
                  {isLast
                    ? <span className="text-gray-800 font-medium truncate max-w-[140px]">#{t.id} {t.title}</span>
                    : <button onClick={() => { pushHist(); setProjNavTaskPath(p => p.slice(0, i + 1)); }} className="text-gray-500 hover:text-blue-600 transition truncate max-w-[120px]">#{t.id} {t.title}</button>
                  }
                </React.Fragment>
              );
            })}
          </nav>
        )}

        {/* TASKS PAGE */}
        {currentPage === 'tasks' && (
          <>
            {/* Stats - кликабельные с цветами */}
            {stats && (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2 mb-1.5">
                  {[
                    { label: 'Всего', value: stats.total, status: null, color: 'bg-white hover:bg-gray-50' },
                    { label: 'TODO', value: stats.todo, status: 'TODO', color: 'bg-gray-50 hover:bg-gray-100 border-gray-200' },
                    { label: 'В работе', value: stats.doing, status: 'DOING', color: 'bg-blue-50 hover:bg-blue-100 border-blue-200' },
                    { label: 'Блок', value: stats.blocked, status: 'BLOCKED', color: 'bg-red-50 hover:bg-red-100 border-red-200' },
                    { label: 'На паузе', value: stats.on_hold ?? 0, status: 'ON_HOLD', color: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200' },
                    { label: 'Готово', value: stats.done, status: 'DONE', color: 'bg-green-50 hover:bg-green-100 border-green-200' },
                  ].map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setStatusFilter(s.status === statusFilter ? null : s.status)}
                      className={`p-2 sm:p-3 rounded-lg border shadow-sm text-left transition ${
                        statusFilter === s.status ? 'ring-2 ring-blue-500' : ''
                      } ${s.color}`}
                    >
                      <div className="text-lg sm:text-2xl font-bold">{s.value}</div>
                      <div className="text-gray-600 text-xs truncate">{s.label}</div>
                    </button>
                  ))}
                </div>
                {((stats.archived ?? 0) > 0 || (stats.deleted ?? 0) > 0) && (
                  <div className="flex gap-3 text-xs text-gray-400 mb-3">
                    {(stats.archived ?? 0) > 0 && <span>🗄️ Архив: {stats.archived}</span>}
                    {(stats.deleted ?? 0) > 0 && <span>🗑️ Удалено: {stats.deleted}</span>}
                  </div>
                )}
              </>
            )}

            {/* Filters + New button */}
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <div className="grid grid-cols-2 sm:flex gap-2 flex-1 sm:flex-wrap">
                <select
                  value={projectFilter ?? ''}
                  onChange={(e) => setProjectFilter(e.target.value ? Number(e.target.value) : null)}
                  className="px-2 py-1.5 border rounded-lg text-xs sm:text-sm w-full sm:w-auto"
                >
                  <option value="">Все проекты</option>
                  <option value="0">📋 Без проекта</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
                  ))}
                </select>

                <select
                  value={assigneeFilter ?? ''}
                  onChange={(e) => setAssigneeFilter(e.target.value ? Number(e.target.value) : null)}
                  className="px-2 py-1.5 border rounded-lg text-xs sm:text-sm w-full sm:w-auto"
                >
                  <option value="">Все</option>
                  <option value="0">👤 Не назначено</option>
                  {users.map(u => (
                    <option key={u.telegram_id} value={u.telegram_id}>👤 {u.display_name}</option>
                  ))}
                </select>
                <select
                  value={priorityFilter ?? ''}
                  onChange={(e) => setPriorityFilter(e.target.value || null)}
                  className="px-2 py-1.5 border rounded-lg text-xs sm:text-sm w-full sm:w-auto col-span-2 sm:col-auto"
                >
                  <option value="">Все приоритеты</option>
                  {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                {allTags.length > 0 && (
                  <select
                    value={tagFilter ?? ''}
                    onChange={(e) => setTagFilter(e.target.value ? Number(e.target.value) : null)}
                    className="px-2 py-1.5 border rounded-lg text-xs sm:text-sm w-full sm:w-auto col-span-2 sm:col-auto"
                  >
                    <option value="">Все теги</option>
                    {allTags.map(tag => (
                      <option key={tag.id} value={tag.id}>{tag.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex gap-1 shrink-0">
                {([['cards','🃏'],['list','☰'],['kanban','⬛']] as const).map(([v, icon]) => (
                  <button
                    key={v}
                    onClick={() => handleSetTaskView(v)}
                    title={v === 'cards' ? 'Карточки' : v === 'list' ? 'Список' : 'Канбан'}
                    className={`px-2 py-1.5 border rounded-lg text-sm transition ${taskView === v ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >{icon}</button>
                ))}
              </div>
              <button
                onClick={() => setShowNewTask(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap"
              >+ Задача</button>
            </div>

            {/* Bulk-actions панель */}
            {bulkSelected.size > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg mb-2 flex-wrap">
                <span className="text-xs font-medium text-blue-700">Выбрано: {bulkSelected.size}</span>
                <div className="flex gap-1.5 flex-wrap">
                  {(['DOING','DONE','TODO','BLOCKED'] as const).map(s => (
                    <button key={s} onClick={() => bulkStatusMutation.mutate({ ids: [...bulkSelected], status: s })}
                      className={`px-2 py-1 text-xs rounded border transition ${STATUS_COLOR[s]} hover:opacity-80`}>
                      {STATUS_EMOJI[s]} {STATUS_LABELS[s]}
                    </button>
                  ))}
                  <span className="w-px bg-blue-200 mx-0.5" />
                  {users.map((u: any) => (
                    <button key={u.telegram_id} onClick={() => bulkAssignMutation.mutate({ ids: [...bulkSelected], userId: u.telegram_id })}
                      className="px-2 py-1 text-xs rounded border bg-white text-gray-700 border-gray-300 hover:bg-gray-50 transition">
                      👤 {u.display_name}
                    </button>
                  ))}
                  <span className="w-px bg-blue-200 mx-0.5" />
                  <button onClick={() => bulkDeleteMutation.mutate([...bulkSelected])}
                    className="px-2 py-1 text-xs rounded border bg-red-50 text-red-600 border-red-200 hover:bg-red-100 transition">
                    🗑️ Удалить
                  </button>
                </div>
                <button onClick={clearBulk} className="ml-auto text-xs text-blue-500 hover:text-blue-700">✕ Снять</button>
              </div>
            )}

            {/* Tasks — kanban */}
            {taskView === 'kanban' && (
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
              </div>
            )}

            {/* Tasks — list */}
            {taskView === 'list' && (
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
            )}

            {/* Tasks grid (cards) */}
            {taskView === 'cards' && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
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
                              if (myUserId && !task.assignee) {
                                const subtaskIds = (task.subtasks || []).filter((s: any) => !s.assignee).map((s: any) => s.id);
                                takeTaskMutation.mutate({ taskId: task.id, userId: myUserId, subtaskIds });
                              } else {
                                changeStatusMutation.mutate({ taskId: task.id, status: 'DOING' });
                              }
                            }}
                            className="absolute inset-0 flex items-center justify-center px-2 py-0.5 rounded-full text-xs border border-blue-300 bg-blue-50 text-blue-700 opacity-0 group-hover:opacity-100 [@media(not(hover:hover))]:opacity-100 transition-opacity duration-150 whitespace-nowrap"
                          >
                            {myUserId && !task.assignee
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
            </div>}
          </>
        )}

        {/* PROJECTS PAGE */}
        {currentPage === 'projects' && (
          <ProjectNavPage
            projects={projects}
            tasks={tasks}
            navProject={projNavProject}
            navTaskPath={projNavTaskPath}
            onSelectProject={(p: Project) => { pushHist(); setProjNavProject(p); setProjNavTaskPath([]); }}
            onPushTask={(t: Task) => { pushHist(); setProjNavTaskPath(p => [...p, t]); }}
            onEditProject={setSelectedProject}
            onOpenTask={setSelectedTask}
            onNewProject={(parentId?: number) => { setNewProjectParentId(parentId); setShowNewProject(true); }}
            onNewTask={(ctx: { projectId?: number; parentTaskId?: number }) => { setNewTaskDefaults(ctx); setShowNewTask(true); }}
            changeStatusMutation={changeStatusMutation}
            takeTaskMutation={takeTaskMutation}
            myUserId={myUserId}
            invalidate={invalidate}
            ancestorBlockedIds={ancestorBlockedIds}
            onDeleteTask={(id: number) => setConfirmDelete({ type: 'task', id })}
          />
        )}

        {/* MEETINGS PAGE */}
        {currentPage === 'meetings' && (
          <MeetingsPage
            meetings={meetings}
            projects={projects}
            onNew={() => setShowNewMeeting(true)}
            onOpen={setSelectedMeeting}
            onDelete={(id) => setConfirmDelete({ type: 'meeting', id })}
          />
        )}
        {/* SPRINTS PAGE */}
        {currentPage === 'sprints' && (
          <SprintsPage onOpenTask={setSelectedTask} changeStatusMutation={changeStatusMutation} tasks={tasks} />
        )}

        {/* BACKLOG PAGE */}
        {currentPage === 'backlog' && (
          <BacklogPage
            tasks={backlogTasks}
            projects={projects}
            onOpenTask={setSelectedTask}
            onNewTask={(ctx) => { setNewTaskDefaults(ctx); setShowNewTask(true); }}
            invalidate={invalidate}
          />
        )}

        {/* DIGEST PAGE */}
        {currentPage === 'digest' && (
          <DigestPage />
        )}

        {/* ARCHIVE PAGE */}
        {currentPage === 'archive' && (
          <ArchivePage projects={projects} />
        )}

        {/* SETTINGS PAGE */}
        {currentPage === 'settings' && (
          <SettingsPage projects={projects} />
        )}
      </div>

      {/* MODALS */}
      {selectedTask && (
        <TaskModal
          task={tasks.find((t: Task) => t.id === selectedTask.id) || selectedTask}
          onClose={closeTask}
          onOpenTask={openTask}
          isAncestorBlocked={ancestorBlockedIds.has(selectedTask.id)}
          canGoBack={taskStack.length > 0}
          myUserId={myUserId}
          {...{ tasks, users, projects, changeStatusMutation, assignMutation, assignProjectMutation, updateTaskMutation, setConfirmDelete, invalidate, createSubtaskMutation }}
        />
      )}
      {selectedProject && <ProjectModal project={selectedProject} projects={projects} invalidate={invalidate} onClose={() => setSelectedProject(null)} {...{ updateProjectMutation, setConfirmDelete }} />}
      {selectedMeeting && <MeetingModal meeting={selectedMeeting} onClose={() => setSelectedMeeting(null)} projects={projects} tasks={tasks} onOpenTask={setSelectedTask} invalidate={invalidate} {...{ updateMeetingMutation, setConfirmDelete }} />}
      {showNewTask && <NewTaskModal onClose={() => { setShowNewTask(false); setNewTaskDefaults({}); }} onOpenTask={(t: Task) => { setShowNewTask(false); setNewTaskDefaults({}); setSelectedTask(t); }} initialProjectId={newTaskDefaults.projectId} initialParentTaskId={newTaskDefaults.parentTaskId} initialBacklog={newTaskDefaults.backlog} {...{ projects, tasks, createTaskMutation }} />}
      {showNewProject && <NewProjectModal onClose={() => { setShowNewProject(false); setNewProjectParentId(undefined); }} projects={projects} initialParentProjectId={newProjectParentId} {...{ createProjectMutation }} />}
      {showNewMeeting && <NewMeetingModal onClose={() => setShowNewMeeting(false)} projects={projects} {...{ createMeetingMutation }} />}
      {confirmDelete && <ConfirmDeleteModal confirm={confirmDelete} onClose={() => setConfirmDelete(null)} {...{ deleteTaskMutation, deleteProjectMutation, deleteMeetingMutation }} />}
      <ToastContainer />
    </div>
  );
}

