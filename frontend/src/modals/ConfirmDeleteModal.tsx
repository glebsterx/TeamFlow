import { useState, useEffect } from 'react';
import Modal from '../components/Modal';
import axios from 'axios';
import { API_URL } from '../constants/taskDisplay';

export default function ConfirmDeleteModal({ confirm, onClose, deleteTaskMutation, deleteProjectMutation, deleteMeetingMutation }: any) {
  const labels: Record<string, string> = { task: 'задачу', project: 'проект', meeting: 'встречу' };
  const [projectCheck, setProjectCheck] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (confirm.type === 'project') {
      setLoading(true);
      axios.get(`${API_URL}/api/projects/${confirm.id}/can-delete`)
        .then(res => setProjectCheck(res.data))
        .catch(() => setProjectCheck({ can_delete: true }))
        .finally(() => setLoading(false));
    }
  }, [confirm]);

  const handleDelete = () => {
    if (confirm.type === 'task') deleteTaskMutation.mutate(confirm.id);
    if (confirm.type === 'project') deleteProjectMutation.mutate(confirm.id);
    if (confirm.type === 'meeting') deleteMeetingMutation.mutate(confirm.id);
  };

  const handleArchive = () => {
    if (confirm.type === 'project') {
      axios.post(`${API_URL}/api/projects/${confirm.id}/archive`)
        .then(() => onClose())
        .catch(() => {});
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="text-base sm:text-lg font-bold mb-4">
        {confirm.type === 'project' && projectCheck && !projectCheck.can_delete 
          ? '⚠️ Нельзя удалить проект' 
          : 'Подтвердите удаление'}
      </h2>
      
      {confirm.type === 'project' && projectCheck && !projectCheck.can_delete ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Проект содержит зависимости и не может быть удалён:
          </p>
          {projectCheck.subprojects_count > 0 && (
            <div className="text-sm bg-amber-50 border border-amber-200 rounded p-2">
              <div className="font-medium text-amber-800">📁 Подпроекты: {projectCheck.subprojects_count}</div>
              <div className="text-xs text-amber-700 mt-1">
                {projectCheck.subprojects.slice(0, 5).map((p: any) => (
                  <div key={p.id}>• {p.name}</div>
                ))}
              </div>
            </div>
          )}
          {projectCheck.tasks_count > 0 && (
            <div className="text-sm bg-amber-50 border border-amber-200 rounded p-2">
              <div className="font-medium text-amber-800">📋 Задачи: {projectCheck.tasks_count}</div>
              <div className="text-xs text-amber-700 mt-1">
                {projectCheck.tasks.slice(0, 5).map((t: any) => (
                  <div key={t.id}>• #{t.id} {t.title}</div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
            <button onClick={handleArchive} className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm">
              🗄️ Архивировать
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-6">
            Вы действительно хотите удалить {labels[confirm.type]}{loading ? '...' : ''}?
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
            <button onClick={handleDelete} className="flex-1 py-2 bg-red-500 text-white rounded-lg font-medium text-sm">
              Удалить
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
