import { useState } from 'react';
import { ArrowUpRight, Bookmark, BookOpen, ChevronDown, ChevronRight, Download, FlaskConical, LoaderCircle, Network, PencilLine, Quote, SearchCheck, Send, Sparkles } from 'lucide-react';
import type { Paper, ProjectContext, Recommendation, ResearchNode } from '../types';
import { paperOriginalHref, paperPdfHref } from '../lib/paper-links';

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
  const primaryPaper = node?.kind === 'paper' ? relatedPapers[0] : undefined;

  return (
    <aside className="inspector" aria-label="研究推荐与节点详情">
      <div className="inspector-tabs" role="tablist" aria-label="右侧面板">
        <button role="tab" aria-selected={tab === 'recommendations'} className={tab === 'recommendations' ? 'active' : ''} onClick={() => onTab('recommendations')}>
          <Sparkles size={14} /><span>方向推荐</span><em>{recommendations.length}</em>
        </button>
        <button role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'active' : ''} onClick={() => onTab('details')}>
          <Network size={14} /><span>节点详情</span>{relatedPapers.length > 0 && <em>{relatedPapers.length}</em>}
        </button>
      </div>

      {tab === 'recommendations' ? <div className="recommendation-panel" role="tabpanel">
        <div className="recommendation-intro">
          <div>
            <span className="section-kicker">基于课题上下文与证据图谱</span>
            <h2>下一步，值得往哪里走？</h2>
          </div>
          <button className="icon-button-sm" onClick={onProject} aria-label="编辑推荐依据" title="编辑课题背景与实验约束"><PencilLine size={14} /></button>
        </div>
        <button className="context-summary" onClick={onProject}>
          <div className="context-icon"><FlaskConical size={16} /></div>
          <span>
            <strong>{project.target} · {project.stage}</strong>
            <small>{project.goal}</small>
          </span>
          <ChevronRight size={15} />
        </button>
        <div className="recommendation-list">
          {recommendations.map((rec) => {
            const open = openRec === rec.id;
            return <article key={rec.id} className={open ? 'recommendation-card open' : 'recommendation-card'}>
              <button className="recommendation-toggle" onClick={() => setOpenRec(open ? null : rec.id)} aria-expanded={open}>
                <span className="match-score"><strong>{rec.match}</strong><small>匹配度</small></span>
                <span className="recommendation-copy">
                  <span className="rec-meta-row"><small>{rec.eyebrow}</small><span className="evidence-tag"><i />{rec.evidenceLevel}</span></span>
                  <strong>{rec.title}</strong>
                </span>
                <ChevronDown size={15} className={open ? 'rotated' : ''} />
              </button>
              {open && <div className="recommendation-detail">
                <p>{rec.summary}</p>
                <div className="experiment-box">
                  <h3>建议的最小对照验证</h3>
                  <p>{rec.nextStep}</p>
                </div>
                <div className="evidence-links">{rec.paperIds.map((id) => papers[id]).filter(Boolean).slice(0, 3).map((paper) => <button key={paper.id} onClick={() => onOpenPaper(paper)}><BookOpen size={12} /><span>{paper.venue} {paper.year}</span><ArrowUpRight size={11} /></button>)}</div>
                <button className="reasoning-toggle compact" onClick={() => setReasoningRec(reasoningRec === rec.id ? null : rec.id)} aria-expanded={reasoningRec === rec.id}><Quote size={12} />查看评分拆解与反证核查<ChevronDown size={12} className={reasoningRec === rec.id ? 'rotated' : ''} /></button>
                {reasoningRec === rec.id && <div className="reasoning-details">
                  <div className="rationale"><Quote size={14} /><p>{rec.rationale}</p></div>
                  {rec.scoreBreakdown && <div className="score-mini"><span>相关性 <strong>{rec.scoreBreakdown.relevance}</strong></span><span>可行性 <strong>{rec.scoreBreakdown.feasibility}</strong></span><span>证据度 <strong>{rec.scoreBreakdown.evidence}</strong></span><span>新颖度 <strong>{rec.scoreBreakdown.novelty}</strong></span></div>}
                  {rec.stopCondition && <p className="stop-mini"><strong>停止条件：</strong>{rec.stopCondition}</p>}
                  {onCheckCounter && <div className="counter-mini"><button className="counter-trigger" onClick={() => onCheckCounter(rec)} disabled={checkingCounterId === rec.id}>{checkingCounterId === rec.id ? <LoaderCircle size={13} className="spin" /> : <SearchCheck size={13} />}{checkingCounterId === rec.id ? '正在检索反证线索…' : '检索潜在反证与边界文献'}</button>{(counterEvidence[rec.id] || []).slice(0, 2).map((paper) => <button className="counter-item" key={paper.id} onClick={() => onOpenPaper(paper)}><span>待核验：{paper.title}</span><ArrowUpRight size={12} /></button>)}</div>}
                </div>}
              </div>}
            </article>;
          })}
        </div>
        <p className="recommendation-note">匹配度由课题约束与图谱证据关联规则透明计算，不代表实验成功概率。</p>
      </div> : <div className="node-panel" role="tabpanel">
        {node ? <>
          <div className="node-hero-header">
            <div className={`node-detail-emblem ${node.kind}`}>
              <span>{node.kind === 'paper' ? '¶' : node.kind === 'method' ? 'M' : node.kind === 'opportunity' ? '↗' : node.kind === 'family' ? 'Σ' : '◇'}</span>
            </div>
            <div className="node-hero-meta">
              <div className="node-badge-row">
                <span className="section-kicker">{kindNames[node.kind]}{node.relation ? ` · ${node.relation}` : ''}</span>
                {node.evidenceLevel && <span className={`detail-evidence ${node.evidenceLevel === '已验证' ? 'verified' : ''}`}>{node.evidenceLevel}</span>}
              </div>
              <h2>{node.title}</h2>
              <p className="node-detail-subtitle">{node.subtitle}</p>
            </div>
          </div>

          <p className="node-description">{node.description}</p>
          <div className="tag-row">{node.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>

          {primaryPaper && (primaryPaper.summaryZh || primaryPaper.summaryEn) && <div className="inspector-bilingual-card">
            {primaryPaper.summaryZh && <div className="ib-block"><span>中文核心概括</span><p>{primaryPaper.summaryZh}</p></div>}
            {primaryPaper.keyFinding && <div className="ib-finding"><strong>关键发现：</strong>{primaryPaper.keyFinding}</div>}
          </div>}

          <div className="node-action-stack">
            {node.kind !== 'paper' ? (
              <button className="primary-action full-width" onClick={() => onExpand(node)} disabled={expanding}>
                {expanding ? <LoaderCircle size={15} className="spin" /> : <Network size={15} />}
                <span>{expanding ? '正在检索相关论文…' : '向外发散相关论文'}</span>
                <ArrowUpRight size={15} />
              </button>
            ) : primaryPaper ? (
              <button className="primary-action full-width" onClick={() => onOpenPaper(primaryPaper)}>
                <BookOpen size={15} />
                <span>打开论文详情与思维导图</span>
                <ArrowUpRight size={15} />
              </button>
            ) : null}
            {onSendToChat && <button className="secondary-action full-width" onClick={() => onSendToChat(node)}><Send size={14} /><span>发送到 DSH 原生对话</span></button>}
          </div>

          <section className="node-evidence">
            <div className="node-evidence-heading"><h3>关联论文证据</h3><span>{relatedPapers.length} 篇</span></div>
            {relatedPapers.length ? relatedPapers.map((paper) => <article className="compact-paper" key={paper.id}>
              <button onClick={() => onOpenPaper(paper)}>
                <strong>{paper.title}</strong>
                <small>{paper.authors}</small>
                <span>{paper.source} · {paper.venue} · {paper.year || '年份未知'} · 被引 {paper.citations.toLocaleString()}{paper.pdfUrl ? ' · 开放 PDF' : ''}</span>
              </button>
              <div className="compact-paper-actions">
                <button className={savedIds.includes(paper.id) ? 'saved' : ''} onClick={() => onToggleSave(paper)} aria-label={savedIds.includes(paper.id) ? '取消收藏' : '收藏论文'} title="收藏论文"><Bookmark size={14} fill={savedIds.includes(paper.id) ? 'currentColor' : 'none'} /></button>
                {paperPdfHref(paper) && <a href={paperPdfHref(paper)} target="_blank" rel="noreferrer" aria-label="下载开放 PDF" title="下载开放 PDF"><Download size={14} /></a>}
                <a href={paperOriginalHref(paper)} target="_blank" rel="noreferrer" aria-label="打开论文原文" title="打开论文原文"><ArrowUpRight size={14} /></a>
              </div>
            </article>) : <div className="compact-empty"><BookOpen size={22} /><p>尚未展开论文证据。点击上方“向外发散相关论文”即可引入多源文献。</p></div>}
          </section>
        </> : <div className="compact-empty"><p>从图谱中选择一个节点查看详情。</p></div>}
      </div>}
    </aside>
  );
}
