import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Task } from '../types/dashboard';
import { API_URL } from '../constants/taskDisplay';
import { useDebounce } from '../hooks/useDebounce';

interface SearchPanelProps {
  onOpenTask: (t: Task) => void;
}

export function SearchPanel({ onOpenTask }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  const { data: results = [], isFetching } = useQuery<Task[]>({
    queryKey: ['search', debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return [];
      const { data } = await axios.get(`${API_URL}/api/search?q=${encodeURIComponent(debouncedQuery)}`);
      return data;
    },
    enabled: debouncedQuery.length >= 2,
  });

  return (
    <div className="border-b bg-white pb-3">
      <div className="relative w-full">
        <input
          autoFocus
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Поиск по задачам..."
          className="w-full pl-9 pr-4 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <span className="absolute left-3 top-2 text-gray-400 text-sm">🔍</span>
        {isFetching && <span className="absolute right-3 top-2 text-gray-400 text-xs">...</span>}
        {debouncedQuery.length >= 2 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border rounded-lg shadow-lg max-h-72 overflow-y-auto">
            {results.length === 0 && !isFetching && (
              <p className="text-sm text-gray-400 text-center py-4">Ничего не найдено</p>
            )}
            {results.map((t: Task) => (
              <button
                key={t.id}
                onClick={() => onOpenTask(t)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 transition border-b last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">#{t.id}</span>
                  <span className="text-sm font-medium text-gray-800 flex-1 truncate">{t.title}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    t.status === 'DONE'    ? 'bg-green-100 text-green-700' :
                    t.status === 'DOING'   ? 'bg-blue-100 text-blue-700' :
                    t.status === 'BLOCKED' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{t.status}</span>
                </div>
                {t.description && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate pl-7">{t.description}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
