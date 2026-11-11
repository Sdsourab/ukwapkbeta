import { createRoot } from 'react-dom/client';
import { uiCss } from '@ukw/ui';
import { UI_ATTRIBUTE } from '@ukw/anchor-engine';
import type { PageController } from '../controller';
import { ContentApp } from './ContentApp';
import { contentCss } from './contentCss';

export interface MountedUi {
  host: HTMLElement;
  shadow: ShadowRoot;
  unmount: () => void;
}

/**
 * Mounts the extension UI inside a shadow root on <html>. Styles go in a constructable stylesheet (exempt
 * from the page's Content-Security-Policy); the host is excluded from the annotatable text via data-ukw-ui.
 */
export function mountUi(controller: PageController, opts: { doc?: Document; mode?: 'open' | 'closed' } = {}): MountedUi {
  const doc = opts.doc ?? document;
  const host = doc.createElement('div');
  host.setAttribute(UI_ATTRIBUTE, '');
  host.style.cssText = 'all:initial;position:fixed;inset:0;width:0;height:0;pointer-events:none;z-index:2147483646;';
  const shadow = host.attachShadow({ mode: opts.mode ?? 'closed' });
  const css = `${uiCss()}\n${contentCss}`;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    const style = doc.createElement('style');
    style.textContent = css;
    shadow.appendChild(style);
  }
  const container = doc.createElement('div');
  container.style.cssText = 'display:contents';
  shadow.appendChild(container);
  doc.documentElement.appendChild(host);
  const root = createRoot(container);
  root.render(<ContentApp controller={controller} />);
  return { host, shadow, unmount: () => { root.unmount(); host.remove(); } };
}
