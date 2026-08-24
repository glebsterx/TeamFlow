import React from 'react';
import axios from 'axios';
import { API_URL } from '../../constants/taskDisplay';

// ========== BOT INFO SECTION ==========
function BotInfoSection() {
  const [maskedToken, setMaskedToken] = React.useState<string | null>(null);
  const [botStatus, setBotStatus] = React.useState<any>(null);
  const [proxyUrl, setProxyUrl] = React.useState('');
  const [proxyCheck, setProxyCheck] = React.useState<{ checking: boolean; reachable?: boolean; error?: string; latency_ms?: number }>({ checking: false });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([
      axios.get(`${API_URL}/api/settings/bot-token`),
      axios.get(`${API_URL}/api/bot-status`),
      axios.get(`${API_URL}/api/settings/proxy`)
    ]).then(([tok, stat, prox]) => {
      setMaskedToken(tok.data.token);
      setBotStatus(stat.data);
      setProxyUrl(prox.data.proxy_url || '');
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleCheckProxy = async () => {
    setProxyCheck({ checking: true });
    try {
      const r = await axios.get(`${API_URL}/api/settings/proxy/check`, { timeout: 20000 });
      setProxyCheck({ checking: false, ...r.data });
    } catch (e: any) { setProxyCheck({ checking: false, reachable: false, error: e?.message || 'Ошибка' }); }
  };

  const handleDeleteProxy = async () => {
    try {
      await axios.post(`${API_URL}/api/settings/proxy`, { proxy_url: null });
      setProxyUrl('');
      setProxyCheck({ checking: false });
    } catch {}
  };

  const handleDeleteBotToken = async () => {
    try {
      await axios.put(`${API_URL}/api/settings/bot-token`, { token: '' });
      setMaskedToken(null);
    } catch {}
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-400">Загрузка...</div>;
  }

  return (
    <section className="bg-white border rounded-xl p-4">
      <h3 className="font-semibold text-sm mb-3">📋 Информация</h3>
      <div className="space-y-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">Username</p>
          <p className="text-sm text-gray-700">{botStatus?.username || 'Не настроен'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Токен</p>
          <div className="flex items-center gap-2">
            <p className="text-sm text-gray-500 font-mono truncate">{maskedToken || 'Из .env'}</p>
            <div className="flex gap-1 shrink-0">
              <div className="w-6" />
              {maskedToken && (
                <button onClick={handleDeleteBotToken} className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded" title="Удалить из БД, использовать .env">✕</button>
              )}
              {!maskedToken && <div className="w-6" />}
            </div>
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Прокси</p>
          {proxyUrl ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700 font-mono text-xs">{proxyUrl.split('@').pop() || proxyUrl}</p>
              <div className="flex gap-1">
                <button onClick={handleCheckProxy} disabled={proxyCheck.checking} className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50" title="Проверить">🔍</button>
                <button onClick={handleDeleteProxy} className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded" title="Удалить">✕</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">Не используется</p>
              <div className="flex gap-1">
                <div className="w-6" />
              </div>
            </div>
          )}
          {proxyCheck.reachable !== undefined && !proxyCheck.checking && (
            <div className={`text-xs mt-1 px-2 py-1 rounded ${proxyCheck.reachable ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {proxyCheck.reachable ? `✅ Доступен (${proxyCheck.latency_ms}мс)` : `❌ ${proxyCheck.error || 'Недоступен'}`}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default BotInfoSection;
