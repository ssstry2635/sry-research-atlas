import type { Paper } from '../types';

type OpenAlexAuthor = { author?: { display_name?: string } };
type OpenAlexWork = {
  id: string;
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  cited_by_count?: number;
  authorships?: OpenAlexAuthor[];
  primary_location?: { source?: { display_name?: string }; landing_page_url?: string };
  open_access?: { is_oa?: boolean; oa_url?: string };
  best_oa_location?: { pdf_url?: string };
  abstract_inverted_index?: Record<string, number[]>;
};

const endpoint = 'https://api.openalex.org/works';

function abstractFromIndex(index?: Record<string, number[]>): string | undefined {
  if (!index) return undefined;
  const words: Array<[number, string]> = [];
  Object.entries(index).forEach(([word, positions]) => {
    positions.forEach((position) => words.push([position, word]));
  });
  return words.sort((a, b) => a[0] - b[0]).map(([, word]) => word).join(' ') || undefined;
}

function normalize(work: OpenAlexWork, query: string): Paper | null {
  const title = work.title || work.display_name;
  if (!title) return null;
  const names = (work.authorships || []).map((item) => item.author?.display_name).filter(Boolean) as string[];
  const authors = names.length > 3 ? `${names.slice(0, 3).join(', ')} 等` : names.join(', ') || '作者信息未提供';
  const doi = work.doi?.replace(/^https?:\/\/doi\.org\//i, '');
  const oaUrl = work.open_access?.oa_url;
  const pdfUrl = work.best_oa_location?.pdf_url || (/\.pdf(?:$|\?)/i.test(oaUrl || '') ? oaUrl : undefined);
  const landingUrl = work.primary_location?.landing_page_url || work.doi || work.id;
  return {
    id: work.id,
    title,
    authors,
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
    query,
  };
}

type CrossrefItem = {
  DOI?: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string }>;
  issued?: { 'date-parts'?: Array<Array<number | null>> };
  'published-print'?: { 'date-parts'?: Array<Array<number | null>> };
  'published-online'?: { 'date-parts'?: Array<Array<number | null>> };
  'container-title'?: string[];
  abstract?: string;
  'is-referenced-by-count'?: number;
  URL?: string;
  link?: Array<{ URL?: string; 'content-type'?: string }>;
  license?: Array<{ URL?: string }>;
  resource?: { primary?: { URL?: string } };
};

function crossrefYear(item: CrossrefItem) {
  const parts = item.issued?.['date-parts']?.[0] || item['published-print']?.['date-parts']?.[0] || item['published-online']?.['date-parts']?.[0];
  const year = Number(parts?.[0]);
  return Number.isInteger(year) ? year : null;
}

function normalizeCrossref(item: CrossrefItem, query: string): Paper | null {
  const title = item.title?.[0];
  const doi = item.DOI;
  if (!title || doi?.endsWith('.s001')) return null;
  const names = (item.author || []).map((author) => [author.given, author.family].filter(Boolean).join(' ')).filter(Boolean);
  const openLicense = (item.license || []).some((license) => String(license?.URL || '').includes('creativecommons.org'));
  const pdfLink = (item.link || []).find((link) => String(link?.['content-type'] || '').includes('pdf'))?.URL;
  const landingUrl = item.resource?.primary?.URL || (doi ? `https://doi.org/${doi}` : item.URL || 'https://www.crossref.org/');
  return {
    id: doi ? `doi:${doi}` : `crossref:${title}`,
    title: title.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    authors: names.length > 3 ? `${names.slice(0, 3).join(', ')} 等` : names.join(', ') || '作者信息未提供',
    year: crossrefYear(item),
    venue: item['container-title']?.[0] || '期刊信息未提供',
    citations: Number(item['is-referenced-by-count']) || 0,
    doi,
    url: openLicense && pdfLink ? pdfLink : landingUrl,
    landingUrl,
    pdfUrl: openLicense && pdfLink ? pdfLink : undefined,
    abstract: (item.abstract || '').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() || undefined,
    openAccess: openLicense,
    source: 'Crossref',
    query,
  };
}

async function searchHost(query: string, signal?: AbortSignal): Promise<Paper[]> {
  const response = await fetch(`/bohr-api/search?q=${encodeURIComponent(query)}`, { signal, headers: { Accept: 'application/json' } });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new Error('Host 检索接口不可用');
  const payload = await response.json() as { papers?: Paper[]; error?: string };
  if (!response.ok) throw new Error(payload.error || `Host 检索返回 ${response.status}`);
  if (!Array.isArray(payload.papers) || !payload.papers.length) throw new Error('Host 未返回论文');
  return payload.papers;
}

async function searchOpenAlexDirect(query: string, signal?: AbortSignal): Promise<Paper[]> {
  const params = new URLSearchParams({
    search: query.trim(),
    'per-page': '8',
    select: 'id,doi,title,display_name,publication_year,cited_by_count,authorships,primary_location,open_access,best_oa_location,abstract_inverted_index',
  });
  const response = await fetch(`${endpoint}?${params.toString()}`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`OpenAlex 返回 ${response.status}`);
  const payload = await response.json() as { results?: OpenAlexWork[] };
  return (payload.results || []).map((work) => normalize(work, query)).filter((paper): paper is Paper => Boolean(paper));
}

async function searchCrossrefDirect(query: string, signal?: AbortSignal): Promise<Paper[]> {
  const params = new URLSearchParams({
    'query.bibliographic': query,
    rows: '8',
    filter: 'type:journal-article',
    select: 'DOI,title,author,issued,published-print,published-online,container-title,abstract,is-referenced-by-count,URL,type,link,license,resource',
  });
  const response = await fetch(`https://api.crossref.org/works?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Crossref 返回 ${response.status}`);
  const payload = await response.json() as { message?: { items?: CrossrefItem[] } };
  return (payload.message?.items || []).map((item) => normalizeCrossref(item, query)).filter((paper): paper is Paper => Boolean(paper));
}

export async function searchPapers(query: string, signal?: AbortSignal): Promise<Paper[]> {
  try {
    return await searchHost(query, signal);
  } catch (hostError) {
    try {
      return await searchOpenAlexDirect(query, signal);
    } catch (openAlexError) {
      try {
        return await searchCrossrefDirect(query, signal);
      } catch (crossrefError) {
        throw new Error(`论文检索暂时不可用。OpenAlex：${openAlexError instanceof Error ? openAlexError.message : String(openAlexError)}；Crossref：${crossrefError instanceof Error ? crossrefError.message : String(crossrefError)}；Host：${hostError instanceof Error ? hostError.message : String(hostError)}`);
      }
    }
  }
}

export function paperToNodePosition(index: number, centerX = 440, centerY = 310) {
  const angle = (-Math.PI / 2) + index * (Math.PI * 2 / 8);
  const radiusX = index % 2 === 0 ? 320 : 265;
  const radiusY = index % 2 === 0 ? 230 : 195;
  return { x: centerX + Math.cos(angle) * radiusX, y: centerY + Math.sin(angle) * radiusY };
}
