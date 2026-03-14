import { useState } from 'react';
import Modal from '../components/Modal';

export default function NewMeetingModal({ onClose, createMeetingMutation }: any) {
  const [summary, setSummary] = useState('');

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg sm:text-xl font-bold mb-4">Новая встреча</h2>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Итоги встречи..."
        className="w-full px-3 py-2 border rounded-lg mb-4 text-sm"
        rows={6}
        autoFocus
      />
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button
          onClick={() => { if (summary.trim()) createMeetingMutation.mutate({ summary }); }}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >Сохранить</button>
      </div>
    </Modal>
  );
}
