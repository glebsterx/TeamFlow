import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

import type { Task, Project, Meeting, Stats, TelegramUser } from '../types/dashboard';
import { API_URL, STATUS_COLOR, STATUS_EMOJI, STATUS_LABELS, PRIORITY_LABELS, PRIORITY_ORDER } from '../constants/taskDisplay';
import { parseUTC } from '../utils/dateUtils';
import { getAncestorBlockedIds } from '../utils/taskUtils';
import { showToast } from '../utils/toast';
import { useTaskChangeDetector } from '../hooks/useTaskChangeDetector';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useTheme } from '../hooks/useTheme';
import { ToastContainer } from '../components/Toast';
import { SearchPanel } from '../components/SearchPanel';
import NewTaskModal from '../modals/NewTaskModal';
import AITaskModal from '../modals/AITaskModal';
import ConfirmDeleteModal from '../modals/ConfirmDeleteModal';
import BacklogPage from './BacklogPage';
import IdeasPage from './IdeasPage';
import KnowledgeBasePage from './KnowledgeBasePage';
import SettingsPage from './SettingsPage';
import SprintsPage from './SprintsPage';
import MeetingsPage from './MeetingsPage';
import ArchivePage from './ArchivePage';
import DigestPage from './DigestPage';
import AccountPage from './AccountPage';
import TaskModal from '../modals/TaskModal';
import MeetingModal from '../modals/MeetingModal';
import NewMeetingModal from '../modals/NewMeetingModal';
import NewProjectModal from '../modals/NewProjectModal';
import ProjectModal from '../modals/ProjectModal';
import TimelineView from '../components/TimelineView';
import CalendarView from '../components/CalendarView';
import KanbanView from '../components/KanbanView';
import TaskListView from '../components/TaskListView';
import CardsView from '../components/CardsView';
import TaskTreeView from '../components/TaskTreeView';
import CommandPalette from '../components/CommandPalette';
import ProjectMembersModal from '../modals/ProjectMembersModal';

