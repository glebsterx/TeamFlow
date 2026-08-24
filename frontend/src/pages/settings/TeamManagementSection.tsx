import React from 'react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '../../constants/taskDisplay';
import { showToast } from '../../utils/toast';
import { parseUTC } from '../../utils/dateUtils';

interface TeamMember {
  id: number;
  telegram_user_id: number;
  role: string;
  joined_at: string;
  invited_by_id: number | null;
  user?: {
    id: number;
    username: string | null;
    first_name: string;
    last_name: string | null;
    display_name: string;
  } | null;
}

interface TeamInvite {
  id: number;
  invite_token: string;
  telegram_username: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  invite_url: string;
}

const ROLE_COLORS: { [key: string]: string } = {
  owner: 'bg-purple-100 text-purple-700 border-purple-200',
  admin: 'bg-red-100 text-red-700 border-red-200',
  member: 'bg-blue-100 text-blue-700 border-blue-200',
  viewer: 'bg-gray-100 text-gray-700 border-gray-200',
};

const ROLE_LABELS: { [key: string]: string } = {
  owner: '👑 Владелец',
  admin: '🔹 Админ',
  member: '👤 Участник',
  viewer: '👁 Наблюдатель',
};

// ========== TEAM MANAGEMENT COMPONENT ==========
function TeamManagementSection() {
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = React.useState(false);
  const [inviteUsername, setInviteUsername] = React.useState('');
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState('member');
  const [generatedInvite, setGeneratedInvite] = React.useState<TeamInvite | null>(null);
  const [myUserId] = React.useState<number | null>(() => {
    const saved = localStorage.getItem('teamflow_my_user_id');
    return saved ? Number(saved) : null;
  });
  const [myRole, setMyRole] = React.useState<string | null>(null);
  const [isLoadingRole, setIsLoadingRole] = React.useState(true);

  // Загрузка участников команды
  const { data: teamMembers = [], isLoading: teamMembersLoading } = useQuery<TeamMember[]>({
    queryKey: ['team-members'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/api/auth/team`);
      return res.data as TeamMember[];
    },
  });

  // Загрузка моей роли
  React.useEffect(() => {
    if (teamMembers && myUserId) {
                  const me = teamMembers.find(m => m.user?.id === myUserId);
      setMyRole(me?.role || null);
      setIsLoadingRole(false);
    } else if (teamMembers && !myUserId) {
      setIsLoadingRole(false);
    }
  }, [teamMembers, myUserId]);

  const canManage = !isLoadingRole && (myRole === 'owner' || myRole === 'admin');

  const { data: invites = [], isLoading: invitesLoading } = useQuery({
    queryKey: ['team-invites'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/api/auth/team/invites`);
      return res.data as TeamInvite[];
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: number) => {
      await axios.delete(`${API_URL}/api/auth/team/members/${memberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      showToast('Участник удалён из команды', 'success');
    },
    onError: () => showToast('Ошибка при удалении участника', 'error'),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: number; role: string }) => {
      await axios.patch(`${API_URL}/api/auth/team/members/${memberId}/role?new_role=${role}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      showToast('Роль участника обновлена', 'success');
    },
    onError: () => showToast('Ошибка при обновлении роли', 'error'),
  });

  const cancelInviteMutation = useMutation({
    mutationFn: async (inviteId: number) => {
      await axios.delete(`${API_URL}/api/auth/team/invites/${inviteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invites'] });
      showToast('Приглашение отменено', 'success');
    },
    onError: () => showToast('Ошибка при отмене приглашения', 'error'),
  });

  const createInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await axios.post(`${API_URL}/api/auth/team/invite`, {
        telegram_username: inviteUsername || null,
        email: inviteEmail || null,
        role: inviteRole,
      });
      return res.data as TeamInvite;
    },
    onSuccess: (data) => {
      setGeneratedInvite(data);
      queryClient.invalidateQueries({ queryKey: ['team-invites'] });
      showToast('Приглашение создано', 'success');
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || 'Ошибка при создании приглашения', 'error'),
  });

  const handleCreateInvite = () => {
    if (!inviteUsername.trim() && !inviteEmail.trim()) {
      showToast('Укажите username или email', 'warning');
      return;
    }
    createInviteMutation.mutate();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Скопировано в буфер', 'success');
    } catch {
      showToast('Не удалось скопировать', 'error');
    }
  };

  const getDisplayName = (member: TeamMember) => {
    if (member.user?.display_name) return member.user.display_name;
    if (member.user?.username) return `@${member.user.username}`;
    return `User #${member.telegram_user_id}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-800">Участники команды</h3>
        {canManage && (
          <button
            onClick={() => {
              setShowInviteModal(true);
              setGeneratedInvite(null);
              setInviteUsername('');
              setInviteEmail('');
              setInviteRole('member');
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            + Пригласить
          </button>
        )}
      </div>

      {!canManage && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          🔒 Только владелец и администраторы могут управлять командой
        </div>
      )}

      {/* Участники */}
      <section className="bg-white border rounded-xl p-5 mb-6">
        {teamMembersLoading ? (
          <div className="text-center py-8 text-gray-400">Загрузка...</div>
        ) : teamMembers.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="mb-2">В команде пока нет участников</p>
            <p className="text-sm">Пригласите первого участника</p>
          </div>
        ) : (
          <div className="space-y-3">
            {teamMembers.map((member) => (
              <div key={member.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                    {getDisplayName(member).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800 truncate">{getDisplayName(member)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${ROLE_COLORS[member.role]}`}>
                        {ROLE_LABELS[member.role]}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      В команде с {parseUTC(member.joined_at).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {member.user?.username && <span className="ml-2">· @{member.user.username}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:ml-auto">
                  {canManage ? (
                    <>
                      <select
                        value={member.role}
                        onChange={(e) => updateRoleMutation.mutate({ memberId: member.id, role: e.target.value })}
                        className="px-3 py-1.5 border rounded-lg text-sm bg-white hover:border-blue-400 transition"
                      >
                        {Object.entries(ROLE_LABELS).map(([role, label]) => (
                          <option key={role} value={role}>{label.replace(/👑|🔹|👤|👁 /, '')}</option>
                        ))}
                      </select>
                      {member.role !== 'owner' && (
                        <button
                          onClick={() => { if (confirm(`Удалить ${getDisplayName(member)} из команды?`)) removeMemberMutation.mutate(member.id); }}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                          title="Удалить из команды"
                        >🗑️</button>
                      )}
                    </>
                  ) : (
                    <span className={`text-xs px-2 py-1 rounded-full border ${ROLE_COLORS[member.role]}`}>
                      {ROLE_LABELS[member.role]}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Приглашения */}
      <section className="bg-white border rounded-xl p-5">
        <h4 className="text-md font-semibold text-gray-800 mb-4">Активные приглашения</h4>
        {invitesLoading ? (
          <div className="text-center py-8 text-gray-400">Загрузка...</div>
        ) : invites.length === 0 ? (
          <div className="text-center py-8 text-gray-400"><p>Нет активных приглашений</p></div>
        ) : (
          <div className="space-y-3">
            {invites.map((invite) => (
              <div key={invite.id} className="flex items-center gap-4 p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${ROLE_COLORS[invite.role]}`}>
                      {ROLE_LABELS[invite.role]}
                    </span>
                    {invite.telegram_username && <span className="text-sm text-gray-600">@{invite.telegram_username}</span>}
                    {invite.email && <span className="text-sm text-gray-600">{invite.email}</span>}
                  </div>
                  <div className="text-xs text-gray-400">
                    Создано: {parseUTC(invite.created_at).toLocaleDateString('ru')}
                    {invite.expires_at && <span className="ml-2">· Действует до {parseUTC(invite.expires_at).toLocaleDateString('ru')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canManage ? (
                    <>
                      <button onClick={() => copyToClipboard(invite.invite_url)} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm hover:bg-blue-100 transition" title="Скопировать ссылку">📋 Копия</button>
                      <button onClick={() => { if (confirm('Отменить это приглашение?')) cancelInviteMutation.mutate(invite.id); }} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 transition" title="Отменить приглашение">✕ Отмена</button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">📨 Пригласить участника</h3>
            {generatedInvite ? (
              <div>
                <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800 font-medium mb-2">✅ Приглашение создано!</p>
                  <p className="text-xs text-green-700 mb-2">Отправьте эту ссылку участнику:</p>
                  <div className="flex gap-2">
                    <code className="flex-1 px-3 py-2 bg-white border rounded text-xs font-mono break-all">{generatedInvite.invite_url}</code>
                    <button onClick={() => copyToClipboard(generatedInvite.invite_url)} className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 whitespace-nowrap">📋</button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowInviteModal(false); setGeneratedInvite(null); }} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">Готово</button>
                  <button onClick={() => { setGeneratedInvite(null); setInviteUsername(''); setInviteEmail(''); }} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Ещё одно</button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Telegram username (необязательно)</label>
                    <input type="text" value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} placeholder="@username" className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Email (необязательно)</label>
                    <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Роль</label>
                    <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                      {Object.entries(ROLE_LABELS).map(([role, label]) => (<option key={role} value={role}>{label}</option>))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCreateInvite} disabled={createInviteMutation.isPending} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{createInviteMutation.isPending ? 'Создание...' : 'Создать приглашение'}</button>
                  <button onClick={() => { setShowInviteModal(false); setGeneratedInvite(null); }} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">Отмена</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


export default TeamManagementSection;
