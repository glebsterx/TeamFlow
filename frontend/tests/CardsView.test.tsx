import type React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CardsView from '../src/components/CardsView';
import type { Task } from '../src/types/dashboard';

// #355 — task card rendering was untested (TaskCard/Modal statuses were
// falsely marked DONE, see TASKS.md #344). Covers: card click opens the
// task, the bulk-select checkbox doesn't also open it, and the "take task"
// vs "start task" branch of the TODO quick-action button.

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'Написать тесты',
    status: 'TODO',
    priority: 'NORMAL',
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

function renderCards(tasks: Task[], overrides: Partial<React.ComponentProps<typeof CardsView>> = {}) {
  const setSelectedTask = vi.fn();
  const toggleBulk = vi.fn();
  const takeTaskMutation = { mutate: vi.fn() };
  const changeStatusMutation = { mutate: vi.fn() };
  render(
    <CardsView
      sortedTasks={tasks}
      tasks={tasks}
      projects={[]}
      ancestorBlockedIds={new Set()}
      bulkSelected={new Set()}
      toggleBulk={toggleBulk}
      setSelectedTask={setSelectedTask}
      myAccountId={7}
      takeTaskMutation={takeTaskMutation}
      changeStatusMutation={changeStatusMutation}
      invalidate={vi.fn()}
      {...overrides}
    />
  );
  return { setSelectedTask, toggleBulk, takeTaskMutation, changeStatusMutation };
}

describe('CardsView', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders task title and opens the task on card click', () => {
    const task = makeTask();
    const { setSelectedTask } = renderCards([task]);

    expect(screen.getByText('Написать тесты')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Написать тесты'));

    expect(setSelectedTask).toHaveBeenCalledWith(task);
  });

  it('toggling the bulk-select checkbox does not also open the task', () => {
    const task = makeTask();
    const { setSelectedTask, toggleBulk } = renderCards([task]);

    fireEvent.click(screen.getByRole('checkbox'));

    expect(toggleBulk).toHaveBeenCalledWith(task.id);
    expect(setSelectedTask).not.toHaveBeenCalled();
  });

  it('unassigned TODO task: quick-action button takes the task instead of just starting it', () => {
    const task = makeTask({ status: 'TODO' });
    const { takeTaskMutation, changeStatusMutation } = renderCards([task]);

    fireEvent.click(screen.getByText('🙋 Взять'));

    expect(takeTaskMutation.mutate).toHaveBeenCalledWith({ taskId: task.id, subtaskIds: [] });
    expect(changeStatusMutation.mutate).not.toHaveBeenCalled();
  });

  it('already-assigned TODO task: quick-action button just moves it to DOING', () => {
    const task = makeTask({
      status: 'TODO',
      assignee: { id: 7, display_name: 'Нео' } as any,
    });
    const { takeTaskMutation, changeStatusMutation } = renderCards([task]);

    fireEvent.click(screen.getByText('▶ Начать'));

    expect(changeStatusMutation.mutate).toHaveBeenCalledWith({ taskId: task.id, status: 'DOING' });
    expect(takeTaskMutation.mutate).not.toHaveBeenCalled();
  });
});
