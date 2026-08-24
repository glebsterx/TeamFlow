import React from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '../../constants/taskDisplay';
import { showToast } from '../../utils/toast';

type TagType = { id: number; name: string; color: string };

/** Stable color for new tags from AI (Russian labels); same name → same color. */
const TAG_COLOR_PALETTE = [
  '#6366f1', '#0ea5e9', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b', '#14b8a6',
] as const;

function stableColorForTagLabel(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return TAG_COLOR_PALETTE[h % TAG_COLOR_PALETTE.length];
}

function TagPicker({ taskId, taskTitle, taskDescription, taskTags, onTagsChange }: {
  taskId: number;
  taskTitle: string;
  taskDescription?: string;
  taskTags: TagType[];
  onTagsChange: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newColor, setNewColor] = React.useState('#6366f1');
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiSuggestions, setAiSuggestions] = React.useState<string[]>([]);
  const ref = React.useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: allTags = [] } = useQuery<TagType[]>({
    queryKey: ['tags'],
    queryFn: () => axios.get(`${API_URL}/api/tags`).then(r => r.data),
  });

  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const taskTagIds = new Set(taskTags.map(t => t.id));

  const toggle = async (tag: TagType) => {
    if (taskTagIds.has(tag.id)) {
      await axios.delete(`${API_URL}/api/tasks/${taskId}/tags/${tag.id}`);
    } else {
      await axios.post(`${API_URL}/api/tasks/${taskId}/tags/${tag.id}`);
    }
    qc.invalidateQueries({ queryKey: ['tasks'] });
    onTagsChange();
  };

  const createTag = async () => {
    if (!newName.trim()) return;
    try {
      const { data } = await axios.post(`${API_URL}/api/tags`, { name: newName.trim(), color: newColor });
      await axios.post(`${API_URL}/api/tasks/${taskId}/tags/${data.id}`);
      qc.invalidateQueries({ queryKey: ['tags'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      onTagsChange();
      setNewName('');
    } catch {
      showToast('Тег уже существует', 'error');
    }
  };

  const fetchAiTagSuggestions = async () => {
    if (!taskTitle.trim()) {
      showToast('Нет названия задачи', 'error');
      return;
    }
    setAiBusy(true);
    setAiSuggestions([]);
    try {
      const { data } = await axios.post<{ tags: string[] }>(`${API_URL}/api/ai/suggest-tags`, {
        title: taskTitle.trim(),
        description: taskDescription?.trim() || undefined,
      });
      const names = (data.tags || []).filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean);
      const seen = new Set<string>();
      const unique = names.filter((n) => {
        const k = n.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      setAiSuggestions(unique);
      if (!unique.length) {
        showToast('AI не вернул теги', 'info');
        return;
      }
      const pending = unique.filter(
        (n) => !taskTags.some((t) => t.name.toLowerCase() === n.toLowerCase()),
      );
      if (!pending.length) {
        showToast('Все предложенные теги уже на задаче', 'info');
      }
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } };
      const d = ax.response?.data?.detail;
      showToast(typeof d === 'string' ? d : 'Не удалось получить подсказки тегов', 'error');
    } finally {
      setAiBusy(false);
    }
  };

  const applySuggestedTag = async (rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    const lower = name.toLowerCase();
    const color = stableColorForTagLabel(name);
    let tag = allTags.find((t) => t.name.toLowerCase() === lower);
    try {
      if (!tag) {
        const { data } = await axios.post<TagType>(`${API_URL}/api/tags`, { name, color });
        tag = data;
        await qc.invalidateQueries({ queryKey: ['tags'] });
      }
      if (!taskTagIds.has(tag.id)) {
        await axios.post(`${API_URL}/api/tasks/${taskId}/tags/${tag.id}`);
      }
      qc.invalidateQueries({ queryKey: ['tasks'] });
      onTagsChange();
      setAiSuggestions((prev) => prev.filter((n) => n.toLowerCase() !== lower));
      showToast(`Тег «${tag.name}» добавлен`, 'success');
    } catch {
      showToast('Не удалось добавить тег', 'error');
    }
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1.5 flex-wrap">
        {taskTags.map(tag => (
          <button key={tag.id}
            onClick={() => toggle(tag)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border hover:opacity-75 transition"
            style={{ backgroundColor: tag.color + '22', borderColor: tag.color + '66', color: tag.color }}
            title="Снять тег"
          >
            {tag.name} ✕
          </button>
        ))}
        <button onClick={() => setOpen(v => !v)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition">
          + тег
        </button>
        <button
          type="button"
          onClick={() => void fetchAiTagSuggestions()}
          disabled={aiBusy}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 transition"
          title="Подсказать теги через AI"
        >
          {aiBusy ? '…' : '✨ AI'}
        </button>
      </div>

      {(() => {
        const pending = aiSuggestions.filter(
          (n) => !taskTags.some((t) => t.name.toLowerCase() === n.toLowerCase()),
        );
        if (!pending.length) return null;
        return (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-gray-400">Подсказки:</span>
            {pending.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => void applySuggestedTag(n)}
                className="text-[11px] px-1.5 py-0.5 rounded-full border border-violet-200 text-violet-800 bg-white hover:bg-violet-50"
              >
                + {n}
              </button>
            ))}
          </div>
        );
      })()}

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border rounded-lg shadow-lg w-56 p-2">
          <div className="space-y-1 max-h-40 overflow-y-auto mb-2">
            {allTags.length === 0 && <p className="text-xs text-gray-400 py-1 text-center">Нет тегов</p>}
            {allTags.map(tag => (
              <button key={tag.id} onClick={() => toggle(tag)}
                className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition ${taskTagIds.has(tag.id) ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                <span className="flex-1 text-left">{tag.name}</span>
                {taskTagIds.has(tag.id) && <span className="text-green-500">✓</span>}
              </button>
            ))}
          </div>
          <div className="border-t pt-2 flex gap-1">
            <input className="flex-1 px-2 py-1 border rounded text-xs" placeholder="Новый тег"
              value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createTag()} />
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
              className="w-7 h-7 rounded border cursor-pointer p-0.5" title="Цвет" />
            <button onClick={createTag}
              className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">+</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TagPicker;
