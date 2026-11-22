import type { Paper } from '../types';

export function paperPdfHref(paper: Paper) {
  if (!paper.pdfUrl) return undefined;
  const isDshPlugin = typeof window !== 'undefined' && Boolean((window as Window & { __ModuleLoader__?: unknown }).__ModuleLoader__);
  return isDshPlugin ? `/bohr-api/pdf?id=${encodeURIComponent(paper.id)}` : paper.pdfUrl;
}

export function paperOriginalHref(paper: Paper) {
  return paper.landingUrl || paper.url;
}
