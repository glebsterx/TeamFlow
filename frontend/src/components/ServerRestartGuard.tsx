import React, { useState, useEffect, useCallback } from 'react';

export function ServerRestartGuard() {
  const [isDown, setIsDown] = useState(false);

  const checkServer = useCallback(async () => {
    try {
      const resp = await fetch('/api/health', { method: 'HEAD', cache: 'no-store' });
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
