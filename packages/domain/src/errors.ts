/** Typed error codes from docs/08 §8.6 (plus a few local-only codes). */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'OFFLINE'
  | 'QUOTA_EXCEEDED'
  | 'ANCHOR_NOT_FOUND'
  | 'UNSUPPORTED_PAGE'
  | 'INTERNAL_ERROR';

export const ERROR_USER_ACTION: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Correct the input and try again.',
  NOT_FOUND: 'Refresh, or return to the library.',
  UNAUTHORIZED: 'Sign in again.',
  FORBIDDEN: 'Check that you are signed in to the right account.',
  CONFLICT: 'Review the conflict copy and choose which version to keep.',
  OFFLINE: 'Keep working. Changes are saved on this device and will sync later.',
  QUOTA_EXCEEDED: 'Export a backup and review your cloud storage usage.',
  ANCHOR_NOT_FOUND: 'Reattach the annotation to the passage manually.',
  UNSUPPORTED_PAGE: 'Use quick capture to save this page.',
  INTERNAL_ERROR: 'Retry. If it keeps happening, export a backup and report the diagnostics.',
};

export class UkwError extends Error {
  readonly code: ErrorCode;
  readonly recoverable: boolean;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, opts: { recoverable?: boolean; details?: unknown; cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'UkwError';
    this.code = code;
    this.recoverable = opts.recoverable ?? true;
    this.details = opts.details;
  }

  toJSON(): { code: ErrorCode; message: string; recoverable: boolean } {
    return { code: this.code, message: this.message, recoverable: this.recoverable };
  }
}

export function toUkwError(err: unknown): UkwError {
  if (err instanceof UkwError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new UkwError('INTERNAL_ERROR', message, { cause: err });
}
