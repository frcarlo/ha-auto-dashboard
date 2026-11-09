// Minimal Home Assistant types, only what this dashboard reads.

export interface HassEntity {
  entity_id: string
  state: string
  attributes: Record<string, any>
  last_changed?: string
}

export interface EntityRegistryEntry {
  entity_id: string
  name?: string | null
  icon?: string | null
  device_id?: string | null
  area_id?: string | null
  labels?: string[]
  hidden?: boolean
  entity_category?: string | null
  display_precision?: number
  /** Integration that provides the entity, e.g. androidtv_remote */
  platform?: string
}

export interface DeviceRegistryEntry {
  id: string
  name?: string | null
  name_by_user?: string | null
  model?: string | null
  area_id?: string | null
  labels?: string[]
}

export interface AreaRegistryEntry {
  area_id: string
  name: string
  icon?: string | null
  floor_id?: string | null
  labels?: string[]
  /** Sensors picked for the area in HA (Settings → Areas) */
  temperature_entity_id?: string | null
  humidity_entity_id?: string | null
  /** Picture uploaded for the area in HA */
  picture?: string | null
}

export interface FloorRegistryEntry {
  floor_id: string
  name: string
  level?: number | null
  icon?: string | null
}

export interface HomeAssistant {
  states: Record<string, HassEntity>
  entities: Record<string, EntityRegistryEntry>
  devices: Record<string, DeviceRegistryEntry>
  areas: Record<string, AreaRegistryEntry>
  floors?: Record<string, FloorRegistryEntry>
  themes: { darkMode: boolean }
  language: string
  locale?: { language: string }
  user?: { id: string; name: string; is_admin?: boolean }
  callService(domain: string, service: string, data?: Record<string, unknown>, target?: Record<string, unknown>): Promise<unknown>
  callWS?<T>(msg: Record<string, unknown>): Promise<T>
  /** HA's REST API, e.g. calendar events */
  callApi?<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T>
  /** Subscriptions, e.g. weather forecasts, which HA no longer keeps in the state */
  connection?: { subscribeMessage<T>(callback: (msg: T) => void, msg: Record<string, unknown>): Promise<() => void> }
  formatEntityState?(stateObj: HassEntity, state?: string): string
  formatEntityAttributeValue?(stateObj: HassEntity, attribute: string, value?: unknown): string
}

export type ThemeMode = 'auto' | 'dark' | 'light'

/** Groups on a room page, by what the entities do */
export type GroupKey =
  | 'light' | 'climate' | 'shading' | 'awning' | 'opening' | 'gate' | 'lock' | 'media' | 'outlet' | 'switch'
  | 'select' | 'motion' | 'safety' | 'sensor' | 'scene'

/** Where own cards go on a room page: top, bottom, or at the end of a group */
export type CardSlot = 'top' | 'bottom' | GroupKey

/** Per-room settings under `rooms: <area_id>:` */
export interface RoomSettings {
  hide_groups?: GroupKey[]
  group_order?: GroupKey[]
  /** Entity ids in the order they should appear within their group */
  order?: string[]
  /** Plain Lovelace card configs */
  cards?: Partial<Record<CardSlot, Record<string, unknown>[]>>
}

/** What the viewing user may operate. Only shapes the UI; HA itself does not enforce it. */
export type Access = 'full' | 'no_critical' | 'read_only'

/** Look options of the dashboard, passed on to every card. */
export interface Look {
  theme?: ThemeMode
  glass?: boolean
  /** Accent as hex (#0ea5e9); background, surfaces and text are derived from it */
  primary_color?: string
}

/** Options shared by every card the strategy emits: the look and what the viewing user may operate. */
export interface CardLook extends Look {
  access?: Access
}

export type PagePath = 'lights' | 'climate' | 'covers' | 'security' | 'cameras' | 'music' | 'calendar' | 'lists' | 'energy' | 'maintenance'

/** Per-user rule under `users:`, keyed by user name, first name, user id or `default`. */
export type FaceStyle = 'clock' | 'analog' | 'photo' | 'calendar'

