import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const name = 'bohr-research-atlas';
export const inject = ['tools', 'llm', 'agentDefaultModel', 'webServer'];

const KB_PATH = join(homedir(), '.dsh', 'bohr-knowledge.json');
let writeChain = Promise.resolve();

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function readBody(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > 1_000_000) throw new Error('请求内容超过 1 MB 限制');
  const text = await request.text();
  if (text.length > 1_000_000) throw new Error('请求内容超过 1 MB 限制');
  return text ? JSON.parse(text) : {};
}

async function readKnowledge() {
  try {
    const parsed = JSON.parse(await readFile(KB_PATH, 'utf8'));
    if (parsed && Array.isArray(parsed.papers)) return { version: 1, createdAt: parsed.createdAt || new Date().toISOString(), papers: parsed.papers };
    return { version: 1, createdAt: new Date().toISOString(), papers: [] };
  } catch (error) {
    if (error && error.code === 'ENOENT') return { version: 1, createdAt: new Date().toISOString(), papers: [] };
    throw error;
  }
}

async function mutateKnowledge(mutator) {
  let result;
  writeChain = writeChain.then(async () => {
    const store = await readKnowledge();
    result = await mutator(store);
    await mkdir(dirname(KB_PATH), { recursive: true });
    const temporary = `${KB_PATH}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(store, null, 2), 'utf8');
    await rename(temporary, KB_PATH);
  });
  await writeChain;
  return result;
}

function normalizePaper(input) {
  if (!input || typeof input !== 'object') throw new Error('缺少论文数据');
  const title = String(input.title || '').trim();
  if (!title) throw new Error('论文题目不能为空');
  const id = String(input.id || input.doi || title).trim();
  return {
    id,
    title,
    authors: String(input.authors || ''),
    year: Number.isInteger(input.year) ? input.year : null,
    venue: String(input.venue || ''),
    citations: Number.isFinite(input.citations) ? input.citations : 0,
    doi: String(input.doi || ''),
    url: String(input.url || ''),
    landingUrl: String(input.landingUrl || ''),
    pdfUrl: String(input.pdfUrl || ''),
    abstract: String(input.abstract || '').slice(0, 12_000),
    summaryEn: String(input.summaryEn || '').slice(0, 3_000),
    summaryZh: String(input.summaryZh || '').slice(0, 3_000),
    keyFinding: String(input.keyFinding || '').slice(0, 1_000),
    openAccess: Boolean(input.openAccess),
    source: String(input.source || 'OpenAlex'),
    addedAt: String(input.addedAt || new Date().toISOString()),
    tags: Array.isArray(input.tags) ? input.tags.map(String).slice(0, 20) : [],
  };
}

async function upsertPaper(paper) {
  const normalized = normalizePaper(paper);
  return mutateKnowledge((store) => {
    const index = store.papers.findIndex((item) => item.id === normalized.id);
    if (index >= 0) store.papers[index] = { ...store.papers[index], ...normalized };
    else store.papers.unshift(normalized);
    return store.papers.length;
  });
}

function paperText(paper) {
  return [paper.title, paper.authors, paper.venue, paper.abstract, paper.summaryEn, paper.summaryZh, ...(paper.tags || [])]
    .filter(Boolean).join('\n').toLowerCase();
}

function searchKnowledge(store, query, limit = 6) {
  const terms = String(query || '').toLowerCase().split(/[\s,，;；]+/).filter((term) => term.length > 1);
  return store.papers
    .map((paper) => {
      const text = paperText(paper);
      const score = terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0);
      return { paper, score };
    })
    .filter((item) => !terms.length || item.score > 0)
    .sort((a, b) => b.score - a.score || String(b.paper.addedAt).localeCompare(String(a.paper.addedAt)))
    .slice(0, limit)
    .map((item) => item.paper);
}

function resolveRoute(ctx) {
  const selection = ctx.agentDefaultModel?.currentSelection?.();
  if (selection?.provider && selection?.model) return { provider: selection.provider, model: selection.model };
  const provider = ctx.llm.listProviders()[0];
  if (!provider) throw new Error('DSH 当前没有可用模型，请先在模型设置中配置');
  throw new Error(`无法从默认模型确定 ${provider.id} 的具体模型，请先在 DSH 设置中选择模型`);
}

async function complete(ctx, { system, prompt, maxTokens = 900, signal }) {
  const route = resolveRoute(ctx);
  let text = '';
  for await (const chunk of ctx.llm.stream({
    ...route,
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    temperature: 0.2,
    maxTokens,
    signal,
    purpose: 'bohr-research-atlas',
  })) {
    if (chunk.type === 'text-delta') text += chunk.text;
    if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
      throw new Error(chunk.reason.failure?.message || '模型调用失败');
    }
  }
  if (!text.trim()) throw new Error('模型没有返回文本');
  return text.trim();
}

function parseJson(text) {
  const withoutFence = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!withoutFence) throw new Error('模型返回内容为空');
  try { return JSON.parse(withoutFence); } catch {}
  const objectStart = withoutFence.indexOf('{');
  const arrayStart = withoutFence.indexOf('[');
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  if (!starts.length) throw new Error('模型返回内容不是 JSON');
  const start = Math.min(...starts);
  const end = Math.max(withoutFence.lastIndexOf('}'), withoutFence.lastIndexOf(']'));
  if (end > start) {
    try { return JSON.parse(withoutFence.slice(start, end + 1)); } catch {}
  }
  const repaired = repairTruncatedJson(withoutFence.slice(start));
  if (repaired) return repaired;
  throw new Error('模型返回的 JSON 不完整');
}

function repairTruncatedJson(raw) {
  let candidate = String(raw || '').trim();
  for (let cut = 0; cut < 6 && candidate.length > 2; cut += 1) {
    const attempt = closeJsonDelimiters(candidate);
    try { return JSON.parse(attempt); } catch {}
    const lastBrace = Math.max(candidate.lastIndexOf('},'), candidate.lastIndexOf('}'));
    if (lastBrace <= 0) break;
    candidate = candidate.slice(0, lastBrace + 1);
  }
  return null;
}

function closeJsonDelimiters(input) {
  let text = String(input || '').replace(/,\s*$/, '');
  const stack = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if ((ch === '}' || ch === ']') && stack.length && stack[stack.length - 1] === ch) stack.pop();
  }
  if (inString) text += '"';
  text = text.replace(/,\s*$/, '');
  while (stack.length) text += stack.pop();
  return text;
}

function fallbackEnglishSummary(paper) {
  const abstract = String(paper.abstract || '').replace(/\s+/g, ' ').trim();
  if (!abstract) return `The metadata provides only the title: “${paper.title}”. No abstract is available, so this summary must not be treated as a description of methods or results.`;
  return abstract.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 2).join(' ').slice(0, 900);
}

function translateToChinese(ctx, text, signal) {
  return translateWithDirection(ctx, text, 'en', 'zh-CN', signal);
}

async function translateWithDirection(ctx, text, sourceLanguage, targetLanguage, signal) {
  const translator = ctx.get('translator');
  if (!translator || !String(text || '').trim()) return '';
  try {
    const providers = await translator.availableProviders(signal);
    const provider = providers.find((item) => item === 'google' || item === 'bing');
    if (!provider) return '';
    const spec = translator.resolve({ text: String(text).slice(0, 5000), targetLanguage, sourceLanguage, provider });
    return String(await translator.translate(spec, signal)).trim();
  } catch {
    return '';
  }
}

const ACADEMIC_ZH_DICT = {
  '钙钛矿': 'perovskite', '纳米晶': 'nanocrystals', '量子点': 'quantum dots', '固态电解质': 'solid-state electrolyte',
  '锂电池': 'lithium-ion battery', '钠离子电池': 'sodium-ion battery', '金属有机框架': 'metal-organic framework',
  '共价有机框架': 'covalent organic framework', '电催化': 'electrocatalysis', '光催化': 'photocatalysis',
  '二氧化碳还原': 'CO2 reduction', '析氢': 'hydrogen evolution reaction', '析氧': 'oxygen evolution reaction',
  '发光二极管': 'light-emitting diode', '太阳能电池': 'solar cells', '热注入': 'hot injection',
  '配体': 'ligand', '表面工程': 'surface engineering', '第一性原理': 'first-principles DFT',
  '密度泛函': 'density functional theory', '机器学习': 'machine learning', '大语言模型': 'large language model',
  '神经网络': 'neural network', '分子动力学': 'molecular dynamics', '高熵合金': 'high-entropy alloy',
  '超导': 'superconductor', '二维材料': '2D materials', '石墨烯': 'graphene', '碳纳米管': 'carbon nanotubes',
  '单原子催化剂': 'single-atom catalyst', '蛋白质结构': 'protein structure prediction', '基因编辑': 'CRISPR gene editing',
};

function extractDoi(input) {
  const match = String(input || '').trim().match(/(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/);
  return match ? match[1].replace(/[.,;]+$/, '') : '';
}

async function planAcademicQuery(ctx, rawQuery, signal) {
  const trimmed = String(rawQuery || '').trim();
  const doi = extractDoi(trimmed);
  if (doi) return { original: trimmed, resolved: doi, doi };
  if (!/[\u4e00-\u9fff]/.test(trimmed)) return { original: trimmed, resolved: trimmed, doi: '' };
  let replaced = trimmed;
  Object.entries(ACADEMIC_ZH_DICT).forEach(([zh, en]) => {
    replaced = replaced.replaceAll(zh, ` ${en} `);
  });
  replaced = replaced.replace(/\s+/g, ' ').trim();
  if (!/[\u4e00-\u9fff]/.test(replaced) && replaced.length > 2) {
    return { original: trimmed, resolved: replaced, doi: '' };
  }
  const translated = await translateWithDirection(ctx, trimmed, 'zh-CN', 'en', signal);
  if (translated && !/[\u4e00-\u9fff]/.test(translated)) {
    return { original: trimmed, resolved: translated.replace(/[。.!?？]/g, ' ').replace(/\s+/g, ' ').trim(), doi: '' };
  }
  try {
    const llmQuery = await complete(ctx, {
      system: '将用户的中文科研检索词转化为简洁准确的英文学术检索短语（3–7 个英文词，保留化学式与专有名词，只输出英文检索词本身，不要任何标点或解释）。',
      prompt: trimmed,
      maxTokens: 60,
      signal,
    });
    const clean = llmQuery.replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, ' ').trim();
    if (clean && /[A-Za-z]/.test(clean)) return { original: trimmed, resolved: clean, doi: '' };
  } catch {}
  return { original: trimmed, resolved: replaced || trimmed, doi: '' };
}

function fallbackChineseSummary(paper) {
  const venue = [paper.venue, paper.year].filter(Boolean).join('，');
  return `《${paper.title}》${venue ? `（${venue}）` : ''}。当前仅有题录信息，尚未取得摘要，因此中文概要只说明论文主题，不能替代对方法、数据和结论的阅读。请回溯原文核验。`;
}

function fallbackMindMap(paper) {
  const known = String(paper.summaryZh || paper.keyFinding || paper.abstract || '').replace(/\s+/g, ' ').trim().slice(0, 220);
  const hasAbstract = Boolean(String(paper.abstract || '').trim());
  return {
    title: paper.title || '论文思维导图',
    summary: known || '当前只有题录信息，以下导图仅提供阅读框架，具体方法与结论需回溯原文。',
    generatedBy: 'fallback',
    nodes: [
      { id: 'root', parentId: null, label: '研究主题', zh: `论文围绕“${paper.title || '该论文'}”展开。`, question: '这篇论文试图解决的核心科学问题是什么？' },
      { id: 'known', parentId: 'root', label: '已知证据', zh: known || '摘要未提供具体结果，需要回溯原文确认。', question: '目前能从题目或摘要确认哪些事实，哪些仍然未知？' },
      { id: 'method', parentId: 'root', label: '方法与材料', zh: hasAbstract ? '摘要未完整给出实验条件，需回溯原文核验材料、合成和表征细节。' : '仅有题录信息，摘要未提供，无法确认材料与实验方法。', question: '这篇论文使用了哪些材料、合成步骤和表征手段？' },
      { id: 'boundary', parentId: 'root', label: '证据边界', zh: '本导图只依据题目与摘要生成，未阅读全文，不能替代对数据、对照和统计的核查。', question: '现有证据支持到什么程度，哪些结论仍需原文数据支持？' },
      { id: 'next', parentId: 'root', label: '下一步验证', zh: '先回溯原文的方法与结果部分，再设计可重复的对照实验或检索独立复现研究。', question: '如果要在自己的体系中验证这篇论文，最小实验和停止条件是什么？' },
    ],
    edges: [['root', 'known'], ['root', 'method'], ['root', 'boundary'], ['root', 'next']],
  };
}

function normalizeMindMap(parsed, paper) {
  if (!parsed || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) return null;
  const sourceNodes = parsed.nodes.slice(0, 9);
  const used = new Set();
  const originalRoot = String(sourceNodes[0]?.id || 'root').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'root';
  const nodes = sourceNodes.map((node, index) => {
    let id = index === 0 ? 'root' : String(node?.id || `n${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || `n${index + 1}`;
    while (used.has(id)) id = `${id}_${index + 1}`;
    used.add(id);
    let parentId = index === 0 ? null : (node?.parentId ? String(node.parentId) : 'root');
    if (parentId === originalRoot) parentId = 'root';
    return {
      id,
      parentId,
      label: String(node?.label || `节点 ${index + 1}`).slice(0, 80),
      zh: String(node?.zh || node?.description || '摘要未提供，需要读原文。').slice(0, 400),
      question: String(node?.question || `请解释“${node?.label || '这个节点'}”在论文中的依据和边界。`).slice(0, 220),
    };
  });
  const validIds = new Set(nodes.map((node) => node.id));
  nodes.forEach((node, index) => {
    if (index > 0 && (!node.parentId || !validIds.has(node.parentId) || node.parentId === node.id)) node.parentId = 'root';
  });
  const edges = nodes.filter((node) => node.parentId && validIds.has(node.parentId)).map((node) => [node.parentId, node.id]);
  return {
    title: String(parsed.title || paper.title || '论文思维导图').slice(0, 160),
    summary: String(parsed.summary || parsed.zh || paper.summaryZh || '请结合原文核验下列阅读框架。').slice(0, 500),
    generatedBy: 'model',
    nodes,
    edges,
  };
}

async function enrichSingle(ctx, paper, signal) {
  const english = fallbackEnglishSummary(paper);
  try {
    const raw = await complete(ctx, {
      system: '你是材料科学文献助理。只能依据题目和摘要写作，不得补充未给出的事实。输出严格 JSON，不要 Markdown；中文必须是自然、准确的学术中文。',
      prompt: `为这篇论文生成简短双語概要。英文 1–2 句，中文 1–2 句并与英文对应，keyFinding 为一句中文。若没有摘要或摘要不足，必须明确写“仅有题录信息/摘要信息不足”，只能概括题目主题，不得虚构方法、数据或结论。\n论文：${JSON.stringify({ id: paper.id, title: paper.title, abstract: String(paper.abstract || '').slice(0, 1500) })}\n输出：{"id":"${paper.id}","englishSummary":"...","chineseSummary":"...","keyFinding":"..."}`,
      maxTokens: 650,
      signal,
    });
    const parsed = parseJson(raw);
    const item = Array.isArray(parsed) ? parsed[0] : parsed;
    const chinese = String(item?.chineseSummary || '').trim();
    if (chinese) {
      return {
        id: paper.id,
        englishSummary: String(item.englishSummary || english).trim(),
        chineseSummary: chinese,
        keyFinding: String(item.keyFinding || '').trim(),
      };
    }
  } catch {}
  const translated = await translateToChinese(ctx, english, signal);
  return {
    id: paper.id,
    englishSummary: english,
    chineseSummary: translated || fallbackChineseSummary(paper),
    keyFinding: paper.abstract ? '仅依据题目与摘要生成，需阅读原文确认。' : '仅有题录信息，需阅读原文确认。',
  };
}

const searchCache = new Map();
const pdfRegistry = new Map();
const SEARCH_TTL_MS = 15 * 60 * 1000;

function registerPapers(papers) {
  papers.forEach((paper) => {
    if (!paper?.openAccess || !isPublicHttpsUrl(paper.pdfUrl)) return;
    const record = { url: paper.pdfUrl, title: paper.title, doi: paper.doi };
    if (paper.id) pdfRegistry.set(String(paper.id), record);
    if (paper.doi) pdfRegistry.set(String(paper.doi), record);
  });
}

function isPublicHttpsUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local')) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
    const private172 = host.match(/^172\.(\d+)\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
    if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return false;
    return true;
  } catch {
    return false;
  }
}

