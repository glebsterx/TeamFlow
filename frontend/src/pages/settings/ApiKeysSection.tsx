import React from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '../../constants/taskDisplay';
import { showToast } from '../../utils/toast';
import { parseUTC } from '../../utils/dateUtils';

interface ApiKey {
  id: number;
  key: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  last_used_at?: string;
}

// ========== API KEYS COMPONENT ==========
function ApiKeysSection() {
  const queryClient = useQueryClient();
  const [showNewKey, setShowNewKey] = React.useState(false);
  const [newKeyName, setNewKeyName] = React.useState('');
  const [newKeyDesc, setNewKeyDesc] = React.useState('');
  const [generatedKey, setGeneratedKey] = React.useState<string | null>(null);

  const { data: apiKeys = [] } = useQuery<ApiKey[]>({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/api/api-keys`);
      return res.data;
    },
  });

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      showToast('Введите название ключа', 'warning');
      return;
    }
    try {
      const res = await axios.post(`${API_URL}/api/api-keys`, {
        name: newKeyName.trim(),
        description: newKeyDesc.trim() || undefined,
      });
      setGeneratedKey(res.data.key);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setNewKeyName('');
      setNewKeyDesc('');
      setShowNewKey(false);
      showToast('API-ключ создан', 'success');
    } catch {
      showToast('Ошибка при создании', 'error');
    }
  };

  const handleDeleteKey = async (keyId: number) => {
    if (!confirm('Удалить API-ключ?')) return;
    try {
      await axios.delete(`${API_URL}/api/api-keys/${keyId}`);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      showToast('Ключ удалён', 'success');
    } catch {
      showToast('Ошибка при удалении', 'error');
    }
  };

  const handleToggleKey = async (key: ApiKey) => {
    try {
      await axios.patch(`${API_URL}/api/api-keys/${key.id}`, {
        is_active: !key.is_active,
      });
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      showToast(key.is_active ? 'Ключ деактивирован' : 'Ключ активирован', 'success');
    } catch {
      showToast('Ошибка', 'error');
    }
  };

  const handleRegenerateKey = async (keyId: number) => {
    if (!confirm('Перегенерировать ключ? Старый перестанет работать.')) return;
    try {
      const res = await axios.get(`${API_URL}/api/api-keys/${keyId}/regenerate`);
      setGeneratedKey(res.data.key);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      showToast('Ключ перегенерирован', 'success');
    } catch {
      showToast('Ошибка', 'error');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Скопировано', 'success');
    } catch {
      showToast('Не удалось скопировать', 'error');
    }
  };

  return (
    <section className="bg-white border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-base">🔑 API-ключи</h3>
        <button
          onClick={() => { setShowNewKey(true); setGeneratedKey(null); }}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >+ Ключ</button>
      </div>

      {showNewKey && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="space-y-2">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Название (например: AI Assistant)"
              className="w-full px-3 py-2 border rounded-lg text-sm"
              autoFocus
            />
            <input
              type="text"
              value={newKeyDesc}
              onChange={(e) => setNewKeyDesc(e.target.value)}
              placeholder="Описание (необязательно)"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateKey}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >Создать</button>
              <button
                onClick={() => { setShowNewKey(false); setNewKeyName(''); setNewKeyDesc(''); }}
                className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
              >Отмена</button>
            </div>
          </div>
        </div>
      )}

      {generatedKey && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="text-sm text-green-800 font-medium mb-2">
            🔑 Сохраните ключ! Он показывается только один раз.
          </div>
          <div className="flex gap-2">
            <code className="flex-1 px-3 py-2 bg-white border rounded text-xs font-mono break-all">
              {generatedKey}
            </code>
            <button
              onClick={() => copyToClipboard(generatedKey)}
              className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 whitespace-nowrap"
            >📋 Копия</button>
          </div>
          <button
            onClick={() => setGeneratedKey(null)}
            className="mt-2 text-xs text-green-600 hover:underline"
          >Я сохранил(а)</button>
        </div>
      )}

      <div className="space-y-2">
        {apiKeys.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Нет API-ключей</p>
        ) : (
          apiKeys.map(key => (
            <div
              key={key.id}
              className={`flex items-center gap-3 p-3 border rounded-lg ${key.is_active ? 'bg-white' : 'bg-gray-50 opacity-75'}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{key.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${key.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                    {key.is_active ? 'Активен' : 'Деактивирован'}
                  </span>
                </div>
                {key.description && (
                  <div className="text-xs text-gray-500 truncate mt-1">{key.description}</div>
                )}
                <div className="text-xs text-gray-400 mt-1 font-mono">
                  {key.key}...
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Создан: {parseUTC(key.created_at).toLocaleDateString('ru')}
                  {key.last_used_at && (
                    <span className="ml-2">· Использован: {parseUTC(key.last_used_at).toLocaleDateString('ru')}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleToggleKey(key)}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                  title={key.is_active ? 'Деактивировать' : 'Активировать'}
                >{key.is_active ? '🚫' : '✅'}</button>
                <button
                  onClick={() => handleRegenerateKey(key.id)}
                  className="px-2 py-1 text-xs text-blue-500 hover:text-blue-700"
                  title="Перегенерировать"
                >🔄</button>
                <button
                  onClick={() => handleDeleteKey(key.id)}
                  className="px-2 py-1 text-xs text-red-500 hover:text-red-700"
                  title="Удалить"
                >🗑️</button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default ApiKeysSection;
