import { themeCss } from './theme';

/**
 * Shared component stylesheet. Exported as a string so the PWA can inject it into <head> and the
 * extension can inject it into a shadow root (page CSS can never leak in or out).
 * Every colour comes from a `--ukw-*` token; nothing here hard-codes a theme.
 */
export const baseCss = `
.ukw-root{
  --ukw-font-ui:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --ukw-font-display:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,ui-serif,serif;
  --ukw-font-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --ukw-radius:10px;--ukw-radius-sm:7px;--ukw-radius-lg:16px;
  --ukw-ease:cubic-bezier(.2,.7,.2,1);
  font-family:var(--ukw-font-ui);font-size:calc(15px * var(--ukw-font-scale,1));line-height:1.5;
  color:var(--ukw-text);background:var(--ukw-bg);-webkit-font-smoothing:antialiased;text-size-adjust:100%;
}
.ukw-root *,.ukw-root *::before,.ukw-root *::after{box-sizing:border-box}
.ukw-root h1,.ukw-root h2,.ukw-root h3{font-family:var(--ukw-font-display);font-weight:600;letter-spacing:-.01em;margin:0;line-height:1.2}
.ukw-root p{margin:0}
.ukw-root button,.ukw-root input,.ukw-root textarea,.ukw-root select{font:inherit;color:inherit}
.ukw-root :focus{outline:none}
.ukw-root :focus-visible{outline:2px solid var(--ukw-focus);outline-offset:2px;border-radius:4px}
.ukw-root ::selection{background:var(--ukw-accent-soft)}

/* buttons */
.ukw-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--ukw-border);background:var(--ukw-surface);color:var(--ukw-text);
  border-radius:var(--ukw-radius);padding:0 14px;min-height:38px;cursor:pointer;font-weight:550;transition:background .15s var(--ukw-ease),border-color .15s var(--ukw-ease),transform .08s var(--ukw-ease)}
.ukw-btn--sm{min-height:30px;padding:0 10px;font-size:.9em;border-radius:var(--ukw-radius-sm)}
.ukw-btn:hover:not(:disabled){background:var(--ukw-surface-2);border-color:var(--ukw-border-strong)}
.ukw-btn:active:not(:disabled){transform:translateY(1px)}
.ukw-btn:disabled{opacity:.5;cursor:not-allowed}
.ukw-btn--primary{background:var(--ukw-accent);border-color:var(--ukw-accent);color:var(--ukw-accent-text)}
.ukw-btn--primary:hover:not(:disabled){background:var(--ukw-accent);filter:brightness(1.08);border-color:var(--ukw-accent)}
.ukw-btn--ghost{background:transparent;border-color:transparent}
.ukw-btn--danger{color:var(--ukw-danger);border-color:var(--ukw-danger);background:transparent}
.ukw-btn--danger:hover:not(:disabled){background:var(--ukw-danger-soft);border-color:var(--ukw-danger)}
.ukw-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid transparent;background:transparent;color:var(--ukw-text-muted);border-radius:var(--ukw-radius-sm);cursor:pointer;transition:background .15s var(--ukw-ease),color .15s}
.ukw-iconbtn--sm{width:28px;height:28px}
.ukw-iconbtn:hover:not(:disabled){background:var(--ukw-surface-2);color:var(--ukw-text)}
.ukw-iconbtn.is-active{background:var(--ukw-accent-soft);color:var(--ukw-accent);border-color:var(--ukw-accent-soft)}
.ukw-iconbtn:disabled{opacity:.4;cursor:not-allowed}
@media (pointer:coarse){.ukw-btn,.ukw-iconbtn{min-height:44px}.ukw-iconbtn{min-width:44px}.ukw-btn--sm{min-height:40px}}

/* chips */
.ukw-chip{display:inline-flex;align-items:center;border:1px solid var(--ukw-border);border-radius:999px;background:var(--ukw-surface);font-size:.86em;max-width:100%}
.ukw-chip.is-selected{background:var(--ukw-accent-soft);border-color:var(--ukw-accent)}
.ukw-chip__main{display:inline-flex;align-items:center;gap:6px;border:0;background:none;padding:3px 10px;cursor:default;border-radius:999px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
button.ukw-chip__main{cursor:pointer}
.ukw-chip__dot{width:10px;height:10px;border-radius:50%;flex:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}
.ukw-chip__x{border:0;background:none;padding:4px 8px 4px 0;cursor:pointer;color:var(--ukw-text-muted);display:inline-flex}

/* feedback */
.ukw-spinner{display:inline-block;border:2px solid var(--ukw-border-strong);border-top-color:var(--ukw-accent);border-radius:50%;animation:ukw-spin .8s linear infinite}
@keyframes ukw-spin{to{transform:rotate(360deg)}}
.ukw-skeleton{display:grid;gap:10px;padding:8px 0}
.ukw-skeleton span{display:block;height:12px;border-radius:6px;background:linear-gradient(90deg,var(--ukw-surface-2),var(--ukw-surface-3),var(--ukw-surface-2));background-size:200% 100%;animation:ukw-shimmer 1.4s linear infinite}
@keyframes ukw-shimmer{to{background-position:-200% 0}}
.ukw-empty{display:grid;justify-items:center;text-align:center;gap:8px;padding:40px 20px;color:var(--ukw-text-muted)}
.ukw-empty h2{color:var(--ukw-text);font-size:1.15em}
.ukw-empty p{max-width:42ch}
.ukw-empty__icon{width:56px;height:56px;border-radius:18px;display:grid;place-items:center;background:var(--ukw-surface-2);color:var(--ukw-accent);margin-bottom:4px}
.ukw-empty--error .ukw-empty__icon{background:var(--ukw-danger-soft);color:var(--ukw-danger)}
.ukw-empty__action{margin-top:8px}
.ukw-toasts{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:2147483000;display:grid;gap:8px;width:min(440px,calc(100vw - 24px));pointer-events:none}
.ukw-toast{pointer-events:auto;display:flex;align-items:center;gap:10px;background:var(--ukw-text);color:var(--ukw-bg);padding:10px 12px 10px 16px;border-radius:var(--ukw-radius);box-shadow:var(--ukw-shadow);animation:ukw-rise .22s var(--ukw-ease)}
.ukw-toast>span{flex:1}
.ukw-toast--error{background:var(--ukw-danger);color:var(--ukw-bg)}
.ukw-toast__action{border:0;background:none;color:inherit;font-weight:700;text-decoration:underline;cursor:pointer;padding:4px 6px}
.ukw-toast__close{border:0;background:none;color:inherit;opacity:.7;cursor:pointer;display:inline-flex;padding:4px}
@keyframes ukw-rise{from{opacity:0;transform:translateY(8px)}}

/* dialog */
.ukw-overlay{position:fixed;inset:0;background:var(--ukw-overlay);display:grid;place-items:center;padding:16px;z-index:2147482000;animation:ukw-fade .15s}
@keyframes ukw-fade{from{opacity:0}}
.ukw-dialog{background:var(--ukw-surface);color:var(--ukw-text);border:1px solid var(--ukw-border);border-radius:var(--ukw-radius-lg);box-shadow:var(--ukw-shadow);width:min(480px,100%);max-height:min(86vh,720px);display:flex;flex-direction:column;animation:ukw-rise .2s var(--ukw-ease)}
.ukw-dialog--wide{width:min(720px,100%)}
.ukw-dialog__head{display:flex;align-items:center;justify-content:space-between;padding:16px 16px 8px 20px}
.ukw-dialog__head h2{font-size:1.2em}
.ukw-dialog__body{padding:8px 20px 16px;overflow:auto;display:grid;gap:14px}
.ukw-dialog__foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px 16px;border-top:1px solid var(--ukw-border)}

/* form */
.ukw-field{display:grid;gap:6px}
.ukw-field>label,.ukw-switchrow label{font-weight:600;font-size:.92em}
.ukw-field__hint{color:var(--ukw-text-muted);font-size:.86em}
.ukw-field__error{color:var(--ukw-danger);font-size:.86em}
.ukw-input{width:100%;background:var(--ukw-surface);border:1px solid var(--ukw-border-strong);border-radius:var(--ukw-radius-sm);padding:9px 12px;min-height:40px}
.ukw-input::placeholder{color:var(--ukw-text-muted)}
.ukw-input:focus-visible{outline:2px solid var(--ukw-focus);outline-offset:1px}
.ukw-textarea{min-height:96px;resize:vertical;line-height:1.5}
.ukw-segmented{display:inline-flex;background:var(--ukw-surface-2);border:1px solid var(--ukw-border);border-radius:var(--ukw-radius);padding:3px;gap:2px;flex-wrap:wrap}
.ukw-segmented__opt{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;padding:6px 12px;border-radius:calc(var(--ukw-radius) - 3px);cursor:pointer;color:var(--ukw-text-muted);font-weight:550}
.ukw-segmented__opt.is-selected{background:var(--ukw-surface);color:var(--ukw-text);box-shadow:0 0 0 1px var(--ukw-border-strong)}
.ukw-switchrow{display:flex;justify-content:space-between;align-items:center;gap:16px}
.ukw-switch{flex:none;width:46px;height:28px;border-radius:999px;border:1px solid var(--ukw-border-strong);background:var(--ukw-surface-3);padding:2px;cursor:pointer;transition:background .15s}
.ukw-switch span{display:block;width:22px;height:22px;border-radius:50%;background:var(--ukw-text-muted);transition:transform .18s var(--ukw-ease),background .15s}
.ukw-switch.is-on{background:var(--ukw-accent);border-color:var(--ukw-accent)}
.ukw-switch.is-on span{transform:translateX(18px);background:var(--ukw-accent-text)}
.ukw-kbd{font-family:var(--ukw-font-mono);font-size:.78em;background:var(--ukw-surface-2);border:1px solid var(--ukw-border-strong);border-bottom-width:2px;border-radius:5px;padding:1px 6px;color:var(--ukw-text)}

/* command palette */
.palette{width:min(620px,100%);background:var(--ukw-surface);border:1px solid var(--ukw-border-strong);border-radius:var(--ukw-radius-lg);box-shadow:var(--ukw-shadow);overflow:hidden;animation:ukw-rise .18s var(--ukw-ease)}
.palette__input{width:100%;border:0;border-bottom:1px solid var(--ukw-border);background:transparent;padding:16px 18px;font-size:1.05rem;outline:none}
.palette__list{max-height:min(52vh,420px);overflow:auto;padding:6px;margin:0;list-style:none}
.palette__group{padding:8px 12px 2px;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--ukw-text-muted)}
.palette__item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:var(--ukw-radius-sm);cursor:pointer}
.palette__item[aria-selected="true"]{background:var(--ukw-accent-soft)}
.palette__hint{margin-left:auto;color:var(--ukw-text-muted);font-size:.8rem;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.palette__foot{display:flex;gap:14px;padding:8px 14px;border-top:1px solid var(--ukw-border);color:var(--ukw-text-muted);font-size:.8rem}
.overlay--top{align-items:start;padding-top:12vh}


/* motion preferences */
@media (prefers-reduced-motion:reduce){.ukw-root *,.ukw-root *::before,.ukw-root *::after{animation-duration:.001ms!important;transition-duration:.001ms!important}}
[data-ukw-reduced-motion] *,[data-ukw-reduced-motion] *::before,[data-ukw-reduced-motion] *::after{animation-duration:.001ms!important;transition-duration:.001ms!important}
[data-ukw-theme="high-contrast"] .ukw-btn,[data-ukw-theme="high-contrast"] .ukw-input,[data-ukw-theme="high-contrast"] .ukw-chip{border-width:2px}
`;

/** Complete stylesheet: theme variables + base components. */
export function uiCss(): string {
  return `${themeCss()}\n${baseCss}`;
}
