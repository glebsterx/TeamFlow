import { useState, useRef } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import Modal from '../components/Modal';
import MarkdownContent from '../components/MarkdownContent';
import { API_URL } from '../constants/taskDisplay';

import { MEETING_TYPES } from '../constants/meetingTypes';

export default function NewMeetingModal({ onClose, createMeetingMutation, projects }: any) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [meetingType, setMeetingType] = useState('');
  const [durationMin, setDurationMin] = useState('');
  const [agenda, setAgenda] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  const [participants, setParticipants] = useState<{display_name: string; telegram_user_id?: number}[]>([]);
  const [participantInput, setParticipantInput] = useState('');
  const [tab, setTab] = useState<'main' | 'agenda' | 'participants'>('main');
  const [summaryTab, setSummaryTab] = useState<'write' | 'preview'>('write');
  const descRef = useRef<HTMLTextAreaElement>(null);

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
    createMeetingMutation.mutate({
      summary,
      title: title || undefined,
      meeting_type: meetingType || undefined,
      duration_min: durationMin ? Number(durationMin) : undefined,
      agenda: agenda || undefined,
      project_ids: selectedProjects,
      participants: participants,
    });
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold mb-3">🤝 Новая встреча</h2>

      {/* Tabs */}
      <div className="flex gap-0 mb-4 border rounded-lg overflow-hidden text-xs">
        {[['main','📝 Основное'],['agenda','📋 Повестка'],['participants','👥 Участники']] .map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as any)}
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
          {/* Quick-add from users */}
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

          {/* Manual add */}
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

          {/* List */}
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

      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm">Отмена</button>
        <button onClick={handleSave} disabled={!summary.trim() || createMeetingMutation.isPending}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
          {createMeetingMutation.isPending ? '...' : 'Сохранить'}
        </button>
      </div>
    </Modal>
  );
}
