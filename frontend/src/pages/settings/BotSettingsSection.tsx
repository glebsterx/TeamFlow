import React from 'react';
import axios from 'axios';
import { API_URL } from '../../constants/taskDisplay';
import { showToast } from '../../utils/toast';

// ========== BOT SETTINGS COMPONENT ==========
function BotSettingsSection() {
  const [botToken, setBotToken] = React.useState('');
  const [maskedToken, setMaskedToken] = React.useState<string | null>(null);
  const [proxyUrl, setProxyUrl] = React.useState('');
  const [chatId, setChatId] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [savingToken, setSavingToken] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savingProxy, setSavingProxy] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [botStatus, setBotStatus] = React.useState<any>(null);

  React.useEffect(() => {
    Promise.all([
      axios.get(`${API_URL}/api/settings/proxy`),
      axios.get(`${API_URL}/api/bot-status`),
      axios.get(`${API_URL}/api/settings/bot-token`),
      axios.get(`${API_URL}/api/settings/system`)
    ]).then(([proxyRes, statusRes, tokenRes, systemRes]) => {
      setProxyUrl(proxyRes.data.proxy_url || '');
      setBotStatus(statusRes.data);
      setMaskedToken(tokenRes.data.token);
      setChatId(systemRes.data.telegram_chat_id || '');
    }).catch(() => {}).finally(() => setLoading(false));
    const interval = setInterval(() => {
      axios.get(`${API_URL}/api/bot-status`).then(r => setBotStatus(r.data)).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveBotToken = async () => {
    if (!botToken.trim()) return;
    setSavingToken('saving');
    try {
      await axios.put(`${API_URL}/api/settings/bot-token`, { token: botToken.trim() });
      setSavingToken('saved');
      setMaskedToken(botToken.substring(0, 4) + '••••');
      setBotToken('');
      setTimeout(() => setSavingToken('idle'), 2500);
    } catch { setSavingToken('error'); setTimeout(() => setSavingToken('idle'), 2500); }
  };

  const handleSaveProxy = async () => {
    if (!proxyUrl.trim()) return;
    setSavingProxy('saving');
    try {
      await axios.post(`${API_URL}/api/settings/proxy`, { proxy_url: proxyUrl.trim() || null });
      setSavingProxy('saved');
      setProxyUrl('');
      setTimeout(() => setSavingProxy('idle'), 2500);
    } catch { setSavingProxy('error'); setTimeout(() => setSavingProxy('idle'), 2500); }
  };

  if (loading) return <div className="text-center py-8 text-gray-400">Загрузка...</div>;

  return (
    <form autoComplete="off" onSubmit={e => e.preventDefault()}>
    <section className="bg-white border rounded-xl p-4">
      <h3 className="font-semibold text-sm mb-4">🤖 Telegram-бот</h3>
      <div className="space-y-4">
        {/* Status */}
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${botStatus?.ok ? 'bg-green-100 text-green-700' : botStatus?.error === 'Bot not started yet' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
            {botStatus?.ok ? '● Работает' : botStatus?.error === 'Bot not started yet' ? '◌ Запускается' : '● Нет связи'}
          </span>
          {botStatus?.username && <span className="text-sm text-gray-500">@{botStatus.username}</span>}
          {botStatus?.ok && botStatus.uptime_sec !== null && <span className="text-xs text-gray-400">Uptime: {botStatus.uptime_sec < 3600 ? `${Math.floor(botStatus.uptime_sec / 60)} мин` : `${(botStatus.uptime_sec / 3600).toFixed(1)} ч`}</span>}
        </div>

        {/* Token */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Bot Token</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
              onFocus={e => e.target.removeAttribute('readonly')}
              placeholder={maskedToken || 'Новый токен'}
              autoComplete="new-password"
              name="tf_bt"
              readOnly
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
            />
            <button onClick={handleSaveBotToken} disabled={savingToken === 'saving' || !botToken.trim()} className={`px-3 py-2 rounded-lg text-sm font-medium transition ${savingToken === 'saved' ? 'bg-green-600 text-white' : savingToken === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
              {savingToken === 'saving' ? '⏳' : savingToken === 'saved' ? '✓' : savingToken === 'error' ? '✗' : '💾'}
            </button>
          </div>
        </div>

        {/* Chat ID */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Chat ID</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatId}
              onChange={e => setChatId(e.target.value)}
              onFocus={e => e.target.removeAttribute('readonly')}
              placeholder="-1001234567890"
              autoComplete="off"
              name="tf_cid"
              readOnly
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
            />
            <button
              onClick={async () => {
                try {
                  await axios.put(`${API_URL}/api/settings/system`, {
                    deadline_notify_hours: '',
                    frontend_url: '',
                    telegram_chat_id: chatId,
                    cors_origins: '',
                    bot_username: '',
                  });
                  showToast('Chat ID сохранён', 'success');
                } catch {}
              }}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition"
            >💾</button>
          </div>
        </div>

        {/* Proxy */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Прокси</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={proxyUrl}
              onChange={e => setProxyUrl(e.target.value)}
              onFocus={e => e.target.removeAttribute('readonly')}
              placeholder="Новый прокси"
              autoComplete="new-password"
              name="tf_px"
              readOnly
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
            />
            <button onClick={handleSaveProxy} disabled={savingProxy === 'saving' || !proxyUrl.trim()} className={`px-3 py-2 rounded-lg text-sm font-medium transition ${savingProxy === 'saved' ? 'bg-green-600 text-white' : savingProxy === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
              {savingProxy === 'saving' ? '⏳' : savingProxy === 'saved' ? '✓' : savingProxy === 'error' ? '✗' : '💾'}
            </button>
          </div>
        </div>
      </div>
    </section>
    </form>
  );
}

export default BotSettingsSection;
