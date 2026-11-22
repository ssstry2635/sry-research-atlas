import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, FileText, GitCommitHorizontal, LoaderCircle, MessageCircleQuestion, Minus, Plus, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { fetchPaperFullText } from './api';
import type { MindMap, MindMapNode, MindMapRelation, Paper } from '../src/types';

interface MindMapDialogProps {
  paper: Paper;
  mindMap: MindMap;
  onClose: () => void;
  onAsk: (paper: Paper, node: MindMapNode, customQuestion: string, fullTextContext?: { available: boolean; source: string; text: string; pdfSavedPath?: string }) => void;
}

const WIDTH = 1140;
const HEIGHT = 560;
const NODE_WIDTH = 206;
const NODE_HEIGHT = 92;

function buildRelations(mindMap: MindMap): MindMapRelation[] {
  if (Array.isArray(mindMap.relations) && mindMap.relations.length > 0) {
    return mindMap.relations;
  }
  const byId = new Map(mindMap.nodes.map((n) => [n.id, n]));
  const list: MindMapRelation[] = [];
  const seen = new Set<string>();
  mindMap.nodes.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) {
      const key = `${node.parentId}->${node.id}`;
      seen.add(key);
      list.push({ source: node.parentId, target: node.id, label: node.relation || '递进推导' });
    }
  });
  (mindMap.edges || []).forEach(([src, tgt]) => {
    const key = `${src}->${tgt}`;
    if (!seen.has(key) && byId.has(src) && byId.has(tgt)) {
      seen.add(key);
      list.push({ source: src, target: tgt, label: '关联印证' });
    }
  });
  return list;
}

function computeLayout(nodes: MindMapNode[], relations: MindMapRelation[]) {
  const positions = new Map<string, { x: number; y: number; level: number }>();
  if (!nodes.length) return { positions, degree: new Map() };

  // Distribute nodes into a balanced 4-column staggered relational topology so edges and relation pills never collide with cards
  const root = nodes[0];
  const rest = nodes.slice(1);
  const col1 = rest.slice(0, Math.min(2, Math.ceil(rest.length / 3)));
  const col2 = rest.slice(col1.length, col1.length + Math.min(2, Math.ceil((rest.length - col1.length) / 2)));
  const col3 = rest.slice(col1.length + col2.length);

  const columns: MindMapNode[][] = [[root], col1, col2, col3].filter((col) => col.length > 0);
  const columnX = [34, 322, 616, 902];

  columns.forEach((group, colIdx) => {
    const x = columnX[Math.min(colIdx, columnX.length - 1)];
    if (group.length === 1) {
      // Stagger single-node columns slightly if adjacent columns also have 1 node, otherwise center vertically
      const y = colIdx === 0 ? HEIGHT / 2 - NODE_HEIGHT / 2 : (colIdx % 2 === 1 ? 116 : 348);
      positions.set(group[0].id, { x, y, level: colIdx });
    } else if (group.length === 2) {
      positions.set(group[0].id, { x, y: 102, level: colIdx });
      positions.set(group[1].id, { x, y: 362, level: colIdx });
    } else {
      const step = Math.min(156, (HEIGHT - 124) / (group.length - 1));
      const totalHeight = step * (group.length - 1);
      const startY = HEIGHT / 2 - totalHeight / 2 - NODE_HEIGHT / 2;
      group.forEach((node, index) => {
        positions.set(node.id, { x, y: startY + index * step, level: colIdx });
      });
    }
  });

  // Add incoming/outgoing count for display
  const degree = new Map<string, { inCount: number; outCount: number }>();
  nodes.forEach((n) => degree.set(n.id, { inCount: 0, outCount: 0 }));
  relations.forEach((rel) => {
    const src = degree.get(rel.source);
    const tgt = degree.get(rel.target);
    if (src) src.outCount += 1;
    if (tgt) tgt.inCount += 1;
  });

  return { positions, degree };
}

