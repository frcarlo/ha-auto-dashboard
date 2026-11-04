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
}

export interface AreaRegistryEntry {
  area_id: string
  name: string
  icon?: string | null
  floor_id?: string | null
  labels?: string[]
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
  user?: { name: string }
  callService(domain: string, service: string, data?: Record<string, unknown>, target?: Record<string, unknown>): Promise<unknown>
  formatEntityState?(stateObj: HassEntity, state?: string): string
  formatEntityAttributeValue?(stateObj: HassEntity, attribute: string, value?: unknown): string
}

export type ThemeMode = 'auto' | 'dark' | 'light'

/** Options shared by every card the strategy emits. */
export interface CardLook {
  theme?: ThemeMode
  glass?: boolean
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
  hide_areas?: string[]
  area_order?: string[]
  hide_domains?: string[]
}
