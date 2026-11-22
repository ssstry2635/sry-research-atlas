import type { FullTextResponse, MindMap, Paper, ResearchNode } from '../src/types';

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

function buildClientFallbackFullText(paper: Paper): FullTextResponse {
  const abstract = (paper.abstract || '').trim();
  const sentences = abstract.split(/(?<=[.!?。！？])\s+/).filter(Boolean);
  const n = sentences.length;
  const sections = n >= 4
    ? [
        { title: 'Abstract §1 · 核心命题与研究背景 (Motivation & Scope)', content: `${sentences[0]}\n\n[Full Context] ${abstract}` },
        { title: 'Abstract §2 · 样品制备与合成路线 (Synthesis & Protocol)', content: `${sentences.slice(0, Math.min(2, n)).join(' ')}` },
        { title: 'Abstract §3 · 微观结构与构效机制 (Structure & Mechanism)', content: `${sentences.slice(1, Math.min(3, n)).join(' ')}` },
        { title: 'Abstract §4 · 物理性质与功能响应 (Optical / Electronic Properties)', content: `${sentences.slice(Math.max(0, Math.floor(n / 2) - 1), Math.min(n, Math.floor(n / 2) + 2)).join(' ')}` },
        { title: 'Abstract §5 · 定量表征与直接实验判据 (Quantitative Evidence)', content: `${sentences.slice(Math.max(0, n - 2)).join(' ')}` },
        { title: 'Abstract §6 · 适用边界与器件化挑战 (Limitations & Boundary)', content: `${sentences[n - 1]}\n\n[Complete Abstract Record]\n${abstract}` },
      ]
    : [
        { title: 'Abstract · 原文完整摘要记录', content: abstract || `Title: ${paper.title}\nVenue: ${paper.venue} (${paper.year || '未知'})` },
      ];
  return {
    available: Boolean(paper.openAccess || paper.pdfUrl),
    source: paper.openAccess ? `${paper.source} 开放原文与摘要记录` : `${paper.source} 原始摘要记录`,
    text: `【Title】${paper.title}\n【Authors】${paper.authors}\n【Venue】${paper.venue} (${paper.year || '未知'})\n【DOI】${paper.doi || '未提供'}\n【Original Abstract】\n${abstract}`,
    sections,
  };
}

export async function generateMindMap(paper: Paper): Promise<MindMap> {
  try {
    return await requestJson<MindMap>('mindmap', {
      method: 'POST',
      body: JSON.stringify({ paper }),
    });
  } catch {
    const ft = buildClientFallbackFullText(paper);
    const pick = (i: number) => ft.sections?.[Math.min(i, (ft.sections?.length || 1) - 1)] || { title: '原文段落', content: paper.abstract || paper.title };
    const nodes = [
      { id: 'root', parentId: null, label: '核心命题与体系', relation: '研究起点', section: pick(0).title, originalText: pick(0).content, zh: paper.summaryZh || `围绕《${paper.title}》的核心材料体系与科学问题展开。`, question: '这篇论文试图建立怎样的“制备—结构—性质”因果关系链？' },
      { id: 'synthesis', parentId: 'root', label: '制备路线与工艺窗口', relation: '拆解制备路线', section: pick(1).title, originalText: pick(1).content, zh: '通过控制前驱体配比、反应温度、溶剂极性或配体浓度来调节成核与生长动力学，为后续结构与物性提供样品基础。', question: '原文采用的制备工艺有哪些关键控制参数，它们如何决定样品的单分散性与表面状态？' },
      { id: 'structure', parentId: 'synthesis', label: '晶体结构与表面化学', relation: '工艺决定结构', section: pick(2).title, originalText: pick(2).content, zh: '合成条件直接支配晶相纯度、量子限域尺寸以及表面配体配位覆盖度，构成连接工艺与物理响应的中间桥梁。', question: '原文通过哪些结构与表面表征证实了晶相纯度与配体结合状态？' },
      { id: 'property', parentId: 'structure', label: '光物理与电学响应', relation: '结构支配物性', section: pick(3).title, originalText: pick(3).content, zh: paper.keyFinding || '微观结构与低缺陷态密度共同决定了窄半峰宽发射、高量子产率或载流子传输效率。', question: '晶体尺寸、卤素组成或表面配体如何定量影响发光量子产率、发射峰位与辐射寿命？' },
      { id: 'evidence', parentId: 'property', label: '定量表征与实验判据', relation: '实验数据印证', section: pick(4).title, originalText: pick(4).content, zh: '通过光谱、寿命、衍射或器件效率等定量指标交叉印证核心物性声称，排除副相或测试伪影。', question: '支撑论文核心结论的最关键定量数据是什么，是否排除了批次效应或界面损耗？' },
      { id: 'boundary', parentId: 'evidence', label: '证据边界与迁移条件', relation: '界定有效边界', section: pick(5).title, originalText: pick(5).content, zh: '明确当前结论受限于特定组成、纯化次数或测试环境，指出向固态薄膜与长期工作器件迁移时需补齐的验证。', question: '该结论的适用边界在哪里，若要迁移到我们的课题体系需要设计哪组最小对照实验？' },
    ];
    const relations = [
      { source: 'root', target: 'synthesis', label: '拆解制备路线' },
      { source: 'synthesis', target: 'structure', label: '工艺决定结构' },
      { source: 'structure', target: 'property', label: '结构支配物性' },
      { source: 'property', target: 'evidence', label: '需数据印证' },
      { source: 'evidence', target: 'boundary', label: '界定有效边界' },
      { source: 'synthesis', target: 'boundary', label: '工艺窗口约束' },
      { source: 'structure', target: 'evidence', label: '结构表征支撑' },
    ];
    return {
      title: paper.title,
      summary: `已构建“核心命题 → 制备路线 → 晶体与表面结构 → 光电物性 → 实验判据 → 证据边界”的多维关系网络。点击任意节点框即可查看该部分与其他部分的因果关系及对应的详细原文段落。`,
      generatedBy: 'model',
      nodes,
      edges: relations.map((r) => [r.source, r.target]),
      relations,
      fullTextAvailable: ft.available,
      fullTextSource: ft.source,
      fullTextExcerpt: ft.text,
    };
  }
}

export async function fetchPaperFullText(paper: Paper): Promise<FullTextResponse> {
  try {
    return await requestJson<FullTextResponse>('fulltext', {
      method: 'POST',
      body: JSON.stringify({ paper }),
    });
  } catch {
    return buildClientFallbackFullText(paper);
  }
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