export function MindMapDialog({ paper, mindMap, onClose, onAsk }: MindMapDialogProps) {
  const [selectedId, setSelectedId] = useState(mindMap.nodes[0]?.id);
  const [zoom, setZoom] = useState(1);
  const [askModalOpen, setAskModalOpen] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [includeFullText, setIncludeFullText] = useState(true);
  const [downloadingText, setDownloadingText] = useState(false);
  const [statusNote, setStatusNote] = useState('');

  const relations = useMemo(() => buildRelations(mindMap), [mindMap]);
  const { positions, degree } = useMemo(() => computeLayout(mindMap.nodes, relations), [mindMap.nodes, relations]);
  const byId = useMemo(() => new Map(mindMap.nodes.map((node) => [node.id, node])), [mindMap.nodes]);
  const selected = mindMap.nodes.find((node) => node.id === selectedId) || mindMap.nodes[0];

  const selectedRelations = useMemo(() => {
    if (!selected) return { upstream: [], downstream: [] };
    const upstream = relations
      .filter((r) => r.target === selected.id && byId.has(r.source))
      .map((r) => ({ ...r, node: byId.get(r.source)! }));
    const downstream = relations
      .filter((r) => r.source === selected.id && byId.has(r.target))
      .map((r) => ({ ...r, node: byId.get(r.target)! }));
    return { upstream, downstream };
  }, [selected, relations, byId]);

  const openAskPopover = (node: MindMapNode) => {
    setSelectedId(node.id);
    setCustomQuestion(node.question || `请围绕“${node.label}”分析原文的具体实验或理论证据及其适用边界。`);
    setStatusNote('');
    setAskModalOpen(true);
  };

  const confirmAndSendAsk = async () => {
    if (!selected || downloadingText) return;
    const finalQuestion = customQuestion.trim() || selected.question;
    let fullTextContext: { available: boolean; source: string; text: string; pdfSavedPath?: string } | undefined;

    if (includeFullText) {
      setDownloadingText(true);
      setStatusNote('正在检测并尝试下载论文开放全文与原始 PDF…');
      try {
        const fetched = await fetchPaperFullText(paper);
        fullTextContext = {
          available: fetched.available || Boolean(mindMap.fullTextAvailable),
          source: fetched.source || mindMap.fullTextSource || '论文原文记录',
          text: fetched.text || mindMap.fullTextExcerpt || selected.originalText || paper.abstract || '',
          pdfSavedPath: fetched.pdfSavedPath || mindMap.pdfSavedPath,
        };
      } catch {
        const fallbackText = mindMap.fullTextExcerpt || selected.originalText || paper.abstract || '';
        if (fallbackText) {
          fullTextContext = {
            available: Boolean(mindMap.fullTextAvailable),
            source: mindMap.fullTextSource || '节点绑定原文/摘要片段',
            text: fallbackText,
            pdfSavedPath: mindMap.pdfSavedPath,
          };
        }
      } finally {
        setDownloadingText(false);
      }
    }

    setAskModalOpen(false);
    onAsk(paper, selected, finalQuestion, fullTextContext);
  };

  const selectedOriginalText = useMemo(() => {
    if (!selected) return '';
    if (selected.originalText && selected.originalText.trim().length > 0) {
      return selected.originalText.trim();
    }
    if (paper.abstract && paper.abstract.trim().length > 0) {
      return paper.abstract.trim();
    }
    return `Title: ${paper.title}\nAuthors: ${paper.authors}\nJournal: ${paper.venue} (${paper.year || '年份未知'})\nDOI: ${paper.doi || '未提供'}\n说明：该论文在开放检索源中未公开免费摘要或开放获取 PDF 全文，当前节点对应的原始记录为上述题录信息。`;
  }, [selected, paper]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal mindmap-dialog" role="dialog" aria-modal="true" aria-labelledby="mindmap-title">
        <header>
          <span className="modal-icon"><BookOpen size={19} /></span>
          <div>
            <span className="section-kicker">结构化关系网络 · 点击任意节点框对照查看详细原文并定向追问</span>
            <h2 id="mindmap-title">{mindMap.title}</h2>
          </div>
          <div className="mindmap-source-pill" title={mindMap.fullTextSource || '数据来源'}>
            <FileText size={13} />
            <span>{mindMap.fullTextAvailable ? `已载入开放原文 · ${mindMap.fullTextSource}` : (paper.abstract ? '已载入原始摘要段落' : '仅题录原文（闭源期刊）')}</span>
          </div>
          <div className="mindmap-zoom-bar">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.75, z - 0.12))} aria-label="缩小导图"><Minus size={14} /></button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(1.45, z + 0.12))} aria-label="放大导图"><Plus size={14} /></button>
            <button type="button" onClick={() => setZoom(1)} aria-label="重置缩放"><RotateCcw size={13} /></button>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭思维导图"><X size={18} /></button>
        </header>

        <p className="mindmap-summary">
          {mindMap.generatedBy === 'fallback' ? '已按科研因果链生成跨部分关系网络；' : ''}
          {mindMap.summary}
        </p>

        <div className="mindmap-workbench">
          <div className="mindmap-canvas">
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label="论文部分关系思维导图，点击节点查看对应详细原文">
              <defs>
                <marker id="mm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="currentColor" />
                </marker>
                <marker id="mm-arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
                  <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#0d7a5f" />
                </marker>
              </defs>
              <g transform={`translate(${(WIDTH * (1 - zoom)) / 2} ${(HEIGHT * (1 - zoom)) / 2}) scale(${zoom})`}>
                {relations.map((rel, idx) => {
                  const parent = positions.get(rel.source);
                  const child = positions.get(rel.target);
                  if (!parent || !child) return null;
                  const sameColumn = Math.abs(child.x - parent.x) < 30;
                  const forward = child.x > parent.x + 20;
                  let fromX: number;
                  let fromY: number;
                  let toX: number;
                  let toY: number;
                  let d: string;
                  let midX: number;
                  let midY: number;

                  if (sameColumn) {
                    const down = child.y >= parent.y;
                    fromX = parent.x + NODE_WIDTH / 2;
                    fromY = down ? parent.y + NODE_HEIGHT : parent.y;
                    toX = child.x + NODE_WIDTH / 2;
                    toY = down ? child.y : child.y + NODE_HEIGHT;
                    d = `M ${fromX} ${fromY} L ${toX} ${toY}`;
                    midX = fromX;
                    midY = (fromY + toY) / 2;
                  } else if (forward) {
                    fromX = parent.x + NODE_WIDTH;
                    fromY = parent.y + NODE_HEIGHT / 2;
                    toX = child.x;
                    toY = child.y + NODE_HEIGHT / 2;
                    const span = Math.abs(toX - fromX);
                    const bend = Math.max(32, Math.min(90, span * 0.45));
                    d = `M ${fromX} ${fromY} C ${fromX + bend} ${fromY}, ${toX - bend} ${toY}, ${toX} ${toY}`;
                    midX = (fromX + toX) / 2;
                    midY = (fromY + toY) / 2 + (idx % 2 === 0 ? -8 : 8);
                  } else {
                    fromX = parent.x;
                    fromY = parent.y + NODE_HEIGHT / 2;
                    toX = child.x + NODE_WIDTH;
                    toY = child.y + NODE_HEIGHT / 2;
                    const bend = Math.max(32, Math.abs(toX - fromX) * 0.45);
                    d = `M ${fromX} ${fromY} C ${fromX - bend} ${fromY}, ${toX + bend} ${toY}, ${toX} ${toY}`;
                    midX = (fromX + toX) / 2;
                    midY = (fromY + toY) / 2;
                  }

                  const active = selected?.id === rel.source || selected?.id === rel.target;
                  const labelText = rel.label.slice(0, 10);
                  const pillW = Math.max(56, labelText.length * 10 + 12);
                  return (
                    <g key={`${rel.source}-${rel.target}-${idx}`} className={active ? 'mindmap-edge-group active' : 'mindmap-edge-group'}>
                      <path
                        className={active ? 'mindmap-edge active' : 'mindmap-edge'}
                        d={d}
                        markerEnd={active ? 'url(#mm-arrow-active)' : 'url(#mm-arrow)'}
                      />
                      {labelText && (
                        <g transform={`translate(${midX} ${midY})`}>
                          <rect x={-pillW / 2} y={-8.5} width={pillW} height={17} rx={8.5} className={active ? 'mindmap-edge-pill active' : 'mindmap-edge-pill'} />
                          <text y={3} textAnchor="middle" className={active ? 'mindmap-edge-label active' : 'mindmap-edge-label'}>
                            {labelText}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
                {mindMap.nodes.map((node) => {
                  const pos = positions.get(node.id);
                  if (!pos) return null;
                  const isSelected = node.id === selected?.id;
                  const isLinked = relations.some((r) => (r.source === selected?.id && r.target === node.id) || (r.target === selected?.id && r.source === node.id));
                  const deg = degree.get(node.id) || { inCount: 0, outCount: 0 };
                  const stageName = pos.level === 0 ? '核心立论' : pos.level === 1 ? '制备与结构' : pos.level === 2 ? '物性与直接证据' : '边界与外推';
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${pos.x} ${pos.y})`}
                      className={isSelected ? 'mindmap-node selected' : isLinked ? 'mindmap-node linked' : 'mindmap-node'}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(node.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedId(node.id);
                        }
                      }}
                    >
                      <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="12" />
                      <path d={`M 2 12 L 2 ${NODE_HEIGHT - 12}`} className={`mindmap-accent level-${pos.level}`} />
                      <text className="mindmap-level" x="14" y="20">
                        {stageName} · 关联 {deg.inCount + deg.outCount}
                      </text>
                      <text className="mindmap-label" x="14" y="42">
                        {node.label.slice(0, 14)}
                      </text>
                      <text className="mindmap-zh" x="14" y="61">
                        {node.zh.length > 17 ? `${node.zh.slice(0, 16)}…` : node.zh}
                      </text>
                      <text className="mindmap-click-hint" x="14" y="79">
                        {isSelected ? '● 已展开右侧详细原文' : '点击查看对应原文与关系'}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {selected && (
            <aside className="mindmap-inspector" aria-label="选中节点的详细原文与关系分析">
              <div className="mindmap-inspector-head">
                <div>
                  <span className="mindmap-stage-tag">{selected.section || '原文章节映射'}</span>
                  <h3>{selected.label}</h3>
                </div>
                <button type="button" className="primary-action" onClick={() => openAskPopover(selected)}>
                  送入 DSH 追问该节点
                  <ArrowRight size={15} />
                </button>
              </div>

              <div className="mindmap-relations-box">
                <div className="mindmap-rel-title">
                  <GitCommitHorizontal size={14} />
                  <span>与其他部分的逻辑关系（点击可跳转）</span>
                </div>
                <div className="mindmap-rel-chips">
                  {selectedRelations.upstream.map((item) => (
                    <button key={`in-${item.source}`} type="button" className="mindmap-rel-chip upstream" onClick={() => setSelectedId(item.source)}>
                      <small>前置依据 · {item.label}</small>
                      <strong>← {item.node.label}</strong>
                    </button>
                  ))}
                  {selectedRelations.downstream.map((item) => (
                    <button key={`out-${item.target}`} type="button" className="mindmap-rel-chip downstream" onClick={() => setSelectedId(item.target)}>
                      <small>推导/支撑 · {item.label}</small>
                      <strong>→ {item.node.label}</strong>
                    </button>
                  ))}
                  {selectedRelations.upstream.length === 0 && selectedRelations.downstream.length === 0 && (
                    <span className="mindmap-rel-empty">当前节点为独立顶层锚点</span>
                  )}
                </div>
              </div>

              <div className="mindmap-analysis-box">
                <h4>结构化解析与逻辑角色</h4>
                <p>{selected.zh}</p>
              </div>

              <div className="mindmap-original-box">
                <div className="mindmap-original-header">
                  <span><FileText size={14} /> 对应详细原文段落（{selected.section || mindMap.fullTextSource || '原始记录'}）</span>
                  <small>{mindMap.fullTextAvailable ? '开放全文提取' : (paper.abstract ? '原始摘要段落' : '原始题录')}</small>
                </div>
                <div className="mindmap-original-content">
                  {selectedOriginalText}
                </div>
              </div>

              <div className="mindmap-suggested-box">
                <strong><MessageCircleQuestion size={15} /> 建议追问方向</strong>
                <p>{selected.question}</p>
              </div>
            </aside>
          )}
        </div>

        {askModalOpen && selected && (
          <div className="mindmap-ask-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !downloadingText) setAskModalOpen(false); }}>
            <div className="mindmap-ask-popover" role="dialog" aria-modal="true" aria-labelledby="ask-popover-title">
              <header>
                <div className="mindmap-ask-title">
                  <Sparkles size={16} />
                  <strong id="ask-popover-title">向 DSH 发起节点深度追问 · {selected.label}</strong>
                </div>
                <button type="button" className="icon-button-sm" onClick={() => setAskModalOpen(false)} disabled={downloadingText} aria-label="关闭追问悬浮框">
                  <X size={15} />
                </button>
              </header>

              <p className="mindmap-ask-desc">
                你可以点击下方快捷角度或自由编辑要继续追问的问题。发送前系统会自动检查是否可下载到该论文的开放原文（PDF 或开放全文），若可获取将连同原文一并送入 DSH 对话。
              </p>

              <div className="mindmap-ask-templates" aria-label="快捷追问角度">
                <button type="button" onClick={() => setCustomQuestion(selected.question)}>默认深度追问</button>
                <button type="button" onClick={() => setCustomQuestion(`针对“${selected.label}”部分，原文给出了哪些具体的实验条件、定量参数或理论推导步骤？请结合原文逐条说明。`)}>追问原文实验细节</button>
                <button type="button" onClick={() => setCustomQuestion(`“${selected.label}”与论文上下游部分之间是如何形成因果支撑的？现有原文证据能否排除其他竞争解释？`)}>核查各部分因果证据</button>
                <button type="button" onClick={() => setCustomQuestion(`如果要把论文中“${selected.label}”的方案迁移到我们的课题体系，它的适用边界、潜在失效风险和最小对照实验是什么？`)}>迁移到我的课题体系</button>
              </div>

              <label className="mindmap-ask-field">
                <span>你要继续追问什么问题？</span>
                <textarea
                  rows={4}
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="请输入你想针对该节点深入探讨的具体科学问题、实验判据或迁移条件…"
                  autoFocus
                />
              </label>

              <div className="mindmap-ask-preview">
                <span>当前节点绑定原文预览（{selected.section || '原文片段'}）</span>
                <p>{selectedOriginalText.slice(0, 360)}{selectedOriginalText.length > 360 ? '…' : ''}</p>
              </div>

              <label className="mindmap-ask-checkbox">
                <input
                  type="checkbox"
                  checked={includeFullText}
                  onChange={(e) => setIncludeFullText(e.target.checked)}
                />
                <span>
                  送入前自动下载并附带论文原文（{mindMap.fullTextAvailable ? '已检测到开放全文，将完整附带核心章节' : (paper.openAccess || paper.pdfUrl ? '将尝试下载开放 PDF 并提取全文送入' : '若开放全文受限则附带节点原文片段与题录')}）
                </span>
              </label>

              {statusNote && (
                <div className="mindmap-ask-status">
                  <LoaderCircle size={14} className="spin" />
                  <span>{statusNote}</span>
                </div>
              )}

              <footer>
                <button type="button" className="secondary-action" onClick={() => setAskModalOpen(false)} disabled={downloadingText}>
                  取消
                </button>
                <button type="button" className="primary-action" onClick={confirmAndSendAsk} disabled={downloadingText}>
                  {downloadingText ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}
                  {downloadingText ? '正在获取原文并送入…' : '确认并连同原文送入 DSH'}
                </button>
              </footer>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
