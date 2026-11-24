// The day / week / month switch of the energy page's charts. The choice is remembered on this device, and every
// chart of the same kind follows it: switching one room's graph to "Week" switches the other rooms too.
import { css, html } from 'lit'
import { t } from './i18n'
import type { Range } from './meters'
import type { HomeAssistant } from './types'

export type { Range }
export type RangeKind = 'meters' | 'power'

const RANGES: Range[] = ['day', 'week', 'month']
const EVENT = 'ad-range-changed'
const storageKey = (kind: RangeKind) => `ad-range-${kind}`

export function savedRange(kind: RangeKind): Range {
  try {
    const value = localStorage.getItem(storageKey(kind))
    return RANGES.includes(value as Range) ? (value as Range) : 'day'
  } catch {
    return 'day'
  }
}

export function setRange(kind: RangeKind, range: Range) {
  try { localStorage.setItem(storageKey(kind), range) } catch { /* private mode: only this visit */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { kind, range } }))
}

/** Calls back when a chart of this kind switches; returns the unsubscribe */
export function onRange(kind: RangeKind, callback: (range: Range) => void): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ kind: RangeKind; range: Range }>).detail
    if (detail.kind === kind) callback(detail.range)
  }
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}

/** The switch itself; its styles are rangeStyles */
export const rangeSwitch = (hass: HomeAssistant | undefined, current: Range, pick: (range: Range) => void) =>
  html`<div class="range" role="group">${RANGES.map(r => html`
    <button aria-pressed=${current === r} @click=${() => pick(r)}>${t(hass, `cal.${r}`)}</button>`)}</div>`

export const rangeStyles = css`
  .range { display: inline-flex; padding: 2px; border-radius: 12px; background: rgba(var(--ad-on-surface), 0.08); }
  .range button { all: unset; cursor: pointer; padding: 4px 12px; border-radius: 10px; font-size: var(--ad-fs-s); opacity: var(--ad-o2); }
  .range button[aria-pressed=true] { background: var(--ad-surface); opacity: 1; font-weight: 500; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15); }
  .range button:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
`
