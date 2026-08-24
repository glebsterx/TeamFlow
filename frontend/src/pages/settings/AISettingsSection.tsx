import React from 'react';
import axios from 'axios';
import { API_URL } from '../../constants/taskDisplay';
import { showToast } from '../../utils/toast';

// ========== AI SETTINGS COMPONENT ==========
function AISettingsSection() {
  const [ai, setAi] = React.useState({
    ai_api_key: '',
    ai_provider: 'openrouter',
    ai_model: 'qwen/qwen3-coder:free',
    ai_custom_endpoint: '',
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [freeModels, setFreeModels] = React.useState<string[]>([]);
  const [paidModels, setPaidModels] = React.useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [showCustom, setShowCustom] = React.useState(false);
  const [showFree, setShowFree] = React.useState(true);
  const [showPaid, setShowPaid] = React.useState(true);

  React.useEffect(() => {
    axios.get(`${API_URL}/api/settings/ai`)
      .then(r => {
        const data = r.data;
        setAi({
          ai_api_key: data.ai_api_key || '',
          ai_provider: data.ai_provider || 'openrouter',
          ai_model: data.ai_model || 'qwen/qwen3-coder:free',
          ai_custom_endpoint: data.ai_custom_endpoint || '',
        });
        setShowCustom(data.ai_provider === 'custom');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadModels = async () => {
    if (!ai.ai_api_key && ai.ai_provider !== 'custom') {
      showToast('Сначала введите API ключ', 'warning');
      return;
    }
    if (ai.ai_provider === 'custom' && !ai.ai_custom_endpoint) {
      showToast('Введите кастомный endpoint', 'warning');
      return;
    }
    setModelsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/ai/models`, {
        params: {
          provider: ai.ai_provider,
          custom_endpoint: ai.ai_custom_endpoint,
        },
        headers: { 'X-API-Key': ai.ai_api_key },
      });
      if (ai.ai_provider === 'custom') {
        setFreeModels(res.data.models || []);
        setPaidModels([]);
      } else {
        setFreeModels(res.data.free_models || []);
        setPaidModels(res.data.paid_models || []);
      }
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка загрузки моделей', 'error');
    } finally {
      setModelsLoading(false);
    }
  };

  // Deliberately excludes ai.ai_api_key/loadModels: this should refetch when
  // switching provider/endpoint, not on every keystroke while typing the key.
  React.useEffect(() => {
    if ((ai.ai_api_key || ai.ai_provider === 'custom') && (ai.ai_provider !== 'custom' || ai.ai_custom_endpoint)) {
      loadModels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.ai_provider, ai.ai_custom_endpoint]);

  const handleSave = async () => {
    setSaving('saving');
    try {
      await axios.post(`${API_URL}/api/settings/ai`, ai);
      setSaving('saved');
      setTimeout(() => setSaving('idle'), 2500);
    } catch {
      setSaving('error');
      setTimeout(() => setSaving('idle'), 2500);
    }
  };

  if (loading) return <div className="text-center py-8 text-gray-400">Загрузка...</div>;

  const providers = [
    { value: 'openrouter', label: 'OpenRouter (рекомендуется, много бесплатных моделей)' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'custom', label: 'Свой (OpenAI-совместимый)' },
  ];

  const defaultModels: Record<string, string[]> = {
    openrouter: ['qwen/qwen3-coder:free', 'google/gemma-3n-e4b-it:free', 'meta-llama/llama-3.1-8b-instruct:free', 'mistralai/mistral-nemo-minitron-8b:free'],
    openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    anthropic: ['claude-3-haiku', 'claude-3-sonnet', 'claude-3-opus'],
  };

  const availableModels = (freeModels.length > 0 || paidModels.length > 0) 
    ? [...(showFree ? freeModels : []), ...(showPaid ? paidModels : [])]
    : (defaultModels[ai.ai_provider] || []);

  const totalFree = freeModels.length || defaultModels[ai.ai_provider]?.filter(m => m.includes(':free')).length || 0;
  const totalPaid = paidModels.length || 0;

  return (
    <section className="bg-white border rounded-xl p-5">
      <h3 className="font-semibold text-base mb-4">🤖 AI Настройки</h3>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Провайдер</label>
          <select
            value={ai.ai_provider}
            onChange={e => {
              const prov = e.target.value;
              setAi(prev => ({ ...prev, ai_provider: prov, ai_model: '' }));
              setShowCustom(prov === 'custom');
            }}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            {providers.map(p => (<option key={p.value} value={p.value}>{p.label}</option>))}
          </select>
        </div>

        {showCustom && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">Custom Endpoint (OpenAI-совместимый)</label>
            <input
              type="text"
              value={ai.ai_custom_endpoint}
              onChange={e => setAi(prev => ({ ...prev, ai_custom_endpoint: e.target.value }))}
              placeholder="https://api.example.com/v1"
              className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
            />
          </div>
        )}

        {!showCustom && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">API Key</label>
            <input
              type="password"
              value={ai.ai_api_key}
              onChange={e => setAi(prev => ({ ...prev, ai_api_key: e.target.value }))}
              placeholder={ai.ai_provider === 'openrouter' ? 'sk-or-v1-...' : 'sk-...'}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              autoComplete="new-password"
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-500">Модель</label>
            <button
              onClick={loadModels}
              disabled={modelsLoading}
              className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
            >
              {modelsLoading ? 'Загрузка...' : '🔄 Обновить'}
            </button>
          </div>
          
          {(freeModels.length > 0 || paidModels.length > 0) && ai.ai_provider === 'openrouter' && (
            <div className="flex gap-4 mb-2 text-xs">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showFree} onChange={e => setShowFree(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                <span className="text-green-600">Бесплатные ({totalFree})</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showPaid} onChange={e => setShowPaid(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                <span className="text-blue-600">Платные ({totalPaid})</span>
              </label>
            </div>
          )}
          
          <select
            value={ai.ai_model}
            onChange={e => setAi(prev => ({ ...prev, ai_model: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">-- Выберите модель --</option>
            {availableModels.map(m => (
              <option key={m} value={m}>{m}{m.includes(':free') ? ' (бесплатно)' : ''}</option>
            ))}
          </select>
          
          {(freeModels.length > 0 || paidModels.length > 0) && (
            <p className="text-xs text-green-600 mt-1">
              ✓ Загружено: {totalFree} бесплатных, {totalPaid} платных
            </p>
          )}
        </div>

        <button onClick={handleSave} disabled={saving === 'saving'} className={`w-full py-2.5 rounded-lg text-sm font-medium transition ${saving === 'saved' ? 'bg-green-600 text-white' : saving === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
          {saving === 'saving' ? '⏳ Сохранение...' : saving === 'saved' ? '✓ Сохранено' : saving === 'error' ? '✗ Ошибка' : '💾 Сохранить'}
        </button>
      </div>
    </section>
  );
}

export default AISettingsSection;
