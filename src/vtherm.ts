// Versatile Thermostat (HACS integration versatile_thermostat): a climate entity that regulates other thermostats,
// valves or switches. Its own attributes carry the presets, the regulation and the window state; only the
// "follow underlying temp change" switch is an entity of its own on the same device.
import type { HassEntity, HomeAssistant } from './types'

export interface VthermPreset {
  mode: string
  temp?: number
}

export interface Vtherm {
  device?: string
  presets: VthermPreset[]
  preset?: string
  /** What an over_climate VTherm sends to the thermostat beneath it to reach the target sooner */
  regulated?: number
  /** °/h, rising or falling */
  slope?: number
  /** Only when a window sensor or the automatic window detection is set up */
  window?: 'open' | 'closed'
  safety: boolean
  /** switch.*_follow_underlying_temp_change: a target set on the thermostat beneath is taken over */
  follow?: string
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export function isVtherm(hass: HomeAssistant, climate: HassEntity) {
  if (hass.entities[climate.entity_id]?.platform === 'versatile_thermostat') return true
  const a = climate.attributes
  return a.preset_temperatures !== undefined && a.ema_temp !== undefined
}

export function vthermOf(hass: HomeAssistant, climate: HassEntity): Vtherm | undefined {
  if (!isVtherm(hass, climate)) return undefined
  const a = climate.attributes
  const device = hass.entities[climate.entity_id]?.device_id ?? undefined
  const temps = (a.preset_temperatures ?? {}) as Record<string, unknown>
  const presets = ((a.preset_modes ?? []) as string[])
    .filter(mode => mode !== 'none')
    .map(mode => ({ mode, temp: num(temps[`${mode}_temp`]) }))
  const windowState = a.window_manager?.window_state ?? a.window_state
  const windowAuto = a.window_manager?.window_auto_state ?? a.window_auto_state
  const hasWindow = !!(a.is_window_configured || a.is_window_auto_configured)
  const follow = device
    ? Object.values(hass.entities).find(e => e.device_id === device && e.entity_id.startsWith('switch.') &&
        (e.translation_key === 'follow_underlying_temp_change' || e.entity_id.endsWith('follow_underlying_temp_change')))?.entity_id
    : undefined
  return {
    device,
    presets,
    preset: a.preset_mode && a.preset_mode !== 'none' ? String(a.preset_mode) : undefined,
    regulated: a.is_over_climate ? num(a.regulated_target_temperature) : undefined,
    slope: num(a.specific_states?.temperature_slope) ?? num(a.temperature_slope),
    window: hasWindow ? (windowState === 'on' || windowAuto === 'on' ? 'open' : 'closed') : undefined,
    safety: (a.safety_manager?.safety_state ?? a.safety_state) === 'on',
    follow,
  }
}
