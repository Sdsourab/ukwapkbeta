/** Styles for the in-page UI (rendered inside a shadow root, so page CSS can never affect it). */
export const contentCss = `
:host{all:initial}
.ukw-host{background:transparent!important;color:var(--ukw-text);position:fixed;inset:0;pointer-events:none;font-family:var(--ukw-font-ui)}
.ukw-host>*{pointer-events:auto}
.ukw-tb{position:fixed;display:flex;align-items:center;gap:2px;padding:5px 6px;background:var(--ukw-surface);color:var(--ukw-text);border:1px solid var(--ukw-border-strong);border-radius:14px;box-shadow:var(--ukw-shadow);z-index:3;animation:ukw-pop .14s var(--ukw-ease);max-width:calc(100vw - 16px)}
@keyframes ukw-pop{from{opacity:0;transform:translateY(4px) scale(.98)}}
.ukw-tb .swatch{width:22px;height:22px;margin:0 2px;cursor:pointer;border:2px solid transparent;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.28);padding:0;transition:transform .1s}
.ukw-tb .swatch:hover{transform:scale(1.18)}
.ukw-tb .sep{width:1px;align-self:stretch;background:var(--ukw-border);margin:3px 4px}
.ukw-pop{position:fixed;width:min(340px,calc(100vw - 16px));background:var(--ukw-surface);color:var(--ukw-text);border:1px solid var(--ukw-border-strong);border-radius:16px;box-shadow:var(--ukw-shadow);padding:12px;display:grid;gap:10px;z-index:4;animation:ukw-pop .14s var(--ukw-ease)}
.ukw-pop__quote{font-family:var(--ukw-font-display);font-size:.95rem;line-height:1.45;border-left:4px solid var(--hl,#F6D86B);padding-left:10px;max-height:5.8em;overflow:auto;overflow-wrap:anywhere}
.ukw-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ukw-row .grow{flex:1}
.ukw-sw{width:22px;height:22px;border-radius:50%;border:2px solid transparent;box-shadow:inset 0 0 0 1px rgba(0,0,0,.28);cursor:pointer;padding:0}
.ukw-sw.is-selected{border-color:var(--ukw-text)}
.ukw-launcher{position:fixed;top:40%;width:34px;min-height:64px;border:1px solid var(--ukw-border-strong);background:var(--ukw-surface);color:var(--ukw-text);display:grid;place-items:center;gap:2px;padding:6px 0;cursor:pointer;box-shadow:var(--ukw-shadow);z-index:2;font-weight:700;font-size:.8rem}
.ukw-launcher.right{right:0;border-right:0;border-radius:12px 0 0 12px}
.ukw-launcher.left{left:0;border-left:0;border-radius:0 12px 12px 0}
.ukw-launcher:hover{background:var(--ukw-surface-2)}
.ukw-side{position:fixed;top:0;bottom:0;display:flex;flex-direction:column;background:var(--ukw-surface);color:var(--ukw-text);border:0 solid var(--ukw-border-strong);box-shadow:var(--ukw-shadow);z-index:5;max-width:100vw}
.ukw-side.right{right:0;border-left-width:1px}
.ukw-side.left{left:0;border-right-width:1px}
.ukw-side__grip{position:absolute;top:0;bottom:0;width:10px;cursor:col-resize;z-index:2;touch-action:none}
.right>.ukw-side__grip{left:-5px}.left>.ukw-side__grip{right:-5px}
.ukw-side__grip:hover,.ukw-side__grip:focus-visible{background:var(--ukw-accent-soft)}
.ukw-side__head{display:flex;align-items:center;gap:4px;padding:8px 8px 0 14px}
.ukw-side__head h2{font-size:1rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ukw-side .tabs{padding:0 6px}
.ukw-side__body{flex:1;overflow:auto;padding:12px 12px 20px;display:grid;gap:10px;align-content:start}
.ukw-side__foot{display:flex;gap:6px;align-items:center;padding:8px 10px;border-top:1px solid var(--ukw-border)}
.ukw-card{border:1px solid var(--ukw-border);border-left:5px solid var(--hl,var(--ukw-border-strong));border-radius:12px;padding:10px 12px;display:grid;gap:8px;background:var(--ukw-surface)}
.ukw-card.is-active{outline:2px solid var(--ukw-focus)}
.ukw-card.is-lost{border-left-style:dashed}
.ukw-card__quote{font-family:var(--ukw-font-display);font-size:.95rem;line-height:1.45;cursor:pointer;overflow-wrap:anywhere}
.ukw-card__meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center;color:var(--ukw-text-muted);font-size:.78rem}
.ukw-svgbox{border:1px solid var(--ukw-border);border-radius:12px;background:#fff;overflow:auto;max-height:260px}
.ukw-svgbox svg{display:block;max-width:100%;height:auto}
.ukw-root .badge{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;background:var(--ukw-surface-2);font-size:.74rem;font-weight:600;color:var(--ukw-text-muted)}
.ukw-root .badge--warn{background:var(--ukw-danger-soft);color:var(--ukw-danger)}
.ukw-root .badge--accent{background:var(--ukw-accent-soft);color:var(--ukw-accent)}
.ukw-root .tabs{display:flex;gap:2px;border-bottom:1px solid var(--ukw-border);overflow-x:auto}
.ukw-root .tab{border:0;background:none;padding:9px 11px;cursor:pointer;color:var(--ukw-text-muted);font-weight:600;border-bottom:2px solid transparent;white-space:nowrap}
.ukw-root .tab.is-active{color:var(--ukw-text);border-bottom-color:var(--ukw-accent)}
.ukw-root .muted{color:var(--ukw-text-muted)}
.ukw-root .kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px}
.ukw-root .kv div{background:var(--ukw-surface-2);border-radius:10px;padding:8px 10px}
.ukw-root .kv b{display:block;font-size:1.15rem;font-family:var(--ukw-font-display)}
.ukw-banner{position:fixed;left:50%;transform:translateX(-50%);top:12px;z-index:6;background:var(--ukw-accent);color:var(--ukw-accent-text);padding:8px 12px;border-radius:12px;box-shadow:var(--ukw-shadow);display:flex;gap:10px;align-items:center;max-width:calc(100vw - 24px)}
@media (max-width:600px){.ukw-side{width:100vw!important}}
`;
