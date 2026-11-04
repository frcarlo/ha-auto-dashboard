import { generateDashboard } from './strategy'
import { AdTile } from './cards/tile'
import { AdRoomCard } from './cards/room-card'
import { AdStatusBar } from './cards/status-bar'
import { AdHeader } from './cards/header'
import { AdNavBar } from './cards/nav-bar'
import { AdStrategyEditor } from './editor'
import type { HomeAssistant, StrategyConfig } from './types'

declare const __VERSION__: string

declare global {
  interface Window {
    customStrategies?: Array<{
      type: string
      strategyType: 'dashboard' | 'view'
      name: string
      description?: string
      documentationURL?: string
    }>
  }
}

const STRATEGY_TYPE = 'auto-dashboard'
const REPO_URL = 'https://github.com/frcarlo/ha-auto-dashboard'

const define = (name: string, ctor: CustomElementConstructor) => {
  if (!customElements.get(name)) customElements.define(name, ctor)
}

// The strategy is registered first and synchronously: HA waits only a few seconds for it.
define(`ll-strategy-dashboard-${STRATEGY_TYPE}`, class extends HTMLElement {
  static async generate(config: StrategyConfig, hass: HomeAssistant) {
    return generateDashboard(config, hass)
  }

  // HA opens this in edit mode; only admins can edit dashboards
  static async getConfigElement() {
    return document.createElement('ad-strategy-editor')
  }
})

define('ad-tile', AdTile)
define('ad-room-card', AdRoomCard)
define('ad-status-bar', AdStatusBar)
define('ad-header', AdHeader)
define('ad-nav-bar', AdNavBar)
define('ad-strategy-editor', AdStrategyEditor)

// Lists the dashboard under "Community dashboards" in HA's Add dashboard dialog (HA 2026.5+)
window.customStrategies ??= []
if (Array.isArray(window.customStrategies) &&
    !window.customStrategies.some(s => s?.type === STRATEGY_TYPE && s?.strategyType === 'dashboard')) {
  window.customStrategies.push({
    type: STRATEGY_TYPE,
    strategyType: 'dashboard',
    name: 'Auto Dashboard',
    description: 'Erzeugt Räume, Etagen und Übersichten automatisch aus deinen Bereichen und Geräten.',
    documentationURL: REPO_URL,
  })
}

console.info(`%c AUTO-DASHBOARD %c ${__VERSION__} `, 'background:#6366f1;color:#fff;border-radius:4px 0 0 4px', 'background:#1e293b;color:#f1f5f9;border-radius:0 4px 4px 0')
