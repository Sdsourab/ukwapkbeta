import { cssEscape, faviconOf, type PageIdentity, type PlatformAdapter } from './types';

export const genericAdapter: PlatformAdapter = {
  id: 'generic',
  matches: () => true,
  identify(url, doc): PageIdentity {
    return { url: url.href, title: doc.title?.trim() || undefined, sourceType: 'web', favicon: faviconOf(doc) };
  },
  root: (doc) => doc.body ?? doc.documentElement,
  // The user's own typing areas are not content.
  skip: (el) => el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox',
  messageOf: () => null,
  findMessage: (doc, id) => doc.querySelector(`[data-ukw-message="${cssEscape(id)}"]`),
};
