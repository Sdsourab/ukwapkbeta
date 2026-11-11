import { cssEscape, faviconOf, type PageIdentity, type PlatformAdapter } from './types';

/**
 * DeepSeek chat. UNVERIFIED against the live site: provides thread identity from `/a/chat/s/<id>` and
 * excludes inputs/buttons. Message-scoped anchoring is intentionally NOT attempted because no stable
 * message attribute has been confirmed; anchors use whole-page context instead.
 */
const THREAD = /\/a\/chat\/s\/([0-9a-f-]{8,})/i;

export const deepseekAdapter: PlatformAdapter = {
  id: 'deepseek',
  matches: (url) => url.hostname === 'chat.deepseek.com',
  identify(url, doc): PageIdentity {
    const externalId = THREAD.exec(url.pathname)?.[1];
    const title = doc.title?.trim();
    return {
      url: url.href,
      title: title && title.toLowerCase() !== 'deepseek' ? title : undefined,
      platform: 'deepseek',
      externalId,
      sourceType: externalId ? 'conversation' : 'web',
      favicon: faviconOf(doc),
    };
  },
  root: (doc) => doc.querySelector('main') ?? doc.body,
  skip: (el) => el.tagName === 'BUTTON' || el.tagName === 'TEXTAREA' || el.tagName === 'NAV' || el.tagName === 'ASIDE' || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox',
  messageOf: () => null,
  findMessage: (doc, id) => doc.querySelector(`[data-ukw-message="${cssEscape(id)}"]`),
};
