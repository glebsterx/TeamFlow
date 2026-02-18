import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8180';

interface Assignee {
  telegram_id: number;
  display_name: string;
}

interface Task {
  id: number;
  title: string;
  description?: string;
  status: string;
  assignee?: Assignee;
  project_id?: number;
  created_at: string;
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

const STATUS_EMOJI: Record<string, string> = {
  TODO: '📝', DOING: '🔄', DONE: '✅', BLOCKED: '🚫',
};

const STATUS_LABELS: Record<string, string> = {
  TODO: 'TODO',
  DOING: 'В работе',
  DONE: 'Готово',
  BLOCKED: 'Блок',
};

export default function Dashboard() {
  const [currentPage, setCurrentPage] = useState<'tasks' | 'projects' | 'meetings'>('tasks');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<number | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<number | null>(null);
  
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  
  const [showNewTask, setShowNewTask] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{type: string; id: number} | null>(null);

  const queryClient = useQueryClient();

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', statusFilter],
    queryFn: async () => {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      const res = await axios.get(`${API_URL}/api/tasks`, { params });
      return res.data;
    },
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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['meetings'] });
  };

  const changeStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: string }) => {
      await axios.post(`${API_URL}/api/tasks/${taskId}/status`, { status });
    },
    onSuccess: invalidate,
  });

  const assignMutation = useMutation({
    mutationFn: async ({ taskId, userId }: { taskId: number; userId: number | null }) => {
      await axios.post(`${API_URL}/api/tasks/${taskId}/assign`, { user_id: userId });
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
      const result: any = await queryClient.fetchQuery({ queryKey: ['tasks', statusFilter] });
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
    onSuccess: invalidate,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: { title: string; description?: string; project_id?: number }) => {
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
  if (projectFilter !== null) {
    filteredTasks = filteredTasks.filter(t => 
      projectFilter === 0 ? !t.project_id : t.project_id === projectFilter
    );
  }
  if (assigneeFilter !== null) {
    filteredTasks = filteredTasks.filter(t =>
      assigneeFilter === 0 ? !t.assignee : t.assignee?.telegram_id === assigneeFilter
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-6">

        {/* Header */}
        <header className="mb-3 sm:mb-4">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">TeamFlow</h1>
          <p className="text-gray-500 text-xs sm:text-sm mt-0.5">Управление задачами</p>
        </header>

        {/* Navigation */}
        <nav className="mb-3 sm:mb-4 border-b overflow-x-auto">
          <div className="flex space-x-1 min-w-max">
            {[
              { id: 'tasks', label: 'Задачи', icon: '📋' },
              { id: 'projects', label: 'Проекты', icon: '📁' },
              { id: 'meetings', label: 'Встречи', icon: '🤝' },
            ].map(page => (
              <button
                key={page.id}
                onClick={() => setCurrentPage(page.id as any)}
                className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition ${
                  currentPage === page.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500'
                }`}
              >
                {page.icon} <span className="hidden sm:inline">{page.label}</span>
              </button>
            ))}
          </div>
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
              <div className="flex gap-2 flex-1 overflow-x-auto">
                <select
                  value={projectFilter ?? ''}
                  onChange={(e) => setProjectFilter(e.target.value ? Number(e.target.value) : null)}
                  className="px-2 py-1.5 border rounded-lg text-xs sm:text-sm flex-shrink-0"
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
                  className="px-2 py-1.5 border rounded-lg text-xs sm:text-sm flex-shrink-0"
                >
                  <option value="">Все</option>
                  <option value="0">👤 Не назначено</option>
                  {users.map(u => (
                    <option key={u.telegram_id} value={u.telegram_id}>👤 {u.display_name}</option>
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
              {filteredTasks.map(task => {
                const proj = projects.find(p => p.id === task.project_id);
                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className="bg-white rounded-lg border p-3 sm:p-4 hover:shadow-md transition cursor-pointer"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs text-gray-400">#{task.id}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_COLOR[task.status]}`}>
                        {STATUS_EMOJI[task.status]} <span className="hidden sm:inline">{STATUS_LABELS[task.status]}</span>
                      </span>
                    </div>
                    <h3 className="font-semibold mb-2 text-sm leading-tight">{task.title}</h3>
                    {proj && (
                      <div className="text-xs bg-gray-50 px-2 py-1 rounded mb-2 inline-block">
                        {proj.emoji} {proj.name}
                      </div>
                    )}
                    {task.assignee && (
                      <div className="text-xs text-gray-500">👤 {task.assignee.display_name}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* PROJECTS PAGE */}
        {currentPage === 'projects' && (
          <>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg sm:text-xl font-bold">Проекты ({projects.length})</h2>
              <button
                onClick={() => setShowNewProject(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium"
              >+ Проект</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {projects.map(proj => (
                <div
                  key={proj.id}
                  onClick={() => setSelectedProject(proj)}
                  className="bg-white rounded-lg border p-4 hover:shadow-md transition cursor-pointer"
                >
                  <div className="text-3xl mb-2">{proj.emoji || '📁'}</div>
                  <h3 className="font-bold text-lg mb-1">{proj.name}</h3>
                  {proj.description && (
                    <p className="text-sm text-gray-600 line-clamp-2">{proj.description}</p>
                  )}
                  <div className="mt-2 text-xs text-gray-400">
                    {tasks.filter(t => t.project_id === proj.id).length} задач
                  </div>
                </div>
              ))}
            </div>
          </>
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
      </div>

      {/* MODALS */}
      {selectedTask && (
        <TaskModal 
          task={tasks.find(t => t.id === selectedTask.id) || selectedTask} 
          onClose={() => setSelectedTask(null)} 
          {...{ users, projects, changeStatusMutation, assignMutation, assignProjectMutation, updateTaskMutation, setConfirmDelete }} 
        />
      )}
      {selectedProject && <ProjectModal project={selectedProject} onClose={() => setSelectedProject(null)} {...{ updateProjectMutation, setConfirmDelete }} />}
      {selectedMeeting && <MeetingModal meeting={selectedMeeting} onClose={() => setSelectedMeeting(null)} {...{ updateMeetingMutation, setConfirmDelete }} />}
      {showNewTask && <NewTaskModal onClose={() => setShowNewTask(false)} {...{ projects, createTaskMutation }} />}
      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} {...{ createProjectMutation }} />}
      {showNewMeeting && <NewMeetingModal onClose={() => setShowNewMeeting(false)} {...{ createMeetingMutation }} />}
      {confirmDelete && <ConfirmDeleteModal confirm={confirmDelete} onClose={() => setConfirmDelete(null)} {...{ deleteTaskMutation, deleteProjectMutation, deleteMeetingMutation }} />}
    </div>
  );
}

// Task Modal
function TaskModal({ task, onClose, users, projects, changeStatusMutation, assignMutation, assignProjectMutation, updateTaskMutation, setConfirmDelete }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');

  // Сбрасываем форму при смене задачи
  React.useEffect(() => {
    console.log('TaskModal received task:', task);
    setTitle(task.title);
    setDescription(task.description || '');
  }, [task]);

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
              className="w-full px-3 py-2 border rounded-lg font-bold text-sm sm:text-base"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  updateTaskMutation.mutate(
                    { id: task.id, data: { title, description } },
                    { 
                      onSuccess: () => {
                        setIsEditing(false);
                      }
                    }
                  );
                }}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
              >Сохранить</button>
              <button
                onClick={() => {
                  setTitle(task.title);
                  setDescription(task.description || '');
                  setIsEditing(false);
                }}
                className="px-3 py-1 bg-gray-200 rounded text-sm"
              >Отмена</button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-lg sm:text-xl font-bold">#{task.id} {task.title}</h2>
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs text-blue-600 hover:underline mt-1"
            >Редактировать</button>
            {task.description && <p className="text-sm text-gray-600 mt-2">{task.description}</p>}
          </>
        )}
      </div>

      <div className="space-y-3 mb-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Проект</label>
          <select
            key={`project-${task.project_id || 'none'}`}
            value={task.project_id || ''}
            onChange={(e) => {
              const projectId = e.target.value ? Number(e.target.value) : null;
              console.log('Project change:', { taskId: task.id, projectId, value: e.target.value });
              
              assignProjectMutation.mutate(
                { taskId: task.id, projectId },
                {
                  onSuccess: () => {
                    console.log('Project assigned successfully');
                  },
                  onError: (error) => {
                    console.error('Project assignment failed:', error);
                  }
                }
              );
            }}
            className="w-full px-3 py-2 border rounded-lg text-sm"
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
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">Не назначено</option>
            {users.map((u: any) => <option key={u.telegram_id} value={u.telegram_id}>{u.display_name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-2">Статус</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(STATUS_LABELS).map(([status, label]) => (
              <button
                key={status}
                onClick={() => {
                  changeStatusMutation.mutate({ taskId: task.id, status });
                }}
                className={`px-2 py-2 rounded-lg text-xs sm:text-sm font-medium border transition ${
                  task.status === status ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'
                }`}
              >
                {STATUS_EMOJI[status]} {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Закрыть</button>
        <button
          onClick={() => setConfirmDelete({ type: 'task', id: task.id })}
          className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm"
        >Удалить</button>
      </div>
    </Modal>
  );
}

// Project Modal
function ProjectModal({ project, onClose, updateProjectMutation, setConfirmDelete }: any) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [emoji, setEmoji] = useState(project.emoji || '📁');

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
          placeholder="Название"
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание"
          className="w-full px-3 py-2 border rounded-lg text-sm"
          rows={3}
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button
          onClick={() => updateProjectMutation.mutate({ id: project.id, data: { name, description, emoji } })}
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
function NewTaskModal({ onClose, projects, createTaskMutation }: any) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg sm:text-xl font-bold mb-4">Новая задача</h2>
      <div className="space-y-3 mb-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название"
          className="w-full px-3 py-2 border rounded-lg text-sm"
          autoFocus
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание"
          className="w-full px-3 py-2 border rounded-lg text-sm"
          rows={3}
        />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">Без проекта</option>
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button
          onClick={() => {
            if (title.trim()) {
              createTaskMutation.mutate({ title, description, project_id: projectId ? Number(projectId) : undefined });
            }
          }}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >Создать</button>
      </div>
    </Modal>
  );
}

// New Project Modal
function NewProjectModal({ onClose, createProjectMutation }: any) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('📁');

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
          placeholder="Название"
          className="w-full px-3 py-2 border rounded-lg text-sm"
          autoFocus
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание"
          className="w-full px-3 py-2 border rounded-lg text-sm"
          rows={2}
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button
          onClick={() => {
            if (name.trim()) {
              createProjectMutation.mutate({ name, description, emoji });
            }
          }}
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
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
