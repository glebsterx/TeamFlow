import { useState, useRef } from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '../components/Modal';
import MarkdownContent from '../components/MarkdownContent';
import { parseUTC } from '../utils/dateUtils';
import { showToast } from '../utils/toast';
import { API_URL } from '../constants/taskDisplay';
import { MEETING_TYPES, MEETING_TYPE_LABELS } from '../constants/meetingTypes';

export default function MeetingModal({ meeting, onClose, updateMeetingMutation, setConfirmDelete, projects, onOpenTask, tasks }: any) {
  const [summary, setSummary] = useState(meeting.summary || '');
  const [title, setTitle] = useState(meeting.title || '');
  const [meetingType, setMeetingType] = useState(meeting.meeting_type || '');
  const [durationMin, setDurationMin] = useState(meeting.duration_min ? String(meeting.duration_min) : '');
  const [agenda, setAgenda] = useState(meeting.agenda || '');
  const [selectedProjects, setSelectedProjects] = useState<number[]>(meeting.project_ids || []);
  const [participants, setParticipants] = useState<{display_name: string; telegram_user_id?: number}[]>(
    (meeting.participants || []).map((p: any) => ({ display_name: p.display_name, telegram_user_id: p.telegram_user_id || undefined }))
  );
  const [participantInput, setParticipantInput] = useState('');
  const [tab, setTab] = useState<'main' | 'agenda' | 'participants'>('main');
  const [summaryTab, setSummaryTab] = useState<'write' | 'preview'>('write');
  const [actionItems, setActionItems] = useState<string[]>([]);
  const [showActionItems, setShowActionItems] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiTasks, setAiTasks] = useState<{title: string; description?: string; priority?: string}[]>([]);
  const [showAiTasks, setShowAiTasks] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => axios.get(`${API_URL}/api/users`).then(r => r.data),
  });

  const toggleProject = (id: number) =>
    setSelectedProjects(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  const addParticipant = (name: string, telegramUserId?: number) => {
    const n = name.trim();
    if (n && !participants.find(p => p.display_name === n))
      setParticipants(prev => [...prev, { display_name: n, telegram_user_id: telegramUserId }]);
    setParticipantInput('');
  };

  const insertMarkdown = (prefix: string, suffix: string) => {
    const ta = descRef.current;
    if (!ta) return;
    const s = ta.selectionStart || 0, e = ta.selectionEnd || 0;
    const before = summary.slice(0, s), after = summary.slice(e), sel = summary.slice(s, e);
    setSummary(before + prefix + sel + suffix + after);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + prefix.length, e + prefix.length); }, 0);
  };

  const handleSave = () => {
    if (!summary.trim()) return;
    updateMeetingMutation.mutate({
      id: meeting.id,
      data: {
        summary,
        title: title || null,
        meeting_type: meetingType || null,
        duration_min: durationMin ? Number(durationMin) : null,
        agenda: agenda || null,
        project_ids: selectedProjects,
        participants: participants,
      }
    }, { onSuccess: () => onClose() });
  };

  const parseActionItems = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/meetings/${meeting.id}/parse-action-items`);
      setActionItems(data.action_items || []);
      setShowActionItems(true);
      if ((data.action_items || []).length === 0) showToast('Action items не найдены', 'info');
    } catch { showToast('Ошибка при парсинге', 'error'); }
    setLoading(false);
  };

  const createTaskFromItem = async (text: string) => {
    try {
      const { data } = await axios.post(`${API_URL}/api/tasks`, {
        title: text,
        project_id: selectedProjects[0] || undefined,
      });
      await axios.post(`${API_URL}/api/meetings/${meeting.id}/tasks/${data.id}`);
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['meetings'] });
      setActionItems(prev => prev.filter(i => i !== text));
      showToast(`Задача #${data.id} создана`, 'success');
    } catch { showToast('Ошибка создания задачи', 'error'); }
  };

  const removeTask = async (taskId: number) => {
    await axios.delete(`${API_URL}/api/meetings/${meeting.id}/tasks/${taskId}`);
    qc.invalidateQueries({ queryKey: ['meetings'] });
  };

  return (
    <Modal onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">🤝 Редактировать встречу</h2>
        <div className="flex gap-1">
          <button onClick={async () => {
            const url = `${window.location.origin}${window.location.pathname}?meeting=${meeting.id}`;
            try { await navigator.clipboard.writeText(url); } catch {}
            showToast('Ссылка скопирована', 'success');
          }} className="text-gray-400 hover:text-blue-600 p-1 rounded" title="Скопировать ссылку">🔗</button>
        </div>
      </div>
      <div className="text-xs text-gray-400 mb-3">
        {parseUTC(meeting.meeting_date).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>

      {/* Tabs — те же что в NewMeetingModal */}
      <div className="flex mb-4 border rounded-lg overflow-hidden text-xs">
        {([['main','📝 Основное'],['agenda','📋 Повестка'],['participants','👥 Участники']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-1.5 font-medium transition ${tab === id ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Main tab */}
      {tab === 'main' && (
        <div className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Название встречи (необязательно)"
            className="w-full px-3 py-2 border rounded-lg text-sm" />

          <div className="grid grid-cols-2 gap-2">
            <select value={meetingType} onChange={e => setMeetingType(e.target.value)}
              className="px-2 py-1.5 border rounded-lg text-sm">
              {MEETING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input value={durationMin} onChange={e => setDurationMin(e.target.value)}
              type="number" min="5" step="5" placeholder="Длительность (мин)"
              className="px-3 py-1.5 border rounded-lg text-sm" />
          </div>

          {/* Projects */}
          {projects?.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">📁 Проекты</label>
              <div className="flex flex-wrap gap-1.5">
                {projects.map((p: any) => (
                  <button key={p.id} onClick={() => toggleProject(p.id)}
                    className={`px-2 py-1 rounded-full border text-xs transition ${selectedProjects.includes(p.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                    {p.emoji} {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">📄 Итоги встречи</label>
            <div className="border rounded-lg overflow-hidden">
              <div className="flex border-b bg-gray-50 gap-1 p-1">
                <button onClick={() => setSummaryTab('write')} className={`px-2 py-1 text-xs rounded transition ${summaryTab==='write'?'bg-white':'text-gray-500 hover:text-gray-700'}`}>✏️</button>
                <button onClick={() => setSummaryTab('preview')} className={`px-2 py-1 text-xs rounded transition ${summaryTab==='preview'?'bg-white':'text-gray-500 hover:text-gray-700'}`}>👁</button>
                <span className="border-l mx-1" />
                {[['**','**','**B**'],['*','*','*I*'],['`','`','`c`']].map(([p,s,l]) => (
                  <button key={l} onClick={() => insertMarkdown(p,s)} className="px-2 py-1 text-xs hover:bg-gray-200 rounded">{l}</button>
                ))}
              </div>
              {summaryTab === 'write'
                ? <textarea ref={descRef} value={summary} onChange={e => setSummary(e.target.value)}
                    placeholder="Что обсуждали, решения, action items..." rows={5}
                    className="w-full px-3 py-2 border-0 text-sm focus:outline-none font-mono text-xs" />
                : <div className="px-3 py-2 min-h-[100px]">
                    {summary ? <MarkdownContent content={summary} /> : <span className="text-gray-400 text-xs">Нет итогов</span>}
                  </div>
              }
            </div>
          </div>

          {/* Action items */}
          <div>
            <div className="flex gap-2">
              <button onClick={parseActionItems}
                className="flex-1 text-xs px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 transition">
                🤖 Найти action items
              </button>
              <button onClick={async () => {
                if (!summary.trim()) { showToast('Сначала введите итоги встречи', 'warning'); return; }
                setLoading(true);
                try {
                  const { data: d } = await axios.post(`${API_URL}/api/ai/parse`, { text: summary });
                  const tasks = d.tasks;
                  if (!tasks?.length) { showToast('AI не создал задачи', 'warning'); return; }
                  setAiTasks(tasks);
                  setShowAiTasks(true);
                } catch (e: any) { 
                  // Interceptor shows toast
                  console.log('AI error:', e.response?.status, e.response?.data);
                }
                setLoading(false);
              }}
                className="flex-1 text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition">
                🤖 Задачи из итогов
              </button>
            </div>
            {showAiTasks && aiTasks.length > 0 && (
              <div className="mt-2 p-2 border rounded-lg bg-purple-50">
                <div className="text-xs text-purple-700 mb-2">AI распознал задачи. Выберите какие создать:</div>
                {aiTasks.map((t, i) => (
                  <label key={i} className="flex items-start gap-2 mb-1">
                    <input type="checkbox" defaultChecked className="mt-1" onChange={e => {
                      const checked = e.target.checked;
                      setAiTasks(prev => checked ? prev : prev.filter((_, idx) => idx !== i));
                    }} />
                    <div>
                      <div className="text-sm">{t.title}</div>
                      {t.description && <div className="text-xs text-gray-500">{t.description}</div>}
                      {t.priority && <span className="text-xs px-1 bg-purple-100 text-purple-600 rounded">{t.priority}</span>}
                    </div>
                  </label>
                ))}
                <button onClick={async () => {
                  setLoading(true);
                  try {
                    for (const t of aiTasks) {
                      await axios.post(`${API_URL}/api/tasks`, { title: t.title, description: t.description, priority: t.priority || 'NORMAL', project_id: selectedProjects[0] || undefined });
                    }
                    showToast(`Создано ${aiTasks.length} задач`, 'success');
                    qc.invalidateQueries({ queryKey: ['tasks'] });
                    setShowAiTasks(false);
                    setAiTasks([]);
                  } catch { showToast('Ошибка', 'error'); }
                  setLoading(false);
                }} className="w-full py-1.5 mt-2 bg-purple-600 text-white rounded text-xs">Создать {aiTasks.length} задач</button>
              </div>
            )}
            {showActionItems && actionItems.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="text-xs text-gray-500 mb-1">Нажмите чтобы создать задачу:</div>
                {actionItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs">
                    <span className="flex-1 truncate">{item}</span>
                    <button onClick={() => createTaskFromItem(item)}
                      className="px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 shrink-0">+ Задача</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Linked tasks */}
          {meeting.tasks?.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">✅ Связанные задачи</label>
              <div className="space-y-1">
                {meeting.tasks.map((mt: any) => {
                  const fullTask = (tasks || []).find((t: any) => t.id === mt.task_id);
                  return (
                    <div key={mt.id} className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded border text-xs">
                      <span className={mt.task_status === 'DONE' ? 'text-green-500' : 'text-gray-400'}>
                        {mt.task_status === 'DONE' ? '✅' : '⬜'}
                      </span>
                      <button onClick={() => fullTask && onOpenTask?.(fullTask)}
                        className="flex-1 text-left truncate hover:text-blue-600 hover:underline">
                        #{mt.task_id} {mt.task_title}
                      </button>
                      <button onClick={() => removeTask(mt.task_id)} className="text-gray-300 hover:text-red-500">✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Agenda tab */}
      {tab === 'agenda' && (
        <div>
          <label className="text-xs text-gray-500 block mb-2">Пункты повестки — каждый с новой строки</label>
          <textarea value={agenda} onChange={e => setAgenda(e.target.value)} rows={8}
            placeholder={"1. Обсудить релиз\n2. Статусы задач\n3. Блокеры"}
            className="w-full px-3 py-2 border rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-300" />
          <p className="text-xs text-gray-400 mt-1">Можно использовать - [ ] для action items</p>
        </div>
      )}

      {/* Participants tab */}
      {tab === 'participants' && (
        <div className="space-y-3">
          {users.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Из команды</label>
              <div className="flex flex-wrap gap-1.5">
                {users.map((u: any) => (
                  <button key={u.id} onClick={() => addParticipant(u.display_name, u.id)}
                    disabled={!!participants.find(p => p.display_name === u.display_name)}
                    className={`px-2 py-1 rounded-full border text-xs transition ${participants.find(p => p.display_name === u.display_name) ? 'bg-blue-600 text-white border-blue-600 opacity-60' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                    {u.display_name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Добавить вручную</label>
            <div className="flex gap-2">
              <input value={participantInput} onChange={e => setParticipantInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addParticipant(participantInput); }}}
                placeholder="Имя участника..."
                className="flex-1 px-3 py-1.5 border rounded-lg text-sm" />
              <button onClick={() => addParticipant(participantInput)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">+</button>
            </div>
          </div>
          {participants.length > 0 && (
            <div className="space-y-1">
              {participants.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-lg border text-sm">
                  <span>👤 {p.display_name}{p.telegram_user_id ? <span className="text-xs text-gray-400 ml-1">· tg</span> : null}</span>
                  <button onClick={() => setParticipants(prev => prev.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button onClick={() => setConfirmDelete({ type: 'meeting', id: meeting.id })}
          className="px-3 py-2 bg-red-50 text-red-500 border border-red-200 rounded-lg text-sm hover:bg-red-100">🗑️</button>
        <button onClick={handleSave} disabled={!summary.trim() || updateMeetingMutation?.isPending}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
          {updateMeetingMutation?.isPending ? '...' : 'Сохранить'}
        </button>
      </div>
    </Modal>
  );
}
