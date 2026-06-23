import { useState } from 'react';

interface Props { placeholder?: string; onSearch?: (q: string) => void; }

export default function SearchBar({ placeholder = '搜索音乐...', onSearch }: Props) {
  const [q, setQ] = useState('');

  return (
    <div className="flex items-center gap-2 bg-bg-darkest border border-border rounded-lg px-3 py-2 focus-within:border-accent">
      <span className="text-sm">🔍</span>
      <input value={q} onChange={e => { setQ(e.target.value); onSearch?.(e.target.value); }}
        placeholder={placeholder} className="bg-transparent border-none outline-none text-sm flex-1 text-text-primary placeholder:text-text-muted" />
    </div>
  );
}
