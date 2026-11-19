import { useState } from 'react';
import { AlertTriangle, ArrowUpRight, BookOpen, CheckCircle2, ChevronDown, Download, FlaskConical, ListChecks, LoaderCircle, MapPin, Scale, SearchCheck, ShieldQuestion } from 'lucide-react';
import type { Paper, ProjectContext, Recommendation } from '../types';

interface DirectionsViewProps {
  recommendations: Recommendation[];
  papers: Record<string, Paper>;
  project: ProjectContext;
  onOpenPaper: (paper: Paper) => void;
  onExport: () => void;
  onProject: () => void;
  onCheckCounter?: (recommendation: Recommendation) => void;
  counterEvidence?: Record<string, Paper[]>;
  checkingCounterId?: string | null;
  onLocateNode?: (recommendation: Recommendation) => void;
}

export function DirectionsView({ recommendations, papers, project, onOpenPaper, onExport, onProject, onCheckCounter, counterEvidence = {}, checkingCounterId, onLocateNode }: DirectionsViewProps) {
  const [openId, setOpenId] = useState<string | undefined>(recommendations[0]?.id);
  const [reasoningId, setReasoningId] = useState<string | undefined>();
  return <section className="content-view directions-view">
    <div className="content-view-heading"><div><span className="section-kicker">候选生成、透明排序与反证核查</span><h1>值得延伸的方向</h1><p>每个方向都来自具体图谱节点。评分用于比较候选，不代表实验成功概率。</p></div><button className="secondary-action" onClick={onExport}><Download size={16} />导出研究简报</button></div>
    <button className="direction-context" onClick={onProject}><FlaskConical size={19} /><span><strong>{project.title}</strong><small>{project.progress}</small></span><em>更新进展</em></button>
    <div className="direction-list">{recommendations.map((rec) => {
      const open = openId === rec.id;
      const supportingIds = rec.supportingPaperIds || rec.paperIds;
      const counterPapers = counterEvidence[rec.id] || [];
      return <article className="direction-row" key={rec.id}>
        <button className="direction-heading" onClick={() => setOpenId(open ? undefined : rec.id)} aria-expanded={open}>
          <span className="direction-score"><strong>{rec.match}</strong><small>/ 100</small></span><span><small>{rec.eyebrow}</small><h2>{rec.title}</h2><span className="tag-row">{rec.tags.map((tag) => <i key={tag}>{tag}</i>)}{rec.cost && <i>成本 {rec.cost}</i>}</span></span><ChevronDown className={open ? 'rotated' : ''} size={19} />
        </button>
        {open && <div className="direction-body"><div className="direction-explanation">
          <section><h3><ShieldQuestion size={16} />需要验证什么</h3><p>{rec.summary}</p></section>
          <section className="next-experiment"><h3>下一步最小实验</h3><p>{rec.nextStep}</p>{rec.stopCondition && <small>停止条件：{rec.stopCondition}</small>}</section>
          <button className="reasoning-toggle" onClick={() => setReasoningId(reasoningId === rec.id ? undefined : rec.id)} aria-expanded={reasoningId === rec.id}><Scale size={14} />推荐依据与边界<ChevronDown size={14} className={reasoningId === rec.id ? 'rotated' : ''} /></button>
          {reasoningId === rec.id && <div className="reasoning-details">
            {rec.scoreBreakdown && <section className="score-section"><h3>排序依据</h3><div className="score-breakdown">{([['课题相关', rec.scoreBreakdown.relevance], ['实验可行', rec.scoreBreakdown.feasibility], ['证据完整', rec.scoreBreakdown.evidence], ['新颖程度', rec.scoreBreakdown.novelty]] as const).map(([label, score]) => <div key={label}><span>{label}<strong>{score}</strong></span><i><b style={{ width: `${score}%` }} /></i></div>)}</div></section>}
            <section><h3><CheckCircle2 size={16} />为什么与你相关</h3><p>{rec.rationale}</p>{rec.risk && <p className="risk-note"><AlertTriangle size={13} />{rec.risk}</p>}</section>
            {rec.variables && <section><h3><ListChecks size={16} />本轮只比较这些变量</h3><div className="variable-list">{rec.variables.map((variable) => <span key={variable}>{variable}</span>)}</div></section>}
            {rec.searchScope && <p className="search-scope">检索范围：{rec.searchScope}</p>}
            {onCheckCounter && <section className="counter-check"><button className="secondary-action" onClick={() => onCheckCounter(rec)} disabled={checkingCounterId === rec.id}>{checkingCounterId === rec.id ? <LoaderCircle size={15} className="spin" /> : <SearchCheck size={15} />}{checkingCounterId === rec.id ? '正在核查边界线索' : '核查潜在反证与边界'}</button><p>核查结果仅作为待阅读线索，不会自动归类为已证实反证。</p>{counterPapers.map((paper) => <button className="counter-paper" key={paper.id} onClick={() => onOpenPaper(paper)}><span>待核验</span><strong>{paper.title}</strong><ArrowUpRight size={12} /></button>)}</section>}
          </div>}
        </div><aside className="direction-evidence"><div className="evidence-aside-heading"><h3>支撑证据</h3>{onLocateNode && rec.sourceNodeIds?.length && <button onClick={() => onLocateNode(rec)}><MapPin size={13} />定位图谱</button>}</div>{supportingIds.map((id) => papers[id]).filter(Boolean).map((paper) => <button key={paper.id} onClick={() => onOpenPaper(paper)}><BookOpen size={16} /><span><strong>{paper.title}</strong><small>{paper.venue} · {paper.year}</small></span><ArrowUpRight size={14} /></button>)}{!supportingIds.length && <p className="evidence-empty">尚无直接论文。应先展开该节点检索，再决定是否投入实验。</p>}</aside></div>}
      </article>;
    })}</div>
  </section>;
}
