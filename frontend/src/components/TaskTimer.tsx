import React, { useState, useEffect, useRef } from 'react';
import { showToast } from '../utils/toast';

interface TaskTimerProps {
  taskId: number;
  onStop?: (seconds: number) => void;
}

const STORAGE_KEY = 'teamflow_active_timer';

interface StoredTimer {
  taskId: number;
  startTime: number;
  pausedAt?: number;
  accumulatedSeconds: number;
}

export function TaskTimer({ taskId, onStop }: TaskTimerProps) {
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data: StoredTimer = JSON.parse(stored);
        if (data.taskId === taskId) {
          const now = Date.now();
          if (data.pausedAt) {
            accumulatedRef.current = data.accumulatedSeconds;
            setSeconds(data.accumulatedSeconds);
            setIsPaused(true);
            setIsRunning(true);
          } else {
            const elapsed = Math.floor((now - data.startTime) / 1000);
            accumulatedRef.current = elapsed;
            setSeconds(elapsed);
            setIsRunning(true);
          }
        }
      } catch {}
    }
  }, [taskId]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRunning && !isPaused) {
      interval = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, isPaused]);

  useEffect(() => {
    if (isRunning && !isPaused && seconds > 0 && seconds % 900 === 0) {
      const hours = Math.floor(seconds / 3600);
      if (hours >= 4) {
        showToast(`⏰ Таймер работает уже ${hours} часа(ов)! Может, пора остановить?`, 'warning');
      }
    }
  }, [seconds, isRunning, isPaused]);

  useEffect(() => {
    if (isRunning && !isPaused) {
      const data: StoredTimer = {
        taskId,
        startTime: startTimeRef.current || Date.now(),
        accumulatedSeconds: seconds,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } else if (isPaused && isRunning) {
      const data: StoredTimer = {
        taskId,
        startTime: Date.now(),
        pausedAt: Date.now(),
        accumulatedSeconds: seconds,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [seconds, isRunning, isPaused, taskId]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    startTimeRef.current = Date.now();
    setIsRunning(true);
    setIsPaused(false);
  };

  const handlePause = () => {
    accumulatedRef.current = seconds;
    setIsPaused(true);
  };

  const handleResume = () => {
    startTimeRef.current = Date.now() - (seconds * 1000);
    setIsPaused(false);
  };

  const handleStop = () => {
    if (onStop) {
      onStop(seconds);
    }
    localStorage.removeItem(STORAGE_KEY);
    setIsRunning(false);
    setIsPaused(false);
    setSeconds(0);
    accumulatedRef.current = 0;
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setIsRunning(false);
    setIsPaused(false);
    setSeconds(0);
    accumulatedRef.current = 0;
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-mono text-gray-700">
        {formatTime(seconds)}
      </span>
      {!isRunning ? (
        <button
          onClick={handleStart}
          className="text-xs px-2 py-1 bg-green-100 hover:bg-green-200 rounded text-green-700"
        >
          ▶ Старт
        </button>
      ) : (
        <div className="flex gap-1">
          {isPaused ? (
            <button
              onClick={handleResume}
              className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded text-blue-700"
            >
              ▶
            </button>
          ) : (
            <button
              onClick={handlePause}
              className="text-xs px-2 py-1 bg-yellow-100 hover:bg-yellow-200 rounded text-yellow-700"
            >
              ⏸
            </button>
          )}
          <button
            onClick={handleStop}
            className="text-xs px-2 py-1 bg-red-100 hover:bg-red-200 rounded text-red-700"
          >
            ⏹ Стоп
          </button>
        </div>
      )}
      {seconds > 0 && !isRunning && (
        <button
          onClick={handleReset}
          className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-500"
        >
          Сброс
        </button>
      )}
    </div>
  );
}