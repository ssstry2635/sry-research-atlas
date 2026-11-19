import { useState } from 'react';
import { ArrowUpRight, Bookmark, BookOpen, ChevronDown, ChevronRight, FlaskConical, LoaderCircle, Network, PencilLine, Quote, SearchCheck, Send, Sparkles } from 'lucide-react';
import type { Paper, ProjectContext, Recommendation, ResearchNode } from '../types';

interface InspectorProps {
  node?: ResearchNode;
  papers: Record<string, Paper>;
  recommendations: Recommendation[];
  project: ProjectContext;
  tab: 'recommendations' | 'details';
  onTab: (tab: 'recommendations' | 'details') => void;
  onExpand: (node: ResearchNode) => void;
  expanding: boolean;
  onOpenPaper: (paper: Paper) => void;
  onToggleSave: (paper: Paper) => void;
  savedIds: string[];
  onProject: () => void;
  onCheckCounter?: (recommendation: Recommendation) => void;
  counterEvidence?: Record<string, Paper[]>;
  checkingCounterId?: string | null;
  onSendToChat?: (node: ResearchNode) => void;
}

const kindNames = { material: '材料体系', family: '结构家族', method: '制备方法', paper: '研究论文', opportunity: '延伸机会' };

export function Inspector({ node, papers, recommendations, project, tab, onTab, onExpand, expanding, onOpenPaper, onToggleSave, savedIds, onProject, onCheckCounter, counterEvidence = {}, checkingCounterId, onSendToChat }: InspectorProps) {
  const [openRec, setOpenRec] = useState<string | null>(recommendations[0]?.id || null);
  const [reasoningRec, setReasoningRec] = useState<string | null>(null);
  const relatedPapers = node?.paperIds.map((id) => papers[id]).filter(Boolean) || [];

  return (
    <aside className="inspector" aria-label="研究推荐与节点详情">
      <div className="inspector-tabs" role="tablist" aria-label="右侧面板">
        <button role="tab" aria-selected={tab === 'recommendations'} className={tab === 'recommendations' ? 'active' : ''} onClick={() => onTab('recommendations')}><Sparkles size={15} />方向推荐</button>
        <button role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'active' : ''} onClick={() => onTab('details')}><Network size={15} />节点详情</button>
      </div>

      {tab === 'recommendations' ? <div className="recommendation-panel" role="tabpanel">
        <div className="recommendation-intro"><div><span className="section-kicker">基于课题上下文</span><h2>下一步，值得往哪里走？</h2></div><button onClick={onProject} aria-label="编辑推荐依据"><PencilLine size={15} /></button></div>
        <button className="context-summary" onClick={onProject}><FlaskConical size={16} /><span><strong>{project.stage}</strong><small>{project.goal}</small></span><ChevronRight size={15} /></button>
        <div className="recommendation-list">
          {recommendations.map((rec) => {
            const open = openRec === rec.id;
            return <article key={rec.id} className={open ? 'recommendation-card open' : 'recommendation-card'}>
              <button className="recommendation-toggle" onClick={() => setOpenRec(open ? null : rec.id)} aria-expanded={open}>
                <span className="match-score"><strong>{rec.match}</strong><small>匹配</small></span>
                <span className="recommendation-copy"><small>{rec.eyebrow}</small><strong>{rec.title}</strong><span className="evidence-tag"><i />{rec.evidenceLevel}</span></span>
                <ChevronDown size={16} className={open ? 'rotated' : ''} />
              </button>
              {open && <div className="recommendation-detail">
                <p>{rec.summary}</p>
                <h3>建议的最小验证</h3><p>{rec.nextStep}</p>
                <div className="evidence-links">{rec.paperIds.map((id) => papers[id]).filter(Boolean).slice(0, 2).map((paper) => <button key={paper.id} onClick={() => onOpenPaper(paper)}><BookOpen size={13} />{paper.venue} {paper.year}<ArrowUpRight size={12} /></button>)}</div>
                <button className="reasoning-toggle compact" onClick={() => setReasoningRec(reasoningRec === rec.id ? null : rec.id)} aria-expanded={reasoningRec === rec.id}><Quote size={12} />依据与反证<ChevronDown size={12} className={reasoningRec === rec.id ? 'rotated' : ''} /></button>
                {reasoningRec === rec.id && <div className="reasoning-details">
                  <div className="rationale"><Quote size={14} /><p>{rec.rationale}</p></div>
                  {rec.scoreBreakdown && <div className="score-mini"><span>相关 {rec.scoreBreakdown.relevance}</span><span>可行 {rec.scoreBreakdown.feasibility}</span><span>证据 {rec.scoreBreakdown.evidence}</span><span>新颖 {rec.scoreBreakdown.novelty}</span></div>}
                  {rec.stopCondition && <p className="stop-mini">停止条件：{rec.stopCondition}</p>}
                  {onCheckCounter && <div className="counter-mini"><button onClick={() => onCheckCounter(rec)} disabled={checkingCounterId === rec.id}>{checkingCounterId === rec.id ? <LoaderCircle size={12} className="spin" /> : <SearchCheck size={12} />}{checkingCounterId === rec.id ? '正在核查' : '核查潜在反证'}</button>{(counterEvidence[rec.id] || []).slice(0, 2).map((paper) => <button key={paper.id} onClick={() => onOpenPaper(paper)}>待核验：{paper.title}<ArrowUpRight size={11} /></button>)}</div>}
                </div>}
              </div>}
            </article>;
          })}
        </div>
        <p className="recommendation-note">匹配度来自课题文本与证据关联规则，不代表实验成功概率。</p>
      </div> : <div className="node-panel" role="tabpanel">
        {node ? <>
          <div className={`node-detail-emblem ${node.kind}`}><span>{node.kind === 'paper' ? '¶' : node.kind === 'method' ? 'M' : node.kind === 'opportunity' ? '?' : '◇'}</span></div>
          <span className="section-kicker">{kindNames[node.kind]}{node.relation ? ` · ${node.relation}` : ''}</span>
          <h2>{node.title}</h2><p className="node-detail-subtitle">{node.subtitle}</p>
          {node.evidenceLevel && <span className={`detail-evidence ${node.evidenceLevel === '已验证' ? 'verified' : ''}`}>{node.evidenceLevel}</span>}
          <p className="node-description">{node.description}</p>
          <div className="tag-row">{node.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          {node.kind !== 'paper' && <button className="primary-action full-width" onClick={() => onExpand(node)} disabled={expanding}>{expanding ? <LoaderCircle size={16} className="spin" /> : <Network size={16} />}{expanding ? '正在检索相关论文' : '向外发散相关论文'}<ArrowUpRight size={15} /></button>}
          {onSendToChat && <button className="secondary-action full-width" onClick={() => onSendToChat(node)}><Send size={15} />发送到 DSH 原生对话</button>}
          <section className="node-evidence"><div className="node-evidence-heading"><h3>关联原文</h3><span>{relatedPapers.length} 篇</span></div>
            {relatedPapers.length ? relatedPapers.map((paper) => <article className="compact-paper" key={paper.id}>
              <button onClick={() => onOpenPaper(paper)}><strong>{paper.title}</strong><small>{paper.authors}</small><span>{paper.venue} · {paper.year || '年份未知'} · 被引 {paper.citations.toLocaleString()}</span></button>
              <div><button className={savedIds.includes(paper.id) ? 'saved' : ''} onClick={() => onToggleSave(paper)} aria-label={savedIds.includes(paper.id) ? '取消收藏' : '收藏论文'}><Bookmark size={14} fill={savedIds.includes(paper.id) ? 'currentColor' : 'none'} /></button><a href={paper.url} target="_blank" rel="noreferrer" aria-label="打开论文原文"><ArrowUpRight size={15} /></a></div>
            </article>) : <div className="compact-empty"><BookOpen size={22} /><p>尚未展开论文证据。检索后，原文入口会保留在这里。</p></div>}
          </section>
        </> : <div className="compact-empty"><p>从图谱中选择一个节点查看详情。</p></div>}
      </div>}
    </aside>
  );
}
