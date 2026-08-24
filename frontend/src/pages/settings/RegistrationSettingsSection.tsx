import React from 'react';
import axios from 'axios';
import { API_URL } from '../../constants/taskDisplay';

// ========== REGISTRATION SETTINGS COMPONENT ==========
function RegistrationSettingsSection() {
  const [inviteOnly, setInviteOnly] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<'idle' | 'saving' | 'saved'>('idle');

  React.useEffect(() => {
    axios.get(`${API_URL}/api/auth/registration-settings`)
      .then(r => setInviteOnly(r.data.invite_only))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async () => {
    const newValue = !inviteOnly;
    setInviteOnly(newValue);
    setSaving('saving');
    try {
      await axios.put(`${API_URL}/api/auth/registration-settings`, { invite_only: newValue });
      setSaving('saved');
      setTimeout(() => setSaving('idle'), 2000);
    } catch {
      setInviteOnly(!newValue);
      setSaving('idle');
    }
  };

  if (loading) return <div className="text-center py-4 text-gray-400">Загрузка...</div>;

  return (
    <section className="bg-white border rounded-xl p-5">
      <h3 className="font-semibold text-base mb-4">🔒 Регистрация</h3>
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <p className="font-medium text-gray-800">Только по приглашениям</p>
          <p className="text-xs text-gray-500">Новые пользователи смогут зарегистрироваться только по приглашению</p>
        </div>
        <button
          onClick={handleToggle}
          className={`relative w-12 h-6 rounded-full transition ${inviteOnly ? 'bg-blue-600' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition ${inviteOnly ? 'left-7' : 'left-1'}`} />
        </button>
      </div>
      {saving === 'saved' && <p className="text-xs text-green-600 mt-2">Сохранено</p>}
    </section>
  );
}

export default RegistrationSettingsSection;
