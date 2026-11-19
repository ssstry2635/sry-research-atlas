import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, MessageCircleQuestion, X } from 'lucide-react';
import type { MindMap, MindMapNode, Paper } from '../src/types';

interface MindMapDialogProps {
  paper: Paper;
  mindMap: MindMap;
  onClose: () => void;
  onAsk: (paper: Paper, node: MindMapNode) => void;
}

const WIDTH = 980;
const HEIGHT = 620;
const NODE_WIDTH = 196;
const NODE_HEIGHT = 74;

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
  const columnX = [50, 310, 580, 820];
  groups.forEach((group, level) => {
    const step = group.length > 1 ? Math.min(132, (HEIGHT - 120) / (group.length - 1)) : 0;
    const totalHeight = step * (group.length - 1);
    const startY = HEIGHT / 2 - totalHeight / 2;
    group.forEach((node, index) => positions.set(node.id, { x: columnX[Math.min(level, columnX.length - 1)], y: startY + index * step, level }));
  });
  return positions;
}

export function MindMapDialog({ paper, mindMap, onClose, onAsk }: MindMapDialogProps) {
  const [selectedId, setSelectedId] = useState(mindMap.nodes[0]?.id);
  const positions = useMemo(() => computeLayout(mindMap.nodes), [mindMap.nodes]);
  const selected = mindMap.nodes.find((node) => node.id === selectedId);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal mindmap-dialog" role="dialog" aria-modal="true" aria-labelledby="mindmap-title">
      <header><span className="modal-icon"><BookOpen size={19} /></span><div><span className="section-kicker">读完论文后继续追问</span><h2 id="mindmap-title">论文思维导图 · {mindMap.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭思维导图"><X size={18} /></button></header>
      <p className="mindmap-summary">{mindMap.summary}</p>
      <div className="mindmap-canvas">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label="论文思维导图，点击节点查看并追问">
          {mindMap.nodes.map((node) => {
            if (!node.parentId) return null;
            const parent = positions.get(node.parentId); const child = positions.get(node.id);
            if (!parent || !child) return null;
            const fromX = parent.x + NODE_WIDTH; const fromY = parent.y + NODE_HEIGHT / 2;
            const toX = child.x; const toY = child.y + NODE_HEIGHT / 2; const mid = (fromX + toX) / 2;
            return <path key={`${node.parentId}-${node.id}`} d={`M ${fromX} ${fromY} C ${mid} ${fromY}, ${mid} ${toY}, ${toX} ${toY}`} className="mindmap-edge" />;
          })}
          {mindMap.nodes.map((node) => {
            const position = positions.get(node.id);
            if (!position) return null;
            const active = node.id === selectedId;
            return <g key={node.id} transform={`translate(${position.x} ${position.y})`} role="button" tabIndex={0} className={active ? 'mindmap-node selected' : 'mindmap-node'} onClick={() => setSelectedId(node.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(node.id); } }}>
              <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="9" />
              <text className="mindmap-label" x="12" y="25">{node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label}</text>
              <text className="mindmap-zh" x="12" y="44">{node.zh.length > 24 ? `${node.zh.slice(0, 23)}…` : node.zh}</text>
              <text className="mindmap-level" x="12" y="62">{position.level === 0 ? '核心' : `分支 ${position.level}`}</text>
              <MessageCircleQuestion x={NODE_WIDTH - 27} y="10" width="15" height="15" />
            </g>;
          })}
        </svg>
      </div>
      {selected && <div className="mindmap-question"><div><span>已选节点</span><strong>{selected.label}</strong><p>{selected.zh}</p><small>建议追问：{selected.question}</small></div><button className="primary-action" onClick={() => onAsk(paper, selected)}>追问这个节点<ArrowRight size={15} /></button></div>}
    </section>
  </div>;
}
