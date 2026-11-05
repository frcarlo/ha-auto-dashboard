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
}

export interface DeviceRegistryEntry {
  id: string
  name?: string | null
  name_by_user?: string | null
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
  formatEntityState?(stateObj: HassEntity, state?: string): string
  formatEntityAttributeValue?(stateObj: HassEntity, attribute: string, value?: unknown): string
}

export type ThemeMode = 'auto' | 'dark' | 'light'

/** Groups on a room page, by what the entities do */
export type GroupKey =
  | 'light' | 'climate' | 'shading' | 'awning' | 'opening' | 'gate' | 'lock' | 'media' | 'switch'
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

/** Options shared by every card the strategy emits. */
export interface CardLook {
  theme?: ThemeMode
  glass?: boolean
  /** Accent as hex (#0ea5e9); background, surfaces and text are derived from it */
  primary_color?: string
  access?: Access
}

export type PagePath = 'lights' | 'climate' | 'covers' | 'security' | 'cameras' | 'energy' | 'maintenance'

/** Per-user rule under `users:`, keyed by user name, first name, user id or `default`. */
export interface UserRule {
  areas?: string[]
  floors?: string[]
  hide_pages?: PagePath[]
  /** Nothing can be switched; only plain information opens */
  read_only?: boolean
  /** false: no locks, alarm panels or bulk actions like "all off" */
  control_critical?: boolean
}

export type NavPosition = 'bottom' | 'top' | 'left' | 'right'

export interface StrategyConfig extends CardLook {
  type: string
  title?: string
  /** Only these areas (e.g. a dashboard for one room) */
  areas?: string[]
  /** Only areas on these floors */
  floors?: string[]
  nav_position?: NavPosition
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
}
