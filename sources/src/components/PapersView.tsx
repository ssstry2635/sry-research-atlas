import { useMemo, useState } from 'react';
import { ArrowUpRight, Bookmark, BookOpen, Download, ExternalLink, Search } from 'lucide-react';
import type { Paper } from '../types';
import { exportBibtex } from '../lib/export';
import { paperOriginalHref, paperPdfHref } from '../lib/paper-links';

interface PapersViewProps {
  papers: Paper[];
  savedIds: string[];
  onToggleSave: (paper: Paper) => void;
  onOpenPaper: (paper: Paper) => void;
  library?: boolean;
  onExplore: () => void;
}

export function PapersView({ papers, savedIds, onToggleSave, onOpenPaper, library = false, onExplore }: PapersViewProps) {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<'year' | 'citations' | 'title'>('year');
  const filtered = useMemo(() => papers.filter((paper) => `${paper.title} ${paper.authors} ${paper.venue}`.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => {
    if (sort === 'citations') return b.citations - a.citations;
    if (sort === 'title') return a.title.localeCompare(b.title);
    return (b.year || 0) - (a.year || 0);
  }), [papers, filter, sort]);

  return <section className="content-view papers-view">
    <div className="content-view-heading"><div><span className="section-kicker">{library ? '跨探索保留的研究证据' : '每一篇都能回到原始来源'}</span><h1>{library ? '我的文献库' : '论文证据'}</h1><p>{library ? '收藏保存在当前浏览器中，可导出为 BibTeX 继续使用。' : '实时结果来自 OpenAlex、Crossref 与 arXiv；演示文献用于展示材料关系，不代表系统综述结论。'}</p></div>{papers.length > 0 && <button className="secondary-action" onClick={() => exportBibtex(library ? papers : filtered)}><Download size={16} />导出 BibTeX</button>}</div>
    {papers.length > 0 && <div className="paper-tools"><label className="list-search"><Search size={16} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="筛选题目、作者或期刊" aria-label="筛选论文" /></label><label className="sort-select">排序<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="year">最新发表</option><option value="citations">被引次数</option><option value="title">论文题目</option></select></label></div>}
    {filtered.length ? <div className="paper-list">{filtered.map((paper) => <article className="paper-row" key={paper.id}>
      <div className="paper-source-line"><span className={paper.source !== '演示数据' ? 'source-badge live' : 'source-badge'}>{paper.source}</span><span>{paper.year || '年份未知'}</span><span>{paper.venue}</span>{paper.openAccess && <span className="oa-badge">开放获取</span>}</div>
      <button className="paper-title-button" onClick={() => onOpenPaper(paper)}><h2>{paper.title}</h2></button>
      <p className="paper-authors">{paper.authors}</p>
      {paper.abstract && <p className="paper-abstract">{paper.abstract}</p>}
      <footer><span>被引 {paper.citations.toLocaleString()}</span><span>{paper.doi ? `DOI ${paper.doi}` : '未提供 DOI'}</span><div className="paper-row-actions"><button className={savedIds.includes(paper.id) ? 'saved' : ''} onClick={() => onToggleSave(paper)}><Bookmark size={15} fill={savedIds.includes(paper.id) ? 'currentColor' : 'none'} />{savedIds.includes(paper.id) ? '已收藏' : '收藏'}</button><button onClick={() => onOpenPaper(paper)}><BookOpen size={15} />证据详情</button>{paperPdfHref(paper) && <a href={paperPdfHref(paper)} target="_blank" rel="noreferrer"><Download size={14} />开放 PDF</a>}<a href={paperOriginalHref(paper)} target="_blank" rel="noreferrer">原文<ArrowUpRight size={14} /></a></div></footer>
    </article>)}</div> : <div className="empty-state"><span><BookOpen size={30} /></span><h2>{filter ? '没有符合筛选条件的论文' : library ? '文献库还是空的' : '尚未引入论文'}</h2><p>{filter ? '尝试缩短关键词或清空筛选。' : library ? '在节点详情或论文列表中收藏文献，它们会出现在这里。' : '从材料或方法节点向外发散，即可引入实时论文。'}</p>{filter ? <button className="secondary-action" onClick={() => setFilter('')}>清空筛选</button> : <button className="primary-action" onClick={onExplore}>返回发散地图<ExternalLink size={15} /></button>}</div>}
  </section>;
}
