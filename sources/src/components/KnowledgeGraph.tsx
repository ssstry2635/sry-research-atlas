import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Focus, Layers3, Minus, Plus, RotateCcw } from 'lucide-react';
import type { ChatCard, GraphData, NodeKind, Paper, ResearchNode } from '../types';
import { computeGraphLayout, GRAPH_CENTER_X, GRAPH_HEIGHT, GRAPH_WIDTH, PAPERS_PER_PAGE, shortGraphText, wrapGraphText, type GraphPosition } from '../lib/graph-layout';

interface KnowledgeGraphProps {
  graph: GraphData;
  papers: Record<string, Paper>;
  selectedId: string;
  onSelect: (node: ResearchNode) => void;
  loading: boolean;
  searchLabel?: string;
  onReset: () => void;
  onDropToChat?: (card: ChatCard) => void;
}

const kindLabels: Record<NodeKind, string> = { material: '材料体系', family: '同族同构', method: '制备方法', paper: '研究论文', opportunity: '延伸机会' };
const kindGlyphs: Record<NodeKind, string> = { material: '◇', family: 'Σ', method: 'M', paper: '¶', opportunity: '↗' };
const allKinds = Object.keys(kindLabels) as NodeKind[];

function overlaps(a: GraphPosition, b: GraphPosition) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 22 && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 18;
}

