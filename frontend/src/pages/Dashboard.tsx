import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8180';

interface Assignee {
  telegram_id: number;
  display_name: string;
}

interface SubTask {
  id: number;
  title: string;
  status: string;
  priority: string;
  assignee?: Assignee;
  due_date?: string;
  created_at: string;
}

interface Task {
  id: number;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignee?: Assignee;
  project_id?: number;
  parent_task_id?: number;
  subtasks?: SubTask[];
  due_date?: string;
  deleted?: boolean;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr.includes('Z') ? dateStr : dateStr + 'Z');
  const diffMs = Date.now() - date.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин. назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч. назад`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'вчера';
  if (d < 7) return `${d} дн. назад`;
  return date.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

function formatDatetime(dateStr: string): string {
  const date = new Date(dateStr.includes('Z') ? dateStr : dateStr + 'Z');
  return date.toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function getDueStatus(dueDate?: string, status?: string): 'overdue' | 'today' | 'soon' | 'upcoming' | null {
  if (!dueDate || status === 'DONE') return null;
  const due = new Date(dueDate.includes('Z') ? dueDate : dueDate + 'Z');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.floor((dueDay.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays <= 3) return 'soon';
  return 'upcoming';
}

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr.includes('Z') ? dateStr : dateStr + 'Z');
  return date.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

function toDateInputValue(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr.includes('Z') ? dateStr : dateStr + 'Z');
  return date.toISOString().split('T')[0];
}

interface Project {
  id: number;
  name: string;
  description?: string;
  emoji?: string;
  is_active: boolean;
}

interface Meeting {
  id: number;
  summary: string;
  meeting_date: string;
}

interface Stats {
  total: number;
  todo: number;
  doing: number;
  done: number;
  blocked: number;
}

interface TelegramUser {
  telegram_id: number;
  display_name: string;
  first_name: string;
}

const STATUS_COLOR: Record<string, string> = {
  TODO: 'bg-gray-100 text-gray-700 border-gray-300',
  DOING: 'bg-blue-100 text-blue-700 border-blue-300',
  DONE: 'bg-green-100 text-green-700 border-green-300',
  BLOCKED: 'bg-red-100 text-red-700 border-red-300',
};

const STATUS_BORDER: Record<string, string> = {
  TODO: 'border-l-gray-300',
  DOING: 'border-l-blue-500',
  DONE: 'border-l-green-500',
  BLOCKED: 'border-l-red-500',
};

const STATUS_EMOJI: Record<string, string> = {
  TODO: '📝', DOING: '🔄', DONE: '✅', BLOCKED: '⚠️',
};

const STATUS_LABELS: Record<string, string> = {
  TODO: 'TODO',
  DOING: 'В работе',
  DONE: 'Готово',
  BLOCKED: 'Блок',
};

const DUE_BADGE: Record<string, string> = {
  overdue:  'bg-red-100 text-red-700 border-red-200',
  today:    'bg-orange-100 text-orange-700 border-orange-200',
  soon:     'bg-yellow-100 text-yellow-700 border-yellow-200',
  upcoming: 'bg-gray-100 text-gray-500 border-gray-200',
};

const PRIORITY_LABELS: Record<string, string> = {
  URGENT: '🔥 Срочно',
  HIGH:   '⚠️ Высокий',
  NORMAL: '📌 Обычный',
  LOW:    '🧊 Низкий',
};

const PRIORITY_COLOR: Record<string, string> = {
  URGENT: 'bg-red-100 text-red-700 border-red-300',
  HIGH:   'bg-orange-100 text-orange-700 border-orange-300',
  NORMAL: 'bg-gray-100 text-gray-500 border-gray-300',
  LOW:    'bg-blue-50 text-blue-500 border-blue-200',
};

const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

const PRIORITY_EMOJI: Record<string, string> = { URGENT: '🔥', HIGH: '⚠️', NORMAL: '📌', LOW: '🧊' };

const STATUS_BG: Record<string, string> = {
  TODO:    'bg-white',
  DOING:   'bg-blue-50',
  DONE:    'bg-green-50',
  BLOCKED: 'bg-red-50',
};

function cardBg(priority: string, status: string): string {
  if (status === 'DONE') return STATUS_BG['DONE'];
  if (priority === 'URGENT') return 'bg-red-50';
  if (priority === 'HIGH')   return 'bg-orange-50';
  if (priority === 'LOW')    return 'bg-sky-50';
  return STATUS_BG[status] ?? 'bg-white';
}

function MarkdownContent({ content, className = '' }: { content: string; className?: string }) {
  // Конвертируем одиночные переносы строк в markdown line breaks (  \n)
  // чтобы Shift+Enter и обычный Enter сохраняли переносы при рендеринге
  const processedContent = content.replace(/([^\n])\n(?!\n)/g, '$1  \n');
  return (
    <div className={`text-sm text-gray-700 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-1.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-1.5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          code: ({ inline, children }: any) => inline
            ? <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
            : <pre className="bg-gray-100 p-2 rounded text-xs font-mono overflow-x-auto mb-1.5 whitespace-pre-wrap"><code>{children}</code></pre>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{children}</a>
          ),
          h1: ({ children }) => <h1 className="text-base font-bold mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-300 pl-3 text-gray-600 mb-1.5">{children}</blockquote>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

