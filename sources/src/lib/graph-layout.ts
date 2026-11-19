import type { NodeKind, ResearchEdge, ResearchNode } from '../types';

export const GRAPH_WIDTH = 1100;
export const GRAPH_HEIGHT = 900;
export const PAPERS_PER_PAGE = 5;
export const GRAPH_CENTER_X = 550;
export const LEFT_BRANCH_X = 120;
export const RIGHT_BRANCH_X = 980;

export type GraphSide = 'left' | 'center' | 'right';

export interface GraphPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  side: GraphSide;
}

const dimensions: Record<NodeKind | 'root', { width: number; height: number }> = {
  root: { width: 218, height: 126 },
  material: { width: 176, height: 70 },
  family: { width: 182, height: 70 },
  method: { width: 180, height: 72 },
  paper: { width: 230, height: 70 },
  opportunity: { width: 188, height: 74 },
};

const kindOrder: Record<NodeKind, number> = { family: 0, material: 1, method: 2, opportunity: 3, paper: 4 };

function defaultDepth(node: ResearchNode) {
  if (node.id === 'root') return 0;
  if (node.kind === 'paper' || node.kind === 'material') return 2;
  return 1;
}

export function computeGraphLayout(nodes: ResearchNode[], edges: ResearchEdge[] = []): Map<string, GraphPosition> {
  const positions = new Map<string, GraphPosition>();
  const nodeIds = new Set(nodes.map((node) => node.id));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source)!.push(edge.target);
    adjacency.get(edge.target)!.push(edge.source);
  });
  const root = nodes.find((node) => node.id === 'root');
  const depth = new Map<string, number>();
  const parent = new Map<string, string>();
  const branchRoot = new Map<string, string>();
  const side = new Map<string, GraphSide>();
  if (!root) return positions;
  depth.set(root.id, 0); side.set(root.id, 'center');
  const queue = [root.id];
  const visited = new Set<string>([root.id]);
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      depth.set(next, Math.min(3, (depth.get(current) || 0) + 1));
      parent.set(next, current);
      queue.push(next);
    }
  }
  const rootChildren = [...(adjacency.get(root.id) || [])].map((id) => byId.get(id)).filter(Boolean) as ResearchNode[];
  rootChildren.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.title.localeCompare(b.title));
  let paperSideIndex = 0;
  rootChildren.forEach((node) => {
    let nodeSide: GraphSide;
    if (node.kind === 'family' || node.kind === 'material') nodeSide = 'left';
    else if (node.kind === 'method' || node.kind === 'opportunity') nodeSide = 'right';
    else { nodeSide = paperSideIndex % 2 === 0 ? 'left' : 'right'; paperSideIndex += 1; }
    side.set(node.id, nodeSide);
    branchRoot.set(node.id, node.id);
  });
  const branchOrder = new Map<string, number>();
  rootChildren.forEach((node, index) => branchOrder.set(node.id, index));
  const sortedKnown = [...visited].filter((id) => id !== root.id).sort((a, b) => (depth.get(a) || 0) - (depth.get(b) || 0));
  sortedKnown.forEach((id) => {
    const parentId = parent.get(id);
    if (!parentId || parentId === root.id) return;
    const inherited = side.get(parentId);
    if (inherited && inherited !== 'center') side.set(id, inherited);
    branchRoot.set(id, branchRoot.get(parentId) || id);
  });
  let unvisitedLeft = 0; let unvisitedRight = 0;
  nodes.forEach((node, index) => {
    if (node.id === root.id) return;
    if (!depth.has(node.id)) {
      const nodeSide: GraphSide = node.kind === 'paper' ? (index % 2 ? 'left' : 'right') : (index % 2 ? 'left' : 'right');
      side.set(node.id, nodeSide);
      depth.set(node.id, defaultDepth(node));
      branchRoot.set(node.id, node.id);
      branchOrder.set(node.id, rootChildren.length + index);
      if (nodeSide === 'left') unvisitedLeft += 1; else unvisitedRight += 1;
    }
  });
  void unvisitedLeft; void unvisitedRight;

  const columnOf = (node: ResearchNode, nodeDepth: number): number => {
    const nodeSide = side.get(node.id) || 'right';
    if (nodeSide === 'left') return nodeDepth <= 1 && node.kind !== 'paper' ? 330 : LEFT_BRANCH_X;
    return nodeDepth <= 1 && node.kind !== 'paper' ? 770 : RIGHT_BRANCH_X;
  };
  const lanes = new Map<string, ResearchNode[]>();
  nodes.forEach((node) => {
    if (node.id === root.id) return;
    const nodeDepth = depth.get(node.id) || 1;
    const x = columnOf(node, nodeDepth);
    const key = `${side.get(node.id) || 'right'}-${x}`;
    if (!lanes.has(key)) lanes.set(key, []);
    lanes.get(key)!.push(node);
  });
  lanes.forEach((lane, key) => {
    const x = Number(key.split('-')[1]);
    const sorted = [...lane].sort((a, b) => {
      const rootA = branchOrder.get(branchRoot.get(a.id) || a.id) ?? 999;
      const rootB = branchOrder.get(branchRoot.get(b.id) || b.id) ?? 999;
      return rootA - rootB || kindOrder[a.kind] - kindOrder[b.kind] || a.title.localeCompare(b.title);
    });
    const top = 70; const bottom = GRAPH_HEIGHT - 70;
    const step = sorted.length > 1 ? (bottom - top) / (sorted.length - 1) : 0;
    sorted.forEach((node, index) => {
      const y = sorted.length > 1 ? top + step * index : GRAPH_HEIGHT / 2;
      const nodeDepth = depth.get(node.id) || 1;
      positions.set(node.id, { x, y, ...dimensions[node.kind], depth: nodeDepth, side: side.get(node.id) || 'right' });
    });
  });
  positions.set(root.id, { x: GRAPH_CENTER_X, y: GRAPH_HEIGHT / 2, ...dimensions.root, depth: 0, side: 'center' });
  return positions;
}

export function wrapGraphText(text: string, maxCharacters: number, maxLines = 2): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  const pushWord = (word: string) => {
    if (!word) return;
    if ((line + ' ' + word).trim().length <= maxCharacters) {
      line = (line + ' ' + word).trim();
      return;
    }
    if (line) lines.push(line);
    line = word;
  };
  words.forEach((word) => {
    if (word.length <= maxCharacters) { pushWord(word); return; }
    let rest = word;
    while (rest.length > maxCharacters) {
      if (line) { lines.push(line); line = ''; }
      lines.push(rest.slice(0, maxCharacters));
      rest = rest.slice(maxCharacters);
    }
    pushWord(rest);
  });
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, maxLines);
  clipped[maxLines - 1] = `${clipped[maxLines - 1].slice(0, Math.max(1, maxCharacters - 1))}…`;
  return clipped;
}

export function shortGraphText(text: string, maxCharacters: number) {
  return text.length > maxCharacters ? `${text.slice(0, Math.max(1, maxCharacters - 1))}…` : text;
}
