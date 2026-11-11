import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  SCHEMA_VERSION,
  formatBibliography,
  formatCitation,
  hexToRgba,
  isSafeLink,
  isUuid,
  newId,
  normalizeUrl,
  parseMessage,
  validateBackup,
  type ReferenceRecord,
} from './index';

describe('ids', () => {
  it('generates unique uuids', () => {
    const a = newId();
    const b = newId();
    expect(isUuid(a)).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('normalizeUrl', () => {
  it('lowercases host, drops default port, trailing slash and tracking params', () => {
    const r = normalizeUrl('HTTPS://Example.COM:443/Path/?utm_source=x&b=2&a=1&fbclid=zzz#section');
    expect(r?.normalized).toBe('https://example.com/Path?a=1&b=2');
    expect(r?.hostname).toBe('example.com');
  });
  it('keeps non-tracking params that identify a conversation or document', () => {
    expect(normalizeUrl('https://chatgpt.com/c/abc-123?model=gpt')?.normalized).toBe('https://chatgpt.com/c/abc-123?model=gpt');
    expect(normalizeUrl('https://site.org/doc?id=77&utm_medium=mail')?.normalized).toBe('https://site.org/doc?id=77');
  });
  it('keeps client-side route fragments only', () => {
    expect(normalizeUrl('https://app.example.com/#/board/3')?.normalized).toBe('https://app.example.com/#/board/3');
    expect(normalizeUrl('https://example.com/a#heading')?.normalized).toBe('https://example.com/a');
  });
  it('rejects unsupported schemes', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('chrome://extensions')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
  });
  it('only allows http(s) links to open', () => {
    expect(isSafeLink('https://a.b')).toBe(true);
    expect(isSafeLink('javascript:alert(1)')).toBe(false);
    expect(isSafeLink('data:text/html,hi')).toBe(false);
  });
});

describe('palette', () => {
  it('converts hex to rgba and falls back on invalid input', () => {
    expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    expect(hexToRgba('#f00', 1)).toBe('rgba(255, 0, 0, 1)');
    expect(hexToRgba('nope', 1)).toMatch(/^rgba\(/);
  });
});

describe('extension messages', () => {
  const ok = { id: 'm1', type: 'ANNOTATION_DELETE', version: 1, payload: { id: 'a1' }, sentAt: 'x' };
  it('accepts a valid message', () => {
    const r = parseMessage(ok);
    expect(r.ok).toBe(true);
  });
  it('rejects unknown types, bad versions and bad payloads', () => {
    expect(parseMessage({ ...ok, type: 'EVIL' }).ok).toBe(false);
    expect(parseMessage({ ...ok, version: 2 }).ok).toBe(false);
    expect(parseMessage({ ...ok, payload: {} }).ok).toBe(false);
    expect(parseMessage(null).ok).toBe(false);
    expect(parseMessage({ ...ok, id: '' }).ok).toBe(false);
  });
  it('rejects annotation payloads with invalid colours', () => {
    const bad = {
      id: 'm2',
      type: 'ANNOTATION_CREATE',
      version: 1,
      payload: { page: { url: 'https://a.b' }, type: 'highlight', colour: 'red; background:url(x)', anchor: { exact: 'hi' } },
    };
    expect(parseMessage(bad).ok).toBe(false);
  });
});

describe('privacy: lookups never create', () => {
  it('has a read-only DOCUMENT_LOOKUP and no message that records a visit', () => {
    const ok = parseMessage({ id: '1', type: 'DOCUMENT_LOOKUP', version: 1, payload: { url: 'https://a.b/x' } });
    expect(ok.ok).toBe(true);
    expect(parseMessage({ id: '1', type: 'DOCUMENT_IDENTIFY', version: 1, payload: { url: 'https://a.b' } }).ok).toBe(false);
  });
  it('annotation creation carries the page identity and validates it', () => {
    const msg = { id: '2', type: 'ANNOTATION_CREATE', version: 1, payload: { page: { url: 'https://a.b/x', title: 'T' }, type: 'highlight', colour: '#F6D86B', anchor: { exact: 'quote' } } };
    expect(parseMessage(msg).ok).toBe(true);
    expect(parseMessage({ ...msg, payload: { ...msg.payload, page: {} } }).ok).toBe(false);
  });
  it('recognises content commands', async () => {
    const { isContentCommand } = await import('./index');
    expect(isContentCommand({ ukw: 'command', command: 'toggle-sidebar' })).toBe(true);
    expect(isContentCommand({ ukw: 'command', command: 'rm -rf' })).toBe(false);
    expect(isContentCommand('toggle-sidebar')).toBe(false);
  });
});

describe('backup validation', () => {
  const now = new Date().toISOString();
  const doc = { id: 'd1', createdAt: now, updatedAt: now, schemaVersion: 1, canonicalUrl: 'https://a.b', normalizedUrl: 'https://a.b/', sourceType: 'web' };
  const base = { format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, appVersion: '0.1.0', exportedAt: now };

  it('accepts a valid backup and preserves unknown fields', () => {
    const r = validateBackup({ ...base, tables: { documents: [{ ...doc, futureField: 42 }] } });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.backup.tables.documents![0] as Record<string, unknown>).futureField).toBe(42);
  });
  it('rejects wrong format, newer schema, malformed rows and duplicates', () => {
    expect(validateBackup({ ...base, format: 'x', tables: {} }).ok).toBe(false);
    expect(validateBackup({ ...base, schemaVersion: 99, tables: {} }).ok).toBe(false);
    expect(validateBackup({ ...base, tables: { documents: [{ id: 'x' }] } }).ok).toBe(false);
    expect(validateBackup({ ...base, tables: { documents: [doc, doc] } }).ok).toBe(false);
  });
  it('rejects prototype pollution keys', () => {
    const polluted = JSON.parse('{"format":"ukw-backup","schemaVersion":1,"tables":{"documents":[]},"__proto__":{"x":1}}');
    expect(validateBackup(polluted).ok).toBe(false);
  });
  it('reports unknown tables without failing', () => {
    const r = validateBackup({ ...base, tables: { documents: [doc], futureTable: [] } });
    expect(r.ok && r.unknownTables).toEqual(['futureTable']);
  });
});

describe('citations', () => {
  const ref = {
    id: 'r', createdAt: '', updatedAt: '', schemaVersion: 1, rev: 1,
    entryType: 'article', title: 'Attention patterns in reading', authors: [{ family: 'Rahman', given: 'Sara Jane' }, { family: 'Lee', given: 'Min' }],
    year: 2021, journal: 'Journal of Reading Science', volume: '12', issue: '3', pages: '45-67', doi: '10.1000/xyz123', keywords: [], readingStatus: 'unread',
  } as ReferenceRecord;

  it('formats APA', () => {
    const s = formatCitation(ref, 'apa');
    expect(s).toBe('Rahman, S. J., & Lee, M. (2021). Attention patterns in reading. Journal of Reading Science, 12(3), 45-67. https://doi.org/10.1000/xyz123');
  });
  it('formats APA with markdown italics', () => {
    expect(formatCitation(ref, 'apa', { markdown: true })).toContain('*Journal of Reading Science*, *12*(3)');
  });
  it('formats IEEE with number and Harvard with year after authors', () => {
    expect(formatCitation(ref, 'ieee', { index: 4 })).toMatch(/^\[4\] S\. J\. Rahman and M\. Lee, "Attention patterns in reading,"/);
    expect(formatCitation(ref, 'harvard')).toMatch(/^Rahman, S\. J\. and Lee, M\. \(2021\)/);
  });
  it('formats MLA and Chicago without throwing and includes the title', () => {
    expect(formatCitation(ref, 'mla')).toContain('Attention patterns in reading');
    expect(formatCitation(ref, 'chicago')).toContain('Attention patterns in reading');
  });
  it('sorts non-IEEE bibliographies by author and numbers IEEE', () => {
    const other = { ...ref, id: 'o', authors: [{ family: 'Adams', given: 'Zed' }], title: 'Other' } as ReferenceRecord;
    expect(formatBibliography([ref, other], 'apa')[0]).toMatch(/^Adams/);
    expect(formatBibliography([ref, other], 'ieee')[1]).toMatch(/^\[2\]/);
  });
  it('handles a book without authors', () => {
    const book = { ...ref, entryType: 'book', authors: [], journal: undefined, publisher: 'Press', doi: undefined } as ReferenceRecord;
    expect(formatCitation(book, 'apa')).toBe('Attention patterns in reading. (2021). Press.');
  });
});

import { annotationsToMarkdown, type AnnotationRecord, type NoteRecord } from './index';

describe('annotationsToMarkdown', () => {
  const base = { createdAt: '', updatedAt: '', schemaVersion: 1, rev: 1 };
  const ann = (id: string, exact: string, extra: Partial<AnnotationRecord> = {}): AnnotationRecord => ({ ...base, id, documentId: 'd', type: 'highlight', colour: '#8FB8FF', anchor: { exact }, status: 'active', isFavorite: false, ...extra });
  const note = (id: string, body: string, extra: Partial<NoteRecord> = {}): NoteRecord => ({ ...base, id, body, format: 'markdown', pinned: false, isFavorite: false, isArchived: false, ...extra });

  it('exports title, source, highlights as blockquotes with colour label and notes', () => {
    const md = annotationsToMarkdown({
      title: 'My   Article', url: 'https://a.b/x', tags: ['memory', 'reading'],
      annotations: [ann('1', 'Attention drifts.\nSecond line.'), ann('2', 'Lost one', { status: 'orphaned' }), ann('3', 'gone', { deletedAt: 'x' })],
      notesByAnnotation: new Map([['1', [note('n1', 'Compare with Smith')]]]),
      documentNotes: [note('n2', 'Overall thoughts', { title: 'Summary' })],
      exportedAt: '2026-11-03T10:00:00Z',
    });
    expect(md).toContain('# My Article');
    expect(md).toContain('Source: https://a.b/x');
    expect(md).toContain('Tags: memory, reading');
    expect(md).toContain('> Attention drifts.\n> Second line.');
    expect(md).toContain('*Concept*');
    expect(md).toContain('Compare with Smith');
    expect(md).toContain('location lost');
    expect(md).not.toContain('gone');
    expect(md).toContain('### Summary');
    expect(md).toContain('Exported: 2026-11-03');
  });
  it('handles empty sources', () => {
    expect(annotationsToMarkdown({ annotations: [] })).toBe('# Untitled source\n');
  });
});
