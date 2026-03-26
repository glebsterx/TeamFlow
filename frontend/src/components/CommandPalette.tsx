import React, { useState, useEffect, useRef } from 'react';
import type { Task, Project } from '../types/dashboard';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  projects: Project[];
  onOpenTask: (task: Task) => void;
  onOpenProject: (project: Project) => void;
  onNewTask: () => void;
  onNavigate: (page: string) => void;
}

type Command = {
  id: string;
  label: string;
  icon: string;
  action: () => void;
  category: 'navigation' | 'task' | 'project' | 'action';
};

export default function CommandPalette({
  isOpen,
  onClose,
  tasks,
  projects,
  onOpenTask,
  onOpenProject,
  onNewTask,
  onNavigate,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const commands: Command[] = [
    { id: 'new-task', label: 'Создать задачу', icon: '➕', action: () => { onNewTask(); onClose(); }, category: 'action' },
    { id: 'nav-tasks', label: 'Перейти к задачам', icon: '📋', action: () => { onNavigate('tasks'); onClose(); }, category: 'navigation' },
    { id: 'nav-projects', label: 'Перейти к проектам', icon: '📁', action: () => { onNavigate('projects'); onClose(); }, category: 'navigation' },
    { id: 'nav-sprints', label: 'Перейти к спринтам', icon: '🏃', action: () => { onNavigate('sprints'); onClose(); }, category: 'navigation' },
    { id: 'nav-meetings', label: 'Перейти к встречам', icon: '🤝', action: () => { onNavigate('meetings'); onClose(); }, category: 'navigation' },
    { id: 'nav-digest', label: 'Перейти к дайджесту', icon: '📊', action: () => { onNavigate('digest'); onClose(); }, category: 'navigation' },
    { id: 'nav-archive', label: 'Перейти к архиву', icon: '📦', action: () => { onNavigate('archive'); onClose(); }, category: 'navigation' },
    { id: 'nav-backlog', label: 'Перейти к бэклогу', icon: '📚', action: () => { onNavigate('backlog'); onClose(); }, category: 'navigation' },
    { id: 'nav-settings', label: 'Перейти к настройкам', icon: '⚙️', action: () => { onNavigate('settings'); onClose(); }, category: 'navigation' },
  ];

  const taskCommands: Command[] = tasks
    .filter(t => !t.deleted && !t.archived)
    .slice(0, 20)
    .map(t => ({
      id: `task-${t.id}`,
      label: `#${t.id} ${t.title}`,
      icon: '📝',
      action: () => { onOpenTask(t); onClose(); },
      category: 'task' as const,
    }));

  const projectCommands: Command[] = projects
    .filter(p => !p.deleted)
    .map(p => ({
      id: `project-${p.id}`,
      label: `${p.emoji || '📁'} ${p.name}`,
      icon: p.emoji || '📁',
      action: () => { onOpenProject(p); onClose(); },
      category: 'project' as const,
    }));

  const allCommands = [...commands, ...taskCommands, ...projectCommands];

  const filteredCommands = query.trim()
    ? allCommands.filter(cmd =>
        cmd.label.toLowerCase().includes(query.toLowerCase())
      )
    : allCommands.slice(0, 15);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % filteredCommands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center pt-20" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-2xl mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Поиск команд, задач, проектов..."
            className="w-full px-4 py-2 text-lg border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="max-h-96 overflow-y-auto">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Ничего не найдено</div>
          ) : (
            filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                onClick={cmd.action}
                className={`w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-gray-50 transition ${
                  idx === selectedIndex ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                }`}
              >
                <span className="text-2xl">{cmd.icon}</span>
                <span className="flex-1 truncate">{cmd.label}</span>
                <span className="text-xs text-gray-400 uppercase">{cmd.category}</span>
              </button>
            ))
          )}
        </div>

        <div className="p-3 border-t bg-gray-50 text-xs text-gray-500 flex gap-4">
          <span>↑↓ навигация</span>
          <span>Enter выбрать</span>
          <span>Esc закрыть</span>
        </div>
      </div>
    </div>
  );
}
