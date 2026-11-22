import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, MessageCircleQuestion, Minus, Plus, RotateCcw, X } from 'lucide-react';
import type { MindMap, MindMapNode, Paper } from '../src/types';

interface MindMapDialogProps {
  paper: Paper;
  mindMap: MindMap;
  onClose: () => void;
  onAsk: (paper: Paper, node: MindMapNode) => void;
}

const WIDTH = 1020;
const HEIGHT = 580;
const NODE_WIDTH = 216;
const NODE_HEIGHT = 82;

function computeLayout(nodes: MindMapNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depth = new Map<string, number>();
  const depthOf = (node: MindMapNode, seen = new Set<string>()): number => {
    if (!node.parentId || !byId.has(node.parentId) || seen.has(node.id)) return 0;
    const cached = depth.get(node.id);
    if (cached !== undefined) return cached;
    seen.add(node.id);
    const value = depthOf(byId.get(node.parentId)!, seen) + 1;
    depth.set(node.id, value);
    return value;
  };
  const groups = new Map<number, MindMapNode[]>();
  nodes.forEach((node) => {
    const level = Math.min(3, depthOf(node));
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level)!.push(node);
  });
  const positions = new Map<string, { x: number; y: number; level: number }>();
  const columnX = [46, 330, 620, 780];
  groups.forEach((group, level) => {
    const step = group.length > 1 ? Math.min(126, (HEIGHT - 120) / (group.length - 1)) : 0;
    const totalHeight = step * (group.length - 1);
    const startY = HEIGHT / 2 - totalHeight / 2 - NODE_HEIGHT / 2;
    group.forEach((node, index) => positions.set(node.id, { x: columnX[Math.min(level, columnX.length - 1)], y: startY + index * step, level }));
  });
  return positions;
}

export function MindMapDialog({ paper, mindMap, onClose, onAsk }: MindMapDialogProps) {
  const [selectedId, setSelectedId] = useState(mindMap.nodes[0]?.id);
  const [zoom, setZoom] = useState(1);
  const positions = useMemo(() => computeLayout(mindMap.nodes), [mindMap.nodes]);
  const selected = mindMap.nodes.find((node) => node.id === selectedId) || mindMap.nodes[0];

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal mindmap-dialog" role="dialog" aria-modal="true" aria-labelledby="mindmap-title">
      <header>
        <span className="modal-icon"><BookOpen size={19} /></span>
        <div>
          <span className="section-kicker">交互式论文结构拆解 · 点击节点向 DSH 深度追问</span>
          <h2 id="mindmap-title">{mindMap.title}</h2>
        </div>
        <div className="mindmap-zoom-bar">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.75, z - 0.12))} aria-label="缩小导图"><Minus size={14} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(1.45, z + 0.12))} aria-label="放大导图"><Plus size={14} /></button>
          <button type="button" onClick={() => setZoom(1)} aria-label="重置缩放"><RotateCcw size={13} /></button>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="关闭思维导图"><X size={18} /></button>
      </header>
      <p className="mindmap-summary">{mindMap.generatedBy === 'fallback' ? '模型结构化输出未完成，已根据题目与已有概要生成基础阅读框架；请结合原文核验。 ' : ''}{mindMap.summary}</p>
      <div className="mindmap-canvas">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label="论文思维导图，点击节点查看并追问">
          <g transform={`translate(${(WIDTH * (1 - zoom)) / 2} ${(HEIGHT * (1 - zoom)) / 2}) scale(${zoom})`}>
            {mindMap.nodes.map((node) => {
              if (!node.parentId) return null;
              const parent = positions.get(node.parentId); const child = positions.get(node.id);
              if (!parent || !child) return null;
              const fromX = parent.x + NODE_WIDTH; const fromY = parent.y + NODE_HEIGHT / 2;
              const toX = child.x; const toY = child.y + NODE_HEIGHT / 2;
              const bend = Math.max(44, (toX - fromX) * 0.48);
              const active = selected?.id === node.id || selected?.id === node.parentId;
              return <path key={`${node.parentId}-${node.id}`} className={active ? 'mindmap-edge active' : 'mindmap-edge'} d={`M ${fromX} ${fromY} C ${fromX + bend} ${fromY}, ${toX - bend} ${toY}, ${toX} ${toY}`} />;
            })}
            {mindMap.nodes.map((node) => {
              const pos = positions.get(node.id);
              if (!pos) return null;
              const isSelected = node.id === selected?.id;
              return <g key={node.id} transform={`translate(${pos.x} ${pos.y})`} className={isSelected ? 'mindmap-node selected' : 'mindmap-node'} role="button" tabIndex={0} onClick={() => setSelectedId(node.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(node.id); } }}>
                <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="12" />
                <path d={`M 2 12 L 2 ${NODE_HEIGHT - 12}`} className={`mindmap-accent level-${pos.level}`} />
                <text className="mindmap-level" x="15" y="21">{pos.level === 0 ? '核心锚点' : pos.level === 1 ? '一级维度' : '细分要点'}</text>
                <text className="mindmap-label" x="15" y="42">{node.label.slice(0, 14)}</text>
                <text className="mindmap-zh" x="15" y="63">{node.zh.length > 18 ? `${node.zh.slice(0, 17)}…` : node.zh}</text>
              </g>;
            })}
          </g>
        </svg>
      </div>
      {selected && <footer className="mindmap-question">
        <div>
          <span>当前选中节点 · {selected.label}</span>
          <p>{selected.zh}</p>
          <strong><MessageCircleQuestion size={15} />建议追问：{selected.question}</strong>
        </div>
        <button className="primary-action" onClick={() => onAsk(paper, selected)}>送入 DSH 追问该节点<ArrowRight size={15} /></button>
      </footer>}
    </section>
  </div>;
}
