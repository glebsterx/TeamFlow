import React from 'react';
import { Task, TaskStatus, TaskPriority } from '../../types/task';
import { format } from 'date-fns';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
}

const statusColors = {
  [TaskStatus.TODO]: 'bg-gray-100 text-gray-800',
  [TaskStatus.IN_PROGRESS]: 'bg-blue-100 text-blue-800',
  [TaskStatus.DONE]: 'bg-green-100 text-green-800',
};

const priorityColors = {
  [TaskPriority.LOW]: 'bg-gray-200 text-gray-700',
  [TaskPriority.MEDIUM]: 'bg-yellow-200 text-yellow-800',
  [TaskPriority.HIGH]: 'bg-orange-200 text-orange-800',
  [TaskPriority.URGENT]: 'bg-red-200 text-red-800',
};

export const TaskCard: React.FC<TaskCardProps> = ({ task, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer border border-gray-200"
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-lg font-semibold text-gray-900">{task.title}</h3>
        <span className={`px-2 py-1 rounded text-xs font-medium ${priorityColors[task.priority]}`}>
          {task.priority.toUpperCase()}
        </span>
      </div>
      
      {task.description && (
        <p className="text-gray-600 text-sm mb-3 line-clamp-2">{task.description}</p>
      )}
      
      <div className="flex items-center justify-between">
        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[task.status]}`}>
          {task.status.replace('_', ' ').toUpperCase()}
        </span>
        
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {task.assignee && (
            <span className="bg-primary-100 text-primary-800 px-2 py-1 rounded text-xs">
              {task.assignee.username}
            </span>
          )}
          {task.due_date && (
            <span>{format(new Date(task.due_date), 'MMM d')}</span>
          )}
        </div>
      </div>
    </div>
  );
};
