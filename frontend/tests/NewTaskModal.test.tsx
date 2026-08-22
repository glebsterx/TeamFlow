import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NewTaskModal from '../src/modals/NewTaskModal';

// #332/FIX-11 regression: closing the modal (backdrop click or Отмена) while
// the form has unsaved data must ask for confirmation before discarding it.
// A dead `handleClose` implementing this existed but was never wired to
// `onClose` — fixed by connecting it in both places.

function renderModal(onClose: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NewTaskModal
        onClose={onClose}
        onOpenTask={vi.fn()}
        projects={[]}
        tasks={[]}
        createTaskMutation={{ mutate: vi.fn(), isPending: false }}
      />
    </QueryClientProvider>
  );
}

describe('NewTaskModal — confirm before closing with unsaved data', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('closes immediately on backdrop click when the form is empty', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const onClose = vi.fn();
    const { container } = renderModal(onClose);

    fireEvent.click(container.firstChild as Element);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks for confirmation on backdrop click once a title is typed, and stays open if declined', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onClose = vi.fn();
    const { container } = renderModal(onClose);

    fireEvent.change(screen.getByPlaceholderText('Название задачи'), {
      target: { value: 'Новая задача' },
    });
    fireEvent.click(container.firstChild as Element);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes once the user confirms discarding unsaved data', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onClose = vi.fn();
    const { container } = renderModal(onClose);

    fireEvent.change(screen.getByPlaceholderText('Название задачи'), {
      target: { value: 'Новая задача' },
    });
    fireEvent.click(container.firstChild as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the "Отмена" button asks for confirmation the same way', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onClose = vi.fn();
    renderModal(onClose);

    fireEvent.change(screen.getByPlaceholderText('Название задачи'), {
      target: { value: 'Новая задача' },
    });
    fireEvent.click(screen.getByText('Отмена'));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
