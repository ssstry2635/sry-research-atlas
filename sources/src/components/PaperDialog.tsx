import { ArrowUpRight, Bookmark, BookOpen, LoaderCircle, MessageCircle, Network, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { Paper } from '../types';

interface PaperDialogProps { paper: Paper; saved: boolean; onToggleSave: () => void; onClose: () => void; onMindMap?: () => void; mindMapLoading?: boolean; onSendToChat?: () => void; }

export function PaperDialog({ paper, saved, onToggleSave, onClose, onMindMap, mindMapLoading, onSendToChat }: PaperDialogProps) {
  const dialogRef = useFocusTrap(onClose);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><article ref={dialogRef} className="modal paper-dialog" role="dialog" aria-modal="true" aria-labelledby="paper-dialog-title">
    <header><div className="paper-source-line"><span className={paper.source !== '演示数据' ? 'source-badge live' : 'source-badge'}>{paper.source}</span>{paper.openAccess && <span className="oa-badge">开放获取</span>}</div><button className="icon-button" onClick={onClose} aria-label="关闭论文详情"><X size={19} /></button></header>
    <span className="paper-dialog-icon"><BookOpen size={24} /></span><h2 id="paper-dialog-title">{paper.title}</h2><p className="paper-authors">{paper.authors}</p><p className="paper-dialog-meta">{paper.venue} · {paper.year || '年份未知'} · 被引 {paper.citations.toLocaleString()}</p>
    {(paper.summaryEn || paper.summaryZh) && <section className="paper-bilingual"><h3>英文概括与中文对照</h3>{paper.summaryEn && <p className="paper-summary-en">{paper.summaryEn}</p>}{paper.summaryZh && <p className="paper-summary-zh">{paper.summaryZh}</p>}{paper.keyFinding && <small>关键发现：{paper.keyFinding}</small>}</section>}
    <section><h3>摘要与证据说明</h3><p>{paper.abstract || 'OpenAlex 未提供可显示的摘要。你仍可通过原文入口查看出版方页面与完整元数据。'}</p></section>
    {paper.doi && <p className="doi-line">DOI <span>{paper.doi}</span></p>}
    <p className="form-note">外部链接指向开放获取地址、DOI 或出版方页面。全文访问权限取决于论文开放状态与你的机构订阅。</p>
    <footer>{onSendToChat && <button className="secondary-action" onClick={onSendToChat}><MessageCircle size={16} />发送到 DSH 对话</button>}{onMindMap && <button className="secondary-action" onClick={onMindMap} disabled={mindMapLoading}>{mindMapLoading ? <LoaderCircle size={16} className="spin" /> : <Network size={16} />}{mindMapLoading ? '正在生成思维导图' : '生成论文思维导图'}</button>}<button className={saved ? 'secondary-action saved' : 'secondary-action'} onClick={onToggleSave}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />{saved ? '已收藏' : '收藏到文献库'}</button><a className="primary-action" href={paper.url} target="_blank" rel="noreferrer">回溯原文<ArrowUpRight size={16} /></a></footer>
  </article></div>;
}
