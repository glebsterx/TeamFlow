import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Login } from '../src/pages/Login';
import { authApi } from '../src/api/auth';

// #356 — login form was untested. Covers: credential normalization on
// submit, token persistence + redirect on success, error display on
// failure, and the registration sub-form's client-side validation
// (password mismatch / too short) that guards against a wasted request.

vi.mock('../src/api/auth', () => ({
  authApi: { login: vi.fn() },
}));

function mockLocationHref() {
  const original = window.location;
  // jsdom throws "Not implemented: navigation" on real assignment;
  // replace location with a plain object so we can assert on it instead.
  // @ts-expect-error - deliberately overwriting a readonly global for the test
  delete window.location;
  // @ts-expect-error - partial Location stand-in; Login.tsx reads `hash` on
  // mount and assigns `href` on successful auth
  window.location = { href: '', hash: '' };
  return () => {
    window.location = original;
  };
}

describe('Login', () => {
  let restoreLocation: () => void;

  beforeEach(() => {
    restoreLocation = mockLocationHref();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    );
    (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    restoreLocation();
  });

  it('renders the login form', () => {
    const { container } = render(<Login />);
    expect(screen.getByText('Логин')).toBeInTheDocument();
    expect(screen.getByText('Пароль')).toBeInTheDocument();
    expect(container.querySelector('input[type="text"]')).toBeInTheDocument();
    expect(container.querySelector('input[type="password"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
  });

  it('normalizes the login (trim + lowercase), stores tokens and redirects on success', async () => {
    (authApi.login as ReturnType<typeof vi.fn>).mockResolvedValue({
      access_token: 'at',
      refresh_token: 'rt',
      user: { id: 42 },
    });
    const { container } = render(<Login />);

    fireEvent.change(container.querySelector('input[type="text"]')!, {
      target: { value: '  Neo@Example  ' },
    });
    fireEvent.change(container.querySelector('input[type="password"]')!, {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith({ login: 'neo@example', password: 'secret' });
    });
    expect(window.localStorage.setItem).toHaveBeenCalledWith('access_token', 'at');
    expect(window.localStorage.setItem).toHaveBeenCalledWith('refresh_token', 'rt');
    expect(window.localStorage.setItem).toHaveBeenCalledWith('teamflow_account_id', '42');
    expect(window.location.href).toBe('/');
  });

  it('shows the server error message and does not redirect on failed login', async () => {
    (authApi.login as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { detail: 'Неверный логин или пароль' } },
    });
    const { container } = render(<Login />);

    fireEvent.change(container.querySelector('input[type="text"]')!, { target: { value: 'neo' } });
    fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('Неверный логин или пароль')).toBeInTheDocument();
    expect(window.location.href).toBe('');
  });

  it('registration: rejects mismatched passwords without calling the API', async () => {
    render(<Login />);
    fireEvent.click(screen.getByText('Нет аккаунта? Зарегистрироваться'));

    fireEvent.change(screen.getByPlaceholderText('neo_matrix'), { target: { value: 'neo' } });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'neo@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Минимум 6 символов'), { target: { value: 'password1' } });
    fireEvent.change(screen.getByPlaceholderText('Повторите пароль'), { target: { value: 'password2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));

    expect(await screen.findByText('Пароли не совпадают')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/auth/local/register'),
      expect.anything()
    );
  });

  it('registration: rejects a too-short password without calling the API', async () => {
    render(<Login />);
    fireEvent.click(screen.getByText('Нет аккаунта? Зарегистрироваться'));

    fireEvent.change(screen.getByPlaceholderText('neo_matrix'), { target: { value: 'neo' } });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'neo@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Минимум 6 символов'), { target: { value: '123' } });
    fireEvent.change(screen.getByPlaceholderText('Повторите пароль'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));

    expect(await screen.findByText('Пароль должен быть не менее 6 символов')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/auth/local/register'),
      expect.anything()
    );
  });
});
