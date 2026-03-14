import { useState, useRef } from 'react';
import axios from 'axios';
import Modal from '../components/Modal';
import MarkdownContent from '../components/MarkdownContent';
import { showToast } from '../utils/toast';
import { API_URL } from '../constants/taskDisplay';

export default function ProjectModal({ project, onClose, updateProjectMutation, setConfirmDelete, projects, invalidate }: any) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [emoji, setEmoji] = useState(project.emoji || '📁');
  const [parentProjectId, setParentProjectId] = useState(project.parent_project_id || '');
  const [descTab, setDescTab] = useState<'write' | 'preview'>('write');
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Markdown insertion helper with toggle support
  const insertMarkdown = (prefix: string, suffix: string) => {
    const textarea = descRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const selectedText = description.substring(start, end);
    
    const textBefore = description.substring(0, start);
    const textAfter = description.substring(end);
    const hasPrefix = textBefore.endsWith(prefix);
    const hasSuffix = textAfter.startsWith(suffix);
    
    let newDescription: string;
    let newCursorStart: number;
    let newCursorEnd: number;
    
    if (hasPrefix && hasSuffix) {
      const prefixStart = start - prefix.length;
      const suffixEnd = end + suffix.length;
      newDescription = description.substring(0, prefixStart) + selectedText + description.substring(suffixEnd);
      newCursorStart = prefixStart;
      newCursorEnd = prefixStart + selectedText.length;
    } else {
      newDescription = textBefore + prefix + selectedText + suffix + textAfter;
      newCursorStart = start + prefix.length;
      newCursorEnd = end + prefix.length;
    }
    
    setDescription(newDescription);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorStart, newCursorEnd);
    }, 0);
  };

  // Keyboard shortcuts for markdown
  const handleMarkdownShortcuts = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const code = e.code;
    if (code === 'KeyB') { e.preventDefault(); e.stopPropagation(); insertMarkdown('**', '**'); }
    else if (code === 'KeyI') { e.preventDefault(); e.stopPropagation(); insertMarkdown('*', '*'); }
    else if (code === 'KeyE') { e.preventDefault(); e.stopPropagation(); insertMarkdown('`', '`'); }
  };

  const handleSave = () => {
    if (name.trim()) {
      updateProjectMutation.mutate({ 
        id: project.id, 
        data: { 
          name, 
          description, 
          emoji,
          parent_project_id: parentProjectId ? Number(parentProjectId) : null
        } 
      }, {
        onSuccess: () => {
          invalidate();
          showToast('Проект сохранён', 'success');
        }
      });
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg sm:text-xl font-bold">Редактировать</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={async () => {
              const url = `${window.location.origin}${window.location.pathname}?project=${project.id}`;
              try {
                await navigator.clipboard.writeText(url);
              } catch {
                const el = document.createElement('textarea');
                el.value = url; el.style.position = 'fixed'; el.style.opacity = '0';
                document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
              }
              showToast('Ссылка скопирована', 'success');
            }}
            className="text-gray-400 hover:text-blue-600 transition p-1 rounded"
            title="Скопировать ссылку на проект"
            aria-label="Скопировать ссылку на проект"
          >🔗</button>
        </div>
      </div>
      <div className="space-y-3 mb-4">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="Emoji"
          className="w-16 px-2 py-2 border rounded-lg text-center text-2xl"
          maxLength={2}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave(); } }}
          placeholder="Название"
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
        <select
          value={parentProjectId}
          onChange={(e) => setParentProjectId(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
        >
          <option value="">— Без родителя —</option>
          {(projects || []).filter((p: any) => p.id !== project.id && p.is_active).map((p: any) => (
            <option key={p.id} value={p.id}>{p.emoji || '📁'} {p.name}</option>
          ))}
        </select>
        <div className="border rounded-lg overflow-hidden">
          <div className="flex border-b bg-gray-50 flex-wrap gap-1 p-1">
            <button type="button" onClick={() => setDescTab('write')}
              className={`px-2 py-1 text-xs font-medium transition rounded ${descTab === 'write' ? 'bg-white text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
            >✏️</button>
            <button type="button" onClick={() => setDescTab('preview')}
              className={`px-2 py-1 text-xs font-medium transition rounded ${descTab === 'preview' ? 'bg-white text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
            >👁</button>
            <span className="border-l mx-1"></span>
            <button type="button" onClick={() => insertMarkdown('**', '**')}
              className="px-2 py-1 text-xs hover:bg-gray-200 rounded" title="Жирный (Ctrl+B)"
            >**B**</button>
            <button type="button" onClick={() => insertMarkdown('*', '*')}
              className="px-2 py-1 text-xs hover:bg-gray-200 rounded" title="Курсив (Ctrl+I)"
            >*I*</button>
            <button type="button" onClick={() => insertMarkdown('`', '`')}
              className="px-2 py-1 text-xs hover:bg-gray-200 rounded" title="Код (Ctrl+E)"
            >`code`</button>
            <button type="button" onClick={() => insertMarkdown('- ', '')}
              className="px-2 py-1 text-xs hover:bg-gray-200 rounded" title="Список"
            >• Список</button>
          </div>
          {descTab === 'write' ? (
            <textarea
              ref={descRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleMarkdownShortcuts}
              placeholder="Описание (поддерживается Markdown)"
              className="w-full px-3 py-2 border-0 text-sm focus:outline-none font-mono text-xs"
              rows={3}
            />
          ) : (
            <div className="px-3 py-2 min-h-[72px]">
              {description ? <MarkdownContent content={description} /> : <span className="text-gray-400 text-xs">Нет описания</span>}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400">Шорткаты: Ctrl+B жирный, Ctrl+I курсив, Ctrl+E код</p>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button onClick={handleSave} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm">Сохранить</button>
        {project.is_active ? (
          <>
            <button
              onClick={async () => {
                await axios.post(`${API_URL}/api/projects/${project.id}/archive`);
                invalidate();
                onClose();
              }}
              className="px-3 py-2 bg-amber-500 text-white rounded-lg text-sm"
              title="Архивировать проект"
            >🗄️</button>
            <button onClick={() => setConfirmDelete({ type: 'project', id: project.id })} className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm">🗑️</button>
          </>
        ) : (
          <button
            onClick={async () => {
              await axios.post(`${API_URL}/api/projects/${project.id}/restore`);
              invalidate();
              onClose();
            }}
            className="px-3 py-2 bg-green-500 text-white rounded-lg text-sm"
            title="Восстановить проект"
          >↩️ Восстановить</button>
        )}
      </div>
    </Modal>
  );
}
