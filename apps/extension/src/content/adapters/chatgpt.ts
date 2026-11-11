import { cssEscape, faviconOf, type PageIdentity, type PlatformAdapter } from './types';

/**
 * ChatGPT. UNVERIFIED against the live site in this build (no browser available when written):
 * relies on `data-message-id` on message containers and `/c/<uuid>` thread URLs, both commonly observed.
 * If these change the adapter degrades to whole-page anchoring; identity falls back to the URL.
 */
const HOSTS = new Set(['chatgpt.com', 'www.chatgpt.com', 'chat.openai.com']);
const THREAD = /(?:^|\/)c\/([0-9a-f]{8}-[0-9a-f-]{20,})/i;
const SHARE = /^\/share\/([0-9a-f-]{8,})/i;

export const chatgptAdapter: PlatformAdapter = {
  id: 'chatgpt',
  matches: (url) => HOSTS.has(url.hostname),
  identify(url, doc): PageIdentity {
    const thread = THREAD.exec(url.pathname)?.[1];
    const share = SHARE.exec(url.pathname)?.[1];
    const externalId = thread ?? (share ? `share:${share}` : undefined);
    const title = doc.title?.trim();
    return {
      url: url.href,
      title: title && title.toLowerCase() !== 'chatgpt' ? title : undefined,
      platform: 'chatgpt',
      externalId,
      sourceType: externalId ? 'conversation' : 'web',
      favicon: faviconOf(doc),
    };
  },
  root: (doc) => doc.querySelector('main') ?? doc.body,
  skip: (el) => {
    const tag = el.tagName;
    return tag === 'FORM' || tag === 'BUTTON' || tag === 'NAV' || tag === 'ASIDE' || tag === 'TEXTAREA' || el.id === 'prompt-textarea' || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox';
  },
  messageOf(node) {
    const el = (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest('[data-message-id]');
    const id = el?.getAttribute('data-message-id');
    return el && id ? { id, el } : null;
  },
  findMessage: (doc, id) => doc.querySelector(`[data-message-id="${cssEscape(id)}"]`),
};
