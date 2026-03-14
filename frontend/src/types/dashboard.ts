export interface Assignee {
  telegram_id: number;
  display_name: string;
}

export interface SubTask {
  id: number;
  title: string;
  status: string;
  priority: string;
  assignee?: Assignee;
  due_date?: string;
  created_at: string;
}

export interface Blocker {
  id: number;
  text: string;
  created_at: string;
}

export interface Task {
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
  blockers?: Blocker[];
  backlog?: boolean;
  backlog_added_at?: string;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  emoji?: string;
  is_active: boolean;
}

export interface Meeting {
  id: number;
  summary: string;
  meeting_date: string;
}

export interface Stats {
  total: number;
  todo: number;
  doing: number;
  done: number;
  blocked: number;
  on_hold?: number;
  archived?: number;
  deleted?: number;
}

export interface TelegramUser {
  telegram_id: number;
  display_name: string;
  first_name: string;
}
