import React from 'react';

// Компактное поле с dropdown — показывает текущее значение как кнопку, по клику открывает select
function DropdownField({ label, value, placeholder, options, current, onChange }: {
  label: string; value: string | null; placeholder: string;
  options: { value: string; label: string }[]; current: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {label && <div className="text-xs text-gray-500 mb-1">{label}</div>}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-2 py-1.5 border rounded-lg text-xs bg-white hover:bg-gray-50 transition text-left"
      >
        <span className={value ? 'text-gray-800 truncate' : 'text-gray-400'}>{value || placeholder}</span>
        <span className="text-gray-400 ml-1 shrink-0">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition ${opt.value === current ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
            >{opt.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default DropdownField;
