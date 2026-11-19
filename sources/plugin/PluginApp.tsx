import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookMarked, CheckCircle2, Compass, Download, FlaskConical, Info, Lightbulb, LoaderCircle, Network, Search, X } from 'lucide-react';
import { MindMapDialog } from './MindMapDialog';
import { enrichPapers, fetchKnowledge, generateMindMap, saveKnowledgePaper } from './api';
import { DirectionsView } from '../src/components/DirectionsView';
import { InfoDialog } from '../src/components/InfoDialog';
import { Inspector } from '../src/components/Inspector';
import { KnowledgeGraph } from '../src/components/KnowledgeGraph';
import { PaperDialog } from '../src/components/PaperDialog';
import { PapersView } from '../src/components/PapersView';
import { ProjectDialog } from '../src/components/ProjectDialog';
import { initialGraph, initialProject, seedPapers } from '../src/data/seed';
import { buildRecommendations, counterQueryFor } from '../src/lib/recommendations';
import { exportBrief } from '../src/lib/export';
import { paperToNodePosition, searchPapers } from '../src/lib/openalex';
import { formatChemicalFormula, formulaToSearchQuery } from '../src/lib/chemistry';
import { usePersistentState } from '../src/hooks/usePersistentState';
import type { ChatCard, GraphData, MindMap, MindMapNode, Paper, ProjectContext, Recommendation, ResearchNode, SearchRecord, ViewMode } from '../src/types';

const views = [
  { id: 'map' as const, label: '发散地图', icon: Network },
  { id: 'papers' as const, label: '论文证据', icon: Compass },
  { id: 'directions' as const, label: '延伸方向', icon: Lightbulb },
  { id: 'library' as const, label: '文献库', icon: BookMarked },
];

function AtlasMark() {
  return <svg viewBox="0 0 36 36" aria-hidden="true"><ellipse cx="18" cy="18" rx="15" ry="6" transform="rotate(45 18 18)" /><ellipse cx="18" cy="18" rx="15" ry="6" transform="rotate(-45 18 18)" /><circle cx="18" cy="18" r="3" /></svg>;
}

interface PluginAppProps {
  embedded?: boolean;
  askNative?: (prompt: string) => void;
}

