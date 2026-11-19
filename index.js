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
    abstract: String(input.abstract || '').slice(0, 12_000),
    summaryEn: String(input.summaryEn || '').slice(0, 3_000),
    summaryZh: String(input.summaryZh || '').slice(0, 3_000),
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
  const withoutFence = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(withoutFence); } catch {}
  const objectStart = withoutFence.indexOf('{'); const arrayStart = withoutFence.indexOf('[');
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  if (!starts.length) throw new Error('模型返回内容不是 JSON');
  const start = Math.min(...starts);
  const end = Math.max(withoutFence.lastIndexOf('}'), withoutFence.lastIndexOf(']'));
  if (end <= start) throw new Error('模型返回的 JSON 不完整');
  return JSON.parse(withoutFence.slice(start, end + 1));
}

function fallbackEnglishSummary(paper) {
  const abstract = String(paper.abstract || '').replace(/\s+/g, ' ').trim();
  if (!abstract) return `The metadata provides only the title: “${paper.title}”. No abstract is available, so this summary must not be treated as a description of methods or results.`;
  return abstract.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 2).join(' ').slice(0, 900);
}

async function translateToChinese(ctx, text, signal) {
  const translator = ctx.get('translator');
  if (!translator || !text.trim()) return '';
  try {
    const providers = await translator.availableProviders(signal);
    const provider = providers.find((item) => item === 'google' || item === 'bing');
    if (!provider) return '';
    const spec = translator.resolve({ text: text.slice(0, 5000), targetLanguage: 'zh-CN', sourceLanguage: 'en', provider });
    return String(await translator.translate(spec, signal)).trim();
  } catch {
    return '';
  }
}

