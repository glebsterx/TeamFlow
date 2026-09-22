import axios from 'axios';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from '../src/pages/Dashboard';

// #357 — Dashboard had no tests at all. A full interaction suite isn't
// practical here (it wires ~10 react-query calls and a dozen sub-pages),
// so this covers the two things most likely to regress silently: the app
// shell renders with real data without crashing, and the task-view switcher
// (cards/list/kanban/...) persists the choice to localStorage (FIX-27 split
// the views into separate components — this is the integration point that
// glues them back to Dashboard).

function routeFor(url: string, data: any) {
  if (url.includes('/api/tasks')) return { data: [] };
  if (url.includes('/api/backlog')) return { data: [] };
  if (url.includes('/api/stats')) return { data: data.stats };
  if (url.includes('/api/users')) return { data: [] };
  if (url.includes('/api/tags')) return { data: [] };
  if (url.includes('/api/projects')) return { data: [] };
  if (url.includes('/api/meetings')) return { data: [] };
  if (url.includes('/api/settings/system')) return { data: {} };
  if (url.includes('/api/auth/account/me')) return { data: null };
  return { data: null };
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    (axios.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) =>
      Promise.resolve(routeFor(url, { stats: { total: 0, done: 0, doing: 0, todo: 0 } }))
    );
    (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === 'access_token') return 'token';
      if (key === 'teamflow_account_id') return '1';
      return null;
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the task board shell without crashing', async () => {
    renderDashboard();

    expect(await screen.findByText('+ Задача')).toBeInTheDocument();
  });

  it('switching the task view persists the choice to localStorage', async () => {
    renderDashboard();
    await screen.findByText('+ Задача');

    fireEvent.click(screen.getByTitle('Список'));

    await waitFor(() => {
      expect(window.localStorage.setItem).toHaveBeenCalledWith('tf_task_view', 'list');
    });
  });
});
