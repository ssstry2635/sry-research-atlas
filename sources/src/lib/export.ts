import type { Paper, ProjectContext, Recommendation } from '../types';

export function downloadText(filename: string, content: string, type = 'text/markdown;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportBrief(project: ProjectContext, recommendations: Recommendation[], papers: Record<string, Paper>) {
  const evidence = [...new Set(recommendations.flatMap((item) => item.supportingPaperIds || item.paperIds))]
    .map((id) => papers[id]).filter(Boolean);
  const lines = [
    `# ${project.title}：研究延伸简报`, '',
    `目标体系：${project.target}`, `当前阶段：${project.stage}`, '',
    '## 当前进展', project.progress, '', '## 研究目标', project.goal, '', '## 实验约束', project.constraints, '',
    '## 推荐方向',
    ...recommendations.flatMap((item, index) => [
      `### ${index + 1}. ${item.title}`, item.summary, '', `推荐理由：${item.rationale}`, '',
      `下一步：${item.nextStep}`,
      item.variables?.length ? `本轮变量：${item.variables.join('、')}` : '',
      item.stopCondition ? `停止条件：${item.stopCondition}` : '',
      item.scoreBreakdown ? `评分拆解：课题相关 ${item.scoreBreakdown.relevance}，实验可行 ${item.scoreBreakdown.feasibility}，证据完整 ${item.scoreBreakdown.evidence}，新颖程度 ${item.scoreBreakdown.novelty}。` : '',
      item.searchScope ? `检索范围：${item.searchScope}` : '',
      item.risk ? `主要风险：${item.risk}` : '',
      `证据属性：${item.evidenceLevel}；课题匹配度：${item.match}/100。`, '',
    ]),
    '## 证据原文',
    ...evidence.map((paper) => `- ${paper.title}. ${paper.venue}${paper.year ? ` (${paper.year})` : ''}. ${paper.url}`),
    '', '说明：匹配度由当前课题文本、方法与证据关联的透明启发式规则生成，不代表实验成功概率。',
  ];
  downloadText('玻尔科学空间-研究简报.md', lines.join('\n'));
}

export function exportBibtex(papers: Paper[]) {
  const body = papers.map((paper, index) => {
    const key = `bohr${paper.year || 'nd'}${index + 1}`;
    return `@article{${key},\n  title = {${paper.title}},\n  author = {${paper.authors}},\n  journal = {${paper.venue}},\n  year = {${paper.year || ''}},\n  doi = {${paper.doi || ''}},\n  url = {${paper.url}}\n}`;
  }).join('\n\n');
  downloadText('玻尔科学空间-文献.bib', body, 'application/x-bibtex;charset=utf-8');
}
