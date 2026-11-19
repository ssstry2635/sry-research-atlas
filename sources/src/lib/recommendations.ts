import { seedRecommendations } from '../data/seed.ts';
import type { GraphData, Paper, ProjectContext, Recommendation, ResearchNode, ScoreBreakdown, SearchRecord } from '../types';

const sourceForRecommendation: Record<string, string> = { 'rec-ligand': 'opp-ligand', 'rec-larp': 'method-larp', 'rec-micro': 'method-micro' };
const topicTerms: Record<string, string[]> = {
  'opp-ligand': ['配体', '稳定', '纯化', '薄膜', 'led', '储存'],
  'method-larp': ['室温', '配体', '低极性', '小时', '放大', '再沉淀'],
  'method-micro': ['微波', '快速', '小时', '放大', '时间'],
  'method-anion': ['阴离子', '卤素', '带隙', '蓝光', '稳定', '相偏析'],
  'method-hot': ['热注入', '单分散', '已复现', '基线'],
};

const variablesForRecommendation: Record<string, string[]> = {
  'rec-ligand': ['双配体比例', '低极性纯化次数', 'PLQY 与 14 天衰减', '薄膜电导'],
  'rec-larp': ['成核方式', '相同配体与固含量', '粒径分布', '配体保留量'],
  'rec-micro': ['微波功率与时间点', '原位吸收成核窗口', '粒径均一性', '表面配体覆盖'],
};

function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }

function countHits(text: string, terms: string[]) {
  return terms.filter((term) => text.includes(term.toLowerCase())).length;
}

function scoreNode(node: ResearchNode, project: ProjectContext, papers: Record<string, Paper>): ScoreBreakdown {
  const context = `${project.target} ${project.stage} ${project.progress} ${project.goal} ${project.constraints}`.toLowerCase();
  const terms = topicTerms[node.id] || [...node.tags, node.title].map((term) => term.toLowerCase());
  const relevance = clamp(52 + countHits(context, terms) * 7 + (context.includes(node.title.toLowerCase()) ? 8 : 0));
  const constraintHits = countHits(context, ['室温', '低极性', '小时', '原位', '无需', '已有']);
  const feasibilityBase = node.evidenceLevel === '已验证' ? 84 : node.evidenceLevel === '迁移线索' ? 72 : 56;
  const feasibility = clamp(feasibilityBase + constraintHits * 3 - (node.id === 'method-micro' ? 8 : 0));
  const linkedPapers = node.paperIds.map((id) => papers[id]).filter(Boolean);
  const liveCount = linkedPapers.filter((paper) => paper.source === 'OpenAlex').length;
  const recentCount = linkedPapers.filter((paper) => (paper.year || 0) >= 2020).length;
  const evidence = clamp(38 + Math.min(linkedPapers.length, 6) * 7 + liveCount * 3 + recentCount * 3);
  const novelty = node.evidenceLevel === '待验证' ? 92 : node.evidenceLevel === '迁移线索' ? 76 : 54;
  return { relevance, feasibility, evidence, novelty };
}

function totalScore(score: ScoreBreakdown) {
  return clamp(score.relevance * .4 + score.feasibility * .25 + score.evidence * .2 + score.novelty * .15);
}

function scopeForNode(node: ResearchNode, searches: Record<string, SearchRecord>) {
  const record = searches[node.id];
  if (record) return `OpenAlex 关键词“${record.query}”，返回 ${record.count} 篇元数据；核查于 ${record.checkedAt}，未覆盖全文，未发现不等于不存在。`;
  return '当前仅使用精选示例关系与关联文献，尚未执行该方向的系统检索，不能据此宣称研究空白。';
}