function abstractFromIndex(index) {
  if (!index || typeof index !== 'object') return '';
  const words = [];
  Object.entries(index).forEach(([word, positions]) => {
    if (Array.isArray(positions)) positions.forEach((position) => words.push([position, word]));
  });
  return words.sort((a, b) => a[0] - b[0]).map(([, word]) => word).join(' ');
}

function stripMarkup(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function normalizeOpenAlex(work) {
  if (!work?.title && !work?.display_name) return null;
  const names = (work.authorships || []).map((item) => item.author?.display_name).filter(Boolean);
  const doi = work.doi?.replace(/^https?:\/\/doi\.org\//i, '');
  const oaUrl = work.open_access?.oa_url || undefined;
  const pdfUrl = work.best_oa_location?.pdf_url || (/\.pdf(?:$|\?)/i.test(oaUrl || '') ? oaUrl : undefined);
  const landingUrl = work.primary_location?.landing_page_url || work.doi || work.id;
  return {
    id: work.id || doi || work.title,
    title: work.title || work.display_name,
    authors: names.length > 3 ? `${names.slice(0, 3).join(', ')} 等` : names.join(', ') || '作者信息未提供',
    year: work.publication_year || null,
    venue: work.primary_location?.source?.display_name || '期刊信息未提供',
    citations: work.cited_by_count || 0,
    doi,
    url: pdfUrl || landingUrl,
    landingUrl,
    pdfUrl,
    abstract: abstractFromIndex(work.abstract_inverted_index),
    openAccess: Boolean(work.open_access?.is_oa),
    source: 'OpenAlex',
  };
}

function crossrefYear(item) {
  const parts = item.issued?.['date-parts']?.[0] || item['published-print']?.['date-parts']?.[0] || item['published-online']?.['date-parts']?.[0];
  const year = Number(parts?.[0]);
  return Number.isInteger(year) ? year : null;
}

function normalizeCrossref(item) {
  const title = Array.isArray(item.title) ? item.title[0] : item.title;
  if (!title || String(item.DOI || '').endsWith('.s001')) return null;
  const authors = (item.author || []).map((author) => [author.given, author.family].filter(Boolean).join(' ')).filter(Boolean);
  const year = crossrefYear(item);
  const doi = String(item.DOI || '');
  const openLicense = (item.license || []).some((license) => String(license?.URL || '').includes('creativecommons.org'));
  const pdfLink = (item.link || []).find((link) => String(link?.['content-type'] || '').includes('pdf'))?.URL;
  const landingUrl = item.resource?.primary?.URL || (doi ? `https://doi.org/${doi}` : item.URL || 'https://www.crossref.org/');
  return {
    id: doi ? `doi:${doi}` : `crossref:${stripMarkup(title)}`,
    title: stripMarkup(title),
    authors: authors.length > 3 ? `${authors.slice(0, 3).join(', ')} 等` : authors.join(', ') || '作者信息未提供',
    year,
    venue: Array.isArray(item['container-title']) ? item['container-title'][0] || '期刊信息未提供' : item['container-title'] || '期刊信息未提供',
    citations: Number(item['is-referenced-by-count']) || 0,
    doi,
    url: openLicense && pdfLink ? pdfLink : landingUrl,
    landingUrl,
    pdfUrl: openLicense && pdfLink ? pdfLink : undefined,
    abstract: stripMarkup(item.abstract || ''),
    openAccess: openLicense,
    source: 'Crossref',
  };
}

function xmlText(value) {
  return stripMarkup(String(value || '').replace(/<!\[CDATA\[|\]\]>/g, ''));
}

function parseArxiv(xml) {
  const entries = [...String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);
  return entries.map((entry) => {
    const title = xmlText(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]);
    if (!title) return null;
    const abstract = xmlText(entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]);
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] || '';
    const id = entry.match(/<id>([^<]+)<\/id>/)?.[1] || '';
    const pdfUrl = entry.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/)?.[1] || id.replace('/abs/', '/pdf/');
    const landingUrl = entry.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1] || id;
    const names = [...entry.matchAll(/<author>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/author>/g)].map((match) => xmlText(match[1]));
    const doi = xmlText(entry.match(/<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/)?.[1]) || undefined;
    return {
      id: `arxiv:${id.split('/abs/').pop() || title}`,
      title,
      authors: names.length > 3 ? `${names.slice(0, 3).join(', ')} 等` : names.join(', ') || '作者信息未提供',
      year: Number(published.slice(0, 4)) || null,
      venue: 'arXiv 预印本',
      citations: 0,
      doi,
      url: pdfUrl,
      landingUrl,
      pdfUrl,
      abstract,
      openAccess: true,
      source: 'arXiv',
    };
  }).filter(Boolean);
}

