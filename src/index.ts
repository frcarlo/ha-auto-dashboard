import { generateDashboard } from './strategy'
import { AdTile } from './cards/tile'
import { AdRoomCard } from './cards/room-card'
import { AdStatusBar } from './cards/status-bar'
import { AdActivity } from './cards/activity'
import { AdSettings } from './cards/settings'
import { AdHeader } from './cards/header'
import { AdNavBar } from './cards/nav-bar'
import { AdGroupHeading } from './cards/group-heading'
import { AdRoomHeader } from './cards/room-header'
import { AdClimateRoom } from './cards/climate-room'
import { AdScenes } from './cards/scenes'
import { AdNowPlaying } from './cards/now-playing'
import { AdHouseInfo } from './cards/house-info'
import { AdWeather } from './cards/weather'
import { AdPower } from './cards/power'
import { AdMaintenanceList } from './cards/maintenance-list'
import { AdAppliance } from './cards/appliance'
import { AdTv } from './cards/tv'
import { AdRow } from './cards/row'
import { AdCalendar } from './cards/calendar'
import { AdLists } from './cards/lists'
import { AdCameras } from './cards/cameras'
import { AdMusic } from './cards/music'
import { AdPopup } from './cards/popup'
import { AdSchool } from './cards/school'
import { AdStrategyEditor } from './editor'
import { AdRoomSettings } from './editor-rooms'
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
define('ad-group-heading', AdGroupHeading)
define('ad-room-header', AdRoomHeader)
define('ad-climate-room', AdClimateRoom)
define('ad-scenes', AdScenes)
define('ad-now-playing', AdNowPlaying)
define('ad-house-info', AdHouseInfo)
define('ad-weather', AdWeather)
define('ad-power', AdPower)
define('ad-maintenance-list', AdMaintenanceList)
define('ad-appliance', AdAppliance)
define('ad-tv', AdTv)
define('ad-row', AdRow)
define('ad-calendar', AdCalendar)
define('ad-lists', AdLists)
define('ad-cameras', AdCameras)
define('ad-activity', AdActivity)
define('ad-settings', AdSettings)
define('ad-music', AdMusic)
define('ad-popup', AdPopup)
define('ad-school', AdSchool)
define('ad-strategy-editor', AdStrategyEditor)
define('ad-room-settings', AdRoomSettings)

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
