import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ChevronRight, LoaderCircle, Search, Sparkles } from 'lucide-react';
import type { ProjectContext } from '../types';

interface HeaderProps {
  project: ProjectContext;
  loading: boolean;
  live: boolean;
  onSearch: (query: string) => void;
  onProject: () => void;
  onExport: () => void;
}

export function Header({ project, loading, live, onSearch, onProject, onExport }: HeaderProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  return (
    <header className="topbar">
      <div className="breadcrumb"><span>研究工作台</span><ChevronRight size={13} /><strong>材料探索</strong></div>
      <form className="global-search" onSubmit={submit} role="search">
        {loading ? <LoaderCircle className="spin" size={19} /> : <Search size={19} />}
        <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入材料、化学式、方法或论文题目…" aria-label="检索材料、方法或论文" />
        {!query && <kbd>/</kbd>}
        <button type="submit" disabled={loading || !query.trim()}>{loading ? '检索中' : '发散检索'}</button>
      </form>
      <div className="topbar-actions">
        <button className="project-pill" onClick={onProject} title="查看课题上下文"><Sparkles size={15} /><span>{project.target}</span><i className={live ? 'live-dot' : 'live-dot demo'} /></button>
        <button className="icon-button export-button" onClick={onExport} aria-label="导出研究简报" title="导出研究简报"><ArrowDownToLine size={18} /></button>
      </div>
    </header>
  );
}
