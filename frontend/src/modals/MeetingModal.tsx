import { useState } from 'react';
import Modal from '../components/Modal';
import { showToast } from '../utils/toast';

export default function MeetingModal({ meeting, onClose, updateMeetingMutation, setConfirmDelete }: any) {
  const [summary, setSummary] = useState(meeting.summary);

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg sm:text-xl font-bold">Редактировать встречу</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={async () => {
              const url = `${window.location.origin}${window.location.pathname}?meeting=${meeting.id}`;
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
            title="Скопировать ссылку на встречу"
            aria-label="Скопировать ссылку на встречу"
          >🔗</button>
        </div>
      </div>
      <div className="text-xs text-gray-500 mb-3">
        {new Date(meeting.meeting_date).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg mb-4 text-sm"
        rows={6}
      />
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button
          onClick={() => updateMeetingMutation.mutate({ id: meeting.id, data: { summary } })}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >Сохранить</button>
        <button
          onClick={() => setConfirmDelete({ type: 'meeting', id: meeting.id })}
          className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm"
        >🗑️</button>
      </div>
    </Modal>
  );
}
