import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { taskApi } from '../../api/tasks';
import { TaskCard } from '../../components/TaskCard/TaskCard';
import { Button } from '../../components/ui/Button';
import { TaskStatus } from '../../types/task';
import { useNavigate } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<TaskStatus | undefined>();

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', statusFilter],
    queryFn: () => taskApi.getTasks({ status: statusFilter }).then(res => res.data),
  });

  const handleCreateTask = () => {
    navigate('/tasks/new');
  };

  const handleTaskClick = (taskId: string) => {
    navigate(`/tasks/${taskId}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Tasks</h1>
        <Button onClick={handleCreateTask}>+ New Task</Button>
      </div>

      <div className="flex gap-2 mb-6">
        <Button
          variant={statusFilter === undefined ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setStatusFilter(undefined)}
        >
          All
        </Button>
        <Button
          variant={statusFilter === TaskStatus.TODO ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setStatusFilter(TaskStatus.TODO)}
        >
          To Do
        </Button>
        <Button
          variant={statusFilter === TaskStatus.IN_PROGRESS ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setStatusFilter(TaskStatus.IN_PROGRESS)}
        >
          In Progress
        </Button>
        <Button
          variant={statusFilter === TaskStatus.DONE ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setStatusFilter(TaskStatus.DONE)}
        >
          Done
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading tasks...</p>
        </div>
      ) : tasks && tasks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => handleTaskClick(task.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500 mb-4">No tasks found</p>
          <Button onClick={handleCreateTask}>Create your first task</Button>
        </div>
      )}
    </div>
  );
};
