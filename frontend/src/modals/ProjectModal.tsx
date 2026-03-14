import { useState } from 'react';
import Modal from '../components/Modal';
import MarkdownContent from '../components/MarkdownContent';
import { showToast } from '../utils/toast';

export default function ProjectModal({ project, onClose, updateProjectMutation, setConfirmDelete }: any) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [emoji, setEmoji] = useState(project.emoji || '📁');
  const [descTab, setDescTab] = useState<'write' | 'preview'>('write');

  const handleSave = () => {
    if (name.trim()) updateProjectMutation.mutate({ id: project.id, data: { name, description, emoji } });
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
        <div className="border rounded-lg overflow-hidden">
          <div className="flex border-b bg-gray-50">
            <button type="button" onClick={() => setDescTab('write')}
              className={`px-3 py-1.5 text-xs font-medium transition ${descTab === 'write' ? 'bg-white text-gray-800 border-r' : 'text-gray-500 hover:text-gray-700'}`}
            >✏️ Редактор</button>
            <button type="button" onClick={() => setDescTab('preview')}
              className={`px-3 py-1.5 text-xs font-medium transition ${descTab === 'preview' ? 'bg-white text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
            >👁 Просмотр</button>
          </div>
          {descTab === 'write' ? (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Описание (поддерживается Markdown)"
              className="w-full px-3 py-2 border-0 text-sm focus:outline-none"
              rows={3}
            />
          ) : (
            <div className="px-3 py-2 min-h-[72px]">
              {description ? <MarkdownContent content={description} /> : <span className="text-gray-400 text-xs">Нет описания</span>}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400">**жирный**, *курсив*, `код`, - список</p>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button onClick={handleSave} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm">Сохранить</button>
        <button onClick={() => setConfirmDelete({ type: 'project', id: project.id })} className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm">🗑️</button>
      </div>
    </Modal>
  );
}
