import type { SourceType } from '@ukw/domain';

export interface PageIdentity {
  url: string;
  title?: string;
  platform?: string;
  externalId?: string;
  sourceType: SourceType;
  favicon?: string;
}

/**
 * Platform adapters isolate every site-specific assumption (NFR-MAINT-001). The generic engine works
 * on any DOM; adapters only add stable identity, exclusion of app chrome, and message-scoped anchoring.
 * Selectors for third-party sites WILL drift; each adapter must degrade to the generic behaviour.
 */
export interface PlatformAdapter {
  readonly id: string;
  matches(url: URL): boolean;
  identify(url: URL, doc: Document): PageIdentity;
  /** Element whose text can be annotated. */
  root(doc: Document): Element;
  /** True for elements that must never be part of annotatable text (inputs, toolbars, nav). */
  skip(el: Element): boolean;
  /** The conversation message (or similar unit) containing `node`, for message-scoped anchors. */
  messageOf(node: Node): { id: string; el: Element } | null;
  findMessage(doc: Document, id: string): Element | null;
}

export function faviconOf(doc: Document): string | undefined {
  const link = doc.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  const href = link?.href;
  return href && /^https?:/i.test(href) ? href : undefined;
}

export function cssEscape(s: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&');
}