function normalizeEuropePmc(item) {
  const title = stripMarkup(item.title || '');
  if (!title) return null;
  const doi = item.doi ? String(item.doi).replace(/^https?:\/\/doi\.org\//i, '') : undefined;
  const authors = item.authorString ? stripMarkup(item.authorString) : '作者信息未提供';
  const pmcid = item.pmcid ? String(item.pmcid).trim() : '';
  const isOa = item.isOpenAccess === 'Y' || Boolean(pmcid);
  const fullUrls = item.fullTextUrlList?.fullTextUrl || [];
  const pdfEntry = Array.isArray(fullUrls)
    ? fullUrls.find((entry) => String(entry?.documentStyle || '').toLowerCase() === 'pdf' && /^https:\/\//i.test(String(entry?.url || '')))
    : null;
  const pdfUrl = pdfEntry?.url || (pmcid ? `https://europepmc.org/articles/${encodeURIComponent(pmcid)}?pdf=render` : undefined);
  const landingUrl = doi
    ? `https://doi.org/${doi}`
    : (pmcid ? `https://europepmc.org/article/PMC/${encodeURIComponent(pmcid)}` : (item.id ? `https://europepmc.org/article/${item.source || 'MED'}/${item.id}` : 'https://europepmc.org/'));
  return {
    id: doi ? `doi:${doi}` : `epmc:${pmcid || item.id || title}`,
    title,
    authors,
    year: Number(item.pubYear) || null,
    venue: stripMarkup(item.journalTitle || item.bookOrReportDetails?.publisher || 'Europe PMC'),
    citations: Number(item.citedByCount) || 0,
    doi,
    url: (isOa && pdfUrl) ? pdfUrl : landingUrl,
    landingUrl,
    pdfUrl: isOa ? pdfUrl : undefined,
    abstract: stripMarkup(item.abstractText || ''),
    openAccess: Boolean(isOa && pdfUrl),
    source: 'Europe PMC',
  };
}

function dedupePapers(papers) {
  const byKey = new Map();
  papers.forEach((paper) => {
    const key = paper.doi
      ? `doi:${paper.doi.toLowerCase()}`
      : paper.title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').trim();
    if (!key) return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...paper });
      return;
    }
    if (!existing.abstract && paper.abstract) existing.abstract = paper.abstract;
    if (!existing.pdfUrl && paper.pdfUrl) {
      existing.pdfUrl = paper.pdfUrl;
      existing.openAccess = true;
      existing.url = paper.pdfUrl;
    }
    if (!existing.doi && paper.doi) existing.doi = paper.doi;
    if ((paper.citations || 0) > (existing.citations || 0)) existing.citations = paper.citations;
    if ((!existing.venue || existing.venue === '期刊信息未提供') && paper.venue) existing.venue = paper.venue;
  });
  return [...byKey.values()];
}

