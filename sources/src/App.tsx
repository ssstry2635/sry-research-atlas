import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { DirectionsView } from './components/DirectionsView';
import { Header } from './components/Header';
import { InfoDialog } from './components/InfoDialog';
import { Inspector } from './components/Inspector';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { PaperDialog } from './components/PaperDialog';
import { PapersView } from './components/PapersView';
import { ProjectDialog } from './components/ProjectDialog';
import { Sidebar } from './components/Sidebar';
import { initialGraph, initialProject, seedPapers, seedRecommendations } from './data/seed';
import { exportBrief } from './lib/export';
import { paperToNodePosition, searchPapers } from './lib/openalex';
import { usePersistentState } from './hooks/usePersistentState';
import type { GraphData, Paper, ProjectContext, ResearchNode, ViewMode } from './types';

export default function App() {
  const [project, setProject] = usePersistentState<ProjectContext>('bohr-project', initialProject);
  const [savedIds, setSavedIds] = usePersistentState<string[]>('bohr-saved-papers', []);
  const [view, setView] = useState<ViewMode>('map');
  const [graph, setGraph] = useState<GraphData>(initialGraph);
  const [papers, setPapers] = useState<Record<string, Paper>>(seedPapers);
  const [selectedId, setSelectedId] = useState('root');
  const [inspectorTab, setInspectorTab] = useState<'recommendations' | 'details'>('recommendations');
  const [loading, setLoading] = useState(false);
  const [expandingId, setExpandingId] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [searchLabel, setSearchLabel] = useState<string>();
  const [projectOpen, setProjectOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [activePaper, setActivePaper] = useState<Paper | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const selectedNode = graph.nodes.find((node) => node.id === selectedId);
  const recommendations = useMemo(() => seedRecommendations.map((rec) => {
    let adjustment = 0;
    const context = `${project.goal} ${project.progress} ${project.constraints}`;
    if (rec.id === 'rec-ligand' && /稳定|LED|薄膜|配体/i.test(context)) adjustment = 2;
    if (rec.id === 'rec-larp' && /小时|室温|低极性|放大/i.test(context)) adjustment = 2;
    return { ...rec, match: Math.min(98, rec.match + adjustment) };
  }), [project]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const toggleSave = (paper: Paper) => {
    setSavedIds((current) => current.includes(paper.id) ? current.filter((id) => id !== paper.id) : [...current, paper.id]);
    setToast({ message: savedIds.includes(paper.id) ? '已从文献库移除' : '已收藏到文献库' });
  };

  const selectNode = (node: ResearchNode) => {
    setSelectedId(node.id);
    setInspectorTab('details');
  };

  const handleSearch = async (query: string) => {
    setLoading(true);
    try {
      const results = await searchPapers(query);
      if (!results.length) throw new Error('没有找到可显示的论文，请尝试化学式、英文材料名或 DOI');
      const root: ResearchNode = {
        id: 'root', kind: 'material', title: query.length > 22 ? `${query.slice(0, 21)}…` : query,
        subtitle: '检索起点 · 实时证据', x: 440, y: 310,
        description: `以“${query}”为起点从 OpenAlex 检索得到的论文网络。节点关系表示同次检索与探索路径，不代表已经经过人工核验的化学相似度。`,
        tags: ['实时检索', `${results.length} 篇论文`, '待阅读核验'], paperIds: results.map((paper) => paper.id), query,
      };
      const nodes = results.map((paper, index): ResearchNode => {
        const position = paperToNodePosition(index);
        return { id: paper.id, kind: 'paper', title: paper.authors.split(',')[0], subtitle: `${paper.year || '未知'} · ${paper.venue}`, ...position, description: paper.title, tags: [paper.source, paper.openAccess ? '开放获取' : '出版方页面'], paperIds: [paper.id], relation: '检索证据' };
      });
      setPapers((current) => ({ ...current, ...Object.fromEntries(results.map((paper) => [paper.id, paper])) }));
      setGraph({ nodes: [root, ...nodes], edges: results.map((paper) => ({ id: `search-${paper.id}`, source: 'root', target: paper.id, label: '相关研究' })) });
      setSelectedId('root'); setSearchLabel(query); setLive(true); setView('map'); setInspectorTab('details');
      setToast({ message: `已从 OpenAlex 引入 ${results.length} 篇论文，可点击节点查看原文` });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : '检索失败，请检查网络后重试', error: true });
    } finally { setLoading(false); }
  };

  const expandNode = async (node: ResearchNode) => {
    setExpandingId(node.id);
    try {
      const results = await searchPapers(node.query || node.title);
      if (!results.length) throw new Error('这个方向暂时没有返回论文，请换一个更具体的检索词');
      setPapers((current) => ({ ...current, ...Object.fromEntries(results.map((paper) => [paper.id, paper])) }));
      setGraph((current) => {
        const existing = new Set(current.nodes.map((item) => item.id));
        const additions = results.filter((paper) => !existing.has(paper.id)).map((paper, index): ResearchNode => {
          const raw = paperToNodePosition(index, node.x, node.y);
          return { id: paper.id, kind: 'paper', title: paper.authors.split(',')[0], subtitle: `${paper.year || '未知'} · ${paper.venue}`, x: Math.max(55, Math.min(845, raw.x)), y: Math.max(65, Math.min(560, raw.y)), description: paper.title, tags: [paper.source], paperIds: [paper.id], relation: `${node.title}的相关证据` };
        });
        const existingEdges = new Set(current.edges.map((edge) => `${edge.source}-${edge.target}`));
        const edges = results.filter((paper) => !existingEdges.has(`${node.id}-${paper.id}`)).map((paper) => ({ id: `${node.id}-${paper.id}`, source: node.id, target: paper.id, label: '相关研究' }));
        return { nodes: [...current.nodes.map((item) => item.id === node.id ? { ...item, paperIds: [...new Set([...item.paperIds, ...results.map((paper) => paper.id)])] } : item), ...additions], edges: [...current.edges, ...edges] };
      });
      setLive(true); setToast({ message: `已展开 ${results.length} 条论文证据，原文入口已同步保留` });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : '节点展开失败，请稍后重试', error: true });
    } finally { setExpandingId(null); }
  };

  const resetGraph = () => { setGraph(initialGraph); setSelectedId('root'); setSearchLabel(undefined); setLive(false); setInspectorTab('recommendations'); };
  const saveProject = (next: ProjectContext) => { setProject(next); setProjectOpen(false); setToast({ message: '课题进展已保存，推荐已按新约束更新' }); };
  const doExport = useCallback(() => exportBrief(project, recommendations, papers), [project, recommendations, papers]);
  const allPapers = Object.values(papers);
  const savedPapers = savedIds.map((id) => papers[id]).filter(Boolean);

  return <div className="app-shell">
    <Sidebar view={view} onView={setView} project={project} paperCount={allPapers.length} savedCount={savedPapers.length} onProject={() => setProjectOpen(true)} onInfo={() => setInfoOpen(true)} />
    <main className="main-shell">
      <Header project={project} loading={loading} live={live} onSearch={handleSearch} onProject={() => setProjectOpen(true)} onExport={doExport} />
      {view === 'map' ? <div className="map-layout"><KnowledgeGraph graph={graph} papers={papers} selectedId={selectedId} onSelect={selectNode} loading={loading || Boolean(expandingId)} searchLabel={searchLabel} onReset={resetGraph} /><Inspector node={selectedNode} papers={papers} recommendations={recommendations} project={project} tab={inspectorTab} onTab={setInspectorTab} onExpand={expandNode} expanding={Boolean(expandingId)} onOpenPaper={setActivePaper} onToggleSave={toggleSave} savedIds={savedIds} onProject={() => setProjectOpen(true)} /></div> : view === 'directions' ? <DirectionsView recommendations={recommendations} papers={papers} project={project} onOpenPaper={setActivePaper} onExport={doExport} onProject={() => setProjectOpen(true)} /> : <PapersView papers={view === 'library' ? savedPapers : allPapers} savedIds={savedIds} onToggleSave={toggleSave} onOpenPaper={setActivePaper} library={view === 'library'} onExplore={() => setView('map')} />}
    </main>
    {projectOpen && <ProjectDialog project={project} onSave={saveProject} onClose={() => setProjectOpen(false)} />}
    {infoOpen && <InfoDialog onClose={() => setInfoOpen(false)} />}
    {activePaper && <PaperDialog paper={activePaper} saved={savedIds.includes(activePaper.id)} onToggleSave={() => toggleSave(activePaper)} onClose={() => setActivePaper(null)} />}
    {toast && <div className={toast.error ? 'toast error' : 'toast'} role="status"><CheckCircle2 size={17} /><span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="关闭提示"><X size={15} /></button></div>}
  </div>;
}