function fallbackChineseSummary(paper) {
  const venue = [paper.venue, paper.year].filter(Boolean).join('，');
  return `《${paper.title}》${venue ? `（${venue}）` : ''}。当前仅有题录信息，尚未取得摘要，因此中文概要只说明论文主题，不能替代对方法、数据和结论的阅读。请回溯原文核验。`;
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
const SEARCH_TTL_MS = 15 * 60 * 1000;

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
  return {
    id: work.id || doi || work.title,
    title: work.title || work.display_name,
    authors: names.length > 3 ? `${names.slice(0, 3).join(', ')} 等` : names.join(', ') || '作者信息未提供',
    year: work.publication_year || null,
    venue: work.primary_location?.source?.display_name || '期刊信息未提供',
    citations: work.cited_by_count || 0,
    doi,
    url: work.open_access?.oa_url || work.doi || work.primary_location?.landing_page_url || work.id,
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
  return {
    id: doi ? `doi:${doi}` : `crossref:${title}`,
    title: stripMarkup(title),
    authors: authors.length > 3 ? `${authors.slice(0, 3).join(', ')} 等` : authors.join(', ') || '作者信息未提供',
    year,
    venue: Array.isArray(item['container-title']) ? item['container-title'][0] || '期刊信息未提供' : item['container-title'] || '期刊信息未提供',
    citations: Number(item['is-referenced-by-count']) || 0,
    doi,
    url: doi ? `https://doi.org/${doi}` : item.URL || 'https://www.crossref.org/',
    abstract: stripMarkup(item.abstract || ''),
    openAccess: false,
    source: 'Crossref',
  };
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
  const params = new URLSearchParams({
    search: query,
    'per-page': '8',
    select: 'id,doi,title,display_name,publication_year,cited_by_count,authorships,primary_location,open_access,abstract_inverted_index',
  });
  const apiKey = process.env.OPENALEX_API_KEY;
  if (apiKey) params.set('api_key', apiKey);
  const payload = await fetchJsonWithTimeout(`https://api.openalex.org/works?${params.toString()}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'BohrResearchAtlas/4.5 (DSH plugin)' },
  });
  return (payload.results || []).map(normalizeOpenAlex).filter(Boolean);
}

async function searchCrossref(query) {
  const doi = query.match(/^10\.\d{4,9}\/\S+$/)?.[0];
  const headers = { Accept: 'application/json', 'User-Agent': 'BohrResearchAtlas/4.5 (mailto:research@example.invalid)' };
  if (doi) {
    const payload = await fetchJsonWithTimeout(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers });
    const paper = normalizeCrossref(payload.message || {});
    return paper ? [paper] : [];
  }
  const params = new URLSearchParams({
    'query.bibliographic': query,
    rows: '8',
    filter: 'type:journal-article',
    select: 'DOI,title,author,issued,published-print,published-online,container-title,abstract,is-referenced-by-count,URL,type',
  });
  const payload = await fetchJsonWithTimeout(`https://api.crossref.org/works?${params.toString()}`, { headers });
  return (payload.message?.items || []).map(normalizeCrossref).filter(Boolean);
}

async function searchWithFallback(query) {
  const key = query.trim().toLowerCase();
  const now = Date.now();
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > now) return { papers: cached.papers, source: `${cached.source} cache`, cached: true };
  let warning = '';
  try {
    const papers = await searchOpenAlex(query);
    if (papers.length) {
      searchCache.set(key, { papers, source: 'OpenAlex', expiresAt: now + SEARCH_TTL_MS });
      return { papers, source: 'OpenAlex', cached: false };
    }
    warning = 'OpenAlex 未返回结果，已尝试 Crossref。';
  } catch (error) {
    warning = error?.status === 429 || error?.status === 403
      ? 'OpenAlex 当前额度受限，已切换到 Crossref。'
      : `OpenAlex 暂时不可用（${error instanceof Error ? error.message : String(error)}），已切换到 Crossref。`;
  }
  try {
    const papers = await searchCrossref(query);
    if (papers.length) {
      searchCache.set(key, { papers, source: 'Crossref', expiresAt: now + SEARCH_TTL_MS });
      return { papers, source: 'Crossref', cached: false, warning };
    }
  } catch (error) {
    warning += ` Crossref 请求失败：${error instanceof Error ? error.message : String(error)}。`;
  }
  if (cached) return { papers: cached.papers, source: `${cached.source} stale cache`, cached: true, warning };
  throw new Error(`${warning || '论文检索暂时不可用。'} 请稍后重试，或在 Host 环境设置 OPENALEX_API_KEY 获得独立额度。`);
}

async function handleRequest(ctx, request, peer) {
  if (peer && peer.principal?.kind !== 'owner') return jsonResponse({ error: '仅允许本机所有者访问' }, 403);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/bohr-api\/?/, '').replace(/\/$/, '');
  if (request.method === 'GET' && path === 'search') {
    const query = String(url.searchParams.get('q') || '').trim();
    if (!query) throw new Error('检索关键词不能为空');
    if (query.length > 300) throw new Error('检索关键词过长');
    return jsonResponse(await searchWithFallback(query));
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
        system: '你是材料科学文献助理。只能依据用户提供的题目和摘要生成概括，不得补充摘要中没有的事实。每条英文 1–2 句、中文 1–2 句，中文要自然准确并与英文对应。输出严格 JSON，不要 Markdown。',
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
    const raw = await complete(ctx, {
      system: '你是严谨的材料科学论文阅读教练。只依据论文题目和摘要绘制结构化思维导图，不得虚构实验细节。输出严格 JSON，不要 Markdown 代码围栏。',
      prompt: `为论文生成可追问的思维导图。每个节点都要能单独被选中提问。若摘要缺少某个部分，写“摘要未提供，需要读原文”。\n论文：\n${JSON.stringify({ title: paper.title, authors: paper.authors, year: paper.year, venue: paper.venue, abstract: paper.abstract })}\n输出格式：{"title":"论文短标题","summary":"一句话中文总览","nodes":[{"id":"root","parentId":null,"label":"核心问题","zh":"中文说明","question":"可继续追问的问题"},{"id":"method","parentId":"root","label":"方法与材料","zh":"...","question":"..."}],"edges":[["root","method"]]}。节点类型建议覆盖研究问题、材料与合成、表征、关键结果、证据边界和下一步验证。`,
      maxTokens: 1500,
      signal: request.signal,
    });
    const parsed = parseJson(raw);
    if (!parsed || !Array.isArray(parsed.nodes)) throw new Error('模型未返回有效思维导图节点');
    return jsonResponse(parsed);
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
}
