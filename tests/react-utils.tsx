import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  container: HTMLElement;
  root: Root;
  unmount: () => Promise<void>;
  rerender: (ui: ReactElement) => Promise<void>;
}

/** Minimal render helper (no extra dependency): mounts into document.body inside act(). */
export async function mount(ui: ReactElement): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(ui); });
  return {
    container,
    root,
    rerender: async (next) => { await act(async () => { root.render(next); }); },
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

export async function click(el: Element | null): Promise<void> {
  if (!el) throw new Error('click(): element not found');
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}

export async function typeInto(el: HTMLInputElement | HTMLTextAreaElement | null, value: string): Promise<void> {
  if (!el) throw new Error('typeInto(): element not found');
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export async function key(el: Element | Document, k: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });
}

export async function flush(ms = 0): Promise<void> {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

export const q = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const qa = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel));

/** Polls until `fn` stops throwing (or times out). Runs inside act so React effects settle. */
export async function waitFor<T>(fn: () => T, timeout = 3000, interval = 20): Promise<T> {
  const start = Date.now();
  let lastErr: unknown;
  for (;;) {
    try {
      let result!: T;
      await act(async () => { result = await fn(); });
      return result;
    } catch (err) {
      lastErr = err;
      if (Date.now() - start > timeout) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
      await act(async () => { await new Promise((r) => setTimeout(r, interval)); });
    }
  }
}

export const byText = (sel: string, text: string | RegExp, root: ParentNode = document): HTMLElement | null =>
  Array.from(root.querySelectorAll<HTMLElement>(sel)).find((e) => (typeof text === 'string' ? e.textContent?.trim() === text : text.test(e.textContent ?? ''))) ?? null;
