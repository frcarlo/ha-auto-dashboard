// Cards side by side once there is room (weather next to inside and power, now playing next to the scenes),
// one above the other on a phone. HA's grid only knows fixed card widths, so the row decides by its own width.
// A child that hides itself (nothing playing) leaves its share to the others.
import { css, html } from 'lit'
import { BaseCard, type BaseConfig } from './base'

interface RowConfig extends BaseConfig {
  /** Configs of this dashboard's own cards (custom:ad-…), in order */
  cards: Record<string, unknown>[]
  /** Share of the width per card, 1 each by default */
  widths?: number[]
  /** Vertical alignment when side by side: stretch to the tallest, or center */
  align?: 'stretch' | 'center'
}

type Child = HTMLElement & { hass?: unknown; setConfig?(config: unknown): void }

/** Below this width the cards stack */
const SIDE_BY_SIDE = 720

export class AdRow extends BaseCard<RowConfig> {
  private children_: Child[] = []
  private built?: RowConfig

  static styles = css`
    :host { display: block; container-type: inline-size; }
    .row { display: flex; flex-direction: column; gap: 8px; }
    .row > * { min-width: 0; }
    @container (min-width: ${SIDE_BY_SIDE}px) {
      .row { flex-direction: row; align-items: var(--align, stretch); }
      /* Cards that can stack their parts (inside and power) do so beside a larger card */
      .row > * { flex: var(--share, 1) 1 0; --ad-beside: column; --ad-beside-height: 100%; --ad-beside-wrap: wrap; --ad-beside-basis: calc(50% - 4px); }
    }
  `

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 2
  }

  // Every update of HA reaches the children, which decide for themselves whether it concerns them
  protected shouldUpdate() {
    return !!this.config && !!this.hass
  }

  private build() {
    const c = this.config!
    this.children_ = c.cards.map((card, i) => {
      const tag = String(card.type ?? '').replace(/^custom:/, '')
      const el = document.createElement(tag) as Child
      el.setConfig?.(card)
      el.style.setProperty('--share', String(c.widths?.[i] ?? 1))
      return el
    })
    this.built = c
  }

  protected willUpdate() {
    super.willUpdate()
    if (this.built !== this.config) this.build()
    for (const child of this.children_) child.hass = this.hass
  }

  protected render() {
    return html`<div class="row" style="--align:${this.config!.align ?? 'stretch'}">${this.children_}</div>`
  }
}
