import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './pages/Dashboard';
import MiniAppPage from './pages/MiniAppPage';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

/**
 * Роутинг без react-router — определяем по pathname.
 * /app  → MiniAppPage (Telegram Mini App, открывается через WebApp-кнопку в боте)
 * *     → Dashboard (основной веб-интерфейс)
 */
function AppRouter() {
  const path = window.location.pathname;
  if (path === '/app' || path.startsWith('/app/')) {
    return <MiniAppPage />;
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