/** A calm full-screen view after a while without a touch, for a tablet on the wall */
export interface FaceConfig {
  /** Seconds without a touch, default 120; 0 shows the face right away */
  after?: number
  style?: FaceStyle
}

export interface UserRule {
  /** The face for this user only; false switches the dashboard's face off */
  face?: FaceConfig | false
  areas?: string[]
  floors?: string[]
  hide_pages?: PagePath[]
  /** full (default), no_critical: no locks, alarm panels or bulk actions like "all off", read_only: nothing can be switched */
  access?: Access
  /** false: the user can't change their own look, face, pages and favorites on the settings page */
  settings?: boolean
}

export type NavPosition = 'bottom' | 'top' | 'left' | 'right'

/** Measurements a sensor at the house can give the weather card instead of the forecast service */
export type WeatherSensorKey = 'temperature' | 'humidity' | 'pressure' | 'wind_speed' | 'wind_bearing' | 'rain' | 'illuminance'

export type ApplianceKind = 'dishwasher' | 'washer' | 'dryer' | 'oven' | 'appliance'

/**
 * An appliance set up by hand under `appliances:`, for one that brings no operation state of its own
 * (a dryer on a smart plug). `status` is a state sensor, a binary sensor or a power sensor.
 */
export interface ApplianceConfig {
  status: string
  name?: string
  kind?: ApplianceKind
  area?: string
  progress?: string
  end?: string
  remaining?: string
  program?: string
  phase?: string
  door?: string
  power?: string
  notices?: string[]
}

export interface StrategyConfig extends Look {
  type: string
  title?: string
  /** Only these areas (e.g. a dashboard for one room) */
  areas?: string[]
  /** Only areas on these floors */
  floors?: string[]
  nav_position?: NavPosition
  /** Pages left out for everyone, admins included; per user under users */
  hide_pages?: PagePath[]
  users?: Record<string, UserRule>
  hide_areas?: string[]
  area_order?: string[]
  hide_domains?: string[]
  /** Label ids: entities, devices and areas with one of them are left out */
  hide_labels?: string[]
  /** Single entities left out everywhere (set per room in the editor) */
  hide_entities?: string[]
  rooms?: Record<string, RoomSettings>
  /** Entities shown on Home and, for those in a room, at the top of the room page */
  favorites?: string[]
  /** Scenes and scripts in the row on Home; unset = every visible scene */
  scenes?: string[]
  /** To-do lists on Home; unset = every visible list, hide_domains: [todo] hides them all */
  todo_lists?: string[]
  /** With primary_color: false keeps HA's header, sidebar and dialogs in HA's theme */
  ha_colors?: boolean
  /** Picture behind the cards: a URL like /local/garten.jpg or a media-source:// id from an upload; replaces the glass light */
  background_image?: string
  /** Areas outside the house (garden, terrace): their average is "outside", and they don't count indoors */
  outdoor_areas?: string[]
  /** Weather on Home; unset = the first weather entity, hide_domains: [weather] hides it */
  weather_entity?: string
  /** Warning entities shown with the weather: NINA binary sensors, a DWD warnings sensor, or any on/off */
  weather_warnings?: string[]
  /** Own sensors for the weather card, e.g. temperature: sensor.aussen_temperatur */
  weather_sensors?: Partial<Record<WeatherSensorKey, string>>
  /** Days of forecast under the weather, 3 by default */
  forecast_days?: number
  /** Appliances besides those found from their devices; one with a found appliance's status replaces it */
  appliances?: ApplianceConfig[]
  /** Apps on the TV cards' buttons, by key: netflix, prime, youtube, magenta, disney, spotify, plex, kodi */
  tv_apps?: string[]
  /** Calendars on the calendar page; unset = every visible calendar, hide_domains: [calendar] drops the page */
  calendars?: string[]
  /** false: the calendar page only shows events, no adding, changing or deleting */
  calendar_edit?: boolean
  /** The face after a while without a touch; per user under users */
  face?: FaceConfig
}