export default function Dashboard() {
  const [currentPage, setCurrentPage] = useState<'tasks' | 'projects' | 'meetings' | 'digest' | 'archive'>(
    () => (sessionStorage.getItem('tf_page') as any) || 'tasks'
  );
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<number | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<number | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

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
  const goBack    = React.useCallback(() => { if (modalCloseRef.current) { modalCloseRef.current(); return; } if (!navBack.current.length) return; const s = navBack.current.at(-1)!; navFwd.current = [snapRef.current(), ...navFwd.current]; navBack.current = navBack.current.slice(0, -1); applyRef.current(s); }, []);
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

  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskDefaults, setNewTaskDefaults] = useState<{ projectId?: number; parentTaskId?: number }>({});
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{type: string; id: number} | null>(null);
  modalCloseRef.current = selectedTask ? () => setSelectedTask(null)
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

  const queryClient = useQueryClient();

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: async () => (await axios.get(`${API_URL}/api/tasks`)).data,
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

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => (await axios.get(`${API_URL}/api/projects`)).data,
  });

  const { data: meetings = [] } = useQuery<Meeting[]>({
    queryKey: ['meetings'],
    queryFn: async () => (await axios.get(`${API_URL}/api/meetings`)).data,
  });

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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['meetings'] });
    queryClient.invalidateQueries({ queryKey: ['archive'] });
    queryClient.invalidateQueries({ queryKey: ['deleted'] });
  };

  const changeStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: string }) => {
      await axios.post(`${API_URL}/api/tasks/${taskId}/status`, { status });
    },
    onSuccess: (_, vars) => {
      setSelectedTask(prev => prev?.id === vars.taskId ? { ...prev, status: vars.status } : prev);
      invalidate();
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ taskId, userId }: { taskId: number; userId: number | null }) => {
      await axios.post(`${API_URL}/api/tasks/${taskId}/assign`, { user_id: userId });
    },
    onSuccess: (_, vars) => {
      const assignedUser = vars.userId ? (users || []).find((u: any) => u.telegram_id === vars.userId) ?? null : null;
      setSelectedTask(prev => prev?.id === vars.taskId ? { ...prev, assignee: assignedUser } : prev);
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
    mutationFn: async (data: { summary: string }) => {
      await axios.post(`${API_URL}/api/meetings`, data);
    },
    onSuccess: () => {
      invalidate();
      setShowNewMeeting(false);
    },
  });

  const updateMeetingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { summary: string } }) => {
      await axios.patch(`${API_URL}/api/meetings/${id}`, data);
    },
    onSuccess: () => {
      invalidate();
      setSelectedMeeting(null);
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

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const aDone = a.status === 'DONE' ? 1 : 0;
    const bDone = b.status === 'DONE' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-6">

        {/* Header + Navigation — одна строка */}
        <header className="border-b mb-0 flex items-center justify-between overflow-x-auto">
          <div className="flex items-center gap-1 sm:gap-2 min-w-max">
            <span className="text-base sm:text-lg font-bold text-gray-900 px-1 sm:px-2 shrink-0">TeamFlow</span>
            <span className="text-gray-200 shrink-0">|</span>
            {[
              { id: 'tasks', label: 'Задачи', icon: '📋' },
              { id: 'projects', label: 'Проекты', icon: '📁' },
              { id: 'meetings', label: 'Встречи', icon: '🤝' },
              { id: 'digest', label: 'Дайджест', icon: '📊' },
              { id: 'archive', label: 'Архив', icon: '🗄️' },
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

        {/* Breadcrumbs */}
        <nav className="sticky top-0 z-40 bg-gray-50 border-b py-1.5 mb-3 flex items-center gap-1 text-xs sm:text-sm text-gray-500 flex-wrap">
          <button
            onClick={() => { pushHist(); setCurrentPage('tasks'); setStatusFilter(null); setProjectFilter(null); setAssigneeFilter(null); setPriorityFilter(null); setProjNavProject(null); setProjNavTaskPath([]); }}
            className="hover:text-blue-600 transition font-medium"
          >TeamFlow</button>
          <span className="text-gray-300">›</span>

          {/* Tasks breadcrumbs */}
          {currentPage === 'tasks' && (<>
            <button
              onClick={() => { setStatusFilter(null); setProjectFilter(null); setAssigneeFilter(null); setPriorityFilter(null); }}
              className="text-gray-800 font-medium hover:text-blue-600 transition"
            >📋 Задачи</button>
            {projectFilter !== null && projectFilter > 0 && (() => {
              const proj = projects.find(p => p.id === projectFilter);
              return proj ? (<>
                <span className="text-gray-300">›</span>
                <button onClick={() => setStatusFilter(null)} className="text-gray-700 hover:text-blue-600 transition">{proj.emoji} {proj.name}</button>
              </>) : null;
            })()}
            {statusFilter && (<>
              <span className="text-gray-300">›</span>
              <span className="text-gray-600">{STATUS_EMOJI[statusFilter]} {STATUS_LABELS[statusFilter]}</span>
            </>)}
          </>)}

          {/* Projects breadcrumbs — directory navigation */}
          {currentPage === 'projects' && (<>
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
          </>)}

          {/* Other pages */}
          {currentPage === 'meetings' && <span className="text-gray-800 font-medium">🤝 Встречи</span>}
          {currentPage === 'digest' && <span className="text-gray-800 font-medium">📊 Дайджест</span>}
          {currentPage === 'archive' && <span className="text-gray-800 font-medium">🗄️ Архив</span>}
        </nav>

        {/* TASKS PAGE */}
        {currentPage === 'tasks' && (
          <>
            {/* Stats - кликабельные с цветами */}
            {stats && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2 mb-3">
                {[
                  { label: 'Всего', value: stats.total, status: null, color: 'bg-white hover:bg-gray-50' },
                  { label: 'TODO', value: stats.todo, status: 'TODO', color: 'bg-gray-50 hover:bg-gray-100 border-gray-200' },
                  { label: 'В работе', value: stats.doing, status: 'DOING', color: 'bg-blue-50 hover:bg-blue-100 border-blue-200' },
                  { label: 'Готово', value: stats.done, status: 'DONE', color: 'bg-green-50 hover:bg-green-100 border-green-200' },
                  { label: 'Блок', value: stats.blocked, status: 'BLOCKED', color: 'bg-red-50 hover:bg-red-100 border-red-200' },
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
              </div>

              <button
                onClick={() => setShowNewTask(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap"
              >+ Задача</button>
            </div>

            {/* Tasks grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {sortedTasks.map(task => {
                const proj = projects.find(p => p.id === task.project_id);
                const parentTask = task.parent_task_id ? tasks.find(t => t.id === task.parent_task_id) : null;
                const parentProj = parentTask ? projects.find(p => p.id === parentTask.project_id) : null;
                const dueStatus = getDueStatus(task.due_date, task.status);
                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className={`group relative rounded-lg border border-l-4 ${STATUS_BORDER[task.status]} ${cardBg(task.priority, task.status)} p-3 sm:p-4 [@media(hover:hover)]:hover:shadow-md transition cursor-pointer`}
                  >
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
                            onClick={(e) => { e.stopPropagation(); changeStatusMutation.mutate({ taskId: task.id, status: 'DONE' }); }}
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
                    <h3 className="font-semibold text-sm leading-tight mb-1">{task.title}</h3>
                    {task.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 mb-1.5">{task.description}</p>
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
                      <div className="text-xs text-gray-400 shrink-0">{timeAgo(task.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
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
            onNewProject={() => setShowNewProject(true)}
            onNewTask={(ctx: { projectId?: number; parentTaskId?: number }) => { setNewTaskDefaults(ctx); setShowNewTask(true); }}
            changeStatusMutation={changeStatusMutation}
            takeTaskMutation={takeTaskMutation}
            myUserId={myUserId}
            invalidate={invalidate}
          />
        )}

        {/* MEETINGS PAGE */}
        {currentPage === 'meetings' && (
          <>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg sm:text-xl font-bold">Встречи ({meetings.length})</h2>
              <button
                onClick={() => setShowNewMeeting(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium"
              >+ Встреча</button>
            </div>

            <div className="space-y-2">
              {meetings.map(meeting => (
                <div key={meeting.id} className="bg-white rounded-lg border p-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 cursor-pointer" onClick={() => setSelectedMeeting(meeting)}>
                      <div className="text-xs text-gray-500 mb-1">
                        {new Date(meeting.meeting_date).toLocaleDateString('ru', {
                          day: 'numeric',
                          month: 'long',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{meeting.summary}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete({ type: 'meeting', id: meeting.id });
                      }}
                      className="ml-2 text-red-500 hover:text-red-700"
                    >🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {/* DIGEST PAGE */}
        {currentPage === 'digest' && (
          <DigestPage />
        )}

        {/* ARCHIVE PAGE */}
        {currentPage === 'archive' && (
          <ArchivePage projects={projects} />
        )}
      </div>

      {/* MODALS */}
      {selectedTask && (
        <TaskModal
          task={tasks.find(t => t.id === selectedTask.id) || selectedTask}
          onClose={() => setSelectedTask(null)}
          {...{ tasks, users, projects, changeStatusMutation, assignMutation, assignProjectMutation, updateTaskMutation, setConfirmDelete, invalidate, createSubtaskMutation }}
        />
      )}
      {selectedProject && <ProjectModal project={selectedProject} onClose={() => setSelectedProject(null)} {...{ updateProjectMutation, setConfirmDelete }} />}
      {selectedMeeting && <MeetingModal meeting={selectedMeeting} onClose={() => setSelectedMeeting(null)} {...{ updateMeetingMutation, setConfirmDelete }} />}
      {showNewTask && <NewTaskModal onClose={() => { setShowNewTask(false); setNewTaskDefaults({}); }} initialProjectId={newTaskDefaults.projectId} initialParentTaskId={newTaskDefaults.parentTaskId} {...{ projects, tasks, createTaskMutation }} />}
      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} {...{ createProjectMutation }} />}
      {showNewMeeting && <NewMeetingModal onClose={() => setShowNewMeeting(false)} {...{ createMeetingMutation }} />}
      {confirmDelete && <ConfirmDeleteModal confirm={confirmDelete} onClose={() => setConfirmDelete(null)} {...{ deleteTaskMutation, deleteProjectMutation, deleteMeetingMutation }} />}
    </div>
  );
}

// Projects Directory Navigation Page
function ProjectNavPage({ projects, tasks, navProject, navTaskPath, onSelectProject, onPushTask, onEditProject, onOpenTask, onNewProject, onNewTask, changeStatusMutation, takeTaskMutation, myUserId, invalidate }: any) {
  const [statusFilter, setStatusFilter] = React.useState<string | null>(null);

  // Current node: last task in path, or project root
  const currentTask: Task | null = navTaskPath.length > 0 ? navTaskPath[navTaskPath.length - 1] : null;

  // Reset filter when navigating to a different level
  React.useEffect(() => { setStatusFilter(null); }, [navProject?.id, currentTask?.id]);

  // Get direct children of a node from the flat tasks array
  const getChildren = (parentId: number) => tasks.filter((t: any) => t.parent_task_id === parentId);

  // Level 0: all projects
  if (!navProject) {
    return (
      <>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg sm:text-xl font-bold">Проекты ({projects.length})</h2>
          <button onClick={onNewProject} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium">+ Проект</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((proj: any) => {
            const projAllTasks = tasks.filter((t: any) => {
              if (t.project_id === proj.id) return true;
              return tasks.find((p: any) => p.id === t.parent_task_id)?.project_id === proj.id;
            });
            const doneCount = projAllTasks.filter((t: any) => t.status === 'DONE').length;
            const pct = projAllTasks.length ? Math.round(doneCount / projAllTasks.length * 100) : 0;
            return (
              <div
                key={proj.id}
                onClick={() => onSelectProject(proj)}
                className="bg-white rounded-lg border p-4 [@media(hover:hover)]:hover:shadow-md transition cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-3xl">{proj.emoji || '📁'}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditProject(proj); }}
                    className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-gray-600 transition"
                  >✏️</button>
                </div>
                <h3 className="font-bold text-base mb-1">{proj.name}</h3>
                {proj.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{proj.description}</p>}
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{doneCount}/{projAllTasks.length}</span>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // Level 1+: show children of current node (project root or any task)
  const allChildren: Task[] = currentTask
    ? getChildren(currentTask.id)
    : tasks.filter((t: any) => t.project_id === navProject.id && !t.parent_task_id);

  const children = statusFilter ? allChildren.filter((t: any) => t.status === statusFilter) : allChildren;

  const headerTitle = currentTask ? `#${currentTask.id} ${currentTask.title}` : `${navProject.emoji} ${navProject.name}`;

  // Status counts for filter buttons
  const statusCounts = ['TODO', 'DOING', 'DONE', 'BLOCKED'].map(s => ({
    status: s,
    count: allChildren.filter((t: any) => t.status === s).length,
  })).filter(s => s.count > 0);

  return (
    <>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg sm:text-xl font-bold">{headerTitle}</h2>
          {currentTask && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[currentTask.status]}`}>
              {STATUS_EMOJI[currentTask.status]} {STATUS_LABELS[currentTask.status]}
            </span>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => onNewTask({ projectId: navProject.id, parentTaskId: currentTask?.id })}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium"
          >+ Задача</button>
          {currentTask
            ? <button onClick={() => onOpenTask(currentTask)} className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">↗ Открыть</button>
            : <button onClick={() => onEditProject(navProject)} className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">✏️</button>
          }
        </div>
      </div>

      {statusCounts.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          {statusCounts.map(({ status, count }) => (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? null : status)}
              className={`px-2 py-1 rounded-lg border text-xs font-medium transition ${STATUS_COLOR[status]} ${statusFilter === status ? 'ring-2 ring-blue-500' : 'opacity-70 hover:opacity-100'}`}
            >
              {STATUS_EMOJI[status]} {STATUS_LABELS[status]} {count}
            </button>
          ))}
        </div>
      )}

      {children.length === 0 && <p className="text-gray-400 text-sm py-4 text-center">{statusFilter ? 'Нет задач с таким статусом' : 'Нет дочерних задач'}</p>}

      <div className="space-y-2">
        {children.map((task: any) => {
          const taskChildren = getChildren(task.id);
          const doneCount = taskChildren.filter((c: any) => c.status === 'DONE').length;
          const pct = taskChildren.length ? Math.round(doneCount / taskChildren.length * 100) : 0;
          return (
            <div
              key={task.id}
              onClick={() => taskChildren.length > 0 ? onPushTask(task) : onOpenTask(task)}
              className={`bg-white rounded-lg border border-l-4 ${STATUS_BORDER[task.status]} p-3 [@media(hover:hover)]:hover:shadow-md transition cursor-pointer group`}
            >
              <div className="flex items-center gap-2">
                <div className="relative shrink-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded border flex items-center transition-opacity duration-150 ${
                    (task.status === 'TODO' || task.status === 'DOING' || task.status === 'DONE') ? 'md:group-hover:opacity-0' : ''
                  } ${STATUS_COLOR[task.status]}`}>{STATUS_EMOJI[task.status]}</span>
                  {task.status === 'TODO' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (myUserId && !task.assignee) {
                          takeTaskMutation.mutate({ taskId: task.id, userId: myUserId });
                        } else {
                          changeStatusMutation.mutate({ taskId: task.id, status: 'DOING' });
                        }
                      }}
                      className="absolute inset-0 hidden md:flex items-center justify-center px-1.5 py-0.5 rounded text-xs border border-blue-300 bg-blue-50 text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap hover:bg-blue-100"
                    >{myUserId && !task.assignee ? '🙋' : '▶'}</button>
                  )}
                  {task.status === 'DOING' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); changeStatusMutation.mutate({ taskId: task.id, status: 'DONE' }); }}
                      className="absolute inset-0 hidden md:flex items-center justify-center px-1.5 py-0.5 rounded text-xs border border-green-300 bg-green-50 text-green-700 opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap hover:bg-green-100"
                    >✓</button>
                  )}
                  {task.status === 'DONE' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        axios.post(`${API_URL}/api/tasks/${task.id}/archive`).then(() => invalidate());
                      }}
                      className="absolute inset-0 hidden md:flex items-center justify-center px-1.5 py-0.5 rounded text-xs border border-gray-300 bg-gray-50 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap hover:bg-gray-100"
                    >🗄️</button>
                  )}
                </div>
                <span className="text-gray-400 text-xs shrink-0">#{task.id}</span>
                <span className="font-medium text-sm flex-1 truncate" title={task.title}>{task.title}</span>
                {task.priority && task.priority !== 'NORMAL' && (
                  <span className={`text-xs px-1 py-0.5 rounded border shrink-0 ${PRIORITY_COLOR[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
                )}
                {task.assignee && <span className="text-xs text-gray-400 shrink-0 hidden sm:inline">{task.assignee.display_name}</span>}
                {taskChildren.length > 0
                  ? <span className="text-xs text-gray-400 shrink-0">{doneCount}/{taskChildren.length} ›</span>
                  : <button onClick={(e) => { e.stopPropagation(); onOpenTask(task); }} className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 hover:text-blue-600 shrink-0 transition">↗</button>
                }
              </div>
              {taskChildren.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-1 overflow-hidden">
                    <div className="h-full bg-green-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{pct}%</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// Archive Page
function ArchivePage({ projects }: { projects: Project[] }) {
  const queryClient = useQueryClient();

  const { data: archivedTasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['archive'],
    queryFn: async () => (await axios.get(`${API_URL}/api/archive`)).data,
    staleTime: 30000,
  });

  const { data: deletedTasks = [] } = useQuery<Task[]>({
    queryKey: ['deleted'],
    queryFn: async () => (await axios.get(`${API_URL}/api/deleted`)).data,
    staleTime: 30000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['archive'] });
    queryClient.invalidateQueries({ queryKey: ['deleted'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  const unarchiveMutation = useMutation({
    mutationFn: async (taskId: number) => axios.post(`${API_URL}/api/tasks/${taskId}/unarchive`),
    onSuccess: invalidateAll,
  });

  const restoreMutation = useMutation({
    mutationFn: async (taskId: number) => axios.post(`${API_URL}/api/tasks/${taskId}/restore`),
    onSuccess: invalidateAll,
  });


  if (isLoading) return <div className="text-center py-12 text-gray-400">Загрузка...</div>;

  const TaskCard = ({ task, actions }: { task: Task; actions: React.ReactNode }) => {
    const proj = projects.find(p => p.id === task.project_id);
    return (
      <div className="bg-white rounded-lg border border-l-4 border-l-gray-200 p-3 sm:p-4 opacity-80">
        <div className="flex justify-between items-start mb-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400">#{task.id}</span>
            {proj && (
              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                {proj.emoji} {proj.name}
              </span>
            )}
          </div>
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${STATUS_COLOR[task.status]}`}>
            {STATUS_EMOJI[task.status]} <span className="hidden sm:inline">{STATUS_LABELS[task.status]}</span>
          </span>
        </div>
        <h3 className="font-semibold text-sm leading-tight mb-1 text-gray-600">{task.title}</h3>
        <div className="flex justify-between items-center mt-2">
          <div className="text-xs text-gray-400">{timeAgo(task.updated_at)}</div>
          <div className="flex gap-1">{actions}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Архив */}
      <div>
        <h2 className="text-lg sm:text-xl font-bold mb-3">🗄️ Архив ({archivedTasks.length})</h2>
        {archivedTasks.length === 0 ? (
          <div className="text-center py-10 text-gray-400 bg-white rounded-lg border">
            <div className="text-3xl mb-2">🗄️</div>
            <p className="text-sm">Архив пуст</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {archivedTasks.map(task => (
              <TaskCard key={task.id} task={task} actions={
                <button
                  onClick={() => unarchiveMutation.mutate(task.id)}
                  disabled={unarchiveMutation.isPending}
                  className="text-xs px-2 py-1 border rounded text-gray-600 hover:bg-gray-50 transition"
                >↩ Вернуть</button>
              } />
            ))}
          </div>
        )}
      </div>

      {/* Удалённые */}
      <div>
        <h2 className="text-base font-semibold mb-2 text-gray-500">🗑️ Удалённые ({deletedTasks.length})</h2>
        {deletedTasks.length === 0 ? (
          <div className="text-center py-6 text-gray-300 text-sm bg-white rounded-lg border">
            Нет удалённых задач
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {deletedTasks.map(task => (
              <TaskCard key={task.id} task={task} actions={
                <>
                  <button
                    onClick={() => restoreMutation.mutate(task.id)}
                    disabled={restoreMutation.isPending}
                    className="text-xs px-2 py-1 border rounded text-blue-600 hover:bg-blue-50 transition"
                  >↩ Вернуть</button>
                </>
              } />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Digest Page
function DigestPage() {
  const { data, isLoading, dataUpdatedAt } = useQuery<any>({
    queryKey: ['digest'],
    queryFn: async () => (await axios.get(`${API_URL}/api/digest`)).data,
    refetchInterval: 30000,
    staleTime: 20000,
  });

  if (isLoading) return <div className="text-center py-12 text-gray-400">Загрузка...</div>;
  if (!data) return null;

  const { stats, projects, top_performers } = data;
  const total = stats.total || 1;
  const maxCompleted = top_performers.length > 0
    ? Math.max(...top_performers.map((p: any) => p.completed), 1)
    : 1;

  const statusBars = [
    { label: 'TODO', value: stats.todo, color: 'bg-gray-400', text: 'text-gray-700' },
    { label: 'В работе', value: stats.doing, color: 'bg-blue-500', text: 'text-blue-700' },
    { label: 'Готово', value: stats.done, color: 'bg-green-500', text: 'text-green-700' },
    { label: 'Блок', value: stats.blocked, color: 'bg-red-500', text: 'text-red-700' },
  ];

  function fmtDays(days: number | null | undefined): string {
    if (days == null) return '—';
    if (days < 1) return '< 1 дн.';
    return `${days} дн.`;
  }

  const updatedStr = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg sm:text-xl font-bold">📊 Дайджест</h2>
        {updatedStr && <span className="text-xs text-gray-400">Обновлено {updatedStr}</span>}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {statusBars.map(s => (
          <div key={s.label} className="bg-white rounded-lg border p-3">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className={`text-xs font-medium ${s.text}`}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Дедлайны */}
      {(stats.overdue > 0 || stats.due_soon > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {stats.overdue > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
              <div className="text-xs font-medium text-red-500">🔥 Просрочено</div>
            </div>
          )}
          {stats.due_soon > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="text-2xl font-bold text-orange-600">{stats.due_soon}</div>
              <div className="text-xs font-medium text-orange-500">⏰ Скоро дедлайн</div>
            </div>
          )}
        </div>
      )}
      {stats.avg_completion_days != null && (
        <div className="text-sm text-gray-500">⏱ Среднее время выполнения: <span className="font-medium text-gray-700">{fmtDays(stats.avg_completion_days)}</span></div>
      )}

      {/* Status bar chart */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold mb-3 text-gray-700">Распределение по статусам</h3>
        <div className="space-y-2">
          {statusBars.map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <div className="w-16 text-xs text-gray-500 text-right shrink-0">{s.label}</div>
              <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${s.color}`}
                  style={{ width: `${Math.round(s.value / total * 100)}%` }}
                />
              </div>
              <div className="w-8 text-xs text-gray-500 shrink-0">{s.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-right text-xs text-gray-400">Всего задач: {stats.total}</div>
      </div>

      {/* Projects */}
      {projects.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-3 text-gray-700">Выполнение по проектам</h3>
          <div className="space-y-3">
            {projects.map((proj: any) => {
              const pct = proj.total > 0 ? Math.round(proj.done / proj.total * 100) : 0;
              return (
                <div key={proj.id ?? 'no-proj'}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm">{proj.emoji} {proj.name}</span>
                    <span className="text-xs text-gray-500">
                      {proj.done}/{proj.total} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-green-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-400">
                    {proj.doing > 0 && <span className="text-blue-500">🔄 {proj.doing}</span>}
                    {proj.todo > 0 && <span>📝 {proj.todo}</span>}
                    {proj.blocked > 0 && <span className="text-red-500">⚠️ {proj.blocked}</span>}
                    {proj.overdue > 0 && <span className="text-red-600 font-medium">🔥 {proj.overdue} просроч.</span>}
                    {proj.due_soon > 0 && <span className="text-orange-500">⏰ {proj.due_soon} скоро</span>}
                    {proj.avg_completion_days != null && <span className="text-gray-400">⏱ {fmtDays(proj.avg_completion_days)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top performers */}
      {top_performers.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-3 text-gray-700">👥 Топ исполнителей</h3>
          <div className="space-y-2">
            {top_performers.map((p: any, i: number) => {
              const barPct = Math.round(p.completed / maxCompleted * 100);
              const donePct = p.total > 0 ? Math.round(p.completed / p.total * 100) : 0;
              const onTimePct = p.with_deadline > 0 ? Math.round(p.on_time / p.with_deadline * 100) : null;
              const rateColor = donePct >= 80
                ? 'bg-green-100 text-green-700'
                : donePct >= 50
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-red-100 text-red-600';
              return (
                <div key={p.name} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-5 text-xs text-gray-400 shrink-0 text-center">{i + 1}</div>
                    <div className="w-24 sm:w-32 text-sm truncate shrink-0">{p.name}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-400 transition-all duration-500"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 shrink-0 w-8 text-right">{p.completed}/{p.total}</div>
                    <div className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 w-12 text-center ${rateColor}`}>
                      {donePct}%
                    </div>
                  </div>
                  {(onTimePct !== null || p.avg_days != null) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pl-7">
                      {onTimePct !== null && (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs text-gray-400 shrink-0">📅 вовремя:</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${onTimePct >= 80 ? 'bg-green-400' : onTimePct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                              style={{ width: `${onTimePct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 shrink-0">{p.on_time}/{p.with_deadline} ({onTimePct}%)</span>
                        </div>
                      )}
                      {p.avg_days != null && (
                        <span className="text-xs text-gray-400 shrink-0">⏱ среднее: {fmtDays(p.avg_days)}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Task Modal
function TaskModal({ task, onClose, tasks, users, projects, changeStatusMutation, assignMutation, assignProjectMutation, updateTaskMutation, setConfirmDelete, invalidate, createSubtaskMutation }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [dueDate, setDueDate] = useState(toDateInputValue(task.due_date));
  const [descTab, setDescTab] = useState<'write' | 'preview'>('write');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskDesc, setNewSubtaskDesc] = useState('');
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const [subtaskMode, setSubtaskMode] = useState<'create' | 'attach'>('create');
  const [attachTaskId, setAttachTaskId] = useState('');
  const dueStatusView = getDueStatus(task.due_date, task.status);

  // Build children from flat tasks list (supports any depth)
  const directChildren = (tasks || []).filter((t: any) => t.parent_task_id === task.id);

  // All descendant IDs (to prevent cycles in parent selector)
  const getDescendantIds = (id: number): Set<number> => {
    const ids = new Set<number>();
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift()!;
      ids.add(cur);
      (tasks || []).filter((t: any) => t.parent_task_id === cur).forEach((t: any) => queue.push(t.id));
    }
    return ids;
  };
  const excludedIds = getDescendantIds(task.id);

  React.useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setDueDate(toDateInputValue(task.due_date));
  }, [task]);

  const handleSave = () => {
    const data: any = { title, description };
    data.due_date = dueDate || null;
    updateTaskMutation.mutate(
      { id: task.id, data },
      { onSuccess: () => setIsEditing(false) }
    );
  };

  return (
    <Modal onClose={onClose}>
      <div className="mb-4">
        <span className={`inline-block px-2 py-1 rounded-full text-xs border mb-2 ${STATUS_COLOR[task.status]}`}>
          {STATUS_EMOJI[task.status]} {STATUS_LABELS[task.status]}
        </span>

        {isEditing ? (
          <div className="space-y-2 mb-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave(); } }}
              className="w-full px-3 py-2 border rounded-lg font-bold text-sm sm:text-base"
            />
            <div className="border rounded-lg overflow-hidden">
              <div className="flex border-b bg-gray-50">
                <button type="button" onClick={() => setDescTab('write')}
                  className={`px-3 py-1.5 text-xs font-medium transition ${descTab === 'write' ? 'bg-white text-gray-800 border-r' : 'text-gray-500 hover:text-gray-700'}`}
                >✏️ Редактор</button>
                <button type="button" onClick={() => setDescTab('preview')}
                  className={`px-3 py-1.5 text-xs font-medium transition ${descTab === 'preview' ? 'bg-white text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >👁 Просмотр</button>
              </div>
              {descTab === 'write' ? (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border-0 text-sm focus:outline-none"
                  rows={4}
                  placeholder="Описание (поддерживается Markdown)"
                />
              ) : (
                <div className="px-3 py-2 min-h-[96px]">
                  {description ? <MarkdownContent content={description} /> : <span className="text-gray-400 text-xs">Нет описания</span>}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400">**жирный**, *курсив*, `код`, - список</p>
            <div>
              <label className="text-xs text-gray-500 block mb-1">📅 Дедлайн</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="px-3 py-1.5 border rounded-lg text-sm w-full"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
              >Сохранить</button>
              <button
                onClick={() => {
                  setTitle(task.title);
                  setDescription(task.description || '');
                  setDueDate(toDateInputValue(task.due_date));
                  setIsEditing(false);
                }}
                className="px-3 py-1 bg-gray-200 rounded text-sm"
              >Отмена</button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-lg sm:text-xl font-bold">#{task.id} {task.title}</h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs text-blue-600 hover:underline"
              >Редактировать</button>
              <span className="text-xs text-gray-400">Создана {formatDatetime(task.created_at)}</span>
              {task.started_at && (
                <span className="text-xs text-blue-400">▶ {formatDatetime(task.started_at)}</span>
              )}
              {task.completed_at && (
                <span className="text-xs text-green-500">✓ {formatDatetime(task.completed_at)}</span>
              )}
              {task.due_date && (
                dueStatusView ? (
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${DUE_BADGE[dueStatusView]}`}>
                    📅 {dueStatusView === 'overdue' ? 'Просрочено · ' : dueStatusView === 'today' ? 'Сегодня · ' : ''}{formatDueDate(task.due_date)}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">📅 {formatDueDate(task.due_date)}</span>
                )
              )}
            </div>
            {task.description && <MarkdownContent content={task.description} className="mt-2" />}
            {/* Дедлайн в режиме просмотра */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-400">📅 Дедлайн:</span>
              {task.due_date ? (
                dueStatusView ? (
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${DUE_BADGE[dueStatusView]}`}>
                    {dueStatusView === 'overdue' ? 'Просрочено · ' : dueStatusView === 'today' ? 'Сегодня · ' : ''}{formatDueDate(task.due_date)}
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">{formatDueDate(task.due_date)}</span>
                )
              ) : (
                <button onClick={() => setIsEditing(true)} className="text-xs text-gray-400 hover:text-blue-600 hover:underline">
                  не задан
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="space-y-2 mb-4">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Проект</label>
            <select
              key={`project-${task.project_id || 'none'}`}
              value={task.project_id || ''}
              onChange={(e) => {
                const projectId = e.target.value ? Number(e.target.value) : null;
                assignProjectMutation.mutate({ taskId: task.id, projectId });
              }}
              className="w-full px-2 py-1.5 border rounded-lg text-xs"
            >
              <option value="">Без проекта</option>
              {projects.map((p: any) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Исполнитель</label>
            <select
              value={task.assignee?.telegram_id || ''}
              onChange={(e) => {
                const userId = e.target.value ? Number(e.target.value) : null;
                assignMutation.mutate({ taskId: task.id, userId });
              }}
              className="w-full px-2 py-1.5 border rounded-lg text-xs"
            >
              <option value="">Не назначено</option>
              {users.map((u: any) => <option key={u.telegram_id} value={u.telegram_id}>{u.display_name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Родительская задача</label>
          <select
            key={`parent-${task.parent_task_id || 'none'}`}
            value={task.parent_task_id || ''}
            onChange={(e) => {
              const parentId = e.target.value ? Number(e.target.value) : null;
              updateTaskMutation.mutate({ id: task.id, data: { parent_task_id: parentId } });
            }}
            className="w-full px-2 py-1.5 border rounded-lg text-xs"
          >
            <option value="">Без родителя</option>
            {(tasks || []).filter((t: any) => !excludedIds.has(t.id)).map((t: any) => (
              <option key={t.id} value={t.id}>#{t.id} {t.title}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Приоритет</label>
          <div className="flex gap-1.5">
            {Object.entries(PRIORITY_LABELS).map(([p, label]) => (
              <button
                key={p}
                onClick={() => updateTaskMutation.mutate({ id: task.id, data: { priority: p } })}
                className={`flex-1 py-1.5 rounded text-xs font-medium border transition ${
                  (task.priority || 'NORMAL') === p ? `${PRIORITY_COLOR[p]} font-bold` : 'bg-white hover:bg-gray-50'
                }`}
                title={label}
              >
                {PRIORITY_EMOJI[p]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Статус</label>
          <div className="flex gap-1.5">
            {Object.entries(STATUS_LABELS).map(([status, label]) => (
              <button
                key={status}
                onClick={() => changeStatusMutation.mutate({ taskId: task.id, status })}
                className={`flex-1 py-1.5 rounded text-xs font-medium border transition ${
                  task.status === status ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'
                }`}
                title={label}
              >
                {STATUS_EMOJI[status]} <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Subtasks section */}
      <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium">Подзадачи {directChildren.length ? `(${directChildren.length})` : ''}</span>
            <button
              onClick={() => setShowSubtaskInput(v => !v)}
              className="text-xs text-blue-600 hover:underline"
            >+ Добавить</button>
          </div>

          {showSubtaskInput && (
            <div className="mb-2 p-2 bg-gray-50 rounded-lg border">
              <div className="flex gap-1 mb-2">
                <button
                  onClick={() => setSubtaskMode('create')}
                  className={`flex-1 py-1 rounded text-xs font-medium border transition ${subtaskMode === 'create' ? 'bg-white border-blue-300 text-blue-700' : 'bg-transparent border-transparent text-gray-500 hover:text-gray-700'}`}
                >+ Новая</button>
                <button
                  onClick={() => setSubtaskMode('attach')}
                  className={`flex-1 py-1 rounded text-xs font-medium border transition ${subtaskMode === 'attach' ? 'bg-white border-blue-300 text-blue-700' : 'bg-transparent border-transparent text-gray-500 hover:text-gray-700'}`}
                >↗ Привязать</button>
              </div>

              {subtaskMode === 'create' ? (
                <div className="space-y-1.5">
                  <input
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setShowSubtaskInput(false); setNewSubtaskTitle(''); setNewSubtaskDesc(''); } }}
                    placeholder="Название подзадачи"
                    className="w-full px-2 py-1.5 border rounded text-sm bg-white"
                    autoFocus
                  />
                  <textarea
                    value={newSubtaskDesc}
                    onChange={(e) => setNewSubtaskDesc(e.target.value)}
                    placeholder="Описание (необязательно)"
                    className="w-full px-2 py-1.5 border rounded text-sm bg-white resize-none"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (newSubtaskTitle.trim()) {
                          createSubtaskMutation.mutate(
                            { parentId: task.id, title: newSubtaskTitle.trim(), description: newSubtaskDesc || undefined },
                            { onSuccess: () => { setNewSubtaskTitle(''); setNewSubtaskDesc(''); setShowSubtaskInput(false); } }
                          );
                        }
                      }}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
                    >Создать</button>
                    <button
                      onClick={() => { setShowSubtaskInput(false); setNewSubtaskTitle(''); setNewSubtaskDesc(''); }}
                      className="px-3 py-1 bg-gray-200 rounded text-sm"
                    >Отмена</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <select
                    value={attachTaskId}
                    onChange={(e) => setAttachTaskId(e.target.value)}
                    className="w-full px-2 py-1.5 border rounded text-sm bg-white"
                    autoFocus
                  >
                    <option value="">Выбрать задачу...</option>
                    {(tasks || []).filter((t: any) => !excludedIds.has(t.id) && t.parent_task_id !== task.id).map((t: any) => (
                      <option key={t.id} value={t.id}>#{t.id} {t.title}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (attachTaskId) {
                          updateTaskMutation.mutate(
                            { id: Number(attachTaskId), data: { parent_task_id: task.id } },
                            { onSuccess: () => { setAttachTaskId(''); setShowSubtaskInput(false); } }
                          );
                        }
                      }}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
                    >Привязать</button>
                    <button
                      onClick={() => { setShowSubtaskInput(false); setAttachTaskId(''); }}
                      className="px-3 py-1 bg-gray-200 rounded text-sm"
                    >Отмена</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {directChildren.length > 0 ? (
            <div className="space-y-1">
              {directChildren.map((sub: any) => (
                <div key={sub.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={sub.status === 'DONE'}
                    onChange={() => {
                      const newStatus = sub.status === 'DONE' ? 'TODO' : 'DONE';
                      changeStatusMutation.mutate({ taskId: sub.id, status: newStatus });
                    }}
                    className="rounded shrink-0"
                  />
                  <span
                    title={sub.title}
                    className={`text-sm flex-1 truncate ${sub.status === 'DONE' ? 'line-through text-gray-400' : ''}`}
                  >
                    {sub.title}
                  </span>
                  {sub.assignee && (
                    <span className="text-xs text-gray-400 shrink-0">{sub.assignee.display_name}</span>
                  )}
                  <span className={`text-xs px-1 py-0.5 rounded border shrink-0 ${STATUS_COLOR[sub.status]}`}>
                    {STATUS_EMOJI[sub.status]}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            !showSubtaskInput && <p className="text-xs text-gray-400">Нет подзадач</p>
          )}
        </div>

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Закрыть</button>
        <button
          onClick={() => {
            axios.post(`${API_URL}/api/tasks/${task.id}/archive`).then(() => {
              invalidate();
              onClose();
            });
          }}
          className="px-3 py-2 bg-gray-100 text-gray-600 border border-gray-200 rounded-lg text-sm hover:bg-gray-200 transition"
          title="Архивировать"
        >🗄️</button>
        <button
          onClick={() => setConfirmDelete({ type: 'task', id: task.id })}
          className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition"
          title="Удалить"
        >🗑️</button>
      </div>
    </Modal>
  );
}

// Project Modal
function ProjectModal({ project, onClose, updateProjectMutation, setConfirmDelete }: any) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [emoji, setEmoji] = useState(project.emoji || '📁');
  const [descTab, setDescTab] = useState<'write' | 'preview'>('write');

  const handleSave = () => {
    if (name.trim()) {
      updateProjectMutation.mutate({ id: project.id, data: { name, description, emoji } });
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg sm:text-xl font-bold mb-4">Редактировать</h2>
      <div className="space-y-3 mb-4">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="Emoji"
          className="w-16 px-2 py-2 border rounded-lg text-center text-2xl"
          maxLength={2}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave(); } }}
          placeholder="Название"
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
        <div className="border rounded-lg overflow-hidden">
          <div className="flex border-b bg-gray-50">
            <button type="button" onClick={() => setDescTab('write')}
              className={`px-3 py-1.5 text-xs font-medium transition ${descTab === 'write' ? 'bg-white text-gray-800 border-r' : 'text-gray-500 hover:text-gray-700'}`}
            >✏️ Редактор</button>
            <button type="button" onClick={() => setDescTab('preview')}
              className={`px-3 py-1.5 text-xs font-medium transition ${descTab === 'preview' ? 'bg-white text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
            >👁 Просмотр</button>
          </div>
          {descTab === 'write' ? (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Описание (поддерживается Markdown)"
              className="w-full px-3 py-2 border-0 text-sm focus:outline-none"
              rows={3}
            />
          ) : (
            <div className="px-3 py-2 min-h-[72px]">
              {description ? <MarkdownContent content={description} /> : <span className="text-gray-400 text-xs">Нет описания</span>}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400">**жирный**, *курсив*, `код`, - список</p>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button
          onClick={handleSave}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >Сохранить</button>
        <button
          onClick={() => setConfirmDelete({ type: 'project', id: project.id })}
          className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm"
        >🗑️</button>
      </div>
    </Modal>
  );
}

// Meeting Modal
function MeetingModal({ meeting, onClose, updateMeetingMutation, setConfirmDelete }: any) {
  const [summary, setSummary] = useState(meeting.summary);

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg sm:text-xl font-bold mb-3">Редактировать встречу</h2>
      <div className="text-xs text-gray-500 mb-3">
        {new Date(meeting.meeting_date).toLocaleDateString('ru', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg mb-4 text-sm"
        rows={6}
      />
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button
          onClick={() => updateMeetingMutation.mutate({ id: meeting.id, data: { summary } })}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >Сохранить</button>
        <button
          onClick={() => setConfirmDelete({ type: 'meeting', id: meeting.id })}
          className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm"
        >🗑️</button>
      </div>
    </Modal>
  );
}

// New Task Modal
function NewTaskModal({ onClose, projects, tasks, createTaskMutation, initialProjectId, initialParentTaskId }: any) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(initialProjectId ? String(initialProjectId) : '');
  const [parentTaskId, setParentTaskId] = useState(initialParentTaskId ? String(initialParentTaskId) : '');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const descRef = React.useRef<HTMLTextAreaElement>(null);
  const submittingRef = React.useRef(false);

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg sm:text-xl font-bold mb-4">Новая задача</h2>
      <div className="space-y-3 mb-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); descRef.current?.focus(); } }}
          placeholder="Название"
          className="w-full px-3 py-2 border rounded-lg text-sm"
          autoFocus
        />
        <div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание (поддерживается Markdown)"
            className="w-full px-3 py-2 border rounded-lg text-sm"
            rows={3}
            ref={descRef}
          />
          <p className="text-xs text-gray-400 mt-0.5">**жирный**, *курсив*, `код`, - список</p>
        </div>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">Без проекта</option>
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
        </select>
        <select
          value={parentTaskId}
          onChange={(e) => setParentTaskId(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">Без родительской задачи</option>
          {(tasks || []).map((t: any) => (
            <option key={t.id} value={t.id}>#{t.id} {t.title}</option>
          ))}
        </select>
        <div>
          <label className="text-xs text-gray-500 block mb-1">📅 Дедлайн <span className="text-gray-400">(необязательно)</span></label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-2">Приоритет</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(PRIORITY_LABELS).map(([p, label]) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`px-2 py-2 rounded-lg text-xs font-medium border transition ${
                  priority === p ? `${PRIORITY_COLOR[p]} font-bold` : 'bg-white hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button
          onClick={() => {
            if (title.trim() && !submittingRef.current) {
              submittingRef.current = true;
              createTaskMutation.mutate({
                title,
                description,
                project_id: projectId ? Number(projectId) : undefined,
                due_date: dueDate || undefined,
                priority,
                parent_task_id: parentTaskId ? Number(parentTaskId) : undefined,
              });
            }
          }}
          disabled={createTaskMutation.isPending}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
        >{createTaskMutation.isPending ? '...' : 'Создать'}</button>
      </div>
    </Modal>
  );
}

// New Project Modal
function NewProjectModal({ onClose, createProjectMutation }: any) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('📁');

  const handleCreate = () => {
    if (name.trim()) {
      createProjectMutation.mutate({ name, description, emoji });
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg sm:text-xl font-bold mb-4">Новый проект</h2>
      <div className="space-y-3 mb-4">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="Emoji"
          className="w-16 px-2 py-2 border rounded-lg text-center text-2xl"
          maxLength={2}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
          placeholder="Название"
          className="w-full px-3 py-2 border rounded-lg text-sm"
          autoFocus
        />
        <div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание (поддерживается Markdown)"
            className="w-full px-3 py-2 border rounded-lg text-sm"
            rows={2}
          />
          <p className="text-xs text-gray-400 mt-0.5">**жирный**, *курсив*, `код`, - список</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button
          onClick={handleCreate}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >Создать</button>
      </div>
    </Modal>
  );
}

// New Meeting Modal
function NewMeetingModal({ onClose, createMeetingMutation }: any) {
  const [summary, setSummary] = useState('');

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg sm:text-xl font-bold mb-4">Новая встреча</h2>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Итоги встречи..."
        className="w-full px-3 py-2 border rounded-lg mb-4 text-sm"
        rows={6}
        autoFocus
      />
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button
          onClick={() => {
            if (summary.trim()) {
              createMeetingMutation.mutate({ summary });
            }
          }}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >Сохранить</button>
      </div>
    </Modal>
  );
}

// Confirm Delete Modal
function ConfirmDeleteModal({ confirm, onClose, deleteTaskMutation, deleteProjectMutation, deleteMeetingMutation }: any) {
  const labels: Record<string, string> = {
    task: 'задачу',
    project: 'проект',
    meeting: 'встречу',
  };

  const handleDelete = () => {
    if (confirm.type === 'task') deleteTaskMutation.mutate(confirm.id);
    if (confirm.type === 'project') deleteProjectMutation.mutate(confirm.id);
    if (confirm.type === 'meeting') deleteMeetingMutation.mutate(confirm.id);
  };


  return (
    <Modal onClose={onClose}>
      <h2 className="text-base sm:text-lg font-bold mb-4">Подтвердите удаление</h2>
      <p className="text-sm text-gray-600 mb-6">
        Вы действительно хотите удалить {labels[confirm.type]}?
      </p>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button
          onClick={handleDelete}
          className="flex-1 py-2 bg-red-500 text-white rounded-lg font-medium text-sm"
        >Удалить</button>
      </div>
    </Modal>
  );
}

// Base Modal Component
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  // Блокируем прокрутку body при открытии модалки
  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  // ESC закрывает модалку
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
