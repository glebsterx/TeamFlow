import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './pages/Dashboard';
import MiniAppPage from './pages/MiniAppPage';
import { Login } from './pages/Login';
import { Welcome } from './pages/Welcome';
import { SetupWizard } from './pages/SetupWizard';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

function isAuthenticated(): boolean {
  const token = localStorage.getItem('access_token');
  const accountId = localStorage.getItem('teamflow_account_id') || localStorage.getItem('teamflow_my_user_id');
  return !!(token && accountId);
}

/**
 * Роутинг без react-router — определяем по pathname.
 * /setup → SetupWizard (первоначальная настройка)
 * /login → Login (авторизация через Telegram / логин/пароль)
 * /app   → MiniAppPage (Telegram Mini App)
 * /welcome → Welcome (страница приветствия)
 * *      → Dashboard (основной веб-интерфейс, только для авторизованных)
 */
function AppRouter() {
  const path = window.location.pathname;

  if (path === '/setup') {
    return <SetupWizard />;
  }
  if (path === '/login') {
    return <Login />;
  }
  if (path === '/app' || path.startsWith('/app/')) {
    return <MiniAppPage />;
  }
  if (path === '/welcome') {
    return <Welcome />;
  }

  // Если не авторизован — показываем welcome
  if (!isAuthenticated()) {
    return <Welcome />;
  }

  return <Dashboard />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  );
}

export default App;