export default function PluginApp({ embedded = false, askNative }: PluginAppProps) {
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
  const [searches, setSearches] = useState<Record<string, SearchRecord>>({});
  const [counterEvidence, setCounterEvidence] = useState<Record<string, Paper[]>>({});
  const [checkingCounterId, setCheckingCounterId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [summaryCache, setSummaryCache] = usePersistentState<Record<string, { en: string; zh: string; keyFinding: string }>>('bohr-paper-summaries', {});
  const [mindMap, setMindMap] = useState<MindMap | null>(null);
  const [mindMapLoading, setMindMapLoading] = useState(false);
  const enriching = useRef(new Set<string>());
  const initialized = useRef(false);

  const mergeCachedSummary = useCallback((paper: Paper): Paper => {
    const cached = summaryCache[paper.id];
    if (!cached) return paper;
    return { ...paper, summaryEn: cached.en, summaryZh: cached.zh, keyFinding: cached.keyFinding, summaryStatus: 'ready' };
  }, [summaryCache]);

  const enrich = useCallback(async (incoming: Paper[]) => {
    const missing = incoming.filter((paper) => !summaryCache[paper.id] && !(paper.summaryStatus === 'ready' && paper.summaryEn && paper.summaryZh) && !enriching.current.has(paper.id));
    if (!missing.length) return;
    missing.forEach((paper) => enriching.current.add(paper.id));
    setPapers((current) => {
      const next = { ...current };
      missing.forEach((paper) => { if (next[paper.id]) next[paper.id] = { ...next[paper.id], summaryStatus: 'pending' }; });
      return next;
    });
    try {
      const items = await enrichPapers(missing);
      const additions: Record<string, { en: string; zh: string; keyFinding: string }> = {};
      items.forEach((item) => { additions[item.id] = { en: item.englishSummary, zh: item.chineseSummary, keyFinding: item.keyFinding }; });
      setSummaryCache((current) => ({ ...current, ...additions }));
      setPapers((current) => {
        const next = { ...current };
        items.forEach((item) => {
          if (next[item.id]) next[item.id] = { ...next[item.id], summaryEn: item.englishSummary, summaryZh: item.chineseSummary, keyFinding: item.keyFinding, summaryStatus: 'ready' };
        });
        return next;
      });
    } catch {
      setPapers((current) => {
        const next = { ...current };
        missing.forEach((paper) => { if (next[paper.id]) next[paper.id] = { ...next[paper.id], summaryStatus: 'error' }; });
        return next;
      });
    } finally {
      missing.forEach((paper) => enriching.current.delete(paper.id));
    }
  }, [setSummaryCache, summaryCache]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void fetchKnowledge().then((store) => {
      if (!store.papers?.length) return;
      const records = Object.fromEntries(store.papers.map((paper) => [paper.id, paper]));
      setPapers((current) => ({ ...current, ...records }));
      setSavedIds((current) => [...new Set([...current, ...store.papers.map((paper) => paper.id)])]);
    }).catch(() => {});
    void enrich(Object.values(seedPapers));
  }, [enrich, setSavedIds]);
  const selectedNode = graph.nodes.find((node) => node.id === selectedId);
  const recommendations = useMemo(() => buildRecommendations(graph, project, papers, searches), [graph, project, papers, searches]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const toggleSave = (paper: Paper) => {
    const saving = !savedIds.includes(paper.id);
    setSavedIds((current) => saving ? [...current, paper.id] : current.filter((id) => id !== paper.id));
    if (saving) {
      const enriched = mergeCachedSummary(paper);
      void saveKnowledgePaper(enriched).then(() => setToast({ message: '已收藏，并写入 DSH 可调用的论文知识库' })).catch((error) => setToast({ message: error instanceof Error ? error.message : '知识库写入失败', error: true }));
    } else {
      setToast({ message: '已从本地文献库移除；DSH 知识库记录仍保留' });
    }
  };
  const selectNode = (node: ResearchNode) => { setSelectedId(node.id); setInspectorTab('details'); };

  const handleSearch = async (nextQuery: string) => {
    setLoading(true);
    try {
      const displayQuery = formatChemicalFormula(nextQuery);
      const searchTerm = formulaToSearchQuery(displayQuery);
      setSearchInput(displayQuery);
      const rawResults = await searchPapers(searchTerm);
      if (!rawResults.length) throw new Error('没有找到可显示的论文，请尝试化学式、英文材料名或 DOI');
      const results = rawResults.map(mergeCachedSummary);
      const root: ResearchNode = {
        id: 'root', kind: 'material', title: displayQuery.length > 22 ? `${displayQuery.slice(0, 21)}…` : displayQuery,
        subtitle: '检索起点 · 实时证据', x: 440, y: 310,
        description: `以“${displayQuery}”为起点从 OpenAlex 检索得到的论文网络。节点关系表示同次检索与探索路径，不代表已经经过人工核验的化学相似度。`,
        tags: ['实时检索', `${results.length} 篇论文`, '待阅读核验'], paperIds: results.map((paper) => paper.id), query: searchTerm,
      };
      const nodes = results.map((paper, index): ResearchNode => ({
        id: paper.id, kind: 'paper', title: paper.authors.split(',')[0], subtitle: `${paper.year || '未知'} · ${paper.venue}`,
        ...paperToNodePosition(index), description: paper.title,
        tags: [paper.source, paper.openAccess ? '开放获取' : '出版方页面'], paperIds: [paper.id], relation: '检索证据',
      }));
      setPapers((current) => ({ ...current, ...Object.fromEntries(results.map((paper) => [paper.id, paper])) }));
      setSearches((current) => ({ ...current, root: { query: searchTerm, count: results.length, checkedAt: new Date().toLocaleString('zh-CN', { hour12: false }) } }));
      setGraph({ nodes: [root, ...nodes], edges: results.map((paper) => ({ id: `search-${paper.id}`, source: 'root', target: paper.id, label: '相关研究' })) });
      setSelectedId('root'); setSearchLabel(displayQuery); setLive(true); setView('map'); setInspectorTab('details');
      const sources = [...new Set(results.map((paper) => paper.source))].join(' / ');
      setToast({ message: `已从 ${sources} 检索 ${results.length} 篇论文，正在生成中英概括` });
      void enrich(results);
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : '检索失败，请检查网络后重试', error: true });
    } finally { setLoading(false); }
  };

  const expandNode = async (node: ResearchNode) => {
    setExpandingId(node.id);
    try {
      const rawResults = await searchPapers(node.query || node.title);
      if (!rawResults.length) throw new Error('这个方向暂时没有返回论文，请换一个更具体的检索词');
      const results = rawResults.map(mergeCachedSummary);
      setPapers((current) => ({ ...current, ...Object.fromEntries(results.map((paper) => [paper.id, paper])) }));
      setSearches((current) => ({ ...current, [node.id]: { query: node.query || node.title, count: results.length, checkedAt: new Date().toLocaleString('zh-CN', { hour12: false }) } }));
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
      setLive(true); setToast({ message: `已展开 ${results.length} 条论文证据，正在生成中英概括` });
      void enrich(results);
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : '节点展开失败，请稍后重试', error: true });
    } finally { setExpandingId(null); }
  };

  const checkCounterEvidence = async (recommendation: Recommendation) => {
    setCheckingCounterId(recommendation.id);
    try {
      const query = counterQueryFor(recommendation);
      const results = await searchPapers(query);
      setCounterEvidence((current) => ({ ...current, [recommendation.id]: results }));
      setPapers((current) => ({ ...current, ...Object.fromEntries(results.map((paper) => [paper.id, paper])) }));
      setToast({ message: `找到 ${results.length} 篇潜在反证与边界线索，需阅读后确认` });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : '反证线索核查失败', error: true });
    } finally { setCheckingCounterId(null); }
  };
  const handleSaveChatCard = async (card: ChatCard) => {
    const paper = card.paperId ? papers[card.paperId] : undefined;
    if (!paper) return;
    setSavedIds((current) => current.includes(paper.id) ? current : [...current, paper.id]);
    try { await saveKnowledgePaper(mergeCachedSummary(paper)); } catch {}
  };
  const cardForNode = (node: ResearchNode): ChatCard => {
    const paper = node.kind === 'paper' ? papers[node.paperIds[0]] : undefined;
    return {
      id: node.id,
      kind: node.kind === 'paper' ? '论文证据' : node.kind === 'method' ? '制备方法' : node.kind === 'opportunity' ? '延伸机会' : '材料体系',
      title: paper?.title || node.title,
      summary: paper?.summaryZh || paper?.summaryEn || paper?.abstract || node.description,
      url: paper?.url,
      paperId: paper?.id,
    };
  };
  const sendCardToNative = (card: ChatCard) => {
    const prompt = `请用中文分析这张玻尔卡片。\n\n类型：${card.kind}\n标题：${card.title}\n概要：${card.summary}${card.url ? `\n原文：${card.url}` : ''}\n\n请说明它的科学问题、关键证据、适用边界，以及下一步值得验证或追问的方向。`;
    void handleSaveChatCard(card).finally(() => {
      if (askNative) askNative(prompt);
      else setToast({ message: '请在 DSH 原生对话页打开玻尔悬浮窗，再发送到原生对话', error: true });
    });
  };
  const openMindMap = async () => {
    if (!activePaper || mindMapLoading) return;
    setMindMapLoading(true);
    try {
      const result = await generateMindMap(mergeCachedSummary(activePaper));
      setMindMap(result);
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : '思维导图生成失败', error: true });
    } finally {
      setMindMapLoading(false);
    }
  };
  const askMindMapNode = (paper: Paper, node: MindMapNode) => {
    setMindMap(null);
    const prompt = `请围绕论文《${paper.title}》（${paper.year || '年份未知'}，${paper.venue || '期刊未知'}）的“${node.label}”节点继续分析。\n\n节点说明：${node.zh}\n\n建议追问：${node.question}`;
    void handleSaveChatCard({ id: `mindmap-${paper.id}-${node.id}`, kind: '思维导图节点', title: `${paper.title} · ${node.label}`, summary: node.zh, url: paper.url, paperId: paper.id }).finally(() => {
      if (askNative) askNative(prompt);
      else setToast({ message: '请在 DSH 原生对话页展开玻尔研究网络，再从思维导图追问', error: true });
    });
  };
  const locateRecommendation = (recommendation: Recommendation) => {
    const nodeId = recommendation.sourceNodeIds?.[0];
    if (!nodeId || !graph.nodes.some((node) => node.id === nodeId)) return;
    setSelectedId(nodeId); setView('map'); setInspectorTab('details');
  };
  const resetGraph = () => { setGraph(initialGraph); setSelectedId('root'); setSearchLabel(undefined); setLive(false); setInspectorTab('recommendations'); };
  const saveProject = (next: ProjectContext) => { setProject(next); setProjectOpen(false); setToast({ message: '课题进展已保存，推荐已按新约束更新' }); };
  useEffect(() => {
    if (!activePaper) return;
    const latest = papers[activePaper.id];
    if (latest && latest !== activePaper) setActivePaper(latest);
  }, [papers, activePaper]);
  const doExport = useCallback(() => exportBrief(project, recommendations, papers), [project, recommendations, papers]);
  const allPapers = Object.values(papers);
  const savedPapers = savedIds.map((id) => papers[id]).filter(Boolean);

  return <div className={embedded ? 'bohr-dsh embedded' : 'bohr-dsh'}>
    <header className="bd-header">
      <div className="bd-brand"><AtlasMark /><div><strong>玻尔科学空间</strong><span>发散式研究工作台</span></div></div>
      <form className="bd-search" role="search" onSubmit={(event) => { event.preventDefault(); if (searchInput.trim()) handleSearch(searchInput.trim()); }}>
        {loading ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />}
        <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索材料、化学式、方法或论文；提交后自动规范化" aria-label="搜索材料、化学式、方法或论文" />
        <button type="submit" disabled={loading || !searchInput.trim()}>{loading ? '检索中' : '搜索'}</button>
      </form>
      <div className="bd-header-actions"><button className="bd-source" onClick={() => setInfoOpen(true)} title="数据来源与参考方法"><i className={live ? 'live' : ''} /><span>OpenAlex</span><Info size={14} /></button><button className="icon-button" onClick={doExport} aria-label="导出研究简报" title="导出研究简报"><Download size={17} /></button></div>
    </header>
    <div className="bd-subbar"><nav className="bd-navigation" aria-label="科研工作台视图">{views.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)} aria-current={view === id ? 'page' : undefined}><Icon size={16} /><span>{label}</span>{id === 'papers' && <em>{allPapers.length}</em>}{id === 'library' && savedPapers.length > 0 && <em>{savedPapers.length}</em>}</button>)}</nav>
      <button className="bd-project" onClick={() => setProjectOpen(true)}><FlaskConical size={16} /><span><small>当前课题</small><strong>{project.target}</strong></span><em>更新进展</em></button>
    </div>
    <main className="bd-main">{view === 'map' ? <div className="bd-map-layout"><KnowledgeGraph graph={graph} papers={papers} selectedId={selectedId} onSelect={selectNode} loading={loading || Boolean(expandingId)} searchLabel={searchLabel} onReset={resetGraph} onDropToChat={sendCardToNative} /><Inspector node={selectedNode} papers={papers} recommendations={recommendations} project={project} tab={inspectorTab} onTab={setInspectorTab} onExpand={expandNode} expanding={Boolean(expandingId)} onOpenPaper={setActivePaper} onToggleSave={toggleSave} savedIds={savedIds} onProject={() => setProjectOpen(true)} onCheckCounter={checkCounterEvidence} counterEvidence={counterEvidence} checkingCounterId={checkingCounterId} onSendToChat={askNative ? (node) => sendCardToNative(cardForNode(node)) : undefined} /></div> : view === 'directions' ? <DirectionsView recommendations={recommendations} papers={papers} project={project} onOpenPaper={setActivePaper} onExport={doExport} onProject={() => setProjectOpen(true)} onCheckCounter={checkCounterEvidence} counterEvidence={counterEvidence} checkingCounterId={checkingCounterId} onLocateNode={locateRecommendation} /> : <PapersView papers={view === 'library' ? savedPapers : allPapers} savedIds={savedIds} onToggleSave={toggleSave} onOpenPaper={setActivePaper} library={view === 'library'} onExplore={() => setView('map')} />}</main>
    {embedded && <div className="bd-native-drop" data-bohr-dropzone><Network size={14} /><span>把上方卡片拖到这里，交给下方 DSH 原生对话</span></div>}
    {projectOpen && <ProjectDialog project={project} onSave={saveProject} onClose={() => setProjectOpen(false)} />}
    {infoOpen && <InfoDialog onClose={() => setInfoOpen(false)} />}
    {activePaper && <PaperDialog paper={activePaper} saved={savedIds.includes(activePaper.id)} onToggleSave={() => toggleSave(activePaper)} onClose={() => setActivePaper(null)} onMindMap={openMindMap} mindMapLoading={mindMapLoading} onSendToChat={askNative ? () => sendCardToNative({ id: activePaper.id, kind: '论文证据', title: activePaper.title, summary: activePaper.summaryZh || activePaper.summaryEn || activePaper.abstract || '', url: activePaper.url, paperId: activePaper.id }) : undefined} />}
    {mindMap && activePaper && <MindMapDialog paper={activePaper} mindMap={mindMap} onClose={() => setMindMap(null)} onAsk={askMindMapNode} />}
    {toast && <div className={toast.error ? 'toast error' : 'toast'} role="status"><CheckCircle2 size={17} /><span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="关闭提示"><X size={15} /></button></div>}
  </div>;
}