function rankPapers(papers, query) {
  const tokens = query.toLowerCase().split(/\s+/).filter((token) => token.length > 2);
  const scored = papers.map((paper) => {
    const title = String(paper.title || '').toLowerCase();
    const abstract = String(paper.abstract || '').toLowerCase();
    const titleMatches = tokens.filter((token) => title.includes(token)).length;
    const abstractMatches = tokens.filter((token) => abstract.includes(token)).length;
    const hasAbstract = abstract.length >= 60 ? 22 : 0;
    const hasPdf = paper.pdfUrl ? 14 : (paper.openAccess ? 6 : 0);
    const age = paper.year ? Math.max(0, 2026 - paper.year) : 8;
    const score = titleMatches * 115 + abstractMatches * 10 + hasAbstract + hasPdf + Math.log10((paper.citations || 0) + 1) * 18 + Math.max(0, 10 - age * 0.4);
    return { paper, score };
  });
  return scored.sort((a, b) => b.score - a.score).map((item) => item.paper);
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 15_000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function searchOpenAlex(query) {
  const doi = extractDoi(query);
  const apiKey = process.env.OPENALEX_API_KEY;
  if (doi) {
    const suffix = apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : '';
    const work = await fetchJsonWithTimeout(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}${suffix}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'BohrResearchAtlas/4.7 (DSH plugin)' },
    });
    const paper = normalizeOpenAlex(work);
    return paper ? [paper] : [];
  }
  const params = new URLSearchParams({
    search: query,
    'per-page': '10',
    filter: 'is_retracted:false',
    select: 'id,doi,title,display_name,publication_year,cited_by_count,authorships,primary_location,open_access,best_oa_location,abstract_inverted_index',
  });
  if (apiKey) params.set('api_key', apiKey);
  const payload = await fetchJsonWithTimeout(`https://api.openalex.org/works?${params.toString()}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'BohrResearchAtlas/4.7 (DSH plugin)' },
  });
  return (payload.results || []).map(normalizeOpenAlex).filter(Boolean);
}

const CROSSREF_HEADERS = { Accept: 'application/json', 'User-Agent': 'BohrResearchAtlas/4.7 (https://github.com/ssstry2635/sry-research-atlas)' };

async function searchCrossref(query) {
  const doi = extractDoi(query);
  if (doi) {
    const payload = await fetchJsonWithTimeout(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers: CROSSREF_HEADERS });
    const paper = normalizeCrossref(payload.message || {});
    return paper ? [paper] : [];
  }
  const params = new URLSearchParams({
    'query.bibliographic': query,
    rows: '8',
    filter: 'type:journal-article',
    select: 'DOI,title,author,issued,published-print,published-online,container-title,abstract,is-referenced-by-count,URL,type,link,license,resource',
  });
  const payload = await fetchJsonWithTimeout(`https://api.crossref.org/works?${params.toString()}`, { headers: CROSSREF_HEADERS });
  return (payload.message?.items || []).map(normalizeCrossref).filter(Boolean);
}