export function KnowledgeGraph({ graph, papers, selectedId, onSelect, loading, searchLabel, onReset, onDropToChat }: KnowledgeGraphProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [positions, setPositions] = useState<Record<string, GraphPosition>>({});
  const [visibleKinds, setVisibleKinds] = useState<Set<NodeKind>>(new Set(allKinds));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [focusedBranchId, setFocusedBranchId] = useState<string | null>(null);
  const [paperPage, setPaperPage] = useState(0);
  const [paperHover, setPaperHover] = useState<{ node: ResearchNode; paper?: Paper; left: number; top: number; flip: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: 'pan' | 'node'; id?: string; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const finishDragRef = useRef<(clientX: number, clientY: number, pointerId: number) => void>(() => {});

  const selected = graph.nodes.find((node) => node.id === selectedId);
  const focusedBranch = graph.nodes.find((node) => node.id === focusedBranchId);
  const branchIds = useMemo(() => {
    if (!focusedBranch) return null;
    const ids = new Set<string>([focusedBranch.id, 'root']);
    const previous = new Map<string, string>();
    const visited = new Set<string>(['root']);
    const queue = ['root'];
    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of graph.edges) {
        const next = edge.source === current ? edge.target : edge.target === current ? edge.source : undefined;
        if (!next || visited.has(next)) continue;
        visited.add(next); previous.set(next, current); queue.push(next);
      }
    }
    let cursor: string | undefined = previous.get(focusedBranch.id);
    while (cursor) { ids.add(cursor); cursor = previous.get(cursor); }
    graph.edges.forEach((edge) => {
      if (edge.source === focusedBranch.id) ids.add(edge.target);
      if (edge.target === focusedBranch.id) ids.add(edge.source);
    });
    return ids;
  }, [graph.edges, focusedBranch]);
  const scopedPapers = useMemo(() => {
    const papers = graph.nodes.filter((node) => node.kind === 'paper' && visibleKinds.has('paper'));
    if (!focusedBranch) return papers;
    const ids = new Set(focusedBranch.paperIds);
    return papers.filter((node) => ids.has(node.id) || ids.has(node.paperIds[0]));
  }, [graph.nodes, focusedBranch, visibleKinds]);
  const pageCount = Math.max(1, Math.ceil(scopedPapers.length / PAPERS_PER_PAGE));
  const visiblePapers = scopedPapers.slice(paperPage * PAPERS_PER_PAGE, paperPage * PAPERS_PER_PAGE + PAPERS_PER_PAGE);
  const visibleNonPapers = graph.nodes.filter((node) => node.kind !== 'paper' && visibleKinds.has(node.kind) && (!branchIds || branchIds.has(node.id)));
  const visibleNodes = [...visibleNonPapers, ...visiblePapers];
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const anchors = useMemo(() => computeGraphLayout(visibleNodes, graph.edges), [visibleNodes, graph.edges]);
  const neighbors = useMemo(() => {
    const result = new Set<string>([selectedId]);
    graph.edges.forEach((edge) => {
      if (edge.source === selectedId) result.add(edge.target);
      if (edge.target === selectedId) result.add(edge.source);
    });
    return result;
  }, [graph.edges, selectedId]);

  useEffect(() => { setPaperPage(0); }, [focusedBranchId, graph.nodes]);
  useEffect(() => { if (paperPage >= pageCount) setPaperPage(pageCount - 1); }, [pageCount, paperPage]);
  useEffect(() => { if (selectedId === 'root') setFocusedBranchId(null); }, [selectedId]);
  useEffect(() => {
    if (focusedBranchId && !graph.nodes.some((node) => node.id === focusedBranchId)) setFocusedBranchId(null);
  }, [focusedBranchId, graph.nodes]);

  useEffect(() => {
    setPositions((current) => {
      const missing = visibleNodes.filter((node) => !current[node.id]);
      if (!missing.length) return current;
      const next = { ...current };
      if (!Object.keys(current).length) {
        missing.forEach((node) => { const anchor = anchors.get(node.id); if (anchor) next[node.id] = anchor; });
        return next;
      }
      const groups = new Map<string, ResearchNode[]>();
      const ungrouped: ResearchNode[] = [];
      missing.forEach((node) => {
        const parentId = graph.edges.flatMap((edge) => {
          if (edge.source === node.id && next[edge.target]) return [edge.target];
          if (edge.target === node.id && next[edge.source]) return [edge.source];
          return [];
        })[0];
        const anchor = anchors.get(node.id);
        if (parentId && anchor) {
          if (!groups.has(parentId)) groups.set(parentId, []);
          groups.get(parentId)!.push(node);
        } else if (anchor) ungrouped.push(node);
      });
      ungrouped.forEach((node) => { const anchor = anchors.get(node.id); if (anchor) next[node.id] = anchor; });
      groups.forEach((children, parentId) => {
        const parent = next[parentId];
        if (!parent) return;
        children.sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
        const spacing = 100;
        const baseY = parent.y - ((children.length - 1) * spacing) / 2;
        const direction = parent.side === 'left' ? -1 : 1;
        children.forEach((node, index) => {
          const anchor = anchors.get(node.id)!;
          let candidate: GraphPosition = {
            ...anchor,
            x: Math.max(anchor.width / 2 + 16, Math.min(GRAPH_WIDTH - anchor.width / 2 - 16, parent.x + direction * 300)),
            y: Math.max(anchor.height / 2 + 16, Math.min(GRAPH_HEIGHT - anchor.height / 2 - 16, baseY + index * spacing)),
          };
          let attempts = 0;
          while (Object.entries(next).some(([id, position]) => id !== node.id && overlaps(candidate, position)) && attempts < 24) {
            candidate = { ...candidate, y: candidate.y + spacing };
            if (candidate.y > GRAPH_HEIGHT - candidate.height / 2 - 16) {
              candidate = { ...candidate, x: candidate.x + 280, y: anchor.height / 2 + 40 };
            }
            attempts += 1;
          }
          next[node.id] = candidate;
        });
      });
      return next;
    });
  }, [visibleNodes, anchors, graph.edges]);

  const positionFor = (id: string) => positions[id] || anchors.get(id);
  const point = (event: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * GRAPH_WIDTH / rect.width, y: (event.clientY - rect.top) * GRAPH_HEIGHT / rect.height };
  };
  const startPan = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const p = point(event);
    dragRef.current = { mode: 'pan', startX: p.x, startY: p.y, originX: pan.x, originY: pan.y, moved: false };
    svgRef.current?.setPointerCapture(event.pointerId);
  };
  const startNodeDrag = (event: React.PointerEvent, node: ResearchNode) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const position = positionFor(node.id);
    if (!position) return;
    const p = point(event);
    dragRef.current = { mode: 'node', id: node.id, startX: p.x, startY: p.y, originX: position.x, originY: position.y, moved: false };
    svgRef.current?.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = point(event);
    const dx = p.x - drag.startX; const dy = p.y - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.mode === 'pan') {
      setPan({ x: drag.originX + dx, y: drag.originY + dy });
      return;
    }
    const node = visibleNodes.find((item) => item.id === drag.id);
    const current = drag.id ? positionFor(drag.id) : undefined;
    if (!node || !current) return;
    setPositions((all) => ({
      ...all,
      [node.id]: {
        ...current,
        x: Math.max(current.width / 2 + 10, Math.min(GRAPH_WIDTH - current.width / 2 - 10, drag.originX + dx / zoom)),
        y: Math.max(current.height / 2 + 10, Math.min(GRAPH_HEIGHT - current.height / 2 - 10, drag.originY + dy / zoom)),
      },
    }));
  };
  const finishDrag = (clientX: number, clientY: number, pointerId: number) => {
    const drag = dragRef.current;
    if (drag?.mode === 'node' && drag.moved && drag.id && onDropToChat) {
      const dropTarget = document.elementFromPoint(clientX, clientY)?.closest('[data-bohr-dropzone]');
      const graphBottom = svgRef.current?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY;
      const releasedBelowGraph = clientY > graphBottom + 4;
      const node = visibleNodes.find((item) => item.id === drag.id);
      if ((dropTarget || releasedBelowGraph) && node) {
        onDropToChat(cardForNode(node));
        setPositions((current) => ({ ...current, [node.id]: { ...(current[node.id] || positionFor(node.id)!), x: drag.originX, y: drag.originY } }));
      }
    } else if (drag?.mode === 'node' && !drag.moved && drag.id) {
      const node = visibleNodes.find((item) => item.id === drag.id);
      if (node) selectNode(node);
    }
    dragRef.current = null;
    if (svgRef.current?.hasPointerCapture(pointerId)) svgRef.current.releasePointerCapture(pointerId);
  };
  finishDragRef.current = finishDrag;
  useEffect(() => {
    const release = (event: PointerEvent) => {
      if (dragRef.current) finishDragRef.current(event.clientX, event.clientY, event.pointerId);
    };
    window.addEventListener('pointerup', release);
    return () => window.removeEventListener('pointerup', release);
  }, []);
  const endDrag = (event: React.PointerEvent) => finishDrag(event.clientX, event.clientY, event.pointerId);
  const selectNode = (node: ResearchNode) => {
    if (node.kind !== 'paper') setFocusedBranchId(node.id === 'root' ? null : node.id);
    setPaperHover(null);
    onSelect(node);
  };
  const cardForNode = (node: ResearchNode): ChatCard => {
    const paper = node.kind === 'paper' ? papers[node.paperIds[0]] : undefined;
    return {
      id: node.id,
      kind: kindLabels[node.kind],
      title: paper?.title || node.title,
      summary: paper?.summaryZh || paper?.summaryEn || paper?.abstract || node.description,
      url: paper?.url,
      paperId: paper?.id,
    };
  };
  const showPaperHover = (event: React.MouseEvent | React.FocusEvent, node: ResearchNode) => {
    if (node.kind !== 'paper') return;
    const target = event.currentTarget as SVGGElement;
    const canvas = canvasRef.current?.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    if (!canvas) return;
    const left = Math.max(12, Math.min(canvas.width - 352, rect.left - canvas.left + rect.width / 2 - 165));
    const top = Math.max(12, Math.min(canvas.height - 260, rect.top - canvas.top + rect.height + 10));
    setPaperHover({ node, paper: papers[node.paperIds[0]], left, top, flip: rect.left - canvas.left > canvas.width - 390 });
  };
  const toggleBranchFocus = () => {
    if (focusedBranchId) { setFocusedBranchId(null); return; }
    const candidate = selected && selected.kind !== 'paper' && selected.id !== 'root'
      ? selected
      : graph.nodes.find((node) => node.kind === 'method' || node.kind === 'family');
    if (candidate) {
      setFocusedBranchId(candidate.id);
      onSelect(candidate);
    }
  };
  const arrangeNodes = () => {
    setPositions((current) => {
      const next = { ...current };
      visibleNodes.forEach((node) => { const anchor = anchors.get(node.id); if (anchor) next[node.id] = anchor; });
      return next;
    });
    setZoom(1); setPan({ x: 0, y: 0 });
  };
  const toggleKind = (kind: NodeKind) => {
    setVisibleKinds((current) => {
      const next = new Set(current);
      if (next.has(kind) && next.size > 1) next.delete(kind); else next.add(kind);
      return next;
    });
  };

  return <section className="graph-workspace" aria-label="材料知识网络">
    <div className="workspace-heading">
      <div><span className="section-kicker">材料谱系靠左 · 方法与证据靠右 · 拖动节点安排阅读顺序</span><h1>{searchLabel ? `“${searchLabel}”的发散网络` : '材料知识网络'}</h1><p>分支分别向左右两侧竖直展开，不跨中心交叉；节点可以自由拖动，位置会保留。布局过密时点击“自动整理”。</p></div>
      <div className="workspace-actions">
        {searchLabel && <button className="text-button" onClick={onReset}><RotateCcw size={15} />返回示例</button>}
        <button className={focusedBranchId ? 'tool-button active' : 'tool-button'} onClick={toggleBranchFocus}><BookOpen size={15} />{focusedBranchId ? '显示全图' : '当前分支'}</button>
        <div className="filter-wrap"><button className={filtersOpen ? 'tool-button active' : 'tool-button'} onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}><Layers3 size={16} />筛选<span>{visibleKinds.size}</span></button>
          {filtersOpen && <div className="filter-popover"><strong>显示节点类型</strong>{allKinds.map((kind) => <label key={kind}><input type="checkbox" checked={visibleKinds.has(kind)} onChange={() => toggleKind(kind)} /><span className={`legend-mark ${kind}`} />{kindLabels[kind]}</label>)}<label className="edge-label-toggle"><input type="checkbox" checked={showLabels} onChange={() => setShowLabels(!showLabels)} />显示当前关系文字</label></div>}
        </div>
      </div>
    </div>
    <div ref={canvasRef} className={loading ? 'graph-canvas is-loading' : 'graph-canvas'}>
      <svg ref={svgRef} viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} role="group" aria-label="从左向右的知识网络，可拖动节点和画布，Tab 选择节点，回车查看详情" onPointerDown={startPan} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => { dragRef.current = null; }} onWheel={(event) => { event.preventDefault(); setZoom((current) => Math.max(.55, Math.min(1.8, current - event.deltaY * .001))); }}>
        <defs><pattern id="dot-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" className="grid-dot" /></pattern></defs>
        <rect width={GRAPH_WIDTH} height={GRAPH_HEIGHT} fill="url(#dot-grid)" className="graph-background" />
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          <g className="side-guide"><line x1={GRAPH_CENTER_X} y1="60" x2={GRAPH_CENTER_X} y2={GRAPH_HEIGHT - 55} /><text x="220" y="32">左侧 · 材料谱系</text><text x={GRAPH_CENTER_X} y="32">研究起点</text><text x="880" y="32">右侧 · 方法与证据</text></g>
          {graph.edges.map((edge) => {
            if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) return null;
            const source = positionFor(edge.source); const target = positionFor(edge.target);
            if (!source || !target) return null;
            if (source.side !== target.side && source.side !== 'center' && target.side !== 'center') return null;
            const dx = target.x - source.x; const direction = dx >= 0 ? 1 : -1; const bend = Math.max(42, Math.min(120, Math.abs(dx) * .32));
            const cx = (source.x + target.x) / 2; const cy = (source.y + target.y) / 2;
            const active = selectedId === edge.source || selectedId === edge.target;
            return <g key={edge.id} className={active ? 'graph-edge active' : 'graph-edge'}><path d={`M ${source.x} ${source.y} C ${source.x + direction * bend} ${source.y}, ${target.x - direction * bend} ${target.y}, ${target.x} ${target.y}`} />{showLabels && active && edge.label && <text x={cx} y={cy - 7}>{edge.label}</text>}</g>;
          })}
          {visibleNodes.map((node) => {
            const position = positionFor(node.id);
            if (!position) return null;
            const isSelected = node.id === selectedId;
            const dimmed = selectedId !== 'root' && !neighbors.has(node.id);
            const x = -position.width / 2; const y = -position.height / 2;
            return <g key={node.id} transform={`translate(${position.x} ${position.y})`} className={`graph-node node-${node.kind} ${node.id === 'root' ? 'node-root' : ''} ${isSelected ? 'selected' : ''} ${dimmed ? 'dimmed' : ''}`} role="button" tabIndex={0} aria-label={`${kindLabels[node.kind]}：${node.title}，${node.subtitle}。拖动可调整位置，也可拖入下方 DSH 对话；回车查看详情`} onPointerDown={(event) => startNodeDrag(event, node)} onMouseEnter={(event) => showPaperHover(event, node)} onMouseLeave={() => setPaperHover(null)} onFocus={(event) => showPaperHover(event, node)} onBlur={() => setPaperHover(null)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(node); } }}>
              <rect x={x} y={y} width={position.width} height={position.height} rx={node.id === 'root' ? 17 : 11} className="node-card" /><path d={`M ${x} ${y + 13} L ${x} ${y + position.height - 13}`} className="node-accent" />
              {node.id === 'root' ? <>
                <text className="root-kicker" textAnchor="middle" y="-42">研究起点</text><text className="root-title" textAnchor="middle" y="-7">{shortGraphText(node.title, 19)}</text><text className="root-subtitle" textAnchor="middle" y="19">{shortGraphText(node.subtitle, 30)}</text><text className="root-meta" textAnchor="middle" y="43">{node.paperIds.length} 篇直接证据 · 点击查看详情</text>
              </> : node.kind === 'paper' ? <>
                <circle cx={x + 22} cy="0" r="13" className="glyph-disc" /><text className="node-glyph" x={x + 22} y="4" textAnchor="middle">¶</text>
                {wrapGraphText(node.description, 29, 2).map((line, index) => <text key={index} className="paper-node-title" x={x + 43} y={-14 + index * 13}>{line}</text>)}
                <text className="paper-node-meta" x={x + 43} y="25">{shortGraphText(`${node.subtitle} · ${node.title}`, 36)}</text>
              </> : <>
                <circle cx={x + 22} cy="0" r="13" className="glyph-disc" /><text className="node-glyph" x={x + 22} y="4" textAnchor="middle">{kindGlyphs[node.kind]}</text>
                <text className="node-kind" x={x + 43} y="-21">{kindLabels[node.kind]}</text><text className="node-title" x={x + 43} y="-3">{shortGraphText(node.title, node.kind === 'method' ? 14 : 17)}</text><text className="node-subtitle" x={x + 43} y="14">{shortGraphText(node.relation || node.subtitle, 24)}</text><text className="node-tag" x={x + 43} y="29">{shortGraphText(node.evidenceLevel || node.tags[0] || node.subtitle, 25)}</text>
              </>}
            </g>;
          })}
          {!visiblePapers.length && visibleKinds.has('paper') && <text x="530" y="64" className="empty-orbit">当前节点还没有展开的论文证据</text>}
        </g>
      </svg>
      <div className="zoom-controls" aria-label="图谱缩放控制"><button onClick={() => setZoom((z) => Math.min(1.8, z + .12))} aria-label="放大"><Plus size={17} /></button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((z) => Math.max(.55, z - .12))} aria-label="缩小"><Minus size={17} /></button><button onClick={arrangeNodes} aria-label="自动整理节点"><Focus size={17} /></button></div>
      {selected && <div className="canvas-selection"><span className={`legend-mark ${selected.kind}`} />当前焦点<strong>{selected.title}</strong></div>}
      <div className="graph-legend" aria-label="节点图例">{allKinds.map((kind) => <span key={kind}><i className={`legend-mark ${kind}`} />{kindLabels[kind]}</span>)}</div>
      {scopedPapers.length > PAPERS_PER_PAGE && <div className="paper-pager"><button disabled={paperPage === 0} onClick={() => setPaperPage((page) => Math.max(0, page - 1))} aria-label="上一页论文"><ChevronLeft size={14} /></button><span>{paperPage + 1} / {pageCount}</span><button disabled={paperPage >= pageCount - 1} onClick={() => setPaperPage((page) => Math.min(pageCount - 1, page + 1))} aria-label="下一页论文"><ChevronRight size={14} /></button></div>}
      {paperHover && <div className={paperHover.flip ? 'paper-hover flip' : 'paper-hover'} style={{ left: paperHover.left, top: paperHover.top }} role="tooltip">
        <div className="paper-hover-type"><span>论文证据</span><em>{paperHover.paper?.year || '年份未知'} · {paperHover.paper?.venue || '期刊未知'}</em></div>
        <h3>{paperHover.paper?.title || paperHover.node.description}</h3>
        <p className="paper-hover-authors">{paperHover.paper?.authors || paperHover.node.title}</p>
        <section><span>英文概括</span><p>{paperHover.paper?.summaryEn || paperHover.paper?.abstract?.slice(0, 320) || '暂无英文摘要；请打开原文核对。'}</p></section>
        <section className="zh"><span>中文对照</span><p>{paperHover.paper?.summaryZh || (paperHover.paper?.summaryStatus === 'pending' ? '中文概括正在生成…' : paperHover.paper?.summaryStatus === 'error' ? '中文概括生成失败，请打开详情或原文。' : '暂无中文概括。')}</p></section>
        {paperHover.paper?.keyFinding && <footer>关键发现：{paperHover.paper.keyFinding}</footer>}
        <small>点击查看详情 · 拖动卡片可加入下方 DSH 对话</small>
      </div>}
    </div>
    <div className="graph-caption"><span>拖动节点自由排版 · 拖拽空白处移动画布 · 滚轮缩放</span><span>左右两侧独立展开，距离表示探索层级，不代表相似度</span></div>
  </section>;
}
