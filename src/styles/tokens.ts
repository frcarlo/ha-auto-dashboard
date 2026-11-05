// HArmony palette (nuxt/plugins/vuetify.ts) and card surface (assets/css/main.css).
import { css } from 'lit'

export const tokens = css`
  :host {
    --ad-bg: #f8fafc;
    --ad-surface: #ffffff;
    --ad-surface-variant: #f1f5f9;
    --ad-on-surface: 15, 23, 42;
    --ad-primary: 79, 70, 229;
    --ad-on-primary: 255, 255, 255;
    --ad-warning: 217, 119, 6;
    --ad-info: 37, 99, 235;
    --ad-success: 22, 163, 74;
    --ad-error: 220, 38, 38;
    --ad-radius: 24px;
    --ad-shadow: 0 10px 28px rgba(148, 163, 184, 0.08);
    --ad-glass-bg: rgba(255, 255, 255, 0.56);
    --ad-glass-blur: blur(30px) saturate(140%);
    --ad-glass-hi: rgba(255, 255, 255, 0.72);
    --ad-glass-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
    color: rgb(var(--ad-on-surface));
    font-family: var(--ha-font-family-body, Roboto, system-ui, sans-serif);
    font-size: 14px;
    -webkit-tap-highlight-color: transparent;
  }
  :host([dark]) {
    --ad-bg: #0f172a;
    --ad-surface: #1e293b;
    --ad-surface-variant: #334155;
    --ad-on-surface: 241, 245, 249;
    --ad-primary: 99, 102, 241;
    --ad-warning: 245, 158, 11;
    --ad-info: 59, 130, 246;
    --ad-success: 34, 197, 94;
    --ad-error: 239, 68, 68;
    --ad-shadow: none;
    --ad-glass-bg: rgba(30, 41, 59, 0.46);
    --ad-glass-hi: rgba(255, 255, 255, 0.08);
    /* On dark, depth comes from the surface and the hairline, not from a shadow */
    --ad-glass-shadow: 0 0 0 transparent;
  }

  .card {
    position: relative;
    box-sizing: border-box;
    height: 100%;
    overflow: hidden;
    isolation: isolate;
    border-radius: var(--ad-radius);
    background: var(--ad-surface);
    box-shadow: var(--ad-shadow);
    transition: background 0.4s ease;
  }
  /* Frosted glass like iOS: the blurred page shines through, a hairline edge, a faint light along the top */
  :host([glass]) .card {
    background: var(--ad-glass-bg);
    backdrop-filter: var(--ad-glass-blur);
    -webkit-backdrop-filter: var(--ad-glass-blur);
    box-shadow: var(--ad-glass-shadow), inset 0 0 0 1px rgba(var(--ad-on-surface), 0.08), inset 0 1px 0 var(--ad-glass-hi);
  }
  /* Asked for less transparency: solid surfaces again */
  @media (prefers-reduced-transparency: reduce) {
    :host([glass]) { --ad-glass-bg: var(--ad-surface); --ad-glass-blur: none; }
  }

  ha-icon { --mdc-icon-size: 20px; display: inline-flex; }

  /* Round status button: tonal when idle, flat in its color when active */
  .dot {
    all: unset;
    box-sizing: border-box;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    border-radius: 50%;
    display: inline-grid;
    place-items: center;
    cursor: pointer;
    background: rgba(var(--ad-on-surface), 0.08);
    color: rgba(var(--ad-on-surface), 0.55);
    transition: background 0.3s ease, color 0.3s ease;
  }
  .dot ha-icon { --mdc-icon-size: 16px; }
  .dot:focus-visible, .btn:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
  .dot.primary { background: rgb(var(--ad-primary)); color: rgb(var(--ad-on-primary)); }
  .dot.warning { background: rgb(var(--ad-warning)); color: #fff; }
  .dot.info { background: rgb(var(--ad-info)); color: #fff; }
  .dot.error { background: rgb(var(--ad-error)); color: #fff; }
  .dot.success { background: rgb(var(--ad-success)); color: #fff; }

  .btn {
    all: unset;
    box-sizing: border-box;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: inline-grid;
    place-items: center;
    cursor: pointer;
    background: rgba(var(--ad-on-surface), 0.08);
    color: rgba(var(--ad-on-surface), 0.8);
  }
  .btn ha-icon { --mdc-icon-size: 18px; }
  .btn:active { background: rgba(var(--ad-on-surface), 0.16); }
  .btn[disabled] { opacity: 0.35; pointer-events: none; }

  .name {
    font-size: 11px;
    opacity: 0.6;
    letter-spacing: 0.025em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .big {
    font-size: 26px;
    font-weight: 300;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .unit { font-size: 13px; opacity: 0.45; margin-left: 1px; letter-spacing: 0; }
  .tag {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.3;
  }
  .tag.on { color: rgb(var(--ad-warning)); opacity: 0.9; }
`