async function searchEuropePmc(query) {
  const doi = extractDoi(query);
  const params = new URLSearchParams({
    query: doi ? `DOI:"${doi}"` : query,
    format: 'json',
    resultType: 'core',
    pageSize: '6',
  });
  const payload = await fetchJsonWithTimeout(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params.toString()}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'BohrResearchAtlas/4.7' },
  }, 12_000);
  return (payload.resultList?.result || []).map(normalizeEuropePmc).filter(Boolean);
}

async function searchArxiv(query) {
  if (extractDoi(query)) return [];
  const clean = query.replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim();
  const terms = clean.split(' ').filter((w) => w.length > 1).slice(0, 6);
  const expr = terms.length > 1 ? terms.map((w) => `all:${w}`).join(' AND ') : `all:${clean}`;
  const params = new URLSearchParams({
    search_query: expr,
    start: '0',
    max_results: '5',
    sortBy: 'relevance',
    sortOrder: 'descending',
  });
  const response = await fetch(`https://export.arxiv.org/api/query?${params.toString()}`, {
    headers: { Accept: 'application/atom+xml', 'User-Agent': 'BohrResearchAtlas/4.7' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`arXiv HTTP ${response.status}`);
  return parseArxiv(await response.text()).slice(0, 5);
}

async function enrichOpenAccess(papers) {
  const email = process.env.UNPAYWALL_EMAIL;
  if (!email) return papers;
  await Promise.allSettled(papers.map(async (paper) => {
    if (!paper.doi) return;
    try {
      const payload = await fetchJsonWithTimeout(`https://api.unpaywall.org/v2/${encodeURIComponent(paper.doi)}?email=${encodeURIComponent(email)}`, {
        headers: { Accept: 'application/json' },
      }, 8_000);
      if (payload.is_oa) {
        const location = payload.best_oa_location || payload.first_oa_location;
        paper.openAccess = true;
        paper.pdfUrl = location?.url_for_pdf || paper.pdfUrl;
        paper.landingUrl = paper.landingUrl || location?.url;
        paper.url = paper.pdfUrl || paper.landingUrl || paper.url;
      }
    } catch {}
  }));
  return papers;
}

async function searchWithFallback(ctx, rawQuery, signal) {
  const key = rawQuery.trim().toLowerCase();
  const now = Date.now();
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > now) {
    registerPapers(cached.papers);
    return { papers: cached.papers, source: `${cached.source} cache`, cached: true, resolvedQuery: cached.resolvedQuery || rawQuery };
  }
  const planned = await planAcademicQuery(ctx, rawQuery, signal);
  const query = planned.resolved;
  let warning = '';
  let openAlexPapers = [];
  try {
    openAlexPapers = await searchOpenAlex(query);
  } catch (error) {
    warning = error?.status === 429 || error?.status === 403
      ? 'OpenAlex 当前额度受限，已联合 Crossref、Europe PMC 与 arXiv 检索。'
      : `OpenAlex 暂时不可用（${error instanceof Error ? error.message : String(error)}），已联合其他开放学术源检索。`;
  }
  const needSupplement = openAlexPapers.length < 5
    || openAlexPapers.filter((p) => p.abstract).length < 3
    || openAlexPapers.filter((p) => p.pdfUrl).length < 2;
  let supplementPapers = [];
  if (needSupplement) {
    const [crossrefResult, epmcResult, arxivResult] = await Promise.allSettled([
      searchCrossref(query),
      searchEuropePmc(query),
      searchArxiv(query),
    ]);
    if (crossrefResult.status === 'fulfilled') supplementPapers.push(...crossrefResult.value);
    if (epmcResult.status === 'fulfilled') supplementPapers.push(...epmcResult.value);
    if (arxivResult.status === 'fulfilled') supplementPapers.push(...arxivResult.value);
  }
  let papers = rankPapers(dedupePapers([...openAlexPapers, ...supplementPapers]), query).slice(0, 8);
  if (papers.length) {
    papers = await enrichOpenAccess(papers);
    const sources = [...new Set(papers.map((paper) => paper.source))].join(' + ');
    registerPapers(papers);
    searchCache.set(key, { papers, source: sources, resolvedQuery: query, expiresAt: now + SEARCH_TTL_MS });
    return { papers, source: sources, cached: false, warning: warning || undefined, resolvedQuery: query };
  }
  if (cached) return { papers: cached.papers, source: `${cached.source} stale cache`, cached: true, warning, resolvedQuery: cached.resolvedQuery || query };
  throw new Error(`${warning || '论文检索暂时不可用。'} 请稍后重试，或在 Host 环境设置 OPENALEX_API_KEY 获得独立额度。`);
}

function fallbackBranches(query, papers) {
  const clean = String(query || '当前研究主题').trim();
  const ids = (papers || []).map((p) => p.id).filter(Boolean);
  return [
    { id: 'dyn-family-1', kind: 'family', title: `${clean.slice(0, 12)} 体系谱系`, subtitle: '体系分类与演化', description: `围绕“${clean}”的核心结构、组成变体、模型分类或理论谱系展开对照。`, relation: '核心谱系', query: `${clean} classification structure variants`, tags: ['体系分类', '结构谱系'], evidenceLevel: '迁移线索', paperIds: ids.slice(0, 2) },
    { id: 'dyn-material-1', kind: 'material', title: `${clean.slice(0, 12)} 邻近参照体系`, subtitle: '对照体系与基准', description: `与“${clean}”处于同一学科方向的典型参照对象或竞争基线，用于横向比较性能与适用边界。`, relation: '横向对照', query: `${clean} benchmark comparison system`, tags: ['对照基准', '横向比较'], evidenceLevel: '已验证', paperIds: ids.slice(1, 3) },
    { id: 'dyn-method-1', kind: 'method', title: '主流实现与制备路线', subtitle: '方法学与工艺控制', description: `针对“${clean}”报道最多的构建、合成、训练或实验路线，关注关键控制参数与可重复性。`, relation: '核心方法', query: `${clean} synthesis method implementation protocol`, tags: ['主流路线', '参数控制'], evidenceLevel: '已验证', paperIds: ids.slice(0, 2) },
    { id: 'dyn-method-2', kind: 'method', title: '表征评测与机理诊断', subtitle: '评测指标与机理', description: `用于检验“${clean}”内在机理、误差来源、失效模式或结构演化的关键表征与评测手段。`, relation: '表征评测', query: `${clean} characterization mechanism evaluation`, tags: ['机理诊断', '标准评测'], evidenceLevel: '迁移线索', paperIds: ids.slice(2, 4) },
    { id: 'dyn-opp-1', kind: 'opportunity', title: '稳定性与规模化瓶颈突破', subtitle: '延伸机会与边界', description: `综合现有文献中关于“${clean}”的退化机制、泛化局限或成本约束，寻找最小对照验证切入点。`, relation: '潜在突破口', query: `${clean} stability scalability limitations challenges`, tags: ['瓶颈问题', '待验证假设'], evidenceLevel: '待验证', paperIds: ids.slice(0, 3) },
  ];
}

async function generateResearchBranches(ctx, query, papers, signal) {
  const sample = (papers || []).slice(0, 6).map((p, index) => ({
    index,
    id: String(p.id || index),
    title: String(p.title || '').slice(0, 160),
    venue: String(p.venue || ''),
    year: p.year,
  }));
  try {
    const raw = await complete(ctx, {
      system: '你是跨学科科研知识图谱架构师。根据用户检索的研究主题与检索到的论文列表，构建左右双侧发散研究分支。只输出严格单行 JSON，不要 Markdown。',
      prompt: `研究主题：${query}\n相关论文：${JSON.stringify(sample)}\n请生成 5 个具体、专业的研究分支节点（2 个属于左侧体系/概念谱系：kind 取 "family" 或 "material"；2 个属于右侧研究方法/实验/算法路线：kind 取 "method"；1 个属于右侧研究机会/瓶颈突破：kind 取 "opportunity"）。\n每个节点包含：id（短英文）、kind、title（中文，不超过 12 字，具体到该领域的真实概念或方法，不要泛泛而谈）、subtitle（不超过 14 字）、description（中文 1-2 句，说明科学意义与验证切入点）、relation（4-6 字关系名）、query（用于继续检索该分支的精准英文学术短语，3-6 个英文词）、tags（2 个中文短标签）、evidenceLevel（"已验证" | "迁移线索" | "待验证"）、paperIndices（关联上面论文的 index 数组，1-2 个）。\n输出格式：{"branches":[{"id":"b1","kind":"family","title":"...","subtitle":"...","description":"...","relation":"...","query":"...","tags":["..."],"evidenceLevel":"已验证","paperIndices":[0]}]}`,
      maxTokens: 1600,
      signal,
    });
    const parsed = parseJson(raw);
    const list = Array.isArray(parsed) ? parsed : parsed?.branches;
    if (!Array.isArray(list) || list.length < 3) return fallbackBranches(query, papers);
    const allowedKinds = new Set(['family', 'material', 'method', 'opportunity']);
    return list.slice(0, 6).map((item, idx) => {
      const kind = allowedKinds.has(item?.kind) ? item.kind : (idx < 2 ? 'family' : idx < 4 ? 'method' : 'opportunity');
      const indices = Array.isArray(item?.paperIndices) ? item.paperIndices : [idx % Math.max(1, sample.length)];
      const paperIds = indices.map((i) => sample[Number(i)]?.id).filter(Boolean);
      return {
        id: `dyn-${kind}-${idx + 1}`,
        kind,
        title: String(item?.title || `分支 ${idx + 1}`).slice(0, 20),
        subtitle: String(item?.subtitle || '派生研究分支').slice(0, 26),
        description: String(item?.description || '').slice(0, 240) || `围绕“${query}”派生的探索方向。`,
        relation: String(item?.relation || (kind === 'opportunity' ? '延伸机会' : kind === 'method' ? '方法路线' : '相关体系')).slice(0, 14),
        query: String(item?.query || `${query} ${item?.title || ''}`).slice(0, 120),
        tags: Array.isArray(item?.tags) ? item.tags.map((t) => String(t).slice(0, 14)).slice(0, 3) : ['派生分支'],
        evidenceLevel: ['已验证', '迁移线索', '待验证'].includes(item?.evidenceLevel) ? item.evidenceLevel : '迁移线索',
        paperIds: paperIds.length ? paperIds : (sample[0]?.id ? [sample[0].id] : []),
      };
    });
  } catch {
    return fallbackBranches(query, papers);
  }
}

async function handleRequest(ctx, request, peer) {
  if (peer && peer.principal?.kind !== 'owner') return jsonResponse({ error: '仅允许本机所有者访问' }, 403);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/bohr-api\/?/, '').replace(/\/$/, '');
  if (request.method === 'GET' && path === 'search') {
    const query = String(url.searchParams.get('q') || '').trim();
    if (!query) throw new Error('检索关键词不能为空');
    if (query.length > 300) throw new Error('检索关键词过长');
    return jsonResponse(await searchWithFallback(ctx, query, request.signal));
  }
  if (request.method === 'POST' && path === 'branches') {
    const body = await readBody(request);
    const query = String(body.query || '').trim();
    const papers = Array.isArray(body.papers) ? body.papers.slice(0, 8) : [];
    if (!query) return jsonResponse({ branches: [] });
    const branches = await generateResearchBranches(ctx, query, papers, request.signal);
    return jsonResponse({ branches });
  }
  if (request.method === 'GET' && path === 'pdf') {
    const id = String(url.searchParams.get('id') || '').trim();
    if (!id) throw new Error('缺少论文标识');
    let record = pdfRegistry.get(id);
    if (!record) {
      const store = await readKnowledge();
      const paper = store.papers.find((item) => item.id === id || item.doi === id);
      if (paper?.openAccess && isPublicHttpsUrl(paper.pdfUrl)) record = { url: paper.pdfUrl, title: paper.title, doi: paper.doi };
    }
    if (!record) return jsonResponse({ error: '这篇论文没有可用的开放 PDF，请打开原文页或通过机构权限访问' }, 404);
    const upstream = await fetch(record.url, {
      redirect: 'follow',
      headers: { Accept: 'application/pdf,*/*;q=0.5', 'User-Agent': 'BohrResearchAtlas/4.6 (DSH plugin)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok) return jsonResponse({ error: `开放 PDF 下载失败（HTTP ${upstream.status}）` }, 502);
    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('pdf') && !contentType.includes('octet-stream')) {
      return jsonResponse({ error: '开放获取地址返回的不是 PDF，可能需要在浏览器中打开原文页' }, 502);
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength > 40 * 1024 * 1024) return jsonResponse({ error: 'PDF 超过 40 MB 限制' }, 413);
    const asciiName = String(record.title || 'paper').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 100) || 'paper';
    const encodedName = encodeURIComponent(`${String(record.title || 'paper').slice(0, 120)}.pdf`);
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buffer.byteLength),
        'Content-Disposition': `attachment; filename="${asciiName}.pdf"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  }
  if (request.method === 'GET' && path === 'knowledge') {
    return jsonResponse(await readKnowledge());
  }
  if (request.method === 'POST' && path === 'knowledge') {
    const body = await readBody(request);
    const count = await upsertPaper(body.paper);
    return jsonResponse({ ok: true, count });
  }
  if (request.method === 'POST' && path === 'enrich') {
    const body = await readBody(request);
    const papers = Array.isArray(body.papers) ? body.papers.slice(0, 8) : [];
    if (!papers.length) return jsonResponse({ items: [] });
    const source = papers.map((paper, index) => ({
      index,
      id: String(paper.id || index),
      title: String(paper.title || ''),
      abstract: String(paper.abstract || '').slice(0, 1200),
    }));
    const byId = new Map();
    try {
      const raw = await complete(ctx, {
        system: '你是严谨的跨学科科研文献助理。只能依据用户提供的题目和摘要生成概括，不得补充摘要中没有的事实。每条英文 1–2 句、中文 1–2 句，中文要自然准确并与英文对应。输出严格 JSON，不要 Markdown。',
        prompt: `逐篇生成简短中英概要和一句中文 keyFinding。没有摘要时明确写“仅有题录信息”，只能概括题目主题。\n输入：\n${JSON.stringify(source)}\n输出：{"items":[{"id":"原id","englishSummary":"...","chineseSummary":"...","keyFinding":"..."}]}`,
        maxTokens: 3200,
        signal: request.signal,
      });
      const parsed = parseJson(raw);
      const batch = Array.isArray(parsed) ? parsed : parsed.items;
      if (Array.isArray(batch)) {
        batch.forEach((item, index) => {
          const id = String(source[index]?.id || item?.id || '');
          if (!id) return;
          const chinese = String(item.chineseSummary || '').trim();
          if (!chinese) return;
          byId.set(id, {
            id,
            englishSummary: String(item.englishSummary || '').slice(0, 3000),
            chineseSummary: chinese.slice(0, 3000),
            keyFinding: String(item.keyFinding || '').slice(0, 800),
          });
        });
      }
    } catch {
      // Batches can truncate when several papers have long abstracts. Missing records are retried one by one below.
    }
    for (const paper of source) {
      if (byId.has(paper.id)) continue;
      byId.set(paper.id, await enrichSingle(ctx, paper, request.signal));
    }
    return jsonResponse({ items: source.map((paper) => byId.get(paper.id)).filter(Boolean) });
  }
  if (request.method === 'POST' && path === 'mindmap') {
    const body = await readBody(request);
    const paper = normalizePaper(body.paper || {});
    const source = {
      title: paper.title,
      authors: paper.authors,
      year: paper.year,
      venue: paper.venue,
      abstract: String(paper.abstract || '').slice(0, 1600),
      summaryZh: String(paper.summaryZh || '').slice(0, 500),
      keyFinding: String(paper.keyFinding || '').slice(0, 400),
    };
    const prompts = [
      `为论文生成可追问的精简思维导图，最多 8 个节点。每个节点 zh 不超过 90 个汉字，question 不超过 60 个汉字；若摘要缺少某部分，写“摘要未提供，需要读原文”。\n论文：\n${JSON.stringify(source)}\n只输出一行合法 JSON，不要 Markdown、注释或多余文字。格式：{"title":"短标题","summary":"一句话中文总览","nodes":[{"id":"root","parentId":null,"label":"核心问题","zh":"中文说明","question":"追问问题"},{"id":"method","parentId":"root","label":"方法与材料","zh":"...","question":"..."}],"edges":[["root","method"]]}。节点覆盖研究问题、材料与合成、关键结果、证据边界和下一步验证。`,
      `只输出紧凑单行 JSON，最多 6 个节点，每个 zh 不超过 60 字。若信息不足写“仅有题录信息”。不要 Markdown。\n${JSON.stringify({ title: source.title, abstract: source.abstract.slice(0, 900), summaryZh: source.summaryZh })}\n格式：{"title":"...","summary":"...","nodes":[{"id":"root","parentId":null,"label":"...","zh":"...","question":"..."}],"edges":[]}。`,
    ];
    let mapped = null;
    for (let attempt = 0; attempt < prompts.length && !mapped; attempt += 1) {
      try {
        const raw = await complete(ctx, {
          system: '你是严谨的跨学科科研论文阅读教练。只依据题目和摘要绘制结构化思维导图，不得虚构实验细节。输出严格单行 JSON，不要 Markdown 代码围栏，不得截断。',
          prompt: prompts[attempt],
          maxTokens: attempt === 0 ? 3200 : 3600,
          signal: request.signal,
        });
        mapped = normalizeMindMap(parseJson(raw), paper);
      } catch {
        // A truncated or malformed model response falls back to the compact prompt, then to a deterministic map.
      }
    }
    return jsonResponse(mapped || fallbackMindMap(paper));
  }
  if (request.method === 'GET' && path === 'health') {
    return jsonResponse({ ok: true, kbPath: KB_PATH, model: resolveRoute(ctx) });
  }
  return jsonResponse({ error: '未知接口' }, 404);
}

function registerKnowledgeTool(ctx) {
  const text = (value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
  return ctx.tools.register({
    name: 'bohr_knowledge',
    description: 'Search, list, or read papers in the user’s Bohr research knowledge base. Use this when the user refers to papers kept in Bohr Atlas, asks for their saved summaries, or wants to connect a Bohr card to the research conversation. Results are stored papers, not a complete literature database.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['search', 'list', 'get'], description: 'search finds saved papers by topic; list returns recent saved papers; get reads one paper by id.' },
        query: { type: 'string', description: 'Search terms for action=search.' },
        id: { type: 'string', description: 'Exact saved paper id for action=get.' },
        limit: { type: 'integer', description: 'Maximum results, 1–10. Defaults to 5.' },
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, required: ['result'], properties: { result: { type: 'string' } } },
      render: (_args, value) => text(value.result),
    },
    async execute(args) {
      const store = await readKnowledge();
      const limit = Math.max(1, Math.min(10, Number(args.limit) || 5));
      if (args.action === 'get') {
        const paper = store.papers.find((item) => item.id === args.id);
        return { result: JSON.stringify(paper || { error: '没有找到该论文', id: args.id }, null, 2) };
      }
      if (args.action === 'search') {
        return { result: JSON.stringify({ query: args.query || '', papers: searchKnowledge(store, args.query || '', limit), total: store.papers.length }, null, 2) };
      }
      return { result: JSON.stringify({ papers: store.papers.slice(0, limit), total: store.papers.length }, null, 2) };
    },
    presentCall: (args) => ({ card: 'generic', title: args.action === 'search' ? `查找玻尔知识库：${args.query || ''}` : '读取玻尔论文知识库', kind: 'search', rawInput: args }),
  });
}

function registerPaperSearchTool(ctx) {
  const text = (value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
  return ctx.tools.register({
    name: 'bohr_paper_search',
    description: 'Search live scholarly literature across materials, chemistry, physics, AI, and life sciences. Use this when the user asks for recent papers, evidence, DOI metadata, abstracts, or legal open-access PDF links. It queries OpenAlex, Crossref, Europe PMC, and arXiv, supports Chinese and English queries or direct DOIs, and never bypasses paywalls.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'A research topic, material, chemical formula, method, paper title, or DOI to search (Chinese or English).' },
        limit: { type: 'integer', description: 'Maximum results, 1–8. Defaults to 5.' },
        openAccessOnly: { type: 'boolean', description: 'Only return papers with a legal open-access PDF or landing page.' },
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, required: ['result'], properties: { result: { type: 'string' } } },
      render: (_args, value) => text(value.result),
    },
    async execute(args) {
      const query = String(args.query || '').trim();
      if (!query) return { result: '检索关键词不能为空。' };
      const limit = Math.max(1, Math.min(8, Number(args.limit) || 5));
      const found = await searchWithFallback(ctx, query);
      let papers = found.papers;
      if (args.openAccessOnly) papers = papers.filter((paper) => paper.openAccess || paper.pdfUrl);
      papers = papers.slice(0, limit).map((paper) => ({
        id: paper.id,
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        venue: paper.venue,
        citations: paper.citations,
        doi: paper.doi,
        source: paper.source,
        abstract: String(paper.abstract || '').slice(0, 1800),
        openAccess: Boolean(paper.openAccess),
        openPdf: paper.pdfUrl || null,
        originalPage: paper.landingUrl || paper.url,
      }));
      return { result: JSON.stringify({ query, resolvedQuery: found.resolvedQuery || query, source: found.source, warning: found.warning || null, papers }, null, 2) };
    },
    presentCall: (args) => ({ card: 'generic', title: `检索学术文献：${args.query || ''}`, kind: 'search', rawInput: args }),
  });
}

export async function apply(ctx) {
  const store = await readKnowledge();
  if (store.papers.length === 0) {
    await mutateKnowledge((current) => current.papers.length);
  }
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/bohr-api',
    handler: async (req, res) => {
      try {
        const expectedOrigin = new URL(ctx.webServer.getOrigin()).origin;
        if (req.headers.origin && req.headers.origin !== expectedOrigin) throw new Error('请求来源不是当前 DSH 页面');
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 1_000_000) throw new Error('请求内容超过 1 MB 限制');
          chunks.push(chunk);
        }
        const headers = new Headers();
        Object.entries(req.headers).forEach(([key, value]) => {
          if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
          else if (value !== undefined) headers.set(key, value);
        });
        const method = req.method || 'GET';
        const origin = `http://${req.headers.host || ctx.webServer.getOrigin().replace(/^https?:\/\//, '')}`;
        const request = new Request(new URL(req.url || '/', origin), {
          method,
          headers,
          body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
        });
        const response = await handleRequest(ctx, request);
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        if (!res.headersSent) {
          res.statusCode = 400;
          res.setHeader('content-type', 'application/json; charset=utf-8');
        }
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
    },
  }), 'bohr research api');
  ctx.effect(() => registerKnowledgeTool(ctx), 'bohr knowledge tool');
  ctx.effect(() => registerPaperSearchTool(ctx), 'bohr paper search tool');
}
