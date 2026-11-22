import type { MindMap, Paper, ResearchNode } from '../src/types';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/bohr-api/${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `DSH 接口返回 ${response.status}`);
  if (payload && typeof payload === 'object' && 'error' in payload && payload.error) throw new Error(payload.error);
  return payload;
}

export interface EnrichedPaper {
  id: string;
  englishSummary: string;
  chineseSummary: string;
  keyFinding: string;
}

export async function enrichPapers(papers: Paper[]): Promise<EnrichedPaper[]> {
  const payload = await requestJson<{ items?: EnrichedPaper[] }>('enrich', {
    method: 'POST',
    body: JSON.stringify({ papers: papers.map((paper) => ({ id: paper.id, title: paper.title, abstract: paper.abstract || '' })) }),
  });
  return (payload.items || []).filter((item) => item.englishSummary || item.chineseSummary);
}

export async function saveKnowledgePaper(paper: Paper) {
  return requestJson<{ ok: boolean; count: number }>('knowledge', {
    method: 'POST',
    body: JSON.stringify({ paper }),
  });
}

export async function fetchKnowledge(): Promise<{ papers: Paper[] }> {
  return requestJson<{ papers: Paper[] }>('knowledge');
}

export async function generateMindMap(paper: Paper): Promise<MindMap> {
  return requestJson<MindMap>('mindmap', {
    method: 'POST',
    body: JSON.stringify({ paper }),
  });
}

export async function generateBranches(query: string, papers: Paper[]): Promise<Array<Omit<ResearchNode, 'x' | 'y'>>> {
  const payload = await requestJson<{ branches?: Array<Omit<ResearchNode, 'x' | 'y'>> }>('branches', {
    method: 'POST',
    body: JSON.stringify({
      query,
      papers: papers.map((p) => ({ id: p.id, title: p.title, venue: p.venue, year: p.year })),
    }),
  });
  return payload.branches || [];
}
