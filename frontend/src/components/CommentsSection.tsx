import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../constants/taskDisplay';
import { timeAgo } from '../utils/dateUtils';

interface CommentsSectionProps {
  taskId: number;
  myUserId: number | null;
  users: any[];
}

export function CommentsSection({ taskId, myUserId, users }: CommentsSectionProps) {
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const queryClient = useQueryClient();

  const { data: comments = [] } = useQuery<any[]>({
    queryKey: ['comments', taskId],
    queryFn: async () => (await axios.get(`${API_URL}/api/tasks/${taskId}/comments`)).data,
    staleTime: 10000,
  });

  const addComment = useMutation({
    mutationFn: async (body: { text: string; author_name?: string; author_telegram_id?: number }) =>
      (await axios.post(`${API_URL}/api/tasks/${taskId}/comments`, body)).data,
    onSuccess: () => {
      setText('');
      queryClient.invalidateQueries({ queryKey: ['comments', taskId] });
    },
  });

  const editComment = useMutation({
    mutationFn: async ({ id, text: newText }: { id: number; text: string }) =>
      (await axios.put(`${API_URL}/api/tasks/${taskId}/comments/${id}`, { text: newText })).data,
    onSuccess: () => {
      setEditingId(null);
      setEditingText('');
      queryClient.invalidateQueries({ queryKey: ['comments', taskId] });
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (id: number) =>
      (await axios.delete(`${API_URL}/api/tasks/${taskId}/comments/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', taskId] });
    },
  });

  const authorName = myUserId ? (users.find((u: any) => u.telegram_id === myUserId)?.display_name ?? null) : null;

  const handleSubmit = () => {
    if (!text.trim()) return;
    addComment.mutate({ text: text.trim(), author_name: authorName ?? undefined, author_telegram_id: myUserId ?? undefined });
  };

  const handleStartEdit = (c: any) => {
    setEditingId(c.id);
    setEditingText(c.text);
  };

  const handleSaveEdit = () => {
    if (!editingText.trim() || editingId === null) return;
    editComment.mutate({ id: editingId, text: editingText.trim() });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };

  const canEditComment = (c: any) => myUserId === null || c.author_telegram_id === myUserId;

  return (
    <div className="mb-4">
      <label className="text-xs text-gray-500 font-medium block mb-2">💬 Комментарии {comments.length > 0 ? `(${comments.length})` : ''}</label>
      {comments.length > 0 && (
        <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
          {comments.map((c: any) => (
            <div key={c.id} className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-700">{c.author_name || 'Аноним'}</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">{timeAgo(c.created_at)}</span>
                  {canEditComment(c) && editingId !== c.id && (
                    <>
                      <button
                        onClick={() => handleStartEdit(c)}
                        aria-label="Редактировать комментарий"
                        className="ml-1 p-0.5 text-gray-400 hover:text-blue-500 transition leading-none"
                      >✏️</button>
                      <button
                        onClick={() => deleteComment.mutate(c.id)}
                        disabled={deleteComment.isPending}
                        aria-label="Удалить комментарий"
                        className="p-0.5 text-gray-400 hover:text-red-500 transition leading-none disabled:opacity-40"
                      >🗑️</button>
                    </>
                  )}
                </div>
              </div>
              {editingId === c.id ? (
                <div className="mt-1 flex flex-col gap-1">
                  <textarea
                    value={editingText}
                    onChange={e => setEditingText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); } if (e.key === 'Escape') handleCancelEdit(); }}
                    className="w-full px-2 py-1 border rounded text-sm resize-none"
                    rows={2}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      disabled={!editingText.trim() || editComment.isPending}
                      className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs disabled:opacity-40 hover:bg-blue-700 transition"
                    >Сохранить</button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300 transition"
                    >Отмена</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.text}</p>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          placeholder="Написать комментарий... (Enter — отправить, Shift+Enter — перенос)"
          className="flex-1 px-3 py-2 border rounded-lg text-sm resize-none"
          rows={2}
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || addComment.isPending}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-40 hover:bg-blue-700 transition shrink-0"
        >↑</button>
      </div>
    </div>
  );
}
