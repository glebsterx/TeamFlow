import { useState, useRef } from 'react';
import Modal from '../components/Modal';
import MarkdownContent from '../components/MarkdownContent';

export default function NewProjectModal({ onClose, createProjectMutation, projects, initialParentProjectId }: any) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('📁');
  const [parentProjectId, setParentProjectId] = useState<number | undefined>(initialParentProjectId);
  const [descTab, setDescTab] = useState<'write' | 'preview'>('write');
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Markdown insertion helper
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
    setTimeout(() => { textarea.focus(); textarea.setSelectionRange(newCursorStart, newCursorEnd); }, 0);
  };

  // Keyboard shortcuts
  const handleMarkdownShortcuts = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const code = e.code;
    if (code === 'KeyB') { e.preventDefault(); e.stopPropagation(); insertMarkdown('**', '**'); }
    else if (code === 'KeyI') { e.preventDefault(); e.stopPropagation(); insertMarkdown('*', '*'); }
    else if (code === 'KeyE') { e.preventDefault(); e.stopPropagation(); insertMarkdown('`', '`'); }
  };

  const handleCreate = () => {
    if (name.trim()) createProjectMutation.mutate({ name, description, emoji, parent_project_id: parentProjectId });
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg sm:text-xl font-bold mb-4">Новый проект</h2>
      <div className="space-y-3 mb-4">
        <div className="flex gap-2">
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="📁"
            className="w-16 px-2 py-2 border rounded-lg text-center text-2xl"
            maxLength={2}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
            placeholder="Название"
            className="flex-1 px-3 py-2 border rounded-lg text-sm"
            autoFocus
          />
        </div>
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
              className="px-2 py-1 text-xs hover:bg-gray-200 rounded" title="Жирный (Ctrl+B)">**B**</button>
            <button type="button" onClick={() => insertMarkdown('*', '*')}
              className="px-2 py-1 text-xs hover:bg-gray-200 rounded" title="Курсив (Ctrl+I)">*I*</button>
            <button type="button" onClick={() => insertMarkdown('`', '`')}
              className="px-2 py-1 text-xs hover:bg-gray-200 rounded" title="Код (Ctrl+E)">`code`</button>
          </div>
          {descTab === 'write' ? (
            <textarea
              ref={descRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleMarkdownShortcuts}
              placeholder="Описание (поддерживается Markdown)"
              className="w-full px-3 py-2 border-0 text-sm focus:outline-none font-mono text-xs"
              rows={2}
            />
          ) : (
            <div className="px-3 py-2 min-h-[60px]">
              {description ? <MarkdownContent content={description} /> : <span className="text-gray-400 text-xs">Нет описания</span>}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400">Шорткаты: Ctrl+B жирный, Ctrl+I курсив, Ctrl+E код</p>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Родительский проект (необязательно)</label>
          <select
            value={parentProjectId || ''}
            onChange={(e) => setParentProjectId(e.target.value ? Number(e.target.value) : undefined)}
            className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
          >
            <option value="">— Без родителя —</option>
            {projects?.filter((p: any) => p.is_active).map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.emoji || '📁'} {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button onClick={handleCreate} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm">Создать</button>
      </div>
    </Modal>
  );
}
