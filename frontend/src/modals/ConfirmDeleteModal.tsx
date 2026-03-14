import Modal from '../components/Modal';

export default function ConfirmDeleteModal({ confirm, onClose, deleteTaskMutation, deleteProjectMutation, deleteMeetingMutation }: any) {
  const labels: Record<string, string> = { task: 'задачу', project: 'проект', meeting: 'встречу' };

  const handleDelete = () => {
    if (confirm.type === 'task') deleteTaskMutation.mutate(confirm.id);
    if (confirm.type === 'project') deleteProjectMutation.mutate(confirm.id);
    if (confirm.type === 'meeting') deleteMeetingMutation.mutate(confirm.id);
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="text-base sm:text-lg font-bold mb-4">Подтвердите удаление</h2>
      <p className="text-sm text-gray-600 mb-6">Вы действительно хотите удалить {labels[confirm.type]}?</p>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button onClick={handleDelete} className="flex-1 py-2 bg-red-500 text-white rounded-lg font-medium text-sm">Удалить</button>
      </div>
    </Modal>
  );
}
