// A room's power over time on the energy page: HA's own history graph, with a switch for the last day, week or
// month in its header. All rooms follow the switch together, so they stay comparable.
import { css, html, nothing } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t } from '../i18n'
import { onRange, rangeStyles, rangeSwitch, savedRange, setRange, type Range } from '../range'
import { tokens } from '../styles/tokens'

interface HistoryConfig extends BaseConfig {
  entities: string[]
  grid_options?: { columns?: number | 'full'; rows?: number | 'auto' }
}

export const RANGE_HOURS: Record<Range, number> = { day: 24, week: 7 * 24, month: 30 * 24 }

type CardElement = HTMLElement & { hass?: unknown; setConfig(config: object): void }
type CardHelpers = { createCardElement(config: object): CardElement }
let helpers: Promise<CardHelpers> | undefined
const loadHelpers = () => {
  const load = (window as unknown as { loadCardHelpers?: () => Promise<CardHelpers> }).loadCardHelpers
  return load ? (helpers ??= load()) : undefined
}

export class AdHistory extends BaseCard<HistoryConfig> {
  static properties = { ...BaseCard.properties, range: { state: true } }
  range: Range = savedRange('power')
  private graph?: CardElement
  private stopRange?: () => void

  static styles = [tokens, rangeStyles, css`
    :host { display: block; height: 100%; position: relative; }
    .graph { height: 100%; }
    .graph > * { height: 100%; }
    /* In the graph's header, next to its title */
    .range { position: absolute; top: 12px; right: 12px; z-index: 1; }
  `]

  getGridOptions() {
    return { columns: 'full', rows: 6, ...this.config?.grid_options }
  }

  getCardSize() {
    return 6
  }

  protected watched() {
    return this.config!.entities
  }

  connectedCallback() {
    super.connectedCallback()
    this.stopRange = onRange('power', range => (this.range = range))
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.stopRange?.()
  }

  private get graphConfig() {
    return { type: 'history-graph', title: t(this.hass, 'power_history'), entities: this.config!.entities, hours_to_show: RANGE_HOURS[this.range] }
  }

  protected updated(changed: Map<string, unknown>) {
    // A new range gets a new graph: HA's card loads its history once, for the hours it was made with
    if (this.graph && (changed.has('range') || changed.has('config'))) this.graph = undefined
    if (this.graph) {
      this.graph.hass = this.hass
      return
    }
    const range = this.range
    void loadHelpers()?.then(h => {
      if (this.graph || range !== this.range) return
      const graph = h.createCardElement(this.graphConfig)
      // As in a section: the plot fills the height the grid gives the card
      ;(graph as CardElement & { layout?: string }).layout = 'grid'
      graph.hass = this.hass
      this.graph = graph
      this.requestUpdate()
    })
  }

  protected render() {
    return html`<div class="graph">${this.graph ?? nothing}</div>
      ${rangeSwitch(this.hass, this.range, range => setRange('power', range))}`
  }
}
