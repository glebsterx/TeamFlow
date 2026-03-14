import { useState } from 'react';
import Modal from '../components/Modal';

export default function NewProjectModal({ onClose, createProjectMutation }: any) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('📁');

  const handleCreate = () => {
    if (name.trim()) createProjectMutation.mutate({ name, description, emoji });
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg sm:text-xl font-bold mb-4">Новый проект</h2>
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
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
          placeholder="Название"
          className="w-full px-3 py-2 border rounded-lg text-sm"
          autoFocus
        />
        <div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание (поддерживается Markdown)"
            className="w-full px-3 py-2 border rounded-lg text-sm"
            rows={2}
          />
          <p className="text-xs text-gray-400 mt-0.5">**жирный**, *курсив*, `код`, - список</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button onClick={handleCreate} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm">Создать</button>
      </div>
    </Modal>
  );
}