function enrichRecommendation(base: Recommendation, node: ResearchNode, project: ProjectContext, papers: Record<string, Paper>, searches: Record<string, SearchRecord>): Recommendation {
  const scoreBreakdown = scoreNode(node, project, papers);
  const paperIds = [...new Set([...node.paperIds, ...base.paperIds])].filter((id) => papers[id]);
  return {
    ...base,
    match: totalScore(scoreBreakdown),
    paperIds,
    supportingPaperIds: paperIds,
    sourceNodeIds: [node.id],
    query: node.query || base.query || node.title,
    variables: variablesForRecommendation[base.id] || base.variables,
    stopCondition: base.stopCondition || '若主要指标相对基线没有预设幅度的改善，或出现明显副产物与操作风险，应停止增加变量并回到基线复核。',
    searchScope: scopeForNode(node, searches),
    scoreBreakdown,
    cost: base.cost || (base.id === 'rec-larp' ? '低' : '中'),
    risk: base.risk || '跨路线比较可能同时改变成核与配体覆盖，不能把结果差异归因于单一变量。',
    rationale: `${base.rationale} 当前课题阶段为“${project.stage}”，因此相关性与可行性分别评为 ${scoreBreakdown.relevance} 和 ${scoreBreakdown.feasibility}。`,
  };
}

function genericRecommendation(node: ResearchNode, project: ProjectContext, papers: Record<string, Paper>, searches: Record<string, SearchRecord>): Recommendation {
  const scoreBreakdown = scoreNode(node, project, papers);
  const paperIds = node.paperIds.filter((id) => papers[id]);
  return {
    id: `rec-${node.id}`,
    title: `评估${node.title}对${project.target}的可迁移价值`,
    eyebrow: node.kind === 'opportunity' ? '来自当前机会节点' : '来自当前制备分支',
    summary: `${node.description} 本方向只提出可检验的迁移假设，不预设它优于现有路线。`,
    rationale: `该候选直接来自图谱中的“${node.relation || node.subtitle}”分支。它与当前课题文本的相关性为 ${scoreBreakdown.relevance}，证据完整度为 ${scoreBreakdown.evidence}，需要补充直接对照。`,
    nextStep: `以当前已复现路线为基线，仅引入“${node.title}”一个变化，使用相同组成、固含量和表征条件进行小样本平行对照。`,
    evidenceLevel: node.evidenceLevel || '待验证',
    match: totalScore(scoreBreakdown), paperIds, supportingPaperIds: paperIds,
    sourceNodeIds: [node.id], query: node.query || node.title,
    variables: ['单一方法变量', '粒径与缺陷', '初始 PLQY', '储存衰减'],
    stopCondition: '若平行对照未出现预设差异，或差异无法排除批次效应，应停止扩展并记录阴性结果。',
    searchScope: scopeForNode(node, searches), scoreBreakdown,
    cost: '中', risk: '跨体系迁移可能改变多个实验条件，需避免把相关变化解释为因果关系。',
    tags: [node.relation || '图谱候选', '平行对照'],
  };
}

export function buildRecommendations(graph: GraphData, project: ProjectContext, papers: Record<string, Paper>, searches: Record<string, SearchRecord> = {}): Recommendation[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const enriched = seedRecommendations.flatMap((base) => {
    const node = nodes.get(sourceForRecommendation[base.id]);
    return node ? [enrichRecommendation(base, node, project, papers, searches)] : [];
  });
  const knownSources = new Set(Object.values(sourceForRecommendation));
  const generic = graph.nodes.filter((node) => (node.kind === 'method' || node.kind === 'opportunity') && !knownSources.has(node.id) && node.id !== 'method-hot').map((node) => genericRecommendation(node, project, papers, searches));
  if (!enriched.length && !generic.length) {
    const root = nodes.get('root');
    if (root) {
      const base = genericRecommendation(root, project, papers, searches);
      enriched.push({
        ...base,
        title: `围绕${root.title}建立“组成—方法—稳定性”证据矩阵`,
        eyebrow: '来自实时论文集合',
        summary: '先把检索结果按材料组成、制备路线和稳定性指标分组，再决定哪一条差异值得进入实验，而不是直接把高被引论文当作推荐结论。',
        nextStep: '先阅读当前论文摘要并记录组成、方法、配体、初始性能和老化条件；只把具有可比表征的论文放入同一对照组。',
        variables: ['材料组成', '制备路线', '配体与纯化', '初始及老化性能'],
        tags: ['证据整理', '实时检索'],
      });
    }
  }
  return [...enriched, ...generic].sort((a, b) => b.match - a.match).slice(0, 5);
}

export function counterQueryFor(recommendation: Recommendation) {
  return `${recommendation.query || recommendation.title} limitations challenges stability`;
}
