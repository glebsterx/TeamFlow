import React from 'react';
import axios from 'axios';
import { API_URL } from '../../constants/taskDisplay';

// ========== OAUTH SETTINGS COMPONENT ==========
function OAuthSettingsSection() {
  const [oauth, setOauth] = React.useState({
    google_client_id: '', google_client_secret: '', google_redirect_uri: '',
    yandex_client_id: '', yandex_client_secret: '', yandex_redirect_uri: '',
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  React.useEffect(() => {
    axios.get(`${API_URL}/api/auth/oauth-settings`)
      .then(r => setOauth(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving('saving');
    try {
      await axios.put(`${API_URL}/api/auth/oauth-settings`, oauth);
      setSaving('saved');
      setTimeout(() => setSaving('idle'), 2500);
    } catch {
      setSaving('error');
      setTimeout(() => setSaving('idle'), 2500);
    }
  };

  if (loading) return <div className="text-center py-8 text-gray-400">Загрузка...</div>;

  return (
    <section className="bg-white border rounded-xl p-5">
      <h3 className="font-semibold text-base mb-4">🔐 OAuth (Google / Yandex)</h3>
      <div className="space-y-6">
        {/* Google */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Google</h4>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Client ID</label>
              <input type="text" value={oauth.google_client_id} onChange={e => setOauth(prev => ({ ...prev, google_client_id: e.target.value }))} placeholder="xxxx.apps.googleusercontent.com" className="w-full px-3 py-2 border rounded-lg text-sm" autoComplete="off" name="google_client_id_field" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Client Secret</label>
              <input type="password" value={oauth.google_client_secret} onChange={e => setOauth(prev => ({ ...prev, google_client_secret: e.target.value }))} placeholder="GOCSPX-..." className="w-full px-3 py-2 border rounded-lg text-sm" autoComplete="new-password" name="google_client_secret_field" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Redirect URI <span className="text-gray-400">(скопируй в Google Console)</span></label>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border rounded-lg text-sm font-mono text-gray-700 select-all">
                <span className="flex-1 truncate">{oauth.google_redirect_uri || 'https://your-domain/api/auth/google/callback'}</span>
                <button onClick={() => navigator.clipboard.writeText(oauth.google_redirect_uri || 'https://your-domain/api/auth/google/callback')} className="px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 text-xs" title="Копировать">📋</button>
              </div>
            </div>
            <button onClick={() => setOauth(prev => ({ ...prev, google_client_id: '', google_client_secret: '', google_redirect_uri: '' }))} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition">
              🗑 Очистить Google
            </button>
          </div>
        </div>

        {/* Yandex */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Яндекс</h4>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Client ID</label>
              <input type="text" value={oauth.yandex_client_id} onChange={e => setOauth(prev => ({ ...prev, yandex_client_id: e.target.value }))} placeholder="xxxxxxxxxxxxxxxx" className="w-full px-3 py-2 border rounded-lg text-sm" autoComplete="off" name="yandex_client_id_field" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Client Secret</label>
              <input type="password" value={oauth.yandex_client_secret} onChange={e => setOauth(prev => ({ ...prev, yandex_client_secret: e.target.value }))} placeholder="xxxxxxxxxxxxxxxx" className="w-full px-3 py-2 border rounded-lg text-sm" autoComplete="new-password" name="yandex_client_secret_field" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Redirect URI <span className="text-gray-400">(скопируй в Yandex OAuth)</span></label>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border rounded-lg text-sm font-mono text-gray-700 select-all">
                <span className="flex-1 truncate">{oauth.yandex_redirect_uri || 'https://your-domain/api/auth/yandex/callback'}</span>
                <button onClick={() => navigator.clipboard.writeText(oauth.yandex_redirect_uri || 'https://your-domain/api/auth/yandex/callback')} className="px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 text-xs" title="Копировать">📋</button>
              </div>
            </div>
            <button onClick={() => setOauth(prev => ({ ...prev, yandex_client_id: '', yandex_client_secret: '', yandex_redirect_uri: '' }))} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition">
              🗑 Очистить Яндекс
            </button>
          </div>
        </div>

<button onClick={handleSave} disabled={saving === 'saving'} className={`w-full py-2.5 rounded-lg text-sm font-medium transition ${saving === 'saved' ? 'bg-green-600 text-white' : saving === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
          {saving === 'saving' ? '⏳ Сохранение...' : saving === 'saved' ? '✓ Сохранено' : saving === 'error' ? '✗ Ошибка' : '💾 Сохранить'}
        </button>
      </div>
    </section>
  );
}

export default OAuthSettingsSection;
