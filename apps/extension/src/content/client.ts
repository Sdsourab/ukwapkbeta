/// <reference types="chrome" />
import { UkwError, makeMessage, newId, type ErrorCode, type ExtensionResponse, type MessagePayload, type MessageType } from '@ukw/domain';

export interface Client {
  request<T extends MessageType>(type: T, payload: MessagePayload<T>): Promise<any>;
}

const TRANSIENT = /receiving end does not exist|could not establish connection|message port closed/i;

/**
 * Sends a validated envelope to the background worker. The worker may be asleep (MV3), so transient
 * connection errors are retried briefly. After an extension update the old content script loses its
 * context; that is reported as a recoverable error asking for a page reload.
 */
export function createChromeClient(): Client {
  return {
    async request(type, payload) {
      const message = makeMessage(newId(), type, payload);
      let lastErr: unknown;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = (await chrome.runtime.sendMessage(message)) as ExtensionResponse | undefined;
          if (!res) throw new Error('Could not establish connection. Receiving end does not exist.');
          if (!res.ok) throw new UkwError((res.error?.code ?? 'INTERNAL_ERROR') as ErrorCode, res.error?.message ?? 'Request failed', { recoverable: res.error?.recoverable ?? true });
          return res.data;
        } catch (err) {
          if (err instanceof UkwError) throw err;
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          if (/context invalidated/i.test(msg)) throw new UkwError('OFFLINE', 'The extension was updated. Reload this page to keep annotating.', { recoverable: true });
          if (!TRANSIENT.test(msg)) break;
          await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
        }
      }
      throw new UkwError('OFFLINE', lastErr instanceof Error ? lastErr.message : 'Could not reach the extension.', { recoverable: true });
    },
  };
}

/** Test/dev helper: talk to a handler in the same process instead of chrome.runtime. */
export function createInProcessClient(handle: (raw: unknown) => Promise<ExtensionResponse>): Client {
  return {
    async request(type, payload) {
      const res = await handle(makeMessage(newId(), type, payload));
      if (!res.ok) throw new UkwError((res.error?.code ?? 'INTERNAL_ERROR') as ErrorCode, res.error?.message ?? 'Request failed');
      return res.data;
    },
  };
}
