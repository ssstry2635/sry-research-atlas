export type NodeKind = 'material' | 'family' | 'method' | 'paper' | 'opportunity';
export type ViewMode = 'map' | 'papers' | 'directions' | 'library';
export type EvidenceLevel = '已验证' | '迁移线索' | '待验证';

export interface Paper {
  id: string;
  title: string;
  authors: string;
  year: number | null;
  venue: string;
  citations: number;
  doi?: string;
  url: string;
  landingUrl?: string;
  pdfUrl?: string;
  abstract?: string;
  openAccess: boolean;
  source: 'OpenAlex' | 'Crossref' | 'arXiv' | 'Europe PMC' | '演示数据';
  query?: string;
  summaryEn?: string;
  summaryZh?: string;
  keyFinding?: string;
  summaryStatus?: 'pending' | 'ready' | 'error';
}

export interface MindMapNode {
  id: string;
  parentId: string | null;
  label: string;
  zh: string;
  question: string;
  section?: string;
  originalText?: string;
  relation?: string;
}

export interface MindMapRelation {
  source: string;
  target: string;
  label: string;
}

export interface MindMap {
  title: string;
  summary: string;
  nodes: MindMapNode[];
  edges?: Array<[string, string]>;
  relations?: MindMapRelation[];
  generatedBy?: 'model' | 'fallback';
  fullTextAvailable?: boolean;
  fullTextSource?: string;
  fullTextExcerpt?: string;
  pdfSavedPath?: string;
}

export interface FullTextResponse {
  available: boolean;
  source: string;
  text: string;
  sections?: Array<{ title: string; content: string }>;
  reason?: string;
  pdfSavedPath?: string;
}

export interface ChatCard {
  id: string;
  kind: string;
  title: string;
  summary: string;
  url?: string;
  paperId?: string;
}

export interface ResearchNode {
  id: string;
  kind: NodeKind;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  description: string;
  tags: string[];
  paperIds: string[];
  query?: string;
  evidenceLevel?: EvidenceLevel;
  relation?: string;
}

export interface ResearchEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface ProjectContext {
  title: string;
  target: string;
  stage: string;
  progress: string;
  goal: string;
  constraints: string;
}

export interface ScoreBreakdown {
  relevance: number;
  feasibility: number;
  evidence: number;
  novelty: number;
}

export interface SearchRecord {
  query: string;
  count: number;
  checkedAt: string;
}

export interface Recommendation {
  id: string;
  title: string;
  eyebrow: string;
  summary: string;
  rationale: string;
  nextStep: string;
  evidenceLevel: EvidenceLevel;
  match: number;
  paperIds: string[];
  tags: string[];
  supportingPaperIds?: string[];
  sourceNodeIds?: string[];
  variables?: string[];
  stopCondition?: string;
  searchScope?: string;
  query?: string;
  scoreBreakdown?: ScoreBreakdown;
  cost?: '低' | '中' | '高';
  risk?: string;
}

export interface GraphData {
  nodes: ResearchNode[];
  edges: ResearchEdge[];
}
