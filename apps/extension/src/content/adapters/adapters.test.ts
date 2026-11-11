// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { buildTextMap } from '@ukw/anchor-engine';
import { adapterFor, chatgptAdapter, deepseekAdapter, genericAdapter } from './index';

afterEach(() => { document.body.innerHTML = ''; document.title = ''; });

const CHAT = `<nav>History: Old chat title</nav>
<main>
  <div data-message-id="msg-1" data-message-author-role="user"><p>What is attention?</p></div>
  <div data-message-id="msg-2" data-message-author-role="assistant"><p>Attention is a limited resource.</p><button>Copy</button><p>It drifts over time.</p></div>
  <form><textarea id="prompt-textarea">draft message</textarea><button>Send</button></form>
</main>`;

describe('adapter selection', () => {
  it('picks dedicated adapters by host and falls back to generic', () => {
    expect(adapterFor(new URL('https://chatgpt.com/c/1')).id).toBe('chatgpt');
    expect(adapterFor(new URL('https://chat.openai.com/')).id).toBe('chatgpt');
    expect(adapterFor(new URL('https://chat.deepseek.com/a/chat/s/x')).id).toBe('deepseek');
    expect(adapterFor(new URL('https://en.wikipedia.org/wiki/Attention')).id).toBe('generic');
  });
});

describe('ChatGPT adapter', () => {
  const id = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  it('extracts thread identity from the URL (plain, project and share links)', () => {
    document.title = 'Attention research';
    const a = chatgptAdapter.identify(new URL(`https://chatgpt.com/c/${id}`), document);
    expect(a).toMatchObject({ platform: 'chatgpt', externalId: id, sourceType: 'conversation', title: 'Attention research' });
    expect(chatgptAdapter.identify(new URL(`https://chatgpt.com/g/g-abc123/c/${id}`), document).externalId).toBe(id);
    expect(chatgptAdapter.identify(new URL('https://chatgpt.com/share/abcd1234-ef56-7890'), document).externalId).toBe('share:abcd1234-ef56-7890');
    document.title = 'ChatGPT';
    const home = chatgptAdapter.identify(new URL('https://chatgpt.com/'), document);
    expect(home.sourceType).toBe('web');
    expect(home.title).toBeUndefined();
  });
  it('excludes composer, buttons and navigation from annotatable text', () => {
    document.body.innerHTML = CHAT;
    const map = buildTextMap(chatgptAdapter.root(document), { skip: chatgptAdapter.skip });
    expect(map.text).toContain('Attention is a limited resource.');
    expect(map.text).not.toContain('draft message');
    expect(map.text).not.toContain('Copy');
    expect(map.text).not.toContain('Send');
    expect(map.text).not.toContain('History');
  });
  it('finds the message containing a node and locates it again by id', () => {
    document.body.innerHTML = CHAT;
    const textNode = document.querySelectorAll('[data-message-id="msg-2"] p')[1]!.firstChild!;
    const msg = chatgptAdapter.messageOf(textNode)!;
    expect(msg.id).toBe('msg-2');
    expect(chatgptAdapter.findMessage(document, 'msg-2')).toBe(msg.el);
    expect(chatgptAdapter.findMessage(document, 'nope')).toBeNull();
    expect(chatgptAdapter.messageOf(document.querySelector('nav')!.firstChild!)).toBeNull();
  });
  it('does not throw on message ids with quote characters', () => {
    expect(() => chatgptAdapter.findMessage(document, 'a"]b')).not.toThrow();
  });
});

describe('DeepSeek adapter', () => {
  it('extracts thread identity and never claims message scoping', () => {
    const id = '0f1e2d3c-4b5a-4968-8776-655443322110';
    const r = deepseekAdapter.identify(new URL(`https://chat.deepseek.com/a/chat/s/${id}`), document);
    expect(r).toMatchObject({ platform: 'deepseek', externalId: id, sourceType: 'conversation' });
    document.body.innerHTML = CHAT;
    expect(deepseekAdapter.messageOf(document.querySelector('[data-message-id]')!)).toBeNull();
  });
});

describe('generic adapter', () => {
  it('identifies plain pages and excludes the user\'s typing areas', () => {
    document.title = ' My page ';
    expect(genericAdapter.identify(new URL('https://example.com/a?b=1'), document)).toMatchObject({ url: 'https://example.com/a?b=1', title: 'My page', sourceType: 'web' });
    document.body.innerHTML = '<p>Article text</p><div contenteditable="true">my draft</div><div role="textbox">other draft</div>';
    const map = buildTextMap(genericAdapter.root(document), { skip: genericAdapter.skip });
    expect(map.text).toBe('Article text');
  });
});
