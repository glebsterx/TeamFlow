import { useState, useRef } from 'react';
import Modal from '../components/Modal';
import MarkdownContent from '../components/MarkdownContent';

export default function NewMeetingModal({ onClose, createMeetingMutation }: any) {
  const [summary, setSummary] = useState('');
  const [descTab, setDescTab] = useState<'write' | 'preview'>('write');
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Markdown insertion helper
  const insertMarkdown = (prefix: string, suffix: string) => {
    const textarea = descRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const selectedText = summary.substring(start, end);
    const textBefore = summary.substring(0, start);
    const textAfter = summary.substring(end);
    const hasPrefix = textBefore.endsWith(prefix);
    const hasSuffix = textAfter.startsWith(suffix);
    let newSummary: string;
    let newCursorStart: number;
    let newCursorEnd: number;
    if (hasPrefix && hasSuffix) {
      const prefixStart = start - prefix.length;
      const suffixEnd = end + suffix.length;
      newSummary = summary.substring(0, prefixStart) + selectedText + summary.substring(suffixEnd);
      newCursorStart = prefixStart;
      newCursorEnd = prefixStart + selectedText.length;
    } else {
      newSummary = textBefore + prefix + selectedText + suffix + textAfter;
      newCursorStart = start + prefix.length;
      newCursorEnd = end + prefix.length;
    }
    setSummary(newSummary);
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

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg sm:text-xl font-bold mb-4">Новая встреча</h2>
      <div className="border rounded-lg overflow-hidden mb-4">
        <div className="flex border-b bg-gray-50 flex-wrap gap-1 p-1">
          <button type="button" onClick={() => setDescTab('write')}
            className={`px-2 py-1 text-xs font-medium transition rounded ${descTab === 'write' ? 'bg-white text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>✏️</button>
          <button type="button" onClick={() => setDescTab('preview')}
            className={`px-2 py-1 text-xs font-medium transition rounded ${descTab === 'preview' ? 'bg-white text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>👁</button>
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
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onKeyDown={handleMarkdownShortcuts}
            placeholder="Итоги встречи..."
            className="w-full px-3 py-2 border-0 text-sm focus:outline-none font-mono text-xs"
            rows={6}
          />
        ) : (
          <div className="px-3 py-2 min-h-[120px]">
            {summary ? <MarkdownContent content={summary} /> : <span className="text-gray-400 text-xs">Нет описания</span>}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button onClick={() => { if (summary.trim()) createMeetingMutation.mutate({ summary }); }}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm">Сохранить</button>
      </div>
    </Modal>
  );
}
