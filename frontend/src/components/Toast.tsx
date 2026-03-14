import React, { useState } from 'react';
import { registerToastSink } from '../utils/toast';

type ToastType = 'info' | 'success' | 'error' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

const TOAST_MAX = 5;

const DURATIONS: Record<ToastType, number> = {
  info: 4000,
  success: 4000,
  warning: 7000,
  error: 7000,
};

const TOAST_BG: Record<ToastType, string> = {
  info: 'bg-gray-800',
  success: 'bg-green-600',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
};

let _toastId = 0;

interface ToastItemProps {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}

function ToastItemComponent({ toast, onDismiss }: ToastItemProps) {
  const [visible, setVisible] = useState(false);

  // Trigger enter animation on mount
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      role="alert"
      aria-live="polite"
      onClick={() => onDismiss(toast.id)}
      className={`relative overflow-hidden cursor-pointer rounded-lg shadow-lg text-white text-sm px-4 py-2.5 min-w-[220px] max-w-xs
        transition-all duration-300 ease-out
        ${visible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'}
        ${TOAST_BG[toast.type]}`}
      style={{ willChange: 'transform, opacity' }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex-1 leading-snug">{toast.message}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(toast.id); }}
          aria-label="Закрыть уведомление"
          className="shrink-0 opacity-70 hover:opacity-100 transition-opacity leading-none mt-0.5"
        >×</button>
      </div>
      {/* Progress bar */}
      <div
        className="absolute bottom-0 left-0 h-[3px] bg-white bg-opacity-40 rounded-b-lg"
        style={{
          animation: `toast-progress ${toast.duration}ms linear forwards`,
        }}
      />
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Register the sink every render so it's always current (stable ref pattern)
  registerToastSink((message, type = 'info', duration) => {
    const t = type as ToastType;
    const id = ++_toastId;
    const dur = duration ?? DURATIONS[t];
    setToasts(prev => {
      const next = [...prev, { id, message, type: t, duration: dur }];
      return next.length > TOAST_MAX ? next.slice(next.length - TOAST_MAX) : next;
    });
    setTimeout(() => setToasts(prev => prev.filter(item => item.id !== id)), dur);
  });

  const handleDismiss = React.useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  if (!toasts.length) return null;

  return (
    <>
      {/* Inject keyframes once */}
      <style>{`
        @keyframes toast-progress {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
      <div
        aria-label="Уведомления"
        className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2 pointer-events-none items-end"
      >
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItemComponent toast={t} onDismiss={handleDismiss} />
          </div>
        ))}
      </div>
    </>
  );
}
