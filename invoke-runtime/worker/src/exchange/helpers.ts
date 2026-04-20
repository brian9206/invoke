// ============================================================================
// Helpers — Shared utilities for request/response handling
// ============================================================================

import mime from 'mime-types';

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  for (const pair of cookieHeader.split(';')) {
    const trimmed = pair.trim();
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const name = trimmed.substring(0, eqIdx).trim();
    let value = trimmed.substring(eqIdx + 1).trim();

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }

  return cookies;
}

export function normalizeMimeType(type: string | undefined): string {
  if (!type) return '';
  return type.toLowerCase().split(';')[0].trim();
}

export function matchMimeType(contentType: string | undefined, type: string): string | false {
  const normalizedContent = normalizeMimeType(contentType);
  let targetType = (mime.lookup(type) || type) as string;
  targetType = normalizeMimeType(targetType);

  if (!normalizedContent || !targetType) return false;
  if (normalizedContent === targetType) return targetType;

  const [contentMain, contentSub] = normalizedContent.split('/');
  const [targetMain, targetSub] = targetType.split('/');

  if (targetMain === '*' && targetSub === '*') return targetType;
  if (targetMain === contentMain && targetSub === '*') return targetType;
  if (targetMain === '*' && targetSub === contentSub) return targetType;

  return false;
}

export interface AcceptEntry {
  type: string;
  quality: number;
  specificity: number;
}

export function parseAcceptHeader(acceptHeader: string | undefined): AcceptEntry[] {
  if (!acceptHeader) return [];

  const types: AcceptEntry[] = [];

  for (const part of acceptHeader.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^\s*([^;]+)(?:;q=([0-9.]+))?\s*$/);
    if (!match) continue;

    const type = match[1].trim();
    const q = match[2] ? parseFloat(match[2]) : 1.0;
    if (isNaN(q) || q < 0 || q > 1) continue;

    let specificity = 1;
    if (type !== '*/*') {
      const [main, sub] = type.split('/');
      if (main !== '*' && sub !== '*') specificity = 3;
      else if (main !== '*' || sub !== '*') specificity = 2;
    }

    types.push({ type, quality: q, specificity });
  }

  types.sort((a, b) => {
    if (b.quality !== a.quality) return b.quality - a.quality;
    return b.specificity - a.specificity;
  });

  return types;
}