export default function Dashboard() {
  const [currentPage, setCurrentPage] = useState<'tasks' | 'projects' | 'meetings' | 'sprints' | 'digest' | 'archive' | 'backlog' | 'ideas' | 'knowledge' | 'settings' | 'account'>(
    () => (sessionStorage.getItem('tf_page') as any) || 'tasks'
  );
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<number | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<number | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<number | null>(null);
  const [ideaFilter, setIdeaFilter] = useState<boolean>(false);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showProjectMembers, setShowProjectMembers] = useState<{id: number, name: string} | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
  const toggleBulk = (id: number) => setBulkSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const clearBulk = () => setBulkSelected(new Set());

  // Project directory navigation (stack-based, supports unlimited depth)
  const [projNavProject, setProjNavProject] = useState<Project | null>(null);
  const [projNavProjectPath, setProjNavProjectPath] = useState<Project[]>([]);
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

  // Navigation history for back/forward (mouse buttons 3/4, Alt+←/→, browser buttons)
  const [settingsTab, setSettingsTab] = React.useState<string>(() => sessionStorage.getItem('tf_settings_tab') || 'general');
  React.useEffect(() => { sessionStorage.setItem('tf_settings_tab', settingsTab); }, [settingsTab]);
  type NavSnap = { page: typeof currentPage; proj: Project | null; projPath: Project[]; path: Task[]; statusF: string | null; projectF: number | null; assigneeF: number | null; priorityF: string | null; tagF: number | null; settingsTab: string; };
  const snapRef = React.useRef<() => NavSnap>(() => ({ page: 'tasks', proj: null, projPath: [], path: [], statusF: null, projectF: null, assigneeF: null, priorityF: null, tagF: null, settingsTab: 'general' }));
  const applyRef = React.useRef<(s: NavSnap) => void>(() => {});
  snapRef.current = () => ({ page: currentPage, proj: projNavProject, projPath: projNavProjectPath, path: projNavTaskPath, statusF: statusFilter, projectF: projectFilter, assigneeF: assigneeFilter, priorityF: priorityFilter, tagF: tagFilter, settingsTab });
  applyRef.current = (s) => { setCurrentPage(s.page); setProjNavProject(s.proj); setProjNavProjectPath(s.projPath); setProjNavTaskPath(s.path); setStatusFilter(s.statusF); setProjectFilter(s.projectF); setAssigneeFilter(s.assigneeF); setPriorityFilter(s.priorityF); setTagFilter(s.tagF); setSettingsTab(s.settingsTab || 'general'); };
  const modalCloseRef = React.useRef<(() => void) | null>(null);
  const pushHist = (overrides?: Partial<NavSnap>) => {
    const snap = snapRef.current();
    history.pushState({ tfSnap: { ...snap, ...overrides } }, '');
  };
  const goBack    = React.useCallback(() => { if (modalCloseRef.current) { modalCloseRef.current(); return; } history.back(); }, []);
  const goForward = React.useCallback(() => { history.forward(); }, []);

  // Set initial history state on mount
  React.useEffect(() => {
    if (!history.state?.tfSnap) {
      history.replaceState({ tfSnap: snapRef.current() }, '');
    }
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowSearch(false); setShowCommandPalette(false); return; }
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowCommandPalette(true); }
      if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); goBack(); }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); }
    };
    const onPopState = (e: PopStateEvent) => {
      const snap = (e.state as any)?.tfSnap;
      if (snap) applyRef.current(snap);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPopState);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('popstate', onPopState); };
  }, [goBack, goForward]);

  const [taskView, setTaskView] = useState<'cards' | 'list' | 'kanban' | 'timeline' | 'calendar' | 'tree'>(
    () => (localStorage.getItem('tf_task_view') as any) || 'cards'
  );
  const handleSetTaskView = (v: 'cards' | 'list' | 'kanban' | 'timeline' | 'calendar' | 'tree') => {
    setTaskView(v);
    localStorage.setItem('tf_task_view', v);
  };
  const [showNewTask, setShowNewTask] = useState(false);
  const [showAITask, setShowAITask] = useState(false);
  const [newTaskDefaults, setNewTaskDefaults] = useState<{ projectId?: number; parentTaskId?: number; backlog?: boolean }>({});
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectParentId, setNewProjectParentId] = useState<number | undefined>(undefined);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{type: string; id: number} | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [taskStack, setTaskStack] = useState<Task[]>([]);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // #262 — Глобальный индикатор таймера в header
  const [activeTimer, setActiveTimer] = useState<{taskId: number; seconds: number} | null>(null);
  const [treeExpanded, setTreeExpanded] = useState<Set<number>>(new Set());
  const toggleTreeExpand = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setTreeExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  React.useEffect(() => {
    const TIMER_KEY = 'teamflow_active_timer';
    const poll = () => {
      try {
        const raw = localStorage.getItem(TIMER_KEY);
        if (!raw) { setActiveTimer(null); return; }
        const data = JSON.parse(raw);
        if (!data || !data.taskId) { setActiveTimer(null); return; }
        // Calculate current elapsed time
        let elapsed = data.accumulatedSeconds || 0;
        if (data.startTime && !data.pausedAt) {
          elapsed += Math.floor((Date.now() - data.startTime) / 1000);
        } else if (data.pausedAt) {
          elapsed += data.pausedAt - data.startTime;
        }
        setActiveTimer({ taskId: data.taskId, seconds: elapsed });
      } catch { setActiveTimer(null); }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, []);

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
  const [myUserId] = useState<number | null>(() => {
    const saved = localStorage.getItem('teamflow_my_user_id');
    return saved ? Number(saved) : null;
  });

  const myAccountId = React.useMemo(() => {
    const saved = localStorage.getItem('teamflow_account_id');
    return saved ? Number(saved) : null;
  }, []);

  const { data: myAccount } = useQuery<any | null>({
    queryKey: ['my-account', myAccountId],
    queryFn: async () => {
      if (!myAccountId) return null;
      try {
        const res = await axios.get(`${API_URL}/api/auth/account/me`, { params: { account_id: myAccountId } });
        return res.data;
      } catch {
        return null;
      }
    },
    enabled: !!myAccountId,
  });

  const mySystemRole = myAccount?.system_role || null;
  const myDisplayName = myAccount?.display_name || null;

  const { data: systemSettings } = useQuery<any>({
    queryKey: ['system-settings'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/api/settings/system`);
      return res.data;
    },
  });

  const enabledSections = systemSettings?.enabled_sections?.split(',') || [];

  const { subscribed, pushError, requestAndSubscribe, unsubscribe, isIOSafari } = usePushNotifications();
  const { isDark, isAuto, toggleTheme } = useTheme();

  const queryClient = useQueryClient();

  const [taskPage, setTaskPage] = useState(0);
  const PAGE_SIZE = 100;

  const { data: newTasks, isFetching: isLoadingTasks } = useQuery<Task[]>({
    queryKey: ['tasks', taskPage],
    queryFn: async () => (await axios.get(`${API_URL}/api/tasks?offset=${taskPage * PAGE_SIZE}&limit=${PAGE_SIZE}`)).data,
    refetchInterval: 5000,
  });

  const tasks = React.useMemo(() => {
    if (taskPage === 0) return newTasks || [];
    const prev = queryClient.getQueryData<Task[]>(['tasks', taskPage - 1]) || [];
    return [...prev, ...(newTasks || [])];
  }, [newTasks, taskPage, queryClient]);

  const loadMoreTasks = useCallback(() => {
    if (newTasks && newTasks.length === PAGE_SIZE) {
      setTaskPage(prev => prev + 1);
    }
  }, [newTasks]);

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
    // #260 — fire-and-forget: auto-archive не должен тормозить UI
    axios.post(`${API_URL}/api/tasks/auto-archive`).catch(() => {});
    // #260 — Инвалидируем только задачи (stats обновится по своему refetchInterval)
    // Загрузка ВСЕХ задач с relations — самая тяжёлая операция, не умножайте её
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['ideas'] });
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
      const assignedUser = vars.userId ? (users || []).find((u: any) => u.id === vars.userId) ?? null : null;
      setSelectedTask(prev => prev?.id === vars.taskId ? { ...prev, assignee: assignedUser || undefined } : prev);
      invalidate();
    },
  });

const takeTaskMutation = useMutation({
    mutationFn: async ({ taskId, subtaskIds }: { taskId: number; subtaskIds?: number[] }) => {
      if (!myAccountId) throw new Error('No account ID');
      await axios.post(`${API_URL}/api/tasks/${taskId}/status`, { status: 'DOING' });
      await axios.post(`${API_URL}/api/tasks/${taskId}/assign`, { user_id: myAccountId });
      if (subtaskIds?.length) {
        await Promise.all(subtaskIds.map(sid =>
          axios.post(`${API_URL}/api/tasks/${sid}/assign`, { user_id: myAccountId })
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
  // По умолчанию скрываем идеи из списка задач
  if (!ideaFilter) {
    filteredTasks = filteredTasks.filter(t => !t.is_idea);
  }
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
      assigneeFilter === 0 ? !t.assignee : t.assignee?.id === assigneeFilter
    );
  }
  if (priorityFilter !== null) {
    filteredTasks = filteredTasks.filter(t => t.priority === priorityFilter);
  }
  if (tagFilter !== null) {
    filteredTasks = filteredTasks.filter(t => t.tags?.some((tag: any) => tag.id === tagFilter));
  }
  if (ideaFilter) {
    filteredTasks = filteredTasks.filter(t => t.is_idea === true);
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
      assigneeFilter === 0 ? !t.assignee : t.assignee?.id === assigneeFilter
    );
  }
  if (priorityFilter !== null) {
    kanbanTasks = kanbanTasks.filter(t => t.priority === priorityFilter);
  }
  if (tagFilter !== null) {
    kanbanTasks = kanbanTasks.filter(t => t.tags?.some((tag: any) => tag.id === tagFilter));
  }
  if (ideaFilter) {
    kanbanTasks = kanbanTasks.filter(t => t.is_idea === true);
  }

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const aDone = a.status === 'DONE' ? 1 : 0;
    const bDone = b.status === 'DONE' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    // DONE задачи: от выполненных недавно к выполненным давно
    if (a.status === 'DONE' && b.status === 'DONE') {
      const aTime = a.completed_at ? parseUTC(a.completed_at).getTime() : 0;
      const bTime = b.completed_at ? parseUTC(b.completed_at).getTime() : 0;
      return bTime - aTime;
    }
    return (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 pb-3 sm:pb-6">

        {/* Header + Navigation — sticky при скролле */}
        <header className="sticky top-0 z-30 bg-gray-50 border-b mb-3 flex items-center justify-between overflow-x-auto scrollbar-none"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          <div className="flex items-center gap-1 sm:gap-2 min-w-max">
            <span className="text-base sm:text-lg font-bold text-gray-900 px-1 sm:px-2 shrink-0">TeamFlow</span>
            <span className="text-gray-200 shrink-0">|</span>
            {[
              ...(enabledSections.includes('tasks') ? [{ id: 'tasks', label: 'Задачи', icon: '📋' }] : []),
              ...(enabledSections.includes('meetings') ? [{ id: 'meetings', label: 'Встречи', icon: '🤝' }] : []),
              ...(enabledSections.includes('sprints') ? [{ id: 'sprints', label: 'Спринты', icon: '🏃' }] : []),
              ...(enabledSections.includes('ideas') ? [{ id: 'ideas', label: 'Идеи', icon: '💡' }] : []),
              ...(enabledSections.includes('backlog') ? [{ id: 'backlog', label: 'Бэклог', icon: '📦' }] : []),
              ...(enabledSections.includes('digest') ? [{ id: 'digest', label: 'Дайджест', icon: '📊' }] : []),
              ...(enabledSections.includes('archive') ? [{ id: 'archive', label: 'Архив', icon: '🗄️' }] : []),
              ...(enabledSections.includes('knowledge') ? [{ id: 'knowledge', label: 'База знаний', icon: '📚' }] : []),
              ...(mySystemRole === 'admin' ? [{ id: 'settings', label: 'Настройки', icon: '⚙️' }] : []),
            ].filter(Boolean).map(page => (
              <button
                key={page.id}
                onClick={() => { pushHist({ page: page.id as any, proj: null, projPath: [], path: [] }); setCurrentPage(page.id as any); setProjNavProject(null); setProjNavTaskPath([]); }}
                className={`px-1 sm:px-2 py-2 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition ${
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
                className={`relative text-xs px-2 py-1 rounded border transition cursor-pointer touch-manipulation ${pushError ? 'border-orange-300 text-orange-400' : 'border-blue-300 text-blue-600 hover:bg-blue-50'}`}
                title={pushError ?? (isIOSafari ? 'Добавьте на экран «Домой» для уведомлений' : 'Включить уведомления')}
                style={{ WebkitTapHighlightColor: 'transparent', WebkitAppearance: 'none' }}
              >
                🔔
                {pushError && <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-400 rounded-full" />}
              </button>
            )}
            {subscribed && (
              <button
                onClick={unsubscribe}
                className="text-xs px-2 py-1 rounded border border-green-300 text-green-600 hover:bg-red-50 hover:border-red-300 hover:text-red-500 transition"
                title="Отключить уведомления"
              >
                🔔✓
              </button>
            )}
            <button
              onClick={toggleTheme}
              className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition"
              title={isAuto ? 'Авто (системная тема)' : isDark ? 'Тёмная тема (нажми для смены)' : 'Светлая тема (нажми для смены)'}
            >
              {isAuto ? '🔄' : isDark ? '☀️' : '🌙'}
            </button>
            {activeTimer && (() => {
              const timerTask = tasks?.find(t => t.id === activeTimer.taskId);
              const mins = Math.floor(activeTimer.seconds / 60);
              const hrs = Math.floor(mins / 60);
              const m = mins % 60;
              const timeStr = hrs > 0 ? `${hrs}ч ${m}м` : `${mins}м`;
              const isWarning = mins >= 240; // ≥4 hours
              return (
                <button
                  onClick={() => {
                    if (timerTask) openTask(timerTask);
                  }}
                  className={`text-xs px-2 py-1 rounded-lg font-medium transition flex items-center gap-1 animate-pulse ${
                    isWarning
                      ? 'bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200'
                      : 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200'
                  }`}
                  title={`Таймер: ${timerTask?.title || '#'+activeTimer.taskId} — ${timeStr}`}
                >
                  ⏱ {timeStr}
                </button>
              );
            })()}
            <a
              href="/help"
              className="text-xs px-2 py-1 rounded-lg text-gray-500 hover:bg-gray-100 transition"
              title="Справка"
            >
              ❓
            </a>
            <button
              onClick={() => { pushHist({ page: 'account' as any }); setCurrentPage('account'); }}
              className="text-xs px-3 py-1 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition flex items-center gap-1"
              title="Мой аккаунт"
            >
              👤 {myDisplayName || myUserId ? (() => {
                if (myDisplayName) return myDisplayName.split(' ')[0];
                const u = users.find(user => user.id === myUserId);
                return u ? u.display_name?.split(' ')[0] || u.first_name : 'Профиль';
              })() : 'Войти'}
            </button>
          </div>
        </header>

        {showSearch && <SearchPanel onOpenTask={(t) => { setSelectedTask(t); setShowSearch(false); }} />}

        <CommandPalette
          isOpen={showCommandPalette}
          onClose={() => setShowCommandPalette(false)}
          tasks={tasks}
          projects={projects}
          onOpenTask={setSelectedTask}
          onOpenProject={setSelectedProject}
          onNewTask={() => setShowNewTask(true)}
          onNavigate={(page) => setCurrentPage(page as any)}
        />

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
                      onClick={() => { const newStatus = s.status === statusFilter ? null : s.status; pushHist({ statusF: newStatus }); setStatusFilter(newStatus); }}
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
                  onChange={(e) => { const newProj = e.target.value ? Number(e.target.value) : null; pushHist({ projectF: newProj }); setProjectFilter(newProj); }}
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
                  onChange={(e) => { const newVal = e.target.value ? Number(e.target.value) : null; pushHist({ assigneeF: newVal }); setAssigneeFilter(newVal); }}
                  className="px-2 py-1.5 border rounded-lg text-xs sm:text-sm w-full sm:w-auto"
                >
                  <option value="">Все</option>
                  <option value="0">👤 Не назначено</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>👤 {u.display_name}</option>
                  ))}
                </select>
                <select
                  value={priorityFilter ?? ''}
                  onChange={(e) => { const newVal = e.target.value || null; pushHist({ priorityF: newVal }); setPriorityFilter(newVal); }}
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
                    onChange={(e) => { const newVal = e.target.value ? Number(e.target.value) : null; pushHist({ tagF: newVal }); setTagFilter(newVal); }}
                    className="px-2 py-1.5 border rounded-lg text-xs sm:text-sm w-full sm:w-auto col-span-2 sm:col-auto"
                  >
                    <option value="">Все теги</option>
                    {allTags.map(tag => (
                      <option key={tag.id} value={tag.id}>{tag.name}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => setIdeaFilter(f => !f)}
                  className={`px-2 py-1.5 border rounded-lg text-xs sm:text-sm ${ideaFilter ? 'bg-yellow-50 border-yellow-400 text-yellow-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  💡 Идеи
                </button>
              </div>

              <div className="flex gap-1 shrink-0">
                {([['cards','🃏'],['list','☰'],['kanban','⬛'],['timeline','📊'],['calendar','📅'],['tree','🌳']] as const).map(([v, icon]) => (
                  <button
                    key={v}
                    onClick={() => handleSetTaskView(v)}
                    title={v === 'cards' ? 'Карточки' : v === 'list' ? 'Список' : v === 'kanban' ? 'Канбан' : v === 'timeline' ? 'Таймлайн' : v === 'calendar' ? 'Календарь' : 'Дерево'}
                    className={`px-2 py-1.5 border rounded-lg text-sm transition ${taskView === v ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >{icon}</button>
                ))}
              </div>
              <button
                onClick={() => setShowNewTask(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap"
              >+ Задача</button>
              <button
                onClick={() => setShowAITask(true)}
                className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap"
              >🤖 AI</button>
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
                    <button key={u.id} onClick={() => bulkAssignMutation.mutate({ ids: [...bulkSelected], userId: u.id })}
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
              <KanbanView
                kanbanTasks={kanbanTasks}
                tasks={tasks}
                projects={projects}
                statusFilter={statusFilter}
                setSelectedTask={setSelectedTask}
                PAGE_SIZE={PAGE_SIZE}
                isLoadingTasks={isLoadingTasks}
                loadMoreTasks={loadMoreTasks}
              />
            )}

            {/* Tasks — list */}
            {taskView === 'list' && (
              <TaskListView
                sortedTasks={sortedTasks}
                projects={projects}
                ancestorBlockedIds={ancestorBlockedIds}
                bulkSelected={bulkSelected}
                toggleBulk={toggleBulk}
                setSelectedTask={setSelectedTask}
              />
            )}

            {/* Tasks grid (cards) */}
            {taskView === 'cards' && (
              <CardsView
                sortedTasks={sortedTasks}
                tasks={tasks}
                projects={projects}
                ancestorBlockedIds={ancestorBlockedIds}
                bulkSelected={bulkSelected}
                toggleBulk={toggleBulk}
                setSelectedTask={setSelectedTask}
                myAccountId={myAccountId}
                takeTaskMutation={takeTaskMutation}
                changeStatusMutation={changeStatusMutation}
                invalidate={invalidate}
              />
            )}

            {/* Tasks — timeline */}
            {taskView === 'timeline' && (
              <TimelineView
                tasks={filteredTasks}
                projects={projects}
                onTaskClick={setSelectedTask}
              />
            )}

            {/* Tasks — calendar */}
            {taskView === 'calendar' && (
              <CalendarView projects={projects} onOpenTask={setSelectedTask} />
            )}

            {/* Tasks — tree: projects → tasks → subtasks */}
            {taskView === 'tree' && (
              <TaskTreeView
                sortedTasks={sortedTasks}
                projects={projects}
                treeExpanded={treeExpanded}
                setTreeExpanded={setTreeExpanded}
                toggleTreeExpand={toggleTreeExpand}
                setSelectedTask={setSelectedTask}
              />
            )}
          </>
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
          <DigestPage onOpenTask={setSelectedTask} />
        )}

        {/* ARCHIVE PAGE */}
        {currentPage === 'archive' && (
          <ArchivePage projects={projects} />
        )}

        {/* IDEAS PAGE */}
        {currentPage === 'ideas' && (
          <IdeasPage tasks={tasks} projects={projects} />
        )}

        {/* KNOWLEDGE BASE PAGE */}
        {currentPage === 'knowledge' && (
          <KnowledgeBasePage />
        )}

        {/* SETTINGS PAGE */}
        {currentPage === 'settings' && (
          <SettingsPage
            projects={projects}
            tasks={tasks}
            navProject={projNavProject}
            navProjectPath={projNavProjectPath}
            navTaskPath={projNavTaskPath}
            onSelectProject={(p: Project | null) => {
              let nextPath = projNavProjectPath;
              if (p && projNavProject && p.id !== projNavProject.id) {
                nextPath = [...projNavProjectPath, projNavProject];
              } else if (!p) {
                nextPath = [];
              }
              pushHist({ proj: p, projPath: nextPath, path: [] });
              setProjNavProjectPath(nextPath);
              setProjNavProject(p);
              setProjNavTaskPath([]);
            }}
            onPushTask={(t: Task) => { const nextPath = [...projNavTaskPath, t]; pushHist({ path: nextPath }); setProjNavTaskPath(p => [...p, t]); }}
            onPopTask={goBack}
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
            onShowMembers={(p: Project) => setShowProjectMembers({ id: p.id, name: p.name })}
            activeTab={settingsTab}
            onTabChange={(tab: string) => { pushHist({ settingsTab: tab }); setSettingsTab(tab); }}
          />
        )}

        {/* ACCOUNT PAGE */}
        {currentPage === 'account' && (
          <AccountPage />
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
      {showProjectMembers && <ProjectMembersModal projectId={showProjectMembers.id} projectName={showProjectMembers.name} onClose={() => setShowProjectMembers(null)} />}
      {selectedMeeting && <MeetingModal meeting={selectedMeeting} onClose={() => setSelectedMeeting(null)} projects={projects} tasks={tasks} onOpenTask={setSelectedTask} invalidate={invalidate} {...{ updateMeetingMutation, setConfirmDelete }} />}
      {showNewTask && <NewTaskModal onClose={() => { setShowNewTask(false); setNewTaskDefaults({}); }} onOpenTask={(t: Task) => { setShowNewTask(false); setNewTaskDefaults({}); setSelectedTask(t); }} initialProjectId={newTaskDefaults.projectId} initialParentTaskId={newTaskDefaults.parentTaskId} initialBacklog={newTaskDefaults.backlog} {...{ projects, tasks, createTaskMutation }} />}
      {showAITask && <AITaskModal onClose={() => setShowAITask(false)} onTaskCreated={() => { setShowAITask(false); invalidate(); }} projects={projects} />}
      {showNewProject && <NewProjectModal onClose={() => { setShowNewProject(false); setNewProjectParentId(undefined); }} projects={projects} initialParentProjectId={newProjectParentId} {...{ createProjectMutation }} />}
      {showNewMeeting && <NewMeetingModal onClose={() => setShowNewMeeting(false)} projects={projects} {...{ createMeetingMutation }} />}
      {confirmDelete && <ConfirmDeleteModal confirm={confirmDelete} onClose={() => setConfirmDelete(null)} {...{ deleteTaskMutation, deleteProjectMutation, deleteMeetingMutation }} />}
      <ToastContainer />
    </div>
  );
}

