import { BookMarked, Compass, FlaskConical, FolderKanban, Info, Lightbulb, Network, Settings2 } from 'lucide-react';
import type { ProjectContext, ViewMode } from '../types';

interface SidebarProps {
  view: ViewMode;
  onView: (view: ViewMode) => void;
  project: ProjectContext;
  paperCount: number;
  savedCount: number;
  onProject: () => void;
  onInfo: () => void;
}

const navigation = [
  { id: 'map' as const, label: '发散地图', icon: Network },
  { id: 'papers' as const, label: '论文证据', icon: Compass },
  { id: 'directions' as const, label: '延伸方向', icon: Lightbulb },
  { id: 'library' as const, label: '我的文献库', icon: BookMarked },
];

export function Sidebar({ view, onView, project, paperCount, savedCount, onProject, onInfo }: SidebarProps) {
  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => onView('map')} aria-label="返回发散地图">
        <span className="brand-symbol" aria-hidden="true"><i /><i /><b /></span>
        <span><strong>玻尔</strong><small>科学空间</small></span>
      </button>

      <nav className="main-nav" aria-label="工作台导航">
        <p className="nav-caption">研究工作台</p>
        {navigation.map(({ id, label, icon: Icon }) => (
          <button key={id} className={view === id ? 'nav-item active' : 'nav-item'} onClick={() => onView(id)} aria-current={view === id ? 'page' : undefined}>
            <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            {id === 'papers' && <em>{paperCount}</em>}
            {id === 'library' && savedCount > 0 && <em>{savedCount}</em>}
          </button>
        ))}
      </nav>

      <section className="current-project" aria-labelledby="current-project-title">
        <div className="project-heading"><FolderKanban size={15} /><span id="current-project-title">当前课题</span><button onClick={onProject} aria-label="编辑当前课题"><Settings2 size={14} /></button></div>
        <button className="project-card" onClick={onProject}>
          <span className="project-status"><i />进行中</span>
          <strong>{project.title}</strong>
          <small>{project.target}</small>
          <span className="project-progress"><i /><i /><i /><i /></span>
          <span className="project-link">更新课题进展</span>
        </button>
      </section>

      <div className="sidebar-spacer" />
      <button className="source-card" onClick={onInfo}>
        <span className="source-orbit"><FlaskConical size={17} /></span>
        <span><strong>证据来源透明</strong><small>OpenAlex · 本地课题记录</small></span>
        <Info size={15} />
      </button>
      <p className="sidebar-footnote">让每一步延伸，都能回到证据。</p>
    </aside>
  );
}
