import { useState } from 'react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { API_URL } from '../constants/taskDisplay';
import { timeAgo } from '../utils/dateUtils';
import { showToast } from '../utils/toast';
import Modal from '../components/Modal';

interface KnowledgeFolder {
  id: number;
  name: string;
  parent_id: number | null;
  order: number;
  created_at: string | null;
  updated_at: string | null;
}

interface KnowledgePage {
  id: number;
  title: string;
  content: string | null;
  folder_id: number | null;
  order: number;
  created_at: string | null;
  updated_at: string | null;
}

export default function KnowledgeBasePage() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['knowledge-folders'] });
    queryClient.invalidateQueries({ queryKey: ['knowledge-pages'] });
  };

  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [selectedPage, setSelectedPage] = useState<KnowledgePage | null>(null);
  const [showFolderModal, setShowFolderModal] = useState<KnowledgeFolder | null>(null);
  const [showPageModal, setShowPageModal] = useState<KnowledgePage | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<number | null>(null);
  const [confirmDeletePage, setConfirmDeletePage] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState(false);
  const [pageContent, setPageContent] = useState('');

  const { data: folders = [] } = useQuery<KnowledgeFolder[]>({
    queryKey: ['knowledge-folders'],
    queryFn: async () => (await axios.get(`${API_URL}/api/knowledge-base/folders`)).data,
  });

  const { data: pages = [] } = useQuery<KnowledgePage[]>({
    queryKey: ['knowledge-pages'],
    queryFn: async () => (await axios.get(`${API_URL}/api/knowledge-base/pages`)).data,
  });

  const createFolderMutation = useMutation({
    mutationFn: async (data: { name: string; parent_id?: number }) => {
      await axios.post(`${API_URL}/api/knowledge-base/folders`, data);
    },
    onSuccess: () => { invalidate(); setShowFolderModal(null); showToast('Папка создана', 'success'); },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка', 'error'),
  });

  const updateFolderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<KnowledgeFolder> }) => {
      await axios.patch(`${API_URL}/api/knowledge-base/folders/${id}`, data);
    },
    onSuccess: () => { invalidate(); setShowFolderModal(null); showToast('Сохранено', 'success'); },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка', 'error'),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: number) => {
      await axios.delete(`${API_URL}/api/knowledge-base/folders/${id}`);
    },
    onSuccess: () => { invalidate(); setConfirmDeleteFolder(null); showToast('Удалено', 'success'); },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка', 'error'),
  });

  const createPageMutation = useMutation({
    mutationFn: async (data: { title: string; folder_id?: number; content?: string }) => {
      await axios.post(`${API_URL}/api/knowledge-base/pages`, data);
    },
    onSuccess: () => { invalidate(); setShowPageModal(null); showToast('Страница создана', 'success'); },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка', 'error'),
  });

  const updatePageMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<KnowledgePage> }) => {
      await axios.patch(`${API_URL}/api/knowledge-base/pages/${id}`, data);
    },
    onSuccess: () => { invalidate(); setShowPageModal(null); setEditingContent(false); showToast('Сохранено', 'success'); },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка', 'error'),
  });

  const deletePageMutation = useMutation({
    mutationFn: async (id: number) => {
      await axios.delete(`${API_URL}/api/knowledge-base/pages/${id}`);
    },
    onSuccess: () => { invalidate(); setConfirmDeletePage(null); setSelectedPage(null); showToast('Удалено', 'success'); },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка', 'error'),
  });

  const rootFolders = folders.filter(f => !f.parent_id);
  const getChildFolders = (parentId: number) => folders.filter(f => f.parent_id === parentId);
  const getPagesInFolder = (folderId: number | null) => pages.filter(p => p.folder_id === folderId);
  const rootPages = pages.filter(p => !p.folder_id);

  const selectedFolderPages = selectedFolderId !== null ? getPagesInFolder(selectedFolderId) : [];

  const handleSavePageContent = () => {
    if (!selectedPage) return;
    updatePageMutation.mutate({ id: selectedPage.id, data: { content: pageContent } });
  };

  const renderFolder = (folder: KnowledgeFolder, level: number = 0) => {
    const childFolders = getChildFolders(folder.id);
    const folderPages = getPagesInFolder(folder.id);
    const isSelected = selectedFolderId === folder.id;

    return (
      <div key={folder.id}>
        <div
          className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-100 ${isSelected ? 'bg-blue-50' : ''}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => setSelectedFolderId(folder.id)}
        >
          <span className="text-sm">📁</span>
          <span className="text-sm flex-1 truncate">{folder.name}</span>
          <button
            onClick={(e) => { e.stopPropagation(); setShowFolderModal(folder); }}
            className="text-xs px-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 rounded"
          >
            ✏️
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDeleteFolder(folder.id); }}
            className="text-xs px-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded"
          >
            🗑️
          </button>
        </div>
        {childFolders.map(f => renderFolder(f, level + 1))}
      </div>
    );
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-140px)]">
      {/* Sidebar - Folders */}
      <div className="w-64 bg-white border rounded-lg flex flex-col">
        <div className="p-3 border-b flex items-center justify-between">
          <h3 className="font-medium">Папки</h3>
          <button
            onClick={() => setShowFolderModal({ id: 0, name: '', parent_id: null, order: 0, created_at: null, updated_at: null } as any)}
            className="text-sm px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            +
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div
            className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-100 ${selectedFolderId === null ? 'bg-blue-50' : ''}`}
            onClick={() => setSelectedFolderId(null)}
          >
            <span className="text-sm">📚</span>
            <span className="text-sm">Все страницы</span>
          </div>
          {rootFolders.map(f => renderFolder(f))}
        </div>
      </div>

      {/* Main Content - Pages */}
      <div className="flex-1 bg-white border rounded-lg flex flex-col">
        <div className="p-3 border-b flex items-center justify-between">
          <h3 className="font-medium">
            {selectedFolderId ? folders.find(f => f.id === selectedFolderId)?.name : 'Все страницы'}
          </h3>
          <button
            onClick={() => setShowPageModal({ id: 0, title: '', content: '', folder_id: selectedFolderId, order: 0 } as any)}
            className="text-sm px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + Страница
          </button>
        </div>

        {/* Pages List */}
        {selectedPage ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b flex items-center justify-between bg-gray-50">
              <h2 className="font-semibold">{selectedPage.title}</h2>
              <div className="flex gap-1">
                <button
                  onClick={() => { setEditingContent(true); setPageContent(selectedPage.content || ''); }}
                  className="px-2 py-1 text-sm border rounded hover:bg-gray-100"
                >
                  ✏️ Редактировать
                </button>
                <button
                  onClick={() => setShowPageModal(selectedPage)}
                  className="px-2 py-1 text-sm border rounded hover:bg-gray-100"
                >
                  ⚙️
                </button>
                <button
                  onClick={() => setConfirmDeletePage(selectedPage.id)}
                  className="px-2 py-1 text-sm border rounded hover:bg-red-50 hover:text-red-600"
                >
                  🗑️
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {editingContent ? (
                <div className="space-y-2">
                  <textarea
                    value={pageContent}
                    onChange={(e) => setPageContent(e.target.value)}
                    className="w-full h-96 border rounded-lg p-3 font-mono text-sm"
                    placeholder="Содержимое страницы (Markdown)..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditingContent(false); }}
                      className="px-3 py-1.5 border rounded"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={handleSavePageContent}
                      disabled={updatePageMutation.isPending}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50"
                    >
                      {updatePageMutation.isPending ? '...' : 'Сохранить'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="prose max-w-none">
                  <pre className="whitespace-pre-wrap text-sm">{selectedPage.content || 'Пустая страница'}</pre>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3">
            {(selectedFolderId !== null ? selectedFolderPages : rootPages).length === 0 ? (
              <p className="text-gray-400 text-center py-8">Нет страниц</p>
            ) : (
              <div className="space-y-2">
                {(selectedFolderId !== null ? selectedFolderPages : rootPages).map(page => (
                  <div
                    key={page.id}
                    className="p-3 border rounded-lg cursor-pointer hover:border-blue-300 hover:bg-blue-50"
                    onClick={() => setSelectedPage(page)}
                  >
                    <h4 className="font-medium">{page.title}</h4>
                    {page.content && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{page.content}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      Обновлено {timeAgo(page.updated_at || '')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Folder Modal */}
      {showFolderModal && (
        <Modal onClose={() => setShowFolderModal(null)}>
          <h2 className="text-lg font-bold mb-4">
            {showFolderModal.id ? 'Редактировать папку' : 'Новая папка'}
          </h2>
          <input
            type="text"
            value={showFolderModal.name}
            onChange={(e) => setShowFolderModal({ ...showFolderModal, name: e.target.value })}
            placeholder="Название папки"
            className="w-full border rounded-lg px-3 py-2 mb-3"
            autoFocus
          />
          <div className="mb-4">
            <label className="text-sm text-gray-500 block mb-1">Родительская папка</label>
            <select
              value={showFolderModal.parent_id || ''}
              onChange={(e) => setShowFolderModal({ ...showFolderModal, parent_id: e.target.value ? Number(e.target.value) : null })}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">Корень</option>
              {folders.filter(f => f.id !== showFolderModal.id).map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowFolderModal(null)} className="px-3 py-2 text-gray-500">Отмена</button>
            <button
              onClick={() => {
                if (!showFolderModal.name.trim()) return;
                if (showFolderModal.id) {
                  updateFolderMutation.mutate({ id: showFolderModal.id, data: { name: showFolderModal.name, parent_id: showFolderModal.parent_id } });
                } else {
                  createFolderMutation.mutate({ name: showFolderModal.name, parent_id: showFolderModal.parent_id || undefined });
                }
              }}
              disabled={!showFolderModal.name.trim() || createFolderMutation.isPending || updateFolderMutation.isPending}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              {showFolderModal.id ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </Modal>
      )}

      {/* Page Modal */}
      {showPageModal && (
        <Modal onClose={() => setShowPageModal(null)}>
          <h2 className="text-lg font-bold mb-4">
            {showPageModal.id ? 'Редактировать страницу' : 'Новая страница'}
          </h2>
          <input
            type="text"
            value={showPageModal.title}
            onChange={(e) => setShowPageModal({ ...showPageModal, title: e.target.value })}
            placeholder="Заголовок"
            className="w-full border rounded-lg px-3 py-2 mb-3"
            autoFocus
          />
          <div className="mb-4">
            <label className="text-sm text-gray-500 block mb-1">Папка</label>
            <select
              value={showPageModal.folder_id || ''}
              onChange={(e) => setShowPageModal({ ...showPageModal, folder_id: e.target.value ? Number(e.target.value) : null })}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">Без папки</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowPageModal(null)} className="px-3 py-2 text-gray-500">Отмена</button>
            <button
              onClick={() => {
                if (!showPageModal.title.trim()) return;
                if (showPageModal.id) {
                  updatePageMutation.mutate({ id: showPageModal.id, data: { title: showPageModal.title, folder_id: showPageModal.folder_id } });
                } else {
                  createPageMutation.mutate({ title: showPageModal.title, folder_id: showPageModal.folder_id || undefined });
                }
              }}
              disabled={!showPageModal.title.trim() || createPageMutation.isPending || updatePageMutation.isPending}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              {showPageModal.id ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Folder Confirm */}
      {confirmDeleteFolder && (
        <Modal onClose={() => setConfirmDeleteFolder(null)}>
          <h2 className="text-lg font-bold mb-4">Удалить папку?</h2>
          <p className="text-gray-500 mb-4">Все страницы в этой папке также будут удалены.</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmDeleteFolder(null)} className="px-3 py-2 text-gray-500">Отмена</button>
            <button
              onClick={() => deleteFolderMutation.mutate(confirmDeleteFolder)}
              disabled={deleteFolderMutation.isPending}
              className="px-3 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50"
            >
              {deleteFolderMutation.isPending ? '...' : 'Удалить'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Page Confirm */}
      {confirmDeletePage && (
        <Modal onClose={() => setConfirmDeletePage(null)}>
          <h2 className="text-lg font-bold mb-4">Удалить страницу?</h2>
          <p className="text-gray-500 mb-4">Это действие необратимо.</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmDeletePage(null)} className="px-3 py-2 text-gray-500">Отмена</button>
            <button
              onClick={() => deletePageMutation.mutate(confirmDeletePage)}
              disabled={deletePageMutation.isPending}
              className="px-3 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50"
            >
              {deletePageMutation.isPending ? '...' : 'Удалить'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}