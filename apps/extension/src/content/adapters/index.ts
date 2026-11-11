import { chatgptAdapter } from './chatgpt';
import { deepseekAdapter } from './deepseek';
import { genericAdapter } from './generic';
import type { PlatformAdapter } from './types';

export * from './types';
export { chatgptAdapter, deepseekAdapter, genericAdapter };

/** Order matters: dedicated adapters first, generic last (always matches). */
export const ADAPTERS: readonly PlatformAdapter[] = [chatgptAdapter, deepseekAdapter, genericAdapter];

export function adapterFor(url: URL): PlatformAdapter {
  return ADAPTERS.find((a) => a.matches(url)) ?? genericAdapter;
}
