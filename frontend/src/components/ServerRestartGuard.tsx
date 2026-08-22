import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../api/client';

export function ServerRestartGuard() {
  const [isDown, setIsDown] = useState(false);

  const checkServer = useCallback(async () => {
    try {
      // Absolute URL to the backend — a relative path here hits the Vite dev
      // server's own SPA fallback (always 200) instead of the real backend,
      // so it could never detect an actual outage and would reload on any
      // network blip once it had (incorrectly) flagged itself as down.
      // GET, not HEAD — the backend's /health route doesn't support HEAD (405).
      const resp = await fetch(`${API_URL}/health`, { method: 'GET', cache: 'no-store' });
      if (resp.ok && isDown) {
        window.location.reload();
      } else if (resp.ok) {
        setIsDown(false);
      } else if (resp.status === 502) {
        setIsDown(true);
      }
    } catch {
      setIsDown(true);
    }
  }, [isDown]);

  useEffect(() => {
    checkServer();
    const interval = setInterval(() => {
      if (isDown) {
        checkServer();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [checkServer, isDown]);

  if (!isDown) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-900/90 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl">
        <div className="text-5xl mb-4">🔧</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Сервер перезапускается</h2>
        <p className="text-gray-500 text-sm mb-6">Подождите, страница обновится автоматически...</p>
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
