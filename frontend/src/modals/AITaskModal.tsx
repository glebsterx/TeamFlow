import { useState } from 'react';
import axios from 'axios';
import Modal from '../components/Modal';
import { API_URL } from '../constants/taskDisplay';
import { showToast } from '../utils/toast';

interface AITaskModalProps {
  onClose: () => void;
  onTaskCreated: () => void;
  projects: { id: number; name: string; emoji: string }[];
}

export default function AITaskModal({ onClose, onTaskCreated, projects }: AITaskModalProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<{title: string; description?: string; priority?: string}[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);

  const handleGenerate = async () => {
    if (!text.trim()) {
      showToast('Введите текст для анализа', 'warning');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/ai/parse`, { text });
      const tasks = res.data.tasks || [];
      if (tasks.length === 0) {
        showToast('AI не смог извлечь задачи из текста. Попробуйте переформулировать.', 'warning');
      }
      setTasks(tasks);
} catch (e: any) {
      // Just log - interceptor should show the toast
      console.log('AI error caught:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAll = async () => {
    setLoading(true);
    try {
      for (const task of tasks) {
        await axios.post(`${API_URL}/api/tasks`, {
          title: task.title,
          description: task.description,
          priority: task.priority || 'NORMAL',
          project_id: selectedProject || undefined,
        });
      }
      showToast(`Создано ${tasks.length} задач`, 'success');
      onTaskCreated();
      onClose();
    } catch (e) {
      showToast('Ошибка при создании задач', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">🤖 AI генерация задач</h2>
      <p className="text-sm text-gray-500 mb-3">Опишите задачи свободным текстом, например: "нужно созвониться с клиентом, подготовить презентацию до пятницы и написать документацию"</p>
      
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Введите описание задач..."
        className="w-full px-3 py-2 border rounded-lg text-sm mb-3 h-32"
      />

      <button
        onClick={handleGenerate}
        disabled={loading || !text.trim()}
        className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 mb-4"
      >
        {loading ? '🤔 Анализ...' : '🔮 Создать задачи'}
      </button>

      {tasks.length > 0 && (
        <>
          <div className="mb-3">
            <label className="text-xs text-gray-500 block mb-1">Проект (опционально)</label>
            <select
              value={selectedProject || ''}
              onChange={e => setSelectedProject(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">Без проекта</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
            {tasks.map((t, i) => (
              <div key={i} className="flex items-start gap-2 p-2 border rounded-lg">
                <input type="checkbox" defaultChecked className="mt-1" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{t.title}</div>
                  {t.description && <div className="text-xs text-gray-500">{t.description}</div>}
                  {t.priority && <span className={`text-xs px-1 rounded ${t.priority === 'HIGH' ? 'bg-red-100 text-red-600' : 'bg-gray-100'}`}>{t.priority}</span>}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleCreateAll}
            disabled={loading}
            className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium"
          >
            ✓ Создать {tasks.length} задач
          </button>
        </>
      )}
    </Modal>
  );
}