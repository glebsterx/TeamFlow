/**
 * MiniAppPage — компактный вид для Telegram Mini App (WebApp).
 * Статусы задач: TODO / DOING / ON_HOLD / BLOCKED / DONE (как в TaskStatus enum бэкенда)
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { API_URL } from "../constants/taskDisplay";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe: { user?: { id: number; first_name: string; username?: string } };
        ready: () => void;
        expand: () => void;
        close: () => void;
        themeParams: Record<string, string>;
        colorScheme: "light" | "dark";
        MainButton: { text: string; show: () => void; hide: () => void; onClick: (cb: () => void) => void };
      };
    };
  }
}

interface MiniTask {
  id: number; title: string; status: string; priority: string;
  due_date: string | null; project: string | null; project_emoji: string | null;
  tags: { name: string; color: string }[]; description: string | null; assignee_name: string | null;
}

interface SprintSummary {
  id: number; name: string; status: string;
  start_date: string | null; end_date: string | null;
  total_tasks: number; done_tasks: number; progress_pct: number;
}

const STATUS_LABELS: Record<string, string> = {
  TODO: "К выполнению", DOING: "В работе", ON_HOLD: "Отложено",
  DONE: "Готово", BLOCKED: "Заблокировано",
};
const STATUS_COLORS: Record<string, string> = {
  TODO: "bg-gray-100 text-gray-700", DOING: "bg-blue-100 text-blue-700",
  ON_HOLD: "bg-yellow-100 text-yellow-700", DONE: "bg-green-100 text-green-700",
  BLOCKED: "bg-red-100 text-red-700",
};
const PRIORITY_ICONS: Record<string, string> = {
  URGENT: "🔴", HIGH: "🟠", NORMAL: "🟡", LOW: "🟢",
};
// TODO→DOING→DONE — основной путь; ON_HOLD/BLOCKED → возобновить
const NEXT_STATUS: Record<string, string> = {
  TODO: "DOING", DOING: "DONE", ON_HOLD: "DOING", BLOCKED: "DOING",
};
const NEXT_LABEL: Record<string, string> = {
  TODO: "▶", DOING: "✓", ON_HOLD: "▶", BLOCKED: "▶",
};

export default function MiniAppPage() {
  const [telegramId, setTelegramId] = useState<number | null>(null);
  const [userName, setUserName] = useState<string>("Пользователь");
  const [isDark, setIsDark] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const initTg = () => {
      const tg = window.Telegram?.WebApp;
      if (tg) {
        setSdkReady(true);
        tg.ready(); tg.expand();
        setIsDark(tg.colorScheme === "dark");
        const user = tg.initDataUnsafe?.user;
        if (user) { setTelegramId(user.id); setUserName(user.first_name || user.username || "Пользователь"); }
      }
    };

    initTg();

    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      if (window.Telegram?.WebApp) {
        clearInterval(poll);
        initTg();
      } else if (attempts > 25) {
        clearInterval(poll);
        setSdkReady(true);
      }
    }, 200);

    return () => clearInterval(poll);
  }, []);

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<MiniTask[]>({
    queryKey: ["webapp-tasks", telegramId],
    queryFn: async () => {
      if (!telegramId) return [];
      const { data } = await axios.get(`${API_URL}/api/webapp/my-tasks`, { params: { telegram_id: telegramId } });
      return data;
    },
    enabled: !!telegramId,
    refetchInterval: 30_000,
  });

  const { data: sprintData } = useQuery<{ sprint: SprintSummary | null }>({
    queryKey: ["webapp-sprint"],
    queryFn: async () => { const { data } = await axios.get(`${API_URL}/api/webapp/sprint`); return data; },
    refetchInterval: 60_000,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: string }) => {
      const { data } = await axios.post(`${API_URL}/api/webapp/tasks/${taskId}/status`, { status, telegram_id: telegramId });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webapp-tasks"] }),
  });

  const bg = isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900";
  const card = isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200";

  // Show loading while waiting for SDK
  if (!sdkReady) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bg}`}>
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">⏳</div>
          <p className="text-lg font-medium">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!telegramId) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bg}`}>
        <div className="text-center p-8">
          <div className="text-4xl mb-4">📱</div>
          <p className="text-lg font-medium">Открывайте через Telegram</p>
          <p className="text-sm text-gray-500 mt-2">Эта страница работает как Telegram Mini App</p>
        </div>
      </div>
    );
  }

  const sprint = sprintData?.sprint;

  return (
    <div className={`min-h-screen ${bg} pb-8`}>
      <div className={`sticky top-0 z-10 ${isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"} border-b px-4 py-3`}>
        <div className="flex items-center justify-between">
          <div><h1 className="font-bold text-base">TeamFlow</h1><p className="text-xs text-gray-500">Привет, {userName}!</p></div>
          <span className="text-xl">📋</span>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {sprint && (
          <div className={`rounded-xl border p-4 ${card}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">🏃 {sprint.name}</span>
              <span className="text-xs text-gray-500">{sprint.done_tasks}/{sprint.total_tasks} задач</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${sprint.progress_pct}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1">{sprint.progress_pct}% выполнено</p>
          </div>
        )}

        <div>
          <h2 className="text-sm font-semibold mb-2 text-gray-500 uppercase tracking-wide">Мои задачи</h2>
          {tasksLoading && <div className="text-center py-8 text-gray-400">Загрузка...</div>}
          {!tasksLoading && tasks.length === 0 && (
            <div className={`rounded-xl border p-6 text-center ${card}`}>
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm font-medium">Нет активных задач</p>
              <p className="text-xs text-gray-400 mt-1">Все задачи выполнены!</p>
            </div>
          )}
          <div className="space-y-2">
            {tasks.map((task) => {
              const next = NEXT_STATUS[task.status];
              return (
                <div key={task.id} className={`rounded-xl border p-3 ${card}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-sm">{PRIORITY_ICONS[task.priority] || "⚪"}</span>
                        <span className="text-sm font-medium truncate">{task.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[task.status] || "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABELS[task.status] || task.status}
                        </span>
                        {task.project && <span className="text-xs text-gray-500">{task.project_emoji} {task.project}</span>}
                        {task.due_date && (
                          <span className="text-xs text-gray-400">
                            📅 {new Date(task.due_date + "Z").toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                    </div>
                    {next && task.status !== "DONE" && (
                      <button onClick={() => statusMutation.mutate({ taskId: task.id, status: next })}
                        disabled={statusMutation.isPending}
                        className="shrink-0 text-xs bg-blue-500 text-white px-2 py-1 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors">
                        {NEXT_LABEL[task.status] || "▶"}
                      </button>
                    )}
                    {task.status === "DONE" && <span className="shrink-0 text-green-500 text-lg">✓</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
