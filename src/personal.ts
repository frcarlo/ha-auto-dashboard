// A user's own settings for one dashboard: the look, the face, pages they don't need, their favorites.
// HA keeps them per user on the server (frontend user data), which every user may write, admin or not,
// so a wall tablet's user sets them on the tablet and they survive a cleared cache or a new device.
import type { FaceConfig, HomeAssistant, NavPosition, PagePath, StrategyConfig, ThemeMode, UserRule } from './types'

export interface PersonalSettings {
  theme?: ThemeMode
  glass?: boolean
  primary_color?: string
  nav_position?: NavPosition
  /** The face for this user; false switches it off */
  face?: FaceConfig | false
  /** Pages this user doesn't need, on top of what the dashboard hides */
  hide_pages?: PagePath[]
  /** This user's favorites, in place of the dashboard's */
  favorites?: string[]
}

/** One entry per dashboard, so two Auto Dashboards keep their own settings */
export const personalKey = (dashboard: string) => `auto_dashboard:${dashboard}`

export async function loadPersonal(hass: HomeAssistant, dashboard: string): Promise<PersonalSettings | undefined> {
  try {
    const result = await hass.callWS?.<{ value?: PersonalSettings | null }>({ type: 'frontend/get_user_data', key: personalKey(dashboard) })
    const value = result?.value
    return value && typeof value === 'object' ? value : undefined
  } catch {
    // An older HA or no connection: the dashboard as the admin set it
    return undefined
  }
}

export async function savePersonal(hass: HomeAssistant, dashboard: string, settings: PersonalSettings | null) {
  await hass.callWS?.({ type: 'frontend/set_user_data', key: personalKey(dashboard), value: settings })
}

/** Whether the admin lets this user change their own settings */
export const personalAllowed = (rule?: UserRule) => rule?.settings !== false

/**
 * The dashboard config with the user's own settings on top. They only change how it looks and what the user
 * chose to see: rooms, access and the pages the admin hid stay as the admin set them.
 */
export function withPersonal(config: StrategyConfig, personal?: PersonalSettings): StrategyConfig {
  if (!personal) return config
  const pick = <K extends keyof PersonalSettings>(key: K) => (personal[key] !== undefined ? { [key]: personal[key] } : {})
  return {
    ...config,
    ...pick('theme'), ...pick('glass'), ...pick('primary_color'), ...pick('nav_position'), ...pick('favorites'),
  }
}

/** The face: the admin's rule "off" wins, then the user's own choice, then the rule's and the dashboard's. */
export function faceFor(config: StrategyConfig, rule?: UserRule, personal?: PersonalSettings): FaceConfig | undefined {
  if (rule?.face === false) return undefined
  if (personal?.face === false) return undefined
  if (!personal?.face && !rule?.face && !config.face) return undefined
  return { ...config.face, ...(rule?.face || {}), ...(personal?.face || {}) }
}

/**
 * What to store: only what differs from the dashboard, so a later change by the admin still reaches
 * everything the user left alone. Nothing left means no entry at all.
 */
export function personalDiff(draft: PersonalSettings, base: PersonalSettings): PersonalSettings | null {
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(draft)) {
    if (key === 'hide_pages') {
      if ((value as string[] | undefined)?.length) out[key] = value
    } else if (!same(value, base[key as keyof PersonalSettings])) out[key] = value
  }
  return Object.keys(out).length ? (out as PersonalSettings) : null
}
