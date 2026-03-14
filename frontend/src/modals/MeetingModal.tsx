import { useState, useRef } from 'react';
import Modal from '../components/Modal';
import MarkdownContent from '../components/MarkdownContent';
import { showToast } from '../utils/toast';

export default function MeetingModal({ meeting, onClose, updateMeetingMutation, setConfirmDelete }: any) {
  const [summary, setSummary] = useState(meeting.summary);
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
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg sm:text-xl font-bold">Редактировать встречу</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={async () => {
              const url = `${window.location.origin}${window.location.pathname}?meeting=${meeting.id}`;
              try { await navigator.clipboard.writeText(url); } catch {
                const el = document.createElement('textarea');
                el.value = url; el.style.position = 'fixed'; el.style.opacity = '0';
                document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
              }
              showToast('Ссылка скопирована', 'success');
            }}
            className="text-gray-400 hover:text-blue-600 transition p-1 rounded"
            title="Скопировать ссылку на встречу"
            aria-label="Скопировать ссылку на встречу"
          >🔗</button>
        </div>
      </div>
      <div className="text-xs text-gray-500 mb-3">
        {new Date(meeting.meeting_date).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="border rounded-lg overflow-hidden mb-4">
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
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onKeyDown={handleMarkdownShortcuts}
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
        <button onClick={() => updateMeetingMutation.mutate({ id: meeting.id, data: { summary } })}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm">Сохранить</button>
        <button onClick={() => setConfirmDelete({ type: 'meeting', id: meeting.id })}
          className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm">🗑️</button>
      </div>
    </Modal>
  );
}
